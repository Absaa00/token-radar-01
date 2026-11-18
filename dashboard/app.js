// Token launch radar dashboard (radar-4). Reads window.RADAR from data.js:
// rows are positional arrays [rank, slug, name, category, chains, tvl, ch7d,
// ageDays, implied, logMultiple]; live rows are [slug, name, category, chains,
// tvl, mcap, ch7d]. No network, no fetch.
(function () {
  var D = window.RADAR;
  var rows = D.rows.map(function (r) {
    return { rank: r[0], slug: r[1], name: r[2], cat: r[3], chains: r[4], tvl: r[5], ch: r[6], age: r[7], implied: r[8], logMult: r[9] };
  });
  var live = D.live.map(function (r) {
    return { slug: r[0], name: r[1], cat: r[2], chains: r[3], tvl: r[4], mcap: r[5], ch: r[6] };
  });
  var beta = D.model.beta;

  function $(id) { return document.getElementById(id); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(c) { return c === null || c === undefined ? '—' : (c > 0 ? '+' : '') + c.toFixed(1) + '%'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- stats + spotlight ----
  var top = rows.slice(0, 10);
  var med = rows.map(function (r) { return r.implied; }).sort(function (a, b) { return a - b; })[Math.floor(rows.length / 2)];
  $('stats').innerHTML =
    '<div class="stat"><b>' + rows.length + '</b><span>protocols ranked</span></div>' +
    '<div class="stat"><b>' + D.watchlist_size + '</b><span>watchlist covered</span></div>' +
    '<div class="stat"><b>' + money(rows[0].implied) + '</b><span>top implied value</span></div>' +
    '<div class="stat"><b>' + money(med) + '</b><span>median implied value</span></div>' +
    '<div class="stat"><b>' + D.validation.loo_median_abs_log_err + '</b><span>LOO median |log err| (' + D.validation.n_live + ' live)</span></div>';
  $('spotlight').innerHTML = top.map(function (r) {
    return '<li><b>#' + r.rank + '</b> ' + esc(r.name) + ' &mdash; ' + money(r.implied) + ' <small>(' + esc(r.cat || 'uncategorized') + ', ' + money(r.tvl) + ' TVL)</small></li>';
  }).join('');
  $('looMed').textContent = D.validation.loo_median_abs_log_err + ' (mean ' + D.validation.loo_mean_abs_log_err + ')';
  $('looHeu').textContent = D.validation.heuristic_median_abs_log_err + ' (mean ' + D.validation.heuristic_mean_abs_log_err + ')';
  $('asof').textContent = D.as_of;
  $('coefs').querySelector('tbody').innerHTML = D.model.features.map(function (f, i) {
    return '<tr><td>' + esc(f) + '</td><td class="num">' + beta[i].toFixed(4) + '</td></tr>';
  }).join('');

  // ---- filters ----
  var cats = [...new Set(rows.map(function (r) { return r.cat || 'Uncategorized'; }))].sort();
  var chains = [...new Set(rows.flatMap(function (r) { return r.chains; }))].sort();
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; $('cat').appendChild(o); });
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o); });

  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value, ch = $('chain').value, min = parseFloat($('minTvl').value) || 0;
    var list = rows.filter(function (r) {
      return (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
        (!cat || (r.cat || 'Uncategorized') === cat) &&
        (!ch || r.chains.includes(ch)) && r.tvl >= min;
    });
    var s = $('sort').value;
    if (s === 'tvl') list.sort(function (a, b) { return b.tvl - a.tvl; });
    else if (s === 'mult') list.sort(function (a, b) { return b.logMult - a.logMult; });
    else if (s === 'ch') list.sort(function (a, b) { return (b.ch || 0) - (a.ch || 0); });
    else if (s === 'age') list.sort(function (a, b) { return (b.age || 0) - (a.age || 0); });
    else list.sort(function (a, b) { return a.rank - b.rank; });
    return list;
  }
  function render() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' shown';
    $('board').querySelector('tbody').innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + '</td><td>' + esc(r.name) + '</td><td>' +
        esc(r.cat || '—') + '</td><td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') +
        '</td><td class="num">' + money(r.tvl) + '</td><td class="num">' + pct(r.ch) + '</td><td class="num">' +
        Math.exp(r.logMult).toFixed(3) + 'x</td><td class="num"><b>' + money(r.implied) + '</b></td></tr>';
    }).join('');
  }
  ['q', 'cat', 'chain', 'minTvl', 'sort'].forEach(function (id) { $(id).addEventListener('input', render); });
  render();

  // ---- live tab ----
  $('live').querySelector('tbody').innerHTML = live.map(function (r) {
    return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.cat || '—') + '</td><td>' + esc(r.chains.slice(0, 3).join(', ')) +
      '</td><td class="num">' + money(r.tvl) + '</td><td class="num">' + money(r.mcap) + '</td><td class="num">' + (r.mcap / r.tvl).toFixed(3) + 'x</td></tr>';
  }).join('');
  function showTab(pre) {
    $('tabPre').classList.toggle('on', pre);
    $('tabLive').classList.toggle('on', !pre);
    $('board').hidden = !pre;
    $('live').hidden = pre;
  }
  $('tabPre').addEventListener('click', function () { showTab(true); });
  $('tabLive').addEventListener('click', function () { showTab(false); });

  // ---- model breakdown + farm plan for one row ----
  function features(r) {
    var c = D.model.centers;
    var logTvl = Math.log(Math.max(1, r.tvl)) - c.logTVL;
    var ch = Math.min(15, Math.max(-15, r.ch === null ? 0 : r.ch)) / 100 - c.ch7d;
    var ageY = ((r.age === null || r.age === undefined) ? 365 : r.age) / 365 - c.age_years;
    var logCh = Math.log(Math.max(1, r.chains.length));
    return [1, logTvl, ch, ageY, logCh, ch * ch, ch * logTvl, ch * ageY, logTvl * ageY];
  }
  function capital(tvl) {
    if (tvl >= 5e9) return 5000;
    if (tvl >= 1e9) return 2000;
    if (tvl >= 1e8) return 1000;
    return 500;
  }
  function action(r, cap, chain) {
    var c = (r.cat || '').toLowerCase(), n = r.name;
    if (/lend|cdp|collateral/.test(c)) return 'Supply $' + cap.toLocaleString('en-US') + ' of USDC to ' + n + ' on ' + chain + ' and keep the position open.';
    if (/dex|yield|leveraged farm/.test(c)) return 'Provide $' + cap.toLocaleString('en-US') + ' of liquidity to ' + n + '\'s main pool on ' + chain + ' and keep the position open.';
    if (/bridge/.test(c)) return 'Bridge $' + cap.toLocaleString('en-US') + ' of USDC to ' + chain + ' through ' + n + ' and use the bridged funds in its app.';
    if (/staking|restak/.test(c)) return 'Stake $' + cap.toLocaleString('en-US') + ' of the chain\'s staking asset through ' + n + ' and keep the receipt.';
    if (/perpetual|derivative/.test(c)) return 'Deposit $' + cap.toLocaleString('en-US') + ' of USDC as margin on ' + n + ' and open one small hedge.';
    if (/prediction/.test(c)) return 'Fund $' + cap.toLocaleString('en-US') + ' and place one market position on ' + n + '.';
    if (/curator|allocator/.test(c)) return 'Deposit $' + cap.toLocaleString('en-US') + ' into a ' + n + ' vault on ' + chain + ' and keep the shares.';
    if (/stable/.test(c)) return 'Mint or deposit $' + cap.toLocaleString('en-US') + ' of the stable asset through ' + n + ' on ' + chain + '.';
    if (/rwa/.test(c)) return 'Mint $' + cap.toLocaleString('en-US') + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (/insurance/.test(c)) return 'Buy $' + cap.toLocaleString('en-US') + ' of cover from ' + n + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + cap.toLocaleString('en-US') + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }
  function farmPlan(r) {
    var cap = capital(r.tvl), chain = r.chains[0] || 'its main chain';
    var hold = r.age === null ? 30 : r.age < 180 ? 60 : r.age < 365 ? 45 : 30;
    var gas = cap >= 2000 ? 12 : 6;
    return [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      [action(r, cap, chain), '$' + cap.toLocaleString('en-US') + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'],
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the $' + cap.toLocaleString('en-US') + ' stays in the position', hold + ' days'],
      ['Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', 'nothing but the log', '5 minutes'],
    ];
  }
  function openDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var xs = features(r);
    var parts = xs.map(function (x, i) {
      return '<tr><td>' + esc(D.model.features[i]) + '</td><td class="num">' + x.toFixed(3) + '</td><td class="num">' + beta[i].toFixed(4) + '</td><td class="num">' + (beta[i] * x).toFixed(3) + '</td></tr>';
    }).join('');
    var plan = farmPlan(r).map(function (s, i) {
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s[0]) + ' <small>Cost: ' + esc(s[1]) + '. Time: ' + esc(s[2]) + '.</small></li>';
    }).join('');
    $('dlgBody').innerHTML =
      '<h3>#' + r.rank + ' ' + esc(r.name) + '</h3>' +
      '<dl class="kv"><dt>Implied value</dt><dd><b>' + money(r.implied) + '</b></dd>' +
      '<dt>TVL</dt><dd>' + money(r.tvl) + '</dd><dt>7d change</dt><dd>' + pct(r.ch) + '</dd>' +
      '<dt>Category</dt><dd>' + esc(r.cat || '—') + '</dd><dt>Chains</dt><dd>' + esc(r.chains.join(', ')) + '</dd>' +
      '<dt>Age</dt><dd>' + (r.age === null ? 'unknown' : r.age + ' days') + '</dd>' +
      '<dt>Fitted multiple</dt><dd>' + Math.exp(r.logMult).toFixed(3) + 'x (clamped to [0.02, 1.5])</dd></dl>' +
      '<h4>How the multiple is built</h4>' +
      '<table><thead><tr><th>Feature</th><th class="num">Value</th><th class="num">Coef</th><th class="num">Contribution</th></tr></thead><tbody>' + parts + '</tbody></table>' +
      '<p class="note">Contributions sum to log(multiple) = ' + r.logMult.toFixed(3) + '; implied = TVL &times; ' + Math.exp(r.logMult).toFixed(3) + '.</p>' +
      '<h4>Farm plan &mdash; deposit $' + capital(r.tvl).toLocaleString('en-US') + ', setup about $45 + 60 minutes</h4><ol>' + plan + '</ol>';
    var dlg = $('dlg');
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }
  $('board').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('dlgClose').addEventListener('click', function () { $('dlg').close(); });

  // ---- deep links: #p=<slug> opens the detail, #category=<name> filters ----
  function hash() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.get('p')) openDetail(h.get('p'));
    if (h.get('category')) { $('cat').value = h.get('category'); render(); }
  }
  window.addEventListener('hashchange', hash);
  hash();
})();
