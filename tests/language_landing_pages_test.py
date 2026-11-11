"""English pages for families looking for lessons in Persian or Turkish.

These pages repeat facts stated elsewhere on the site. The tests keep them
in step with the Teachers page and the approved commercial facts, so a
change in one place cannot leave a stale claim in another.
"""

import re
import unittest
from html import unescape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    "quran-classes-in-farsi-and-dari": {
        "language": "Persian",
        "native_href": "/fa/",
    },
    "quran-classes-in-turkish": {
        "language": "Turkish",
        "native_href": "/tr/",
    },
}


def read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


def text(html):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", html)))


def main_content(html):
    return re.search(r"<main\b.*?</main>", html, re.S).group(0)


def teachers_by_language():
    """Names and languages exactly as the Teachers page lists them."""
    html = read("teachers/index.html")
    cards = re.findall(
        r'<p class="teacher-card__name">\s*(.*?)\s*</p>\s*'
        r'<p class="teacher-card__languages">\s*(.*?)\s*</p>',
        html,
        re.S,
    )
    return {
        unescape(name).strip(): [part.strip().title() for part in unescape(langs).split("·")]
        for name, langs in cards
    }


class LanguageLandingPageTests(unittest.TestCase):
    def test_01_teachers_page_can_be_read(self):
        self.assertGreaterEqual(len(teachers_by_language()), 4)

    def test_02_each_page_lists_exactly_the_teachers_who_teach_that_language(self):
        roster = teachers_by_language()
        for slug, page in PAGES.items():
            with self.subTest(page=slug):
                main = main_content(read(f"{slug}/index.html"))
                expected = sorted(
                    name for name, langs in roster.items() if page["language"] in langs
                )
                listed = sorted(
                    unescape(name)
                    for name in re.findall(r'<h3 class="value-card__title">([^<]+)</h3>', main)
                    if unescape(name) in roster
                )
                self.assertEqual(expected, listed)

    def test_03_prices_and_lesson_length_match_commercial_facts(self):
        facts = read("docs/commercial-facts.md")
        for needle in ("6 lessons: €120", "12 lessons: €220", "25 lessons: €400"):
            self.assertIn(needle, facts)
        for slug in PAGES:
            with self.subTest(page=slug):
                body = text(main_content(read(f"{slug}/index.html")))
                self.assertIn("6 lessons for €120, 12 lessons for €220 or 25 lessons for €400", body)
                self.assertIn("40-minute", body)
                self.assertIn("valid for one year", body)
                self.assertIn("normally contacted within two days", body)
                self.assertNotIn("guarantee", body.lower())

    def test_04_each_page_links_to_booking_and_its_own_language_version(self):
        for slug, page in PAGES.items():
            with self.subTest(page=slug):
                main = main_content(read(f"{slug}/index.html"))
                self.assertGreaterEqual(main.count('href="/book-trial/"'), 2)
                self.assertIn(f'href="{page["native_href"]}"', main)
                self.assertEqual(main.count("<h1"), 1)

    def test_05_pages_are_in_the_sitemap_and_linked_from_shared_footer(self):
        sitemap = read("sitemap.xml")
        footer = read("partials/footer.html")
        for slug in PAGES:
            with self.subTest(page=slug):
                self.assertIn(f"<loc>https://www.tarteelhouse.com/{slug}/</loc>", sitemap)
                self.assertIn(f'href="/{slug}/"', footer)
                html = read(f"{slug}/index.html")
                self.assertIn(
                    f'<link rel="canonical" href="https://www.tarteelhouse.com/{slug}/" />', html
                )


if __name__ == "__main__":
    unittest.main()
