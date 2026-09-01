import html
import json
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

from tests.quran_reading_stages_article_test import (
    StrictStructureParser,
    image_dimensions,
    nodes_of_type,
    normalise,
)


ROOT = Path(__file__).resolve().parents[1]
ARTICLE = ROOT / "blog/child-refuses-quran-practice/index.html"
BLOG_INDEX = ROOT / "blog/index.html"
STYLES = ROOT / "assets/css/styles.css"
SITEMAP = ROOT / "sitemap.xml"
CANONICAL = "https://www.tarteelhouse.com/blog/child-refuses-quran-practice/"
TITLE = "Child Refuses Quran Practice? How to Restart Without Pressure | Tarteel House"
HEADLINE = "My Child Refuses Quran Practice: How to Restart Gently"
DESCRIPTION = (
    "Learn what may be behind your child’s resistance to Quran practice and use a gentle "
    "5-step approach to restart with less conflict and more consistency."
)
IMAGE_URL = "https://www.tarteelhouse.com/assets/blog/child-refuses-quran-practice.png"
IMAGE_ALT = "A child and parent rebuild a calm Quran practice routine at home"
IMAGE_FILES = (
    ROOT / "assets/blog/child-refuses-quran-practice.png",
    ROOT / "assets/blog/child-refuses-quran-practice-640.webp",
    ROOT / "assets/blog/child-refuses-quran-practice-1200.webp",
)


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


class ChildRefusesQuranPracticeArticleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = ARTICLE.read_text(encoding="utf-8") if ARTICLE.is_file() else ""
        cls.parser = ArticleParser()
        cls.parser.feed(cls.source)
        cls.parser.close()
        cls.text = normalise(" ".join(cls.parser.text_parts))

    def test_route_and_approved_heading_structure_exist(self):
        self.assertTrue(ARTICLE.is_file(), ARTICLE)
        self.assertEqual([HEADLINE], self.parser.headings["h1"])
        self.assertEqual(
            [
                "What Should I Do If My Child Refuses Quran Practice?",
                "First: What Is Your Child Actually Refusing?",
                "Common Reasons Children Resist Quran Practice",
                "What the Behaviour May Be Telling You",
                "How to Restart Quran Practice Gently",
                "Give Choices Without Removing the Routine",
                "End While the Session Is Still Going Well",
                "Gentle Does Not Mean No Boundaries",
                "What Parents Should Avoid During a Restart",
                "What If My Child Says, “I Hate Quran”?",
                "When Should I Speak to the Teacher?",
                "What If My Child Only Refuses to Practise With Me?",
                "When Changing the Practice Format May Help",
                "How to Rebuild a Positive Quran Routine",
                "Praise Progress You Can See",
                "Frequently Asked Questions",
                "A Gentle Restart Is Still a Restart",
                "Has Quran Practice Become Difficult at Home?",
            ],
            self.parser.headings["h2"],
        )
        for heading in (
            "Look at when the resistance begins",
            "Ask a simple question",
            "The work feels too difficult",
            "1. Observe",
            "2. Understand",
            "3. Adjust One Thing",
            "4. Restart Small",
            "5. Rebuild Gradually",
            "Predictable",
            "Manageable",
            "Successful",
            "Is it normal for children to resist Quran practice?",
        ):
            self.assertIn(heading, self.parser.headings["h3"])

    def test_approved_copy_and_restart_framework_are_preserved(self):
        for approved_copy in (
            "When Quran practice begins turning into arguments, tears or repeated “I don’t want to,” it can be difficult to know how to respond.",
            "A child refusing Quran practice does not automatically mean they dislike the Quran.",
            "Keep the expectation. Reduce the conflict.",
            "Gentle does not mean giving up on Quran learning.",
            "These situations can look similar from the outside but may need very different responses.",
            "This table is not a diagnosis. It is simply a way to decide what may be worth checking.",
            "The first goal is not catching up. It is rebuilding a successful practice experience.",
            "restart small → succeed → repeat → expand",
            "Quran practice should remain part of learning rather than a penalty.",
            "A child may still be reading slowly while becoming more independent, accurate or confident.",
            "There is another path.",
            "A different teaching setting can sometimes help a family see how their child responds to another pace and approach.",
            "Book a Free Trial",
        ):
            self.assertIn(approved_copy, self.text)

    def test_reviewer_links_and_free_trial_cta_match_the_brief(self):
        paragraphs = [text for _, text in self.parser.paragraphs]
        self.assertEqual(1, paragraphs.count("Reviewed by Forouhar Rahmani, Quran Teacher"))
        self.assertEqual(1, paragraphs.count("Reviewed: September 2026"))
        self.assertNotIn("Written by", self.source)
        links_by_text = {text: attrs.get("href") for text, attrs in self.parser.anchors}
        self.assertEqual(
            "/blog/how-children-learn-to-read-quran/",
            links_by_text.get("the stages of learning to read the Quran"),
        )
        self.assertEqual(
            "/blog/how-parents-can-track-their-childs-quran-progress/",
            links_by_text.get("tracking their child’s Quran progress"),
        )
        self.assertEqual(
            "/blog/online-quran-classes-for-kids-parents-look-for/",
            links_by_text.get("what parents should look for in online Quran classes"),
        )
        self.assertEqual("/how-it-works/", links_by_text.get("how Tarteel House lessons work"))
        self.assertEqual("/book-trial/", links_by_text.get("Book a Free Trial"))
        self.assertNotIn("Quran motivation assessment", self.source)
        self.assertNotIn("Quran Level Check", self.source)

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
        self.assertEqual([DESCRIPTION, DESCRIPTION], descriptions)
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
        self.assertEqual(
            ((1200, 630), (640, 336), (1200, 630)),
            tuple(image_dimensions(image) for image in IMAGE_FILES),
        )
        self.assertIn(
            '<source type="image/webp" srcset="/assets/blog/child-refuses-quran-practice-640.webp 640w, /assets/blog/child-refuses-quran-practice-1200.webp 1200w"',
            self.source,
        )
        self.assertIn(
            f'<img src="/assets/blog/child-refuses-quran-practice.png" alt="{IMAGE_ALT}" width="1200" height="630" loading="eager" decoding="async" fetchpriority="high" />',
            self.source,
        )

    def test_blog_index_card_and_truthful_intro_are_present(self):
        source = BLOG_INDEX.read_text(encoding="utf-8")
        self.assertIn("Teacher-reviewed guidance for parents", source)
        self.assertNotIn("Teacher-written notes", source)
        grid_start = source.index('<div class="blog-grid">')
        first_card_start = source.index('<article class="blog-card">', grid_start)
        second_card_start = source.index('<article class="blog-card">', first_card_start + 1)
        first_card = source[first_card_start:second_card_start]
        self.assertIn('href="/blog/child-refuses-quran-practice/"', first_card)
        self.assertIn(HEADLINE, html.unescape(first_card))
        self.assertIn(
            "When Quran practice becomes a daily struggle, learn how to understand what your child may be resisting and rebuild a calmer, manageable routine.",
            first_card,
        )
        self.assertIn("Home Practice", first_card)
        self.assertIn("/assets/blog/child-refuses-quran-practice-640.webp 640w", first_card)
        self.assertIn('loading="eager"', first_card)
        self.assertIn('fetchpriority="high"', first_card)

    def test_sitemap_structure_and_required_targets_are_valid(self):
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
            "/blog/how-children-learn-to-read-quran/",
            "/blog/how-parents-can-track-their-childs-quran-progress/",
            "/blog/online-quran-classes-for-kids-parents-look-for/",
            "/how-it-works/",
            "/book-trial/",
        ):
            self.assertTrue((ROOT / target.strip("/") / "index.html").is_file(), target)


if __name__ == "__main__":
    unittest.main()
