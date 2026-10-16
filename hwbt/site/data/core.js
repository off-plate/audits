// HWBT Research Box v2: logic core. Pure functions over taxonomy.js, vehicles.js and parts.js.
// No DOM here (location.hash and localStorage are read only inside route() and the storage helpers).
// Load order: taxonomy.js, vehicles.js, parts.js, core.js. Exposes window.HWBT2.
(function (root) {
  const T = root.HWBT2_TAX, V = root.HWBT2_VEH, D = root.HWBT2_PARTS;
  const PARTS = D.parts;

  // ---------- text helpers ----------
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const normPN = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function highlight(text, query) {
    let html = esc(text);
    const words = norm(query).trim().split(/\s+/).filter(w => w.length > 1);
    for (const w of words) html = html.replace(new RegExp('(' + reEsc(esc(w)) + ')', 'ig'), '<mark>$1</mark>');
    return html;
  }

  // ---------- storage (always try/catch; falls back to memory) ----------
  const mem = {};
  const load = (k, d) => { try { const v = JSON.parse(root.localStorage.getItem(k)); return v == null ? (k in mem ? mem[k] : d) : v; } catch (e) { return k in mem ? mem[k] : d; } };
  const save = (k, v) => { mem[k] = v; try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

  // ---------- vehicles ----------
  const MAKES = V.makes;
  const makeBy = Object.fromEntries(MAKES.map(m => [m.s, m]));
  const FAM = V.families;
  const modelName = (mk, mo) => { const m = makeBy[mk]; const r = m && m.m.find(x => x[0] === mo); return r ? r[1] : null; };

  // Resolves vPIC duplicates (ferrari/458-italia -> ferrari/458, variant italia).
  function resolveModel(make, model) {
    const a = V.aliases[make + '/' + model];
    if (a) { const [k, variant] = a; const [mk, mo] = k.split('/'); return { make: mk, model: mo, variant }; }
    return { make, model, variant: null };
  }
  const family = (make, model) => { if (!make || !model) return null; const r = resolveModel(make, model); return FAM[r.make + '/' + r.model] || null; };
  const familyCount = {};

  function makes(opts = {}) {
    return MAKES.filter(m => opts.all || !m.d).map(m => ({ slug: m.s, name: m.n, example: !!m.x, models: m.m.length, catalog: m.src === 'catalog' }));
  }
  const make = slug => { const m = makeBy[slug]; return m ? { slug: m.s, name: m.n, example: !!m.x, donorOnly: !!m.d, models: models(slug) } : null; };
  function models(mk) {
    const m = makeBy[mk];
    if (!m) return [];
    return m.m.map(([slug, name, src]) => {
      const f = FAM[mk + '/' + slug];
      return { slug, name, example: !!f, has3d: !!(f && f.model3d), chassis: f ? f.chassis : null, catalog: src === 'catalog', alias: !!V.aliases[mk + '/' + slug] };
    });
  }
  const variants = (mk, mo) => { const f = family(mk, mo); return f ? f.variants : []; };
  const variantOf = (mk, mo, v) => variants(mk, mo).find(x => x.slug === v) || null;

  // Vehicle selection flow: Make > Model family > Variant > Years > Engine > Gearbox.
  // Any step with exactly one option is auto-filled; a step with none is skipped.
  const STEP_LABEL = { make: 'Make', model: 'Model', variant: 'Variant', years: 'Years', engine: 'Engine', gearbox: 'Gearbox' };
  function flow(sel = {}) {
    const out = { steps: [], next: null, complete: false, sel: {} };
    const push = (key, options, chosen) => {
      if (!options.length) return true;
      let value = chosen != null && options.some(o => o.value === chosen) ? chosen : null;
      const auto = options.length === 1;
      if (auto) value = options[0].value;
      out.steps.push({ key, label: STEP_LABEL[key], options, value, auto });
      if (value == null) { out.next = key; return false; }
      out.sel[key] = value;
      return true;
    };
    if (!push('make', makes().map(m => ({ value: m.slug, label: m.name })), sel.make)) return out;
    if (!push('model', models(out.sel.make).filter(m => !m.alias).map(m => ({ value: m.slug, label: m.name, chassis: m.chassis })), sel.model)) return out;
    const r = resolveModel(out.sel.make, out.sel.model);
    const f = family(out.sel.make, out.sel.model);
    if (f) {
      if (!push('variant', f.variants.map(v => ({ value: v.slug, label: v.name, chassis: v.chassis })), sel.variant || r.variant)) return out;
      const v = f.variants.find(x => x.slug === out.sel.variant);
      if (!push('years', v.years.map(y => ({ value: y, label: y })), sel.years)) return out;
      if (!push('engine', v.engines.map(e => ({ value: e, label: e })), sel.engine)) return out;
      if (!push('gearbox', v.gearboxes.map(g => ({ value: g, label: g })), sel.gearbox)) return out;
    }
    out.complete = true;
    out.id = vehicleId(out.sel);
    return out;
  }

  // A vehicle id is "make/model" or "make/model/variant" (what routes and ?car= carry).
  function vehicleId(sel) {
    if (!sel) return null;
    if (typeof sel === 'string') return sel;
    if (!sel.make || !sel.model) return null;
    const r = resolveModel(sel.make, sel.model);
    const variant = sel.variant || r.variant;
    return [r.make, r.model, variant].filter(Boolean).join('/');
  }
  function vehicle(idOrSel) {
    const id = vehicleId(idOrSel);
    if (!id) return null;
    const [mk0, mo0, v0] = id.split('/');
    if (!makeBy[mk0]) return null;
    const r = resolveModel(mk0, mo0 || '');
    const mk = r.make, mo = r.model, vs = v0 || r.variant || null;
    const mName = mo ? modelName(mk, mo) || modelName(mk0, mo0) : null;
    if (mo && !mName) return null;
    const f = mo ? FAM[mk + '/' + mo] : null;
    const v = f && vs ? f.variants.find(x => x.slug === vs) : null;
    const extra = typeof idOrSel === 'object' ? idOrSel : {};
    const out = {
      id: [mk, mo, v && v.slug].filter(Boolean).join('/'), key: mo ? mk + '/' + mo : null, make: mk, model: mo || null, variant: v ? v.slug : null,
      makeName: makeBy[mk].n, modelName: f ? f.name : mName, variantName: v ? v.name : null,
      chassis: (v && v.chassis) || (f && f.chassis) || null, example: !!f, family: f || null,
      years: extra.years || (v && v.years.length === 1 ? v.years[0] : f ? f.years : null),
      engine: extra.engine || (v && v.engines.length === 1 ? v.engines[0] : null),
      gearbox: extra.gearbox || (v && v.gearboxes.length === 1 ? v.gearboxes[0] : null),
      image: f ? f.image : null, credit: f ? f.credit : null, model3d: f && f.model3d ? model3d(f.model3d) : null,
    };
    out.label = [out.makeName, out.modelName, out.variantName && out.variantName !== out.modelName ? out.variantName : null].filter(Boolean).join(' ');
    out.short = [out.modelName, out.variantName && out.variantName !== out.modelName ? out.variantName : null].filter(Boolean).join(' ') || out.makeName;
    return out;
  }
  const vehicleLabel = id => { const v = vehicle(id); return v ? v.label : ''; };
  const chassis = id => { const v = vehicle(id); return v ? v.chassis : null; };
  const model3d = slug => (V.models3d[slug] ? { slug, ...V.models3d[slug] } : null);
  // The 3D car for a vehicle: only the model's own family (never a GranTurismo mesh for an MC20).
  const model3dFor = id => { const v = vehicle(id); return v ? v.model3d : null; };
  const examples = () => Object.values(FAM).map(f => ({ ...f, count: partsForCar(f.key).length }));
  const showcase = () => V.showcase.map(k => vehicle(k));
  const donor = slug => V.donors[slug] || null;

  // Garage: current car + up to 3 saved cars, in localStorage.
  const GKEY = 'hwbt2-garage', CKEY = 'hwbt2-car';
  const gListeners = new Set();
  const gNotify = () => gListeners.forEach(fn => { try { fn(garage.current(), garage.list()); } catch (e) {} });
  const cleanSel = s => { const id = vehicleId(s); if (!id || !vehicle(id)) return null; const v = vehicle(id); return { id: v.id, make: v.make, model: v.model, variant: v.variant, years: s.years || null, engine: s.engine || null, gearbox: s.gearbox || null }; };
  const garage = {
    MAX: 3,
    list: () => (load(GKEY, []) || []).filter(s => s && vehicle(s.id)),
    current: () => { const s = load(CKEY, null); return s && vehicle(s.id) ? s : null; },
    setCurrent(sel) { const s = cleanSel(typeof sel === 'string' ? { ...vehicle(sel) } : sel); if (!s) return null; save(CKEY, s); garage.add(s, true); gNotify(); return s; },
    add(sel, quiet) {
      const s = cleanSel(typeof sel === 'string' ? { ...vehicle(sel) } : sel); if (!s) return garage.list();
      const l = [s, ...garage.list().filter(x => x.id !== s.id)].slice(0, garage.MAX);
      save(GKEY, l); if (!quiet) gNotify(); return l;
    },
    remove(id) { save(GKEY, garage.list().filter(x => x.id !== id)); const c = garage.current(); if (c && c.id === id) save(CKEY, null); gNotify(); },
    clearCurrent() { save(CKEY, null); gNotify(); },
    clear() { save(GKEY, []); save(CKEY, null); gNotify(); },
    onChange: fn => gListeners.add(fn),
  };

  // ---------- taxonomy ----------
  const NODES = {};
  for (const t of T.categories) {
    NODES[t.slug] = { path: t.slug, slug: t.slug, name: t.name, level: 1, parent: null, top: t.slug, desc: t.desc, source: t.source, children: t.children.map(s => t.slug + '/' + s.slug) };
    for (const s of t.children) {
      const sp = t.slug + '/' + s.slug;
      NODES[sp] = { path: sp, slug: s.slug, name: s.name, level: 2, parent: t.slug, top: t.slug, children: s.children.map(x => sp + '/' + x.slug) };
      for (const x of s.children) NODES[sp + '/' + x.slug] = { path: sp + '/' + x.slug, slug: x.slug, name: x.name, level: 3, parent: sp, top: t.slug, children: [] };
    }
  }
  const SERVICE = { path: 'service', slug: 'service', name: T.service.name, level: 1, parent: null, top: 'service', desc: T.service.desc, source: T.service.source, children: [], virtual: true };
  const node = path => (path === 'service' ? SERVICE : NODES[String(path || '').replace(/^\/+|\/+$/g, '')] || null);
  const tree = () => T.categories.map(t => node(t.slug));
  const children = path => (path ? (node(path) || { children: [] }).children.map(node) : tree());
  const ancestors = path => { const out = []; let n = node(path); while (n) { out.unshift(n); n = n.parent ? node(n.parent) : null; } return out; };
  const inPath = (p, path) => path === 'service' ? p.service : p.cat === path || p.cat.startsWith(path + '/');

  // ---------- parts ----------
  const partBy = Object.fromEntries(PARTS.map(p => [p.id, p]));
  const ALT_TYPES = [
    { key: 'same-oe-other-car', label: 'Same part, other cars', note: 'The identical OE part, fitted to other models.' },
    { key: 'oe-equivalent', label: 'OE-equivalent brands', note: "The supplier's own box: the maker that builds it for the car brand." },
    { key: 'aftermarket', label: 'Aftermarket', note: 'Other brands built to the same number.' },
    { key: 'upgrade', label: 'Upgraded', note: 'Uprated or performance versions that replace it.' },
  ];
  const EVIDENCE = {
    workshop: { label: 'Seen in the workshop', note: 'Shown by Mat in a video, with the timestamp.' },
    documented: { label: 'Documented', note: 'Backed by two or more sources, linked below.' },
    reported: { label: 'Reported', note: 'One source, a search snippet, a seller claim or a forum post. Check before buying.' },
  };
  const EV_ORDER = { workshop: 0, documented: 1, reported: 2 };

  // How a part relates to a car: 'oe' (recorded on that car) or 'shared' (same OE part on that car).
  function fitRole(p, car) {
    const v = vehicle(car);
    if (!v || !v.key) return null;
    if (p.veh.includes(v.key)) return 'oe';
    if (p.alts.some(a => a.type === 'same-oe-other-car' && a.veh.includes(v.key))) return 'shared';
    return null;
  }
  const sortParts = list => list.slice().sort((a, b) => EV_ORDER[a.evidence] - EV_ORDER[b.evidence] || a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  function partsForCar(car) {
    const v = vehicle(car);
    if (!v || !v.key) return [];
    if (!(v.key in familyCount)) familyCount[v.key] = PARTS.filter(p => fitRole(p, v.key));
    return familyCount[v.key];
  }
  // opts: {cat, car, zone, service, evidence}
  function parts(opts = {}) {
    let list = opts.car ? partsForCar(opts.car) : PARTS;
    if (opts.cat) list = list.filter(p => inPath(p, opts.cat));
    if (opts.zone) list = list.filter(p => p.zone === opts.zone);
    if (opts.service) list = list.filter(p => p.service);
    if (opts.evidence) list = list.filter(p => p.evidence === opts.evidence);
    return sortParts(list);
  }
  const partsIn = (path, car) => (node(path) ? parts({ cat: path, car }) : []);
  const serviceParts = car => parts({ service: true, car });

  // Counts for every node (incl. 'service'), for one car or for all cars. Zero nodes included.
  const countCache = {};
  function counts(car) {
    const v = car ? vehicle(car) : null;
    const k = v ? v.key : '*';
    if (countCache[k]) return countCache[k];
    const c = Object.fromEntries(Object.keys(NODES).map(p => [p, 0]));
    c.service = 0;
    for (const p of v ? partsForCar(v.key) : PARTS) {
      const segs = p.cat.split('/');
      for (let i = 1; i <= segs.length; i++) c[segs.slice(0, i).join('/')]++;
      if (p.service) c.service++;
    }
    return (countCache[k] = c);
  }
  const count = (path, car) => counts(car)[path] || 0;

  // Four alternative groups, always in the same order, each item with its saving (same currency only).
  function altGroups(p) {
    return ALT_TYPES.map(t => ({ ...t, items: p.alts.filter(a => a.type === t.key).map(a => ({ ...a, saving: saving(p.price, a.price) }))
      .sort((x, y) => (x.price ? 0 : 1) - (y.price ? 0 : 1) || (x.price && y.price && x.price.currency === y.price.currency ? x.price.amount - y.price.amount : 0)) }));
  }
  const bestSaving = p => p.alts.map(a => saving(p.price, a.price)).filter(Boolean).sort((a, b) => b.amount - a.amount)[0] || null;
  const chain = p => (p.oe ? [...p.supersedes.map(s => s.number), p.oe.number] : []);

  // Fitment table rows: the car it is recorded on, then every car with the same OE part.
  function carsForPart(p) {
    const rows = p.veh.map(k => { const v = vehicle(k + (p.variant ? '/' + p.variant : '')); return { key: k, name: v.label, years: v.years, chassis: v.chassis, role: 'oe', position: p.position.join(' ') || null }; });
    for (const a of p.alts) {
      if (a.type !== 'same-oe-other-car') continue;
      rows.push({ key: a.veh[0] || null, keys: a.veh, name: a.by, years: null, chassis: null, role: 'shared', donor: a.donor, number: a.pn, image: a.donor && V.donors[a.donor] ? V.donors[a.donor].image : null });
    }
    return rows;
  }

  // ---------- 3D zones ----------
  const ZONES = T.zones;
  const zone = key => ZONES.find(z => z.key === key) || null;
  function zoneCounts(car) {
    const c = Object.fromEntries(ZONES.map(z => [z.key, 0]));
    for (const p of car ? partsForCar(car) : PARTS) c[p.zone]++;
    return c;
  }
  // Parts in a zone, numbered: n = pin number = list number.
  const pins = (key, car) => parts({ zone: key, car }).map((p, i) => ({ n: i + 1, part: p }));
  // Side list for a zone: the categories ia-research 2.6 assigns, plus any category holding parts in it.
  function zoneCats(key, car) {
    const z = zone(key); if (!z) return [];
    const tops = [...z.cats];
    for (const p of parts({ zone: key, car })) { const t = p.cat.split('/')[0]; if (!tops.includes(t)) tops.push(t); }
    return tops.map(t => ({ ...node(t), note: z.notes[t] || null, count: parts({ zone: key, car, cat: t }).length }));
  }

  // ---------- numbers ----------
  let PN = null;
  function pnIndex() {
    if (PN) return PN;
    PN = new Map();
    const add = (n, form, entry) => {
      if (!n || n.length < 3) return;
      if (!PN.has(n)) PN.set(n, { forms: new Set(), entries: [] });
      const e = PN.get(n);
      if (form) e.forms.add(form);
      if (!e.entries.some(x => x.part === entry.part && x.alt === entry.alt && x.role === entry.role)) e.entries.push(entry);
    };
    for (const p of PARTS) {
      if (p.oe) for (const f of p.oe.forms) add(p.oe.norm, f, { part: p, role: 'oe' });
      for (const s of p.supersedes) add(s.norm, s.number, { part: p, role: 'superseded' });
      for (const a of p.alts) for (const n of a.pns) add(n, writtenFor(a.pn, n), { part: p, alt: a, role: a.type });
    }
    return PN;
  }
  // The piece of a multi-number field that normalises to n ("1211F0107CP / 11F0107CP" -> "11F0107CP").
  function writtenFor(raw, n) {
    const bits = String(raw).replace(/[()]/g, ' / ').split(/\s+\/\s+/).map(s => s.trim().replace(/^NGK\s+/, ''));
    return bits.find(b => normPN(b) === n) || raw;
  }
  // Looks like a part number rather than words: 3+ digits, 5+ characters once normalised.
  const isPN = q => {
    const toks = String(q ?? '').trim().split(/\s+/).filter(Boolean), n = normPN(q);
    return n.length >= 5 && (n.match(/\d/g) || []).length >= 2 && toks.every(t => /\d/.test(t) || t.length <= 3);
  };

  function pn(number) {
    const n = normPN(number);
    const e = pnIndex().get(n);
    if (!e) return null;
    const related = [];
    for (const x of e.entries) if (!related.some(r => r.part === x.part)) related.push({ part: x.part, role: x.role });
    const alts = e.entries.filter(x => x.alt).map(x => ({ part: x.part, alt: x.alt }));
    // Cars: the car each related part is recorded on, plus donor cars whose alternative carries this number.
    const cars = [];
    const addCar = (key, name, role, partId, image) => {
      if (!key || cars.some(c => c.key === key)) return;
      const [mk, mo] = key.split('/');
      cars.push({ key, make: mk, makeName: makeBy[mk] ? makeBy[mk].n : mk, model: mo, modelName: modelName(mk, mo), name, role, partId, image: image || null });
    };
    for (const x of e.entries) for (const k of x.part.veh) addCar(k, vehicle(k).label, 'example', x.part.id, FAM[k] ? FAM[k].image : null);
    for (const x of e.entries) {
      if (x.alt && x.alt.type === 'same-oe-other-car') {
        const d = x.alt.donor && V.donors[x.alt.donor];
        for (const k of x.alt.veh) addCar(k, d ? d.name : x.alt.by, 'donor', x.part.id, d ? d.image : null);
      }
    }
    // A part's OE number: its same-number cars are the alternatives carrying that number.
    const byMake = [];
    for (const c of cars) { let g = byMake.find(m => m.make === c.make); if (!g) byMake.push(g = { make: c.make, makeName: c.makeName, cars: [] }); if (!g.cars.some(x => x.name === c.name)) g.cars.push(c); }
    byMake.sort((a, b) => a.makeName.localeCompare(b.makeName));
    // Cheaper sources: every priced offer for this part (the OE price and each alternative), cheapest first per currency.
    const offers = [];
    for (const r of related) {
      const p = r.part;
      if (p.price) offers.push({ type: 'oe', label: p.oe ? 'Genuine ' + p.oe.number : p.name, price: p.price, part: p, url: p.price.url });
      for (const a of p.alts) if (a.price) offers.push({ type: a.type, label: a.name, by: a.by, number: a.pn, price: a.price, part: p, alt: a, url: a.price.url || a.url });
    }
    const CUR = ['GBP', 'EUR', 'USD'];
    const curRank = c => (CUR.indexOf(c) < 0 ? 9 : CUR.indexOf(c));
    offers.sort((a, b) => curRank(a.price.currency) - curRank(b.price.currency) || String(a.price.currency).localeCompare(String(b.price.currency)) || a.price.amount - b.price.amount);
    const sources = ALT_TYPES.map(t => ({ ...t, items: offers.filter(o => o.type === t.key) }));
    const range = {};
    for (const o of offers) { const c = o.price.currency; if (!c) continue; range[c] = range[c] || { currency: c, min: o.price.amount, max: o.price.amount }; range[c].min = Math.min(range[c].min, o.price.amount); range[c].max = Math.max(range[c].max, o.price.amount); }
    // Supersession: the chain of the part that owns this number (old > current).
    const owner = (e.entries.find(x => x.role === 'oe' || x.role === 'superseded') || {}).part;
    const equivalents = [];
    for (const r of related) {
      if (r.part.oe && r.part.oe.norm !== n) equivalents.push({ number: r.part.oe.number, norm: r.part.oe.norm, by: 'OE', name: r.part.name });
      for (const a of r.part.alts) if (a.type !== 'same-oe-other-car') for (const m of a.pns) if (m !== n && !equivalents.some(q => q.norm === m)) equivalents.push({ number: writtenFor(a.pn, m), norm: m, by: a.by, name: a.name, type: a.type });
    }
    const first = e.entries[0];
    return {
      norm: n, number: [...e.forms][0] || n, forms: [...new Set([...e.forms, ...(owner && owner.oe && owner.oe.norm === n ? owner.oe.forms : [])])],
      name: first.alt && first.role !== 'same-oe-other-car' ? first.alt.name : first.part.name,
      roles: [...new Set(e.entries.map(x => x.role))],
      parts: related, alts, cars: byMake, makers: byMake.map(m => m.makeName),
      sources, cheapest: offers, priceRange: Object.values(range), chain: owner && owner.oe ? chain(owner) : [],
      superseded: e.entries.some(x => x.role === 'superseded'), current: owner && owner.oe ? owner.oe.number : null, equivalents,
    };
  }

  // ---------- search ----------
  const partIdx = PARTS.map(p => ({
    p,
    name: norm(p.name),
    text: norm([p.name, p.hint, (node(p.cat) || {}).name, ...ancestors(p.cat).map(x => x.name), ...p.veh.map(k => vehicle(k).label),
      ...p.alts.map(a => a.name + ' ' + a.by), p.location, p.fitment].join(' ')),
  }));
  const carIdx = [];
  for (const m of MAKES) {
    if (m.d) continue;
    carIdx.push({ kind: 'make', make: m.s, label: m.n, text: norm(m.n), example: !!m.x });
    for (const [slug, name] of m.m) {
      if (V.aliases[m.s + '/' + slug]) continue;
      const f = FAM[m.s + '/' + slug];
      carIdx.push({ kind: 'model', make: m.s, model: slug, label: m.n + ' ' + name, chassis: f ? f.chassis : null, text: norm(m.n + ' ' + name + ' ' + (f ? [f.chassis, ...f.variants.map(v => v.name + ' ' + (v.chassis || ''))].join(' ') : '')), example: !!f });
    }
  }
  const catIdx = Object.values(NODES).concat([SERVICE]).map(n => ({ n, text: norm(n.name + ' ' + (n.parent ? node(n.parent).name : '')) }));

  function search(query, opts = {}) {
    const limit = opts.limit || 6;
    const q = norm(query).trim();
    const out = { parts: [], numbers: [], cars: [], categories: [] };
    if (!q) return out;
    const words = q.split(/\s+/).filter(Boolean);
    const qpn = normPN(query);
    if (qpn.length >= 3 && /\d/.test(qpn)) {
      const hits = [];
      for (const [n, e] of pnIndex()) {
        const i = n.indexOf(qpn);
        if (i >= 0) hits.push({ norm: n, number: [...e.forms][0] || n, name: e.entries[0].alt && e.entries[0].role !== 'same-oe-other-car' ? e.entries[0].alt.name : e.entries[0].part.name, exact: n === qpn, starts: i === 0, count: e.entries.length });
      }
      hits.sort((a, b) => b.exact - a.exact || b.starts - a.starts || a.norm.length - b.norm.length);
      out.numbers = hits;
    }
    const scored = [];
    for (const e of partIdx) {
      let s = 0;
      for (const w of words) { if (!e.text.includes(w)) { s = 0; break; } s += e.name.includes(w) ? 3 : 1; }
      // A whole-word name match ('coil') ranks above a part of a word ('coilover').
      if (s && e.name.includes(q)) s += new RegExp('(^|[^a-z0-9])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)').test(e.name) ? 7 : 2;
      if (s && opts.car && fitRole(e.p, opts.car)) s += 4;
      if (!s && qpn.length >= 3 && out.numbers.some(h => pnIndex().get(h.norm).entries.some(x => x.part === e.p))) s = 1;
      if (s) scored.push({ p: e.p, s });
    }
    out.parts = scored.sort((a, b) => b.s - a.s).map(x => x.p);
    out.cars = carIdx.filter(c => words.every(w => c.text.includes(w)))
      .sort((a, b) => (a.kind === 'make' ? 0 : 1) - (b.kind === 'make' ? 0 : 1) || b.example - a.example || a.label.localeCompare(b.label))
      .map(c => ({ ...c, id: c.model ? c.make + '/' + c.model : c.make, href: c.model ? href.car(c.make + '/' + c.model) : href.make(c.make) }));
    out.categories = catIdx.filter(c => words.every(w => c.text.includes(w))).map(c => ({ path: c.n.path, name: c.n.name, parentName: c.n.parent ? node(c.n.parent).name : null, count: count(c.n.path, opts.car) }));
    out.total = { parts: out.parts.length, numbers: out.numbers.length, cars: out.cars.length, categories: out.categories.length };
    if (limit !== Infinity) for (const k of ['parts', 'numbers', 'cars', 'categories']) out[k] = out[k].slice(0, limit);
    return out;
  }

  // ---------- money, savings, shops, video ----------
  // Saving only when both prices exist in the same currency and the alternative is cheaper. Never converts.
  function saving(a, b) {
    if (!a || !b || a.amount == null || b.amount == null || !a.currency || a.currency !== b.currency) return null;
    const amount = Math.round((a.amount - b.amount) * 100) / 100;
    if (amount <= 0) return null;
    return { amount, pct: Math.round((amount / a.amount) * 100), currency: a.currency };
  }
  const SYMBOL = { GBP: '£', EUR: '€', USD: '$', AUD: 'A$', NZD: 'NZ$', CAD: 'C$' };
  function money(amount, currency) {
    if (amount && typeof amount === 'object') { currency = amount.currency; amount = amount.amount; }
    if (amount == null) return '';
    const n = Number(amount).toLocaleString('en-GB', { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 });
    if (!currency) return n + ' (currency not stated)';
    return SYMBOL[currency] ? SYMBOL[currency] + n : currency + ' ' + n;
  }
  const amazonSearch = q => 'https://www.amazon.co.uk/s?k=' + encodeURIComponent(q);
  const ebaySearch = q => 'https://www.ebay.co.uk/sch/i.html?_nkw=' + encodeURIComponent(q);
  const AMAZON_DISCLOSURE = 'As an Amazon Associate, HWBT earns from qualifying purchases.';
  // Recorded links first (real listings or curated searches), then Amazon UK / eBay UK searches. Never invents a product.
  function shopLinks(p, alt) {
    const q = alt
      ? (alt.pns.length ? `${alt.type === 'same-oe-other-car' ? '' : alt.by + ' '}${writtenFor(alt.pn, alt.pns[0])}` : `${alt.by} ${alt.name}`).trim()
      : p.oe ? `${p.oe.number} ${p.name.replace(/\s*\(.*?\)/g, '')}` : `${vehicle(p.veh[0]).label} ${p.name.replace(/\s*\(.*?\)/g, '')}`;
    const own = alt ? [] : (p.shop || []).filter(s => s.url);
    const out = own.map(s => ({ store: s.store, kind: s.kind === 'search' ? 'search' : 'listing', title: s.title, url: s.url }));
    if (!out.some(s => /amazon/i.test(s.store))) out.push({ store: 'Amazon UK', kind: 'search', title: `Search Amazon UK for ${q}`, url: amazonSearch(q) });
    if (!out.some(s => /ebay/i.test(s.store))) out.push({ store: 'eBay UK', kind: 'search', title: `Search eBay UK for ${q}`, url: ebaySearch(q) });
    return out;
  }
  function videoUrl(v, t) {
    const vid = v && v.video ? v.video : v;
    if (!vid || !vid.url) return null;
    const s = t != null ? t : vid.timestamp_s;
    const u = vid.url.replace(/([?&])t=\d+s?&?/, '$1').replace(/[?&]$/, '');
    return s != null ? u + (u.includes('?') ? '&' : '?') + 't=' + Math.round(s) + 's' : u;
  }
  const stamp = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  // ---------- research box + submissions ----------
  const BKEY = 'hwbt2-box', SKEY = 'hwbt2-submissions';
  const bListeners = new Set();
  const readBox = () => { const v = load(BKEY, []); return Array.isArray(v) ? v.filter(id => partBy[id]) : []; };
  const box = {
    ids: readBox,
    parts: () => readBox().map(id => partBy[id]),
    has: id => readBox().includes(id),
    toggle(id) { if (!partBy[id]) return false; const ids = readBox(); const i = ids.indexOf(id); i < 0 ? ids.push(id) : ids.splice(i, 1); save(BKEY, ids); bListeners.forEach(fn => { try { fn(ids); } catch (e) {} }); return i < 0; },
    clear() { save(BKEY, []); bListeners.forEach(fn => { try { fn([]); } catch (e) {} }); },
    onChange: fn => bListeners.add(fn),
    // Per currency: genuine total vs cheapest same-currency alternative, over saved parts where both exist.
    totals() {
      const by = {};
      const ps = box.parts();
      for (const p of ps) {
        const s = bestSaving(p); if (!s) continue;
        const t = by[s.currency] || (by[s.currency] = { currency: s.currency, oe: 0, alt: 0, saving: 0, counted: 0 });
        t.oe += p.price.amount; t.alt += p.price.amount - s.amount; t.saving += s.amount; t.counted++;
      }
      return { count: ps.length, byCurrency: Object.values(by) };
    },
  };
  const submissions = {
    list: () => { const v = load(SKEY, []); return Array.isArray(v) ? v : []; },
    add(entry) { const l = [{ ...entry, at: new Date().toISOString() }, ...submissions.list()]; save(SKEY, l); return l; },
    clear() { save(SKEY, []); },
  };

  // ---------- router ----------
  // Routes: #/  #/car/<make>/<model>/<variant?>  #/c/<cat>/<sub?>/<third?>?car=<id>  #/part/<id>  #/pn/<number>
  //         #/makes  #/make/<make>  #/search?q=  #/box  #/submit
  const ROUTES = ['car', 'c', 'part', 'pn', 'makes', 'make', 'search', 'box', 'submit'];
  function route(hash) {
    const h = String(hash != null ? hash : (root.location ? root.location.hash : '')).replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const segs = path.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const name = segs.length ? (ROUTES.includes(segs[0]) ? segs[0] : 'notfound') : 'home';
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    const r = { name, args: segs.slice(1), params, car: params.car || null };
    if (name === 'car') { r.car = segs.slice(1, 4).join('/'); r.vehicle = vehicle(r.car); }
    if (name === 'c') { r.cat = segs.slice(1, 4).join('/'); r.node = node(r.cat); r.vehicle = r.car ? vehicle(r.car) : null; }
    if (name === 'part') { r.id = segs[1]; r.part = partBy[r.id] || null; r.vehicle = r.car ? vehicle(r.car) : null; }
    if (name === 'pn') r.number = normPN(segs.slice(1).join(''));
    if (name === 'make') r.make = segs[1];
    if (name === 'search') r.q = params.q || '';
    return r;
  }
  const carQ = car => { const id = vehicleId(car); return id ? 'car=' + encodeURIComponent(id).replace(/%2F/g, '/') : ''; };
  const withQ = (base, q) => base + (q ? '?' + q : '');
  const href = {
    home: () => '#/',
    car: id => '#/car/' + vehicleId(id),
    cat: (path, car) => withQ('#/c/' + path, carQ(car)),
    part: (id, car) => withQ('#/part/' + id, carQ(car)),
    pn: number => '#/pn/' + normPN(number),
    makes: () => '#/makes',
    make: slug => '#/make/' + slug,
    search: (q, car) => withQ('#/search', ['q=' + encodeURIComponent(q || ''), carQ(car)].filter(Boolean).join('&')),
    box: () => '#/box',
    submit: (params) => withQ('#/submit', params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString() : ''),
  };

  // Breadcrumb = "Parts" > vehicle path > category path.
  function breadcrumb(path, car) {
    const out = [{ label: 'Parts', href: href.home(), kind: 'root' }];
    const v = car ? vehicle(car) : null;
    if (v) {
      out.push({ label: v.makeName, href: href.make(v.make), kind: 'make' });
      if (v.model) out.push({ label: v.modelName, href: href.car(v.key), kind: 'model' });
      if (v.variant && v.variantName !== v.modelName) out.push({ label: v.variantName, href: href.car(v.id), kind: 'variant' });
    }
    if (path) for (const n of ancestors(path)) out.push({ label: n.name, href: href.cat(n.path, v ? v.id : null), kind: 'cat', path: n.path });
    return out;
  }

  // ---------- home stats ----------
  function stats() {
    const savings = PARTS.map(p => ({ p, s: bestSaving(p) })).filter(x => x.s && x.s.currency === 'GBP').sort((a, b) => b.s.amount - a.s.amount);
    return {
      parts: PARTS.length,
      alternatives: PARTS.reduce((n, p) => n + p.alts.length, 0),
      numbers: pnIndex().size,
      makes: makes().length,
      models: makes().reduce((n, m) => n + m.models, 0),
      examples: Object.keys(FAM).length,
      cars3d: Object.keys(V.models3d).length,
      categories: T.categories.length,
      workshop: PARTS.filter(p => p.evidence === 'workshop').length,
      service: PARTS.filter(p => p.service).length,
      withSaving: PARTS.filter(p => bestSaving(p)).length,
      biggestSaving: savings[0] ? { amount: savings[0].s.amount, currency: 'GBP', part: savings[0].p.id } : null,
    };
  }
  // Mat's finds: workshop parts with their real video frames first.
  const matsFinds = () => PARTS.filter(p => p.evidence === 'workshop').sort((a, b) => (b.frames || []).length - (a.frames || []).length);

  root.HWBT2 = {
    tax: T, veh: V, data: D,
    // text
    norm, normPN, esc, highlight, isPN,
    // vehicles
    makes, make, models, family, resolveModel, variants, variantOf, flow, vehicleId, vehicle, vehicleLabel, chassis,
    model3d, model3dFor, examples, showcase, donor, garage,
    // taxonomy
    tree, node, children, ancestors, breadcrumb, counts, count, ZONES, zone, zoneCounts, zoneCats, pins,
    // parts
    part: id => partBy[id] || null, parts, partsIn, partsForCar, serviceParts, fitRole, altGroups, bestSaving, chain, carsForPart,
    ALT_TYPES, EVIDENCE, matsFinds,
    // numbers + search
    pn, search,
    // money, shops, video
    saving, money, shopLinks, amazonSearch, ebaySearch, AMAZON_DISCLOSURE, videoUrl, stamp,
    // storage
    box, submissions,
    // routing
    route, href, stats,
  };
})(typeof window !== 'undefined' ? window : globalThis);
