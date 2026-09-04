const test = require('node:test');
const assert = require('node:assert/strict');

const analyticsEvents = require('../assets/js/analytics-events.js');
const consent = require('../assets/js/consent.js');

function createEventTarget(properties = {}) {
  const listeners = new Map();

  return Object.assign(properties, {
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatch(type, event = {}) {
      if (!Object.hasOwn(event, 'defaultPrevented')) event.defaultPrevented = false;
      if (typeof event.preventDefault !== 'function') {
        event.preventDefault = () => {
          event.defaultPrevented = true;
        };
      }
      (listeners.get(type) || []).forEach(listener => listener.call(this, event));
      return event;
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  });
}

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    entries: () => Array.from(values.entries()),
  };
}

function createEnvironment({
  preference = 'missing',
  valid = true,
  withForm = true,
  withGtag = true,
  withOaiq = false,
  oaiq,
  pathname = '/pricing/',
  href,
  sessionStorage = createStorage(),
} = {}) {
  const calls = [];
  const localStorage = createStorage();
  const historyCalls = [];
  const timeline = [];

  if (preference === 'granted' || preference === 'denied') {
    consent.savePreference(localStorage, preference);
  } else if (preference === 'expired') {
    localStorage.setItem(consent.STORAGE_KEY, JSON.stringify({ status: 'granted', expiresAt: 1 }));
  }

  const locationHref = href || `https://www.tarteelhouse.com${pathname}`;
  const location = new URL(locationHref);
  let randomCalls = 0;
  const window = createEventTarget({
    __tarteelHouseGa4Initialized: true,
    localStorage,
    sessionStorage,
    crypto: {
      getRandomValues(values) {
        randomCalls += 1;
        for (let index = 0; index < values.length; index += 1) values[index] = index + 1;
        return values;
      },
      randomUUID() {
        randomCalls += 1;
        return 'd5f44c60-bc21-48f6-8d66-6e0b1e0dc693';
      },
    },
    location: {
      href: location.href,
      origin: location.origin,
      pathname: location.pathname,
      search: location.search,
    },
    history: {
      replaceState(...args) {
        historyCalls.push(args);
        timeline.push('replace');
      },
    },
  });
  if (withGtag) window.gtag = (...args) => calls.push(args);
  if (withOaiq || oaiq) {
    window.oaiq = (...args) => {
      timeline.push('oaiq');
      if (oaiq) return oaiq(...args);
      calls.push(args);
    };
  }

  let form;
  const successRedirect = { name: 'success_redirect', value: '/success/' };
  form = createEventTarget({
    id: 'trial-form',
    valid,
    checkValidity() {
      return this.valid;
    },
    contains(control) {
      return control?.form === form;
    },
    querySelector(selector) {
      return selector === 'input[name="success_redirect"]' ? successRedirect : null;
    },
  });

  const document = createEventTarget({
    getElementById(id) {
      return withForm && id === 'trial-form' ? form : null;
    },
  });

  analyticsEvents.init(window, document, consent);
  return {
    calls,
    document,
    form,
    historyCalls,
    localStorage,
    randomCalls: () => randomCalls,
    sessionStorage,
    successRedirect,
    timeline,
    window,
  };
}

function submittedConversion() {
  const environment = createEnvironment({ preference: 'granted' });
  const event = environment.form.dispatch('submit');
  const [[storageKey, token]] = environment.sessionStorage.entries();
  return {
    event,
    redirect: new URL(environment.successRedirect.value),
    storageKey,
    token,
    ...environment,
  };
}

function createCta({
  href = '/book-trial/?email=visitor%40example.com#form',
  tagName = 'A',
  text = '  Book  a\nFree Trial  ',
} = {}) {
  const element = {
    dataset: tagName === 'BUTTON' ? { href } : {},
    getAttribute(name) {
      if (name === 'href' && tagName === 'A') return href;
      if (name === 'data-href' && tagName === 'BUTTON') return href;
      return null;
    },
    innerText: text,
    tagName,
    textContent: text,
  };
  return {
    element,
    target: { closest: () => element },
  };
}

