// Local gate for token-radar-01: the same seven checks the sealed scorer
// runs, re-implemented here for a fast local verdict.
//
//   node tools/gate-check.mjs [outDir] [--input <snapshot.json>]
//
// Exits 0 only when all seven gates pass.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildDossier } from "../vendor/makefun-board.ts";

const outDir = resolve(process.argv[2] ?? "out");
let snapPath = "/home/hatch/workspace/makefun/kit-token-radar-01/input/snapshot.json";
const at = process.argv.indexOf("--input");
if (at >= 0 && process.argv[at + 1]) snapPath = resolve(process.argv[at + 1]);

const snap = JSON.parse(readFileSync(snapPath, "utf8"));
const results = [];
function gate(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail ?? "" });
  console.log((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : ""));
}

function walk(dir, rel, out) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    const r = rel ? rel + "/" + f : f;
    if (statSync(p).isDirectory()) walk(p, r, out);
    else out.push(r);
  }
  return out;
}

// ---- 1. dashboard_files
{
  const dir = join(outDir, "dashboard");
  let ok = true;
  let detail = "";
  try {
    const files = walk(dir, "", []);
    const total = files.reduce((s, f) => s + statSync(join(dir, f)).size, 0);
    const badName = files.find(
      (f) => f.length > 128 || /(^|\/)[.-]/.test(f) || !/^[A-Za-z0-9._\-/]+$/.test(f),
    );
    const hasHtml = files.includes("index.html");
    const hasCss = files.some((f) => f.endsWith(".css"));
    const hasJs = files.some((f) => f.endsWith(".js"));
    const net = files.find((f) => {
      const text = readFileSync(join(dir, f), "utf8");
      if (f.endsWith(".html")) {
        return /(?:href|src|action|poster)\s*=\s*["']https?:\/\//i.test(text) ||
          /<style[^>]*>[\s\S]*?https?:\/\//i.test(text);
      }
      if (f.endsWith(".css")) return /https?:\/\//.test(text);
      if (f.endsWith(".js")) {
        return /(?:from\s+|import\s*\(|require\s*\()\s*["']https?:\/\//.test(text);
      }
      return false;
    });
    ok = files.length <= 400 && total <= 4 * 1024 * 1024 && !badName && hasHtml && hasCss && hasJs && !net;
    detail = `${files.length} files, ${total} bytes` +
      (badName ? `, bad name ${badName}` : "") +
      (!hasHtml ? ", no index.html" : "") + (!hasCss ? ", no css" : "") +
      (!hasJs ? ", no js" : "") + (net ? `, network address in ${net}` : "");
  } catch (e) {
    ok = false;
    detail = String(e.message);
  }
  gate("dashboard_files", ok, detail);
}

// ---- board.json, parsed once for gates 2-5
let board = null;
let boardBytes = 0;
try {
  const raw = readFileSync(join(outDir, "board.json"));
  boardBytes = raw.length;
  board = JSON.parse(raw.toString("utf8"));
} catch (e) {
  board = null;
}
const slugs = new Set(snap.protocols.map((p) => p.slug));

// ---- 2. board_file
{
  let ok = false;
  let detail = "";
  if (board && Array.isArray(board.rows)) {
    const rows = board.rows;
    const bad = rows.find(
      (r) =>
        typeof r.slug !== "string" || !slugs.has(r.slug) ||
        typeof r.name !== "string" || r.name.length === 0 ||
        !Number.isInteger(r.rank) || r.rank <= 0 ||
        !Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 ||
        r.implied_value_usd > 100000000000000 || !Array.isArray(r.farm_steps),
    );
    ok = rows.length >= 100 && rows.length <= 4000 && !bad && boardBytes <= 8 * 1024 * 1024;
    detail = `${rows.length} rows` + (bad ? `, bad row ${bad.slug ?? "?"}` : "");
  } else {
    detail = "board.json unreadable";
  }
  gate("board_file", ok, detail);
}

// ---- 3. sorted_by_value
{
  let ok = false;
  let detail = "";
  if (board && Array.isArray(board.rows)) {
    const rows = [...board.rows].sort((a, b) => a.rank - b.rank);
    const ranksOk = rows.every((r, i) => r.rank === i + 1);
    const sortedOk = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd);
    const varied = new Set(rows.map((r) => r.implied_value_usd)).size > 1;
    ok = ranksOk && sortedOk && varied;
    detail = ranksOk ? (sortedOk ? "ranks 1..N, values non-increasing" : "values rise with rank") : "ranks not 1..N";
  }
  gate("sorted_by_value", ok, detail);
}

// ---- 4. coverage
{
  let ok = false;
  let detail = "";
  if (board && Array.isArray(board.rows)) {
    const have = new Set(board.rows.map((r) => r.slug));
    const missing = snap.watchlist.filter((s) => !have.has(s));
    ok = missing.length === 0;
    detail = `${snap.watchlist.length - missing.length}/${snap.watchlist.length} watchlist covered` +
      (missing.length ? `, missing ${missing.slice(0, 3).join(",")}` : "");
  }
  gate("coverage", ok, detail);
}

// ---- 5. farm_steps
{
  let ok = false;
  let detail = "";
  if (board && Array.isArray(board.rows)) {
    const bad = board.rows.find((r) => {
      if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) return true;
      return r.farm_steps.some((s) => typeof s !== "string" || s.trim().length < 20 || s.trim().length > 600);
    });
    ok = !bad;
    detail = bad ? `bad farm_steps on ${bad.slug}` : `${board.rows.length} rows, 3-12 steps of 20-600 chars each`;
  }
  gate("farm_steps", ok, detail);
}

// ---- 6. screenshots
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
{
  const dir = join(outDir, "screenshots");
  let ok = false;
  let detail = "";
  try {
    const files = readdirSync(dir).filter((f) => !f.startsWith(".")).sort();
    const infos = files.map((f) => {
      const buf = readFileSync(join(dir, f));
      const png = buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50;
      const jpg = buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
      const dims = png
        ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
        : jpg ? jpegSize(buf) : null;
      return { f, size: buf.length, dims, ok: !!dims };
    });
    const bad = infos.find(
      (x) => !x.ok || x.size > 512 * 1024 ||
        Math.max(x.dims.w, x.dims.h) > 1440 || Math.min(x.dims.w, x.dims.h) < 800,
    );
    ok = files.length >= 3 && files.length <= 4 && !bad;
    detail = infos.map((x) => `${x.f} ${x.dims ? x.dims.w + "x" + x.dims.h : "?"} ${x.size}B`).join(", ");
  } catch (e) {
    detail = String(e.message);
  }
  gate("screenshots", ok, detail);
}

// ---- 7. dossier_matches
{
  let ok = false;
  let detail = "";
  try {
    const expected = await buildDossier(outDir, { text_max_bytes: 65536 });
    const actual = readFileSync(join(outDir, "dossier.json"));
    ok = Buffer.compare(Buffer.from(expected), actual) === 0 && actual.length <= 1.5 * 1024 * 1024;
    detail = `${actual.length} bytes` + (ok ? "" : " (differs from buildDossier output)");
  } catch (e) {
    detail = String(e.message);
  }
  gate("dossier_matches", ok, detail);
}

const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/7 PASS`);
if (!existsSync(join(outDir, "dossier.json"))) console.log("note: no dossier.json in output");
process.exit(passed === 7 ? 0 : 1);
