/* Derived staff views. Summary deliberately omits contacts and payment evidence. */
var LedgerViews = (function(){
  'use strict';
  function project(s,options){
    var view={sequence:s.sequence,asOf:options.nowIso,
      guardians:Object.values(s.guardians),students:Object.values(s.learners),
      packages:Object.values(s.purchases).map(function(p){return Object.assign({},p,LedgerDomain.purchaseBalance(s,p,options.nowIso));}),
      payments:Object.values(s.payments).map(function(p){return Object.assign({},p,LedgerDomain.paymentBalance(s,p));}),
      matches:Object.values(s.matches),lessons:Object.values(s.lessons),entitlements:Object.values(s.entitlements),adjustments:Object.values(s.adjustments),reviewCases:Object.values(s.reviews),
      overview:{shortfallCents:Object.values(s.payments).reduce(function(n,p){return n+LedgerDomain.paymentBalance(s,p).shortfallCents;},0)}};
    view.students=view.students.map(function(child){var parent=s.guardians[child.guardianId];return Object.assign({},child,{guardianName:parent.name,email:parent.email,whatsapp:parent.whatsapp});});
    view.packages.forEach(function(p){
      p.child=s.learners[p.learnerId].firstName;p.priceEUR=p.priceCents/100;p.matchedEUR=p.matchedCents/100;p.unpaidEUR=p.unpaidCents/100;
      p.status=p.held?'Under review':p.closed?'Closed':p.unpaidCents?'Unpaid':LedgerRules.madridDate(options.nowIso)>p.lastUsableOn?'Expired':p.remaining===0?'Used up':p.available===0?'Fully reserved':'Ready';
    });
    view.payments.forEach(function(p){p.guardian=s.guardians[p.guardianId].name;p.kind=p.kind||'RECEIPT';p.amountEUR=p.amountCents/100;p.netEUR=p.netCents/100;p.matchedEUR=p.matchedCents/100;p.unallocatedEUR=p.unallocatedCents/100;p.shortfallEUR=p.shortfallCents/100;});
    view.lessons=view.lessons.map(function(l){return Object.assign({},l,{child:s.learners[l.learnerId].firstName});});
    view.matches=view.matches.map(function(m){return Object.assign({},m,{child:s.learners[s.purchases[m.purchaseId].learnerId].firstName,amountEUR:m.amountCents/100});});
    var exceptions=[];
    function issue(type,recordId,action,details){exceptions.push({type:type,recordId:recordId,action:action,details:details});}
    view.packages.forEach(function(p){
      if(p.unpaidCents)issue('Unpaid package',p.purchaseId,'Verify and match payment','EUR '+p.unpaidEUR.toFixed(2)+' outstanding');
      if(!p.closed&&p.available<=2)issue('Low available balance',p.purchaseId,'Review package / reservations',String(p.available)+' unreserved lessons');
      var days=(Date.parse(p.lastUsableOn+'T12:00:00Z')-Date.parse(LedgerRules.madridDate(options.nowIso)+'T12:00:00Z'))/86400000;
      if(!p.closed&&days<=30)issue(days<0?'Expired package':'Upcoming expiry',p.purchaseId,'Review lesson dates','Last usable date: '+p.lastUsableOn);
    });
    view.payments.forEach(function(p){if(p.unallocatedCents)issue('Unmatched payment',p.paymentId,'Match verified money','EUR '+p.unallocatedEUR.toFixed(2)+' unmatched');if(p.shortfallCents)issue('Funding shortfall',p.paymentId,'Reconcile allocations','EUR '+p.shortfallEUR.toFixed(2)+' short');});
    view.lessons.forEach(function(l){if(l.status==='SCHEDULED'&&Date.parse(l.startsAt)+2400000<=Date.parse(options.nowIso))issue('Attendance missing',l.lessonId,'Record actual outcome',l.child);});
    view.reviewCases.forEach(function(r){if(!r.resolved)issue('Needs review',r.caseId,'Record a review decision',r.required.join(', '));});
    view.entitlements.forEach(function(t){if(t.status==='PENDING')issue('Replacement due',t.entitlementId,'Schedule using this reservation','Uses an existing credit');});
    view.overview.exceptions=exceptions;
    if(typeof LedgerSchema!=='undefined'){
      var adjustments=view.adjustments.map(function(a){var original=s.payments[a.originalReceiptId];return {paymentId:a.adjustmentId,guardian:s.guardians[original.guardianId].name,kind:a.kind,source:original.source,reference:a.reference,receivedOn:a.occurredOn,amountEUR:a.amountCents/100};});
      var totals={type:'Ledger totals',recordId:'',action:'Use staff forms to make changes',details:view.students.length+' students · '+view.packages.length+' packages · '+view.payments.length+' receipts · '+s.sequence+' events'};
      var records={'Overview':[totals].concat(exceptions),'Parent Summary':[],'Students':view.students,'Packages':view.packages,'Lessons':view.lessons,'Payments':view.payments.concat(adjustments),'Matches':view.matches,'Events':[],'Start':[]};
      view.sheets={};
      LedgerSchema.sheets.forEach(function(def){view.sheets[def.name]=records[def.name].map(function(row){return def.columns.map(function(col){var value=row[col.key];if(value===undefined||value===null)return '';if((col.type==='date'||col.type==='instant')&&value)return new Date(col.type==='date'?value+'T12:00:00Z':value);return value;});});});
    }
    return view;
  }
  function parentSummary(s,options){
    var child=s.learners[options.learnerId];
    if(!child)LedgerRules.fail('INVALID_INPUT','Select a learner.');
    var lines=['Tarteel House — '+child.firstName,'As of '+LedgerRules.madridDate(options.nowIso)];
    Object.values(s.purchases).filter(function(p){return p.learnerId===options.learnerId;}).forEach(function(p){
      var b=LedgerDomain.purchaseBalance(s,p,options.nowIso);
      lines.push('',p.name, b.held?'Under review — contact Tarteel House':p.closed?'Closed — contact Tarteel House':b.unpaidCents?'Payment not fully confirmed':'Payment confirmed',
        'Last usable date: '+p.lastUsableOn,'Completed: '+b.completed,'Charged absences: '+b.forfeited,
        'Remaining: '+b.remaining,'Reserved: '+b.reserved,'Available: '+b.available,'Make-ups available: '+b.makeupsAvailable);
    });
    return lines.join('\n');
  }
  return {project:project,parentSummary:parentSummary};
})();
