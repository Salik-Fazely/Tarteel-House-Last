# Apps Script — Booking handler

The booking form at `/book-trial` is configured to post to a Google Apps Script Web App. The repository source is designed to save each booking to Google Sheets and email hello@tarteelhouse.com.

## Status and scope

This file documents the repository implementation, not current production health. Repository changes do not update the Apps Script deployment automatically. Use independent resources for a fork and the local QA harness for tests. A public web-app endpoint does not require making its backing Sheet public: keep the Sheet restricted to authorized staff. Verify backend compatibility before releasing a dependent frontend change.

## Files
- `Code.gs` — booking validation, persistence and response handling.
- `AbuseProtection.gs` — bounded new-request budgets and body-size guard.
- `NotificationRecovery.gs` — notification queue, worker and owner helpers.

All three files are required in the same Apps Script project. This directory is
the source of truth; copying only `Code.gs` will leave required helpers missing.

## Setup reference (live deployment status must be confirmed)
1. Open the booking Google Sheet.
2. Extensions → Apps Script.
3. Copy all three `.gs` files into matching files in the editor.
4. Save. Deploy → New deployment → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployed `/exec` URL into the `action` attribute of the form in
   `/book-trial`.

## Updating the script
1. Edit the appropriate `apps-script/*.gs` files in this repo.
2. Copy all three current files into the bound Apps Script editor.
3. Save. Deploy → **Manage deployments** → pencil icon on the existing
   deployment → Version: **New version** → Deploy.
   The form URL does not change.

## Config to confirm before deploying
At the top of `Code.gs`:
- `SPREADSHEET_ID` - the explicitly configured booking spreadsheet. For a fork,
  configure a separate spreadsheet you own. The backend opens this explicit ID; it never falls back to an active spreadsheet. A missing ID or
  access failure returns an error without accepting the booking. The deploying
  account must have access to this file and authorize the Sheets scope required
  by `SpreadsheetApp.openById`.
- `NOTIFICATION_EMAIL` — where booking notifications are sent. Launch value:
  `hello@tarteelhouse.com`.
- `SUCCESS_REDIRECT` — fallback absolute URL of `/success`.
- `ALLOWED_REDIRECT_HOSTS` — exact production hostnames allowed for the form's
  HTTPS `success_redirect` value. The launch values are `tarteelhouse.com` and
  `www.tarteelhouse.com`; loopback and arbitrary staging hosts are rejected.
- `SHEET_NAME` — tab name inside the spreadsheet. Defaults to `Bookings`.

Google's [bound-script special methods](https://developers.google.com/apps-script/guides/bound#special_methods)
are unavailable when a bound script runs as a web app. An editor run using
`getActiveSpreadsheet()` therefore does not establish that the deployed booking
endpoint can open its spreadsheet.

## What the repository script is designed to do on each submission
With JavaScript and secure browser randomness available, the browser performs
a native form POST into a named hidden iframe. The parent stays on the website
while Apps Script confirms the outcome. It does not use opaque no-CORS fetch:
a resolved request cannot prove that a booking was saved.

1. Returns a non-success error page if the `website_field` honeypot is filled
   (spam bot), without writing or redirecting to `/success`.
2. Validates the required booking fields before writing to the sheet. Missing
   or invalid required fields return a short error page and are not saved.
3. Joins the native form's repeated `preferred_days` checkbox parameters into
   the comma-separated value used by the existing sheet and email.
4. Ensures the header row on the `Bookings` sheet contains all required
   columns — appends any missing ones to the right without disturbing
   existing data.
5. Validates bounded input, computes a SHA256 fingerprint of the booking
   details, then takes a script lock and looks up the opaque `submission_id`.
   A new ID must reserve capacity against server-side request budgets before
   appending one row with its fingerprint. An existing ID succeeds only
   when its saved fingerprint matches the submitted details. Edited retries
   return a correction message without updating the row, adding another row or
   sending another email. Untrusted formula-leading values
   are stored as literal text. The `status` column is set
   to **New lead**; `assigned_teacher`, `follow_up_date`, and
   `internal_notes` are left empty for the founder to fill in.
