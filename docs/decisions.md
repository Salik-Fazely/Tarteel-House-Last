# Key Decisions

## Technical decisions
- The site is a static custom-coded HTML/CSS/JS site.
- No frontend framework is currently used.
- The launch booking backend is Google Apps Script, not PHP/MySQL.
- Booking submissions are stored in Google Sheets.
- Booking notifications are emailed to `hello@tarteelhouse.com`.
- `apps-script/Code.gs` is the canonical Apps Script source. Paste it into the bound Apps Script project and redeploy to update the live backend.
- Hostinger remains the likely hosting target for the static site and domain.
- PHP/MySQL may be revisited later, but it is not the launch backend.

## Business identity decisions
- Public contact email: `hello@tarteelhouse.com`.
- Business location: Barcelona, Spain.
- Public WhatsApp / phone used in legal and success CTA: `+34 614 494 311`.
- WhatsApp is the main follow-up method for trial requests.

## Booking flow decisions
- Free trial before any payment.
- WhatsApp number is required in the booking form.
- Country is a required dropdown shortlist:
  Germany, France, Netherlands, Belgium, Sweden, Norway, Denmark, Switzerland, Austria, United Kingdom, Ireland, Spain, Italy, Canada, United States, Other.
- City / Region is a required free-text field.
- City / Region replaced the older technical timezone field.
- Preferred days, preferred time, current Qur'an level, and session language are required chip fields.
- No separate teacher-preference field exists; parents can mention a preferred teacher in notes.
- Success page copy says a colleague will contact the parent on WhatsApp within one to two working days.
- Success redirect should land on the site's `success.html`; verify this near final publish/staging.
- Launch lesson platform copy should say Zoom or Google Meet.

## Product and operations decisions
- Teacher matching is handled personally, not algorithmically.
- Founder-led, intentionally small team.
- One dedicated teacher per child.
- One bundle = one child.
- Larger bundles add ethics sessions, parent check-ins, and progress summaries.
- Public homepage stats are approved:
  4 Teachers, 21+ Students, 100% Trusted by Families.

## Pricing decisions
- Starter: EUR 120 / 5 sessions.
- Steady: EUR 220 / 10 sessions, most popular.
- Committed: EUR 400 / 20 sessions.
- "Family" was renamed to "Steady" to avoid sibling-sharing confusion.

## Brand and design decisions
- Preserve the current minimal premium editorial design.
- Primary actions use forest green.
- Bronze is used for accents and quiet emphasis.
- Alternating ivory/paper section backgrounds define the layout rhythm.
- Avoid unnecessary redesigns, new style systems, and broad refactors.
- Motion should stay subtle and must respect reduced-motion preferences.

## Legal decisions
- Legal pages exist but still need proper founder/legal review.
- Earlier plan mentioned iubenda; this remains an option, not a confirmed final legal provider.
- Do not invent legal facts. Use confirmed business details only.

## Open decisions
- The missing social preview image `assets/images/og-home.jpg` will be provided later.
