(function () {
  var R = window.RADAR;
  var rows = R.rows; // [rank, slug, name, cat, chains, tvl, chg7d, age, mult, imp, watch]
  var liveCats = R.liveCats; // [category, count, medianRaw, multUsed, example]

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function mult(n) { return n.toFixed(4); }
  function chg(n) {
    if (n == null) return "–";
    var v = (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
    return '<span class="' + (n >= 0 ? "up" : "down") + '">' + v + "</span>";
  }
  function catLabel(c) { return c == null ? "Tanpa kategori" : c; }

  // ---- farm steps: the same six templates the board generator uses, so a
  // detail view shows exactly the steps board.json carries for the row.
  var VERBS = {
    Lending: "Sediakan aset sebagai pemberi pinjaman dan coba pinjam dalam jumlah kecil",
    Dexs: "Tukar aset dan sediakan likuiditas di pasangan utama",
    Yield: "Setor ke vault dan panen hasilnya secara berkala",
    RWA: "Setor ke vault aset dunia nyata dan tahan posisinya",
    "Risk Curators": "Setor ke vault kurator dan pantau kinerjanya",
    "Onchain Capital Allocator": "Alokasikan modal ke vault pengelola dan pantau hasilnya",
    CDP: "Buka posisi utang beragun dan jaga rasio agunannya",
    Derivatives: "Buka posisi kecil di pasar derivatif dan kelola risikonya",
    "Yield Aggregator": "Setor ke agregator dan panen hasilnya secara berkala"
  };
  function farmSteps(name, category, chain0, tvlUsd) {
    var cat = category == null ? "kategori ini" : category;
    var verb = (category && VERBS[category]) || "Gunakan produk utama dan ulangi aktivitas intinya";
    var tvl = tvlUsd.toLocaleString("en-US");
    return [
      "Buka situs resmi " + name + " dan baca dokumennya; hubungkan wallet di jaringan " + chain0 + " dan pastikan alamat kontrak sesuai pengumuman resmi. Biaya: tanpa biaya, hanya gas saat transaksi. Waktu: 10 menit.",
      "Siapkan aset di " + chain0 + " untuk dipakai di " + name + " (" + cat + "); mulai dari nominal kecil untuk menguji alur setor dan tarik sebelum menambah. Biaya: gas jaringan saja. Waktu: 15 menit.",
      verb + " di " + name + " secara berkala — ulangi tiap minggu agar aktivitas tercatat konsisten, bukan sekali besar lalu berhenti. Biaya: gas per transaksi. Waktu: 20 menit per sesi.",
      "Pantau posisi dan TVL " + name + " (kini $" + tvl + ") tiap minggu; tambah aktivitas saat TVL tumbuh dan kurangi saat TVL turun tajam. Biaya: tanpa biaya. Waktu: 10 menit per minggu.",
      "Ikuti kanal resmi " + name + " untuk pengumuman token dan syarat kelayakan; simpan hash tiap transaksi sebagai bukti aktivitas. Biaya: tanpa biaya. Waktu: 5 menit per minggu.",
      "Saat " + name + " mengumumkan token, verifikasi alamat kontrak dari kanal resminya sebelum klaim; jangan pernah menandatangani persetujuan tanpa batas. Biaya: gas klaim saja. Waktu: 15 menit."
    ];
  }

  // ---- header + stats
  $("heroMeta").textContent =
    "Snapshot " + R.asOf + " · " + rows.length + " protokol · floor watchlist $" +
    Math.round(R.floor).toLocaleString("en-US") + " · multiple global " + R.globalMult.toFixed(4);
  $("statTotal").textContent = rows.length;
  $("statWatch").textContent = R.watchlist;
  $("statMedian").textContent = money(R.medianImplied);
  $("statTop").textContent = money(R.topImplied);

  // ---- top 10 spotlight
  $("top10Body").innerHTML = rows.slice(0, 10).map(function (r) {
    return "<tr data-slug=\"" + esc(r[1]) + "\" tabindex=\"0\"><td>" + r[0] + "</td><td>" + esc(r[2]) +
      (r[10] ? '<span class="badge">watchlist</span>' : "") + "</td><td>" + esc(catLabel(r[3])) +
      "</td><td class=\"num\">" + money(r[5]) + "</td><td class=\"num\">" + money(r[9]) + "</td></tr>";
  }).join("");

  // ---- category bars (count + total implied per category, top 12)
  var byCat = {};
  rows.forEach(function (r) {
    var c = catLabel(r[3]);
    byCat[c] = byCat[c] || { n: 0, sum: 0 };
    byCat[c].n += 1;
    byCat[c].sum += r[9];
  });
  var catList = Object.keys(byCat).map(function (c) {
    return { c: c, n: byCat[c].n, sum: byCat[c].sum };
  }).sort(function (a, b) { return b.sum - a.sum; }).slice(0, 12);
  var maxSum = catList.length ? catList[0].sum : 1;
  $("catBars").innerHTML = catList.map(function (x) {
    var w = Math.max(2, Math.round((x.sum / maxSum) * 100));
    return "<div class=\"bar-row\"><span>" + esc(x.c) + "</span>" +
      "<div class=\"bar-track\"><div class=\"bar-fill\" style=\"width:" + w + "%\"></div></div>" +
      "<span class=\"bar-val\">" + x.n + " · " + money(x.sum) + "</span></div>";
  }).join("");

  // ---- filters
  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (cats.indexOf(r[3]) < 0) cats.push(r[3]);
    r[4].forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
  });
  cats.sort();
  chains.sort();
  $("catSel").innerHTML = "<option value=\"\">Semua kategori</option>" +
    cats.map(function (c) { return "<option>" + esc(catLabel(c)) + "</option>"; }).join("");
  $("chainSel").innerHTML = "<option value=\"\">Semua chain</option>" +
    chains.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");

  var state = { q: "", cat: "", chain: "", minTvl: 0, sort: "rank" };
  function visible() {
    var q = state.q.toLowerCase();
    var list = rows.filter(function (r) {
      if (q && r[2].toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      if (state.cat && catLabel(r[3]) !== state.cat) return false;
      if (state.chain && r[4].indexOf(state.chain) < 0) return false;
      if (r[5] < state.minTvl) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a[0] - b[0]; },
      tvl: function (a, b) { return b[5] - a[5]; },
      name: function (a, b) { return a[2].localeCompare(b[2]); },
      age: function (a, b) { return b[7] - a[7]; },
      mult: function (a, b) { return b[8] - a[8]; }
    }[state.sort];
    return list.sort(by);
  }
  function renderBoard() {
    var list = visible();
    $("boardCount").textContent = "Menampilkan " + list.length + " dari " + rows.length + " protokol.";
    $("boardBody").innerHTML = list.map(function (r) {
      return "<tr data-slug=\"" + esc(r[1]) + "\" tabindex=\"0\"><td>" + r[0] + "</td><td>" + esc(r[2]) +
        (r[10] ? '<span class="badge">watchlist</span>' : "") + "</td><td>" + esc(catLabel(r[3])) +
        "</td><td>" + esc(r[4].slice(0, 3).join(", ")) + (r[4].length > 3 ? " +" + (r[4].length - 3) : "") +
        "</td><td class=\"num\">" + money(r[5]) + "</td><td class=\"num\">" + chg(r[6]) +
        "</td><td class=\"num\">" + r[7] + " hari</td><td class=\"num\">" + mult(r[8]) +
        "</td><td class=\"num\">" + money(r[9]) + "</td></tr>";
    }).join("");
  }
  $("q").addEventListener("input", function (e) { state.q = e.target.value; renderBoard(); });
  $("catSel").addEventListener("change", function (e) { state.cat = e.target.value; renderBoard(); });
  $("chainSel").addEventListener("change", function (e) { state.chain = e.target.value; renderBoard(); });
  $("tvlSel").addEventListener("change", function (e) { state.minTvl = Number(e.target.value); renderBoard(); });
  $("sortSel").addEventListener("change", function (e) { state.sort = e.target.value; renderBoard(); });
  renderBoard();

  // ---- live token tab: where each multiple comes from
  $("liveBody").innerHTML = liveCats.map(function (c) {
    return "<tr><td>" + esc(c[0]) + "</td><td class=\"num\">" + c[1] +
      "</td><td class=\"num\">" + c[2].toFixed(4) + "</td><td class=\"num\">" + c[3].toFixed(4) +
      "</td><td>" + esc(c[4]) + "</td></tr>";
  }).join("");
  $("liveHint").textContent =
    "Multiple tiap kategori adalah median mcap/TVL protokol live di kategori itu (minimal 3 protokol, " +
    "dijepit 0,08–0,90). Kategori dengan kurang dari 3 protokol live memakai median global " +
    R.globalMult.toFixed(4) + " dari 128 protokol live.";

  // ---- tabs
  function showTab(live) {
    $("tabBoard").setAttribute("aria-selected", live ? "false" : "true");
    $("tabLive").setAttribute("aria-selected", live ? "true" : "false");
    $("boardTab").hidden = live;
    $("liveTab").hidden = !live;
  }
  $("tabBoard").addEventListener("click", function () { showTab(false); });
  $("tabLive").addEventListener("click", function () { showTab(true); });

  // ---- detail dialog
  var dlg = $("detail");
  function growthOf(r) {
    var c = r[6] == null ? 0 : Math.min(60, Math.max(-40, r[6]));
    return 1 + (c / 100) * 0.5;
  }
  function maturityOf(r) { return 0.7 + (Math.min(r[7], 1095) / 1095) * 0.3; }
  function breadthOf(r) { return 1 + 0.02 * Math.min(r[4].length - 1, 10); }
  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i][1] === slug) { r = rows[i]; break; }
    if (!r) return;
    var steps = farmSteps(r[2], r[3], r[4][0] || "Ethereum", r[5]);
    var multSrc = (r[3] && liveCats.some(function (c) { return c[0] === r[3] && c[1] >= 3; }))
      ? "median kategori " + catLabel(r[3]) : "median global (kategori < 3 live)";
    $("detailBody").innerHTML =
      "<h3>" + esc(r[2]) + "</h3>" +
      "<p class=\"sub\">Peringkat #" + r[0] + " · " + esc(catLabel(r[3])) + " · " + esc(r[4].join(", ")) +
      (r[10] ? ' · <span class="badge">watchlist</span>' : "") + "</p>" +
      "<h4>Nilai implisit: " + money(r[9]) + "</h4>" +
      "<table class=\"kv\"><tbody>" +
      "<tr><td>TVL</td><td>" + money(r[5]) + "</td></tr>" +
      "<tr><td>Multiple (" + esc(multSrc) + ")</td><td>" + mult(r[8]) + "</td></tr>" +
      "<tr><td>Growth (7 hari " + (r[6] == null ? "tidak tercatat" : r[6].toFixed(1) + "%") + ")</td><td>" + growthOf(r).toFixed(4) + "</td></tr>" +
      "<tr><td>Maturity (" + r[7] + " hari)</td><td>" + maturityOf(r).toFixed(4) + "</td></tr>" +
      "<tr><td>Breadth (" + r[4].length + " chain)</td><td>" + breadthOf(r).toFixed(4) + "</td></tr>" +
      "<tr><td><b>Nilai implisit</b></td><td><b>" + money(r[9]) + "</b></td></tr>" +
      "</tbody></table>" +
      "<h4>Cara farming (6 langkah)</h4><ol>" +
      steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>";
    if (typeof dlg.showModal === "function") {
      dlg.showModal();
      // showModal focuses the dialog's first focusable control (the close
      // button at the bottom), which scrolls the tall content down and
      // hides the title. Pin the scroll back to the top.
      dlg.scrollTop = 0;
      requestAnimationFrame(function () { dlg.scrollTop = 0; });
    }
  }
  document.addEventListener("click", function (e) {
    var tr = e.target.closest ? e.target.closest("tr[data-slug]") : null;
    if (tr) openDetail(tr.getAttribute("data-slug"));
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target && e.target.matches("tr[data-slug]")) {
      e.preventDefault();
      openDetail(e.target.getAttribute("data-slug"));
    }
  });
  $("detailClose").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });

  // ---- deep links: #p=<slug> opens a detail, #category=<name> filters
  var hash = new URLSearchParams(window.location.hash.slice(1));
  var p = hash.get("p");
  var cat = hash.get("category");
  if (cat) {
    state.cat = cat;
    var sel = $("catSel");
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === cat) { sel.selectedIndex = i; break; }
    }
    renderBoard();
  }
  if (p) openDetail(p);
})();
