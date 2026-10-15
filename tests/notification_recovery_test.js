'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { appFixture, validParameters } = require('./helpers/apps_script_fixture');

const HEADERS = [
  'timestamp', 'source', 'parent_name', 'child_name', 'child_age', 'quran_level',
  'session_language', 'country', 'email', 'whatsapp', 'preferred_days', 'preferred_time',
  'city_region', 'notes', 'consent', 'status', 'assigned_teacher', 'follow_up_date',
  'internal_notes', 'submission_id', 'notification_status', 'submission_fingerprint',
  'notification_attempts', 'notification_last_attempt_at', 'notification_next_attempt_at',
  'notification_error_code',
];
const START = Date.parse('2026-10-14T09:00:00Z');
const MINUTE = 60000;
const CURSOR = 'TH_NOTIFICATION_CURSOR_V1';

function row(overrides = {}, headers = HEADERS) {
  const values = { ...validParameters({ email: 'qa.parent@example.invalid' }),
    timestamp: new Date(START), status: 'New lead', notification_status: 'Pending',
    notification_attempts: 0, notification_last_attempt_at: '',
    notification_next_attempt_at: '', notification_error_code: '', ...overrides };
  return headers.map(name => values[name] ?? '');
}

function fixture(rows = [row()], options = {}) {
  return appFixture({ initialHeaders: HEADERS, initialRows: rows, ...options });
}

function value(view, name, index = 0) {
  return view.appendedRows[index][view.headers.indexOf(name)];
}

function invoke(view, name, ...args) {
  assert.equal(typeof view.context[name], 'function', `${name} is available`);
  return view.context[name](...args);
}