function createControl(form, { disabled = false, readOnly = false, tagName = 'INPUT', type = 'text' } = {}) {
  return {
    disabled,
    form,
    name: 'child_name',
    readOnly,
    tagName,
    type,
    value: 'Private Child Name',
  };
}

test('exports a reusable analytics event initializer', () => {
  assert.equal(typeof analyticsEvents.init, 'function');
});

test('sends no events when consent is missing, denied, or expired', () => {
  for (const preference of ['missing', 'denied', 'expired']) {
    const { calls, document } = createEnvironment({ preference });
    document.dispatch('click', { target: createCta().target });
    assert.deepEqual(calls, [], preference);
  }
});

test('sends one privacy-safe CTA event without blocking navigation', () => {
  const { calls, document, window } = createEnvironment({ preference: 'granted' });
  analyticsEvents.init(window, document, consent);
  const event = document.dispatch('click', { target: createCta().target });

  assert.equal(event.defaultPrevented, false);
  assert.deepEqual(calls, [[
    'event',
    'trial_cta_click',
    {
      source_path: '/pricing/',
      destination_path: '/book-trial/',
      cta_text: 'Book a Free Trial',
    },
  ]]);
});

test('caps normalized CTA text at 100 characters without adding URL or form PII', () => {
  const { calls, document, form } = createEnvironment({ preference: 'granted' });
  const normalizedPrefix = `${'A'.repeat(60)} ${'B'.repeat(60)}`;
  form.value = 'Private Child Name';

  document.dispatch('click', {
    target: createCta({ text: `  ${'A'.repeat(60)}\n${'B'.repeat(60)}  ` }).target,
  });

  const parameters = calls[0][2];
  assert.equal(parameters.cta_text.length, 100);
  assert.equal(parameters.cta_text, normalizedPrefix.slice(0, 100));
  assert.deepEqual(Object.keys(parameters), ['source_path', 'destination_path', 'cta_text']);
  assert.doesNotMatch(JSON.stringify(parameters), /visitor|Private Child Name/);
});

test('tracks an internal button that leads to the canonical booking page', () => {
  const { calls, document } = createEnvironment({ preference: 'granted' });
  document.dispatch('click', { target: createCta({ tagName: 'BUTTON' }).target });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'trial_cta_click');
});

test('does not queue a pre-consent CTA click and checks later denial', () => {
  const { calls, document, localStorage } = createEnvironment();
  const cta = createCta();

  document.dispatch('click', { target: cta.target });
  consent.savePreference(localStorage, 'granted');
  assert.deepEqual(calls, []);

  document.dispatch('click', { target: cta.target });
  consent.savePreference(localStorage, 'denied');
  document.dispatch('click', { target: cta.target });
  assert.equal(calls.length, 1);
});

test('does not create or initialize an analytics implementation', () => {
  const { document, window } = createEnvironment({ preference: 'granted', withGtag: false });
  document.dispatch('click', { target: createCta().target });

  assert.equal(window.gtag, undefined);
  assert.equal(window.dataLayer, undefined);
});

test('form start accepts input, change, or focus on an editable control', () => {
  for (const type of ['input', 'change', 'focusin']) {
    const { calls, form } = createEnvironment({ preference: 'granted' });
    form.dispatch(type, { target: createControl(form) });

    assert.deepEqual(calls, [[
      'event',
      'trial_form_start',
      { source_path: '/pricing/', form_id: 'trial-form' },
    ]], type);
  }
});

test('form start waits for a new post-consent interaction and fires at most once', () => {
  const { calls, form, localStorage } = createEnvironment();
  const control = createControl(form);

  form.dispatch('input', { target: control });
  consent.savePreference(localStorage, 'granted');
  assert.deepEqual(calls, []);

  form.dispatch('change', { target: control });
  form.dispatch('focusin', { target: control });
  assert.deepEqual(calls, [[
    'event',
    'trial_form_start',
    { source_path: '/pricing/', form_id: 'trial-form' },
  ]]);
});

