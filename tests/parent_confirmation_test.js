const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { appFixture, validParameters } = require('./helpers/apps_script_fixture');

const FOUNDER = 'hello@tarteelhouse.com';
const ID = 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';

// Production default: the parent confirmation is enabled.
function liveFixture(options = {}) {
  return appFixture({ parentConfirmation: true, ...options });
}

function confirmations(view) {
  return view.sentMail.filter(message => message.to !== FOUNDER);
}

function founderMail(view) {
  return view.sentMail.filter(message => message.to === FOUNDER);
}

function cell(view, header, rowIndex = 0) {
  return view.appendedRows[rowIndex][view.headers.indexOf(header)];
}

test('a new booking sends one fixed confirmation to the parent after the founder notification', () => {
  const view = liveFixture();
  const parameter = validParameters({
    parent_name: 'Zzparent Marker', child_name: 'Zzchild', notes: 'Zznote marker', city_region: 'Zzcity',
  });
  const output = view.context.doPost({ parameter });

  assert.match(output.html, /request has been received/i);
  assert.equal(view.appendedRows.length, 1);
  assert.deepEqual(view.sentMail.map(message => message.to), [FOUNDER, 'amina@example.com']);
  const [message] = confirmations(view);
  assert.equal(message.replyTo, FOUNDER);
  assert.equal(message.name, 'Tarteel House');
  assert.equal(message.subject, 'We have received your free trial request | Tarteel House');
  assert.match(message.body, /within two days/);
  assert.match(message.body, /free 40-minute, one-to-one lesson/);
  assert.match(message.body, /No payment and no commitment/);
  assert.match(message.body, /https:\/\/wa\.me\/34614494311/);
  assert.match(message.htmlBody, /<html lang="en" dir="ltr">/);
  // Nothing the visitor typed is echoed to the address they typed.
  for (const text of [message.subject, message.body, message.htmlBody]) {
    assert.doesNotMatch(text, /Zzparent|Zzchild|Zznote|Zzcity|amina@example\.com|34600000000/);
  }
  assert.equal(cell(view, 'parent_confirmation_status'), 'Sent');
  assert.equal(cell(view, 'notification_status'), 'Sent');
  assert.equal(view.locked, false);
});

test('the confirmation follows the lesson language, and Arabic requests receive the English email', () => {
  const expected = {
    english: ['en', 'ltr', /within two days/],
    arabic: ['en', 'ltr', /within two days/],
    persian: ['fa', 'rtl', /ظرف دو روز/],
    turkish: ['tr', 'ltr', /iki gün içinde/],
  };
  for (const [language, [lang, dir, promise]] of Object.entries(expected)) {
    const view = liveFixture();
    view.context.doPost({ parameter: validParameters({ session_language: language }) });
    const [message] = confirmations(view);
    assert.ok(message, language);
    assert.match(message.htmlBody, new RegExp(`<html lang="${lang}" dir="${dir}">`), language);
    assert.match(message.body, promise, language);
    assert.match(message.htmlBody, promise, language);
  }
});

test('every language states the approved trial facts and never a stricter deadline', () => {
  const { context } = liveFixture();
  const copy = vm.runInNewContext('PARENT_CONFIRMATION_COPY', context);
  assert.deepEqual(Object.keys(copy).sort(), ['english', 'persian', 'turkish']);
  const facts = {
    english: [/40-minute/, /within two days/, /No payment/, /Zoom or Google Meet/],
    persian: [/۴۰ دقیقه‌ای/, /معمولاً ظرف دو روز/, /بدون پرداخت/, /Zoom یا Google Meet/],
    turkish: [/40 dakikalık/, /genellikle iki gün içinde/, /Ödeme yok/, /Zoom veya Google Meet/],
  };
  for (const [language, patterns] of Object.entries(facts)) {
    const text = [copy[language].intro, ...copy[language].steps, copy[language].question].join(' ');
    for (const pattern of patterns) assert.match(text, pattern, `${language} ${pattern}`);
    assert.doesNotMatch(text, /working day|24 hours|guarantee|iş günü|garanti|تضمین/i, language);
    assert.equal(copy[language].steps.length, 3, language);
  }
});

