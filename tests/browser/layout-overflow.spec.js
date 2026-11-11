'use strict';

const { test, expect } = require('@playwright/test');

// Pages must never scroll sideways. 320px is the narrowest phone in use;
// 940px sits between the tablet and desktop price-grid breakpoints, where
// three price cards once added up to 980px.
const PAGES = ['/', '/pricing/', '/tr/', '/fa/', '/teachers/', '/book-trial/'];
const WIDTHS = [320, 390, 940, 1280];

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    const local = url.hostname === '127.0.0.1' && ['8876', '8877'].includes(url.port);
    return local ? route.continue() : route.abort('blockedbyclient');
  });
});

for (const width of WIDTHS) {
  test(`no sideways scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PAGES) {
      await page.goto(path);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}
