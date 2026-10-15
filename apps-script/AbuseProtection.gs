/** New-booking budgets. Called only while the booking script lock is held. */
const ABUSE_POLICY = {
  CONTACT_HOURLY: 3,
  CONTACT_DAILY: 12,
  GLOBAL_HOURLY: 50,
  GLOBAL_DAILY: 200,
  MAX_CONTACT_BUCKETS: 512,
  REQUEST_MAX_BYTES: 65536
};
const ABUSE_CONTACT_PREFIX = 'TH_ABUSE_CONTACT_V1_';
const ABUSE_GLOBAL_KEY = 'TH_ABUSE_GLOBAL_V1';
const ABUSE_SECRET_KEY = 'TH_ABUSE_SECRET_V1';

function oversizedBookingRequest_(e) {
  const body = e && e.postData;
  if (Number(e && e.contentLength) > ABUSE_POLICY.REQUEST_MAX_BYTES ||
      Number(body && body.length) > ABUSE_POLICY.REQUEST_MAX_BYTES) return true;
  // Apps Script supplies the byte length; also bound the body itself for mocks
  // or missing metadata. Count UTF-8 bytes without decoding untrusted form data.
  const text = String(body && body.contents || '');
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 128) bytes += 1;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length &&
        text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4; index++;
    } else bytes += 3;
    if (bytes > ABUSE_POLICY.REQUEST_MAX_BYTES) return true;
  }
  return false;
}

function reserveBookingCapacity_(params, nowMs) {
  Object.keys(ABUSE_POLICY).forEach(function (name) {
    if (!Number.isSafeInteger(ABUSE_POLICY[name]) || ABUSE_POLICY[name] < 1) {
      throw new Error('Invalid booking budget configuration.');
    }
  });
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('Invalid booking budget clock.');
  const hour = Math.floor(nowMs / 3600000);
  const day = Math.floor(nowMs / 86400000);
  const store = PropertiesService.getScriptProperties();
  const state = store.getProperties();
  const global = bookingBudgetCounter_(state[ABUSE_GLOBAL_KEY], hour, day);
  const contactKeys = Object.keys(state).filter(function (key) {
    return key.indexOf(ABUSE_CONTACT_PREFIX) === 0;
  });
  if (state[ABUSE_GLOBAL_KEY] == null && contactKeys.length) {
    throw new Error('Booking global budget state is missing.');
  }
  let secret = state[ABUSE_SECRET_KEY];
  if (secret == null) {
    if (state[ABUSE_GLOBAL_KEY] != null || contactKeys.length) {
      throw new Error('Booking budget secret is missing.');
    }
    secret = Utilities.getUuid() + Utilities.getUuid();
    store.setProperty(ABUSE_SECRET_KEY, secret);
  }
  if (!/^[a-zA-Z0-9-]{32,128}$/.test(secret)) throw new Error('Invalid booking budget secret.');

  // Remove only expired contact buckets. Other project settings are preserved.
  let retained = 0;
  contactKeys.forEach(function (key) {
    const counter = parseBookingBudgetCounter_(state[key], hour, day);
    if (counter[2] < day) {
      store.deleteProperty(key);
      delete state[key];
    } else retained++;
  });
  const contacts = [
    'email:' + String(params.email).trim().toLowerCase(),
    'phone:' + normalizeWhatsApp_(params.whatsapp)
  ].map(function (contact) {
    const hash = Utilities.computeHmacSha256Signature(contact, secret, Utilities.Charset.UTF_8)
      .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
    const key = ABUSE_CONTACT_PREFIX + hash;
    return { key: key, counter: bookingBudgetCounter_(state[key], hour, day) };
  });
  const newKeys = contacts.filter(function (contact) { return state[contact.key] == null; }).length;
  if (retained + newKeys > ABUSE_POLICY.MAX_CONTACT_BUCKETS ||
      global[1] >= ABUSE_POLICY.GLOBAL_HOURLY || global[3] >= ABUSE_POLICY.GLOBAL_DAILY ||
      contacts.some(function (contact) {
        return contact.counter[1] >= ABUSE_POLICY.CONTACT_HOURLY ||
          contact.counter[3] >= ABUSE_POLICY.CONTACT_DAILY;
      })) return false;

  const reservation = {};
  global[1]++; global[3]++;
  reservation[ABUSE_GLOBAL_KEY] = JSON.stringify(global);
  contacts.forEach(function (contact) {
    contact.counter[1]++; contact.counter[3]++;
    reservation[contact.key] = JSON.stringify(contact.counter);
  });
  // Reserve before appending: an unavailable property store cannot admit a row.
  // A later Sheet failure still consumes this new-request attempt's budget.
  store.setProperties(reservation);
  return true;
}

function bookingBudgetCounter_(raw, hour, day) {
  if (raw == null) return [hour, 0, day, 0];
  const saved = parseBookingBudgetCounter_(raw, hour, day);
  return [hour, saved[0] === hour ? saved[1] : 0, day, saved[2] === day ? saved[3] : 0];
}

function parseBookingBudgetCounter_(raw, hour, day) {
  const saved = JSON.parse(raw);
  if (!Array.isArray(saved) || saved.length !== 4 || saved.some(function (value) {
    return !Number.isSafeInteger(value) || value < 0;
  }) || saved[0] > hour || saved[2] > day || saved[1] > saved[3] ||
      Math.floor(saved[0] / 24) !== saved[2]) {
    throw new Error('Invalid booking budget state.');
  }
  return saved;
}
