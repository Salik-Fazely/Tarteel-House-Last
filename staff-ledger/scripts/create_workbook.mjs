// Run from a private directory linked to the bundled runtime dependencies.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{privateOutput}=require('./package_apps_script.js');
if(process.argv.length!==4||process.argv[2]!=='--out')throw Error('Usage: bundled-node create_workbook.mjs --out <private-directory>');
const output=privateOutput(process.argv[3]),source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=createRequire(path.join(process.cwd(),'package.json'));
const {Workbook,SpreadsheetFile}=await import(pathToFileURL(runtime.resolve('@oai/artifact-tool')).href);
const schema=JSON.parse(await fs.readFile(path.join(source,'Schema.json'),'utf8'));
const context=vm.createContext({Intl});vm.runInContext(await fs.readFile(path.join(source,'Rules.gs'),'utf8'),context);const catalog=context.LedgerRules.CATALOG;
await fs.mkdir(output,{recursive:true,mode:0o700});
const workbook=Workbook.create(),checks=[];
function column(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
const guide=[
  ['Open forms','Tarteel Ledger → Open staff forms','Use desktop Google Sheets. Initialize once after the private script is installed.'],
  ['Access','Owner and named trusted editors only','Editors can see the whole workbook and script. Parents and teachers have no access.'],
  ['Normal workflow','Guardian → child → unpaid package → verified payment → match → lesson','Preview every change, then confirm. Paid scheduling requires full matching and no unresolved review.'],
  ['Payment verification','Check the bank or payment service first','Record the real reference and EUR amount. The ledger neither moves money nor verifies the bank.'],
  ['Lesson duration',40,'Minutes for both paid lessons and trials. Short sessions require review.'],
  ['Timezone','Europe/Madrid','Notice uses elapsed hours. Select the correct clock offset for an autumn repeated hour.'],
  ['Expiry','One year from purchase','Default last usable day is before the next anniversary; 29 February uses 28 February next year.'],
  ['Timely cancellation',24,'Hours of notice preserve the original credit and make-up allowance. Service cancellations also preserve both.'],
  ['Replacement','Use the existing reservation','A replacement adds no credit. Remaining minus reserved equals available.'],
  ['Review','Record an explicit decision and reason','Refunds, uncertain commitments and lesson exceptions keep a package on hold until resolved.'],
  ['Historical opening','Verify purchase, payment and all outstanding commitments','Enter usage and each scheduled lesson/replacement. Choose checked none or unknown explicitly.'],
  ['Corrections','Reverse the original event with a reason','Resolve dependent entries first. Never edit or delete Events rows.'],
  ['Saved; refresh required','Refresh ledger','The event is saved. Do not enter it again. The applied sequence shows whether views are current.'],
  ['Uncertain save','Check save status','Do not make a new request. Inspect Executions, wait five minutes, then use Review an uncertain save if needed.'],
  ['Parent summary','Prepare one child’s summary and check the name','Copy only that text. Contacts, siblings, payment references and internal review notes are excluded.'],
  ['Capacity',schema.maxEvents,'Events per workbook. Arrange a reviewed migration before capacity; do not reset history.'],
  ['Rule source','https://github.com/Salik-Fazely/Tarteel-House-Last/blob/main/docs/superpowers/specs/2026-10-15-staff-ledger-design.md','Owner-approved design dated 15 October 2026, based on the commercial facts and terms.']
];
for(const p of Object.values(catalog))guide.push([p.name+' price (EUR)',p.priceCents/100,'One child per purchase'],[p.name+' lessons',p.lessonCount,'Paid lessons'],[p.name+' late/no-show make-ups',p.makeupLimit,'After the allowance, late cancellation/no-show charges one lesson']);
for(const def of schema.sheets){
  const sheet=workbook.worksheets.add(def.name),last=column(Math.max(4,def.columns.length));sheet.showGridLines=false;
  const bounds=sheet.getRange('A1:'+last+'100');bounds.format.font={name:'Arial',size:10,color:'#202124'};bounds.format.verticalAlignment='center';bounds.format.columnWidth=22;bounds.format.rowHeight=23;
  sheet.getRange('A1').values=[['Tarteel House — '+def.name]];sheet.getRange('A1:'+last+'1').format.font={name:'Arial',size:14,bold:true};sheet.getRange('A1:'+last+'1').format.rowHeight=30;
  sheet.getRange('A2:B3').values=[['View status',def.name==='Overview'?'Not initialized':'See Overview'],[def.name==='Events'?'History':'Applied event',def.name==='Events'?'Append only':'']];sheet.getRange('C3').values=[['Refreshed at']];sheet.getRange('D3').setNumberFormat('dd mmm yyyy hh:mm');
  sheet.getRange('A4').values=[['Use Tarteel Ledger → Open staff forms to make changes.']];sheet.getRange('A4:'+last+'4').format.font={name:'Arial',size:10,italic:true,color:'#5f6368'};
  sheet.getRange('A5:'+column(def.columns.length)+'5').values=[def.columns.map(c=>c.label)];
  sheet.getRange('A5:'+column(def.columns.length)+'5').format={fill:'#eef0f2',font:{name:'Arial',size:10,bold:true,color:'#202124'},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center',rowHeight:42,borders:{bottom:{style:'thin',color:'#b8c0b9'}}};
  sheet.freezePanes.freezeRows(schema.headerRow);
  for(const [index,col]of def.columns.entries()){const cells=sheet.getRange(column(index+1)+'6:'+column(index+1)+'100');cells.setNumberFormat(col.type==='money'?'"€"#,##0.00':col.type==='count'?'0':col.type==='date'?'dd mmm yyyy':col.type==='instant'?'dd mmm yyyy hh:mm':'@');if(col.type)cells.format.horizontalAlignment='right';}
  if(def.name==='Overview'){sheet.getRange('A6:D6').values=[['Setup required','','Install private script','Initialize this empty workbook before entering records.']];sheet.getRange('C6:D100').format.wrapText=true;sheet.getRange('C1:D100').format.columnWidth=42;}
  if(def.name==='Parent Summary'){sheet.getRange('A1:A100').format.columnWidth=80;}
  if(def.name==='Packages'){sheet.getRange('O6:O100').conditionalFormats.add('containsText',{text:'Under review',format:{fill:'#fff2cc',font:{color:'#754e00'}}});sheet.getRange('O6:O100').conditionalFormats.add('containsText',{text:'Unpaid',format:{fill:'#fce8e6',font:{color:'#a12622'}}});}
  if(def.name==='Start'){
    sheet.getRange('A6:C'+(5+guide.length)).values=guide;sheet.getRange('A1:A100').format.columnWidth=29;sheet.getRange('B1:B100').format.columnWidth=56;sheet.getRange('C1:C100').format.columnWidth=76;sheet.getRange('A6:C'+(5+guide.length)).format.wrapText=true;sheet.getRange('A6:C'+(5+guide.length)).format.rowHeight=50;
    guide.forEach((row,index)=>{if(row[0].includes('price (EUR)'))sheet.getRange('B'+(index+6)).setNumberFormat('"€"#,##0.00');else if(typeof row[1]==='number')sheet.getRange('B'+(index+6)).setNumberFormat('0');});
  }
}
workbook.recalculate();
for(const def of schema.sheets){const sheet=workbook.worksheets.getItem(def.name),end=def.name==='Start'?5+guide.length:8,last=column(Math.max(4,def.columns.length));
  const headers=sheet.getRange('A5:'+column(def.columns.length)+'5').values[0];if(JSON.stringify(headers)!==JSON.stringify(def.columns.map(c=>c.label)))throw Error('Wrong headers: '+def.name);
  if(!['Overview','Start'].includes(def.name)&&sheet.getRange('A6:'+column(def.columns.length)+'100').values.some(row=>row.some(v=>v!==null&&v!=='')))throw Error('Operational record found: '+def.name);
  checks.push((await workbook.inspect({kind:'table',range:"'"+def.name+"'!A1:"+last+end,include:'values,formulas',tableMaxRows:end,tableMaxCols:def.columns.length,maxChars:6000})).ndjson);
  const preview=await workbook.render({sheetName:def.name,range:'A1:'+last+end,scale:1,format:'png'});await fs.writeFile(path.join(output,def.name.replaceAll(' ','-')+'.png'),new Uint8Array(await preview.arrayBuffer()));
}
const errors=await workbook.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:100},maxChars:4000});checks.push(errors.ndjson);
await fs.writeFile(path.join(output,'workbook-verification.ndjson'),checks.join('\n'));
const file=await SpreadsheetFile.exportXlsx(workbook);await file.save(path.join(output,'Tarteel-House-Staff-Ledger.xlsx'));console.log('Exported one empty workbook; nine headers/views rendered and inspected.');
