# Tarteel House — Astra conversion sprint

Audit and verification: 5–6 September 2026. Starting and finishing HEAD: `a1eb76c9f25a589ba8367d0af0fb069df055bde0`. Changes are an uncommitted working diff.

## 1. Executive verdict: GO WITH FIXES

**The repaired local experience is ready for release review. Production conversion measurement is not yet verified and must not be represented as working.**

A parent can understand the one-to-one children's service, find languages and prices, inspect teachers, and reach the trial form on desktop and mobile. The site already has a coherent visual identity and useful parent-facing explanations. The most consequential defects were in the booking acknowledgment, retry, and measurement boundary, rather than the design.

The fixes below are implemented and tested. All **69 JavaScript tests and 119 Python tests pass**. Browser tests exercised successful and failed synthetic bookings, consent choices, duplicate callbacks, navigation, and unavailable measurement libraries.

Read-only production inspection found older JavaScript without the local OpenAI conversion implementation. The public Apps Script also differs from the repository version. An authorized coordinated backend/frontend release and a real deployment check remain necessary. No production booking, email, push, commit, or deployment was performed in this sprint.

There is no evidence-based conversion-rate percentage to attach to this review: these were functional parent journeys, not an experiment with real families or traffic.

## 2. Architecture and investigation

- Static HTML directory routes, ten legacy HTML redirects, three shared layout partials, shared CSS, and three shared browser scripts. There is no application framework or package/build workflow to migrate.
- Production source of truth: **Cloudflare Pages serving the repository root**, repository `Salik-Fazely/Tarteel-House-Last`, branch `main`. Legacy hosting notes and `CNAME` do not establish the current deployment.
- `scripts/sync_shared_layout.py` maintains header/footer sections across 16 complete public pages. The repository contains 26 public HTML documents including redirects, plus three partials.
- `assets/js/main.js` progressively enhances navigation, disclosures, videos, reveals, and responsive behavior. Fonts and video previews use external resources; video activation uses YouTube's privacy-enhanced embed.
- `/book-trial/` submits to an independently deployed Google Apps Script web app. The backend validates, persists a Sheets row, and sends a staff notification through MailApp. A request is followed up by a person; it does not reserve an appointment immediately.
- Consent controls GA4 and OpenAI measurement. GA4 retains the existing CTA, form-start, and valid-submit-attempt events. OpenAI `lead_created` represents an acknowledged trial request.
- Investigation included repository inventory, project/brand/commercial documentation, history and the recent tracking commit, shared components, scripts/CSS, all public content categories, backend code, privacy/terms, and existing tests. Independent agents reviewed product consistency and booking/consent code; the coordinator reconciled and browser-tested the result.

Authoritative business reference: [commercial facts](docs/commercial-facts.md). Ages, teaching languages, 40-minute lessons, prices, package validity, make-up rules, progress reviews, and certificate conditions were checked against it.

## 3. Parent journeys actually tested

Browser sizes were verified through rendered viewport dimensions: **1440×900 desktop**, **390×844 mobile**, and an intermediate **768×900** state. Screenshots were visually inspected during the run, including home, trial, teacher filtering, pricing, a parent article, success, and recoverable failure states.

