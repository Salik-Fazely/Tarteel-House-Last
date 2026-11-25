"""Structured data on core pages says only what the pages themselves say.

Search engines and AI assistants read this data to describe Tarteel House.
Each test compares it with the visible page or the approved commercial
facts, so the two cannot drift apart.
"""

import json
import re
import unittest
from html import unescape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.tarteelhouse.com"
ORGANIZATION_ID = BASE + "/#organization"
BREADCRUMB_PAGES = {
    "about/index.html": "/about/",
    "blog/index.html": "/blog/",
    "book-trial/index.html": "/book-trial/",
    "how-it-works/index.html": "/how-it-works/",
    "pricing/index.html": "/pricing/",
    "teachers/index.html": "/teachers/",
    "quran-classes-in-farsi-and-dari/index.html": "/quran-classes-in-farsi-and-dari/",
    "quran-classes-in-turkish/index.html": "/quran-classes-in-turkish/",
    "noorani-qaida-classes-for-kids/index.html": "/noorani-qaida-classes-for-kids/",
    "tajweed-classes-for-kids/index.html": "/tajweed-classes-for-kids/",
    "quran-memorization-for-kids/index.html": "/quran-memorization-for-kids/",
    "ramadan-quran-classes-for-kids/index.html": "/ramadan-quran-classes-for-kids/",
    "online-quran-classes-for-kids-in-europe/index.html": "/online-quran-classes-for-kids-in-europe/",
    "female-quran-teacher-for-kids/index.html": "/female-quran-teacher-for-kids/",
    "faq/index.html": "/faq/",
}


def read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


def nodes(relative):
    found = []
    for block in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', read(relative), re.S
    ):
        data = json.loads(block)
        found.extend(data.get("@graph", [data]))
    return found


def has_type(item, node_type):
    kind = item.get("@type")
    if isinstance(kind, list):
        return node_type in kind
    return kind == node_type


def node(relative, node_type):
    return next(item for item in nodes(relative) if has_type(item, node_type))


