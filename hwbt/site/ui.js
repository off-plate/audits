// HWBT Research Box v2: shared UI pieces (icons, components, selector, search overlay, vehicle bar, sheets).
// All data comes from window.HWBT2 (data/core.js). Nothing here invents a number.
(function () {
  const H = window.HWBT2;
  const esc = H.esc;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------- storage for UI conveniences (recent searches) ----------
  const ls = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* blocked */ } },
  };

  // ---------- icons (UI glyphs only, no drawings of real objects) ----------
  const I = {
    arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 17L17 7M9 7h8v8"/></svg>',
    right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6"/></svg>',
    left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    mark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4.5L6 21z" stroke-linejoin="round"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    swap: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg>',
    plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    ext: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  };

  // ---------- data helpers ----------
  const TOPS = H.tree();
  const topIndex = slug => TOPS.findIndex(t => t.slug === slug) + 1;
  const pad2 = n => String(n).padStart(2, '0');
  const plural = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : (many || one + 's')}`;
  const catPath = path => H.ancestors(path).map(n => n.name).join(' › ');

  // Photo for a vehicle key: the family photo, else a donor-car photo of that model (both Commons, credited in the footer).
  const donorByVeh = {};
  for (const [slug, d] of Object.entries(H.veh.donors)) for (const k of d.veh || []) if (d.image && !donorByVeh[k]) donorByVeh[k] = { ...d, slug };
  function carImg(id) {
    const v = id ? H.vehicle(id) : null;
    if (!v || !v.key) return null;
    if (v.image) return { src: v.image, label: v.label };
    const d = donorByVeh[v.key];
    return d ? { src: d.image, label: d.name } : null;
  }
  const donorImg = slug => (slug && H.veh.donors[slug] && H.veh.donors[slug].image) || null;

  // ---------- images ----------
  // One <img> writer: every non-hero image is lazy, async-decoded and carries its intrinsic size (no layout shift).
  // opts.hero = the page's LCP image: eager, fetchpriority high.
  function img(src, alt, w, h, opts = {}) {
    const load = opts.hero ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"';
    return `<img src="${esc(src)}"${opts.srcset ? ` srcset="${esc(opts.srcset)}" sizes="${esc(opts.sizes || '100vw')}"` : ''} alt="${esc(alt || '')}" width="${w}" height="${h}"${load}${opts.cls ? ` class="${opts.cls}"` : ''}${opts.attrs || ''}>`;
  }
  // Studio renders of the six 3D cars and white part squares (shared with version B, see shop.js).
  const SHOPDIR = '../assets/shop/';
  const SHOP = window.HWBT2_SHOP || { cars: {}, parts: [] };
  const SHOP_PARTS = new Set(SHOP.parts);
  // Renders that also exist as a small -sm.webp. cars.json lists them under "sm" once the files are on disk, so the
  // srcset switches itself on without ever pointing at a missing file. Cards already on screen are upgraded in place.
  const CAR_SM = new Set();
  const smSet = slug => `${SHOPDIR}cars/${slug}-34-sm.webp 600w, ${SHOPDIR}cars/${slug}-34.webp 1200w`;
  try {
    fetch(SHOPDIR + 'cars/cars.json').then(r => (r.ok ? r.json() : null)).then(j => {
      for (const c of Object.values((j && j.cars) || {})) if (c.sm && c.sm['34'] && c['34']) CAR_SM.add(c['34'].split('/').pop().replace(/-34\.webp$/, ''));
      if (!CAR_SM.size) return;
      for (const im of document.querySelectorAll('.ccard-img img:not([srcset])')) {
        const m = im.getAttribute('src').match(/cars\/(.+)-34\.webp$/);
        if (m && CAR_SM.has(m[1])) { im.sizes = '(max-width: 640px) 50vw, 33vw'; im.srcset = smSet(m[1]); }
      }
    }).catch(() => {});
  } catch (e) { /* no fetch: full-size renders only */ }
  function carRender(id) {
    const v = id ? H.vehicle(id) : null;
    const slug = v && v.key ? SHOP.cars[v.key] : null;
    if (!slug) return null;
    const src = `${SHOPDIR}cars/${slug}-34.webp`;
    return { src, srcset: CAR_SM.has(slug) ? smSet(slug) : '', label: v.makeName + ' ' + v.modelName };
  }
  // Car picture for a card: the studio render, else a neutral typographic tile. Never a stand-in photo.
  function carMedia(id, opts = {}) {
    const r = carRender(id);
    const v = id ? H.vehicle(id) : null;
    if (r) return img(r.src, r.label, 1200, 675, { srcset: r.srcset, sizes: opts.sizes || '(max-width: 640px) 50vw, 33vw' });
    return `<div class="ntile"><span>${esc(opts.make || (v ? v.makeName : ''))}</span><b>${esc(opts.name || (v ? (v.modelName || v.label) : ''))}</b></div>`;
  }
  const partSrc = id => (SHOP_PARTS.has(id) ? `${SHOPDIR}parts/${id}.webp` : null);

  // Car context: an explicit ?car= wins; links elsewhere carry the garage car.
  const currentId = () => { const c = H.garage.current(); return c ? c.id : null; };

  // ---------- small components ----------
  // The one "next" affordance on every card: a small neutral square with an arrow at the card's end.
  const go = () => `<span class="go" aria-hidden="true">${I.next}</span>`;
  const pnLink = (num, cls = '') => num ? `<a class="pn ${cls}" href="${H.href.pn(num)}" title="Every car that uses ${esc(num)}">${esc(num)}</a>` : '';
  // Evidence marker. The check only shows at the Full accent level, where the evidence-backed ones are highlighted.
  const TICK = '<svg class="tk" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  const evTag = ev => ev === 'workshop' ? `<span class="tag ev ws">${TICK}Seen in the workshop</span>` : ev === 'documented' ? `<span class="tag ev doc">${TICK}Documented</span>` : '<span class="tag rep">Reported</span>';
  const saveBtn = (id, extra = '') => { const on = H.box.has(id); return `<button type="button" class="save ${extra}" data-save="${esc(id)}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Save to'} research box">${I.mark}${extra ? `<span>${on ? 'Saved' : 'Save'}</span>` : ''}</button>`; };

  function crumbs(list) {
    return `<nav aria-label="Breadcrumb"><ol class="crumbs">${list.map((c, i) => `<li><a href="${c.href}"${i === list.length - 1 ? ' aria-current="page"' : ''}>${esc(c.label)}</a></li>`).join('')}</ol></nav>`;
  }

  // Thumbnail for a part row: a real video frame, else the donor car of the shared OE part, else the group code.
  function partThumb(p, n) {
    const f = (p.frames || [])[0];
    const same = p.alts.find(a => a.type === 'same-oe-other-car' && donorImg(a.donor));
    const src = f ? f.src : same ? donorImg(same.donor) : null;
    const pin = n ? `<b>${n}</b>` : '';
    return src ? `<div class="prow-img">${pin}${img(src, '', 160, 112)}</div>` : '';
  }

  // One listing row, used on every list of parts (vehicle, category, search, number, box).
  function partRow(p, opts = {}) {
    const car = opts.car || null;
    const role = car ? H.fitRole(p, car) : null;
    const s = H.bestSaving(p);
    const groups = H.altGroups(p).filter(g => g.items.length);
    const altN = p.alts.length;
    const same = p.alts.filter(a => a.type === 'same-oe-other-car');
    const onCars = p.veh.map(k => H.vehicle(k).label).join(', ');
    const tags = [];
    if (p.evidence === 'documented' || p.evidence === 'workshop') tags.push(evTag(p.evidence));
    if (role === 'shared') tags.push(`<span class="tag d3">Also fits this car</span>`);
    const sameTxt = same.length ? `Same part on ${esc(same.map(a => a.by).slice(0, 2).join(', '))}${same.length > 2 ? ` and ${same.length - 2} more` : ''}` : '';
    const thumb = partThumb(p, opts.n);
    return `<article class="prow${thumb ? '' : ' noimg'}" data-part-row="${esc(p.id)}">
      ${thumb}
      <div class="prow-main">
        <a class="t" href="${H.href.part(p.id, car)}">${esc(p.name)}</a>
        <div class="p">${esc(catPath(p.cat))}${opts.hideCar ? '' : ` <span class="muted">on ${esc(onCars)}</span>`}</div>
        ${tags.length ? `<div class="tg">${tags.join('')}</div>` : ''}
      </div>
      <div class="prow-num">${p.oe ? `OE number<br>${pnLink(p.oe.number)}` : ''}</div>
      <div class="prow-alt">${altN ? `${s ? `<span class="savebadge">Save ${H.money(s.amount, s.currency)}</span>` : `<strong>${plural(altN, 'alternative')}</strong>`}${s ? `<span class="d">${plural(altN, 'alternative')}</span>` : `<span class="d">${esc(groups.map(g => g.label).join(', '))}</span>`}${sameTxt ? `<br>${sameTxt}` : ''}` : '<span class="muted">Genuine only, so far</span>'}</div>
      <div class="prow-acts">${saveBtn(p.id)}${go()}</div>
    </article>`;
  }

  // Category tile (cut corners). Top level: a real part from that category on a white square (the car's own part
  // first, as in version B), else the group number. Sub level: a compact row. Count is plain text, never a badge.
  function catTile(n, car, opts = {}) {
    const c = H.count(n.path, car);
    const href = H.href.cat(n.path, car);
    if (opts.sub) {
      return `<a class="tile${c ? '' : ' dim'}" href="${href}" data-cat="${esc(n.path)}"><div class="tile-in">
        <strong>${esc(n.name)}</strong><span class="tile-count">${c}</span>${go()}</div></a>`;
    }
    const svc = n.path === 'service';
    const list = svc ? H.serviceParts(car) : H.partsIn(n.path, car);
    const pool = list.length ? list : (svc ? H.serviceParts() : H.partsIn(n.path));
    const pic = pool.find(p => partSrc(p.id));
    const mark = `<span class="tile-mark">${svc ? '+' : pad2(topIndex(n.top))}</span>`;
    return `<a class="tile${c ? '' : ' dim'}" href="${href}" data-cat="${esc(n.path)}">
      <div class="tile-in">
        <div class="tile-img">${pic ? img(partSrc(pic.id), '', 800, 800) : mark}</div>
        <div class="tile-txt"><strong>${esc(n.name)}</strong><span class="tile-count">${c ? plural(c, 'part') : 'None recorded yet'}</span></div>${go()}
      </div></a>`;
  }
  // Car card: studio render (or neutral tile), name, count line, the next arrow. One component for home, makes, make.
  function carCard(id, opts = {}) {
    const v = H.vehicle(id);
    const media = carRender(v.id) ? `<div class="ccard-img">${carMedia(v.id, opts)}</div>` : '';
    return `<a class="card ccard${media ? '' : ' noimg'}" href="${opts.href || H.href.car(v.id)}">${media}
      <div class="card-body"><span class="card-meta">${esc(opts.meta1 != null ? opts.meta1 : v.makeName)}</span><h3>${esc(opts.title || v.modelName || v.label)}</h3>
        <div class="card-foot"><span>${opts.meta != null ? opts.meta : plural(H.partsForCar(v.id).length, 'part')}</span>${go()}</div></div></a>`;
  }

  function emptyState(title, text, acts) {
    return `<div class="empty"><h3>${esc(title)}</h3><p>${text}</p>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
  }

  // ---------- 3D mount (data/viewer.js, built in parallel) ----------
  // Contract: <div data-v3d data-model data-mode data-car data-zone data-part>, mount after render, unmount before removal.
  function viewer({ mode, car = '', zone = '', part = '', model = null }) {
    const v = car ? H.vehicle(car) : null;
    const slug = model != null ? model : v && v.model3d ? v.model3d.slug : '';
    const pic = car ? carImg(car) : null;
    const familyPhoto = v && v.image;
    if (!slug && !familyPhoto) {
      return pic ? `${img(pic.src, pic.label, 1600, 1000, { hero: true, cls: 'v3d-fallback' })}<span class="v3d-note">Photo: ${esc(pic.label)}. No 3D model for this car yet.</span>` : '';
    }
    const has = !!window.HWBT2View;
    const fb = !has && pic ? img(pic.src, pic.label, 1600, 1000, { hero: true, cls: 'v3d-fallback' }) : '';
    return `<div class="v3d" style="position:absolute;inset:0" data-v3d data-model="${esc(slug)}" data-mode="${mode}" data-car="${esc(v ? v.key : '')}" data-zone="${esc(zone)}" data-part="${esc(part)}">${fb}</div>`;
  }
  function mountAll(root) {
    if (!window.HWBT2View) return;
    for (const el of $$('[data-v3d]', root)) { try { window.HWBT2View.mount(el); } catch (e) { console.warn('viewer mount', e); } }
  }
  function unmountAll(root) {
    if (!window.HWBT2View) return;
    for (const el of $$('[data-v3d]', root)) { try { window.HWBT2View.unmount(el); } catch (e) { /* already gone */ } }
  }
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

  // ---------- toast ----------
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // ---------- sheet (dialog) ----------
  let sheetReturn = null, sheetCleanup = null;
  function openSheet(title, html, after) {
    sheetReturn = document.activeElement;
    $('#sheet-title').textContent = title;
    $('#sheet-body').innerHTML = html;
    $('#sheet').hidden = false; $('#scrim').hidden = false;
    document.body.style.overflow = 'hidden';
    sheetCleanup = after ? after($('#sheet-body')) : null;
    const f = $('#sheet-body button, #sheet-body a, #sheet-body input');
    (f || $('[data-close-sheet]')).focus({ preventScroll: true });
  }
  function closeSheet() {
    closeCombos();
    if ($('#sheet').hidden) return;
    $('#sheet').hidden = true; $('#scrim').hidden = true; document.body.style.overflow = '';
    if (typeof sheetCleanup === 'function') sheetCleanup();
    $('#sheet-body').innerHTML = '';
    if (sheetReturn && document.contains(sheetReturn)) sheetReturn.focus({ preventScroll: true });
  }

  // ---------- combobox (searchable dropdown) ----------
  // opts: {label, value, display, placeholder, options:[{value,label,hint,ex,sep}], disabled, onPick}
  // The list is portalled to <body> and positioned to its trigger, so no parent overflow or clip-path can cut it.
  // It flips up when there is no room below, keeps its own scroll, and is a bottom sheet at phone width.
  let openCombo = null;
  const closeCombos = () => { if (openCombo) openCombo(false); };
  function Combo(host, opts) {
    host.classList.add('cbx');
    const id = 'cbx' + Math.random().toString(36).slice(2, 8);
    host.innerHTML = `<button type="button" class="cbx-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}" ${opts.disabled ? 'disabled' : ''}>
      <small>${esc(opts.label)}</small><span class="${opts.display ? '' : 'ph'}">${esc(opts.display || opts.placeholder)}</span></button>`;
    const btn = host.firstElementChild;
    let pop = null, scrim = null, act = 0;
    const mobile = () => window.innerWidth <= 640;
    const place = () => {
      if (!pop) return;
      if (mobile()) { pop.classList.add('as-sheet'); pop.style.cssText = ''; return; }
      pop.classList.remove('as-sheet');
      const r = btn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, gap = 6, margin = 12;
      const w = Math.min(Math.max(r.width, 300), vw - 2 * margin);
      const left = Math.min(Math.max(margin, r.left), vw - margin - w);
      const below = vh - r.bottom - gap - margin, above = r.top - gap - margin;
      const up = below < 260 && above > below;
      const maxH = Math.max(160, Math.min(420, up ? above : below));
      pop.style.left = left + 'px'; pop.style.width = w + 'px'; pop.style.maxHeight = maxH + 'px';
      if (up) { pop.style.top = 'auto'; pop.style.bottom = (vh - r.top + gap) + 'px'; pop.dataset.side = 'top'; }
      else { pop.style.bottom = 'auto'; pop.style.top = (r.bottom + gap) + 'px'; pop.dataset.side = 'bottom'; }
    };
    const onMove = () => place();
    const close = (focusBtn) => {
      if (!pop) return;
      pop.remove(); if (scrim) scrim.remove(); pop = null; scrim = null; openCombo = null;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove);
      if (focusBtn && document.contains(btn)) btn.focus({ preventScroll: true });
    };
    const outside = e => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(false); };
    const items = () => pop ? [...pop.querySelectorAll('li[role=option]')] : [];
    const mark = (scroll) => {
      const its = items(); its.forEach((li, i) => li.setAttribute('aria-selected', i === act ? 'true' : 'false'));
      const li = its[act], ul = pop.querySelector('ul');
      if (li) { pop.querySelector('input').setAttribute('aria-activedescendant', li.id); if (scroll) { const t = li.offsetTop, b = t + li.offsetHeight; if (t < ul.scrollTop) ul.scrollTop = t - 4; else if (b > ul.scrollTop + ul.clientHeight) ul.scrollTop = b - ul.clientHeight + 4; } }
    };
    const draw = q => {
      const nq = H.norm(q).trim();
      const seen = new Set();
      const shown = opts.options.filter(o => o.sep ? !nq : H.norm(o.label + ' ' + (o.hint || '')).includes(nq) && !(nq && seen.has(o.value)) && (seen.add(o.value), true));
      const sel = shown.filter(o => !o.sep);
      act = nq ? 0 : Math.max(0, sel.findIndex(o => o.value === opts.value));
      let i = 0;
      pop.querySelector('ul').innerHTML = sel.length ? shown.map(o => o.sep ? `<li class="sep" role="presentation">${esc(o.label)}</li>`
        : `<li role="option" id="${id}-${i++}" data-v="${esc(o.value)}" class="${o.ex ? 'ex' : ''}" aria-selected="false"><b>${nq ? H.highlight(o.label, q) : esc(o.label)}</b>${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</li>`).join('')
        : `<li class="none">Nothing matches "${esc(q)}".</li>`;
      mark(true);
    };
    const pick = v => { close(true); opts.onPick(v); };
    const open = () => {
      if (pop || btn.disabled) return;
      closeCombos();
      pop = document.createElement('div');
      pop.className = 'cbx-pop';
      pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', opts.label);
      pop.innerHTML = `<div class="cbx-head"><b>${esc(opts.label)}</b><button type="button" class="cbx-x" aria-label="Close">${I.close}</button></div>
        <input type="text" placeholder="Type to filter ${esc(opts.label.toLowerCase())}s" aria-label="Filter ${esc(opts.label)}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="${id}">
        <ul id="${id}" role="listbox" class="cbx-list" aria-label="${esc(opts.label)}"></ul>`;
      if (mobile()) { scrim = document.createElement('div'); scrim.className = 'cbx-scrim'; document.body.appendChild(scrim); }
      document.body.appendChild(pop);
      openCombo = close;
      btn.setAttribute('aria-expanded', 'true');
      place();
      const inp = pop.querySelector('input');
      draw('');
      inp.focus({ preventScroll: true });
      inp.addEventListener('input', () => draw(inp.value));
      inp.addEventListener('keydown', e => {
        const n = items().length;
        if (e.key === 'ArrowDown') { e.preventDefault(); act = Math.min(n - 1, act + 1); mark(true); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); mark(true); }
        else if (e.key === 'Enter') { e.preventDefault(); const it = items()[act]; if (it) pick(it.dataset.v); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (e.key === 'Tab') close(false);
      });
      pop.querySelector('.cbx-x').addEventListener('click', () => close(true));
      pop.querySelector('ul').addEventListener('click', e => { const it = e.target.closest('li[role=option]'); if (it) pick(it.dataset.v); });
      pop.querySelector('ul').addEventListener('pointermove', e => { const it = e.target.closest('li[role=option]'); if (!it) return; const i = items().indexOf(it); if (i !== act) { act = i; mark(false); } });
      window.addEventListener('scroll', onMove, true); window.addEventListener('resize', onMove);
      setTimeout(() => document.addEventListener('pointerdown', outside, true));
    };
    btn.addEventListener('click', () => (pop ? close(true) : open()));
    btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); open(); } });
    return { open, close, btn };
  }

  // ---------- vehicle selector: Make > Model > Variant > Years > Engine > Gearbox (auto-skips single options) ----------
  function Selector(root, opts = {}) {
    const cur = H.garage.current();
    let sel = opts.init || (cur ? { make: cur.make, model: cur.model, variant: cur.variant, years: cur.years, engine: cur.engine, gearbox: cur.gearbox } : {});
    const exampleMakes = new Set(H.makes().filter(m => m.example).map(m => m.slug));
    const render = (openKey) => {
      const f = H.flow(sel);
      const st = Object.fromEntries(f.steps.map(s => [s.key, s]));
      const model = st.model && st.model.value;
      const famName = model ? H.vehicle(sel.make + '/' + model).modelName : null;
      root.innerHTML = `<div class="sel-fields"><div data-k="make"></div><div data-k="model"></div><div data-k="variant"></div></div>
        <div class="sel-extra"></div><p class="sel-auto" hidden></p>
        <div class="sel-go"><button type="button" class="btn btn-lime" data-go ${model ? '' : 'disabled'}><span>${model ? (opts.goLabel ? opts.goLabel(famName) : `Show parts for the ${esc(famName)}`) : 'Pick a make and a model'}</span> ${I.next}</button></div>`;
      const fields = {};
      // make
      const makeOpts = [{ sep: true, label: 'Example marques, with 3D and parts' }];
      for (const m of H.makes()) if (exampleMakes.has(m.slug)) makeOpts.push({ value: m.slug, label: m.name, hint: plural(m.models, 'model'), ex: true });
      makeOpts.push({ sep: true, label: 'Every make, A-Z' });
      for (const m of H.makes()) makeOpts.push({ value: m.slug, label: m.name, hint: plural(m.models, 'model') });
      fields.make = Combo($('[data-k=make]', root), { label: 'Make', value: sel.make, display: sel.make ? H.make(sel.make).name : '', placeholder: 'Choose a make', options: makeOpts,
        onPick: v => { sel = { make: v }; render('model'); } });
      // model
      let modelOpts = [];
      if (st.model) {
        const ms = H.models(sel.make).filter(m => !m.alias);
        const ex = ms.filter(m => m.example);
        if (ex.length) { modelOpts.push({ sep: true, label: 'With recorded parts' }); for (const m of ex) modelOpts.push({ value: m.slug, label: m.name, hint: `${plural(H.partsForCar(sel.make + '/' + m.slug).length, 'part')}${m.has3d ? ', 3D' : ''}`, ex: true }); modelOpts.push({ sep: true, label: 'All models, A-Z' }); }
        for (const m of ms) modelOpts.push({ value: m.slug, label: m.name, hint: m.chassis || '' });
      }
      fields.model = Combo($('[data-k=model]', root), { label: 'Model', value: model, display: model ? famName : '', placeholder: sel.make ? 'Choose a model' : 'Pick a make first', options: modelOpts, disabled: !st.model,
        onPick: v => { sel = { make: sel.make, model: v }; render(); } });
      // variant (optional: all variants)
      const vs = st.variant;
      const vOpts = vs ? [{ value: '', label: 'All variants' }, ...vs.options.map(o => ({ value: o.value, label: o.label, hint: o.chassis || '' }))] : [];
      const vName = vs && vs.value ? vs.options.find(o => o.value === vs.value).label : '';
      fields.variant = Combo($('[data-k=variant]', root), { label: 'Variant', value: vs ? vs.value || '' : '', display: vName || (vs ? 'All variants' : ''), placeholder: model ? 'No variants listed' : 'Pick a model first', options: vOpts, disabled: !vs || vs.auto,
        onPick: v => { sel = { make: sel.make, model: sel.model, variant: v || null }; render(); } });
      // years / engine / gearbox: shown only when there is a real choice
      const extra = $('.sel-extra', root), auto = [];
      for (const k of ['years', 'engine', 'gearbox']) {
        const s = st[k]; if (!s) continue;
        if (s.auto) { auto.push(`${s.label} <b>${esc(s.value)}</b>`); continue; }
        const d = document.createElement('div'); extra.appendChild(d);
        Combo(d, { label: s.label, value: s.value, display: s.value || '', placeholder: 'Any ' + s.label.toLowerCase(), options: [{ value: '', label: 'Any ' + s.label.toLowerCase() }, ...s.options.map(o => ({ value: o.value, label: o.label }))],
          onPick: v => { sel = { ...sel, [k]: v || null }; if (k === 'years') { delete sel.engine; delete sel.gearbox; } if (k === 'engine') delete sel.gearbox; render(); } });
      }
      if (vs && vs.auto) auto.unshift(`Variant <b>${esc(vName)}</b>`);
      if (auto.length) { const p = $('.sel-auto', root); p.hidden = false; p.innerHTML = `Only one option, filled in: ${auto.join(', ')}.`; }
      $('[data-go]', root).addEventListener('click', () => {
        const id = H.vehicleId({ make: sel.make, model: sel.model, variant: sel.variant || (vs && vs.auto ? vs.value : null) });
        H.garage.setCurrent({ make: sel.make, model: sel.model, variant: sel.variant || null, years: st.years && st.years.value, engine: st.engine && st.engine.value, gearbox: st.gearbox && st.gearbox.value });
        const stay = opts.onGo ? opts.onGo(id) === 'stay' : false;
        if (!stay) location.hash = H.href.car(id);
      });
      if (openKey && fields[openKey]) fields[openKey].open();
      else if (model && !openKey && document.activeElement === document.body) $('[data-go]', root).focus({ preventScroll: true });
    };
    render();
    return { set(s) { sel = s; render(); } };
  }

  function pickCar(title) {
    openSheet(title || 'Pick your car', `<p class="small" style="margin:0 0 14px">Every make and model on record. The six example marques have variants, years, engines, 3D and parts.</p><div data-selector></div>`,
      body => { Selector($('[data-selector]', body), { onGo: () => closeSheet() }); });
  }

  // ---------- tree (left rail + mobile sheet) ----------
  function treeHtml(activePath, car) {
    const c = H.counts(car);
    const open = new Set(activePath ? H.ancestors(activePath).map(n => n.path) : []);
    const li = n => {
      const kids = H.children(n.path);
      const isOpen = open.has(n.path);
      return `<li><a href="${H.href.cat(n.path, car)}" class="${c[n.path] ? '' : 'z'}"${n.path === activePath ? ' aria-current="page"' : ''}><span>${esc(n.name)}</span><i>${c[n.path]}</i></a>${kids.length && isOpen ? `<ul>${kids.map(li).join('')}</ul>` : ''}</li>`;
    };
    const svc = H.node('service');
    return `<h2>${car ? `Categories for the ${esc(H.vehicle(car).short)}` : 'All categories, all cars'}</h2><ul>${TOPS.map(li).join('')}</ul>
      <ul class="svc-link"><li><a href="${H.href.cat('service', car)}" class="${c.service ? '' : 'z'}"${activePath === 'service' ? ' aria-current="page"' : ''}><span>${esc(svc.name)}</span><i>${c.service}</i></a></li></ul>`;
  }

  // ---------- vehicle bar ----------
  // The car lives in the header icon now; this keeps the old call sites working.
  function renderVbar() { renderHeaderCar(); }
  function garagePop() { openGarage($('#hcar')); }

  // ---------- mega menu + mobile menu ----------
  function renderMega() {
    const car = currentId();
    const c = H.counts(car);
    $('#mega').innerHTML = `<div class="wrap mega-in">${TOPS.map((t, i) => `<div><h3><a href="${H.href.cat(t.path, car)}"><em>${pad2(i + 1)}</em>${esc(t.name)}</a></h3><ul>${H.children(t.path).map(s => `<li><a href="${H.href.cat(s.path, car)}">${esc(s.name)}${c[s.path] ? ` (${c[s.path]})` : ''}</a></li>`).join('')}</ul></div>`).join('')}
      <div><h3><a href="${H.href.cat('service', car)}"><em>+</em>Service parts</a></h3><ul><li><a href="${H.href.cat('service', car)}">Filters, plugs, fluids, pads and belts (${c.service})</a></li></ul></div>
      <div class="mega-foot">${car ? `Counts are for your <b>${esc(H.vehicle(car).label)}</b>.` : 'Counts appear once you pick a car.'} <a class="tlink" href="${H.href.makes()}">Browse every make A-Z</a></div></div>`;
  }
  function renderMnav() {
    const car = currentId();
    const c = H.counts(car);
    $('#mnav').innerHTML = `<a href="#/">Home ${I.right}</a>
      <a href="#/makes">Makes A-Z ${I.right}</a><a href="#/box">Research box ${I.right}</a><a href="#/submit">Submit a find ${I.right}</a>
      <h3>${car ? `Categories for the ${esc(H.vehicle(car).short)}` : 'Categories'}</h3>
      <div class="mcats">${TOPS.map(t => `<a href="${H.href.cat(t.path, car)}">${esc(t.name)} <span>${c[t.path]}</span></a>`).join('')}<a href="${H.href.cat('service', car)}">Service parts <span>${c.service}</span></a></div>`;
  }

  // ---------- search overlay (/ and Cmd/Ctrl+K) ----------
  const SUGS = ['07K 905 715 G', 'brake pads', 'Gallardo', 'gearbox pump', 'spark plugs', 'tail light'];
  let soItems = [], soAct = 0, soReturn = null;
  function soOpen(q) {
    soReturn = document.activeElement;
    const so = $('#so'); so.hidden = false;
    document.body.style.overflow = 'hidden';
    const inp = $('#so-input'); inp.value = q || ''; soRender(inp.value); inp.focus();
  }
  function soClose() {
    const so = $('#so'); if (so.hidden) return;
    so.hidden = true; document.body.style.overflow = '';
    if (soReturn && document.contains(soReturn)) soReturn.focus({ preventScroll: true });
  }
  function remember(q) { q = String(q || '').trim(); if (q.length < 2) return; const l = [q, ...ls.get('hwbt2-recent', []).filter(x => x !== q)].slice(0, 6); ls.set('hwbt2-recent', l); }
  function soRender(q) {
    const list = $('#so-list'), car = currentId();
    $('#so-scope').innerHTML = car ? `Results for your <b>${esc(H.vehicle(car).label)}</b> come first.` : '';
    soItems = []; soAct = 0;
    if (!q.trim()) {
      const rec = ls.get('hwbt2-recent', []);
      list.innerHTML = `<div class="so-empty"><p>Type a part, a part number, a car or a category. Spaces and dashes in numbers do not matter.</p>
        ${rec.length ? `<h3>Recent searches</h3><div class="so-sugs">${rec.map(s => `<button type="button" data-sug="${esc(s)}" class="${H.isPN(s) ? 'm' : ''}">${esc(s)}</button>`).join('')}</div>` : ''}
        <h3>Try</h3><div class="so-sugs">${SUGS.map(s => `<button type="button" data-sug="${esc(s)}" class="${H.isPN(s) ? 'm' : ''}">${esc(s)}</button>`).join('')}</div></div>`;
      return;
    }
    const r = H.search(q, { limit: 5, car });
    const groups = [];
    const pnFirst = H.isPN(q);
    const gNum = r.numbers.length ? { t: 'Part numbers', n: r.total.numbers, items: r.numbers.map(h => ({ href: H.href.pn(h.norm), html: `<span class="ic">No.</span><span class="tx"><b class="m">${H.highlight(h.number, q.replace(/[\s.-]/g, ''))}</b><span>${esc(h.name)}${h.exact ? ', exact match' : ''}</span></span>` })) } : null;
    const gParts = r.parts.length ? { t: 'Parts', n: r.total.parts, items: r.parts.map(p => { const im = carImg(p.veh[0]); return { href: H.href.part(p.id, car && H.fitRole(p, car) ? car : null), html: `${im ? img(im.src, '', 88, 64) : '<span class="ic">Part</span>'}<span class="tx"><b>${H.highlight(p.name, q)}</b><span>${esc(p.veh.map(k => H.vehicle(k).label).join(', '))}, ${esc(H.node(p.cat).name)}</span></span>` }; }) } : null;
    const gCars = r.cars.length ? { t: 'Cars', n: r.total.cars, items: r.cars.map(c => { const im = c.model ? carImg(c.id) : null; return { href: c.href, html: `${im ? img(im.src, '', 88, 64) : `<span class="ic">${c.kind === 'make' ? 'Make' : 'Car'}</span>`}<span class="tx"><b>${H.highlight(c.label, q)}</b><span>${c.kind === 'make' ? 'All models' : c.example ? `${plural(H.partsForCar(c.id).length, 'part')} recorded${c.chassis ? ', ' + esc(c.chassis) : ''}` : 'Full category tree'}</span></span>` }; }) } : null;
    const gCats = r.categories.length ? { t: 'Categories', n: r.total.categories, items: r.categories.map(c => ({ href: H.href.cat(c.path, car), html: `<span class="ic">${c.path === 'service' ? '+' : pad2(topIndex(c.path.split('/')[0]))}</span><span class="tx"><b>${H.highlight(c.name, q)}</b><span>${c.parentName ? esc(c.parentName) + ', ' : ''}${plural(c.count, 'part')}${car ? ' for your car' : ''}</span></span>` })) } : null;
    for (const g of pnFirst ? [gNum, gParts, gCars, gCats] : [gParts, gNum, gCars, gCats]) if (g) groups.push(g);
    if (!groups.length) {
      list.innerHTML = `<div class="so-empty"><p>Nothing on record for "${esc(q)}" yet.</p><div class="so-sugs"><button type="button" data-go-href="${H.href.submit(H.isPN(q) ? { pn: q } : { part: q })}">Submit a find</button><button type="button" data-go-href="${H.href.makes()}">Browse every make</button></div></div>`;
      return;
    }
    let i = 0;
    list.innerHTML = groups.map(g => `<div class="so-group" role="group" aria-label="${g.t}"><h3><span>${g.t}</span><span>${g.n > g.items.length ? `${g.items.length} of ${g.n}` : g.n}</span></h3>${g.items.map(it => { soItems.push(it.href); return `<div class="so-item" role="option" id="so-${i}" data-i="${i++}" aria-selected="false">${it.html}<span class="go">${I.right}</span></div>`; }).join('')}</div>`).join('')
      + `<a class="so-all" href="${H.href.search(q, car)}" data-all>See every result for "${esc(q)}"</a>`;
    soMark();
  }
  function soMark() {
    $$('.so-item', $('#so-list')).forEach(el => el.setAttribute('aria-selected', +el.dataset.i === soAct ? 'true' : 'false'));
    const el = $(`#so-${soAct}`); if (el) { el.scrollIntoView({ block: 'nearest' }); $('#so-input').setAttribute('aria-activedescendant', el.id); }
  }
  function soGo(href) { remember($('#so-input').value); soClose(); location.hash = href; }
  function initSearch() {
    const inp = $('#so-input');
    inp.addEventListener('input', () => soRender(inp.value));
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (soItems.length) { soAct = (soAct + 1) % soItems.length; soMark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (soItems.length) { soAct = (soAct - 1 + soItems.length) % soItems.length; soMark(); } }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const q = inp.value.trim(); if (!q) return;
        if (H.isPN(q) && H.pn(q)) return soGo(H.href.pn(q));
        if (soItems.length) return soGo(soItems[soAct]);
        soGo(H.href.search(q, currentId()));
      }
    });
    $('#so-list').addEventListener('click', e => {
      const it = e.target.closest('.so-item'); if (it) return soGo(soItems[+it.dataset.i]);
      const s = e.target.closest('[data-sug]'); if (s) { inp.value = s.dataset.sug; soRender(inp.value); inp.focus(); return; }
      const g = e.target.closest('[data-go-href]'); if (g) return soGo(g.dataset.goHref);
      if (e.target.closest('[data-all]')) { remember(inp.value); soClose(); }
    });
    $('#so-list').addEventListener('pointermove', e => { const it = e.target.closest('.so-item'); if (it && +it.dataset.i !== soAct) { soAct = +it.dataset.i; soMark(); } });
    $('#so-close').addEventListener('click', soClose);
    $('#so').addEventListener('click', e => { if (e.target.id === 'so') soClose(); });
    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('#so').hidden ? soOpen('') : soClose(); }
      else if (e.key === '/' && !typing && $('#so').hidden) { e.preventDefault(); soOpen(''); }
      else if (e.key === 'Escape') { if (!$('#so').hidden) soClose(); else closeSheet(); }
    });
  }

  // ---------- footer + credits ----------
  function renderFoot() {
    const car = currentId();
    const photos = new Map();
    for (const f of Object.values(H.veh.families)) if (f.image) photos.set(f.image, { who: f.name ? f.makeName + ' ' + f.name : '', credit: f.credit });
    for (const d of Object.values(H.veh.donors)) if (d.image && !photos.has(d.image)) photos.set(d.image, { who: d.name, credit: d.credit });
    const credit = c => { const m = String(c || '').match(/^(.*?),\s*(CC[^,]*|Public domain[^,]*),\s*(https?:\S+)$/i); return m ? `${esc(m[1])}, ${esc(m[2])}, <a href="${esc(m[3])}" target="_blank" rel="noopener">Wikimedia Commons</a>` : esc(c); };
    const m3 = Object.values(H.veh.models3d);
    $('#foot').innerHTML = `<div class="wrap"><div class="foot-grid">
      <div><a class="brand" href="#/"><img src="../assets/brand/logo.svg" alt="HWBT" width="86" height="22" loading="lazy" decoding="async"><span>RESEARCH<b>.BOX</b></span></a>
        <p>Car parts and the cheaper versions behind them: the same part on other cars, the supplier's own box, aftermarket and upgrades. Built on Mat Armstrong's research box.</p></div>
      <div><h4>Find parts</h4><ul><li><a href="#/makes">Makes A-Z</a></li><li><a href="${H.href.cat('service', car)}">Service parts</a></li><li><a href="#/pn">Part numbers</a></li><li><a href="${H.href.search('', car)}">Search</a></li></ul></div>
      <div><h4>Categories</h4><ul>${TOPS.slice(0, 7).map(t => `<li><a href="${H.href.cat(t.path, car)}">${esc(t.name)}</a></li>`).join('')}</ul></div>
      <div><h4>HWBT</h4><ul><li><a href="#/box">Research box</a></li><li><a href="#/submit">Submit a find</a></li><li><a href="https://hwbt.shop" target="_blank" rel="noopener">hwbt.shop</a></li>
        <li><a href="${esc(H.data.video.url)}" target="_blank" rel="noopener">${esc(H.data.video.title)}</a></li><li class="lime">Video stills: Mat Armstrong MK2</li></ul></div>
    </div>
    <details class="credits"><summary>${I.right} Photo, 3D and video credits</summary>
      <h5>3D models (CC BY 4.0)</h5><ul>${m3.map(m => `<li>${esc(m.name)}: ${esc(m.credit)}</li>`).join('')}</ul>
      <h5>Video stills</h5><ul><li>Video stills: Mat Armstrong MK2, from "${esc(H.data.video.title)}" and the videos linked on each part.</li></ul>
      <h5>Car photos (Wikimedia Commons)</h5><ul>${[...photos.values()].map(p => `<li>${esc(p.who)}: ${credit(p.credit)}</li>`).join('')}</ul>
    </details>
    <p class="copy">HWBT Research Box concept. Demo by Off-Plate. Prices are as quoted in the linked sources, never converted. Vehicle list: NHTSA vPIC (public domain) plus Wikipedia for non-US models.</p></div>`;
  }


  // ---------- listing card (buy box) ----------
  // One component for every offer: sourced prices today, Amazon UK / eBay UK API results later.
  // Pass a plain object; empty fields are not rendered, nothing is ever filled in:
  // {
  //   store:      'Amazon UK' | 'eBay UK' | 'autodoc.co.uk' ...   (required, shown as text)
  //   title:      string                                           (required, 2 lines max)
  //   url:        string                                           (required, the View button)
  //   kind:       'listing' | 'source' | 'search'                  (search = a search link, never priced)
  //   price:      { amount: number, currency: 'GBP' } | null
  //   priceNote:  string | null    e.g. 'Price on Amazon'
  //   condition:  'New' | 'Used' | 'Reconditioned' | null
  //   note:       string | null    the source's own wording, e.g. 'approx., used, off an Audi A5'
  //   delivery:   string | null    e.g. 'Free delivery Thu 16 Oct' (from the API only)
  //   seller:     string | null    sellerScore: string | null (e.g. '99.4% positive')
  //   rating:     { value: number, count: number } | null
  //   saving:     { amount, currency } | null   (only when the genuine price is in the same currency)
  //   cta:        string | null    button label, default 'View on <store>'
  // }
  function listingCard(o) {
    const rows = [];
    if (o.condition) rows.push(`<span>${esc(o.condition)}</span>`);
    if (o.delivery) rows.push(`<span>${esc(o.delivery)}</span>`);
    const meta = [];
    if (o.seller) meta.push(`Seller ${esc(o.seller)}${o.sellerScore ? ` (${esc(o.sellerScore)})` : ''}`);
    if (o.rating && o.rating.value != null) meta.push(`Rating ${esc(o.rating.value)}${o.rating.count != null ? ` (${esc(o.rating.count)})` : ''}`);
    return `<article class="lcard lcard-${esc(o.kind || 'listing')}">
      <div class="lcard-store">${o.typeLabel ? `${esc(o.typeLabel)}<span>${esc(o.store)}</span>` : esc(o.store)}</div>
      <h3 class="lcard-title">${esc(o.title)}</h3>
      ${o.number ? `<p class="lcard-num">${pnLink(o.number)}</p>` : ''}
      ${o.price || o.priceNote || rows.length ? `<div class="lcard-price">${o.price ? `<b>${H.money(o.price)}</b>` : o.priceNote ? `<span class="muted">${esc(o.priceNote)}</span>` : ''}${rows.join('')}${o.saving ? `<span class="savebadge">Save ${H.money(o.saving.amount, o.saving.currency)}</span>` : ''}</div>` : ''}
      ${o.note ? `<p class="lcard-note">${esc(o.note)}</p>` : ''}
      ${meta.length ? `<p class="lcard-meta">${meta.join(', ')}</p>` : ''}
      ${o.url ? `<a class="btn btn-sec lcard-btn" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.cta || 'View on ' + o.store)} ${I.ext}</a>` : ''}
    </article>`;
  }
  const domainOf = url => { try { const h = new URL(url).hostname.replace(/^www\./, ''); return /youtube\.com|youtu\.be/.test(h) ? 'YouTube, Mat Armstrong' : h; } catch (e) { return 'Source'; } };
  const conditionOf = t => (/recon/i.test(t || '') ? 'Reconditioned' : /\bused\b|second ?hand/i.test(t || '') ? 'Used' : /\bnew\b/i.test(t || '') ? 'New' : null);
  // The part page's one offers list: sourced prices, recorded listings, every other alternative with its
  // type label, then store searches.
  const ALT_LABEL = Object.fromEntries(H.ALT_TYPES.map(t => [t.key, t.label]));
  const altNumber = a => a.pns && a.pns[0] ? (String(a.pn).split(/\s*[\/;,(]\s*/).find(x => H.normPN(x) === a.pns[0]) || null) : null;
  const altNote = a => [a.notes ? a.notes.replace(/^match:\s*/i, '').replace(/;\s*evidence:.*$/i, '') : '', a.reported ? 'Reported by one source. Check before buying.' : ''].filter(Boolean).join(' ') || null;
  function partListings(p) {
    const out = [], rest = [];
    for (const a of p.alts) {
      const url = a.price && a.price.amount != null ? a.price.url || a.url : null;
      if (url) out.push({ kind: 'source', store: domainOf(url), title: `${a.name}${a.by ? ', ' + a.by : ''}`, url, price: { amount: a.price.amount, currency: a.price.currency }, condition: conditionOf(a.price.condition), note: a.price.condition || null, saving: H.saving(p.price, a.price), cta: 'View source', type: a.type, typeLabel: ALT_LABEL[a.type], number: altNumber(a) });
      else rest.push({ kind: 'alt', store: a.by || (a.url ? domainOf(a.url) : ''), title: a.name, url: a.url || null, price: a.price && a.price.amount != null ? { amount: a.price.amount, currency: a.price.currency } : null, saving: a.price && a.price.amount != null ? H.saving(p.price, a.price) : null, note: altNote(a), cta: 'View source', type: a.type, typeLabel: ALT_LABEL[a.type], number: altNumber(a) });
    }
    if (p.price && p.price.url) out.push({ kind: 'source', store: domainOf(p.price.url), title: `Genuine ${p.name}`, url: p.price.url, price: { amount: p.price.amount, currency: p.price.currency }, condition: conditionOf(p.price.condition), note: p.price.condition || null, cta: 'View source', type: 'oe', typeLabel: 'Genuine' });
    const CUR = ['GBP', 'EUR', 'USD'];
    const rank = c => (CUR.indexOf(c) < 0 ? 9 : CUR.indexOf(c));
    out.sort((x, y) => rank(x.price.currency) - rank(y.price.currency) || x.price.amount - y.price.amount);
    out.push(...rest);
    for (const l of H.shopLinks(p)) {
      if (l.kind === 'listing') out.splice(out.filter(o => o.price && o.price.currency === 'GBP').length, 0, { kind: 'listing', store: l.store, title: l.title, url: l.url, priceNote: `Price on ${l.store}`, cta: `View on ${l.store}` });
      else out.push({ kind: 'search', store: l.store, title: l.title.replace(/^(Amazon UK|eBay UK) search:\s*/i, 'Search ' + l.store + ': ').replace(/^Search (Amazon UK|eBay UK) for /, 'Search $1: '), url: l.url, cta: `Search ${l.store}` });
    }
    return out;
  }

  // ---------- header: garage (car icon), theme ----------
  const GARAGE_ICON = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10.5L12 4l9 6.5V20H3z"/><path d="M7 20v-7h10v7M7 16h10"/></svg>';
  function renderHeaderCar() {
    const b = $('#hcar'); if (!b) return;
    const cur = H.garage.current();
    const v = cur ? H.vehicle(cur.id) : null;
    b.innerHTML = `${GARAGE_ICON}<span class="hcar-name">${v ? esc(v.short) : 'My car'}</span>`;
    b.setAttribute('aria-label', v ? `Your car: ${v.label}. Change car` : 'Pick your car');
    b.classList.toggle('on', !!v);
  }
  let gpop = null;
  function closeGarage() { if (gpop) { gpop.remove(); gpop = null; const b = $('#hcar'); if (b) b.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', gAway, true); } }
  function gAway(e) { if (gpop && !gpop.contains(e.target) && !e.target.closest('#hcar, .cbx-pop, .cbx-scrim, [data-garage]')) closeGarage(); }
  function garageHtml() {
    const cur = currentId(), list = H.garage.list();
    return `<div class="gp-list">${list.length ? list.map(s => { const v = H.vehicle(s.id); const im = carImg(s.id); return `<div class="g-row${s.id === cur ? ' on' : ''}">
        <button type="button" class="g-pick" data-switch="${esc(s.id)}" aria-pressed="${s.id === cur}"><span class="g-radio" aria-hidden="true"></span>${im ? img(im.src, '', 96, 64) : ''}<span><b>${esc(v.label)}</b><small>${s.id === cur ? 'Current car' : 'Use this car'}</small></span></button>
        <button type="button" class="g-x" data-remove-car="${esc(s.id)}" aria-label="Remove ${esc(v.label)}">${I.close}</button></div>`; }).join('') : '<p class="small">No car yet. Add one and every category and part page checks the fit.</p>'}</div>
      <div class="gp-add"><h3>${list.length ? 'Add another car' : 'Add a car'}</h3><div data-selector></div></div>
      ${cur ? '<button type="button" class="tlink" data-clear-car>Shop without a car</button>' : ''}`;
  }
  function wireGarage(body, done) {
    Selector($('[data-selector]', body), { init: {}, goLabel: n => `Use the ${esc(n)}`, onGo: () => { done(); const r = H.route().name; return ['home', 'makes', 'make', 'notfound'].includes(r) ? 'go' : 'stay'; } });
  }
  function openGarage(btn) {
    if (gpop) { closeGarage(); return; }
    closeCombos();
    if (window.innerWidth <= 640 || !btn) { openSheet('Your garage', garageHtml(), body => { wireGarage(body, () => closeSheet()); return null; }); return; }
    gpop = document.createElement('div');
    gpop.className = 'gpop'; gpop.setAttribute('role', 'dialog'); gpop.setAttribute('aria-label', 'Your garage');
    gpop.innerHTML = `<div class="gpop-head"><h2>Your garage</h2><button type="button" class="ibtn" data-close-garage aria-label="Close">${I.close}</button></div>${garageHtml()}`;
    document.body.appendChild(gpop);
    const r = btn.getBoundingClientRect();
    gpop.style.top = (r.bottom + 8) + 'px';
    gpop.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    wireGarage(gpop, closeGarage);
    gpop.addEventListener('click', e => { if (e.target.closest('[data-close-garage]')) closeGarage(); });
    const first = gpop.querySelector('.g-pick, .cbx-btn'); if (first) first.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener('pointerdown', gAway, true));
  }
  // ---------- account (prepared, not connected) ----------
  // Honest preview: the form never signs anyone in. The panel lists what an account would hold, from this device.
  function accountHtml() {
    const cars = H.garage.list(), cur = currentId(), parts = H.box.parts(), subs = H.submissions.list();
    const links = parts.reduce((n, p) => n + partListings(p).filter(o => /amazon|ebay/i.test(o.store || '')).length, 0);
    const few = (arr, f) => arr.slice(0, 4).map(f).join('') + (arr.length > 4 ? `<li class="muted">and ${arr.length - 4} more</li>` : '');
    const row = (title, n, body, empty) => `<div class="acct-row"><h3>${title}<span class="acct-n" data-n="${n}">${n}</span></h3>${n ? `<ul>${body}</ul>` : `<p class="small">${empty}</p>`}</div>`;
    return `<form class="acct-form" data-acctform novalidate>
        <div class="field"><label for="acct-email">Email</label><input id="acct-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
        <button class="btn btn-lime" type="submit">Continue</button>
        <p class="acct-msg" role="status" hidden>Accounts are not connected in this demo. Your garage and saved parts stay on this device.</p>
      </form>
      <div class="acct-panel"><h3 class="acct-h">Your account</h3><p class="small">Once accounts are connected, these move with you to any device. Today they are kept on this one.</p>
        ${row('Garage cars', cars.length, few(cars, c => `<li>${esc(H.vehicle(c.id).label)}${c.id === cur ? ' <b class="acct-cur">Current car</b>' : ''}</li>`), 'No car yet. Pick one from the garage in the header.')}
        ${row('Saved parts', parts.length, few(parts, p => `<li><a href="${H.href.part(p.id)}">${esc(p.name)}</a></li>`), 'Nothing saved yet. Press the bookmark on any part.')}
        ${row('Amazon UK and eBay UK links', links, `<li>On your ${plural(parts.length, 'saved part')}. <a href="#/box">Open the research box</a></li>`, 'They appear here with the parts you save.')}
        ${row('Submitted finds', subs.length, few(subs, x => `<li>${esc(x.part || 'Part')}${x.car ? `, ${esc(x.car)}` : ''}</li>`), 'None sent from this device yet.')}
      </div>`;
  }
  function openAccount() { closeGarage(); openSheet('Sign in', accountHtml(), body => { const i = $('#acct-email', body); if (i) i.focus({ preventScroll: true }); return null; }); }

  const THEME_KEY = 'hwbt2-theme';
  const theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  function renderTheme() { const b = $('[data-theme-toggle]'); if (!b) return; const d = theme() === 'dark'; b.innerHTML = d ? SUN : MOON; b.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode'); b.setAttribute('aria-pressed', d); }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* storage blocked: the choice lasts this visit */ }
    renderTheme();
    for (const el of $$('[data-v3d]')) el.setAttribute('data-mode', el.getAttribute('data-mode') || 'car'); // viewer re-reads its colours
  }

  window.UI = { img, carRender, carMedia, carCard, partSrc, go, listingCard, partListings, domainOf, renderHeaderCar, openGarage, closeGarage, setTheme, renderTheme, theme, closeCombos, H, esc, $, $$, ls, I, TOPS, topIndex, pad2, plural, catPath, carImg, donorImg, currentId, pnLink, evTag, saveBtn, crumbs, partThumb, partRow, catTile, emptyState,
    viewer, mountAll, unmountAll, emit, toast, openSheet, closeSheet, Combo, Selector, pickCar, treeHtml, renderVbar, garagePop, renderMega, renderMnav,
    soOpen, soClose, initSearch, renderFoot, remember, openAccount };
})();
