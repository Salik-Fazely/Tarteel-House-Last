# Staff Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a private staff Google Sheet with guided forms, correct lesson/package balances, manual payment reconciliation and reviewable parent summaries.

**Architecture:** A separate bound Apps Script app validates commands and appends durable events under its own lock. Pure business modules replay events into views; the same decision path previews and commits changes. The public website and existing booking project remain independent.

**Tech Stack:** Apps Script V8; vanilla HTML/CSS/JavaScript; Google Sheets; Node 24 `node:test`/VM fakes; existing Playwright Chromium; bundled `@oai/artifact-tool` for the workbook template.

**Spec:** [Approved staff ledger design](../specs/2026-10-15-staff-ledger-design.md).

## Global Constraints

- One package belongs to one child; siblings cannot share its lesson credits.
- Trial and paid lessons last 40 minutes. Trial attendance is recorded separately and never debits a paid package.
- Parent notice of at least 24 hours preserves both the lesson credit and make-up allowance.
- Operational dates use **Europe/Madrid**. Scheduled instants and notice instants are stored in UTC and displayed with their timezone.
- Packages: Starter EUR 120/6/0 make-ups; Steady EUR 220/12/4; Committed EUR 400/25/4. Store money as integer EUR cents and snapshot purchase terms.
- Purchase `2026-10-15` has last usable date `2027-10-14`; purchase `2028-02-29` uses `2029-02-28`. Validate the scheduled lesson's date, not only today's date.
- An unresolved package review hold takes precedence over full payment matching and blocks new paid scheduling.
- No public staff endpoint, outbound messaging, provider integration, live booking import, real customer fixtures or bank/card credentials.
- Use the currently connected personal Google account selected by the owner; initial workbook access is owner-only.
- Keep installed workbook IDs, personal account details, source readback and release evidence in restricted operational notes outside public Git.

## Review Focus

1. Repeated or uncertain saves must resolve one durable command even after reload or a stale preview; tested in Tasks 3–4.
2. A refund on a receipt shared by siblings must create one global shortfall and hold every affected package; tested in Task 2.
3. Imported outstanding replacements must reserve credits immediately; tested in Task 2 with eight remaining/seven available.
4. Expiry and exactly-24-hour notice must remain correct around leap day and Madrid DST; tested in Tasks 1–2 and native QA.
5. A copied/misconfigured workbook, corrupt event row or stale projection must fail visibly without writing into another file or showing a healthy-looking balance; tested in Tasks 3 and 6.

## Files and shared contracts

New source lives under `staff-ledger/`. Pure modules expose namespace objects, load without side effects, and run unchanged in Apps Script and Node VM tests:

| File | Owns |
| --- | --- |
| `Rules.gs` | Catalog, input/date/money normalization, payload limits |
| `Domain.gs` | Replay, decisions, entitlement/payment/review/correction rules and invariants |
| `Views.gs` | Derived workbook rows, exceptions and selected-child summary |
| `Schema.json` | One authoritative set of nine sheet names, headers, formats and schema version |
| `Storage.gs` | Authorized identity, pinned container, lock, event append/readback and RPC orchestration |
| `Workbook.gs` | Schema verification, literal writes, derived-view refresh, native formatting/validation and count-only health |
| `Menu.gs`, `appsscript.json` | Bound menu, explicit RPC entrypoints and minimal scopes |
| `ui/{Sidebar,Client,Styles}.html.txt` | Staff UI source; packaging removes `.txt` outside the repository |
| `scripts/package_apps_script.js` | Deterministic private Apps Script upload bundle plus hashes |
| `scripts/create_workbook.mjs` | Empty workbook authoring/inspection/render/export using bundled artifact tool |
| `scripts/qa_server.js` | Allowlisted loopback ledger UI/RPC server |
| `README.md` | Staff operation, installation, recovery and acceptance instructions |

All input commands have this exact envelope; unknown properties are rejected:

```js
{schemaVersion: 1, requestId: 'UUID-v4', expectedSequence: 0,
 type: 'CREATE_PURCHASE', payload: {}, reason: ''}
```

