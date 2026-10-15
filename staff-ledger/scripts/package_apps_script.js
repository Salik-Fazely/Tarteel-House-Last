'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'staff-ledger');
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function privateOutput(out){
  if(!out)throw Error('Choose an output directory outside the checkout.');out=path.resolve(out);
  let existing=out,tail=[];while(!fs.existsSync(existing)){tail.unshift(path.basename(existing));existing=path.dirname(existing);}
  const resolved=path.join(fs.realpathSync(existing),...tail),repo=fs.realpathSync(root);
  if(resolved===repo||resolved.startsWith(repo+path.sep))throw Error('Generated output must stay outside the public checkout.');return resolved;
}
function packageScript(out){
  out=privateOutput(out);fs.mkdirSync(out,{recursive:true,mode:0o700});
  const sources={},read=file=>{const bytes=fs.readFileSync(path.join(directory,file));sources[file]=hash(bytes);return bytes.toString('utf8');};
  const schema=JSON.parse(read('Schema.json')),files={};
  files['StaffLedger.gs']='/* Private container-bound ledger. Never deploy as a web app. */\nvar LedgerSchema = '+JSON.stringify(schema)+';\n'+['Rules.gs','Domain.gs','Views.gs','Workbook.gs','Storage.gs','Menu.gs'].map(file=>'\n// BEGIN '+file+'\n'+read(file)).join('');
  for(const file of ['Sidebar','Styles','Client'])files[file+'.html']=(file==='Client'?'<script>\n'+read('Rules.gs')+'\n</script>\n':'')+read('ui/'+file+'.html.txt');
  files['appsscript.json']=read('appsscript.json');
  const manifest={schemaVersion:schema.version,files:{},sources:sources};
  for(const [file,content]of Object.entries(files)){fs.writeFileSync(path.join(out,file),content,{mode:0o600});manifest.files[file]=hash(content);}
  fs.writeFileSync(path.join(out,'sha256.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});return manifest;
}
if(require.main===module){if(process.argv.length!==4||process.argv[2]!=='--out')throw Error('Usage: node package_apps_script.js --out <private-directory>');const result=packageScript(process.argv[3]);process.stdout.write('Verified private bundle: '+Object.keys(result.files).length+' files\n');}
module.exports={packageScript,privateOutput};
