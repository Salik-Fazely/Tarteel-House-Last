# Security reporting

## Report privately

Send an initial sanitized report to **hello@tarteelhouse.com**, the project's existing contact address, with the subject **Security report: Tarteel House**. Do not open a public issue containing exploit details or personal information. If GitHub offers private vulnerability reporting for this repository, that is also an option; this document does not imply the feature is enabled.

Include:

- The affected page, component and commit, if known.
- A concise description of the issue and potential impact.
- Minimal reproduction steps using fictional data in the local QA environment.
- Relevant redacted error messages and whether the issue was observed locally or on the live site.

Do not include passwords, tokens, private resource links, parent/student records, booking exports or unredacted screenshots. Start with a summary; ask the maintainer for a suitable private channel before transferring material that requires stricter handling. This address is not a dedicated encrypted submission service.

## Testing boundaries

Use the local mock server described in [README.md](README.md#run-locally). Do not access or modify other people's records, enumerate private documents, send real trial requests or notifications, or test resource exhaustion against production. Stop if you encounter personal data, and describe the location privately without copying the data.

Public source code, a web-app URL or a measurement identifier does not authorize access to backend data or third-party accounts. Keep reproduction work within resources you own or have explicit permission to test.

## Handling and supported code

This project is maintained on `main`; it has no published version-support matrix or promised backport policy. When reporting a problem, state the exact revision rather than assuming every historical deployment is supported.

The reporting process is private triage, a focused fix where appropriate, local verification, and coordination with the reporter before publishing sensitive details. No response-time guarantee, bounty, legal safe-harbor commitment or security certification is offered by this document.

Coordinate disclosure with the maintainer. A public fix or advisory should explain the problem and remediation without revealing credentials, child/parent information or private operational configuration.
