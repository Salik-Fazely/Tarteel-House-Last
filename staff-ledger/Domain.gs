/* Pure event decisions and replay. All authority/time comes from the adapter. */
var LedgerDomain = (function () {
  'use strict';
  var R=LedgerRules;
  function clone(x){return JSON.parse(JSON.stringify(x));}
  var MAPS=['guardians','learners','purchases','payments','matches','lessons','entitlements','reviews','adjustments'];
  function empty(){return {sequence:0,guardians:{},learners:{},purchases:{},payments:{},matches:{},lessons:{},entitlements:{},reviews:{},adjustments:{},events:[],reversed:{}};}
  function find(map,id){if (!map[id]) R.fail('INVALID_INPUT','The referenced record was not found.',null,[id]);return map[id];}
  function fresh(map,id){if (map[id]) R.fail('INVALID_INPUT','This record ID is already in use.',null,[id]);}
  function netPayment(s,p){return p.amountCents-Object.values(s.adjustments).filter(function(a){return a.originalReceiptId===p.paymentId;}).reduce(function(n,a){return n+a.amountCents;},0);}
  function paymentBalance(s,p){var matched=Object.values(s.matches).filter(function(m){return m.paymentId===p.paymentId;}).reduce(function(n,m){return n+m.amountCents;},0);var net=netPayment(s,p);return {netCents:net,matchedCents:matched,unallocatedCents:Math.max(0,net-matched),shortfallCents:Math.max(0,matched-net)};}
  function purchaseBalance(s,p,nowIso){
    var matched=Object.values(s.matches).filter(function(m){return m.purchaseId===p.purchaseId;}).reduce(function(n,m){return n+m.amountCents;},0);
    var entitlements=Object.values(s.entitlements).filter(function(t){return t.purchaseId===p.purchaseId;});
    var completed=(p.openingCompleted||0)+entitlements.filter(function(t){return t.status==='COMPLETED';}).length;
    var forfeited=(p.openingForfeited||0)+entitlements.filter(function(t){return t.status==='FORFEITED';}).length;
    var remaining=p.lessonCount-completed-forfeited, reserved=entitlements.filter(function(t){return ['SCHEDULED','PENDING','REVIEW'].indexOf(t.status)>=0;}).length;
    var makeupsUsed=(p.openingMakeupsUsed||0)+entitlements.filter(function(t){return t.makeupAwarded;}).length;
    var held=Object.values(s.reviews).some(function(r){return r.purchaseIds.indexOf(p.purchaseId)>=0&&!r.resolved;});
    return {matchedCents:matched,unpaidCents:Math.max(0,p.priceCents-matched),remaining:remaining,reserved:reserved,available:remaining-reserved,completed:completed,forfeited:forfeited,makeupsAvailable:p.makeupLimit-makeupsUsed,held:held,canSchedule:matched>=p.priceCents&&!held&&!p.closed&&remaining-reserved>0&&R.madridDate(nowIso)<=p.lastUsableOn};
  }
  function review(s,e,purchaseIds,requirement,details){
    var r=s.reviews[e.eventId];
    if(!r){r={caseId:e.eventId,purchaseIds:purchaseIds.slice(),required:[],resolved:false,details:details||{}};s.reviews[r.caseId]=r;}
    if(r.required.indexOf(requirement)<0)r.required.push(requirement);
    if(details&&details.proposedDate&&(!r.details.proposedDate||details.proposedDate>r.details.proposedDate))r.details.proposedDate=details.proposedDate;
    return r;
  }
  function addCommitments(s,p,items,e){
    var b=purchaseBalance(s,p,e.recordedAt);
    if(items.length>b.available)R.fail('INVALID_INPUT','Outstanding commitments exceed remaining credits.');
    items.forEach(function(item){
      fresh(s.entitlements,item.entitlementId);
      if(Object.values(s.entitlements).some(function(t){return t.purchaseId===p.purchaseId&&t.sourceReference===item.sourceReference;}))R.fail('INVALID_INPUT','This commitment reference is already recorded.');
      var t={entitlementId:item.entitlementId,purchaseId:p.purchaseId,learnerId:p.learnerId,status:item.kind==='SCHEDULED'?'SCHEDULED':'PENDING',currentLessonId:null,makeupAwarded:false,pendingReason:'OPENING',sourceReference:item.sourceReference};
      s.entitlements[t.entitlementId]=t;
      if(item.kind==='SCHEDULED'){
        fresh(s.lessons,item.lessonId);t.currentLessonId=item.lessonId;
        var localDate=R.madridDate(item.startsAt);
        if(localDate<p.purchasedOn)R.fail('INVALID_INPUT','A paid lesson cannot precede its purchase.');
        s.lessons[item.lessonId]={lessonId:item.lessonId,learnerId:p.learnerId,purchaseId:p.purchaseId,kind:'PAID',teacher:item.teacher,startsAt:item.startsAt,timeZone:item.timeZone,isReplacement:item.isReplacement,entitlementId:t.entitlementId,status:'SCHEDULED'};
        if(localDate>p.lastUsableOn)review(s,e,[p.purchaseId],'EXPIRY_CONFIRMED',{proposedDate:localDate});
      }
    });
  }
  function schedule(s,e,p){
    fresh(s.lessons,p.lessonId);find(s.learners,p.learnerId);
    var lesson=Object.assign(clone(p),{status:'SCHEDULED',isReplacement:Boolean(p.entitlementId)});
    if(p.kind==='TRIAL'){s.lessons[p.lessonId]=lesson;return;}
    var purchase=find(s.purchases,p.purchaseId),b=purchaseBalance(s,purchase,e.recordedAt),t;
    if(purchase.learnerId!==p.learnerId)R.fail('INVALID_INPUT','The package belongs to another learner.');
    if(purchase.closed||b.held)R.fail('REVIEW_REQUIRED','Resolve this package review before scheduling.');
    if(b.unpaidCents)R.fail('UNPAID','Confirm and match the full package payment first.');
    if(p.entitlementId){t=find(s.entitlements,p.entitlementId);if(t.purchaseId!==p.purchaseId||t.status!=='PENDING')R.fail('INVALID_INPUT','This replacement reservation is not available.');}
    var localDate=R.madridDate(p.startsAt);
    if(localDate<purchase.purchasedOn)R.fail('INVALID_INPUT','A paid lesson cannot precede its purchase.');
    if(localDate>purchase.lastUsableOn){
      if(t&&t.pendingReason==='SERVICE'){review(s,e,[p.purchaseId],'EXPIRY_CONFIRMED',{proposedDate:localDate});return;}
      R.fail('EXPIRED','The proposed lesson is after package expiry.');
    }
    if(!t){
      if(b.available<1)R.fail('INSUFFICIENT_CREDITS','No unreserved lesson credits remain.');
      t={entitlementId:e.eventId,purchaseId:p.purchaseId,learnerId:p.learnerId,makeupAwarded:false};fresh(s.entitlements,t.entitlementId);s.entitlements[t.entitlementId]=t;
    }
    t.status='SCHEDULED';t.currentLessonId=p.lessonId;lesson.entitlementId=t.entitlementId;s.lessons[p.lessonId]=lesson;
  }
  function outcome(s,e,p){
    var lesson=find(s.lessons,p.lessonId);
    if(lesson.status!=='SCHEDULED')R.fail('INVALID_INPUT','This lesson already has an outcome.');
    if(['COMPLETED','NO_SHOW','SHORTENED','TECHNICAL_FAILURE','DISPUTED'].indexOf(p.outcome)>=0&&Date.parse(e.recordedAt)<Date.parse(lesson.startsAt))R.fail('INVALID_INPUT','Record attendance after the lesson starts.');
    if(p.outcome==='COMPLETED'&&Date.parse(e.recordedAt)<Date.parse(lesson.startsAt)+2400000)R.fail('INVALID_INPUT','Use an exception outcome until the full 40-minute lesson has ended.');
    if(p.noticeAt&&Date.parse(p.noticeAt)>Date.parse(e.recordedAt))R.fail('INVALID_INPUT','Notice cannot be in the future.');
    lesson.outcome=p.outcome;lesson.status=p.outcome;if(p.noticeAt)lesson.noticeAt=p.noticeAt;
    var t=lesson.entitlementId?s.entitlements[lesson.entitlementId]:null;
    if(['SHORTENED','TECHNICAL_FAILURE','DISPUTED'].indexOf(p.outcome)>=0){
      if(t)t.status='REVIEW';lesson.status='REVIEW';review(s,e,lesson.purchaseId?[lesson.purchaseId]:[],'LESSON_DECISION',{lessonId:lesson.lessonId});return;
    }
    if(!t)return;
    if(p.outcome==='COMPLETED'){t.status='COMPLETED';return;}
    var timely=p.outcome==='PARENT_CANCELLED'&&Date.parse(lesson.startsAt)-Date.parse(p.noticeAt)>=86400000;
    if(p.outcome==='SERVICE_CANCELLED'||timely){t.status='PENDING';t.currentLessonId=null;t.pendingReason=p.outcome==='SERVICE_CANCELLED'?'SERVICE':'TIMELY';return;}
    if(lesson.isReplacement){t.status='REVIEW';lesson.status='REVIEW';review(s,e,[lesson.purchaseId],'LESSON_DECISION',{lessonId:lesson.lessonId});return;}
    var b=purchaseBalance(s,s.purchases[lesson.purchaseId],e.recordedAt);
    if(b.makeupsAvailable>0){t.makeupAwarded=true;t.status='PENDING';t.currentLessonId=null;t.pendingReason='MAKEUP';}
    else t.status='FORFEITED';
  }
  function openPackage(s,e,p){
    if(p.paymentEvidence.verifiedOn>R.madridDate(e.recordedAt))R.fail('INVALID_INPUT','Historical payment verification cannot be in the future.');
    var clean={purchaseId:p.purchaseId,learnerId:p.learnerId,packageCode:p.packageCode,purchasedOn:p.purchasedOn,lastUsableOn:p.lastUsableOn};
    if(Object.values(s.purchases).some(function(old){return old.learnerId===p.learnerId&&old.openingSource===p.sourceReference;}))R.fail('DUPLICATE_REFERENCE','This opening source is already recorded for the learner.');
    var purchaseEvent=clone(e);purchaseEvent.payload.command={type:'CREATE_PURCHASE',payload:clean};reduce(s,purchaseEvent);
    var purchase=s.purchases[p.purchaseId];
    if(p.completed+p.forfeited>purchase.lessonCount||p.makeupsUsed>purchase.makeupLimit)R.fail('INVALID_INPUT','Opening usage exceeds the purchased allowance.');
    Object.assign(purchase,{openingCompleted:p.completed,openingForfeited:p.forfeited,openingMakeupsUsed:p.makeupsUsed,openingSource:p.sourceReference});
    var guardianId=s.learners[p.learnerId].guardianId;
    fresh(s.payments,e.eventId);fresh(s.matches,e.eventId);
    s.payments[e.eventId]={paymentId:e.eventId,guardianId:guardianId,source:'Historical verification',reference:p.paymentEvidence.sourceReference,receivedOn:'',verifiedOn:p.paymentEvidence.verifiedOn,amountCents:purchase.priceCents,currency:'EUR',verified:true,kind:'OPENING_ATTESTATION'};
    s.matches[e.eventId]={matchId:e.eventId,paymentId:e.eventId,purchaseId:p.purchaseId,amountCents:purchase.priceCents};
    addCommitments(s,purchase,p.commitments,e);
    if(!p.commitmentsConfirmed)review(s,e,[p.purchaseId],'COMMITMENTS_CONFIRMED',{});
  }
  function adjustment(s,e,p){
    fresh(s.adjustments,p.adjustmentId);var original=find(s.payments,p.originalReceiptId);
    if(p.occurredOn>R.madridDate(e.recordedAt)||(original.receivedOn&&p.occurredOn<original.receivedOn))R.fail('INVALID_INPUT','Check the adjustment date.');
    if(p.amountCents>netPayment(s,original))R.fail('OVER_ALLOCATION','The adjustment exceeds the original remaining payment.');
    if(Object.values(s.adjustments).some(function(a){return a.reference.toLowerCase()===p.reference.toLowerCase()&&s.payments[a.originalReceiptId].source.toLowerCase()===original.source.toLowerCase();}))R.fail('DUPLICATE_REFERENCE','This adjustment reference is already recorded.');
    s.adjustments[p.adjustmentId]=clone(p);
    var affected=Object.values(s.matches).filter(function(m){return m.paymentId===p.originalReceiptId;}).map(function(m){return m.purchaseId;}).filter(function(key,i,all){return all.indexOf(key)===i;});
    if(affected.length)review(s,e,affected,'RECONCILIATION_CONFIRMED',{paymentId:p.originalReceiptId});
  }
  function resolve(s,e,p){
    var r=find(s.reviews,p.caseId);if(r.resolved)R.fail('INVALID_INPUT','This review is already resolved.');
    var needed=['MARK_COMPLETED','CHARGE_ABSENCE','PRESERVE_REPLACEMENT'].indexOf(p.decision)>=0?'LESSON_DECISION':p.decision;
    if(p.decision==='CLOSE_PACKAGE'){
      var key=p.decisionData.purchaseId;
      if(r.purchaseIds.indexOf(key)<0)R.fail('INVALID_INPUT','Select a purchase affected by this case.');
      if(r.required.indexOf('RECONCILIATION_CONFIRMED')>=0&&paymentBalance(s,s.payments[r.details.paymentId]).shortfallCents)R.fail('REVIEW_REQUIRED','Correct excess payment allocations before closing.');
      var purchase=s.purchases[key];if(purchaseBalance(s,purchase,e.recordedAt).reserved)R.fail('DEPENDENCY_CONFLICT','Resolve outstanding lessons before closing.');
      r.closedPurchaseIds=r.closedPurchaseIds||[];
      if(r.closedPurchaseIds.indexOf(key)>=0)R.fail('INVALID_INPUT','This purchase was already closed for this case.');
      purchase.closed=true;r.closedPurchaseIds.push(key);
      if(r.purchaseIds.every(function(id){return r.closedPurchaseIds.indexOf(id)>=0;}))r.required=[];
    }else{
      if(r.required.indexOf(needed)<0)R.fail('INVALID_INPUT','This decision does not match the review case.');
      if(needed==='RECONCILIATION_CONFIRMED'){
        if(paymentBalance(s,s.payments[r.details.paymentId]).shortfallCents||r.purchaseIds.some(function(key){return (r.closedPurchaseIds||[]).indexOf(key)<0&&purchaseBalance(s,s.purchases[key],e.recordedAt).unpaidCents>0;}))R.fail('REVIEW_REQUIRED','The payment allocation is not yet reconciled.');
      }else if(needed==='EXPIRY_CONFIRMED'){
        if(p.decisionData.lastUsableOn<r.details.proposedDate)R.fail('INVALID_INPUT','The expiry does not cover the proposed lesson.');
        r.purchaseIds.forEach(function(key){s.purchases[key].lastUsableOn=p.decisionData.lastUsableOn;});
      }else if(needed==='COMMITMENTS_CONFIRMED')r.purchaseIds.forEach(function(key){addCommitments(s,s.purchases[key],p.decisionData.commitments,e);});
      else if(needed==='LESSON_DECISION'){
        var lesson=s.lessons[r.details.lessonId],t=lesson.entitlementId?s.entitlements[lesson.entitlementId]:null;
        if(p.decision==='MARK_COMPLETED'){lesson.status='COMPLETED';if(t)t.status='COMPLETED';}
        if(p.decision==='CHARGE_ABSENCE'){if(!t)R.fail('INVALID_INPUT','A trial has no paid credit to charge.');lesson.status='FORFEITED';t.status='FORFEITED';}
        if(p.decision==='PRESERVE_REPLACEMENT'){if(!t)R.fail('INVALID_INPUT','A trial has no paid replacement entitlement.');lesson.status='REPLACEMENT_DUE';t.status='PENDING';t.currentLessonId=null;t.pendingReason='REVIEWED';}
      }
      r.required=r.required.filter(function(value){return value!==needed;});
    }
    r.resolved=r.required.length===0;
  }
  function delta(before,after){var result=[];MAPS.forEach(function(map){var keys=Array.from(new Set(Object.keys(before[map]).concat(Object.keys(after[map]))));keys.forEach(function(key){var a=before[map][key]||null,b=after[map][key]||null;if(R.stable(a)!==R.stable(b))result.push({map:map,key:key,before:clone(a),after:clone(b)});});});return result;}
  function reverse(s,e,p){
    var original=s.events.find(function(old){return old.eventId===p.originalEventId;});
    if(!original||['REVERSE_EVENT','CANCEL_REQUEST'].indexOf(original.type)>=0||s.reversed[p.originalEventId]||!Array.isArray(original.payload.undo))R.fail('DEPENDENCY_CONFLICT','This event cannot be reversed.');
    original.payload.undo.forEach(function(d){
      if(MAPS.indexOf(d.map)<0||R.stable(s[d.map][d.key]||null)!==R.stable(d.after))R.fail('DEPENDENCY_CONFLICT','Later changes depend on this event.',null,[d.key]);
      if(d.before===null)delete s[d.map][d.key];else s[d.map][d.key]=clone(d.before);
    });
    try{
      assertInvariants(s);
      Object.values(s.purchases).forEach(function(purchase){var b=purchaseBalance(s,purchase,e.recordedAt);if(b.unpaidCents&&!b.held&&(b.reserved||b.completed||b.forfeited))R.fail('DEPENDENCY_CONFLICT','Recorded lessons depend on this payment match.');});
    }catch(error){R.fail('DEPENDENCY_CONFLICT','Resolve the dependent ledger records first.',null,error.recordIds&&error.recordIds.length?error.recordIds:original.targetId?[original.targetId]:[]);}
    s.reversed[p.originalEventId]=e.eventId;
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
      if(p.receivedOn>R.madridDate(e.recordedAt))R.fail('INVALID_INPUT','A verified receipt cannot be in the future.');
      if(Object.values(s.payments).some(function(old){return old.source.trim().toLowerCase()===p.source.toLowerCase()&&old.reference.trim().toLowerCase()===p.reference.toLowerCase();}))R.fail('DUPLICATE_REFERENCE','This payment reference is already recorded.');
      s.payments[p.paymentId]=clone(p);
    }
    else if(c.type==='MATCH_PAYMENT'){
      fresh(s.matches,p.matchId);var payment=find(s.payments,p.paymentId),purchase=find(s.purchases,p.purchaseId),child=find(s.learners,purchase.learnerId);
      if(payment.guardianId!==child.guardianId||p.amountCents>paymentBalance(s,payment).unallocatedCents||p.amountCents>purchaseBalance(s,purchase,e.recordedAt).unpaidCents)R.fail('OVER_ALLOCATION','The match exceeds available funds or belongs to another family.');
      s.matches[p.matchId]=clone(p);
    }
    else if(c.type==='SCHEDULE_LESSON')schedule(s,e,p);
    else if(c.type==='RECORD_OUTCOME')outcome(s,e,p);
    else if(c.type==='RECORD_PAYMENT_ADJUSTMENT')adjustment(s,e,p);
    else if(c.type==='OPEN_PACKAGE')openPackage(s,e,p);
    else if(c.type==='CHANGE_EXPIRY'){
      var changed=find(s.purchases,p.purchaseId);if(p.lastUsableOn<changed.purchasedOn)R.fail('INVALID_INPUT','Expiry cannot precede purchase.');
      if(Object.values(s.lessons).some(function(l){return l.purchaseId===p.purchaseId&&l.status==='SCHEDULED'&&R.madridDate(l.startsAt)>p.lastUsableOn;}))R.fail('DEPENDENCY_CONFLICT','Scheduled lessons depend on the existing expiry.');
      changed.lastUsableOn=p.lastUsableOn;
    }
    else if(c.type==='RESOLVE_REVIEW')resolve(s,e,p);
    else if(c.type==='REVERSE_EVENT')reverse(s,e,p);
    else if(c.type==='CANCEL_REQUEST'){/* Durable request fence. No financial or attendance change. */}
    else R.fail('INVALID_INPUT','Unsupported command.');
  }
  function assertInvariants(s){
    Object.values(s.learners).forEach(function(c){if(!s.guardians[c.guardianId])R.fail('CORRUPT_LEDGER','A guardian reference is missing.');});
    Object.values(s.matches).forEach(function(m){var pay=s.payments[m.paymentId],p=s.purchases[m.purchaseId];if(!pay||!p||!s.learners[p.learnerId]||pay.guardianId!==s.learners[p.learnerId].guardianId)R.fail('CORRUPT_LEDGER','A payment match reference is invalid.');});
    Object.values(s.entitlements).forEach(function(t){if(!s.purchases[t.purchaseId]||!s.learners[t.learnerId]||s.purchases[t.purchaseId].learnerId!==t.learnerId||['SCHEDULED','PENDING','REVIEW','COMPLETED','FORFEITED'].indexOf(t.status)<0)R.fail('CORRUPT_LEDGER','A lesson reservation is invalid.');if(t.currentLessonId&&!s.lessons[t.currentLessonId])R.fail('CORRUPT_LEDGER','A reserved lesson is missing.');});
    Object.values(s.lessons).forEach(function(l){
      if(!s.learners[l.learnerId]||(l.kind==='PAID'&&(!s.purchases[l.purchaseId]||!s.entitlements[l.entitlementId])))R.fail('CORRUPT_LEDGER','A lesson reference is invalid.');
      if(l.kind==='PAID'&&l.status==='SCHEDULED'&&R.madridDate(l.startsAt)>s.purchases[l.purchaseId].lastUsableOn&&!Object.values(s.reviews).some(function(r){return r.purchaseIds.indexOf(l.purchaseId)>=0&&!r.resolved&&r.required.indexOf('EXPIRY_CONFIRMED')>=0;}))R.fail('CORRUPT_LEDGER','A scheduled lesson falls outside its package expiry.');
    });
    Object.values(s.adjustments).forEach(function(a){if(!s.payments[a.originalReceiptId])R.fail('CORRUPT_LEDGER','The original payment is missing.');});
    Object.values(s.reviews).forEach(function(r){if(!Array.isArray(r.required)||!Array.isArray(r.purchaseIds)||r.purchaseIds.some(function(key){return !s.purchases[key];}))R.fail('CORRUPT_LEDGER','A review reference is invalid.');});
    Object.values(s.purchases).forEach(function(p){if(!s.learners[p.learnerId])R.fail('CORRUPT_LEDGER','A purchase learner reference is missing.',null,[p.purchaseId]);var b=purchaseBalance(s,p,'2000-01-01T00:00:00.000Z');if(b.remaining<0||b.available<0||b.makeupsAvailable<0||b.matchedCents>p.priceCents)R.fail('CORRUPT_LEDGER','The ledger balances need review.');});
    Object.values(s.payments).forEach(function(p){var b=paymentBalance(s,p);if(!s.guardians[p.guardianId]||b.netCents<0||!Number.isSafeInteger(b.matchedCents)||!Number.isSafeInteger(b.netCents))R.fail('CORRUPT_LEDGER','The ledger amounts need review.');});
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
    var s=empty(),requests={},ids={};
    try{
      events.forEach(function(e,index){validateEvent(e,index);if(requests[e.requestId]||ids[e.eventId])R.fail('CORRUPT_LEDGER','Duplicate event identity.');requests[e.requestId]=true;ids[e.eventId]=true;reduce(s,e);s.events.push(clone(e));s.sequence=e.sequence;});
      assertInvariants(s);
    }catch(error){R.fail('CORRUPT_LEDGER','The event history needs review before further changes.');}
    return s;
  }
  function decide(state,command,context){
    var c=R.normalizeCommand(command),existing=state.events.find(function(e){return e.requestId===c.requestId;});
    if(existing){if(existing.fingerprint!==context.fingerprint)R.fail('REQUEST_CONFLICT','This request ID was used with different details.');return {event:clone(existing),nextState:state,duplicate:true,preview:{balanceChanges:[],createdReviewCases:[]}};}
    if(c.expectedSequence!==state.sequence)R.fail('STALE_PREVIEW','The ledger changed. Refresh and preview again.');
    if(!context.actorEmail)R.fail('IDENTITY_REQUIRED','Authorize your Google account before saving.');
    var targetField={CREATE_GUARDIAN:'guardianId',UPDATE_GUARDIAN:'guardianId',CREATE_LEARNER:'learnerId',UPDATE_LEARNER:'learnerId',CREATE_PURCHASE:'purchaseId',OPEN_PACKAGE:'purchaseId',RECORD_RECEIPT:'paymentId',MATCH_PAYMENT:'matchId',SCHEDULE_LESSON:'lessonId',RECORD_OUTCOME:'lessonId',RECORD_PAYMENT_ADJUSTMENT:'adjustmentId',CHANGE_EXPIRY:'purchaseId',REVERSE_EVENT:'originalEventId',RESOLVE_REVIEW:'caseId',CANCEL_REQUEST:'originalRequestId'}[c.type];
    var e={schemaVersion:1,sequence:state.sequence+1,eventId:R.uuid(context.eventId),requestId:c.requestId,recordedAt:R.instant(context.nowIso),actorEmail:context.actorEmail,fingerprint:context.fingerprint,type:c.type,targetId:c.payload[targetField],reason:c.reason,payload:{command:clone(c)}};
    if(c.type==='CREATE_PURCHASE'||c.type==='OPEN_PACKAGE')e.payload.terms=clone(R.CATALOG[c.payload.packageCode]);
    var next=clone(state);reduce(next,e);next.sequence=e.sequence;next.events.push(clone(e));assertInvariants(next);
    e.payload.undo=delta(state,next);next.events[next.events.length-1]=clone(e);
    var changes=Array.from(new Set(Object.keys(state.purchases).concat(Object.keys(next.purchases)))).map(function(id){
      var old=state.purchases[id],current=next.purchases[id],p=current||old,before=old?purchaseBalance(state,old,context.nowIso):null,after=current?purchaseBalance(next,current,context.nowIso):null;
      if(R.stable(old||null)===R.stable(current||null)&&R.stable(before)===R.stable(after))return null;
      return {purchaseId:id,childName:(next.learners[p.learnerId]||state.learners[p.learnerId]).firstName,packageName:p.name,priceCents:p.priceCents,before:before,after:after,beforeClosed:Boolean(old&&old.closed),afterClosed:Boolean(current&&current.closed)};
    }).filter(function(value){return value!==null;});
    return {event:e,nextState:next,duplicate:false,preview:{balanceChanges:changes,createdReviewCases:Object.values(next.reviews).filter(function(r){return !state.reviews[r.caseId];})}};
  }
  return {replay:replay,decide:decide,assertInvariants:assertInvariants,purchaseBalance:purchaseBalance,paymentBalance:paymentBalance};
})();
