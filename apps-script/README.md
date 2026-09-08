# Apps Script — Booking handler

The booking form at `/book-trial` is configured to post to a Google Apps Script Web App. The repository source is designed to save each booking to Google Sheets and email hello@tarteelhouse.com.

## Status and scope

This file documents the repository implementation, not current production health. Repository changes do not update the Apps Script deployment automatically. Use independent resources for a fork and the local QA harness for tests. A public web-app endpoint does not require making its backing Sheet public: keep the Sheet restricted to authorized staff. Verify backend compatibility before releasing a dependent frontend change.

## Files
- `Code.gs` — the full Apps Script. Source of truth.

## Setup reference (live deployment status must be confirmed)
1. Open the booking Google Sheet.
2. Extensions → Apps Script.
3. Paste the contents of `Code.gs` into `Code.gs` in the editor.
4. Save. Deploy → New deployment → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployed `/exec` URL into the `action` attribute of the form in
   `/book-trial`.

## Updating the script
1. Edit `apps-script/Code.gs` in this repo.
2. Paste the updated contents into the bound Apps Script editor.
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
5. Takes a script lock, looks up the opaque `submission_id`, and appends a row
   only if that ID is not already present. Untrusted formula-leading values
   are stored as literal text. The `status` column is set
   to **New lead**; `assigned_teacher`, `follow_up_date`, and
   `internal_notes` are left empty for the founder to fill in.
6. Sends a plain-text email to `NOTIFICATION_EMAIL` with all key booking
   details. `Reply-To` is set to the parent's email, so hitting reply
   responds straight to the parent. `notification_status` records `Pending`,
   `Sent`, or `Failed`; a retry of the same ID retries an unsent notification
   without adding another booking. A successfully saved row counts as received
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
The retry keeps `submission_id` and creates a new `response_token`, so stale
callbacks cannot settle the new attempt. The ID stays in the current form DOM;
reloading or opening a new form creates a new ID and is not deduplicated.

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

Review the Bookings sheet regularly, especially rows whose notification status
is `Pending` or `Failed`. There is no scheduled notification retry in this
implementation. If MailApp sends an email but the subsequent status update or
execution fails, a retry can send another notification; Sheets and MailApp do
not share a transaction. The booking row remains deduplicated by its ID.

Google's documented [HtmlService sandbox restrictions](https://developers.google.com/apps-script/guides/html/restrictions)
explain why an automatic iframe redirect cannot serve as a reliable return to
the first-party website.

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
| 21| `notification_status` | Script  | `Pending`, `Sent`, or `Failed` |

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
