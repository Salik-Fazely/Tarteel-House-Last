# OSS maintenance readiness and factual application evidence

Review completed 8 September 2026. Baseline: `main` at `6d5c3098115dec8583b46f5bad456ca8828283d6` (74 commits). The owner authorized one local commit, preserving history; no push, deployment, repository-setting change or application submission is part of this patch.

## Verdict and licensing

Eligible maintainer-owned source code is MIT licensed with explicit scope in LICENSE and README. The owner confirmed control of the source, including AI-assisted development, no contractor retaining code rights, and no known restrictive copied templates. Inspection found standard-library scripts/tests, custom site code and externally loaded services, with no vendored framework or identified copied proprietary snippet. This is a scoped source-code release, not a blanket license for the whole repository or its history.

Branding, trademarks, logos, photographs, illustrations, images, teacher/child artwork, educational/editorial material, testimonials, legal/policy text and other non-code content remain reserved. Third-party assets, fonts and libraries retain separate terms. The source grant does not imply permission to reuse the service's identity or private integrations.

The SVG font blocker is resolved in the current tree: both logos contain only vector lettering generated from freshly obtained Cormorant Garamond Medium Italic and Inter Medium fonts under verified SIL OFL 1.1. Exact pinned sources, checksums and rendering parameters are in assets/logo/LETTERING.md. No font software or conversion tooling is bundled. Existing raster brand artwork was used for visual comparison and left unchanged. Historical SVG font binaries remain in Git, excluded from the new license grant, under the owner's explicit no-history-rewrite instruction. Do not redistribute those older assets as MIT material.

## Final file scope

Added:

- README.md
- CONTRIBUTING.md
- SECURITY.md
- .gitignore
- LICENSE
- OSS_READINESS_REVIEW.md
- assets/logo/LETTERING.md
- tests/logo_font_provenance_test.py

Changed:

- assets/logo/tarteel-house.svg
- assets/logo/tarteel-house-reversed.svg
- apps-script/README.md
- docs/START-HERE.md
- docs/decisions.md
- docs/project-brief.md

Removed from the current tree (retained in Git history):

- ASTRA_CONVERSION_SPRINT_REPORT.md
- ASTRA_PRODUCTION_RELEASE_REPORT.md
- docs/current-status.md
- docs/session-handoff.md
- docs/next-tasks.md

The internal reports contained stale handoffs, workstation/deployment details and no necessary public contributor guidance. README replaces their setup/status role. Authoritative commercial/brand/legal documents and commercial regression assertions remain intact. Backend documentation no longer repeats the private workbook identifier; executable configuration is unchanged to preserve production behavior. No booking, consent or measurement implementation changed.

## Sensitive-content findings and limits

The preceding audit enumerated 131 tracked baseline files and scanned 469 distinct named reachable text blobs across local refs for private keys, provider-token patterns, credential assignments, sensitive filenames and email/path candidates. No obvious credential-pattern hit or tracked parent/student booking/database export was found. Email-like content was public business contact, synthetic fixtures or image filenames mistaken for emails. No private Sheet, customer inbox or Ads-account data was opened for this OSS review.

History contains maintainer email metadata, a workstation path and deployment/resource identifiers. These are not established authentication secrets; no history rewrite was performed. The production workbook ID remains in Code.gs and matching test/QA assumptions, and public endpoint/measurement IDs remain in the site. Resource IDs are not access grants: forks need independent resources, and the backing Sheet must remain restricted. Removing reports from the current tree does not erase historical exposure or change hosting access controls.

PNG/WebP metadata was inspected in the earlier audit; no EXIF/XMP was found in the checked images and the social-card text fields had no email, URL or workstation-path markers. Pixel content, third-party media permissions, remote-only/dangling objects, inaccessible refs and GitHub attachments were not exhaustively audited. Pattern scans are not proof that every possible secret has been found. Asset exclusions must not be mistaken for a blanket redistribution-rights clearance.

## Verification

