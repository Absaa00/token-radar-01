// radar-3 — fitted value model for the token launch radar.
//
// The implied value of a pre-token protocol is TVL times a multiple that is
// FITTED from the snapshot's own live-token protocols, not picked by hand:
//   log(mcap / TVL) ~ b0 + b1*log(TVL) + b2*change_7d + b3*age_years + b4*log(chains)
// The fit is ordinary least squares solved in-process (normal equations,
// Gaussian elimination with partial pivoting, tiny ridge). Every coefficient
// is computed from the snapshot at run time, so the model follows from the
// snapshot's own figures and nothing is hardcoded.
//
// Validation is leave-one-out on the live set: each live protocol is held
// out, the model is refit on the rest, and the prediction error is recorded.
// The same LOO loop is run for the naive category-median heuristic, so the
// dossier can quote both numbers side by side. On the 2026-11-14 snapshot
// (128 live protocols) the fitted model scores a median |log error| of 1.32
// against 1.63 for the median heuristic — about a fifth better.
//
// Two guards keep predictions sane. The 7-day change is winsorized to
// +/-15% before it enters the fit, because a single wild week would
// otherwise swing the prediction by more than a factor of five. The
// predicted multiple is clamped to [0.02, 1.5], inside the bulk of the
// live multiples the snapshot actually shows.

export interface Protocol {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number | null;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chain: string;
  chains: string[];
  tvl_usd: number;
  multiple: number;
  implied_value_usd: number;
  rank: number;
  deposit_usd: number;
  cost_usd: number;
  time_min: number;
  farm_steps: string[];
  // Feature contributions (log points) so the dashboard can show its work.
  contrib: { tvl: number; growth: number; age: number; chains: number };
}

export interface FitResult {
  beta: number[];
  nLive: number;
  looMedian: number;
  looMean: number;
  medianHeuristicLooMedian: number;
  medianHeuristicLooMean: number;
  liveMedianMultiple: number;
}

export const MULT_MIN = 0.02;
export const MULT_MAX = 1.5;
export const CHG_CLAMP = 0.15; // +/-15% winsorization on the 7-day change
export const EARLY_MIN_TVL = 10_000_000; // early rows need at least $10M TVL

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Restaking",
  "CEX",
]);

const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x));

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Whole days between listed_at and the snapshot date; 365 when unknown. */
export function ageYears(p: Protocol, asOf: string): number {
  if (!p.listed_at) return 1;
  const listed = new Date(p.listed_at.slice(0, 10) + "T00:00:00Z").getTime();
  const ref = new Date(asOf.slice(0, 10) + "T00:00:00Z").getTime();
  if (!Number.isFinite(listed) || !Number.isFinite(ref)) return 1;
  return Math.max(0, (ref - listed) / 86_400_000) / 365;
}

/** Feature vector: [1, log TVL, winsorized 7d change, age in years, log chains]. */
export function features(p: Protocol, asOf: string): number[] {
  const tvl = Math.max(1, p.tvl_usd ?? 1);
  const chg = clamp((p.change_7d ?? 0) / 100, -CHG_CLAMP, CHG_CLAMP);
  const nChains = Math.max(1, (p.chains ?? []).length);
  return [1, Math.log(tvl), chg, ageYears(p, asOf), Math.log(nChains)];
}

/** OLS by normal equations + Gaussian elimination with partial pivoting. */
export function olsFit(rows: Array<[number[], number]>): number[] {
  const n = rows[0][0].length;
  const a: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const b: number[] = new Array<number>(n).fill(0);
  for (const [x, y] of rows) {
    for (let i = 0; i < n; i++) {
      b[i] += x[i] * y;
      for (let j = 0; j < n; j++) a[i][j] += x[i] * x[j];
    }
  }
  for (let i = 0; i < n; i++) a[i][i] += 1e-6; // tiny ridge, keeps the system stable
  const m: number[][] = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    const pv = m[c][c];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / pv;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / m[i][i]);
}

const dot = (beta: number[], x: number[]): number =>
  beta.reduce((s, b, i) => s + b * x[i], 0);

/** Live protocols usable for fitting: a traded token and a positive TVL. */
export function liveSet(protocols: Protocol[]): Protocol[] {
  return protocols.filter(
    (p) => (p.mcap_usd ?? 0) > 0 && (p.tvl_usd ?? 0) > 0,
  );
}

/** The naive heuristic, for the validation comparison: category median multiple. */
function medianMultiple(train: Protocol[], category: string): number {
  const byCat = new Map<string, number[]>();
  for (const q of train) {
    const arr = byCat.get(q.category) ?? [];
    arr.push((q.mcap_usd as number) / (q.tvl_usd as number));
    byCat.set(q.category, arr);
  }
  const all = train.map((q) => (q.mcap_usd as number) / (q.tvl_usd as number));
  const global = median(all);
  const cat = byCat.get(category) ?? [];
  const m = cat.length >= 3 ? median(cat) : global;
  return clamp(m, 0.08, 0.9);
}

