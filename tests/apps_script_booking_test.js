const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');


const source = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');


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


function appFixture({ appendError, mailError } = {}) {
  const appendedRows = [];
  const sentMail = [];
  const sheet = {
    appendRow(row) {
      if (appendError) throw appendError;
      appendedRows.push(row);
    },
    getFrozenRows() { return 1; },
    getLastColumn() { return 20; },
    getRange() {
      return {
        getValues() {
          return [[
            'timestamp', 'source', 'parent_name', 'child_name', 'child_age', 'quran_level',
            'session_language', 'country', 'email', 'whatsapp', 'preferred_days', 'preferred_time',
            'city_region', 'notes', 'consent', 'status', 'assigned_teacher', 'follow_up_date',
            'internal_notes',
          ]];
        },
        setFontWeight() {},
        setValues() {},
      };
    },
  };
  const context = {
    console: { error() {} },
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
      getActiveSpreadsheet() {
        return {
          getSheetByName() { return sheet; },
          insertSheet() { return sheet; },
        };
      },
    },
  };
  vm.runInNewContext(source, context);
  return { appendedRows, context, sentMail };
}


function assertNoClientRedirect(output) {
  assert.doesNotMatch(output.html, /http-equiv\s*=\s*["']refresh/i);
  assert.doesNotMatch(output.html, /window\.location/i);
}


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


test('mail failures return an error page without a client-side redirect', () => {
  const view = appFixture({ mailError: new Error('mail unavailable') });
  const output = view.context.doPost({ parameter: validParameters() });

  assert.equal(view.appendedRows.length, 1, 'a write alone must not produce a success redirect');
  assert.equal(view.sentMail.length, 0);
  assertNoClientRedirect(output);
});