Entity IDs are UUID-v4 values created once by the client and validated by the server. All payload fields below are required unless marked optional. `reason` is required for adjustments, opening balances, expiry changes, reversals and review resolution. Normalize dates as `YYYY-MM-DD`, instants as explicit-offset ISO strings converted to UTC, and strings as bounded literal text. Names/teacher: 100 characters; source: 64; references: 128; reason: 1,000; command JSON: 32,768 UTF-8 bytes. Reject fractional/unsafe cents, non-EUR money, invalid calendar dates and silent string truncation.

| Type | Payload |
| --- | --- |
| `CREATE_GUARDIAN` | `guardianId, name, email, whatsapp` |
| `UPDATE_GUARDIAN` | `guardianId, name, email, whatsapp`; reason required; preserves its ID and historical payment facts |
| `CREATE_LEARNER` | `learnerId, guardianId, firstName, language`; optional `bookingReference` |
| `UPDATE_LEARNER` | `learnerId, firstName, language`; reason required; preserves guardian/purchase links |
| `CREATE_PURCHASE` | `purchaseId, learnerId, packageCode, purchasedOn, lastUsableOn`; server snapshots price/count/allowance and verifies the confirmed expiry |
| `RECORD_RECEIPT` | `paymentId, guardianId, source, reference, receivedOn, amountCents, currency:'EUR', verified:true` |
| `MATCH_PAYMENT` | `matchId, paymentId, purchaseId, amountCents` |
| `SCHEDULE_LESSON` | `lessonId, learnerId, kind:TRIAL\|PAID, teacher, startsAt, timeZone:'Europe/Madrid'`; paid requires `purchaseId`; replacements require `entitlementId` |
| `RECORD_OUTCOME` | `lessonId, outcome`; `PARENT_CANCELLED` requires `noticeAt` |
| `RECORD_PAYMENT_ADJUSTMENT` | `adjustmentId, originalReceiptId, kind:REFUND\|REVERSAL, amountCents, occurredOn, reference, verified:true` |
| `CHANGE_EXPIRY` | `purchaseId, lastUsableOn` |
| `OPEN_PACKAGE` | `purchaseId, learnerId, packageCode, purchasedOn, lastUsableOn, paymentEvidence, completed, forfeited, makeupsUsed, commitments, commitmentsConfirmed, sourceReference`; `paymentEvidence={verified:true,verifiedOn,sourceReference}` records a historic attestation, not a fabricated bank transaction; each commitment has `entitlementId, sourceReference, kind:SCHEDULED\|MAKEUP_DUE` and actual lesson details for `SCHEDULED` |
| `REVERSE_EVENT` | `originalEventId`; reject already reversed events and any dependent conflict; a corrected entry is a new command after the reversal |
| `RESOLVE_REVIEW` | `caseId, decision, decisionData` |

Outcome enum: `COMPLETED, PARENT_CANCELLED, SERVICE_CANCELLED, NO_SHOW, SHORTENED, TECHNICAL_FAILURE, DISPUTED`. Derive late/timely cancellation from timestamps. Review decisions are `RECONCILIATION_CONFIRMED, MARK_COMPLETED, CHARGE_ABSENCE, PRESERVE_REPLACEMENT, EXPIRY_CONFIRMED, COMMITMENTS_CONFIRMED, CLOSE_PACKAGE`, validated against case type. Closing preserves history and blocks new scheduling; it does not consume unused credits.

Pure interfaces:

```js
LedgerRules.normalizeCommand(command) // normalized command or structured error
LedgerRules.defaultLastUsableOn(purchasedOn) // YYYY-MM-DD
LedgerRules.parseEuroAmount(text) // integer cents; accepts one decimal separator, no grouping
LedgerDomain.replay(events) // State: sequence + guardians/learners/purchases/payments/matches/lessons/entitlements/reviews
LedgerDomain.decide(state, command, context) // {event, nextState, preview}
LedgerDomain.assertInvariants(state) // throws structured error on invalid state
LedgerViews.project(state, {nowIso}) // named sheet matrices + applied sequence/time
LedgerViews.parentSummary(state, {learnerId, nowIso}) // plain text for one learner
```

