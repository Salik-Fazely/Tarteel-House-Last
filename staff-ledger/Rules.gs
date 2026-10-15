/* Pure staff-ledger validation. No Google services or ambient clock. */
var LedgerRules = (function () {
  'use strict';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    MATCH_PAYMENT:['matchId','paymentId','purchaseId','amountCents']
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
    if (!Number.isFinite(Date.parse(value))) fail('INVALID_INPUT','Use a valid instant.',field);
    return new Date(value).toISOString();
  }
  function madridDate(value) {
    var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant(value)));
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
      if (/Id$/.test(k)) value=uuid(value,k);
      else if (/On$/.test(k)) value=date(value,k);
      else if (k==='amountCents') value=integer(value,1,k);
      else if (k==='verified') { if (value!==true) fail('INVALID_INPUT','Confirm that the payment was checked.',k); }
      else {
        var max=k==='email'?254:k==='whatsapp'?40:k==='source'?64:k==='reference'||k==='bookingReference'?128:100;
        value=text(value,max,k,k==='bookingReference');
        if (k==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('INVALID_INPUT','Use a valid guardian email.',k);
        if (k==='whatsapp'&&!/^\+[1-9]\d{6,14}$/.test(value)) fail('INVALID_INPUT','Use an international number starting with +.',k);
        if (k==='language'&&['english','arabic','turkish','persian'].indexOf(value)<0) fail('INVALID_INPUT','Select a teaching language.',k);
        if (k==='currency'&&value!=='EUR') fail('INVALID_INPUT','Only EUR payments can be recorded.',k);
        if (k==='packageCode'&&!CATALOG[value]) fail('INVALID_INPUT','Select an available package.',k);
      }
      c.payload[k]=value;
    });
    if (/^(UPDATE_|CHANGE_|REVERSE_|RESOLVE_|OPEN_|RECORD_PAYMENT_ADJUSTMENT)/.test(c.type)&&!c.reason) fail('INVALID_INPUT','Enter a reason for this change.','reason');
    return c;
  }
  return {CATALOG:CATALOG,normalizeCommand:normalizeCommand,canonicalCommand:canonicalCommand,stable:stable,defaultLastUsableOn:defaultLastUsableOn,parseEuroAmount:parseEuroAmount,madridDate:madridDate,date:date,instant:instant,text:text,uuid:uuid,integer:integer,keys:keys,fail:fail};
})();
