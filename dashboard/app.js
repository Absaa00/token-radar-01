// Token Radar's dashboard: reads window.RADAR (data.js, written by main.ts) and renders the
// ranked board, filters, a per-protocol detail view with the model's inputs and farm plan.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(3); }

  // Rows are positional arrays: [rank, slug, name, category, chains ("Base+10"), tvl, chg7d,
  // ageDays, implied, catMult, growthMult, maturityMult, breadthMult, onWatchlist].
  function R(a) {
    return { rank: a[0], slug: a[1], name: a[2], category: a[3], chain: a[4],
      tvl: a[5], chg: a[6], age: a[7], implied: a[8], mult: a[9], gm: a[10], mm: a[11], bm: a[12], wl: a[13] === 1 };
  }
  var ROWS = DATA.rows.map(R);
  var BY_SLUG = {};
  ROWS.forEach(function (r) { BY_SLUG[r.slug] = r; });

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chain, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function capitalFor(r) {
    if (r.tvl >= 1e9) return 250;
    if (r.tvl >= 1e8) return 150;
    if (r.tvl >= 1e7) return 100;
    return 50;
  }
  function holdDaysFor(r) {
    if (r.age === null || r.age === undefined) return 45;
    if (r.age < 180) return 60;
    if (r.age < 365) return 45;
    return 30;
  }
  function actionFor(r, capital) {
    var c = r.category.toLowerCase();
    var name = r.name, chain = r.chain;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0)
      return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares while the vault earns.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open so it counts in snapshots.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0)
      return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0)
      return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge, then hold it.';
    if (c.indexOf('yield aggregator') >= 0)
      return 'Deposit $' + capital + ' of USDC into a ' + name + ' strategy vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('yield') >= 0)
      return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0)
      return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0)
      return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('prediction') >= 0)
      return 'Fund $' + capital + ' and place one market position on ' + name + ', then leave the funds working.';
    if (c.indexOf('stable') >= 0)
      return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0)
      return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it in your wallet.';
    if (c.indexOf('insurance') >= 0)
      return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0)
      return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' and keep the account active.';
    if (c.indexOf('chain') >= 0)
      return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use it in one of the chain's apps.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(r) {
    var c = r.category.toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return 'Make one qualifying action each week, such as a supply top-up, a borrow, a repay or a vote.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0)
      return 'Make one qualifying action each week, such as a swap, a liquidity top-up or a fee claim.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0)
      return 'Make one qualifying action each week, such as a small trade, a margin top-up or a funding claim.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0)
      return 'Make one qualifying action each week, such as a deposit, a rebalance or a rewards claim.';
    if (c.indexOf('rwa') >= 0)
      return 'Make one qualifying action each week, such as a mint, a top-up or a yield claim.';
    return 'Make one qualifying action each week, such as a deposit, a swap, a vote or a claim.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(r) {
    var capital = capitalFor(r), hold = holdDaysFor(r);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(r, capital), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(r), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot, and check the protocol\'s own points page monthly.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes; never pay anyone to claim for you.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position, prove the activity, or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return ROWS.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chain !== state.chain) return false;
      if (r.tvl < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, r.chain].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'tvl') { av = a.tvl; bv = b.tvl; }
      else if (key === 'growth') { av = a.chg === null ? -Infinity : a.chg; bv = b.chg === null ? -Infinity : b.chg; }
      else if (key === 'age') { av = a.age === null ? Infinity : a.age; bv = b.age === null ? Infinity : b.age; }
      else { av = a.implied; bv = b.implied; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function chainsOf(r) { return r.chain; }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = ROWS[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { html: 'Which protocol without a token is worth farming <em>next</em>?' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model calibrated on live tokens, not a promise of a launch.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every watchlist protocol ranked' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' early rows below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtUsd(top.implied) }), el('small', { text: top.name + ' — rank 1' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'their market caps calibrate the model' }))
      )
    );
  }

  function spotlight() {
    var top = ROWS.slice(0, 5);
    return el('section', { class: 'spot' },
      el('h2', { text: 'Top 5 by implied value' }),
      el('p', { class: 'sub', text: 'Select a card for its model breakdown and farm plan.' }),
      el('div', { class: 'spot-grid' }, top.map(function (r) {
        return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rk', text: 'RANK ' + r.rank + (r.wl ? ' · WATCHLIST' : '') }),
          el('b', { text: r.name }),
          el('span', { class: 'v', text: fmtUsd(r.implied) }),
          el('span', { class: 'm', text: r.category + ' · TVL ' + fmtUsd(r.tvl) })
        );
      }))
    );
  }

  function catBars() {
    var counts = {};
    ROWS.forEach(function (r) { counts[r.category] = (counts[r.category] || 0) + 1; });
    var list = Object.keys(counts).map(function (c) { return { c: c, n: counts[c] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var max = list.length ? list[0].n : 1;
    return el('section', { class: 'panel' },
      el('h2', { text: 'Where the board concentrates' }),
      el('p', { class: 'sub', text: 'Rows by category. Risk curators dominate the watchlist: vaults and allocators running other people\'s capital with no token of their own.' }),
      el('div', { class: 'catbars' }, list.map(function (x) {
        return el('div', { class: 'catbar' },
          el('span', { text: x.c }),
          el('div', { class: 'track' }, el('i', { style: 'width:' + Math.max(4, Math.round((x.n / max) * 100)) + '%' })),
          el('span', { class: 'n', text: x.n + ' rows' })
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(ROWS.map(function (r) { return r.category; }))).sort();
    var chainCounts = {};
    ROWS.forEach(function (r) { chainCounts[r.chain] = (chainCounts[r.chain] || 0) + 1; });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 12);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by main chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var tvlSel = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' },
      [0, 5e6, 1e7, 1e8, 1e9].map(function (v) {
        return el('option', { value: String(v), text: v === 0 ? 'Any TVL' : 'TVL ≥ ' + fmtUsd(v), selected: state.minTvl === v ? 'selected' : null });
      })
    );
    tvlSel.addEventListener('change', function () { state.minTvl = Number(tvlSel.value); writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Main chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Size' }), tvlSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = ROWS[0].implied || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.chg === null ? 'n/a' : fmtPct(r.chg);
      var growthClass = r.chg === null ? '' : r.chg >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), r.wl ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: r.category + ' on ' + chainsOf(r) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    // Live rows are positional arrays: [name, category, chains, tvl, mcap, chg7d, ratio].
    DATA.live.forEach(function (a) {
      var r = { name: a[0], category: a[1], chains: a[2], tvl: a[3], mcap: a[4], chg: a[5], ratio: a[6] };
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.category + ' on ' + r.chains }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl) }),
        el('td', { class: 'num ' + (r.chg !== null && r.chg >= 0 ? 'pos' : 'neg'), text: fmtPct(r.chg) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : r.ratio.toFixed(2) + 'x' }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap / TVL ratios calibrate the board\'s category multiples.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var multRows = Object.keys(DATA.multiples).map(function (c) {
      return { c: c, v: DATA.multiples[c], n: DATA.comparables[c] || 0 };
    }).sort(function (a, b) { return b.v - a.v; });
    return el('section', { class: 'panel' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x min(chains - 1, 10)) )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is the median market-cap / TVL of the live-token protocols in that category (three or more comparables, clamped to ' + m.multiple_floor + '–' + m.multiple_cap + '). Fewer comparables use the global median, ' + fmtMult(DATA.global_multiple) + ', across all 128 live protocols. Age is the time since first listing; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Multiple' }), el('th', { scope: 'col', text: 'Live comparables' }))),
        el('tbody', null, multRows.map(function (x) {
          return el('tr', null,
            el('td', { text: x.c }),
            el('td', { class: 'num', text: fmtMult(x.v) + 'x' }),
            el('td', { class: 'num', text: String(x.n) + (x.n < m.min_comparables ? ' — uses global median' : '') })
          );
        }))
      ),
      el('p', { class: 'note', text: 'What this board is not: it does not predict whether or when a protocol issues a token. It says what a token would be worth if the protocol\'s record stayed as it is, and what to do to farm it. "Records no token" means the snapshot carries none — a protocol may still have one its record does not carry.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = BY_SLUG[slug];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var base = Math.round(row.tvl * row.mult);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.wl ? ' · WATCHLIST' : ' · EARLY RADAR') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: row.category + ' on ' + chainsOf(row) + ' · listed ' + fmtAge(row.age) + ' ago' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the model, factor by factor' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl) })),
        el('div', null, el('span', { text: row.category + ' multiple' }), el('b', { class: 'num', text: fmtMult(row.mult) + 'x' })),
        el('div', null, el('span', { text: 'Base value (TVL x multiple)' }), el('b', { class: 'num', text: fmtUsd(base) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.chg) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: 'x' + row.gm.toFixed(3) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: 'x' + row.mm.toFixed(3) })),
        el('div', null, el('span', { text: 'Chain-breadth multiplier' }), el('b', { class: 'num', text: 'x' + row.bm.toFixed(3) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the multiple is the median market-cap / TVL of the ' + (DATA.comparables[row.category] || 0) + ' live ' + row.category + ' protocols' + ((DATA.comparables[row.category] || 0) < DATA.model.min_comparables ? ', below the bar of ' + DATA.model.min_comparables + ', so this row uses the global median ' + fmtMult(DATA.global_multiple) : '') + '. An estimate, not a price, and not a prediction that a token launches.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(catBars());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot', text: 'Token Radar · snapshot ' + DATA.as_of + ' · ' + DATA.model_version + ' model · ' + DATA.board_size + ' pre-token protocols ranked · data: DefiLlama protocol index, frozen at the snapshot · implied values are the entry\'s own claim, never a price.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
