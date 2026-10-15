'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { domainFixture, id, plain, family, purchase, receipt } = require('./helpers/staff_ledger_fixture');
const rejects = (fn, code) => assert.throws(fn, error => error.code === code);

test('purchases snapshot the approved price and number of lessons for each package', () => {
  const h = domainFixture(), f = family(h);
  for (const [index, code, cents, lessons, makeups] of [[0,'STARTER',12000,6,0],[1,'STEADY',22000,12,4],[2,'COMMITTED',40000,25,4]]) {
    const key = purchase(h, { learnerId:f.learnerId, purchaseId:id(20+index), packageCode:code });
    const p = h.state.purchases[key];
    assert.deepEqual([p.priceCents,p.lessonCount,p.makeupLimit], [cents,lessons,makeups]);
    assert.equal(h.project().packages.find(row => row.purchaseId === key).canSchedule, false);
  }
});

test('one-year expiry handles leap day and rejects impossible calendar dates', () => {
  const r = domainFixture().api.rules;
  for (const [input,want] of [['2026-10-15','2027-10-14'],['2028-02-29','2029-02-28'],['2026-01-01','2026-12-31'],['2027-03-01','2028-02-29']]) {
    assert.equal(r.defaultLastUsableOn(input), want);
  }
  for (const value of ['2026-02-29','2026-13-01','15/10/2026','2026-04-31']) rejects(() => r.defaultLastUsableOn(value), 'INVALID_INPUT');
});

test('EUR entry accepts a single decimal separator without rounding or grouping', () => {
  const r = domainFixture().api.rules;
  for (const [text,want] of [['120',12000],['220.50',22050],['400,25',40025],['0.01',1]]) assert.equal(r.parseEuroAmount(text), want);
  for (const text of ['1.200','1,200.00','0','-1','NaN','1e3','1.001','9007199254740992']) rejects(() => r.parseEuroAmount(text), 'INVALID_INPUT');
});

test('partial matching blocks activation and excess funds remain unmatched', () => {
  const h = domainFixture(), f = family(h), p = purchase(h, f);
  const paymentId = receipt(h, { ...f, amountCents:15000 });
  h.do('MATCH_PAYMENT', { matchId:id(40), paymentId, purchaseId:p, amountCents:6000 });
  assert.equal(h.project().packages[0].canSchedule, false);
  h.do('MATCH_PAYMENT', { matchId:id(41), paymentId, purchaseId:p, amountCents:6000 });
  assert.equal(h.project().packages[0].canSchedule, true);
  assert.equal(h.project().payments[0].unallocatedCents, 3000);
  rejects(() => h.do('MATCH_PAYMENT', { matchId:id(42), paymentId, purchaseId:p, amountCents:1 }), 'OVER_ALLOCATION');
});

test('one verified receipt can fund siblings but never an unrelated guardian', () => {
  const h = domainFixture(), a = family(h), b = family(h, 4);
  h.do('CREATE_LEARNER', { learnerId:id(3), guardianId:a.guardianId, firstName:'QA Sibling', language:'arabic' });
  const p1 = purchase(h, { ...a, purchaseId:id(20) });
  const p2 = purchase(h, { learnerId:id(3), purchaseId:id(21) });
  const p3 = purchase(h, { ...b, purchaseId:id(22) });
  const paymentId = receipt(h, { ...a, amountCents:30000 });
  for (const [n,p] of [[40,p1],[41,p2]]) h.do('MATCH_PAYMENT', { matchId:id(n), paymentId, purchaseId:p, amountCents:12000 });
  assert.equal(h.project().payments[0].unallocatedCents, 6000);
  rejects(() => h.do('MATCH_PAYMENT', { matchId:id(42), paymentId, purchaseId:p3, amountCents:100 }), 'OVER_ALLOCATION');
});

test('receipt references are deduplicated independently from request IDs', () => {
  const h = domainFixture(), f = family(h);
  receipt(h, f);
  rejects(() => h.do('RECORD_RECEIPT', { paymentId:id(31), guardianId:f.guardianId, source:' QA BANK ', reference:' qa-tx-1 ', receivedOn:'2026-10-15', amountCents:12000,currency:'EUR',verified:true }), 'DUPLICATE_REFERENCE');
  assert.equal(Object.keys(h.state.payments).length, 1);
});

test('invalid money and unverified receipts cannot enter the ledger', () => {
  const h = domainFixture(), f = family(h);
  const base = { paymentId:id(30), guardianId:f.guardianId, source:'QA bank', reference:'QA', receivedOn:'2026-10-15', amountCents:12000,currency:'EUR',verified:true };
  for (const patch of [{amountCents:0},{amountCents:-1},{amountCents:1.2},{amountCents:Number.MAX_SAFE_INTEGER+1},{currency:'USD'},{verified:false}]) {
    rejects(() => h.do('RECORD_RECEIPT', { ...base, ...patch }), 'INVALID_INPUT');
  }
  assert.equal(Object.keys(h.state.payments).length, 0);
});

test('strict command validation rejects unknown keys, invalid IDs and overlong names', () => {
  const h = domainFixture(), base = { guardianId:id(1),name:'QA',email:'qa@example.invalid',whatsapp:'+34600000000' };
  for (const patch of [{admin:true},{name:'X'.repeat(101)},{guardianId:'__proto__'},{email:'bad'},{whatsapp:'600000000'}]) rejects(() => h.do('CREATE_GUARDIAN', { ...base, ...patch }), 'INVALID_INPUT');
  const cmd = h.command('CREATE_GUARDIAN', base); cmd.actorEmail='forged@example.invalid';
  rejects(() => h.execute(cmd), 'INVALID_INPUT');
});

test('contact corrections retain IDs and linked purchase/payment history', () => {
  const h = domainFixture(), f = family(h); purchase(h, f); receipt(h, f);
  h.do('UPDATE_GUARDIAN', { guardianId:f.guardianId, name:'Correct guardian',email:'correct@example.invalid',whatsapp:'+34600000001' }, 'Corrected contact');
  h.do('UPDATE_LEARNER', { learnerId:f.learnerId,firstName:'Correct child',language:'persian' }, 'Corrected spelling');
  assert.equal(h.state.guardians[f.guardianId].email, 'correct@example.invalid');
  assert.equal(h.state.purchases[id(20)].learnerId, f.learnerId);
  assert.equal(h.state.payments[id(30)].guardianId, f.guardianId);
});

test('selected-child summary excludes sibling, contacts and transaction references', () => {
  const h = domainFixture(), f = family(h); purchase(h,f); receipt(h,f);
  h.do('CREATE_LEARNER', {learnerId:id(3),guardianId:f.guardianId,firstName:'Secret Sibling',language:'english'});
  const summary = h.summary(f.learnerId);
  assert.match(summary, /QA Child 1/);
  for (const privateText of ['Secret Sibling','qa1@example.invalid','QA-TX-1','+34600000000','QA Guardian']) assert.ok(!summary.includes(privateText));
});

test('identical durable command retries ignore stale sequence while edits conflict', () => {
  const h = domainFixture(), command=h.command('CREATE_GUARDIAN',{guardianId:id(1),name:'QA',email:'qa@example.invalid',whatsapp:'+34600000000'});
  const first=h.execute(command), second=h.execute(command);
  assert.equal(second.event.eventId,first.event.eventId);
  assert.equal(second.duplicate,true);
  const edited=plain(command); edited.payload.name='Edited';
  rejects(()=>h.execute(edited),'REQUEST_CONFLICT');
  assert.equal(h.events.length,1);
});
