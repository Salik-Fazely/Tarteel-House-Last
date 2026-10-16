/* The only staff ledger writer. No public deployment or external services. */
var LedgerStorage = (function(){
  'use strict';
  var R=LedgerRules,S=LedgerSchema,PIN='LEDGER_CONTAINER_V1',PENDING='LEDGER_PENDING_V1',LAST='LEDGER_LAST_COMMITTED_V1';
  var SAFE=['INVALID_INPUT','IDENTITY_REQUIRED','STALE_PREVIEW','REQUEST_CONFLICT','DUPLICATE_REFERENCE','UNPAID','EXPIRED','REVIEW_REQUIRED','INSUFFICIENT_CREDITS','OVER_ALLOCATION','DEPENDENCY_CONFLICT','CORRUPT_LEDGER','CONFIGURATION_REQUIRED','LOCK_BUSY','STORE_UNAVAILABLE','SAVE_UNCERTAIN'];
  function hash(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(n){return ('0'+((n+256)%256).toString(16)).slice(-2);}).join('');}
  function locked(fn,initializing){
    var lock,acquired=false;
    try{
      var actor=Session.getEffectiveUser().getEmail();if(typeof actor!=='string'||!actor.trim())R.fail('IDENTITY_REQUIRED','Authorize your Google account before using the ledger.');
      lock=LockService.getDocumentLock();if(!lock||!lock.tryLock(5000))R.fail('LOCK_BUSY','The ledger is busy. Wait and try again.');acquired=true;
      var book=SpreadsheetApp.getActiveSpreadsheet(),props=PropertiesService.getDocumentProperties();
      if(!book)R.fail('STORE_UNAVAILABLE','Check the bound ledger.');
      var pin=props.getProperty(PIN);
      if((pin&&pin!==book.getId())||(!pin&&!initializing))R.fail('STORE_UNAVAILABLE','Initialize the verified ledger in its own bound project.');
      LedgerWorkbook.validate(book);
      if(Session.getScriptTimeZone()!==S.timeZone||((pin||!initializing)&&book.getSpreadsheetTimeZone()!==S.timeZone))R.fail('CONFIGURATION_REQUIRED','Set both the spreadsheet and bound script timezone to Europe/Madrid before continuing.');
      return fn({book:book,props:props,actorEmail:actor.trim(),nowIso:new Date().toISOString(),pin:pin});
    }catch(error){
      var code=error&&SAFE.indexOf(error.code)>=0?error.code:'STORE_UNAVAILABLE';
      if(book&&pin===book.getId()&&['CORRUPT_LEDGER','CONFIGURATION_REQUIRED'].indexOf(code)>=0){try{var overview=book.getSheetByName('Overview');if(overview)overview.getRange(2,2).setValue('Stopped — '+(code==='CORRUPT_LEDGER'?'history/schema review required':'timezone configuration required'));SpreadsheetApp.flush();}catch(ignored){/* Do not replace the original safe error. */}}
      return {ok:false,error:{code:code,message:code==='STORE_UNAVAILABLE'?'The ledger service is unavailable. Keep the request ID and try a status check.':error.message,field:error&&error.field||null,recordIds:error&&Array.isArray(error.recordIds)?error.recordIds.filter(function(v){return typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);}):[]}};
    }finally{if(acquired)lock.releaseLock();}
  }
  function read(ctx){
    var sheet=ctx.book.getSheetByName('Events'),count=sheet.getLastRow()-S.headerRow;
    if(count<0||count>S.maxEvents)R.fail('CORRUPT_LEDGER','The event history requires a size or schema review.');
    var rows=count?sheet.getRange(S.headerRow+1,1,count,11).getValues():[];
    try{
      var events=rows.map(function(row){
        var wrapper=JSON.parse(row[10]);
        var e={sequence:row[0],schemaVersion:row[1],eventId:row[2],requestId:row[3],fingerprint:row[4],recordedAt:row[5],actorEmail:row[6],type:row[7],targetId:row[8],reason:row[9],payload:wrapper.data};
        if(wrapper.checksum!==hash(R.stable(e))||e.fingerprint!==hash(R.canonicalCommand(e.payload.command)))R.fail('CORRUPT_LEDGER','Stored event integrity verification failed.');
        return e;
      });
      var markRaw=ctx.props.getProperty(LAST),mark=markRaw?JSON.parse(markRaw):null;
      if(ctx.pin&&!mark)R.fail('CORRUPT_LEDGER','The commit checkpoint is missing.');
      if(mark){
        if(!Number.isSafeInteger(mark.sequence)||mark.sequence<0||mark.sequence>events.length)R.fail('CORRUPT_LEDGER','Committed event history is missing.');
        if(mark.sequence&&(!events[mark.sequence-1]||events[mark.sequence-1].eventId!==mark.eventId||hash(R.stable(events[mark.sequence-1]))!==mark.checksum))R.fail('CORRUPT_LEDGER','The commit checkpoint does not match history.');
        if(events.length>mark.sequence){var p=pending(ctx),last=events[events.length-1];if(events.length!==mark.sequence+1||!p||p.eventId!==last.eventId||p.fingerprint!==last.fingerprint)R.fail('CORRUPT_LEDGER','Unrecognized events need review.');}
      }
      return {events:events,state:LedgerDomain.replay(events)};
    }catch(error){R.fail('CORRUPT_LEDGER','The event history needs review before further changes.');}
  }
  function pending(ctx){
    var raw=ctx.props.getProperty(PENDING);if(!raw)return null;
    try{var p=JSON.parse(raw);R.uuid(p.requestId);R.uuid(p.eventId);if(!/^[0-9a-f]{64}$/.test(p.fingerprint))throw Error();return p;}catch(error){R.fail('CORRUPT_LEDGER','The pending-write marker needs review.');}
  }
  function settle(ctx,data){
    var p=pending(ctx);if(!p)return;
    var event=data.events.find(function(e){return e.requestId===p.requestId;});
    if(!event)R.fail('SAVE_UNCERTAIN','A previous save is uncertain. Check its status and review before another write.');
    if(event.fingerprint!==p.fingerprint||event.eventId!==p.eventId)R.fail('CORRUPT_LEDGER','The pending write conflicts with stored history.');
    ctx.props.setProperty(LAST,JSON.stringify({sequence:event.sequence,eventId:event.eventId,checksum:hash(R.stable(event))}));
    ctx.props.deleteProperty(PENDING);
  }
  function result(ctx,data,event,duplicate,preview){
    var cancelled=event.type==='CANCEL_REQUEST',status=cancelled?'CANCELLED':'SAVED';
    try{LedgerWorkbook.refresh(ctx.book,data.state,ctx.nowIso);}catch(error){status=cancelled?'CANCELLED_REFRESH_REQUIRED':'SAVED_REFRESH_REQUIRED';}
    return {ok:true,requestId:event.requestId,eventId:event.eventId,sequence:event.sequence,duplicate:duplicate,status:status,preview:preview||{balanceChanges:[],createdReviewCases:[]}};
  }
  function withRequest(input,result){result.requestId=input&&typeof input.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)?input.requestId.toLowerCase():null;return result;}
  function commit(ctx,input){
    var command=R.normalizeCommand(input),fingerprint=hash(R.canonicalCommand(command)),data=read(ctx);
    settle(ctx,data);
    var existing=data.events.find(function(e){return e.requestId===command.requestId;});
    if(existing){if(existing.fingerprint!==fingerprint)R.fail('REQUEST_CONFLICT','This request ID was used with different details.');return result(ctx,data,existing,true);}
    if(data.events.length>=S.maxEvents)R.fail('INVALID_INPUT','The ledger has reached its capacity. Arrange a reviewed migration before adding entries.');
    var decided=LedgerDomain.decide(data.state,command,{actorEmail:ctx.actorEmail,nowIso:ctx.nowIso,eventId:Utilities.getUuid(),fingerprint:fingerprint}),event=decided.event;
    var payload=JSON.stringify({data:event.payload,checksum:hash(R.stable(event))});
    if(payload.length>45000)R.fail('INVALID_INPUT','This change is too large for one ledger event. Split it into smaller entries.');
    var row=[event.sequence,event.schemaVersion,event.eventId,event.requestId,event.fingerprint,event.recordedAt,event.actorEmail,event.type,event.targetId,event.reason,payload];
    var sheet=ctx.book.getSheetByName('Events'),nextRow=S.headerRow+data.events.length+1;
    if(nextRow>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),nextRow-sheet.getMaxRows());
    var marker=JSON.stringify({requestId:event.requestId,eventId:event.eventId,fingerprint:event.fingerprint,createdAt:ctx.nowIso});
    ctx.props.setProperty(PENDING,marker);
    if(ctx.props.getProperty(PENDING)!==marker)R.fail('STORE_UNAVAILABLE','The pending-write marker could not be verified.');
    try{
      sheet.getRange(nextRow,1,1,row.length).setValues([row.map(function(value){return typeof value==='string'&&/^[\s]*[=+\-@]/.test(value)?"'"+value:value;})]);SpreadsheetApp.flush();
    }catch(error){/* A thrown write can have persisted. Resolve only through readback. */}
    var confirmed;
    try{confirmed=read(ctx);settle(ctx,confirmed);}catch(error){R.fail('SAVE_UNCERTAIN','The save could not be confirmed. Keep this request ID and check its status.');}
    var saved=confirmed.events.find(function(e){return e.requestId===command.requestId;});
    if(!saved)R.fail('SAVE_UNCERTAIN','The save could not be confirmed. Check its status before continuing.');
    return result(ctx,confirmed,saved,false,decided.preview);
  }
  function execute(input){return withRequest(input,locked(function(ctx){return commit(ctx,input);}));}
  function initialize(){return locked(function(ctx){
    var data=read(ctx);
    if(!ctx.pin&&data.events.length)R.fail('STORE_UNAVAILABLE','Do not initialize a copy containing existing event history.');
    if(!ctx.pin){LedgerWorkbook.configure(ctx.book);ctx.props.setProperty(LAST,JSON.stringify({sequence:0,eventId:null,checksum:null}));ctx.props.setProperty(PIN,ctx.book.getId());}
    settle(ctx,data);LedgerWorkbook.refresh(ctx.book,data.state,ctx.nowIso);
    return {ok:true,initialized:true,sequence:data.state.sequence};
  },true);}
  function bootstrap(options){return locked(function(ctx){
    var data=read(ctx),view=LedgerViews.project(data.state,{nowIso:ctx.nowIso}),opts=options||{};
    R.keys(opts,[],['offset','limit','query']);var offset=opts.offset===undefined?0:R.integer(opts.offset,0),limit=opts.limit===undefined?100:R.integer(opts.limit,1),query=opts.query===undefined?'':R.text(opts.query,128,'query',true).toLowerCase();
    if(limit>200||offset>10000)R.fail('INVALID_INPUT','Use a smaller page.');
    var arrays=['guardians','students','packages','payments','matches','lessons','entitlements','adjustments','reviewCases'],totals={};
    arrays.forEach(function(key){var rows=view[key].filter(function(row){return !query||R.stable(row).toLowerCase().indexOf(query)>=0;});totals[key]=rows.length;view[key]=rows.slice(offset,offset+limit);});
    delete view.sheets;view.page={offset:offset,limit:limit,totals:totals};view.containerId=ctx.book.getId();view.actorEmail=ctx.actorEmail;view.health=LedgerWorkbook.health(ctx.book,data.state,pending(ctx));return Object.assign({ok:true},view);
  });}
  function preview(input){return withRequest(input,locked(function(ctx){var c=R.normalizeCommand(input),data=read(ctx);settle(ctx,data);var d=LedgerDomain.decide(data.state,c,{actorEmail:ctx.actorEmail,nowIso:ctx.nowIso,eventId:c.requestId,fingerprint:hash(R.canonicalCommand(c))});return {ok:true,requestId:c.requestId,sequence:data.state.sequence,preview:d.preview};}));}
  function status(requestId){return locked(function(ctx){R.uuid(requestId);var data=read(ctx),event=data.events.find(function(e){return e.requestId===requestId.toLowerCase();}),p=pending(ctx);if(event){if(p&&p.requestId===event.requestId)settle(ctx,data);return result(ctx,data,event,true);}return {ok:true,requestId:requestId,status:p&&p.requestId===requestId?'PENDING_REVIEW':'NOT_FOUND',sequence:data.state.sequence};});}
  function refresh(){return locked(function(ctx){var data=read(ctx);settle(ctx,data);LedgerWorkbook.refresh(ctx.book,data.state,ctx.nowIso);return {ok:true,sequence:data.state.sequence};});}
  // Called only by the native menu after staff inspect the completed execution.
  function recover(requestId,reason){return locked(function(ctx){
    requestId=R.uuid(requestId);reason=R.text(reason,1000,'review reason');
    var data=read(ctx),p=pending(ctx);
    var event=data.events.find(function(e){return e.requestId===requestId;});
    if(event){if(p&&p.requestId===requestId)settle(ctx,data);return result(ctx,data,event,true);}
    if(p&&p.requestId!==requestId)R.fail('INVALID_INPUT','Review the workbook’s pending request first.');
    if(p&&(!p.createdAt||Date.parse(ctx.nowIso)-Date.parse(p.createdAt)<300000))R.fail('REVIEW_REQUIRED','Wait at least five minutes and confirm the original Apps Script execution has ended.');
    var log=JSON.parse(ctx.props.getProperty('LEDGER_RECOVERY_LOG_V1')||'[]');
    log.push({requestId:requestId,eventId:p?p.eventId:null,reviewedAt:ctx.nowIso,actorEmail:ctx.actorEmail,reason:reason});
    log=log.slice(-10);var encoded=JSON.stringify(log);
    while(unescape(encodeURIComponent(encoded)).length>=8000&&log.length>1){log.shift();encoded=JSON.stringify(log);}
    ctx.props.setProperty('LEDGER_RECOVERY_LOG_V1',encoded);
    if(ctx.props.getProperty('LEDGER_RECOVERY_LOG_V1')!==encoded)R.fail('STORE_UNAVAILABLE','The recovery review could not be recorded.');
    ctx.props.deleteProperty(PENDING);
    // Claim the original request ID in Events, fencing any execution queued later.
    return commit(ctx,{schemaVersion:1,requestId:requestId,expectedSequence:data.state.sequence,type:'CANCEL_REQUEST',payload:{originalRequestId:requestId},reason:reason});
  });}
  function summary(learnerId){return locked(function(ctx){R.uuid(learnerId);var data=read(ctx);return {ok:true,summary:LedgerWorkbook.summary(ctx.book,data.state,learnerId,ctx.nowIso),sequence:data.state.sequence};});}
  function health(){return locked(function(ctx){var data=read(ctx);return Object.assign({ok:true},LedgerWorkbook.health(ctx.book,data.state,pending(ctx)));});}
  return {execute:execute,initialize:initialize,bootstrap:bootstrap,preview:preview,status:status,refresh:refresh,summary:summary,health:health,recover:recover};
})();
