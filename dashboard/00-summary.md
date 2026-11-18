# Token Launch Radar — radar-4

A radar for the 194 pre-token protocols in the snapshot that matter most: the
40 on the house watchlist, plus the 154 largest pre-token protocols below the
$50M floor. Every protocol is ranked by implied value — what its token would
be worth if it launched today at the multiple the market already pays for
live tokens like it.

## The model

Implied value = TVL x fitted multiple. The multiple is fitted, not assumed:
log(market cap / TVL) is regressed on log TVL, the 7-day TVL change
(winsorized to +/-15%), age, log chain count, and three interactions, over the
128 live-token protocols in this snapshot — fitted by Huber regression
(delta 1.345), which down-weights the few live tokens trading at 20-400x TVL
instead of letting them drag the fit. log TVL, change and age enter centered
at their live-set means. The fitted multiple is clamped to [0.02, 1.5].

Validation is leave-one-out over the same 128 live protocols, computed when
the program runs, with the same clamp: median |log error| **1.198** (mean
1.642), against **1.623** (mean 1.807) for the median-ratio heuristic — the
fit is about 26% more accurate than the naive multiple at the median. A
typical prediction is still off by a factor of about e^1.2 ≈ 3.3x; the board
is a ranking under uncertainty, not a price forecast, and no protocol is
guaranteed to issue a token at all.

## Top 10

1. Steakhouse Financial — $154,375,860 (Risk Curators, $2.75B TVL)
2. Gauntlet — $151,348,738 (Risk Curators, $1.58B TVL)
3. Upshift — $87,546,033 (Onchain Capital Allocator, $499M TVL)
4. USDD — $84,283,879 (CDP, $1.06B TVL)
5. Veda — $82,170,155 (Onchain Capital Allocator, $1.56B TVL)
6. Lofty — $52,821,507 (RWA, $101M TVL, multiple 0.52x)
7. Nonce Capital — $40,313,355 (Risk Curators, $514M TVL)
8. OpenTrade — $34,566,455 (RWA, $242M TVL)
9. OnRe — $32,587,675 (RWA, $309M TVL)
10. Plume Vaults — $31,586,779 (RWA, $212M TVL)

Median implied value across the 194 rows is $6,457,976. Risk curators and
capital allocators dominate the top: the market pays the highest multiples
for protocols that allocate other people's capital. RWA vaults punch above
their TVL on multiples near 0.1-0.5x.

## How to use it

Open a protocol's row for its model breakdown — the nine fitted
contributions that build its multiple — and a six-step farm plan with a sized
deposit ($500-$5,000 by TVL), cost and time. Filter by category, chain, or
minimum TVL; sort by implied value, TVL, multiple, 7-day change, or age.
The Live tab shows the 30 largest live-token protocols the model learned
from, with their actual market caps and mcap/TVL ratios.

Data: DefiLlama protocols snapshot, as of 2026-11-14. A protocol is listed
as pre-token because its record carries no token — that is what the record
says, not proof it has none.
