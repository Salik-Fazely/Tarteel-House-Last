# Tarteel House Project Brief

## What Tarteel House is
Tarteel House is a premium online Qur'an learning service for Muslim families. It offers one-to-one Qur'an sessions for children with a dedicated teacher, a calm matching process, and a free trial before any payment.

## Target audience
The primary audience is Muslim parents and guardians of children, mainly in Europe and North America, who want careful online Qur'an teaching that feels personal, trustworthy, and easy to manage around family life.

## Offer
- Free trial session first.
- One dedicated teacher per child.
- Teacher matching handled personally, not algorithmically.
- Session bundles after the trial: Starter, Steady, and Committed.
- Parent-friendly communication, currently centered on WhatsApp.

## Positioning
Tarteel House should feel minimal, premium, warm, and parent-friendly. The site should communicate care, structure, and trust before conversion. It should not feel like a loud tutoring marketplace or a generic online course product.

## Trust-first funnel
1. Homepage builds confidence through the brand verse, clear promise, trust stats, teacher preview, process preview, pricing preview, testimonials, and final CTA.
2. Parents browse the process, teachers, pricing, and about pages.
3. Parents book a free trial through `book-trial.html`.
4. The form posts to Google Apps Script, saves to Google Sheets, and sends a notification to `hello@tarteelhouse.com`.
5. A colleague follows up with the parent on WhatsApp within one to two working days.
6. Parent makes sure they can join on Zoom or Google Meet before the trial.

## Current stack
- Frontend: static custom HTML, CSS, and JavaScript.
- Styling: one global stylesheet at `assets/css/styles.css`.
- JavaScript: `assets/js/main.js` plus small inline booking-form script on `book-trial.html`.
- Booking backend for launch: Google Apps Script.
- Booking storage: Google Sheets.
- Notification inbox: `hello@tarteelhouse.com`.
- Hosting target: Hostinger / `tarteelhouse.com`.

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