Trusted `context={actorEmail, nowIso, eventId, fingerprint}` comes from the adapter. Event columns are `sequence,schema_version,event_id,request_id,payload_fingerprint,recorded_at,actor_email,type,target_id,reason,payload_json`. Store the normalized command and accepted purchase terms in its payload so replay never reprices history. No Google APIs, ambient clock, network or mutable shared catalog in pure modules.

RPC entrypoints: `ledgerBootstrap()`, `ledgerPreview(command)`, `ledgerExecute(command)`, `ledgerCommandStatus(requestId)`, `ledgerRefresh()`, `ledgerParentSummary(learnerId)`. Private helpers end in `_`.

Success is `{ok:true,requestId,eventId,sequence,duplicate,status,preview}` with status `SAVED` or `SAVED_REFRESH_REQUIRED`; preview has `balanceChanges` and `createdReviewCases`. Failures are `{ok:false,requestId,error:{code,message,field,recordIds}}`. Use fixed safe messages; `recordIds` contain opaque IDs only. Codes include `INVALID_INPUT, IDENTITY_REQUIRED, STALE_PREVIEW, REQUEST_CONFLICT, DUPLICATE_REFERENCE, UNPAID, EXPIRED, REVIEW_REQUIRED, INSUFFICIENT_CREDITS, OVER_ALLOCATION, DEPENDENCY_CONFLICT, CORRUPT_LEDGER, LOCK_BUSY, STORE_UNAVAILABLE, SAVE_UNCERTAIN`. Bound client responses and paginated pickers; never log payloads or raw provider exceptions.

### Task 1: Purchases and verified payment matching

**Files:** Create `staff-ledger/{Rules,Domain,Views}.gs`, `tests/helpers/staff_ledger_fixture.js`, `tests/staff_ledger_finance_test.js`.

**Interfaces:** Consume the command/event contract above. Produce normalization, replay/decide, purchase/receipt/match state and package/payment projection fields for later tasks.

- [x] **Step 1: Write failing finance tests** using Node's existing `node:test` and `assert/strict`, deterministic UUIDs and deep-frozen inputs. Pin these assertions:

  ```js
  assert.deepEqual(catalogTerms, [[12000,6,0],[22000,12,4],[40000,25,4]]);
  assert.equal(defaultLastUsableOn('2026-10-15'), '2027-10-14');
  assert.equal(defaultLastUsableOn('2028-02-29'), '2029-02-28');
  assert.equal(partlyMatchedPurchase.canSchedule, false);
  assert.equal(paymentAfterMatching120Of150.unallocatedCents, 3000);
  assert.equal(crossGuardianAttempt.error.code, 'OVER_ALLOCATION');
  ```

  Also reject non-EUR, zero/negative/fractional/unsafe cents, malformed dates, unknown keys, oversized fields and duplicate normalized source/reference. Prove one receipt can fund two siblings' explicit purchases, catalog snapshots survive replay, guardian/learner contact corrections preserve linked history, and parent summaries exclude the sibling/contacts/reference.
- [x] **Step 2: Run** `node --test tests/staff_ledger_finance_test.js`; verify failure is the missing ledger implementation.
- [x] **Step 3: Implement** the defined pure interfaces for guardian/learner create/update, purchase/receipt/match commands and the date/money helpers. Compare Madrid dates through one explicit timezone helper; never parse ambiguous local wall times silently. Overview statuses derive from actual funding, not an editable “Paid” cell.
- [x] **Step 4: Run** the same test file; all finance assertions pass with no external services.
- [x] **Step 5: Commit** the named files as `feat: add staff ledger purchases and payment matching`.

### Task 2: Lesson entitlements, review cases and recorded corrections

**Files:** Modify `staff-ledger/{Rules,Domain,Views}.gs`; create `tests/staff_ledger_lessons_test.js` and `tests/staff_ledger_recovery_test.js`.

**Interfaces:** Consume Task 1's state/decision functions. Produce all remaining commands, complete projections and invariant-checked event replay.

