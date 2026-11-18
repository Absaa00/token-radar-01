[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Absaa00/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Absaa00/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# radar-4 — Token Launch Radar

A program that reads a frozen DefiLlama snapshot and ranks the protocols that
record no token yet by what their launch would be worth — then hands you a
dashboard showing the board, a detail view for every protocol, and a concrete
six-step farm plan for each one.

## The idea in one paragraph

A token launch is worth roughly what the market already pays for similar
protocols. This entry fits a robust Huber regression for `log(market cap /
TVL)` on the snapshot's own live-token protocols (144 of them), using nine
features — log TVL, seven-day TVL change, age, chain count, and their
interactions — and applies it to the 194 pre-token protocols on the board.
The predicted multiple, clamped to [0.02, 1.5], times TVL is the implied
value. Nothing is a hardcoded list: run the program again and every
coefficient is refitted from the same snapshot.

## What it produces

- **Board of 134 rows** — the full 40-protocol watchlist plus 94 early
  protocols below the $50M floor (down to $10M TVL), ranked by implied value.
  A protocol at or above the floor that the watchlist leaves out is a child
  product of another protocol, so it is not ranked as a launch of its own.
- **Leave-one-out validation** — the model is refitted without each live
  protocol in turn; the dashboard reports the median absolute log error.
- **Farm plans** — six steps per protocol with a deposit sized by implied
  value ($5,000 / $2,000 / $1,000 / $500) and a setup of about $45 plus
  60 minutes.
- **Dashboard** — hero stats, Top 10 spotlight, value by category, search /
  category / chain / TVL filters, sort, pre-token and live-token tabs, and a
  detail dialog per protocol with the full model reading and farm plan.

## Run it

Node 22 or later, standard library only, no network at run time:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to>/snapshot.json
```

That writes `out/board.json`, `out/dashboard/` (the page plus its generated
`data.js`), `out/screenshots/` and `out/dossier.json`. Run it twice into two
directories and the bytes are identical.

## Honest reading

"Pre-token" means the snapshot records no token — DefiLlama's record is not
proof a protocol has none. Wrapped, staked and bridged products of tokens
that already trade are left out. Every implied value is this entry's own
claim, never make.fun's, and a launch may never come at all.

## License

MIT — see `LICENSE`.