6. Sends a plain-text email to `NOTIFICATION_EMAIL` with all key booking
   details. `Reply-To` is set to the parent's email, so hitting reply
   responds straight to the parent. `notification_status` records `Pending`,
   `Sending`, `Sent`, `Failed`, or `Needs review`. A retry of the same ID can
   retry an unsent notification when due, without adding another booking.
   A successfully saved row counts as received
   even if email fails, so the parent is not asked to rebook a saved request.
7. Returns readable success/error HTML with a small `postMessage` callback
   from Google's sandbox to the top-level website. It never automatically
   navigates the sandbox to the success website.
   The form can pass a production `success_redirect` URL; the script only uses
   an HTTPS URL on an exact allowed hostname whose path ends in `/success`.
   The only accepted query string is a browser-generated UUID in the `booking`
   parameter. Otherwise it falls back to `SUCCESS_REDIRECT` without a
   conversion marker. Callbacks are emitted only for a valid production
   `success_redirect`, `submission_id`, and fresh `response_token`.

The website accepts a callback only while a submission is pending, from an
HTTPS `script.googleusercontent.com` or `[label]-script.googleusercontent.com`
origin, with the exact submission ID and fresh per-attempt response token.
Google nests the HtmlService document inside its wrapper, so comparing the
sender directly with the outer form iframe's `contentWindow` is insufficient.
The random token is the response capability; it is sent only to the configured
booking endpoint. Origin checking alone is never sufficient. The callback
contains only these opaque IDs, a result status, and fixed validation/error
messages; it contains no names, contact details, or booking field values.

After an authenticated success, the first-party website records a separate
`tarteelhouse.trialReceivedToken` marker and navigates to its own `/success/`.
The analytics module requires that marker, the matching prepared conversion
token, and measurement consent before measuring `lead_created`. Both markers
are consumed before measurement, so refresh cannot repeat it. A failed request,
timeout, or manually opened matching success URL does not establish receipt.
Missing/blocked storage conservatively disables conversion measurement without
preventing booking.

After 30 seconds without a valid acknowledgment, the form shows an uncertain
outcome and a WhatsApp route, retains the entered fields, and enables retry.
The field groups are inert while a response is pending: they cannot be edited,
but their controls remain enabled and are included in the native form POST.
The live status stays available outside those groups. An error or timeout
unlocks the fields and retains the entered values.

The retry keeps `submission_id` and creates a new `response_token`, so stale
callbacks cannot settle the new attempt. An unchanged saved request reuses its
row and can retry a failed notification after its backoff. If the first write failed, corrected
details can be saved under that same ID. If the original request was saved,
edited details receive a clear message that the changes were not saved and a
WhatsApp route to request a correction. The form does not silently create a
new ID after an edit. The ID stays in the current form DOM;
reloading or opening a new form creates a new ID and is not deduplicated.

The backend appends `submission_fingerprint` to the right of existing columns
without rewriting prior records. The SHA256 value is computed by Apps Script;
a client-supplied fingerprint is ignored. It covers the submitted service and
contact fields, including notes and consent, and excludes per-attempt response
tokens, submission IDs and success URLs. Formatting-only phone differences,
the order of the same preferred-day set, surrounding whitespace and notes line
ending formats do not change the fingerprint. The first saved values are
retained, except that WhatsApp is normalized for storage. Unknown request
properties cannot populate legacy or custom Sheet columns. UUID lookups are
case-insensitive, while callback ID/token text retains its incoming case.

Existing rows without a valid fingerprint receive an **error** response that
says the request was already received and asks the parent to contact staff
before resubmitting. Their details cannot be compared reliably, so the backend
does not silently confirm new details, backfill a fingerprint, overwrite the
row or retry its notification automatically. Staff can handle corrections
through the existing manual workflow. Fingerprints stay in the private Sheet;
neither fingerprints nor booking details are included in the callback or logs.

## Validation limits

Lengths are bounded without truncation. Counts use JavaScript UTF-16 string
length, matching HTML `maxlength`. Multilingual names are accepted.

