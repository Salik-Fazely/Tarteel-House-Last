# Current Status

## Overall state
The static website, Blog, consent banner, booking form, and Apps Script source are present in the repository. The owner confirms that production is hosted on Cloudflare Pages from the repository root at `www.tarteelhouse.com`. The latest local commits are not assumed to be published, and deployed Apps Script confirmation and live end-to-end booking verification remain open.

The [conversion sprint report](../ASTRA_CONVERSION_SPRINT_REPORT.md) records the 5–6 September 2026 audit, local changes, verification evidence, and remaining owner decisions. Public contact expectations now say families are normally contacted within two days of their request; the blog distinguishes teacher review from authorship and uses the confirmed teacher-name spelling. No deployments or production form submissions were made during the audit.

## Completed pages
- `/`: homepage with hero, trust stats band, how-it-works preview, teacher preview, why-us section, pricing preview, student/family videos, final CTA, and footer.
- `/book-trial`: booking form with required WhatsApp, country dropdown, City / Region, chip-based preferences, consent, and success redirect field.
- `/success`: booking confirmation page with WhatsApp-first follow-up copy and WhatsApp CTA.
- `/pricing`: pricing packages and FAQ.
- `/how-it-works`: full process page.
- `/teachers`: teacher page with four real teacher profiles and language filter.
- `/about`: about page.
- `/blog`: Blog index plus five article pages.
- `/privacy-policy` and `/terms`: legal pages with current business identity, but still requiring founder/legal review.
- Complete public pages load the shared consent module and provide persistent cookie settings.

## Core files
- `assets/css/styles.css`: global brand tokens, typography, layout, components, responsive styles, and motion rules.
- `assets/js/main.js`: mobile nav, active nav link, scroll reveals, page transitions, stats count-up, and shared progressive enhancement.
- `assets/js/consent.js`: measurement consent, preference storage, and persistent cookie settings; revoking measurement does not reload the page.
- `assets/js/analytics-events.js`: consent-gated funnel events and successful-request conversion handling.
- `/book-trial`: inline form validation, stable request ID, hidden-iframe submission, and authenticated response handling.
- `apps-script/Code.gs`: canonical Google Apps Script booking backend.
- `apps-script/README.md`: backend deployment and sheet documentation.

## Repository booking flow
Local browser and VM harness verification covers the flow below. It does not verify the deployed Apps Script, production sheet writes, or email delivery.

1. The parent-facing form is available at `/book-trial`.
2. The form posts to the Google Apps Script Web App through a named hidden iframe, retaining the first-party page until an authenticated `postMessage` response arrives.
3. The backend validates the request and uses a stable request ID to avoid duplicate Google Sheets rows on retry. Notification status is tracked separately.
4. A saved booking row establishes receipt; a notification failure does not turn that saved request into a failed booking.
5. An authenticated receipt permits navigation to the first-party `/success` page. A prepared submission marker, receipt marker, and measurement consent are required before `lead_created` can be sent.
6. Validation or save failures retain a recoverable form state. Revoking measurement does not reload the page or discard an unfinished request.

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

## Verification status
- Automated Python and JavaScript tests cover the current static site.
- Local browser and VM harness checks verified the iframe response, first-party success navigation, and conversion prerequisites.
- Local verification does not prove that the latest commits or Apps Script source are deployed.
- Read-only production inspection found older tracking assets: `consent.js` had 7,686 characters and no OpenAI/`oaiq` implementation; `analytics-events.js` had 4,372 characters and no `lead_created`. The live banner still said “Accept analytics.” The local measurement changes were absent from those fetched assets.
- A read-only GET to the public Apps Script endpoint reported a missing `doGet`, which exists in the local source. This establishes a version difference, not a failure of the deployed POST booking flow.

## What remains
- Review the sprint report for local booking changes and remaining production checks.
- Coordinate an authorized release: deploy the matching Apps Script version first, then publish the frontend through Cloudflare Pages. Afterward, run an authorized real booking check for the sheet row, notification email, receipt, and success navigation.
- Verify the existing Open Graph image `assets/images/tarteel-house-social-card.png` after publication.
- Final legal review of privacy policy and terms.
- Verify `hello@tarteelhouse.com` inbox and deliverability.
- After the coordinated release, test the live domain, SSL, and measurement assets. No release has been performed in this audit.
