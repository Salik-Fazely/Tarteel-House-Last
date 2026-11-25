import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://www.tarteelhouse.com"
LANGUAGE_PAGES = {"en": "index.html", "fa": "fa/index.html", "tr": "tr/index.html"}
EXPECTED_ALTERNATES = {
    "en": BASE_URL + "/",
    "fa": BASE_URL + "/fa/",
    "tr": BASE_URL + "/tr/",
    "x-default": BASE_URL + "/",
}
OFFICIAL_WHATSAPP = "https://wa.me/34614494311"
PERSIAN_PAGE = "fa/index.html"
PERSIAN_NAV_ANCHORS = ["#ravand", "#moalleman", "#hazineha", "#porseshha"]
TURKISH_PAGE = "tr/index.html"
TURKISH_NAV_ANCHORS = ["#nasil-isliyor", "#ogretmenler", "#ucretler", "#sorular"]
# Destinations that exist in English only; localized links to them must say so.
ENGLISH_ONLY_DESTINATIONS = {
    "/teachers/",
    "/pricing/",
    "/about/",
    "/blog/",
    "/blog/ramadan-quran-plan-for-kids/",
    "/privacy-policy/",
    "/terms/",
}

# Surah order, number and verse count (Hafs) used in the Juz Amma guide.
JUZ_AMMA_ORDER = [
    ("Al-Fatiha", 1, 7),
    ("An-Nas", 114, 6), ("Al-Falaq", 113, 5), ("Al-Ikhlas", 112, 4),
    ("Al-Masad", 111, 5), ("An-Nasr", 110, 3), ("Al-Kafirun", 109, 6),
    ("Al-Kawthar", 108, 3), ("Al-Ma’un", 107, 7), ("Quraysh", 106, 4),
    ("Al-Fil", 105, 5), ("Al-Humazah", 104, 9), ("Al-Asr", 103, 3),
    ("At-Takathur", 102, 8), ("Al-Qari’ah", 101, 11), ("Al-Adiyat", 100, 11),
    ("Az-Zalzalah", 99, 8), ("Al-Bayyinah", 98, 8), ("Al-Qadr", 97, 5),
    ("Al-Alaq", 96, 19), ("At-Tin", 95, 8), ("Ash-Sharh", 94, 8),
    ("Ad-Duha", 93, 11), ("Al-Layl", 92, 21), ("Ash-Shams", 91, 15),
    ("Al-Balad", 90, 20), ("Al-Fajr", 89, 30), ("Al-Ghashiyah", 88, 26),
    ("Al-A’la", 87, 19), ("At-Tariq", 86, 17), ("Al-Buruj", 85, 22),
    ("Al-Inshiqaq", 84, 25), ("Al-Mutaffifin", 83, 36), ("Al-Infitar", 82, 19),
    ("At-Takwir", 81, 29), ("Abasa", 80, 42), ("An-Nazi’at", 79, 46),
    ("An-Naba", 78, 40),
]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.html_attrs = {}
        self.main_attrs = {}
        self.alternates = {}
        self.hrefs = []
        self.rows = []
        self.json_ld = []
        self.text = []
        self._row = None
        self._cell = None
        self._json = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "html":
            self.html_attrs = attributes
        elif tag == "main":
            self.main_attrs = attributes
        elif tag == "link" and attributes.get("rel") == "alternate" and attributes.get("hreflang"):
            self.alternates[attributes["hreflang"]] = attributes.get("href")
        elif tag == "a" and attributes.get("href"):
            self.hrefs.append(attributes["href"])
        elif tag == "tr":
            self._row = []
        elif tag == "td" and self._row is not None:
            self._cell = []
        elif tag == "script" and attributes.get("type") == "application/ld+json":
            self._json = []

    def handle_endtag(self, tag):
        if tag == "td" and self._cell is not None:
            self._row.append("".join(self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if self._row:
                self.rows.append(self._row)
            self._row = None
        elif tag == "script" and self._json is not None:
            self.json_ld.append(json.loads("".join(self._json)))
            self._json = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)
        if self._json is not None:
            self._json.append(data)
        else:
            self.text.append(data)


class ChromeParser(HTMLParser):
    """Collects ids, links with their text, and header/footer text."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.links = []
        self.region_text = {"header": [], "footer": []}
        self._region = None
        self._link = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = set(attributes.get("class", "").split())
        if attributes.get("id"):
            self.ids.add(attributes["id"])
        if tag == "header" and "site-header" in classes:
            self._region = "header"
        elif tag == "footer" and "site-footer" in classes:
            self._region = "footer"
        if tag == "a" and attributes.get("href"):
            self._link = {"attrs": attributes, "region": self._region, "text": []}
            self.links.append(self._link)

    def handle_endtag(self, tag):
        if tag == "a":
            self._link = None
        elif tag in {"header", "footer"}:
            self._region = None

    def handle_data(self, data):
        if self._region:
            self.region_text[self._region].append(data)
        if self._link is not None:
            self._link["text"].append(data)


def parse_chrome(relative):
    parser = ChromeParser()
    parser.feed((ROOT / relative).read_text(encoding="utf-8"))
    parser.close()
    return parser


def link_text(link):
    return re.sub(r"\s+", " ", "".join(link["text"])).strip()


def parse(relative):
    parser = PageParser()
    parser.feed((ROOT / relative).read_text(encoding="utf-8"))
    parser.close()
    return parser


def visible_text(parser):
    return re.sub(r"\s+", " ", " ".join(parser.text))


class LanguagePageTests(unittest.TestCase):
    def test_language_versions_link_to_each_other(self):
        for language, relative in LANGUAGE_PAGES.items():
            with self.subTest(page=relative):
                self.assertEqual(EXPECTED_ALTERNATES, parse(relative).alternates)

    def test_language_and_direction_are_declared(self):
        self.assertEqual("fa", parse("fa/index.html").html_attrs.get("lang"))
        self.assertEqual("rtl", parse("fa/index.html").main_attrs.get("dir"))
        self.assertEqual("tr", parse("tr/index.html").html_attrs.get("lang"))
        self.assertNotIn("dir", parse("tr/index.html").main_attrs)

    def test_language_pages_show_the_approved_packages(self):
        persian = visible_text(parse("fa/index.html"))
        for price, lessons in (("۱۲۰", "۶"), ("۲۲۰", "۱۲"), ("۴۰۰", "۲۵")):
            self.assertIn(f"{price} یورو", persian)
            self.assertIn(f"{lessons} جلسه", persian)
        turkish = visible_text(parse("tr/index.html"))
        for price, lessons in (("120", "6"), ("220", "12"), ("400", "25")):
            self.assertIn(f"{price} €", turkish)
            self.assertIn(f"{lessons} ders", turkish)

    def test_language_pages_use_the_official_whatsapp_number_and_booking_form(self):
        expected_booking = {
            "fa/index.html": "/fa/book-trial/",
            "tr/index.html": "/tr/book-trial/",
        }
        for relative, booking_href in expected_booking.items():
            hrefs = parse(relative).hrefs
            whatsapp = [href for href in hrefs if "wa.me" in href]
            with self.subTest(page=relative):
                self.assertTrue(whatsapp)
                for href in whatsapp:
                    self.assertTrue(
                        href == OFFICIAL_WHATSAPP or href.startswith(OFFICIAL_WHATSAPP + "?text="),
                        href,
                    )
                self.assertTrue(any("?text=" in href for href in whatsapp))
                self.assertIn(booking_href, hrefs)

    def test_homepage_mentions_female_teachers_and_footer_links_languages(self):
        self.assertIn("Female teachers available", visible_text(parse("index.html")))
        for partial in ("partials/footer.html", "partials/footer-no-prebooking-contact.html"):
            source = (ROOT / partial).read_text(encoding="utf-8")
            self.assertIn('href="/fa/"', source)
            self.assertIn('href="/tr/"', source)


class TurkishPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = parse_chrome(TURKISH_PAGE)
        cls.header = re.sub(r"\s+", " ", " ".join(cls.page.region_text["header"]))
        cls.footer = re.sub(r"\s+", " ", " ".join(cls.page.region_text["footer"]))

    def test_header_and_footer_are_in_turkish(self):
        for phrase in ("Nasıl İşliyor", "Öğretmenler", "Ücretler", "Sorular", "Ücretsiz Deneme"):
            self.assertIn(phrase, self.header)
        for phrase in ("How It Works", "Teachers", "Pricing", "About", "Book a Free Trial"):
            self.assertNotIn(phrase, self.header)

        for phrase in ("Keşfedin", "İngilizce sayfalar", "Diller", "WhatsApp’tan yazın"):
            self.assertIn(phrase, self.footer)
        for phrase in ("LEARN", "SUPPORT", "Have a question before booking?", "Also in"):
            self.assertNotIn(phrase, self.footer)

    def test_in_page_navigation_points_to_sections_that_exist(self):
        header_anchors = [
            link["attrs"]["href"]
            for link in self.page.links
            if link["region"] == "header" and link["attrs"]["href"].startswith("#")
        ]
        self.assertEqual(TURKISH_NAV_ANCHORS, header_anchors)
        for link in self.page.links:
            href = link["attrs"]["href"]
            if href.startswith("#"):
                self.assertIn(href[1:], self.page.ids, href)

    def test_links_to_english_only_pages_are_marked_as_english(self):
        english_links = [
            link for link in self.page.links
            if link["attrs"]["href"] in ENGLISH_ONLY_DESTINATIONS
        ]
        self.assertEqual(
            ENGLISH_ONLY_DESTINATIONS,
            {link["attrs"]["href"] for link in english_links},
        )
        for link in english_links:
            self.assertEqual("en", link["attrs"].get("hreflang"), link["attrs"]["href"])

    def test_footer_offers_every_language_version(self):
        footer_hrefs = {
            link["attrs"]["href"] for link in self.page.links if link["region"] == "footer"
        }
        self.assertLessEqual({"/", "/fa/", "/tr/"}, footer_hrefs)

    def test_booking_calls_to_action_use_the_formal_register(self):
        labels = [
            link_text(link) for link in self.page.links
            if link["attrs"]["href"].startswith("/tr/book-trial/")
        ]
        self.assertGreaterEqual(len(labels), 5)
        for label in labels:
            # "al" / "başla" address the reader as "sen"; parents are addressed as "siz".
            self.assertNotRegex(label, r"(?:\bal|\bbaşla|\bdene)$", label)

    def test_turkish_ramadan_section_states_expectation_without_offers(self):
        text = visible_text(parse(TURKISH_PAGE))
        self.assertIn("Ramazan’a sakin bir hazırlık", text)
        self.assertIn("hilalin görülmesine", text)
        self.assertIn("beklenmektedir", text)
        for forbidden in ("indirim", "kampanya", "stripe", "paypal", "iban"):
            self.assertNotIn(forbidden, text.lower())


class PersianPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = parse_chrome(PERSIAN_PAGE)
        cls.header = re.sub(r"\s+", " ", " ".join(cls.page.region_text["header"]))
        cls.footer = re.sub(r"\s+", " ", " ".join(cls.page.region_text["footer"]))

    def test_header_and_footer_are_in_persian(self):
        for phrase in ("روند کار", "معلمان", "هزینه‌ها", "پرسش‌ها", "جلسه رایگان"):
            self.assertIn(phrase, self.header)
        for phrase in ("How It Works", "Teachers", "Pricing", "About", "Book a Free Trial"):
            self.assertNotIn(phrase, self.header)

        for phrase in ("بخش‌های صفحه", "صفحات انگلیسی", "زبان‌ها", "در واتس‌اپ بنویسید"):
            self.assertIn(phrase, self.footer)
        for phrase in ("LEARN", "SUPPORT", "Have a question before booking?", "Also in"):
            self.assertNotIn(phrase, self.footer)

    def test_in_page_navigation_points_to_sections_that_exist(self):
        header_anchors = [
            link["attrs"]["href"]
            for link in self.page.links
            if link["region"] == "header" and link["attrs"]["href"].startswith("#")
        ]
        self.assertEqual(PERSIAN_NAV_ANCHORS, header_anchors)
        for link in self.page.links:
            href = link["attrs"]["href"]
            if href.startswith("#"):
                self.assertIn(href[1:], self.page.ids, href)

    def test_links_to_english_only_pages_are_marked_as_english(self):
        english_links = [
            link for link in self.page.links
            if link["attrs"]["href"] in ENGLISH_ONLY_DESTINATIONS
        ]
        self.assertEqual(
            ENGLISH_ONLY_DESTINATIONS,
            {link["attrs"]["href"] for link in english_links},
        )
        for link in english_links:
            self.assertEqual("en", link["attrs"].get("hreflang"), link["attrs"]["href"])

    def test_footer_offers_every_language_version(self):
        footer_hrefs = {
            link["attrs"]["href"] for link in self.page.links if link["region"] == "footer"
        }
        self.assertLessEqual({"/", "/fa/", "/tr/"}, footer_hrefs)

    def test_persian_ramadan_section_states_expectation_without_offers(self):
        text = visible_text(parse(PERSIAN_PAGE))
        self.assertIn("آمادگی آرام برای ماه رمضان", text)
        self.assertIn("رؤیت هلال ماه", text)
        self.assertIn("پیش‌بینی می‌شود", text)
        for forbidden in ("تخفیف", "stripe", "paypal", "iban"):
            self.assertNotIn(forbidden, text.lower())

    def test_persian_and_turkish_subpages_match_language_direction_and_booking_links(self):
        fa_book = parse("fa/book-trial/index.html")
        self.assertEqual("fa", fa_book.html_attrs.get("lang"))
        self.assertEqual("rtl", fa_book.main_attrs.get("dir"))
        fa_read = parse("fa/amoozesh-rokhani-quran-koodakan/index.html")
        self.assertEqual("fa", fa_read.html_attrs.get("lang"))
        self.assertEqual("rtl", fa_read.main_attrs.get("dir"))
        self.assertIn("/fa/book-trial/", fa_read.hrefs)

        tr_book = parse("tr/book-trial/index.html")
        self.assertEqual("tr", tr_book.html_attrs.get("lang"))
        tr_elifba = parse("tr/cocuklar-icin-online-elifba/index.html")
        self.assertEqual("tr", tr_elifba.html_attrs.get("lang"))
        self.assertIn("/tr/book-trial/", tr_elifba.hrefs)


class NewParentGuideTests(unittest.TestCase):
    def test_juz_amma_tables_follow_the_documented_order_and_verse_counts(self):
        rows = parse("blog/juz-amma-memorization-order-for-kids/index.html").rows
        surah_rows = [row for row in rows if len(row) == 2 and row[1].isdigit()]
        self.assertEqual(len(JUZ_AMMA_ORDER), len(surah_rows))
        for row, (name, number, verses) in zip(surah_rows, JUZ_AMMA_ORDER):
            with self.subTest(surah=name):
                self.assertEqual([f"{name} ({number})", str(verses)], row)
        self.assertEqual(list(range(78, 115)), sorted(number for _, number, _ in JUZ_AMMA_ORDER[1:]))

    def test_ramadan_date_is_presented_as_an_expectation(self):
        text = visible_text(parse("blog/ramadan-quran-plan-for-kids/index.html"))
        sentence = re.search(r"In 2027, Ramadan[^.]*\.", text).group(0)
        self.assertIn("expected", sentence)
        self.assertIn("moon", sentence)

    def test_new_guides_make_no_review_or_authorship_claims(self):
        for relative in (
            "blog/juz-amma-memorization-order-for-kids/index.html",
            "blog/ramadan-quran-plan-for-kids/index.html",
            "blog/what-age-should-a-child-start-learning-quran/index.html",
        ):
            parser = parse(relative)
            posting = next(node for node in parser.json_ld[0]["@graph"] if node["@type"] == "BlogPosting")
            with self.subTest(page=relative):
                self.assertNotIn("author", posting)
                self.assertNotIn("reviewedBy", posting)
                self.assertNotIn("Reviewed by", visible_text(parser))

    def test_blog_index_makes_no_teacher_review_claim(self):
        # Guides are not individually teacher-reviewed yet, so the index must not say so.
        self.assertNotIn("reviewed", visible_text(parse("blog/index.html")).lower())


class IndexNowKeyTests(unittest.TestCase):
    def test_one_indexnow_key_file_is_hosted_at_the_root(self):
        keys = [path for path in ROOT.glob("*.txt") if re.fullmatch(r"[0-9a-f]{32}", path.stem)]
        self.assertEqual(1, len(keys))
        self.assertEqual(keys[0].stem, keys[0].read_text(encoding="utf-8").strip())


if __name__ == "__main__":
    unittest.main()
