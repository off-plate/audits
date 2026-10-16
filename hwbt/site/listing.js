// HWBT Research Box v2: the shop-style listing (filter rail, live facet counts, active chips, sort, list/grid).
// Every facet is built from fields that exist in data/parts.js. Filters live in the URL hash as f_* params.
(function () {
  const U = window.UI, H = U.H, esc = U.esc, I = U.I, $ = U.$, $$ = U.$$;
  const { plural } = U;
  const CUR = ['GBP', 'EUR', 'USD'];
  const curRank = c => (CUR.indexOf(c) < 0 ? 9 : CUR.indexOf(c));
  const EV_RANK = { workshop: 0, documented: 1, reported: 2 };
  const ALT_LABEL = Object.fromEntries(H.ALT_TYPES.map(t => [t.key, t.label]));

  // ---------- brands (alternatives' "by" field, cleaned of notes and spelling variants) ----------
  const GENERIC = /^(aftermarket|unbranded|unknown brand|generic\b)/i;
  const ALIAS = { febi: 'febibilstein', akrapovic: 'akrapovic' };
  function brandOf(by) {
    if (!by || by === 'null') return null;
    let name = String(by).trim();
    const m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
    if (m) name = GENERIC.test(m[1]) ? (/^[\w&.' -]{2,30}$/.test(m[2]) && !/suggest|programme|supplier/i.test(m[2]) ? m[2] : '') : m[1];
    if (!name || GENERIC.test(name)) return null;
    let key = H.norm(name).replace(/[^a-z0-9]/g, '');
    key = ALIAS[key] || key;
    return key ? { key, name } : null;
  }
  const brandNames = {};
  for (const p of H.data.parts) for (const a of p.alts) {
    if (a.type === 'same-oe-other-car') continue;
    const b = brandOf(a.by); if (!b) continue;
    const t = (brandNames[b.key] = brandNames[b.key] || {}); t[b.name] = (t[b.name] || 0) + 1;
  }
  const brandLabel = k => { const t = brandNames[k]; if (!t) return k; return Object.entries(t).sort((a, b) => b[1] - a[1] || (/[a-z]/.test(b[0]) - /[a-z]/.test(a[0])))[0][0]; };

  // ---------- part fields ----------
  const memo = new Map();
  function pf(p) {
    if (memo.has(p)) return memo.get(p);
    const keys = new Set(p.veh);
    for (const a of p.alts) if (a.type === 'same-oe-other-car') for (const k of a.veh) keys.add(k);
    const cars = [...keys].filter(k => { const v = H.vehicle(k); return v && v.key; });
    const brands = new Set();
    for (const a of p.alts) if (a.type !== 'same-oe-other-car') { const b = brandOf(a.by); if (b) brands.add(b.key); }
    const o = {
      cars, makes: [...new Set(cars.map(k => k.split('/')[0]))], brands: [...brands],
      alts: [...new Set(p.alts.map(a => a.type))], pos: p.position.slice(), saving: H.bestSaving(p),
      video: !!(p.video || (p.frames && p.frames.length)),
    };
    memo.set(p, o); return o;
  }

  // ---------- facet definitions ----------
  // type: tree | multi | bool | price. values(item) -> array of value keys.
  function partFacets(ctx) {
    const f = [];
    f.push({ key: 'cat', label: ctx.catRoot ? 'Subcategory' : 'Category', type: 'tree' });
    f.push({ key: 'make', label: 'Car make', type: 'multi', values: p => pf(p).makes, labelOf: v => (H.make(v) || { name: v }).name, hint: 'Cars the part is recorded on or shares its OE part with.' });
    f.push({ key: 'model', label: 'Model', type: 'multi', values: p => pf(p).cars, labelOf: v => H.vehicle(v).label });
    f.push({ key: 'alt', label: 'Alternative type', type: 'multi', values: p => pf(p).alts, labelOf: v => ALT_LABEL[v], fixed: H.ALT_TYPES.map(t => t.key) });
    f.push({ key: 'brand', label: 'Brand', type: 'multi', values: p => pf(p).brands, labelOf: brandLabel, hint: 'Brands of the OE-equivalent, aftermarket and upgraded alternatives.' });
    f.push({ key: 'price', label: 'Genuine price', type: 'price', price: p => p.price });
    f.push({ key: 'pos', label: 'Position', type: 'multi', values: p => pf(p).pos, labelOf: v => v, fixed: ['Front', 'Rear', 'Left', 'Right'] });
    f.push({ key: 'ev', label: 'Evidence', type: 'multi', values: p => [p.evidence], labelOf: v => H.EVIDENCE[v].label, fixed: ['workshop', 'documented', 'reported'] });
    const bools = [];
    if (ctx.mine) bools.push({ key: 'mine', label: `Fits my ${H.vehicle(ctx.mine).short}`, test: p => !!H.fitRole(p, ctx.mine) });
    bools.push({ key: 'save', label: 'Saving available', test: p => !!pf(p).saving });
    bools.push({ key: 'video', label: 'Has video', test: p => pf(p).video });
    bools.push({ key: 'svc', label: 'Service parts', test: p => !!p.service });
    bools.push({ key: 'oe', label: 'OE number known', test: p => !!p.oe });
    f.splice(1, 0, ...bools.map(b => ({ ...b, type: 'bool', group: 'show' })));
    return f;
  }
  function offerFacets() {
    const typeOf = o => o.type;
    return [
      { key: 'type', label: 'Source type', type: 'multi', values: o => [typeOf(o)], labelOf: v => v === 'oe' ? 'Genuine' : ALT_LABEL[v], fixed: ['oe', ...H.ALT_TYPES.map(t => t.key)] },
      { key: 'brand', label: 'Brand', type: 'multi', values: o => { const b = o.type !== 'oe' && o.type !== 'same-oe-other-car' ? brandOf(o.by) : null; return b ? [b.key] : []; }, labelOf: brandLabel },
      { key: 'save', label: 'Cheaper than genuine', type: 'bool', group: 'show', test: o => !!offerSaving(o) },
      { key: 'price', label: 'Price', type: 'price', price: o => o.price },
    ];
  }
  const offerSaving = o => (o.type === 'oe' ? null : H.saving(o.part.price, o.price));

  // ---------- state <-> URL ----------
  const isF = k => k.startsWith('f_');
  const listOf = (ps, k) => (ps.get('f_' + k) || '').split(',').filter(Boolean);
  function readState(ps, facets) {
    const st = { sel: {}, bool: {}, price: null, sort: ps.get('f_sort') || '', view: ps.get('f_view') === 'grid' ? 'grid' : 'list' };
    for (const f of facets) {
      if (f.type === 'bool') { if (ps.get('f_' + f.key) === '1') st.bool[f.key] = true; }
      else if (f.type === 'price') { const c = ps.get('f_cur'); const mn = ps.get('f_pmin'), mx = ps.get('f_pmax'); if (c && (mn || mx)) st.price = { cur: c, min: mn ? +mn : null, max: mx ? +mx : null }; st.cur = c || null; }
      else { const l = listOf(ps, f.key); if (l.length) st.sel[f.key] = new Set(l); }
    }
    return st;
  }
  function test(item, f, st, ctx) {
    if (f.type === 'bool') return !st.bool[f.key] || f.test(item);
    if (f.type === 'price') { if (!st.price) return true; const pr = f.price(item); if (!pr || pr.currency !== st.price.cur) return false; return (st.price.min == null || pr.amount >= st.price.min) && (st.price.max == null || pr.amount <= st.price.max); }
    const s = st.sel[f.key]; if (!s || !s.size) return true;
    if (f.type === 'tree') { for (const path of s) if (item.cat === path || item.cat.startsWith(path + '/')) return true; return false; }
    return f.values(item).some(v => s.has(v));
  }
  const pass = (items, facets, st, ctx, except) => items.filter(it => facets.every(f => f.key === except || test(it, f, st, ctx)));
  const activeCount = st => Object.values(st.sel).reduce((n, s) => n + s.size, 0) + Object.keys(st.bool).length + (st.price ? 1 : 0);

  // ---------- sorting ----------
  const SORTS = {
    parts: [['', 'Relevance'], ['saving', 'Biggest saving'], ['plh', 'Price, low to high'], ['phl', 'Price, high to low'], ['az', 'Name, A-Z'], ['ev', 'Strongest evidence']],
    offers: [['', 'Cheapest first'], ['phl', 'Price, high to low'], ['saving', 'Biggest saving'], ['az', 'Name, A-Z']],
  };
  function sortItems(list, kind, sort, cur) {
    const out = list.slice();
    const priceOf = it => (kind === 'parts' ? it.price : it.price);
    const pk = (it, dir) => { const p = priceOf(it); if (!p || p.amount == null) return [3, 0, 0]; return [p.currency === cur ? 0 : 1, curRank(p.currency), dir * p.amount]; };
    const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
    const name = it => (kind === 'parts' ? it.name : it.label) || '';
    const sav = it => (kind === 'parts' ? pf(it).saving : offerSaving(it));
    if (sort === 'saving') out.sort((a, b) => { const x = sav(a), y = sav(b); return cmp(x ? [curRank(x.currency), -x.amount] : [99, 0], y ? [curRank(y.currency), -y.amount] : [99, 0]); });
    else if (sort === 'plh' || (kind === 'offers' && !sort)) out.sort((a, b) => cmp(pk(a, 1), pk(b, 1)));
    else if (sort === 'phl') out.sort((a, b) => cmp(pk(a, -1), pk(b, -1)));
    else if (sort === 'az') out.sort((a, b) => name(a).localeCompare(name(b)));
    else if (sort === 'ev') out.sort((a, b) => EV_RANK[a.evidence] - EV_RANK[b.evidence] || name(a).localeCompare(name(b)));
    return out;
  }

  // ---------- result renderers ----------
  function partCard(p, car) {
    const f = (p.frames || [])[0];
    const same = p.alts.find(a => a.type === 'same-oe-other-car' && U.donorImg(a.donor));
    const img = f ? f.src : same ? U.donorImg(same.donor) : null;
    const s = pf(p).saving;
    const t = p.cat.split('/')[0];
    return `<article class="pcard">
      <div class="pcard-media">${img ? U.img(img, '', 640, 400) : `<span class="pcard-code"><b>${U.pad2(U.topIndex(t))}</b>${esc(H.node(t).name)}</span>`}${U.saveBtn(p.id)}</div>
      <div class="pcard-body"><a class="t" href="${H.href.part(p.id, car && H.fitRole(p, car) ? car : null)}">${esc(p.name)}</a>
        <span class="p">${esc(p.veh.map(k => H.vehicle(k).label).join(', '))}</span>
        <span class="n">${p.oe ? U.pnLink(p.oe.number) : '<em>No OE number</em>'}</span>
        <div class="pcard-foot"><span class="${s ? 's' : ''}">${s ? 'Save ' + H.money(s.amount, s.currency) : plural(p.alts.length, 'alternative')}</span>${U.go()}</div></div></article>`;
  }
  function offerRow(o) {
    const s = offerSaving(o);
    return `<div class="alt"><div><h4>${esc(o.label)}</h4><div class="by">${esc(o.by || (o.part ? H.vehicle(o.part.veh[0]).label : ''))}${o.number ? ' ' + U.pnLink(o.number.split(/\s*\/\s*/)[0]) : ''}</div></div>
      <div class="pr"><strong>${H.money(o.price)}</strong>${s ? `<span class="tag save-t">Save ${H.money(s.amount, s.currency)}</span>` : ''}<small>${esc(o.price.condition || '')}</small></div>
      <div class="lk">${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">Source</a>` : ''}<a href="${H.href.part(o.part.id)}">Part page</a></div></div>`;
  }

  // ---------- the listing ----------
  const collapsed = new Set(['model', 'price', 'pos', 'ev']);
  const expanded = new Set();
  let current = null;

  function mount(opts) {
    const kind = opts.kind || 'parts';
    const noun = kind === 'parts' ? ['part', 'parts'] : ['offer', 'offers'];
    const ctx = { catRoot: opts.catRoot || null, car: opts.car || null, mine: kind === 'parts' && !opts.car && U.currentId() ? U.currentId() : null };
    const facets = kind === 'parts' ? partFacets(ctx) : offerFacets();
    const items = opts.items;
    let rail = opts.rail, main = opts.main;
    if (!rail) {
      main.innerHTML = `<div class="lst"><aside class="lst-rail" aria-label="Filters" data-frail></aside><div class="lst-main" data-main></div></div>`;
      rail = $('[data-frail]', main); main = $('[data-main]', main);
    }
    const path = () => location.hash.split('?')[0];
    const params = () => new URLSearchParams(location.hash.split('?')[1] || '');
    const write = ps => { const s = ps.toString(); const h = path() + (s ? '?' + s : ''); if (h !== location.hash) location.hash = h; };

    // ---- edits on a URLSearchParams (live URL on desktop, pending copy in the mobile sheet) ----
    const setList = (ps, k, list) => { ps.delete('f_' + k); if (list.length) ps.set('f_' + k, list.join(',')); };
    function toggle(ps, k, v) {
      const f = facets.find(x => x.key === k);
      if (f && f.type === 'bool') { const on = ps.get('f_' + k) === '1'; ps.delete('f_' + k); if (!on) ps.set('f_' + k, '1'); return; }
      let l = listOf(ps, k);
      if (l.includes(v)) l = l.filter(x => x !== v);
      else {
        if (f && f.type === 'tree') l = l.filter(x => !(v.startsWith(x + '/') || x.startsWith(v + '/')));
        l.push(v);
      }
      setList(ps, k, l);
    }
    function setPrice(ps, cur, mn, mx) { ['f_cur', 'f_pmin', 'f_pmax'].forEach(k => ps.delete(k)); if (cur) ps.set('f_cur', cur); if (mn != null && mn !== '') ps.set('f_pmin', mn); if (mx != null && mx !== '') ps.set('f_pmax', mx); }
    function clearAll(ps) { for (const k of [...ps.keys()]) if (isF(k) && k !== 'f_sort' && k !== 'f_view') ps.delete(k); }
    function removeLast(ps) {
      const keys = [...ps.keys()].filter(k => isF(k) && !['f_sort', 'f_view', 'f_cur'].includes(k));
      const k = keys[keys.length - 1]; if (!k) return;
      if (k === 'f_pmin' || k === 'f_pmax') return setPrice(ps, null);
      const l = ps.get(k).split(','); l.pop(); ps.delete(k); if (l.length && ps.get(k) !== '1') ps.set(k, l.join(','));
    }

    // ---- facets ----
    function valueRows(f, st, base) {
      const counts = new Map();
      if (f.type === 'tree') return treeRows(f, st, base);
      for (const it of base) for (const v of new Set(f.values(it))) counts.set(v, (counts.get(v) || 0) + 1);
      const sel = st.sel[f.key] || new Set();
      let vals = f.fixed ? f.fixed.filter(v => counts.has(v) || sel.has(v)) : [...new Set([...counts.keys(), ...sel])];
      if (!f.fixed) vals.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || String(f.labelOf(a)).localeCompare(String(f.labelOf(b))));
      if (!vals.length) return '';
      const many = vals.length > 8 && !expanded.has(f.key);
      const shown = many ? vals.filter((v, i) => i < 8 || sel.has(v)) : vals;
      return shown.map(v => row(f.key, v, f.labelOf(v), counts.get(v) || 0, sel.has(v))).join('')
        + (vals.length > 8 ? `<button type="button" class="fg-more" data-more="${f.key}">${many ? `Show all ${vals.length}` : 'Show fewer'}</button>` : '');
    }
    const row = (k, v, label, n, on, cls = '') => `<label class="fv ${cls}${!n && !on ? ' zero' : ''}"><input type="checkbox" data-fk="${k}" value="${esc(v)}"${on ? ' checked' : ''}${!n && !on ? ' disabled' : ''}><span>${esc(label)}</span><i>${n}</i></label>`;
    function treeRows(f, st, base) {
      const sel = st.sel.cat || new Set();
      const cnt = path => base.filter(p => p.cat === path || p.cat.startsWith(path + '/')).length;
      const tops = ctx.catRoot ? H.children(ctx.catRoot) : U.TOPS;
      if (!tops.length) return '';
      const open = path => [...sel].some(s => s === path || s.startsWith(path + '/'));
      const draw = (n, depth) => {
        const c = cnt(n.path), on = sel.has(n.path);
        const kids = H.children(n.path);
        return row('cat', n.path, n.name, c, on, 'd' + depth) + (kids.length && open(n.path) ? kids.filter(k => cnt(k.path) || sel.has(k.path) || open(k.path)).map(k => draw(k, depth + 1)).join('') : '');
      };
      const rowsAll = tops.map(t => ({ t, c: cnt(t.path) }));
      const shown = expanded.has('cat') ? rowsAll : rowsAll.filter(x => x.c || open(x.t.path));
      return shown.map(x => draw(x.t, 0)).join('') + (rowsAll.length > shown.length || expanded.has('cat') ? `<button type="button" class="fg-more" data-more="cat">${expanded.has('cat') ? 'Hide empty groups' : `Show all ${rowsAll.length}, with empty ones`}</button>` : '');
    }
    function priceBox(f, st, base) {
      const priced = base.filter(it => { const p = f.price(it); return p && p.amount != null && p.currency; });
      const byCur = {};
      for (const it of priced) { const c = f.price(it).currency; byCur[c] = (byCur[c] || 0) + 1; }
      const curs = Object.keys(byCur).sort((a, b) => curRank(a) - curRank(b) || byCur[b] - byCur[a]);
      if (!curs.length && !st.price) return '';
      const cur = (st.price && st.price.cur) || st.cur || (curs.includes('GBP') ? 'GBP' : curs[0]);
      const amts = priced.filter(it => f.price(it).currency === cur).map(it => f.price(it).amount);
      const lo = amts.length ? Math.floor(Math.min(...amts)) : 0, hi = amts.length ? Math.ceil(Math.max(...amts)) : 0;
      const mn = st.price && st.price.min != null ? st.price.min : lo, mx = st.price && st.price.max != null ? st.price.max : hi;
      const sym = H.money(0, cur).replace(/0$/, '');
      return `${curs.length > 1 || (st.price && !curs.includes(cur)) ? `<div class="fcur" role="group" aria-label="Currency">${[...new Set([cur, ...curs])].map(c => `<button type="button" data-cur="${c}" aria-pressed="${c === cur}">${c} <i>${byCur[c] || 0}</i></button>`).join('')}</div>` : ''}
        ${amts.length > 1 && hi > lo ? `<div class="frange" data-lo="${lo}" data-hi="${hi}"><input type="range" min="${lo}" max="${hi}" step="1" value="${Math.max(lo, Math.min(mn, hi))}" data-pr="min" aria-label="Minimum price"><input type="range" min="${lo}" max="${hi}" step="1" value="${Math.min(hi, Math.max(mx, lo))}" data-pr="max" aria-label="Maximum price"></div>` : ''}
        <div class="fminmax"><label><span>Min ${esc(sym.trim())}</span><input type="number" inputmode="decimal" data-pn="min" data-cur-of="${cur}" value="${st.price && st.price.min != null ? st.price.min : ''}" placeholder="${lo}"></label><label><span>Max ${esc(sym.trim())}</span><input type="number" inputmode="decimal" data-pn="max" data-cur-of="${cur}" value="${st.price && st.price.max != null ? st.price.max : ''}" placeholder="${hi}"></label></div>
`;
    }
    function railHtml(ps) {
      const st = readState(ps, facets);
      const groups = [];
      const show = facets.filter(f => f.type === 'bool');
      for (const f of facets) {
        if (f.type === 'bool') continue;
        const base = pass(items, facets, st, ctx, f.key);
        if (f.key === 'model' && !(st.sel.make && st.sel.make.size) && new Set(items.flatMap(it => f.values(it))).size > 12 && !expanded.has('model-all')) {
          groups.push(group(f, `<p class="fg-none">Pick a make to list its models, or <button type="button" class="tlink" data-more="model-all">list all models</button>.</p>`, st));
          continue;
        }
        const body = f.type === 'price' ? priceBox(f, st, base) : valueRows(f, st, base);
        if (body) groups.push(group(f, body, st));
        if (f.key === 'cat' && show.length) {
          const rows = show.map(b => { const n = pass(items, facets, { ...st, bool: { ...st.bool, [b.key]: true } }, ctx, null).length; return n || st.bool[b.key] ? row(b.key, '1', b.label, n, !!st.bool[b.key]) : ''; }).join('');
          if (rows) groups.push(group({ key: 'show', label: 'Show only' }, rows, st, Object.keys(st.bool).length));
        }
      }
      const n = activeCount(st);
      return `<div class="fr-head"><h2>Filters${n ? ` <i>${n}</i>` : ''}</h2>${n ? '<button type="button" class="tlink" data-fclear>Clear all</button>' : ''}</div>${groups.join('')}`;
    }
    function group(f, body, st, nSel) {
      const n = nSel != null ? nSel : f.type === 'price' ? (st.price ? 1 : 0) : (st.sel[f.key] || new Set()).size;
      const open = !collapsed.has(f.key);
      return `<section class="fg" data-g="${f.key}"><button type="button" class="fg-h" data-gtoggle="${f.key}" aria-expanded="${open}"><span>${esc(f.label)}${n ? ` <i>${n}</i>` : ''}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="fg-b"${open ? '' : ' hidden'}>${body}</div></section>`;
    }
    function chips(st) {
      const out = [];
      for (const f of facets) {
        if (f.type === 'bool') { if (st.bool[f.key]) out.push([f.key, '1', f.label]); continue; }
        if (f.type === 'price') { if (st.price) out.push(['price', '', `${f.label}: ${st.price.min != null ? H.money(st.price.min, st.price.cur) : 'any'} to ${st.price.max != null ? H.money(st.price.max, st.price.cur) : 'any'}`]); continue; }
        for (const v of st.sel[f.key] || []) out.push([f.key, v, `${f.key === 'cat' ? '' : f.label + ': '}${f.type === 'tree' ? H.node(v).name : f.labelOf(v)}`]);
      }
      return out;
    }

    // ---- main column ----
    function mainHtml(ps) {
      const st = readState(ps, facets);
      const res = sortItems(pass(items, facets, st, ctx, null), kind, st.sort, (st.price && st.price.cur) || st.cur || 'GBP');
      const ch = chips(st);
      const sorts = SORTS[kind];
      const bar = `<div class="lst-bar">
          <p class="lst-count" aria-live="polite"><b>${res.length}</b> ${res.length === 1 ? noun[0] : noun[1]}${res.length !== items.length ? ` of ${items.length}` : ''}</p>
          <button type="button" class="btn btn-ghost btn-sm lst-fbtn" data-open-filters>${I.list} Filters${ch.length ? ` (${ch.length})` : ''}</button>
          <label class="lst-sort"><span>Sort</span><select data-sort aria-label="Sort" class="${st.sort ? 'on' : ''}">${sorts.map(([v, l]) => `<option value="${v}"${(st.sort || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="vt" role="group" aria-label="View"><button type="button" data-view="list" aria-pressed="${st.view === 'list'}" aria-label="List view"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><button type="button" data-view="grid" aria-pressed="${st.view === 'grid'}" aria-label="Grid view"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg></button></div>
        </div>
        ${ch.length ? `<div class="achips">${ch.map(([k, v, l]) => `<button type="button" class="achip" data-chip="${k}" data-v="${esc(v)}" aria-label="Remove filter ${esc(l)}">${esc(l)} ${I.close}</button>`).join('')}<button type="button" class="tlink" data-fclear>Clear all</button></div>` : ''}`;
      let body;
      if (!res.length) body = U.emptyState(`No ${noun[1]} match these filters`, `${items.length} ${items.length === 1 ? noun[0] : noun[1]} before filtering. Remove the last filter or clear them all.`, `<button type="button" class="btn btn-lime" data-remove-last>Remove last filter</button><button type="button" class="btn btn-ghost" data-fclear>Clear all filters</button>`);
      else if (kind === 'offers') {
        if (st.view === 'grid') body = `<div class="ogrid">${res.map(offerRow).join('')}</div>`;
        else body = `<div class="altgroups">${[{ key: 'oe', label: 'Genuine', note: 'The car maker\'s own part.' }, ...H.ALT_TYPES].map(t => { const g = res.filter(o => o.type === t.key); return g.length ? `<div class="altg${t.key === 'same-oe-other-car' ? ' core' : ''}"><div class="altg-h"><h3>${esc(t.label)}</h3><span>${g.length}</span></div>${g.map(offerRow).join('')}</div>` : ''; }).join('')}</div>`;
      } else if (st.view === 'grid') body = `<div class="pgrid">${res.map(p => partCard(p, opts.car)).join('')}</div>`;
      else if (opts.groupTop && !st.sort) {
        const by = {}; for (const p of res) (by[p.cat.split('/')[0]] = by[p.cat.split('/')[0]] || []).push(p);
        body = U.TOPS.filter(t => by[t.slug]).map(t => `<div class="group-h"><h3>${U.pad2(U.topIndex(t.slug))} ${esc(t.name)} <span class="small">${by[t.slug].length}</span></h3><a class="tlink" href="${H.href.cat(t.path, opts.car)}">Open category</a></div><div class="prows">${by[t.slug].map(p => U.partRow(p, { car: opts.car })).join('')}</div>`).join('');
      } else body = `<div class="prows">${res.map(p => U.partRow(p, { car: opts.car && H.fitRole(p, opts.car) ? opts.car : null })).join('')}</div>`;
      return bar + `<div class="lst-res">${body}</div>`;
    }

    // ---- render + events ----
    function refocus(host, fn) {
      const a = document.activeElement;
      const key = a && host.contains(a) ? (a.dataset.fk ? `[data-fk="${a.dataset.fk}"][value="${CSS.escape(a.value)}"]` : a.dataset.gtoggle ? `[data-gtoggle="${a.dataset.gtoggle}"]` : a.dataset.cur ? `[data-cur="${a.dataset.cur}"]` : a.dataset.view ? `[data-view="${a.dataset.view}"]` : a.matches('[data-sort]') ? '[data-sort]' : null) : null;
      fn();
      if (key) { const el = $(key, host); if (el) el.focus({ preventScroll: true }); }
    }
    function apply() {
      const ps = params();
      refocus(rail, () => { rail.innerHTML = railHtml(ps); });
      refocus(main, () => { main.innerHTML = mainHtml(ps); });
    }
    function railEvents(host, getPs, commit) {
      host.addEventListener('change', e => {
        const t = e.target;
        if (t.matches('[data-fk]')) { const ps = getPs(); toggle(ps, t.dataset.fk, t.value); commit(ps); }
        else if (t.matches('[data-pr]')) { const box = t.closest('.frange'); const [a, b] = $$('[data-pr]', box).map(x => +x.value); const cur = $('[data-pn]', host).dataset.curOf; const lo = +box.dataset.lo, hi = +box.dataset.hi; const ps = getPs(); setPrice(ps, cur, Math.min(a, b) > lo ? Math.min(a, b) : null, Math.max(a, b) < hi ? Math.max(a, b) : null); commit(ps); }
        else if (t.matches('[data-pn]')) { const [a, b] = $$('[data-pn]', host).map(x => x.value === '' ? null : Math.max(0, +x.value)); const ps = getPs(); setPrice(ps, t.dataset.curOf, a, b); commit(ps); }
      });
      host.addEventListener('input', e => {
        const t = e.target; if (!t.matches('[data-pr]')) return;
        const ins = $$('[data-pr]', t.closest('.frange')); const [a, b] = ins.map(x => +x.value);
        const nums = $$('[data-pn]', host); nums[0].value = Math.min(a, b); nums[1].value = Math.max(a, b);
      });
      host.addEventListener('click', e => {
        const g = e.target.closest('[data-gtoggle]');
        if (g) { const k = g.dataset.gtoggle; collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k); commit(getPs(), true); return; }
        const m = e.target.closest('[data-more]');
        if (m) { const k = m.dataset.more; expanded.has(k) ? expanded.delete(k) : expanded.add(k); commit(getPs(), true); return; }
        const c = e.target.closest('[data-cur]');
        if (c) { const ps = getPs(); setPrice(ps, c.dataset.cur); ps.set('f_cur', c.dataset.cur); commit(ps); return; }
        if (e.target.closest('[data-fclear]')) { const ps = getPs(); clearAll(ps); commit(ps); }
      });
    }
    // desktop rail: every change goes to the URL (back button works); a view-only change re-renders in place
    railEvents(rail, params, (ps, local) => { if (local) apply(); else write(ps); });
    main.addEventListener('change', e => { if (e.target.matches('[data-sort]')) { const ps = params(); ps.delete('f_sort'); if (e.target.value) ps.set('f_sort', e.target.value); write(ps); } });
    main.addEventListener('click', e => {
      const t = e.target;
      const chip = t.closest('[data-chip]');
      if (chip) { const ps = params(); const k = chip.dataset.chip; if (k === 'price') setPrice(ps, null); else toggle(ps, k, chip.dataset.v); write(ps); return; }
      if (t.closest('[data-fclear]')) { const ps = params(); clearAll(ps); write(ps); return; }
      if (t.closest('[data-remove-last]')) { const ps = params(); removeLast(ps); write(ps); return; }
      const v = t.closest('[data-view]'); if (v) { const ps = params(); ps.delete('f_view'); if (v.dataset.view === 'grid') ps.set('f_view', 'grid'); write(ps); return; }
      if (t.closest('[data-open-filters]')) openSheet();
    });
    // mobile: the same rail in a bottom sheet, edits stay pending until "Show N parts"
    function openSheet() {
      let pending = params();
      const draw = body => {
        const st = readState(pending, facets);
        const n = pass(items, facets, st, ctx, null).length;
        refocus(body, () => {
          $('[data-sheet-rail]', body).innerHTML = railHtml(pending);
          $('[data-sheet-show]', body).textContent = `Show ${n} ${n === 1 ? noun[0] : noun[1]}`;
        });
      };
      U.openSheet('Filters', `<div class="fr-sheet" data-sheet-rail></div><div class="sheet-foot"><button type="button" class="btn btn-ghost" data-sheet-clear>Clear all</button><button type="button" class="btn btn-lime" data-sheet-show></button></div>`, body => {
        draw(body);
        railEvents($('[data-sheet-rail]', body), () => pending, ps => { pending = ps; draw(body); });
        body.addEventListener('click', e => {
          if (e.target.closest('[data-sheet-clear]')) { clearAll(pending); draw(body); }
          if (e.target.closest('[data-sheet-show]')) { const ps = pending; U.closeSheet(); write(ps); }
        });
        return null;
      });
    }
    apply();
    current = { apply, kind };
    return current;
  }

  window.Listing = { mount, brandOf, brandLabel, pf, get current() { return current; }, reset() { current = null; } };
})();
