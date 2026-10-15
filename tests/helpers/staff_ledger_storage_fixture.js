'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {id,plain}=require('./staff_ledger_fixture');
const directory=path.resolve(__dirname,'../../staff-ledger');
function storageFixture(){
  const schema=JSON.parse(fs.readFileSync(path.join(directory,'Schema.json'),'utf8'));
  const fault={identity:'qa.staff@example.invalid',now:'2026-10-15T09:00:00Z',locked:false,append:null,readAfterAppend:false,refresh:false};
  const properties=new Map(),writes=[],sheets=new Map();let appended=false,sequence=10000,container='qa-ledger-container';
  function makeSheet(name,columns){
    const cells=Array.from({length:5},()=>[]);cells[4]=columns.map(c=>c.label);
    const sheet={name,cells,maxRows:1000,getName(){return name;},getLastRow(){let n=cells.length;while(n&&!(cells[n-1]||[]).some(v=>v!==undefined&&v!==''))n--;return n;},getLastColumn(){return Math.max(0,...cells.map(r=>r.length));},getMaxRows(){return sheet.maxRows;},getMaxColumns(){return 50;},insertRowsAfter(after,count){sheet.maxRows+=count;return sheet;},setFrozenRows(){},setColumnWidth(){},setColumnWidths(){},getFilter(){return null;},protect(){return{setWarningOnly(){return this;},setDescription(){return this;}};},
      getRange(row,col,rows=1,cols=1){if(row+rows-1>sheet.maxRows)throw Error('Outside native sheet grid');const range={
        getValues(){if(name==='Events'&&row>=6&&fault.readAfterAppend&&appended)throw new Error('PRIVATE provider failure');return Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>(cells[row+r-1]||[])[col+c-1]??''));},
        getValue(){return range.getValues()[0][0];},
        setValues(values){
          if(name==='Events'&&row>=6&&fault.append==='before')throw new Error('PRIVATE append failure');
          if(name!=='Events'&&fault.refresh)throw new Error('PRIVATE refresh failure');
          if(values.length!==rows||values.some(r=>r.length!==cols))throw new Error('Wrong rectangle dimensions');
          writes.push({name,row,col,values:plain(values)});
          values.forEach((r,i)=>r.forEach((v,j)=>{cells[row+i-1]??=[];cells[row+i-1][col+j-1]=typeof v==='string'&&/^'[\s]*[=+\-@]/.test(v)?v.slice(1):v;}));
          if(name==='Events'&&row>=6){appended=true;if(fault.append==='after')throw new Error('PRIVATE delayed reply');}
          return range;
        },setValue(value){return range.setValues([[value]]);},
        clearContent(){for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){cells[row+r-1]??=[];cells[row+r-1][col+c-1]='';}return range;},
        setNumberFormat(){return range;},setFontFamily(){return range;},setFontSize(){return range;},setFontWeight(){return range;},setBackground(){return range;},setFontColor(){return range;},setWrap(){return range;},setVerticalAlignment(){return range;},setHorizontalAlignment(){return range;},setDataValidation(){return range;},createFilter(){return range;},protect(){return{setWarningOnly(){return this;},setDescription(){return this;}};},
      };return range;},
    };sheets.set(name,sheet);return sheet;
  }
  for(const s of schema.sheets)makeSheet(s.name,s.columns);
  const spreadsheet={getId(){return container;},getName(){return 'Tarteel House — Staff Ledger QA';},getSheets(){return [...sheets.values()];},getSheetByName(name){return sheets.get(name)||null;},getSpreadsheetTimeZone(){return 'Europe/Madrid';},setSpreadsheetTimeZone(){}};
  const menu=[];
  const context=vm.createContext({Intl,Date:class extends Date{constructor(...args){super(...(args.length?args:[fault.now]));}static now(){return Date.parse(fault.now);}},
    LedgerSchema:schema,
    Session:{getEffectiveUser(){return{getEmail(){return fault.identity;}};},getScriptTimeZone(){return'Europe/Madrid';}},
    LockService:{getDocumentLock(){return{tryLock(){if(fault.locked)return false;fault.locked=true;return true;},releaseLock(){fault.locked=false;}};}},
    PropertiesService:{getDocumentProperties(){return{getProperty(k){return properties.get(k)??null;},setProperty(k,v){properties.set(k,String(v));return this;},deleteProperty(k){properties.delete(k);return this;}};}},
    SpreadsheetApp:{getActiveSpreadsheet(){return spreadsheet;},flush(){},newDataValidation(){return{requireNumberGreaterThanOrEqualTo(){return this;},setAllowInvalid(){return this;},build(){return{};}};},getUi(){return{createMenu(title){menu.push(title);return{addItem(label){menu.push(label);return this;},addToUi(){}};}};}},
    Utilities:{getUuid(){return id(sequence++);},DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest(algorithm,value){return [...crypto.createHash('sha256').update(value,'utf8').digest()].map(v=>v>127?v-256:v);}},
    HtmlService:{createTemplateFromFile(){return{evaluate(){return{setTitle(){return this;}};}};},createHtmlOutputFromFile(){return{getContent(){return'';}};}},
  });
  for(const file of ['Rules.gs','Domain.gs','Views.gs','Workbook.gs','Storage.gs','Menu.gs'])vm.runInContext(fs.readFileSync(path.join(directory,file),'utf8'),context,{filename:file});
  return {schema,fault,properties,writes,sheets,menu,context,spreadsheet,makeSheet,
    setContainer(value){container=value;},
    call(name,...args){const result=context[name](...args);return result===undefined?undefined:plain(result);},
    command(type,payload,reason=''){return{schemaVersion:1,requestId:id(sequence++),expectedSequence:Math.max(0,sheets.get('Events').getLastRow()-5),type,payload,reason};},
    eventRows(){return sheets.get('Events').cells.slice(5).filter(r=>r.some(v=>v!==''));},
  };
}
module.exports={storageFixture};
