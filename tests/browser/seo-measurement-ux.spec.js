'use strict';

const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    const local = url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname) &&
      ['8876', '8877'].includes(url.port);
    return local ? route.continue() : route.abort('blockedbyclient');
  });
});

test('?lang= pre-selects session_language on the local QA booking form without breaking invalid values', async ({ page }) => {
  for (const [query, expectedId] of [
    ['persian', '#session-language-persian'],
    ['turkish', '#session-language-turkish'],
    ['arabic', '#session-language-arabic'],
    ['english', '#session-language-english'],
    ['farsi', '#session-language-persian'],
    ['dari', '#session-language-persian'],
  ]) {
    await page.goto(`/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=stub&lang=${query}`);
    await expect(page.locator(expectedId)).toBeChecked();
  }

  await page.goto('/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=stub&lang=unknown');
  expect(await page.locator('input[name="session_language"]:checked').count()).toBe(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`consent banner keeps equal Accept/Reject prominence and compact layout at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?qa_reset=1&qa_pixel=stub');

    const banner = page.locator('#analytics-consent');
    const accept = page.getByRole('button', { name: 'Accept measurement', exact: true });
    const reject = page.getByRole('button', { name: 'Reject measurement', exact: true });

    await expect(banner).toBeVisible();
    await expect(accept).toBeVisible();
    await expect(reject).toBeVisible();

    const [bannerBox, acceptBox, rejectBox] = await Promise.all([
      banner.boundingBox(),
      accept.boundingBox(),
      reject.boundingBox(),
    ]);
    expect(Math.abs(acceptBox.width - rejectBox.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(acceptBox.height - rejectBox.height)).toBeLessThanOrEqual(2);
    expect(acceptBox.height).toBeGreaterThanOrEqual(44);
    expect(rejectBox.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(acceptBox.y - rejectBox.y)).toBeLessThanOrEqual(2);

    if (viewport.width === 390) {
      expect(bannerBox.height).toBeLessThanOrEqual(240);
    }

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('whatsapp_click stays disabled until measurement consent is granted', async ({ page }) => {
  await page.goto('/pricing/?qa_reset=1&qa_pixel=stub');
  // Prevent opening external WhatsApp tab while exercising the real document click listener.
  await page.evaluate(() => {
    document.addEventListener('click', event => {
      if (event.target.closest('a[href^="https://wa.me/"]')) event.preventDefault();
    }, true);
  });

  const waLink = page.locator('.final-cta__secondary-link');
  await expect(waLink).toHaveAttribute('href', /^https:\/\/wa\.me\/34614494311\?text=/);
  await waLink.click();

  const beforeConsent = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('qa.events') || '[]')
      .filter(entry => entry.sink === 'ga4' && entry.args[0] === 'event' && entry.args[1] === 'whatsapp_click'));
  expect(beforeConsent).toEqual([]);

  await page.getByRole('button', { name: 'Accept measurement', exact: true }).click();
  await waLink.click();

  await expect.poll(async () => page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('qa.events') || '[]')
      .filter(entry => entry.sink === 'ga4' && entry.args[0] === 'event' && entry.args[1] === 'whatsapp_click')
      .map(entry => entry.args[2]))).toEqual([{ source_path: '/pricing/', page_language: 'en' }]);
});
