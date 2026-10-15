/* Derived staff views. Summary deliberately omits contacts and payment evidence. */
var LedgerViews = (function(){
  'use strict';
  function project(s,options){
    return {sequence:s.sequence,asOf:options.nowIso,
      guardians:Object.values(s.guardians),students:Object.values(s.learners),
      packages:Object.values(s.purchases).map(function(p){return Object.assign({},p,LedgerDomain.purchaseBalance(s,p,options.nowIso));}),
      payments:Object.values(s.payments).map(function(p){return Object.assign({},p,LedgerDomain.paymentBalance(s,p));}),
      matches:Object.values(s.matches),lessons:Object.values(s.lessons),entitlements:Object.values(s.entitlements),adjustments:Object.values(s.adjustments),reviewCases:Object.values(s.reviews),
      overview:{shortfallCents:Object.values(s.payments).reduce(function(n,p){return n+LedgerDomain.paymentBalance(s,p).shortfallCents;},0)}};
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
