const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const consent = require('../assets/js/consent.js');
const analyticsEvents = require('../assets/js/analytics-events.js');

function createPixelDocument() {
  const scripts = [];
  return {
    head: { appendChild: script => scripts.push(script) },
    createElement: () => ({}),
    querySelector: selector => scripts.find(script => selector.includes(script.src)) || null,
    scripts,
  };
}

function createConsentDocument() {
  const scripts = [];
  const elements = [];
  const makeElement = () => {
    const listeners = new Map();
    const attributes = new Map();
    const element = {
      children: [],
      dataset: {},
      append(...children) { this.children.push(...children); },
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatch(type) { listeners.get(type)?.(); },
      focus() {},
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); },
    };
    elements.push(element);
    return element;
  };
  const footer = makeElement();

  return {
    addEventListener() {},
    body: makeElement(),
    createElement: makeElement,
    getElementById() { return null; },
    head: { appendChild: script => scripts.push(script) },
    querySelector(selector) {
      if (selector === '.footer__bottom') return footer;
      return scripts.find(script => selector.includes(script.src)) || null;
    },
    elements,
    scripts,
  };
}

function withWindowEvents(window) {
  const listeners = new Map();
  window.addEventListener = (type, listener) => {
    const current = listeners.get(type) || [];
    current.push(listener);
    listeners.set(type, current);
  };
  window.dispatchEvent = event => {
    (listeners.get(event.type) || []).forEach(listener => listener(event));
    return true;
  };
  window.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  return window;
}

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue) values.set(consent.STORAGE_KEY, initialValue);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    values,
  };
}

function queuedOpenAiCalls(window) {
  return window.oaiq.q.map(args => Array.from(args));
}

test('exposes the shared consent API to browser modules', () => {
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/consent.js'), 'utf8');
  const window = {};
  const document = createPixelDocument();
  document.readyState = 'loading';
  document.addEventListener = () => {};

  vm.runInNewContext(source, { document, window });

  assert.equal(typeof window.TarteelHouseConsent.readSavedPreference, 'function');
  assert.equal(window.TarteelHouseConsent.loadAnalytics, undefined);
  assert.equal(Object.keys(window.TarteelHouseConsent).join(','), 'readSavedPreference');
  assert.deepEqual(JSON.parse(JSON.stringify(queuedOpenAiCalls(window))), [
    ['consent', false],
    ['init', { pixelId: 'CyfMjLQ5sFcxkzzrRdDeDb' }],
  ]);
  assert.equal(document.scripts.length, 1);
});

test('stores granted consent for one calendar year', () => {
  const now = Date.UTC(2026, 6, 13, 12);
  const preference = consent.createPreference('granted', now);

  assert.deepEqual(preference, {
    status: 'granted',
    expiresAt: Date.UTC(2027, 6, 13, 12),
    version: consent.CONSENT_VERSION,
  });
});

test('treats expired, malformed, and unknown preferences as missing', () => {
  const now = Date.UTC(2026, 6, 13, 12);

  assert.equal(consent.parsePreference(JSON.stringify({ status: 'denied', expiresAt: now }), now), null);
  assert.equal(consent.parsePreference('{bad json', now), null);
  assert.equal(consent.parsePreference(JSON.stringify({ status: 'maybe', expiresAt: now + 1 }), now), null);
  assert.equal(
    consent.parsePreference(JSON.stringify({ status: 'granted', expiresAt: now + 1 }), now),
    null,
    'a legacy approval must not silently authorize a new advertising-measurement purpose',
  );
  const legacyDenied = consent.parsePreference(JSON.stringify({ status: 'denied', expiresAt: now + 1 }), now);
  assert.equal(legacyDenied.status, 'denied', 'a legacy denial remains a denial while a new choice is requested');
  assert.equal(legacyDenied.expiresAt, now + 1);
});

test('loads the OpenAI Ads Pixel once after queueing denied consent before initialization', () => {
  const document = createPixelDocument();
  const window = {};

  consent.loadOpenAiPixel(window, document);
  consent.loadOpenAiPixel(window, document);

  assert.equal(consent.OPENAI_PIXEL_ID, 'CyfMjLQ5sFcxkzzrRdDeDb');
  assert.equal(consent.OPENAI_PIXEL_SRC, 'https://bzrcdn.openai.com/sdk/oaiq.min.js');
  assert.equal(document.scripts.length, 1);
  assert.equal(document.scripts[0].async, true);
  assert.equal(document.scripts[0].src, 'https://bzrcdn.openai.com/sdk/oaiq.min.js');
  assert.deepEqual(
    queuedOpenAiCalls(window),
    [
      ['consent', false],
      ['init', { pixelId: 'CyfMjLQ5sFcxkzzrRdDeDb' }],
    ],
  );
});

test('changes OpenAI Ads measurement consent without reinitializing the Pixel', () => {
  const document = createPixelDocument();
  const window = {};

  consent.loadOpenAiPixel(window, document);
  consent.setOpenAiConsent(window, true);
  consent.setOpenAiConsent(window, false);

  assert.equal(document.scripts.length, 1);
  assert.deepEqual(
    queuedOpenAiCalls(window),
    [
      ['consent', false],
      ['init', { pixelId: 'CyfMjLQ5sFcxkzzrRdDeDb' }],
      ['consent', true],
      ['consent', false],
    ],
  );
});

test('current granted consent enables GA4 and OpenAI Ads measurement after safe pixel initialization', () => {
  const document = createConsentDocument();
  const storage = createStorage(JSON.stringify({
    status: 'granted',
    expiresAt: Date.UTC(2030, 0, 1),
    version: consent.CONSENT_VERSION,
  }));
  const window = { localStorage: storage, location: { hostname: 'tarteelhouse.com' } };

  consent.init(window, document);

  assert.deepEqual(queuedOpenAiCalls(window), [
    ['consent', false],
    ['init', { pixelId: 'CyfMjLQ5sFcxkzzrRdDeDb' }],
    ['consent', true],
  ]);
  assert.equal(window.dataLayer.some(args => args[0] === 'config' && args[1] === consent.MEASUREMENT_ID), true);
});

