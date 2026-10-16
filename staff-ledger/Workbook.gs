/* Bound-workbook schema and derived views. Events are never refreshed or cleared. */
var LedgerWorkbook = (function(){
  'use strict';
  var S=LedgerSchema,R=LedgerRules;
  function definition(name){return S.sheets.find(function(s){return s.name===name;});}
  function literal(value){return typeof value==='string'&&/^[\s]*[=+\-@]/.test(value)?"'"+value:value;}
  function validate(book){
    var allowed=S.sheets.map(function(s){return s.name;});
    if(book.getSheets().some(function(s){return allowed.indexOf(s.getName())<0;}))R.fail('CORRUPT_LEDGER','Use the verified ledger template without unrelated tabs.');
    S.sheets.forEach(function(d){
      var sheet=book.getSheetByName(d.name);
      if(!sheet)R.fail('CORRUPT_LEDGER','A required ledger tab is missing.');
      var headers=sheet.getRange(S.headerRow,1,1,d.columns.length).getValues()[0];
      if(headers.some(function(value,index){return value!==d.columns[index].label;}))R.fail('CORRUPT_LEDGER','Ledger column headers have changed.');
    });
  }
  function configure(book){
    book.setSpreadsheetTimeZone(S.timeZone);
    S.sheets.forEach(function(d){
      var sheet=book.getSheetByName(d.name),count=d.columns.length;
      sheet.setFrozenRows(S.headerRow);
      if(d.name==='Parent Summary')sheet.setColumnWidth(1,600);
      sheet.getRange(1,1,1,count).setFontSize(16).setFontWeight('bold');
      sheet.getRange(S.headerRow,1,1,count).setBackground('#eef0f2').setFontColor('#202124').setFontWeight('bold').setWrap(true);
      d.columns.forEach(function(c,index){
        var range=sheet.getRange(S.headerRow+1,index+1,Math.max(1,sheet.getMaxRows()-S.headerRow),1);
        range.setNumberFormat(c.type==='money'?'"€"#,##0.00':c.type==='count'?'0':c.type==='date'?'dd mmm yyyy':c.type==='instant'?'dd mmm yyyy hh:mm':'@');
        if(c.type==='money'||c.type==='count')range.setDataValidation(SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(true).build());
      });
      sheet.protect().setDescription('Managed ledger: use the staff forms for changes.').setWarningOnly(true);
    });
  }
  function write(book,name,rows){
    var d=definition(name),sheet=book.getSheetByName(name);
    if(!d||name==='Events')R.fail('CORRUPT_LEDGER','This tab is not a derived view.');
    var oldRows=Math.max(0,sheet.getLastRow()-S.headerRow);
    if(rows.length+S.headerRow>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+S.headerRow-sheet.getMaxRows());
    if(oldRows)sheet.getRange(S.headerRow+1,1,oldRows,d.columns.length).clearContent();
    if(rows.length)sheet.getRange(S.headerRow+1,1,rows.length,d.columns.length).setValues(rows.map(function(row){if(row.length!==d.columns.length)R.fail('CORRUPT_LEDGER','A derived view has invalid columns.');return row.map(literal);}));
  }
  function stale(book){book.getSheetByName('Overview').getRange(2,2).setValue('Refreshing — balances may be stale');SpreadsheetApp.flush();}
  function summary(book,state,learnerId,nowIso){
    var text=LedgerViews.parentSummary(state,{learnerId:learnerId,nowIso:nowIso});
    write(book,'Parent Summary',text.split('\n').map(function(line){return[line];}));
    book.getSheetByName('Parent Summary').getRange(3,2).setValue(state.sequence);
    PropertiesService.getDocumentProperties().setProperty('LEDGER_SUMMARY_LEARNER',learnerId);
    return text;
  }
  function refresh(book,state,nowIso){
    validate(book);stale(book);
    var projection=LedgerViews.project(state,{nowIso:nowIso});
    Object.keys(projection.sheets).forEach(function(name){if(name!=='Events'&&name!=='Start'&&name!=='Parent Summary')write(book,name,projection.sheets[name]);});
    var selected=PropertiesService.getDocumentProperties().getProperty('LEDGER_SUMMARY_LEARNER');
    if(selected&&state.learners[selected])summary(book,state,selected,nowIso);else write(book,'Parent Summary',[]);
    S.sheets.forEach(function(d){if(d.name==='Events')return;var sheet=book.getSheetByName(d.name);sheet.getRange(3,2).setValue(state.sequence);sheet.getRange(3,4).setValue(new Date(nowIso));});
    S.sheets.forEach(function(d){if(['Overview','Parent Summary','Start'].indexOf(d.name)>=0)return;var sheet=book.getSheetByName(d.name),filter=sheet.getFilter();if(filter)filter.remove();sheet.getRange(S.headerRow,1,Math.max(2,sheet.getLastRow()-S.headerRow+1),d.columns.length).createFilter();});
    SpreadsheetApp.flush();book.getSheetByName('Overview').getRange(2,2).setValue('Current');SpreadsheetApp.flush();
    return projection;
  }
  function health(book,state,pending){
    var sheet=book.getSheetByName('Overview'),applied=sheet.getRange(3,2).getValue();
    return {counts:{students:Object.keys(state.learners).length,purchases:Object.keys(state.purchases).length,payments:Object.keys(state.payments).length,events:state.sequence,unresolvedReviews:Object.values(state.reviews).filter(function(r){return !r.resolved;}).length},appliedSequence:Number(applied)||0,stale:sheet.getRange(2,2).getValue()!=='Current'||Number(applied)!==state.sequence,pendingWrite:Boolean(pending),pendingRequestId:pending?pending.requestId:null};
  }
  return {validate:validate,configure:configure,refresh:refresh,summary:summary,health:health};
})();
