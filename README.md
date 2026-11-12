# Tarteel House — social media assets

This branch holds the images published on the Tarteel House Instagram account and the small script that makes them. It is separate from `main`: nothing here is part of the website.

- `social/<year-month>/` — the published slides (1080×1350 JPEG), a preview sheet per post, and the captions.
- `generator/` — `build.js` renders slides from a posts file. It needs Chrome, Playwright and the `@fontsource` packages listed in `package.json`.

Rules the generator enforces:

- The only Arabic it will render is the brand verse, and only if it matches the verse on the live site character for character.
- It fails if any text overflows a slide or a brand font does not load.

Every post is drawn from a guide or fact already published on tarteelhouse.com and is approved by the owner before it is scheduled.
