'use strict';
const {test:base,expect}=require('@playwright/test');
const root='http://127.0.0.1:8878',uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const test=base.extend({boundary:[async({context},use)=>{
  await context.route('**/*',route=>new URL(route.request().url()).origin===root?route.continue():route.abort());await use();
},{auto:true}]});
async function control(page,body){return page.request.post(root+'/__ledger/control',{data:body,headers:{Origin:root}});}
async function open(page){await control(page,{reset:true});await page.goto(root+'/__ledger/');await expect(page.locator('#status')).toContainText('Ready');}
async function choose(page,type){await page.getByLabel('Task', {exact:true}).selectOption(type);}
async function fill(page,fields){for(const [key,value]of Object.entries(fields)){const input=page.locator('#f-'+key);if(typeof value==='boolean'){await input.setChecked(value);}else if(await input.evaluate(e=>e.tagName)==='SELECT')await input.selectOption(value);else await input.fill(value);}}
async function preview(page){await page.getByRole('button',{name:'Preview change',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm and save',exact:true})).toBeVisible();}
async function save(page){await preview(page);await page.getByRole('button',{name:'Confirm and save',exact:true}).click();await expect(page.locator('#status')).toContainText('Saved');}
async function guardian(page){await choose(page,'CREATE_GUARDIAN');await fill(page,{name:'QA Guardian',email:'qa@example.invalid',whatsapp:'+34600000000'});await save(page);return (await snapshot(page)).guardians[0].guardianId;}
async function snapshot(page){return page.request.post(root+'/__ledger/rpc',{headers:{Origin:root},data:{method:'ledgerBootstrap',args:[]}}).then(r=>r.json());}
async function child(page,parent,name='QA Child'){await choose(page,'CREATE_LEARNER');await fill(page,{guardianId:parent,firstName:name});await save(page);return (await snapshot(page)).students.find(s=>s.firstName===name).learnerId;}
async function financed(page,initialMatch='220'){const g=await guardian(page),c=await child(page,g);await choose(page,'CREATE_PURCHASE');await fill(page,{learnerId:c,packageCode:'STEADY',purchasedOn:'2026-10-15'});await save(page);const p=(await snapshot(page)).packages[0].purchaseId;
  await choose(page,'RECORD_RECEIPT');await fill(page,{guardianId:g,source:'Bank checked',reference:'QA-220',amountEUR:'220',receivedOn:'2026-10-15',verified:true});await save(page);
  const r=(await snapshot(page)).payments[0].paymentId;await choose(page,'MATCH_PAYMENT');await fill(page,{paymentId:r,purchaseId:p,amountEUR:initialMatch});const response=page.waitForResponse(res=>res.url()===root+'/__ledger/rpc'&&res.request().postDataJSON().method==='ledgerExecute');await save(page);const matchEvent=(await (await response).json()).eventId;return{g,c,p,r,matchEvent};}
async function pendingMetadata(page){return page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('tarteel.ledger.pending.v1')).map(k=>localStorage.getItem(k)).join(''));}
test('guided payment, explicit matching and a completed paid lesson conserve balances',async({page})=>{
  await open(page);const {c,p}=await financed(page);await expect(page.locator('#packages')).toContainText('12 available');
  await choose(page,'SCHEDULE_LESSON');await fill(page,{learnerId:c,purchaseId:p,teacher:'QA Teacher',startsAt:'2026-10-15T09:00'});await save(page);
  const l=(await snapshot(page)).lessons[0].lessonId;await choose(page,'RECORD_OUTCOME');await fill(page,{lessonId:l,outcome:'COMPLETED'});await save(page);
  const v=await snapshot(page);expect(v.packages[0]).toMatchObject({remaining:11,reserved:0,available:11,completed:1});
});
test('lost acknowledgement locks the form and reload checks status without another event',async({page})=>{
  await open(page);await choose(page,'CREATE_GUARDIAN');await fill(page,{name:'QA Lost',email:'lost@example.invalid',whatsapp:'+34600000001'});await preview(page);await control(page,{fault:{loseReply:true,delayMs:500}});
  await page.getByRole('button',{name:'Confirm and save'}).dblclick();await expect(page.locator('#fields')).toHaveAttribute('inert','');
  await expect(page.locator('#status')).toContainText('uncertain');const before=await snapshot(page);expect(before.sequence).toBe(1);
  const pending=await pendingMetadata(page);expect(pending).not.toContain('lost@example.invalid');expect(pending).not.toContain('QA Lost');
  await page.reload();await expect(page.locator('#status')).toContainText('Saved');expect((await snapshot(page)).sequence).toBe(1);
});
test('a changed ledger invalidates a preview and saved view failures require refresh',async({page})=>{
  await open(page);await choose(page,'CREATE_GUARDIAN');await fill(page,{name:'QA Stale',email:'stale@example.invalid',whatsapp:'+34600000002'});await preview(page);
  await page.request.post(root+'/__ledger/rpc',{headers:{Origin:root},data:{method:'ledgerExecute',args:[{schemaVersion:1,requestId:uid(90),expectedSequence:0,type:'CREATE_GUARDIAN',payload:{guardianId:uid(91),name:'QA Other',email:'other@example.invalid',whatsapp:'+34600000003'},reason:''}]}});
  await page.getByRole('button',{name:'Confirm and save'}).click();await expect(page.locator('#status')).toContainText('changed');expect((await snapshot(page)).sequence).toBe(1);
  await page.getByRole('button',{name:'Refresh ledger',exact:true}).click();await expect(page.locator('#status')).toContainText('Refreshed');await preview(page);await control(page,{fault:{refresh:true}});await page.getByRole('button',{name:'Confirm and save'}).click();await expect(page.locator('#status')).toContainText('refresh required');
  await control(page,{fault:{refresh:false}});await page.getByRole('button',{name:'Refresh ledger',exact:true}).click();await expect(page.locator('#status')).toContainText('Refreshed');expect((await snapshot(page)).sequence).toBe(2);
});
test('verified opening reserves a replacement and a summary isolates the selected child',async({page})=>{
  await open(page);const g=await guardian(page),c=await child(page,g,'<img src=x onerror=alert(1)>');await child(page,g,'QA Sibling');
  await choose(page,'OPEN_PACKAGE');await fill(page,{learnerId:c,packageCode:'STEADY',purchasedOn:'2026-10-15',completed:'4',forfeited:'0',makeupsUsed:'1',sourceReference:'QA Opening',paymentReference:'QA Private Bank Ref',verifiedOn:'2026-10-15',verified:true,commitmentStatus:'listed',reason:'Verified opening'});
  await page.getByRole('button',{name:'Add commitment'}).click();await page.getByLabel('Commitment reference').fill('QA replacement due');await save(page);
  const v=await snapshot(page);expect(v.packages[0]).toMatchObject({remaining:8,reserved:1,available:7,makeupsAvailable:3});
  await page.getByLabel('Summary child').fill(c);await page.getByRole('button',{name:'Prepare parent summary'}).click();await expect(page.locator('#summary')).toHaveValue(/<img src=x onerror=alert\(1\)>/);
  const text=await page.locator('#summary').inputValue();for(const privateText of ['QA Sibling','qa@example.invalid','QA Private Bank Ref','Verified opening'])expect(text).not.toContain(privateText);expect(await page.locator('#packages img').count()).toBe(0);
});
test('refund holds survive top-ups until staff repair allocations and resolve the case',async({page})=>{
  await open(page);const{g,c,p,r,matchEvent}=await financed(page);
  await choose(page,'RECORD_PAYMENT_ADJUSTMENT');await fill(page,{originalReceiptId:r,kind:'REFUND',amountEUR:'20',occurredOn:'2026-10-15',reference:'=QA refund evidence',verified:true,reason:'Checked refund'});await save(page);
  const review=(await snapshot(page)).reviewCases[0].caseId;
  await choose(page,'SCHEDULE_LESSON');await fill(page,{learnerId:c,purchaseId:p,teacher:'QA Teacher',startsAt:'2026-10-16T09:00'});await page.getByRole('button',{name:'Preview change'}).click();await expect(page.locator('#status')).toContainText('review');
  await choose(page,'REVERSE_EVENT');await fill(page,{originalEventId:matchEvent,reason:'Reconcile refunded receipt'});await save(page);
  await choose(page,'MATCH_PAYMENT');await fill(page,{paymentId:r,purchaseId:p,amountEUR:'200'});await save(page);
  await choose(page,'RECORD_RECEIPT');await fill(page,{guardianId:g,source:'Bank checked',reference:'QA topup',amountEUR:'20',receivedOn:'2026-10-15',verified:true});await save(page);
  const top=(await snapshot(page)).payments.find(p=>p.reference==='QA topup').paymentId;
  await choose(page,'MATCH_PAYMENT');await fill(page,{paymentId:top,purchaseId:p,amountEUR:'20'});await save(page);expect((await snapshot(page)).packages[0].held).toBe(true);
  await choose(page,'RESOLVE_REVIEW');await fill(page,{caseId:review,decision:'RECONCILIATION_CONFIRMED',reason:'All allocations checked against bank'});await save(page);expect((await snapshot(page)).packages[0].canSchedule).toBe(true);
});
test('dependent corrections and edited transport retries cannot change accepted facts',async({page})=>{
  await open(page);await choose(page,'CREATE_GUARDIAN');await fill(page,{name:'=QA literal',email:'literal@example.invalid',whatsapp:'+34600000004'});
  const request=page.waitForRequest(req=>req.url()===root+'/__ledger/rpc'&&req.postDataJSON().method==='ledgerExecute');
  const response=page.waitForResponse(res=>res.url()===root+'/__ledger/rpc'&&res.request().postDataJSON().method==='ledgerExecute');await save(page);
  const cmd=(await request).postDataJSON().args[0],event=(await(await response).json()).eventId;cmd.payload.name='Edited retry';
  const rejected=await page.request.post(root+'/__ledger/rpc',{headers:{Origin:root},data:{method:'ledgerExecute',args:[cmd]}}).then(r=>r.json());expect(rejected.error.code).toBe('REQUEST_CONFLICT');
  const g=(await snapshot(page)).guardians[0].guardianId;await child(page,g);
  await choose(page,'REVERSE_EVENT');await fill(page,{originalEventId:event,reason:'Incorrect guardian entry'});await page.getByRole('button',{name:'Preview change'}).click();await expect(page.locator('#status')).toContainText(/depend|reference|learner/i);
  expect((await snapshot(page)).sequence).toBe(2);expect((await snapshot(page)).guardians[0].name).toBe('=QA literal');
});
test('unpaid scheduling and ambiguous Madrid times require staff correction',async({page})=>{
  await open(page);const g=await guardian(page),c=await child(page,g);await choose(page,'CREATE_PURCHASE');await fill(page,{learnerId:c});await save(page);const p=(await snapshot(page)).packages[0].purchaseId;
  await choose(page,'SCHEDULE_LESSON');await fill(page,{learnerId:c,purchaseId:p,teacher:'QA Teacher',startsAt:'2026-10-16T09:00'});await page.getByRole('button',{name:'Preview change'}).click();await expect(page.locator('#status')).toContainText('full package payment');
  await fill(page,{kind:'TRIAL',startsAt:'2027-03-28T02:30'});await page.getByRole('button',{name:'Preview change'}).click();await expect(page.locator('#status')).toContainText('missing or repeated');
  await fill(page,{startsAt:'2026-10-25T02:30'});await page.getByRole('button',{name:'Preview change'}).click();await expect(page.locator('#status')).toContainText('missing or repeated');
  await fill(page,{clockOffset:'+01:00'});await save(page);expect((await snapshot(page)).lessons[0].startsAt).toBe('2026-10-25T01:30:00.000Z');
});
test('a fresh browser recovers an uncertain request ID from the workbook',async({page})=>{
  await open(page);await choose(page,'CREATE_GUARDIAN');await fill(page,{name:'QA Pending',email:'pending@example.invalid',whatsapp:'+34600000005'});await preview(page);await control(page,{fault:{append:'before'}});
  await page.getByRole('button',{name:'Confirm and save'}).click();await expect(page.locator('#status')).toContainText('uncertain');
  await page.evaluate(()=>localStorage.clear());await control(page,{fault:{append:null}});await page.reload();await expect(page.locator('#status')).toContainText('Review an uncertain save');await expect(page.locator('#fields')).toHaveAttribute('inert','');expect((await snapshot(page)).sequence).toBe(0);
});
test('missing status cannot release a request whose execution starts later',async({page})=>{
  await open(page);const{p,r}=await financed(page,'10');await choose(page,'MATCH_PAYMENT');await fill(page,{paymentId:r,purchaseId:p,amountEUR:'10'});await preview(page);await control(page,{fault:{deferExecution:true}});
  await page.getByRole('button',{name:'Confirm and save'}).click();await expect(page.locator('#status')).toContainText('uncertain');const original=await pendingMetadata(page);
  await page.getByRole('button',{name:'Check save status'}).click();await expect(page.locator('#fields')).toHaveAttribute('inert','');expect(await pendingMetadata(page)).toBe(original);
  await page.reload();await expect(page.locator('#fields')).toHaveAttribute('inert','');await control(page,{runDeferred:true});await page.getByRole('button',{name:'Check save status'}).click();await expect(page.locator('#status')).toContainText('Saved');
  const v=await snapshot(page);expect(v.matches.filter(m=>m.purchaseId===p).length).toBe(2);expect(v.packages[0].matchedCents).toBe(2000);
});
test('manual cancellation fences delayed execution and records no financial match',async({page})=>{
  await open(page);const{p,r}=await financed(page,'10');await choose(page,'MATCH_PAYMENT');await fill(page,{paymentId:r,purchaseId:p,amountEUR:'10'});await preview(page);await control(page,{fault:{deferExecution:true}});
  await page.getByRole('button',{name:'Confirm and save'}).click();await expect(page.locator('#status')).toContainText('uncertain');const requestId=JSON.parse(await pendingMetadata(page)).requestId;
  const cancellation=await control(page,{recover:{requestId,reason:'Reviewed unsaved execution; close this request'}}).then(r=>r.json());expect(cancellation.results[0].status).toBe('CANCELLED');
  const delayed=await control(page,{runDeferred:true}).then(r=>r.json());expect(delayed.results[0].error.code).toBe('REQUEST_CONFLICT');
  await page.getByRole('button',{name:'Check save status'}).click();await expect(page.locator('#status')).toContainText('closed');await expect(page.locator('#fields')).not.toHaveAttribute('inert','');expect((await snapshot(page)).packages[0].matchedCents).toBe(1000);
});
test('pending metadata from one workbook does not lock another workbook at the same origin',async({page})=>{
  await open(page);await choose(page,'CREATE_GUARDIAN');await fill(page,{name:'QA First Book',email:'first@example.invalid',whatsapp:'+34600000005'});await preview(page);await control(page,{fault:{deferExecution:true}});await page.getByRole('button',{name:'Confirm and save'}).click();await expect(page.locator('#status')).toContainText('uncertain');
  await control(page,{container:'qa-second-ledger'});await page.reload();await expect(page.locator('#status')).toContainText('Ready');await expect(page.locator('#fields')).not.toHaveAttribute('inert','');
  await control(page,{container:'qa-ledger-container'});await page.reload();await expect(page.locator('#status')).toContainText('uncertain');await expect(page.locator('#fields')).toHaveAttribute('inert','');
});
test('refund closure and preview identify the selected child and package',async({page})=>{
  await open(page);const{p,r,matchEvent}=await financed(page);await choose(page,'RECORD_PAYMENT_ADJUSTMENT');await fill(page,{originalReceiptId:r,kind:'REFUND',amountEUR:'220',occurredOn:'2026-10-15',reference:'QA complete refund',verified:true,reason:'Verified full refund'});await save(page);
  await choose(page,'REVERSE_EVENT');await fill(page,{originalEventId:matchEvent,reason:'Remove refunded allocation'});await save(page);const caseId=(await snapshot(page)).reviewCases[0].caseId;
  await choose(page,'RESOLVE_REVIEW');await fill(page,{caseId,decision:'CLOSE_PACKAGE',purchaseId:p,reason:'Close this refunded package'});await preview(page);await expect(page.locator('#preview')).toContainText('QA Child · Steady');await expect(page.locator('#preview')).toContainText('Before:');await expect(page.locator('#preview')).toContainText('After:');
  await page.getByRole('button',{name:'Confirm and save'}).click();await expect(page.locator('#status')).toContainText('Saved');expect((await snapshot(page)).packages[0].closed).toBe(true);
});
for(const width of [300,320,480])test(`staff forms fit ${width}px and have labelled keyboard controls`,async({page})=>{
  await page.setViewportSize({width,height:850});await open(page);await choose(page,'OPEN_PACKAGE');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByLabel('Child', {exact:true}).focus();await expect(page.locator('#f-learnerId')).toBeFocused();
  expect(await page.locator('#status').getAttribute('aria-live')).toBe('polite');
});
