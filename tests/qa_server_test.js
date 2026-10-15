'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');

async function availablePortPair() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const first = net.createServer();
    const second = net.createServer();
    try {
      first.listen(0, '127.0.0.1');
      await once(first, 'listening');
      const port = first.address().port;
      second.listen(port + 1, '127.0.0.1');
      await once(second, 'listening');
      return port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' && error.code !== 'ERR_SOCKET_BAD_PORT') throw error;
    } finally {
      await Promise.all([first, second].filter(server => server.listening)
        .map(server => new Promise(resolve => server.close(resolve))));
    }
  }
  throw new Error('Could not find two adjacent loopback ports for the QA server');
}

function scriptPaths(html, origin) {
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map(match => new URL(match[1], origin).pathname);
}

async function qaServer(t) {
  const port = await availablePortPair();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(__dirname, '../scripts/qa_server.js')], {
    env: { ...process.env, TARTEEL_QA_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`QA server exited before startup: ${code}`)));
    child.stdout.on('data', output => {
      if (output.toString().includes('Local-only QA:')) resolve();
    });
  });
  return { origin, stats: async () => (await fetch(`${origin}/__qa/stats`)).json() };
}

function booking(origin, overrides = {}) {
  return new URLSearchParams({
    source: 'website', parent_name: 'QA Parent', child_name: 'QA Child', child_age: '8',
    quran_level: 'complete-beginner', session_language: 'english', country: 'Spain',
    email: 'qa.parent@example.invalid', whatsapp: '+34600000000', preferred_days: 'mon',
    preferred_time: 'afternoon', city_region: 'QA City', consent: 'yes', website_field: '',
    submission_id: crypto.randomUUID(), response_token: crypto.randomUUID(),
    success_redirect: `${origin}/success/`, ...overrides,
  });
}

async function postBooking(origin, parameters, mode = 'success') {
  const response = await fetch(`${origin}/__qa/booking?mode=${mode}`, { method: 'POST', body: parameters });
  assert.equal(response.status, 200);
  const outer = await response.text();
  const frame = outer.match(/<iframe\b[^>]*\bsrc="([^"]+)"/);
  assert.ok(frame, 'local booking response exposes the Apps Script sandbox frame');
  const inner = await fetch(frame[1]);
  assert.equal(inner.status, 200);
  return inner.text();
}

async function recover(origin) {
  const response = await fetch(`${origin}/__qa/recover`, { method: 'POST' });
  assert.equal(response.status, 200);
  return response.json();
}

test('missing measurement fixture removes measurement scripts from the served booking page', { timeout: 10000 }, async t => {
  const { origin } = await qaServer(t);

  const normal = await fetch(`${origin}/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=stub`);
  assert.equal(normal.status, 200);
  const normalScripts = scriptPaths(await normal.text(), origin);
  assert.ok(normalScripts.includes('/assets/js/consent.js'));
  assert.ok(normalScripts.includes('/assets/js/analytics-events.js'));

  const missing = await fetch(`${origin}/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=missing`);
  assert.equal(missing.status, 200);
  const missingScripts = scriptPaths(await missing.text(), origin);
  assert.deepEqual(missingScripts.filter(src => [
    '/assets/js/consent.js', '/assets/js/analytics-events.js',
  ].includes(src)), []);
  assert.ok(missingScripts.includes('/assets/js/main.js'));
});

// Removing the real capacity gate would create a row/mail and acknowledge the blocked request.
test('rate-limit mode rejects a new request while an identical saved retry remains acknowledged', { timeout: 10000 }, async t => {
  const view = await qaServer(t);
  const saved = booking(view.origin);
  assert.match(await postBooking(view.origin, saved), /"status":"success"/);
  const blocked = await postBooking(view.origin, booking(view.origin), 'rate-limit');
  assert.match(blocked, /too many new requests/i);
  assert.match(blocked, /"status":"error"/);
  assert.doesNotMatch(blocked, /"status":"success"/);
  assert.match(await postBooking(view.origin, saved, 'rate-limit'), /"status":"success"/);
  const stats = await view.stats();
  assert.equal(stats.requests, 3);
  assert.equal(stats.rows, 1);
  assert.equal(stats.mails, 1);
  assert.deepEqual(stats.notifications, ['Sent']);
});

// Loading only Code.gs or forgetting the shared fake clock leaves persisted failures unrecoverable.
test('local recovery sends a failed notification after fifteen minutes without a duplicate booking', { timeout: 10000 }, async t => {
  const view = await qaServer(t);
  const parameters = booking(view.origin);
  assert.match(await postBooking(view.origin, parameters, 'mail-failure'), /"status":"success"/);
  const failed = await view.stats();
  assert.equal(failed.rows, 1);
  assert.equal(failed.mails, 0);
  assert.deepEqual(failed.notifications, ['Failed']);
  assert.deepEqual(failed.notificationAttempts, [1]);
  assert.deepEqual(failed.notificationErrorCodes, ['send_failed']);
  assert.match(await postBooking(view.origin, parameters), /"status":"success"/);
  const retry = await view.stats();
  assert.equal(retry.mails, 0, 'an unchanged retry respects the queued backoff');
  assert.deepEqual(retry.notificationAttempts, [1]);
  const recovered = await recover(view.origin);
  assert.deepEqual(recovered.summary, { checked: 1, sent: 1, deferred: 0, review: 0, legacy: 0 });
  assert.equal(recovered.rows, 1);
  assert.equal(recovered.mails, 1);
  assert.deepEqual(recovered.notifications, ['Sent']);
  assert.deepEqual(recovered.notificationAttempts, [2]);
  assert.deepEqual(recovered.notificationErrorCodes, ['']);
  assert.equal(Date.parse(recovered.now) - Date.parse(failed.now), 15 * 60000);
  const again = await recover(view.origin);
  assert.equal(again.summary.sent, 0);
  assert.equal(again.rows, 1);
  assert.equal(again.mails, 1);
  assert.doesNotMatch(JSON.stringify(recovered), /qa\.parent|QA Parent|QA Child|34600000000/);
});

// Treating quota depletion as a failed mail call incorrectly consumes an attempt.
test('quota-zero mode saves pending without a mail attempt and the local worker later sends it', { timeout: 10000 }, async t => {
  const view = await qaServer(t);
  assert.match(await postBooking(view.origin, booking(view.origin), 'quota-zero'), /"status":"success"/);
  const pending = await view.stats();
  assert.equal(pending.rows, 1);
  assert.equal(pending.mails, 0);
  assert.deepEqual(pending.notifications, ['Pending']);
  assert.deepEqual(pending.notificationAttempts, [0]);
  assert.deepEqual(pending.notificationErrorCodes, ['quota_wait']);
  assert.equal(Date.parse(pending.notificationNextAttemptAt[0]) - Date.parse(pending.now), 15 * 60000);
  const recovered = await recover(view.origin);
  assert.equal(recovered.summary.sent, 1);
  assert.equal(recovered.rows, 1);
  assert.equal(recovered.mails, 1);
  assert.deepEqual(recovered.notifications, ['Sent']);
  assert.deepEqual(recovered.notificationAttempts, [1]);
});

test('the recovery route requires POST and a GET does not advance the fake clock', { timeout: 10000 }, async t => {
  const view = await qaServer(t);
  const before = await view.stats();
  const response = await fetch(`${view.origin}/__qa/recover`);
  assert.equal(response.status, 405);
  assert.equal((await view.stats()).now, before.now);
});
