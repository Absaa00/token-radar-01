// Local mirror of the competition's seven gate rows, run against one /output directory:
//   node tools/gate-check.mjs <outDir> [snapshot.json]
// Exits 0 when every row passes, 1 otherwise, naming the first failure of each row.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { buildDossier } from '../vendor/makefun-board.ts';

const outDir = process.argv[2];
const snapPath = process.argv[3] ?? join(homedir(), 'workspace', 'makefun', 'kit-token-radar-01', 'input', 'snapshot.json');
if (!outDir) {
  process.stderr.write('usage: node tools/gate-check.mjs <outDir> [snapshot.json]\n');
  process.exit(2);
}
const snapshot = JSON.parse(readFileSync(snapPath, 'utf8'));
const snapSlugs = new Set(snapshot.protocols.map((p) => p.slug));
const failures = [];
const pass = (row) => console.log(`gate: PASS ${row}`);
const fail = (row, why) => {
  failures.push(row);
  console.log(`gate: FAIL ${row}: ${why}`);
};

/** Walk a directory's regular files (relative paths, forward slashes). */
function walk(dir, prefix = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}
const PLAIN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// --- 1. dashboard_files -------------------------------------------------------
{
  const files = walk(join(outDir, 'dashboard'));
  const bad = files.filter((f) => f.split('/').some((part) => !PLAIN.test(part) || part.startsWith('.')));
  const bytes = files.reduce((n, f) => n + statSync(join(outDir, 'dashboard', f)).size, 0);
  const hasHtml = files.includes('index.html');
  const hasCss = files.some((f) => f.endsWith('.css'));
  const hasJs = files.some((f) => f.endsWith('.js'));
  let urlOffense = null;
  for (const f of files) {
    if (!/\.(html|css|js)$/.test(f)) continue;
    const text = readFileSync(join(outDir, 'dashboard', f), 'utf8');
    // The scorer refuses an http(s) address in an HTML attribute value, a CSS file, or a
    // JavaScript import/require specifier. A plain string is none of those; flag only the
    // patterns the scorer names, and report any other URL as a warning line.
    const attrHit = f.endsWith('.html') ? text.match(/(?:href|src|action)\s*=\s*["']https?:\/\//) : null;
    const cssHit = f.endsWith('.css') ? text.match(/https?:\/\//) : null;
    const jsHit = f.endsWith('.js') ? text.match(/(?:import\s*[^'"]*?from\s*|require\s*\(|import\s*\()\s*["']https?:\/\//) : null;
    if (attrHit || cssHit || jsHit) {
      urlOffense = `${f}: ${(attrHit ?? cssHit ?? jsHit)[0]}`;
      break;
    }
  }
  if (!hasHtml) fail('dashboard_files', 'no index.html');
  else if (!hasCss) fail('dashboard_files', 'no .css file');
  else if (!hasJs) fail('dashboard_files', 'no .js file');
  else if (files.length > 400) fail('dashboard_files', `${files.length} files over 400`);
  else if (bytes > 4_194_304) fail('dashboard_files', `${bytes} bytes over 4 MiB`);
  else if (bad.length > 0) fail('dashboard_files', `bad name: ${bad[0]}`);
  else if (urlOffense) fail('dashboard_files', urlOffense);
  else pass(`dashboard_files (${files.length} files, ${bytes} bytes)`);
}

// --- 2/3/4/5. board.json -------------------------------------------------------
const boardText = readFileSync(join(outDir, 'board.json'), 'utf8');
const board = JSON.parse(boardText);
const rows = Array.isArray(board) ? board : board.rows;
{
  if (!Array.isArray(rows)) fail('board_file', 'rows is not an array');
  else if (rows.length < 100 || rows.length > 4000) fail('board_file', `${rows.length} rows outside 100..4000`);
  else if (Buffer.byteLength(boardText) > 8 * 1024 * 1024) fail('board_file', 'over 8 MiB');
  else {
    let why = null;
    for (const r of rows) {
      if (typeof r.slug !== 'string' || /\s/.test(r.slug) || r.slug.length < 1 || r.slug.length > 128) { why = `${r.slug}: bad slug`; break; }
      if (!snapSlugs.has(r.slug)) { why = `${r.slug}: not in the snapshot`; break; }
      if (typeof r.name !== 'string' || r.name.length === 0) { why = `${r.slug}: empty name`; break; }
      if (!Number.isSafeInteger(r.rank) || r.rank <= 0) { why = `${r.slug}: bad rank`; break; }
      if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) { why = `${r.slug}: bad implied value`; break; }
      if (!Array.isArray(r.farm_steps)) { why = `${r.slug}: farm_steps is not an array`; break; }
    }
    if (why) fail('board_file', why);
    else pass(`board_file (${rows.length} rows)`);
  }
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  let why = null;
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) { why = `rank ${i + 1} is ${ranks[i]}`; break; }
  if (!why) for (let i = 1; i < rows.length; i++) if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) { why = `row ${i + 1} outranks row ${i}`; break; }
  if (!why && rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) why = 'all rows share one implied value';
  if (why) fail('sorted_by_value', why);
  else pass('sorted_by_value');
  const have = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !have.has(s));
  if (missing.length > 0) fail('coverage', `missing ${missing.length}: ${missing.slice(0, 5).join(', ')}`);
  else pass(`coverage (all ${snapshot.watchlist.length} watchlist slugs)`);
  let stepWhy = null;
  for (const r of rows) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) { stepWhy = `${r.slug}: ${r.farm_steps.length} steps`; break; }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) { stepWhy = `${r.slug}: step of ${t.length} chars`; break; }
    }
    if (stepWhy) break;
  }
  if (stepWhy) fail('farm_steps', stepWhy);
  else pass('farm_steps');
}

// --- 6. screenshots -----------------------------------------------------------
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
{
  const names = readdirSync(join(outDir, 'screenshots')).filter((n) => !n.startsWith('.')).sort();
  let why = null;
  if (names.length < 3 || names.length > 4) why = `${names.length} screenshots, need 3..4`;
  for (const n of names) {
    if (!PLAIN.test(n)) { why = `${n}: bad name`; break; }
    const buf = readFileSync(join(outDir, 'screenshots', n));
    if (buf.length > 524_288) { why = `${n}: ${buf.length} bytes over 512 KiB`; break; }
    const size = pngSize(buf) ?? jpegSize(buf);
    if (!size) { why = `${n}: not a whole PNG or JPEG`; break; }
    const long = Math.max(size.w, size.h);
    const short = Math.min(size.w, size.h);
    if (long > 1440) { why = `${n}: long side ${long} over 1440`; break; }
    if (short < 800) { why = `${n}: short side ${short} under 800`; break; }
  }
  if (why) fail('screenshots', why);
  else pass(`screenshots (${names.join(', ')})`);
}

// --- 7. dossier_matches -------------------------------------------------------
{
  const expected = buildDossier(outDir, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
  const actual = readFileSync(join(outDir, 'dossier.json'));
  if (actual.length > 1.5 * 1024 * 1024) fail('dossier_matches', `dossier.json is ${actual.length} bytes, over 1.5 MiB`);
  else if (!actual.equals(Buffer.from(expected))) fail('dossier_matches', 'dossier.json differs from buildDossier output');
  else {
    const doc = JSON.parse(actual.toString('utf8'));
    pass(`dossier_matches (${actual.length} bytes, text ${Buffer.byteLength(doc.text)} bytes)`);
  }
}

if (failures.length > 0) {
  console.log(`gate: ${failures.length} row(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('gate: all 7 rows pass');
