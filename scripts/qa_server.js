/* Local-only browser QA. No Google Sheet, email, or measurement request leaves this server.
   Run: node scripts/qa_server.js (http://127.0.0.1:8766/__qa/)
   --baseline reads the original sprint HEAD for the backend reproduction only. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.TARTEEL_QA_PORT || 8766);
const origin = `http://127.0.0.1:${port}`;
const frameOrigin = `http://localhost:${port}`;
const responseOrigin = `http://localhost:${port + 1}`;
const responses = new Map();
const rows = [];
// Apps Script properties and time survive the separate request VM contexts.
// This deterministic clock advances only through the local recovery action.
const properties = new Map();
let qaNow = Date.parse('2026-10-14T09:00:00Z');
let locked = false;
let headers = ['timestamp','source','parent_name','child_name','child_age','quran_level','session_language','country','email','whatsapp','preferred_days','preferred_time','city_region','notes','consent','status','assigned_teacher','follow_up_date','internal_notes'];
let mails = 0;
let requests = 0;
const baseline = process.argv.includes('--baseline');
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const csp = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; connect-src 'self'; frame-src 'self' ${frameOrigin} ${responseOrigin} ${origin}; form-action 'self' ${origin} ${frameOrigin}; base-uri 'self'`;
function send(res, body, type = 'text/html; charset=utf-8', status = 200) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': csp });
  res.end(body);
}
function harness() {
  return `<script>
  (function(){
    const query = new URLSearchParams(location.search);
    if(query.has('qa_reset')) { localStorage.clear(); sessionStorage.clear(); }
    if(query.has('qa_mode')) sessionStorage.setItem('qa.mode', query.get('qa_mode'));
    if(query.has('qa_pixel')) sessionStorage.setItem('qa.pixel', query.get('qa_pixel'));
    for(const key of [...query.keys()]) if(key.startsWith('qa_')) query.delete(key);
    history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash);
    const pixel = sessionStorage.getItem('qa.pixel') || 'stub';
    const record = (sink, args) => {
      const events = JSON.parse(sessionStorage.getItem('qa.events') || '[]');
      events.push({sink, args:Array.from(args), path:location.pathname});
      sessionStorage.setItem('qa.events',JSON.stringify(events));
    };
    if(pixel !== 'blocked') window.oaiq = function(){record('openai',arguments); if(pixel==='throw') throw new Error('Local QA SDK failure');};
    window.gtag = function(){record('ga4',arguments); if(pixel==='ga-throw') throw new Error('Local QA GA failure');};
    window.addEventListener('error', event => record('error',[event.message]));
    window.addEventListener('DOMContentLoaded', () => {
      const form = document.getElementById('trial-form');
      if(form){
        form.action = '${frameOrigin}/__qa/booking?mode='+encodeURIComponent(sessionStorage.getItem('qa.mode')||'success');
      }
      const panel = document.createElement('details'); panel.id='qa-evidence';
      panel.innerHTML='<summary>Local QA evidence (no external submission)</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>';
      document.body.append(panel);
      if(form){
        const fill=document.createElement('button'); fill.type='button';fill.textContent='Fill synthetic QA details';
        fill.onclick=()=>{
          const sample={child_name:'QA Child',child_age:'8',quran_level:'complete-beginner',session_language:'english',parent_name:'QA Parent',country:'Spain',email:'qa.parent@example.invalid',whatsapp:'+34000000000',preferred_days:'mon',preferred_time:'afternoon',city_region:'QA City',consent:'yes'};
          for(const [name,value] of Object.entries(sample)) for(const field of form.querySelectorAll('[name="'+name+'"]')) {
            if(field.type==='radio'||field.type==='checkbox') field.checked=field.value===value;
            else field.value=value;
            field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
          }
        };panel.prepend(fill);
        const select=document.createElement('select');select.setAttribute('aria-label','Local QA response mode');
        for(const mode of ['success','sheet-failure','mail-failure','quota-zero','rate-limit','timeout','wrong-token','wrong-origin','duplicate']) {const option=document.createElement('option');option.value=option.textContent=mode;select.append(option);}
        select.value=sessionStorage.getItem('qa.mode')||'success';
        select.onchange=()=>{sessionStorage.setItem('qa.mode',select.value);form.action='${frameOrigin}/__qa/booking?mode='+select.value;};panel.prepend(select);
      }
      const update = () => { panel.querySelector('pre').textContent=JSON.stringify({mode:sessionStorage.getItem('qa.mode'),pixel,events:JSON.parse(sessionStorage.getItem('qa.events')||'[]'),pending:sessionStorage.getItem('tarteelhouse.trialConversionToken'),preference:localStorage.getItem('tarteelhouse.analyticsConsent'),queued:window.oaiq?.q?.map(a=>Array.from(a)),scripts:[...document.scripts].map(s=>s.src).filter(Boolean)},null,2); };
      update(); setInterval(update,200);
    });
  })();</script>`;
}
function runtime(mode = 'success') {
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => rows.length + 1,
    getFrozenRows: () => 1,
    setFrozenRows() {},
    appendRow(row) { if(mode==='sheet-failure') throw Error('Local QA sheet failure'); rows.push(row); },
    getRange(row=1,col=1,count=1,columns=1) { return {
      getValues: () => [headers,...rows].slice(row-1,row-1+count)
        .map(values=>Array.from({length:columns},(_,index)=>values[col-1+index]??'')),
      setValues(value) { if(row===1) value[0].forEach((v,i)=>{headers[col-1+i]=v;}); else value.forEach((r,i)=>r.forEach((v,j)=>{rows[row-2+i][col-1+j]=v;})); return this; },
      setValue(value) { return this.setValues([[value]]); },
      setFontWeight() {return this;}, setNumberFormat(){return this;},
    }; },
  };
  const context = {
    console: {error() {},warn() {},log() {}},
    Date: class extends Date {
      constructor(...args){super(...(args.length?args:[qaNow]));}
      static now(){return qaNow;}
    },
    HtmlService: {XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput(html){return {html,setXFrameOptionsMode(){return this;},addMetaTag(){return this;}};}},
    SpreadsheetApp: {
      getActiveSpreadsheet(){
        if(!baseline) throw Error('Active spreadsheet unavailable in web apps');
        return {getSheetByName:()=>sheet,insertSheet:()=>sheet};
      },
      openById(id){
        if(id!=='1xLqKF1DGBGdknlGbTyulDxDYgiVm6vh0MkkXSaJ90Kc') throw Error('Unexpected booking spreadsheet ID');
        return {getSheetByName:()=>sheet,insertSheet:()=>sheet};
      },
      flush(){},
    },
    MailApp: {
      getRemainingDailyQuota(){return mode==='quota-zero'?0:1000;},
      sendEmail(){if(mode==='mail-failure')throw Error('Local QA mail failure'); mails++;},
    },
    LockService: {getScriptLock:()=>({
      waitLock(){if(locked)throw Error('Local QA script lock is held');locked=true;},
      tryLock(){if(locked)return false;locked=true;return true;},
      releaseLock(){locked=false;},
    })},
    PropertiesService: {getScriptProperties:()=>({
      getProperty:k=>properties.get(k)??null,
      getProperties:()=>Object.fromEntries(properties),
      setProperty(k,v){properties.set(k,String(v));return this;},
      setProperties(values){Object.entries(values).forEach(([k,v])=>properties.set(k,String(v)));return this;},
      deleteProperty(k){properties.delete(k);return this;},
    })},
    Utilities: {
      getUuid:()=>crypto.randomUUID(),
      DigestAlgorithm:{SHA_256:'SHA_256'},
      Charset:{UTF_8:'UTF_8'},
      computeDigest(algorithm,value,charset){
        if(algorithm!=='SHA_256'||charset!=='UTF_8')throw Error('Unexpected local QA digest configuration');
        return Array.from(crypto.createHash('sha256').update(value,'utf8').digest(),byte=>byte>127?byte-256:byte);
      },
      computeHmacSha256Signature(value,key,charset){
        if(charset!=='UTF_8')throw Error('Unexpected local QA HMAC configuration');
        return Array.from(crypto.createHmac('sha256',key).update(value,'utf8').digest(),byte=>byte>127?byte-256:byte);
      },
    },
  };
  const scriptDir = path.join(root,'apps-script');
  const source = baseline ? execFileSync('git',['show','a1eb76c:apps-script/Code.gs'],{cwd:root,encoding:'utf8'}) :
    ['Code.gs',...fs.readdirSync(scriptDir).filter(name=>name.endsWith('.gs')&&name!=='Code.gs').sort()]
      .map(name=>fs.readFileSync(path.join(scriptDir,name),'utf8')).join('\n');
  vm.runInNewContext(source,context);
  // Existing browser cases deliberately reuse one synthetic identity. Only
  // this fake runtime raises limits; the production policy stays unchanged.
  if(!baseline) vm.runInNewContext(`
    ABUSE_POLICY.CONTACT_HOURLY=1000; ABUSE_POLICY.CONTACT_DAILY=1000;
    ABUSE_POLICY.GLOBAL_HOURLY=1000; ABUSE_POLICY.GLOBAL_DAILY=1000;
    ${mode==='rate-limit'?'ABUSE_POLICY.GLOBAL_HOURLY=1;':''}
  `,context);
  return context;
}
function backend(parameters, mode, body) {
  const context = runtime(mode);
  // Only the local harness substitutes the allowed return origin; production validation is untouched.
  const requested = parameters.get('success_redirect') || '';
  const safe = new URL(requested || '/success/',origin);
  safe.protocol='https:'; safe.host='www.tarteelhouse.com'; safe.port='';
  parameters.set('success_redirect',safe.href);
  const contentLength = Buffer.byteLength(body,'utf8');
  const e={parameter:{},parameters:{},contentLength,
    postData:{contents:body,length:contentLength,type:'application/x-www-form-urlencoded',name:'postData'}};
  for(const [k,v] of parameters){if(!(k in e.parameter))e.parameter[k]=v;(e.parameters[k] ||= []).push(v);}
  if(!baseline&&mode==='rate-limit') {
    // Fill the strict local budget through the real reservation helper, then
    // let doPost deny a new row. Saved identical retries bypass that gate.
    const lock=context.LockService.getScriptLock();lock.waitLock();
    try {context.reserveBookingCapacity_(e.parameter,qaNow);} finally {lock.releaseLock();}
  }
  return context.doPost(e).html.replaceAll('https://www.tarteelhouse.com',origin).replaceAll('https://tarteelhouse.com',origin);
}
function stats(context = runtime()) {
  const column=name=>rows.map(row=>row[headers.indexOf(name)]??'');
  return {requests,rows:rows.length,mails,baseline,now:new Date(qaNow).toISOString(),
    notifications:column('notification_status'),notificationAttempts:column('notification_attempts'),
    notificationNextAttemptAt:column('notification_next_attempt_at'),
    notificationErrorCodes:column('notification_error_code'),
    recoveryHealth:typeof context.getNotificationRecoveryHealth==='function'?context.getNotificationRecoveryHealth():null};
}
const handler = async(req,res)=>{
  try {
    const url=new URL(req.url,origin);
    if(url.pathname==='/__qa/') return send(res,`<!doctype html><meta name="viewport" content="width=device-width"><h1>Local booking QA</h1><p>All bookings use in-memory fakes; no external writes. Use qa.parent@example.invalid and synthetic names only.</p><ul>${['success','sheet-failure','mail-failure','quota-zero','rate-limit'].map(mode=>`<li><a href="/book-trial/?qa_reset=1&qa_mode=${mode}&qa_pixel=stub">${mode}</a></li>`).join('')}<li><a href="/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=blocked">Blocked Pixel</a></li><li><a href="/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=throw">Throwing Pixel</a></li><li><a href="/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=ga-throw">Throwing GA</a></li><li><a href="/book-trial/?qa_reset=1&qa_mode=success&qa_pixel=missing">Missing measurement files on booking page</a></li><li><a href="/?qa_reset=1&qa_pixel=stub">Homepage with fresh consent</a></li></ul><a href="/__qa/stats">Counts</a><form action="/__qa/recover" method="post"><button>Advance local clock 15 minutes and recover notifications</button></form>`);
    if(url.pathname==='/__qa/stats') return send(res,JSON.stringify(stats()),'application/json');
    if(url.pathname==='/__qa/recover') {
      if(req.method!=='POST')return send(res,'Use POST for local notification recovery.','text/plain',405);
      if(baseline)return send(res,'Recovery is unavailable in the baseline fixture.','text/plain',501);
      qaNow+=15*60000;
      const context=runtime();
      const summary=context.retryFailedNotifications();
      return send(res,JSON.stringify({...stats(context),summary}),'application/json');
    }
    if(url.pathname==='/__qa/pixel.js'||url.pathname==='/__qa/gtag.js') return send(res,'/* SDK intentionally replaced by local QA recorder. */','text/javascript');
    if(url.pathname==='/__qa/booking'&&req.method==='POST'){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>32000)return send(res,'Request too large','text/plain',413);}
      const parameters=new URLSearchParams(body);
      if(parameters.get('email')!=='qa.parent@example.invalid')return send(res,'Use the synthetic QA email only.','text/plain',400);
      requests++;
      const mode=url.searchParams.get('mode');
      if(mode==='timeout')return send(res,'<!doctype html><title>Local QA timeout: no acknowledgment</title>');
      let html=backend(parameters,mode,body);
      if(mode==='wrong-token')html=html.replace(/"response_token":"[^"]+"/,'"response_token":"00000000-0000-4000-8000-000000000000"');
      if(mode==='duplicate')html=html.replace(/(<script>window.top.postMessage[^]*?<\/script>)/,'$1$1');
      const id=String(requests);responses.set(id,html);
      // Reproduce the Apps Script outer document and cross-origin sandboxed HTML-service frame.
      return send(res,`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Local Apps Script sandbox</title><iframe title="Booking response" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" style="border:0;width:100%;height:95vh" src="${mode==='wrong-origin'?frameOrigin:responseOrigin}/__qa/response?id=${id}"></iframe></html>`);
    }
    if(url.pathname==='/__qa/response')return send(res,responses.get(url.searchParams.get('id'))||'Unknown local response');
    let filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if((filename!==root&&!filename.startsWith(root+path.sep))||url.pathname.startsWith('/.'))return send(res,'Not found','text/plain',404);
    if(fs.existsSync(filename)&&fs.statSync(filename).isDirectory())filename=path.join(filename,'index.html');
    if(!fs.existsSync(filename))return send(res,'Not found','text/plain',404);
    const ext=path.extname(filename);
    let body=fs.readFileSync(filename);
    if(ext==='.html') {
      body=body.toString().replace('</head>',harness()+'</head>').replace(/action="https:\/\/script.google.com[^\"]+"/,`action="${frameOrigin}/__qa/booking"`);
      // Test-only origin substitution: preserve the production trust check in source.
      body=body.replace(String.raw`/^https:\/\/(?:[a-z0-9-]+-)?script\.googleusercontent\.com$/.test(event.origin)`, `(${JSON.stringify(responseOrigin)} === event.origin)`);
      if(url.searchParams.get('qa_pixel')==='missing') body=body.replace(/<script src="\/assets\/js\/(?:consent|analytics-events)\.js(?:\?[^"]*)?"><\/script>/g,'<!-- Measurement file unavailable in this local fixture. -->');
    }
    if(filename.endsWith(path.join('assets','js','consent.js'))) body=body.toString().replaceAll('https://bzrcdn.openai.com/sdk/oaiq.min.js','/__qa/pixel.js').replaceAll('https://www.googletagmanager.com/gtag/js','/__qa/gtag.js');
    send(res,body,{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'}[ext]||'text/plain');
  }catch(error){send(res,`Local QA fixture error: ${escape(error.message)}`,'text/plain',500);}
};
const server = http.createServer(handler);
const responseServer = http.createServer(handler);
server.listen(port,'127.0.0.1',()=>console.log(`Local-only QA: ${origin}/__qa/ ${baseline?'(baseline backend)':''}`));
responseServer.listen(port+1,'127.0.0.1');
