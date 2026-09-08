"""Keep the repaired brand SVGs independent of embedded or external fonts."""
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NS = {"svg": "http://www.w3.org/2000/svg"}


class LogoFontProvenanceTests(unittest.TestCase):
    def test_logos_have_no_font_payload_or_external_resource(self):
        for name in ("tarteel-house.svg", "tarteel-house-reversed.svg"):
            source = (ROOT / "assets/logo" / name).read_text(encoding="utf-8")
            self.assertIsNone(re.search(
                r"base64|data:|@font-face|font-family|woff|\bCGI\b|\bINT\b|href=|url\(",
                source, re.I), name)
            root = ET.fromstring(source)
            self.assertFalse(root.findall(".//svg:text", NS), name)
            self.assertEqual(len(root.findall(".//svg:path", NS)), 6, name)

    def test_wordmarks_preserve_canvas_accessible_name_and_colors(self):
        for name, color in (("tarteel-house.svg", "#1a1814"),
                            ("tarteel-house-reversed.svg", "#f5f1e8")):
            root = ET.parse(ROOT / "assets/logo" / name).getroot()
            self.assertEqual(root.get("viewBox"), "0 0 275.71 175.00")
            self.assertEqual((root.get("width"), root.get("height")), ("276", "175"))
            self.assertEqual(root.get("role"), "img")
            self.assertEqual(root.get("aria-label"), "Tarteel House")
            self.assertEqual(root.find("svg:title", NS).text, "Tarteel House")
            self.assertEqual(root.find("svg:g", NS).get("fill"), color)
            if "reversed" in name:
                self.assertEqual(root.find("svg:rect", NS).get("fill"), "#1a1814")

    def test_both_variants_use_identical_lettering(self):
        paths = []
        for name in ("tarteel-house.svg", "tarteel-house-reversed.svg"):
            root = ET.parse(ROOT / "assets/logo" / name).getroot()
            paths.append([node.get("d") for node in root.findall(".//svg:path", NS)])
        self.assertTrue(all(paths[0]))
        self.assertEqual(paths[0], paths[1])


if __name__ == "__main__":
    unittest.main()
