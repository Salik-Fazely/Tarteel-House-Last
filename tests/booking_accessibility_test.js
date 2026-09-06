const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');


const html = fs.readFileSync(path.join(__dirname, '../book-trial/index.html'), 'utf8');
const inlineScripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  .map(match => match[1])
  .filter(script => script.trim());
const source = inlineScripts.at(-1);


function listenerTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
  };
}


function bookingFixture({ valid = true, enhanced = false } = {}) {
  const formEvents = listenerTarget();
  const selectedDays = [
    {
      ...listenerTarget(),
      value: 'mon',
      checked: true,
      setCustomValidity(message) { this.validationMessage = message; },
    },
    {
      ...listenerTarget(),
      value: 'wed',
      checked: true,
      setCustomValidity(message) { this.validationMessage = message; },
    },
  ];
  const submitButton = { disabled: false, textContent: 'Request my free trial' };
  const status = { hidden: true, textContent: '' };
  const windowEvents = listenerTarget();
  let reportValidityCalls = 0;
  let fetchCalls = 0;
  let formDataCalls = 0;
  const location = { href: 'https://www.tarteelhouse.com/book-trial/', origin: 'https://www.tarteelhouse.com', assign(url) { this.href = url; } };
  const fields = {
    'submission-id': { value: '' },
    'response-token': { value: '' },
    'success-redirect': { value: '/success/' },
  };
  const responseFrame = { name: 'trial-booking-response', contentWindow: {} };
  const timers = new Map();
  let nextTimer = 0;
  let randomCalls = 0;
  const form = {
    ...formEvents,
    action: 'https://script.google.com/macros/s/example/exec',
    checkValidity() { return valid; },
    reportValidity() { reportValidityCalls += 1; },
    querySelector(selector) {
      assert.equal(selector, 'button[type="submit"]');
      return submitButton;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="preferred_days"]') return selectedDays;
      if (selector === 'input[name="preferred_days"]:checked') {
        return selectedDays.filter(control => control.checked);
      }
      throw new Error('Unexpected selector: ' + selector);
    },
  };
  function FormDataMock() {
    formDataCalls += 1;
  }
  FormDataMock.prototype.delete = function() {};
  FormDataMock.prototype.append = function() {};

  const document = {
    getElementById(id) {
      return {
        'trial-form': form,
        'trial-form-status': status,
        'trial-booking-response': enhanced ? responseFrame : null,
        ...fields,
      }[id] || null;
    },
    querySelectorAll() { return []; },
  };
  const context = {
    document,
    fetch() {
      fetchCalls += 1;
      return {
        then(callback) {
          callback();
          return { catch() {} };
        },
      };
    },
    FormData: FormDataMock,
    URL,
    window: { ...windowEvents, location,
      crypto: enhanced ? { randomUUID() { randomCalls += 1; return `d5f44c60-bc21-48f6-8d66-${String(randomCalls).padStart(12, '0')}`; } } : null,
      setTimeout(callback) { nextTimer += 1; timers.set(nextTimer, callback); return nextTimer; },
      clearTimeout(timer) { timers.delete(timer); },
    },
  };
  vm.runInNewContext(source, context);

  return {
    dispatchSubmit() {
      const event = {
        prevented: false,
        preventDefault() { this.prevented = true; },
      };
      form.dispatch('submit', event);
      return event;
    },
    dispatchPageShow(event = {}) {
      windowEvents.dispatch('pageshow', event);
    },
    dispatchResponse(overrides = {}) {
      windowEvents.dispatch('message', {
        origin: 'https://abc-script.googleusercontent.com',
        source: { postMessage() {} },
        data: { type: 'tarteelhouse:booking-result', status: 'success',
          submission_id: fields['submission-id'].value, response_token: fields['response-token'].value },
        ...overrides,
      });
    },
    timeout() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    fields,
    form,
    get fetchCalls() { return fetchCalls; },
    get formDataCalls() { return formDataCalls; },
    get reportValidityCalls() { return reportValidityCalls; },
    location,
    selectedDays,
    status,
    submitButton,
  };
}


