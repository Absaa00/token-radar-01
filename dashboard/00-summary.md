# Token Radar — what this board is and how to read it

178 pre-token protocols from the DefiLlama index (snapshot 2026-11-14), ranked by what a
token launch would be worth if each protocol's record stayed as it is. 40 are the watchlist
(every protocol with $50M+ TVL and no token on record); 138 are the early radar below that
floor. The board is a model, not a prediction that any token launches.

## The model (radar-2)

implied = TVL x category multiple x growth x maturity x breadth. The category multiple is
the MEDIAN market-cap / TVL of the live-token protocols in that category (3+ comparables,
clamped 0.08–0.90); a category with fewer live comparables uses the global median 0.214
across all 128 live protocols. Growth is 1 + clamp(7d change, -40%, +60%) / 100 x 0.5.
Maturity is 0.7 + min(age, 1095d) / 1095 x 0.3 (unknown age = 365d). Breadth is
1 + 0.02 x min(chains - 1, 10). No protocol name is special-cased; the same function scores
every row, and each detail view shows its four factors. Wrapped, staked and bridged products
of tokens that already trade are excluded, as are exchanges and versioned pools.

## Top 10 by implied value

1. Steakhouse Financial — $593M (Risk Curators, TVL $2.75B, Base+10 chains)
2. Gauntlet — $353M (Risk Curators, TVL $1.58B, Base+13 chains)
3. Veda — $336M (Onchain Capital Allocator, TVL $1.56B, Ink+12 chains)
4. USDD — $158M (CDP, TVL $1.06B, Tron+2 chains)
5. Upshift — $119M (Onchain Capital Allocator, TVL $499M, Ethereum+14 chains)
6. Bittensor dTAO — $89M (Dexs, TVL $376M, Bittensor)
7. Nonce Capital — $76M (Risk Curators, TVL $514M)
8. OnRe — $71M (RWA, TVL $309M, Solana)
9. OpenTrade — $61M (RWA, TVL $242M)
10. Plume Vaults — $56M (RWA, TVL $212M)

Risk curators dominate: 33 of 178 rows. Their multiple is the global median (only 1 live
comparable), so their rank comes from sheer TVL and age, not a generous multiple.

## How to use it

Search, filter by category, main chain or minimum TVL, sort by implied value, TVL, 7-day
growth, age or name. Select any row for its model breakdown and a 6-step farm plan (fresh
wallet, the category's main action, one qualifying action a week, hold 30–60 days, claim
only from the protocol's own links, keep a farm log). The Live token tab shows the 24
largest live-token protocols whose market caps calibrate the multiples.

## Caveats

"Records no token" means the snapshot carries none; a protocol may still have a token its
record does not carry. Implied values are the entry's own claim, never a price. Never pay
anyone to claim for you.
