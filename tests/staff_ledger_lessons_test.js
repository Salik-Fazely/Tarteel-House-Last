'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {domainFixture,id,family,purchase,receipt}=require('./helpers/staff_ledger_fixture');
function funded(code='STEADY'){
  const h=domainFixture(),f=family(h),p=purchase(h,{...f,packageCode:code});
  const amount={STARTER:12000,STEADY:22000,COMMITTED:40000}[code];
  const pay=receipt(h,{...f,amountCents:amount});h.do('MATCH_PAYMENT',{matchId:id(40),paymentId:pay,purchaseId:p,amountCents:amount});
  return {h,f,p,pay};
}
function schedule(x,n=50,extra={}){x.h.do('SCHEDULE_LESSON',{lessonId:id(n),learnerId:x.f.learnerId,kind:'PAID',purchaseId:x.p,teacher:'QA Teacher',startsAt:'2026-10-18T10:00:00Z',timeZone:'Europe/Madrid',...extra});return id(n);}
const balance=x=>x.h.project().packages[0];
const rejects=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('a scheduled lesson reserves one credit and completion consumes it once',()=>{
  const x=funded(),lessonId=schedule(x);
  assert.deepEqual([balance(x).remaining,balance(x).reserved,balance(x).available],[12,1,11]);
  x.h.now='2026-10-18T11:00:00Z';x.h.do('RECORD_OUTCOME',{lessonId,outcome:'COMPLETED'});
  assert.deepEqual([balance(x).completed,balance(x).remaining,balance(x).reserved],[1,11,0]);
  rejects(()=>x.h.do('RECORD_OUTCOME',{lessonId,outcome:'COMPLETED'}),'INVALID_INPUT');
});
test('trials create no paid credit and factual attendance cannot be recorded in the future',()=>{
  const x=funded();x.h.do('SCHEDULE_LESSON',{lessonId:id(51),learnerId:x.f.learnerId,kind:'TRIAL',teacher:'QA Teacher',startsAt:'2026-10-18T10:00:00Z',timeZone:'Europe/Madrid'});
  rejects(()=>x.h.do('RECORD_OUTCOME',{lessonId:id(51),outcome:'COMPLETED'}),'INVALID_INPUT');
  x.h.now='2026-10-18T11:00:00Z';x.h.do('RECORD_OUTCOME',{lessonId:id(51),outcome:'COMPLETED'});
  assert.deepEqual([balance(x).remaining,balance(x).completed,balance(x).reserved],[12,0,0]);
});
test('unpaid, future-purchase and expired lesson dates cannot reserve credits',()=>{
  const h=domainFixture(),f=family(h),p=purchase(h,f),x={h,f,p};
  rejects(()=>schedule(x),'UNPAID');
  const y=funded();
  rejects(()=>schedule(y,50,{startsAt:'2027-10-15T10:00:00Z'}),'EXPIRED');
  rejects(()=>schedule(y,51,{startsAt:'2026-10-14T10:00:00Z'}),'INVALID_INPUT');
});
for(const code of ['STARTER','STEADY','COMMITTED'])test(`${code} applies the documented late/no-show allowances without extra credits`,()=>{
  const x=funded(code);x.h.now='2026-10-18T11:00:00Z';
  for(let i=0;i<5;i++){
    const lessonId=schedule(x,50+i);x.h.do('RECORD_OUTCOME',{lessonId,outcome:'NO_SHOW'});
    const b=balance(x),covered=code!=='STARTER'?Math.min(i+1,4):0;
    assert.equal(b.makeupsAvailable,(code==='STARTER'?0:4)-covered);
    assert.equal(b.forfeited,i+1-covered);
    assert.equal(b.remaining,({STARTER:6,STEADY:12,COMMITTED:25}[code])-(i+1-covered));
  }
});
for(const [start,notice,timely]of[
  ['2026-10-18T10:00:00Z','2026-10-17T10:00:00Z',true],
  ['2026-10-18T10:00:00Z','2026-10-17T10:00:00.001Z',false],
  ['2027-03-28T10:00:00Z','2027-03-27T10:00:00Z',true],
  ['2026-10-25T10:00:00Z','2026-10-24T10:00:00Z',true],
])test(`elapsed notice boundary ${start} / ${notice}`,()=>{
  const x=funded(),lessonId=schedule(x,50,{startsAt:start});x.h.now=notice;
  x.h.do('RECORD_OUTCOME',{lessonId,outcome:'PARENT_CANCELLED',noticeAt:notice});
  assert.equal(balance(x).remaining,12);assert.equal(balance(x).reserved,1);
  assert.equal(balance(x).makeupsAvailable,timely?4:3);
});
test('a replacement transfers the original entitlement instead of reserving a second credit',()=>{
  const x=funded(),lessonId=schedule(x);x.h.now='2026-10-18T11:00:00Z';
  x.h.do('RECORD_OUTCOME',{lessonId,outcome:'NO_SHOW'});
  const entitlementId=x.h.state.lessons[lessonId].entitlementId;
  const replacement=schedule(x,51,{entitlementId,startsAt:'2026-10-19T10:00:00Z'});
  assert.equal(x.h.state.lessons[replacement].entitlementId,entitlementId);
  assert.equal(balance(x).reserved,1);
  rejects(()=>schedule(x,52,{entitlementId}),'INVALID_INPUT');
  x.h.now='2026-10-19T11:00:00Z';x.h.do('RECORD_OUTCOME',{lessonId:replacement,outcome:'COMPLETED'});
  assert.deepEqual([balance(x).remaining,balance(x).reserved,balance(x).makeupsAvailable],[11,0,3]);
});
test('a missed replacement goes to review without silently consuming another allowance',()=>{
  const x=funded(),lessonId=schedule(x);x.h.now='2026-10-18T11:00:00Z';x.h.do('RECORD_OUTCOME',{lessonId,outcome:'NO_SHOW'});
  const entitlementId=x.h.state.lessons[lessonId].entitlementId;
  const replacement=schedule(x,51,{entitlementId,startsAt:'2026-10-19T10:00:00Z'});
  x.h.now='2026-10-19T11:00:00Z';x.h.do('RECORD_OUTCOME',{lessonId:replacement,outcome:'NO_SHOW'});
  assert.deepEqual([balance(x).remaining,balance(x).makeupsAvailable,balance(x).held],[12,3,true]);
  rejects(()=>schedule(x,52),'REVIEW_REQUIRED');
  const caseId=x.h.project().reviewCases[0].caseId;
  x.h.do('RESOLVE_REVIEW',{caseId,decision:'CHARGE_ABSENCE',decisionData:{}},'Owner reviewed the replacement absence');
  assert.deepEqual([balance(x).remaining,balance(x).reserved,balance(x).held],[11,0,false]);
});
test('service cancellations preserve allowance and an after-expiry replacement needs review',()=>{
  const x=funded(),lessonId=schedule(x);x.h.do('RECORD_OUTCOME',{lessonId,outcome:'SERVICE_CANCELLED'});
  const entitlementId=x.h.state.lessons[lessonId].entitlementId;
  const result=x.h.do('SCHEDULE_LESSON',{lessonId:id(51),learnerId:x.f.learnerId,kind:'PAID',purchaseId:x.p,teacher:'QA Teacher',startsAt:'2027-10-15T10:00:00Z',timeZone:'Europe/Madrid',entitlementId});
  assert.equal(result.preview.createdReviewCases.length,1);
  assert.deepEqual([balance(x).remaining,balance(x).reserved,balance(x).makeupsAvailable,balance(x).held],[12,1,4,true]);
  const caseId=x.h.project().reviewCases[0].caseId;
  x.h.do('RESOLVE_REVIEW',{caseId,decision:'EXPIRY_CONFIRMED',decisionData:{lastUsableOn:'2027-10-31'}},'Approved replacement date');
  schedule(x,52,{entitlementId,startsAt:'2027-10-15T10:00:00Z'});
  assert.equal(balance(x).reserved,1);
});
test('all reserved credits prevent overbooking even though no lessons are consumed yet',()=>{
  const x=funded('STARTER');for(let i=0;i<6;i++)schedule(x,50+i);
  assert.equal(balance(x).remaining,6);assert.equal(balance(x).available,0);
  rejects(()=>schedule(x,60),'INSUFFICIENT_CREDITS');
});
test('invalid clock times are rejected instead of silently moving a lesson to another day',()=>{
  const x=funded();rejects(()=>schedule(x,50,{startsAt:'2026-10-18T24:00:00Z'}),'INVALID_INPUT');
});
test('completion before the full 40-minute lesson ends must use an exception outcome',()=>{
  const x=funded(),lessonId=schedule(x);x.h.now='2026-10-18T10:01:00Z';
  rejects(()=>x.h.do('RECORD_OUTCOME',{lessonId,outcome:'COMPLETED'}),'INVALID_INPUT');
  x.h.now='2026-10-18T10:40:00Z';x.h.do('RECORD_OUTCOME',{lessonId,outcome:'COMPLETED'});
  assert.equal(balance(x).completed,1);
});
test('expiry changes and their reversals cannot strand an already scheduled lesson',()=>{
  const x=funded();schedule(x);
  rejects(()=>x.h.do('CHANGE_EXPIRY',{purchaseId:x.p,lastUsableOn:'2026-10-16'},'Correction'),'DEPENDENCY_CONFLICT');
  const change=x.h.do('CHANGE_EXPIRY',{purchaseId:x.p,lastUsableOn:'2027-11-30'},'Approved extension');
  schedule(x,51,{startsAt:'2027-11-01T10:00:00Z'});
  rejects(()=>x.h.do('REVERSE_EVENT',{originalEventId:change.event.eventId},'Undo extension'),'DEPENDENCY_CONFLICT');
});
