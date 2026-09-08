# Tarteel House

This repository powers the [Tarteel House website and trial-request service](https://www.tarteelhouse.com/). Tarteel House offers one-to-one online Quran lessons for children aged 5–16, with English, Arabic, Turkish and Persian teaching options and a free 40-minute trial.

The implementation is specific to this service: static HTML and CSS, browser JavaScript, and a separately deployed Google Apps Script booking handler. Parents can read about lessons, teachers and pricing, then request a trial.

## Project status

The production website is maintained from this repository. Booking and consent changes have automated tests and a local browser QA environment. The latest recorded release was verified on Cloudflare; the final live booking, Sheet, notification and advertising-delivery test was left to the owner. Local tests do not establish those external outcomes.

Eligible source code is available under the MIT License, with brand assets and non-code content excluded. See [Licensing scope](#licensing-scope). This is a service-specific project; no external adoption or usage figures are claimed.

## Architecture

```text
Parent's browser -> static pages on Cloudflare Pages
Trial request    -> Google Apps Script -> private Google Sheet
                                      -> staff email notification
Confirmed receipt + optional consent -> browser measurement
```

| Location | Purpose |
| --- | --- |
| `index.html`, page directories | Public pages; directory `index.html` files provide canonical routes |
| `book-trial/`, `success/` | Trial form, validated receipt handling and confirmation page |
| `assets/css/styles.css` | Shared site styles and responsive layouts |
| `assets/js/main.js` | Navigation, disclosures and media interactions |
| `assets/js/consent.js` | Optional measurement choices and SDK initialization |
| `assets/js/analytics-events.js` | Interaction events and consent-gated trial conversion |
| `apps-script/Code.gs` | Validation, booking persistence, deduplication and staff notification |
| `partials/` | Canonical header and footer fragments copied into public pages |
| `scripts/sync_shared_layout.py` | Shared-layout synchronization and drift checking |
| `scripts/qa_server.js` | Loopback-only browser QA with in-memory Sheets/Mail and measurement recorders |
| `tests/` | JavaScript behavior tests and Python content/layout regression checks |
| `assets/blog/`, `assets/Characters/`, `assets/logo/` | Reserved service artwork and brand materials; excluded from MIT |
| `docs/` | Authoritative product rules, brand guidance and contributor context |

There is no application build step or package installation step. Tests and helper scripts use the Node.js and Python standard libraries. The production page may contact Google Fonts, YouTube and measurement providers; the booking backend uses Google's hosted services.

## Run locally

Use Node.js 24 and Python 3.13 for the verified setup. Run commands from the repository root. Git is needed for normal contribution work; no Google account or API key is needed for local QA.

```sh
node scripts/qa_server.js
```

Open **http://127.0.0.1:8766/__qa/**, choose `success`, and expand the local QA evidence panel to fill synthetic details. The permitted QA email is `qa.parent@example.invalid`. The server binds loopback ports 8766 and 8767 and clears its fake rows when restarted. Stop it with Ctrl+C.

This is the preferred development entry point: it replaces the live booking action and measurement scripts with local fakes. It may still load public fonts or image thumbnails, and following external links leaves the QA environment. Use only fictional details. Never send test requests to the production booking endpoint.

Known QA limitation: the menu's **Missing measurement files on booking page** scenario currently fails to remove the versioned script tags. Do not use that scenario as proof that files were blocked. Other outcomes, such as failed saves and denied consent, can be selected separately. The harness is a local development tool and must not be exposed on a public server.

For static layout inspection only, an optional server is:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/. **This server leaves production integrations intact. Do not submit its booking form; use the QA server for form testing.**

## Run tests

PowerShell:

```powershell
$jsTests = Get-ChildItem -Force tests -Filter '*_test.js' | ForEach-Object FullName
node --test $jsTests
python -m unittest discover -s tests -p '*_test.py'
python scripts/sync_shared_layout.py --check
git diff --check
```

`-Force` includes test files carrying the Windows Hidden attribute. Omitting it in this checkout excludes two suites.

On a POSIX shell, replace the first two lines with:

```sh
node --test tests/*_test.js
```

Latest verification: **73 JavaScript tests and 138 Python tests passed**, and shared layouts matched across **18 public pages**. These are test counts, not coverage percentages or evidence of adoption. The executed Windows environment used Node.js 24.19.0 and Python 3.13.9; other environments have not been certified by this check.

## Deployment

Production hosting is **Cloudflare Pages**, publishing the static site from the repository root and `main`. The root `CNAME` is a legacy file; Cloudflare Pages is the hosting source of truth.

Apps Script is deployed separately. A backend protocol change must be deployed and checked before its dependent frontend release. Pushes to production `main` can publish the website. Contributors should submit pull requests and leave deployment to the maintainer.

Browser assets use versioned URLs to prevent old cached scripts from mixing with new pages. Changes to these assets require a consistent version update and tests. The raw repository contains service-specific configuration: reusing it requires independently owned backend resources, contact destinations, allowed origins and measurement configuration. Do not point a fork at Tarteel House's live integrations.

## Privacy and security

- Booking requests concern children and parent contact information. Do not place real names, contact details, learning notes, booking exports or screenshots containing personal data in issues, pull requests, fixtures or logs.
- Test with the local fakes. Production Sheet permissions, email delivery and advertising-platform receipt require separately authorized verification.
- A booking is acknowledged only after persistence. Staff email is a separate step and may fail after a request is saved.
- Optional measurement must respect consent. The OpenAI SDK is initialized with measurement disabled before a decision; GA is enabled after consent. SDK loading itself can contact a third party. Booking must remain usable when measurement is denied or unavailable.
- Keep credentials and private operational records out of Git. Ignore rules do not protect files already tracked or remove information from history. Internal release and session reports have been removed from the current tree. History still contains operational identifiers and maintainer metadata; a public identifier is not permission to access a resource.
- Follow [SECURITY.md](SECURITY.md) for private vulnerability reporting. No compliance certification or guaranteed delivery is claimed.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). Useful contributions include reproducible accessibility or booking bugs, focused tests, documentation corrections and small reliability improvements. Preserve the brand and established service facts; pricing, teacher information, safeguarding and other policies require maintainer decisions.

## Licensing scope

[LICENSE](LICENSE) grants MIT rights to the maintainer-owned JavaScript, CSS, Apps Script, scripts, tests and HTML implementation code listed there. The owner confirmed control of this code, including AI-assisted development. MIT permits commercial use, modification and redistribution subject to retaining its notice; it does not require downstream changes to be published.

**MIT does not cover the Tarteel House name or trademarks, logos, branding, photographs, illustrations, images, teacher/child character artwork, educational/editorial content, testimonials, legal/policy text or other non-code content.** These remain reserved unless separately and explicitly licensed. HTML combines implementation with written content: the implementation grant does not license the prose or linked assets. No trademark or endorsement rights are granted. Replace reserved content and integrations before distributing a branded fork.

Third-party assets, fonts and libraries retain their own licenses and are not relicensed under MIT. The two SVG logos now contain lettering paths generated from verified OFL 1.1 fonts, with no font software embedded. [Lettering provenance](assets/logo/LETTERING.md) records exact sources, instances and checksums. The logos themselves remain outside MIT. Older embedded-font versions remain in Git history and are excluded from this license grant.

Google Fonts, hosted analytics SDKs, YouTube and Google's backend services are external dependencies with their own terms. They are not bundled as third-party libraries by this patch. No claim is made that all historical material or reserved assets are freely redistributable.
