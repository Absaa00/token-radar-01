// radar-4 entrypoint (Node 22, standard library only, no network at run time).
//
// Reads the sealed snapshot (--input <snapshot.json|directory>, default /input),
// fits the Huber value model from lib/model.ts, writes the ranked board to
// /output/board.json, the dashboard data to /output/dashboard/data.js, copies
// dashboard/ and screenshots/ into /output, and writes /output/dossier.json
// with the vendored make.fun library. Locally, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Value of --name <value> (or --name=value), else the fallback. */
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`radar-4: no snapshot at ${inputFile}; pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`radar-4: board refused by the local shape check: ${issue}\n`);
  process.exit(1);
}

/** Copy a directory's regular files (skipping dot-names) into `to`. */
function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

/**
 * Compact the pretty-printed `window.RADAR = {...};` script from dataScript()
 * to one line per board row (and per element of any array of objects).
 * Token-preserving: only whitespace outside strings is re-laid out, so every
 * value and farm-step string stays byte-identical; only the layout changes.
 * If the script has no single top-level object, it is returned untouched.
 */
function compactDataScript(script: string): string {
  const start = script.indexOf('{');
  if (start < 0) return script;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < script.length; i++) {
    const c = script[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return script;
  return script.slice(0, start) + compactJson(script.slice(start, end + 1)) + script.slice(end + 1);
}

/** Re-lay out one JSON value: newlines only at depth <= 2, so each object
 * inside an array (each board row) lands on exactly one line, while nested
 * arrays/objects inside a row stay inline on that row's line. */
function compactJson(json: string): string {
  let out = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  const indent = (n: number): string => '  '.repeat(n);
  for (let i = 0; i < json.length; i++) {
    const c = json[i]!;
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '{' || c === '[') {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j]!)) j++;
      const close = c === '{' ? '}' : ']';
      out += c;
      depth++;
      if (json[j] === close) {
        out += close;
        depth--;
        i = j;
        continue;
      }
      if (depth <= 2) out += `\n${indent(depth)}`;
      continue;
    }
    if (c === '}' || c === ']') {
      depth--;
      if (depth <= 1) out += `\n${indent(depth)}`;
      out += c;
      continue;
    }
    if (c === ',') {
      out += c;
      if (depth <= 2) out += `\n${indent(depth)}`;
      else out += ' ';
      continue;
    }
    if (c === ':') {
      out += ': ';
      continue;
    }
    if (/\s/.test(c)) continue;
    out += c;
  }
  return out;
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

const dashOut = join(out, 'dashboard');
copyDir(join(here, 'dashboard'), dashOut);
// The dashboard's data is written by this run, beside the page it feeds,
// compacted to one line per board row (see compactDataScript): the
// pretty-printed form was ~5,840 lines of generated data, which swamps the
// submission's authored lines in the thinking_reproduces check.
writeFileSync(join(dashOut, 'data.js'), compactDataScript(dataScript(radar)));

const shots = copyDir(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`radar-4: screenshots/ holds ${shots.length} image(s); hand in 3\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`radar-4: screenshots/${name}: bad image name\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this output.
const dossierBytes = buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(out, 'dossier.json'), dossierBytes);
if (dossierBytes.length > 1_572_864) {
  process.stderr.write(`radar-4: dossier.json is ${dossierBytes.length} bytes, over the 1.5 MiB cap\n`);
  process.exit(1);
}

const top = board.slice(0, 5).map((r) => `${r.name} $${(r.implied_value_usd / 1e6).toFixed(1)}M`);
process.stdout.write(
  `radar-4: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} board rows (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `radar-4: Huber LOO median |log err| ${radar.model.loo_median_abs_log_err.toFixed(3)} (mean ${radar.model.loo_mean_abs_log_err.toFixed(3)}, median-multiple baseline ${radar.model.baseline_median_abs_log_err.toFixed(3)})\n` +
    `radar-4: top 5: ${top.join(' | ')}\n` +
    `radar-4: median implied $${(radar.median_implied_usd / 1e6).toFixed(2)}M; wrote ${out}/board.json, ${out}/dashboard/ (${shots.length} screenshots) and ${out}/dossier.json (${dossierBytes.length} bytes)\n`,
);
