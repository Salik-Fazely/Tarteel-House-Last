/**
 * Tarteel House — booking submission handler.
 *
 * Source of truth for the Apps Script Web App that receives form posts
 * from book-trial. Copy all apps-script/*.gs files into the bound project;
 * see README.md for deployment and optional recovery-trigger activation.
 *
 * The form URL on the site does NOT change when you redeploy the same
 * project — only the script behind it is updated.
 */

// ---------------------------------------------------------------------------
// Config — change the email below to wherever bookings should be sent.
// ---------------------------------------------------------------------------
const CONFIG = {
  SPREADSHEET_ID: '1xLqKF1DGBGdknlGbTyulDxDYgiVm6vh0MkkXSaJ90Kc',
  SHEET_NAME: 'Bookings',
  NOTIFICATION_EMAIL: 'hello@tarteelhouse.com',
  SUCCESS_REDIRECT: 'https://www.tarteelhouse.com/success/',
  ALLOWED_REDIRECT_HOSTS: [
    'tarteelhouse.com',
    'www.tarteelhouse.com'
  ]
};

// Column order used when writing a new booking row. If the sheet already
// has a header row, any missing columns below are appended to the right
// so existing data is never disturbed.
const HEADERS = [
  'timestamp',
  'source',
  'parent_name',
  'child_name',
  'child_age',
  'quran_level',
  'session_language',
  'country',
  'email',
  'whatsapp',
  'preferred_days',
  'preferred_time',
  'city_region',
  'notes',
  'consent',
  // Operational columns — the founder fills these in manually.
  'status',
  'assigned_teacher',
  'follow_up_date',
  'internal_notes',
  'submission_id',
  'notification_status',
  'submission_fingerprint',
  'notification_attempts',
  'notification_last_attempt_at',
  'notification_next_attempt_at',
  'notification_error_code'
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const RETRY_CONFLICT_MESSAGE = 'Your original request was already received. These changes were not saved. Please message us on WhatsApp to correct your booking details.';
const LEGACY_RETRY_MESSAGE = 'Your original request was already received, but we could not verify these details. Please message us on WhatsApp before resubmitting.';
const BOOKING_DETAIL_FIELDS = [
  'source', 'parent_name', 'child_name', 'child_age', 'quran_level',
  'session_language', 'country', 'email', 'whatsapp', 'preferred_days',
  'preferred_time', 'city_region', 'notes', 'consent'
];

// Limits apply before trimming. Notes count logical line breaks and also cap
// raw wire text at twice their limit because form POSTs serialize LF as CRLF.
const FIELD_LIMITS = {
  parent_name: 100,
  child_name: 100,
  city_region: 120,
  email: 254,
  whatsapp: 40,
  notes: 2000,
  source: 100,
  child_age: 2,
  quran_level: 32,
  session_language: 16,
  country: 32,
  preferred_time: 16,
  preferred_days: 64,
  consent: 3,
  submission_id: 36,
  response_token: 36,
  success_redirect: 256
};

const REQUIRED_FIELDS = [
  { name: 'parent_name',      label: 'parent name' },
  { name: 'child_name',       label: 'child name' },
  { name: 'child_age',        label: 'child age' },
  { name: 'quran_level',      label: 'current Qur\'an level' },
  { name: 'session_language', label: 'preferred session language' },
  { name: 'country',          label: 'country' },
  { name: 'email',            label: 'email address' },
  { name: 'whatsapp',         label: 'WhatsApp number' },
  { name: 'preferred_days',   label: 'preferred days' },
  { name: 'preferred_time',   label: 'preferred time of day' },
  { name: 'city_region',      label: 'city / region' }
];

const ALLOWED_VALUES = {
  country: [
    'Germany',
    'France',
    'Netherlands',
    'Belgium',
    'Sweden',
    'Norway',
    'Denmark',
    'Switzerland',
    'Austria',
    'United Kingdom',
    'Ireland',
    'Spain',
    'Italy',
    'Canada',
    'United States',
    'Other'
  ],
  child_age: [
    '5', '6', '7', '8', '9', '10', '11',
    '12', '13', '14', '15', '16'
  ],
  quran_level: [
    'complete-beginner',
    'knows-arabic-letters',
    'reading-short-words',
    'reading-independently'
  ],
  session_language: ['english', 'arabic', 'turkish', 'persian'],
  preferred_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  preferred_time: ['morning', 'afternoon', 'evening']
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
function doPost(e) {
  // Extract only bounded response capabilities before inspecting a large body.
  let params = {};
  ['submission_id', 'response_token', 'success_redirect'].forEach(function (name) {
    const value = e && e.parameter && e.parameter[name];
    if (value != null && String(value).length <= FIELD_LIMITS[name]) params[name] = value;
  });
  let lock;
  try {
    if (oversizedBookingRequest_(e)) {
      return htmlError_(['This booking request is too large. Please shorten it and try again.'],
        'Booking request could not be completed', null, params);
    }
    params = requestParams_(e);

    // Honeypot: real users never fill this field.
    if (params.website_field) {
      return htmlError_(
        ['This submission could not be accepted.'],
        'Booking request could not be completed',
        'Please go back and submit the form again.', params
      );
    }

    const validation = validateBooking_(params);
    if (!validation.valid) {
      return htmlError_(validation.errors, null, null, params);
    }

    const fingerprint = submissionFingerprint_(params);
    params.whatsapp = normalizeWhatsApp_(params.whatsapp);
    // Pure request validation must not wait for the global booking lock.
    // Keep lookup, write and notification state under the same lock.
    lock = LockService.getScriptLock();
    lock.waitLock(10000);
    const sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let rowNumber = findSubmissionRow_(sheet, headers, params.submission_id);
    const existingSubmission = rowNumber !== 0;
    if (!rowNumber) {
      if (!reserveBookingCapacity_(params, Date.now())) {
        return htmlError_(['There have been too many new requests. This booking was not saved. Please wait and try again, or message us on WhatsApp.'],
          'Booking request could not be completed', null, params);
      }
      appendRow_(sheet, params, fingerprint);
      SpreadsheetApp.flush();
      rowNumber = sheet.getLastRow();
    }
    const saved = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    if (existingSubmission) {
      const savedFingerprint = saved[headers.indexOf('submission_fingerprint')];
      if (!FINGERPRINT_PATTERN.test(String(savedFingerprint || ''))) {
        return htmlError_([LEGACY_RETRY_MESSAGE], 'Booking details could not be verified',
          LEGACY_RETRY_MESSAGE, params);
      }
      if (savedFingerprint !== fingerprint) {
        return htmlError_([RETRY_CONFLICT_MESSAGE], 'Booking details were not updated',
          RETRY_CONFLICT_MESSAGE, params);
      }
    }
    // A saved row is received even when its notification must recover later.
    try {
      attemptNotification_(sheet, headers, rowNumber, Date.now());
    } catch (notificationError) {
      console.error('Saved booking notification needs review; check the Bookings sheet and Apps Script executions.');
    }

    return htmlRedirect_(params);
  } catch (err) {
    console.error('Booking submission failed before acknowledgment; review Apps Script executions.');
    return htmlError_(
      ['We could not complete your booking request right now. Please try again, or message us on WhatsApp if the problem continues.'],
      'Booking request could not be completed',
      'Please try again using the same form. If the problem continues, contact us directly on WhatsApp.', params
    );
  } finally {
    if (lock) lock.releaseLock();
  }
}

// Native HTML forms submit checkbox values as repeated parameters. Apps
// Script exposes the first value in e.parameter and every value in
// e.parameters, so join the preferred days before validation and storage.
function requestParams_(e) {
  const source = (e && e.parameter) || {};
  const params = {};
  BOOKING_DETAIL_FIELDS.concat(['submission_id', 'response_token', 'success_redirect', 'website_field']).forEach(function (name) {
    if (Object.prototype.hasOwnProperty.call(source, name)) params[name] = source[name];
  });

  const repeatedDays = e && e.parameters && e.parameters.preferred_days;
  if (Array.isArray(repeatedDays)) {
    // Retain raw padding until validation has enforced the list's length bound.
    params.preferred_days = repeatedDays.map(function (value) { return String(value); }).join(',');
  }
  return params;
}

// Optional: also allow GET to the Web App URL to return a friendly page
// instead of a raw Apps Script error, in case someone pastes the URL.
function doGet() {
  return HtmlService
    .createHtmlOutput('<p>Tarteel House booking endpoint.</p>');
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------
function getOrCreateSheet_() {
  // Web-app executions do not have the bound editor's active spreadsheet.
  const spreadsheetId = String(CONFIG.SPREADSHEET_ID || '').trim();
  if (!spreadsheetId) throw new Error('Booking spreadsheet ID is not configured.');
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();

  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }

  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = HEADERS.filter(function (h) {
    return existing.indexOf(h) === -1;
  });

  if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    sheet.getRange(1, 1, 1, lastCol + missing.length).setFontWeight('bold');
  }
  if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
}

function appendRow_(sheet, params, fingerprint) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(function (h) {
    if (h === 'timestamp')        return new Date();
    if (h === 'status')           return 'New lead';
    if (h === 'assigned_teacher') return '';
    if (h === 'follow_up_date')   return '';
    if (h === 'internal_notes')   return '';
    if (h === 'notification_status') return 'Pending';
    if (h === 'notification_attempts') return 0;
    if (h === 'submission_fingerprint') return fingerprint;
    if (h === 'submission_id' || BOOKING_DETAIL_FIELDS.indexOf(h) !== -1) {
      return literalSheetValue_(params[h] != null ? params[h] : '');
    }
    return '';
  });
  sheet.appendRow(row);
}