test('a retry of the same saved booking never sends a second confirmation', () => {
  const view = liveFixture();
  const parameter = validParameters({ submission_id: ID });
  view.context.doPost({ parameter });
  const retry = view.context.doPost({ parameter });
  assert.match(retry.html, /request has been received/i);
  assert.equal(view.appendedRows.length, 1);
  assert.equal(confirmations(view).length, 1);
  assert.equal(founderMail(view).length, 1);
});

test('a mail failure records Failed, keeps the booking acknowledged and is not retried', () => {
  const view = liveFixture({ mailError: new Error('mail down') });
  const parameter = validParameters({ submission_id: ID });
  const output = view.context.doPost({ parameter });
  assert.match(output.html, /request has been received/i);
  assert.equal(view.appendedRows.length, 1);
  assert.equal(cell(view, 'parent_confirmation_status'), 'Failed');

  view.setMailError(null);
  view.advanceTime(16 * 60000);
  view.context.doPost({ parameter });
  assert.equal(founderMail(view).length, 1, 'the founder notification still recovers');
  assert.equal(confirmations(view).length, 0, 'the confirmation is best effort');
  assert.equal(cell(view, 'parent_confirmation_status'), 'Failed');
});

test('low mail quota is kept for founder notifications and the confirmation is recorded as Not sent', () => {
  const view = liveFixture({ quota: 20 });
  const output = view.context.doPost({ parameter: validParameters() });
  assert.match(output.html, /request has been received/i);
  // The founder notification used one unit, leaving 19: below the reserve of 20.
  assert.deepEqual(view.sentMail.map(message => message.to), [FOUNDER]);
  assert.equal(cell(view, 'parent_confirmation_status'), 'Not sent');

  const enough = liveFixture({ quota: 21 });
  enough.context.doPost({ parameter: validParameters() });
  assert.equal(confirmations(enough).length, 1);
  assert.equal(cell(enough, 'parent_confirmation_status'), 'Sent');
});

test('only a Pending row is emailed: legacy, settled and interrupted rows are skipped', () => {
  for (const status of ['', 'Sending', 'Sent', 'Failed', 'Not sent', 'pending', 'Anything else']) {
    const view = liveFixture();
    view.context.doPost({ parameter: validParameters() });
    const before = view.sentMail.length;
    const column = view.headers.indexOf('parent_confirmation_status');
    view.appendedRows[0][column] = status;
    const result = vm.runInNewContext(
      'attemptParentConfirmation_(getOrCreateSheet_(), getOrCreateSheet_().getRange(1, 1, 1, getOrCreateSheet_().getLastColumn()).getValues()[0], 2)',
      view.context);
    assert.equal(result, 'skipped', JSON.stringify(status));
    assert.equal(view.sentMail.length, before, JSON.stringify(status));
    assert.equal(view.appendedRows[0][column], status, JSON.stringify(status));
  }
});

test('the row is claimed as Sending and flushed before the mail call', () => {
  const view = liveFixture();
  const seen = [];
  const original = view.context.MailApp.sendEmail;
  view.context.MailApp.sendEmail = function (message) {
    if (message.to !== FOUNDER) {
      seen.push(view.appendedRows[0][view.headers.indexOf('parent_confirmation_status')]);
    }
    return original.call(this, message);
  };
  view.context.doPost({ parameter: validParameters() });
  assert.deepEqual(seen, ['Sending']);
  assert.equal(cell(view, 'parent_confirmation_status'), 'Sent');
});

