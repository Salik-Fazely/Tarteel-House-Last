import importlib.util
import re
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/sync_shared_layout.py"
STYLESHEET = ROOT / "assets/css/styles.css"


def load_sync_module(name="sync_shared_layout_language_switch"):
    # Dataclasses resolve annotations through sys.modules, so register first.
    spec = importlib.util.spec_from_file_location(name, SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class SwitchParser(HTMLParser):
    """Collects the header's two language controls and their options."""

    GROUPS = {"lang-switch": "button", "nav__lang": "row"}
    OPTION_CLASSES = {"lang-switch__option", "nav__lang-option"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.groups = {"button": [], "row": []}
        self.counts = {"button": 0, "row": 0}
        self.labels = {"button": [], "row": []}
        self.current_label = []
        self._group = None
        self._group_tag = None
        self._depth = 0
        self._option = None
        self._capture = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        classes = set(attributes.get("class", "").split())
        if self._group is None:
            for class_name, group in self.GROUPS.items():
                if class_name in classes and tag in {"details", "li"}:
                    self._group, self._group_tag, self._depth = group, tag, 0
                    self.counts[group] += 1
        if self._group is None:
            return
        if tag == self._group_tag:
            self._depth += 1
        if classes & self.OPTION_CLASSES:
            self._option = {"tag": tag, "attrs": attributes, "classes": classes, "text": []}
            self.groups[self._group].append(self._option)
        elif "sr-only" in classes:
            self._capture = self.labels[self._group]
        elif "lang-switch__current" in classes:
            self._capture = self.current_label

    def handle_endtag(self, tag):
        if self._group is None:
            return
        if self._option is not None and tag == self._option["tag"]:
            self._option = None
        if tag == "span":
            self._capture = None
        if tag == self._group_tag:
            self._depth -= 1
            if self._depth == 0:
                self._group = None

    def handle_data(self, data):
        if self._option is not None:
            self._option["text"].append(data)
        elif self._capture is not None:
            self._capture.append(data)


def parse(relative):
    parser = SwitchParser()
    parser.feed((ROOT / relative).read_text(encoding="utf-8"))
    parser.close()
    return parser


def text(parts):
    return re.sub(r"\s+", " ", "".join(parts)).strip()


class LanguageSwitchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sync = load_sync_module()
        cls.languages = cls.sync.LANGUAGES
        cls.pages = {
            config.path: (config.language, parse(config.path))
            for config in cls.sync.PAGE_CONFIGS
            if config.sync_header
        }

    def test_language_list_is_complete_and_each_home_page_exists(self):
        self.assertEqual(("en", "fa", "tr"), self.sync.LANGUAGE_CODES)
        for code, path, name, word in self.languages:
            self.assertTrue(name and word, code)
            self.assertTrue(path.startswith("/") and path.endswith("/"), path)
            self.assertTrue((ROOT / path.strip("/") / "index.html").is_file(), path)

    def test_every_page_has_one_button_and_one_mobile_row(self):
        self.assertEqual(25, len(self.pages))
        for relative, (_, page) in self.pages.items():
            with self.subTest(page=relative):
                self.assertEqual({"button": 1, "row": 1}, page.counts)

    def test_page_language_matches_its_html_lang(self):
        for relative, (language, _) in self.pages.items():
            source = (ROOT / relative).read_text(encoding="utf-8")
            match = re.search(r'<html\s+lang="([a-z-]+)"', source)
            with self.subTest(page=relative):
                self.assertIsNotNone(match)
                self.assertEqual(language, match.group(1).split("-")[0])

    def test_options_list_every_language_and_mark_only_the_current_one(self):
        expected_names = [name for _, _, name, _ in self.languages]
        paths = {code: path for code, path, _, _ in self.languages}
        for relative, (language, page) in self.pages.items():
            for group, options in page.groups.items():
                with self.subTest(page=relative, group=group):
                    self.assertEqual(expected_names, [text(option["text"]) for option in options])
                    current = [o for o in options if "is-current" in o["classes"]]
                    self.assertEqual(1, len(current))
                    self.assertEqual(language, current[0]["attrs"].get("lang"))
                    # The current language is plain text, not a link back to itself.
                    self.assertEqual("span", current[0]["tag"])
                    self.assertEqual("true", current[0]["attrs"].get("aria-current"))
                    self.assertNotIn("href", current[0]["attrs"])
                    for option in options:
                        code = option["attrs"].get("lang")
                        if option is current[0]:
                            continue
                        self.assertEqual("a", option["tag"])
                        self.assertEqual(paths[code], option["attrs"].get("href"))
                        self.assertEqual(code, option["attrs"].get("hreflang"))
                        self.assertNotIn("aria-current", option["attrs"])

    def test_button_names_the_current_language_and_labels_its_purpose(self):
        by_code = {code: (name, word) for code, _, name, word in self.languages}
        for relative, (language, page) in self.pages.items():
            name, word = by_code[language]
            with self.subTest(page=relative):
                self.assertEqual(name, text(page.current_label))
                self.assertEqual(f"{word}:", text(page.labels["button"]))
                self.assertEqual(word, text(page.labels["row"]))

    def test_button_is_a_native_disclosure_that_needs_no_script(self):
        for relative in self.pages:
            source = (ROOT / relative).read_text(encoding="utf-8")
            with self.subTest(page=relative):
                self.assertRegex(
                    source,
                    r'<details class="lang-switch">\s*<summary class="lang-switch__button">',
                )
                self.assertNotRegex(source, r'<details class="lang-switch"[^>]*\bopen\b')

    def test_placeholders_must_appear_once_on_their_own_line(self):
        replace = self.sync.replace_placeholder_line
        placeholder = self.sync.LANGUAGE_SWITCH_PLACEHOLDER
        self.assertEqual(
            "<nav>\n  <a>one</a>\n  <b>two</b>\n</nav>",
            replace(f"<nav>\n  {placeholder}\n</nav>", placeholder, "<a>one</a>\n<b>two</b>", "x"),
        )
        for broken in (
            "<nav></nav>",
            f"{placeholder}\n{placeholder}",
            f"<nav>{placeholder}</nav>",
        ):
            with self.subTest(fragment=broken):
                with self.assertRaises(self.sync.SyncError):
                    replace(broken, placeholder, "<a></a>", "x")

    def test_unknown_page_language_is_rejected(self):
        # A separate copy of the module, so the shared one keeps its real page list.
        sync = load_sync_module("sync_shared_layout_unknown_language")
        sync.PAGE_CONFIGS = (sync.PageConfig("index.html", None, language="de"),)
        with self.assertRaises(sync.SyncError):
            sync.validate_configuration(ROOT)

    def test_stylesheet_styles_both_controls_and_swaps_them_by_width(self):
        css = STYLESHEET.read_text(encoding="utf-8")
        for selector in (
            ".lang-switch__button",
            ".lang-switch__menu",
            ".lang-switch__option.is-current",
            ".nav__lang-option.is-current",
        ):
            self.assertIn(selector, css)
        # Desktop shows the button; the mobile menu shows the row instead.
        self.assertRegex(css, r"\.nav__lang \{\s*display: none;\s*\}")
        mobile = re.search(
            r"@media \(max-width: 767px\) \{\s*\.lang-switch \{\s*display: none;\s*\}"
            r"\s*\.nav__links \.nav__lang \{\s*display: flex;",
            css,
        )
        self.assertIsNotNone(mobile)
        # Outside clicks close the menu without JavaScript.
        self.assertRegex(
            css,
            r"\.lang-switch\[open\] > \.lang-switch__button::before \{[^}]*position: fixed;[^}]*inset: 0;",
        )


if __name__ == "__main__":
    unittest.main()