- [x] **Step 1: Write failing tests** for these independently meaningful outcomes:

  ```js
  assert.deepEqual(openingBalances, {remaining:8,reserved:1,available:7,makeupsAvailable:3});
  assert.equal(replacement.entitlementId, original.entitlementId);
  assert.equal(afterReplacementCompletion.remaining, beforeOriginalScheduling.remaining - 1);
  assert.equal(afterRefundAndNewReceipt.canSchedule, false); // unresolved hold persists
  assert.equal(sharedReceiptShortfall.totalCents, 1000); // counted once, not once per sibling
  assert.equal(dependentReversal.error.code, 'DEPENDENCY_CONFLICT');
  ```

  Cover trials, unpaid/expired scheduling, reserved versus available, duplicate replacements, Starter no-show, first four Steady/Committed covered absences and fifth charge, exactly 24 hours versus 1ms less, spring/autumn DST, missed replacement review, refund caps and affected purchases, factual attendance during holds, individual case resolution, closing, opening commitment duplicates/unknowns, and summaries' neutral under-review status. Mix accepted/rejected commands in a conservation test and check invariants after each step.
- [x] **Step 2: Run** `node --test tests/staff_ledger_lessons_test.js tests/staff_ledger_recovery_test.js`; verify the new behavior fails before implementation.
- [x] **Step 3: Implement** one persistent entitlement per reserved paid credit. Rescheduling transfers the same entitlement; completion/charged absence closes it once. Replay corrections against dependencies and reject any result that breaks invariants. Keep explicit review resolution separate from payment matching; no automatic entitlement restoration or expiry extension.
- [x] **Step 4: Run** `node --test tests/staff_ledger_*_test.js`; all domain suites pass, including replay equivalence and the exact eight/seven-credit opening case.
- [x] **Step 5: Commit** as `feat: track lesson entitlements and audited ledger corrections`.

### Task 3: Authorized bound-script persistence and workbook views

**Files:** Create `staff-ledger/{Schema.json,Storage.gs,Workbook.gs,Menu.gs,appsscript.json}`, `tests/staff_ledger_storage_test.js`; extend `tests/helpers/staff_ledger_fixture.js`.

**Interfaces:** Consume Tasks 1–2 pure modules. Produce the six RPC functions, `onOpen()` menu, `ledgerInitialize()` safe empty-template setup and `ledgerHealth()` count-only result. `Schema.json` owns the spec's nine tab names and all column definitions; the packager turns it into a private Apps Script namespace.

- [ ] **Step 1: Write failing adapter tests** with real source in a VM and in-memory Sheet/Session/Lock/Properties fakes. Assert:

  ```js
  assert.equal(duplicateDespiteStaleSequence.eventId, first.eventId);
  assert.equal(persistedEventRows.length, 1);
  assert.equal(refreshFailure.status, 'SAVED_REFRESH_REQUIRED');
  assert.equal(blankIdentity.error.code, 'IDENTITY_REQUIRED');
  assert.equal(wrongContainerWrites, 0);
  assert.equal(unconfirmedAppend.status, undefined); // no invented saved acknowledgement
  ```

  Separately exercise lock contention, failure before append, append-then-throw, readback failure, edited retry, corrupt/missing headers, unsupported event schema, stale projection marker and literal `=`, `+`, `-`, `@` values. A copied container must not inherit permission to write into the original file.
- [ ] **Step 2: Run** `node --test tests/staff_ledger_storage_test.js`; confirm adapter tests fail without the storage module.
- [ ] **Step 3: Implement** independent lock, actual authorized user-email identity and a container ID pinned during explicit initialization in document properties. Reject a changed/missing pin on normal commands. Under lock, replay and deduplicate before checking sequence, then decide/append/flush/read back. Do not reappend after uncertain acknowledgement; status lookup resolves the same request. Refresh writes a stale marker first, complete derived matrices next and applied sequence/time last. Pin Madrid in both manifest and workbook. Scopes are exactly current spreadsheet, container UI and user email; no web app or installable trigger.
- [ ] **Step 4: Run** `node --test tests/staff_ledger_*_test.js`; all adapter/domain tests pass. Verify initialization refuses unknown populated sheets and never resets Events. Current user must authorize RPC calls; simple `onOpen` only adds the menu.
- [ ] **Step 5: Commit** as `feat: persist staff ledger commands in a private bound workbook`.

