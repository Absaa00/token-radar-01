# Token Radar — 178 pre-token protocols ranked by implied value

A token launch radar for the make.fun bounty "Build the best token launch
radar". It reads the sealed DefiLlama snapshot, ranks the protocols that
record no token by an implied value the entry computes itself, and shows a
reader how to farm each one.

## Model: radar-2

```
implied = TVL x category multiple x growth x maturity x breadth
```

- **Category multiple** — the median mcap/TVL of the category's live
  protocols (at least 3 live comparables, clamped to [0.08, 0.90]).
  Categories with fewer than 3 live comparables use the global median
  (0.2138 over 128 live protocols; live = the snapshot records a market
  cap above zero).
- **Growth** — 1 + clamped 7-day TVL change (-40% to +60%) x 0.5.
- **Maturity** — 0.7 + min(age in days, 1095) / 1095 x 0.3 (unknown age = 365).
- **Breadth** — 1 + 0.02 x min(chains - 1, 10).

No protocol name is special-cased: every figure is computed from the
snapshot at run time.

## Board

178 rows: the full 40-protocol house watchlist (TVL >= $50M, no token
recorded) plus 138 early pre-token protocols below the floor that pass the
house filters (not a bridge, liquid staking/restaking, or CEX category; not
a versioned, wrapped, or staked name; not an exchange-prefixed name).
Rank 1 is Steakhouse Financial at $593,137,929 implied; the median implied
value is $3,596,243.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
node tools/gate-check.mjs out
```

`main.ts` (Node 22, standard library only) writes `board.json`, the
dashboard data (`dashboard/data.js`), copies `dashboard/` and
`screenshots/` into the output directory, and writes `dossier.json` with
`buildDossier` from `vendor/makefun-board.ts`. Running it twice on the
same snapshot produces byte-identical output.

## Layout

- `main.ts` — entrypoint: read snapshot, build board, write outputs.
- `lib/model.ts` — the radar-2 model, board selection, and farm plans.
- `vendor/makefun-board.ts` — the kit's dossier library (verbatim).
- `dashboard/` — `index.html`, `app.css`, `app.js`, `00-summary.md`;
  `data.js` is written by `main.ts` at run time, never by hand.
- `tools/shoot.mjs` — the three dashboard screenshots (Playwright).
- `tools/gate-check.mjs` — the seven local gates.
- `screenshots/` — `1-board.jpg`, `2-detail.jpg`, `3-filtered.jpg`.

## Note

An implied value is this entry's own claim, never a price prediction and
never a promise that a token will be issued. "Records no token" means the
snapshot carries no token record for the protocol — not proof it has none.
