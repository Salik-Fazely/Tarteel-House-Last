# Private staff ledger

The ledger tracks each child's purchases, lesson reservations, attendance and manually verified EUR payments. Staff use **Tarteel Ledger → Open staff forms** in desktop Google Sheets. Each change has a preview and confirmation. Parents receive only the selected child's prepared text summary.

This is a separate workbook and container-bound Apps Script project. It has no public deployment, web endpoint, trigger, booking import or payment-provider connection. Do not add these files to the public booking project. Workbook URLs, owners, installation evidence and operational records stay outside this public repository.

## Daily use

1. Add the guardian, then the child. Choose an existing guardian when adding a sibling.
2. Add an unpaid package for that child. Confirm purchase and last usable dates.
3. Check the bank/payment service. Record the actual source, reference, received date and EUR amount, and attest to verification.
4. Match the receipt to the explicit purchase. Partial payment stays unpaid; excess money stays unmatched. Only fully funded packages without review holds allow new paid scheduling.
5. Schedule a 40-minute lesson against that purchase. For a replacement, choose its **existing reservation**. Record the factual outcome after the lesson. Use an exception outcome for a shortened or disputed lesson.
6. Check Needs attention for unpaid packages, unmatched money, funding shortfalls, attendance, replacements, expiry and low balances. Refresh the ledger when opening it after inactivity.

**Remaining** is purchased lessons minus completed lessons and charged absences. **Reserved** covers scheduled lessons and outstanding replacements. **Available** is remaining minus reserved. A covered absence consumes one make-up allowance and preserves the original reserved credit; it creates no extra lesson.

Starter is €120 / 6 lessons / no late-absence make-ups. Steady is €220 / 12 lessons / 4 make-ups. Committed is €400 / 25 lessons / 4 make-ups. At least 24 elapsed hours' parent notice, or a service cancellation, preserves both credit and allowance. Dates use Europe/Madrid; repeated autumn times require an explicit clock offset. See the [approved rules](../docs/superpowers/specs/2026-10-15-staff-ledger-design.md).

## Reviews, corrections and historical balances

- Refunds/reversals are verified bookkeeping entries linked to the original receipt. They do not move money. All affected purchases stay under review until staff explicitly reconcile allocations and resolve the case. A top-up alone does not remove the hold. After correcting refunded allocations, Close package selects one affected purchase and requires no outstanding reservations. Decide separately for each sibling: close that purchase, or fully fund it and confirm reconciliation. A closed refunded package does not need invented replacement money.
- Reverse an incorrect event using its ID from Events and a reason. Dependent entries must be resolved first; financial or attendance history is never deleted. Record the corrected entry separately.
- Open historical packages only from verified purchase/payment evidence. Enter completed/charged counts, make-ups used and **every** outstanding scheduled lesson or replacement. Confirm none explicitly, or choose unknown to retain a hold. For example, 12 lessons minus 4 completed gives 8 remaining; 1 replacement reserved leaves 7 available.
- A historical payment is labelled **OPENING_ATTESTATION**, with the supplied evidence reference. It is not represented as an invented bank transaction.
- Prepare a summary for one selected child, check the name, then copy the text. Contacts, siblings, transaction evidence and internal notes are excluded. Staff send it themselves.

## Save recovery

**Saved; refresh required** means the journal event was confirmed. Use Refresh ledger; do not enter the transaction again. The applied-event number and timestamp identify the current projection.

For an uncertain response, keep the request ID and use **Check save status**. Reopening the forms also checks pending status before allowing another save. **Not found yet** does not prove that the original call cannot run later. The form stays locked with the same request identity until it is saved or explicitly cancelled after review. Identical requests return the same saved event; edited retries are rejected. Browser metadata is separated by workbook and contains only opaque IDs and a fingerprint.

