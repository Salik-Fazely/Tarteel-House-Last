/**
 * Owner-operated notification queue. Booking persistence and these helpers use
 * the same script lock. A durable Sending claim prevents automatic redelivery
 * after a successful mail call whose completion write is uncertain. MailApp
 * exceptions can themselves be ambiguous; this is not an exactly-once promise.
 */
const NOTIFICATION_POLICY = {
  maxAttempts: 5,
  backoffMinutes: [15, 60, 240, 720],
  quotaWaitMinutes: 15,
  batchLimit: 10,
  scanLimit: 200,
  maxRunMilliseconds: 45000,
  sendingStaleMinutes: 15,
  triggerEveryMinutes: 15
};
const NOTIFICATION_CURSOR_PROPERTY = 'TH_NOTIFICATION_CURSOR_V1';

// Called only while the shared booking/recovery script lock is held. Always
// reread the saved row so incoming request values cannot change the email.
function attemptNotification_(sheet, headers, rowNumber, now) {
  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const saved = notificationRecord_(headers, values);
  const state = notificationState_(saved, now);
  if (state.kind === 'legacy' || state.kind === 'skipped' || state.kind === 'not_due') return state.kind;
  if (state.kind === 'review') {
    writeNotificationState_(sheet, headers, rowNumber, {
      notification_next_attempt_at: '', notification_error_code: state.code,
      notification_status: 'Needs review'
    });
    return 'review';
  }

  let quota;
  let quotaCode = 'quota_wait';
  try {
    quota = MailApp.getRemainingDailyQuota();
    if (typeof quota !== 'number' || !Number.isFinite(quota) || quota < 0) quotaCode = 'quota_unavailable';
  } catch (quotaError) {
    quotaCode = 'quota_unavailable';
  }
  if (quotaCode === 'quota_unavailable' || quota < 1) {
    writeNotificationState_(sheet, headers, rowNumber, {
      notification_next_attempt_at: new Date(now + NOTIFICATION_POLICY.quotaWaitMinutes * 60000),
      notification_error_code: quotaCode,
      notification_status: saved.notification_status
    });
    return 'deferred';
  }

  const attempts = state.attempts + 1;
  // Metadata is written before the status, and the complete claim is flushed
  // before MailApp is called. Any claim write/flush error stops delivery.
  writeNotificationState_(sheet, headers, rowNumber, {
    notification_attempts: attempts,
    notification_last_attempt_at: new Date(now),
    notification_next_attempt_at: '', notification_error_code: 'delivery_in_progress',
    notification_status: 'Sending'
  });

  let failed = false;
  try {
    sendNotification_(saved);
  } catch (mailError) {
    failed = true;
  }
  const needsReview = failed && attempts >= NOTIFICATION_POLICY.maxAttempts;
  const delay = NOTIFICATION_POLICY.backoffMinutes[attempts - 1];
  try {
    writeNotificationState_(sheet, headers, rowNumber, {
      notification_next_attempt_at: failed && !needsReview ? new Date(now + delay * 60000) : '',
      notification_status: failed ? (needsReview ? 'Needs review' : 'Failed') : 'Sent'
    });
  } catch (completionError) {
    // A flush can fail after a status write. Restore the durable guard when
    // possible; both Sending and a possibly committed Sent are non-retryable.
    try {
      sheet.getRange(rowNumber, headers.indexOf('notification_status') + 1).setValue('Sending');
      SpreadsheetApp.flush();
    } catch (restoreError) {
      // The previously flushed claim is still the last confirmed state.
    }
    throw completionError;
  }
  // Keep the flushed delivery guard through every completion write. Only a
  // confirmed completion permits clearing it, so a failed restoration cannot
  // expose a retryable Failed/Pending row after an uncertain delivery.
  writeNotificationState_(sheet, headers, rowNumber, {
    notification_error_code: failed ? 'send_failed' : ''
  });
  return failed ? (needsReview ? 'review' : 'deferred') : 'sent';
}

function notificationRecord_(headers, values) {
  const saved = Object.create(null);
  headers.forEach(function (header, index) { saved[header] = values[index]; });
  return saved;
}

