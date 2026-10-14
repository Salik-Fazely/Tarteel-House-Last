'use strict';

const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Exercise the real browser and backend only through the local QA listeners.
// Persist no form bodies or query strings in the network evidence artifact.
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const submitButton = page => page.locator('#trial-form button[type="submit"]');
const status = page => page.locator('#trial-form-status');

async function openBooking(page, mode = 'success', measurement = 'Reject measurement') {
  await page.goto(`/book-trial/?qa_reset=1&qa_mode=${mode}&qa_pixel=stub`);
  await page.getByRole('button', { name: measurement, exact: true }).click();
}

async function fillBooking(page, phone = '+34 (612) 345-678') {
  await page.locator('#child-name').fill('QA Child');
  await page.locator('#child-age').selectOption('8');
  await page.locator('label[for="quran-level-beginner"]').click();
  await page.locator('label[for="session-language-english"]').click();
  await page.locator('#parent-name').fill('QA Parent');
  await page.locator('#country').selectOption('Spain');
  await page.locator('#email').fill('qa.parent@example.invalid');
  await page.locator('#whatsapp').fill(phone);
  await page.locator('label[for="preferred-day-mon"]').click();
  await page.locator('label[for="preferred-time-afternoon"]').click();
  await page.locator('#city-region').fill('QA City');
  await page.locator('#notes').fill('Original practical lesson preference');
  await page.locator('#consent').check();
}

async function stats(page) {
  return page.evaluate(async () => {
    const response = await fetch('/__qa/stats');
    if (!response.ok) throw new Error('Local QA statistics unavailable');
    const { requests, rows, mails } = await response.json();
    return { requests, rows, mails };
  });
}

async function expectDelta(page, before, delta) {
  await expect.poll(async () => {
    const now = await stats(page);
    return { requests: now.requests - before.requests, rows: now.rows - before.rows, mails: now.mails - before.mails };
  }).toEqual(delta);
}

function isBookingPost(response) {
  const url = new URL(response.url());
  return response.request().method() === 'POST' && url.pathname === '/__qa/booking' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '8876';
}

async function submitBooking(page) {
  const responsePromise = page.waitForResponse(isBookingPost);
  await submitButton(page).click();
  const response = await responsePromise;
  await response.finished();
  expect(response.status()).toBe(200);
  return new URLSearchParams(response.request().postData());
}

async function setMode(page, mode) {
  const evidence = page.locator('#qa-evidence');
  if (!(await evidence.evaluate(element => element.open))) await evidence.locator('summary').click();
  await page.getByLabel('Local QA response mode').selectOption(mode);
}

async function expectUnlocked(page) {
  await expect(submitButton(page)).toBeEnabled();
  expect(await page.locator('.form-group-section, .form-consent').evaluateAll(groups => groups.every(group => !group.inert))).toBe(true);
}

async function loseAcknowledgment(page, before) {
  const first = await submitBooking(page);
  await expectDelta(page, before, { requests: 1, rows: 1, mails: 1 });
  await expect(status(page)).toContainText('Sending your request');
  await page.clock.fastForward(30001);
  await expect(status(page)).toContainText('could not confirm receipt');
  await expectUnlocked(page);
  await expect(page.locator('#submission-id')).toHaveValue(first.get('submission_id'));
  return first;
}

// Removing phone validation would permit malformed contact details to leave the
// browser; native validation must stop the POST before the enhanced submit runs.
test('invalid WhatsApp numbers block native booking POSTs', async ({ page }) => {
  await openBooking(page, 'wrong-token');
  await fillBooking(page);
  const before = await stats(page);
  for (const phone of ['612345678', 'nonsense', '+34 612345678 ext 2', '+34ABC612345678', '+34+612345678', '+0012345678', '+34000']) {
    await page.locator('#whatsapp').fill(phone);
    await submitButton(page).click();
    expect(await page.locator('#whatsapp').evaluate(element => element.validity.valid), `reject ${phone}`).toBe(false);
    await expect(page.locator('#whatsapp')).toBeFocused();
    await expectDelta(page, before, { requests: 0, rows: 0, mails: 0 });
    await expect(submitButton(page)).toBeEnabled();
  }
});