test('form start ignores hidden, button, disabled, and read-only controls', () => {
  const { calls, form } = createEnvironment({ preference: 'granted' });
  const controls = [
    createControl(form, { type: 'hidden' }),
    createControl(form, { tagName: 'BUTTON' }),
    createControl(form, { disabled: true }),
    createControl(form, { readOnly: true }),
  ];

  controls.forEach(target => form.dispatch('focusin', { target }));
  assert.deepEqual(calls, []);
});

test('submit attempt fires only for a valid submit, at most once, without preventing it', () => {
  const { calls, form } = createEnvironment({ preference: 'granted', valid: false });

  const invalidEvent = form.dispatch('submit');
  assert.equal(invalidEvent.defaultPrevented, false);
  assert.deepEqual(calls, []);

  form.valid = true;
  const validEvent = form.dispatch('submit');
  form.dispatch('submit');

  assert.equal(validEvent.defaultPrevented, false);
  assert.deepEqual(calls, [[
    'event',
    'trial_form_submit_attempt',
    { source_path: '/pricing/', form_id: 'trial-form' },
  ]]);
});

test('a valid form submit creates an opaque, session-bound same-origin success redirect without preventing native submission', () => {
  const { event, redirect, randomCalls, sessionStorage, storageKey, token } = submittedConversion();

  assert.equal(event.defaultPrevented, false);
  assert.equal(randomCalls(), 1);
  assert.equal(sessionStorage.entries().length, 1);
  assert.equal(typeof storageKey, 'string');
  assert.equal(typeof token, 'string');
  assert.notEqual(token, '');
  assert.equal(redirect.origin, 'https://www.tarteelhouse.com');
  assert.equal(redirect.pathname, '/success/');
  assert.equal(redirect.searchParams.size, 1);
  assert.equal([...redirect.searchParams.values()][0], token);
  assert.doesNotMatch(JSON.stringify({ storageKey, token, redirect: redirect.href }), /Private Child Name/);
});

test('validation failure creates no conversion marker and a repeated submit event cannot create a second marker', () => {
  const invalid = createEnvironment({ preference: 'granted', valid: false });
  invalid.form.dispatch('submit');

  assert.deepEqual(invalid.sessionStorage.entries(), []);
  assert.equal(invalid.successRedirect.value, '/success/');
  assert.equal(invalid.randomCalls(), 0);

  const valid = createEnvironment({ preference: 'granted' });
  valid.form.dispatch('submit');
  const firstRedirect = valid.successRedirect.value;
  valid.form.dispatch('submit');

  assert.equal(valid.randomCalls(), 1);
  assert.equal(valid.sessionStorage.entries().length, 1);
  assert.equal(valid.successRedirect.value, firstRedirect);
});

test('returning to a cached form after success prepares a new marker for a genuinely new submission', () => {
  const submitted = submittedConversion();
  submitted.sessionStorage.removeItem(submitted.storageKey);

  submitted.window.dispatch('pageshow', { persisted: true });
  submitted.form.dispatch('submit');

  assert.equal(submitted.randomCalls(), 2);
  assert.equal(submitted.sessionStorage.entries().length, 1);
  assert.equal(
    new URL(submitted.successRedirect.value).searchParams.get('booking'),
    submitted.sessionStorage.entries()[0][1],
  );
});

test('the success page measures a lead only when its URL token exactly matches the session marker', () => {
  const submitted = submittedConversion();
  const success = createEnvironment({
    preference: 'granted',
    withForm: false,
    withOaiq: true,
    pathname: '/success/',
    href: submitted.redirect.href,
    sessionStorage: submitted.sessionStorage,
  });

  assert.deepEqual(success.calls, [[
    'measure',
    'lead_created',
    { type: 'customer_action' },
  ]]);
  assert.equal(success.sessionStorage.getItem(submitted.storageKey), null);
  assert.equal(success.historyCalls.length, 1);
  assert.equal(new URL(success.historyCalls[0][2], success.window.location.origin).pathname, '/success/');
  assert.equal(new URL(success.historyCalls[0][2], success.window.location.origin).search, '');
  assert.deepEqual(success.timeline, ['replace', 'oaiq']);
});

