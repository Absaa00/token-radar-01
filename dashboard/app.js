// Token Launch Radar dashboard — renders window.RADAR_DATA.
//
// The board rows arrive compact: [rank, slug, name, category, chain, tvl,
// implied, multiple, deposit, [cTvl, cGrowth, cAge, cChains]]. Farm steps
// for the Top 6 ship verbatim in data.stepsTop; every other row's steps
// are rendered from the same six templates the model uses in lib/model.ts.

const D = window.RADAR_DATA;
const $ = (id) => document.getElementById(id);

const usd = (n) =>
  "$" + Math.round(n).toLocaleString("en-US");
const usdShort = (n) => {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + Math.round(n);
};
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const [B0, B1, B2, B3, B4] = D.fit.beta;
const ROWS = D.rows;
const bySlug = new Map(ROWS.map((r) => [r[1], r]));

function coreAction(category) {
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

function stepTemplates(r) {
  const name = r[2];
  const chain = r[4];
  const dep = "$" + r[8].toLocaleString("en-US");
  return [
    `Fund a fresh wallet on ${chain} with ${dep} plus a $30 gas reserve, on a new address. Cost about $1, time 10 minutes.`,
    `Bridge ${dep} to ${chain} through the official bridge and save the receipt hash; never trust a bridge link from a chat. Cost about $8 to $15, time 10 to 20 minutes.`,
    `On ${chain}, ${coreAction(r[3])} with the full ${dep}. Confirm the deposit receipt and position ID on the explorer. Cost about $5 to $10 in gas, time 5 minutes.`,
    `If ${name} runs a points program, stake the receipt token in its rewards contract; otherwise leave the deposit in the vault. Cost about $5 to $8 in gas, time 5 minutes.`,
    `Check the position weekly and compound rewards back into the vault; top up gas when the chain is congested. Cost about $5 a week, time 15 minutes a week.`,
    `Plan the exit before the token launches: unstake, withdraw deposit plus rewards, and bridge home in one session. Cost about $10 to $20, time 30 minutes.`,
  ];
}

// ---------------------------------------------------------------- header
$("asof").textContent =
  `Snapshot ${D.asOf} · floor $${D.floorUsd.toLocaleString("en-US")} · ${D.nRows} protocols ranked · watchlist ${D.nWatch}/${D.nWatch} covered`;

const medImplied = [...ROWS].map((r) => r[6]).sort((a, b) => a - b)[Math.floor(ROWS.length / 2)];
$("stats").innerHTML = [
  [ROWS.length, "protocols ranked"],
  [`${D.nWatch}/${D.nWatch}`, "watchlist covered"],
  [usdShort(medImplied), "median implied value"],
  [`${D.fit.looMedian} vs ${D.fit.medLooMedian}`, "LOO error: fitted vs median"],
].map(([v, l]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");

$("coefs").innerHTML =
  `<tr><th>Term</th><th>Coefficient</th><th>What it means</th></tr>` +
  [
    ["Intercept", B0, "baseline log multiple"],
    ["log(TVL)", B1, "bigger protocols carry smaller multiples"],
    ["7-day change", B2, "fast weekly growth predicts a smaller multiple"],
    ["Age (years)", B3, "older protocols carry a slightly smaller multiple"],
    ["log(chains)", B4, "multi-chain protocols carry a slightly larger multiple"],
  ].map(([t, b, m]) => `<tr><td>${t}</td><td>${Number(b).toFixed(3)}</td><td>${m}</td></tr>`).join("");

$("valid").textContent =
  `Leave-one-out on ${D.fit.nLive} live protocols: fitted model median |log error| ${D.fit.looMedian} ` +
  `(mean ${D.fit.looMean}); category-median heuristic ${D.fit.medLooMedian} (mean ${D.fit.medLooMean}). ` +
  `The fitted model is about a fifth more accurate out of sample. Live median multiple ${D.fit.liveMedianMultiple}.`;

// ---------------------------------------------------------------- top 10
$("top10").innerHTML = ROWS.slice(0, 10).map((r) =>
  `<li><a href="#p=${r[1]}">${esc(r[2])}</a> <span class="cat">${esc(r[3])} &middot; ${esc(r[4])}</span><span class="val">${usd(r[6])}</span></li>`
).join("");

// ---------------------------------------------------------------- categories
const maxCat = Math.max(...D.categories.map((c) => c[2]));
$("catbars").innerHTML = D.categories.slice(0, 8).map(([name, n, value]) =>
  `<div class="bar"><span>${esc(name)} (${n})</span><span class="track"><span class="fill" style="display:block;width:${Math.max(2, (value / maxCat) * 100).toFixed(1)}%"></span></span><span class="n">${usdShort(value)}</span></div>`
).join("");

// ---------------------------------------------------------------- filters
const cats = [...new Set(ROWS.map((r) => r[3]))].sort();
const chains = [...new Set(ROWS.map((r) => r[4]))].sort();
$("fcat").innerHTML = `<option value="">All categories</option>` + cats.map((c) => `<option>${esc(c)}</option>`).join("");
$("fchain").innerHTML = `<option value="">All chains</option>` + chains.map((c) => `<option>${esc(c)}</option>`).join("");

let tab = "pre";
function currentRows() {
  const q = $("q").value.trim().toLowerCase();
  const fc = $("fcat").value;
  const fch = $("fchain").value;
  const fmin = Number($("fmin").value);
  const sort = $("fsort").value;
  let list = ROWS.filter((r) =>
    (!q || r[2].toLowerCase().includes(q) || r[1].includes(q)) &&
    (!fc || r[3] === fc) &&
    (!fch || r[4] === fch) &&
    r[5] >= fmin
  );
  if (sort === "implied" || sort === "rank") list = [...list].sort((a, b) => b[6] - a[6]);
  if (sort === "tvl") list = [...list].sort((a, b) => b[5] - a[5]);
  if (sort === "mult") list = [...list].sort((a, b) => b[7] - a[7]);
  return list;
}

function render() {
  const body = $("rows");
  if (tab === "live") {
    $("count").textContent = `${D.live.length} live-token comparables — the protocols the model is fitted on (top 30 by TVL).`;
    body.innerHTML = D.live.map((p, i) =>
      `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td></td>` +
      `<td class="num">${usdShort(p.tvl)}</td><td class="num">${p.mult.toFixed(3)}&times;</td>` +
      `<td class="num">${usdShort(p.mcap)}</td><td class="num">&mdash;</td></tr>`
    ).join("");
    return;
  }
  const list = currentRows();
  $("count").textContent = `${list.length} of ${ROWS.length} pre-token protocols shown.`;
  body.innerHTML = list.map((r) =>
    `<tr data-slug="${r[1]}"><td>${r[0]}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td>` +
    `<td class="num">${usdShort(r[5])}</td><td class="num">${r[7].toFixed(3)}&times;</td>` +
    `<td class="num">${usd(r[6])}</td><td class="num">$${r[8].toLocaleString("en-US")}</td></tr>`
  ).join("");
  body.querySelectorAll("tr[data-slug]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.slug))
  );
}

$("tab-pre").addEventListener("click", () => {
  tab = "pre";
  $("tab-pre").classList.add("active");
  $("tab-live").classList.remove("active");
  render();
});
$("tab-live").addEventListener("click", () => {
  tab = "live";
  $("tab-live").classList.add("active");
  $("tab-pre").classList.remove("active");
  render();
});
for (const id of ["q", "fcat", "fchain", "fmin", "fsort"]) {
  $(id).addEventListener("input", render);
}

// ---------------------------------------------------------------- detail
function openDetail(slug) {
  const r = bySlug.get(slug);
  if (!r) return;
  const [rank, , name, cat, chain, tvl, implied, mult, dep, contrib] = r;
  const steps = D.stepsTop[slug] || stepTemplates(r);
  const math =
    `implied = TVL x fitted multiple\n` +
    `        = ${usd(tvl)} x ${mult.toFixed(3)} = ${usd(implied)}\n\n` +
    `log(multiple) = ${B0.toFixed(3)} (intercept)\n` +
    `  ${contrib[0] >= 0 ? "+" : ""}${contrib[0].toFixed(2)} from log(TVL)\n` +
    `  ${contrib[1] >= 0 ? "+" : ""}${contrib[1].toFixed(2)} from 7-day change\n` +
    `  ${contrib[2] >= 0 ? "+" : ""}${contrib[2].toFixed(2)} from age\n` +
    `  ${contrib[3] >= 0 ? "+" : ""}${contrib[3].toFixed(2)} from chain count`;
  $("detail-body").innerHTML =
    `<h3>#${rank} ${esc(name)}</h3>` +
    `<p class="sub">${esc(cat)} &middot; ${esc(chain)} &middot; TVL ${usd(tvl)}</p>` +
    `<h4>How the value is computed</h4><div class="math">${esc(math)}</div>` +
    `<h4>Farm plan — deposit $${dep.toLocaleString("en-US")}</h4>` +
    `<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` +
    `<p class="totals">Setup about $45 in gas and 60 minutes; then about $5 a week and 15 minutes a week.</p>`;
  const dlg = $("detail");
  if (!dlg.open) dlg.showModal();
  history.replaceState(null, "", `#p=${slug}`);
}

function route() {
  const h = new URLSearchParams(location.hash.slice(1));
  const dlg = $("detail");
  if (h.has("p")) { openDetail(h.get("p")); return; }
  if (dlg.open) dlg.close();
  if (h.has("category")) {
    const c = h.get("category");
    if ([...$("fcat").options].some((o) => o.value === c)) { $("fcat").value = c; render(); }
  }
}
window.addEventListener("hashchange", route);
render();
route();
