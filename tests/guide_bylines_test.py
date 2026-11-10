"""Every parent guide names its publisher and shows honest dates.

The visible line and the structured data must say the same thing, so a
guide can never show one date to parents and another to search engines.
Guides name Tarteel House as publisher only. They make no authorship or
review claim until a real, named person stands behind them.
"""

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GUIDES = sorted(
    path for path in (ROOT / "blog").glob("*/index.html") if path.is_file()
)
ORGANIZATION_ID = "https://www.tarteelhouse.com/#organization"
META_PATTERN = re.compile(
    r'<p class="blog-post-hero__meta">(?P<body>.*?)</p>', re.S
)
TIME_PATTERN = re.compile(
    r'(?P<label>Updated )?<time datetime="(?P<iso>\d{4}-\d{2}-\d{2})">'
    r"(?P<text>[^<]+)</time>"
)
MONTHS = (
    "January February March April May June July August September October "
    "November December"
).split()


def blog_posting(html):
    for block in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', html, re.S
    ):
        data = json.loads(block)
        for node in data.get("@graph", [data]):
            if node.get("@type") == "BlogPosting":
                return node
    return None


def human_date(iso):
    year, month, day = (int(part) for part in iso.split("-"))
    return f"{day} {MONTHS[month - 1]} {year}"


class GuideBylineTests(unittest.TestCase):
    def test_01_there_are_guides_to_check(self):
        self.assertGreaterEqual(len(GUIDES), 10)

    def test_02_structured_data_has_publisher_and_dates_but_no_author(self):
        for path in GUIDES:
            with self.subTest(guide=path.parent.name):
                posting = blog_posting(path.read_text(encoding="utf-8"))
                self.assertIsNotNone(posting)
                self.assertEqual(posting["publisher"].get("@id"), ORGANIZATION_ID)
                self.assertNotIn("author", posting)
                self.assertNotIn("reviewedBy", posting)
                self.assertRegex(posting.get("datePublished", ""), r"^\d{4}-\d{2}-\d{2}$")
                self.assertRegex(posting.get("dateModified", ""), r"^\d{4}-\d{2}-\d{2}$")
                self.assertLessEqual(
                    posting["datePublished"], posting["dateModified"]
                )

    def test_03_visible_line_matches_structured_data(self):
        for path in GUIDES:
            with self.subTest(guide=path.parent.name):
                html = path.read_text(encoding="utf-8")
                posting = blog_posting(html)
                matches = META_PATTERN.findall(html)
                self.assertEqual(len(matches), 1)
                body = matches[0]
                self.assertIn('Published by <a href="/about/">Tarteel House</a>', body)
                self.assertNotIn("Written by", body)
                self.assertNotIn("Reviewed by", body)
                shown = {
                    ("Updated" if m.group("label") else "Published"): (
                        m.group("iso"),
                        m.group("text"),
                    )
                    for m in TIME_PATTERN.finditer(body)
                }
                self.assertIn("Published", shown)
                self.assertEqual(shown["Published"][0], posting["datePublished"])
                for iso, text in shown.values():
                    self.assertEqual(text, human_date(iso))
                if posting["dateModified"] != posting["datePublished"]:
                    self.assertEqual(
                        shown.get("Updated", (None,))[0], posting["dateModified"]
                    )
                else:
                    self.assertNotIn("Updated", shown)

    def test_04_byline_has_a_style_rule(self):
        css = (ROOT / "assets/css/styles.css").read_text(encoding="utf-8")
        self.assertIn(".blog-post-hero__meta {", css)


if __name__ == "__main__":
    unittest.main()