### Task 4: Guided staff forms and isolated browser regressions

**Files:** Create `staff-ledger/ui/{Sidebar,Client,Styles}.html.txt`, `staff-ledger/scripts/qa_server.js`, `tests/staff_ledger_qa_test.js`, `tests/browser/staff-ledger.spec.js`; modify `tests/browser/playwright.config.js` and `Makefile`.

**Interfaces:** Consume Task 3 RPCs through `google.script.run.withSuccessHandler(...).withFailureHandler(...)`. Produce staff forms for every command, preview/confirmation, actionable overview, refresh/status recovery and one-child summary copying.

- [ ] **Step 1: Write failing HTTP/browser tests** for learner → unpaid purchase → verified receipt → explicit match → scheduled lesson → previewed outcome. Also test double-click, lost acknowledgement, reload/status lookup, edited retry, stale preview, refresh-required recovery, opening reservations, review resolution, correction dependency conflict and literal HTML/formula text. Network tests allow only `http://127.0.0.1:8878`; outbound requests must be aborted. Assert selected-child summary excludes all sibling/private reconciliation details. Verify labels, status announcements, focus, pending lock and no horizontal overflow at 300px, 320px and 480px.
- [ ] **Step 2: Run** `node --test tests/staff_ledger_qa_test.js` and `TARTEEL_BROWSER_CHANNEL=chromium npm --prefix tests/browser test -- staff-ledger.spec.js`; verify missing UI/server behavior fails.
- [ ] **Step 3: Implement** text-only rendering and native controls with validation, explicit timezone/expiry display and amount parsing from Task 1. Persist only the pending command IDs/fingerprint/target in browser storage, not contact/payment payloads; after reload use status lookup before offering another save. The fake server runs actual adapter code, synthesizes server identity and supports separate reset/fault/count controls. Serve only the allowlisted ledger page/resources/RPC routes on loopback, with bounded bodies and no arbitrary file fallback. Add it as the second Playwright `webServer` on 8878; booking stays on 8876/8877. Add `make dev-ledger`; do not change booking QA, public pages or the CI job names.
- [ ] **Step 4: Run** the Task 4 tests, then `TARTEEL_BROWSER_CHANNEL=chromium make check-release`; existing booking suites and the new staff browser suite pass. Keep diagnostics outside Git. Inspect the actual UI via computer-use tools with fictional records.
- [ ] **Step 5: Commit** as `feat: add guided staff ledger forms and browser checks`.

### Task 5: Private upload package and verified empty workbook

**Files:** Create `staff-ledger/scripts/{package_apps_script.js,create_workbook.mjs}`, `tests/staff_ledger_package_test.js`, `staff-ledger/README.md`; update `.gitignore` only if required for generated artifacts.

**Interfaces:** Consume `Schema.json` and the finalized source/UI. Produce an Apps Script bundle containing the exact source files, generated Schema namespace, three `.html` files and manifest, plus SHA256 manifest. Produce one empty `.xlsx` template with the nine named tabs, guide/catalog and no operational records.

