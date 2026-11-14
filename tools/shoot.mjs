// Renders the dashboard's three screenshots with headless Chromium (Playwright).
//   node tools/shoot.mjs <outDir> <screenshotsDir>
// outDir holds the graded output (dashboard/ + data.js); screenshotsDir receives the JPEGs.
// 1440x900, JPEG quality 80: each shot must stay under the 512 KiB cap (aim 300-350 KB).
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

// playwright-core lives under the home workspace (persisted); /tmp is a fallback.
let chromium;
try {
  ({ chromium } = await import('/tmp/node_modules/playwright-core/index.mjs'));
} catch {
  ({ chromium } = await import(`${homedir()}/workspace/makefun/playwright-core/index.mjs`));
}

const outDir = process.argv[2];
const shotDir = process.argv[3];
if (!outDir || !shotDir) {
  process.stderr.write('usage: node tools/shoot.mjs <outDir> <screenshotsDir>\n');
  process.exit(2);
}

// Find the Chromium binary Playwright installed (no bundled browser in playwright-core).
const home = process.env.HOME ?? '';
const cache = join(home, '.cache', 'ms-playwright');
let executablePath = null;
for (const d of readdirSync(cache)) {
  for (const sub of ['chrome-linux', 'chrome-linux64']) {
    const p = join(cache, d, sub, 'chrome');
    try {
      if (statSync(p).isFile()) executablePath = p;
    } catch { /* not this one */ }
  }
}
if (!executablePath) {
  process.stderr.write('shoot: no Chromium under ~/.cache/ms-playwright: run the install first\n');
  process.exit(2);
}

const page = resolve(outDir, 'dashboard', 'index.html');
const base = `file://${page}`;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const shots = [
  { file: '1-board.jpg', hash: '', scroll: '.controls' },
  { file: '2-detail.jpg', hash: '#p=steakhouse-financial', scroll: null },
  { file: '3-filtered.jpg', hash: '#category=Risk%20Curators', scroll: '.controls' },
];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await pg.goto(base + s.hash, { waitUntil: 'load' });
  await pg.waitForTimeout(600);
  if (s.scroll) {
    await pg.evaluate((sel) => { document.querySelector(sel)?.scrollIntoView(); }, s.scroll);
    await pg.waitForTimeout(300);
  }
  await pg.screenshot({ path: join(shotDir, s.file), type: 'jpeg', quality: 80 });
  await ctx.close();
  console.log(`shoot: wrote ${s.file}`);
}
await browser.close();
