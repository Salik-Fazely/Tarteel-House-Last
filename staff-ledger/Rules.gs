/* Pure staff-ledger validation. No Google services or ambient clock. */
var LedgerRules = (function () {
  'use strict';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var MADRID = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'});
  var CATALOG = Object.freeze({
    STARTER: Object.freeze({ name:'Starter', priceCents:12000, lessonCount:6, makeupLimit:0 }),
    STEADY: Object.freeze({ name:'Steady', priceCents:22000, lessonCount:12, makeupLimit:4 }),
    COMMITTED: Object.freeze({ name:'Committed', priceCents:40000, lessonCount:25, makeupLimit:4 })
  });
  var SCHEMAS = {
    CREATE_GUARDIAN:['guardianId','name','email','whatsapp'],
    UPDATE_GUARDIAN:['guardianId','name','email','whatsapp'],
    CREATE_LEARNER:['learnerId','guardianId','firstName','language','bookingReference?'],
    UPDATE_LEARNER:['learnerId','firstName','language'],
    CREATE_PURCHASE:['purchaseId','learnerId','packageCode','purchasedOn','lastUsableOn'],
    RECORD_RECEIPT:['paymentId','guardianId','source','reference','receivedOn','amountCents','currency','verified'],
    MATCH_PAYMENT:['matchId','paymentId','purchaseId','amountCents'],
    SCHEDULE_LESSON:['lessonId','learnerId','kind','teacher','startsAt','timeZone','purchaseId?','entitlementId?'],
    RECORD_OUTCOME:['lessonId','outcome','noticeAt?'],
    RECORD_PAYMENT_ADJUSTMENT:['adjustmentId','originalReceiptId','kind','amountCents','occurredOn','reference','verified'],
    CHANGE_EXPIRY:['purchaseId','lastUsableOn'],
    OPEN_PACKAGE:['purchaseId','learnerId','packageCode','purchasedOn','lastUsableOn','paymentEvidence','completed','forfeited','makeupsUsed','commitments','commitmentsConfirmed','sourceReference'],
    REVERSE_EVENT:['originalEventId'],
    RESOLVE_REVIEW:['caseId','decision','decisionData'],
    CANCEL_REQUEST:['originalRequestId']
  };
  function fail(code, message, field, ids) {
    var error = new Error(message || 'The request could not be accepted.');
    error.code=code; error.field=field || null; error.recordIds=ids || []; throw error;
  }
  function object(value) { return value && typeof value==='object' && !Array.isArray(value); }
  function keys(value, required, optional) {
    if (!object(value)) fail('INVALID_INPUT','Use a valid record.');
    var allowed=required.concat(optional || []);
    if (Object.keys(value).some(function(k){return allowed.indexOf(k)<0;}) || required.some(function(k){return !Object.prototype.hasOwnProperty.call(value,k);})) fail('INVALID_INPUT','Required fields are missing or unsupported fields were supplied.');
  }
  function text(value, max, field, empty) {
    if (typeof value!=='string' || value.length>max || /[\x00-\x1f\x7f]/.test(value) || (!empty && !value.trim())) fail('INVALID_INPUT','Check the text field and its length.',field);
    return value.trim();
  }
  function uuid(value, field) { if (typeof value!=='string'||!UUID.test(value)) fail('INVALID_INPUT','Use a valid record ID.',field); return value.toLowerCase(); }
  function integer(value,min,field) { if (!Number.isSafeInteger(value)||value<min) fail('INVALID_INPUT','Use a valid whole number.',field); return value; }
  function date(value,field) {
    if (typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.slice(0,4)==='0000') fail('INVALID_INPUT','Use a valid date.',field);
    var d=new Date(value+'T12:00:00.000Z');
    if (!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value) fail('INVALID_INPUT','Use a valid date.',field);
    return value;
  }
  function instant(value,field) {
    if (typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail('INVALID_INPUT','Include a valid date, time and UTC offset.',field);
    date(value.slice(0,10),field);
    var clock=value.slice(11,19).split(':').map(Number);
    if(clock[0]>23||clock[1]>59||clock[2]>59)fail('INVALID_INPUT','Use a valid clock time.',field);
    if (!Number.isFinite(Date.parse(value))) fail('INVALID_INPUT','Use a valid instant.',field);
    return new Date(value).toISOString();
  }
  function madridDate(value) {
    var parts=MADRID.formatToParts(new Date(instant(value)));
    var values={}; parts.forEach(function(p){values[p.type]=p.value;});
    return values.year+'-'+values.month+'-'+values.day;
  }
  function defaultLastUsableOn(value) {
    date(value); var y=Number(value.slice(0,4)), month=value.slice(5,7), day=value.slice(8,10);
    if (month==='02'&&day==='29') return String(y+1)+'-02-28';
    var next=new Date(String(y+1)+'-'+month+'-'+day+'T12:00:00.000Z');
    next.setUTCDate(next.getUTCDate()-1); return next.toISOString().slice(0,10);
  }
  function parseEuroAmount(value) {
    if (typeof value!=='string'||!/^\d{1,14}(?:[.,]\d{1,2})?$/.test(value.trim())) fail('INVALID_INPUT','Use a positive EUR amount with at most two decimals.');
    var parts=value.trim().replace(',','.').split('.');
    return integer(Number(parts[0])*100+Number(((parts[1]||'')+'00').slice(0,2)),1,'amountCents');
  }
  function stable(value) {
    if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
    if (object(value)) return '{'+Object.keys(value).sort().map(function(k){return JSON.stringify(k)+':'+stable(value[k]);}).join(',')+'}';
    return JSON.stringify(value);
  }
  function canonicalCommand(c) { return stable({schemaVersion:c.schemaVersion,type:c.type,payload:c.payload,reason:c.reason}); }
  function commitments(input) {
    if(!Array.isArray(input)||input.length>25)fail('INVALID_INPUT','Check the outstanding commitments.');
    var ids={},refs={};
    return input.map(function(p){
      if(!object(p)||['SCHEDULED','MAKEUP_DUE'].indexOf(p.kind)<0)fail('INVALID_INPUT','Select the commitment type.');
      keys(p,['entitlementId','sourceReference','kind'].concat(p.kind==='SCHEDULED'?['lessonId','teacher','startsAt','timeZone','isReplacement']:[]));
      var c={entitlementId:uuid(p.entitlementId),sourceReference:text(p.sourceReference,128,'sourceReference'),kind:p.kind};
      var ref=c.sourceReference.toLowerCase();
      if(ids[c.entitlementId]||refs[ref])fail('INVALID_INPUT','Outstanding commitments must be unique.');
      ids[c.entitlementId]=true;refs[ref]=true;
      if(p.kind==='SCHEDULED'){
        if(p.timeZone!=='Europe/Madrid'||typeof p.isReplacement!=='boolean')fail('INVALID_INPUT','Confirm the timezone and replacement status.');
        Object.assign(c,{lessonId:uuid(p.lessonId),teacher:text(p.teacher,100,'teacher'),startsAt:instant(p.startsAt),timeZone:p.timeZone,isReplacement:p.isReplacement});
      }
      return c;
    });
  }
  function normalizeCommand(input) {
    keys(input,['schemaVersion','requestId','expectedSequence','type','payload','reason']);
    if (input.schemaVersion!==1 || !SCHEMAS[input.type]) fail('INVALID_INPUT','Unsupported command.');
    var serialized=JSON.stringify(input);
    if (unescape(encodeURIComponent(serialized)).length>32768) fail('INVALID_INPUT','This request is too large.');
    var c={schemaVersion:1,requestId:uuid(input.requestId,'requestId'),expectedSequence:integer(input.expectedSequence,0,'expectedSequence'),type:input.type,payload:{},reason:text(input.reason,1000,'reason',true)};
    var schema=SCHEMAS[c.type], required=schema.filter(function(k){return !k.endsWith('?');}), optional=schema.filter(function(k){return k.endsWith('?');}).map(function(k){return k.slice(0,-1);});
    keys(input.payload,required,optional);
    Object.keys(input.payload).forEach(function(k){
      var value=input.payload[k];
      if(k==='commitments')value=commitments(value);
      else if(k==='paymentEvidence'){
        keys(value,['verified','verifiedOn','sourceReference']);if(value.verified!==true)fail('INVALID_INPUT','Verify the historical payment.');
        value={verified:true,verifiedOn:date(value.verifiedOn),sourceReference:text(value.sourceReference,128,'sourceReference')};
      }
      else if(k==='decisionData'){
        if(!object(value))fail('INVALID_INPUT','Use valid review details.');
        if(input.payload.decision==='EXPIRY_CONFIRMED'){keys(value,['lastUsableOn']);value={lastUsableOn:date(value.lastUsableOn)};}
        else if(input.payload.decision==='COMMITMENTS_CONFIRMED'){keys(value,['commitments']);value={commitments:commitments(value.commitments)};}
        else if(input.payload.decision==='CLOSE_PACKAGE'){keys(value,['purchaseId']);value={purchaseId:uuid(value.purchaseId)};}
        else {keys(value,[]);value={};}
      }
      else if(k==='commitmentsConfirmed'){if(typeof value!=='boolean')fail('INVALID_INPUT','Confirm outstanding commitments.');}
      else if (/Id$/.test(k)) value=uuid(value,k);
      else if (/On$/.test(k)) value=date(value,k);
      else if(/At$/.test(k))value=instant(value,k);
      else if(['completed','forfeited','makeupsUsed'].indexOf(k)>=0)value=integer(value,0,k);
      else if (k==='amountCents') value=integer(value,1,k);
      else if (k==='verified') { if (value!==true) fail('INVALID_INPUT','Confirm that the payment was checked.',k); }
      else {
        var max=k==='email'?254:k==='whatsapp'?40:k==='source'?64:k==='reference'||k==='bookingReference'||k==='sourceReference'?128:100;
        value=text(value,max,k,k==='bookingReference');
        if (k==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('INVALID_INPUT','Use a valid guardian email.',k);
        if (k==='whatsapp'&&!/^\+[1-9]\d{6,14}$/.test(value)) fail('INVALID_INPUT','Use an international number starting with +.',k);
        if (k==='language'&&['english','arabic','turkish','persian'].indexOf(value)<0) fail('INVALID_INPUT','Select a teaching language.',k);
        if (k==='currency'&&value!=='EUR') fail('INVALID_INPUT','Only EUR payments can be recorded.',k);
        if (k==='packageCode'&&!CATALOG[value]) fail('INVALID_INPUT','Select an available package.',k);
        if(k==='timeZone'&&value!=='Europe/Madrid')fail('INVALID_INPUT','Use the ledger timezone.',k);
        if(k==='kind'&&['PAID','TRIAL','REFUND','REVERSAL'].indexOf(value)<0)fail('INVALID_INPUT','Select a supported type.',k);
        if(k==='outcome'&&['COMPLETED','PARENT_CANCELLED','SERVICE_CANCELLED','NO_SHOW','SHORTENED','TECHNICAL_FAILURE','DISPUTED'].indexOf(value)<0)fail('INVALID_INPUT','Select a supported outcome.',k);
        if(k==='decision'&&['RECONCILIATION_CONFIRMED','MARK_COMPLETED','CHARGE_ABSENCE','PRESERVE_REPLACEMENT','EXPIRY_CONFIRMED','COMMITMENTS_CONFIRMED','CLOSE_PACKAGE'].indexOf(value)<0)fail('INVALID_INPUT','Select a supported decision.',k);
      }
      c.payload[k]=value;
    });
    if(c.type==='SCHEDULE_LESSON'&&((c.payload.kind==='PAID'&&!c.payload.purchaseId)||(c.payload.kind==='TRIAL'&&(c.payload.purchaseId||c.payload.entitlementId))||['TRIAL','PAID'].indexOf(c.payload.kind)<0))fail('INVALID_INPUT','Choose the correct lesson and package.');
    if(c.type==='RECORD_OUTCOME'&&((c.payload.outcome==='PARENT_CANCELLED'&&!c.payload.noticeAt)||(c.payload.outcome!=='PARENT_CANCELLED'&&c.payload.noticeAt)))fail('INVALID_INPUT','Enter notice only for a parent cancellation.');
    if(c.type==='RECORD_PAYMENT_ADJUSTMENT'&&['REFUND','REVERSAL'].indexOf(c.payload.kind)<0)fail('INVALID_INPUT','Select a refund or reversal.');
    if(c.type==='CANCEL_REQUEST'&&c.requestId!==c.payload.originalRequestId)fail('INVALID_INPUT','Cancellation must retain the original request ID.');
    if (/^(UPDATE_|CHANGE_|REVERSE_|RESOLVE_|OPEN_|RECORD_PAYMENT_ADJUSTMENT|CANCEL_)/.test(c.type)&&!c.reason) fail('INVALID_INPUT','Enter a reason for this change.','reason');
    return c;
  }
  return {CATALOG:CATALOG,normalizeCommand:normalizeCommand,canonicalCommand:canonicalCommand,stable:stable,defaultLastUsableOn:defaultLastUsableOn,parseEuroAmount:parseEuroAmount,madridDate:madridDate,date:date,instant:instant,text:text,uuid:uuid,integer:integer,keys:keys,commitments:commitments,fail:fail};
})();