// Losing maxlength or a described hint admits oversized input or hides guidance
// from assistive technology. Inspect live DOM behavior, not source text.
test('contact fields enforce native length limits and expose associated guidance', async ({ page }) => {
  await openBooking(page);
  for (const [selector, limit] of [
    ['#child-name', 100], ['#parent-name', 100], ['#city-region', 120],
    ['#email', 254], ['#whatsapp', 40], ['#notes', 2000],
  ]) {
    const field = page.locator(selector);
    expect(await field.evaluate(element => element.maxLength), selector).toBe(limit);
    await field.fill('Q'.repeat(limit + 1));
    expect((await field.inputValue()).length, `native user input respects ${selector} limit`).toBe(limit);
  }
  for (const [selector, guidance] of [['#whatsapp', /country code/i], ['#notes', /sensitive information/i]]) {
    const description = await page.locator(selector).getAttribute('aria-describedby');
    expect(description, `${selector} describes its guidance`).toBeTruthy();
    const hints = page.locator(description.trim().split(/\s+/).map(id => `[id="${id}"]`).join(', '));
    await expect(hints).toContainText(guidance);
    for (const hint of await hints.all()) await expect(hint).toBeVisible();
  }
});

// Disabling form fields would silently omit them from native serialization;
// omitting inert would let the pending form drift from the submitted details.
test('pending booking freezes editable groups while native POST includes every field', async ({ page }) => {
  await openBooking(page, 'wrong-token');
  await fillBooking(page, '0034 (612) 345-678');
  await page.locator('label[for="preferred-day-wed"]').click();
  await page.clock.install();
  const before = await stats(page);
  const sent = await submitBooking(page);
  await expectDelta(page, before, { requests: 1, rows: 1, mails: 1 });
  expect(Object.fromEntries(sent)).toMatchObject({
    source: 'website', child_name: 'QA Child', child_age: '8', quran_level: 'complete-beginner',
    session_language: 'english', parent_name: 'QA Parent', country: 'Spain',
    email: 'qa.parent@example.invalid', whatsapp: '0034 (612) 345-678', preferred_time: 'afternoon',
    city_region: 'QA City', notes: 'Original practical lesson preference', consent: 'yes', website_field: '',
  });
  expect(sent.getAll('preferred_days')).toEqual(['mon', 'wed']);
  expect(sent.get('submission_id')).toMatch(UUID);
  expect(sent.get('response_token')).toMatch(UUID);
  const redirect = new URL(sent.get('success_redirect'));
  expect(redirect.origin).toBe('http://127.0.0.1:8876');
  expect(redirect.pathname).toBe('/success/');
  expect(await page.locator('.form-group-section, .form-consent').evaluateAll(groups => groups.every(group => group.inert))).toBe(true);
  expect(await page.locator('#trial-form input:disabled, #trial-form select:disabled, #trial-form textarea:disabled, #trial-form fieldset:disabled').count()).toBe(0);
  await expect(submitButton(page)).toBeDisabled();
  await page.locator('#child-name').evaluate(element => element.focus());
  await expect(page.locator('#child-name')).not.toBeFocused();
  await expect(status(page)).toBeVisible();
  for (const selector of ['#trial-form-status', '#trial-form-help']) {
    expect(await page.locator(selector).evaluate(element => Boolean(element.closest('[inert]'))), `${selector} remains outside frozen groups`).toBe(false);
  }
  await page.clock.fastForward(30001);
  await expectUnlocked(page);
  const help = page.locator('#trial-form-help a');
  await expect(help).toBeVisible();
  await help.focus();
  await expect(help).toBeFocused();
});

