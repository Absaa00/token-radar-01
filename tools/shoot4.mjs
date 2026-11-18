// radar-4 screenshots: renders the built dashboard in headless Chromium and
// captures the three views the competition asks for — the board, one
// protocol's detail dialog, and a filtered view — as JPEGs at 1440x900.
// Serves out/ over loopback HTTP (no network beyond this machine) so the
// page loads its data.js exactly as the grader's reader would see it.
// Usage: node tools/shoot4.mjs [out-dir]  (default: out)
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../../playwright-core/index.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = join(here, '..');
const outDir = process.argv[2] ?? join(repo, 'out');
const shotDir = join(repo, 'screenshots');
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const file = join(outDir, path === '/' ? 'dashboard/index.html' : path);
  try {
    if (!statSync(file).isFile()) throw new Error('missing');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/dashboard/index.html`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (err) => process.stderr.write(`page error: ${err.message}\n`));
page.on('console', (msg) => {
  if (msg.type() === 'error') process.stderr.write(`console error: ${msg.text()}\n`);
});

async function shot(url, file, quality, scrollTo) {
  // A hash-only change does not reload the page, so each view gets its own
  // query string to force a fresh load (the server ignores the query).
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  if (scrollTo) {
    await page.evaluate((id) => document.getElementById(id)?.scrollIntoView(), scrollTo);
    await page.waitForTimeout(300);
  }
  const buf = await page.screenshot({ type: 'jpeg', quality, fullPage: false });
  writeFileSync(file, buf);
  return buf.length;
}

mkdirSync(shotDir, { recursive: true });
const sizes = {};
sizes['1-board.jpg'] = await shot(base, join(shotDir, '1-board.jpg'), 90);
sizes['2-detail.jpg'] = await shot(`${base}?shot=detail#p=steakhouse-financial`, join(shotDir, '2-detail.jpg'), 90);
// The filtered view's evidence is the board table, below the fold: scroll to it.
sizes['3-filtered.jpg'] = await shot(`${base}?shot=filtered#category=Risk+Curators`, join(shotDir, '3-filtered.jpg'), 90, 'board-h');
await browser.close();
server.close();

for (const [name, bytes] of Object.entries(sizes)) {
  process.stdout.write(`shoot4: screenshots/${name} ${bytes} bytes (${(bytes / 1024).toFixed(0)} KiB)\n`);
  if (bytes > 512 * 1024) process.stderr.write(`shoot4: WARNING ${name} is over the 512 KiB cap\n`);
}