class StructuredDataTests(unittest.TestCase):
    def test_01_every_public_page_has_valid_json_ld_or_none(self):
        for path in sorted(ROOT.glob("**/index.html")):
            if "node_modules" in path.parts:
                continue
            with self.subTest(page=str(path.relative_to(ROOT))):
                for block in re.findall(
                    r'<script type="application/ld\+json">(.*?)</script>',
                    path.read_text(encoding="utf-8"),
                    re.S,
                ):
                    json.loads(block)

    def test_02_breadcrumbs_end_at_each_page_canonical_address(self):
        for relative, url_path in BREADCRUMB_PAGES.items():
            with self.subTest(page=relative):
                crumbs = node(relative, "BreadcrumbList")["itemListElement"]
                self.assertEqual([1, 2], [crumb["position"] for crumb in crumbs])
                self.assertEqual(BASE + "/", crumbs[0]["item"])
                self.assertEqual(BASE + url_path, crumbs[-1]["item"])
                self.assertIn(
                    f'<link rel="canonical" href="{BASE + url_path}" />', read(relative)
                )

    def test_03_pricing_offers_match_commercial_facts(self):
        facts = read("docs/commercial-facts.md")
        service = node("pricing/index.html", "Service")
        self.assertEqual(ORGANIZATION_ID, service["provider"]["@id"])
        offers = {offer["name"]: offer for offer in service["offers"]}
        expected = {
            "Starter: 6 lessons": ("120", "6 lessons: €120"),
            "Steady: 12 lessons": ("220", "12 lessons: €220"),
            "Committed: 25 lessons": ("400", "25 lessons: €400"),
        }
        for name, (price, fact) in expected.items():
            with self.subTest(offer=name):
                self.assertIn(fact, facts)
                self.assertEqual(price, offers[name]["price"])
                self.assertEqual("EUR", offers[name]["priceCurrency"])
        self.assertEqual("0", offers["Free trial lesson"]["price"])
        # The trial is booked on the booking page; packages are explained on Pricing.
        self.assertEqual("https://www.tarteelhouse.com/book-trial/", offers["Free trial lesson"]["url"])
        for name in expected:
            self.assertEqual("https://www.tarteelhouse.com/pricing/", offers[name]["url"])
        self.assertEqual(4, len(offers))
        audience = service["audience"]
        self.assertEqual((5, 16), (audience["suggestedMinAge"], audience["suggestedMaxAge"]))
        self.assertIn("Children aged 5–16", facts)
        self.assertEqual(
            ["English", "Arabic", "Turkish", "Persian"],
            service["availableChannel"]["availableLanguage"],
        )

    def test_04_teacher_data_matches_the_visible_teacher_cards(self):
        html = read("teachers/index.html")
        cards = re.findall(
            r'<p class="teacher-card__name">\s*(.*?)\s*</p>\s*'
            r'<p class="teacher-card__languages">\s*(.*?)\s*</p>',
            html,
            re.S,
        )
        visible = [
            (unescape(name), [part.strip().title() for part in unescape(langs).split("·")])
            for name, langs in cards
        ]
        listed = [
            (entry["item"]["name"], entry["item"]["knowsLanguage"])
            for entry in node("teachers/index.html", "ItemList")["itemListElement"]
        ]
        self.assertEqual(visible, listed)
        for entry in node("teachers/index.html", "ItemList")["itemListElement"]:
            self.assertEqual("Person", entry["item"]["@type"])
            self.assertEqual(ORGANIZATION_ID, entry["item"]["worksFor"]["@id"])

    def test_05_organisation_record_names_its_profile_and_area_served(self):
        organization = node("index.html", "Organization")
        self.assertTrue(has_type(organization, "EducationalOrganization"))
        self.assertIn("human teachers", organization["disambiguatingDescription"].lower())
        self.assertNotIn("tarteel ai", organization["disambiguatingDescription"].lower())
        self.assertEqual(
            [
                "https://www.instagram.com/tarteelhouse/",
                "https://www.trustpilot.com/review/tarteelhouse.com",
            ],
            organization["sameAs"],
        )
        self.assertEqual(["Europe", "United States"], organization["areaServed"])
        self.assertIn("across Europe and the US", read("about/index.html"))
        # Tarteel House teaches online only and publishes no postal address.
        self.assertNotIn("address", organization)

    def test_06_no_ratings_or_reviews_are_claimed(self):
        for path in sorted(ROOT.glob("**/index.html")):
            if "node_modules" in path.parts:
                continue
            for item in nodes(str(path.relative_to(ROOT))):
                with self.subTest(page=str(path.relative_to(ROOT)), node=item.get("@type")):
                    text = json.dumps(item)
                    self.assertNotIn("aggregateRating", text)
                    self.assertNotIn('"review"', text)

    def test_07_course_pages_match_commercial_facts(self):
        course_pages = (
            "noorani-qaida-classes-for-kids/index.html",
            "tajweed-classes-for-kids/index.html",
            "quran-memorization-for-kids/index.html",
            "ramadan-quran-classes-for-kids/index.html",
            "online-quran-classes-for-kids-in-europe/index.html",
        )
        for relative in course_pages:
            with self.subTest(page=relative):
                course = node(relative, "Course")
                self.assertEqual(ORGANIZATION_ID, course["provider"]["@id"])
                self.assertEqual(["en", "ar", "tr", "fa"], course["inLanguage"])
                audience = course["audience"]
                self.assertEqual((5, 16), (audience["suggestedMinAge"], audience["suggestedMaxAge"]))
                offers = {offer["name"]: offer for offer in course["offers"]}
                self.assertEqual("0", offers["Free trial lesson"]["price"])
                self.assertEqual("120", offers["Starter: 6 lessons"]["price"])
                self.assertEqual("220", offers["Steady: 12 lessons"]["price"])
                self.assertEqual("400", offers["Committed: 25 lessons"]["price"])
                self.assertEqual(4, len(offers))

    def test_08_language_pages_publish_verified_service_and_offers(self):
        facts = read("docs/commercial-facts.md")
        for relative, expected_language in (
            ("fa/index.html", "Persian"),
            ("tr/index.html", "Turkish"),
        ):
            with self.subTest(page=relative):
                service = node(relative, "Service")
                self.assertEqual(ORGANIZATION_ID, service["provider"]["@id"])
                self.assertEqual(["Europe", "United States"], service["areaServed"])
                self.assertEqual(
                    (5, 16),
                    (service["audience"]["suggestedMinAge"], service["audience"]["suggestedMaxAge"]),
                )
                self.assertEqual(
                    [expected_language],
                    service["availableChannel"]["availableLanguage"],
                )
                offers = {offer["name"]: offer for offer in service["offers"]}
                self.assertEqual(4, len(offers))
                for name, price, fact in (
                    ("Free trial lesson", "0", "Free trial lesson"),
                    ("Starter: 6 lessons", "120", "6 lessons: €120"),
                    ("Steady: 12 lessons", "220", "12 lessons: €220"),
                    ("Committed: 25 lessons", "400", "25 lessons: €400"),
                ):
                    if price != "0":
                        self.assertIn(fact, facts)
                    self.assertEqual(price, offers[name]["price"])
                    self.assertEqual("EUR", offers[name]["priceCurrency"])

    def test_09_localized_subpages_publish_valid_breadcrumbs_and_courses(self):
        localized_breadcrumbs = (
            ("fa/book-trial/index.html", "/fa/", "/fa/book-trial/"),
            ("fa/amoozesh-rokhani-quran-koodakan/index.html", "/fa/", "/fa/amoozesh-rokhani-quran-koodakan/"),
            ("tr/book-trial/index.html", "/tr/", "/tr/book-trial/"),
            ("tr/cocuklar-icin-online-elifba/index.html", "/tr/", "/tr/cocuklar-icin-online-elifba/"),
        )
        for relative, parent_path, url_path in localized_breadcrumbs:
            with self.subTest(page=relative):
                crumbs = node(relative, "BreadcrumbList")["itemListElement"]
                self.assertEqual([1, 2], [crumb["position"] for crumb in crumbs])
                self.assertEqual(BASE + parent_path, crumbs[0]["item"])
                self.assertEqual(BASE + url_path, crumbs[-1]["item"])
                self.assertIn(
                    f'<link rel="canonical" href="{BASE + url_path}" />', read(relative)
                )

        for relative, expected_lang, trial_url in (
            ("fa/amoozesh-rokhani-quran-koodakan/index.html", "fa", BASE + "/fa/book-trial/"),
            ("tr/cocuklar-icin-online-elifba/index.html", "tr", BASE + "/tr/book-trial/"),
        ):
            with self.subTest(course=relative):
                course = node(relative, "Course")
                self.assertEqual(ORGANIZATION_ID, course["provider"]["@id"])
                self.assertEqual([expected_lang], course["inLanguage"])
                self.assertEqual(
                    (5, 16),
                    (course["audience"]["suggestedMinAge"], course["audience"]["suggestedMaxAge"]),
                )
                offers = {offer["name"]: offer for offer in course["offers"]}
                self.assertEqual(4, len(offers))
                self.assertEqual("0", offers["Free trial lesson"]["price"])
                self.assertEqual(trial_url, offers["Free trial lesson"]["url"])
                self.assertEqual("120", offers["Starter: 6 lessons"]["price"])
                self.assertEqual("220", offers["Steady: 12 lessons"]["price"])
                self.assertEqual("400", offers["Committed: 25 lessons"]["price"])


if __name__ == "__main__":
    unittest.main()
