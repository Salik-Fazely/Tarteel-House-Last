# Staff lesson and package ledger — approved design

Date: 15 October 2026. Status: owner approved this design in chat on 15 October 2026; implementation planning is in progress.

## Purpose and agreed direction

Give the founder and trusted operations staff one place to see each child's package, lessons used and remaining, scheduled lessons, make-up allowance and payment status. Reduce manual balance and matching mistakes before adding parent or teacher portals.

The owner selected a private Google Sheet with guided staff forms and automatic balances. The owner also selected manual payment reconciliation: staff check the bank or payment service, record a verified payment, then match it to the child's package. The system must show unpaid packages, unmatched money and amount discrepancies.

The alternatives considered were a dedicated staff dashboard with sign-in, which would add custom hosting/authentication and maintenance, and a Sheet with guided forms, which fits the existing small-team Google workflow. This design uses the selected Sheet approach. Direct provider integrations and statement-file import can be added later if operations justify them.

## Staff workflow

1. Open **Tarteel House — Staff Ledger** in desktop Google Sheets and choose **Tarteel Ledger → Open staff forms**.
2. Register a learner and their guardian contact, then choose Starter, Steady or Committed to create a purchase. A purchase begins unpaid; creating it does not grant permission to schedule paid lessons.
3. After checking an external payment, record its source label, transaction/reference, date, EUR amount and verification. Match all or part of that receipt to an explicit purchase. Full matching activates that purchase for scheduling.
4. Schedule a 40-minute lesson against an explicit child and package. Record completed attendance, timely cancellation, teacher/service cancellation, late cancellation or no-show. The form previews the balance/allowance effect before saving.
5. Use the overview to resolve unpaid purchases, unmatched/overpaid money, upcoming expiry, low balances, unrecorded attendance and cases needing a staff decision.
6. Select one learner to prepare a plain-text parent summary for staff review and copying. Sending a message remains a staff action.

All staff entering financial or attendance data are trusted editors of the entire ledger. Teachers and parents receive no access in this version. Requests for per-teacher or per-child visibility require a different access design.

## Confirmed commercial rules

These rules come from `docs/commercial-facts.md`, `docs/decisions.md` and the existing terms page. Existing purchase terms are retained as a snapshot rather than changing when the catalog changes.

| Package | Price | Lessons | Late/no-show make-up allowance |
| --- | --- | --- | --- |
| Starter | EUR 120 | 6 | 0 |
| Steady | EUR 220 | 12 | 4 |
| Committed | EUR 400 | 25 | 4 |

- One package belongs to one child; siblings cannot share its lesson credits.
- Trial and paid lessons last 40 minutes. Trial attendance is recorded separately and never debits a paid package.
- Packages last one year from purchase. Payment confirmation is required before paid scheduling.
- Parent notice of at least 24 hours preserves both the lesson credit and make-up allowance.
- Teacher/service cancellations preserve both credit and allowance; replacement depends on availability.
- A late cancellation/no-show on Starter, or after the other packages' four allowances are used, consumes one lesson.
- A covered absence uses one make-up allowance, preserves one credit for its replacement and adds no extra lesson credit. Completing the replacement consumes that credit once.

## Approved operational defaults

The owner approved these operational defaults with this written design. They specify ledger behavior without rewriting the public terms:

- Operational dates use **Europe/Madrid**. Scheduled instants and notice instants are stored in UTC and displayed with their timezone. Exactly 24 elapsed hours qualifies as timely notice; daylight-saving changes do not turn this into a calendar-day comparison.
- A package's default last usable date is the day before its next purchase anniversary in Europe/Madrid (for example, purchase 15 October 2026 → last usable date 14 October 2027). For a 29 February purchase, use 28 February of the next year as its last usable date. Staff see and confirm this date before saving. Any later change requires a reason and an audit event.
- Staff explicitly select a purchase for each paid lesson; multiple purchases may exist for a learner. The system does not silently choose which package to charge.
- Partial receipts may be recorded/matched, but paid scheduling stays blocked until the full package price is matched. No discount, installment entitlement or currency conversion is inferred. Excess money stays unmatched for review.
- A missed replacement, disputed/shortened lesson, connection failure, teacher-caused replacement after expiry, refund or payment reversal creates **Needs review**. It does not silently consume another allowance, extend expiry, restore credits or decide refund eligibility. Staff resolve the case with an explicit recorded decision and reason.
- New deployments start empty. Existing active packages can be entered through a reviewed opening-balance form using verified purchase/payment facts, completed/forfeited counts, make-ups already used and outstanding reservations/replacements. No figures are inferred from trial leads. Staff must confirm the opening balance and its source before saving; unknown commitments keep the package in review.

## Workbook and access

Create a separate restricted workbook with its own container-bound Apps Script project. Do not add staff operations to the public booking web app, change its three source files, share its script lock or install ledger triggers in that project.

