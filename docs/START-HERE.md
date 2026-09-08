# Contributor orientation

Start with [README](../README.md) for architecture, local setup, tests, licensing and release boundaries, then read [CONTRIBUTING](../CONTRIBUTING.md).

## Product sources

- [Commercial facts](commercial-facts.md) is the authoritative source for public service and package claims.
- [Brand rules](brand-rules.md) describes the existing visual identity.
- [Project brief](project-brief.md) explains the parent journey.
- [Decisions](decisions.md) records established business and technical rules.
- [Backend documentation](../apps-script/README.md) describes booking behavior.

Preserve service facts. Every two months, we invite parents to a 15-minute progress review. If a parent is unavailable or does not want a meeting, we send a visual progress report through WhatsApp instead.

## Safe development

Use the loopback QA server with fictional data. Do not send real bookings, notifications or measurement events during development. Never put parent/student records, credentials or private operational reports into source control. Use [SECURITY](../SECURITY.md) for vulnerability reports.

The site is static and deployed through Cloudflare Pages; Apps Script is deployed separately. A local commit is not a deployment. Follow the backend-first release boundary described in README. Internal session and release reports are intentionally absent from the current tree; Git history is retained.
