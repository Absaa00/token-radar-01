# Token Launch Radar — radar-3

A radar for the make.fun `token-radar-01` bounty: 194 pre-token protocols
ranked by an implied value that is **fitted** from the snapshot's own
live-token protocols.

## The model

```
log(mcap / TVL) ~ b0 + b1*log(TVL) + b2*change_7d + b3*age_years + b4*log(chains)
```

Ordinary least squares, solved in-process at run time on the snapshot's
live protocols (128 of them). No coefficient is hardcoded. The 7-day change
is winsorized to ±15% and the predicted multiple is clamped to [0.02, 1.5].

Validation is leave-one-out on the live set, run by the same program that
builds the board, with the naive category-median heuristic scored in the
same loop for comparison. On this snapshot the fitted model scores a median
|log error| of 1.32 against 1.63 for the median heuristic — about a fifth
better out of sample.

## Coverage

Every protocol on the snapshot's watchlist (40) is ranked, plus pre-token
protocols below the $50M floor with at least $10M TVL that pass the house
filter (no bridges, no liquid staking or restaking, no CEX, no wrapped /
staked / versioned names). Protocols above the floor enter only through the
watchlist. Live-token protocols are the fitting set, shown in the dashboard's
Live token tab.

## Farm plans

Each row carries six concrete steps with cost and time, and a deposit sized
to the protocol: $5,000 / $2,000 / $1,000 / $500 by implied value. Setup is
about $45 in gas and 60 minutes; upkeep about $5 a week and 15 minutes a
week.

## Run

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
node tools/gate-check.mjs out
```

Run order: run `main.ts` once (writes `out/board.json` and
`dashboard/data.js`), take the screenshots with `tools/shoot.mjs`, then run
`main.ts` again so `out/dossier.json` includes the screenshots. The run is
deterministic — the same snapshot always builds the same board.

## Files

- `main.ts` — entrypoint: fit, rank, write board + data + dossier
- `lib/model.ts` — the fitted model, LOO validation, board selection, farm steps
- `dashboard/` — the page (index.html, app.css, app.js, 00-summary.md, data.js)
- `vendor/makefun-board.ts` — the kit's dossier library, verbatim
- `tools/gate-check.mjs` — the seven scorer rows, checked locally
- `tools/shoot.mjs` — the three screenshots (Playwright, 1440x900 JPEG)
