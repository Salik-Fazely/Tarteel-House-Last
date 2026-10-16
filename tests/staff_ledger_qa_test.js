'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLedgerServer}=require('../staff-ledger/scripts/qa_server');
test('isolated ledger server serves only its page, resources and bounded same-origin RPCs',async()=>{
  const {server}=createLedgerServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const page=await fetch(base+'/__ledger/');assert.equal(page.status,200);assert.match(await page.text(),/Staff ledger/);
    for(const path of ['/','/staff-ledger/Storage.gs','/../../.git/config'])assert.equal((await fetch(base+path)).status,404);
    const rpc=body=>fetch(base+'/__ledger/rpc',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});
    assert.equal((await (await rpc({method:'ledgerHealth',args:[]})).json()).counts.events,0);
    assert.equal((await rpc({method:'ledgerInitialize',args:[]})).status,400);
    assert.equal((await fetch(base+'/__ledger/rpc',{method:'POST',headers:{Origin:'https://example.invalid'},body:'{}'})).status,403);
    assert.equal((await fetch(base+'/__ledger/rpc',{method:'POST',headers:{Origin:base},body:'x'.repeat(65537)})).status,413);
  }finally{await new Promise(r=>server.close(r));}
});