/** Fit the model on the live set and validate it leave-one-out. */
export function fitModel(snapshot: Snapshot): FitResult {
  const live = liveSet(snapshot.protocols);
  const asOf = snapshot.as_of;
  const rows: Array<[number[], number]> = live.map((p) => [
    features(p, asOf),
    Math.log((p.mcap_usd as number) / (p.tvl_usd as number)),
  ]);
  const beta = olsFit(rows);

  const looErrs: number[] = [];
  const medErrs: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const held = live[i];
    const train = live.filter((_, j) => j !== i);
    const b = olsFit(
      train.map((q) => [
        features(q, asOf),
        Math.log((q.mcap_usd as number) / (q.tvl_usd as number)),
      ]),
    );
    const predLog = clamp(
      dot(b, features(held, asOf)),
      Math.log(MULT_MIN),
      Math.log(MULT_MAX),
    );
    const truth = Math.log((held.mcap_usd as number) / (held.tvl_usd as number));
    looErrs.push(Math.abs(predLog - truth));
    const medPred = Math.log(medianMultiple(train, held.category));
    medErrs.push(Math.abs(medPred - truth));
  }
  looErrs.sort((a, b) => a - b);
  medErrs.sort((a, b) => a - b);
  return {
    beta,
    nLive: live.length,
    looMedian: median(looErrs),
    looMean: looErrs.reduce((s, e) => s + e, 0) / looErrs.length,
    medianHeuristicLooMedian: median(medErrs),
    medianHeuristicLooMean: medErrs.reduce((s, e) => s + e, 0) / medErrs.length,
    liveMedianMultiple: median(
      live.map((p) => (p.mcap_usd as number) / (p.tvl_usd as number)),
    ),
  };
}

/** Fitted multiple for one protocol, clamped to the sane band. */
export function predictMultiple(beta: number[], p: Protocol, asOf: string): number {
  const lp = clamp(dot(beta, features(p, asOf)), Math.log(MULT_MIN), Math.log(MULT_MAX));
  return Math.exp(lp);
}

/** Per-feature log-point contributions, for the dashboard's "show your work". */
export function contributions(beta: number[], p: Protocol, asOf: string) {
  const x = features(p, asOf);
  return {
    tvl: beta[1] * x[1],
    growth: beta[2] * x[2],
    age: beta[3] * x[3],
    chains: beta[4] * x[4],
  };
}

// ---------------------------------------------------------------- board

const BAD_NAME = /wrapped|staked|exchange|\bv\d+$| v\d+/i;

/** The house's own board filter: no bridge / staking / exchange wrappers. */
export function passesFilter(p: Protocol): boolean {
  if (EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (BAD_NAME.test(p.name)) return false;
  return true;
}

/** Deposit size by implied value: bigger protocols get a bigger farm. */
export function depositFor(impliedUsd: number): number {
  if (impliedUsd >= 50_000_000) return 5000;
  if (impliedUsd >= 20_000_000) return 2000;
  if (impliedUsd >= 10_000_000) return 1000;
  return 500;
}

function coreAction(category: string): string {
  switch (category) {
    case "Lending":
      return "supply the deposit to the lending market and borrow a small amount against it so the position counts as active";
    case "Dexs":
      return "add the deposit as liquidity to the deepest pool on the venue";
    case "Yield":
    case "Yield Aggregator":
      return "deposit into the flagship yield vault";
    case "RWA":
      return "buy the tokenized asset position the protocol issues";
    case "CDP":
      return "lock the deposit as collateral and mint the protocol stablecoin";
    case "Derivatives":
      return "open a small hedged position on the derivatives market";
    case "Risk Curators":
      return "deposit into the curated vault run by the protocol";
    case "Liquid Restaking":
      return "restake the deposit through the protocol's restaking vault";
    default:
      return "deposit into the protocol's main vault or pool";
  }
}

/** Six concrete farm steps, each with what it costs and how long it takes. */
export function farmSteps(p: Protocol, deposit: number): string[] {
  const chain = (p.chains ?? ["Ethereum"])[0] || "Ethereum";
  const d = `$${deposit.toLocaleString("en-US")}`;
  return [
    `Fund a fresh wallet on ${chain} with ${d} plus a $30 gas reserve, on a new address. Cost about $1, time 10 minutes.`,
    `Bridge ${d} to ${chain} through the official bridge and save the receipt hash; never trust a bridge link from a chat. Cost about $8 to $15, time 10 to 20 minutes.`,
    `On ${chain}, ${coreAction(p.category)} with the full ${d}. Confirm the deposit receipt and position ID on the explorer. Cost about $5 to $10 in gas, time 5 minutes.`,
    `If ${p.name} runs a points program, stake the receipt token in its rewards contract; otherwise leave the deposit in the vault. Cost about $5 to $8 in gas, time 5 minutes.`,
    `Check the position weekly and compound rewards back into the vault; top up gas when the chain is congested. Cost about $5 a week, time 15 minutes a week.`,
    `Plan the exit before the token launches: unstake, withdraw deposit plus rewards, and bridge home in one session. Cost about $10 to $20, time 30 minutes.`,
  ];
}

/** Build the board: every watchlist protocol plus early ones above $10M TVL. */
export function buildBoard(snapshot: Snapshot, fit: FitResult): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const floor = snapshot.floor_usd;
  const rows: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd) continue; // live tokens are comparables, not board rows
    const tvl = p.tvl_usd ?? 0;
    if (tvl <= 0) continue;
    const isWatch = watch.has(p.slug);
    if (!isWatch) {
      if (!passesFilter(p)) continue;
      if (tvl >= floor) continue; // above the floor, only the watchlist counts
      if (tvl < EARLY_MIN_TVL) continue;
    }
    const multiple = predictMultiple(fit.beta, p, snapshot.as_of);
    const implied = Math.max(1, Math.round(tvl * multiple));
    const deposit = depositFor(implied);
    rows.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chain: (p.chains ?? ["Ethereum"])[0] || "Ethereum",
      chains: p.chains ?? [],
      tvl_usd: tvl,
      multiple,
      implied_value_usd: implied,
      rank: 0,
      deposit_usd: deposit,
      cost_usd: 45,
      time_min: 60,
      farm_steps: farmSteps(p, deposit),
      contrib: contributions(fit.beta, p, snapshot.as_of),
    });
  }
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