function notificationTimestamp_(value) {
  if (value == null || String(value).trim() === '') return null;
  const timestamp = value && typeof value.getTime === 'function' ? value.getTime() :
    (typeof value === 'number' ? value : Date.parse(String(value)));
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

// Pure classification shared by the worker and readonly editor health check.
function notificationState_(saved, now) {
  const status = saved.notification_status;
  if (status === 'Sent' || status === 'Needs review') return { kind: 'skipped' };
  const rawAttempts = saved.notification_attempts;
  if (rawAttempts == null || String(rawAttempts).trim() === '') return { kind: 'legacy' };
  if (status !== 'Pending' && status !== 'Failed' && status !== 'Sending') return { kind: 'skipped' };
  const attempts = typeof rawAttempts === 'number' ? rawAttempts :
    (/^\d+$/.test(String(rawAttempts)) ? Number(rawAttempts) : NaN);
  const last = notificationTimestamp_(saved.notification_last_attempt_at);
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > NOTIFICATION_POLICY.maxAttempts ||
      Number.isNaN(last) || (last !== null && last > now) || (attempts > 0 && last === null)) {
    return { kind: 'review', code: 'invalid_metadata' };
  }
  if (status === 'Sending' || saved.notification_error_code === 'delivery_in_progress') {
    if (attempts === 0) return { kind: 'review', code: 'invalid_metadata' };
    return now - last >= NOTIFICATION_POLICY.sendingStaleMinutes * 60000 ?
      { kind: 'review', code: 'delivery_uncertain' } : { kind: 'skipped' };
  }
  const next = notificationTimestamp_(saved.notification_next_attempt_at);
  if (Number.isNaN(next) || (last !== null && next !== null && next < last)) {
    return { kind: 'review', code: 'invalid_metadata' };
  }
  if (attempts >= NOTIFICATION_POLICY.maxAttempts) return { kind: 'review', code: 'send_failed' };
  if (attempts > 0 && next === null) return { kind: 'review', code: 'invalid_metadata' };
  if (next !== null && next > now) return { kind: 'not_due' };
  return { kind: 'due', attempts: attempts };
}

// Write notification fields only, including when owners reorder sheet columns.
// Status is last so a partial transition retains its previous delivery guard.
function writeNotificationState_(sheet, headers, rowNumber, updates) {
  const names = Object.keys(updates).filter(function (name) { return name !== 'notification_status'; });
  if (Object.prototype.hasOwnProperty.call(updates, 'notification_status')) names.push('notification_status');
  names.forEach(function (name) {
    const column = headers.indexOf(name) + 1;
    if (!column) throw new Error('Notification queue column is missing.');
    sheet.getRange(rowNumber, column).setValue(updates[name]);
  });
  SpreadsheetApp.flush();
}

// Explicit owner-installed trigger entry point. A persisted cursor bounds each
// run while ensuring rows beyond the first scan window receive attention.
function retryFailedNotifications() {
  const summary = { checked: 0, sent: 0, deferred: 0, review: 0, legacy: 0 };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return summary;
  let properties;
  let cursor;
  try {
    const started = Date.now();
    const sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return summary;
    properties = PropertiesService.getScriptProperties();
    const savedCursor = properties.getProperty(NOTIFICATION_CURSOR_PROPERTY);
    cursor = /^\d+$/.test(String(savedCursor)) ? Number(savedCursor) : 2;
    if (!Number.isSafeInteger(cursor) || cursor < 2 || cursor > lastRow) cursor = 2;
    const maximumChecked = Math.min(NOTIFICATION_POLICY.scanLimit, lastRow - 1);
    let processed = 0;
    while (summary.checked < maximumChecked && processed < NOTIFICATION_POLICY.batchLimit &&
        Date.now() - started < NOTIFICATION_POLICY.maxRunMilliseconds) {
      let result;
      try {
        result = attemptNotification_(sheet, headers, cursor, Date.now());
      } finally {
        summary.checked += 1;
        cursor = cursor >= lastRow ? 2 : cursor + 1;
      }
      if (result === 'sent' || result === 'deferred' || result === 'review') {
        summary[result] += 1;
        processed += 1;
      } else if (result === 'legacy') {
        summary.legacy += 1;
      }
    }
    return summary;
  } finally {
    try {
      if (properties && summary.checked) properties.setProperty(NOTIFICATION_CURSOR_PROPERTY, String(cursor));
    } finally {
      lock.releaseLock();
    }
  }
}

// Editor-only operational inspection. No public doGet route calls this helper;
// it never creates a sheet, appends headers, updates rows, sends, or schedules.
function getNotificationRecoveryHealth() {
  const health = { total: 0,
    statuses: { Pending: 0, Failed: 0, Sending: 0, Sent: 0, 'Needs review': 0, Other: 0 },
    due: 0, legacy: 0, needsReview: 0 };
  const spreadsheetId = String(CONFIG.SPREADSHEET_ID || '').trim();
  if (!spreadsheetId) throw new Error('Booking spreadsheet ID is not configured.');
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
    console.log(JSON.stringify(health));
    return health;
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  const now = Date.now();
  rows.forEach(function (values) {
    const saved = notificationRecord_(headers, values);
    const status = saved.notification_status;
    health.total += 1;
    const key = status !== 'Other' && Object.prototype.hasOwnProperty.call(health.statuses, status) ? status : 'Other';
    health.statuses[key] += 1;
    if (status === 'Needs review') health.needsReview += 1;
    if (saved.notification_attempts == null || String(saved.notification_attempts).trim() === '') health.legacy += 1;
    if (notificationState_(saved, now).kind === 'due') health.due += 1;
  });
  console.log(JSON.stringify(health));
  return health;
}

// Run manually in the Apps Script editor as the account that owns mail delivery.
// This helper does not delete or modify any other project triggers.
function installNotificationRecoveryTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === 'retryFailedNotifications';
  });
  if (existing.length) return existing[0];
  return ScriptApp.newTrigger('retryFailedNotifications').timeBased()
    .everyMinutes(NOTIFICATION_POLICY.triggerEveryMinutes).create();
}
