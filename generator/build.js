// Renders Instagram slides (1080x1350 JPEG) and one preview sheet per post.
// Usage: node build.js <posts.json> <site index.html> <out dir>
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/home/claude/tarteel-house-last/tests/browser/node_modules/@playwright/test');

const [postsPath, siteIndexPath, outDir] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(postsPath, 'utf8'));
const fonts = path.join(__dirname, 'node_modules', '@fontsource');

// The only Arabic allowed is the approved brand verse, exactly as on the site.
const siteIndex = fs.readFileSync(siteIndexPath, 'utf8');
if (!siteIndex.includes(spec.verse)) throw new Error('Brand verse does not match the site, refusing to render.');

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const faDigits = value => String(value).replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[digit]);

const css = `
${['playfair-display/400.css', 'playfair-display/500.css', 'playfair-display/400-italic.css', 'playfair-display/500-italic.css',
    'inter/400.css', 'inter/500.css', 'inter/600.css', 'vazirmatn/400.css', 'vazirmatn/500.css', 'vazirmatn/600.css', 'amiri/400.css']
    .map(file => `@import url("file://${fonts}/${file}");`).join('\n')}
:root { --ink:#1a1814; --ivory:#f5f1e8; --paper:#faf7f0; --forest:#1f3a2e; --bronze:#7a5a2e; --bronze-2:#9b7a48;
  --rule:rgba(26,24,20,0.14); --subtle:rgba(60,50,40,0.72); }
* { box-sizing:border-box; margin:0; padding:0; }
html, body { width:1080px; height:1350px; }
body { background:var(--ivory); color:var(--ink); font-family:'Inter',sans-serif; display:flex; flex-direction:column;
  padding:104px 96px 84px; -webkit-font-smoothing:antialiased; }
body.paper { background:var(--paper); }
body.dark { background:var(--ink); color:var(--ivory); }
main { flex:1; display:flex; flex-direction:column; justify-content:center; }
.eyebrow { font-size:26px; font-weight:600; letter-spacing:0.2em; text-transform:uppercase; color:var(--bronze); margin-bottom:44px; }
.dark .eyebrow { color:var(--bronze-2); }
.ornament { width:72px; height:2px; background:var(--bronze-2); margin-bottom:52px; }
h1, h2, p.body, .translation { text-wrap:balance; }
h1 { font-family:'Playfair Display',serif; font-weight:500; font-size:92px; line-height:1.12; letter-spacing:-0.01em; }
h2 { font-family:'Playfair Display',serif; font-weight:500; font-size:72px; line-height:1.16; letter-spacing:-0.005em; }
.quote h2 { font-style:italic; font-size:88px; line-height:1.18; color:var(--forest); }
p.body { font-size:42px; line-height:1.5; color:var(--subtle); margin-top:44px; max-width:800px; }
.dark p.body { color:rgba(245,241,232,0.78); }
ul { list-style:none; margin-top:60px; }
li { font-size:42px; line-height:1.38; padding:30px 0; border-top:1px solid var(--rule); display:flex; gap:30px; }
li:last-child { border-bottom:1px solid var(--rule); }
li .n { font-family:'Playfair Display',serif; font-style:italic; color:var(--bronze); min-width:44px; }
.note { font-size:28px; color:rgba(245,241,232,0.6); margin-top:52px; }
.link { margin-top:64px; font-size:34px; font-weight:500; letter-spacing:0.04em; color:var(--forest); }
.dark .link { color:var(--ivory); border-top:1px solid rgba(245,241,232,0.22); padding-top:40px; display:inline-block; }
footer { display:flex; justify-content:space-between; align-items:baseline; font-size:26px; color:var(--subtle); direction:ltr; }
.dark footer { color:rgba(245,241,232,0.6); }
.wordmark { font-family:'Playfair Display',serif; font-style:italic; font-size:36px; color:var(--ink); }
.dark .wordmark { color:var(--ivory); }
.wordmark span { font-family:'Inter',sans-serif; font-style:normal; font-size:19px; font-weight:500; letter-spacing:0.3em; margin-left:12px; }
.arabic { font-family:'Amiri',serif; font-size:124px; line-height:1.9; direction:rtl; text-align:center; color:var(--ink); margin:12px 0 40px; }
.verse main { align-items:center; text-align:center; }
.verse .translation { font-family:'Playfair Display',serif; font-style:italic; font-size:50px; line-height:1.4; max-width:820px; }
.verse .reference { font-size:28px; letter-spacing:0.16em; text-transform:uppercase; color:var(--bronze); margin-top:44px; }
.verse .ornament { margin:0 auto 48px; }
/* Persian: right to left, Vazirmatn throughout, no letter-spacing (it breaks joined letters). */
[lang="fa"] body { font-family:'Vazirmatn',sans-serif; }
[lang="fa"] h1, [lang="fa"] h2 { font-family:'Vazirmatn',sans-serif; font-weight:600; letter-spacing:0; line-height:1.5; }
[lang="fa"] h1 { font-size:84px; } [lang="fa"] h2 { font-size:66px; }
[lang="fa"] .eyebrow { letter-spacing:0; font-size:32px; }
[lang="fa"] li .n { font-family:'Vazirmatn',sans-serif; font-style:normal; font-weight:500; }
[lang="fa"] p.body, [lang="fa"] li { line-height:1.75; }
[lang="fa"] .link { direction:ltr; unicode-bidi:isolate; letter-spacing:0.02em; font-family:'Inter',sans-serif; }
[lang="tr"] .eyebrow { text-transform:none; letter-spacing:0.14em; }
`;

