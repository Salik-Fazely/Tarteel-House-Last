import html
import json
import struct
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTICLE = ROOT / "blog/how-children-learn-to-read-quran/index.html"
BLOG_INDEX = ROOT / "blog/index.html"
STYLES = ROOT / "assets/css/styles.css"
SITEMAP = ROOT / "sitemap.xml"
CANONICAL = "https://www.tarteelhouse.com/blog/how-children-learn-to-read-quran/"
TITLE = "How Children Learn to Read the Quran: 8 Stages for Parents | Tarteel House"
HEADLINE = "From Arabic Letters to Reading the Quran: A Parent’s Guide to the Learning Stages"
DESCRIPTION = (
    "See the 8 stages children typically move through from recognising Arabic letters to "
    "reading the Quran, plus signs of progress and ways parents can help."
)
IMAGE_URL = "https://www.tarteelhouse.com/assets/blog/how-children-learn-to-read-quran.png"
IMAGE_ALT = (
    "A child practises Arabic reading beside an open Quran in a calm home learning space"
)
IMAGE_FILES = (
    ROOT / "assets/blog/how-children-learn-to-read-quran.png",
    ROOT / "assets/blog/how-children-learn-to-read-quran-640.webp",
    ROOT / "assets/blog/how-children-learn-to-read-quran-1200.webp",
)
VOID_ELEMENTS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


def normalise(value):
    return " ".join(value.split())


def classes(attributes):
    return attributes.get("class", "").split()


def nodes_of_type(value, schema_type):
    matches = []
    if isinstance(value, dict):
        if value.get("@type") == schema_type:
            matches.append(value)
        for child in value.values():
            matches.extend(nodes_of_type(child, schema_type))
    elif isinstance(value, list):
        for child in value:
            matches.extend(nodes_of_type(child, schema_type))
    return matches


def image_dimensions(path):
    data = path.read_bytes()
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return struct.unpack(">II", data[16:24])
    if not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
        raise AssertionError(f"Unsupported image format: {path}")

    offset = 12
    while offset + 8 <= len(data):
        chunk_type = data[offset : offset + 4]
        chunk_size = struct.unpack("<I", data[offset + 4 : offset + 8])[0]
        payload = offset + 8
        if chunk_type == b"VP8X":
            width = 1 + int.from_bytes(data[payload + 4 : payload + 7], "little")
            height = 1 + int.from_bytes(data[payload + 7 : payload + 10], "little")
            return width, height
        if chunk_type == b"VP8 ":
            width = struct.unpack("<H", data[payload + 6 : payload + 8])[0] & 0x3FFF
            height = struct.unpack("<H", data[payload + 8 : payload + 10])[0] & 0x3FFF
            return width, height
        if chunk_type == b"VP8L":
            bits = int.from_bytes(data[payload + 1 : payload + 5], "little")
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
            return width, height
        offset = payload + chunk_size + (chunk_size % 2)
    raise AssertionError(f"No WebP dimensions found: {path}")


class ArticleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.start_tags = []
        self.headings = {"h1": [], "h2": [], "h3": []}
        self.paragraphs = []
        self.anchors = []
        self.ordered_lists = []
        self.unordered_lists = []
        self.json_ld = []
        self.text_parts = []
        self._heading_tag = None
        self._heading_parts = None
        self._paragraph_attrs = None
        self._paragraph_parts = None
        self._anchor_attrs = None
        self._anchor_parts = None
        self._list_tag = None
        self._list_items = None
        self._list_item_parts = None
        self._json_parts = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        self.start_tags.append((tag, attributes))
        if tag in self.headings:
            self._heading_tag = tag
            self._heading_parts = []
        elif tag == "p":
            self._paragraph_attrs = attributes
            self._paragraph_parts = []
        elif tag == "a":
            self._anchor_attrs = attributes
            self._anchor_parts = []
        elif tag in {"ol", "ul"}:
            self._list_tag = tag
            self._list_items = []
        elif tag == "li" and self._list_items is not None:
            self._list_item_parts = []
        if tag == "script" and attributes.get("type") == "application/ld+json":
            self._json_parts = []

    def handle_endtag(self, tag):
        if tag == self._heading_tag and self._heading_parts is not None:
            self.headings[tag].append(normalise("".join(self._heading_parts)))
            self._heading_tag = None
            self._heading_parts = None
        elif tag == "p" and self._paragraph_parts is not None:
            self.paragraphs.append(
                (self._paragraph_attrs, normalise("".join(self._paragraph_parts)))
            )
            self._paragraph_attrs = None
            self._paragraph_parts = None
        elif tag == "a" and self._anchor_parts is not None:
            self.anchors.append(
                (normalise("".join(self._anchor_parts)), self._anchor_attrs)
            )
            self._anchor_attrs = None
            self._anchor_parts = None
        elif tag == "li" and self._list_item_parts is not None:
            self._list_items.append(normalise("".join(self._list_item_parts)))
            self._list_item_parts = None
        elif tag in {"ol", "ul"} and tag == self._list_tag:
            target = self.ordered_lists if tag == "ol" else self.unordered_lists
            target.append(self._list_items)
            self._list_tag = None
            self._list_items = None
        if tag == "script" and self._json_parts is not None:
            self.json_ld.append(json.loads("".join(self._json_parts)))
            self._json_parts = None

    def handle_data(self, data):
        if self._json_parts is not None:
            self._json_parts.append(data)
            return
        self.text_parts.append(data)
        if self._heading_parts is not None:
            self._heading_parts.append(data)
        if self._paragraph_parts is not None:
            self._paragraph_parts.append(data)
        if self._anchor_parts is not None:
            self._anchor_parts.append(data)
        if self._list_item_parts is not None:
            self._list_item_parts.append(data)


class StrictStructureParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.doctypes = []

    def handle_decl(self, decl):
        self.doctypes.append(decl.lower())

    def handle_starttag(self, tag, attrs):
        if tag not in VOID_ELEMENTS:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        if tag not in VOID_ELEMENTS:
            raise AssertionError(f"Non-void element uses self-closing syntax: <{tag} />")

    def handle_endtag(self, tag):
        if not self.stack:
            raise AssertionError(f"Unexpected closing tag: </{tag}>")
        expected = self.stack.pop()
        if tag != expected:
            raise AssertionError(
                f"Mismatched closing tag: expected </{expected}>, found </{tag}>"
            )


class QuranReadingStagesArticleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = ARTICLE.read_text(encoding="utf-8") if ARTICLE.is_file() else ""
        cls.parser = ArticleParser()
        cls.parser.feed(cls.source)
        cls.parser.close()
        cls.text = normalise(" ".join(cls.parser.text_parts))

    def test_clean_url_and_approved_heading_structure_exist(self):
        self.assertTrue(ARTICLE.is_file(), ARTICLE)
        self.assertEqual([HEADLINE], self.parser.headings["h1"])
        expected_h2s = (
            "The 8 Stages of Learning to Read the Quran",
            "Stage 1: Recognising Arabic Letters and Their Sounds",
            "Stage 2: Recognising Arabic Letters in Connected Forms",
            "Stage 3: Reading with Fatha, Kasra and Damma",
            "Stage 4: Blending Sounds to Read Simple Words",
            "Stage 5: Learning Sukoon, Shaddah and Madd",
            "Stage 6: Reading Quranic Words and Short Phrases",
            "Stage 7: Beginning to Read Directly from the Mushaf",
            "Stage 8: Building Fluency, Pronunciation and Tajweed",
            "How Do I Know If My Child Is Ready for the Next Stage?",
            "What If My Child Seems Stuck?",
            "How Parents Can Help at Home",
            "Does My Child Need Noorani Qaida?",
            "How Long Does It Take a Child to Learn to Read the Quran?",
            "Should Tajweed Be Taught from the Beginning?",
            "Frequently Asked Questions",
            "From First Letters to Confident Quran Reading",
            "Not Sure Where Your Child Should Begin?",
        )
        self.assertEqual(list(expected_h2s), self.parser.headings["h2"])
        for heading in (
            "Signs of progress",
            "Accuracy before speed",
            "“My child knows the letters but cannot read words.”",
            "Keep practice short, focused and regular",
            "At what age can a child start learning to read the Quran?",
            "Can children learn to read the Quran online?",
        ):
            self.assertIn(heading, self.parser.headings["h3"])

    def test_approved_eight_stage_summary_and_key_editorial_copy_are_preserved(self):
        self.assertTrue(self.parser.ordered_lists, "Approved eight-stage list is missing")
        self.assertEqual(8, len(self.parser.ordered_lists[0]))
        self.assertEqual(
            "Recognising Arabic letters and their basic sounds",
            self.parser.ordered_lists[0][0],
        )
        self.assertEqual(
            "Building greater accuracy, fluency, pronunciation and Tajweed",
            self.parser.ordered_lists[0][-1],
        )
        for approved_copy in (
            "Learning to read the Quran is a gradual process.",
            "Both can be normal parts of the learning process.",
            "These stages are not strict boxes. A child may still be strengthening one skill while beginning the next.",
            "Accuracy matters more than speed here. It is better to read slowly and correctly than to rush and guess.",
            "Memorisation and reading are both valuable, but they are different skills.",
            "Progress is better judged over several weeks than from one difficult lesson.",
            "Parents do not need to become Quran teachers to support their child.",
            "There is no single timeline that applies to every child.",
            "The important thing is not how quickly the child reaches the final stage.",
            "At Tarteel House, lessons are adapted to the child’s current level rather than assuming every beginner should start in exactly the same place.",
        ):
            self.assertIn(approved_copy, self.text)

    def test_arabic_examples_are_exact_and_language_marked(self):
        for arabic in (
            "ا — ب — ت — ث — ج — ح — خ",
            "ب — ت — ث",
            "ج — ح — خ",
            "ب — بـ — ـبـ — ـب",
            "بَ = ba",
            "بِ = bi",
            "بُ = bu",
            "تَ — تِ — تُ",
            "مَ — مِ — مُ",
            "نَ — نِ — نُ",
            "بَ ... سَ ... مَ",
            "Sukoon — ْ",
            "Shaddah — ّ",
            "بِسْمِ",
            "رَبِّ",
            "الْحَمْدُ",
            "بَ، بِ، بُ",
        ):
            self.assertIn(arabic, self.text)
        marked = [
            attrs
            for tag, attrs in self.parser.start_tags
            if tag == "span" and "quran-arabic" in classes(attrs)
        ]
        self.assertGreaterEqual(len(marked), 17)
        self.assertTrue(all(attrs.get("lang") == "ar" for attrs in marked))
        self.assertTrue(all(attrs.get("dir") == "rtl" for attrs in marked))
        styles = STYLES.read_text(encoding="utf-8")
        self.assertIn(".quran-arabic", styles)
        self.assertIn("font-family: var(--font-arabic)", styles)

    def test_reviewer_contextual_links_and_free_trial_cta_match_the_brief(self):
        paragraphs = [text for _, text in self.parser.paragraphs]
        self.assertEqual(1, paragraphs.count("Reviewed by Forouhar Rahmani, Quran Teacher"))
        self.assertEqual(1, paragraphs.count("Reviewed: September 2026"))
        self.assertNotIn("Written by", self.source)
        links_by_text = {text: attrs.get("href") for text, attrs in self.parser.anchors}
        self.assertEqual(
            "/blog/how-parents-can-track-their-childs-quran-progress/",
            links_by_text.get("tracking their child’s Quran progress"),
        )
        self.assertEqual(
            "/blog/help-children-memorize-short-surahs/",
            links_by_text.get("helping children memorise short Surahs"),
        )
        self.assertEqual(
            "/blog/online-quran-classes-for-kids-parents-look-for/",
            links_by_text.get("what parents should look for in online Quran classes"),
        )
        self.assertEqual(
            "/how-it-works/", links_by_text.get("how Tarteel House lessons work")
        )
        self.assertEqual(
            "/book-trial/", links_by_text.get("Book a Free 40-Minute Trial")
        )
        self.assertNotIn("Free Quran Level Check", self.source)
        self.assertIn(
            "Start with a free 40-minute trial lesson so the teacher can see what your child already knows, where they may need support, and what the next steps could look like.",
            paragraphs,
        )

    def test_metadata_social_metadata_and_schema_match(self):
        self.assertIn(f"<title>{TITLE}</title>", self.source)
        canonicals = [
            attrs.get("href")
            for tag, attrs in self.parser.start_tags
            if tag == "link" and attrs.get("rel") == "canonical"
        ]
        self.assertEqual([CANONICAL], canonicals)
        descriptions = [
            attrs.get("content")
            for tag, attrs in self.parser.start_tags
            if tag == "meta" and attrs.get("name") in {"description", "twitter:description"}
        ]
        og_descriptions = [
            attrs.get("content")
            for tag, attrs in self.parser.start_tags
            if tag == "meta" and attrs.get("property") == "og:description"
        ]
        self.assertEqual([DESCRIPTION, DESCRIPTION], descriptions)
        self.assertEqual([DESCRIPTION], og_descriptions)
        properties = {
            attrs.get("property"): attrs.get("content")
            for tag, attrs in self.parser.start_tags
            if tag == "meta" and attrs.get("property")
        }
        names = {
            attrs.get("name"): attrs.get("content")
            for tag, attrs in self.parser.start_tags
            if tag == "meta" and attrs.get("name")
        }
        self.assertEqual("article", properties.get("og:type"))
        self.assertEqual(TITLE, properties.get("og:title"))
        self.assertEqual(CANONICAL, properties.get("og:url"))
        self.assertEqual(IMAGE_URL, properties.get("og:image"))
        self.assertEqual("1200", properties.get("og:image:width"))
        self.assertEqual("630", properties.get("og:image:height"))
        self.assertEqual(IMAGE_ALT, properties.get("og:image:alt"))
        self.assertEqual("summary_large_image", names.get("twitter:card"))
        self.assertEqual(TITLE, names.get("twitter:title"))
        self.assertEqual(IMAGE_URL, names.get("twitter:image"))

        postings = nodes_of_type(self.parser.json_ld, "BlogPosting")
        breadcrumbs = nodes_of_type(self.parser.json_ld, "BreadcrumbList")
        self.assertEqual(1, len(postings))
        self.assertEqual(1, len(breadcrumbs))
        posting = postings[0]
        self.assertEqual(HEADLINE, posting["headline"])
        self.assertEqual(DESCRIPTION, posting["description"])
        self.assertNotIn("datePublished", posting)
        self.assertEqual("2026-09-01", posting["dateModified"])
        self.assertNotIn("author", posting)
        self.assertNotIn("reviewedBy", posting)
        self.assertEqual(CANONICAL, posting["mainEntityOfPage"]["@id"])
        self.assertEqual(
            {"@type": "ImageObject", "url": IMAGE_URL, "width": 1200, "height": 630},
            posting["image"],
        )
        self.assertEqual("Tarteel House", posting["publisher"]["name"])
        items = breadcrumbs[0]["itemListElement"]
        self.assertEqual(["Home", "Blog", HEADLINE], [item["name"] for item in items])
        self.assertEqual(CANONICAL, items[-1]["item"])

    def test_responsive_cover_files_and_markup_preserve_dimensions(self):
        for image in IMAGE_FILES:
            self.assertTrue(image.is_file(), image)
            self.assertGreater(image.stat().st_size, 0)
        dimensions = tuple(image_dimensions(image) for image in IMAGE_FILES)
        self.assertEqual(((1200, 630), (640, 336), (1200, 630)), dimensions)
        self.assertIn(
            '<source type="image/webp" srcset="/assets/blog/how-children-learn-to-read-quran-640.webp 640w, /assets/blog/how-children-learn-to-read-quran-1200.webp 1200w" sizes="(max-width: 720px) calc(90vw - 2px), 638px" />',
            self.source,
        )
        self.assertIn(
            f'<img src="/assets/blog/how-children-learn-to-read-quran.png" alt="{IMAGE_ALT}" width="1200" height="630" loading="eager" decoding="async" fetchpriority="high" />',
            self.source,
        )

    def test_blog_index_places_card_first_and_uses_truthful_intro(self):
        source = BLOG_INDEX.read_text(encoding="utf-8")
        self.assertIn("Teacher-reviewed guidance for parents", source)
        self.assertNotIn("Teacher-written notes", source)
        grid_start = source.index('<div class="blog-grid">')
        first_card_start = source.index('<article class="blog-card">', grid_start)
        second_card_start = source.index('<article class="blog-card">', first_card_start + 1)
        third_card_start = source.index('<article class="blog-card">', second_card_start + 1)
        second_card = source[second_card_start:third_card_start]
        self.assertIn('href="/blog/how-children-learn-to-read-quran/"', second_card)
        self.assertIn(HEADLINE, html.unescape(second_card))
        self.assertIn(
            "Understand the stages children move through from recognising Arabic letters to reading Quranic words, phrases and eventually the Mushaf with greater independence.",
            second_card,
        )
        self.assertIn(
            "/assets/blog/how-children-learn-to-read-quran-640.webp 640w", second_card
        )
        self.assertIn(
            "/assets/blog/how-children-learn-to-read-quran-1200.webp 1200w", second_card
        )
        self.assertIn(f'alt="{IMAGE_ALT}"', second_card)
        self.assertIn('loading="lazy"', second_card)
        self.assertNotIn('fetchpriority="high"', second_card)

        previous_first_card = source[third_card_start:source.index('<article class="blog-card">', third_card_start + 1)]
        self.assertIn('/blog/free-online-quran-trial-lesson-parent-checklist/', previous_first_card)
        self.assertIn('loading="lazy"', previous_first_card)
        self.assertNotIn('fetchpriority="high"', previous_first_card)

    def test_sitemap_html_structure_and_required_targets_are_valid(self):
        tree = ET.parse(SITEMAP)
        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locations = [node.text for node in tree.findall("sm:url/sm:loc", namespace)]
        self.assertEqual(1, locations.count(CANONICAL))

        structure = StrictStructureParser()
        structure.feed(self.source)
        structure.close()
        self.assertEqual(["doctype html"], structure.doctypes)
        self.assertEqual([], structure.stack)
        ids = [attrs["id"] for _, attrs in self.parser.start_tags if attrs.get("id")]
        self.assertEqual(len(ids), len(set(ids)))
        for _, attrs in self.parser.start_tags:
            for referenced_id in attrs.get("aria-labelledby", "").split():
                self.assertIn(referenced_id, ids)

        for target in (
            "/blog/how-parents-can-track-their-childs-quran-progress/",
            "/blog/help-children-memorize-short-surahs/",
            "/blog/online-quran-classes-for-kids-parents-look-for/",
            "/how-it-works/",
            "/book-trial/",
        ):
            self.assertTrue((ROOT / target.strip("/") / "index.html").is_file(), target)


if __name__ == "__main__":
    unittest.main()
