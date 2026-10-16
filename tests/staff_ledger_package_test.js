'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {packageScript}=require('../staff-ledger/scripts/package_apps_script');
const root=path.resolve(__dirname,'..');
test('private package preserves source bytes, ordered initialization and matching hashes',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'tarteel-ledger-package-'));
  try{
    packageScript(out);const manifest=JSON.parse(fs.readFileSync(path.join(out,'sha256.json'),'utf8'));
    assert.deepEqual(Object.keys(manifest.files).sort(),['Client.html','Sidebar.html','StaffLedger.gs','Styles.html','appsscript.json'].sort());
    for(const [file,hash]of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex'),hash);
    for(const [file,hash]of Object.entries(manifest.sources))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'staff-ledger',file))).digest('hex'),hash);
    assert.ok(!fs.readdirSync(out).some(name=>name.endsWith('.txt')));
    const source=fs.readFileSync(path.join(out,'StaffLedger.gs'),'utf8');
    for(const file of ['Rules','Domain','Views','Workbook','Storage','Menu'])assert.ok(source.includes(fs.readFileSync(path.join(root,'staff-ledger',file+'.gs'),'utf8')));
    const context=vm.createContext({Intl});vm.runInContext(source,context);assert.equal(context.LedgerRules.CATALOG.STEADY.priceCents,22000);assert.equal(context.LedgerSchema.headerRow,5);
    const client=fs.readFileSync(path.join(out,'Client.html'),'utf8');assert.ok(client.includes(fs.readFileSync(path.join(root,'staff-ledger/Rules.gs'),'utf8')));
    const auth=JSON.parse(fs.readFileSync(path.join(out,'appsscript.json'),'utf8'));assert.equal(auth.timeZone,'Europe/Madrid');assert.equal(auth.oauthScopes.length,3);assert.ok(!/function do(?:Get|Post)\s*\(/.test(source));
    packageScript(out);assert.equal(fs.readFileSync(path.join(out,'StaffLedger.gs'),'utf8'),source);
  }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('generated output cannot be written into the public checkout, including symlink paths',()=>{
  assert.throws(()=>packageScript(path.join(root,'staff-ledger/generated')),/outside/);
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'tarteel-ledger-path-'));
  try{fs.symlinkSync(root,path.join(temp,'public'),'dir');assert.throws(()=>packageScript(path.join(temp,'public/generated')),/outside/);}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
