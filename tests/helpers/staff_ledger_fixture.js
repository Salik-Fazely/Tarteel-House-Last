'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const directory = path.resolve(__dirname, '../../staff-ledger');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const plain = value => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

function domainFixture() {
  const context = vm.createContext({ Intl, console });
  for (const file of ['Rules.gs', 'Domain.gs', 'Views.gs']) {
    vm.runInContext(fs.readFileSync(path.join(directory, file), 'utf8'), context, { filename: file });
  }
  const api = vm.runInContext('({rules:LedgerRules,domain:LedgerDomain,views:LedgerViews})', context);
  let next = 10000;
  const events = [];
  const harness = {
    api, events,
    now: '2026-10-15T09:00:00.000Z',
    get state() { return plain(api.domain.replay(events)); },
    command(type, payload, reason = '') {
      return { schemaVersion: 1, requestId: id(next++), expectedSequence: events.length, type, payload, reason };
    },
    execute(command) {
      freeze(command);
      const normalized = api.rules.normalizeCommand(command);
      const fingerprint = crypto.createHash('sha256').update(api.rules.canonicalCommand(normalized)).digest('hex');
      const result = api.domain.decide(freeze(api.domain.replay(events)), normalized, {
        actorEmail: 'qa.staff@example.invalid', nowIso: harness.now, eventId: id(next++), fingerprint,
      });
      if (!result.duplicate) events.push(plain(result.event));
      return plain(result);
    },
    do(type, payload, reason = '') { return harness.execute(harness.command(type, payload, reason)); },
    project() { return plain(api.views.project(api.domain.replay(events), { nowIso: harness.now })); },
    summary(learnerId) { return api.views.parentSummary(api.domain.replay(events), { learnerId, nowIso: harness.now }); },
  };
  return harness;
}

function family(h, base = 1) {
  const guardianId = id(base), learnerId = id(base + 1);
  h.do('CREATE_GUARDIAN', { guardianId, name: 'QA Guardian', email: `qa${base}@example.invalid`, whatsapp: '+34600000000' });
  h.do('CREATE_LEARNER', { learnerId, guardianId, firstName: `QA Child ${base}`, language: 'english' });
  return { guardianId, learnerId };
}
function purchase(h, { learnerId, purchaseId = id(20), packageCode = 'STARTER' }) {
  h.do('CREATE_PURCHASE', { purchaseId, learnerId, packageCode, purchasedOn: '2026-10-15', lastUsableOn: '2027-10-14' });
  return purchaseId;
}
function receipt(h, { guardianId, paymentId = id(30), amountCents = 12000, reference = 'QA-TX-1' }) {
  h.do('RECORD_RECEIPT', { paymentId, guardianId, source: 'QA bank', reference, receivedOn: '2026-10-15', amountCents, currency: 'EUR', verified: true });
  return paymentId;
}
module.exports = { domainFixture, id, plain, family, purchase, receipt };