test('a failed claim sends nothing, keeps the acknowledgment, and a retry sends exactly one confirmation', () => {
  const view = liveFixture();
  const parameter = validParameters({ submission_id: ID });
  view.setWriteError((row, column, value) => {
    if (column === view.headers.indexOf('parent_confirmation_status') + 1 && value === 'Sending') {
      throw new Error('sheet write failed');
    }
  });
  const output = view.context.doPost({ parameter });
  assert.match(output.html, /request has been received/i);
  assert.match(output.html, /Continue to Tarteel House/);
  assert.equal(view.appendedRows.length, 1);
  assert.equal(founderMail(view).length, 1);
  assert.equal(confirmations(view).length, 0, 'no mail call without a durable claim');
  assert.equal(cell(view, 'parent_confirmation_status'), 'Pending');
  assert.equal(view.locked, false);

  view.setWriteError(null);
  view.context.doPost({ parameter });
  view.context.doPost({ parameter });
  assert.equal(confirmations(view).length, 1);
  assert.equal(founderMail(view).length, 1);
  assert.equal(cell(view, 'parent_confirmation_status'), 'Sent');
});

test('an unusable saved email is recorded as Not sent without a mail call', () => {
  const view = liveFixture();
  view.context.doPost({ parameter: validParameters() });
  const before = view.sentMail.length;
  view.appendedRows[0][view.headers.indexOf('parent_confirmation_status')] = 'Pending';
  view.appendedRows[0][view.headers.indexOf('email')] = 'not an address';
  const result = vm.runInNewContext(
    'attemptParentConfirmation_(getOrCreateSheet_(), getOrCreateSheet_().getRange(1, 1, 1, getOrCreateSheet_().getLastColumn()).getValues()[0], 2)',
    view.context);
  assert.equal(result, 'not_sent');
  assert.equal(view.sentMail.length, before);
  assert.equal(cell(view, 'parent_confirmation_status'), 'Not sent');
});

test('the switch turns confirmations off and leaves the status blank', () => {
  const view = appFixture();
  const output = view.context.doPost({ parameter: validParameters() });
  assert.match(output.html, /request has been received/i);
  assert.deepEqual(view.sentMail.map(message => message.to), [FOUNDER]);
  assert.equal(cell(view, 'parent_confirmation_status'), '');
});

test('the optional source answer is validated, stored and shown to the founder', () => {
  for (const answer of ['ai-assistant', 'search-engine', 'friend-or-family', 'mosque-or-community', 'social-media', 'other']) {
    const view = liveFixture();
    const output = view.context.doPost({ parameter: validParameters({ heard_about: answer }) });
    assert.match(output.html, /request has been received/i, answer);
    assert.equal(cell(view, 'heard_about'), answer);
    assert.match(founderMail(view)[0].body, new RegExp(`Heard about us: ${answer}`));
  }

  const absent = liveFixture();
  assert.match(absent.context.doPost({ parameter: validParameters() }).html, /request has been received/i);
  assert.equal(cell(absent, 'heard_about'), '');
  assert.match(founderMail(absent)[0].body, /Heard about us: —/);

  for (const invalid of ['chatgpt', 'AI-ASSISTANT', '=cmd()', 'x'.repeat(25)]) {
    const view = liveFixture();
    const output = view.context.doPost({ parameter: validParameters({ heard_about: invalid }) });
    assert.doesNotMatch(output.html, /request has been received/i, invalid);
    assert.equal(view.appendedRows.length, 0, invalid);
    assert.equal(view.sentMail.length, 0, invalid);
  }
});

test('the source answer is outside the fingerprint: a retry keeps the first saved answer', () => {
  const view = liveFixture();
  const first = validParameters({ submission_id: ID, heard_about: 'ai-assistant' });
  view.context.doPost({ parameter: first });
  const fingerprint = cell(view, 'submission_fingerprint');
  const retry = view.context.doPost({ parameter: { ...first, heard_about: 'other' } });
  assert.match(retry.html, /request has been received/i);
  assert.equal(view.appendedRows.length, 1);
  assert.equal(cell(view, 'heard_about'), 'ai-assistant');
  assert.equal(cell(view, 'submission_fingerprint'), fingerprint);

  const without = liveFixture();
  without.context.doPost({ parameter: validParameters({ submission_id: ID }) });
  assert.equal(cell(without, 'submission_fingerprint'), fingerprint,
    'bookings saved before this field existed keep the same fingerprint');
});