- [ ] **Step 1: Write a failing packaging test** that assembles into a disposable directory outside the checkout. Assert manifest hashes match actual bytes, no `.html.txt` remains in the bundle, no public executable staff HTML appears in Git, catalog/schema agree with the domain, and output inside the repository is rejected. Keep workbook rendering dependencies out of standard CI.
- [ ] **Step 2: Run** `node --test tests/staff_ledger_package_test.js`; confirm the missing packager fails.
- [ ] **Step 3: Implement** `node staff-ledger/scripts/package_apps_script.js --out <private-directory>` and `create_workbook.mjs --out <private-directory>`. Read the spreadsheet skill's full create workflow, quick API, styles and Google Sheets routing before authoring. Use only the bundled Node/dependencies from `load_workspace_dependencies`; create the required temporary `node_modules` symlink and run the artifact-operation marker once before creation. Author with `@oai/artifact-tool`, not Python spreadsheet writers. Use ordinary filtered ranges with frozen headers, typed dates/numbers, EUR formats and supplementary state colors; no native table/dropdown columns or fictional rows are required because inputs live in the forms. Include the catalog/guide source reference once on Start.
- [ ] **Step 4: Run** the packaging test. Recalculate the workbook, inspect all tabs/ranges, scan errors, render each populated/header view and visually inspect. Patch the same builder if needed, then export one verified empty template. Save previews, bundle, checksums and verification outside the public checkout; capture actual runtime commands in the private setup record.
- [ ] **Step 5: Commit** source/tests/documentation as `feat: package the staff ledger and empty workbook template`.

### Task 6: Full review, native QA and owner-only operational delivery

**Files:** Update `staff-ledger/README.md`, `docs/START-HERE.md` and the private setup/release record outside this public repository. No changes to public pages or existing `apps-script/*.gs`.

**Interfaces:** Consume the reviewed source SHA, verified bundle/template and all green suites. Produce a verified QA workbook and a separate empty operational workbook owned by the user-selected account.

- [ ] **Step 1: Verify the complete candidate** with `TARTEEL_BROWSER_CHANNEL=chromium make check-release`, `git diff --check` and a fresh whole-branch review against the approved spec. Resolve material findings with reproductions and targeted tests before rerunning affected checks. Confirm public-page inventories and booking source bytes are unchanged.
- [ ] **Step 2: Commit remaining documentation**, push the reviewed branch and open/attach a PR under the session's existing build/deploy authorization. Obtain both hosted CI jobs before integration. Keep workbook IDs/account details out of the PR. Do not bypass the existing main ruleset.
- [ ] **Step 3: Verify the Drive connector identity** still matches the personal account explicitly selected in chat. Follow Google Sheets skill import/edit/visual-quality references. Import the same verified empty local `.xlsx` twice using `import_spreadsheet` with `upload_mode:'native_google_sheets'`: **Tarteel House — Staff Ledger QA** and **Tarteel House — Staff Ledger**. Verify distinct IDs, native MIME types, owner, observed URLs and the exact nine tabs for each. Place both under My Drive/ChatGPT. Use metadata/permissions to prove owner-only access; do not share either with unnamed staff. Only the QA copy receives fictional data.
- [ ] **Step 4: Install the bundle in a separate QA workbook's bound project** using supported provider/UI tooling, with no public deployment. Let the owner complete any new Google authorization prompt at action time. Verify source readback against hashes and actual user identity. Exercise synthetic payment/matching/lesson/opening/retry/refund/correction flows, Madrid dates, refresh failure and summary isolation. Verify typed cell values, literal text, native validation/formatting, warning protections and stale markers in Google Sheets. Save restricted evidence; leave synthetic records only in QA.
- [ ] **Step 5: Install the same reviewed bundle in the separate empty operational workbook**, verify account/permissions/source/schema, initialize its own container pin, and run count-only health/menu/form checks. Confirm zero learners, payments and events; do not enter actual or fictional transactions there. Record the observed URL, source SHA, hashes, owner, scopes, health, QA proof and rollback checkpoint privately. Preserve accepted events on future rollback.
- [ ] **Step 6: Integrate the checked PR**, attach it, verify hosted CI and unchanged public-site checks as appropriate. Deliver the verified native Google Sheet link and a short staff operating guide. Explicitly state whether the first real entry/opening migration remains unperformed. Do not claim Google-native acceptance from mocks or deliver an unverified workbook as ready.

## Plan review and execution choice

This plan implements the approved design without a public staff app or payment-provider connection. The owner approved continuation on 15 October 2026; Native execution is underway. Recommended: **Native execution in this session**, because the state, storage and UI share tightly coupled contracts; use one fresh whole-branch reviewer before native deployment. Subagent-driven execution is also available and adds a fresh implementer/reviewer gate for each task.