test('a direct success visit or a mismatched success token never measures a lead', () => {
  const direct = createEnvironment({
    preference: 'granted',
    withForm: false,
    withOaiq: true,
    pathname: '/success/',
  });
  const submitted = submittedConversion();
  const mismatchedRedirect = new URL(submitted.redirect.href);
  mismatchedRedirect.searchParams.set([...mismatchedRedirect.searchParams.keys()][0], 'wrong-token');
  const mismatched = createEnvironment({
    preference: 'granted',
    withForm: false,
    withOaiq: true,
    href: mismatchedRedirect.href,
    sessionStorage: submitted.sessionStorage,
  });

  assert.deepEqual(direct.calls, []);
  assert.deepEqual(mismatched.calls, []);
});

test('a denied consent decision consumes and cleans an otherwise valid success marker without measuring', () => {
  const submitted = submittedConversion();
  const success = createEnvironment({
    preference: 'denied',
    withForm: false,
    withOaiq: true,
    href: submitted.redirect.href,
    sessionStorage: submitted.sessionStorage,
  });

  assert.deepEqual(success.calls, []);
  assert.equal(success.sessionStorage.getItem(submitted.storageKey), null);
  assert.equal(success.historyCalls.length, 1);
  assert.equal(new URL(success.historyCalls[0][2], success.window.location.origin).search, '');
});

test('an unknown consent decision waits for a consent change, then measures once on grant or consumes on denial', () => {
  const grantedSubmission = submittedConversion();
  const granted = createEnvironment({
    withForm: false,
    withOaiq: true,
    href: grantedSubmission.redirect.href,
    sessionStorage: grantedSubmission.sessionStorage,
  });

  assert.deepEqual(granted.calls, []);
  assert.equal(granted.sessionStorage.getItem(grantedSubmission.storageKey), grantedSubmission.token);
  assert.deepEqual(granted.historyCalls, []);

  consent.savePreference(granted.localStorage, 'granted');
  granted.window.dispatch('tarteelhouse:measurement-consent-change', { detail: { status: 'granted' } });
  granted.window.dispatch('tarteelhouse:measurement-consent-change', { detail: { status: 'granted' } });
  analyticsEvents.init(granted.window, granted.document, consent);

  assert.deepEqual(granted.calls, [[
    'measure',
    'lead_created',
    { type: 'customer_action' },
  ]]);
  assert.equal(granted.sessionStorage.getItem(grantedSubmission.storageKey), null);
  assert.equal(granted.historyCalls.length, 1);

  const deniedSubmission = submittedConversion();
  const denied = createEnvironment({
    withForm: false,
    withOaiq: true,
    href: deniedSubmission.redirect.href,
    sessionStorage: deniedSubmission.sessionStorage,
  });
  consent.savePreference(denied.localStorage, 'denied');
  denied.window.dispatch('tarteelhouse:measurement-consent-change', { detail: { status: 'denied' } });

  assert.deepEqual(denied.calls, []);
  assert.equal(denied.sessionStorage.getItem(deniedSubmission.storageKey), null);
  assert.equal(denied.historyCalls.length, 1);

  const refreshed = createEnvironment({
    preference: 'granted',
    withForm: false,
    withOaiq: true,
    href: grantedSubmission.redirect.href,
    sessionStorage: granted.sessionStorage,
  });
  assert.deepEqual(refreshed.calls, []);
});

test('a pixel error cannot interrupt success-marker consumption or URL cleanup', () => {
  const submitted = submittedConversion();
  let success;

  assert.doesNotThrow(() => {
    success = createEnvironment({
      preference: 'granted',
      withForm: false,
      href: submitted.redirect.href,
      oaiq() {
        throw new Error('pixel unavailable');
      },
      sessionStorage: submitted.sessionStorage,
    });
  });

  assert.equal(success.sessionStorage.getItem(submitted.storageKey), null);
  assert.equal(success.historyCalls.length, 1);
  assert.equal(new URL(success.historyCalls[0][2], success.window.location.origin).search, '');
});
