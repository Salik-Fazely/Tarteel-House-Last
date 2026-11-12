// Films the real booking flow on a local copy of the site (mock backend: no booking leaves this machine)
// inside a designed frame. One encoded file per scene, joined without re-encoding.
// Usage: node film-demo.js preview | film      (the local QA server must be running on PORT)
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('/home/claude/tarteel-house-last/tests/browser/node_modules/@playwright/test');

const PORT = process.env.TARTEEL_QA_PORT || '8790';
const SITE = `http://127.0.0.1:${PORT}`;
const FPS = 30;
const dir = __dirname;
const out = path.join(dir, 'out');
const fontsDir = path.join(dir, '..', 'node_modules', '@fontsource');
const mode = process.argv[2] || 'preview';
const PHONE = { left: 185 + 14 + 1.5, top: 500 + 14 + 1.5, scale: 682 / 390 };
const ease = x => { const c = Math.min(Math.max(x, 0), 1); return 1 - Math.pow(1 - c, 3); };

// The site asks Google for its fonts; this machine cannot reach Google, so the same families are served from disk.
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
  const siteContext = await browser.newContext({ viewport: { width: 390, height: 646 }, deviceScaleFactor: 2, reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const fontsCss = googleFontsCss();
  await siteContext.route('**/*', route => {
    const url = new URL(route.request().url());
    // The local mock answers the booking from a second local origin, as the real backend does from Google's.
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: fontsCss });
    // Served under the host the site's own content security policy allows for fonts.
    if (url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/local/')) {
      const file = path.join(fontsDir, decodeURIComponent(url.pathname.slice('/local/'.length)));
      if (file.startsWith(fontsDir) && fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  const A = await siteContext.newPage();
  const B = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await B.goto('file://' + path.join(dir, 'demo.html'), { waitUntil: 'load' });
  await B.evaluate(async () => {
    await Promise.all(['500 66px "Playfair Display"', 'italic 500 66px "Playfair Display"', 'italic 400 44px "Playfair Display"',
      '400 48px Inter', '500 48px Inter', '600 26px Inter'].map(face => document.fonts.load(face)));
    await document.fonts.ready;
  });

  const prepare = async () => {
    // Local-only QA panel and the measurement banner are not part of what a parent is being shown.
    await A.addStyleTag({ content: '#qa-evidence{display:none!important} html{scroll-behavior:auto!important} *{caret-color:transparent!important}' });
    const reject = A.getByRole('button', { name: /reject/i }).first();
    if (await reject.isVisible().catch(() => false)) await reject.click();
    await A.evaluate(() => document.fonts.ready);
  };
  await A.goto(`${SITE}/book-trial/?qa_reset=1`, { waitUntil: 'load' });
  await prepare();
  await A.goto(`${SITE}/`, { waitUntil: 'load' });
  await prepare();
  const siteFonts = await A.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
  if (!siteFonts.includes('Playfair Display')) throw new Error('The site did not render in its own fonts: ' + siteFonts.join(', '));

  // ---- frame machinery ----
  const state = { caption: 0, phone: 1, phoneIn: 0, ripple: null, dark: 0, closing: 0 };
  let dirty = true, encoder = null, sceneFiles = [], frameCount = 0;
  const shot = async () => {
    if (mode !== 'film') return;
    if (dirty) { const jpeg = await A.screenshot({ type: 'jpeg', quality: 92 }); await B.evaluate(d => window.setScreen(d), 'data:image/jpeg;base64,' + jpeg.toString('base64')); dirty = false; }
    await B.evaluate(s => window.setState(s), state);
    const frame = await B.screenshot({ type: 'jpeg', quality: 92 });
    if (!encoder.stdin.write(frame)) await new Promise(resolve => encoder.stdin.once('drain', resolve));
    frameCount++;
  };
  const still = async name => {
    if (mode !== 'preview') return;
    const jpeg = await A.screenshot({ type: 'jpeg', quality: 92 });
    await B.evaluate(d => window.setScreen(d), 'data:image/jpeg;base64,' + jpeg.toString('base64'));
    await B.evaluate(s => window.setState(s), state);
    await B.screenshot({ path: path.join(out, `demo-${name}.jpg`), type: 'jpeg', quality: 92 });
  };
  const beginScene = async n => {
    if (mode !== 'film') return;
    const file = path.join(out, `demo-scene-${n}.mp4`), tmp = file.replace(/\.mp4$/, '.part.mp4');
    const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-video_track_timescale', '15360', tmp],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    encoder = { stdin: ffmpeg.stdin, file, done: new Promise((resolve, reject) => ffmpeg.on('exit', code => {
      if (code === 0) { fs.renameSync(tmp, file); resolve(); } else reject(new Error(`ffmpeg exited ${code}`)); })) };
  };
  const endScene = async () => { if (mode !== 'film') return; encoder.stdin.end(); await encoder.done; sceneFiles.push(encoder.file); encoder = null; };

  // ---- actions (each advances the film by whole frames) ----
  const hold = async frames => { for (let i = 0; i < frames; i++) await shot(); };
  const tween = async (frames, apply) => { for (let i = 1; i <= frames; i++) { apply(ease(i / frames)); await shot(); } };
  const caption = async (eyebrow, titleHtml) => { await B.evaluate(([e, t]) => window.setCaption(e, t), [eyebrow, titleHtml]); await tween(12, k => { state.caption = k; }); };
  const captionOut = async () => { await tween(8, k => { state.caption = 1 - k; }); };
  const scrollTo = async (selector, offset = 190, frames = 22) => {
    const from = await A.evaluate(() => window.scrollY);
    const to = await A.evaluate(([sel, off]) => { const el = document.querySelector(sel); if (!el) throw new Error('Missing ' + sel);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(max, window.scrollY + el.getBoundingClientRect().top - off)); }, [selector, offset]);
    if (Math.abs(to - from) < 2) return;
    for (let i = 1; i <= frames; i++) { const k = ease(i / frames); await A.evaluate(y => window.scrollTo(0, y), from + (to - from) * k); dirty = true; await shot(); }
  };
  const tap = async (selector, action) => {
    const box = await A.locator(selector).first().boundingBox();
    if (!box || box.y < 0 || box.y + box.height > 646) throw new Error(`Tap target ${selector} is not on screen`);
    const point = { x: PHONE.left + (box.x + box.width / 2) * PHONE.scale, y: PHONE.top + (box.y + box.height / 2) * PHONE.scale };
    for (let i = 1; i <= 5; i++) { state.ripple = { ...point, p: i / 12 }; await shot(); }
    await action(); dirty = true;
    for (let i = 6; i <= 12; i++) { state.ripple = { ...point, p: i / 12 }; await shot(); }
    state.ripple = null;
  };
  const type = async (selector, text, framesPerChar = 2) => {
    await A.focus(selector); dirty = true; await shot();
    for (let i = 1; i <= text.length; i++) {
      await A.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, [selector, text.slice(0, i)]);
      dirty = true; for (let f = 0; f < framesPerChar; f++) await shot();
    }
    await A.evaluate(sel => { const el = document.querySelector(sel); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); }, selector);
    dirty = true;
  };

  // ---- the film ----
  await beginScene(1);
  state.caption = 0; state.phoneIn = 0;
  await B.evaluate(([e, t]) => window.setCaption(e, t), ['The first lesson is free', 'How to book your child’s <em>free trial</em> lesson']);
  await tween(20, k => { state.phoneIn = k; state.caption = k; });
  await hold(58);
  await still('1-intro');
  await captionOut();
  await endScene();

  await beginScene(2);
  await caption('Step 1 of 4', 'Tap <em>Book a free trial</em>');
  await scrollTo('.hero a.btn--primary[href="/book-trial/"], main a.btn--primary[href="/book-trial/"]', 380, 20);
  await hold(10);
  await still('2-home');
  await tap('main a.btn--primary[href="/book-trial/"]', async () => { await Promise.all([A.waitForURL('**/book-trial/**'), A.locator('main a.btn--primary[href="/book-trial/"]').first().click()]); await prepare(); });
  await hold(26);
  await captionOut();
  await endScene();

  await beginScene(3);
  await caption('Step 2 of 4', 'Tell us about <em>your child</em>');
  await scrollTo('#child-name', 230);
  await type('#child-name', 'Maryam', 3);
  await A.selectOption('#child-age', { index: 4 }); dirty = true; await hold(12);
  await scrollTo('#quran-level-words', 250);
  await tap('label[for="quran-level-words"]', () => A.locator('label[for="quran-level-words"]').click());
  await hold(8);
  await scrollTo('#session-language-english', 250);
  await tap('label[for="session-language-english"]', () => A.locator('label[for="session-language-english"]').click());
  await still('3-child');
  await hold(14);
  await captionOut();
  await endScene();

  await beginScene(4);
  await caption('Step 3 of 4', 'Add your details and <em>the days that suit you</em>');
  await scrollTo('#parent-name', 230);
  await type('#parent-name', 'Amina Rahman', 2);
  await A.selectOption('#country', 'United Kingdom'); dirty = true; await hold(6);
  await scrollTo('#email', 230, 14);
  await type('#email', 'amina@example.com', 1);
  await type('#whatsapp', '+44 7700 900123', 2);
  await scrollTo('#preferred-day-sat', 250);
  await tap('label[for="preferred-day-sat"]', () => A.locator('label[for="preferred-day-sat"]').click());
  await tap('label[for="preferred-day-sun"]', () => A.locator('label[for="preferred-day-sun"]').click());
  await scrollTo('#preferred-time-morning', 250, 14);
  await tap('label[for="preferred-time-morning"]', () => A.locator('label[for="preferred-time-morning"]').click());
  await A.evaluate(() => { const el = document.querySelector('#city-region'); el.value = 'London'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await scrollTo('#consent', 300);
  await tap('#consent', () => A.locator('#consent').check());
  await still('4-details');
  await hold(8);
  const submit = 'form button[type="submit"]';
  const invalid = await A.evaluate(() => [...document.querySelector('form').elements].filter(el => el.willValidate && !el.checkValidity()).map(el => el.name || el.id));
  if (invalid.length) throw new Error('Form is not valid yet: ' + invalid.join(', '));
  await scrollTo(submit, 380, 12);
  // The local mock accepts only its own synthetic address, so the field (now scrolled out of view) is switched to it before sending.
  await A.evaluate(() => { const el = document.querySelector('#email'); el.value = 'qa.parent@example.invalid'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await tap(submit, async () => { await Promise.all([A.waitForURL('**/success/**', { timeout: 20000 }), A.locator(submit).first().click()]); await prepare(); await A.evaluate(() => window.scrollTo(0, 0)); });
  await captionOut();
  await endScene();

  await beginScene(5);
  await caption('Step 4 of 4', 'We message you on <em>WhatsApp</em>');
  await hold(70);
  await still('5-success');
  await captionOut();
  await endScene();

  await beginScene(6);
  await tween(16, k => { state.phone = 1 - k; state.dark = k; });
  await tween(16, k => { state.closing = k; });
  await still('6-closing');
  await hold(72);
  await endScene();

  const landed = new URL(A.url()).pathname;
  await browser.close();
  if (mode === 'film') {
    fs.writeFileSync(path.join(out, 'demo-list.txt'), sceneFiles.map(f => `file '${f}'`).join('\n') + '\n');
    const joined = path.join(out, 'demo-joined.part.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(out, 'demo-list.txt'), '-c', 'copy', joined]);
    const finalTmp = path.join(out, 'how-to-book-a-free-trial-v2.part.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', joined, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', finalTmp]);
    fs.renameSync(finalTmp, path.join(out, 'how-to-book-a-free-trial-v2.mp4'));
    fs.unlinkSync(joined);
  }
  console.log(JSON.stringify({ mode, landed, frames: frameCount, seconds: +(frameCount / FPS).toFixed(1) }));
})().catch(error => { console.error('FAILED:', error.message); process.exit(1); });
