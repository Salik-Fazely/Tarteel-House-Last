'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {domainFixture,id,plain,family,purchase,receipt}=require('./helpers/staff_ledger_fixture');
// Kept independent from other test modules so Node does not register suites twice.
function setup(){const h=domainFixture(),f=family(h),p=purchase(h,{...f,packageCode:'STEADY'}),pay=receipt(h,{...f,amountCents:22000});h.do('MATCH_PAYMENT',{matchId:id(40),paymentId:pay,purchaseId:p,amountCents:22000});return{h,f,p,pay};}
function adjust(x,n=70,amountCents=1000){return x.h.do('RECORD_PAYMENT_ADJUSTMENT',{adjustmentId:id(n),originalReceiptId:x.pay,kind:'REFUND',amountCents,occurredOn:'2026-10-15',reference:'QA-REFUND-'+n,verified:true},'Verified external refund');}
function opening(h,f,extra={}){return h.do('OPEN_PACKAGE',{purchaseId:id(20),learnerId:f.learnerId,packageCode:'STEADY',purchasedOn:'2026-10-15',lastUsableOn:'2027-10-14',paymentEvidence:{verified:true,verifiedOn:'2026-10-15',sourceReference:'QA historical verification'},completed:4,forfeited:0,makeupsUsed:1,commitments:[{entitlementId:id(80),sourceReference:'QA replacement commitment',kind:'MAKEUP_DUE'}],commitmentsConfirmed:true,sourceReference:'QA opening row 1',...extra},'Reviewed historic balances');}
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('a refund preserves matches, exposes one shortfall and holds all sibling purchases',()=>{
  const x=setup(),h=x.h;h.do('CREATE_LEARNER',{learnerId:id(3),guardianId:x.f.guardianId,firstName:'QA Sibling',language:'arabic'});
  const p2=purchase(h,{learnerId:id(3),purchaseId:id(21)}),pay2=receipt(h,{...x.f,paymentId:id(31),amountCents:12000,reference:'QA-TX-2'});
  h.do('MATCH_PAYMENT',{matchId:id(41),paymentId:pay2,purchaseId:p2,amountCents:12000});
  // Combine the two receipts by correcting unused matches first, preserving an audit trail.
  h.do('REVERSE_EVENT',{originalEventId:h.events.find(e=>e.payload.command.payload.matchId===id(41)).eventId},'Reconcile combined family receipt');
  const shared=receipt(h,{...x.f,paymentId:id(32),amountCents:34000,reference:'QA-COMBINED'});
  h.do('REVERSE_EVENT',{originalEventId:h.events.find(e=>e.payload.command.payload.matchId===id(40)).eventId},'Reconcile combined family receipt');
  h.do('MATCH_PAYMENT',{matchId:id(42),paymentId:shared,purchaseId:x.p,amountCents:22000});h.do('MATCH_PAYMENT',{matchId:id(43),paymentId:shared,purchaseId:p2,amountCents:12000});
  x.pay=shared;adjust(x);
  const v=h.project();assert.equal(v.payments.find(p=>p.paymentId===shared).shortfallCents,1000);
  assert.equal(v.overview.shortfallCents,1000);
  assert.equal(v.packages.filter(p=>p.held).length,2);
  assert.equal(v.matches.length,2);
  assert.match(h.summary(x.f.learnerId),/Under review/);
});
test('funding and view refresh never clear a refund hold without explicit resolution',()=>{
  const x=setup();adjust(x);
  const badMatch=x.h.events.find(e=>e.type==='MATCH_PAYMENT');
  x.h.do('REVERSE_EVENT',{originalEventId:badMatch.eventId},'Replace refunded allocation');
  x.h.do('MATCH_PAYMENT',{matchId:id(41),paymentId:x.pay,purchaseId:x.p,amountCents:21000});
  const next=receipt(x.h,{...x.f,paymentId:id(31),amountCents:1000,reference:'QA replacement money'});
  x.h.do('MATCH_PAYMENT',{matchId:id(42),paymentId:next,purchaseId:x.p,amountCents:1000});
  assert.equal(x.h.project().packages[0].canSchedule,false);
  const caseId=x.h.project().reviewCases[0].caseId;
  x.h.do('RESOLVE_REVIEW',{caseId,decision:'RECONCILIATION_CONFIRMED',decisionData:{}},'Verified replacement funding');
  assert.equal(x.h.project().packages[0].canSchedule,true);
});
test('refund limits and unresolved funding prevent an invalid review resolution',()=>{
  const x=setup();adjust(x);
  rejects(()=>adjust(x,71,22000),'OVER_ALLOCATION');
  const caseId=x.h.project().reviewCases[0].caseId;
  rejects(()=>x.h.do('RESOLVE_REVIEW',{caseId,decision:'RECONCILIATION_CONFIRMED',decisionData:{}},'Still short'),'REVIEW_REQUIRED');
});
test('holds permit factual attendance against an existing reservation',()=>{
  const x=setup();x.h.do('SCHEDULE_LESSON',{lessonId:id(50),learnerId:x.f.learnerId,kind:'PAID',purchaseId:x.p,teacher:'QA Teacher',startsAt:'2026-10-16T10:00:00Z',timeZone:'Europe/Madrid'});
  adjust(x);x.h.now='2026-10-16T11:00:00Z';x.h.do('RECORD_OUTCOME',{lessonId:id(50),outcome:'COMPLETED'});
  assert.equal(x.h.project().packages[0].completed,1);assert.equal(x.h.project().packages[0].held,true);
});
test('opening balances retain outstanding replacement reservations',()=>{
  const h=domainFixture(),f=family(h);opening(h,f);const b=h.project().packages[0];
  assert.deepEqual([b.remaining,b.reserved,b.available,b.makeupsAvailable],[8,1,7,3]);
  assert.equal(h.project().payments.filter(p=>p.kind==='OPENING_ATTESTATION').length,1);
});
test('unknown opening commitments hold scheduling until staff records and confirms them',()=>{
  const h=domainFixture(),f=family(h);opening(h,f,{commitments:[],commitmentsConfirmed:false});
  assert.equal(h.project().packages[0].held,true);const caseId=h.project().reviewCases[0].caseId;
  h.do('RESOLVE_REVIEW',{caseId,decision:'COMMITMENTS_CONFIRMED',decisionData:{commitments:[{entitlementId:id(80),sourceReference:'QA replacement',kind:'MAKEUP_DUE'}]}},'Confirmed outstanding replacement');
  assert.deepEqual([h.project().packages[0].available,h.project().packages[0].held],[7,false]);
});
test('opening commitments cannot duplicate each other or over-reserve known credits',()=>{
  for(const commitments of [Array(9).fill(0).map((_,n)=>({entitlementId:id(80+n),sourceReference:'QA-'+n,kind:'MAKEUP_DUE'})),[{entitlementId:id(80),sourceReference:'QA',kind:'MAKEUP_DUE'},{entitlementId:id(80),sourceReference:'QA',kind:'MAKEUP_DUE'}]]){
    const h=domainFixture(),f=family(h);rejects(()=>opening(h,f,{commitments}),'INVALID_INPUT');assert.equal(h.events.length,2);
  }
});
test('dependent event corrections are rejected without erasing history',()=>{
  const x=setup(),before=plain(x.h.events),receiptEvent=x.h.events.find(e=>e.type==='RECORD_RECEIPT');
  rejects(()=>x.h.do('REVERSE_EVENT',{originalEventId:receiptEvent.eventId},'Wrong receipt'),'DEPENDENCY_CONFLICT');
  assert.deepEqual(x.h.events,before);
  const match=x.h.events.find(e=>e.type==='MATCH_PAYMENT');x.h.do('REVERSE_EVENT',{originalEventId:match.eventId},'Incorrect match');
  assert.equal(x.h.project().packages[0].unpaidCents,22000);assert.equal(x.h.events.length,before.length+1);
});
test('replay rejects malformed schemas and never mutates input history',()=>{
  const x=setup(),before=plain(x.h.events),bad=plain(before);bad[0].schemaVersion=2;
  rejects(()=>x.h.api.domain.replay(bad),'CORRUPT_LEDGER');
  x.h.api.domain.replay(Object.freeze(before));assert.deepEqual(before,x.h.events);
});
test('corrupt event commands return a ledger error rather than an input validation error',()=>{
  const x=setup(),bad=plain(x.h.events);bad[0].payload.command.payload.name=null;
  rejects(()=>x.h.api.domain.replay(bad),'CORRUPT_LEDGER');
});
test('an opening review covers the latest of all after-expiry commitments',()=>{
  const h=domainFixture(),f=family(h);
  opening(h,f,{commitments:[20,31].map((day,n)=>({entitlementId:id(80+n),lessonId:id(50+n),sourceReference:'QA future '+n,kind:'SCHEDULED',teacher:'QA',startsAt:`2027-10-${day}T10:00:00Z`,timeZone:'Europe/Madrid',isReplacement:true}))});
  const caseId=h.project().reviewCases[0].caseId;
  rejects(()=>h.do('RESOLVE_REVIEW',{caseId,decision:'EXPIRY_CONFIRMED',decisionData:{lastUsableOn:'2027-10-25'}},'Check all appointments'),'INVALID_INPUT');
});
test('unresolved cases require individual decisions and separate completed from charged totals',()=>{
  const x=setup();for(const n of [50,51]){x.h.do('SCHEDULE_LESSON',{lessonId:id(n),learnerId:x.f.learnerId,kind:'PAID',purchaseId:x.p,teacher:'QA',startsAt:'2026-10-16T10:00:00Z',timeZone:'Europe/Madrid'});}
  x.h.now='2026-10-16T11:00:00Z';for(const n of [50,51])x.h.do('RECORD_OUTCOME',{lessonId:id(n),outcome:'TECHNICAL_FAILURE'});
  const cases=x.h.project().reviewCases;
  x.h.do('RESOLVE_REVIEW',{caseId:cases[0].caseId,decision:'MARK_COMPLETED',decisionData:{}},'Reviewed actual completion');
  assert.equal(x.h.project().packages[0].held,true);
  x.h.do('RESOLVE_REVIEW',{caseId:cases[1].caseId,decision:'CHARGE_ABSENCE',decisionData:{}},'Reviewed chargeable absence');
  assert.deepEqual([x.h.project().packages[0].completed,x.h.project().packages[0].forfeited,x.h.project().packages[0].held],[1,1,false]);
});
test('closing a reviewed package preserves unused credits and blocks further scheduling',()=>{
  const h=domainFixture(),f=family(h);opening(h,f,{completed:0,forfeited:0,makeupsUsed:0,commitments:[],commitmentsConfirmed:false});
  const caseId=h.project().reviewCases[0].caseId;
  h.do('RESOLVE_REVIEW',{caseId,decision:'CLOSE_PACKAGE',decisionData:{}},'No future lessons will be scheduled');
  assert.deepEqual([h.project().packages[0].remaining,h.project().packages[0].closed,h.project().packages[0].canSchedule],[12,true,false]);
  assert.match(h.summary(f.learnerId),/Closed/);
});
test('replay retains agreed purchase terms after a later catalog revision',()=>{
  const x=setup();x.h.api.rules.CATALOG={STARTER:{name:'Starter',priceCents:13000,lessonCount:6,makeupLimit:0},STEADY:{name:'Steady',priceCents:23000,lessonCount:12,makeupLimit:4}};
  assert.equal(x.h.state.purchases[x.p].priceCents,22000);
  assert.equal(x.h.project().packages[0].unpaidCents,0);
});
test('mixed accepted and rejected commands preserve independent credit and money conservation',()=>{
  const x=setup();x.h.now='2026-10-16T11:00:00Z';
  for(let n=0;n<8;n++){
    const lessonId=id(50+n);x.h.do('SCHEDULE_LESSON',{lessonId,learnerId:x.f.learnerId,kind:'PAID',purchaseId:x.p,teacher:'QA',startsAt:'2026-10-16T10:00:00Z',timeZone:'Europe/Madrid'});
    x.h.do('RECORD_OUTCOME',{lessonId,outcome:n%2?'COMPLETED':'NO_SHOW'});
    const b=x.h.project().packages[0];
    assert.equal(b.completed+b.forfeited+b.remaining,12);
    assert.equal(b.available+b.reserved,b.remaining);
    assert.equal(b.completed,Math.floor((n+1)/2));
    assert.ok(b.available>=0&&b.makeupsAvailable>=0);
    const before=plain(x.h.events);rejects(()=>x.h.do('RECORD_OUTCOME',{lessonId,outcome:'COMPLETED'}),'INVALID_INPUT');assert.deepEqual(x.h.events,before);
    x.h.api.domain.assertInvariants(x.h.state);
  }
});
test('payment facts cannot be dated in the future or refunded before receipt',()=>{
  const x=setup();rejects(()=>x.h.do('RECORD_RECEIPT',{paymentId:id(31),guardianId:x.f.guardianId,source:'QA',reference:'future',receivedOn:'2027-01-01',amountCents:1000,currency:'EUR',verified:true}),'INVALID_INPUT');
  rejects(()=>x.h.do('RECORD_PAYMENT_ADJUSTMENT',{adjustmentId:id(70),originalReceiptId:x.pay,kind:'REFUND',amountCents:1000,occurredOn:'2026-10-14',reference:'too early',verified:true},'Verify date'),'INVALID_INPUT');
});