If status stays uncertain with no visible event, stop new entries. Inspect the bound project's **Executions** and confirm the original execution ended. Wait at least five minutes. Then choose **Tarteel Ledger → Review an uncertain save**, provide the exact request ID and a factual review reason. Under the document lock, recovery verifies history again: it acknowledges an existing event, or records a **CANCEL_REQUEST** event using the unsaved request's original ID. Any delayed original execution is then rejected. Cancellation changes no payment or lesson facts and never deletes a row. Check status again after review, inspect the details and preview a new change only if needed. Up to ten recent recovery reviews also stay in private document properties, bounded below Google's [property-size limit](https://developers.google.com/apps-script/guides/services/quotas).

Changed headers, altered events, missing committed history or an unsupported schema stop writes and invalidate the Overview status where possible. Native menu actions visibly report their result. Both script and spreadsheet timezones must remain Europe/Madrid; timezone drift stops normal operations. Preserve the workbook and inspect the version history and private release evidence. Do not reset Events or run initialization to erase a problem.

## Access and limits

Initially owner-only. Add only specifically approved trusted staff editors. Every editor can see all contacts, payments and script source; warning protections prevent accidents and provide no role isolation or tamper-proof audit. Parents and teachers must not receive access.

The project requests only current-spreadsheet, container-UI and user-email permissions. The actual authorized executing account supplies event identity. `onOpen` only adds the menu. The workbook and script use Europe/Madrid. A copied file cannot use the original container pin. A missing/changed pin requires a reviewed setup, never automatic repointing.

Capacity is 10,000 events. Search and selectors show at most 100 records of each type per page; Find a record and paging expose totals. Use a record's full ID when needed. Arrange a reviewed migration before capacity. Never split or clear a live journal to bypass the limit.

## Development and private installation

`make dev-ledger` opens the loopback-only fictional environment at `http://127.0.0.1:8878/__ledger/`. It runs the actual validation, decision and storage adapter against in-memory Google service fakes. It has no production credentials. Existing booking QA stays on its original ports.

Run `make check`, or `TARTEEL_BROWSER_CHANNEL=chromium make check-release` for all browser regressions. Standard CI does not need spreadsheet-authoring dependencies. The committed `.html.txt` templates are inert text on the static website; executable `.html` is generated only outside the checkout.

Build the private script bundle:

```sh
node staff-ledger/scripts/package_apps_script.js --out /absolute/private/bundle
```

The bundle contains `StaffLedger.gs`, `Sidebar.html`, `Client.html`, `Styles.html`, `appsscript.json` and `sha256.json`. Server modules are concatenated in dependency order, preserving their exact source bytes; the schema is generated first. This avoids depending on Apps Script's cross-file initialization order. The manifest records both input and installed-file hashes. Client includes the same pure validation rules. The packager rejects output paths inside this public checkout, including symlinks.

For the workbook, follow the installed Spreadsheets skill: use its bundled Node/dependencies, a private working directory with the prescribed `node_modules` link, and the required artifact-operation marker once. From that private working directory, run the repository's `staff-ledger/scripts/create_workbook.mjs --out /absolute/private/workbook` using bundled Node. It exports one empty `.xlsx`, recalculates, inspects headers/blank records, scans errors and renders all nine views. Inspect the previews before importing. These generated files never belong in Git.

Import the verified template twice as native Google Sheets: **Tarteel House — Staff Ledger QA** and **Tarteel House — Staff Ledger**. Verify distinct IDs, the selected owner, owner-only permissions and nine tabs. Install the same reviewed bundle in each workbook's own **Extensions → Apps Script** project: one script named StaffLedger, three HTML files named Sidebar/Client/Styles, and the exact manifest (enable Show manifest in project settings). Never create a web deployment.

The owner approves new Google permission prompts. Run `ledgerInitialize` once in each bound project, then `onOpen` or reload Sheets. Initialization applies Madrid timezone, warning protections, numeric formats and filters; it refuses an unrelated workbook and preserves accepted events when rerun. Check **Ledger health**. Only QA receives fictional transactions. Operational delivery requires zero students, receipts and events, verified menu/forms and native QA acceptance. A green local test alone is insufficient.

Record native file IDs, URLs, owner, scopes, source SHA, hashes, health and synthetic QA results privately. Before an update, stop writes and preserve a provider version checkpoint. Restore compatible script source and refresh derived views on rollback; preserve all accepted journal rows. Do not replace a live workbook with the empty template.
