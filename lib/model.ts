// radar-2: implied value of a pre-token protocol, from the snapshot's own figures.
//
//   implied = TVL x category multiple x growth x maturity x breadth
//
// The multiple of a category is the median mcap/TVL of its live protocols
// (at least 3 live comparables, clamped to [0.08, 0.90]). A category with
// fewer than 3 live comparables uses the global median over all live
// protocols. Live means the snapshot records a token market cap above zero.
// No protocol name is special-cased anywhere in this model.

export interface Proto {
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

export interface Snap {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface RowFactors {
  ageDays: number;
  growth: number;
  maturity: number;
  breadth: number;
  multiple: number;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  multiple: number;
  growth_factor: number;
  maturity_factor: number;
  breadth_factor: number;
  watchlist: boolean;
}

export interface LiveCat {
  category: string;
  count: number;
  medianRaw: number;
  multipleUsed: number;
  example: string;
}

export interface Multiples {
  global: number;
  byCategory: Map<string, number>;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Categories the house rule keeps off the board for early rows, mirroring
// the watchlist rule: bridges, liquid staking / restaking and exchanges.
const BAD_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGES = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];

// A version marker at the end of a name: a space, then V/v + digits, or a
// dotted number (V2, v2, 2.0 and the like). A bare trailing number is not one.
const VERSION_END = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function isLive(p: Proto): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0;
}

export function ageDays(p: Proto, asOf: string): number {
  if (!p.listed_at) return 365;
  const days = Math.floor((Date.parse(asOf) - Date.parse(p.listed_at)) / 86400000);
  return days < 0 ? 0 : days;
}

export function factors(p: Proto, asOf: string, multiple: number): RowFactors {
  const age = ageDays(p, asOf);
  return {
    ageDays: age,
    growth: 1 + (clamp(p.change_7d ?? 0, -40, 60) / 100) * 0.5,
    maturity: 0.7 + (Math.min(age, 1095) / 1095) * 0.3,
    breadth: 1 + 0.02 * Math.min((p.chains?.length ?? 1) - 1, 10),
    multiple,
  };
}

export function impliedValue(p: Proto, f: RowFactors): number {
  return Math.round(p.tvl_usd * f.multiple * f.growth * f.maturity * f.breadth);
}

export function buildMultiples(protocols: Proto[]): Multiples {
  const live = protocols.filter(isLive);
  const global = median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd));
  const grouped = new Map<string, number[]>();
  for (const p of live) {
    if (!p.category) continue;
    const arr = grouped.get(p.category) ?? [];
    arr.push((p.mcap_usd as number) / p.tvl_usd);
    grouped.set(p.category, arr);
  }
  const byCategory = new Map<string, number>();
  for (const [cat, ratios] of grouped) {
    if (ratios.length >= 3) byCategory.set(cat, clamp(median(ratios), 0.08, 0.9));
  }
  return { global, byCategory };
}

export function multipleFor(category: string | null, m: Multiples): number {
  if (category) {
    const v = m.byCategory.get(category);
    if (v !== undefined) return v;
  }
  return m.global;
}

// An early row: pre-token, below the house floor, and passing the house
// filters (no bridge / liquid-staking / restaking / CEX category, no
// versioned, wrapped or staked name, no exchange-prefixed name).
export function isEarly(p: Proto, floorUsd: number): boolean {
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (p.tvl_usd >= floorUsd) return false;
  if (p.category && BAD_CATEGORIES.has(p.category)) return false;
  if (VERSION_END.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const e of EXCHANGES) if (p.name.startsWith(e)) return false;
  return true;
}

const VERBS: Record<string, string> = {
  Lending: "Sediakan aset sebagai pemberi pinjaman dan coba pinjam dalam jumlah kecil",
  Dexs: "Tukar aset dan sediakan likuiditas di pasangan utama",
  Yield: "Setor ke vault dan panen hasilnya secara berkala",
  RWA: "Setor ke vault aset dunia nyata dan tahan posisinya",
  "Risk Curators": "Setor ke vault kurator dan pantau kinerjanya",
  "Onchain Capital Allocator": "Alokasikan modal ke vault pengelola dan pantau hasilnya",
  CDP: "Buka posisi utang beragun dan jaga rasio agunannya",
  Derivatives: "Buka posisi kecil di pasar derivatif dan kelola risikonya",
  "Yield Aggregator": "Setor ke agregator dan panen hasilnya secara berkala",
};

