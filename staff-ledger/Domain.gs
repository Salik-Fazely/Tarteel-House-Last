/* Pure event decisions and replay. All authority/time comes from the adapter. */
var LedgerDomain = (function () {
  'use strict';
  var R=LedgerRules;
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function empty(){return {sequence:0,guardians:{},learners:{},purchases:{},payments:{},matches:{},lessons:{},entitlements:{},reviews:{},events:[]};}
  function find(map,id){if (!map[id]) R.fail('INVALID_INPUT','The referenced record was not found.',null,[id]);return map[id];}
  function fresh(map,id){if (map[id]) R.fail('INVALID_INPUT','This record ID is already in use.',null,[id]);}
  function netPayment(s,p){return p.amountCents;}
  function paymentBalance(s,p){var matched=Object.values(s.matches).filter(function(m){return m.paymentId===p.paymentId;}).reduce(function(n,m){return n+m.amountCents;},0);var net=netPayment(s,p);return {netCents:net,matchedCents:matched,unallocatedCents:Math.max(0,net-matched),shortfallCents:Math.max(0,matched-net)};}
  function purchaseBalance(s,p,nowIso){
    var matched=Object.values(s.matches).filter(function(m){return m.purchaseId===p.purchaseId;}).reduce(function(n,m){return n+m.amountCents;},0);
    var remaining=p.lessonCount, reserved=0, makeupsUsed=0;
    var held=Object.values(s.reviews).some(function(r){return r.purchaseId===p.purchaseId&&!r.resolved;});
    return {matchedCents:matched,unpaidCents:Math.max(0,p.priceCents-matched),remaining:remaining,reserved:reserved,available:remaining-reserved,completed:0,forfeited:0,makeupsAvailable:p.makeupLimit-makeupsUsed,held:held,canSchedule:matched>=p.priceCents&&!held&&!p.closed&&R.madridDate(nowIso)<=p.lastUsableOn};
  }
  function reduce(s,e){
    var c=e.payload.command,p=c.payload;
    if (c.type==='CREATE_GUARDIAN'){fresh(s.guardians,p.guardianId);s.guardians[p.guardianId]=clone(p);}
    else if(c.type==='UPDATE_GUARDIAN'){find(s.guardians,p.guardianId);s.guardians[p.guardianId]=clone(p);}
    else if(c.type==='CREATE_LEARNER'){fresh(s.learners,p.learnerId);find(s.guardians,p.guardianId);s.learners[p.learnerId]=clone(p);}
    else if(c.type==='UPDATE_LEARNER'){var learner=find(s.learners,p.learnerId);Object.assign(learner,p);}
    else if(c.type==='CREATE_PURCHASE'){
      fresh(s.purchases,p.purchaseId);find(s.learners,p.learnerId);
      if(p.lastUsableOn!==R.defaultLastUsableOn(p.purchasedOn)) R.fail('INVALID_INPUT','Confirm the package expiry date.','lastUsableOn');
      var terms=e.payload.terms;
      if(!terms||!Number.isSafeInteger(terms.priceCents)||terms.priceCents<=0||!Number.isSafeInteger(terms.lessonCount)||terms.lessonCount<=0||!Number.isSafeInteger(terms.makeupLimit)||terms.makeupLimit<0)R.fail('CORRUPT_LEDGER','Purchase terms are invalid.');
      s.purchases[p.purchaseId]=Object.assign(clone(p),clone(terms),{closed:false});
    }
    else if(c.type==='RECORD_RECEIPT'){
      fresh(s.payments,p.paymentId);find(s.guardians,p.guardianId);
      if(Object.values(s.payments).some(function(old){return old.source.trim().toLowerCase()===p.source.toLowerCase()&&old.reference.trim().toLowerCase()===p.reference.toLowerCase();}))R.fail('DUPLICATE_REFERENCE','This payment reference is already recorded.');
      s.payments[p.paymentId]=clone(p);
    }
    else if(c.type==='MATCH_PAYMENT'){
      fresh(s.matches,p.matchId);var payment=find(s.payments,p.paymentId),purchase=find(s.purchases,p.purchaseId),child=find(s.learners,purchase.learnerId);
      if(payment.guardianId!==child.guardianId||p.amountCents>paymentBalance(s,payment).unallocatedCents||p.amountCents>purchaseBalance(s,purchase,e.recordedAt).unpaidCents)R.fail('OVER_ALLOCATION','The match exceeds available funds or belongs to another family.');
      s.matches[p.matchId]=clone(p);
    } else R.fail('INVALID_INPUT','Unsupported command.');
  }
  function assertInvariants(s){
    Object.values(s.purchases).forEach(function(p){var b=purchaseBalance(s,p,'2000-01-01T00:00:00.000Z');if(b.remaining<0||b.available<0||b.makeupsAvailable<0||b.matchedCents>p.priceCents)R.fail('CORRUPT_LEDGER','The ledger balances need review.');});
    Object.values(s.payments).forEach(function(p){var b=paymentBalance(s,p);if(!Number.isSafeInteger(b.matchedCents)||!Number.isSafeInteger(b.netCents))R.fail('CORRUPT_LEDGER','The ledger amounts need review.');});
    return true;
  }
  function validateEvent(e,index){
    if(!e||e.schemaVersion!==1||e.sequence!==index+1||!e.payload||!e.payload.command)R.fail('CORRUPT_LEDGER','The event history needs review.');
    R.uuid(e.eventId);R.uuid(e.requestId);R.instant(e.recordedAt);
    if(typeof e.actorEmail!=='string'||!e.actorEmail||!/^[0-9a-f]{64}$/.test(e.fingerprint))R.fail('CORRUPT_LEDGER','The event identity needs review.');
    var c=R.normalizeCommand(e.payload.command);
    if(c.requestId!==e.requestId||c.type!==e.type||c.reason!==e.reason)R.fail('CORRUPT_LEDGER','The event history is inconsistent.');
  }
  function replay(events){
    if(!Array.isArray(events))R.fail('CORRUPT_LEDGER','The event history needs review.');
    var s=empty();
    events.forEach(function(e,index){validateEvent(e,index);if(s.events.some(function(old){return old.requestId===e.requestId||old.eventId===e.eventId;}))R.fail('CORRUPT_LEDGER','Duplicate event identity.');reduce(s,e);s.events.push(clone(e));s.sequence=e.sequence;assertInvariants(s);});
    return s;
  }
  function decide(state,command,context){
    var c=R.normalizeCommand(command),existing=state.events.find(function(e){return e.requestId===c.requestId;});
    if(existing){if(existing.fingerprint!==context.fingerprint)R.fail('REQUEST_CONFLICT','This request ID was used with different details.');return {event:clone(existing),nextState:state,duplicate:true,preview:{balanceChanges:[],createdReviewCases:[]}};}
    if(c.expectedSequence!==state.sequence)R.fail('STALE_PREVIEW','The ledger changed. Refresh and preview again.');
    if(!context.actorEmail)R.fail('IDENTITY_REQUIRED','Authorize your Google account before saving.');
    var e={schemaVersion:1,sequence:state.sequence+1,eventId:R.uuid(context.eventId),requestId:c.requestId,recordedAt:R.instant(context.nowIso),actorEmail:context.actorEmail,fingerprint:context.fingerprint,type:c.type,targetId:Object.values(c.payload).find(function(v){return typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v);})||'',reason:c.reason,payload:{command:clone(c)}};
    if(c.type==='CREATE_PURCHASE')e.payload.terms=clone(R.CATALOG[c.payload.packageCode]);
    var next=clone(state);reduce(next,e);next.sequence=e.sequence;next.events.push(clone(e));assertInvariants(next);
    var changes=Object.values(next.purchases).map(function(p){return {purchaseId:p.purchaseId,before:state.purchases[p.purchaseId]?purchaseBalance(state,state.purchases[p.purchaseId],context.nowIso):null,after:purchaseBalance(next,p,context.nowIso)};});
    return {event:e,nextState:next,duplicate:false,preview:{balanceChanges:changes,createdReviewCases:[]}};
  }
  return {replay:replay,decide:decide,assertInvariants:assertInvariants,purchaseBalance:purchaseBalance,paymentBalance:paymentBalance};
})();
