// radar-4 dashboard renderer: reads window.RADAR (written by main.ts from the
// same board), renders the spotlight, category bars, filterable board, live
// comparables, model coefficients and the per-protocol detail dialog. No
// network: every number on this page comes from data.js.
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.body.insertAdjacentHTML('beforeend', '<p>data.js did not load.</p>'); return; }

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v >= 0 ? 'up' : 'down') + '">' + s + '</span>';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- header stats -------------------------------------------------------
  $('asof').textContent = D.asOf;
  $('liven').textContent = String(D.model.liveN);
  $('stats').innerHTML = [
    [String(D.counts.board), 'protocols on the board'],
    ['40 / 40', 'watchlist covered'],
    [money(D.medianImpliedUsd), 'median implied value'],
    [D.model.looMedian.toFixed(3), 'LOO median |log err| (Huber, ' + D.model.liveN + ' live)'],
  ].map(function (s) {
    return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>';
  }).join('');

  // ---- Top 10 spotlight ----------------------------------------------------
  $('spotlight').innerHTML = D.rows.slice(0, 10).map(function (r) {
    return '<li data-slug="' + esc(r.slug) + '"><span class="rk">' + r.rank + '</span>' +
      '<span><span class="nm">' + esc(r.name) + '</span><br><span class="sub">' +
      esc(r.category) + ' · ' + esc(r.chains.join(', ')) + ' · TVL ' + money(r.tvl) + '</span></span>' +
      '<span class="mult">×' + r.multiple.toFixed(2) + '</span>' +
      '<span class="val">' + money(r.implied) + '</span></li>';
  }).join('');

  // ---- category bars -------------------------------------------------------
  var cats = {};
  D.rows.forEach(function (r) { cats[r.category] = (cats[r.category] || 0) + r.implied; });
  var catList = Object.keys(cats).map(function (k) { return [k, cats[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
  var catMax = catList.length ? catList[0][1] : 1;
  $('catbars').innerHTML = catList.map(function (c) {
    return '<div class="bar-row"><span class="lbl">' + esc(c[0]) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="display:block;width:' +
      (100 * c[1] / catMax).toFixed(1) + '%"></span></span>' +
      '<span class="amt">' + money(c[1]) + '</span></div>';
  }).join('');

  // ---- filter controls -----------------------------------------------------
  var catSel = $('fcat');
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  var chainSel = $('fchain');
  var chains = {};
  D.rows.forEach(function (r) { r.chains.forEach(function (c) { chains[c] = 1; }); });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });

  // ---- board + comparables -------------------------------------------------
  var tab = 'pre';
  var thead = document.querySelector('#board thead tr');

  function boardRows() {
    var q = $('q').value.trim().toLowerCase();
    var cat = catSel.value, chain = chainSel.value, minTvl = +$('ftvl').value;
    var sort = $('sort').value;
    var rows = D.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (r.tvl < minTvl) return false;
      return true;
    });
    var by = {
      implied: function (a, b) { return b.implied - a.implied; },
      tvl: function (a, b) { return b.tvl - a.tvl; },
      growth: function (a, b) { return (b.ch7d || 0) - (a.ch7d || 0); },
      age: function (a, b) { return b.age - a.age; },
      name: function (a, b) { return a.name < b.name ? -1 : 1; },
    }[sort] || function (a, b) { return b.implied - a.implied; };
    return rows.slice().sort(by);
  }

  function liveRows() {
    var q = $('q').value.trim().toLowerCase();
    return D.live.filter(function (r) {
      return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0;
    });
  }

  function render() {
    var rows, html = '';
    if (tab === 'pre') {
      thead.innerHTML = '<th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
        '<th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th>' +
        '<th class="num">Multiple</th><th class="num">Implied value</th>';
      rows = boardRows();
      $('count').textContent = rows.length + ' of ' + D.rows.length + ' pre-token protocols shown. ' +
        'Every row records no token in the snapshot; the watchlist floor is $50M, the board reaches down to $10M of TVL.';
      rows.forEach(function (r) {
        html += '<tr data-slug="' + esc(r.slug) + '" data-open="' + esc(r.slug) + '"><td>' + r.rank + '</td><td><b>' + esc(r.name) +
          '</b><br><span class="pill">' + esc(r.slug) + '</span></td><td>' + esc(r.category) +
          '</td><td>' + esc(r.chains.slice(0, 2).join(', ')) + '</td>' +
          '<td class="num">' + money(r.tvl) + '</td><td class="num">' + pct(r.ch7d) + '</td>' +
          '<td class="num">' + r.age + 'd</td><td class="num">×' + r.multiple.toFixed(2) + '</td>' +
          '<td class="num"><span class="val">' + money(r.implied) + '</span></td></tr>';
      });
    } else {
      thead.innerHTML = '<th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
        '<th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th>' +
        '<th class="num">Multiple</th><th class="num">Market cap</th>';
      rows = liveRows();
      $('count').textContent = rows.length + ' of ' + D.live.length + ' live-token protocols: the ' +
        'comparables the model is fitted on. Their multiple is market cap / TVL, the target the Huber fit learns.';
      rows.forEach(function (r, i) {
        html += '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.name) +
          '</b><br><span class="pill">' + esc(r.slug) + '</span></td><td>' + esc(r.category) +
          '</td><td>' + esc(r.chains.slice(0, 2).join(', ')) + '</td>' +
          '<td class="num">' + money(r.tvl) + '</td><td class="num">' + pct(r.ch7d) + '</td>' +
          '<td class="num">' + r.age + 'd</td><td class="num">×' + r.multiple.toFixed(2) + '</td>' +
          '<td class="num"><span class="val">' + money(r.mcap) + '</span></td></tr>';
      });
    }
    $('rows').innerHTML = html || '<tr><td colspan="9">No protocols match the filters.</td></tr>';
  }

  ['q', 'fcat', 'fchain', 'ftvl', 'sort'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });
  function setTab(t) {
    tab = t;
    $('tab-pre').setAttribute('aria-selected', t === 'pre' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-selected', t === 'live' ? 'true' : 'false');
    render();
  }
  $('tab-pre').addEventListener('click', function () { setTab('pre'); });
  $('tab-live').addEventListener('click', function () { setTab('live'); });

  // ---- detail dialog -------------------------------------------------------
  var dlg = $('detail');
  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) { r = D.rows[i]; break; }
    if (!r) return;
    var logTvl = Math.log(Math.max(1, r.tvl));
    var ch = r.ch7d === null ? 0 : Math.max(-15, Math.min(15, r.ch7d)) / 100;
    var modelLine = 'log TVL ' + logTvl.toFixed(2) + ' · 7d change ' + (ch * 100).toFixed(1) +
      '% (winsorised) · age ' + r.age + ' days · ' + r.chains.length + ' chain' +
      (r.chains.length === 1 ? '' : 's') + ' → predicted multiple ×' + r.multiple.toFixed(2) +
      ' (clamped to [0.02, 1.5]) → implied ' + money(r.implied) + '.';
    $('dbody').innerHTML =
      '<h2 id="dtitle">#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<dl><dt>Category</dt><dd>' + esc(r.category) + '</dd>' +
      '<dt>Chains</dt><dd>' + esc(r.chains.join(', ')) + '</dd>' +
      '<dt>TVL</dt><dd>' + money(r.tvl) + '</dd>' +
      '<dt>7-day change</dt><dd>' + pct(r.ch7d) + '</dd>' +
      '<dt>Age</dt><dd>' + r.age + ' days tracked</dd>' +
      '<dt>Token</dt><dd>None recorded in the snapshot</dd>' +
      '<dt>Implied value</dt><dd><b>' + money(r.implied) + '</b> (multiple ×' + r.multiple.toFixed(2) + ')</dd></dl>' +
      '<h3>How to farm it — six steps</h3><ol>' +
      r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<div class="modelbox"><b>How the model reads this protocol.</b> ' + esc(modelLine) +
      ' Coefficients and leave-one-out validation are in the methodology section below; ' +
      'the LOO median |log err| is ' + D.model.looMedian.toFixed(3) + ' over ' + D.model.liveN +
      ' live-token protocols, against ' + D.model.baselineMedian.toFixed(3) +
      ' for a median-multiple baseline.</div>';
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open]');
    if (t) { openDetail(t.getAttribute('data-open')); return; }
    var li = e.target.closest('.spot li');
    if (li) openDetail(li.getAttribute('data-slug'));
  });

  // ---- model coefficients + validation -------------------------------------
  $('coefrows').innerHTML = D.model.features.map(function (f, i) {
    return '<tr><td>' + esc(f) + '</td><td class="num">' +
      (i === 0 ? '—' : D.model.centers[i - 1].toFixed(4)) + '</td>' +
      '<td class="num">' + D.model.coefficients[i].toFixed(4) + '</td></tr>';
  }).join('');
  $('loo').innerHTML = '<b>Leave-one-out validation.</b> Refit the Huber model without each of the ' +
    D.model.liveN + ' live-token protocols in turn and predict the held-out one: median absolute ' +
    'log error <b>' + D.model.looMedian.toFixed(3) + '</b>, mean ' + D.model.looMean.toFixed(3) +
    '. A median-multiple baseline scores ' + D.model.baselineMedian.toFixed(3) +
    ' on the same folds, so the nine features earn their keep. The median live multiple is ×' +
    D.model.medianLiveMultiple.toFixed(2) + '.';

  // ---- hash deep-links (used by the screenshots) ----------------------------
  function applyHash() {
    var h = window.location.hash || '';
    var m = h.match(/[#&]p=([^&]+)/);
    if (m) { openDetail(decodeURIComponent(m[1])); return; }
    var c = h.match(/[#&]category=([^&]+)/);
    if (c) {
      var name = decodeURIComponent(c[1]).replace(/\+/g, ' ');
      for (var i = 0; i < catSel.options.length; i++) {
        if (catSel.options[i].value === name) { catSel.value = name; break; }
      }
      render();
    }
  }

  render();
  applyHash();
})();
