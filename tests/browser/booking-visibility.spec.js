'use strict';

const { test: base, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

// Every browser request, including fonts and measurement SDKs, must stay on
// the two local QA listeners. The server uses an in-memory sheet/mail sink.
const test = base.extend({
  networkBoundary: [async ({ context }, use, testInfo) => {
    const blocked = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const local = url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost'].includes(url.hostname) &&
        ['8876', '8877'].includes(url.port);
      if (local) return route.continue();
      blocked.push({ method: route.request().method(), url: url.href });
      return route.abort('blockedbyclient');
    });
    await use();
    const logPath = testInfo.outputPath('blocked-external-requests.json');
    await fs.writeFile(logPath, JSON.stringify(blocked, null, 2));
    await testInfo.attach('blocked-external-requests', { path: logPath, contentType: 'application/json' });
    await context.unrouteAll({ behavior: 'wait' });
  }, { auto: true }],
});

async function openBooking(page) {
  await page.goto('/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=stub');
  const reject = page.getByRole('button', { name: 'Reject measurement', exact: true });
  if (await reject.count()) await reject.click();
}

async function paintState(control) {
  return control.evaluate(element => {
    let opacity = 1;
    let current = element;
    const ancestors = [];
    while (current) {
      const style = getComputedStyle(current);
      opacity *= Number(style.opacity);
      if (style.display === 'none' || style.visibility !== 'visible') opacity = 0;
      ancestors.push({ tag: current.tagName, className: current.className, opacity: style.opacity });
      current = current.parentElement;
    }
    const rect = element.getBoundingClientRect();
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0;
    const atCenter = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      opacity,
      ancestors,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      headerBottom,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      centerUncovered: atCenter === element || element.contains(atCenter),
    };
  });
}

async function scrollControlIntoView(page, control) {
  // Wheel events use the browser's actual scrolling and IntersectionObserver.
  // No observer, geometry, visibility style, or reveal class is replaced.
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await paintState(control);
    const inView = value => value.y >= value.headerBottom &&
      value.bottom <= value.viewportHeight && value.centerUncovered;
    if (inView(state)) break;
    const targetY = state.headerBottom + (state.viewportHeight - state.headerBottom) / 2;
    const delta = state.y + state.height / 2 - targetY;
    await page.mouse.move(state.viewportWidth / 2, targetY);
    await page.mouse.wheel(0, delta);
    await expect.poll(async () => {
      const next = await paintState(control);
      return inView(next);
    }, { message: 'native scrolling brings the control fully into the unobstructed viewport' }).toBe(true);
  }
}

async function expectPaintedControl(page, control) {
  await scrollControlIntoView(page, control);
  const state = await paintState(control);
  expect(state.width).toBeGreaterThan(0);
  expect(state.height).toBeGreaterThan(0);
  expect(state.x).toBeGreaterThanOrEqual(0);
  expect(state.right).toBeLessThanOrEqual(state.viewportWidth);
  expect(state.y).toBeGreaterThanOrEqual(state.headerBottom);
  expect(state.bottom).toBeLessThanOrEqual(state.viewportHeight);
  expect(state.centerUncovered, 'control center must be clear of headers and overlays').toBe(true);
  await expect.poll(async () => (await paintState(control)).opacity, {
    message: `control ${await control.getAttribute('id') || 'submit'} must be painted after native scrolling`,
  }).toBe(1);
}

// Reapplying the section reveal to forms, or restoring a ratio that a tall
// form cannot attain, leaves controls geometrically present but transparent.
for (const viewport of [
  { width: 320, height: 256 }, // 1280 x 1024 at 400% browser zoom: equivalent CSS layout.
  { width: 568, height: 320 }, // Small landscape phone.
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`booking controls stay painted while scrolling at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openBooking(page);
    expect((await paintState(page.locator('#trial-form'))).opacity,
      'booking forms must be painted even before their section enters the viewport').toBe(1);
    for (const control of [page.locator('#child-name'), page.locator('#email'), page.locator('button[type="submit"]')]) {
      await expectPaintedControl(page, control);
    }
  });
}

test('booking controls remain painted with reduced motion in a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBooking(page);
  await expectPaintedControl(page, page.locator('#child-name'));
  await expectPaintedControl(page, page.locator('button[type="submit"]'));
});

test.describe('progressive enhancement', () => {
  test.use({ javaScriptEnabled: false });
  test('booking controls remain painted when JavaScript is disabled', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await openBooking(page);
    await expectPaintedControl(page, page.locator('#child-name'));
    await expectPaintedControl(page, page.locator('button[type="submit"]'));
  });
});

// An invisible ancestor must not hide keyboard focus or the booking journey.
test('visible keyboard focus leads to a synthetic booking at 320x256', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await openBooking(page);
  const child = page.locator('#child-name');
  for (let tab = 0; tab < 18; tab++) {
    await page.keyboard.press('Tab');
    if (await child.evaluate(element => element === document.activeElement)) break;
  }
  await expect(child).toBeFocused();
  await expectPaintedControl(page, child);
  const focus = await child.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      visible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineColor: style.outlineColor,
    };
  });
  expect(focus.visible).toBe(true);
  expect(focus.outlineStyle).not.toBe('none');
  expect(focus.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(focus.outlineColor).not.toBe('rgba(0, 0, 0, 0)');

  await child.fill('QA Child');
  await page.locator('#child-age').selectOption('8');
  await page.locator('label[for="quran-level-beginner"]').click();
  await page.locator('label[for="session-language-english"]').click();
  await page.locator('#parent-name').fill('QA Parent');
  await page.locator('#country').selectOption('Spain');
  await page.locator('#email').fill('qa.parent@example.invalid');
  await page.locator('#whatsapp').fill('+34000000000');
  await page.locator('label[for="preferred-day-mon"]').click();
  await page.locator('label[for="preferred-time-afternoon"]').click();
  await page.locator('#city-region').fill('QA City');
  await page.locator('#consent').check();
  const submit = page.getByRole('button', { name: 'Request my free trial', exact: true });
  await expectPaintedControl(page, submit);
  await submit.click();
  await expect(page).toHaveURL(/\/success\/(?:[?#].*)?$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

// Restoring the old 15% threshold hides any sufficiently tall content section,
// even when the section has no form. This fixture runs the real site assets.
test('a tall non-form section reveals at its first partial intersection', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 256 });
  await page.route('http://127.0.0.1:8876/__browser-fixture/tall-section/', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>main > section { padding: 0; } #first { height: 600px; } #tall { height: 2500px; }</style>
      </head><body><main><section id="first"><h1>Scroll fixture</h1></section>
      <section id="tall"><h2>Tall content remains readable</h2></section></main>
      <script src="/assets/js/main.js"></script></body></html>`,
  }));
  await page.goto('/__browser-fixture/tall-section/');
  const tall = page.locator('#tall');
  const initial = await paintState(tall);
  expect(initial.y).toBeGreaterThan(initial.viewportHeight);
  await expect.poll(async () => (await paintState(tall)).opacity).toBe(0);
  await page.mouse.wheel(0, initial.y - (initial.viewportHeight - 60));
  await expect.poll(async () => (await paintState(tall)).y).toBeLessThan(256);
  const partial = await paintState(tall);
  expect(partial.y).toBeGreaterThan(0);
  expect((partial.viewportHeight - partial.y) / partial.height).toBeLessThan(0.15);
  await expect.poll(async () => (await paintState(tall)).opacity, {
    message: 'tall content must reveal even though less than 15% fits in the viewport',
  }).toBe(1);
});
