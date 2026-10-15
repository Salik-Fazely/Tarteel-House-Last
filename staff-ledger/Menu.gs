function onOpen(){SpreadsheetApp.getUi().createMenu('Tarteel Ledger').addItem('Open staff forms','ledgerOpenSidebar').addItem('Initialize ledger','ledgerInitialize').addItem('Refresh ledger','ledgerRefresh').addItem('Ledger health','ledgerShowHealth').addItem('Review an uncertain save','ledgerReviewUncertainSave').addToUi();}
function ledgerOpenSidebar(){SpreadsheetApp.getUi().showSidebar(HtmlService.createTemplateFromFile('Sidebar').evaluate().setTitle('Tarteel House — Staff Ledger'));}
function ledgerInclude_(name){if(['Client','Styles'].indexOf(name)<0)throw new Error('Unknown ledger template.');return HtmlService.createHtmlOutputFromFile(name).getContent();}
function ledgerInitialize(){return LedgerStorage.initialize();}
function ledgerBootstrap(options){return LedgerStorage.bootstrap(options);}
function ledgerPreview(command){return LedgerStorage.preview(command);}
function ledgerExecute(command){return LedgerStorage.execute(command);}
function ledgerCommandStatus(requestId){return LedgerStorage.status(requestId);}
function ledgerRefresh(){return LedgerStorage.refresh();}
function ledgerParentSummary(learnerId){return LedgerStorage.summary(learnerId);}
function ledgerHealth(){return LedgerStorage.health();}
function ledgerShowHealth(){SpreadsheetApp.getUi().alert(JSON.stringify(ledgerHealth(),null,2));}
function ledgerRecoverPending_(requestId,reason){return LedgerStorage.recover(requestId,reason);}
function ledgerReviewUncertainSave(){
  var ui=SpreadsheetApp.getUi(),id=ui.prompt('Review uncertain save','First inspect Apps Script → Executions and confirm the original execution has ended. Wait at least five minutes. Enter the pending request ID.',ui.ButtonSet.OK_CANCEL);
  if(id.getSelectedButton()!==ui.Button.OK)return;
  var reason=ui.prompt('Record the review','Describe how you verified that the execution ended and checked Events. Recovery never deletes events. Only continue after completing those checks.',ui.ButtonSet.OK_CANCEL);
  if(reason.getSelectedButton()!==ui.Button.OK)return;
  ui.alert(JSON.stringify(ledgerRecoverPending_(id.getResponseText().trim(),reason.getResponseText().trim()),null,2));
}
