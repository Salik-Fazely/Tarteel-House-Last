const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');


const source = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
const BOOKING_SPREADSHEET_ID = '1xLqKF1DGBGdknlGbTyulDxDYgiVm6vh0MkkXSaJ90Kc';


function validParameters(overrides = {}) {
  return {
    parent_name: 'Amina Rahman',
    child_name: 'Yusuf',
    child_age: '8',
    quran_level: 'reading-short-words',
    session_language: 'english',
    country: 'Spain',
    email: 'amina@example.com',
    whatsapp: '+34600000000',
    preferred_days: 'mon',
    preferred_time: 'evening',
    city_region: 'Barcelona',
    consent: 'yes',
    ...overrides,
  };
}


function appFixture({ appendError, mailError, openError, activeUnavailable = 'missing', initialHeaders, initialRows = [] } = {}) {
  const appendedRows = initialRows.map(row => row.slice());
  const sentMail = [];
  const openedIds = [];
  let activeCalls = 0;
  let locked = false;
  let headers = initialHeaders ? initialHeaders.slice() : [
    'timestamp', 'source', 'parent_name', 'child_name', 'child_age', 'quran_level',
    'session_language', 'country', 'email', 'whatsapp', 'preferred_days', 'preferred_time',
    'city_region', 'notes', 'consent', 'status', 'assigned_teacher', 'follow_up_date',
    'internal_notes', 'submission_id', 'notification_status',
  ];
  const sheet = {
    appendRow(row) {
      if (appendError) throw appendError;
      appendedRows.push(row);
    },
    getFrozenRows() { return 1; },
    getLastColumn() { return headers.length; },
    getLastRow() { return appendedRows.length + 1; },
    getRange(row = 1, column = 1, rowCount = 1, columnCount = 1) {
      return {
        getValues() {
          return [headers, ...appendedRows].slice(row - 1, row - 1 + rowCount)
            .map(values => values.slice(column - 1, column - 1 + columnCount));
        },
        setFontWeight() {},
        setValue(value) { appendedRows[row - 2][column - 1] = value; },
        setValues(values) {
          if (row === 1) values[0].forEach((value, index) => { headers[column - 1 + index] = value; });
        },
      };
    },
  };
  const context = {
    console: { error() {} },
    LockService: {
      getScriptLock() {
        return { waitLock() { assert.equal(locked, false); locked = true; }, releaseLock() { locked = false; } };
      },
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput(html) {
        return {
          html,
          setXFrameOptionsMode() { return this; },
        };
      },
    },
    MailApp: {
      sendEmail(message) {
        if (mailError) throw mailError;
        sentMail.push(message);
      },
    },
    SpreadsheetApp: {
      flush() {},
      getActiveSpreadsheet() {
        activeCalls += 1;
        if (activeUnavailable === 'throw') throw new Error('Active spreadsheet unavailable in web apps');
        return null;
      },
      openById(id) {
        openedIds.push(id);
        if (openError) throw openError;
        return {
          getSheetByName() { return sheet; },
          insertSheet() { return sheet; },
        };
      },
    },
  };
  vm.runInNewContext(source, context);
  return { appendedRows, context, sentMail, openedIds, headers, setMailError(error) { mailError = error; },
    get activeCalls() { return activeCalls; }, get locked() { return locked; } };
}


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
    'follow_up_date', 'internal_notes', 'submission_id', 'notification_status'];

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

test('a repeated submission id writes once and retries only a failed notification', () => {
  const view = appFixture({ mailError: new Error('quota exceeded') });
  const parameter = validParameters({ submission_id: 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693' });
  view.context.doPost({ parameter });
  view.setMailError(null);
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