- Full JavaScript suite: 73 passed, zero failures/skips (six test files; Node.js 24.19.0).
- Full Python suite: 138 passed, zero failures (24 test files; Python 3.13.9), including three new logo regressions. Baseline was 135 Python tests.
- Shared-layout check: 18 public pages synchronized.
- Syntax checks: all JavaScript files under assets/js, scripts and tests, plus Apps Script piped to Node's CommonJS parser.
- Both SVGs parse as XML, retain their canvas, colors and accessible names, and use identical lettering paths between variants. No text nodes, font declarations, font payloads, base64 data, old font aliases or external resource references remain.
- Browser comparison: repaired normal/reversed SVGs inspected; normal wordmark compared side by side with the existing PNG brand master. Composition and recognizable lettering preserved. Original embedded-font SVG rendering fell back to different lettering; paths remove that runtime font dependency.
- Documented local QA starts on loopback. Homepage, dashboard, booking and both SVG URLs returned HTTP 200. Browser checks covered empty-form rejection, a successful granted-consent booking with exactly one lead_created recorder call, refresh without a duplicate, and a successful rejected-consent booking with no measurement call. In-memory totals were two requests, two rows and two fake notifications; the browser error log was empty. No production submission, SDK delivery or platform receipt is inferred.
- Local Markdown targets, UTF-8 and whitespace checks passed; git diff --check passed. The unrelated advertisement image retained its original SHA-256 and remains untracked.
- Full test commands are in README. Windows PowerShell uses Get-ChildItem -Force to include hidden test files; POSIX glob syntax is documented as an equivalent, not a separately executed platform test.
- No CI, coverage percentage, live email delivery, SDK network delivery, Ads platform receipt or attribution is claimed from local verification.

## Remaining limitations ranked by impact

1. Owner-run production booking, Sheet, notification and advertising-delivery confirmation remains separate and unverified by this patch.
2. Forks must replace service-specific integrations and reserved content; this is not a ready-to-deploy generic educational platform.
3. The existing QA missing-measurement-files scenario matches unversioned script tags and does not remove today's versioned tags. README and CONTRIBUTING disclose it. The production implementation is unchanged; this separate QA bug is not claimed fixed.
4. Historical operational notes and removed embedded fonts remain reachable in Git. Use current source and scoped license for publication; do not advertise all historical assets as open source.
5. No tracked CI workflow or published version-support policy exists; this verification is local.

## Exact GitHub description

Source for the Tarteel House Quran lesson website, with a static frontend, Google Apps Script trial booking, and consent-aware analytics.

## Suggested GitHub topics

`quran`, `education`, `static-site`, `javascript`, `html`, `css`, `google-apps-script`, `cloudflare-pages`, `accessibility`, `privacy`, `booking`

No GitHub settings were changed.

## Truthful maintenance evidence

A fresh read-only GitHub check on 8 September 2026 reconfirmed 17 PRs, all merged, one GitHub-recognized contributor account and remote main still at baseline 6d5c309. These are dated observations, not evidence of independent review. Stars/forks/subscribers were 0/0/0; usage, downloads, lesson bookings and external adoption were not verified. Do not turn an unknown into a zero or infer adoption from tests.

At baseline, main contained 74 commits (19 merge commits), with author dates spanning 23 April–7 September 2026. The authorized maintenance commit adds one real change to that history: 75 commits with maintenance extending to 8 September 2026 once committed. The 74-commit April 23–September 7 figure remains the pre-patch snapshot. Baseline inventory was 131 tracked files, 18 complete public pages, seven blog articles and 29 test files. This patch changes that inventory and adds one Python test file. Current executed results are 73 JavaScript + 138 Python = 211 passing tests, not a coverage percentage.

Concrete maintenance examples: a343be8 (video privacy/accessibility), 45915c0 (shared layout), 030d041 (consent-aware measurement), 7d7e7b4 (booking hardening), 50ab25b (cache compatibility), 6d5c309 (release handoff). AI-assisted work and self-maintenance must not be presented as an independent contributor community.

## Reusable work without inflated claims

- Booking acknowledgement, retry and deduplication patterns: coupled to Google's sandbox, the service schema and allowed origins.
- Consent/conversion tests and failure handling: vendor-specific and requiring each adopter's own privacy review.
- Local in-memory QA harness: useful for safe booking tests, with the documented missing-files limitation.
- Static shared-layout synchronization: uses an explicit page inventory and site-specific fragments.
- Accessibility regression patterns: useful examples, not a general certification tool.

No external reuse was verified. The official [Codex for Open Source application](https://openai.com/form/codex-for-oss/) considers meaningful usage, adoption or ecosystem importance; a documentation patch and passing tests do not establish acceptance. Describe this truthfully as a small service-specific project.