// Six concrete farm steps, each with what it costs and how long it takes.
// The dashboard renders the same steps from the same templates, so what the
// reader sees in a detail view is exactly what the board carries.
export function farmSteps(name: string, category: string | null, chain0: string, tvlUsd: number): string[] {
  const cat = category ?? "kategori ini";
  const verb = (category && VERBS[category]) ?? "Gunakan produk utama dan ulangi aktivitas intinya";
  const tvl = tvlUsd.toLocaleString("en-US");
  return [
    `Buka situs resmi ${name} dan baca dokumennya; hubungkan wallet di jaringan ${chain0} dan pastikan alamat kontrak sesuai pengumuman resmi. Biaya: tanpa biaya, hanya gas saat transaksi. Waktu: 10 menit.`,
    `Siapkan aset di ${chain0} untuk dipakai di ${name} (${cat}); mulai dari nominal kecil untuk menguji alur setor dan tarik sebelum menambah. Biaya: gas jaringan saja. Waktu: 15 menit.`,
    `${verb} di ${name} secara berkala — ulangi tiap minggu agar aktivitas tercatat konsisten, bukan sekali besar lalu berhenti. Biaya: gas per transaksi. Waktu: 20 menit per sesi.`,
    `Pantau posisi dan TVL ${name} (kini $${tvl}) tiap minggu; tambah aktivitas saat TVL tumbuh dan kurangi saat TVL turun tajam. Biaya: tanpa biaya. Waktu: 10 menit per minggu.`,
    `Ikuti kanal resmi ${name} untuk pengumuman token dan syarat kelayakan; simpan hash tiap transaksi sebagai bukti aktivitas. Biaya: tanpa biaya. Waktu: 5 menit per minggu.`,
    `Saat ${name} mengumumkan token, verifikasi alamat kontrak dari kanal resminya sebelum klaim; jangan pernah menandatangani persetujuan tanpa batas. Biaya: gas klaim saja. Waktu: 15 menit.`,
  ];
}

export function buildBoard(snap: Snap): BoardRow[] {
  const mults = buildMultiples(snap.protocols);
  const watch = new Set(snap.watchlist);
  const picked = snap.protocols.filter((p) => watch.has(p.slug) || isEarly(p, snap.floor_usd));
  const rows: BoardRow[] = picked.map((p) => {
    const mult = multipleFor(p.category, mults);
    const f = factors(p, snap.as_of, mult);
    return {
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: impliedValue(p, f),
      farm_steps: farmSteps(p.name, p.category, p.chains[0] ?? "Ethereum", p.tvl_usd),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: f.ageDays,
      multiple: mult,
      growth_factor: f.growth,
      maturity_factor: f.maturity,
      breadth_factor: f.breadth,
      watchlist: watch.has(p.slug),
    };
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

// One row per live category: where each multiple comes from.
export function buildLiveTable(snap: Snap): LiveCat[] {
  const mults = buildMultiples(snap.protocols);
  const groups = new Map<string, Proto[]>();
  for (const p of snap.protocols.filter(isLive)) {
    if (!p.category) continue;
    const arr = groups.get(p.category) ?? [];
    arr.push(p);
    groups.set(p.category, arr);
  }
  const out: LiveCat[] = [];
  for (const [cat, ps] of groups) {
    const raw = median(ps.map((p) => (p.mcap_usd as number) / p.tvl_usd));
    const top = [...ps].sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))[0];
    out.push({
      category: cat,
      count: ps.length,
      medianRaw: raw,
      multipleUsed: multipleFor(cat, mults),
      example: top.name,
    });
  }
  out.sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return out;
}
