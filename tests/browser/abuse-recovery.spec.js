'use strict';

const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Route every browser operation through the two local in-memory listeners.
// Evidence records only origin and resource type, never form data or query text.
const test = base.extend({
  networkBoundary: [async ({ context }, use, testInfo) => {
    const blocked = [];
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      const local = url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname) &&
        ['8876', '8877'].includes(url.port);
      if (local) return route.continue();
      blocked.push({ method: request.method(), origin: url.origin, resourceType: request.resourceType() });
      return route.abort('blockedbyclient');
    });
    await use();
    const logPath = testInfo.outputPath('blocked-external-requests.json');
    await fs.writeFile(logPath, JSON.stringify(blocked, null, 2));
    await testInfo.attach('blocked-external-requests', { path: logPath, contentType: 'application/json' });
    await context.unrouteAll({ behavior: 'wait' });
  }, { auto: true }],
});

async function openBooking(page, mode) {
  await page.goto(`/book-trial/?qa_reset=1&qa_mode=${mode}&qa_pixel=stub`);
  await page.getByRole('button', { name: 'Accept measurement', exact: true }).click();
  await page.locator('#child-name').fill('QA Child');
  await page.locator('#child-age').selectOption('8');
  await page.locator('label[for="quran-level-beginner"]').click();
  await page.locator('label[for="session-language-english"]').click();
  await page.locator('#parent-name').fill('QA Parent');
  await page.locator('#country').selectOption('Spain');
  await page.locator('#email').fill('qa.parent@example.invalid');
  await page.locator('#whatsapp').fill('+34 (612) 345-678');
  await page.locator('label[for="preferred-day-mon"]').click();
  await page.locator('label[for="preferred-time-afternoon"]').click();
  await page.locator('#city-region').fill('QA City');
  await page.locator('#notes').fill('Synthetic practical lesson preference');
  await page.locator('#consent').check();
}

async function stats(page) {
  return page.evaluate(async () => {
    const response = await fetch('/__qa/stats');
    if (!response.ok) throw new Error('Local QA statistics unavailable');
    return response.json();
  });
}

async function recover(page) {
  return page.evaluate(async () => {
    const response = await fetch('/__qa/recover', { method: 'POST' });
    if (!response.ok) throw new Error('Local QA recovery unavailable');
    return response.json();
  });
}

async function expectDelta(page, before, delta) {
  await expect.poll(async () => {
    const now = await stats(page);
    return { requests: now.requests - before.requests, rows: now.rows - before.rows, mails: now.mails - before.mails };
  }).toEqual(delta);
}

async function submitBooking(page) {
  const responsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'POST' && url.pathname === '/__qa/booking' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '8876';
  });
  await page.locator('#trial-form button[type="submit"]').click();
  const response = await responsePromise;
  await response.finished();
  expect(response.status()).toBe(200);
}

async function leadCount(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('qa.events') || '[]')
    .filter(event => event.sink === 'openai' && event.args[0] === 'measure' && event.args[1] === 'lead_created').length);
}

// Break caught: a denied request navigates to success, erases editable details,
// remains inert, writes a booking, sends a notification, or emits a conversion.
test('an abuse-blocked request retains the form without a row, mail, or lead conversion', async ({ page }) => {
  await openBooking(page, 'rate-limit');
  const before = await stats(page);
  await submitBooking(page);
  await expect(page.locator('#trial-form-status')).toContainText(/too many new requests/i);
  await expect(page.locator('#trial-form-status')).toContainText(/was not saved/i);
  await expect(page).toHaveURL(/\/book-trial\/(?:[?#].*)?$/);
  await expect(page.locator('#trial-form button[type="submit"]')).toBeEnabled();
  expect(await page.locator('.form-group-section, .form-consent')
    .evaluateAll(groups => groups.every(group => !group.inert))).toBe(true);
  await expect(page.locator('#child-name')).toHaveValue('QA Child');
  await expect(page.locator('#email')).toHaveValue('qa.parent@example.invalid');
  await expect(page.locator('#whatsapp')).toHaveValue('+34 (612) 345-678');
  await expect(page.locator('#notes')).toHaveValue('Synthetic practical lesson preference');
  await expect(page.locator('#consent')).toBeChecked();
  await expectDelta(page, before, { requests: 1, rows: 0, mails: 0 });
  expect(await leadCount(page)).toBe(0);
});

// Break caught: saved mail failures require another submission to send, recover
// before the backoff, duplicate the row, or create another lead conversion.
test('a saved mail failure recovers after fifteen minutes with one row and one delivered mail', async ({ page }) => {
  await openBooking(page, 'mail-failure');
  const before = await stats(page);
  await submitBooking(page);
  await expect(page).toHaveURL(/\/success\/(?:[?#].*)?$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectDelta(page, before, { requests: 1, rows: 1, mails: 0 });
  const failed = await stats(page);
  expect(failed.notifications[before.rows]).toBe('Failed');
  expect(failed.notificationAttempts[before.rows]).toBe(1);
  expect(failed.notificationErrorCodes[before.rows]).toBe('send_failed');
  expect(Date.parse(failed.notificationNextAttemptAt[before.rows]) - Date.parse(failed.now)).toBe(15 * 60000);
  expect(await leadCount(page)).toBe(1);
  const recovered = await recover(page);
  expect(recovered.summary.sent).toBe(1);
  expect(Date.parse(recovered.now) - Date.parse(failed.now)).toBe(15 * 60000);
  expect(recovered.notifications[before.rows]).toBe('Sent');
  expect(recovered.notificationAttempts[before.rows]).toBe(2);
  await expectDelta(page, before, { requests: 1, rows: 1, mails: 1 });
  expect(await leadCount(page)).toBe(1);
  const again = await recover(page);
  expect(again.summary.sent).toBe(0);
  await expectDelta(page, before, { requests: 1, rows: 1, mails: 1 });
});

// Break caught: depleted quota prevents receipt, calls MailApp, consumes an
// attempt, or leaves the pending notification unrecoverable after quota returns.
test('zero quota saves a pending booking without an attempt and recovery delivers it', async ({ page }) => {
  await openBooking(page, 'quota-zero');
  const before = await stats(page);
  await submitBooking(page);
  await expect(page).toHaveURL(/\/success\/(?:[?#].*)?$/);
  await expectDelta(page, before, { requests: 1, rows: 1, mails: 0 });
  const pending = await stats(page);
  expect(pending.notifications[before.rows]).toBe('Pending');
  expect(pending.notificationAttempts[before.rows]).toBe(0);
  expect(pending.notificationErrorCodes[before.rows]).toBe('quota_wait');
  expect(Date.parse(pending.notificationNextAttemptAt[before.rows]) - Date.parse(pending.now)).toBe(15 * 60000);
  const recovered = await recover(page);
  expect(recovered.summary.sent).toBe(1);
  expect(recovered.notifications[before.rows]).toBe('Sent');
  expect(recovered.notificationAttempts[before.rows]).toBe(1);
  await expectDelta(page, before, { requests: 1, rows: 1, mails: 1 });
  expect(await leadCount(page)).toBe(1);
});
