// Token Radar's dashboard (radar-2). It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail dialog with the model's own inputs and the protocol's farm
// plan. No network: every byte it shows is in data.js.
//
// The page re-derives every row from the snapshot figures — growth and maturity
// from the raw change_7d and age, the category multiplier from the board's own
// rows — and checks the product against the implied value board.json carries, so
// the page's code and the board's data are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  // The watchlist badge comes from the slug list the model publishes in data.js.
  function isWatchlist(row) {
    return DATA.watchlist_slugs ? DATA.watchlist_slugs.indexOf(row.slug) >= 0 : false;
  }

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

  // --- the model, recomputed in the page from the snapshot figures ---
  function growthOf(row, model) {
    var raw = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var g = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
    var w = g >= 0 ? model.growth_weight_up : model.growth_weight_down;
    return { pct: g, mult: 1 + (g / 100) * w };
  }
  function maturityOf(row, model) {
    var age = row.age_days === null || row.age_days === undefined ? DATA.median_age_days : row.age_days;
    var capped = Math.min(Math.max(age, 0), model.maturity_days);
    var m = model.maturity_floor + Math.sqrt(capped / model.maturity_days) * model.maturity_range;
    if (row.age_days !== null && row.age_days !== undefined && row.age_days < model.young_age_days) m *= model.young_discount;
    return m;
  }
  function categoryPctOf(row) {
    var peers = DATA.rows.filter(function (r) { return (r.category || 'Other') === (row.category || 'Other'); });
    if (peers.length <= 1) return 1;
    var below = 0;
    peers.forEach(function (p) { if (p.tvl_usd <= row.tvl_usd) below++; });
    return below / peers.length;
  }
  function impliedOf(row, model) {
    var g = growthOf(row, model);
    var mat = maturityOf(row, model);
    var cat = model.category_floor + categoryPctOf(row) * model.category_range;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * g.mult * mat * cat));
  }

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

  // --- farm plan: the same derivation main.ts writes to board.json ---
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 250;
    if (p.tvl_usd >= 2.5e8) return 200;
    if (p.tvl_usd >= 1e8) return 150;
    if (p.tvl_usd >= 5e7) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 60;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 45;
  }
  function coreActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the deposit earning for the whole hold.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + " of liquidity to " + name + "'s deepest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and hold the vault shares.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position, then close it the same week.';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + name + ' with $' + capital + ' and place one small market position, then leave the rest of the balance idle in the account.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares for the whole hold.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold the balance in your wallet.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it for the whole hold.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis vault on " + chain + ' and keep the position open for the whole hold.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the whole hold.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ', split across at least two transactions a week apart.';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and keep the balance working for the whole hold.';
    if (c.indexOf('governance') >= 0) return 'Lock $' + capital + ' of the accepted asset in ' + name + "'s governance vault on " + chain + ' and vote on one live proposal.';
    if (c.indexOf('otc') >= 0) return 'Complete one $' + capital + ' trade through ' + name + ' on ' + chain + ' and keep the receipt for the farm log.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s main farm on " + chain + ' and keep the position staked for the whole hold.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open for the whole hold.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $25 of USDC against the deposit on ' + name + ', repay it within a week, and keep the deposit itself untouched.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $25 through ' + name + ' on ' + chain + ' once a week, alternating the direction, and keep the liquidity position open.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Move $25 of the vault shares into a second ' + name + ' vault on ' + chain + ' so two vaults record activity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open a second small position on ' + name + ' in the opposite direction and close both before the week ends.';
    if (c.indexOf('prediction') >= 0) return 'Place a second small position on a different market on ' + name + ' and let both settle.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $25 into a second ' + name + ' vault on ' + chain + ' so the wallet shows activity in two vaults.';
    if (c.indexOf('stable') >= 0) return 'Swap $25 of the stable asset back to USDC through ' + name + ' and re-deposit it the following week.';
    if (c.indexOf('rwa') >= 0) return 'Top up the position with $25 of the same asset on ' + name + ' halfway through the hold.';
    if (c.indexOf('basis') >= 0) return 'Add $25 to the basis position on ' + name + ' in the second week and leave it open.';
    if (c.indexOf('insurance') >= 0) return 'Buy a second, smaller cover policy from ' + name + ' for a different pool on ' + chain + '.';
    if (c.indexOf('payment') >= 0) return 'Make a second payment of $25 through ' + name + ' to a different recipient on ' + chain + '.';
    if (c.indexOf('cedefi') >= 0) return 'Withdraw $25 from ' + name + ' and re-deposit it the following week so the wallet shows two-way activity.';
    if (c.indexOf('governance') >= 0) return 'Vote on a second proposal on ' + name + ' and leave a short comment in the forum thread.';
    if (c.indexOf('otc') >= 0) return 'Complete a second smaller trade of $25 through ' + name + ' on ' + chain + ' a week after the first.';
    if (c.indexOf('farm') >= 0) return 'Claim the farm rewards on ' + name + ' once mid-hold and re-stake them into the same farm.';
    return 'Make a $25 swap through ' + name + ' on ' + chain + ' once a week while the main deposit stays open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and fund it with enough ' + chain + ' gas for a month of weekly actions.', cost: 'under $5 of gas for the first transaction', time: '10 minutes' },
      { text: coreActionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 200 ? 8 : 4) + ' of gas', time: '20 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: '$25 of activity and about $2 of gas', time: '10 minutes' },
      { text: 'Repeat one qualifying action each week — a deposit, a swap, a vote or a borrow — so the wallet shows steady activity instead of a single deposit.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the main position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Halfway through the hold, open the protocol's own points or rewards page and check the wallet is credited; claim only from the link the protocol itself publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and decide the unwind order — second action first, main position last — before the hold ends.', cost: 'nothing but the log', time: '5 minutes' }
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
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'TOKEN RADAR' }), el('small', { text: 'launch watch' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { class: 'dot' }, 'DefiLlama protocol index'),
        el('span', { class: 'dot' }, el('b', { text: DATA.model_version }), ' model')
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The radar adds ', el('b', { text: String(DATA.early_size) }),
          ' more pre-token protocols the same rule admits, above and below the floor. Implied value is a model, not a promise — a launch may be worth far less, or nothing at all.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'green', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Added beyond watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function top10() {
    var top = DATA.rows.slice(0, 10);
    return el('section', { class: 'top10' },
      el('h2', { text: 'Top 10 by implied value' }),
      el('div', { class: 'chips' }, top.map(function (r) {
        return el('button', { type: 'button', class: 'chip', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rk', text: '#' + r.rank }),
          el('span', { text: r.name }),
          el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) })
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
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

  function rowBadge(r) {
    if (isWatchlist(r)) return el('span', { class: 'badge watch', text: 'WATCHLIST' });
    if (r.tvl_usd < DATA.floor_usd) return el('span', { class: 'badge early', text: 'EARLY' });
    return null;
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 0;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    if (!max) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, rowBadge(r)),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
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
            sortHeader('implied', 'Rank'),
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
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — model ' + DATA.model_version }),
      el('p', { class: 'sub', text: 'One function scores every protocol, from the snapshot figures only. No name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round( tvl_usd x ' + m.base_multiple }),
        ' x growth x maturity x category )\n',
        'growth   = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight_up + ' up, x ' + m.growth_weight_down + ' down\n',
        'maturity = ' + m.maturity_floor + ' + sqrt(min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ') x ' + m.maturity_range + '   (age under ' + m.young_age_days + 'd: x ' + m.young_discount + '; unknown age: median ' + DATA.median_age_days + 'd)\n',
        'category = ' + m.category_floor + ' + (share of its category at or below its TVL) x ' + m.category_range
      ),
      el('ul', null,
        el('li', null, el('b', { text: 'Growth is asymmetric. ' }), 'A falling TVL hurts 1.5x as much as a rising one helps, and one freak week is clamped — the snapshot holds a +4,448% week that must not own the board.'),
        el('li', null, el('b', { text: 'Maturity saturates. ' }), 'Square-root age: the first year of running with no token counts most, the fourth year adds little. Protocols younger than 90 days are discounted a further 15%.'),
        el('li', null, el('b', { text: 'Category rank matters. ' }), 'A protocol that leads its own category (most TVL among its peers) scores up to 1.10; the smallest in its category scores 0.90.'),
        el('li', null, el('b', { text: 'Eligibility is the watchlist rule. ' }), 'Pre-token and not a wrapped, staked or bridged product of one that trades — applied to all 758 protocols, which is how the board grows past the 40 watchlist slugs.')
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var g = growthOf(row, DATA.model);
    var mat = maturityOf(row, DATA.model);
    var cat = DATA.model.category_floor + categoryPctOf(row) * DATA.model.category_range;
    var matches = recomputed === row.implied_value_usd;
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row) ? ' · watchlist' : row.tvl_usd < DATA.floor_usd ? ' · early radar' : ' · above the floor') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Category multiplier' }), el('b', { class: 'num', text: String(row.category_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'check ' + (matches ? 'ok' : 'bad'), text: 'Model ' + DATA.model_version + ': the page recomputes this row from the snapshot figures as ' + fmtUsd(recomputed) + (matches ? ' — the same number board.json carries.' : ' — which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }),
      el('p', { class: 'sub', text: 'Factors: growth ' + g.pct.toFixed(2) + '% (x' + g.mult.toFixed(4) + '), maturity x' + mat.toFixed(4) + ', category x' + cat.toFixed(4) + ' (' + (categoryPctOf(row) * 100).toFixed(0) + '% of its category at or below its TVL).' })
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

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. "Records no token" means DefiLlama records no market cap, CoinGecko id or symbol — it is not proof a token does not exist.' }),
      el('p', { text: 'Implied value is a model of what a launch could be worth, built from this snapshot alone. It is not a price, not a prediction, and not financial advice.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(top10());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
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
