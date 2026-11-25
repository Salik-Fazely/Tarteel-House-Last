# Key Decisions

## Technical decisions
- The site is a static custom-coded HTML/CSS/JS site.
- No frontend framework is currently used.
- The launch booking backend is Google Apps Script, not PHP/MySQL.
- Booking submissions are stored in Google Sheets.
- Booking notifications are emailed to `hello@tarteelhouse.com`.
- `apps-script/*.gs` are the canonical Apps Script sources. Copy all four files into the bound project and redeploy; notification recovery additionally requires an explicitly owner-installed trigger. See the [operating procedure](../apps-script/README.md).
- The owner confirms Cloudflare Pages as the production host, serving static files from the repository root at `www.tarteelhouse.com`. The legacy `CNAME` file does not establish the hosting configuration.
- Local commits are not assumed to be published to the live site.
- See [README](../README.md) for local verification and release boundaries.
- PHP/MySQL may be revisited later, but it is not the launch backend.
- Old addresses (`/pricing`, `/pricing.html`, `/privacy` and the rest of the ten root `.html` names) are permanent 301 redirects in `_redirects`. Cloudflare Pages would otherwise serve the flat `.html` stub for `/pricing`, and the stub's script dropped the query string, so UTM tags, `gclid` and OpenAI's `oppref` were lost and the visit looked direct. A `_redirects` destination never carries its own query string, because that would replace the visitor's. The stubs stay as a fallback for hosts that ignore `_redirects`, keep `location.search` and `location.hash`, and use a meta refresh only inside `<noscript>`.
- `make verify-release` checks one hop of every `_redirects` rule against a deployed origin. Run it on the Cloudflare preview before merging any change to `_redirects`.

## Business identity decisions
- Public contact email: `hello@tarteelhouse.com`.
- Business location: Barcelona, Spain.
- Public WhatsApp / phone used in legal and success CTA: `+34 614 494 311`.
- WhatsApp is the preferred pre-booking question route.

## Booking flow decisions
- Free trial before any payment.
- WhatsApp number is required in the booking form.
- Country is a required dropdown shortlist:
  Germany, France, Netherlands, Belgium, Sweden, Norway, Denmark, Switzerland, Austria, United Kingdom, Ireland, Spain, Italy, Canada, United States, Australia, Other.
  Australia was added because a family there had only Austria and Other to choose from. Add a country only after the backend accepts it.
- City / Region is a required free-text field.
- City / Region replaced the older technical timezone field.
- Preferred days, preferred time, current Qur'an level, and session language are required chip fields.
- No separate teacher-preference field exists; parents can mention a preferred teacher in notes.
- The form ends with one optional question, “How did you hear about us?”. It is the only record of where a family came from that does not depend on measurement consent or on storing anything in the browser, and it also covers word of mouth. It is never required, and the privacy policy lists it.
- Families are normally contacted within two days to arrange the next steps; this is not a guaranteed service-level deadline.
- Success redirect should land on the site's `/success`; verify this near final publish/staging.
- A newly saved booking sends the parent one confirmation email, in English, Persian or Turkish according to the lesson language (Arabic requests receive English). Its wording is fixed in `apps-script/ParentConfirmation.gs`, repeats only [commercial facts](commercial-facts.md), and contains nothing the visitor typed. It is best effort and never retried; `parent_confirmation_status` records the outcome.
- The founder's notification email includes a WhatsApp link that opens the family's chat with a first message drafted in the lesson language. The "normally within two days" wording is unchanged.
- The backend accepts an optional `heard_about` answer (AI assistant, search engine, friend or family, mosque or community, social media, other) and `Australia` as a country. Both are accepted before the form offers them, so the backend can be released first.
- Launch lesson platform copy should say Zoom or Google Meet.

## Product and operations decisions
- Teacher matching is handled personally, not algorithmically.
- Founder-led, intentionally small team.
- Lessons normally continue with the same dedicated teacher, subject to availability and unavoidable changes.
- One package = one child.
- Tarteel House currently serves girls and boys aged 5 to 16 and does not advertise adult classes.
- The free trial and every paid lesson are 40 minutes.
- Every two months, we invite parents to a 15-minute progress review. If a parent is unavailable or does not want a meeting, we send a visual progress report through WhatsApp instead.
- Certificates require at least 30 completed lessons, completion of an identifiable learning stage, and teacher confirmation of that stage.
- Teacher matching considers language, level, learning needs, and scheduling availability. Parents may express a preference but do not select or reserve a teacher.
- Families may request a teacher change; another suitable teacher is proposed subject to availability, without a promise of an immediate replacement or the same schedule.
- Public homepage stats are approved:
  4 Teachers, 1-to-1 Lessons, 4 Teaching languages.

