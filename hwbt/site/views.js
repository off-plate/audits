// HWBT Research Box v2: one renderer per route. Each returns { title, html, after(root) }.
(function () {
  const U = window.UI, H = U.H, esc = U.esc, I = U.I, $ = U.$, $$ = U.$$;
  const { plural, pad2, carImg, pnLink, partRow, catTile, crumbs, emptyState, viewer, emit } = U;
  const V = {};
  const money = (p) => p ? H.money(p) : '';
  const ext = (url, label) => url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label);

  // ---------- reusable sections ----------
  function catTiles(car) {
    return `<div class="tiles">${U.TOPS.map(t => catTile(t, car)).join('')}${catTile(H.node('service'), car)}</div>`;
  }
  const pnExamples = (() => {
    let cache;
    return () => cache || (cache = H.data.parts.filter(p => p.oe).map(p => ({ p, n: H.pn(p.oe.number) })).filter(x => x.n)
      .map(x => ({ number: x.p.oe.forms[1] || x.p.oe.number, norm: x.p.oe.norm, name: x.p.name, cars: x.n.cars.reduce((s, m) => s + m.cars.length, 0), makers: x.n.makers.length }))
      .sort((a, b) => b.makers - a.makers || b.cars - a.cars).slice(0, 8));
  })();

  // ---------- HOME: hero, categories, Mat's finds, example marques ----------
  V.home = () => {
    const car = U.currentId(), cv = car ? H.vehicle(car) : null;
    const show = H.showcase().filter(Boolean);
    const st = H.stats();
    const sv = show.find(v => v.key === 'bugatti/veyron') || show[0];
    const ex = pnExamples()[0];
    const finds = H.matsFinds().slice(0, 4);
    return {
      title: 'HWBT Research Box: parts and cheaper alternatives for any car',
      html: `<section class="hero wrap"><div class="hero-grid">
        <div class="hero-head">
          <h1 class="disp">Find the part.<br>Then find it <em class="hl">cheaper.</em></h1>
          <p class="lead">Any car, ${st.categories} workshop categories, or the number printed on the old part. Each part lists the same piece on other cars, the supplier's own box, aftermarket and upgrades.</p>
          <div class="hero-find"><form class="hero-search" data-searchform role="search"><input name="q" placeholder="Part name, part number or car" aria-label="Search parts, part numbers and cars" autocomplete="off" spellcheck="false"><button class="btn btn-lime" type="submit">Search</button></form>
          <p class="hero-try">Try ${ex ? `${pnLink(ex.number)}, ` : ''}<a class="tlink" href="${H.href.search('brake pads')}">brake pads</a> or <a class="tlink" href="${H.href.search('Gallardo')}">Gallardo</a></p></div>
          <div class="hero-car">${cv ? `<span>Counts below are for your <b>${esc(cv.label)}</b>.</span> <button type="button" class="tlink" data-pick-car>Change car</button>` : `<button type="button" class="btn btn-sec" data-pick-car>Pick your car</button><span>and every category shows what fits it.</span>`}</div>
        </div>
        <div class="stage">
          <div class="stage-box" id="home-stage">${viewer({ mode: 'showcase', car: sv.key, model: sv.model3d ? sv.model3d.slug : '' })}</div>
          <div class="stage-cap"><div><h2 class="h3">${esc(sv.label)}</h2><p class="muted">${plural(H.partsForCar(sv.key).length, 'part')} recorded. Drag to turn it.</p></div><a class="btn btn-sec btn-sm" href="${H.href.car(sv.key)}">Open the ${esc(sv.modelName)} ${I.next}</a></div>
        </div>
      </div></section>

      <section class="sec wrap" id="sec-cats">
        <div class="sec-head"><div><h2 class="h2">Shop by category</h2>
          <p class="muted">${cv ? `Counts for your ${esc(cv.label)}.` : `${st.parts} parts in ${st.categories} groups, named the way a UK workshop names them.`}</p></div>
          <a class="tlink" href="${H.href.cat('service', car)}">Service parts</a></div>
        ${catTiles(car)}
      </section>

      <section class="sec wrap">
        <div class="sec-head"><div><h2 class="h2">Mat's finds</h2><p class="muted">Parts Mat Armstrong showed in the workshop, with the video moment.</p></div>
          <a class="tlink" href="${H.href.search('workshop')}">All ${H.matsFinds().length}</a></div>
        <div class="grid4">${finds.map(findCard).join('')}</div>
      </section>

      <section class="sec wrap">
        <div class="sec-head"><div><h2 class="h2">Cars with 3D and parts</h2></div><a class="tlink" href="#/makes">All ${st.makes} makes</a></div>
        <div class="cgrid">${show.map(v => U.carCard(v.key)).join('')}</div>
      </section>`,
    };
  };
  function findCard(p) {
    const f = (p.frames || [])[0];
    const v = H.vehicle(p.veh[0]);
    const img = f ? f.src : (carImg(p.veh[0]) || {}).src;
    const s = H.bestSaving(p);
    const alt = H.altGroups(p).flatMap(g => g.items).find(a => a.price);
    const t = p.video ? p.video.timestamp_s : null;
    return `<article class="card"><a class="card-link" href="${H.href.part(p.id)}">
      <div class="card-media">${img ? U.img(img, f ? f.shows : v.label, 640, 400) : ''}${t != null ? `<span class="tag">${f ? 'Video still' : 'Video'} ${H.stamp(t)}</span>` : ''}</div>
      <div class="card-body"><span class="card-meta">${esc(v.label)}</span><h3>${esc(p.name)}</h3>
        <div class="card-foot"><span>${p.price ? `Genuine <b>${money(p.price)}</b>` : ''}${alt ? `<br>${esc(H.ALT_TYPES.find(x => x.key === alt.type).label)} <b>${money(alt.price)}</b>` : ''}${s ? `<br><span class="savebadge">Save ${H.money(s.amount, s.currency)}</span>` : ''}</span>${U.go()}</div></div></a></article>`;
  }

  // ---------- VEHICLE ----------
  V.car = (r) => {
    const v = r.vehicle;
    if (!v || !v.key) return V.notfound(r, 'We have no car under that address.');
    const id = v.id, key = v.key, f = v.family;
    const parts = H.partsForCar(id);
    const shared = parts.filter(p => H.fitRole(p, key) === 'shared');
    const isCur = U.currentId() === id;
    const variants = f ? f.variants : [];
    const vv = v.variant ? f.variants.find(x => x.slug === v.variant) : null;
    const uniq = a => [...new Set(a)];
    const engines = vv ? vv.engines : uniq(variants.flatMap(x => x.engines));
    const boxes = vv ? vv.gearboxes : uniq(variants.flatMap(x => x.gearboxes));
    const altN = parts.reduce((s, p) => s + p.alts.length, 0);
    const best = parts.map(p => ({ p, s: H.bestSaving(p) })).filter(x => x.s && x.s.currency === 'GBP').sort((a, b) => b.s.amount - a.s.amount)[0];
    const img = carImg(id);
    const has3dOrPhoto = !!(v.model3d || v.image || img);
    const specs = [
      v.chassis || (f && f.platform) ? `<div><span>${v.chassis ? 'Chassis' : 'Platform'}</span><strong>${esc(v.chassis || f.platform)}</strong></div>` : '',
      `<div><span>Years</span><strong>${esc((vv && vv.years.join(', ')) || (f && f.years) || 'Not recorded')}</strong></div>`,
      engines.length ? `<div><span>${engines.length > 1 ? plural(engines.length, 'engine') : 'Engine'}</span><strong>${esc(engines.map(e => e.split(' (')[0]).filter((x, i, a) => a.indexOf(x) === i).join(', '))}</strong></div>` : '',
      boxes.length ? `<div><span>Gearbox</span><strong>${esc(boxes.map(g => g.split(' (')[0]).filter((x, i, a) => a.indexOf(x) === i).join(', '))}</strong></div>` : '',
      `<div><span>Alternatives</span><strong class="big">${altN}</strong></div>`,
      best ? `<div><span>Biggest saving</span><strong class="big lime">${H.money(best.s.amount, best.s.currency)}</strong></div>` : '',
    ].join('');
    return {
      title: `${v.label} parts and alternatives`,
      html: `<div class="wrap">${crumbs(H.breadcrumb(null, id))}
        <div class="phead"><div><h1 class="disp car-title">${esc(v.makeName)} <em class="hl">${esc(v.short)}</em></h1>
          ${(() => { const g = f ? [f.generation, f.platform].filter(Boolean) : null; const t = f ? (g.length ? esc(g.join('. ')) + '.' : '') : `The ${esc(v.label)} is in the vehicle list without example data yet. The full category tree below works for it, and any part number search shows the cars that share it.`; return t ? `<p class="lead">${t}</p>` : ''; })()}
          <div class="chips" style="margin-top:16px">${isCur ? `<span class="chip mine"><b>Your car</b></span>` : ''}
            ${variants.length > 1 ? `<a class="chip" href="${H.href.car(key)}"${!v.variant ? ' aria-current="page"' : ''}>All variants</a>${variants.map(x => `<a class="chip" href="${H.href.car(key + '/' + x.slug)}"${v.variant === x.slug ? ' aria-current="page"' : ''}>${esc(x.name)}${x.years.length === 1 ? ` <span class="small">${esc(x.years[0])}</span>` : ''}</a>`).join('')}` : ''}</div></div>
          <div class="phead-side"><span class="bignum">${parts.length}</span><span class="bignum-l">${parts.length === 1 ? 'part' : 'parts'} recorded for this car</span></div></div>
        ${f ? `<div class="spec">${specs}</div>` : ''}
        ${has3dOrPhoto ? `<div class="nav3d solo"><div class="nav3d-stage">${viewer({ mode: 'car', car: id })}</div></div>` : ''}
        ${shared.length ? `<p class="shared-note" style="margin-top:16px"><b>${plural(shared.length, 'part')}</b> below ${shared.length === 1 ? 'is' : 'are'} recorded on another car and fitted to the ${esc(v.short)} under the same OE number.</p>` : ''}
      </div>
      <section class="sec wrap" id="sec-parts"><div class="sec-head"><div><h2 class="h2">All ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}</h2></div></div>
        ${parts.length ? '<div data-listing></div>' : emptyState('No parts recorded for this car yet', `Know a part on the ${esc(v.label)} that is shared with a cheaper car? Send it in with a source and it goes into the box.`, `<a class="btn btn-lime" href="${H.href.submit({ car: id })}">Submit a find</a><a class="btn btn-ghost" href="${H.href.cat('service')}">Service parts on all cars</a>`)}
      </section>`,
      after(root) {
        const l = $('[data-listing]', root);
        if (l) window.Listing.mount({ kind: 'parts', items: parts, main: l, car: id, groupTop: true });
        // a numbered pin in the 3D opens that part
        const onPin = e => { const d = e.detail || {}; if (d.id && H.part(d.id)) location.hash = H.href.part(d.id, id); };
        window.addEventListener('hwbt2:pin', onPin);
        return () => window.removeEventListener('hwbt2:pin', onPin);
      },
    };
  };
  // List row <-> pin sync: hover a row, the viewer pulses that pin; click a pin, the row lights.
  // Hover lights the pin (no camera move); the viewer's pin hover/click lights the row.
  function pinWire(host) {
    let lit = null;
    const light = id => { if (id === lit) return; lit = id; emit('hwbt2:pin-light', { id }); };
    host.addEventListener('pointerover', e => { const a = e.target.closest('[data-pin-id]'); light(a ? a.dataset.pinId : null); });
    host.addEventListener('pointerleave', () => light(null));
    host.addEventListener('focusin', e => { const a = e.target.closest('[data-pin-id]'); if (a) light(a.dataset.pinId); });
    const mark = (id, scroll) => {
      $$('[data-pin-id]', host).forEach(a => a.classList.toggle('on', !!id && a.dataset.pinId === id));
      const a = id && $(`[data-pin-id="${CSS.escape(id)}"]`, host); if (a && scroll) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const onPin = e => mark((e.detail || {}).id, true);
    const onHover = e => mark((e.detail || {}).id, false);
    window.addEventListener('hwbt2:pin', onPin);
    window.addEventListener('hwbt2:pin-hover', onHover);
    return () => { window.removeEventListener('hwbt2:pin', onPin); window.removeEventListener('hwbt2:pin-hover', onHover); emit('hwbt2:pin-light', { id: null }); };
  }

  // ---------- CATEGORY ----------
  V.c = (r) => {
    const n = r.node;
    if (!n) return V.notfound(r, 'That category is not in the tree.');
    const badCar = r.car && !(r.vehicle && r.vehicle.key);
    const car = !badCar && r.vehicle ? r.vehicle.id : null;
    const v = car ? H.vehicle(car) : null;
    const svc = n.path === 'service';
    const list = svc ? H.serviceParts(car) : H.partsIn(n.path, car);
    const all = H.count(n.path);
    const mine = U.currentId();
    const kids = H.children(n.path);
    const parent = n.parent ? H.node(n.parent) : null;
    const desc = n.desc || (parent ? `Part of ${parent.name}${n.level === 3 ? ', ' + H.node(n.top).name : ''}.` : '');
    let scope;
    if (v) scope = `<span>Showing <b>${esc(v.label)}</b></span><span class="sp"></span><a class="tlink" href="${H.href.cat(n.path)}">All cars (${all})</a>${mine && mine !== car ? `<a class="tlink" href="${H.href.cat(n.path, mine)}">My ${esc(H.vehicle(mine).short)}</a>` : ''}`;
    else scope = `<span>Showing <b>all cars</b>${badCar ? ' (the car in the link is not on record)' : ''}</span><span class="sp"></span>${mine ? `<a class="tlink" href="${H.href.cat(n.path, mine)}">Only parts that fit your ${esc(H.vehicle(mine).short)} (${H.count(n.path, mine)})</a>` : `<button type="button" class="tlink" data-pick-car>Pick your car</button>`}`;
    let body;
    if (list.length) body = `<div data-main></div>`;
    else if (v) {
      const others = svc ? H.serviceParts() : H.partsIn(n.path);
      body = emptyState('No parts recorded for this car in this category yet', `Nothing in <b>${esc(n.name)}</b> is on record for the ${esc(v.label)} so far. ${all ? `${plural(all, 'part')} ${all === 1 ? 'is' : 'are'} recorded here on other cars.` : 'No car has a part here yet either.'}`,
        `<a class="btn btn-lime" href="${H.href.submit({ car, cat: svc ? '' : n.path })}">Submit a find</a>${all ? `<a class="btn btn-ghost" href="${H.href.cat(n.path)}">Browse this category for all cars (${all})</a>` : ''}`)
        + (others.length ? `<div class="h-row" style="margin-top:28px"><h2>Recorded on other cars<small>${others.length}</small></h2></div><div class="prows">${others.slice(0, 4).map(p => partRow(p)).join('')}</div>${others.length > 4 ? `<p style="margin-top:12px"><a class="tlink" href="${H.href.cat(n.path)}">See all ${others.length}</a></p>` : ''}` : '');
    } else body = emptyState('No parts recorded in this category yet', `No car has a part in <b>${esc(n.name)}</b> on record so far. The category is part of the tree so every car can use it once a find comes in.`, `<a class="btn btn-lime" href="${H.href.submit({ cat: n.path })}">Submit a find</a>${parent ? `<a class="btn btn-ghost" href="${H.href.cat(parent.path)}">Back to ${esc(parent.name)}</a>` : ''}`);
    const bc = H.breadcrumb(n.path, car);
    return {
      title: `${n.name}${v ? ' for the ' + v.label : ''}`,
      html: `<div class="wrap">${crumbs(bc)}
        <div class="cat-layout${list.length ? '' : ' solo'}">
          ${list.length ? '<aside class="cat-aside"><div class="lst-rail" data-frail aria-label="Filters"></div></aside>' : ''}
          <div>
            <div class="phead" style="padding-top:0"><div><h1 class="h1">${esc(n.name)}</h1>${desc ? `<p class="lead">${esc(desc)}</p>` : ''}</div>
</div>
            <div class="scope">${scope}</div>
            ${kids.length && !list.length ? `<div class="h-row"><h2>${n.level === 1 ? 'Subcategories' : 'Part types'}<small>${kids.length}</small></h2></div><div class="tiles sub" style="margin-bottom:28px">${kids.map(k => catTile(k, car, { sub: true })).join('')}</div>` : ''}
            ${body}
          </div></div></div>`,
      after(root) {
        if (list.length) window.Listing.mount({ kind: 'parts', items: list, rail: $('[data-frail]', root), main: $('[data-main]', root), car, catRoot: svc ? null : n.path });
        return null;
      },
    };
  };

  // ---------- PART (product page: pdp-research section 2) ----------
  V.part = (r) => {
    const p = r.part;
    if (!p) return V.notfound(r, 'That part is not on record.');
    const ctx = r.vehicle && r.vehicle.key ? r.vehicle : null;
    const home = H.vehicle(p.veh[0] + (p.variant ? '/' + p.variant : ''));
    const crumbCar = ctx && H.fitRole(p, ctx.id) ? ctx.id : home.id;
    const chain = H.chain(p);
    const rows = H.carsForPart(p);
    const my = U.currentId(), myV = my ? H.vehicle(my) : null, myRole = my ? H.fitRole(p, my) : null;
    // gallery: video frames, then donor-car photos of the same part, then the car itself (all real, all credited)
    const gal = [];
    for (const f of p.frames || []) gal.push({ src: f.src, alt: f.shows, cap: `Video still ${H.stamp(f.t)}, Mat Armstrong MK2` });
    for (const a of p.alts) if (a.type === 'same-oe-other-car' && U.donorImg(a.donor) && !gal.some(g => g.src === U.donorImg(a.donor))) gal.push({ src: U.donorImg(a.donor), alt: a.by, cap: `Same part on the ${a.by}` });
    const ci = carImg(p.veh[0]); if (ci) gal.push({ src: ci.src, alt: ci.label, cap: ci.label });
    // key specs: only rows with a value
    const specs = [
      ['Fits', p.veh.map(k => H.vehicle(k).label).join(', ')],
      ['Variant', p.variant ? home.variantName : null],
      ['Years', home.years],
      ['Category', U.catPath(p.cat)],
      ['Position', p.position.join(', ') || null],
      ['Qty per car', p.qty != null ? String(p.qty) : null],
      ['Service part', p.service ? 'Yes, changed at services' : null],
      ['Match', p.match || null],
      ['Supersedes', chain.length > 1 ? chain.slice(0, -1).join(', ') + ' (now ' + chain[chain.length - 1] + ')' : null],
    ].filter(x => x[1]);
    // buy box: only data-backed offers
    const offers = U.partListings(p);
    const priced = offers.filter(o => o.price);
    const bestOffer = priced.filter(o => o.saving).sort((a, b) => b.saving.amount - a.saving.amount)[0] || priced.find(o => o.type !== 'oe') || null;
    const shownOffers = offers.slice(0, 6), moreOffers = offers.slice(6);
    const bestLine = bestOffer ? `From <b>${H.money(bestOffer.price)}</b>${bestOffer.condition ? ' ' + bestOffer.condition.toLowerCase() : ''}${p.price && bestOffer.type !== 'oe' ? `<span>Genuine ${H.money(p.price)}</span>` : ''}` : p.price ? `Genuine <b>${H.money(p.price)}</b><span>No cheaper price on record yet</span>` : `<span>No price on record yet. The store searches below open live results.</span>`;
    const frames = p.frames || [];
    const wf = p.quote ? (frames.slice().sort((a, b) => Math.abs(a.t - p.quote.timestamp_s) - Math.abs(b.t - p.quote.timestamp_s))[0] || null) : frames[0] || null;
    const wt = p.quote ? p.quote.timestamp_s : p.video ? p.video.timestamp_s : null;
    const fitHtml = !myV ? `<div class="fitcheck"><span>Check it fits your car.</span><button type="button" class="btn btn-sec btn-sm" data-pick-car>Pick your car</button></div>`
      : myRole ? `<div class="fitcheck ok">${I.check}<span>Fits your <b>${esc(myV.label)}</b>${myV.years ? ` (${esc(myV.years)})` : ''}${myRole === 'shared' ? `, the same OE part as the ${esc(home.label)}` : ''}.</span><button type="button" class="tlink" data-pick-car>Change</button></div>`
      : `<div class="fitcheck no"><span>Not recorded for your <b>${esc(myV.label)}</b>. See the fitment table below.</span><button type="button" class="tlink" data-pick-car>Change</button></div>`;
    return {
      title: `${p.name}, ${home.label}`,
      html: `<div class="wrap">${crumbs(H.breadcrumb(p.cat, crumbCar))}
      <div class="pdp">
        <div class="pdp-top">
          <div class="gallery" data-gallery>
            <figure class="gal-main">${U.img(gal[0].src, gal[0].alt, 800, 600, { hero: true, attrs: ' data-gal-img' })}<figcaption data-gal-cap>${esc(gal[0].cap)}</figcaption></figure>
            ${gal.length > 1 ? `<div class="gal-thumbs" role="group" aria-label="Pictures">${gal.map((g, i) => `<button type="button" data-gal="${i}" aria-pressed="${i === 0}" aria-label="${esc(g.cap)}">${U.img(g.src, '', 144, 108)}</button>`).join('')}</div>` : ''}
          </div>
          <div class="pdp-info">
            <h1 class="h1 pdp-title">${esc(p.name)}</h1>
            <p class="pdp-num">${p.oe ? `OE ${pnLink(p.oe.number)} <span class="muted">also written ${esc(p.oe.forms.filter(f => f !== p.oe.number).join(', '))}</span>` : '<span class="muted">No OE number on record yet</span>'}</p>
            <div class="pdp-badges">${U.evTag(p.evidence)}</div>
            ${fitHtml}
            ${specs.length ? `<dl class="kv">${specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          </div>
        </div>
        <aside class="pdp-buy" id="buy" aria-label="Buy this part"><div class="buybox">
          <div class="buy-head"><h2>Buy this part</h2>${U.saveBtn(p.id)}</div>
          <p class="buy-best">${bestLine}</p>
          <div class="lcards">${shownOffers.map(U.listingCard).join('')}${moreOffers.length ? `<details class="more-offers"><summary>${plural(moreOffers.length, 'more offer')}</summary>${moreOffers.map(U.listingCard).join('')}</details>` : ''}
</div>
          <p class="disclosure">${esc(H.AMAZON_DISCLOSURE)} Prices are as quoted by each source, never converted. Check the part number before you buy.</p>
        </div></aside>
        <div class="pdp-rest">
          <section class="pdp-sec"><h2 class="h2">Fitment</h2>
            <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Car</th><th>Years</th><th>How it fits</th><th>Number</th></tr></thead><tbody>
            ${rows.map((x, i) => { const vx = x.key ? H.vehicle(x.key) : null; const num = x.role === 'oe' ? (p.oe ? pnLink(p.oe.number) : '') : x.number ? pnLink(x.number.split(/\s*\/\s*/)[0]) : '';
              return `<tr${i >= 5 ? ' hidden data-more-row' : ''}><td>${vx ? `<a href="${H.href.car(x.key)}">${esc(x.name)}</a>` : esc(x.name)}${x.chassis ? ` <span class="muted">${esc(x.chassis)}</span>` : ''}</td><td>${esc(x.years || '')}</td><td>${x.role === 'oe' ? `Recorded part${x.position ? ', ' + esc(x.position) : ''}` : 'Same OE part'}</td><td>${num}</td></tr>`; }).join('')}
            </tbody></table></div>${rows.length > 5 ? `<button type="button" class="tlink" data-more-rows style="margin-top:12px">Show all ${rows.length} cars</button>` : ''}
          </section>
          <details class="disc" data-where><summary><span class="disc-t">Where it sits on the car</span><span class="disc-s">${esc(p.location || (H.zone(p.zone) || {}).label || '')}</span></summary><div class="disc-b" data-where-body></div></details>
          ${p.quote || wf ? `<section class="pdp-sec"><h2 class="h2">From the workshop</h2><div class="workshop">
            ${wf ? `<a class="frame" href="${esc(H.videoUrl(p.video, wf.t) || '#')}" target="_blank" rel="noopener"><b>${H.stamp(wf.t)}</b>${U.img(wf.src, wf.shows, 640, 360)}</a>` : ''}
            <div>${p.quote ? `<blockquote class="q">"${esc(p.quote.text)}"</blockquote>` : ''}<p class="muted">${esc(p.video ? p.video.title : '')}</p>${p.video && wt != null ? `<a class="btn btn-sec btn-sm" href="${esc(H.videoUrl(p.video, wt))}" target="_blank" rel="noopener">Watch at ${H.stamp(wt)} ${I.ext}</a>` : ''}</div></div></section>` : ''}
          <details class="disc"><summary><span class="disc-t">Sources</span><span class="disc-s">${plural(p.sources.length, 'source')}</span></summary><div class="disc-b"><ol class="srcs">${p.sources.map(x => `<li>${ext(x.url, x.title)}</li>`).join('')}</ol></div></details>
          ${p.fitment || p.notes || p.priceNotes ? `<details class="disc"><summary><span class="disc-t">Notes</span><span class="disc-s">Fitting and prices</span></summary><div class="disc-b notes">${p.fitment ? `<p><b>Fitting.</b> ${esc(p.fitment)}</p>` : ''}${p.notes ? `<p><b>Research notes.</b> ${esc(p.notes)}</p>` : ''}${p.priceNotes ? `<p><b>Prices.</b> ${esc(p.priceNotes)}</p>` : ''}</div></details>` : ''}
        </div>
      </div></div>
      <div class="pdp-bar"><span>${bestOffer ? `From <b>${H.money(bestOffer.price)}</b>` : p.price ? `Genuine <b>${H.money(p.price)}</b>` : 'Offers and store searches'}</span><button type="button" class="btn btn-lime btn-sm" data-scroll="buy">See offers</button>${U.saveBtn(p.id)}</div>`,
      after(root) {
        const gi = $('[data-gal-img]', root), gc = $('[data-gal-cap]', root);
        root.addEventListener('click', e => {
          const g = e.target.closest('[data-gal]');
          if (g) { const x = gal[+g.dataset.gal]; gi.src = x.src; gi.alt = x.alt; gc.textContent = x.cap; $$('[data-gal]', root).forEach(b => b.setAttribute('aria-pressed', b === g ? 'true' : 'false')); return; }
          if (e.target.closest('[data-more-rows]')) { $$('[data-more-row]', root).forEach(tr => { tr.hidden = false; }); e.target.closest('[data-more-rows]').remove(); return; }
          const sc = e.target.closest('[data-scroll]'); if (sc) { const el = document.getElementById(sc.dataset.scroll); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
        // the buy box stays sticky only while it fits the viewport; taller, it scrolls with the page
        const buy = $('#buy', root), bx = buy.firstElementChild;
        const fit = () => { const top = parseFloat(getComputedStyle(buy).top) || 0; buy.classList.toggle('unstick', bx.scrollHeight + top + 16 > window.innerHeight); };
        fit(); window.addEventListener('resize', fit); bx.addEventListener('toggle', fit, true);
        // "Where it sits": the 3D loads only when opened
        const det = $('[data-where]', root), body = $('[data-where-body]', root);
        let off = null;
        det.addEventListener('toggle', () => {
          if (det.open) {
            const pins = H.pins(p.zone, p.veh[0]);
            body.innerHTML = `<div class="where"><div class="nav3d-stage">${viewer({ mode: 'part', car: p.veh[0], zone: p.zone, part: p.id })}</div><div id="pins"><ol class="pins">${pins.map(x => `<li><a href="${H.href.part(x.part.id)}" data-pin-id="${esc(x.part.id)}" class="${x.part.id === p.id ? 'cur' : ''}"${x.part.id === p.id ? ' aria-current="page"' : ''}><b>${x.n}</b><span><strong>${esc(x.part.name)}</strong><small>${H.fitRole(x.part, p.veh[0]) === 'shared' ? 'Also fits this car, ' : ''}${esc(U.catPath(x.part.cat))}</small></span></a></li>`).join('')}</ol></div></div>`;
            U.mountAll(body); off = pinWire($('#pins', body));
          } else { if (off) off(); off = null; U.unmountAll(body); body.innerHTML = ''; }
        });
        return () => { window.removeEventListener('resize', fit); if (off) off(); U.unmountAll(body); };
      },
    };
  };

  // ---------- NUMBER ----------
  V.pn = (r) => {
    const q = r.number;
    const form = (val) => `<form class="bigsearch" data-pnform><input name="pn" value="${esc(val || '')}" placeholder="Any OE, supplier or donor number" aria-label="Part number" autocomplete="off" spellcheck="false" class="mono"><button class="btn btn-lime" type="submit">Look up</button></form>`;
    const bc = [{ label: 'Parts', href: '#/' }, { label: 'Part numbers', href: '#/pn' }];
    if (!q) {
      return { title: 'Part number lookup', html: `<div class="wrap">${crumbs(bc)}<div class="phead"><div><h1 class="h1">Got a part number? Find every car that uses it.</h1><p class="lead">OE, supplier or donor numbers. Spaces, dots, dashes and case do not matter.</p>${form('')}</div></div>
        <div class="h-row"><h2>Numbers shared by the most makes</h2></div><div class="slist">${pnExamples().map(e => `<a href="${H.href.pn(e.norm)}"><span><span class="mono">${esc(e.number)}</span> <span class="muted">${esc(e.name)}</span></span><small>${plural(e.makers, 'make')}, ${plural(e.cars, 'car')}</small></a>`).join('')}</div></div>` };
    }
    const d = H.pn(q);
    bc.push({ label: q, href: H.href.pn(q) });
    if (!d) {
      const near = H.search(q, { limit: 6 }).numbers;
      return { title: `${q}: not on record`, html: `<div class="wrap">${crumbs(bc)}<div class="phead"><div><h1 class="h1 mono">${esc(q)}</h1>${form(q)}</div></div>
        ${emptyState('No car on record uses this number yet', `We searched every OE, superseded, supplier and donor number on file. ${near.length ? 'Close matches are listed below.' : 'Nothing close either.'}`, `<a class="btn btn-lime" href="${H.href.submit({ pn: q })}">Submit this number</a><button type="button" class="btn btn-ghost" data-open-search>Search by name</button>`)}
        ${near.length ? `<div class="h-row" style="margin-top:24px"><h2>Close matches</h2></div><div class="slist">${near.map(h => `<a href="${H.href.pn(h.norm)}"><span class="mono">${esc(h.number)}</span><small>${esc(h.name)}</small></a>`).join('')}</div>` : ''}</div>` };
    }
    const oeBrands = [...new Set(d.parts.flatMap(r => r.part.alts).filter(a => a.type === 'oe-equivalent').map(a => a.by).filter(Boolean))];
    const cars = d.cars.flatMap(m => m.cars);
    const hasPrice = d.priceRange.length;
    return {
      title: `${d.number}: every car that uses it`,
      html: `<div class="wrap">${crumbs(bc)}
        <div class="phead"><div><h1 class="h1"><span class="mono hl-num" style="font-style:normal">${esc(d.forms[1] || d.number)}</span></h1><p class="lead" style="font-size:18px;color:var(--tx)">${esc(d.name)}</p>
          <p class="lead">Also written as ${d.forms.map(f => `<code class="mono">${esc(f)}</code>`).join(', ')}.${d.superseded ? ` Superseded: the current number is ${pnLink(d.current)}.` : ''}</p></div>
          <div class="phead-side"><span class="bignum">${cars.length}</span><span class="bignum-l">${cars.length === 1 ? 'car uses' : 'cars use'} it</span></div></div>
        <div class="tbl-wrap" style="max-width:980px"><table class="tbl sum"><tbody>
          <tr><th>Price range</th><td>${hasPrice ? d.priceRange.map(x => x.min === x.max ? `<b>${H.money(x.min, x.currency)}</b>` : `<b>${H.money(x.min, x.currency)}</b> to <b>${H.money(x.max, x.currency)}</b>`).join('; ') + ` <span class="small">(${plural(d.cheapest.length, 'priced offer')}, never converted)</span>` : 'No prices on record'}</td></tr>
          <tr><th>Car makers</th><td>${esc(d.makers.join(', '))}</td></tr>
          <tr><th>OE brands</th><td>${oeBrands.length ? esc(oeBrands.join(', ')) : 'None recorded'}</td></tr>
          <tr><th>Equivalent numbers</th><td>${d.equivalents.length ? d.equivalents.map(e => `${pnLink(e.number)} <span class="small">${esc(e.by)}</span>`).join(', ') : 'None recorded'}</td></tr>
          <tr><th>Supersession</th><td>${d.chain.length > 1 ? d.chain.map(x => pnLink(x)).join(' to ') : 'No older numbers recorded'}</td></tr>
        </tbody></table></div>

        <section class="psec"><h2 class="h2">Every car that uses it</h2>
          <div class="facets" role="group" aria-label="Filter by make"><button type="button" class="chip on" data-facet="">All makes (${cars.length})</button>${d.cars.map(m => `<button type="button" class="chip" data-facet="${esc(m.make)}">${esc(m.makeName)} (${m.cars.length})</button>`).join('')}</div>
          <div class="carsby">${d.cars.map(m => `<div data-make="${esc(m.make)}"><h3>${esc(m.makeName)} <small>${plural(m.cars.length, 'car')}</small></h3><div class="carcards">${m.cars.map(c => { const im = c.image || (carImg(c.key) || {}).src; const vx = H.vehicle(c.key);
            return `<${vx ? `a href="${H.href.car(c.key)}"` : 'div'} class="carcard">${im ? U.img(im, '', 144, 96) : ''}<span><b>${esc(c.name)}</b><small class="${c.role === 'example' ? 'sup' : ''}">${c.role === 'example' ? 'Recorded part' : 'Donor car, same OE part'}</small></span>${vx ? U.go() : ''}</${vx ? 'a' : 'div'}>`; }).join('')}</div></div>`).join('')}</div>
        </section>

        <section class="psec"><h2 class="h2">Cheaper sources</h2>
          ${d.cheapest.length ? '<div data-listing></div>' : emptyState('No priced offer on record yet', 'Nothing with a price is recorded for this number so far.', `<a class="btn btn-lime" href="${H.href.submit({ pn: d.number })}">Submit a price</a>`)}
        </section>

        <section class="psec"><h2 class="h2">Parts with this number</h2><p class="lead">${plural(d.parts.length, 'part page')}.</p><div class="prows">${d.parts.map(x => partRow(x.part)).join('')}</div></section>
      </div>`,
      after(root) {
        const l = $('[data-listing]', root); if (l) window.Listing.mount({ kind: 'offers', items: d.cheapest, main: l });
        const f = $('.facets', root);
        f.addEventListener('click', e => {
          const b = e.target.closest('[data-facet]'); if (!b) return;
          $$('[data-facet]', f).forEach(x => x.classList.toggle('on', x === b));
          $$('.carsby > [data-make]', root).forEach(g => { g.hidden = !!b.dataset.facet && g.dataset.make !== b.dataset.facet; });
        });
        return null;
      },
    };
  };

  // ---------- MAKES ----------
  V.makes = () => {
    const makes = H.makes();
    const letters = [...new Set(makes.map(m => m.name[0].toUpperCase()))];
    const show = H.showcase().filter(Boolean);
    return {
      title: 'All makes A-Z',
      html: `<div class="wrap">${crumbs([{ label: 'Parts', href: '#/' }, { label: 'Makes A-Z', href: '#/makes' }])}
        <div class="phead"><div><h1 class="h1">Every make, A-Z</h1><p class="lead">${makes.length} makes.</p></div></div>
        <div class="h-row"><h2>Cars with 3D and parts<small>${show.length}</small></h2></div>
        <div class="cgrid six" style="margin-bottom:32px">${show.map(v => U.carCard(v.key, { href: H.href.make(v.make), meta: plural(H.models(v.make).filter(m => !m.alias).length, 'model') })).join('')}</div>
        <div class="az-index">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => letters.includes(l) ? `<a href="#az-${l}" data-jump="az-${l}">${l}</a>` : `<span>${l}</span>`).join('')}</div>
        ${letters.map(l => `<div class="az-group" id="az-${l}"><h2>${l}</h2><div class="az-grid">${makes.filter(m => m.name[0].toUpperCase() === l).map(m => `<a href="${H.href.make(m.slug)}" class="${m.example ? 'ex' : ''}"><span>${esc(m.name)}</span><small>${m.example ? 'Example, ' : ''}${plural(m.models, 'model')}</small></a>`).join('')}</div></div>`).join('')}
      </div>`,
    };
  };
  V.make = (r) => {
    const m = H.make(r.make);
    if (!m) return V.notfound(r, 'That make is not in the vehicle list.');
    const fams = Object.values(H.veh.families).filter(f => f.make === m.slug);
    const models = m.models.filter(x => !x.alias);
    const letters = [...new Set(models.map(x => x.name[0].toUpperCase()))];
    return {
      title: `${m.name} parts by model`,
      html: `<div class="wrap">${crumbs([{ label: 'Parts', href: '#/' }, { label: 'Makes A-Z', href: '#/makes' }, { label: m.name, href: H.href.make(m.slug) }])}
        <div class="phead"><div><h1 class="h1">${esc(m.name)}</h1><p class="lead">${plural(models.length, 'model')} on record.</p></div></div>
        ${fams.length ? `<div class="cgrid" style="margin-bottom:36px">${fams.map(f => U.carCard(f.key, { title: f.name, make: f.makeName, name: f.name, meta1: `${f.years || ''}${f.chassis ? ', ' + f.chassis : ''}`, meta: `<b>${plural(H.partsForCar(f.key).length, 'part')}</b>, ${plural(f.variants.length, 'variant')}` })).join('')}</div>` : ''}
        <div class="h-row"><h2>All ${esc(m.name)} models<small>${models.length}</small></h2></div>
        ${letters.map(l => `<div class="az-group"><h2>${l}</h2><div class="az-grid">${models.filter(x => x.name[0].toUpperCase() === l).map(x => `<a href="${H.href.car(m.slug + '/' + x.slug)}" class="${x.example ? 'ex' : ''}"><span>${esc(x.name)}</span><small>${x.example ? plural(H.partsForCar(m.slug + '/' + x.slug).length, 'part') : x.chassis || 'Tree'}</small></a>`).join('')}</div></div>`).join('')}
      </div>`,
    };
  };

  // ---------- SEARCH ----------
  V.search = (r) => {
    const q = r.q || '';
    const car = r.car && H.vehicle(r.car) ? H.vehicle(r.car).id : null;
    const res = q ? H.search(q, { limit: Infinity, car }) : null;
    const total = res ? Object.values(res.total).reduce((a, b) => a + b, 0) : 0;
    const head = `<div class="phead"><div><h1 class="h1">${q ? `Results for "${esc(q)}"` : 'Search'}</h1><p class="lead">${q ? `${plural(total, 'result')}${car ? `, parts for your ${esc(H.vehicle(car).label)} first` : ''}.` : 'Part name, part number, car or category.'}</p>
      <form class="bigsearch" data-searchform><input name="q" value="${esc(q)}" placeholder="Part name, part number or car" aria-label="Search" autocomplete="off" spellcheck="false"><button class="btn btn-lime" type="submit">Search</button></form></div></div>`;
    let body = '';
    if (res && !total) body = emptyState(`Nothing on record for "${q}" yet`, 'Try fewer words, a different spelling or the number printed on the part.', `<a class="btn btn-lime" href="${H.href.submit(H.isPN(q) ? { pn: q } : { part: q })}">Submit a find</a><a class="btn btn-ghost" href="#/makes">Browse every make</a>`);
    else if (res) {
      body = [
        res.numbers.length ? `<div class="sgroup"><div class="h-row"><h2>Part numbers<small>${res.numbers.length}</small></h2></div><div class="slist">${res.numbers.slice(0, 30).map(h => `<a href="${H.href.pn(h.norm)}"><span><span class="mono">${esc(h.number)}</span> <span class="muted">${esc(h.name)}</span></span><small>${h.exact ? 'Exact match' : ''}</small></a>`).join('')}</div></div>` : '',
        res.parts.length ? `<div class="sgroup"><div class="h-row"><h2>Parts<small>${res.parts.length}</small></h2></div><div data-listing></div></div>` : '',
        res.cars.length ? `<div class="sgroup"><div class="h-row"><h2>Cars<small>${res.cars.length}</small></h2></div><div class="slist">${res.cars.slice(0, 60).map(c => `<a href="${c.href}"><span>${esc(c.label)}</span><small>${c.kind === 'make' ? 'Make' : c.example ? plural(H.partsForCar(c.id).length, 'part') : 'Category tree'}</small></a>`).join('')}</div></div>` : '',
        res.categories.length ? `<div class="sgroup"><div class="h-row"><h2>Categories<small>${res.categories.length}</small></h2></div><div class="slist">${res.categories.map(c => `<a href="${H.href.cat(c.path, car)}"><span>${esc(c.name)}${c.parentName ? ` <span class="muted">in ${esc(c.parentName)}</span>` : ''}</span><small>${plural(c.count, 'part')}</small></a>`).join('')}</div></div>` : '',
      ].join('');
    }
    return { title: q ? `Search: ${q}` : 'Search', html: `<div class="wrap">${crumbs([{ label: 'Parts', href: '#/' }, { label: 'Search', href: H.href.search(q, car) }])}${head}${body}</div>`,
      after(root) { const l = $('[data-listing]', root); if (l) window.Listing.mount({ kind: 'parts', items: res.parts, main: l, car: null }); return null; } };
  };

  // ---------- RESEARCH BOX ----------
  V.box = () => {
    const ps = H.box.parts();
    const t = H.box.totals();
    const tiles = t.byCurrency.map(c => `<div><span>Genuine, ${c.currency}</span><strong>${H.money(c.oe, c.currency)}</strong><small>${plural(c.counted, 'part')} with both prices</small></div>
      <div><span>Cheapest alternatives, ${c.currency}</span><strong>${H.money(c.alt, c.currency)}</strong><small>Same currency only</small></div>
      <div><span>Saving, ${c.currency}</span><strong class="lime">${H.money(c.saving, c.currency)}</strong><small>${c.oe ? Math.round(c.saving / c.oe * 100) + '% of genuine' : ''}</small></div>`).join('');
    const counted = t.byCurrency.reduce((s, c) => s + c.counted, 0);
    return {
      title: 'Research box',
      html: `<div class="wrap">${crumbs([{ label: 'Parts', href: '#/' }, { label: 'Research box', href: '#/box' }])}
        <div class="phead"><div><h1 class="h1">Research box</h1><p class="lead">Parts you saved on this device. Totals add up only parts where the genuine price and an alternative price are both known in the same currency.</p></div>
          <div class="phead-side"><span class="bignum">${t.count}</span><span class="bignum-l">saved ${t.count === 1 ? 'part' : 'parts'}</span></div></div>
        ${ps.length ? `<div class="totals" data-totals>${tiles || `<div><span>Totals</span><strong>None yet</strong><small>No saved part has both prices in one currency.</small></div>`}</div>
          ${t.count > counted ? `<p class="small" style="margin:-6px 0 18px">${plural(t.count - counted, 'saved part')} left out of the totals: a price is missing or the currencies differ.</p>` : ''}
          <div class="h-row"><h2>Saved parts<small>${ps.length}</small></h2><button type="button" class="btn btn-ghost btn-sm" data-clear-box>Empty the box</button></div>
          <div class="prows">${ps.map(p => partRow(p)).join('')}</div>`
        : emptyState('Your research box is empty', 'Press the bookmark on any part to keep it here. The box adds up genuine prices against the cheapest alternatives.', `<a class="btn btn-lime" href="${H.href.cat('service', U.currentId())}">Start with service parts</a><a class="btn btn-ghost" href="#/">Back to the start</a>`)}
      </div>`,
    };
  };

  // ---------- SUBMIT ----------
  V.submit = (r) => {
    const p = r.params || {};
    const carId = p.car && H.vehicle(p.car) ? H.vehicle(p.car).id : U.currentId();
    const part = p.part && H.part(p.part);
    const opts = U.TOPS.map(t => `<option value="${t.path}"${p.cat === t.path ? ' selected' : ''}>${esc(t.name)}</option>${H.children(t.path).map(s => `<option value="${s.path}"${p.cat === s.path ? ' selected' : ''}>&nbsp;&nbsp;${esc(s.name)}</option>`).join('')}`).join('');
    const subs = H.submissions.list();
    const sent = sessionFlag;
    sessionFlag = false;
    return {
      title: 'Submit a find',
      html: `<div class="wrap">${crumbs([{ label: 'Parts', href: '#/' }, { label: 'Submit a find', href: '#/submit' }])}
        <div class="phead"><div><h1 class="h1">Submit a find</h1><p class="lead">Spotted a part shared with a cheaper car, a supplier box or a better version? Send the numbers and a source. Finds are checked before they go live.</p></div></div>
        ${sent ? `<div class="ok"><b>Thanks, your find is saved.</b> In this demo it stays on this device; nothing is sent anywhere.</div>` : ''}
        <form class="form" data-submitform>
          <div class="field"><label for="f-car">Car</label><input id="f-car" name="car" value="${esc(carId ? H.vehicle(carId).label : '')}" placeholder="Make, model, variant" required></div>
          <div class="field"><label for="f-cat">Category</label><select id="f-cat" name="cat"><option value="">Not sure</option>${opts}</select></div>
          <div class="field"><label for="f-part">Part</label><input id="f-part" name="part" value="${esc(part ? part.name : (p.part || ''))}" placeholder="What it is, in workshop words" required></div>
          <div class="field"><label for="f-pn">OE number <small>(optional)</small></label><input id="f-pn" name="pn" class="mono" value="${esc(p.pn || (part && part.oe ? part.oe.number : ''))}" placeholder="As printed on the part"></div>
          <div class="field"><label for="f-alt">The alternative</label><input id="f-alt" name="alt" placeholder="Donor car, brand or upgrade, with its number"></div>
          <div class="field"><label for="f-price">Prices you saw <small>(optional)</small></label><input id="f-price" name="price" placeholder="Genuine and alternative, with currency"></div>
          <div class="field full"><label for="f-src">Source link</label><input id="f-src" name="src" type="url" placeholder="Video with timestamp, catalogue page, invoice" required></div>
          <div class="field full"><label for="f-notes">Notes <small>(optional)</small></label><textarea id="f-notes" name="notes" placeholder="Fitting caveats: connector, bracket, length"></textarea></div>
          <div class="acts"><button class="btn btn-lime" type="submit">Save my find</button><span class="small">Demo only: finds stay in this browser.</span></div>
        </form>
        ${subs.length ? `<section class="psec"><h2 class="h2">Your finds on this device</h2><p class="lead">${plural(subs.length, 'find')}.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Car</th><th>Part</th><th>Number</th><th>Alternative</th><th>Saved</th></tr></thead><tbody>
          ${subs.map(s => `<tr><td><b>${esc(s.car)}</b></td><td>${esc(s.part)}</td><td>${s.pn ? `<span class="mono">${esc(s.pn)}</span>` : ''}</td><td>${esc(s.alt || '')}</td><td>${esc(new Date(s.at).toLocaleDateString('en-GB'))}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      </div>`,
    };
  };
  let sessionFlag = false;
  V.markSent = () => { sessionFlag = true; };

  V.notfound = (r, msg) => ({
    title: 'Not found',
    html: `<div class="wrap">${crumbs([{ label: 'Parts', href: '#/' }])}<div class="phead"><div><h1 class="h1">Nothing here</h1><p class="lead">${esc(msg || 'That address is not part of the site.')}</p></div></div>
      ${emptyState('Try one of the ways in', 'Pick a car, browse the categories or look up a number.', `<a class="btn btn-lime" href="#/">Start</a><a class="btn btn-ghost" href="#/makes">Makes A-Z</a><a class="btn btn-ghost" href="#/pn">Part numbers</a>`)}</div>`,
  });

  window.VIEWS = V;
})();
