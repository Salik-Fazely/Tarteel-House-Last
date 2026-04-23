# Current Status

## Overall state
Tarteel House is close to static-site launch. The main website pages are built, the booking form posts to Google Apps Script, submissions are stored in Google Sheets, and booking notifications go to `hello@tarteelhouse.com`.

## Completed pages
- `index.html`: homepage with hero, trust stats band, how-it-works preview, teacher preview, why-us section, pricing preview, testimonials, final CTA, and footer.
- `book-trial.html`: booking form with required WhatsApp, country dropdown, City / Region, chip-based preferences, consent, and success redirect field.
- `success.html`: booking confirmation page with WhatsApp-first follow-up copy and WhatsApp CTA.
- `pricing.html`: pricing bundles and FAQ.
- `how-it-works.html`: full process page.
- `teachers.html`: teacher page with four real teacher profiles and language filter.
- `about.html`: about page.
- `privacy-policy.html` and `terms.html`: legal pages with current business identity, but still requiring founder/legal review.

## Core files
- `assets/css/styles.css`: global brand tokens, typography, layout, components, responsive styles, and motion rules.
- `assets/js/main.js`: mobile nav, active nav link, scroll reveals, page transitions, stats count-up, and shared progressive enhancement.
- `book-trial.html`: includes small inline JS for booking chips and success redirect.
- `apps-script/Code.gs`: canonical Google Apps Script booking backend.
- `apps-script/README.md`: backend deployment and sheet documentation.

## Booking flow now
1. Parent submits `book-trial.html`.
2. Form posts to deployed Google Apps Script Web App.
3. Backend validates required fields and allowed values.
4. Backend appends the booking to Google Sheets.
5. Backend sends a plain-text notification to `hello@tarteelhouse.com`.
6. Parent is redirected to `success.html` only after the booking flow completes.
7. If validation or backend completion fails, Apps Script returns an error page instead of falsely showing success.

## Current required booking fields
- `parent_name`
- `child_name`
- `child_age`
- `quran_level`
- `session_language`
- `country`
- `email`
- `whatsapp`
- `preferred_days`
- `preferred_time`
- `city_region`
- `consent = yes`

## Confirmed business details
- Public email: `hello@tarteelhouse.com`.
- Business location: Barcelona, Spain.
- WhatsApp / phone: `+34 614 494 311`.

## Recent QA result
- JavaScript syntax passed for `assets/js/main.js`.
- Apps Script syntax passed via Node check.
- True 390px CSS viewport check found no horizontal overflow on homepage, booking page, or success page.
- Local href/src check found no broken internal links in changed surfaces.

## What remains
- Redeploy latest `apps-script/Code.gs` to the live Google Apps Script project.
- Manually test one real booking end to end: sheet row, notification email, success redirect.
- Add the missing Open Graph image `assets/images/og-home.jpg` when provided.
- Final legal review of privacy policy and terms.
- Verify `hello@tarteelhouse.com` inbox and deliverability.
- Record teacher intro videos.
- Replace testimonials only if any are placeholders or not founder-approved.
- Upload/publish the static site and test live domain/SSL.
