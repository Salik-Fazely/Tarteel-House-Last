'use strict';

const { defineConfig } = require('@playwright/test');
const os = require('node:os');
const path = require('node:path');

// Use installed Chrome locally and the locked Playwright Chromium in CI.
const isCI = Boolean(process.env.CI);
const requestedChannel = process.env.TARTEEL_BROWSER_CHANNEL || (isCI ? 'chromium' : 'chrome');
// Reports and traces capture HTML; keep them outside repository source scans.
const artifactDir = process.env.TARTEEL_BROWSER_ARTIFACT_DIR ||
  path.join(os.tmpdir(), 'tarteel-house-browser-results', 'current');

module.exports = defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  outputDir: path.join(artifactDir, 'test-results'),
  forbidOnly: isCI,
  fullyParallel: false,
  // The shared in-memory QA server requires sequential tests without retries.
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 4000 },
  reporter: isCI ? [
    ['list'],
    ['github'],
    ['html', { outputFolder: path.join(artifactDir, 'html-report'), open: 'never' }],
  ] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8876',
    browserName: 'chromium',
    channel: requestedChannel === 'chromium' ? undefined : requestedChannel,
    headless: true,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
    },
  },
  webServer: {
    command: 'node ../../scripts/qa_server.js',
    env: { TARTEEL_QA_PORT: '8876' },
    url: 'http://127.0.0.1:8876/__qa/',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
