"""Teacher names on guides must match the Teachers page exactly."""

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CARD_NAME = re.compile(r'<p class="teacher-card__name">([^<]+)</p>')
REVIEWER = re.compile(r"<p>Reviewed by ([^,<]+),")


class TeacherNameTests(unittest.TestCase):
    def test_reviewers_named_on_guides_are_teachers_spelled_as_on_the_teachers_page(self):
        teachers = set(CARD_NAME.findall((ROOT / "teachers/index.html").read_text(encoding="utf-8")))
        self.assertEqual(4, len(teachers))
        named = 0
        for path in sorted((ROOT / "blog").glob("*/index.html")):
            for name in REVIEWER.findall(path.read_text(encoding="utf-8")):
                named += 1
                with self.subTest(guide=path.parent.name):
                    self.assertIn(name, teachers)
        self.assertGreater(named, 0)


if __name__ == "__main__":
    unittest.main()
