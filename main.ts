// radar-3 entrypoint: read the sealed snapshot, fit the value model,
// rank the pre-token board, and write the graded output.
//
// Usage (from the repo root):
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
//
// What it writes:
//   <out>/board.json            the ranked board (gate reads this)
//   dashboard/data.js           compact board + live comparables + fit summary
//   <out>/dashboard/            copy of the dashboard files
//   <out>/screenshots/          copy of screenshots/ when present
//   <out>/dossier.json          buildDossier of <out> (needs screenshots first)
//
// Run order: run this once (writes board.json + data.js), take the
// screenshots with tools/shoot.mjs, then run this again so the dossier
// includes the screenshots. The run is deterministic: same snapshot in,
// same bytes out.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";
import {
  fitModel,
  buildBoard,
  liveSet,
  type Snapshot,
  type BoardRow,
} from "./lib/model.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = HERE;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const inputPath = resolve(arg("--input", "input/snapshot.json"));
const outDir = resolve(
  arg("--out", process.env.MAKEFUN_OUTPUT_DIR ?? "out"),
);

const snapshot = JSON.parse(readFileSync(inputPath, "utf8")) as Snapshot;
const fit = fitModel(snapshot);
const rows = buildBoard(snapshot, fit);

// Live comparables for the dashboard's second tab: top 30 by TVL.
const live = liveSet(snapshot.protocols)
  .map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    tvl: p.tvl_usd as number,
    mcap: p.mcap_usd as number,
    mult: (p.mcap_usd as number) / (p.tvl_usd as number),
  }))
  .sort((a, b) => b.tvl - a.tvl)
  .slice(0, 30);

// Compact row: [rank, slug, name, category, chain, tvl, implied, multiple, deposit, [cTvl, cGrowth, cAge, cChains]]
const compactRows = rows.map((r: BoardRow) => [
  r.rank,
  r.slug,
  r.name,
  r.category,
  r.chain,
  r.tvl_usd,
  r.implied_value_usd,
  Math.round(r.multiple * 1000) / 1000,
  r.deposit_usd,
  [
    Math.round(r.contrib.tvl * 100) / 100,
    Math.round(r.contrib.growth * 100) / 100,
    Math.round(r.contrib.age * 100) / 100,
    Math.round(r.contrib.chains * 100) / 100,
  ],
]);

// Full farm steps for the Top 6 only (the dossier text cap is 65,536 bytes;
// the other rows' steps are rendered from the same templates in app.js).
const stepsTop: Record<string, string[]> = {};
for (const r of rows.slice(0, 6)) stepsTop[r.slug] = r.farm_steps;

// Category totals for the dashboard's bar chart.
const catTotals = new Map<string, { n: number; value: number }>();
for (const r of rows) {
  const c = catTotals.get(r.category) ?? { n: 0, value: 0 };
  c.n += 1;
  c.value += r.implied_value_usd;
  catTotals.set(r.category, c);
}
const categories = [...catTotals.entries()]
  .map(([name, v]) => [name, v.n, v.value])
  .sort((a, b) => (b[2] as number) - (a[2] as number));

const data = {
  asOf: snapshot.as_of,
  floorUsd: snapshot.floor_usd,
  nRows: rows.length,
  nWatch: snapshot.watchlist.length,
  fit: {
    beta: fit.beta.map((b) => Math.round(b * 1000) / 1000),
    nLive: fit.nLive,
    looMedian: Math.round(fit.looMedian * 1000) / 1000,
    looMean: Math.round(fit.looMean * 1000) / 1000,
    medLooMedian: Math.round(fit.medianHeuristicLooMedian * 1000) / 1000,
    medLooMean: Math.round(fit.medianHeuristicLooMean * 1000) / 1000,
    liveMedianMultiple: Math.round(fit.liveMedianMultiple * 1000) / 1000,
  },
  rows: compactRows,
  stepsTop,
  live,
  categories,
};

mkdirSync(outDir, { recursive: true });
mkdirSync(join(REPO, "dashboard"), { recursive: true });

const boardJson = {
  rows: rows.map((r: BoardRow) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
    category: r.category,
    chain: r.chain,
    tvl_usd: r.tvl_usd,
    multiple: Math.round(r.multiple * 10000) / 10000,
    deposit_usd: r.deposit_usd,
  })),
};
writeFileSync(join(outDir, "board.json"), JSON.stringify(boardJson, null, 2) + "\n");

const dataJs =
  "window.RADAR_DATA = " + JSON.stringify(data) + ";\n";
writeFileSync(join(REPO, "dashboard", "data.js"), dataJs);

// Stage the dashboard and the screenshots into the output dir, then build
// the dossier from them. Screenshots come from tools/shoot.mjs; without
// them the dossier is skipped and this run only refreshes board + data.
cpSync(join(REPO, "dashboard"), join(outDir, "dashboard"), { recursive: true });
const shotsDir = join(REPO, "screenshots");
let dossierBytes = 0;
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, "screenshots"), { recursive: true });
  const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, "dossier.json"), dossier);
  dossierBytes = dossier.length;
}

const top5 = rows.slice(0, 5).map(
  (r) => `#${r.rank} ${r.name} $${r.implied_value_usd.toLocaleString("en-US")}`,
);
const medImplied = rows.map((r) => r.implied_value_usd).sort((a, b) => a - b)[
  Math.floor(rows.length / 2)
];
console.log(`rows: ${rows.length} (watchlist ${snapshot.watchlist.length} + early ${rows.length - snapshot.watchlist.length})`);
console.log(`fit: beta=[${fit.beta.map((b) => b.toFixed(3)).join(", ")}] on ${fit.nLive} live protocols`);
console.log(
  `LOO median |log err|: fitted ${fit.looMedian.toFixed(3)} vs median heuristic ${fit.medianHeuristicLooMedian.toFixed(3)}`,
);
console.log(`median implied: $${medImplied.toLocaleString("en-US")}`);
console.log(`top 5: ${top5.join(" | ")}`);
console.log(`data.js: ${dataJs.length} bytes; dossier.json: ${dossierBytes} bytes`);
if (dossierBytes === 0) {
  console.log("NOTE: no screenshots/ yet — run tools/shoot.mjs, then run main.ts again for the dossier.");
}