| Tab | Purpose |
| --- | --- |
| Start | Operating guide, package rules, how to open forms and resolve review cases |
| Overview | Balances and actionable exceptions with an “as of” timestamp |
| Students | Learner IDs, first names, guardian IDs/contact and optional originating booking reference |
| Packages | Purchase snapshots, payment state, expiry, used/remaining/reserved/available lessons and make-ups |
| Lessons | Trial/paid sessions, teacher, time, outcome and replacement links |
| Payments | Verified EUR receipts/refunds/reversals and amounts still unmatched |
| Matches | Explicit allocations between a verified payment and a purchase |
| Events | Canonical ordered records of staff commands and corrections |
| Parent Summary | One selected learner's reviewable summary, never the whole roster |

The owner selected their currently connected personal Google account to own the workbook, explicitly choosing it over the existing operations account on 15 October 2026. Verify the connector identity before creating/importing the file; keep the actual account details in private operational notes. Initial access is owner-only. Additional editors require the owner to identify the recipients before sharing. There is no public staff URL, anonymous endpoint or publish-to-web step.

Use a bound menu/sidebar and `google.script.run`; no `doGet`/`doPost` is required. Request the current-spreadsheet, container-UI and user-email scopes needed by this project, without Drive-wide, mail or payment-service access. Each staff command obtains the actual executing user's identity through the authorized bound-script context; blank/unavailable identity fails with a clear message. The simple `onOpen` trigger only adds the menu and does not require or fabricate an actor. No client-supplied actor name is trusted.

Every authorized editor can see the whole workbook and can edit its bound script. Warning protections and hidden tabs help prevent accidents; they do not provide role isolation or tamper-proof records. No credentials, parent/student records, actual transaction references or workbook identifiers belong in public Git, test fixtures, logs or analytics.

## Record and calculation design

Use stable opaque learner, guardian, purchase, payment, lesson and command IDs. Optional booking references are manual links only; this version does not read/import the live Bookings sheet automatically.

The canonical Events tab records one complete accepted command per row: sequence, schema version, event ID, durable request ID, payload fingerprint, server timestamp, executing actor, command type, target ID, reason and bounded JSON payload. A separate ledger lock serializes validation and append. Retry of the same request/payload returns its existing result; reusing an ID with different details is a conflict. Duplicate receipt references are checked by source and normalized external reference, separately from command retries.

All visible data tabs are derived views. Rebuild them from accepted events after a save and through **Refresh ledger**. Show the applied sequence and refresh time. A failed view refresh is reported as “Saved; refresh required,” preserving the accepted event and stable request ID. A timeout or uncertain append never causes the UI to generate a new request ID automatically. Readback/retry resolves the original command first. Corrupt event rows or an unsupported schema stop mutation and display a repair/review message rather than guessing balances.

Write user-supplied strings as literal cell text, including values beginning with formula characters; render them as text in forms and summaries. Bound string lengths, event size and batch sizes. Do not place private payloads or raw provider errors in logs or error messages.

Money is stored as integer EUR cents, never binary floating-point prices. New match amounts must be positive, cannot exceed the payment's unallocated net amount or purchase's unpaid amount, and cannot cross currencies or unrelated guardians. One verified payment can be explicitly allocated to more than one purchase within the same guardian's family; each package still belongs to one child. Receipt references and verified dates are required; an uncertain/duplicate reference needs review rather than automatic matching. Staff attest to verification; the ledger does not prove a transfer occurred.

Balances distinguish **remaining**, **reserved** and **available** lessons. Remaining equals purchased credits minus completed/chargeable-absence usage. Open scheduled sessions and replacement entitlements reserve credits; available equals remaining minus reservations. Never allow negative values or reserve the same entitlement twice. A replacement is linked to its original missed session and transfers its reservation; it does not create a second credit. Completed lessons and charged absences remain separate totals.

Corrections append an explicit reversal/correction with a reason and original event reference. They never erase financial/attendance history. A correction that would invalidate later payment allocations, package usage or reservations is rejected with the affected records shown; staff must resolve dependencies explicitly.

Verified refunds/reversals link to their original receipt and cannot exceed its amount not already refunded/reversed. They reduce its recognized net amount and put every affected purchase in review, without deleting allocations or rewriting usage. If old allocations now exceed net funds, show the exact funding shortfall, zero newly allocatable money and a reconciliation exception. Staff explicitly undo/correct matches and record their entitlement decision. These are bookkeeping records; the software neither sends money nor decides refund eligibility.

An unresolved package review hold takes precedence over full payment matching and blocks new paid scheduling. Staff can still inspect records, record payments/matches or their corrections, and record factual attendance against an already reserved lesson. No later payment or view refresh clears a hold automatically. A reasoned **Resolve review** command explicitly selects the affected case and decision, checks current money/reservation constraints and rejects unresolved dependent conflicts. Parent summaries display a neutral **Under review — contact Tarteel House** status while a hold remains, without exposing internal reasons or saying the package is ready to use.

