// HWBT Research Box v2: router and global wiring. Views live in views.js, components in ui.js.
(function () {
  const U = window.UI, H = U.H, V = window.VIEWS, $ = U.$, $$ = U.$$;
  const app = $('#app');
  let cleanup = null, lastKey = '', lastBase = '';

  function render(force) {
    const r = H.route();
    const key = r.name + '/' + r.args.join('/');
    // a filter, sort or view change only redraws the listing (no remount, no scroll jump)
    const base = key + '?' + Object.entries(r.params).filter(([k]) => !k.startsWith('f_')).map(kv => kv.join('=')).join('&');
    U.closeCombos();
    if (!force && base === lastBase && window.Listing.current) { U.closeSheet(); window.Listing.current.apply(); return; }
    lastBase = base;
    window.Listing.reset();
    U.closeSheet(); U.soClose(); U.closeGarage(); closeMenus();
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { /* ignore */ } }
    cleanup = null;
    U.unmountAll(app);
    U.renderVbar();
    const view = (V[r.name] || V.notfound)(r);
    app.innerHTML = `<div class="view" data-route="${r.name}">${view.html}</div>`;
    document.title = view.title + ' | HWBT Research Box';
    if (view.after) cleanup = view.after(app);
    U.mountAll(app);
    const nc = $('.nav-cats'); if (nc) nc.classList.toggle('is-cur', r.name === 'c');
    $$('.nav a[data-nav]').forEach(a => { if (a.dataset.nav === r.name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    // accent demo (balanced, bold): a scrolling crumb trail on phones opens at the current page
    if (document.documentElement.dataset.accent !== 'quiet') { const cr = $('.crumbs', app); if (cr && cr.scrollWidth > cr.clientWidth) cr.scrollLeft = cr.scrollWidth; }
    if (key !== lastKey) window.scrollTo(0, 0);
    lastKey = key;
  }

  // ---------- header, menus ----------
  // Demo only: accent strength switch in the demo strip. All styling lives in app.css under html[data-accent].
  function renderAccent() { const a = document.documentElement.dataset.accent || 'full'; $$('[data-accent-set]').forEach(b => b.setAttribute('aria-pressed', b.dataset.accentSet === a ? 'true' : 'false')); }
  function setAccent(a) {
    if (!['quiet', 'balanced', 'full'].includes(a)) return;
    document.documentElement.dataset.accent = a;
    try { localStorage.setItem('hwbt2-accent2', a); } catch (e) { /* storage blocked: the choice lasts this visit */ }
    renderAccent();
    for (const el of $$('[data-v3d]')) el.setAttribute('data-mode', el.getAttribute('data-mode') || 'car'); // viewer re-reads its colours
  }
  renderAccent();

  function closeMenus() {
    const mega = $('#mega'), btn = $('.nav-cats');
    if (!mega.hidden) { mega.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    const mn = $('#mnav'), mb = $('.menu-btn');
    if (!mn.hidden) { mn.hidden = true; mb.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; }
    $$('.garage-pop').forEach(p => p.remove());
  }
  function refreshChrome() { U.renderHeaderCar(); U.renderMega(); U.renderMnav(); U.renderFoot(); }
  function syncBox() {
    const n = H.box.ids().length;
    const c = $('.boxcount'); c.textContent = n; c.dataset.n = n;
    const bl = $('.hicons a[data-nav="box"]'); if (bl) { bl.classList.toggle('has', n > 0); bl.setAttribute('aria-label', n ? `Saved parts: ${n}` : 'Saved parts'); }
    $$('[data-save]').forEach(b => {
      const on = H.box.has(b.dataset.save);
      b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', (on ? 'Remove from' : 'Save to') + ' research box');
      const s = b.querySelector('span'); if (s) s.textContent = on ? 'Saved' : 'Save';
    });
  }

  document.addEventListener('click', e => {
    const t = e.target;
    const save = t.closest('[data-save]');
    if (save) { e.preventDefault(); const on = H.box.toggle(save.dataset.save); U.toast(on ? 'Saved to your research box' : 'Removed from your research box'); return; }
    if (t.closest('[data-open-search]')) { e.preventDefault(); U.soOpen(''); return; }
    if (t.closest('[data-pick-car]')) { e.preventDefault(); closeMenus(); U.closeSheet(); U.openGarage(document.getElementById('hcar')); return; }
    if (t.closest('[data-account]')) { e.preventDefault(); closeMenus(); U.openAccount(); return; }
    if (t.closest('[data-theme-toggle]')) { U.setTheme(U.theme() === 'dark' ? 'light' : 'dark'); return; }
    const acc = t.closest('[data-accent-set]'); if (acc) { setAccent(acc.dataset.accentSet); return; }
    const g = t.closest('[data-garage]'); if (g) { e.preventDefault(); closeMenus(); U.openGarage(g); return; }
    if (t.closest('[data-clear-car]')) { U.closeGarage(); U.closeSheet(); H.garage.clearCurrent(); U.toast('Car cleared. Categories now show all cars.'); return; }
    const rm = t.closest('[data-remove-car]'); if (rm) { U.closeGarage(); U.closeSheet(); H.garage.remove(rm.dataset.removeCar); U.toast('Removed from your garage'); return; }
    const sw = t.closest('[data-switch]'); if (sw) { U.closeGarage(); U.closeSheet(); H.garage.setCurrent(sw.dataset.switch); closeMenus(); return; }
    const sc = t.closest('[data-set-car]'); if (sc) { H.garage.setCurrent(sc.dataset.setCar); U.toast('Saved as your car'); return; }
    if (t.closest('[data-close-sheet]') || t.id === 'scrim') { U.closeSheet(); return; }
    if (t.closest('[data-clear-box]')) { H.box.clear(); return; }
    const fill = t.closest('[data-fill]'); if (fill) { const f = fill.closest('.finder, .wrap').querySelector('[data-pnform] input'); if (f) { f.value = fill.dataset.fill; f.form.requestSubmit(); } return; }
    const rail = t.closest('[data-rail]'); if (rail) { const r = rail.closest('section').querySelector('.rail'); r.scrollBy({ left: +rail.dataset.rail * r.clientWidth * 0.8, behavior: 'smooth' }); return; }
    const jump = t.closest('[data-jump]'); if (jump) { e.preventDefault(); const el = document.getElementById(jump.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth' }); return; }
    const az = t.closest('[data-az]'); if (az) { e.preventDefault(); location.hash = '#/makes'; setTimeout(() => { const el = document.getElementById('az-' + az.dataset.az); if (el) el.scrollIntoView(); }, 30); return; }
    const cats = t.closest('.nav-cats');
    if (cats) { const m = $('#mega'); const open = m.hidden; closeMenus(); if (open) { U.renderMega(); m.hidden = false; cats.setAttribute('aria-expanded', 'true'); } return; }
    const mb = t.closest('.menu-btn');
    if (mb) { const m = $('#mnav'); const open = m.hidden; closeMenus(); if (open) { U.renderMnav(); m.hidden = false; mb.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; } return; }
    if (!$('#mega').hidden && !t.closest('#mega')) closeMenus();
  });

  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.matches('[data-acctform]')) { e.preventDefault(); const i = f.email; if (!i.value.trim() || !i.checkValidity()) { i.setAttribute('aria-invalid', 'true'); i.focus(); return; } i.removeAttribute('aria-invalid'); const m = f.querySelector('.acct-msg'); m.hidden = false; return; }
    if (f.matches('[data-pnform]')) { e.preventDefault(); const v = f.pn.value.trim(); if (!v) return f.pn.focus(); U.remember(v); location.hash = H.pn(v) || H.isPN(v) ? H.href.pn(v) : H.href.search(v); return; }
    if (f.matches('[data-searchform]')) { e.preventDefault(); const v = f.q.value.trim(); if (!v) return f.q.focus(); U.remember(v); if (H.isPN(v) && H.pn(v)) { location.hash = H.href.pn(v); return; } const car = H.route().car; location.hash = H.href.search(v, car); if (H.route().q === v) render(true); return; }
    if (f.matches('[data-submitform]')) {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f).entries());
      H.submissions.add(d);
      V.markSent();
      render(true);
      window.scrollTo(0, 0);
    }
  });

  H.box.onChange(() => { syncBox(); if (H.route().name === 'box') render(true); });
  H.garage.onChange(() => {
    refreshChrome();
    const n = H.route().name;
    if (n !== 'car') render(true);
    if (n === 'car') { const r = H.route(); const cur = U.currentId(); const chip = $('[data-set-car]', app); if (chip && cur === r.vehicle.id) chip.outerHTML = '<span class="chip mine"><b>Your car</b></span>'; }
  });

  window.addEventListener('hashchange', () => render());
  U.initSearch();
  U.renderTheme();
  refreshChrome();
  syncBox();
  render();
})();
