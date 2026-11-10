'use strict';

const { test, expect } = require('@playwright/test');

// Cloudflare answers old addresses from `_redirects` before any file is
// served. These stubs are the fallback for hosts that ignore that file; they
// must keep tracking parameters and the anchor so a visit is not misattributed.
const STUBS = {
  '/pricing.html': '/pricing/',
  '/privacy.html': '/privacy-policy/',
  '/book-trial.html': '/book-trial/',
  '/teachers.html': '/teachers/',
};
const TRACKING = '?utm_source=chatgpt.com&utm_medium=referral&gclid=test-click&oppref=test-ref';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    const local = url.hostname === '127.0.0.1' && ['8876', '8877'].includes(url.port);
    return local ? route.continue() : route.abort('blockedbyclient');
  });
});

for (const [stub, destination] of Object.entries(STUBS)) {
  test(`${stub} keeps the query string and anchor on its way to ${destination}`, async ({ page }) => {
    await page.goto(`${stub}${TRACKING}#questions`);
    await expect(page).toHaveURL(url => url.pathname === destination);
    const landed = new URL(page.url());
    expect(landed.search).toBe(TRACKING);
    expect(landed.hash).toBe('#questions');
  });
}
