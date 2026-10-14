# Local development on macOS

The website is static HTML, CSS and browser JavaScript. Running the site needs
no package installation or application build. The QA server and standard test
suites use standard-library modules. Optional browser tests have a separate,
locked development package under `tests/browser`. There is no TypeScript check
or configured linter.

Use Node.js 24 and Python 3.13. `.nvmrc` and `.python-version` record these
runtime families for contributors who use version managers; they do not install
anything automatically.

## Start and verify

From the repository root:

```sh
make dev
```

Open <http://127.0.0.1:8766/__qa/>. Select a scenario, expand **Local QA
evidence**, and use **Fill synthetic QA details**. Only fictional details and
`qa.parent@example.invalid` are accepted by the fake booking handler. Ctrl+C
stops the server and clears its in-memory bookings.

The `rate-limit` scenario fills a strict fake budget through the real backend
guard, then rejects a new booking. `mail-failure` and `quota-zero` save a lead
with a deferred notification. POST `/__qa/recover` advances the fake clock by
15 minutes and runs the real worker with successful fake mail/quota; it returns
counts and status metadata as JSON. The menu includes this action, or use:

```sh
curl -X POST http://127.0.0.1:8766/__qa/recover
```

This clock advance and worker run affect only disposable in-memory QA state.
The normal fake runtime raises booking budgets to 1,000 so unrelated tests can
reuse a synthetic identity. Focused backend tests use the production defaults.

```sh
make check
```

This runs the standard JavaScript and Python tests, shared-layout consistency
and Git whitespace checks. A failure stops the command. To select executables:

```sh
make check NODE=/path/to/node PYTHON=/path/to/python3
```

VS Code's **Tasks: Run Task** menu provides **Tarteel House: local QA server**
and **Tarteel House: standard checks**. Open the repository folder itself in VS Code.
Tasks run only when explicitly started.

## Browser regression checks

Install the optional test package once (and use `npm ci` again after its lockfile
changes), then run the browser task:

```sh
npm ci --prefix tests/browser
make check-browser
```

The tests use installed Google Chrome with a fresh temporary browser profile.
They start their own QA server on ports 8876 and 8877, block external network
requests, and use only synthetic details. Keep those two ports free. The suite
checks short, mobile and desktop layouts, reduced motion, JavaScript-disabled
visibility, keyboard focus, validation, saved/unsaved retry outcomes, native POST
field preservation, multiline notes at their length limit, blocked requests,
failed-email recovery and quota deferral. Test results are saved
under the operating system's temporary directory at
`tarteel-house-browser-results/current`, outside the checkout. VS Code provides
**Tarteel House: browser checks** for the same command.

GitHub Actions uses the same suite with the pinned Playwright Chromium on
Ubuntu, `CI=true`, and `forbidOnly`. One worker and zero retries preserve the
shared fake-server assumptions. CI adds GitHub annotations and an HTML report;
failure artifacts have seven-day retention. `TARTEEL_BROWSER_ARTIFACT_DIR`
can select an artifact root outside the checkout; otherwise test results are
under `tarteel-house-browser-results/current/test-results` in the OS temporary
directory, with CI HTML reports alongside them in `html-report`.

On a machine without Chrome, install Playwright's test-only Chromium once:

```sh
cd tests/browser
npx playwright install chromium
cd ../..
TARTEEL_BROWSER_CHANNEL=chromium make check-browser
```

## Runtime installation

For Apple Silicon Macs with [Homebrew](https://docs.brew.sh/Installation):

```sh
brew install node@24 python@3.13 gh
brew install --cask visual-studio-code
```

The last two tools are convenient for development, not site dependencies.
Follow Homebrew's shell setup instructions. Node 24 and the versioned Python
formula require their executable directories on the shell's PATH:

```sh
eval "$(/opt/homebrew/bin/brew shellenv)"
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/opt/python@3.13/libexec/bin:$PATH"
```

Git is available through Apple's Command Line Tools. GitHub authentication and
a commit name/email are needed for authenticated contribution work, not local
QA or cloning this public repository. Enter credentials through the normal
GitHub sign-in flow, never in tracked files or chat. Configure a deliberate
commit identity before committing.

## Configuration and external services

| Setting | Local development |
| --- | --- |
| Required secrets or `.env` | None |
| `TARTEEL_QA_PORT` | Optional base port; default `8766`; the harness also binds the next port. Use two free adjacent ports between 1024 and 65535. |
| Local booking database/mail | In-memory fakes; nothing persists after restart |
| Browser measurement | Local recorders replace the external SDK endpoints |
| Fonts and video thumbnails | Public external resources may still load |
| `SPREADSHEET_ID`, `NOTIFICATION_EMAIL`, `SHEET_NAME`, `SUCCESS_REDIRECT`, `ALLOWED_REDIRECT_HOSTS` | Production Apps Script constants, described in `apps-script/README.md`; no local values are needed |

For another port, for example: `TARTEEL_QA_PORT=8876 make dev`, then open
<http://127.0.0.1:8876/__qa/>. The second port is 8877.

Keep the QA server on loopback. A plain static server preserves live form and
measurement integrations, so use the QA server for booking tests. Its content
security policy also restricts external frames; it is not a full simulation of
production YouTube playback. Simulated bookings do not verify live Google Sheet
permissions, email delivery, real Google sandbox behavior or ad attribution.

## Deployment boundaries

Cloudflare Pages serves the repository's static files; no local Wrangler
installation is needed for this workflow. Apps Script is deployed separately.
The repository documents `main` as the Pages production branch, but provider
dashboard settings must be verified separately before release. A push can
trigger deployment; obtain the owner's approval before pushing or deploying.
Use a separate branch for changes and preserve the backend-first release order
when changing the booking protocol.

`make check-release` runs both local suites without publishing. The separate
`make verify-release RELEASE_URL=https://www.tarteelhouse.com` performs GET-only
checks of a supplied release origin against this checkout. It does not execute
SDKs or submit a form. See [release and rollback](release-procedure.md) for the
required revision, provider, trigger and owner-run acceptance checks.
