// The token radar's model (radar-4): a fitted, robust value model.
//
// The board ranks pre-token protocols by implied value = TVL x fitted multiple.
// The multiple is fitted from the 128 live-token protocols in the snapshot itself:
//   log(mcap/TVL) ~ const + logTVL + ch7d + age + logChains
//                 + ch7d^2 + ch7d*logTVL + ch7d*age + logTVL*age
// fitted by Huber regression (delta 1.345, IRLS), which down-weights the extreme
// multiples (a few live tokens trade at 20-400x TVL) instead of letting them drag
// the fit. ch7d is winsorized to +/-15%. logTVL, ch7d and age enter centered at
// their live-set means, so the main effects read at a typical protocol and the
// interactions stop cancelling huge offsetting terms. The fitted multiple is
// clamped to [0.02, 1.5] before it is applied, exactly as the validation below does.
//
// Validation is leave-one-out over the same 128 live protocols, computed at run
// time: each protocol is predicted by a model fitted without it, with the same
// clamp. The dossier reports the LOO median/mean |log error| next to the
// median-ratio heuristic's, so the reader can see the fit earns its keep.
// No protocol name is ever special-cased: one function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-4';

/** Winsor cap on the 7-day TVL change, in per cent. */
export const WINSOR_PCT = 15;
/** Clamp on the fitted multiple (mcap/TVL). */
export const MULT_MIN = 0.02;
export const MULT_MAX = 1.5;
/** Huber tuning constant (1.345 = 95% efficiency at the normal). */
export const HUBER_DELTA = 1.345;
/** IRLS iterations; convergence is checked each round, so this is a cap. */
export const HUBER_MAX_ITER = 60;
/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 154;
/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    log_multiple: number;
    growth_pct: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/**
 * The dashboard's compact view of one row: a positional array, to keep data.js
 * small enough that the whole dashboard still fits the dossier's text cap.
 * [rank, slug, name, category, chains, tvl_usd, change_7d, age_days,
 *  implied_value_usd, log_multiple]
 */
export type RadarRow = [number, string, string, string | null, string[], number, number | null, number | null, number, number];

/** A live-token protocol: [slug, name, category, chains, tvl_usd, mcap_usd, change_7d]. */
export type LiveRow = [string, string, string | null, string[], number, number | null, number | null];

/** Everything the dashboard needs: the board, the live set, and the fitted model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: {
    features: string[];
    beta: number[];
    centers: { logTVL: number; ch7d: number; age_years: number };
    winsor_pct: number;
    mult_min: number;
    mult_max: number;
    huber_delta: number;
  };
  validation: {
    n_live: number;
    loo_median_abs_log_err: number;
    loo_mean_abs_log_err: number;
    heuristic_median_abs_log_err: number;
    heuristic_mean_abs_log_err: number;
  };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const LOG_MIN = Math.log(MULT_MIN);
const LOG_MAX = Math.log(MULT_MAX);

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The nine design columns, in the dashboard's stated order. logTVL, ch7d and age are centered. */
export const FEATURES = ['const', 'logTVL_c', 'ch7d_c', 'age_c', 'logChains', 'ch7d_c^2', 'ch7d_c*logTVL_c', 'ch7d_c*age_c', 'logTVL_c*age_c'];

/** The live-set means logTVL, ch7d and age are centered at. */
export interface Centers {
  logTVL: number;
  ch7d: number;
  age_years: number;
}

/** One protocol's design row: the nine features the fitted model reads. */
export function designRow(p: SnapshotProtocol, asOf: string, centers: Centers): number[] {
  const logTvl = Math.log(Math.max(1, p.tvl_usd)) - centers.logTVL;
  const ch = clamp(finite(p.change_7d, 0), -WINSOR_PCT, WINSOR_PCT) / 100 - centers.ch7d;
  const age = ageDays(asOf, p.listed_at);
  const ageY = (age ?? 365) / 365 - centers.age_years;
  const logChains = Math.log(Math.max(1, p.chains.length));
  return [1, logTvl, ch, ageY, logChains, ch * ch, ch * logTvl, ch * ageY, logTvl * ageY];
}