| Journey | Executed checks and result |
|---|---|
| Homepage → trial | Read the service, age group and languages; followed header/primary trial navigation. Correct destination on desktop and mobile. Header CTA remains available above the fold. |
| Homepage → teachers → trial | Followed “Meet our teachers”; read matching and parent-managed communication information; filtered Arabic to Sadiah Hamid; followed trial CTA. Passed before/after changes. |
| Pricing → trial | Read package prices, duration, validity and make-up distinction; opened the free-trial FAQ; followed a package CTA. Passed. |
| Mobile navigation → teachers → trial | Menu opens, exposes links, focuses the first link, and closes on navigation. Reached the revised trial form without horizontal page overflow. |
| Service and trust information | Followed “How it works”; inspected the process, 40-minute trial and parent involvement. Followed footer privacy/terms routes and inspected their mobile rendering. |
| Parent guide entry | Opened the blog through navigation and the first-trial checklist; inspected mobile article rendering and booking information. Intermediate-width navigation also fit. |
| Advertising-style entry | Opened `/book-trial/` directly. The revised offer now states free, 40 minutes, one-to-one, ages 5–16, and the normal WhatsApp follow-up expectation. |
| Manual mobile form | Entered synthetic parent/child information through actual text fields, selects, radio labels, scheduling choices and the privacy checkbox. Native radio keyboard behavior worked. |
| Validation | Empty submission focused the child-name field; invalid email did not submit or create a conversion. Required-day behavior is additionally covered by behavioral tests. |
| Success/failure/retry | Used real repository backend code with fake Sheets/Mail services and nested browser frames. Verified receipt, failure message, preserved input, retry, timeout, repeated callbacks and conversion counts. |
| Consent/measurement | Tested initial undecided state, grant, denial, withdrawal with an unfinished form, late grant after receipt, absent Pixel, throwing Pixel/GA, and missing measurement files on the booking page. |
| Public production read-only | Loaded production home and booking page; inspected the form action, shared assets and banner. Fetched tracking scripts and opened the Apps Script endpoint with GET only. No production POST. |

No overflow was observed on the tested main journeys: the mobile document width remained within the viewport. Wide pricing/privacy tables scroll inside their own containers.

## 4. Prioritized findings and disposition

No P0 production outage or severe data disclosure was established. The following P1/P2 issues were supported by code, tests or observed behavior.

| Priority | Finding and evidence | Disposition |
|---|---|---|
| P1 | The original backend used automatic location replacement inside HtmlService. A local sandbox reproduction displayed the success website inside the response frame, with a fresh consent context. This can lose the first-party conversion context and confuse parents. | Replaced with an authenticated outcome message to the retained first-party page; native fallback has explicit continuation links. |
| P1 | Preparing a matching success token at submission did not prove a saved booking. The prior success guard lacked a separate acknowledged-receipt marker. | Added a receipt marker written only after the form authenticates success; regression test rejects an unacknowledged matching success URL. |
| P1 | Saving a row and then failing to send email returned a booking failure, encouraging duplicate submissions. There was no stable request-ID deduplication. | Added locked lookup/write by request ID, separate notification status and safe retry. Saved records remain successful even when staff email needs attention. |
| P1 | Revoking analytics reloaded the page, risking loss of an unfinished booking. A throwing GA implementation could also interrupt consent handling. | Withdrawal disables collection without reload; analytics exceptions are isolated. Browser confirmed entered names remain present after withdrawal. |
| P1 | Untrusted form strings were passed directly to Sheets, allowing formula interpretation. | Formula-leading values are stored as literal text, including international phone prefixes. Targeted tests cover this without performing offensive testing. |
| P1 | The fetched production consent script had no OpenAI implementation and the analytics script had no `lead_created`; the banner still said “Accept analytics.” | Documented release gap. Local code changes do not repair the currently published assets. No unauthorized deployment. |
| P2 | Direct trial visitors had less offer/context information; notes invited unnecessary sensitive information; parent/child autocomplete identities were not separated. | Clarified the authoritative trial offer, normal follow-up, service use of details, practical optional notes and autocomplete sections. No fields or business rules removed. |
| P2 | Success copy made an unqualified two-day promise; a guide attached that deadline to post-trial follow-up. This contradicted the qualified initial-request expectation. | Qualified the initial-request timing with “normally” and removed the unsupported post-trial deadline. |
| P2 | Blog “Teacher-written” attribution differed from article teacher-review attribution; a teacher's name had inconsistent spelling. | Aligned attribution and Foruhar Rahmani's spelling with existing authoritative content. |
| P2 | Pricing and privacy tables overflowed their containers on mobile but were not keyboard-focusable. Pricing row labels were ordinary cells. | Added named focusable scroll regions; pricing uses row headers and an accessible first-column heading. ArrowRight visibly scrolled both tables by 40 pixels. |
| P2 | Handoff documents named obsolete hosting and a supposedly missing social image that exists. | Corrected Cloudflare/root hosting and current social-image notes; recorded deployment limits. |
| P2 | On Windows, the layout test copied Hidden metadata and then failed when deliberately rewriting its fixture. | Changed fixture copying to content-only. Reproduction preserved identical bytes; all original assertions remain. |

