'use strict';
// Loopback-only fictional workbook. Production never imports this adapter.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {storageFixture}=require('../../tests/helpers/staff_ledger_storage_fixture');
const base=path.resolve(__dirname,'..');
function createLedgerServer(){
  let fixture,loseReply=false,delayMs=0,deferExecution=false,deferred=[];const containers=new Map();
  function select(id){if(!containers.has(id)){const f=storageFixture();f.setContainer(id);f.call('ledgerInitialize');containers.set(id,f);}fixture=containers.get(id);}
  function reset(){containers.clear();select('qa-ledger-container');loseReply=false;delayMs=0;deferExecution=false;deferred=[];}reset();
  const allowed=new Set(['ledgerBootstrap','ledgerPreview','ledgerExecute','ledgerCommandStatus','ledgerRefresh','ledgerParentSummary','ledgerHealth']);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const origin='http://'+req.headers.host;
    if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')){res.writeHead(403).end();return;}
    function send(status,value,type='application/json'){res.writeHead(status,{'Content-Type':type+'; charset=utf-8'}).end(type==='application/json'?JSON.stringify(value):value);}
    const url=new URL(req.url,origin);
    if(req.method==='GET'){
      if(url.pathname==='/__ledger/'){
        let html=fs.readFileSync(path.join(base,'ui/Sidebar.html.txt'),'utf8');
        html=html.replace("<?!= ledgerInclude_('Styles'); ?>",fs.readFileSync(path.join(base,'ui/Styles.html.txt'),'utf8'))
          .replace("<?!= ledgerInclude_('Client'); ?>",'<script src="/__ledger/rules.js"></script>'+fs.readFileSync(path.join(base,'ui/Client.html.txt'),'utf8'));
        send(200,html,'text/html');return;
      }
      if(url.pathname==='/__ledger/rules.js'){send(200,fs.readFileSync(path.join(base,'Rules.gs'),'utf8'),'text/javascript');return;}
      if(url.pathname==='/__ledger/bridge.js'){send(200,`window.google={script:{run:new Proxy({}, {get(t,k){if(k==='withSuccessHandler')return f=>{t.success=f;return new Proxy(t,this)};if(k==='withFailureHandler')return f=>{t.failure=f;return new Proxy(t,this)};return(...args)=>{const success=t.success,failure=t.failure;fetch('/__ledger/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:k,args})}).then(r=>{if(!r.ok)throw Error('Local response unavailable');return r.json()}).then(success,failure)}}})}};`,'text/javascript');return;}
      send(404,{error:'Not found'});return;
    }
    if(req.method!=='POST'||!['/__ledger/rpc','/__ledger/control'].includes(url.pathname)){send(404,{error:'Not found'});return;}
    if(req.headers.origin!==origin){send(403,{error:'Same-origin only'});return;}
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){send(413,{error:'Too large'});return;}}
    let input;try{input=JSON.parse(body);}catch{send(400,{error:'Invalid JSON'});return;}
    if(url.pathname==='/__ledger/control'){
      if(input.reset)reset();
      if(['qa-ledger-container','qa-second-ledger'].includes(input.container))select(input.container);
      if(input.fault){const {loseReply:lost,delayMs:delay,deferExecution:defer,...fault}=input.fault;Object.assign(fixture.fault,fault);if(lost!==undefined)loseReply=Boolean(lost);if(delay!==undefined)delayMs=Math.min(1500,Math.max(0,Number(delay)||0));if(defer!==undefined)deferExecution=Boolean(defer);}
      const results=[];
      if(input.recover)results.push(fixture.call('ledgerRecoverPending_',input.recover.requestId,input.recover.reason));
      if(input.runDeferred){for(const item of deferred)results.push(item.fixture.call(item.method,...item.args));deferred=[];}
      send(200,{ok:true,events:fixture.eventRows().length,results});return;
    }
    if(!allowed.has(input.method)||!Array.isArray(input.args)||input.args.length>1){send(400,{error:'Unsupported RPC'});return;}
    try{
      if(input.method==='ledgerExecute'&&deferExecution){deferExecution=false;if(deferred.length>=8){send(429,{error:'Too many deferred calls'});return;}deferred.push({fixture,method:input.method,args:input.args});send(503,{error:'Simulated failure before execution'});return;}
      const result=fixture.call(input.method,...input.args);
      if(input.method==='ledgerExecute'&&delayMs)await new Promise(r=>setTimeout(r,delayMs));
      if(input.method==='ledgerExecute'&&loseReply){loseReply=false;send(503,{error:'Simulated lost reply'});return;}
      send(200,result);
    }catch{send(500,{error:'Local QA service failed'});}
  });return{server,get fixture(){return fixture;}};
}
if(require.main===module){const port=Number(process.env.TARTEEL_LEDGER_QA_PORT||8878);createLedgerServer().server.listen(port,'127.0.0.1',()=>process.stdout.write(`Staff ledger QA: http://127.0.0.1:${port}/__ledger/\n`));}
module.exports={createLedgerServer};