Opening balances use the same validation: verified historic payment, purchased snapshot, used/completed/forfeited counts within its lesson total and make-ups used within its allowance. They include an explicit list of outstanding scheduled lessons and make-up entitlements, each with a unique source reference and the actual schedule details when applicable; an affirmative “none outstanding” is required for an empty list. Those commitments reserve credits immediately and may not exceed remaining lessons or duplicate each other. Unknown commitments produce a review hold until recorded and explicitly resolved. Their source and reason are recorded. No historical sessions, payment references or transaction IDs are invented.

For example, a Steady opening purchase with four completed lessons and one covered absence awaiting replacement has eight remaining, one reserved and seven available, with one make-up allowance already used. Importing it must not make eight credits newly schedulable.

Parent summaries contain only the selected child, package, paid/unpaid/under-review status, expiry, completed/charged/remaining/reserved lessons, make-ups remaining and an “as of” date. Exclude transaction references, guardian contacts, staff notes, other children and internal review details. Do not automate certificates, review invitations, WhatsApp or email in this version.

## Implementation boundaries

- Keep the public website and booking backend unchanged. Store the new software separately under `staff-ledger/` with its own README, manifest, domain/calculation code, storage adapter, menu/forms and workbook authoring script.
- Keep business calculation code independent of Google APIs so the existing Node test setup can exercise it with fictional data. Extend the existing browser package with a loopback-only staff UI adapter; production spreadsheet/money services are not used by tests.
- Create and validate a local empty `.xlsx` template through the spreadsheet skill, then import it as native Google Sheets. Apply the required native validations/formatting and install the bound script after import. Keep the installed private workbook URL and deployment evidence in restricted operational notes outside public Git.
- Use readable tables, frozen headers, filters, EUR/date formats and explicit text labels for states; color is supplementary. Staff forms use labels, keyboard focus, pending/error states and a confirmation preview for balance-affecting commands.
- No new public web hosting, paid service, payment-provider configuration, bank access, customer portal, teacher payroll, invoice/tax system, automatic booking migration or outbound messaging is included.

## Verification and acceptance

Automated domain tests cover each package, the exact 24-hour boundary, DST, expiry/leap day, paid-before-scheduling, repeated/edited commands, duplicate references, partial/excess/family payments, over-allocation, lesson reservations, each absence outcome, replacement reuse, opening balances including the eight/seven-credit example, linked refund limits/funding shortfall, hold precedence despite full matching, explicit review resolution and dependency-safe corrections.

Adapter tests cover concurrent commands, persisted-but-uncertain saves, refresh failure after save, invalid headers/events, blank identity and formula-leading text. Browser tests cover add learner/purchase/payment/match, lesson/outcome preview, retry without duplicate saves, correction conflicts, selected-child-only summaries, keyboard focus and usable staff form widths. Existing website/booking regression suites must remain green.

Before operational use, verify native workbook headers, formulas/derived values, styles/validation, bound source readback and owner-only permissions. Demonstrate the staff flow using fictional records in a separate QA workbook, including duplicate retry, a failed refresh and an authorized sidebar command returning the actual owner's identity. Production starts empty; do not place fictional payments in the operational ledger. Verify a count-only empty-state health check, menu/forms, package catalog and release/source checkpoint. Record the final workbook URL, source SHA and smoke-test evidence privately. An actual first customer entry or historical opening-balance import requires owner-supplied verified facts.

Rollback disables staff form writes and restores the compatible script/view version. Preserve accepted Events and real records; do not reset the ledger or roll back event history to reverse bookkeeping. Rebuild views using compatible code and record repairs as explicit corrections.

## Provider references

- [Google: container-bound scripts and inherited file access](https://developers.google.com/apps-script/guides/bound)
- [Google: menus, dialogs and sidebars](https://developers.google.com/apps-script/guides/dialogs)
- [Google: asynchronous sidebar/server communication](https://developers.google.com/apps-script/guides/html/communication)
- [Google: script/document lock scope](https://developers.google.com/apps-script/reference/lock/lock-service)
- [Google: service authorization](https://developers.google.com/apps-script/guides/services/authorization)
- [Google: executing user identity and required email scope](https://developers.google.com/apps-script/reference/base/session)
- [Google: sheet protections and their limitations](https://support.google.com/docs/answer/1218656)

## Review checkpoint

The owner approved the written design, including the date/exception defaults and opening-balance workflow, on 15 October 2026. They selected the Sheet interface, manual payment reconciliation and ownership by the currently connected personal Google account. The implementation plan requires its own review and execution-method selection before product implementation; no product code or provider resources have been created by the design step.