/** Solve A x = b by Gaussian elimination with partial pivoting. A is square. */
export function solveLinear(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const a = aIn.map((row) => [...row]);
  const b = [...bIn];
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) throw new Error('singular matrix in model fit');
    if (pivot !== col) {
      [a[col], a[pivot]] = [a[pivot]!, a[col]!];
      [b[col], b[pivot]] = [b[pivot]!, b[col]!];
    }
    for (let r = col + 1; r < n; r++) {
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < n; c++) a[r]![c]! -= f * a[col]![c]!;
      b[r]! -= f * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let c = r + 1; c < n; c++) s -= a[r]![c]! * x[c]!;
    x[r] = s / a[r]![r]!;
  }
  return x;
}

/** Ordinary least squares, via the normal equations. */
function ols(X: number[][], y: number[]): number[] {
  const p = X[0]!.length;
  const xtx: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const row = X[i]!;
    for (let j = 0; j < p; j++) {
      xty[j]! += row[j]! * y[i]!;
      for (let k = 0; k < p; k++) xtx[j]![k]! += row[j]! * row[k]!;
    }
  }
  return solveLinear(xtx, xty);
}

/** The median of a non-empty array of numbers. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Huber regression by iteratively reweighted least squares: start at OLS, then
 * weight each residual by 1 below delta*scale and delta*scale/|r| above it,
 * with scale = 1.4826 * MAD. Fixed iteration count and tolerance, so the fit
 * is deterministic. Stops early when no coefficient moves more than 1e-10.
 */
export function fitHuber(X: number[][], y: number[]): number[] {
  let beta = ols(X, y);
  for (let iter = 0; iter < HUBER_MAX_ITER; iter++) {
    const resid = y.map((yi, i) => yi - dot(X[i]!, beta));
    const scale = 1.4826 * median(resid.map((r) => Math.abs(r - median(resid)))) + 1e-9;
    const cut = HUBER_DELTA * scale;
    const w = resid.map((r) => (Math.abs(r) <= cut ? 1 : cut / Math.abs(r)));
    const p = X[0]!.length;
    const xtx: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    const xty = new Array<number>(p).fill(0);
    for (let i = 0; i < X.length; i++) {
      const row = X[i]!;
      const wi = w[i]!;
      for (let j = 0; j < p; j++) {
        xty[j]! += wi * row[j]! * y[i]!;
        for (let k = 0; k < p; k++) xtx[j]![k]! += wi * row[j]! * row[k]!;
      }
    }
    const next = solveLinear(xtx, xty);
    const moved = Math.max(...next.map((v, j) => Math.abs(v - beta[j]!)));
    beta = next;
    if (moved < 1e-10) break;
  }
  return beta;
}

const dot = (a: number[], b: number[]): number => a.reduce((s, v, i) => s + v * b[i]!, 0);

