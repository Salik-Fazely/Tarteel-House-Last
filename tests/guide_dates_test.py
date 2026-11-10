"""Every parent guide shows its publication dates, matching its article data."""

import datetime
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GUIDES = sorted((ROOT / "blog").glob("*/index.html"))
HERO = re.compile(r'<header class="blog-post-hero">(.*?)</header>', re.S)
DATES_LINE = re.compile(r'<p class="blog-post-hero__dates"[^>]*>(.*?)</p>', re.S)
TIME = re.compile(r'(Published|Updated) <time datetime="(\d{4}-\d{2}-\d{2})">([^<]+)</time>')
JSON_LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def human(iso_date):
    parsed = datetime.date.fromisoformat(iso_date)
    return f"{parsed.day} {parsed.strftime('%B %Y')}"


def blog_posting(source):
    for block in JSON_LD.findall(source):
        for node in json.loads(block).get("@graph", []):
            if node.get("@type") == "BlogPosting":
                return node
    raise AssertionError("BlogPosting data is missing")


class GuideDatesTests(unittest.TestCase):
    def test_there_are_ten_guides(self):
        self.assertEqual(10, len(GUIDES))

    def test_visible_dates_match_the_article_data(self):
        for path in GUIDES:
            with self.subTest(guide=path.parent.name):
                source = path.read_text(encoding="utf-8")
                posting = blog_posting(source)
                published = posting["datePublished"]
                modified = posting["dateModified"]
                self.assertLessEqual(published, modified)

                heroes = HERO.findall(source)
                self.assertEqual(1, len(heroes))
                lines = DATES_LINE.findall(heroes[0])
                self.assertEqual(1, len(lines))
                shown = TIME.findall(lines[0])

                expected = [("Published", published, human(published))]
                if modified != published:
                    expected.append(("Updated", modified, human(modified)))
                self.assertEqual(expected, shown)


if __name__ == "__main__":
    unittest.main()
