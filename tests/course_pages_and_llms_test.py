"""Commercial course pages and llms.txt remain grounded in approved facts."""

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COURSE_SLUGS = (
    "noorani-qaida-classes-for-kids",
    "tajweed-classes-for-kids",
    "quran-memorization-for-kids",
    "ramadan-quran-classes-for-kids",
)


def read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


class CoursePagesAndLlmsTests(unittest.TestCase):
    def test_01_course_pages_are_linked_from_home_footer_and_sitemap(self):
        home = read("index.html")
        footer = read("partials/footer.html")
        sitemap = read("sitemap.xml")
        self.assertIn('id="home-courses-heading"', home)
        for slug in COURSE_SLUGS:
            with self.subTest(course=slug):
                self.assertIn(f'href="/{slug}/"', home)
                self.assertIn(f'href="/{slug}/"', footer)
                self.assertIn(f"<loc>https://www.tarteelhouse.com/{slug}/</loc>", sitemap)

    def test_02_course_pages_match_commercial_facts_and_avoid_banned_claims(self):
        for slug in COURSE_SLUGS:
            html = read(f"{slug}/index.html")
            lower = html.lower()
            with self.subTest(course=slug):
                self.assertEqual(1, html.count("<h1"))
                self.assertIn('href="/book-trial/"', html)
                self.assertIn("40-minute", lower)
                self.assertIn("valid for one year", lower)
                self.assertIn("normally contacted within two days", lower)
                self.assertIn("if a parent is unavailable or does not want a meeting", lower)
                self.assertNotIn("tarteel ai", lower)
                self.assertNotIn("guarantee", lower)

    def test_03_ramadan_page_has_printable_four_week_tracker(self):
        html = read("ramadan-quran-classes-for-kids/index.html")
        self.assertIn('id="ramadan-tracker"', html)
        self.assertIn('id="print-ramadan-tracker"', html)
        self.assertIn("@media print", html)
        self.assertEqual(30, html.count("&#x2610;"))

    def test_04_llms_txt_matches_commercial_facts_and_lists_course_urls(self):
        llms = read("llms.txt")
        lower = llms.lower()
        for required in (
            "children aged 5 to 16",
            "40 minutes",
            "€120",
            "€220",
            "€400",
            "zoom or google meet",
            "normally contacted via whatsapp within two days",
            "not an automated app",
            "https://www.tarteelhouse.com/fa/",
            "https://www.tarteelhouse.com/tr/",
        ):
            self.assertIn(required, lower, required)
        for slug in COURSE_SLUGS:
            self.assertIn(f"https://www.tarteelhouse.com/{slug}/", llms)
        self.assertNotIn("tarteel ai", lower)
        self.assertIsNone(re.search(r"\b(?:best|#1|number one|guaranteed)\b", lower))


if __name__ == "__main__":
    unittest.main()
