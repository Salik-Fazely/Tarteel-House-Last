# Tarteel House production release

Status as of 7 September 2026: **BACKEND LIVE; FIRST FRONTEND RELEASE LIVE; RETURNING-BROWSER CACHE FIX IN PROGRESS**.

## Authorization and release state

The owner approved proceeding with “Verified, push all”. This authorizes the committed release while preserving backend-before-frontend order and excluding unrelated work. The separate approval for one synthetic production booking has not been given.

| Stage | Executed result |
|---|---|
| Local preparation | Published sprint commit `7d7e7b482e18cc37a685bf15f32f9074e2c9b21d`, **Harden trial booking and conversion flow**; 30 sprint files, with the earlier tracking commit preserved. |
| Remote integration | Both published blog guides preserved. Tracking commit `030d041`; remote main freshly verified at `6a6a27fc14aebec662506a1bc28c31c75e02700c`. |
| Backend draft | Saved to the verified existing bound project. Full source copied back after reload equals reviewed Code.gs after line-ending normalization. |
| Backend deployment | Completed: existing endpoint updated to version 7; Google UI reports Deployment successfully updated. Version 6 retained for rollback. |
| Frontend / Cloudflare | Normal main push succeeded, `6a6a27f..7d7e7b4`, only after live backend verification. Cloudflare serves all 13 checked artifacts matching the commit; returning-browser cache mismatch discovered and being corrected. |
| Synthetic booking / Sheet / notification | No valid production booking submitted, no booking row or notification created by this release. Separate approval required. |
| OpenAI Ads | No production browser conversion call, SDK/network delivery, platform receipt or attribution verified. |

## Verified production target

- Owner/execution identity: `hello@tarteelhouse.com`.
- Spreadsheet: **Bookings**, `1xLqKF1DGBGdknlGbTyulDxDYgiVm6vh0MkkXSaJ90Kc`, tab **Bookings**. Supplied by the owner and verified through the signed-in Sheet UI.
- Bound Apps Script project, opened through that Sheet's Extensions menu: `1vFEYavcMW7aOIVaXDutgX9SIk0hHlP5WfCo-5IrX975QY2odOxj6nUZS`, titled **Untitled project**.
- Existing deployment: `AKfycbxdUb5dS1GDdlbJpjiFmBEW_aagYUlyYUhkEU068pkSYIrT24sw-RlGDmDTZJZ8X87DAA`.
- Web app: `https://script.google.com/macros/s/AKfycbxdUb5dS1GDdlbJpjiFmBEW_aagYUlyYUhkEU068pkSYIrT24sw-RlGDmDTZJZ8X87DAA/exec`.
- Prior version 6, 23 April 2026 1:12 PM; new version 7, 7 September 2026 2:23 PM as displayed by Google; execute as **Me (hello@tarteelhouse.com)**, access **Anyone**. Preserve identity, endpoint and web-app access.

The endpoint was extracted directly from the booking form. Its pre-release GET returned HTTP 200 with Google's **“Función de script no encontrada: doGet”**, establishing that the prepared backend was not live. HTTP 200 alone was not accepted as a health pass. The earlier release note accidentally omitted `lyYU` from the deployment ID; documentation was corrected and no action used the incorrect ID. The earlier Drive candidate spreadsheet was not the actual production file and was not modified.

The existing public frontend was rechecked read-only: it uses the exact same endpoint and supplies `city_region` and contact consent. Publishing the new frontend before an acknowledgment-capable backend could produce apparent timeouts after saved requests, so backend verification remains mandatory.

## Privacy and final release blocker

The actual Bookings Sheet was publicly viewable by anyone with its link. After the owner's explicit approval to make it **Restricted**, that change was applied and read back as **Private to only me**, preserving the owner. The web app's separate **Anyone** invocation setting remains unchanged. A connector authenticated to a different account subsequently returned 403, as expected after public access was removed.

