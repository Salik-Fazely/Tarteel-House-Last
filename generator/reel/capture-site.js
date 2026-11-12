// Captures the real homepage at phone width for the brand film: the sticky header on its own,
// and the page beneath it as one tall image. Needs the local QA server on PORT.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/home/claude/tarteel-house-last/tests/browser/node_modules/@playwright/test');

const PORT = process.env.TARTEEL_QA_PORT || '8790';
const fontsDir = path.join(__dirname, '..', 'node_modules', '@fontsource');
const out = path.join(__dirname, 'out');

function googleFontsCss() {
  const faces = { 'playfair-display': ['400', '500', '600', '700', '400-italic', '500-italic', '600-italic'], inter: ['300', '400', '500', '600'], amiri: ['400', '700'] };
  let css = '';
  for (const [family, weights] of Object.entries(faces)) for (const weight of weights) {
    const file = path.join(fontsDir, family, `${weight}.css`);
    if (fs.existsSync(file)) css += fs.readFileSync(file, 'utf8').replace(/url\(\.\/files\//g, `url(https://fonts.gstatic.com/local/${family}/files/`);
  }
  return css;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 646 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const css = googleFontsCss();
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: css });
    if (url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/local/')) {
      const file = path.join(fontsDir, decodeURIComponent(url.pathname.slice('/local/'.length)));
      if (file.startsWith(fontsDir) && fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.addStyleTag({ content: '#qa-evidence{display:none!important} html{scroll-behavior:auto!important}' });
  const reject = page.getByRole('button', { name: /reject/i }).first();
  if (await reject.isVisible().catch(() => false)) await reject.click();
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
  if (!fonts.includes('Playfair Display')) throw new Error('Site fonts did not load');
  // Scroll through once so anything revealed on scroll is in its final state, then return to the top.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < Math.min(height, 3200); y += 300) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(60); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const nav = await page.evaluate(() => { const el = document.querySelector('header, .nav'); const r = el.getBoundingClientRect(); return Math.ceil(r.bottom); });
  await page.screenshot({ path: path.join(out, 'site-nav.png'), clip: { x: 0, y: 0, width: 390, height: nav } });
  await page.addStyleTag({ content: 'header, .nav { visibility: hidden !important; }' });
  const tall = Math.min(height, 2700);
  await page.screenshot({ path: path.join(out, 'site-page.jpg'), type: 'jpeg', quality: 93, fullPage: true, clip: { x: 0, y: 0, width: 390, height: tall } });
  await browser.close();
  console.log(JSON.stringify({ navHeight: nav, pageHeight: tall, fullHeight: height }));
})().catch(error => { console.error('FAILED:', error.message); process.exit(1); });