// Recreating the UUID after a lost acknowledgment duplicates rows/mail; reusing
// the old nonce lets a stale response settle a later attempt.
test('retrying an unchanged saved booking reaches success with one row and notification', async ({ page }) => {
  await openBooking(page, 'wrong-token');
  await fillBooking(page);
  await page.clock.install();
  const before = await stats(page);
  const first = await loseAcknowledgment(page, before);
  await setMode(page, 'success');
  const retry = await submitBooking(page);
  expect(retry.get('submission_id')).toBe(first.get('submission_id'));
  expect(retry.get('response_token')).not.toBe(first.get('response_token'));
  expect(retry.get('response_token')).toMatch(UUID);
  await expect(page).toHaveURL(/\/success\/(?:[?#].*)?$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectDelta(page, before, { requests: 2, rows: 1, mails: 1 });
});

// Treating an edited retry as a receipt falsely claims its new details saved
// and emits a conversion. The saved fingerprint must cause a correction route.
test('editing a saved booking after timeout reports an unsaved conflict without a conversion', async ({ page }) => {
  await openBooking(page, 'wrong-token', 'Accept measurement');
  await fillBooking(page);
  await page.clock.install();
  const before = await stats(page);
  const first = await loseAcknowledgment(page, before);
  await page.locator('#whatsapp').fill('+34 (612) 345-679');
  await page.locator('label[for="preferred-day-mon"]').click();
  await page.locator('label[for="preferred-day-tue"]').click();
  await page.locator('#notes').fill('Edited practical lesson preference');
  await setMode(page, 'success');
  const retry = await submitBooking(page);
  expect(retry.get('submission_id')).toBe(first.get('submission_id'));
  expect(retry.get('response_token')).not.toBe(first.get('response_token'));
  expect(retry.get('whatsapp')).toBe('+34 (612) 345-679');
  expect(retry.getAll('preferred_days')).toEqual(['tue']);
  expect(retry.get('notes')).toBe('Edited practical lesson preference');
  await expect(status(page)).toContainText(/original request was already received/i);
  await expect(status(page)).toContainText(/changes were not saved/i);
  await expect(page).toHaveURL(/\/book-trial\/(?:[?#].*)?$/);
  await expectUnlocked(page);
  const help = page.locator('#trial-form-help a');
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute('href', 'https://wa.me/34614494311');
  await help.focus();
  await expect(help).toBeFocused();
  await expectDelta(page, before, { requests: 2, rows: 1, mails: 1 });
  const conversionCount = await page.evaluate(() => JSON.parse(sessionStorage.getItem('qa.events') || '[]')
    .filter(event => event.sink === 'openai' && event.args[0] === 'measure' && event.args[1] === 'lead_created').length);
  expect(conversionCount).toBe(0);
});

// A failed first sheet write creates no saved fingerprint: edits with the same
// UUID must save normally, rather than becoming a false duplicate conflict.
test('editing an unsaved booking after a sheet error saves the corrected retry', async ({ page }) => {
  await openBooking(page, 'sheet-failure');
  await fillBooking(page);
  const before = await stats(page);
  const first = await submitBooking(page);
  await expect(status(page)).toContainText(/could not complete your booking request/i);
  await expectUnlocked(page);
  await expectDelta(page, before, { requests: 1, rows: 0, mails: 0 });
  await page.locator('#whatsapp').fill('+34 (612) 345-679');
  await page.locator('label[for="preferred-day-mon"]').click();
  await page.locator('label[for="preferred-day-tue"]').click();
  await page.locator('#notes').fill('Corrected practical lesson preference');
  await setMode(page, 'success');
  const retry = await submitBooking(page);
  expect(retry.get('submission_id')).toBe(first.get('submission_id'));
  expect(retry.get('response_token')).not.toBe(first.get('response_token'));
  expect(retry.get('whatsapp')).toBe('+34 (612) 345-679');
  expect(retry.getAll('preferred_days')).toEqual(['tue']);
  expect(retry.get('notes')).toBe('Corrected practical lesson preference');
  await expect(page).toHaveURL(/\/success\/(?:[?#].*)?$/);
  await expectDelta(page, before, { requests: 2, rows: 1, mails: 1 });
});

// Native forms expand textarea LF into CRLF. A valid maxlength-sized note
// must remain valid on the server after that transport transformation.
test('a 2000-character multiline note saves after native CRLF serialization', async ({ page }) => {
  await openBooking(page);
  await fillBooking(page);
  const notes = 'Q'.repeat(1998) + '\nZ';
  await page.locator('#notes').fill(notes);
  expect((await page.locator('#notes').inputValue()).length).toBe(2000);
  const before = await stats(page);
  const sent = await submitBooking(page);
  expect(sent.get('notes')).toBe('Q'.repeat(1998) + '\r\nZ');
  expect(sent.get('notes').length).toBe(2001);
  await expect(page).toHaveURL(/\/success\/(?:[?#].*)?$/);
  await expectDelta(page, before, { requests: 1, rows: 1, mails: 1 });
});