Google documents the relevant [HtmlService iframe restrictions](https://developers.google.com/apps-script/guides/html/restrictions). The local reproduction supports the architectural finding; it does not prove that a real deployed POST failed.

## 5. Implemented booking and measurement behavior

1. Native field validation runs before submission. The enhanced form keeps the parent on the website and posts into a named hidden iframe.
2. A stable random submission ID identifies the current request. A fresh random response token identifies each attempt. Neither contains form details.
3. Apps Script validates required and allowed values, takes a script lock, and writes only when the submission ID is new. Missing columns append to the existing sheet; existing columns and records are not reordered.
4. A persisted row establishes receipt. Staff notification status is tracked separately as `Pending`, `Sent` or `Failed`.
5. The response sends only type, opaque IDs, outcome and fixed error text to the validated website origin. The form requires the expected Google origin, active pending request and both matching IDs. A repeated or stale callback cannot settle the request again.
6. Only authenticated success records `tarteelhouse.trialReceivedToken` and navigates the main page to `/success/`. Measurement requires the URL token, prepared token and receipt token to match.
7. Consent must also be granted. Markers are consumed before the measurement call and the URL is cleaned. Denial consumes without conversion; an undecided parent can grant later on the success page.
8. After 30 seconds without a valid response, the form reports uncertainty, retains entries and permits retry with the same submission ID and a new response token.

Operational limits are explicit in [Apps Script README](apps-script/README.md): a reload/new form creates a new request ID; no-JavaScript submissions cannot deduplicate; Sheets and email do not share a transaction. Failed notifications require staff review, and no scheduled email retry was introduced. A repeated request with the same ID retries an unsent notification. If sending succeeds but recording its status fails, a later retry may send another notification while retaining one booking row.

## 6. Analytics / OpenAI Ads verdict

**Trustworthy for the tested local acknowledged-request path, subject to consent and browser availability. Live Ads ingestion and attribution remain unverified.**

| Scenario | Observed local result |
|---|---|
| Initial consent undecided | OpenAI consent false before init; no GA initialization or conversion. |
| Valid saved request, consent granted | Main window reached clean `/success/`; exactly one `lead_created` call with `{type: 'customer_action'}`. |
| Empty or invalid form | No submission/conversion; native validation handled the field. |
| Sheet failure | No conversion; readable retry state retained the form. |
| Failed save → successful retry | One conversion after the successful receipt. |
| Email failure after row saved | Successful receipt and one conversion; fake Sheet status `Failed`, no successful mail count. |
| Repeated success callbacks | One conversion. |
| Refresh, back, forward | Conversion count remained one; back restored an enabled form. |
| Incorrect response token or origin | No conversion; timeout showed an uncertain outcome. |
| Retry after saved row / lost acknowledgment | No additional row or successful notification. In the uninterrupted local sequence, requests increased to 7 while rows remained 5 and successful mails remained 4. |
| Consent denied | Successful booking; zero GA events and zero OpenAI conversion calls; marker consumed. |
| Consent granted only on success | Zero beforehand, exactly one afterward, URL cleaned. |
| Pixel unavailable | Booking succeeded. A consented event could remain in the SDK queue; no delivery was claimed. |
| Pixel or GA function throws | Booking succeeded; no uncaught error captured by the local recorder. A recorded attempt is not proof of vendor receipt. |
| Both measurement files absent on booking page | Only `main.js` loaded there; successful booking still reached next steps, with no conversion. |
| Storage getter/write/removal failures | Unit tests prove conservative measurement suppression without interrupting submission/success. |

Existing GA event names remain `trial_cta_click`, `trial_form_start` and `trial_form_submit_attempt`. Their parameters contain page/form identifiers and bounded CTA text, not names, contact information or notes. Submit attempts are not counted as successful leads. The OpenAI event contains no form values, user hashes, value/revenue claim or child information added by this implementation. No CAPI secret or server-side measurement transmission was added.

The choice of `lead_created` follows the documented [supported event meaning](https://developers.openai.com/ads/supported-events): this is a contact request, not a scheduled or attended lesson. Consent ordering follows the [Measurement Pixel documentation](https://developers.openai.com/ads/measurement-pixel).

This is browser-side measurement, not a fraud-proof financial ledger. Intentional developer-tools manipulation, cross-device resubmission and vendor delivery loss are outside its deduplication guarantee. Sheets is the operational source of received bookings.

## 7. Privacy and consent verdict

Implementation and public explanation are aligned for the changes made. Optional measurement is separate from required permission to contact the parent about the request. Withdrawal preserves form input, disables GA collection and tells OpenAI to stop future measurement. Legacy analytics-only acceptance is not reused for the expanded measurement purpose; prior rejection remains respected.

The OpenAI SDK still downloads before a choice, with measurement disabled before initialization. **This is not a claim that no third-party network request occurs before consent.** The existing policy describes that arrangement; it was not silently weakened or expanded. Google fonts and video preview resources are also external dependencies.

The policy now explains the receipt marker, request/response IDs and storage-unavailable behavior. Optional notes discourage medical or other sensitive details. No real family data was used in testing. Legal sufficiency, provider contracts and actual retention practices cannot be certified by this code audit.

## 8. Mobile and accessibility verdict

The tested mobile parent journeys pass. Brand, layout, type and architecture were preserved. Sticky navigation and trial CTA fit at 390 pixels; the form, teacher filter and success/failure states were usable. Intermediate navigation at 768 pixels fit. No tested page developed horizontal viewport overflow.

Keyboard navigation, radio behavior, required-field focus, menu focus/expanded state, disclosure state, field labels, status announcements and named controls were inspected or behaviorally tested. Focusable table regions now support horizontal keyboard scrolling. Static scanning found no duplicate IDs, missing image alt attributes or broken label/ARIA references.

This is not a WCAG certification or a complete device matrix. Physical iOS/Android keyboards, VoiceOver/TalkBack, Safari/Firefox, remote video playback and field performance under real mobile networks were not comprehensively tested. No Lighthouse score or real-user performance metric is claimed.

## 9. Business facts and decisions for Salik

No unresolved contradiction was found in the canonical ages, languages, trial/paid lesson length, package prices/validity, make-up rules, progress review or certificate requirements. Pricing and safeguarding rules were preserved.

| Existing wording / evidence | Decision still needed |
|---|---|
| Teachers hero describes a group of female teachers; its FAQ says “Most of our teachers are women.” | Confirm the intended roster wording. No teacher gender or availability was inferred from names or images. |
| Teachers page promises voice introductions and says some teachers prefer voice; the current cards present four lesson-sample videos. | Confirm whether separate voice introductions exist and what the introduction wording should promise. |
| Teachers FAQ says each teaching background is verified. | Confirm that the stated verification process reflects actual records and operations. No qualification claims were invented or removed. |
| Privacy policy states enquiry retention of up to 6–12 months, relationship records up to six years where needed, and provider/international-transfer safeguards. | Confirm these against actual practice and legal advice. These are operational verification needs, not a proven code contradiction or a recommendation to change the periods. |
| Published frontend/backend differ from local source. | Authorize a coordinated release when ready; agree who checks the Sheet and failed notifications afterward. |

The unqualified two-day and post-trial timing contradictions were resolved using the explicit commercial source, so they do not require a new policy decision.

## 10. What was deliberately not changed

- Prices, package rules, cancellation/rescheduling terms, teacher facts, qualifications, safeguarding rules, testimonials, statistics, certificates, religious quotations and substantive legal rules. Technical privacy disclosures were updated as described above.
- Brand, homepage composition, framework choice and static root architecture. The homepage hero's primary body CTA is below the initial fold, but its persistent header CTA works; no speculative redesign was justified.
- External analytics account settings, production configuration, Google Sheets, inboxes or deployed Apps Script. Read-only evidence cannot establish their complete operational state.
- Additional tracking events, user matching or CAPI. The observed product has a verified request boundary, not verified lesson-attendance or payment boundaries.
- The pre-existing untracked image `assets/images/tarteel-house-maryam-live-lesson-ad.png`. It remains untouched and untracked. No user work was stashed, reset, cleaned, staged or committed.

## 11. Verification evidence

| Verification | Executed result |
|---|---|
| Full JavaScript suite | **69 passed, 0 failed, 0 skipped** using bundled Node and `--test-isolation=none`. |
| Full Python suite | **119 passed, 0 failures/errors** using Python 3.13 and normal Windows temporary-directory permissions. |
| Shared layout check | **16 pages synchronized**. |
| JavaScript syntax | Shared `main.js`, `consent.js`, `analytics-events.js` and local `qa_server.js` passed `node --check`. Earlier audit also parsed 12 inline script blocks; final booking behavior tests execute the changed inline script. |
| Static reference scan | **29 HTML files including 3 partials**, 648 href/src references, 566 internal references, 54 fragment references, 53 image elements; **0 issues** for checked targets, fragments, IDs, alt attributes and label/ARIA references. Public-document count is 26. |
| Local HTTP | `/`, `/book-trial/`, `/teachers/`, `/pricing/`, `/how-it-works/`, `/about/`, `/blog/`, `/privacy-policy/`, `/terms/`, `/success/`: **200**. |
| Browser | Journeys and failure matrix above; desktop/mobile/intermediate rendered states inspected. Final local journey console check returned no error/warning entries. |
| Diff whitespace | `git diff --check` passed. Git emitted line-ending normalization notices, not whitespace errors. |
| Independent review | Booking/backend/consent review found no remaining proven P0/P1 within its scope. Live services explicitly excluded. |

Commands executed from the repository root:

```powershell
$sprintJsTests = Get-ChildItem -Force tests -Filter '*_test.js' | ForEach-Object FullName
& 'C:\Users\Salik_F\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none $sprintJsTests
$env:PYTHONDONTWRITEBYTECODE='1'
python -m unittest discover -s tests -p '*_test.py'
python scripts/sync_shared_layout.py --check
node --check assets/js/main.js
node --check assets/js/consent.js
node --check assets/js/analytics-events.js
node --check scripts/qa_server.js
git diff --check
python -m http.server 8765 --bind 127.0.0.1
node scripts/qa_server.js
```

The reference scan used Python `HTMLParser`, local path/fragment resolution, ID counts, image attributes, and label/ARIA references; HTTP checks used `urllib.request.urlopen`. These were executed checks, not a claim of full HTML-spec validation.

Earlier failures and their resolution: the sandbox prevented Node test-worker processes, so the bundled Node's supported no-isolation runner was used. Windows temporary-directory permissions required running the Python suite outside the sandbox. A separate copied-Hidden-attribute failure was reproduced and fixed in the fixture. Leftover copied HTML in sprint temporary directories briefly inflated public-page counts; removing only those sprint artifacts restored the expected inventory. No test assertion was relaxed, skipped or deleted. **No unresolved automated-test failure remains.**

One baseline browser-tool injection reported a MutationObserver error without a site source URL; it was not reproduced in final site checks or attributed to application code. Local fixture setup failures were corrected before the recorded final matrix.

### Repeat safe browser testing

Run `node scripts/qa_server.js`, then open `http://127.0.0.1:8766/__qa/`. It binds loopback ports 8766/8767, substitutes measurement libraries with local recorders, rewrites the booking action to a local endpoint, and runs repository `Code.gs` in a VM with in-memory Sheets/Mail services. Nested frames use separate loopback origins; only the served test page substitutes the trusted response origin. Production source trust checks are unchanged.

Use only the synthetic `qa.parent@example.invalid` address. The expandable QA panel can fill synthetic values, switch response outcomes and show event evidence. `/__qa/stats` exposes aggregate fake counts/statuses. Restarting the server clears its fake rows. `--baseline` swaps only the backend to the starting commit; with the repaired frontend it is useful for observing an old backend without the new acknowledgment protocol.

The harness blocks external form/measurement destinations through local replacements and its response CSP. It does not verify Google's deployed iframe origin, CSP, permissions, quotas, mail delivery or actual Ads ingestion. Its recorder proves calls and ordering, not vendor acceptance.

## 12. Changed files

**28 existing files modified; 2 sprint files added.** The unrelated image is excluded.

| Area | Files |
|---|---|
| Booking/backend | `book-trial/index.html`, `apps-script/Code.gs`, `apps-script/README.md` |
| Measurement/privacy | `assets/js/analytics-events.js`, `assets/js/consent.js`, `privacy-policy/index.html` |
| Accessibility/styles | `pricing/index.html`, `assets/css/styles.css` |
| Parent copy | `success/index.html`, `blog/index.html`, `blog/free-online-quran-trial-lesson-parent-checklist/index.html`, `blog/how-parents-can-track-their-childs-quran-progress/index.html` |
| Handoff documentation | `docs/START-HERE.md`, `docs/current-status.md`, `docs/decisions.md`, `docs/next-tasks.md`, `docs/project-brief.md`, `docs/session-handoff.md` |
| JavaScript tests | `tests/analytics_events_test.js`, `tests/apps_script_booking_test.js`, `tests/booking_accessibility_test.js`, `tests/consent_test.js` |
| Python tests | `tests/accessibility_static_test.py`, `tests/commercial_drift_test.py`, `tests/privacy_policy_alignment_test.py`, `tests/quran_progress_article_test.py`, `tests/shared_layout_sync_test.py`, `tests/trial_lesson_article_test.py` |
| Added | `scripts/qa_server.js`, `ASTRA_CONVERSION_SPRINT_REPORT.md` |

## 13. Remaining recommendations, ranked by impact

1. **Release and verify the paired implementation.** Deploy the matching Apps Script version before the frontend; the old backend cannot acknowledge the new form. After explicit authorization, verify one identifiable synthetic production request, exactly one Sheet row, notification status/inbox receipt, main-window success, consent and Ads event receipt. Do not optimize advertising using unverified conversion totals.
2. **Make failed-notification review part of normal booking operations.** Saved leads remain available in Sheets even when email fails. Confirm who reviews `Pending`/`Failed` and the Apps Script execution log; a recurring retry service would be separate work.
3. **Resolve the specific teacher/voice-introduction and privacy-operational confirmations above.** They affect parental trust and should be backed by actual practice, not stronger marketing copy.
4. **Run a small physical-device check after release.** Prioritize iPhone Safari, Android keyboard/form autofill, screen-reader announcement of errors, and actual remote lesson-sample playback. Local Chromium and mocks do not cover those dependencies.

No push, commit, deployment, external publication or real customer submission was made. Production remains unchanged by this sprint.

## 14. Release preparation — 7 September 2026

The completed sprint above remains the audit baseline. A separate release request authorizes a local commit and requires explicit approval before backend deployment, frontend push, and one synthetic production booking, in that order.

Focused release reviews found no new booking, backend, consent or conversion code blocker. Fresh verification before integration passed 69 JavaScript tests and 119 Python tests; shared-layout synchronization passed for 16 pages, 11 JavaScript/Apps Script files and 12 inline scripts parsed, and `git diff --check` passed. The initial syntax-check wrapper could not spawn Git inside the sandbox; passing Git's file list from PowerShell resolved that runner limitation without changing source.

Safe local browser checks repeated native required-field validation, successful acknowledgment, refresh deduplication, Sheet failure and retry with repeated callbacks, denied consent, consent granted after success, failed notification, blocked Pixel, throwing Pixel/GA, and missing booking-page measurement files. Success produced one recorder call when consent permitted; validation/failure/denial produced none. The blocked Pixel queued one call without proving delivery. Missing measurement files still allowed booking and produced no conversion. A complete booking also passed at a verified 390×844 viewport with no document overflow. No application console error was captured in the analytics-failure checks. All requests used in-memory Sheet/Mail services and synthetic data.

Remote `main` was read and fetched at `6a6a27fc14aebec662506a1bc28c31c75e02700c`, containing two published blog guides absent from the sprint baseline. These must be preserved when the unpublished local commits are reconciled. The browser Apps Script session is signed out; Drive discovery found a spreadsheet named **Bookings**, with a **Bookings** tab, but its binding to the production deployment still requires authenticated verification. No external write, production booking, push or deployment has been authorized or performed during release preparation.

Integration is now complete: the requested sprint commit and the unpublished tracking commit were rebased onto that remote revision without stashing, discarding work, or force-pushing. The single conflict was the blog introduction; the published wording, “Teacher-reviewed guidance for parents…”, was preserved. Both new articles, all six associated images, card ordering, sitemap and 18-page test inventories remain intact. The new articles' existing `Forouhar` spelling was preserved; the earlier correction in this report applies to the sprint's progress article, not those separately published guides.

**Final integrated verification: 69 JavaScript tests and 134 Python tests passed; 18 shared layouts synchronized; 11 JavaScript/Apps Script files and 12 inline scripts parsed; both `git diff --check` and `git diff origin/main --check` passed.** The booking, backend, consent and analytics files are byte-identical in Git to the pre-rebase browser-tested commit. A fresh post-rebase local success check produced one conversion recorder call and zero captured console errors. The first attempted mobile override targeted another browser tab; the recorded mobile result above was subsequently repeated at an observed `innerWidth=390`, `innerHeight=844` and document width 375.

The final sprint commit contains 29 files: 27 modified files and the two added sprint files. `blog/index.html` needs no remaining local change because remote already supplied the reviewed-author attribution. The earlier 30-file inventory records the original completed sprint. The unrelated untracked ad image remains excluded and its SHA-256 is `1A90CC3F8DF9A409A8A4A7BAB181D020EDCF4DB99A0E1561FD2101A7C70FB97E`.

The target is the existing deployment `AKfycbxdUb5dS1GDdlbJpjiFmBEW_aagYUlyYUhkEU068pkSYIrT24sw-RlGDmDTZJZ8X87DAA`, copied from the booking form's actual action, using the repository's `apps-script/Code.gs`, `Bookings` tab and notification address `hello@tarteelhouse.com`. The discovered candidate spreadsheet is `1nPVRBWWe1mZ0MTYedQ5M17h3ahCjTuVXJ_cFh8sqWTk`; its project/deployment relationship has not yet been proven. Do not deploy to it merely from its name. Confirm the deployment ID, bound spreadsheet, current version and execute/access settings before updating the existing deployment. Actual Google callback origin, live backend compatibility, Cloudflare deployment, synthetic Sheet/email receipt, SDK delivery, Ads platform receipt and attribution remain unverified. No synthetic production booking may precede its separate approval gate.

The owner's follow-up, “Verified, push all”, authorizes proceeding with the committed release, while preserving the required backend-before-frontend order and the unrelated untracked image. A pre-push check found that the deployment ID had been transcribed incorrectly in this release note and the earlier approval link (the segment `lyYU` was omitted). This documentation error is corrected above; the actual form endpoint was already correct and was not modified. The connected Google browser still shows a sign-in form, so authenticated deployment inspection remains unavailable. A new read-only check uses the endpoint extracted directly from the HTML.

That exact-endpoint GET returned HTTP 200 containing Google's error **“Función de script no encontrada: doGet”** (“Script function not found: doGet”). The prepared source defines `doGet()` at line 194 and returns “Tarteel House booking endpoint.” Therefore the matching prepared backend is not live at the current form endpoint. This is evidence of a version mismatch, not a test of the old POST handler. The frontend push is authorized but held until the compatible backend is deployed and verified. The browser still requires Google sign-in, and no authenticated Apps Script CLI is installed/configured. No POST, Sheet write, notification, conversion, frontend push or deployment occurred. Current release status is recorded in `ASTRA_PRODUCTION_RELEASE_REPORT.md`.


### Authenticated release continuation — final backend correction

The earlier signed-out blocker is resolved. The owner supplied the actual Bookings Sheet `1xLqKF1DGBGdknlGbTyulDxDYgiVm6vh0MkkXSaJ90Kc`; its Extensions menu opened bound project `1vFEYavcMW7aOIVaXDutgX9SIk0hHlP5WfCo-5IrX975QY2odOxj6nUZS`. The existing deployment ID exactly matches the form; version 6 executes as hello@tarteelhouse.com with Anyone web-app access. That version is the rollback point. The earlier Drive candidate was not used.

The Sheet was publicly viewable. With the owner's explicit approval it was changed to Restricted, and read-back shows Private to only me. Owner access is preserved; public web-app invocation remains a separate setting. No production booking, mail or Sheet data write was performed.

A genuine final release blocker was found in the prepared source: bound active-spreadsheet methods are unavailable in Apps Script web-app executions. Code.gs now opens the exact verified workbook with openById and fails closed when the ID/access is unavailable. Four targeted regressions cover absent active context, missing ID, access failure and preservation of the actual 15-column live schema. Seven new operational fields append without reordering existing headers or records. Only live headers were inspected. The local harness explicitly mocks that same ID; it never opens the real spreadsheet.

Fresh verification after this correction: **73 JavaScript tests, 134 Python tests, 18 shared layouts, 11 JS/GS files and 12 inline scripts all pass; git diff --check passes**. The initial Python sandbox permission issue resolved through the authorized full rerun. Fresh browser QA on port 8786 confirms invalid input/no conversion, successful receipt/one conversion, refresh deduplication, failed-save/no conversion, retained entries/retry with duplicate callbacks, and successful denied-consent booking with a blocked Pixel. Four fake requests yielded three fake rows and three fake Sent notifications. No real external booking or measurement occurred.

The updated draft was saved in the verified Apps Script editor and copied back after reload; its complete normalized source matches reviewed Code.gs. The production form's existing city_region/contact consent fields and unchanged endpoint were rechecked read-only. Deployment, frontend publication and production booking evidence are still pending at this checkpoint. See ASTRA_PRODUCTION_RELEASE_REPORT.md for the latest release-stage results; earlier no-commit/no-deployment statements above describe their historical audit checkpoints.


### Backend deployment and frontend push

Apps Script version 7 is now deployed to the verified existing endpoint, preserving version 6 for rollback and existing execution/access settings. The live GET returns the expected health text. A deliberately incomplete protocol probe with only two synthetic UUIDs and the public redirect URL returned the expected validation-error acknowledgment before any Sheet/mail operation. Google's generated sandbox host matches the frontend origin allowlist. This is not a valid production booking or proof of successful browser delivery.

The single sprint commit is now `7d7e7b482e18cc37a685bf15f32f9074e2c9b21d` (30 files including the added production report). It and the preserved tracking commit were pushed normally to main after backend verification, using the owner's approval. Cloudflare/public artifact verification is in progress. No valid synthetic booking has been submitted; the separate test gate remains pending. The unrelated image remains untouched and excluded. Post-push report updates are local documentation changes, without rewriting published history.


### Production cache defect found during release verification

All 13 checked public Cloudflare artifacts match the published sprint content (11 byte-exact; privacy/terms after observed email obfuscation). However, the existing browser reproduced new booking HTML with old consent UI because changed scripts use unversioned URLs and four-hour browser caching. This P1 release blocker can suppress conversion measurement for returning visitors. A minimal versioned-asset URL correction and regression coverage are being prepared; no backend/business changes are needed. The already-published commit will not be rewritten. Detailed evidence and the eventual follow-up revision are in the production release report.


### Cache correction ready for publication

The fix versions only styles.css, consent.js and analytics-events.js as `?v=20260907-1` on all 18 public pages. An exact diff comparison verifies no other HTML content changed. main.js and all backend/source logic remain unchanged. The new asset_versioning regression failed on the old URLs before the correction and now passes; eight existing static assertions were aligned with the valid versioned URLs.

Final executed verification after this correction: **73 JavaScript tests, 135 Python tests, 18 shared layouts, 11 JS/GS files and 12 inline scripts pass; git diff --check passes**. A fresh local browser booking loaded the versioned URLs, reached the receipt page, consumed its pending marker and recorded exactly one lead_created. It used in-memory Sheets/Mail and local SDK recorders. No valid production booking has been submitted. The follow-up commit will publish only this confirmed release fix, tests and updated release evidence.