test('Australia is accepted as a country and near-misses are still rejected', () => {
  const view = liveFixture();
  assert.match(view.context.doPost({ parameter: validParameters({ country: 'Australia' }) }).html,
    /request has been received/i);
  assert.equal(cell(view, 'country'), 'Australia');
  const rejected = liveFixture();
  assert.doesNotMatch(rejected.context.doPost({ parameter: validParameters({ country: 'australia' }) }).html,
    /request has been received/i);
  assert.equal(rejected.appendedRows.length, 0);
});

test('the founder notification carries a WhatsApp reply link drafted in the lesson language', () => {
  const greetings = { english: 'Hello Amina Rahman, this is Tarteel House.', arabic: 'Hello Amina Rahman, this is Tarteel House.',
    persian: 'سلام Amina Rahman عزیز', turkish: 'Merhaba Amina Rahman, Tarteel House’tan yazıyoruz.' };
  for (const [language, greeting] of Object.entries(greetings)) {
    const view = liveFixture();
    view.context.doPost({ parameter: validParameters({ session_language: language, whatsapp: '0034 (600) 000-000' }) });
    const body = founderMail(view)[0].body;
    const link = body.match(/^https:\/\/wa\.me\/(\d+)\?text=(\S+)$/m);
    assert.ok(link, language);
    assert.equal(link[1], '34600000000');
    const draft = decodeURIComponent(link[2]);
    assert.ok(draft.startsWith(greeting), `${language}: ${draft}`);
    assert.match(draft, /Yusuf/);
  }
});

test('the reply link is omitted for an unusable number and collapses whitespace in names', () => {
  const { context } = liveFixture();
  const link = saved => vm.runInNewContext(`whatsappReplyLink_(${JSON.stringify(saved)})`, context);
  assert.equal(link({ whatsapp: 'test', session_language: 'english' }), '');
  assert.equal(link({ whatsapp: '', session_language: 'english' }), '');
  assert.equal(link({ whatsapp: '012345', session_language: 'english' }), '');
  const drafted = link({ whatsapp: "'+4915700000000", session_language: 'unknown',
    parent_name: '  Zahra \t Example ', child_name: 'Hania' });
  assert.match(drafted, /^https:\/\/wa\.me\/4915700000000\?text=/);
  assert.match(decodeURIComponent(drafted.split('?text=')[1]), /^Hello Zahra Example, this is Tarteel House\. .* for Hania\./);
  assert.doesNotMatch(drafted, /[\s"<>]/);
});

test('the reply link drops a stray 0 after known country codes and leaves the saved number untouched', () => {
  const { context } = liveFixture();
  const digits = value => vm.runInNewContext(`whatsappLinkDigits_(${JSON.stringify(value)})`, context);
  const fixed = {
    '+32 0488 00 00 00': '32488000000',
    '+33 06 00 00 00 00': '33600000000',
    '+49 0157 0000 0000': '4915700000000',
    '0044 07700 900000': '447700900000',
    '+353 083 000 0000': '353830000000',
    '+61 0400 000 000': '61400000000',
    '+90 0500 000 00 00': '905000000000',
  };
  for (const [typed, expected] of Object.entries(fixed)) assert.equal(digits(typed), expected, typed);
  // Already correct, no trunk prefix, or a country whose leading 0 is real.
  for (const [typed, expected] of Object.entries({
    '+32 488 00 00 00': '32488000000',
    '+34 600 000 000': '34600000000',
    '+1 510 000 0000': '15100000000',
    '+39 06 0000 0000': '390600000000',
    '+225 07 00 00 00 00': '2250700000000',
  })) assert.equal(digits(typed), expected, typed);
  assert.equal(digits('+32 0'), '');

  const view = liveFixture();
  view.context.doPost({ parameter: validParameters({ whatsapp: '+32 0488 00 00 00', country: 'Belgium' }) });
  assert.equal(cell(view, 'whatsapp'), "'+320488000000", 'the stored number stays as submitted');
  assert.match(founderMail(view)[0].body, /^https:\/\/wa\.me\/32488000000\?text=/m);
  assert.match(founderMail(view)[0].body, /WhatsApp:  \+320488000000/);
});