/** A fitted multiple for one design row, clamped to [MULT_MIN, MULT_MAX]. */
export function predictLogMultiple(beta: number[], row: number[]): number {
  return clamp(dot(row, beta), LOG_MIN, LOG_MAX);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The live-token protocols the model trains on: a positive market cap, so log(mcap/TVL) exists. */
export function liveTrainSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => typeof p.mcap_usd === 'number' && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/**
 * The centering constants: the live-set means of logTVL, winsorized ch7d and
 * age in years. Computed from the snapshot at run time, never hard-coded.
 */
export function liveCenters(snapshot: Snapshot): Centers {
  const live = liveTrainSet(snapshot);
  let logTvl = 0;
  let ch = 0;
  let age = 0;
  for (const p of live) {
    logTvl += Math.log(Math.max(1, p.tvl_usd));
    ch += clamp(finite(p.change_7d, 0), -WINSOR_PCT, WINSOR_PCT) / 100;
    const a = ageDays(snapshot.as_of, p.listed_at);
    age += (a ?? 365) / 365;
  }
  const n = Math.max(1, live.length);
  return { logTVL: logTvl / n, ch7d: ch / n, age_years: age / n };
}

/**
 * Leave-one-out validation over the live set, with the same clamp the board
 * uses, plus the median-ratio heuristic scored the same way. Returns medians
 * and means of |log error|.
 */
export function looValidation(snapshot: Snapshot): {
  n_live: number;
  beta: number[];
  centers: Centers;
  loo_median: number;
  loo_mean: number;
  heuristic_median: number;
  heuristic_mean: number;
} {
  const live = liveTrainSet(snapshot);
  const centers = liveCenters(snapshot);
  const X = live.map((p) => designRow(p, snapshot.as_of, centers));
  const y = live.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const beta = fitHuber(X, y);
  const looErr: number[] = [];
  const heurErr: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const xi = X.filter((_, j) => j !== i);
    const yi = y.filter((_, j) => j !== i);
    const b = fitHuber(xi, yi);
    looErr.push(Math.abs(y[i]! - predictLogMultiple(b, X[i]!)));
    heurErr.push(Math.abs(y[i]! - clamp(median(yi), LOG_MIN, LOG_MAX)));
  }
  return {
    n_live: live.length,
    beta,
    centers,
    loo_median: round4(median(looErr)),
    loo_mean: round4(mean(looErr)),
    heuristic_median: round4(median(heurErr)),
    heuristic_mean: round4(mean(heurErr)),
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, beta: number[], centers: Centers): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const row = designRow(p, snapshot.as_of, centers);
    const logMult = predictLogMultiple(beta, row);
    const implied = Math.max(1, Math.round(p.tvl_usd * Math.exp(logMult)));
    const age = ageDays(snapshot.as_of, p.listed_at);
    return { p, implied, logMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: round4(Math.exp(s.logMult)),
      log_multiple: round4(s.logMult),
      growth_pct: clamp(finite(s.p.change_7d, 0), -WINSOR_PCT, WINSOR_PCT),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 5000;
  if (p.tvl_usd >= 1_000_000_000) return 2000;
  if (p.tvl_usd >= 100_000_000) return 1000;
  return 500;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital.toLocaleString('en-US')} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital.toLocaleString('en-US')} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital.toLocaleString('en-US')} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital.toLocaleString('en-US')} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital.toLocaleString('en-US')} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital.toLocaleString('en-US')} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital.toLocaleString('en-US')} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital.toLocaleString('en-US')} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital.toLocaleString('en-US')} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital.toLocaleString('en-US')} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital.toLocaleString('en-US')} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * Deposit sizes follow the protocol's TVL; setup is about $45 of gas and 60 minutes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 2000 ? 12 : 6;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital.toLocaleString('en-US')} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital.toLocaleString('en-US')} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => [p.slug, p.name, p.category, p.chains, p.tvl_usd, p.mcap_usd, p.change_7d]);
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return [
    row.rank,
    row.slug,
    row.name,
    row.category,
    row.chains,
    row.tvl_usd,
    row.change_7d,
    row.age_days,
    row.implied_value_usd,
    row.model.log_multiple,
  ];
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
): { board: BoardRow[]; radar: RadarData; validation: ReturnType<typeof looValidation> } {
  const validation = looValidation(snapshot);
  const board = buildBoard(snapshot, validation.beta, validation.centers);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: {
      features: FEATURES,
      beta: validation.beta.map(round4),
      centers: {
        logTVL: round4(validation.centers.logTVL),
        ch7d: round4(validation.centers.ch7d),
        age_years: round4(validation.centers.age_years),
      },
      winsor_pct: WINSOR_PCT,
      mult_min: MULT_MIN,
      mult_max: MULT_MAX,
      huber_delta: HUBER_DELTA,
    },
    validation: {
      n_live: validation.n_live,
      loo_median_abs_log_err: validation.loo_median,
      loo_mean_abs_log_err: validation.loo_mean,
      heuristic_median_abs_log_err: validation.heuristic_median,
      heuristic_mean_abs_log_err: validation.heuristic_mean,
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, validation };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
