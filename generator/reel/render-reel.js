// Films reel.html scene by scene: one encoded file per scene, joined without re-encoding.
// Usage: node render-reel.js preview   (three still frames to look at first)
//        node render-reel.js film      (the full reel)
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require('/home/claude/tarteel-house-last/tests/browser/node_modules/@playwright/test');

const FPS = 30;
const dir = __dirname;
const out = path.join(dir, 'out');
const mode = process.argv[2] || 'preview';

function encodeScene(file) {
  // Temporary name still ends in .mp4; it is renamed only when ffmpeg exits 0.
  const tmp = file.replace(/\.mp4$/, '.part.mp4');
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-video_track_timescale', '15360', tmp],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ffmpeg.on('exit', code => {
    if (code === 0) { fs.renameSync(tmp, file); resolve(); } else reject(new Error(`ffmpeg exited ${code} for ${file}`));
  }));
  return { stdin: ffmpeg.stdin, done };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(dir, 'reel.html'), { waitUntil: 'load' });
  // Nothing is drawn until a scene is shown, so ask for every face the film uses before the first frame.
  await page.evaluate(async () => {
    window.setScene(0, 2);
    await Promise.all(['500 96px "Playfair Display"', 'italic 400 96px "Playfair Display"', 'italic 500 96px "Playfair Display"',
      '400 50px Inter', '500 50px Inter', '600 50px Inter'].map(face => document.fonts.load(face)));
    await document.fonts.ready;
  });
  const loaded = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
  if (!loaded.includes('Playfair Display') || !loaded.includes('Inter')) throw new Error('Brand fonts did not load: ' + loaded.join(', '));
  const durations = await page.evaluate(() => window.sceneDurations());

  if (mode === 'preview') {
    // The moments with the most on screen: each scene fully built.
    for (const [scene, t] of [[0, 2.2], [2, 2.6], [5, 3.0]]) {
      await page.evaluate(([s, time]) => window.setScene(s, time), [scene, t]);
      const overflow = await page.evaluate(() => {
        const on = document.querySelector('.scene.on');
        return [...on.children].some(el => { const r = el.getBoundingClientRect(); return r.right > 1080 - 60 || r.left < 60 || r.bottom > 1920 - 380 || r.top < 180; });
      });
      if (overflow) throw new Error(`Scene ${scene + 1} leaves the safe area`);
      await page.screenshot({ path: path.join(out, `frame-${scene + 1}.jpg`), type: 'jpeg', quality: 92 });
    }
    console.log('preview frames written; total seconds =', durations.reduce((a, b) => a + b, 0).toFixed(1));
  } else {
    const files = [];
    for (let scene = 0; scene < durations.length; scene++) {
      const file = path.join(out, `scene-${scene + 1}.mp4`);
      const { stdin, done } = encodeScene(file);
      const frames = Math.round(durations[scene] * FPS);
      for (let frame = 0; frame < frames; frame++) {
        await page.evaluate(([s, time]) => window.setScene(s, time), [scene, frame / FPS]);
        const jpeg = await page.screenshot({ type: 'jpeg', quality: 92 });
        if (!stdin.write(jpeg)) await new Promise(resolve => stdin.once('drain', resolve));
      }
      stdin.end();
      await done;
      files.push(file);
      console.log(`scene ${scene + 1}: ${frames} frames`);
    }
    fs.writeFileSync(path.join(out, 'list.txt'), files.map(f => `file '${f}'`).join('\n') + '\n');
    const joined = path.join(out, 'joined.part.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(out, 'list.txt'), '-c', 'copy', joined]);
    // A silent stereo track: some players and schedulers reject a video with no audio stream.
    const finalTmp = path.join(out, 'how-to-book-a-free-trial.part.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', joined, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', finalTmp]);
    fs.renameSync(finalTmp, path.join(out, 'how-to-book-a-free-trial.mp4'));
    fs.unlinkSync(joined);
    console.log('film written');
  }
  await browser.close();
})().catch(error => { console.error(error.message); process.exit(1); });
