// Films a page whose whole animation is window.renderAt(seconds), cut into the page's window.segments.
// Usage: node render-timeline.js <page.html> <output name> preview "7.6,16.6,19.9" | film
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('/home/claude/tarteel-house-last/tests/browser/node_modules/@playwright/test');

const FPS = 30;
const [pageFile, name, mode, times] = process.argv.slice(2);
const dir = __dirname, out = path.join(dir, 'out');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(dir, pageFile), { waitUntil: 'load' });
  await page.evaluate(async () => {
    window.renderAt(999);
    await Promise.all(['500 62px "Playfair Display"', 'italic 400 34px "Playfair Display"', 'italic 500 104px "Playfair Display"',
      '400 38px Inter', '500 56px Inter', '600 28px Inter'].map(face => document.fonts.load(face)));
    await document.fonts.ready;
  });
  const loaded = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
  if (!loaded.includes('Playfair Display') || !loaded.includes('Inter')) throw new Error('Brand fonts did not load');
  const segments = await page.evaluate(() => window.segments);

  if (mode === 'preview') {
    for (const t of times.split(',').map(Number)) {
      await page.evaluate(time => window.renderAt(time), t);
      await page.screenshot({ path: path.join(out, `${name}-at-${t}.jpg`), type: 'jpeg', quality: 92 });
    }
    // Nothing may be clipped or leave the middle band Instagram keeps clear.
    await page.evaluate(() => window.renderAt(16.6));
    const problems = await page.evaluate(() => [...document.querySelectorAll('.step h2, .step p, h1')].filter(el => {
      const r = el.getBoundingClientRect(); return r.right > 1080 - 56 || el.scrollWidth > el.clientWidth + 1 || r.bottom > 1920 - 380;
    }).map(el => el.textContent.slice(0, 30)));
    if (problems.length) throw new Error('Text leaves the safe area: ' + problems.join(' | '));
    console.log('preview ok; seconds =', segments[segments.length - 1][1]);
  } else {
    const files = [];
    let total = 0;
    for (let i = 0; i < segments.length; i++) {
      const file = path.join(out, `${name}-scene-${i + 1}.mp4`), tmp = file.replace(/\.mp4$/, '.part.mp4');
      const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-video_track_timescale', '15360', tmp],
        { stdio: ['pipe', 'inherit', 'inherit'] });
      const done = new Promise((resolve, reject) => ffmpeg.on('exit', code => { if (code === 0) { fs.renameSync(tmp, file); resolve(); } else reject(new Error(`ffmpeg exited ${code}`)); }));
      const first = Math.round(segments[i][0] * FPS), last = Math.round(segments[i][1] * FPS);
      for (let frame = first; frame < last; frame++) {
        await page.evaluate(time => window.renderAt(time), frame / FPS);
        const jpeg = await page.screenshot({ type: 'jpeg', quality: 92 });
        if (!ffmpeg.stdin.write(jpeg)) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
        total++;
      }
      ffmpeg.stdin.end(); await done; files.push(file);
    }
    fs.writeFileSync(path.join(out, `${name}-list.txt`), files.map(f => `file '${f}'`).join('\n') + '\n');
    const joined = path.join(out, `${name}-joined.part.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(out, `${name}-list.txt`), '-c', 'copy', joined]);
    const finalTmp = path.join(out, `${name}.part.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', joined, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', finalTmp]);
    fs.renameSync(finalTmp, path.join(out, `${name}.mp4`));
    fs.unlinkSync(joined);
    console.log(JSON.stringify({ frames: total, seconds: +(total / FPS).toFixed(1) }));
  }
  await browser.close();
})().catch(error => { console.error('FAILED:', error.message); process.exit(1); });
