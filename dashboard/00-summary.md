# radar-4 — summary

## What this board is

A token launch radar over a frozen DefiLlama snapshot (758 protocols at or
above $5M of TVL, as of 2026-11-14). It ranks the protocols that record no
token yet by an implied value — what a token would be worth if the
protocol's record stayed as it is — and gives every ranked protocol a
six-step farm plan with costs and times. The board holds 134 rows: the
whole 40-protocol watchlist, plus 94 early protocols below the $50M floor
down to $10M of TVL. A protocol at or above the floor that the watchlist
leaves out is a child product of another protocol, not a launch of its own,
so it is not ranked. "Pre-token" means the snapshot records no token;
DefiLlama's record is not proof a protocol has none.

## How the value is worked out

A robust Huber regression (delta 1.345, IRLS, scale s = 1.4826 x median
absolute residual) for log(market cap / TVL), fitted at run time on the 128
protocols in the snapshot that record a token with a market cap above zero.
Nine features, each centred on the live set's mean: log TVL, seven-day TVL
change winsorised to +/-15%, age in days, log chain count, and the
interactions ch7d squared, ch7d x logTVL, ch7d x age and logTVL x age. The
predicted multiple is exp(prediction), clamped to [0.02, 1.5]; implied
value is TVL times that multiple. Nothing is a hardcoded list of names:
rerun the program and every coefficient is refitted from the same figures.

Leave-one-out validation — refit without each live protocol in turn and
predict the held-out one — gives a median absolute log error of 1.202
(mean 1.648), against 1.623 for a median-multiple baseline, so the nine
features earn their keep. The median live multiple is x0.21. The board's
median implied value is $7.28M.

## Top 10

Steakhouse Financial leads the board at $154.7M of implied value, a Risk
Curators vault operator across eleven chains with $2.75B of TVL; Gauntlet
follows at $152.0M, the same trade at $1.58B of TVL. Upshift is third at
$87.9M and Veda fifth at $82.2M, both onchain capital allocators, split by
USDD at $84.3M, the CDP stablecoin. Lofty, a real-world-asset platform, is
sixth at $52.7M. Nonce Capital ($40.3M), OpenTrade ($34.5M), OnRe
($32.5M) and Plume Vaults ($31.5M) complete the top ten. The top two are
both risk-curators: the market already pays real multiples for curated
vault businesses, and these two are the largest pre-token examples of it.

## How to farm it

Every protocol carries six steps: fund a fresh wallet (about $45 of setup
plus 60 minutes), deposit a sized amount ($5,000 at $50M of implied value
and up, $2,000 at $20M, $1,000 at $5M, $500 below that), return weekly,
work the points tasks, hold at least 30 days, and claim promptly when a
snapshot lands. The plan is a routine, not a promise: a launch may never
come, and the implied value is a what-if, not a price.
