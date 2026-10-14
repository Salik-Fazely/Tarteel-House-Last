'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { appFixture, validParameters } = require('./helpers/apps_script_fixture');

function reserve(view, overrides = {}) {
  return view.context.reserveBookingCapacity_(validParameters(overrides), view.now);
}

test('new-request limits apply independently to normalized email and phone', () => {
  for (const kind of ['email', 'phone']) {
    const view = appFixture();
    for (let index = 0; index < 3; index++) {
      const changes = kind === 'email' ? { whatsapp: '+3460000000' + index } : { email: `qa${index}@example.invalid` };
      assert.equal(reserve(view, changes), true);
    }
    assert.equal(reserve(view, kind === 'email' ? { email: ' AMINA@EXAMPLE.COM ', whatsapp: '+34600000009' } :
      { email: 'another@example.invalid', whatsapp: '0034 (600) 000-000' }), false);
    assert.equal(view.sentMail.length, 0);
    assert.equal(view.appendedRows.length, 0);
  }
});

test('contact daily limits survive hourly rollover and expire at the next UTC day', () => {
  const view = appFixture();
  for (let hour = 0; hour < 4; hour++) {
    for (let attempt = 0; attempt < 3; attempt++) assert.equal(reserve(view), true);
    view.advanceTime(60 * 60 * 1000);
  }
  assert.equal(reserve(view), false);
  view.advanceTime(24 * 60 * 60 * 1000);
  assert.equal(reserve(view), true);
});

test('global budgets limit new attempts even when every contact changes', () => {
  for (const period of ['HOURLY', 'DAILY']) {
    const view = appFixture();
    vm.runInNewContext(`ABUSE_POLICY.GLOBAL_${period} = 2;`, view.context);
    const contact = index => ({ email: `qa${index}@example.invalid`, whatsapp: `+34600000${String(index).padStart(3, '0')}` });
    assert.equal(reserve(view, contact(1)), true);
    if (period === 'DAILY') view.advanceTime(60 * 60 * 1000);
    assert.equal(reserve(view, contact(2)), true);
    if (period === 'DAILY') view.advanceTime(60 * 60 * 1000);
    assert.equal(reserve(view, contact(3)), false);
  }
});

test('rate state uses keyed hashes and never stores submitted contact details', () => {
  const view = appFixture();
  assert.equal(reserve(view), true);
  const serialized = JSON.stringify([...view.properties]);
  assert.doesNotMatch(serialized, /amina|example\.com|34600000000|Yusuf|Barcelona/i);
  assert.equal([...view.properties.keys()].filter(key => key.startsWith('TH_ABUSE_CONTACT_V1_')).length, 2);
});

test('unavailable or corrupt rate state fails closed without sending or saving', () => {
  const view = appFixture({ propertyError: new Error('Synthetic property failure') });
  assert.throws(() => reserve(view));
  const corrupt = appFixture();
  corrupt.properties.set('TH_ABUSE_GLOBAL_V1', '{bad');
  assert.throws(() => reserve(corrupt));
  assert.equal(view.appendedRows.length + corrupt.appendedRows.length, 0);
  assert.equal(view.sentMail.length + corrupt.sentMail.length, 0);
});

test('impossible hourly counters and missing retained global state fail closed', () => {
  const impossible = appFixture();
  reserve(impossible);
  const hour = Math.floor(impossible.now / 3600000);
  const day = Math.floor(impossible.now / 86400000);
  impossible.properties.set('TH_ABUSE_GLOBAL_V1', JSON.stringify([hour, 2, day, 0]));
  assert.throws(() => reserve(impossible));
  const missing = appFixture();
  reserve(missing);
  missing.properties.delete('TH_ABUSE_GLOBAL_V1');
  assert.throws(() => reserve(missing));
});

test('reservation write failure denies a new row but does not block an identical saved retry', () => {
  const view = appFixture();
  const parameters = validParameters({ submission_id: 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693' });
  view.context.doPost({ parameter: parameters });
  const store = view.context.PropertiesService.getScriptProperties();
  view.context.PropertiesService.getScriptProperties = () => ({ ...store,
    setProperties() { throw new Error('Synthetic reservation write failure'); }
  });
  const blocked = view.context.doPost({ parameter: validParameters({ submission_id: 'd5f44c60-bc21-48f6-8d66-000000000004' }) });
  assert.doesNotMatch(blocked.html, /request has been received|"status":"success"/i);
  const retry = view.context.doPost({ parameter: parameters });
  assert.match(retry.html, /request has been received/i);
  assert.equal(view.appendedRows.length, 1);
  assert.equal(view.mailCalls, 1);
  assert.equal(view.locked, false);
});

test('failed Sheet appends consume reserved new-request attempts', () => {
  const view = appFixture({ appendError: new Error('Synthetic append failure') });
  for (let index = 0; index < 3; index++) view.context.doPost({ parameter: validParameters() });
  view.setAppendError(null);
  assert.match(view.context.doPost({ parameter: validParameters() }).html, /too many new requests/i);
  assert.equal(view.appendedRows.length, 0);
  assert.equal(view.mailCalls, 0);
});

test('bounded state capacity rejects new contacts without deleting unrelated properties', () => {
  const view = appFixture();
  vm.runInNewContext('ABUSE_POLICY.MAX_CONTACT_BUCKETS = 2;', view.context);
  view.properties.set('UNRELATED_SETTING', 'preserve');
  assert.equal(reserve(view), true);
  assert.equal(reserve(view, { email: 'next@example.invalid', whatsapp: '+34600000001' }), false);
  assert.equal(view.properties.get('UNRELATED_SETTING'), 'preserve');
  view.advanceTime(24 * 60 * 60 * 1000);
  assert.equal(reserve(view, { email: 'next@example.invalid', whatsapp: '+34600000001' }), true);
  assert.equal(view.properties.get('UNRELATED_SETTING'), 'preserve');
});

test('blocked new bookings neither append nor notify, while an identical saved retry succeeds', () => {
  const view = appFixture();
  const id = 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';
  for (const index of [1, 2, 3]) {
    const output = view.context.doPost({ parameter: validParameters({ submission_id: index === 1 ? id :
      `d5f44c60-bc21-48f6-8d66-${String(index).padStart(12, '0')}` }) });
    assert.match(output.html, /request has been received/i);
  }
  const blocked = view.context.doPost({ parameter: validParameters({ submission_id: 'd5f44c60-bc21-48f6-8d66-000000000004' }) });
  assert.match(blocked.html, /too many new requests/i);
  assert.doesNotMatch(blocked.html, /request has been received|"status":"success"/i);
  const retry = view.context.doPost({ parameter: validParameters({ submission_id: id }) });
  assert.match(retry.html, /request has been received/i);
  assert.equal(view.appendedRows.length, 3);
  assert.equal(view.sentMail.length, 3);
});

test('oversized encoded requests are rejected before locks or persistence', () => {
  for (const metadata of [{ contentLength: 65537 }, { postData: { length: 65537 } },
    { postData: { contents: 'x'.repeat(65537) } }, { postData: { contents: 'أ'.repeat(32769) } },
    { postData: { contents: '😀'.repeat(16385) } }]) {
    const view = appFixture();
    const output = view.context.doPost({ parameter: validParameters(), ...metadata });
    assert.match(output.html, /too large/i);
    assert.equal(view.lockRequests, 0);
    assert.equal(view.appendedRows.length, 0);
    assert.equal(view.sentMail.length, 0);
  }
});
