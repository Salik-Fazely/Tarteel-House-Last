# AGENTS.md

## Project overview

Tarteel House is a modern online Quran learning platform for Muslim families in Europe and the US.

The platform offers live 1-on-1 Quran classes for children ages 5–16, with a first free trial session. The brand should feel premium but warm, trustworthy, child-friendly, minimal, and accessible.

The business goal of the website is to convert parent visitors into free trial bookings.

## Strategic order

Always think in this order before changing copy, layout, pricing, or website structure:

1. Positioning
2. Messaging
3. Offer
4. Website implementation
5. QA and launch checks

Do not jump into design or code before understanding the business purpose of the change.

## Positioning

Ideal customer:
- Muslim parents in Europe and the US
- Parents who want their children to learn Quran reading, tajweed, memorization, and Quranic character
- Parents who want a safe, structured, warm, and reliable online Quran learning experience

Main alternative options parents may compare against:
- Local mosque classes
- Random private Quran tutors
- Large generic online Quran academies
- YouTube/self-learning
- Weekend Islamic schools

Tarteel House should be positioned as:
A warm, structured, trustworthy 1-on-1 online Quran learning platform for Muslim children.

## Messaging rules

The parent is the hero.
Tarteel House is the trusted guide.

The message should be simple:
- Your child can learn Quran with care, structure, and confidence.
- Live 1-on-1 classes.
- Qualified female teachers.
- Flexible online learning.
- Monthly progress updates.
- Free trial first.

Avoid complicated religious, technical, or academic language.
Avoid sounding too corporate.
Avoid sounding too cheap or discount-driven.

## Offer rules

Current offer:
- Live 1-on-1 Quran classes
- First session free
- Personalized learning
- Structured curriculum
- Quran reading, tajweed, memorization, and character building
- Monthly progress reports
- End-of-course certificate
- 4 make-up classes in case of absence
- Extra educational videos
- VIP access to course details

Pricing direction:
- €120 for 6 classes
- €220 for 12 classes
- €400 for 25 classes

Do not change pricing without explicit approval.
Do not add fake scarcity, fake guarantees, or unrealistic claims.

## Brand rules

Brand personality:
- Warm
- Premium
- Calm
- Trustworthy
- Parent-friendly
- Child-friendly
- Minimal
- Modern

Avoid:
- Overly colorful childish design
- Harsh Islamic school tone
- Cheap marketplace feeling
- Overpromising results
- Aggressive sales language

## Teacher rules

Teacher display names:
- Sadiah Hamid
- Farkhonda Jami
- Fareshta Suroush
- Forouhar Rahmani

Teacher details:
- Sadiah Hamid: 9 years experience, English and Arabic, Hifz, Tajweed, voice/recitation
- Farkhonda Jami: 3 years experience, Turkish and Persian, Hifz and Tajweed
- Fareshta Suroush: 9 years experience, English and Turkish, Hifz and Tajweed
- Forouhar Rahmani: 9 years experience, English and Persian, Tajweed

Do not mention preferred student age groups on teacher profiles.
Teacher photos may not be available.
Do not create designs that depend on face photos.
Use trust signals, qualifications, language ability, teaching style, and experience instead.

## Website pages

Preserve these URLs:

- /
- /about/
- /teachers/
- /pricing/
- /how-it-works/
- /book-trial/
- /success/
- /privacy/
- /terms/

If the project already uses these variants, preserve them too:
- /privacy-policy/
- /terms/

Do not rename URLs without approval.

## Main CTA

The main CTA is always:

Book a Free Trial

Secondary CTAs can be:
- Meet Our Teachers
- See Pricing
- How It Works

Do not make payment the first CTA.
Do not push direct checkout before trust is built.

## Technical rules

Keep the website simple and maintainable.

Do not add new dependencies unless explicitly approved.
Do not rewrite the whole project unless explicitly asked.
Do not change the stack unless explicitly approved.
Do not remove existing pages.
Do not delete files unless explicitly approved.
Do not change legal, payment, booking, or privacy behavior without approval.

Use existing CSS variables and design patterns when possible.
Keep HTML semantic and accessible.
Make all changes mobile-first.
Test desktop, tablet, and mobile.

## Booking form rules

The booking form is important and must not be broken.

The booking flow should:
1. Let parent submit a free trial request
2. Send/store submission correctly
3. Redirect to the website success page
4. Not lose user data
5. Not show technical Apps Script pages to the user

Eventually the Apps Script booking form should redirect to the website's own success.html or /success/ page instead of the Apps Script success page.

Do not change the Apps Script endpoint without approval.
Do not expose private keys or secrets.
Do not hardcode sensitive credentials.

## SEO rules

Each public page should have:
- Unique title
- Unique meta description
- Clear H1
- Good internal links
- Main CTA
- Parent-focused copy

SEO should target parents searching for online Quran classes for children, Quran tutor for kids, tajweed for children, Quran memorization for kids, and Muslim children’s Quran learning.

Avoid keyword stuffing.

## QA checklist

After any code change, check:

- Homepage loads
- Navigation works
- Mobile layout works
- Tablet layout works
- Desktop layout works
- CTA buttons work
- Booking form works
- Success page works
- No console errors
- No broken internal links
- No accidental horizontal scrolling
- No layout overlap
- No missing alt text for important images
- No broken video embeds
- No pricing inconsistency
- No teacher information inconsistency

## Done means

A task is done only when:

1. The requested change is implemented
2. The site still builds/runs
3. The changed pages are manually reviewed
4. Mobile, tablet, and desktop are checked
5. A summary of changed files is provided
6. Risks and manual checks are listed

## Response format after changes

After every task, summarize:

1. What changed
2. Files changed
3. Why each file changed
4. How it was tested
5. Risks
6. What Salik should manually check