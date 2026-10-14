const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { appFixture, validParameters, BOOKING_SPREADSHEET_ID } = require('./helpers/apps_script_fixture');

function assertNoClientRedirect(output) {
  assert.doesNotMatch(output.html, /http-equiv\s*=\s*["']refresh/i);
  assert.doesNotMatch(output.html, /window\.location/i);
}

test('web app bookings open the exact configured spreadsheet without an active spreadsheet context', () => {
  for (const activeUnavailable of ['missing', 'throw']) {
    const view = appFixture({ activeUnavailable });
    const output = view.context.doPost({ parameter: validParameters() });
    assert.deepEqual(view.openedIds, [BOOKING_SPREADSHEET_ID], activeUnavailable);
    assert.equal(view.activeCalls, 0, activeUnavailable);
    assert.equal(view.appendedRows.length, 1, activeUnavailable);
    assert.equal(view.sentMail.length, 1, activeUnavailable);
    assert.match(output.html, /request has been received/i);
    assert.equal(view.locked, false);
  }
});

test('the live legacy header order is preserved while missing columns append and booking values map by name', () => {
  const legacyHeaders = [
    'timestamp', 'child_name', 'child_age', 'quran_level', 'session_language',
    'parent_name', 'country', 'email', 'whatsapp', 'preferred_days', 'preferred_time',
    'timezone', 'notes', 'consent', 'source',
  ];
  // Production is header-only; also guard a sheet containing a synthetic old row.
  const oldRow = legacyHeaders.map(header => `existing ${header}`);
  const parameter = validParameters({ source: 'website', notes: 'Synthetic lesson preference',
    submission_id: 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693' });
  const expectedHeaders = [...legacyHeaders, 'city_region', 'status', 'assigned_teacher',
    'follow_up_date', 'internal_notes', 'submission_id', 'notification_status', 'submission_fingerprint',
    'notification_attempts', 'notification_last_attempt_at', 'notification_next_attempt_at', 'notification_error_code'];

  for (const initialRows of [[], [oldRow]]) {
    const view = appFixture({ initialHeaders: legacyHeaders, initialRows });
    const output = view.context.doPost({ parameter, parameters: { preferred_days: ['mon', 'wed'] } });
    assert.deepEqual(view.headers, expectedHeaders);
    assert.deepEqual(view.appendedRows.slice(0, initialRows.length), initialRows);
    assert.equal(view.appendedRows.length, initialRows.length + 1);
    const row = view.appendedRows.at(-1);
    assert.equal(row.length, expectedHeaders.length);
    const expectedValues = { ...parameter, whatsapp: "'+34600000000", preferred_days: 'mon,wed',
      timezone: '', status: 'New lead', assigned_teacher: '', follow_up_date: '', internal_notes: '',
      notification_status: 'Sent' };
    for (const [header, value] of Object.entries(expectedValues)) {
      assert.equal(row[view.headers.indexOf(header)], value, header);
    }
    assert.equal(Number.isFinite(row[view.headers.indexOf('timestamp')].getTime()), true);
    assert.equal(view.sentMail.length, 1);
    assert.match(output.html, /request has been received/i);
  }
});

test('a blank spreadsheet ID fails closed without opening, saving, notifying or acknowledging success', () => {
  const view = appFixture();
  vm.runInNewContext("CONFIG.SPREADSHEET_ID = '  ';", view.context);
  const output = view.context.doPost({ parameter: validParameters() });
  assert.deepEqual(view.openedIds, []);
  assert.equal(view.activeCalls, 0);
  assert.equal(view.appendedRows.length, 0);
  assert.equal(view.sentMail.length, 0);
  assert.match(output.html, /Booking request could not be completed/);
  assert.doesNotMatch(output.html, /request has been received|"status":"success"/i);
  assert.equal(view.locked, false);
});

test('spreadsheet access failure returns an error without saving, notifying or acknowledging success', () => {
  const view = appFixture({ openError: new Error('Spreadsheet access denied') });
  const output = view.context.doPost({ parameter: validParameters() });
  assert.deepEqual(view.openedIds, [BOOKING_SPREADSHEET_ID]);
  assert.equal(view.activeCalls, 0);
  assert.equal(view.appendedRows.length, 0);
  assert.equal(view.sentMail.length, 0);
  assert.match(output.html, /Booking request could not be completed/);
  assert.doesNotMatch(output.html, /request has been received|"status":"success"/i);
  assert.equal(view.locked, false);
});


test('requestParams_ clones scalar parameters and joins repeated native preferred_days values', () => {
  const { context } = appFixture();
  const parameter = validParameters({ preferred_days: 'mon' });
  const request = {
    parameter,
    parameters: { preferred_days: ['mon', 'wed', 'sun'] },
  };

  const params = context.requestParams_(request);

  assert.notEqual(params, parameter);
  assert.deepEqual(params.preferred_days, 'mon,wed,sun');
  assert.equal(parameter.preferred_days, 'mon');
  assert.equal(params.parent_name, 'Amina Rahman');
});


test('successful native booking appends joined preferred days, notifies, then redirects with the client token', () => {
  const view = appFixture();
  const token = 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';
  const output = view.context.doPost({
    parameter: validParameters({
      success_redirect: `https://tarteelhouse.com/success/?booking=${token}`,
    }),
    parameters: { preferred_days: ['mon', 'wed'] },
  });

  assert.equal(view.appendedRows.length, 1);
  assert.equal(view.appendedRows[0][10], 'mon,wed');
  assert.equal(view.sentMail.length, 1);
  assert.match(output.html, new RegExp(`https://tarteelhouse\\.com/success/\\?booking=${token}`));
});


test('both canonical success hosts are accepted while untrusted redirect hosts are rejected', () => {
  const { context } = appFixture();
  const token = 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';

  assert.equal(context.isAllowedSuccessRedirect_(`https://tarteelhouse.com/success/?booking=${token}`), true);
  assert.equal(context.isAllowedSuccessRedirect_(`https://www.tarteelhouse.com/success/?booking=${token}`), true);
  assert.equal(context.isAllowedSuccessRedirect_(`http://localhost:8000/success/?booking=${token}`), false);
  assert.equal(context.isAllowedSuccessRedirect_(`https://127.0.0.1/success/?booking=${token}`), false);
  assert.equal(context.isAllowedSuccessRedirect_(`https://attacker.example/success/?booking=${token}`), false);
  assert.equal(context.isAllowedSuccessRedirect_(`https://tarteelhouse.com:443@attacker.example/success/?booking=${token}`), false);
  assert.equal(context.isAllowedSuccessRedirect_(`http://tarteelhouse.com/success/?booking=${token}`), false);
  assert.equal(context.isAllowedSuccessRedirect_(`https://tarteelhouse.com/success/?booking=${token}&extra=1`), false);
  assert.equal(context.isAllowedSuccessRedirect_('https://tarteelhouse.com/success/?booking=%3C/script%3E'), false);
  assert.equal(context.isAllowedSuccessRedirect_('https://tarteelhouse.com/success/#fragment'), false);
});


test('honeypot requests return an error page without a client-side redirect or write', () => {
  const view = appFixture();
  const output = view.context.doPost({ parameter: validParameters({ website_field: 'spam' }) });

  assert.equal(view.appendedRows.length, 0);
  assert.equal(view.sentMail.length, 0);
  assertNoClientRedirect(output);
});


test('validation failures return an error page without a client-side redirect or write', () => {
  const view = appFixture();
  const output = view.context.doPost({ parameter: validParameters({ email: 'not-an-email' }) });

  assert.equal(view.appendedRows.length, 0);
  assert.equal(view.sentMail.length, 0);
  assertNoClientRedirect(output);
});


test('sheet failures return an error page without a client-side redirect', () => {
  const view = appFixture({ appendError: new Error('sheet unavailable') });
  const output = view.context.doPost({ parameter: validParameters() });

  assert.equal(view.appendedRows.length, 0);
  assert.equal(view.sentMail.length, 0);
  assertNoClientRedirect(output);
});


test('mail failures acknowledge a saved booking without asking the parent to resubmit', () => {
  const view = appFixture({ mailError: new Error('mail unavailable') });
  const output = view.context.doPost({ parameter: validParameters() });

  assert.equal(view.appendedRows.length, 1);
  assert.equal(view.sentMail.length, 0);
  assert.match(output.html, /request has been received/i);
  assert.doesNotMatch(output.html, /submit the form again/i);
  assert.equal(view.appendedRows[0][20], 'Failed');
});

test('a repeated submission id writes once and retries a failed notification only when due', () => {
  const view = appFixture({ mailError: new Error('quota exceeded') });
  const parameter = validParameters({ submission_id: 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693' });
  view.context.doPost({ parameter });
  view.setMailError(null);
  view.context.doPost({ parameter });
  assert.equal(view.mailCalls, 1);
  assert.equal(view.sentMail.length, 0);
  view.advanceTime(15 * 60 * 1000);
  view.context.doPost({ parameter });
  view.context.doPost({ parameter });
  assert.equal(view.appendedRows.length, 1);
  assert.equal(view.sentMail.length, 1);
  assert.equal(view.appendedRows[0][20], 'Sent');
  assert.equal(view.locked, false);
});

test('untrusted spreadsheet values remain literal text, including formulas and international phone numbers', () => {
  const view = appFixture();
  view.context.doPost({ parameter: validParameters({ parent_name: '=1+1', notes: '  =IMPORTXML("https://example.invalid", "x")' }) });
  const row = view.appendedRows[0];
  assert.equal(row[2], "'=1+1");
  assert.equal(row[9], "'+34600000000");
  assert.equal(row[13], "'  =IMPORTXML(\"https://example.invalid\", \"x\")");
});

test('successful embedded responses post only an opaque result to the validated website origin', () => {
  const view = appFixture();
  const token = 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';
  const output = view.context.doPost({ parameter: validParameters({
    submission_id: token, response_token: token,
    success_redirect: `https://www.tarteelhouse.com/success/?booking=${token}`,
  }) });
  const messages = [];
  const script = output.html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { window: { top: { postMessage(...args) { messages.push(args); } } } });
  assert.equal(messages.length, 1);
  assert.equal(messages[0][1], 'https://www.tarteelhouse.com');
  assert.equal(messages[0][0].status, 'success');
  assert.equal(messages[0][0].response_token, token);
  assert.doesNotMatch(JSON.stringify(messages), /Amina|Yusuf|example\.com|Barcelona|600000000/);
  assertNoClientRedirect(output);
});

test('failed embedded responses cannot signal success and reject untrusted response origins', () => {
  const view = appFixture();
  const token = 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';
  const parameter = validParameters({ email: '', response_token: token, submission_id: token,
    success_redirect: `https://www.tarteelhouse.com/success/?booking=${token}` });
  const output = view.context.doPost({ parameter });
  assert.match(output.html, /"status":"error"/);
  assert.doesNotMatch(output.html, /"status":"success"/);
  const untrusted = view.context.doPost({ parameter: { ...parameter, success_redirect: 'https://attacker.example/success/' } });
  assert.doesNotMatch(untrusted.html, /postMessage/);
});

const REQUEST_ID = 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';
const RETRY_TOKEN = '187f0b61-3205-4a07-82a0-c15b79a184f3';

function embeddedParameters(overrides = {}) {
  return validParameters({ source: 'website', notes: '', submission_id: REQUEST_ID,
    response_token: REQUEST_ID, success_redirect: `https://www.tarteelhouse.com/success/?booking=${REQUEST_ID}`,
    ...overrides });
}

function callbackPayload(output) {
  const messages = [];
  const script = output.html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'an authenticated attempt receives a callback');
  vm.runInNewContext(script[1], { window: { top: { postMessage(payload) { messages.push(payload); } } } });
  assert.equal(messages.length, 1);
  return JSON.parse(JSON.stringify(messages[0]));
}

// These cases catch a UUID-only retry lookup acknowledging edits to a saved booking.
test('saved submission IDs reject changed booking details without changing the row or notifying', () => {
  const changes = [
    { source: 'another-source' }, { parent_name: 'Different parent' }, { child_name: 'Different child' },
    { child_age: '9' }, { quran_level: 'complete-beginner' }, { session_language: 'arabic' },
    { country: 'Germany' }, { email: 'changed@example.invalid' }, { whatsapp: '+34611111111' },
    { preferred_days: 'wed' }, { preferred_time: 'morning' }, { city_region: 'Different city' },
    { notes: 'Changed lesson preference' },
  ];
  for (const change of changes) {
    const view = appFixture();
    view.context.doPost({ parameter: embeddedParameters() });
    const originalRow = view.appendedRows[0].slice();
    const output = view.context.doPost({ parameter: embeddedParameters({ response_token: RETRY_TOKEN, ...change }) });
    const payload = callbackPayload(output);
    assert.equal(payload.status, 'error', Object.keys(change)[0]);
    assert.match(payload.message, /original request was already received/i);
    assert.match(payload.message, /changes were not saved/i);
    assert.match(payload.message, /WhatsApp/i);
    assert.equal(view.appendedRows.length, 1);
    assert.deepEqual(view.appendedRows[0], originalRow);
    assert.equal(view.sentMail.length, 1);
    assert.equal(payload.response_token, RETRY_TOKEN);
    assert.doesNotMatch(JSON.stringify(payload), /Different|Changed lesson|changed@example|34611111111/);
  }
});

test('a conflicting saved retry does not resend an earlier failed email', () => {
  const view = appFixture({ mailError: new Error('quota exceeded') });
  view.context.doPost({ parameter: embeddedParameters() });
  const originalRow = view.appendedRows[0].slice();
  view.setMailError(null);
  view.advanceTime(15 * 60 * 1000);
  const output = view.context.doPost({ parameter: embeddedParameters({ notes: 'New details' }) });
  assert.equal(callbackPayload(output).status, 'error');
  assert.deepEqual(view.appendedRows[0], originalRow);
  assert.equal(view.sentMail.length, 0);
});

test('a canonical retry accepts formatting changes and fresh response metadata while preserving the first row', () => {
  const view = appFixture({ mailError: new Error('quota exceeded') });
  const first = embeddedParameters({ parent_name: '  أمينة  ', email: 'Amina@example.com',
    whatsapp: '+34 (600) 000-000', preferred_days: 'wed,mon,wed', notes: '  First line\r\nSecond line  ' });
  view.context.doPost({ parameter: first });
  const originalRow = view.appendedRows[0].slice();
  assert.equal(originalRow[9], "'+34600000000");
  view.setMailError(null);
  view.advanceTime(15 * 60 * 1000);
  const output = view.context.doPost({ parameter: { ...first, parent_name: 'أمينة', whatsapp: '0034600000000',
    preferred_days: 'mon,wed', notes: 'First line\nSecond line', response_token: RETRY_TOKEN,
    success_redirect: `https://tarteelhouse.com/success/?booking=${RETRY_TOKEN}` } });
  assert.equal(callbackPayload(output).status, 'success');
  assert.equal(view.appendedRows.length, 1);
  assert.equal(view.sentMail.length, 1);
  originalRow[20] = 'Sent';
  assert.deepEqual(view.appendedRows[0].slice(0, 22), originalRow.slice(0, 22));
  assert.equal(view.appendedRows[0][view.headers.indexOf('notification_attempts')], 2);
  assert.equal(view.appendedRows[0][view.headers.indexOf('notification_next_attempt_at')], '');
  assert.equal(view.appendedRows[0][view.headers.indexOf('notification_error_code')], '');
  assert.match(view.sentMail[0].body, /WhatsApp:  \+34600000000/);
  assert.doesNotMatch(view.sentMail[0].body, /WhatsApp:  '\+/);
});

test('submission ID letter case retries the same booking while callback identifiers keep their incoming case', () => {
  for (const [savedId, retryId] of [[REQUEST_ID, REQUEST_ID.toUpperCase()], [REQUEST_ID.toUpperCase(), REQUEST_ID]]) {
    const view = appFixture();
    const first = view.context.doPost({ parameter: embeddedParameters({ submission_id: savedId }) });
    assert.equal(callbackPayload(first).status, 'success');
    const incomingResponseToken = RETRY_TOKEN.toUpperCase();
    const output = view.context.doPost({ parameter: embeddedParameters({ submission_id: retryId,
      response_token: incomingResponseToken }) });
    const payload = callbackPayload(output);
    assert.equal(payload.status, 'success');
    assert.equal(payload.submission_id, retryId);
    assert.equal(payload.response_token, incomingResponseToken);
    assert.equal(view.appendedRows.length, 1);
    assert.equal(view.sentMail.length, 1);
    assert.equal(view.appendedRows[0][view.headers.indexOf('submission_id')], savedId);
  }
});

test('email local-part case changes count as different saved details', () => {
  const view = appFixture();
  view.context.doPost({ parameter: embeddedParameters({ email: 'Amina@example.com' }) });
  const output = view.context.doPost({ parameter: embeddedParameters({ email: 'amina@example.com' }) });
  assert.equal(callbackPayload(output).status, 'error');
  assert.equal(view.appendedRows.length, 1);
});

test('the backend stores its own SHA256 fingerprint rather than a client fingerprint', () => {
  const view = appFixture();
  view.context.doPost({ parameter: embeddedParameters({ submission_fingerprint: 'f'.repeat(64) }) });
  const fingerprint = view.appendedRows[0][view.headers.indexOf('submission_fingerprint')];
  // Literal canonical details are independent of the Apps Script canonicalization helper.
  const serialized = JSON.stringify({ source: 'website', parent_name: 'Amina Rahman', child_name: 'Yusuf',
    child_age: '8', quran_level: 'reading-short-words', session_language: 'english', country: 'Spain',
    email: 'amina@example.com', whatsapp: '+34600000000', preferred_days: 'mon', preferred_time: 'evening',
    city_region: 'Barcelona', notes: '', consent: 'yes' });
  assert.equal(fingerprint, crypto.createHash('sha256').update(serialized, 'utf8').digest('hex'));
  assert.notEqual(fingerprint, 'f'.repeat(64));
});

test('an unsaved attempt can retry edited details with the same submission ID', () => {
  const view = appFixture({ appendError: new Error('sheet unavailable') });
  assert.equal(callbackPayload(view.context.doPost({ parameter: embeddedParameters() })).status, 'error');
  view.setAppendError(null);
  const output = view.context.doPost({ parameter: embeddedParameters({ notes: 'Corrected before saving' }) });
  assert.equal(callbackPayload(output).status, 'success');
  assert.equal(view.appendedRows.length, 1);
  assert.equal(view.appendedRows[0][13], 'Corrected before saving');
  assert.equal(view.sentMail.length, 1);
});

test('legacy IDs with a missing or malformed fingerprint fail conservatively without altering the saved row', () => {
  for (const fingerprint of [undefined, '', 'not-a-digest', 'f'.repeat(63)]) {
    const seed = appFixture();
    seed.context.doPost({ parameter: embeddedParameters() });
    const legacyHeaders = seed.headers.filter(header => fingerprint !== undefined || header !== 'submission_fingerprint');
    const legacyRow = legacyHeaders.map(header => seed.appendedRows[0][seed.headers.indexOf(header)]);
    if (fingerprint !== undefined) legacyRow[legacyHeaders.indexOf('submission_fingerprint')] = fingerprint;
    legacyRow[legacyHeaders.indexOf('notification_status')] = 'Failed';
    const view = appFixture({ initialHeaders: legacyHeaders, initialRows: [legacyRow] });
    const output = view.context.doPost({ parameter: embeddedParameters({ notes: 'Unknown retry details' }) });
    const payload = callbackPayload(output);
    assert.equal(payload.status, 'error');
    assert.match(payload.message, /already received.*could not verify these details/i);
    assert.match(payload.message, /WhatsApp before resubmitting/i);
    assert.equal(view.appendedRows.length, 1);
    assert.deepEqual(view.appendedRows[0], legacyRow);
    assert.equal(view.sentMail.length, 0);
  }
});

test('digest failures cannot save or acknowledge a new booking or resend a saved booking', () => {
  const view = appFixture({ digestError: new Error('digest unavailable') });
  assert.equal(callbackPayload(view.context.doPost({ parameter: embeddedParameters() })).status, 'error');
  assert.equal(view.appendedRows.length, 0);
  assert.equal(view.sentMail.length, 0);
  view.setDigestError(null);
  view.setMailError(new Error('quota exceeded'));
  view.context.doPost({ parameter: embeddedParameters() });
  const originalRow = view.appendedRows[0].slice();
  view.setDigestError(new Error('digest unavailable'));
  view.setMailError(null);
  assert.equal(callbackPayload(view.context.doPost({ parameter: embeddedParameters() })).status, 'error');
  assert.deepEqual(view.appendedRows[0], originalRow);
  assert.equal(view.sentMail.length, 0);
});

// Removing raw length checks would let whitespace padding evade the intended bounds.
test('raw input limits accept the exact boundary and reject one extra character before trimming', () => {
  const cases = [
    ['parent_name', 'ع'.repeat(100), 'ع'.repeat(100) + ' '],
    ['child_name', '𝕐'.repeat(50), '𝕐'.repeat(50) + ' '],
    ['city_region', 'é'.repeat(120), 'é'.repeat(120) + ' '],
    ['email', 'a'.repeat(242) + '@example.com', 'a'.repeat(242) + '@example.com '],
    ['whatsapp', '+1234567' + ' '.repeat(32), '+1234567' + ' '.repeat(33)],
    ['notes', 'ع'.repeat(2000), 'ع'.repeat(2000) + ' '],
    ['source', 'x'.repeat(100), 'x'.repeat(100) + ' '],
  ];
  for (const [field, boundary, overLimit] of cases) {
    const accepted = appFixture();
    assert.equal(callbackPayload(accepted.context.doPost({ parameter: embeddedParameters({ [field]: boundary }) })).status, 'success', field);
    assert.equal(accepted.appendedRows.length, 1, field);
    const rejected = appFixture();
    assert.equal(callbackPayload(rejected.context.doPost({ parameter: embeddedParameters({ [field]: overLimit }) })).status, 'error', field);
    assert.equal(rejected.appendedRows.length, 0, field);
    assert.equal(rejected.sentMail.length, 0, field);
  }
});

test('notes limits count logical newlines while bounding the submitted wire text', () => {
  const acceptedNotes = ['x'.repeat(1998) + '\r\n' + 'y', '\r\n'.repeat(2000)];
  for (const notes of acceptedNotes) {
    const view = appFixture();
    const output = view.context.doPost({ parameter: embeddedParameters({ notes }) });
    assert.equal(callbackPayload(output).status, 'success');
    assert.equal(view.appendedRows.length, 1);
    assert.equal(view.appendedRows[0][view.headers.indexOf('notes')], notes);
  }
  for (const notes of ['x'.repeat(1999) + '\r\n' + 'y', '\r\n'.repeat(2000) + 'x']) {
    const view = appFixture();
    const output = view.context.doPost({ parameter: embeddedParameters({ notes }) });
    assert.equal(callbackPayload(output).status, 'error');
    assert.equal(view.appendedRows.length, 0);
    assert.equal(view.sentMail.length, 0);
  }
});

test('notes retries treat CRLF and lone CR as the same logical line breaks as LF', () => {
  for (const notes of ['First\r\nSecond', 'First\rSecond']) {
    const view = appFixture();
    view.context.doPost({ parameter: embeddedParameters({ notes }) });
    const originalRow = view.appendedRows[0].slice();
    const output = view.context.doPost({ parameter: embeddedParameters({ notes: 'First\nSecond', response_token: RETRY_TOKEN }) });
    assert.equal(callbackPayload(output).status, 'success');
    assert.equal(view.appendedRows.length, 1);
    assert.equal(view.sentMail.length, 1);
    assert.deepEqual(view.appendedRows[0], originalRow);
  }
});

test('single-line fields reject C0 and DEL characters while notes permit tabs and line breaks', () => {
  for (const field of ['parent_name', 'child_name', 'city_region', 'source', 'email', 'whatsapp']) {
    for (const control of ['\0', '\t', '\n', '\r', '\x1f', '\x7f']) {
      const view = appFixture();
      const parameter = embeddedParameters();
      parameter[field] = control + (parameter[field] || 'website');
      assert.equal(callbackPayload(view.context.doPost({ parameter })).status, 'error', `${field} ${control.charCodeAt(0)}`);
      assert.equal(view.appendedRows.length, 0);
      assert.equal(view.sentMail.length, 0);
    }
  }
  const accepted = appFixture();
  assert.equal(callbackPayload(accepted.context.doPost({ parameter: embeddedParameters({ notes: 'Line\tvalue\r\nAnother\nline' }) })).status, 'success');
  for (const control of ['\0', '\x0b', '\x0c', '\x1f', '\x7f']) {
    const view = appFixture();
    assert.equal(callbackPayload(view.context.doPost({ parameter: embeddedParameters({ notes: 'Note' + control }) })).status, 'error');
    assert.equal(view.appendedRows.length, 0);
  }
});

test('WhatsApp validation accepts formatted international numbers and the 7/15 digit boundaries', () => {
  const cases = [
    ['+1234567', '+1234567'], ['+123456789012345', '+123456789012345'],
    ['  +34 (600) 000-000  ', '+34600000000'], ['0034600000000', '+34600000000'],
  ];
  for (const [input, normalized] of cases) {
    const view = appFixture();
    const output = view.context.doPost({ parameter: embeddedParameters({ whatsapp: input, email: ' Amina@example.com ' }) });
    assert.equal(callbackPayload(output).status, 'success', input);
    assert.equal(view.appendedRows[0][9], "'" + normalized);
    assert.equal(view.sentMail[0].replyTo, 'Amina@example.com');
    assert.ok(view.sentMail[0].body.includes('WhatsApp:  ' + normalized));
  }
});

test('WhatsApp validation rejects local numbers, extensions, invalid characters and digit counts', () => {
  const invalid = ['600000000', '+01234567', '+123456', '+1234567890123456', '+', '()',
    '+34+600000000', '34+600000000', '++34600000000', '+34600000000 ext 2', '+34600000000x2',
    '+34/600000000', '+34.600000000', '+٣٤٦٠٠٠٠٠٠٠٠', '+34\u00a0600000000', '+34\n600000000',
    '+34\t600000000', '+34600000000\x7f', '+34600000000' + ' '.repeat(29), '0 034600000000', '(00)34600000000'];
  for (const whatsapp of invalid) {
    const view = appFixture();
    assert.equal(callbackPayload(view.context.doPost({ parameter: embeddedParameters({ whatsapp }) })).status, 'error', JSON.stringify(whatsapp));
    assert.equal(view.appendedRows.length, 0);
    assert.equal(view.sentMail.length, 0);
  }
});

test('native repeated days retain their raw bound before whitespace normalization', () => {
  const view = appFixture();
  const output = view.context.doPost({ parameter: embeddedParameters(), parameters: { preferred_days: ['mon', ' '.repeat(62) + 'wed'] } });
  assert.equal(callbackPayload(output).status, 'error');
  assert.equal(view.appendedRows.length, 0);
});

test('overlong enum, list and redirect fields cannot be accepted with padding', () => {
  const cases = { child_age: '8' + ' '.repeat(2), quran_level: 'complete-beginner' + ' '.repeat(32),
    session_language: 'english' + ' '.repeat(16), country: 'Spain' + ' '.repeat(32),
    preferred_time: 'evening' + ' '.repeat(16), preferred_days: 'mon' + ' '.repeat(62),
    success_redirect: `https://www.tarteelhouse.com/success/?booking=${REQUEST_ID}` + ' '.repeat(256) };
  for (const [field, value] of Object.entries(cases)) {
    const view = appFixture();
    const output = view.context.doPost({ parameter: embeddedParameters({ [field]: value }) });
    if (field !== 'success_redirect') assert.equal(callbackPayload(output).status, 'error', field);
    assert.doesNotMatch(output.html, /"status":"success"/);
    assert.equal(view.appendedRows.length, 0, field);
    assert.equal(view.sentMail.length, 0, field);
  }
});

test('invalid and oversize submissions do not queue on the global booking lock', () => {
  for (const change of [{ whatsapp: '600000000' }, { notes: 'x'.repeat(2001) }]) {
    const view = appFixture();
    assert.equal(callbackPayload(view.context.doPost({ parameter: embeddedParameters(change) })).status, 'error');
    assert.equal(view.lockRequests, 0);
    assert.deepEqual(view.openedIds, []);
    assert.equal(view.appendedRows.length, 0);
  }
});

test('unknown request fields cannot populate legacy or custom columns outside the validated booking payload', () => {
  const seed = appFixture();
  const initialHeaders = [...seed.headers.filter(header => header !== 'submission_fingerprint'), 'timezone', 'custom_column'];
  const oldRow = initialHeaders.map(header => header === 'submission_id' ? '' : `existing ${header}`);
  const view = appFixture({ initialHeaders, initialRows: [oldRow] });
  const output = view.context.doPost({ parameter: embeddedParameters({ timezone: 'x'.repeat(3000), custom_column: '=1+1' }) });
  assert.equal(callbackPayload(output).status, 'success');
  assert.equal(view.appendedRows.length, 2);
  assert.deepEqual(view.appendedRows[0], oldRow);
  assert.equal(view.appendedRows[1][view.headers.indexOf('timezone')], '');
  assert.equal(view.appendedRows[1][view.headers.indexOf('custom_column')], '');
});
