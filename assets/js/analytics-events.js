/* Tarteel House privacy-safe booking funnel and conversion events. */
(function (factory) {
  const analyticsEvents = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = analyticsEvents;
    return;
  }

  const start = () => analyticsEvents.init(window, document, window.TarteelHouseConsent);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}(function () {
  'use strict';

  const BOOKING_PATH = '/book-trial/';
  const SUCCESS_PATH = '/success/';
  const FORM_ID = 'trial-form';
  const INIT_FLAG = '__tarteelHouseAnalyticsEventsInitialized';
  const CONVERSION_STORAGE_KEY = 'tarteelhouse.trialConversionToken';
  const CONVERSION_QUERY_PARAM = 'booking';
  const CONSENT_EVENT = 'tarteelhouse:measurement-consent-change';
  const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const NON_EDITABLE_INPUT_TYPES = new Set(['button', 'hidden', 'image', 'reset', 'submit']);

  function consentStatus(win, consentApi) {
    if (!consentApi || typeof consentApi.readSavedPreference !== 'function') return null;

    let storage;
    try {
      storage = win.localStorage;
    } catch (error) {
      return null;
    }

    const preference = consentApi.readSavedPreference(storage);
    return preference?.status || null;
  }

  function hasGrantedConsent(win, consentApi) {
    return consentStatus(win, consentApi) === 'granted';
  }

  function sendEvent(win, consentApi, eventName, parameters) {
    if (!hasGrantedConsent(win, consentApi)) return false;
    if (!win.__tarteelHouseGa4Initialized || typeof win.gtag !== 'function') return false;

    try {
      win.gtag('event', eventName, parameters);
      return true;
    } catch (error) {
      return false;
    }
  }

  function normalizedBookingPath(pathname) {
    let normalized = pathname.replace(/\/index\.html$/i, '/');
    if (normalized.length > 1 && !normalized.endsWith('/')) normalized += '/';
    return normalized;
  }

  function ctaDestination(element) {
    if (element.tagName === 'A') return element.getAttribute('href');
    if (element.tagName === 'BUTTON') {
      return element.getAttribute('formaction') || element.getAttribute('data-href');
    }
    return null;
  }

  function bookingCta(win, target) {
    if (!target || typeof target.closest !== 'function') return null;

    const element = target.closest('a[href], button[formaction], button[data-href]');
    if (!element) return null;

    try {
      const destination = new URL(ctaDestination(element), win.location.href);
      if (destination.origin !== win.location.origin) return null;
      return normalizedBookingPath(destination.pathname) === BOOKING_PATH ? element : null;
    } catch (error) {
      return null;
    }
  }

  function normalizedCtaText(element) {
    const text = typeof element.innerText === 'string' ? element.innerText : element.textContent;
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }

  function isEditableControl(form, control) {
    if (!control || !form.contains(control) || control.disabled || control.readOnly) return false;

    const tagName = control.tagName?.toUpperCase();
    if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
    if (tagName !== 'INPUT') return false;
    return !NON_EDITABLE_INPUT_TYPES.has(String(control.type || 'text').toLowerCase());
  }

  function sessionStorageFor(win) {
    try {
      return win.sessionStorage || null;
    } catch (error) {
      return null;
    }
  }

  function createConversionToken(win) {
    const crypto = win?.crypto;
    if (!crypto) return null;

    try {
      if (typeof crypto.randomUUID === 'function') {
        const token = crypto.randomUUID();
        if (TOKEN_PATTERN.test(token)) return token.toLowerCase();
      }

      if (typeof crypto.getRandomValues !== 'function') return null;
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
      ].join('-');
    } catch (error) {
      return null;
    }
  }

  function prepareSuccessRedirect(win, form) {
    const redirect = form.querySelector('input[name="success_redirect"]');
    const storage = sessionStorageFor(win);
    const token = createConversionToken(win);
    if (!redirect || !storage || !token) return false;

    try {
      const destination = new URL(SUCCESS_PATH, win.location.origin);
      destination.searchParams.set(CONVERSION_QUERY_PARAM, token);
      storage.setItem(CONVERSION_STORAGE_KEY, token);
      redirect.value = destination.href;
      return true;
    } catch (error) {
      try {
        storage.removeItem(CONVERSION_STORAGE_KEY);
      } catch (storageError) {
        // A stale marker cannot be trusted without the matching redirect URL.
      }
      return false;
    }
  }

  function resetPreparedConversion(win, form) {
    const storage = sessionStorageFor(win);
    if (storage) {
      try {
        storage.removeItem(CONVERSION_STORAGE_KEY);
      } catch (error) {
        // A new submission will overwrite the marker if storage is available.
      }
    }

    const redirect = form.querySelector('input[name="success_redirect"]');
    if (!redirect) return;

    try {
      redirect.value = new URL(SUCCESS_PATH, win.location.origin).href;
    } catch (error) {
      redirect.value = SUCCESS_PATH;
    }
  }

  function successMarker(win) {
    if (normalizedBookingPath(win.location.pathname) !== SUCCESS_PATH) return null;

    const storage = sessionStorageFor(win);
    if (!storage) return null;

    try {
      const destination = new URL(win.location.href);
      const token = destination.searchParams.get(CONVERSION_QUERY_PARAM);
      if (!token || !TOKEN_PATTERN.test(token)) return null;
      if (storage.getItem(CONVERSION_STORAGE_KEY) !== token) return null;
      return { storage, token };
    } catch (error) {
      return null;
    }
  }

  function consumeMarker(marker) {
    try {
      marker.storage.removeItem(CONVERSION_STORAGE_KEY);
      return marker.storage.getItem(CONVERSION_STORAGE_KEY) === null;
    } catch (error) {
      return false;
    }
  }

  function cleanSuccessUrl(win) {
    try {
      win.history.replaceState(win.history.state, '', SUCCESS_PATH);
    } catch (error) {
      // Marker consumption still prevents a refresh from firing again.
    }
  }

  function handleSuccessfulLead(win, consentApi) {
    const marker = successMarker(win);
    if (!marker) return;

    let settled = false;
    const settle = () => {
      if (settled) return;
      const status = consentStatus(win, consentApi);
      if (status !== 'granted' && status !== 'denied') return;

      settled = true;
      const consumed = consumeMarker(marker);
      cleanSuccessUrl(win);
      if (status !== 'granted' || !consumed || typeof win.oaiq !== 'function') return;

      try {
        win.oaiq('measure', 'lead_created', { type: 'customer_action' });
      } catch (error) {
        // Conversion reporting must not interrupt the successful booking page.
      }
    };

    settle();
    if (!settled && typeof win.addEventListener === 'function') {
      win.addEventListener(CONSENT_EVENT, settle);
    }
  }

  function init(win, doc, consentApi) {
    if (!win || !doc || win[INIT_FLAG]) return;
    win[INIT_FLAG] = true;

    doc.addEventListener('click', event => {
      const cta = bookingCta(win, event.target);
      if (!cta) return;

      sendEvent(win, consentApi, 'trial_cta_click', {
        source_path: win.location.pathname,
        destination_path: BOOKING_PATH,
        cta_text: normalizedCtaText(cta),
      });
    });

    handleSuccessfulLead(win, consentApi);

    const form = doc.getElementById(FORM_ID);
    if (!form) return;

    let formStarted = false;
    let submitAttempted = false;
    let conversionPrepared = false;
    const handleFormStart = event => {
      if (formStarted || !isEditableControl(form, event.target)) return;
      formStarted = sendEvent(win, consentApi, 'trial_form_start', {
        source_path: win.location.pathname,
        form_id: FORM_ID,
      });
    };

    ['input', 'change', 'focusin'].forEach(type => form.addEventListener(type, handleFormStart));
    if (typeof win.addEventListener === 'function') {
      win.addEventListener('pageshow', event => {
        if (!event.persisted) return;

        formStarted = false;
        submitAttempted = false;
        conversionPrepared = false;
        resetPreparedConversion(win, form);
      });
    }

    form.addEventListener('submit', () => {
      if (typeof form.checkValidity === 'function' && !form.checkValidity()) return;

      if (!conversionPrepared) {
        conversionPrepared = prepareSuccessRedirect(win, form);
      }

      if (submitAttempted) return;

      submitAttempted = sendEvent(win, consentApi, 'trial_form_submit_attempt', {
        source_path: win.location.pathname,
        form_id: FORM_ID,
      });
    });
  }

  return {
    BOOKING_PATH,
    CONVERSION_QUERY_PARAM,
    CONVERSION_STORAGE_KEY,
    FORM_ID,
    SUCCESS_PATH,
    init,
  };
}));
