import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parents[1]
RELEASE_VERSION = "20260907-1"
VERSIONED_ASSETS = {
    "/assets/css/styles.css",
    "/assets/js/consent.js",
    "/assets/js/analytics-events.js",
    "/assets/js/main.js",
}
MAIN_VERSION = "20261014-1"


class AssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("src"):
            self.urls.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.urls.append(attrs.get("href", ""))


class AssetVersioningTests(unittest.TestCase):
    def test_every_public_page_uses_the_current_version_for_each_shared_asset(self):
        pages = [path for path in ROOT.rglob("*.html")
                 if "<!-- SHARED FOOTER:START -->" in path.read_text(encoding="utf-8")]
        self.assertEqual(23, len(pages))
        for page in pages:
            with self.subTest(page=str(page.relative_to(ROOT))):
                parser = AssetParser()
                parser.feed(page.read_text(encoding="utf-8"))
                references = [urlsplit(url) for url in parser.urls
                              if urlsplit(url).path in VERSIONED_ASSETS]
                self.assertCountEqual(VERSIONED_ASSETS, [url.path for url in references])
                for url in references:
                    version = MAIN_VERSION if url.path == "/assets/js/main.js" else RELEASE_VERSION
                    self.assertEqual({"v": [version]}, parse_qs(url.query), url.path)
                    self.assertEqual("", url.fragment)
                    self.assertEqual("", url.netloc)
                    self.assertTrue((ROOT / url.path.lstrip("/")).is_file())


if __name__ == "__main__":
    unittest.main()
