// HWBT Research Box v2: the multi-car 3D navigator. Needs core.js (window.HWBT2) and anchors.js
// (window.HWBT2_ANCHORS) first. three@0.160.0 loads lazily from jsDelivr when a box nears the viewport.
//
// Mount:  <div data-v3d data-model="<3d slug or ''>" data-mode="showcase|car|zone|part"
//              data-car="<vehicleId>" data-zone="<zone>" data-part="<part id>"></div>
//         window.HWBT2View.mount(el) / unmount(el). [data-v3d] elements are also mounted automatically and
//         unmounted when removed from the page. Attribute changes are picked up.
//         data-model="" shows the vehicle photo; no data-model attribute = the car's own 3D model if it has one.
// Events out (bubble from the mount to window):
//   'hwbt2:showcase' {model, car}       showcase car changed
//   'hwbt2:zone'     {car, zone}        zone hotspot clicked ('' = back to the whole car)
//   'hwbt2:pin'      {id, n, car, zone} numbered pin clicked
//   'hwbt2:pin-hover'{id|null, car}     pin hovered / left (for lighting the list row)
// Events in (window): 'hwbt2:zone' {car?, zone}, 'hwbt2:part-focus' {id, car?}, 'hwbt2:showcase-set' {model},
//   'hwbt2:pin-light' {id|null} (light a pin from a hovered list row).
// Theme (CSS custom properties on the mount): --v3d-bg, --v3d-floor, --v3d-hotspot-bg, --v3d-hotspot-fg,
//   --v3d-accent, --v3d-accent-fg, --v3d-radius, --v3d-font.
// One WebGL renderer per page. Each mount draws into its own 2D canvas, so any number of boxes can be live.
(function () {
  'use strict';
  if (window.HWBT2View) return;
  const SRC = (document.currentScript && document.currentScript.src) || location.href;
  const ROOT = new URL('../', SRC);               // v2/
  const ASSETS = new URL('../assets/3d/', ROOT);  // project assets/3d/
  const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
  const core = () => window.HWBT2;
  const AN = () => window.HWBT2_ANCHORS || { models: {}, layout: () => [] };
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODES = ['showcase', 'car', 'zone', 'part'];

  // ---------- liveries: recolour a model at load time. One table, the only place to tweak. ----------
  // The model files stay untouched. `rules` run per mesh material, first match wins:
  //   node = regex on the mesh's ancestor names (three.js underscore form, e.g. Side_Mirror_L_152)
  //   mat  = regex on the glTF material name (both given = both must match); to = a key of `finishes`.
  // Finish kinds: 'paint' (clearcoat MeshPhysicalMaterial), 'carbon' (procedural 2x2 twill, projected
  // triplanar in world space because the paint meshes carry no UVs; tow = width of one tow in metres).
  // glow = a little of the paint colour as emissive, so the clearcoat's grey reflections do not turn yellow to mustard.
  const LIVERIES = {
    // Mat Armstrong's yellow Oakley Design Veyron (HWBT). Scheme, sources, what is approximate:
    // refs/3d/veyron-yellow.md. Stock model paint was light blue (Primary) over black (Secondary).
    veyron: {
      finishes: {
        paint:   { kind: 'paint', color: '#ffc400', metalness: 0.04, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05, glow: 0.2 },
        stripe:  { kind: 'paint', color: '#ffc400', metalness: 0.04, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05, glow: 0.2 },
        carbon:  { kind: 'carbon', color: '#1d1f22', weave: '#62656b', tow: 0.011, metalness: 0.2, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03 },
        caliper: { kind: 'paint', color: '#ffc400', metalness: 0.04, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.08, glow: 0.2 },
        rim:     { kind: 'paint', color: '#d2d5d9', metalness: 0.6, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.06 },
        mesh:    { kind: 'paint', color: '#0b0b0c', metalness: 0.4, roughness: 0.5, clearcoat: 0, clearcoatRoughness: 0 },
      },
      rules: [
        { node: /Side_Mirror_[LR]_(152|168)$/, mat: /^Primary_Paint$/, to: 'carbon' }, // carbon mirror caps
        { node: /Door_Sides_69$/, to: 'carbon' },                                       // scallop behind the door
        { node: /Bottom_Bottom_Side_Parts_49$/, to: 'paint' },                          // yellow sill blade
        { node: /^(Side_Strips_119|Back_Side_Strips_46)$/, to: 'stripe' }, // yellow roof-rail / deck pinstripe
        { node: /Engine_Coolers_Covers_00_72$/, to: 'paint' },                          // the two roof scoops
        { node: /Front_Griil_Container_86$/, to: 'paint' },                             // horseshoe surround
        { node: /(Front_Grill_Center_87|Front_Grill_Sides_88|Door_Side_Grills_68|Engine_Coolers_Covers_00_Grid_73)$/, to: 'mesh' },
        { node: /Tyre_Break_Caliper_\d+$/, to: 'caliper' },
        { mat: /^Cover_Plastic$/, to: 'caliper' },                                      // calliper covers (stock blue)
        { node: /Tyre_Rim_\d+$/, mat: /^Metal_Aluminum$/, to: 'rim' },
        { mat: /^Primary_Paint$/, to: 'paint' },
        { mat: /^Secondary_Paint$/, to: 'carbon' },
      ],
    },
  };

  // ---------- geometry fixes: per model, applied at load time. The model files stay untouched. ----------
  //   wheels: [{ node, dz }]  moves every node whose name matches `node` (one wheel corner: tyre, rim, disc,
  //           calliper, axle...) outward by dz metres along its side (z > 0 goes +z, z < 0 goes -z).
  //           Measured 2026-10-15 against the arch lip (body |z| right above the tyre top): the stock wheels sat
  //           inside the body, rear tyre face 0.911 vs lip 0.940, front 0.912 vs lip 0.970.
  //   offset: [{ mat, factor, units }]  polygonOffset on a material that shares a plane with another
  //           surface (z-fighting = flicker). Negative pulls it toward the camera.
  //   move:   [{ node, dy }]  moves matching nodes by dy metres (world), e.g. a wheel modelled lower than the rest.
  //   emissive: [{ mat, color, intensity }]  replaces a material's glow colour.
  //   order:  [{ mat, order }]  fixed renderOrder for stacked transparent layers, so their sort cannot flip
  //           while the car turns.
  // Every model is then grounded: the lowest point (a tyre) sits exactly on y = 0. The shift is kept in M.dy and
  // added to the anchors.js pin / hotspot heights, which were measured on the unfixed model.
  const FIXES = {
    veyron: {
      wheels: [
        { node: /^(Back_[LR]_Tyre_\d+|Back_[LR]_Tyre_[A-Za-z_]+_\d+)$/, dz: 0.03 },
        { node: /^(Front_[LR]_Tyre_\d+|Front_[LR]_Tyre_[A-Za-z_]+_\d+|Front_Tyre_[LR]_Controller_\d+)$/, dz: 0.055 },
      ],
      // Tail lamps: the four round red lamp discs (Red_Light) lie exactly in the plane of their aluminium holders
      // (101 + 27 cm2 of coplanar faces, found by a plane test), so the GPU picked disc or holder per pixel and
      // per angle: the flicker. The disc now always wins. Its source emissive was pure white, which made the
      // winning disc a white blob; it glows in its own red instead.
      offset: [{ mat: /^Red_Light$/, factor: -2, units: -4 }],
      emissive: [{ mat: /^Red_Light$/, color: '#e74230', intensity: 0.55 }],
      order: [
        { mat: /^White_Light_Designed_Glass$/, order: 1 },
        { mat: /^White_Light_Glass$/, order: 2 },
        { mat: /^Red_Light_Glass$/, order: 3 },
      ],
    },
  };
  FIXES['rolls-royce-ghost'] = {
    // The front left wheel (g_164 to g_168: disc, tyre, valve, rim, calliper) sits 53 mm lower than the other
    // three, so the car stood on it and the other three tyres hovered 53 mm above the floor.
    move: [{ node: /^g_16[4-8]$/, dy: 0.053 }],
  };
  function applyFixes(THREE, root, F) {
    root.updateMatrixWorld(true);
    if (F && F.move) {
      const moves = [];
      root.traverse(o => { const f = F.move.find(w => w.node.test(o.name)); if (f && o.parent) moves.push([o, f.dy]); });
      for (const [o, dy] of moves) { const w = o.getWorldPosition(new THREE.Vector3()); w.y += dy; o.position.copy(o.parent.worldToLocal(w)); }
      root.updateMatrixWorld(true);
    }
    if (F && F.wheels) {
      const moves = [];
      root.traverse(o => {
        const f = F.wheels.find(w => w.node.test(o.name));
        if (!f || !o.parent) return;
        for (let p = o.parent; p && p !== root; p = p.parent) if (F.wheels.some(w => w.node.test(p.name))) return; // parent moves it
        const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
        moves.push([o, Math.sign(c.z) * f.dz]);
      });
      for (const [o, dz] of moves) {
        const w = o.getWorldPosition(new THREE.Vector3()); w.z += dz;
        o.position.copy(o.parent.worldToLocal(w));
      }
      root.updateMatrixWorld(true);
    }
    if (F && (F.offset || F.order || F.emissive)) root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        const em = F.emissive && F.emissive.find(r => r.mat.test(m.name));
        if (em && m.emissive) { m.emissive.set(em.color); m.emissiveIntensity = em.intensity; }
        const off = F.offset && F.offset.find(r => r.mat.test(m.name));
        if (off) { m.polygonOffset = true; m.polygonOffsetFactor = off.factor; m.polygonOffsetUnits = off.units; }
        const ord = F.order && F.order.find(r => r.mat.test(m.name));
        if (ord) o.renderOrder = ord.order;
      }
    });
    // Ground it: lowest vertex on y = 0 (vertex-exact, Box3 precise mode).
    const low = new THREE.Box3().setFromObject(root, true).min.y;
    if (Math.abs(low) > 1e-5) { root.position.y -= low; root.updateMatrixWorld(true); }
    return -low;
  }

  // ---------- styles ----------
  const css = `
:where([data-v3d]){position:relative}
.v3d{position:absolute;inset:0;overflow:hidden;isolation:isolate;border-radius:inherit;background:var(--v3d-bg,#0a0a0b);color:var(--v3d-hotspot-fg,#f2f2f2);
  font-family:var(--v3d-font,system-ui,-apple-system,"Segoe UI",sans-serif);-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.v3d-cv{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:pan-y;opacity:0;transition:opacity .45s ease}
.v3d.ready .v3d-cv{opacity:1}
.v3d-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;transition:opacity .45s ease}
.v3d.ready .v3d-poster{opacity:0}
.v3d-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.v3d-status{position:absolute;left:50%;bottom:52px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;font-size:12px;font-variant-numeric:tabular-nums;opacity:.8;pointer-events:none;transition:opacity .3s ease;white-space:nowrap}
.v3d-bar{width:140px;height:2px;background:color-mix(in srgb,currentColor 18%,transparent);overflow:hidden}
.v3d-bar i{display:block;height:100%;width:100%;background:currentColor;transform-origin:left;transform:scaleX(0);transition:transform .2s ease}
.v3d.ready .v3d-status,.v3d.failed .v3d-status{opacity:0}
.v3d-error{position:absolute;left:12px;right:12px;bottom:48px;margin:auto;max-width:340px;padding:12px 14px;font-size:13px;line-height:1.4;text-align:center;z-index:4;
  background:var(--v3d-hotspot-bg,#17181b);color:var(--v3d-hotspot-fg,#f2f2f2);border-radius:min(var(--v3d-radius,8px),10px);box-shadow:0 0 0 1px rgba(255,255,255,.14)}
.v3d-error button{font:inherit;font-weight:600;color:var(--v3d-accent-fg,#0a0a0b);background:var(--v3d-accent,#d3f23a);border:0;border-radius:min(var(--v3d-radius,8px),8px);padding:6px 12px;margin-top:8px;cursor:pointer;display:block;margin-inline:auto}
.v3d-credit{position:absolute;left:10px;right:10px;bottom:7px;font-size:10px;line-height:1.3;opacity:.55;z-index:3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:auto}
.v3d-credit a{color:inherit}
.v3d[data-mode="showcase"] .v3d-credit{bottom:auto;top:8px}
.v3d-photo~.v3d-credit{opacity:.9;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.7)}
.v3d-layer{position:absolute;inset:0;pointer-events:none;z-index:2}
.v3d-pin,.v3d-zc{position:absolute;left:0;top:0;border:0;cursor:pointer;pointer-events:auto;font:600 13px/1 var(--v3d-font,system-ui,sans-serif);font-variant-numeric:tabular-nums;
  background:var(--v3d-hotspot-bg,#17181b);color:var(--v3d-hotspot-fg,#f2f2f2);box-shadow:0 0 0 1px rgba(255,255,255,.28);opacity:0;
  transition:opacity .25s ease,background-color .15s ease,color .15s ease,box-shadow .15s ease,scale .12s ease;will-change:translate}
.v3d.ready .v3d-pin,.v3d.ready .v3d-zc{opacity:1}
.v3d-pin{width:28px;height:28px;margin:-14px 0 0 -14px;padding:0;display:grid;place-items:center;border-radius:min(var(--v3d-radius,6px),7px)}
.v3d.small .v3d-pin{width:24px;height:24px;margin:-12px 0 0 -12px;font-size:11.5px}
.v3d.ready .v3d-pin.behind{opacity:.5}
.v3d-pin:active,.v3d-zc:active{scale:.95}
.v3d-pin:focus-visible,.v3d-zc:focus-visible,.v3d-sw button:focus-visible,.v3d-back:focus-visible{outline:2px solid var(--v3d-accent,#d3f23a);outline-offset:2px}
.v3d-pin.lit{box-shadow:0 0 0 2px var(--v3d-accent,#d3f23a)}
.v3d-pin.on{background:var(--v3d-accent,#d3f23a);color:var(--v3d-accent-fg,#0a0a0b);box-shadow:none;opacity:1!important;z-index:2}
.v3d-pin::after{content:"";position:absolute;inset:-1px;border-radius:inherit;border:2px solid var(--v3d-accent,#d3f23a);opacity:0;pointer-events:none}
.v3d-pin.pulse::after{animation:v3dPulse 1s cubic-bezier(.23,1,.32,1) 3}
@keyframes v3dPulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(2)}}
.v3d.ready .v3d-pin.in-cl{opacity:0;visibility:hidden;pointer-events:none}
.v3d .v3d-pin.v3d-cl{z-index:1;width:auto;padding:0 8px;margin-left:0;transform:translateX(-50%);white-space:nowrap;font-size:11.5px}
.v3d.small .v3d-pin.v3d-cl{width:auto;padding:0 6px;margin-left:0;font-size:10.5px}
.v3d-cl::after{content:none}
.v3d-zc{display:flex;align-items:center;gap:7px;height:30px;padding:0 10px 0 4px;translate:0 0;transform:translate(-14px,-50%);border-radius:min(var(--v3d-radius,8px),8px);white-space:nowrap;font-size:12.5px;font-weight:600}
.v3d-zc b{display:grid;place-items:center;min-width:22px;height:22px;padding:0 4px;border-radius:min(var(--v3d-radius,6px),5px);background:var(--v3d-hotspot-fg,#f2f2f2);color:var(--v3d-hotspot-bg,#17181b);font-size:12px}
.v3d-zc.flip{flex-direction:row-reverse;padding:0 4px 0 10px;transform:translate(calc(-100% + 14px),-50%)}
.v3d-zc.zero{opacity:.62!important}
@media (pointer:coarse){.v3d-zc::before,.v3d-pin::before{content:"";position:absolute;inset:-8px}}
.v3d-zc.zero b{background:transparent;color:inherit;box-shadow:inset 0 0 0 1px currentColor}
.v3d.small .v3d-zc,.v3d.small .v3d-zc.flip{height:26px;padding:0 3px;gap:0;transform:translate(-13px,-50%)}
.v3d.small .v3d-zc span{display:none}
.v3d.small .v3d-zc b{min-width:20px;height:20px;font-size:11px}
@media (hover:hover){.v3d-zc:hover,.v3d-pin:hover{box-shadow:0 0 0 2px var(--v3d-accent,#d3f23a)}.v3d-sw button:hover{box-shadow:inset 0 0 0 1px currentColor}}
.v3d-label{position:absolute;left:0;top:0;z-index:3;max-width:min(260px,calc(100% - 24px));padding:9px 11px 10px;pointer-events:auto;font-size:13px;line-height:1.3;
  background:var(--v3d-hotspot-bg,#17181b);color:var(--v3d-hotspot-fg,#f2f2f2);border-radius:min(var(--v3d-radius,8px),8px);box-shadow:0 0 0 1px rgba(255,255,255,.16),0 8px 24px rgba(0,0,0,.35);
  opacity:0;visibility:hidden;transition:opacity .15s ease,visibility 0s linear .15s}
.v3d-label.show{opacity:1;visibility:visible;transition:opacity .15s ease}
.v3d-label b{display:block;font-weight:600}
.v3d-label small{display:block;margin-top:3px;font-size:11.5px;opacity:.7}
.v3d-label a{display:inline-block;margin-top:6px;font-size:12px;color:inherit;text-underline-offset:2px}
.v3d-head{position:absolute;left:10px;top:10px;right:10px;z-index:3;display:flex;align-items:center;gap:10px;pointer-events:none}
.v3d-back{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px 0 8px;font:600 12.5px/1 var(--v3d-font,system-ui,sans-serif);cursor:pointer;border:0;
  background:var(--v3d-hotspot-bg,#17181b);color:var(--v3d-hotspot-fg,#f2f2f2);box-shadow:0 0 0 1px rgba(255,255,255,.22);border-radius:min(var(--v3d-radius,8px),8px)}
.v3d-back svg{width:14px;height:14px}
.v3d-zt{font-size:13px;line-height:1.25;text-shadow:0 1px 8px rgba(0,0,0,.6);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v3d-zt b{font-weight:700}
.v3d-zt span{opacity:.7;margin-left:6px}
.v3d-sw{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;gap:6px;padding:10px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;justify-content:safe center}
.v3d-sw::-webkit-scrollbar{display:none}
.v3d-sw button{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:7px 11px 8px;border:0;cursor:pointer;text-align:left;
  font:500 11px/1.15 var(--v3d-font,system-ui,sans-serif);background:var(--v3d-hotspot-bg,#17181b);color:var(--v3d-hotspot-fg,#f2f2f2);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);border-radius:min(var(--v3d-radius,8px),8px);transition:background-color .15s ease,color .15s ease}
.v3d-sw button span{opacity:.65}
.v3d-sw button b{font-size:13px;font-weight:700}
.v3d-sw button[aria-pressed="true"]{background:var(--v3d-accent,#d3f23a);color:var(--v3d-accent-fg,#0a0a0b);box-shadow:none}
.v3d-sw button[aria-pressed="true"] span{opacity:.75}
.v3d.small .v3d-sw{padding:8px;gap:5px;justify-content:flex-start}
.v3d.small .v3d-sw button{padding:6px 9px 7px}
.v3d.small .v3d-sw button b{font-size:12px}
@media (prefers-reduced-motion:reduce){.v3d-pin.pulse::after{animation:none}.v3d-cv,.v3d-poster,.v3d-pin,.v3d-zc{transition:none}}
`;
  function injectCSS() {
    if (document.getElementById('v3d2-css')) return;
    const s = document.createElement('style'); s.id = 'v3d2-css'; s.textContent = css; document.head.appendChild(s);
  }

  // ---------- three.js, loaded once ----------
  // Raw module files + an import map for "three". jsDelivr's +esm bundles send
  // `Link: </npm/three@0.160.0/+esm>; rel=modulepreload`, which WebKit resolves against the PAGE origin:
  // a stray 404 on every load. The raw files carry no Link header. The map has to exist before any module
  // loads, so it is added while this file is evaluated. If the page already maps "three" elsewhere, or the
  // map cannot apply, the +esm bundles are the fallback (same three@0.160.0, works, WebKit logs that 404).
  const CORE = CDN + 'build/three.module.min.js';
  const MAP = (() => {
    for (const s of document.querySelectorAll('script[type="importmap"]')) {
      try { const t = (JSON.parse(s.textContent).imports || {}).three; if (t) return t === CORE ? 'ours' : 'other'; } catch (e) {}
    }
    if (!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'))) return 'none';
    const s = document.createElement('script');
    s.type = 'importmap';
    s.textContent = JSON.stringify({ imports: { three: CORE } });
    (document.head || document.documentElement).appendChild(s);
    return 'ours';
  })();
  const libVia = (core, ext) => Promise.all([
    import(core),
    import(CDN + 'examples/jsm/loaders/GLTFLoader.js' + ext),
    import(CDN + 'examples/jsm/controls/OrbitControls.js' + ext),
    import(CDN + 'examples/jsm/environments/RoomEnvironment.js' + ext),
  ]);
  let libP = null, libRoute = null;
  const loadLib = () => libP || (libP = (MAP === 'ours'
    ? libVia(CORE, '').then(r => { libRoute = 'importmap'; return r; }, e => { console.warn('[viewer] import map route failed, using +esm', e); return libVia(CDN + '+esm', '/+esm').then(r => { libRoute = 'esm'; return r; }); })
    : libVia(CDN + '+esm', '/+esm').then(r => { libRoute = 'esm'; return r; }))
    .then(([THREE, G, O, R]) => ({ THREE, GLTFLoader: G.GLTFLoader, OrbitControls: O.OrbitControls, RoomEnvironment: R.RoomEnvironment }))
    .catch(e => { libP = null; throw e; }));

  // ---------- model bytes: manifest + base64 chunks, streamed with real progress, kept in memory ----------
  const bytes = new Map(); // slug -> {p: Promise<{glb, credit}>, progress, listeners:Set}
  function srcFor(slug) {
    const m = core() && core().model3d(slug);
    return m && m.src ? new URL(m.src, ROOT) : new URL(slug === 'veyron' ? 'veyron.json' : slug + '/' + slug + '.json', ASSETS);
  }
  function fetchBytes(slug, onProgress) {
    let e = bytes.get(slug);
    if (!e) {
      e = { progress: 0, listeners: new Set() };
      const report = v => { e.progress = v; e.listeners.forEach(fn => { try { fn(v); } catch (x) {} }); };
      e.p = (async () => {
        const man = await (await okFetch(srcFor(slug))).json();
        const total = man.chunks.reduce((s, c) => s + c.bytes, 0);
        let got = 0;
        const texts = await Promise.all(man.chunks.map(async c => {
          const res = await okFetch(new URL(c.file, ASSETS));
          if (!res.body || !res.body.getReader) { const t = await res.text(); got += c.bytes; report(got / total); return t; }
          const reader = res.body.getReader(); const parts = []; const dec = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            parts.push(dec.decode(value, { stream: true })); got += value.length; report(Math.min(got / total, 1));
          }
          parts.push(dec.decode());
          return parts.join('');
        }));
        const bin = new Uint8Array(man.binBytes);
        let off = 0;
        for (const t of texts) { const b = b64(JSON.parse(t)); bin.set(b, off); off += b.length; }
        if (off !== man.binBytes) throw new Error('Model data is incomplete');
        report(1);
        return { glb: makeGLB(man.gltf, bin), credit: man.credit };
      })();
      e.p.catch(() => bytes.delete(slug));
      bytes.set(slug, e);
    }
    if (onProgress) { e.listeners.add(onProgress); onProgress(e.progress); e.p.finally(() => e.listeners.delete(onProgress)).catch(() => {}); }
    return e.p;
  }
  async function okFetch(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url.pathname || url}`);
    return r;
  }
  function b64(s) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(s);
    const bin = atob(s); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function makeGLB(json, bin) {
    const enc = new TextEncoder().encode(JSON.stringify(json));
    const jLen = Math.ceil(enc.length / 4) * 4, bLen = Math.ceil(bin.length / 4) * 4;
    const buf = new ArrayBuffer(12 + 8 + jLen + 8 + bLen);
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, buf.byteLength, true);
    dv.setUint32(12, jLen, true); dv.setUint32(16, 0x4e4f534a, true);
    u8.set(enc, 20); u8.fill(0x20, 20 + enc.length, 20 + jLen);
    dv.setUint32(20 + jLen, bLen, true); dv.setUint32(24 + jLen, 0x004e4942, true);
    u8.set(bin, 28 + jLen);
    return buf;
  }

  // ---------- the one renderer ----------
  let stage = null, stageTimer = 0;
  function getStage(L) {
    clearTimeout(stageTimer);
    if (stage) return stage;
    const { THREE } = L;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); // sizes are managed in device pixels
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(2, 2, false);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new L.RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // Floor: a soft radial pool of light under the car, tinted per mount by --v3d-floor.
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const floorTex = new THREE.CanvasTexture(c); floorTex.colorSpace = THREE.SRGBColorSpace;
    stage = { L, THREE, renderer, env, floorTex, w: 2, h: 2 };
    return stage;
  }
  function disposeStageLater() {
    clearTimeout(stageTimer);
    stageTimer = setTimeout(() => {
      if (!stage || mounts.size || models.size) return;
      try { stage.env.dispose(); stage.floorTex.dispose(); stage.renderer.dispose(); stage.renderer.forceContextLoss(); } catch (e) {}
      stage = null;
    }, 20000);
  }
  function ensureSize(w, h) {
    const S = stage;
    if (w > S.w || h > S.h) { S.w = Math.max(w, S.w); S.h = Math.max(h, S.h); S.renderer.setSize(S.w, S.h, false); }
  }

  // ---------- parsed models, shared by every mount that shows them ----------
  const models = new Map(); // slug -> {refs, p: Promise<M>, M}
  function acquire(slug, onProgress) {
    let e = models.get(slug);
    if (!e) {
      e = { refs: 0, M: null };
      e.p = (async () => {
        const L = await loadLib();
        const data = await fetchBytes(slug, onProgress);
        const S = getStage(L);
        const gltf = await new Promise((res, rej) => new L.GLTFLoader().parse(data.glb.slice(0), ASSETS.href, res, rej));
        const M = prepare(S, gltf, slug, data.credit);
        e.M = M;
        if (e.refs <= 0) { disposeModel(M); models.delete(slug); throw new Error('released'); }
        return M;
      })();
      e.p.catch(() => { if (models.get(slug) === e) models.delete(slug); });
      models.set(slug, e);
    } else if (onProgress) fetchBytes(slug, onProgress).catch(() => {});
    e.refs++;
    return e.p;
  }
  function release(slug) {
    const e = models.get(slug);
    if (!e) return;
    e.refs--;
    if (e.refs > 0) return;
    if (e.M) { disposeModel(e.M); models.delete(slug); }
    // still loading: acquire() disposes it when the parse finishes
    if (!mounts.size) disposeStageLater();
  }

  // 2x2 twill carbon, computed in the shader. x = weave brightness 0..1, y = roughness offset per tow direction.
  // The weave fades to its average where a cell gets smaller than about a pixel, so it never shimmers.
  const CARBON_GLSL = `
