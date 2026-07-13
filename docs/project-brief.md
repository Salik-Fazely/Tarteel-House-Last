# Tarteel House Project Brief

## What Tarteel House is
Tarteel House is a premium online Qur'an learning service for Muslim families. It offers one-to-one Qur'an sessions for children with a dedicated teacher, a calm matching process, and a free trial before any payment.

## Target audience
The primary audience is Muslim parents and guardians of girls and boys aged 5 to 16, mainly in Europe and North America. Tarteel House does not currently offer adult classes.

## Offer
- Free 40-minute trial session first; every paid lesson is also 40 minutes.
- One dedicated teacher per child.
- Teacher matching handled personally based on language, level, learning needs, and scheduling availability. Parents may express a preference but do not select or reserve a teacher.
- Packages after the trial: EUR 120 / 6 lessons, EUR 220 / 12 lessons, and EUR 400 / 25 lessons, each valid for one year from the purchase date.
- Every two months, we invite parents to a 15-minute progress review. If a parent is unavailable or does not want a meeting, we send a visual progress report through WhatsApp instead.
- Parent-friendly communication, currently centered on WhatsApp.

## Positioning
Tarteel House should feel minimal, premium, warm, and parent-friendly. The site should communicate care, structure, and trust before conversion. It should not feel like a loud tutoring marketplace or a generic online course product.

## Trust-first funnel
1. Homepage builds confidence through the brand verse, clear promise, trust stats, teacher preview, process preview, pricing preview, testimonials, and final CTA.
2. Parents browse the process, teachers, pricing, and about pages.
3. Parents book a free trial through `/book-trial`.
4. The form posts to Google Apps Script, saves to Google Sheets, and sends a notification to `hello@tarteelhouse.com`.
5. Tarteel House contacts the parent on WhatsApp within two days; the team may also respond on weekends.
6. Parent makes sure they can join on Zoom or Google Meet before the trial.
7. If the family continues after the trial, Tarteel House confirms the suitable package and sends payment instructions or a secure payment link through WhatsApp.
8. Paid lessons are scheduled after payment confirmation.

## Current stack
- Frontend: static custom HTML, CSS, and JavaScript.
- Styling: one global stylesheet at `assets/css/styles.css`.
- JavaScript: `assets/js/main.js` plus small inline booking-form script on `/book-trial`.
- Booking backend for launch: Google Apps Script.
- Booking storage: Google Sheets.
- Notification inbox: `hello@tarteelhouse.com`.
- Hosting target: Hostinger / `www.tarteelhouse.com`.

## Decision priorities
1. Trust
2. Clarity
3. Premium feel
4. Practical launch readiness
5. Simplicity
6. Maintainability
7. Conversion

## How future AI should help
Act like a careful senior engineer and product partner. Preserve the current look and feel. Prefer small, practical completion steps over broad redesigns. Ask only when a business fact is genuinely unknown.