test('a valid booking submit retains native repeated checkbox values and uses the top-level POST', () => {
  const view = bookingFixture({ valid: true });

  const event = view.dispatchSubmit();

  assert.equal(event.prevented, false, 'the browser must post the form normally');
  assert.equal(view.fetchCalls, 0, 'the form must not submit through fetch');
  assert.equal(view.formDataCalls, 0, 'the browser must retain its native repeated field values');
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/book-trial/', 'the client must not claim success before Apps Script does');
  assert.equal(view.submitButton.disabled, true, 'the first valid submit locks out duplicate submits');
  assert.equal(view.status.hidden, true);

  assert.deepEqual(
    view.selectedDays.map(control => control.value),
    ['mon', 'wed'],
    'native preferred_days entries remain separate for the server to normalize'
  );
});

test('the enhanced form posts to its named frame and waits for a matching Google acknowledgment', () => {
  const view = bookingFixture({ enhanced: true });
  view.dispatchSubmit();
  assert.equal(view.form.target, 'trial-booking-response');
  assert.notEqual(view.fields['submission-id'].value, view.fields['response-token'].value);
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/book-trial/');
  view.dispatchResponse();
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/success/');
});

test('unknown origins, incorrect tokens, missing sources and unsolicited callbacks never confirm a booking', () => {
  const view = bookingFixture({ enhanced: true });
  view.dispatchResponse();
  view.dispatchSubmit();
  for (const origin of ['null', 'https://attacker.example', 'https://script.googleusercontent.com.attacker.example', 'http://script.googleusercontent.com']) {
    view.dispatchResponse({ origin });
  }
  view.dispatchResponse({ source: null });
  view.dispatchResponse({ data: { type: 'tarteelhouse:booking-result', status: 'success',
    submission_id: view.fields['submission-id'].value, response_token: 'wrong' } });
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/book-trial/');
  assert.equal(view.submitButton.disabled, true);
});

test('an acknowledged failure preserves the form and can be retried with the same submission id and a new response token', () => {
  const view = bookingFixture({ enhanced: true });
  view.dispatchSubmit();
  const submissionId = view.fields['submission-id'].value;
  const responseToken = view.fields['response-token'].value;
  view.dispatchResponse({ data: { type: 'tarteelhouse:booking-result', status: 'error',
    submission_id: submissionId, response_token: responseToken, message: 'Missing preferred days.' } });
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/book-trial/');
  assert.equal(view.submitButton.disabled, false);
  assert.match(view.status.textContent, /Missing preferred days/);
  view.dispatchSubmit();
  assert.equal(view.fields['submission-id'].value, submissionId);
  assert.notEqual(view.fields['response-token'].value, responseToken);
});

test('a timeout preserves input, enables retry, and a late callback from the old attempt cannot settle the retry', () => {
  const view = bookingFixture({ enhanced: true });
  view.dispatchSubmit();
  const stale = { type: 'tarteelhouse:booking-result', status: 'success',
    submission_id: view.fields['submission-id'].value, response_token: view.fields['response-token'].value };
  view.timeout();
  assert.equal(view.submitButton.disabled, false);
  assert.match(view.status.textContent, /confirm/i);
  view.dispatchSubmit();
  view.dispatchResponse({ data: stale });
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/book-trial/');
  view.dispatchResponse();
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/success/');
  view.location.href = 'https://www.tarteelhouse.com/book-trial/';
  view.dispatchResponse();
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/book-trial/', 'response is consumed once');
});


test('a duplicate valid submit is prevented after the native submission has begun', () => {
  const view = bookingFixture({ valid: true });

  const first = view.dispatchSubmit();
  const duplicate = view.dispatchSubmit();

  assert.equal(first.prevented, false);
  assert.equal(duplicate.prevented, true);
  assert.equal(view.fetchCalls, 0);
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/book-trial/');
});


test('a browser back-forward cache restore unlocks the form for a genuine retry', () => {
  const view = bookingFixture({ valid: true });

  view.dispatchSubmit();
  view.dispatchPageShow({ persisted: true });
  const retry = view.dispatchSubmit();

  assert.equal(retry.prevented, false);
  assert.equal(view.submitButton.disabled, true);
  assert.equal(view.submitButton.textContent, 'Sending...');
});


test('an invalid booking submit reports native validity and never creates a success path', () => {
  const view = bookingFixture({ valid: false });

  const event = view.dispatchSubmit();

  assert.equal(event.prevented, true);
  assert.equal(view.reportValidityCalls, 1);
  assert.equal(view.fetchCalls, 0);
  assert.equal(view.formDataCalls, 0);
  assert.equal(view.location.href, 'https://www.tarteelhouse.com/book-trial/');
  assert.equal(view.submitButton.disabled, false);
  assert.equal(view.status.hidden, true);
});