function findSubmissionRow_(sheet, headers, submissionId) {
  if (!UUID_PATTERN.test(String(submissionId || ''))) return 0;
  const count = sheet.getLastRow() - 1;
  if (count < 1) return 0;
  const column = headers.indexOf('submission_id') + 1;
  const values = sheet.getRange(2, column, count, 1).getValues();
  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0]).toLowerCase() === String(submissionId).toLowerCase()) return index + 2;
  }
  return 0;
}

function literalSheetValue_(value) {
  const text = String(value);
  // Preserve phone prefixes and prevent formula interpretation in Sheets/exports.
  return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
}

// ---------------------------------------------------------------------------
// Validation helpers.
// ---------------------------------------------------------------------------
function validateBooking_(params) {
  const errors = [];

  Object.keys(FIELD_LIMITS).forEach(function (name) {
    const raw = String(params[name] == null ? '' : params[name]);
    const limit = FIELD_LIMITS[name];
    const tooLong = name === 'notes' ?
      raw.length > limit * 2 || raw.replace(/\r\n?/g, '\n').length > limit : raw.length > limit;
    if (tooLong) {
      errors.push('A booking field exceeds its permitted length. Please shorten it and try again.');
    }
    const controls = name === 'notes' ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
    if (controls.test(raw)) {
      errors.push('A booking field contains invalid characters. Please check the details and try again.');
    }
  });
  if (errors.length) return { valid: false, errors: errors };

  REQUIRED_FIELDS.forEach(function (field) {
    if (!hasValue_(params[field.name])) {
      errors.push('Missing ' + field.label + '.');
    }
  });

  if (params.consent !== 'yes') {
    errors.push('Privacy consent is required.');
  }

  ['submission_id', 'response_token'].forEach(function (name) {
    if (hasValue_(params[name]) && !UUID_PATTERN.test(String(params[name]))) {
      errors.push('The request could not be verified. Please reload the booking form.');
    }
  });

  if (hasValue_(params.email) && !isValidEmail_(params.email)) {
    errors.push('Email address is not valid.');
  }
  if (hasValue_(params.whatsapp) && !normalizeWhatsApp_(params.whatsapp)) {
    errors.push('Enter a valid international WhatsApp number, including the country code.');
  }

  validateAllowedSingle_(params, 'child_age', 'child age', errors);
  validateAllowedSingle_(params, 'country', 'country', errors);
  validateAllowedSingle_(params, 'quran_level', 'current Qur\'an level', errors);
  validateAllowedSingle_(params, 'session_language', 'preferred session language', errors);
  validateAllowedSingle_(params, 'preferred_time', 'preferred time of day', errors);
  validateAllowedList_(params, 'preferred_days', 'preferred days', errors);

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function hasValue_(value) {
  return value != null && String(value).trim() !== '';
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function normalizeWhatsApp_(value) {
  const text = String(value == null ? '' : value).trim();
  if (!/^(?:\+|00)[0-9 ()-]+$/.test(text)) return '';
  const normalized = text.replace(/[ ()-]/g, '').replace(/^00/, '+');
  return /^\+[1-9][0-9]{6,14}$/.test(normalized) ? normalized : '';
}

function submissionFingerprint_(params) {
  const canonical = {};
  BOOKING_DETAIL_FIELDS.forEach(function (name) {
    const value = String(params[name] == null ? '' : params[name]);
    if (name === 'whatsapp') {
      canonical[name] = normalizeWhatsApp_(value);
    } else if (name === 'preferred_days') {
      const days = value.split(',').map(function (day) { return day.trim(); });
      canonical[name] = ALLOWED_VALUES.preferred_days.filter(function (day) {
        return days.indexOf(day) !== -1;
      }).join(',');
    } else if (name === 'notes') {
      canonical[name] = value.replace(/\r\n?/g, '\n').trim();
    } else {
      canonical[name] = value.trim();
    }
  });
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(canonical), Utilities.Charset.UTF_8);
  const fingerprint = bytes.map(function (byte) {
    return ('0' + (byte & 255).toString(16)).slice(-2);
  }).join('');
  if (!FINGERPRINT_PATTERN.test(fingerprint)) throw new Error('Booking fingerprint could not be computed.');
  return fingerprint;
}

function validateAllowedSingle_(params, name, label, errors) {
  if (!hasValue_(params[name])) return;
  const value = String(params[name]).trim();
  if (ALLOWED_VALUES[name].indexOf(value) === -1) {
    errors.push('Invalid ' + label + '.');
  }
}

function validateAllowedList_(params, name, label, errors) {
  if (!hasValue_(params[name])) return;
  const values = String(params[name])
    .split(',')
    .map(function (value) { return value.trim(); })
    .filter(function (value) { return value !== ''; });

  if (!values.length) {
    errors.push('Missing ' + label + '.');
    return;
  }

  const hasInvalid = values.some(function (value) {
    return ALLOWED_VALUES[name].indexOf(value) === -1;
  });

  if (hasInvalid) {
    errors.push('Invalid ' + label + '.');
  }
}

// Email notification.
function sendNotification_(p) {
  const subject =
    'New trial booking — ' +
    (p.parent_name || 'Unknown parent') +
    ' / ' + (p.child_name || '');

  const lines = [
    'A new trial booking has come in.',
    '',
    '— Parent —',
    'Name:      ' + (p.parent_name || '—'),
    'Email:     ' + (p.email || '—'),
    'WhatsApp:  ' + (p.whatsapp ? String(p.whatsapp).replace(/^'(?=\+)/, '') : '—'),
    'Country:   ' + (p.country || '—'),
    'City / Region: ' + (p.city_region || '—'),
    '',
    '— Child —',
    'Name:      ' + (p.child_name || '—'),
    'Age:       ' + (p.child_age || '—'),
    'Level:     ' + (p.quran_level || '—'),
    'Language:  ' + (p.session_language || '—'),
    '',
    '— Scheduling —',
    'Days:      ' + (p.preferred_days || '—'),
    'Time:      ' + (p.preferred_time || '—'),
    '',
    '— Notes —',
    (p.notes && String(p.notes).trim()) ? p.notes : '(none)',
    '',
    '—',
    'Submitted: ' + new Date().toString()
  ];

  MailApp.sendEmail({
    to: CONFIG.NOTIFICATION_EMAIL,
    subject: subject,
    body: lines.join('\n'),
    replyTo: p.email ? String(p.email).trim() : undefined,
    name: 'Tarteel House bookings'
  });
}

// ---------------------------------------------------------------------------
// Redirect response — shown briefly on script.googleusercontent.com before
// the browser lands on success.
// ---------------------------------------------------------------------------
function htmlRedirect_(params) {
  const url = getSuccessRedirect_(params);
  const escaped = escapeHtml_(url);
  const html =
    '<!doctype html>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Trial request received</title>' +
    '<div style="font-family:system-ui;padding:2rem;line-height:1.6;max-width:42rem;">' +
      '<h1>Your request has been received</h1>' +
      '<p>Thank you. We normally contact families on WhatsApp within two days. There is no need to resubmit your request.</p>' +
      '<p><a target="_top" href="' + escaped + '">Continue to Tarteel House</a></p>' +
      '<p>If that link cannot open, <a target="_blank" rel="noopener noreferrer" href="' + escaped + '">view the next steps in a new tab</a>.</p>' +
    '</div>' + bookingResponseScript_(params, 'success');
  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------------------------------------------------------------------------
// Error response and redirect helpers.
// ---------------------------------------------------------------------------
function htmlError_(errors, title, message, params) {
  const pageTitle = title || 'Booking details missing';
  const heading = title || 'Some booking details are missing';
  const body = message || 'Please go back, complete the required details, and submit the form again.';
  const items = errors.map(function (error) {
    return '<li>' + escapeHtml_(error) + '</li>';
  }).join('');

  const html =
    '<!doctype html>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeHtml_(pageTitle) + '</title>' +
    '<div style="font-family:system-ui;padding:2rem;line-height:1.6;max-width:42rem;">' +
      '<h1 style="font-size:1.25rem;">' + escapeHtml_(heading) + '</h1>' +
      '<p>' + escapeHtml_(body) + '</p>' +
      '<ul>' + items + '</ul>' +
      '<p>Use your browser Back button to return to your form, or <a target="_blank" rel="noopener noreferrer" href="https://www.tarteelhouse.com/book-trial/">open a new booking form</a>.</p>' +
      '<p><a target="_blank" rel="noopener noreferrer" href="https://wa.me/34614494311">Message Tarteel House on WhatsApp</a></p>' +
    '</div>' + bookingResponseScript_(params, 'error', errors.join(' '));

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSuccessRedirect_(params) {
  const candidate = params && params.success_redirect;
  if (isAllowedSuccessRedirect_(candidate)) return String(candidate).trim();
  return CONFIG.SUCCESS_REDIRECT;
}

function isAllowedSuccessRedirect_(value) {
  if (!hasValue_(value)) return false;
  if (String(value).length > FIELD_LIMITS.success_redirect || /[\x00-\x1f\x7f]/.test(String(value))) return false;

  const match = String(value).trim().match(/^(https?):\/\/([^/?#]+)(\/[^?#]*)(\?[^#]*)?$/i);
  if (!match) return false;

  const protocol = match[1].toLowerCase() + ':';
  const authority = match[2].toLowerCase();
  if (authority.indexOf('@') !== -1) return false;
  const authorityParts = authority.split(':');
  if (authorityParts.length > 2) return false;
  const host = authorityParts[0];
  const port = authorityParts[1] || '';
  const path = match[3].toLowerCase().replace(/\/+$/, '');
  const query = match[4] || '';

  if (protocol !== 'https:' && protocol !== 'http:') return false;
  if (path !== '/success') return false;
  if (query && !/^\?booking=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query)) {
    return false;
  }
  if (protocol !== 'https:') return false;
  if (port && port !== '443') return false;

  return CONFIG.ALLOWED_REDIRECT_HOSTS.indexOf(host) !== -1;
}

function bookingResponseScript_(params, status, message) {
  if (!params || !isAllowedSuccessRedirect_(params.success_redirect) ||
      !UUID_PATTERN.test(String(params.response_token || '')) ||
      !UUID_PATTERN.test(String(params.submission_id || ''))) return '';
  const origin = String(params.success_redirect).trim().match(/^https:\/\/[^/]+/i)[0];
  const payload = JSON.stringify({
    type: 'tarteelhouse:booking-result',
    submission_id: params.submission_id,
    response_token: params.response_token,
    status: status,
    message: message || ''
  }).replace(/</g, '\\u003c');
  // HtmlService lives inside Google's sandbox wrapper. The website remains
  // top-level and validates the Google origin and per-attempt random token.
  return '<script>window.top.postMessage(' + payload + ',' + JSON.stringify(origin) + ');</script>';
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Run once manually to seed the header row on an empty sheet, or to add
// operational columns (status / assigned_teacher / follow_up_date /
// internal_notes) to an existing sheet without submitting a test booking.
// In the Apps Script editor: select `initializeSheet` in the function
// dropdown, then click Run.
// ---------------------------------------------------------------------------
function initializeSheet() {
  const sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);
}
