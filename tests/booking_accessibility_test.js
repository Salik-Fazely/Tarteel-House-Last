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


function bookingFixture({ valid = true } = {}) {
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
  const location = { href: 'https://www.tarteelhouse.com/book-trial/' };
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
        'success-redirect': null,
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
    window: { ...windowEvents, location },
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
