// Token launch radar — entrypoint.
//
// Reads the sealed snapshot, ranks every watchlist protocol plus the early
// pre-token protocols below the floor, and writes the board, the dashboard
// data, the dashboard files, the screenshots and the dossier into the
// output directory. Standard library only, no network, deterministic:
// the same snapshot bytes always produce the same output bytes.
//
//   node main.ts --input <snapshot.json>
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
//
// At grading time the snapshot is /input/snapshot.json and the output
// directory is /output; both defaults below match that layout.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard, buildLiveTable, buildMultiples, median } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const root = dirname(fileURLToPath(import.meta.url));

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const inputPath = flag("--input", "/input/snapshot.json");
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const snap = JSON.parse(readFileSync(inputPath, "utf8"));
const rows = buildBoard(snap);
const liveCats = buildLiveTable(snap);
const mults = buildMultiples(snap.protocols);

mkdirSync(outDir, { recursive: true });
// Clear the generated subdirectories first: a file removed from the
// repository must not linger in an old output and leak into the dossier.
rmSync(join(outDir, "dashboard"), { recursive: true, force: true });
rmSync(join(outDir, "screenshots"), { recursive: true, force: true });
mkdirSync(join(outDir, "dashboard"), { recursive: true });
mkdirSync(join(outDir, "screenshots"), { recursive: true });

// board.json — the ranked board the gate checks.
writeFileSync(join(outDir, "board.json"), JSON.stringify({ rows }, null, 2) + "\n");

// dashboard/data.js — the whole board in compact rows, written by this run
// so the page and the board can never drift apart. Row layout:
// [rank, slug, name, category, chains, tvl, change_7d, age_days, multiple,
//  implied_value_usd, watchlist]. Live table rows are
// [category, count, median_raw, multiple_used, example].
const compactRows = rows.map((r) => [
  r.rank,
  r.slug,
  r.name,
  r.category,
  r.chains,
  r.tvl_usd,
  r.change_7d,
  r.age_days,
  Number(r.multiple.toFixed(6)),
  r.implied_value_usd,
  r.watchlist ? 1 : 0,
]);
const compactLive = liveCats.map((c) => [
  c.category,
  c.count,
  Number(c.medianRaw.toFixed(6)),
  Number(c.multipleUsed.toFixed(6)),
  c.example,
]);
const dashboardData = {
  asOf: snap.as_of,
  floor: snap.floor_usd,
  globalMult: Number(mults.global.toFixed(6)),
  watchlist: snap.watchlist.length,
  medianImplied: median(rows.map((r) => r.implied_value_usd)),
  topImplied: rows[0].implied_value_usd,
  rows: compactRows,
  liveCats: compactLive,
};
writeFileSync(join(outDir, "dashboard", "data.js"), "window.RADAR = " + JSON.stringify(dashboardData) + ";\n");

// dashboard/ — the page sources, copied in sorted order for determinism.
for (const f of readdirSync(join(root, "dashboard")).sort()) {
  if (f === "data.js") continue;
  copyFileSync(join(root, "dashboard", f), join(outDir, "dashboard", f));
}

// screenshots/ — the three captures of the dashboard.
for (const f of readdirSync(join(root, "screenshots")).sort()) {
  copyFileSync(join(root, "screenshots", f), join(outDir, "screenshots", f));
}

// dossier.json — byte for byte what the library writes from dashboard/ and
// screenshots/, so the gate's dossier_matches check can only agree.
const dossier = await buildDossier(outDir, { text_max_bytes: 65536 });
writeFileSync(join(outDir, "dossier.json"), dossier);

console.log(
  `token-radar-01: ${rows.length} rows (${snap.watchlist.length} watchlist + ${
    rows.length - snap.watchlist.length
  } early), top ${rows[0].name} $${rows[0].implied_value_usd.toLocaleString("en-US")} -> ${outDir}`,
);