| Field | Maximum length |
| --- | --- |
| Parent name / child's first name | 100 each |
| City / region | 120 |
| Email | 254 |
| WhatsApp, including formatting | 40 |
| Notes | 2,000, counting each line break once |
| Source | 100 |

Single-line and metadata limits apply to raw values before trimming. Notes
account for native POST serialization, where each textarea line break becomes
CRLF; their wire representation is also capped at 4,000 code units. Enum
choices, UUIDs and redirect metadata have bounded lengths in `FIELD_LIMITS`.
Single-line fields reject C0/DEL control characters; notes may contain tabs and
line breaks but reject other such controls. Oversized or invalid requests are
rejected before acquiring the global lock or opening the Sheet.

WhatsApp must use `+` or `00` followed by an international number. ASCII spaces,
parentheses and hyphens are allowed; the normalized number must have 7–15 digits
with a nonzero first digit after `+`. For example, `+34 (600) 000-000` and
`0034 600 000 000` both normalize to `+34600000000`. Local-only numbers,
extensions and text are rejected. This checks format, not whether the number
exists or has WhatsApp. Email format is validated and Reply-To whitespace is
trimmed without changing the email local-part's case.

Without JavaScript or secure randomness, the form retains a normal top-level
POST. The backend page itself confirms receipt and provides explicit top-level
and new-tab links; Google's bound-script sandbox may block the top-level link.
This fallback does not measure a conversion and repeated native POSTs without
an ID cannot be deduplicated.

## Operational checks and release order

Deploy this Apps Script version before publishing the matching frontend. An
older backend without the callback can save a request but leave the new form
waiting until its timeout. The frontend and Apps Script deploy independently.
Confirm a real authorized test on the production domain: exactly one sheet row,
notification status/email, top-level success navigation, consent respected,
and no duplicate on retry or refresh. Local mock tests do not verify Google's
deployment, Sheets permissions, MailApp quota, inbox delivery, or live SDKs.

Deploy all three source files. The recovery worker runs only after the owner
explicitly installs its trigger; repository changes do not activate it. See
the activation and queue-review procedure below.

Use the [paired release and rollback procedure](../docs/release-procedure.md)
to record the frontend revision, web-app version, saved project source and
trigger state. A web-app version rollback alone does not restore saved project
files or the recovery trigger; handle those explicitly before restarting mail.

Google's documented [HtmlService sandbox restrictions](https://developers.google.com/apps-script/guides/html/restrictions)
explain why an automatic iframe redirect cannot serve as a reliable return to
the first-party website.

## Abuse protection

`ABUSE_POLICY` in `AbuseProtection.gs` sets these initial budgets:

| Budget | Default |
| --- | --- |
| New attempts for either normalized email or WhatsApp | 3 per UTC hour, 12 per UTC day |
| All new attempts | 50 per UTC hour, 200 per UTC day |
| Retained contact hash buckets | 512 |
| Encoded POST body | 65,536 bytes |

These are fixed UTC hour/day windows, not rolling windows. A reservation happens
under the booking lock before appending. A later Sheet write failure consumes
the attempt. Identical saved retries bypass new-request limits, while changed
saved details remain conflicts. Native submissions without an ID also use the
budgets. Invalid fields, a filled honeypot and oversized bodies are rejected
before waiting for the lock. A blocked request gets an error stating it was not
saved, with a WhatsApp route; it cannot create a receipt or conversion.

The rate identity trims and lowercases email and normalizes the international
phone number. Stored email details and retry fingerprints retain the existing
case-sensitive behavior. Script Properties hold keyed HMAC-SHA256 hashes,
window timestamps and counts. The generated secret stays in Script Properties;
neither it nor contact values are logged or returned. Expired contact buckets
are removed without deleting unrelated project settings. Missing/corrupt state,
storage errors or exhausted capacity deny new requests before appending.