function attempt(view, index = 0) {
  return invoke(view, 'attemptNotification_', view.context.getOrCreateSheet_(), view.headers, index + 2, view.now);
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

// Break caught: a failed notification never becomes recoverable without another parent submission.
test('a failed send is recovered by the worker when the first backoff expires', () => {
  const view = fixture(undefined, { mailError: new Error('provider unavailable') });
  attempt(view);
  assert.equal(value(view, 'notification_status'), 'Failed');
  assert.equal(value(view, 'notification_attempts'), 1);
  assert.equal(value(view, 'notification_last_attempt_at').getTime(), START);
  assert.equal(value(view, 'notification_next_attempt_at').getTime(), START + 15 * MINUTE);
  assert.equal(value(view, 'notification_error_code'), 'send_failed');
  view.setMailError(null);
  view.advanceTime(15 * MINUTE);
  assert.deepEqual(plain(invoke(view, 'retryFailedNotifications')), {
    checked: 1, sent: 1, deferred: 0, review: 0, legacy: 0,
  });
  assert.equal(value(view, 'notification_status'), 'Sent');
  assert.equal(value(view, 'notification_attempts'), 2);
  assert.equal(value(view, 'notification_next_attempt_at'), '');
  assert.equal(value(view, 'notification_error_code'), '');
  assert.equal(view.appendedRows.length, 1);
  assert.equal(view.sentMail.length, 1);
  assert.equal(view.locked, false);
});

// Break caught: matching parent retries bypass backoff and repeatedly call MailApp.
test('a matching parent retry before the due time does not send or change attempt metadata', () => {
  const view = fixture(undefined, { mailError: new Error('provider unavailable') });
  attempt(view);
  const writes = view.writeOperations.length;
  view.setMailError(null);
  view.advanceTime(15 * MINUTE - 1);
  attempt(view);
  assert.equal(view.mailCalls, 1);
  assert.equal(value(view, 'notification_attempts'), 1);
  assert.equal(view.writeOperations.length, writes);
  assert.equal(value(view, 'notification_status'), 'Failed');
});

// Break caught: recovery retries indefinitely or shortens the successive delays.
test('five failed attempts end in manual review and cannot be sent a sixth time', () => {
  const view = fixture(undefined, { mailError: new Error('provider unavailable') });
  const expectedDelays = [15, 60, 240, 720];
  for (let index = 0; index < 5; index += 1) {
    attempt(view);
    assert.equal(value(view, 'notification_attempts'), index + 1);
    if (index < 4) {
      assert.equal(value(view, 'notification_status'), 'Failed');
      assert.equal(value(view, 'notification_next_attempt_at').getTime(), view.now + expectedDelays[index] * MINUTE);
      view.advanceTime(expectedDelays[index] * MINUTE);
    }
  }
  assert.equal(value(view, 'notification_status'), 'Needs review');
  assert.equal(value(view, 'notification_next_attempt_at'), '');
  view.setMailError(null);
  view.advanceTime(24 * 60 * MINUTE);
  attempt(view);
  invoke(view, 'retryFailedNotifications');
  assert.equal(view.mailCalls, 5);
  assert.equal(view.sentMail.length, 0);
});

// Break caught: depleted quota consumes attempts or calls the mail provider.
test('zero quota defers a new notification without claiming or sending it', () => {
  const view = fixture(undefined, { quota: 0 });
  attempt(view);
  assert.equal(view.mailCalls, 0);
  assert.equal(value(view, 'notification_status'), 'Pending');
  assert.equal(value(view, 'notification_attempts'), 0);
  assert.equal(value(view, 'notification_last_attempt_at'), '');
  assert.equal(value(view, 'notification_next_attempt_at').getTime(), START + 15 * MINUTE);
  assert.equal(value(view, 'notification_error_code'), 'quota_wait');
});

test('unavailable quota leaves a failed notification deferred without consuming an attempt', () => {
  const view = fixture([row({ notification_status: 'Failed', notification_attempts: 1,
    notification_last_attempt_at: new Date(START - 15 * MINUTE),
    notification_next_attempt_at: new Date(START) })]);
  view.context.MailApp.getRemainingDailyQuota = () => { throw new Error('quota access unavailable'); };
  attempt(view);
  assert.equal(view.mailCalls, 0);
  assert.equal(value(view, 'notification_attempts'), 1);
  assert.equal(value(view, 'notification_status'), 'Failed');
  assert.equal(value(view, 'notification_error_code'), 'quota_unavailable');
  assert.equal(value(view, 'notification_next_attempt_at').getTime(), START + 15 * MINUTE);
});

// Break caught: a mail call happens before the persisted claim is flushed.
test('the sending claim and its attempt metadata are flushed before the mail call', () => {
  const view = fixture();
  const send = view.context.MailApp.sendEmail;
  view.context.MailApp.sendEmail = message => {
    assert.equal(value(view, 'notification_status'), 'Sending');
    assert.equal(value(view, 'notification_attempts'), 1);
    assert.equal(value(view, 'notification_last_attempt_at').getTime(), START);
    assert.equal(view.flushCalls, 1);
    send(message);
  };
  attempt(view);
  assert.equal(value(view, 'notification_status'), 'Sent');
  assert.equal(view.sentMail.length, 1);
});

// Break caught: claim failures still cause delivery.
test('a claim write failure never calls MailApp', () => {
  const view = fixture();
  view.setWriteError((_, column, next) => {
    if (column === HEADERS.indexOf('notification_attempts') + 1 && next === 1) throw new Error('write unavailable');
  });
  assert.throws(() => attempt(view), /write unavailable/);
  assert.equal(view.mailCalls, 0);
  assert.equal(value(view, 'notification_status'), 'Pending');
});

test('a claim flush failure never calls MailApp', () => {
  const view = fixture();
  view.setFlushError(call => { if (call === 1) throw new Error('flush unavailable'); });
  assert.throws(() => attempt(view), /flush unavailable/);
  assert.equal(view.mailCalls, 0);
  assert.equal(value(view, 'notification_status'), 'Sending');
});

// Break caught: a delivered message with a failed status write gets sent again.
test('a post-send status write failure retains the sending claim and later requires review', () => {
  const view = fixture();
  view.setWriteError((_, column, next) => {
    if (column === HEADERS.indexOf('notification_status') + 1 && next === 'Sent') throw new Error('write unavailable');
  });
  assert.throws(() => attempt(view), /write unavailable/);
  assert.equal(view.sentMail.length, 1);
  assert.equal(value(view, 'notification_status'), 'Sending');
  attempt(view);
  assert.equal(view.mailCalls, 1);
  view.setWriteError(null);
  view.advanceTime(15 * MINUTE);
  const summary = plain(invoke(view, 'retryFailedNotifications'));
  assert.equal(summary.review, 1);
  assert.equal(value(view, 'notification_status'), 'Needs review');
  assert.equal(value(view, 'notification_error_code'), 'delivery_uncertain');
  assert.equal(view.mailCalls, 1);
});

test('a post-send flush failure restores the sending claim rather than exposing a retryable state', () => {
  const view = fixture();
  view.setFlushError(call => { if (call === 2) throw new Error('completion flush unavailable'); });
  assert.throws(() => attempt(view), /completion flush unavailable/);
  assert.equal(view.sentMail.length, 1);
  assert.equal(value(view, 'notification_status'), 'Sending');
  view.advanceTime(15 * MINUTE);
  invoke(view, 'retryFailedNotifications');
  assert.equal(value(view, 'notification_status'), 'Needs review');
  assert.equal(view.mailCalls, 1);
});

// Break caught: completion failures after a provider error remove the durable guard.
test('a failed-send metadata write failure also keeps the durable sending claim', () => {
  const view = fixture(undefined, { mailError: new Error('mail unavailable') });
  view.setWriteError((_, column, next) => {
    if (column === HEADERS.indexOf('notification_next_attempt_at') + 1 && next !== '') throw new Error('retry write unavailable');
  });
  assert.throws(() => attempt(view), /retry write unavailable/);
  assert.equal(value(view, 'notification_status'), 'Sending');
  view.setWriteError(null);
  view.setMailError(null);
  view.advanceTime(15 * MINUTE);
  invoke(view, 'retryFailedNotifications');
  assert.equal(value(view, 'notification_status'), 'Needs review');
  assert.equal(view.mailCalls, 1);
});

// Break caught: an accepted-but-throwing provider call is redelivered when both
// the completion flush and restoration write fail, leaving a Failed status.
test('a failed completion and failed restoration retain a durable guard against a second delivery', () => {
  const view = fixture();
  const send = view.context.MailApp.sendEmail;
  view.context.MailApp.sendEmail = message => {
    send(message);
    throw new Error('provider accepted then threw');
  };
  view.setFlushError(call => { if (call === 2) throw new Error('completion flush unavailable'); });
  view.setWriteError((_, column, next) => {
    if (view.mailCalls && column === HEADERS.indexOf('notification_status') + 1 && next === 'Sending') {
      throw new Error('restoration write unavailable');
    }
  });
  assert.throws(() => attempt(view), /completion flush unavailable/);
  assert.equal(value(view, 'notification_status'), 'Failed');
  assert.equal(view.sentMail.length, 1);
  view.setWriteError(null);
  view.setFlushError(null);
  view.advanceTime(15 * MINUTE);
  invoke(view, 'retryFailedNotifications');
  assert.equal(view.mailCalls, 1);
  assert.equal(view.sentMail.length, 1);
  assert.equal(value(view, 'notification_status'), 'Needs review');
  assert.equal(value(view, 'notification_error_code'), 'delivery_uncertain');
});

test('a partially completed guarded row never retries even with missing or malformed retry metadata', () => {
  for (const notification_status of ['Pending', 'Failed']) {
    for (const notification_next_attempt_at of ['', 'malformed timestamp', new Date(START - 30 * MINUTE)]) {
      const view = fixture([row({ notification_status, notification_attempts: 1,
        notification_last_attempt_at: new Date(START - 15 * MINUTE),
        notification_next_attempt_at, notification_error_code: 'delivery_in_progress' })]);
      attempt(view);
      assert.equal(view.mailCalls, 0, `${notification_status}: ${notification_next_attempt_at}`);
      assert.equal(value(view, 'notification_status'), 'Needs review');
      assert.equal(value(view, 'notification_error_code'), 'delivery_uncertain');
    }
  }
});

// Break caught: schema expansion automatically sends historical bookings.
test('legacy blank attempt metadata never causes historical notifications to send', () => {
  const view = fixture(['Pending', 'Failed', 'Sending', ''].map(notification_status =>
    row({ notification_status, notification_attempts: '' })));
  const before = JSON.stringify(view.appendedRows);
  assert.deepEqual(plain(invoke(view, 'retryFailedNotifications')), {
    checked: 4, sent: 0, deferred: 0, review: 0, legacy: 4,
  });
  assert.equal(JSON.stringify(view.appendedRows), before);
  assert.equal(view.mailCalls, 0);
  assert.equal(view.writeOperations.length, 0);
});

test('sent and manually reviewed rows are unchanged even when their metadata is legacy', () => {
  const view = fixture(['Sent', 'Needs review'].map(notification_status =>
    row({ notification_status, notification_attempts: '' })));
  const before = JSON.stringify(view.appendedRows);
  invoke(view, 'retryFailedNotifications');
  assert.equal(JSON.stringify(view.appendedRows), before);
  assert.equal(view.mailCalls, 0);
  assert.equal(view.writeOperations.length, 0);
});

// Break caught: malformed attempts or missing retry times enable unlimited mail calls.
test('malformed managed attempt metadata goes to review without a mail call', () => {
  for (const notification_attempts of [-1, 1.5, 6, 'oops']) {
    const view = fixture([row({ notification_attempts })]);
    attempt(view);
    assert.equal(value(view, 'notification_status'), 'Needs review', String(notification_attempts));
    assert.equal(value(view, 'notification_error_code'), 'invalid_metadata');
    assert.equal(view.mailCalls, 0);
  }
  const view = fixture([row({ notification_status: 'Failed', notification_attempts: 1,
    notification_last_attempt_at: new Date(START - MINUTE), notification_next_attempt_at: '' })]);
  attempt(view);
  assert.equal(value(view, 'notification_status'), 'Needs review');
  assert.equal(view.mailCalls, 0);
});

// Break caught: future attempt timestamps or backwards retry times keep bad
// records unattended or allow another mail attempt from corrupt metadata.
test('future last attempts and backwards retry times require review without sending', () => {
  const cases = [
    { notification_status: 'Sending', notification_last_attempt_at: new Date(START + MINUTE),
      notification_next_attempt_at: '' },
    { notification_status: 'Failed', notification_last_attempt_at: new Date(START + MINUTE),
      notification_next_attempt_at: new Date(START) },
    { notification_status: 'Failed', notification_last_attempt_at: new Date(START - MINUTE),
      notification_next_attempt_at: new Date(START - 2 * MINUTE) },
    { notification_status: 'Pending', notification_last_attempt_at: new Date(START + MINUTE),
      notification_next_attempt_at: '', notification_error_code: 'delivery_in_progress' },
  ];
  for (const metadata of cases) {
    const view = fixture([row({ notification_attempts: 1, ...metadata })]);
    attempt(view);
    assert.equal(view.mailCalls, 0);
    assert.equal(value(view, 'notification_status'), 'Needs review');
    assert.equal(value(view, 'notification_error_code'), 'invalid_metadata');
  }
});

// Break caught: saved parameters and notification columns rely on a fixed column order.
test('header reordering preserves saved booking data and addresses the correct notification columns', () => {
  const headers = HEADERS.slice().reverse();
  const view = fixture([row({ parent_name: 'Saved QA parent', child_name: 'Saved QA child' }, headers)],
    { initialHeaders: headers });
  const before = view.appendedRows[0].slice();
  attempt(view);
  assert.match(view.sentMail[0].subject, /Saved QA parent \/ Saved QA child/);
  assert.equal(view.sentMail[0].replyTo, 'qa.parent@example.invalid');
  assert.equal(value(view, 'notification_status'), 'Sent');
  assert.equal(value(view, 'notification_attempts'), 1);
  headers.forEach((name, index) => {
    if (!name.startsWith('notification_')) assert.deepEqual(view.appendedRows[0][index], before[index], name);
  });
});

// Break caught: recovery scans the whole growing sheet on every trigger run.
test('the worker scans at most 200 rows and advances its durable cursor fairly', () => {
  const view = fixture([...Array.from({ length: 200 }, () => row({ notification_status: 'Sent' })), row()]);
  const first = plain(invoke(view, 'retryFailedNotifications'));
  assert.equal(first.checked, 200);
  assert.equal(first.sent, 0);
  assert.equal(view.properties.get(CURSOR), '202');
  const second = plain(invoke(view, 'retryFailedNotifications'));
  assert.equal(second.sent, 1);
  assert.equal(view.sentMail.length, 1);
  assert.equal(value(view, 'notification_status', 200), 'Sent');
  assert.equal(view.locked, false);
});

test('the worker processes at most ten due notifications and resumes from the next row', () => {
  const view = fixture(Array.from({ length: 25 }, () => row()));
  const first = plain(invoke(view, 'retryFailedNotifications'));
  assert.equal(first.sent, 10);
  assert.equal(first.checked, 10);
  assert.equal(view.properties.get(CURSOR), '12');
  assert.equal(plain(invoke(view, 'retryFailedNotifications')).sent, 10);
  assert.equal(plain(invoke(view, 'retryFailedNotifications')).sent, 5);
  assert.equal(view.sentMail.length, 25);
});

test('the worker stops before processing another row once its 45 second budget expires', () => {
  const view = fixture([row(), row()]);
  const send = view.context.MailApp.sendEmail;
  view.context.MailApp.sendEmail = message => { send(message); view.advanceTime(45000); };
  const result = plain(invoke(view, 'retryFailedNotifications'));
  assert.equal(result.checked, 1);
  assert.equal(result.sent, 1);
  assert.equal(view.properties.get(CURSOR), '3');
});

test('invalid and out-of-range cursors restart safely at the first booking row', () => {
  for (const cursor of ['NaN', '1', '999999', '2.5', '2junk', '-2']) {
    const view = fixture([row(), row()]);
    view.properties.set(CURSOR, cursor);
    vm.runInNewContext('NOTIFICATION_POLICY.batchLimit = 1;', view.context);
    invoke(view, 'retryFailedNotifications');
    assert.equal(value(view, 'notification_status'), 'Sent', cursor);
    assert.equal(value(view, 'notification_status', 1), 'Pending', cursor);
    assert.equal(view.properties.get(CURSOR), '3', cursor);
  }
});

test('an overlapping worker skips safely without releasing another execution lock', () => {
  const view = fixture();
  const lock = view.context.LockService.getScriptLock();
  lock.tryLock(1);
  assert.deepEqual(plain(invoke(view, 'retryFailedNotifications')), {
    checked: 0, sent: 0, deferred: 0, review: 0, legacy: 0,
  });
  assert.equal(view.mailCalls, 0);
  assert.equal(view.writeOperations.length, 0);
  assert.equal(view.locked, true);
  lock.releaseLock();
});

test('worker persistence errors release the shared script lock', () => {
  const view = fixture();
  view.setWriteError(() => { throw new Error('sheet unavailable'); });
  assert.throws(() => invoke(view, 'retryFailedNotifications'), /sheet unavailable/);
  assert.equal(view.locked, false);
  assert.equal(view.mailCalls, 0);
});

// Break caught: the trigger installer creates duplicates or removes unrelated triggers.
test('explicit trigger installation is idempotent and preserves other handlers', () => {
  const view = fixture();
  const unrelated = { getHandlerFunction() { return 'anotherOwnerTask'; } };
  view.triggers.push(unrelated);
  const minutes = [];
  const newTrigger = view.context.ScriptApp.newTrigger;
  view.context.ScriptApp.newTrigger = handler => {
    const builder = newTrigger(handler);
    const everyMinutes = builder.everyMinutes;
    builder.everyMinutes = function (number) { minutes.push(number); return everyMinutes.call(this, number); };
    return builder;
  };
  invoke(view, 'installNotificationRecoveryTrigger');
  invoke(view, 'installNotificationRecoveryTrigger');
  assert.deepEqual(minutes, [15]);
  assert.equal(view.triggers.length, 2);
  assert.equal(view.triggers[0], unrelated);
  assert.equal(view.triggers[1].getHandlerFunction(), 'retryFailedNotifications');
});

// Break caught: health inspection leaks booking values or changes the sheet while reporting counts.
test('editor health reports only counts without mail, trigger, cursor, or sheet mutations', () => {
  const view = fixture([
    row(), row({ notification_status: 'Failed', notification_attempts: 1,
      notification_last_attempt_at: new Date(START - MINUTE), notification_next_attempt_at: new Date(START + MINUTE) }),
    row({ notification_status: 'Sending', notification_attempts: 1, notification_last_attempt_at: new Date(START) }),
    row({ notification_status: 'Sent' }), row({ notification_status: 'Needs review', notification_attempts: 5 }),
    row({ notification_status: 'Failed', notification_attempts: '' }),
    row({ notification_status: 'unexpected qa.parent@example.invalid' }),
  ]);
  const before = JSON.stringify(view.appendedRows);
  const health = plain(invoke(view, 'getNotificationRecoveryHealth'));
  assert.deepEqual(health, { total: 7,
    statuses: { Pending: 1, Failed: 2, Sending: 1, Sent: 1, 'Needs review': 1, Other: 1 },
    due: 1, legacy: 1, needsReview: 1 });
  assert.doesNotMatch(JSON.stringify(health), /Amina|Yusuf|example\.invalid|unexpected|Barcelona|600000000/);
  assert.equal(JSON.stringify(view.appendedRows), before);
  assert.equal(view.writeOperations.length, 0);
  assert.equal(view.mailCalls, 0);
  assert.equal(view.triggers.length, 0);
  assert.equal(view.properties.size, 0);
});

test('health reads a legacy schema without creating notification columns', () => {
  const headers = HEADERS.filter(name => !name.startsWith('notification_'));
  const view = fixture([row({}, headers)], { initialHeaders: headers });
  const before = view.headers.slice();
  const health = plain(invoke(view, 'getNotificationRecoveryHealth'));
  assert.equal(health.legacy, 1);
  assert.equal(health.due, 0);
  assert.deepEqual(view.headers, before);
  assert.equal(view.writeOperations.length, 0);
  assert.equal(view.mailCalls, 0);
});

// Break caught: an editor Run produces no usable health output or logs row data.
test('editor health logs its counts for populated, empty, and missing sheets', () => {
  for (const kind of ['populated', 'empty', 'missing']) {
    const view = fixture(kind === 'populated' ? [row()] : []);
    if (kind === 'missing') view.context.SpreadsheetApp.openById = () => ({ getSheetByName() { return null; } });
    const logged = [];
    view.context.console.log = message => { logged.push(message); };
    const health = plain(invoke(view, 'getNotificationRecoveryHealth'));
    assert.equal(logged.length, 1, kind);
    assert.deepEqual(JSON.parse(logged[0]), health, kind);
    assert.doesNotMatch(logged[0], /Amina|Yusuf|example\.invalid|Barcelona|600000000/);
    assert.equal(view.mailCalls, 0);
    assert.equal(view.writeOperations.length, 0);
  }
});

test('provider error messages are not persisted in notification metadata', () => {
  const view = fixture(undefined, { mailError: new Error('SECRET qa.parent@example.invalid') });
  attempt(view);
  assert.equal(value(view, 'notification_error_code'), 'send_failed');
  assert.doesNotMatch(JSON.stringify(view.writeOperations), /SECRET|example\.invalid/);
});
