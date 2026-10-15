# Release and recovery procedure

The static website and Apps Script backend are separate releases. A green
local test or GitHub check does not establish deployed backend permissions,
inbox delivery or advertising attribution. This procedure separates verified
local checks from the owner-run provider and live checks.

Pushing, merging, deployment, provider-setting changes, live Sheet edits,
trigger activation and a real booking test require the owner's authorization.
The CI workflow contains no deployment step or production credentials.

## Candidate checks and CI

Use Node 24 and Python 3.13. From the repository root:

```sh
npm ci --prefix tests/browser
npm exec --prefix tests/browser -- playwright install chromium
TARTEEL_BROWSER_CHANNEL=chromium make check-release
```

`check-release` runs the standard JavaScript/Python suites, shared-layout and
whitespace checks, followed by all browser regressions. The browser tests use
the loopback QA listeners on 8876/8877 and block external requests. Keep those
ports free; no live form submission is part of this command.

`.github/workflows/ci.yml` runs on pull requests targeting `main`, pushes to
`main` and `codex/**`, and manual dispatch. It has two stable check names:

| Check | Required result |
| --- | --- |
| `standard-checks` | All standard suites, shared layout and whitespace checks pass. |
| `browser-checks` | Locked npm installation and Playwright's Chromium browser pass all regressions against local fakes. |

