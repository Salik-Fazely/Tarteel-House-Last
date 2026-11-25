import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FORM = (ROOT / "book-trial/index.html").read_text(encoding="utf-8")
BACKEND = (ROOT / "apps-script/Code.gs").read_text(encoding="utf-8")
POLICY = (ROOT / "privacy-policy/index.html").read_text(encoding="utf-8")
DECISIONS = (ROOT / "docs/decisions.md").read_text(encoding="utf-8")


def backend_values(name, following):
    """Return the quoted values of one ALLOWED_VALUES list in Code.gs."""
    block = re.search(
        rf"\n  {name}:\s*\[(.*?)\]\s*{following}", BACKEND, re.DOTALL
    )
    if block is None:
        raise AssertionError(f"ALLOWED_VALUES.{name} not found in Code.gs")
    return re.findall(r"'([^']+)'", block.group(1))


class BookingFormBackendAlignmentTests(unittest.TestCase):
    """A value the form offers but the backend rejects loses a real booking."""

    def test_every_country_the_form_offers_is_accepted_by_the_backend(self):
        select = re.search(
            r'<select id="country" name="country".*?</select>', FORM, re.DOTALL
        )
        self.assertIsNotNone(select, "country select not found")
        options = re.findall(r'<option value="([^"]*)"', select.group())
        self.assertEqual("", options[0], "the placeholder option comes first")
        self.assertEqual(backend_values("country", r",\s*child_age:"), options[1:])
        self.assertIn("Australia", options)
        self.assertEqual("Other", options[-1])

    def test_the_decision_record_lists_the_same_countries(self):
        listed = re.search(
            r"Country is a required dropdown shortlist:\n\s+(.*?)\.\n", DECISIONS
        )
        self.assertIsNotNone(listed, "country shortlist not found in decisions")
        self.assertEqual(
            backend_values("country", r",\s*child_age:"),
            [name.strip() for name in listed.group(1).split(",")],
        )

    def test_source_question_matches_the_backend_and_is_never_required(self):
        controls = re.findall(r'<input[^>]*name="heard_about"[^>]*>', FORM)
        self.assertEqual(6, len(controls))
        values = [re.search(r'value="([^"]*)"', control).group(1) for control in controls]
        self.assertEqual(backend_values("heard_about", r"\n\};"), values)
        for control in controls:
            self.assertIn('type="radio"', control)
            self.assertNotIn("required", control)
        ids = [re.search(r'id="([^"]*)"', control).group(1) for control in controls]
        self.assertEqual(len(ids), len(set(ids)))
        for control_id in ids:
            self.assertEqual(1, FORM.count(f'for="{control_id}"'), control_id)

        fieldset = re.search(
            r"<fieldset[^>]*>\s*<legend[^>]*>\s*How did you hear about us\?"
            r".*?</fieldset>",
            FORM,
            re.DOTALL,
        )
        self.assertIsNotNone(fieldset, "source question fieldset not found")
        self.assertIn("(optional)", fieldset.group())
        self.assertNotIn("data-required", fieldset.group())

    def test_source_question_is_not_in_the_backend_required_or_fingerprint_fields(self):
        required = re.search(r"const REQUIRED_FIELDS = \[(.*?)\];", BACKEND, re.DOTALL)
        fingerprint = re.search(
            r"const BOOKING_DETAIL_FIELDS = \[(.*?)\];", BACKEND, re.DOTALL
        )
        self.assertNotIn("heard_about", required.group(1))
        self.assertNotIn("heard_about", fingerprint.group(1))
        self.assertIn("const OPTIONAL_DETAIL_FIELDS = ['heard_about'];", BACKEND)

    def test_privacy_policy_lists_the_optional_source_answer(self):
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", POLICY))
        self.assertIn("how you heard about us, if you choose to tell us", text)


if __name__ == "__main__":
    unittest.main()
