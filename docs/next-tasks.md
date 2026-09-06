# Next Tasks

See the [conversion sprint report](../ASTRA_CONVERSION_SPRINT_REPORT.md) for the latest local findings, corrections, and verification evidence.

## Open production booking checks

1. Review the local booking changes in the sprint report before deployment.
2. With authorization for a real test submission, confirm which `apps-script/Code.gs` version is deployed and verify:
   - A Google Sheet row is created.
   - The email notification arrives at `hello@tarteelhouse.com`.
   - Reply-To is the parent's email.
   - The parent lands on `/success` only after successful completion.
3. Verify `hello@tarteelhouse.com` inbox access and deliverability.

## Social preview verification

4. Verify the existing `assets/images/tarteel-house-social-card.png` is served by the published site and used for shared page previews.

## Pre-release polish

5. Complete founder/legal review of `/privacy-policy` and `/terms`.
6. Confirm the WhatsApp link and public phone number work on mobile and desktop.
7. Run final mobile and desktop QA after an authorized publication.

## Hosting

8. Keep Cloudflare Pages as the owner-confirmed production host, serving the repository root at `www.tarteelhouse.com`. Do not infer hosting configuration from the legacy `CNAME` file.
9. After an authorized publication, test the live domain, SSL, links, and approved non-booking interactions. Do not assume local commits are already live.

## Later work

10. Configure and test the intended on-site secure payment flow separately. Until that is complete, keep the approved journey: confirm the package after the free trial, share payment instructions or a secure payment link through WhatsApp, and schedule paid lessons after payment confirmation.
11. Consider further booking backend or admin improvements after the outstanding production checks are resolved.