Do not delete `TH_ABUSE_SECRET_V1` independently of its counter state. If state
needs repair, an authorized owner must investigate first and reset the owned
`TH_ABUSE_*_V1`/`TH_ABUSE_CONTACT_V1_*` properties deliberately; resetting counters
also resets protection. Do not clear all project properties. Policy changes
require a new backend deployment; changing a limit does not erase current counts.

Apps Script's documented [web-app event fields](https://developers.google.com/apps-script/guides/web)
do not provide a trustworthy client IP. These limits bound intake and repeated
contact submissions; they do not stop bots rotating contacts or consuming the
shared budget. Stronger edge controls/challenges would require a separate
integration. Budgets are not Google service quota entitlements: account-specific
[Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
can constrain service sooner.

## Notification recovery and ownership

Set the founder or a named staff member as the queue owner before activating
recovery. Review the restricted Bookings sheet at least each working day and
after any Apps Script failure notice. Email failure never cancels a saved lead.

Each new row has `notification_attempts = 0`. Before MailApp is called, the
script records and flushes `Sending`, the incremented attempt count and last
attempt time. A successful mail call records `Sent`. A thrown mail error records
`Failed` and schedules delays of 15, 60, 240 and 720 minutes after attempts 1–4.
The fifth failed attempt becomes `Needs review` and stops automatic sending.
An identical parent retry observes the same delay and limit.

The script checks [MailApp's remaining recipient quota](https://developers.google.com/apps-script/reference/mail/mail-app#getremainingdailyquota)
before claiming an attempt. Zero or unavailable quota postpones the row by
15 minutes using `quota_wait` or `quota_unavailable`, without consuming an attempt.
The worker checks no more than 200 rows, processes at most ten due/review
candidates, and starts no new row once its 45-second work budget expires.
Individual Google calls can still exceed that budget. A persisted cursor
continues from the next checked row, wrapping through the queue. It shares the
booking lock and skips overlapping runs.

The claim also persists `delivery_in_progress` before mail. This guard is
cleared only after the completion status has been flushed successfully. If
completion is uncertain, the script retains/restores `Sending` when possible;
the guard also suppresses a partially written `Pending` or `Failed` state when
restoration fails. After 15 minutes a guarded row becomes `Needs review` with
`delivery_uncertain`; it is never automatically sent again. A failed claim
write/flush prevents the mail call. Sheets and MailApp have
no shared transaction, and a MailApp exception can occur after delivery. The
queue therefore cannot guarantee exactly-once email delivery. Check the inbox
before manually retrying any uncertain or repeatedly failed notification.

Existing rows with blank attempt metadata are legacy records and are never
automatically mailed, even if their old status is `Pending` or `Failed`.
Malformed managed metadata, including future last-attempt times or a next
attempt preceding its last attempt, goes to `Needs review` with `invalid_metadata`.
Queue metadata contains only timestamps, counts and fixed error codes, never
provider error strings or additional parent/child data.

### Activate after an approved release

1. In the bound Apps Script project, copy all three files and authorize the
   intended owner account for Sheets, MailApp and trigger management.
2. Run `initializeSheet` if operational columns must be added before the next
   request. It appends missing headers without rewriting existing records.
3. Run `getNotificationRecoveryHealth`; inspect its counts in the execution log
   and review existing legacy rows in the restricted Sheet. It performs no
   writes, sends or scheduling and is not exposed through the web app.
4. Run `installNotificationRecoveryTrigger` once as the delivery owner. It
   reuses this account's existing handler trigger or creates a 15-minute time
   trigger. It leaves unrelated triggers intact. Use one designated account:
   Google [limits trigger visibility to each creator](https://developers.google.com/apps-script/guides/triggers/installable),
   so separate owners could otherwise install redundant triggers.
5. In **Triggers**, confirm one `retryFailedNotifications` time-driven trigger.
   In **Executions**, verify its runs. Confirm the creator monitors Google's
   failure-notification email. Handled mail/quota errors are queue states and
   do not themselves fail the trigger, so daily Sheet review remains necessary.

An approved deployment and real authorized test are still needed to verify
permissions, Google execution behavior and inbox receipt. No local test installs
a live trigger or sends real mail.

### Review and recover a row

| Status / code | Owner action |
| --- | --- |
| `Pending` or `Failed`, next attempt in future | Leave for the worker; confirm the trigger is active. |
| Due rows remain after repeated runs | Inspect Executions, authorization, quota and cursor progress; check whether intake exceeds batch capacity. |
| `quota_wait` / `quota_unavailable` | Review delivery-account quota/service availability; the worker will retry without spending an attempt while quota is unavailable. |
| `Needs review` / `send_failed` | Check inbox and account errors; contact the family from the saved booking and decide whether another notification is necessary. |
| `Sending` or `delivery_in_progress` older than 15 minutes / `delivery_uncertain` | Verify actual inbox delivery before any manual retry. |
| `invalid_metadata` or blank legacy attempts | Review the saved row and delivery history manually; do not bulk-enable historical mail. |

After confirming a notification was not delivered and correcting the cause,
an authorized owner may explicitly requeue that single row: set status `Pending`,
attempts `0`, and clear last-attempt, next-attempt and error-code cells. The next
worker run will send it. If delivery was confirmed, set `Sent` instead. Preserve
all booking fields, fingerprint and submission ID. Such edits are live Sheet
changes and require owner authorization. Disabling recovery means removing only
this handler's trigger; it leaves saved leads and new-request protection intact.

## Required booking fields
The frontend and backend both require:

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
- `consent` = `yes`

Optional fields:
- `notes` (also where parents can mention a preferred teacher)
- `submission_id` (browser-generated UUID for retries; empty in the native fallback)
- `response_token` (new browser-generated UUID per attempt; never stored in Sheets)

## Sheet structure
Columns, left to right:

| # | Column              | Written by | Purpose                         |
|---|---------------------|------------|---------------------------------|
| 1 | `timestamp`         | Script     | Submission time                 |
| 2 | `source`            | Form       | Hidden field, always `website`  |
| 3 | `parent_name`       | Form       |                                 |
| 4 | `child_name`        | Form       |                                 |
| 5 | `child_age`         | Form       |                                 |
| 6 | `quran_level`       | Form       |                                 |
| 7 | `session_language`  | Form       |                                 |
| 8 | `country`           | Form       |                                 |
| 9 | `email`             | Form       |                                 |
| 10| `whatsapp`          | Form       | Required                        |
| 11| `preferred_days`    | Form       | Comma-separated                 |
| 12| `preferred_time`    | Form       |                                 |
| 13| `city_region`       | Form       | Required                        |
| 14| `notes`             | Form       | Optional; may include teacher preference |
| 15| `consent`           | Form       | `yes` when consent ticked       |
| 16| `status`            | Script/You | Defaults to `New lead`          |
| 17| `assigned_teacher`  | You        | Fill in when matching a teacher |
| 18| `follow_up_date`    | You        | YYYY-MM-DD                      |
| 19| `internal_notes`    | You        | Anything operational            |
| 20| `submission_id`     | Browser    | Stable opaque ID for the current form request |
| 21| `notification_status` | Script  | `Pending`, `Sending`, `Sent`, `Failed`, `Needs review` |
| 22| `submission_fingerprint` | Script | Server-computed SHA256 of booking details |
| 23| `notification_attempts` | Script | Attempts claimed; new rows start at 0 |
| 24| `notification_last_attempt_at` | Script | Last claimed send time |
| 25| `notification_next_attempt_at` | Script | Earliest automatic retry time |
| 26| `notification_error_code` | Script | Fixed operational code; no provider details |

If the existing sheet is missing any of the required columns, the
script adds them automatically on the next submission. To add them now
without waiting for a test booking, run the `initializeSheet` function
once from the Apps Script editor.

## Suggested Sheet polish (manual, one-time)
- On the `status` column, add a dropdown data validation with values:
  `New lead`, `Contacted`, `Trial scheduled`, `Trial done`, `Enrolled`,
  `Not a fit`, `Lost`. Keeps terminology consistent.
- Freeze row 1 (already done by the script on first run).
- Optional: conditional formatting on `status` so active leads stand out.
