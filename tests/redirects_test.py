"""Old addresses must redirect permanently and keep the visitor's query string.

Cloudflare Pages serves `pricing.html` for `/pricing` when both `pricing.html`
and `pricing/index.html` exist. Those files are old redirect stubs, so every
old address must also have a `_redirects` rule: Cloudflare applies it before
serving files and keeps the query string (utm_*, gclid, oppref) when the
destination has none. The stubs stay as a fallback and must keep it too.
"""

import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://www.tarteelhouse.com"
STUBS = {
    "about.html": "/about/",
    "blog.html": "/blog/",
    "book-trial.html": "/book-trial/",
    "how-it-works.html": "/how-it-works/",
    "pricing.html": "/pricing/",
    "privacy-policy.html": "/privacy-policy/",
    "privacy.html": "/privacy-policy/",
    "success.html": "/success/",
    "teachers.html": "/teachers/",
    "terms.html": "/terms/",
}


def redirect_rules():
    rules = []
    for line in (ROOT / "_redirects").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            rules.append(tuple(line.split()))
    return rules


def sitemap_paths():
    root = ET.parse(ROOT / "sitemap.xml").getroot()
    return {loc.text.removeprefix(BASE_URL) for loc in root.findall(".//{*}loc")}


class RedirectRulesTests(unittest.TestCase):
    def test_every_flat_html_file_is_a_known_stub(self):
        flat = {path.name for path in ROOT.glob("*.html")} - {"404.html", "index.html"}
        self.assertEqual(set(STUBS), flat)

    def test_each_stub_has_rules_for_both_old_addresses(self):
        rules = {(source, destination, status) for source, destination, status in redirect_rules()}
        for stub, destination in STUBS.items():
            name = stub.removesuffix(".html")
            with self.subTest(stub=stub):
                self.assertIn((f"/{name}.html", destination, "301"), rules)
                self.assertIn((f"/{name}", destination, "301"), rules)

    def test_rules_are_static_permanent_and_keep_the_query_string(self):
        rules = redirect_rules()
        self.assertEqual(len(STUBS) * 2, len(rules))
        sources = [source for source, _, _ in rules]
        self.assertEqual(len(sources), len(set(sources)), "duplicate source")
        for rule in rules:
            with self.subTest(rule=" ".join(rule)):
                self.assertEqual(3, len(rule))
                source, destination, status = rule
                self.assertEqual("301", status)
                self.assertRegex(source, r"^/[A-Za-z0-9_-]+(?:\.html)?$")
                self.assertNotIn("*", source)
                self.assertNotIn(":", source)
                # A destination with its own query string would replace the visitor's.
                self.assertRegex(destination, r"^/(?:[A-Za-z0-9_-]+/)*$")

    def test_rules_never_point_at_themselves_or_a_missing_page(self):
        canonical = sitemap_paths() | {"/success/"}
        for source, destination, _ in redirect_rules():
            with self.subTest(source=source):
                self.assertFalse(source.endswith("/"), "a real page address would loop")
                self.assertNotIn(source, canonical)
                self.assertIn(destination, canonical)
                self.assertTrue((ROOT / destination.strip("/") / "index.html").is_file())


class FallbackStubTests(unittest.TestCase):
    def test_stubs_keep_query_string_and_hash(self):
        for stub, destination in STUBS.items():
            with self.subTest(stub=stub):
                source = (ROOT / stub).read_text(encoding="utf-8")
                self.assertIn(
                    f"window.location.replace('{destination}' + window.location.search + window.location.hash);",
                    source,
                )

    def test_meta_refresh_runs_only_without_javascript(self):
        for stub, destination in STUBS.items():
            with self.subTest(stub=stub):
                source = (ROOT / stub).read_text(encoding="utf-8")
                refreshes = re.findall(r'<meta http-equiv="refresh"[^>]*>', source)
                self.assertEqual([f'<meta http-equiv="refresh" content="0; url={destination}" />'], refreshes)
                self.assertIn(f"<noscript>{refreshes[0]}</noscript>", source)

    def test_stubs_stay_out_of_search_results(self):
        for stub, destination in STUBS.items():
            with self.subTest(stub=stub):
                source = (ROOT / stub).read_text(encoding="utf-8")
                self.assertIn('<meta name="robots" content="noindex, follow" />', source)
                self.assertIn(f'<link rel="canonical" href="{BASE_URL}{destination}" />', source)


if __name__ == "__main__":
    unittest.main()
