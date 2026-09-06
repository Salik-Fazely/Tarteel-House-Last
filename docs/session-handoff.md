# Session Handoff

## Latest completed work
- The 5–6 September 2026 [conversion sprint report](../ASTRA_CONVERSION_SPRINT_REPORT.md) records the audit, local corrections, verification evidence, and open owner decisions.
- Local browser and VM harness checks verified named hidden-iframe submission, an authenticated `postMessage` response, and navigation to the first-party success page.
- Booking retries use a stable request ID to avoid duplicate Sheets rows; notification status is tracked separately. A saved row establishes receipt even if notification delivery needs attention.
- Conversion requires prepared-submission and receipt markers plus measurement consent. Revoking measurement no longer reloads the page or clears an unfinished form.
- Corrected unqualified two-day response promises and removed the unsupported post-trial deadline; the response expectation applies to the initial request.
- Aligned the blog index with the articles' teacher-review attribution and standardized Foruhar Rahmani's name.
- Confirmed the production hosting source of truth as Cloudflare Pages serving the repository root, and corrected stale social-image handoff notes.
- Homepage teacher preview was aligned with real teacher data from `/teachers`.
- Business location was standardized as Barcelona, Spain.
- Public email was standardized as `hello@tarteelhouse.com`.
- Booking form and repository source were aligned around:
  - WhatsApp is required.
  - Country is a dropdown shortlist.
  - City / Region replaced the old timezone field.
- Deployed Apps Script confirmation and real end-to-end verification remain open. Do not describe the booking flow as production-verified.
- Success page now describes WhatsApp follow-up and has a WhatsApp CTA.
- Lesson platform copy now says Zoom or Google Meet.
- Homepage trust stats band was added and refined:
  - 4 Teachers
  - 1-to-1 Lessons
  - 4 Teaching languages
  - Staggered reveal and count-up animation respect reduced-motion preferences.
- The Blog index and five articles are present.
- Complete public pages use the shared consent module and persistent cookie settings.
- Four teacher lesson-sample videos are present, including Sadiah Hamid's current video.
- Unverified written testimonials were removed; genuine student/family videos remain.
- Documentation was refreshed for continuity, including `docs/START-HERE.md`.

## Current priorities
1. Read the sprint report for local booking changes and unresolved findings.
2. Coordinate an authorized release with the matching Apps Script deployment first and Cloudflare Pages frontend publication second; then run an authorized real end-to-end booking test.
3. Confirm `hello@tarteelhouse.com` is fully operational.
4. Verify the existing `assets/images/tarteel-house-social-card.png` after publication.
5. Complete legal review and final pre-launch QA.

## Production evidence and limits
- No deployment or production form submission was performed during the audit.
- Read-only production fetches returned older assets: `consent.js` was 7,686 characters with no OpenAI/`oaiq` implementation; `analytics-events.js` was 4,372 characters with no `lead_created`. The live banner displayed “Accept analytics.” These fetched assets did not contain the local measurement changes.
- The public Apps Script endpoint reported missing `doGet` on GET, while local source includes it. This shows a version difference; it does not demonstrate that deployed POST submissions fail.
- Actual production sheet writes, email delivery, and the complete booking journey remain unverified.

## Warnings
- Do not redesign the site casually. Preserve current fonts, spacing, colors, layout language, and visual hierarchy.
- Do not replace the Google Apps Script backend unless explicitly requested.
- Do not reintroduce the old timezone field.
- Do not mark booking success without an authenticated saved-row receipt. Email notification status is separate from receipt.
- Existing Google Sheets may still have a legacy `timezone` column; the script will append `city_region` if missing rather than reorder old sheets.
- `apps-script/Code.gs` changes are not live until manually redeployed in Google Apps Script.
- Frontend commits are not live until they are published through Cloudflare Pages; production serves the repository root. Do not infer deployment from local Git history or the legacy `CNAME` file.
- The homepage references the existing `assets/images/tarteel-house-social-card.png`; the former missing-image task is obsolete.
- Legal pages still need founder/legal confirmation.

## How to resume
Start with `docs/START-HERE.md`, then read:
1. `docs/current-status.md`
2. `docs/next-tasks.md`
3. `docs/decisions.md`
4. `docs/brand-rules.md`

After any significant work, update these docs again.