uniform float cfScale; uniform vec3 cfDark; uniform vec3 cfLight; varying vec3 vCfP; varying vec3 vCfN;
vec2 cfWeave(vec2 p) {
  vec2 c = floor(p), f = fract(p);
  float warp = mod(c.x + c.y, 4.0) < 2.0 ? 1.0 : 0.0;
  float across = mix(f.x, f.y, warp);
  float b = mix(0.35, 0.85, warp) * (0.6 + 0.4 * sin(3.14159 * across)); // mean about 0.5
  float aa = 1.0 - smoothstep(0.35, 0.9, max(fwidth(p.x), fwidth(p.y)));
  return vec2(mix(0.5, b, aa), mix(0.0, warp > 0.5 ? -0.1 : 0.1, aa));
}
vec2 cfTri(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return cfWeave(p.zy) * w.x + cfWeave(p.xz) * w.y + cfWeave(p.xy) * w.z;
}
`;
  function liveryMaterial(THREE, f, name) {
    const m = new THREE.MeshPhysicalMaterial({
      name: 'Livery_' + name, color: f.color, metalness: f.metalness, roughness: f.roughness,
      clearcoat: f.clearcoat, clearcoatRoughness: f.clearcoatRoughness, side: THREE.DoubleSide,
    });
    if (f.glow) m.emissive.set(f.color).multiplyScalar(f.glow);
    if (f.kind !== 'carbon') return m;
    const uniforms = { cfScale: { value: 1 / f.tow }, cfDark: { value: new THREE.Color(f.color) }, cfLight: { value: new THREE.Color(f.weave) } };
    m.color.set(0xffffff);
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'varying vec3 vCfP; varying vec3 vCfN;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n vCfP = (modelMatrix * vec4(transformed, 1.0)).xyz; vCfN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = CARBON_GLSL + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n vec2 cfW = cfTri(vCfP * cfScale, normalize(vCfN));\n diffuseColor.rgb *= mix(cfDark, cfLight, cfW.x);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + cfW.y, 0.04, 1.0);');
    };
    m.customProgramCacheKey = () => 'hwbt-carbon-twill';
    return m;
  }
  // Swaps materials by LIVERIES rules. New materials are made once per model and shared by its meshes.
  function applyLivery(THREE, root, L) {
    if (!L) return;
    const made = {};
    const get = k => made[k] || (made[k] = liveryMaterial(THREE, L.finishes[k], k));
    root.traverse(o => {
      if (!o.isMesh) return;
      const names = [];
      for (let p = o; p && p !== root; p = p.parent) if (p.name) names.push(p.name);
      const pick = m => {
        const r = L.rules.find(r => (!r.mat || r.mat.test(m.name)) && (!r.node || names.some(n => r.node.test(n))));
        return r ? get(r.to) : m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
    });
  }

  function prepare(S, gltf, slug, credit) {
    const { THREE, renderer } = S;
    const cfg = AN().models[slug] || {};
    const root = gltf.scene;
    applyLivery(THREE, root, LIVERIES[slug]);
    const dy = applyFixes(THREE, root, FIXES[slug]);
    const scene = new THREE.Scene();
    scene.environment = S.env;
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    scene.add(root);
    // Two contact shadows: a wide soft one for the body, and a tight dark one where the tyres meet the floor.
    const shadow = [
      contactShadow(THREE, renderer, scene, size.x + 1.2, size.z + 1.0, { H: 0.6, dark: 1.25, blur: [4, 2, 0.8], opacity: 0.9, y: 0.002, res: 512 }),
      contactShadow(THREE, renderer, scene, size.x + 0.3, size.z + 0.3, { H: 0.07, dark: 2.2, blur: [1.5, 0.7], opacity: 0.85, y: 0.003, res: 1024 }),
    ];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: S.floorTex, transparent: true, depthWrite: false, toneMapped: false }));
    floor.scale.set(size.x * 2.1, 1, size.z * 3.2); floor.position.y = -0.001; floor.renderOrder = -2;
    scene.add(floor);
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(4, 8, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, cfg.rim || 0); scene.add(rim); scene.add(rim.target);
    const glassRe = cfg.glass || /^$/;
    const lampRe = /light|lamp|lens|projector|amber|red|beam/i;
    const seen = new Set(), glassMats = [];
    const ghost = new THREE.MeshStandardMaterial({ color: 0x6b717a, metalness: 0, roughness: 0.7, transparent: true, depthWrite: false, opacity: 1 });
    ghost.userData.base = 1;
    const ghostGlass = ghost.clone(); ghostGlass.userData.base = 0.35;
    const meshes = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      const mats = [].concat(o.material);
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        const isGlass = m.transmission > 0 || glassRe.test(m.name);
        if (isGlass) {
          m.transmission = 0; m.transparent = true; m.depthWrite = false; m.metalness = 0;
          m.roughness = Math.min(m.roughness ?? 0.1, 0.08);
          if (!(m.opacity < 1)) m.opacity = lampRe.test(m.name) ? 0.55 : 0.3;
          m.userData.glass = true; m.userData.baseOpacity = m.opacity; glassMats.push(m);
        }
        m.envMapIntensity = cfg.envBoost || 1;
      }
      const names = [];
      for (let p = o; p && p !== root; p = p.parent) if (p.name) names.unshift(p.name);
      const path = names.join('|') + '|' + mats.map(m => m.name).join('|');
      const glass = mats.every(m => m.userData && m.userData.glass);
      const zones = new Set(Object.keys(cfg.keep || {}).filter(z => cfg.keep[z].test(path)));
      meshes.push({ mesh: o, orig: o.material, ghost: Array.isArray(o.material) ? o.material.map(m => (m.userData.glass ? ghostGlass : ghost)) : (glass ? ghostGlass : ghost), glass, zones, path });
      o.castShadow = false; o.receiveShadow = false;
    });
    // Compile the ghost program now so the first zone click does not stall.
    const m0 = meshes.find(m => !m.glass);
    if (m0) { m0.mesh.material = m0.ghost; try { renderer.compile(scene, new THREE.PerspectiveCamera()); } catch (e) {} m0.mesh.material = m0.orig; }
    return { slug, cfg, dy, scene, root, box, size, meshes, glassMats, ghosts: [ghost, ghostGlass], shadow, floor, key, rim, credit, pinCache: new Map(), look: null };
  }

  // Soft contact shadow rendered once from below (three.js contact-shadow technique), black only.
  function contactShadow(THREE, renderer, scene, W, D, o) {
    const H = o.H, RES = o.res;
    const rt = new THREE.WebGLRenderTarget(RES, Math.round(RES * D / W)); rt.texture.generateMipmaps = false;
    const rtB = new THREE.WebGLRenderTarget(rt.width, rt.height); rtB.texture.generateMipmaps = false;
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0, H);
    cam.rotation.x = Math.PI / 2;
    const depthMat = new THREE.MeshDepthMaterial();
    depthMat.onBeforeCompile = sh => {
      sh.uniforms.darkness = { value: o.dark };
      sh.fragmentShader = 'uniform float darkness;\n' + sh.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
    };
    depthMat.depthTest = false; depthMat.depthWrite = false;
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
        void main(){ vec4 s = vec4(0.0);
          s += texture2D(tDiffuse, vUv - 4.0*dir) * 0.051; s += texture2D(tDiffuse, vUv - 3.0*dir) * 0.0918;
          s += texture2D(tDiffuse, vUv - 2.0*dir) * 0.12245; s += texture2D(tDiffuse, vUv - 1.0*dir) * 0.1531;
          s += texture2D(tDiffuse, vUv) * 0.1633;
          s += texture2D(tDiffuse, vUv + 1.0*dir) * 0.1531; s += texture2D(tDiffuse, vUv + 2.0*dir) * 0.12245;
          s += texture2D(tDiffuse, vUv + 3.0*dir) * 0.0918; s += texture2D(tDiffuse, vUv + 4.0*dir) * 0.051;
          gl_FragColor = s; }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(quadGeo, blurMat); quad.frustumCulled = false;
    const quadScene = new THREE.Scene(); quadScene.add(quad);
    const blur = amount => {
      blurMat.uniforms.tDiffuse.value = rt.texture; blurMat.uniforms.dir.value.set(amount / rt.width, 0);
      renderer.setRenderTarget(rtB); renderer.render(quadScene, cam);
      blurMat.uniforms.tDiffuse.value = rtB.texture; blurMat.uniforms.dir.value.set(0, amount / rt.height);
      renderer.setRenderTarget(rt); renderer.render(quadScene, cam);
    };
    const prevEnv = scene.environment; scene.environment = null;
    const hidden = []; // earlier shadow planes must not cast into this one
    scene.traverse(x => { if (x.userData.shadow && x.visible) { x.visible = false; hidden.push(x); } });
    scene.overrideMaterial = depthMat;
    renderer.setScissorTest(false);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
    scene.overrideMaterial = null;
    o.blur.forEach(blur);
    renderer.setRenderTarget(null);
    scene.environment = prevEnv;
    hidden.forEach(x => { x.visible = true; });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true, opacity: o.opacity, depthWrite: false }));
    plane.scale.y = -1; plane.position.y = o.y; plane.renderOrder = -1;
    plane.userData.base = o.opacity; plane.userData.shadow = true;
    scene.add(plane);
    rtB.dispose(); depthMat.dispose(); blurMat.dispose(); quadGeo.dispose();
    return { plane, rt };
  }

  function disposeModel(M) {
    const tex = new Set();
    M.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      for (const m of [].concat(o.material || [])) {
        for (const k in m) { const v = m[k]; if (v && v.isTexture && v !== stage?.floorTex && v !== stage?.env) tex.add(v); }
        m.dispose();
      }
    });
    M.ghosts.forEach(g => g.dispose());
    tex.forEach(t => t.dispose());
    M.shadow.forEach(s => s.rt.dispose());
    M.scene.clear();
  }

  // ---------- render loop: one rAF for every live mount ----------
  const mounts = new Map(); // el -> Mount
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(loop); };
  function loop(now) {
    raf = 0;
    let again = false;
    for (const mt of mounts.values()) if (mt.frame(now)) again = true;
    if (again) schedule();
  }

  // Credit string from the manifest / vehicles.js -> short linked line.
  function creditHTML(s) {
    const m = /^"(.+?)" by (.+?) \((https?:[^)]+)\),\s*(?:licensed under\s*)?(CC BY[^(]*?) \((https?:[^)]+)\)\.\s*(.*)$/.exec(s || '');
    if (!m) return esc(s);
    return `3D model: "${esc(m[1])}" by <a href="${esc(m[3])}" target="_blank" rel="noopener">${esc(m[2])}</a>, <a href="${esc(m[5])}" target="_blank" rel="noopener">${esc(m[4].trim())}</a>. ${esc(m[6])}`;
  }
  const BACK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const carKey = id => { const v = id && core() ? core().vehicle(id) : null; return v ? v.key : null; };
  // Parses any CSS colour into [r,g,b,a] (0..1) through a 1x1 canvas.
  const colorCache = new Map();
  function cssColor(str, fallback) {
    str = (str || '').trim() || fallback;
    if (colorCache.has(str)) return colorCache.get(str);
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = str; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    const out = d[3] ? [d[0] / d[3], d[1] / d[3], d[2] / d[3], d[3] / 255] : [0, 0, 0, 0];
    colorCache.set(str, out);
    return out;
  }
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  // ---------- one mounted box ----------
  class Mount {
    constructor(el) {
      this.el = el;
      injectCSS();
      // Positioning comes from a zero-specificity rule in the injected CSS, never inline: in WebKit the mount can
      // run before the page stylesheet applies, and an inline 'relative' would beat the page's own 'absolute'.
      const ui = this.ui = document.createElement('div');
      ui.className = 'v3d';
      ui.innerHTML = `<img class="v3d-poster" alt="" width="1600" height="900" decoding="async" fetchpriority="high" hidden>
        <canvas class="v3d-cv" aria-hidden="true"></canvas>
        <div class="v3d-status" aria-live="polite" hidden><span class="v3d-pct">3D model</span><span class="v3d-bar"><i></i></span></div>
        <div class="v3d-layer"><div class="v3d-label" role="tooltip"></div></div>
        <div class="v3d-head" hidden></div>
        <div class="v3d-sw" role="group" aria-label="Choose a car" hidden></div>
        <div class="v3d-credit"></div>`;
      el.appendChild(ui);
      this.q = s => ui.querySelector(s);
      this.cv = this.q('.v3d-cv'); this.ctx = this.cv.getContext('2d');
      this.poster = this.q('.v3d-poster'); this.layer = this.q('.v3d-layer'); this.label = this.q('.v3d-label');
      this.label.id = 'v3d-l-' + Math.random().toString(36).slice(2, 8);
      this.poster.addEventListener('error', () => { this.poster.hidden = true; });
      this.state = { mode: null, car: null, zone: '', part: null, model: null };
      this.slug = null; this.M = null; this.ready = false; this.visible = false; this.started = false; this.loadToken = 0;
      this.pins = []; this.chips = []; this.clusters = new Set();
      this.tween = null; this.fade = 0; this.fadeTarget = 0; this.keepZone = null; this.dirty = true; this.idle = 0; this.last = 0; this.lastOcc = 0;
      this.activeId = null; this.litId = null; this.labelFor = null; this.hideTimer = 0;
      this.w = 1; this.h = 1; this.dpr = 1;
      this.io = new IntersectionObserver(es => {
        for (const e of es) { this.visible = e.isIntersecting; if (this.visible) { if (!this.started) this.start(); this.kick(); } }
      }, { rootMargin: '300px 0px' });
      this.io.observe(el);
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(ui);
      this.mo = new MutationObserver(() => this.sync());
      this.mo.observe(el, { attributes: true, attributeFilter: ['data-mode', 'data-model', 'data-car', 'data-zone', 'data-part'] });
      this.label.addEventListener('pointerenter', () => clearTimeout(this.hideTimer));
      this.label.addEventListener('pointerleave', () => this.hideLabel());
      ui.addEventListener('keydown', e => { if (e.key === 'Escape') this.hideLabel(true); });
      this.resize();
      this.sync();
    }

    // ----- attributes -> state -----
    attrs() {
      const d = this.el.dataset;
      let mode = MODES.includes(d.mode) ? d.mode : (d.car ? 'car' : 'showcase');
      const C = core();
      let car = d.car || null, part = d.part || null;
      if (mode === 'part' && !car && part && C && C.part(part)) car = C.part(part).veh[0];
      let model;
      if (mode === 'showcase') {
        const list = this.showList();
        const want = this.showModel || d.model || (car && C && (C.model3dFor(car) || {}).slug) || (list[0] && list[0].slug);
        model = list.some(s => s.slug === want) ? want : (list[0] && list[0].slug) || null;
        const entry = list.find(s => s.slug === model);
        car = entry ? entry.car : car;
      } else if ('model' in d) model = d.model || '';
      else model = car && C ? ((C.model3dFor(car) || {}).slug || '') : '';
      return { mode, car, zone: d.zone || '', part, model };
    }
    showList() {
      const C = core();
      if (!C) return [];
      return C.showcase().filter(v => v && v.model3d).map(v => ({ slug: v.model3d.slug, car: v.id, make: v.makeName, model: v.modelName }));
    }
    sync() {
      const a = this.attrs();
      const s = this.state;
      const carChanged = a.car !== s.car;
      if (a.model !== this.slug || carChanged) { s.car = a.car; this.useModel(a.model); }
      s.car = a.car;
      if (carChanged || a.mode !== s.mode || a.zone !== s.zone || a.part !== s.part || !this.applied) {
        this.setMode(a.mode, { zone: a.zone, part: a.part }, !this.ready);
      }
    }
    // Writes the live state back to the attributes, so the DOM always tells the truth.
    reflect() {
      const d = this.el.dataset, s = this.state;
      const set = (k, v) => { if (v == null || v === '') { if (k in d) delete d[k]; } else if (d[k] !== v) d[k] = v; };
      set('mode', s.mode); set('zone', s.mode === 'zone' || s.mode === 'part' ? s.zone : '');
      set('part', s.mode === 'part' ? s.part : '');
      if (s.mode === 'showcase') { set('model', this.slug); set('car', s.car); }
    }

    // ----- model -----
    useModel(slug) {
      if (slug && this.slug === slug && (this.M || this.heldSlug === slug)) return;
      const token = ++this.loadToken;
      if (this.heldSlug) { release(this.heldSlug); this.heldSlug = null; }
      this.M = null; this.ready = false; this.started = false;
      this.ui.classList.remove('ready', 'failed');
      this.q('.v3d-error')?.remove();
      this.q('.v3d-photo')?.remove();
      this.slug = slug;
      this.ui.dataset.model = slug || '';
      this.clearOverlay();
      const C = core();
      if (!slug) { this.photo(); return; }
      const meta = C && C.model3d(slug);
      // Only request a poster that exists: models3d[slug].poster if set, the Veyron's own render (showcase framing,
      // yellow livery; poster-light/-dark.webp belong to the v1 viewer and still show the stock paint), else none.
      const posterURL = meta && meta.poster ? new URL(meta.poster, ROOT).href : slug === 'veyron' ? new URL('veyron/poster.webp', ASSETS).href : '';
      this.poster.hidden = !posterURL;
      if (posterURL) this.poster.src = posterURL; else this.poster.removeAttribute('src');
      this.poster.alt = '3D model of the ' + (meta ? meta.name : slug);
      this.q('.v3d-credit').innerHTML = meta ? creditHTML(meta.credit) : '';
      this.q('.v3d-status').hidden = false;
      this.progress(0);
      if (this.visible) this.start(token);
    }
    photo() {
      const C = core();
      const v = C && this.state.car ? C.vehicle(this.state.car) : null;
      this.poster.hidden = true; this.q('.v3d-status').hidden = true;
      if (v && v.image) {
        const img = document.createElement('img');
        img.className = 'v3d-photo'; img.alt = v.label; img.decoding = 'async'; img.loading = 'lazy';
        img.src = new URL(v.image, ROOT).href;
        this.ui.insertBefore(img, this.cv);
        this.q('.v3d-credit').textContent = v.credit ? 'Photo: ' + v.credit.split(', http')[0] + ', Wikimedia Commons' : '';
      } else this.q('.v3d-credit').textContent = '';
      this.ui.classList.add('ready');
      this.ready = false;
    }
    progress(p) {
      const n = Math.round(p * 100);
      this.q('.v3d-pct').textContent = p >= 1 ? 'Preparing the car' : `Loading 3D model ${n}%`;
      this.q('.v3d-bar i').style.transform = `scaleX(${p})`;
      this.pct = n;
    }
    async start(token = this.loadToken) {
      if (!this.slug || this.started || this.M) return;
      this.started = true;
      const slug = this.slug;
      this.q('.v3d-error')?.remove();
      this.ui.classList.remove('failed');
      try {
        const p = acquire(slug, v => { if (token === this.loadToken) this.progress(v); });
        this.heldSlug = slug;
        const M = await p;
        if (token !== this.loadToken || this.destroyed) return;
        this.M = M;
        this.attach();
      } catch (err) {
        if (token !== this.loadToken || this.destroyed) return;
        if (this.heldSlug === slug) { release(slug); this.heldSlug = null; }
        console.warn('[viewer]', err);
        this.started = false;
        this.ui.classList.add('failed');
        const box = document.createElement('div');
        box.className = 'v3d-error'; box.setAttribute('role', 'alert');
        box.innerHTML = 'The 3D car could not load.<button type="button">Try again</button>';
        box.querySelector('button').onclick = () => { box.remove(); this.start(); };
        this.ui.appendChild(box);
        this.error = String(err && err.message || err);
      }
    }
    attach() {
      const S = stage, { THREE } = S, M = this.M;
      if (!this.camera) {
        this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.25, 30); // tight near/far = depth precision for the coplanar lamp parts
        this.controls = new S.L.OrbitControls(this.camera, this.cv);
        Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, enableZoom: false, minPolarAngle: 0.2, maxPolarAngle: 1.5, rotateSpeed: 0.7 });
        this.cv.style.touchAction = 'pan-y';
        this.controls.addEventListener('start', () => { this.userMoved = true; this.tween = null; this.kick(); });
        this.controls.addEventListener('change', () => this.kick());
      }
      this.resize();
      this.ready = true;
      this.q('.v3d-credit').innerHTML = creditHTML(((core() && core().model3d(M.slug)) || {}).credit || M.credit);
      this.applied = false;
      this.setMode(this.state.mode, { zone: this.state.zone, part: this.state.part }, true);
      this.renderNow();
      requestAnimationFrame(() => {
        if (!this.ready || this.M !== M) return;
        this.ui.classList.add('ready');
        this.el.dispatchEvent(new CustomEvent('v3d:ready', { bubbles: true, detail: { model: M.slug } }));
      });
      this.kick();
    }
    resize() {
      const r = this.ui.getBoundingClientRect();
      this.w = Math.max(1, Math.round(r.width)); this.h = Math.max(1, Math.round(r.height));
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(this.w * this.dpr), H = Math.round(this.h * this.dpr);
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      this.ui.classList.toggle('small', this.w < 560);
      if (this.camera) {
        const was = this.camera.aspect;
        this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix();
        if (Math.abs(was - this.camera.aspect) > 0.01 && !this.userMoved && !this.tween && this.view) this.setView(this.view(), true);
      }
      this.dirty = true; this.kick();
    }

    // ----- views -----
    fit() { const a = this.w / this.h; return a >= 1.6 ? 1 : Math.min(1.8, Math.pow(1.6 / a, 0.85)); }
    preset(name) {
      const { THREE } = stage, p = this.M.cfg.presets && (this.M.cfg.presets[name] || this.M.cfg.presets.car);
      const pp = p || { target: [0, 0.5, 0], pos: [1, 2.4, 6.5] };
      const t = new THREE.Vector3(...pp.target), pos = new THREE.Vector3(...pp.pos);
      return { target: t, pos: pos.sub(t).multiplyScalar(this.fit()).add(t) };
    }
    setView(v, instant) {
      const c = this.controls;
      if (instant || reduced()) { this.tween = null; this.camera.position.copy(v.pos); c.target.copy(v.target); c.update(); this.kick(); return; }
      this.tween = { t0: performance.now(), dur: 950, p0: this.camera.position.clone(), q0: c.target.clone(), p1: v.pos, q1: v.target };
      this.kick();
    }

    // ----- modes -----
    setMode(mode, o = {}, instant) {
      const s = this.state, C = core();
      s.mode = mode;
      this.ui.dataset.mode = mode;
      let zone = o.zone || '', part = o.part || null;
      if (mode === 'part') {
        const p = part && C ? C.part(part) : null;
        if (!p) { mode = s.mode = zone ? 'zone' : 'car'; part = null; }
        else zone = p.zone;
      }
      if (mode === 'zone' && !zone) mode = s.mode = 'car';
      s.zone = mode === 'zone' || mode === 'part' ? zone : '';
      s.part = mode === 'part' ? part : null;
      this.ui.dataset.mode = s.mode;
      this.reflect();
      this.renderSwitcher();
      this.renderHead();
      if (!this.ready) { this.applied = false; return; }
      this.applied = true;
      this.userMoved = false;
      this.activeId = null;
      this.buildOverlay();
      const M = this.M;
      if (s.mode === 'showcase' || s.mode === 'car') {
        this.keepZone = null; this.fadeTarget = 0;
        this.view = () => this.preset(s.mode === 'showcase' ? 'showcase' : 'car');
        this.setView(this.view(), instant);
      } else {
        this.keepZone = s.zone; this.fadeTarget = 1;
        if (instant) this.fade = 1;
        this.view = () => this.preset(s.zone);
        if (s.mode === 'part') this.focusPart(s.part, instant);
        else this.setView(this.view(), instant);
      }
      this.controls.autoRotate = false;
      this.dirty = true; this.kick();
      void M;
    }
    focusPart(id, instant) {
      const pin = this.pins.find(p => p.id === id);
      this.setActive(pin || null);
      if (!pin) { this.setView(this.preset(this.state.zone), instant); return; }
      const { THREE } = stage;
      const z = this.preset(this.state.zone);
      const dir = z.pos.clone().sub(z.target);
      const dist = Math.max(1.8, dir.length() * 0.62);
      const target = pin.v.clone().lerp(z.target, 0.3);
      this.view = () => { const zz = this.preset(this.state.zone); const d = zz.pos.clone().sub(zz.target); return { target, pos: target.clone().add(d.setLength(Math.max(1.8, d.length() * 0.62))) }; };
      this.setView({ target, pos: target.clone().add(dir.setLength(dist)) }, instant);
      pin.el.classList.remove('pulse'); void pin.el.offsetWidth; pin.el.classList.add('pulse');
      void THREE;
    }

    // ----- overlay: zone chips (car), numbered pins (zone/part), header, switcher -----
    clearOverlay() {
      this.pins.forEach(p => p.el.remove()); this.chips.forEach(c => c.el.remove());
      this.clusters.forEach(c => c.el.remove()); this.clusters.clear();
      this.pins = []; this.chips = []; this.hideLabel(true);
    }
    buildOverlay() {
      this.clearOverlay();
      const C = core(), s = this.state, M = this.M;
      if (!C || !M) return;
      const { THREE } = stage;
      const car = s.car;
      if (s.mode === 'car') {
        const counts = C.zoneCounts(car);
        for (const z of C.ZONES) {
          const pos = (M.cfg.hs || {})[z.key];
          if (!pos) continue;
          const n = counts[z.key] || 0;
          const el = document.createElement('button');
          el.type = 'button'; el.className = 'v3d-zc' + (n ? '' : ' zero');
          el.innerHTML = `<b>${n}</b><span>${esc(z.label)}</span>`;
          el.setAttribute('aria-label', `${z.label}: ${n} part${n === 1 ? '' : 's'}. Open this area`);
          el.addEventListener('click', () => this.emit('hwbt2:zone', { car, zone: z.key }));
          this.label.before(el);
          this.chips.push({ el, key: z.key, v: new THREE.Vector3(...pos).setY(pos[1] + M.dy), x: 0, y: 0 });
        }
      } else if (s.mode === 'zone' || s.mode === 'part') {
        const list = C.pins(s.zone, car);
        const ck = s.zone + '|' + list.map(p => p.part.id).join(',');
        let lay = M.pinCache.get(ck);
        if (!lay) { lay = AN().layout(M.slug, s.zone, list.map(p => ({ id: p.part.id, position: p.part.position }))); M.pinCache.set(ck, lay); }
        list.forEach((p, i) => {
          const a = lay[i];
          const el = document.createElement('button');
          el.type = 'button'; el.className = 'v3d-pin'; el.textContent = p.n;
          el.setAttribute('aria-label', `${p.n}. ${p.part.name}`);
          const pin = { el, id: p.part.id, n: p.n, part: p.part, v: new THREE.Vector3(...a.pos).setY(a.pos[1] + M.dy), exact: a.exact, basis: a.basis, x: 0, y: 0, behind: false, cl: null };
          el.addEventListener('pointerenter', () => { this.showLabel(pin); this.emit('hwbt2:pin-hover', { id: pin.id, car }); });
          el.addEventListener('pointerleave', () => { this.hideLabel(); this.emit('hwbt2:pin-hover', { id: null, car }); });
          el.addEventListener('focus', () => this.showLabel(pin));
          el.addEventListener('blur', () => this.hideLabel());
          el.addEventListener('click', () => {
            this.setActive(pin);
            el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
            this.emit('hwbt2:pin', { id: pin.id, n: pin.n, car, zone: s.zone });
          });
          this.label.before(el);
          this.pins.push(pin);
        });
        // Occluders for this zone: what stays solid in the x-ray.
        this.occluders = M.meshes.filter(m => !m.glass && m.zones.has(s.zone)).map(m => m.mesh);
      }
      if (this.litId) this.light(this.litId);
    }
    renderHead() {
      const head = this.q('.v3d-head'), s = this.state, C = core();
      if (!(s.mode === 'zone' || s.mode === 'part') || !C || !this.slug) { head.hidden = true; head.innerHTML = ''; return; }
      const z = C.zone(s.zone);
      const n = C.pins(s.zone, s.car).length;
      head.hidden = false;
      head.innerHTML = `<button type="button" class="v3d-back">${BACK_SVG}Whole car</button><div class="v3d-zt"><b>${esc(z ? z.label : s.zone)}</b><span>${n} part${n === 1 ? '' : 's'}</span></div>`;
      head.querySelector('.v3d-back').onclick = () => this.emit('hwbt2:zone', { car: s.car, zone: '' });
    }
    renderSwitcher() {
      const sw = this.q('.v3d-sw');
      if (this.state.mode !== 'showcase') { sw.hidden = true; sw.innerHTML = ''; return; }
      const list = this.showList();
      sw.hidden = false;
      const sig = list.map(x => x.slug).join(',') + '|' + this.slug;
      if (sw.dataset.sig === sig) return;
      sw.dataset.sig = sig;
      sw.innerHTML = list.map(x => `<button type="button" data-slug="${esc(x.slug)}" aria-pressed="${x.slug === this.slug}"><span>${esc(x.make)}</span><b>${esc(x.model)}</b></button>`).join('');
      sw.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.showcaseSet(b.dataset.slug, true)));
      const on = sw.querySelector('[aria-pressed="true"]');
      if (on && sw.scrollWidth > sw.clientWidth) sw.scrollLeft = Math.max(0, on.offsetLeft - (sw.clientWidth - on.offsetWidth) / 2);
    }
    showcaseSet(slugOrCar, user) {
      if (this.state.mode !== 'showcase') return;
      const list = this.showList();
      const C = core();
      let e = list.find(x => x.slug === slugOrCar);
      if (!e && C) { const k = carKey(slugOrCar); e = list.find(x => carKey(x.car) === k); }
      if (!e || e.slug === this.slug) return;
      this.showModel = e.slug;
      this.state.car = e.car;
      this.useModel(e.slug);
      this.renderSwitcher();
      this.reflect();
      this.emit('hwbt2:showcase', { model: e.slug, car: e.car, source: user ? 'user' : 'set' });
    }
    emit(type, detail) { this.el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail })); }

    // ----- labels -----
    showLabel(pin) {
      clearTimeout(this.hideTimer);
      this.labelFor = pin;
      const C = core();
      this.label.innerHTML = `<b>${pin.n}. ${esc(pin.part.name)}</b>${pin.exact ? '' : '<small>Approximate spot</small>'}<a href="${esc(C.href.part(pin.id, this.state.car))}">View part</a>`;
      this.label.classList.add('show');
      pin.el.setAttribute('aria-describedby', this.label.id);
      this.placeLabel();
    }
    showClusterLabel(c) {
      clearTimeout(this.hideTimer);
      this.labelFor = c;
      this.label.innerHTML = `<b>${c.members.length} parts close together</b><small>Parts ${c.members.map(h => h.n).join(', ')}. Tap to zoom in.</small>`;
      this.label.classList.add('show');
      c.el.setAttribute('aria-describedby', this.label.id);
      this.placeLabel();
    }
    hideLabel(now) {
      clearTimeout(this.hideTimer);
      const go = () => {
        if (!now && this.labelFor && this.labelFor.id && this.labelFor.id === this.activeId) return;
        this.label.classList.remove('show');
        if (this.labelFor) this.labelFor.el.removeAttribute('aria-describedby');
        this.labelFor = null;
      };
      if (now) go(); else this.hideTimer = setTimeout(go, 220);
    }
    placeLabel() {
      const f = this.labelFor;
      if (!f) return;
      const lw = this.label.offsetWidth, lh = this.label.offsetHeight;
      let x = f.x - lw / 2, y = f.y - lh - 22;
      if (y < 50) y = f.y + 22;
      x = Math.max(8, Math.min(this.w - lw - 8, x)); y = Math.max(8, Math.min(this.h - lh - 8, y));
      this.label.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    }
    setActive(pin) {
      this.activeId = pin ? pin.id : null;
      this.pins.forEach(p => p.el.classList.toggle('on', p === pin));
      if (pin) this.showLabel(pin); else if (this.labelFor) this.hideLabel(true);
      this.kick();
    }
    light(id) {
      this.litId = id;
      this.pins.forEach(p => p.el.classList.toggle('lit', p.id === id));
    }

    // ----- frame -----
    kick() { this.idle = 0; schedule(); }
    frame(now) {
      if (!this.ready || !this.M || !stage || !this.visible || document.hidden && !this.dirty) return false;
      if (!this.el.isConnected) { queueMicrotask(() => unmount(this.el)); return false; }
      const dt = Math.min(64, now - (this.last || now)); this.last = now;
      let moving = false;
      const c = this.controls;
      if (this.tween) {
        const t = this.tween, k = Math.min(1, (now - t.t0) / t.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        this.camera.position.lerpVectors(t.p0, t.p1, e);
        c.target.lerpVectors(t.q0, t.q1, e);
        if (k >= 1) this.tween = null;
        moving = true;
      }
      const spin = this.state.mode === 'showcase' && !reduced() && !this.tween && !document.hidden && !this.dragging;
      c.autoRotate = spin; c.autoRotateSpeed = 0.5;
      if (c.update(dt / 1000)) moving = true;
      if (spin) moving = true;
      if (this.fade !== this.fadeTarget) {
        const step = reduced() ? 1 : dt / 380;
        this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step);
        moving = true;
      }
      if (moving || this.dirty) { this.renderNow(now); this.dirty = false; }
      if (moving) this.idle = 0; else this.idle++;
      return this.idle < 3;
    }
    // Sets this mount's look on the shared model scene, renders into the shared canvas, copies it here.
    applyLook() {
      const M = this.M, { THREE } = stage;
      const t = this.fade, z = this.keepZone;
      const dark = lum(this.bg) < 0.5;
      for (const m of M.meshes) {
        const ghost = t > 0 && !m.glass && !(z && m.zones.has(z));
        const want = ghost ? m.ghost : m.orig;
        if (m.mesh.material !== want) m.mesh.material = want;
      }
      const op = 1 - t * (dark ? 0.91 : 0.86);
      for (const g of M.ghosts) { g.opacity = op * g.userData.base; g.color.set(dark ? 0x6b717a : 0x9aa1ab); }
      // Glass stays glass in the x-ray, but tinted screens thin out so the zone reads through them.
      for (const g of M.glassMats) g.opacity = g.userData.baseOpacity * (1 - t * 0.6);
      for (const s of M.shadow) s.plane.material.opacity = s.plane.userData.base * (1 - t * 0.75);
      const f = this.floorC;
      M.floor.material.color.setRGB(f[0], f[1], f[2]); M.floor.material.opacity = f[3];
      M.floor.visible = f[3] > 0.003;
      // Rim light from behind the car, relative to this camera, so the outline holds on dark stages.
      const tgt = this.controls.target, cam = this.camera.position;
      const back = tgt.clone().sub(cam).setY(0).normalize();
      M.rim.position.copy(tgt).addScaledVector(back, 6).add(new THREE.Vector3(0, 3.2, 0));
      M.rim.target.position.copy(tgt);
      M.rim.intensity = (M.cfg.rim || 0) * (dark ? 1 : 0.4);
    }
    renderNow(now = performance.now()) {
      if (!this.M || !stage) return;
      if (!this.bg || now - (this.cssT || 0) > 600) { // theme tokens, re-read twice a second at most
        const cs = getComputedStyle(this.el);
        this.bg = cssColor(cs.getPropertyValue('--v3d-bg'), '#0a0a0b');
        this.floorC = cssColor(cs.getPropertyValue('--v3d-floor'), 'rgba(255,255,255,0.075)');
        this.cssT = now;
      }
      const S = stage, r = S.renderer;
      const W = this.cv.width, H = this.cv.height;
      ensureSize(W, H);
      this.applyLook();
      r.setViewport(0, 0, W, H); r.setScissor(0, 0, W, H); r.setScissorTest(true);
      r.setClearColor(0x000000, 0); r.clear();
      r.render(this.M.scene, this.camera);
      r.setScissorTest(false);
      this.ctx.clearRect(0, 0, W, H);
      this.ctx.drawImage(r.domElement, 0, S.h - H, W, H, 0, 0, W, H);
      this.project(now);
    }
    project(now) {
      const cam = this.camera, W = this.w, H = this.h;
      const v = new stage.THREE.Vector3();
      const place = (o) => {
        v.copy(o.v).project(cam);
        o.x = (v.x + 1) / 2 * W; o.y = (1 - v.y) / 2 * H;
        const off = v.z > 1 || o.x < -20 || o.x > W + 20 || o.y < -20 || o.y > H + 20;
        o.el.style.translate = `${o.x.toFixed(1)}px ${o.y.toFixed(1)}px`;
        o.el.style.visibility = off ? 'hidden' : '';
        o.off = off;
      };
      this.chips.forEach(place);
      if (this.chips.length) {
        v.set(0, 0.5, 0).project(cam);
        const cx = (v.x + 1) / 2 * W;
        for (const c of this.chips) c.el.classList.toggle('flip', c.x < cx - 4);
      }
      if (!this.pins.length) return;
      this.pins.forEach(place);
      if (now - this.lastOcc > 180 || !this.tween) {
        this.lastOcc = now;
        const rc = this.rc || (this.rc = new stage.THREE.Raycaster());
        for (const p of this.pins) {
          const dir = p.v.clone().sub(cam.position); const d = dir.length(); dir.normalize();
          rc.set(cam.position, dir); rc.far = d - 0.05;
          p.behind = !!(this.occluders && this.occluders.length && rc.intersectObjects(this.occluders, false)[0]);
          p.el.classList.toggle('behind', p.behind);
        }
      }
      this.cluster();
      this.placeLabel();
    }
    // Pins that would overlap on screen merge into one stacked badge with the count; tapping it zooms in.
    cluster() {
      const T = (this.ui.classList.contains('small') ? 24 : 28) + 3;
      const pts = this.pins.filter(h => !h.off && h.id !== this.activeId);
      const parent = new Map(pts.map(h => [h, h]));
      const find = h => (parent.get(h) === h ? h : find(parent.get(h)));
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const was = a.cl && a.cl === b.cl;
        if (Math.hypot(a.x - b.x, a.y - b.y) < (was ? T + 4 : T)) parent.set(find(a), find(b));
      }
      const groups = new Map();
      for (const h of pts) { const r = find(h); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(h); }
      const gs = [...groups.values()];
      const mid = g => [g.reduce((s, h) => s + h.x, 0) / g.length, g.reduce((s, h) => s + h.y, 0) / g.length];
      for (let merged = true; merged;) {
        merged = false;
        for (let i = 0; i < gs.length && !merged; i++) for (let j = i + 1; j < gs.length && !merged; j++) {
          if (gs[i].length < 2 && gs[j].length < 2) continue;
          const [ax, ay] = mid(gs[i]), [bx, by] = mid(gs[j]);
          if (Math.hypot(ax - bx, ay - by) < T * 1.6) { gs[i] = gs[i].concat(gs[j]); gs.splice(j, 1); merged = true; }
        }
      }
      const next = gs.filter(g => g.length > 1);
      const free = new Set(this.clusters);
      const claimed = next.map(g => {
        let best = null, bestN = 0;
        for (const c of free) { const n = g.filter(h => c.members.includes(h)).length; if (n > bestN) { best = c; bestN = n; } }
        if (best) free.delete(best);
        return best;
      });
      for (const c of free) { if (this.labelFor === c) this.hideLabel(true); c.el.remove(); this.clusters.delete(c); }
      for (const h of this.pins) h.cl = null;
      next.forEach((g, i) => {
        let c = claimed[i];
        if (!c) {
          const el = document.createElement('button');
          el.type = 'button'; el.className = 'v3d-pin v3d-cl';
          c = { el, members: g, x: 0, y: 0, id: null };
          el.addEventListener('pointerenter', () => this.showClusterLabel(c));
          el.addEventListener('pointerleave', () => this.hideLabel());
          el.addEventListener('focus', () => this.showClusterLabel(c));
          el.addEventListener('blur', () => this.hideLabel());
          el.addEventListener('click', () => { this.hideLabel(true); this.zoomTo(c.members); });
          this.label.before(el);
          this.clusters.add(c);
        }
        if (c.el.textContent !== g.length + ' parts' || c.members.length !== g.length || g.some(h => !c.members.includes(h))) {
          c.el.textContent = g.length + ' parts';
          c.el.setAttribute('aria-label', `${g.length} parts close together: ${g.map(h => h.n + '. ' + h.part.name).join(', ')}. Zoom in`);
        }
        c.members = g;
        g.forEach(h => { h.cl = c; });
        c.x = g.reduce((s, h) => s + h.x, 0) / g.length; c.y = g.reduce((s, h) => s + h.y, 0) / g.length;
        c.el.style.translate = `${c.x.toFixed(1)}px ${c.y.toFixed(1)}px`;
      });
      for (const h of this.pins) {
        const inCl = !!h.cl;
        if (h.el.classList.contains('in-cl') !== inCl) { h.el.classList.toggle('in-cl', inCl); h.el.tabIndex = inCl ? -1 : 0; if (inCl && this.labelFor === h && h.id !== this.activeId) this.hideLabel(true); }
      }
    }
    zoomTo(members) {
      const { THREE } = stage, c = this.controls;
      const ctr = members.reduce((s, h) => s.add(h.v), new THREE.Vector3()).multiplyScalar(1 / members.length);
      const target = c.target.clone().lerp(ctr, 0.7);
      const off = this.camera.position.clone().sub(c.target).multiplyScalar(0.6);
      if (off.length() < 1.2) off.setLength(1.2);
      this.userMoved = true;
      this.setView({ target, pos: target.clone().add(off) });
    }

    destroy() {
      this.destroyed = true;
      this.loadToken++;
      this.io.disconnect(); this.ro.disconnect(); this.mo.disconnect();
      if (this.controls) this.controls.dispose();
      if (this.heldSlug) release(this.heldSlug);
      this.heldSlug = null;
      this.ui.remove();
      if (!mounts.size) disposeStageLater();
    }
    snapshot() {
      const s = this.state;
      return {
        mode: s.mode, car: s.car, zone: s.zone, part: s.part, model: this.slug, ready: this.ready && this.ui.classList.contains('ready'),
        failed: this.ui.classList.contains('failed'), error: this.error || null, progress: this.pct ?? null,
        camera: this.camera ? this.camera.position.toArray().map(n => +n.toFixed(3)) : null,
        pins: this.pins.map(p => ({ id: p.id, n: p.n, x: +p.x.toFixed(1), y: +p.y.toFixed(1), behind: p.behind, exact: p.exact, pos: p.v.toArray(), clustered: !!p.cl, on: p.el.classList.contains('on') })),
        chips: this.chips.map(c => ({ zone: c.key, x: +c.x.toFixed(1), y: +c.y.toFixed(1), count: +c.el.querySelector('b').textContent })),
      };
    }
  }

  // ---------- public API ----------
  function mount(el) {
    if (!el || !el.nodeType) return null;
    const ex = mounts.get(el);
    if (ex) { ex.sync(); return ex; }
    const mt = new Mount(el);
    mounts.set(el, mt);
    return mt;
  }
  function unmount(el) {
    const mt = mounts.get(el);
    if (!mt) return;
    mounts.delete(el);
    mt.destroy();
  }
  function scan() {
    for (const el of [...mounts.keys()]) if (!el.isConnected) unmount(el);
    document.querySelectorAll('[data-v3d]').forEach(el => { if (!mounts.has(el)) mount(el); });
  }

  // ---------- events in ----------
  const inCar = (mt, car) => !car || carKey(car) === carKey(mt.state.car);
  window.addEventListener('hwbt2:zone', e => {
    const d = e.detail || {};
    for (const mt of mounts.values()) {
      if (mt.state.mode === 'showcase' || !inCar(mt, d.car)) continue;
      const z = d.zone && core() && core().zone(d.zone) ? d.zone : '';
      if (z) mt.setMode('zone', { zone: z }); else mt.setMode('car', {});
    }
  }, true);
  window.addEventListener('hwbt2:part-focus', e => {
    const d = e.detail || {}, C = core();
    const p = d.id && C ? C.part(d.id) : null;
    if (!p) return;
    for (const mt of mounts.values()) {
      if (mt.state.mode === 'showcase' || !inCar(mt, d.car) || !mt.state.car || !C.fitRole(p, mt.state.car)) continue;
      if ((mt.state.mode === 'zone' || mt.state.mode === 'part') && mt.state.zone === p.zone && mt.ready) {
        mt.state.mode = 'part'; mt.state.part = p.id; mt.ui.dataset.mode = 'part'; mt.reflect();
        mt.focusPart(p.id);
      } else mt.setMode('part', { part: p.id });
    }
  }, true);
  window.addEventListener('hwbt2:showcase-set', e => {
    const d = e.detail || {};
    for (const mt of mounts.values()) if (mt.state.mode === 'showcase') mt.showcaseSet(d.model || d.car);
  }, true);
  window.addEventListener('hwbt2:pin-light', e => {
    const id = (e.detail || {}).id || null;
    for (const mt of mounts.values()) mt.light(id);
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) for (const mt of mounts.values()) mt.kick(); });

  // Renders a poster for a model (used by the poster script): same framing as the showcase at 16:9.
  async function poster(slug, w = 1600, h = 900, type = 'image/webp', quality = 0.75) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;`;
    el.dataset.v3d = ''; el.dataset.mode = 'showcase'; el.dataset.model = slug;
    document.body.appendChild(el);
    const mt = mount(el);
    mt.showModel = slug; mt.sync();
    await new Promise((res, rej) => { const t = setInterval(() => { if (mt.ready) { clearInterval(t); res(); } else if (mt.error) { clearInterval(t); rej(new Error(mt.error)); } }, 50); });
    mt.dpr = 1; mt.cv.width = w; mt.cv.height = h; mt.w = w; mt.h = h;
    mt.camera.aspect = w / h; mt.camera.updateProjectionMatrix();
    mt.setView(mt.preset('showcase'), true);
    mt.renderNow();
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(mt.cv, 0, 0);
    const url = out.toDataURL(type, quality);
    unmount(el); el.remove();
    return url;
  }

  window.HWBT2View = {
    mount, unmount, scan,
    state: el => { const mt = mounts.get(el); return mt ? mt.snapshot() : null; },
    all: () => [...mounts.values()].map(mt => mt.snapshot()),
    info: () => ({
      renderer: !!stage,
      memory: stage ? { ...stage.renderer.info.memory } : null,
      programs: stage && stage.renderer.info.programs ? stage.renderer.info.programs.length : 0,
      models: [...models.entries()].map(([k, e]) => ({ slug: k, refs: e.refs, ready: !!e.M })),
      cached: [...bytes.keys()],
      mounts: mounts.size, three: libRoute,
    }),
    poster,
    _model: slug => { const e = models.get(slug); return e && e.M ? { M: e.M, THREE: stage && stage.THREE } : null; }, // test hooks
    _mount: el => mounts.get(el) || null,
  };
  const boot = () => {
    scan();
    new MutationObserver(muts => { if (muts.some(m => m.addedNodes.length || m.removedNodes.length)) scan(); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
