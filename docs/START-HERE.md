# START HERE

This is the recovery and handoff file for Tarteel House. Read this first if context is lost or a new AI/session takes over.

## What this project is
Tarteel House is a premium online Qur'an learning website for Muslim families. Parents can learn about the service, view teachers, review pricing, and book a free trial for their child.

The product is trust-first: parents should feel calm, respected, and confident before submitting the booking form.

## Current stack
- Static HTML pages at the project root.
- One main stylesheet: `assets/css/styles.css`.
- Shared JavaScript: `assets/js/main.js`.
- Booking form page: `book-trial.html`.
- Booking backend: Google Apps Script.
- Booking storage: Google Sheets.
- Backend source in repo: `apps-script/Code.gs`.
- Backend docs: `apps-script/README.md`.

## Current status
The site is mostly built and close to launch. The main pages exist, the booking form posts to Apps Script, Apps Script validates the booking, stores it in Google Sheets, and emails `hello@tarteelhouse.com`.

The latest local code is not automatically live. Apps Script changes must be copied into the Apps Script editor and redeployed.

## Non-negotiable rules
- Do not change fonts casually.
- Do not change typography, spacing, colors, layout language, animations, or visual hierarchy unless explicitly asked.
- Do not redesign the site just because another design is possible.
- Preserve the current minimal, premium, warm, parent-friendly style.
- Keep edits small and practical.
- Prefer existing classes, tokens, and patterns.
- Do not introduce a new style system.
- Do not replace Google Apps Script as the launch backend unless explicitly requested.
- Do not invent business, legal, teacher, or operational facts.

## Confirmed facts
- Public email: `hello@tarteelhouse.com`.
- Business location: Barcelona, Spain.
- Public WhatsApp / phone: `+34 614 494 311`.
- WhatsApp is the main contact method.
- WhatsApp is required in the booking form.
- Country is a required dropdown shortlist.
- City / Region is required and replaces the old timezone field.
- Success page says a colleague will contact the parent on WhatsApp within one to two working days.
- Lesson platform copy should say Zoom or Google Meet.
- Homepage stats are approved: 4 Teachers, 21+ Students, 100% Trusted by Families.

## Main pages
- `index.html`: homepage.
- `book-trial.html`: booking form.
- `success.html`: post-booking confirmation page.
- `teachers.html`: teacher profiles.
- `pricing.html`: pricing.
- `how-it-works.html`: process.
- `about.html`: brand/about story.
- `privacy-policy.html`: legal privacy page.
- `terms.html`: legal terms page.

## Booking flow
Required fields:
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

Flow:
1. Parent submits `book-trial.html`.
2. Form posts to the deployed Google Apps Script Web App.
3. Apps Script validates required fields and allowed chip/dropdown values.
4. Apps Script writes a row to Google Sheets.
5. Apps Script emails `hello@tarteelhouse.com`.
6. Parent redirects to `success.html`.
7. If validation or backend completion fails, parent sees an error page instead of a false success.

## What is done
- Static site pages are built.
- Visual brand system exists.
- Homepage trust stats band exists.
- Booking form has required WhatsApp, Country dropdown, City / Region, and chip validation.
- Apps Script backend exists and has server-side validation.
- Success page uses WhatsApp-first follow-up copy.
- Public email/location/WhatsApp are mostly consistent.
- Docs have been refreshed for handoff.

## What is left
- Redeploy `apps-script/Code.gs`.
- Run a real booking test.
- Verify `hello@tarteelhouse.com` inbox and deliverability.
- Add missing `assets/images/og-home.jpg` when the founder provides the social preview image.
- Final legal review of privacy/terms.
- Final desktop/mobile QA on live hosting.
- Record teacher intro videos.
- Replace any unverified testimonials if needed.

## Important warnings
- Existing Google Sheets may still contain an old `timezone` column. Do not reorder existing sheets casually. The script appends missing columns to avoid disturbing old data.
- The footer language buttons are visual only unless later implemented.
- Legal pages are not a substitute for professional legal review.
- The `success_redirect` setup must be checked on local, staging, and production before launch.
- Homepage OG image is currently referenced but missing; founder will provide it later.

## How to continue safely
1. Read this file.
2. Read `docs/current-status.md`.
3. Read `docs/next-tasks.md`.
4. Before editing, inspect the exact files involved.
5. Keep changes narrowly scoped to the task.
6. Run syntax checks for JS and Apps Script after editing:
   - `node --check assets/js/main.js`
   - `Get-Content -Raw apps-script/Code.gs | node --check --input-type=commonjs -`
7. If you change booking fields, update:
   - `book-trial.html`
   - `apps-script/Code.gs`
   - `apps-script/README.md`
   - relevant legal/docs files
8. After meaningful work, update `docs/current-status.md`, `docs/decisions.md`, `docs/next-tasks.md`, and `docs/session-handoff.md`.
