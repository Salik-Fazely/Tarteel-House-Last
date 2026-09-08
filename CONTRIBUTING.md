# Contributing to Tarteel House

Thank you for helping maintain the website. Keep changes small, reproducible and respectful of the families using the service.

## Before starting

- Check existing issues and recent work before opening a duplicate report. Describe a concrete problem rather than creating activity for its own sake.
- Discuss substantial features or changes to service facts with the maintainer first. Do not invent pricing, policies, qualifications, testimonials or usage statistics.
- Source-code contributions within the scope of [LICENSE](LICENSE) must be available under MIT. Only offer work you authored or are authorized to provide; identify third-party sources and their terms. Brand assets and non-code content remain excluded. Discuss rights separately before proposing new artwork or content.
- Report security issues privately using [SECURITY.md](SECURITY.md), not a public issue.

## Workflow

1. Work in a fork or a separate branch, for example `codex/fix-booking-label`. Preserve unrelated working-tree changes. Never use production `main` as an experiment branch.
2. Start the local mock environment with `node scripts/qa_server.js`, as described in [README.md](README.md#run-locally). Use fictional data and `qa.parent@example.invalid` only.
3. Make the smallest complete change. Keep the static-site architecture and existing conventions. Avoid new dependencies without a concrete need.
4. Add or update relevant behavioral tests. For visual or interaction changes, inspect the actual page at desktop and mobile sizes, including keyboard focus and form errors.
5. Run the full commands in [README.md](README.md#run-tests), the shared-layout check and `git diff --check`. Report failures or environment limitations honestly.
6. Review your diff and staged files. Exclude credentials, data exports, private operational notes, screenshots with personal information and unrelated changes. Do not use a blanket add operation without reviewing its contents.
7. Open a pull request against `main` with the problem, resulting behavior, tests executed and any remaining limits. Do not claim real booking delivery or Ads attribution from local mocks.

## Shared layout and asset changes

Edit canonical fragments under `partials/` when changing shared navigation or footers, then synchronize:

```sh
python scripts/sync_shared_layout.py --write
python scripts/sync_shared_layout.py --check
```

Review all generated page changes. For a new page, update the page inventory and related tests intentionally. Keep changed CSS/consent/analytics asset versions consistent across pages; `tests/asset_versioning_test.py` checks the current release references.

## Booking and measurement changes

Test validation, successful persistence, failed persistence, retry, duplicate callbacks and consent choices with local mocks. Analytics or storage failures must not break booking. Do not log or attach form values, and do not relax origin, token or consent checks to make a test pass.

The local harness cannot prove Google's live sandbox behavior, backend permissions, mail delivery or advertising-platform receipt. Its missing-measurement-file scenario has a documented versioned-URL limitation; do not report that scenario as passing until corrected.

## Review and release

The maintainer decides whether to merge and release. Frontend pushes can trigger Cloudflare Pages; Apps Script uses a separate deployment. Changes requiring a new backend protocol must be released backend-first. Do not deploy, alter production settings or submit a live test booking as part of an ordinary contribution.

There is no promised review or release deadline. Small, well-explained contributions with evidence are easier to assess. Do not submit generated issues, trivial commits or misleading metrics to inflate project activity.