CI uses Ubuntu 24.04, Node 24 and Python 3.13, pinned official actions,
read-only repository permissions, bounded jobs and cancellation of superseded
runs. It installs the browser's Linux dependencies, rejects focused tests in
CI, and preserves diagnostic reports outside the checkout. Failed browser jobs
upload available traces/screenshots/HTML reports with seven-day retention. These contain
only fictional test data; do not run this suite against a production origin.
See [Playwright CI guidance](https://playwright.dev/docs/ci) for the runner/browser
installation model.

The whitespace step checks committed candidate changes, not only a clean
working tree. It compares the PR base or pre-push commit, with a fallback for
new branches/manual runs. If a nonzero push base is unavailable after a history
rewrite, CI fails rather than silently checking an incomplete range.

For the first activation, the authorized maintainer must push the reviewed
branch and obtain a successful hosted run of both checks. Then configure a
`main` ruleset requiring a pull request, both check names, and an up-to-date
branch, with deliberate bypass access. GitHub documents these
[required-check controls](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).
They are provider settings, not enabled by committing a workflow.

Cloudflare [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
can deploy on a push independently of these jobs. A failing post-push check does
not undo or prevent that deployment. Use checked PRs and the required-check
ruleset before production merges; do not push directly to production `main`.
If the owner requires an explicit publication gate as well, confirm and change
Cloudflare's automatic-deployment setting deliberately before any push.

## Record the release and rollback checkpoints

Before approval, inspect the complete diff and choose a clean committed
candidate. Do not invent a commit identity or hide unrelated local work.

```sh
git status --short
git rev-parse HEAD
git diff --check
```

Keep the release record in restricted operational notes outside this public
repository. Record:

- Candidate Git SHA and the passing CI run URL for that revision.
- Cloudflare project, repository connection, production branch, root/output
  directories, build command, automatic/preview deployment controls and custom
  domain. The repository documents `main` and the static root; confirm the
  dashboard rather than inferring settings from `CNAME`.
- Current successful production deployment ID/Git SHA and an eligible rollback
  target. Keep its source checkout available for post-rollback checks.
- Apps Script project and existing `/exec` deployment ID/URL, active version,
  deployment owner, execution/access settings and prior known-good source/version.
- Recovery-trigger creator, handler, cadence and current enabled state; queue
  health counts. Confirm Sheet access/retention through the owner's private
  workflow. Do not export booking rows or Script Properties secrets into Git.

The release comprises frontend SHA, web-app version, saved Apps Script source
and recovery-trigger state. Restoring only one component may leave mismatched
behavior. A `/dev` web-app URL runs saved development code and is not a
production version check; Google's [web-app guide](https://developers.google.com/apps-script/guides/web)
explains that distinction.

## Publish the backend first

Perform these steps only after the owner authorizes this candidate and the
associated live changes. If there are no backend changes, record that fact and
verify the existing backend is compatible before publishing the frontend.

1. If recovery is already active, coordinate a short pause of only the
   `retryFailedNotifications` trigger before editing the live project. Record
   its previous state. Do not run the worker or `initializeSheet` as a read-only
   check; they can send mail or change the Sheet.
2. Copy all three current `.gs` files into the same bound project:
   `Code.gs`, `AbuseProtection.gs`, `NotificationRecovery.gs`. Verify the
   intended spreadsheet, sheet name, notification destination and exact allowed
   HTTPS redirect hosts against the private release record.
3. Authorize the intended owner account. Check **Deploy → Manage deployments**
   and edit the existing web-app deployment to use a new version. Describe it
   with the candidate SHA. Preserve its existing `/exec` URL and the intended
   **execute as owner / access Anyone** settings; keep the Sheet restricted.
4. Confirm the selected version and URL in deployment details. A friendly GET
   response alone does not prove its code revision or write/mail permissions.
5. Restore or explicitly install the recovery trigger only after the saved
   source and queue have been reviewed. Run `getNotificationRecoveryHealth`
   for count-only inspection; follow the [queue operating procedure](../apps-script/README.md#notification-recovery-and-ownership).
   Confirm one designated creator's 15-minute handler and inspect Executions.

Google's [deployment guide](https://developers.google.com/apps-script/concepts/deployments)
describes versioned releases and updating an existing deployment without
changing its URL. The recovery installer names a saved project function; it
does not pin a web-app version. Therefore treat trigger/source changes as
separate operational work and restore them explicitly during rollback.

## Publish and check the static site

1. Ensure both required checks pass for the reviewed candidate and its current
   base. Obtain the owner's final merge/publication approval after the backend
   compatibility check. An approved feature-branch push may also create a
   Cloudflare preview; inspect its settings first.
2. Merge the approved PR into `main`. Inspect Cloudflare's production deployment
   and confirm its recorded Git SHA matches the actual merged revision. A
   successful preview is not proof that the custom domain serves that revision.
3. From a clean checkout of that deployed revision, run the read-only check
   against its final HTTPS origin:

   ```sh
   make verify-release RELEASE_URL=https://www.tarteelhouse.com
   ```

   For a preview, supply its specific `https://…pages.dev` origin instead.
   The checker requires an explicit origin, rejects cross-origin redirects,
   executes no JavaScript, and never follows the form action or SDK endpoints.
   An apex-to-www redirect should be handled by selecting the final www origin.
4. The checker compares sitemap routes plus success/404 pages with local titles,
   canonical links, shared asset URLs/versions, asset bytes and booking form
   target. It also verifies an unknown route returns the branded 404 with a
   404 status. It does not compare every paragraph, run a booking or certify
   Google deployment/inbox/Ads behavior. Any mismatch is a failed release check.
   A 403, timeout or access challenge means verification did not complete;
   investigate the provider/access path without interpreting it as an outage.
   Each GET has a ten-second hard deadline by default, including redirects,
   headers, body and worker startup; `--timeout` accepts 0.1–60 seconds when
   invoking the Python CLI directly. Responses are capped at 2 MiB and redirects
   at ten hops. A timed-out worker is terminated and reaped, so a server
   trickling headers cannot keep the checker alive indefinitely.
5. Inspect desktop/mobile layout and keyboard focus in the published site,
   including the booking form, consent controls and success/404 pages. Preview
   HTML retains the production form/measurement configuration: do not submit
   test details there. Use the loopback QA harness for submissions unless the
   owner has separately approved isolated staging resources or a live test.

Cloudflare's [route and 404 behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/)
supports the checker expectations; extensionful HTML URLs can redirect within
the same origin. If asset checks show stale bytes, inspect the deployed revision
and caching rules before changing settings or purging caches.

## Owner-run live acceptance

Approve the exact production destination, fictional test details and intended
Sheet/mail/measurement side effects before submitting. Keep evidence restricted
and omit names, contacts, full form payloads and screenshots containing personal
data from public artifacts. Avoid repeated new submissions that consume budgets.

- One valid trial request produces one saved Sheet row and authenticated receipt
  on the website. Confirm its saved values and inbox delivery/status privately.
- Verify an unchanged retry does not add a row or a second completed
  notification. Verify edited saved details receive a correction error. Use
  a deliberately controlled test plan; do not simulate lost acknowledgments by
  guessing whether an uncontrolled live request saved.
- Check rejected/invalid requests do not create rows or conversions. Test
  forced mail/storage errors, exhausted quotas and rate limits in isolated QA,
  not by damaging live permissions or flooding the public endpoint.
- With consent denied, booking still works and no lead conversion is measured.
  An approved consent-granted test should produce one receipt-based conversion,
  and refresh should not repeat it. Provider-side attribution requires the
  owner's advertising dashboard; browser events alone do not prove receipt.
- Confirm the recovery trigger executes under its intended owner, queue health
  is understood, legacy rows remain opted out, and queue review has a named
  owner following the operating procedure. Do not force a real mail failure
  solely to exercise retry.

Close the release record only when its required live checks have evidence.
Mark skipped checks explicitly; local mocks cannot fill those cells.

## Roll back a failed release

The owner authorizes rollback, including trigger/provider changes. Record the
failure and the compatible prior frontend/backend pair before acting.

1. Pause only the recovery handler if backend/source behavior is unsafe. Keep
   all saved leads, headers, fingerprints, counter secrets and notification
   metadata. Do not clear the Sheet, reset quotas or bulk-requeue old emails.
2. If the previous frontend is compatible with the current backend, keep the
   backend and roll the frontend back first. If the protocol is incompatible,
   coordinate both changes and verify a compatible pair before reopening the
   flow; do not expose a new frontend to an older incompatible handler.
3. In Cloudflare **Deployments**, select the prior successful **production**
   deployment and choose **Rollback to this deployment**. Preview deployments
   are not rollback targets. Cloudflare documents this
   [rollback process](https://developers.cloudflare.com/pages/configuration/rollbacks/).
4. If a backend rollback is needed, edit the same Apps Script deployment to
   select the recorded prior version. Preserve its URL. Restore the saved
   project files to the compatible checkpoint before restarting recovery;
   changing the web-app version alone does not restore project files/triggers.
   For a pre-recovery checkpoint, keep the new recovery trigger paused/removed
   until the owner approves a compatible recovery plan.
5. Confirm dashboard versions, domain revision and trigger state. Run
   `verify-release` from a checkout matching the restored frontend, then repeat
   the owner-approved essential live checks. The newer checkout should report
   differences after a successful rollback; that is expected.
6. Repair or revert the responsible repository change through a reviewed PR
   before the next production push, so automatic Git deployments do not
   republish the fault. Keep previous successful deployment records available.

Rollback changes code and deployment selection; it does not undo a saved lead,
email delivery, measurement event or Sheet schema update. Handle those through
the restricted operational workflow.
