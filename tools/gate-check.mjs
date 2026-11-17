// Local gate: the seven scorer rows from the competition brief, checked
// against an output directory. Usage: node tools/gate-check.mjs out
//
//   dashboard_files  dashboard/ holds index.html + >=1 .css + >=1 .js,
//                    <=400 files, <=4 MiB, no http(s) URL in any attribute,
//                    CSS file or JS import.
//   board_file       board.json rows 100..4000, each with a snapshot slug,
//                    non-empty name, positive whole rank, positive whole
//                    implied_value_usd <= 1e14, farm_steps array.
//   sorted_by_value  ranks exactly 1..N, implied values never rise.
//   coverage         every watchlist slug appears among the rows.
//   farm_steps       every row's farm_steps holds 3..12 strings of
//                    20..600 chars once trimmed.
//   screenshots      3..4 images, each a whole PNG/JPEG <=512 KiB, long
//                    side <=1440, short side >=800.
//   dossier_matches  dossier.json is byte-for-byte buildDossier(output).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { buildDossier } from "../vendor/makefun-board.ts";

const outDir = process.argv[2] ?? "out";
const kitInput = process.argv[3] ?? "/home/hatch/workspace/makefun/kit-token-radar-01/input/snapshot.json";

const fails = [];
const pass = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fails.push(name);
};

const snap = JSON.parse(readFileSync(kitInput, "utf8"));
const slugs = new Set(snap.protocols.map((p) => p.slug));
const watch = snap.watchlist;

// dashboard_files
{
  const dir = join(outDir, "dashboard");
  const files = existsSync(dir) ? readdirSync(dir) : [];
  let ok = files.includes("index.html");
  let css = 0;
  let js = 0;
  let total = 0;
  let badUrl = "";
  for (const f of files) {
    const st = statSync(join(dir, f));
    total += st.size;
    if (f.endsWith(".css")) css++;
    if (f.endsWith(".js")) js++;
    const text = readFileSync(join(dir, f), "utf8");
    if (/https?:\/\//.test(text) && /\.(html|css|js)$/.test(f)) {
      // URLs are refused only in attributes, style bodies and imports;
      // visible text may carry them. Flag only the risky patterns.
      if (/(href|src|@import|import\s|from\s+["'])https?:\/\//.test(text)) badUrl = f;
    }
  }
  if (css < 1 || js < 1) ok = false;
  if (files.length > 400 || total > 4 * 1024 * 1024) ok = false;
  if (badUrl) ok = false;
  pass("dashboard_files", ok, `${files.length} files, ${(total / 1024).toFixed(1)} KiB${badUrl ? ", URL in " + badUrl : ""}`);
}

// board_file + sorted_by_value + coverage + farm_steps
const board = JSON.parse(readFileSync(join(outDir, "board.json"), "utf8"));
const rows = board.rows ?? board;
{
  let ok = Array.isArray(rows) && rows.length >= 100 && rows.length <= 4000;
  let bad = "";
  for (const r of rows) {
    if (!slugs.has(r.slug)) { ok = false; bad = "unknown slug " + r.slug; break; }
    if (!r.name || !Number.isInteger(r.rank) || r.rank <= 0) { ok = false; bad = "bad rank/name " + r.slug; break; }
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) { ok = false; bad = "bad implied " + r.slug; break; }
    if (!Array.isArray(r.farm_steps)) { ok = false; bad = "no farm_steps " + r.slug; break; }
  }
  const allSame = rows.length > 1 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd);
  if (allSame) { ok = false; bad = "all implied values equal"; }
  pass("board_file", ok, `${rows.length} rows${bad ? ", " + bad : ""}`);
}
{
  let ok = true;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) { ok = false; break; }
    if (i > 0 && rows[i].implied_value_usd > rows[i - 1].implied_value_usd) { ok = false; break; }
  }
  pass("sorted_by_value", ok);
}
{
  const have = new Set(rows.map((r) => r.slug));
  const missing = watch.filter((w) => !have.has(w));
  pass("coverage", missing.length === 0, `${watch.length - missing.length}/${watch.length} watchlist${missing.length ? ", missing " + missing.slice(0, 3).join(",") : ""}`);
}
{
  let ok = true;
  let bad = "";
  for (const r of rows) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) { ok = false; bad = r.slug + " step count"; break; }
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) { ok = false; bad = `${r.slug} step ${t.length} chars`; break; }
    }
    if (!ok) break;
  }
  pass("farm_steps", ok, bad);
}

// screenshots
{
  const dir = join(outDir, "screenshots");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith(".")) : [];
  let ok = files.length >= 3 && files.length <= 4;
  let detail = `${files.length} images`;
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!isJpeg && !isPng) { ok = false; detail += `, ${f} not an image`; continue; }
    if (buf.length > 512 * 1024) { ok = false; detail += `, ${f} ${(buf.length / 1024).toFixed(0)} KiB over cap`; }
    let w = 0;
    let h = 0;
    if (isPng) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
    if (isJpeg) {
      // Walk the markers for the SOF frame.
      let i = 2;
      while (i < buf.length - 1) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          h = buf.readUInt16BE(i + 5);
          w = buf.readUInt16BE(i + 7);
          break;
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    if (long > 1440 || short < 800) { ok = false; detail += `, ${f} ${w}x${h}`; }
    else detail += `, ${f} ${w}x${h} ${(buf.length / 1024).toFixed(0)} KiB`;
  }
  pass("screenshots", ok, detail);
}

// dossier_matches
{
  let ok = false;
  let detail = "";
  try {
    const expected = buildDossier(outDir, { text_max_bytes: 65536 });
    const actual = readFileSync(join(outDir, "dossier.json"));
    ok = Buffer.compare(Buffer.from(expected), actual) === 0;
    detail = `dossier ${actual.length} bytes, expected ${expected.length}`;
    // How much dashboard text the judge actually reads.
    const text = JSON.parse(new TextDecoder().decode(actual)).text ?? "";
    detail += `, dossier text ${Buffer.byteLength(text, "utf8")} bytes (cap 65536)`;
  } catch (e) {
    detail = String(e.message ?? e);
  }
  pass("dossier_matches", ok, detail);
}

console.log(fails.length === 0 ? "GATE 7/7 PASS" : `GATE ${7 - fails.length}/7 — failed: ${fails.join(", ")}`);
process.exit(fails.length === 0 ? 0 : 1);