Final review found `getActiveSpreadsheet()` in the prepared web-app handler. Google documents bound active methods as unavailable in web-app execution. The handler now uses the explicitly verified spreadsheet ID with `openById`, fails closed when unconfigured or inaccessible, and has no active-workbook fallback. The local harness enforces the same explicit-ID lookup against an in-memory fake. See [Google bound script documentation](https://developers.google.com/apps-script/guides/bound#special_methods).

Only header range A1:Z1 was read from the live Sheet; no customer rows were inspected. The 15 existing nonempty headers are timestamp, child_name, child_age, quran_level, session_language, parent_name, country, email, whatsapp, preferred_days, preferred_time, timezone, notes, consent, source. Regression coverage verifies existing headers and records remain unchanged while seven missing fields append: city_region, status, assigned_teacher, follow_up_date, internal_notes, submission_id, notification_status. The legacy timezone column is preserved. No live header or row mutation has been run during preparation.

## Verification executed after the final source correction

- Full JavaScript: **73 passed**, zero failures/skips.
- Full Python: **134 passed**, zero failures. The initial sandbox run encountered a temporary-directory PermissionError; the authorized rerun passed completely.
- Shared layout: **18 pages synchronized**.
- Syntax: **10 JS files, Code.gs and 12 inline scripts parsed**, zero errors.
- `git diff --check`: passed; only normal LF/CRLF warnings.
- Final focused independent review found no remaining release-blocking defect in the changed backend binding or legacy schema compatibility.
- Fresh browser checks on loopback 8786: invalid empty form produces no pending conversion; accepted-consent successful save produces one lead_created call; refreshing retains one; Sheet failure preserves entries and produces zero conversions; retry with repeated callbacks succeeds once; denied consent with blocked analytics still books and produces no conversion. Fake counters: four requests, three rows, three mails, all three notification statuses Sent.
- Earlier integrated local matrix also passed late consent, failed notification, throwing Pixel/GA, missing measurement scripts and a 390×844 successful mobile booking, as recorded in the sprint report.

Commands: bundled Node `--test --test-isolation=none` over all `tests/*_test.js`; `python -m unittest discover -s tests -p '*_test.py'`; `python scripts/sync_shared_layout.py --check`; Node vm.Script parsing tracked JS/GS and executable inline scripts; `git diff --check`; `node scripts/qa_server.js` with TARTEEL_QA_PORT=8786; read-only `git ls-remote origin refs/heads/main` and HTTP GETs.

Local recorder calls do not establish Google's live iframe origin, deployed permissions/quotas, mail delivery, Ads ingestion or attribution. Those levels must be recorded separately after release.

## Remaining release sequence

1. Completed: backend deployed and compatible response verified.
2. Frontend push completed; finish Cloudflare/public artifact verification.
3. Present **PRODUCTION TEST READY — run one synthetic booking?**, with exact synthetic data and Sheet/email/measurement effects; wait for explicit approval.
4. After approval, execute exactly one booking and record each evidence level separately. Update both reports with actual results.

## Git and unrelated work

Backend version 7 is deployed and frontend main was pushed normally. Public frontend verification is in progress. Report updates after the source commit remain local documentation changes; published history is not amended. The original image `assets/images/tarteel-house-maryam-live-lesson-ad.png` remains untracked and untouched; SHA-256 `1A90CC3F8DF9A409A8A4A7BAB181D020EDCF4DB99A0E1561FD2101A7C70FB97E`. Nothing unrelated was modified.


## Executed backend production verification

The Google deployment UI confirmed **Deployment successfully updated**, **Version 7**, with exactly the original deployment ID and web-app URL. Source had been saved and fully compared after editor reload before creating this version. Execute identity and access settings were unchanged; no new OAuth grant was requested.

A fresh GET to the endpoint extracted from the form returned HTTP 200 containing **Tarteel House booking endpoint**, with no missing-doGet error.

One deliberately invalid POST contained only submission_id `77777777-7777-4777-8777-777777777777`, response_token `88888888-8888-4888-8888-888888888888`, and the public success redirect URL. No name, email, phone, child details or contact consent was sent. The response returned **Some booking details are missing** and the acknowledgment type `tarteelhouse:booking-result`, both exact tokens and status **error**. The reviewed handler returns on this validation branch before locking, opening Sheets or sending mail. This is a rejection/protocol probe, not a synthetic booking; no valid production booking has been submitted.

Google's actual response wrapper identifies sandboxHost `https://n-6iwfw4khc7bxjzoebry3b4j2f3acwfmemrswnai-0lu-script.googleusercontent.com`, matching the frontend's anchored trusted-origin expression. Its HTML includes window.top.postMessage with the error payload. This proves the deployed response format and generated wrapper origin; actual browser message delivery, saved Sheet row, mail and conversion delivery still require the separately approved synthetic test.

After these checks, `git push origin main` succeeded normally from remote `6a6a27f` to `7d7e7b4`. Pre-push status contained only the unrelated untracked image, all 73 JS/134 Python tests were passing, and `git diff origin/main --check` passed. No force push was used.


## Cloudflare artifact verification and returning-browser blocker

An independent read-only HTTP check found **13/13 targets HTTP 200, Server: cloudflare**, at the published sprint revision: homepage, how-it-works, pricing, teachers, about, blog, booking, success, privacy, terms, styles.css, consent.js and analytics-events.js. Eleven are byte-for-byte matches to Git; privacy and terms match exactly after reversing only the observed Cloudflare email-obfuscation substitutions and injected decoder script. No Cloudflare dashboard/build-log access is claimed; public production artifact evidence establishes the served release.

The actual existing browser reproduced a mixed-version problem: the booking DOM contains the new response_token and acknowledgment handler while the consent interface still says **Accept analytics / Reject analytics**, from the old script. No console error was captured. Public JS/CSS response headers are `Cache-Control: public, max-age=14400, must-revalidate` while HTML is max-age=0, and script/style URLs had no version. A still-fresh four-hour browser cache can therefore retain old scripts after deployment. This is a concrete conversion reliability blocker for returning visitors, not merely propagation delay.

The release is adding a small asset-URL version change for the changed consent/analytics/style files, consistently across public pages, with targeted regression and a complete verification rerun. Backend version 7 is unchanged. Because the source commit is already published, this correction will use a new normal follow-up commit rather than amend or force-push published history. The owner-authorized release scope includes genuine release-blocking fixes.


## Additional read-only production evidence

After the invalid protocol probe, the live Sheet was reopened as hello@tarteelhouse.com. Sharing still reads **Private to only me**. A1:Z1 still contains exactly the original 15 nonempty headers, with no new operational columns. No customer rows were inspected.

Ads connector baseline at **2026-09-07 12:30:03 UTC** identified account **Tarteel House** with website https://www.tarteelhouse.com/ and pixel **CyfMjLQ5sFcxkzzrRdDeDb**, named **Tarteel House Website Pixel**. The active **Free Trial Request** setting uses **lead_created** with that source, a 30-day attribution window and 0-day view-through window. Returned campaign associations are empty; that configuration field alone proves neither delivery nor attribution. Both inventories have has_more:false.

The latest-15-minute raw-event diagnostic returned an empty sample. This is not a claim of zero historical conversions. No Ads settings or events were changed. After the separately approved booking, raw-event diagnostics can be queried promptly to check platform receipt, with time correlation distinguished from unique booking identification. Browser invocation, network/SDK delivery, Ads receipt and attribution remain separate evidence levels.

## Proposed synthetic booking: awaiting separate approval

| Field | Proposed value |
|---|---|
| Parent | ASTRA QA 2026-09-07 |
| Child | QA Release Child (entirely fictional) |
| Age / level / language | 8 / complete beginner / English |
| Country / city | Spain / QA City |
| Email | astra.release.20260907@example.invalid |
| WhatsApp | +34000000000 (dummy, do not contact) |
| Availability | Monday / afternoon |
| Notes | INTERNAL SYNTHETIC RELEASE TEST - not a customer. Do not contact or schedule. |
| Contact/privacy consent | Checked for the synthetic request |
| Optional measurement | Accepted for this one measurement verification |

Expected external effects after approval: one identifiable booking row, appending the seven missing operational headers; one staff notification to hello@tarteelhouse.com; and a possible synthetic lead_created measurement sent to OpenAI Ads. No customer/child information is used and no real trial should be scheduled. A direct synthetic visit is not proof of ad attribution. The test has not been submitted.


### Cache correction ready for publication

The fix versions only styles.css, consent.js and analytics-events.js as `?v=20260907-1` on all 18 public pages. An exact diff comparison verifies no other HTML content changed. main.js and all backend/source logic remain unchanged. The new asset_versioning regression failed on the old URLs before the correction and now passes; eight existing static assertions were aligned with the valid versioned URLs.

Final executed verification after this correction: **73 JavaScript tests, 135 Python tests, 18 shared layouts, 11 JS/GS files and 12 inline scripts pass; git diff --check passes**. A fresh local browser booking loaded the versioned URLs, reached the receipt page, consumed its pending marker and recorded exactly one lead_created. It used in-memory Sheets/Mail and local SDK recorders. No valid production booking has been submitted. The follow-up commit will publish only this confirmed release fix, tests and updated release evidence.