## Pricing decisions
- Starter: EUR 120 / 6 lessons (EUR 20 per lesson).
- Steady: EUR 220 / 12 lessons (approximately EUR 18.33 per lesson), most popular.
- Committed: EUR 400 / 25 lessons (EUR 16 per lesson).
- Every package is valid for one year from the purchase date.
- With at least 24 hours' notice, a lesson is rescheduled without using a make-up allowance.
- Teacher or Tarteel House cancellations or changes are always rescheduled and never use the family's allowance. The new time depends on teacher and family availability.
- The 6-lesson package has no make-up allowance for late-notice or unnotified absences; the missed lesson is counted as used.
- The 12-lesson and 25-lesson packages include up to four make-up lessons, including for absences without prior notice. After all four are used, another late-notice or unnotified absence is counted as used.
- Make-up allowances cover missed scheduled lessons; they are not additional free lessons.
- "Family" was renamed to "Steady" to avoid sibling-sharing confusion.

## Payment decisions
- The on-site payment system is not yet configured.
- The family takes the free trial first. If they continue, Tarteel House confirms the suitable package and shares payment instructions or a secure payment link through WhatsApp.
- Paid lessons are scheduled after payment confirmation.
- Do not publicly name a payment provider or payment method until it is configured and tested.

## Brand and design decisions
- Preserve the current minimal premium editorial design.
- Primary actions use forest green.
- Bronze is used for accents and quiet emphasis.
- Alternating ivory/paper section backgrounds define the layout rhythm.
- Avoid unnecessary redesigns, new style systems, and broad refactors.
- Motion should stay subtle and must respect reduced-motion preferences.

## Legal decisions
- Legal pages exist but still need proper founder/legal review.
- Approved refund wording: "Payments are generally non-refundable once a package has started. Lessons already delivered, missed without the required notice, or cancelled late are not refundable. This policy does not affect any mandatory consumer rights that apply under EU law."
- Earlier plan mentioned iubenda; this remains an option, not a confirmed final legal provider.
- Do not invent legal facts. Use confirmed business details only.

## Language page decisions
- `/fa/` and `/tr/` are single-page language versions of the homepage. Every other page remains English.
- The Turkish page has its own shared fragments, `partials/header-tr.html` and `partials/footer-tr.html`, selected through the `tr` variants in `scripts/sync_shared_layout.py`.
- Because `/tr/` is one page, its header and footer navigation link to sections of that page. Links that leave Turkish for an English-only page are grouped under “İngilizce sayfalar” or labelled “(İngilizce)”, and carry `hreflang="en"`.
- Turkish copy addresses parents formally (“siz”). Package names stay as Starter, Steady and Committed.
- Turkish claims follow [commercial facts](commercial-facts.md) exactly; translate the approved wording rather than adding new promises.
- Every page's header carries a language switch generated by `scripts/sync_shared_layout.py` from its `LANGUAGES` list: a button with a small menu on desktop, and a row at the end of the mobile menu. It is a native `<details>` element and needs no JavaScript. The current language is shown as plain text; the others link to that language's home page.
- To add a language version, add it to `LANGUAGES` and set `language=` on its page in `PAGE_CONFIGS`.
- Still English on language pages: the booking form and success page, the measurement consent banner, and the menu button’s screen-reader label. These come from the booking flow and the shared versioned scripts, so translating them is a separate release.
- `/quran-classes-in-farsi-and-dari/` and `/quran-classes-in-turkish/` are English pages for parents who search in English for lessons in those languages. They repeat facts from the Teachers page and [commercial facts](commercial-facts.md); `tests/language_landing_pages_test.py` fails if a teacher's languages or a price changes in one place only.
- There is no Arabic lessons page yet: one teacher currently teaches in Arabic, so the page would promise more choice than exists.

## Parent guide decisions
- Every guide shows one line under its introduction: “Published by Tarteel House”, the publication date and, when different, the last update date. The same dates appear in the guide's structured data; `tests/guide_bylines_test.py` keeps the two in step.
- A guide's publication date is the day its file first entered this repository's history. Change “Updated” only when the guide's content changes.
- Guides name Tarteel House as publisher in the line under the introduction. Seven guides also carry a “Reviewed by” line in the article body, naming the teacher the owner recorded as reviewer (Sadiah Hamid, Fareshta Suroush or Foruhar Rahmani). Keep those lines; do not add new reviewer or author names, or put them in structured data, unless the owner confirms that teacher reviewed that guide.
- Teacher names are spelled exactly as on the Teachers page.

## Structured data decisions
- Structured data repeats only what a page shows or what [commercial facts](commercial-facts.md) approve: package prices on Pricing, teacher names and languages on Teachers, breadcrumbs on core pages. `tests/structured_data_test.py` compares each with its source.
- The organisation record links the Instagram profile through `sameAs`. Add other profiles there only once they exist and are in use.
- Still excluded: postal address, ratings, reviews, awards and price ranges.

## Open decisions
- The existing `assets/images/tarteel-house-social-card.png` is the current shared social preview asset; verify its published delivery after deployment.
- The owner-run live booking, notification and advertising-delivery test remains unverified. Local verification is not proof of production behaviour.
