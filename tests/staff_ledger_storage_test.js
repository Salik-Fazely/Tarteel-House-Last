'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {storageFixture}=require('./helpers/staff_ledger_storage_fixture');
const {id}=require('./helpers/staff_ledger_fixture');
const guardian=()=>({guardianId:id(1),name:'QA Guardian',email:'qa@example.invalid',whatsapp:'+34600000000'});
function ready(){const f=storageFixture();assert.equal(f.call('ledgerInitialize').ok,true);return f;}
function command(f,payload=guardian()){return f.command('CREATE_GUARDIAN',payload);}

test('initialization pins only the current empty container and is idempotent',()=>{
  const f=ready();assert.equal(f.call('ledgerInitialize').ok,true);
  assert.deepEqual(f.call('ledgerHealth').counts,{students:0,purchases:0,payments:0,events:0,unresolvedReviews:0});
  f.call('onOpen');assert.ok(f.menu.includes('Tarteel Ledger'));assert.equal(f.eventRows().length,0);
});
test('normal commands require initialization and the actual executing user',()=>{
  const f=storageFixture();assert.equal(f.call('ledgerExecute',command(f)).ok,false);
  f.call('ledgerInitialize');f.fault.identity='';
  const result=f.call('ledgerExecute',command(f));assert.equal(result.error.code,'IDENTITY_REQUIRED');assert.equal(f.eventRows().length,0);
});
test('copied or repointed containers cannot write using another file pin',()=>{
  const f=ready();f.setContainer('a-copy-of-the-ledger');
  assert.equal(f.call('ledgerExecute',command(f)).ok,false);assert.equal(f.eventRows().length,0);
  assert.equal(f.call('ledgerInitialize').ok,false);
});
test('an identical retry succeeds once even with a stale sequence',()=>{
  const f=ready(),c=command(f),a=f.call('ledgerExecute',c),b=f.call('ledgerExecute',c);
  assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(b.eventId,a.eventId);assert.equal(b.duplicate,true);assert.equal(f.eventRows().length,1);
  assert.equal(f.call('ledgerCommandStatus',c.requestId).status,'SAVED');
  assert.equal(f.call('ledgerBootstrap').actorEmail,'qa.staff@example.invalid');
});
test('edited retries and stale new previews do not append another event',()=>{
  const f=ready(),c=command(f);assert.equal(f.call('ledgerPreview',c).ok,true);f.call('ledgerExecute',c);
  const edited=JSON.parse(JSON.stringify(c));edited.payload.name='Edited';
  assert.equal(f.call('ledgerExecute',edited).error.code,'REQUEST_CONFLICT');
  const stale=command(f,{...guardian(),guardianId:id(2)});stale.expectedSequence=0;
  assert.equal(f.call('ledgerExecute',stale).error.code,'STALE_PREVIEW');assert.equal(f.eventRows().length,1);
});
test('append-then-throw is resolved by verified readback without another append',()=>{
  const f=ready(),c=command(f);f.fault.append='after';
  assert.equal(f.call('ledgerExecute',c).ok,true);assert.equal(f.eventRows().length,1);
  f.fault.append=null;assert.equal(f.call('ledgerExecute',c).duplicate,true);assert.equal(f.eventRows().length,1);
});
test('unreadable acknowledgement stays uncertain and later lookup resolves the same event',()=>{
  const f=ready(),c=command(f);f.fault.readAfterAppend=true;
  const result=f.call('ledgerExecute',c);assert.equal(result.ok,false);assert.equal(result.error.code,'SAVE_UNCERTAIN');assert.equal(result.status,undefined);
  f.fault.readAfterAppend=false;assert.equal(f.call('ledgerExecute',c).ok,true);assert.equal(f.eventRows().length,1);
});
test('a failed write with no visible row is quarantined instead of silently retried',()=>{
  const f=ready(),c=command(f);f.fault.append='before';assert.equal(f.call('ledgerExecute',c).error.code,'SAVE_UNCERTAIN');
  f.fault.append=null;assert.equal(f.call('ledgerExecute',c).error.code,'SAVE_UNCERTAIN');assert.equal(f.eventRows().length,0);
  assert.equal(f.call('ledgerCommandStatus',c.requestId).status,'PENDING_REVIEW');
});
test('a view failure acknowledges saved data and refresh does not append',()=>{
  const f=ready(),c=command(f);f.fault.refresh=true;
  const result=f.call('ledgerExecute',c);assert.equal(result.ok,true);assert.equal(result.status,'SAVED_REFRESH_REQUIRED');assert.equal(f.eventRows().length,1);
  f.fault.refresh=false;assert.equal(f.call('ledgerRefresh').ok,true);assert.equal(f.call('ledgerHealth').appliedSequence,1);assert.equal(f.eventRows().length,1);
});
test('lock contention returns a clear error without writing or releasing another owner lock',()=>{
  const f=ready();f.fault.locked=true;
  assert.equal(f.call('ledgerExecute',command(f)).error.code,'LOCK_BUSY');assert.equal(f.fault.locked,true);assert.equal(f.eventRows().length,0);
});
test('missing or changed event headers stop all mutation',()=>{
  const f=ready();f.sheets.get('Events').cells[4][0]='Wrong sequence header';
  assert.equal(f.call('ledgerExecute',command(f)).error.code,'CORRUPT_LEDGER');assert.equal(f.eventRows().length,0);
});
test('changed stored payload bytes fail integrity verification before another write',()=>{
  const f=ready();f.call('ledgerExecute',command(f));
  const row=f.eventRows()[0],last=row.length-1;row[last]=String(row[last]).replace('QA Guardian','Tampered name');
  const result=f.call('ledgerExecute',command(f,{...guardian(),guardianId:id(2)}));assert.equal(result.error.code,'CORRUPT_LEDGER');assert.equal(f.eventRows().length,1);
});
test('initialization refuses unrelated populated tabs and never resets a live event history',()=>{
  const f=storageFixture();f.makeSheet('Existing data',[{label:'Keep me'}]);assert.equal(f.call('ledgerInitialize').ok,false);
  const g=ready();g.call('ledgerExecute',command(g));const rows=JSON.stringify(g.eventRows());
  assert.equal(g.call('ledgerInitialize').ok,true);assert.equal(JSON.stringify(g.eventRows()),rows);
});
test('formula-leading guardian and child text is sent to Sheets as literal text',()=>{
  const f=ready();assert.equal(f.call('ledgerExecute',command(f,{...guardian(),name:'=HYPERLINK("invalid")'})).ok,true);
  for(const [n,name]of[[2,'+QA'],[3,'-QA'],[4,'@QA']])assert.equal(f.call('ledgerExecute',f.command('CREATE_LEARNER',{learnerId:id(n),guardianId:id(1),firstName:name,language:'english'})).ok,true);
  const values=f.writes.filter(w=>w.name==='Students'&&w.row>=6).flatMap(w=>w.values.flat());
  assert.ok(values.includes("'=HYPERLINK(\"invalid\")"));for(const name of ["'+QA","'-QA","'@QA"])assert.ok(values.includes(name));
});
test('safe RPC errors never include provider messages or private request details',()=>{
  const f=ready();f.fault.append='before';const result=f.call('ledgerExecute',command(f));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('qa@example.invalid'));
});
test('an error response retains the valid request ID for recovery',()=>{
  const f=ready(),c=command(f);f.fault.append='before';assert.equal(f.call('ledgerExecute',c).requestId,c.requestId);
});
test('deleted tail events are detected even when remaining rows still replay cleanly',()=>{
  const f=ready();f.call('ledgerExecute',command(f));f.sheets.get('Events').cells.pop();
  assert.equal(f.call('ledgerExecute',command(f,{...guardian(),guardianId:id(2)})).error.code,'CORRUPT_LEDGER');
  assert.equal(f.eventRows().length,0);
});
test('pagination reports omitted records and does not hide total counts',()=>{
  const f=ready();for(let n=1;n<=3;n++)f.call('ledgerExecute',command(f,{...guardian(),guardianId:id(n),name:'QA '+n}));
  const first=f.call('ledgerBootstrap',{limit:2,offset:0}),second=f.call('ledgerBootstrap',{limit:2,offset:2});
  assert.equal(first.guardians.length,2);assert.equal(first.page.totals.guardians,3);assert.equal(second.guardians.length,1);assert.notEqual(first.guardians[0].guardianId,second.guardians[0].guardianId);
});
test('formula-leading correction reasons remain literal and event integrity survives readback',()=>{
  const f=ready();f.call('ledgerExecute',command(f));
  const c=f.command('UPDATE_GUARDIAN',{...guardian(),name:'QA corrected'},'=literal reason');
  assert.equal(f.call('ledgerExecute',c).ok,true);assert.equal(f.call('ledgerHealth').ok,true);
  assert.equal(f.eventRows()[1][9],'=literal reason');
});
test('event storage grows the native grid before accepting a new command',()=>{
  const f=ready();f.sheets.get('Events').maxRows=5;
  assert.equal(f.call('ledgerExecute',command(f)).ok,true);assert.equal(f.eventRows().length,1);
});
test('reaching the configured capacity rejects before creating an uncertain write',()=>{
  const f=ready();f.schema.maxEvents=1;f.call('ledgerExecute',command(f));
  const result=f.call('ledgerExecute',command(f,{...guardian(),guardianId:id(2)}));
  assert.equal(result.ok,false);assert.equal(result.error.code,'INVALID_INPUT');assert.equal(f.eventRows().length,1);assert.equal(f.call('ledgerHealth').pendingWrite,false);
});
test('manual recovery requires a completed execution review, elapsed wait and no stored event',()=>{
  const f=ready(),c=command(f);f.fault.append='before';f.call('ledgerExecute',c);f.fault.append=null;
  assert.equal(f.call('ledgerRecoverPending_',c.requestId,'Execution ended; no event was saved').error.code,'REVIEW_REQUIRED');
  f.fault.now='2026-10-15T09:06:00Z';
  assert.equal(f.call('ledgerRecoverPending_',c.requestId,'Execution ended; no event was saved').ok,true);
  assert.equal(f.call('ledgerHealth').pendingWrite,false);assert.equal(f.eventRows().length,1);
  assert.equal(f.call('ledgerExecute',c).error.code,'REQUEST_CONFLICT');
  assert.equal(f.call('ledgerCommandStatus',c.requestId).status,'CANCELLED');
  assert.equal(f.call('ledgerExecute',command(f)).ok,true);assert.equal(f.eventRows().length,2);
  assert.equal(f.call('ledgerRecoverPending_',c.requestId,'Duplicate recovery').status,'CANCELLED');
  assert.match(f.properties.get('LEDGER_RECOVERY_LOG_V1'),/qa.staff@example.invalid/);
});
test('recovery resolves an actually saved event without deleting or duplicating it',()=>{
  const f=ready(),c=command(f);f.fault.readAfterAppend=true;f.call('ledgerExecute',c);f.fault.readAfterAppend=false;
  assert.equal(f.call('ledgerRecoverPending_',c.requestId,'Execution ended; inspected history').status,'SAVED');assert.equal(f.eventRows().length,1);
});
test('the Overview count reflects stored records after a refresh',()=>{
  const f=ready();f.call('ledgerExecute',command(f));
  const overview=f.sheets.get('Overview').cells.slice(5);
  assert.ok(overview.some(r=>r[0]==='Ledger totals'&&String(r[3]).includes('1 events')));
});
test('a pending request ID is recoverable from the workbook after local storage is lost',()=>{
  const f=ready(),c=command(f);f.fault.append='before';f.call('ledgerExecute',c);f.fault.append=null;
  assert.equal(f.call('ledgerBootstrap').health.pendingRequestId,c.requestId);
});
test('repeated manual recoveries keep their private property below provider size limits',()=>{
  const f=ready();for(let n=0;n<4;n++){
    f.fault.now=new Date(Date.parse('2026-10-15T09:00:00Z')+n*600000).toISOString();const c=command(f);f.fault.append='before';f.call('ledgerExecute',c);f.fault.append=null;
    f.fault.now=new Date(Date.parse(f.fault.now)+360000).toISOString();assert.equal(f.call('ledgerRecoverPending_',c.requestId,'界'.repeat(1000)).ok,true);
  }
  assert.ok(Buffer.byteLength(f.properties.get('LEDGER_RECOVERY_LOG_V1'),'utf8')<8000);
});
test('a cancellation fences an original request that has not started executing yet',()=>{
  const f=ready(),c=command(f);assert.equal(f.call('ledgerCommandStatus',c.requestId).status,'NOT_FOUND');
  assert.equal(f.call('ledgerRecoverPending_',c.requestId,'Reviewed execution; close unsaved request').status,'CANCELLED');
  assert.equal(f.call('ledgerExecute',c).error.code,'REQUEST_CONFLICT');assert.equal(f.call('ledgerBootstrap').guardians.length,0);assert.equal(f.eventRows().length,1);
});
test('learner reversal with an unpaid purchase is rejected before durable storage',()=>{
  const f=ready();f.call('ledgerExecute',command(f));
  const child=f.call('ledgerExecute',f.command('CREATE_LEARNER',{learnerId:id(2),guardianId:id(1),firstName:'QA Child',language:'english'}));
  f.call('ledgerExecute',f.command('CREATE_PURCHASE',{purchaseId:id(3),learnerId:id(2),packageCode:'STARTER',purchasedOn:'2026-10-15',lastUsableOn:'2027-10-14'}));
  const result=f.call('ledgerExecute',f.command('REVERSE_EVENT',{originalEventId:child.eventId},'Incorrect learner'));
  assert.equal(result.error.code,'DEPENDENCY_CONFLICT');assert.deepEqual(result.error.recordIds,[id(3)]);assert.equal(f.eventRows().length,3);assert.equal(f.call('ledgerBootstrap').ok,true);
});
test('normal operations reject timezone drift and invalidate the current marker',()=>{
  const f=ready();assert.equal(f.spreadsheet.getSpreadsheetTimeZone(),'Europe/Madrid');f.fault.spreadsheetTimeZone='America/New_York';
  assert.equal(f.call('ledgerHealth').ok,false);assert.equal(f.call('ledgerExecute',command(f)).ok,false);assert.equal(f.eventRows().length,0);assert.match(f.sheets.get('Overview').cells[1][1],/Stopped/);
  assert.equal(f.call('ledgerInitialize').ok,false);f.fault.spreadsheetTimeZone='Europe/Madrid';assert.equal(f.call('ledgerRefresh').ok,true);
});
test('native menu failures are visible and corruption invalidates Current without touching a wrong container',()=>{
  const f=ready();f.call('ledgerExecute',command(f));f.eventRows()[0][10]='tampered';
  f.call('ledgerMenuRefresh');assert.match(f.alerts.at(-1),/CORRUPT_LEDGER/);assert.match(f.sheets.get('Overview').cells[1][1],/Stopped/);assert.equal(f.eventRows().length,1);
  const g=ready(),before=g.writes.length;g.setContainer('wrong-copy');g.call('ledgerMenuRefresh');assert.equal(g.writes.length,before);assert.match(g.alerts.at(-1),/STORE_UNAVAILABLE/);
});
