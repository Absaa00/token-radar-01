# Token Launch Radar — radar-3

## What this board is

194 pre-token protocols, ranked by an implied value that is **fitted**
from the snapshot's own live-token protocols. 40 of the rows are the
snapshot's watchlist, covered in full; the other 154 are pre-token
protocols below the $50M floor with at least $10M TVL that pass the house
filter (no bridges, no liquid staking or restaking, no CEX, no wrapped /
staked / versioned names). Protocols above the floor enter only through
the watchlist. The 128 live-token protocols are not board rows — they are
the comparables the model is fitted on, shown in the Live token tab.

## The model, and why it beats a median

```
log(mcap / TVL) = 7.128 - 0.498*log(TVL) - 2.670*change_7d
                - 0.063*age_years + 0.104*log(chains)
```

Ordinary least squares, fitted at run time on the 128 live protocols. No
coefficient is hardcoded and no protocol name ever enters the fit. The
7-day change is winsorized to ±15% and the predicted multiple is clamped
to [0.02, 1.5], so no wild week and no outlier can put a protocol on top.

What the coefficients say: bigger protocols carry smaller multiples (a
10x TVL means roughly a 0.32x multiple); fast weekly growth predicts a
smaller multiple, not a larger one; age barely matters; multi-chain
protocols carry slightly larger multiples. The live median multiple is
0.223.

Validation is leave-one-out on the live set — each live protocol held out,
the model refit on the other 127, the error recorded — with the naive
category-median heuristic scored in the same loop:

| Model | Median \|log error\| | Mean \|log error\| |
|---|---|---|
| Fitted OLS (this board) | 1.321 | 1.638 |
| Category-median heuristic | 1.633 | 1.929 |

The fitted model is about a fifth more accurate out of sample. That is
the whole point of this rebuild: the previous board multiplied a category
median by hand-picked growth, maturity and breadth factors, and those
factors pointed the wrong way — the growth factor rewarded fast weekly
growth while the data says fast growth predicts a *smaller* multiple.

## Top 10 by implied value

| # | Protocol | Implied value | TVL | Multiple |
|---|---|---|---|---|
| 1 | Steakhouse Financial | $85,415,619 | $2,753,981,495 | 0.031x |
| 2 | Veda | $75,776,524 | $1,563,415,482 | 0.049x |
| 3 | Gauntlet | $53,705,575 | $1,577,685,462 | 0.034x |
| 4 | USDD | $46,290,565 | $1,055,793,606 | 0.044x |
| 5 | Nonce Capital | $41,016,617 | $513,783,671 | 0.080x |
| 6 | Bittensor dTAO | $29,908,105 | $376,026,255 | 0.080x |
| 7 | RockawayX | $29,199,118 | $292,506,628 | 0.100x |
| 8 | Upshift | $27,447,935 | $499,083,733 | 0.055x |
| 9 | K3 Capital | $27,305,488 | $207,711,162 | 0.132x |
| 10 | b14g | $25,533,970 | $173,941,404 | 0.147x |

Median implied value across the board: about $7.0M. The biggest
protocols sit on top because their TVL is enormous even at a small
multiple; the model does not hand the crown to a small protocol on a
single hot week.

## Farm plans

Every row carries six concrete steps with cost and time, and a deposit
sized to the protocol: $5,000 for implied value at or above $50M, $2,000
at or above $20M, $1,000 at or above $10M, $500 below that. Setup is
about $45 in gas and 60 minutes; upkeep is about $5 a week and 15 minutes
a week. The steps are the same for every protocol in shape — fund a fresh
wallet, bridge through the official bridge, take the core position,
stake the receipt token when a points program exists, check weekly, plan
the exit before the token launches — and differ in the chain, the deposit
and the core action the category calls for.

## How to read the board

Click any row for the model breakdown: TVL times the fitted multiple,
with each feature's log-point contribution shown, plus the six-step farm
plan. Filter by category, chain, minimum TVL, or search by name. The Live
token tab shows the 30 largest live comparables the model learned from.
