# Tarteel House production release

Status as of 7 September 2026: **READY FOR APPROVED BACKEND DEPLOYMENT; FRONTEND HELD UNTIL BACKEND VERIFICATION**.

## Authorization and release state

The owner approved proceeding with “Verified, push all”. This authorizes the committed release while preserving backend-before-frontend order and excluding unrelated work. The separate approval for one synthetic production booking has not been given.

| Stage | Executed result |
|---|---|
| Local preparation | One unpublished sprint commit, **Harden trial booking and conversion flow**, being amended with the final backend binding correction and this report. |
| Remote integration | Both published blog guides preserved. Tracking commit `030d041`; remote main freshly verified at `6a6a27fc14aebec662506a1bc28c31c75e02700c`. |
| Backend draft | Saved to the verified existing bound project. Full source copied back after reload equals reviewed Code.gs after line-ending normalization. |
| Backend deployment | Not yet performed. Existing target version 6 retained as rollback point. |
| Frontend / Cloudflare | Not pushed yet; held until backend compatibility verification. |
| Synthetic booking / Sheet / notification | No valid production booking submitted, no booking row or notification created by this release. Separate approval required. |
| OpenAI Ads | No production browser conversion call, SDK/network delivery, platform receipt or attribution verified. |

## Verified production target

- Owner/execution identity: `hello@tarteelhouse.com`.
- Spreadsheet: **Bookings**, `1xLqKF1DGBGdknlGbTyulDxDYgiVm6vh0MkkXSaJ90Kc`, tab **Bookings**. Supplied by the owner and verified through the signed-in Sheet UI.
- Bound Apps Script project, opened through that Sheet's Extensions menu: `1vFEYavcMW7aOIVaXDutgX9SIk0hHlP5WfCo-5IrX975QY2odOxj6nUZS`, titled **Untitled project**.
- Existing deployment: `AKfycbxdUb5dS1GDdlbJpjiFmBEW_aagYUlyYUhkEU068pkSYIrT24sw-RlGDmDTZJZ8X87DAA`.
- Web app: `https://script.google.com/macros/s/AKfycbxdUb5dS1GDdlbJpjiFmBEW_aagYUlyYUhkEU068pkSYIrT24sw-RlGDmDTZJZ8X87DAA/exec`.
- Current version 6, 23 April 2026 1:12 PM; execute as **Me (hello@tarteelhouse.com)**, access **Anyone**. Preserve identity, endpoint and web-app access.

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

1. Deploy a new version to the verified existing backend deployment; verify live compatibility before frontend push.
2. Push normally to main using the owner's recorded approval; verify Cloudflare/public artifacts.
3. Present **PRODUCTION TEST READY — run one synthetic booking?**, with exact synthetic data and Sheet/email/measurement effects; wait for explicit approval.
4. After approval, execute exactly one booking and record each evidence level separately. Update both reports with actual results.

## Git and unrelated work

No push or production code deployment has occurred at this report checkpoint. Only the approved Sheet privacy setting changed externally. The original image `assets/images/tarteel-house-maryam-live-lesson-ad.png` remains untracked and untouched; SHA-256 `1A90CC3F8DF9A409A8A4A7BAB181D020EDCF4DB99A0E1561FD2101A7C70FB97E`. Nothing unrelated was modified.