test('missing, legacy-granted, and denied choices keep OpenAI Ads measurement disabled', () => {
  const cases = [
    { name: 'missing', stored: null, bannerVisible: true },
    {
      name: 'legacy granted',
      stored: JSON.stringify({ status: 'granted', expiresAt: Date.UTC(2030, 0, 1) }),
      bannerVisible: true,
    },
    {
      name: 'legacy denied',
      stored: JSON.stringify({ status: 'denied', expiresAt: Date.UTC(2030, 0, 1) }),
      bannerVisible: false,
    },
    {
      name: 'current denied',
      stored: JSON.stringify({
        status: 'denied',
        expiresAt: Date.UTC(2030, 0, 1),
        version: consent.CONSENT_VERSION,
      }),
      bannerVisible: false,
    },
  ];

  for (const testCase of cases) {
    const document = createConsentDocument();
    const window = {
      localStorage: createStorage(testCase.stored),
      location: { hostname: 'tarteelhouse.com' },
    };

    consent.init(window, document);

    assert.deepEqual(queuedOpenAiCalls(window), [
      ['consent', false],
      ['init', { pixelId: 'CyfMjLQ5sFcxkzzrRdDeDb' }],
    ], testCase.name);
    assert.equal(window.dataLayer, undefined, `${testCase.name} must not initialize GA4`);
    const banner = document.elements.find(element => element.id === 'analytics-consent');
    assert.equal(banner.hidden, !testCase.bannerVisible, testCase.name);
  }
});

test('accepting later enables OpenAI Ads measurement and GA4', () => {
  const document = createConsentDocument();
  const window = {
    localStorage: createStorage(),
    location: { hostname: 'tarteelhouse.com' },
  };

  consent.init(window, document);
  document.elements.find(element => element.dataset.consentChoice === 'granted').dispatch('click');

  assert.equal(queuedOpenAiCalls(window).at(-1)[1], true);
  assert.equal(window.dataLayer.some(args => args[0] === 'config' && args[1] === consent.MEASUREMENT_ID), true);
});

test('the real consent grant event releases one waiting success conversion after Pixel initialization', () => {
  const token = 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';
  const sessionStorage = createStorage();
  sessionStorage.setItem(analyticsEvents.CONVERSION_STORAGE_KEY, token);
  const document = createConsentDocument();
  const historyCalls = [];
  const window = withWindowEvents({
    history: {
      replaceState(...args) { historyCalls.push(args); },
      state: null,
    },
    localStorage: createStorage(),
    location: {
      href: `https://tarteelhouse.com/success/?booking=${token}`,
      hostname: 'tarteelhouse.com',
      origin: 'https://tarteelhouse.com',
      pathname: '/success/',
    },
    sessionStorage,
  });

  consent.init(window, document);
  analyticsEvents.init(window, document, consent);
  document.elements.find(element => element.dataset.consentChoice === 'granted').dispatch('click');

  assert.deepEqual(queuedOpenAiCalls(window), [
    ['consent', false],
    ['init', { pixelId: 'CyfMjLQ5sFcxkzzrRdDeDb' }],
    ['consent', true],
    ['measure', 'lead_created', { type: 'customer_action' }],
  ]);
  assert.equal(sessionStorage.getItem(analyticsEvents.CONVERSION_STORAGE_KEY), null);
  assert.equal(historyCalls.length, 1);
});

test('rejecting later keeps GA4 unloaded and queues disabled OpenAI Ads measurement', () => {
  const document = createConsentDocument();
  const window = {
    localStorage: createStorage(),
    location: { hostname: 'tarteelhouse.com' },
  };

  consent.init(window, document);
  document.elements.find(element => element.dataset.consentChoice === 'denied').dispatch('click');

  assert.equal(queuedOpenAiCalls(window).at(-1)[1], false);
  assert.equal(window.dataLayer, undefined);
  assert.equal(consent.readSavedPreference(window.localStorage).status, 'denied');
});

test('removes expired storage and preserves a current choice', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const now = Date.UTC(2026, 6, 13, 12);

  values.set(consent.STORAGE_KEY, JSON.stringify({ status: 'granted', expiresAt: now }));
  assert.equal(consent.readSavedPreference(storage, now), null);
  assert.equal(values.has(consent.STORAGE_KEY), false);

  const saved = consent.savePreference(storage, 'denied', now);
  assert.deepEqual(consent.readSavedPreference(storage, now), saved);
});

test('loads and initializes GA4 exactly once', () => {
  const scripts = [];
  const document = {
    head: { appendChild: script => scripts.push(script) },
    createElement: () => ({}),
    querySelector: selector => scripts.find(script => selector.includes(script.src)) || null,
  };
  const window = {};

  consent.loadAnalytics(window, document);
  consent.loadAnalytics(window, document);

  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].async, true);
  assert.equal(scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${consent.MEASUREMENT_ID}`);
  assert.deepEqual(window.dataLayer.map(args => Array.from(args).slice(0, 2)), [
    ['js', window.dataLayer[0][1]],
    ['config', consent.MEASUREMENT_ID],
  ]);
});

test('targets only first-party GA cookie names for deletion', () => {
  assert.deepEqual(
    consent.analyticsCookieNames('_ga=one; session=keep; _ga_ZVLW7QGYR1=two; _gid=keep'),
    ['_ga', '_ga_ZVLW7QGYR1'],
  );
});