function slideHtml(post, slide, index, total) {
  const fa = post.lang === 'fa';
  const number = value => (fa ? faDigits(value) : value);
  const eyebrow = slide.eyebrow ? `<div class="eyebrow">${esc(post.lang === 'tr' ? slide.eyebrow.toLocaleUpperCase('tr') : slide.eyebrow)}</div>` : '';
  let bodyClass = '';
  let inner = '';
  if (slide.kind === 'cover') {
    inner = `${eyebrow}<div class="ornament"></div><h1>${esc(slide.title)}</h1>`;
  } else if (slide.kind === 'statement') {
    bodyClass = 'paper';
    inner = `${eyebrow}<h2>${esc(slide.title)}</h2><p class="body">${esc(slide.body)}</p>`;
  } else if (slide.kind === 'list' || slide.kind === 'card') {
    bodyClass = slide.kind === 'list' ? 'paper' : '';
    inner = `${eyebrow}${slide.kind === 'card' ? '<div class="ornament"></div>' : ''}<h2>${esc(slide.title)}</h2><ul>` +
      slide.items.map((item, i) => `<li><span class="n">${number(i + 1)}</span><span>${esc(item)}</span></li>`).join('') + '</ul>' +
      (slide.link ? `<div class="link">${esc(slide.link)}</div>` : '');
  } else if (slide.kind === 'quote') {
    bodyClass = 'quote';
    inner = `<div class="ornament"></div><h2>${esc(slide.title)}</h2>`;
  } else if (slide.kind === 'close') {
    bodyClass = 'dark';
    inner = `<h2>${esc(slide.title)}</h2><p class="body">${esc(slide.body)}</p>` +
      (slide.note ? `<div class="note">${esc(slide.note)}</div>` : '') + `<div><div class="link">${esc(slide.link)}</div></div>`;
  } else if (slide.kind === 'verse') {
    bodyClass = 'verse';
    inner = `${eyebrow}<div class="ornament"></div><div class="arabic" lang="ar">${esc(spec.verse)}</div>` +
      `<div class="translation">${esc(slide.translation)}</div><div class="reference">${esc(slide.reference)}</div>`;
  } else {
    throw new Error(`Unknown slide kind: ${slide.kind}`);
  }
  const counter = total > 1 ? `${index + 1} / ${total}` : 'tarteelhouse.com';
  return `<!doctype html><html lang="${post.lang}" dir="${fa ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>${css}</style></head>` +
    `<body class="${bodyClass}"><main>${inner}</main>` +
    `<footer><div class="wordmark">Tarteel<span>HOUSE</span></div><div>${counter}</div></footer></body></html>`;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const report = [];
  for (const post of spec.posts) {
    const files = [];
    for (let i = 0; i < post.slides.length; i++) {
      // Loaded from disk so the local font files are readable (a blank page cannot read file: URLs).
      const tmp = path.join(outDir, '_slide.html');
      fs.writeFileSync(tmp, slideHtml(post, post.slides[i], i, post.slides.length));
      await page.goto('file://' + path.resolve(tmp), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      // Fail loudly if text spills out of the canvas or a font did not load.
      const check = await page.evaluate(() => ({
        overflowY: document.documentElement.scrollHeight - 1350,
        overflowX: document.documentElement.scrollWidth - 1080,
        mainFits: document.querySelector('main').scrollHeight <= document.querySelector('main').clientHeight + 1,
        fonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family.replace(/["']/g, '')),
      }));
      if (check.overflowY > 0 || check.overflowX > 0 || !check.mainFits) {
        throw new Error(`${post.id} slide ${i + 1} overflows: ${JSON.stringify(check)}`);
      }
      const need = post.lang === 'fa' ? 'Vazirmatn' : 'Playfair Display';
      if (!check.fonts.includes(need)) throw new Error(`${post.id} slide ${i + 1}: ${need} did not load`);
      const file = path.join(outDir, `${post.id}-${i + 1}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 93 });
      files.push(file);
    }
    // Preview sheet: two columns, readable on a phone.
    const columns = files.length > 1 ? 2 : 1;
    const cell = files.length > 1 ? 540 : 1080;
    const rows = Math.ceil(files.length / columns);
    const sheet = await browser.newPage({ viewport: { width: columns * cell + (columns + 1) * 16, height: rows * (cell * 1.25) + (rows + 1) * 16 } });
    const sheetTmp = path.join(outDir, '_sheet.html');
    fs.writeFileSync(sheetTmp, `<body style="margin:0;padding:16px;background:#d9d3c4;display:grid;grid-template-columns:repeat(${columns},${cell}px);gap:16px;${post.lang === 'fa' ? 'direction:rtl;' : ''}">` +
      files.map(file => `<img src="file://${path.resolve(file)}" style="width:${cell}px;display:block">`).join('') + '</body>');
    await sheet.goto('file://' + path.resolve(sheetTmp), { waitUntil: 'load' });
    const sheetFile = path.join(outDir, `preview-${post.id}.jpg`);
    await sheet.screenshot({ path: sheetFile, type: 'jpeg', quality: 88, fullPage: true });
    await sheet.close();
    report.push({ id: post.id, day: post.day, slides: files.length, captionChars: post.caption.length, hashtags: (post.caption.match(/#/g) || []).length, preview: sheetFile });
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
})().catch(error => { console.error(error.message); process.exit(1); });
