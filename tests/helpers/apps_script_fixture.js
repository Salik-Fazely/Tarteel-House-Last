'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const scriptDir = path.join(__dirname, '../../apps-script');
const source = ['Code.gs', ...fs.readdirSync(scriptDir).filter(name => name.endsWith('.gs') && name !== 'Code.gs').sort()]
  .map(name => fs.readFileSync(path.join(scriptDir, name), 'utf8')).join('\n');
const BOOKING_SPREADSHEET_ID = '1xLqKF1DGBGdknlGbTyulDxDYgiVm6vh0MkkXSaJ90Kc';

function validParameters(overrides = {}) {
  return {
    parent_name: 'Amina Rahman',
    child_name: 'Yusuf',
    child_age: '8',
    quran_level: 'reading-short-words',
    session_language: 'english',
    country: 'Spain',
    email: 'amina@example.com',
    whatsapp: '+34600000000',
    preferred_days: 'mon',
    preferred_time: 'evening',
    city_region: 'Barcelona',
    consent: 'yes',
    ...overrides,
  };
}


function appFixture({ appendError, mailError, openError, digestError, propertyError, quota = 1000,
  writeError, flushError, now = Date.parse('2026-10-14T09:00:00Z'), activeUnavailable = 'missing', initialHeaders, initialRows = [] } = {}) {
  const appendedRows = initialRows.map(row => row.slice());
  const sentMail = [];
  const openedIds = [];
  const properties = new Map();
  const writeOperations = [];
  const triggers = [];
  let mailCalls = 0;
  let flushCalls = 0;
  let activeCalls = 0;
  let lockRequests = 0;
  let locked = false;
  let headers = initialHeaders ? initialHeaders.slice() : [
    'timestamp', 'source', 'parent_name', 'child_name', 'child_age', 'quran_level',
    'session_language', 'country', 'email', 'whatsapp', 'preferred_days', 'preferred_time',
    'city_region', 'notes', 'consent', 'status', 'assigned_teacher', 'follow_up_date',
    'internal_notes', 'submission_id', 'notification_status', 'submission_fingerprint',
  ];
  const sheet = {
    appendRow(row) {
      if (appendError) throw appendError;
      appendedRows.push(row);
    },
    getFrozenRows() { return 1; },
    getLastColumn() { return headers.length; },
    getLastRow() { return appendedRows.length + 1; },
    getRange(row = 1, column = 1, rowCount = 1, columnCount = 1) {
      return {
        getValues() {
          return [headers, ...appendedRows].slice(row - 1, row - 1 + rowCount)
            .map(values => Array.from({ length: columnCount }, (_, index) => values[column - 1 + index] ?? ''));
        },
        setFontWeight() {},
        setValue(value) {
          if (writeError) writeError(row, column, value);
          writeOperations.push({ row, column, value });
          appendedRows[row - 2][column - 1] = value;
          return this;
        },
        setValues(values) {
          if (row === 1) values[0].forEach((value, index) => { headers[column - 1 + index] = value; });
          else values.forEach((valuesRow, offset) => valuesRow.forEach((value, index) => {
            if (writeError) writeError(row + offset, column + index, value);
            writeOperations.push({ row: row + offset, column: column + index, value });
            appendedRows[row + offset - 2][column + index - 1] = value;
          }));
          return this;
        },
      };
    },
  };
  const context = {
    console: { error() {}, log() {}, warn() {} },
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    LockService: {
      getScriptLock() {
        lockRequests += 1;
        return { waitLock() { assert.equal(locked, false); locked = true; },
          tryLock() { if (locked) return false; locked = true; return true; },
          releaseLock() { locked = false; } };
      },
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput(html) {
        return {
          html,
          setXFrameOptionsMode() { return this; },
        };
      },
    },
    MailApp: {
      getRemainingDailyQuota() { return quota; },
      sendEmail(message) {
        mailCalls += 1;
        if (mailError) throw mailError;
        sentMail.push(message);
        quota -= 1;
      },
    },
    SpreadsheetApp: {
      flush() { flushCalls += 1; if (flushError) flushError(flushCalls); },
      getActiveSpreadsheet() {
        activeCalls += 1;
        if (activeUnavailable === 'throw') throw new Error('Active spreadsheet unavailable in web apps');
        return null;
      },
      openById(id) {
        openedIds.push(id);
        if (openError) throw openError;
        return {
          getSheetByName() { return sheet; },
          insertSheet() { return sheet; },
        };
      },
    },
    Utilities: {
      getUuid() { return crypto.randomUUID(); },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(algorithm, value, charset) {
        assert.equal(algorithm, 'SHA_256');
        assert.equal(charset, 'UTF_8');
        if (digestError) throw digestError;
        return Array.from(crypto.createHash('sha256').update(value, 'utf8').digest(), byte => byte > 127 ? byte - 256 : byte);
      },
      computeHmacSha256Signature(value, key, charset) {
        assert.equal(charset, 'UTF_8');
        return Array.from(crypto.createHmac('sha256', key).update(value, 'utf8').digest(), byte => byte > 127 ? byte - 256 : byte);
      },
    },
    PropertiesService: { getScriptProperties() { return {
      getProperty(key) { if (propertyError) throw propertyError; return properties.get(key) ?? null; },
      getProperties() { if (propertyError) throw propertyError; return Object.fromEntries(properties); },
      setProperty(key, value) { if (propertyError) throw propertyError; properties.set(key, String(value)); return this; },
      setProperties(values) { if (propertyError) throw propertyError; Object.entries(values).forEach(([key, value]) => properties.set(key, String(value))); return this; },
      deleteProperty(key) { if (propertyError) throw propertyError; properties.delete(key); return this; },
    }; } },
    ScriptApp: {
      getProjectTriggers() { return triggers; },
      newTrigger(handler) { return { timeBased() { return this; },
        everyMinutes(minutes) { this.minutes = minutes; return this; },
        create() { const trigger = { getHandlerFunction() { return handler; } }; triggers.push(trigger); return trigger; },
      }; },
    },
  };
  vm.runInNewContext(source, context);
  return { appendedRows, context, sentMail, openedIds, headers, properties, triggers, writeOperations,
    get now() { return now; }, advanceTime(milliseconds) { now += milliseconds; },
    setQuota(value) { quota = value; }, setWriteError(callback) { writeError = callback; },
    setFlushError(callback) { flushError = callback; }, setPropertyError(error) { propertyError = error; },
    setMailError(error) { mailError = error; },
    setAppendError(error) { appendError = error; }, setDigestError(error) { digestError = error; },
    get lockRequests() { return lockRequests; },
    get mailCalls() { return mailCalls; }, get flushCalls() { return flushCalls; },
    get activeCalls() { return activeCalls; }, get locked() { return locked; } };
}


module.exports = { appFixture, validParameters, BOOKING_SPREADSHEET_ID };
