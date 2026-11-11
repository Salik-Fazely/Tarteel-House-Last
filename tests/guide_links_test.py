"""Core pages link to the parent guides, so guides are not orphaned.

Before this, the only route from the home page to a guide was the footer's
Blog link. Search engines read links from the home page as the strongest
sign of which pages matter.
"""

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GUIDE_SLUGS = {path.parent.name for path in (ROOT / "blog").glob("*/index.html")}


def main_content(relative):
    html = (ROOT / relative).read_text(encoding="utf-8")
    match = re.search(r"<main\b.*?</main>", html, re.S)
    return match.group(0) if match else ""


def guide_links(html):
    return re.findall(r'href="/blog/([a-z0-9-]+)/"', html)


class GuideLinkTests(unittest.TestCase):
    def test_01_home_page_has_a_guides_section(self):
        main = main_content("index.html")
        self.assertEqual(main.count('id="home-guides-heading"'), 1)
        section = main[main.index('aria-labelledby="home-guides-heading"'):]
        section = section[: section.index("</section>")]
        linked = guide_links(section)
        self.assertEqual(len(linked), 4)
        self.assertEqual(len(set(linked)), 4)
        self.assertTrue(set(linked) <= GUIDE_SLUGS)
        self.assertIn('href="/blog/"', section)

    def test_02_home_guide_titles_use_one_heading_level(self):
        main = main_content("index.html")
        section = main[main.index('aria-labelledby="home-guides-heading"'):]
        section = section[: section.index("</section>")]
        self.assertEqual(section.count("<h2"), 1)
        self.assertEqual(section.count("<h3"), 4)

    def test_03_core_pages_link_to_a_relevant_guide(self):
        expected = {
            "how-it-works/index.html": "free-online-quran-trial-lesson-parent-checklist",
            "pricing/index.html": "one-to-one-quran-classes-vs-group-classes-for-children",
        }
        for relative, slug in expected.items():
            with self.subTest(page=relative):
                self.assertIn(slug, guide_links(main_content(relative)))


if __name__ == "__main__":
    unittest.main()
