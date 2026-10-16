// HWBT Research Box v2: 3D anchors for the multi-car navigator (v2/data/viewer.js).
// Model space as loaded in three.js, metres: Y up, nose = +X, driver's left = -Z, wheels on y = 0
// (refs/3d/model.md and refs/3d/<slug>/model.md). Keyed by the 3D slug (HWBT2.veh.models3d).
//
// None of the six source models has a mesh per part, so EVERY part anchor here is an estimate, placed
// from the mesh bounding boxes in the model.md files and the part's location in the data. `basis` says
// what each one was placed against. Parts without an anchor get a spread slot around the zone centre
// (layout() below), also marked estimated. Exposes window.HWBT2_ANCHORS.
(function (root) {
  const ZONE_KEYS = ['front', 'front-axle', 'cabin', 'engine', 'gearbox', 'rear', 'underbody', 'wheels'];

  // Presets, zone hotspots and pin areas follow from a few measured numbers per car:
  // nose/tail x, roof height h, wheel centre z (zW), axle x (xF, xR), cabin centre, engine and gearbox centres.
  function build(d) {
    const k = (d.nose - d.tail) / 4.46;            // distance scale against the 4.46 m Veyron
    const P = (target, pos) => ({ target, pos });
    const E = d.eng, G = d.gear, mid = !d.frontEngine;
    const presets = {
      showcase: P([0, 0.48, 0], [3.75 * k, 1.5, 4.75 * k]),
      car: P([0, 0.52, 0], [0.9 * k, 2.35, 6.5 * k]),
      front: P([d.nose - 0.75, 0.5, 0], [d.nose + 2.9, 1.55, 2.7]),
      'front-axle': P([d.xF, 0.38, 0], [d.xF + 2.2, 1.35, -3.5]),
      cabin: P([d.cab, 0.72, 0], [d.cab + 1.5, 3.5, 3.1]),
      engine: mid ? P([E[0], E[1], 0], [E[0] - 2.3, 3.3, 2.0]) : P([E[0], E[1], 0], [E[0] + 2.3, 3.3, 2.0]),
      gearbox: P([G[0], G[1], 0], [G[0] - 2.8, 2.3, 2.4]),
      rear: P([d.tail + 0.75, 0.55, 0], [d.tail - 2.9, 1.55, 2.7]),
      underbody: P([0, 0.28, 0], [0.7, 0.55, 6.1 * k]),
      wheels: P([0, 0.38, 0], [0.6, 1.0, -4.9 * k]),
    };
    // Zone hotspots for the whole-car view (seen from the right, +Z). Spaced at least 0.45 m apart.
    const hs = {
      front: [d.nose - 0.22, 0.55, 0],
      'front-axle': [d.xF, 0.36, d.zW],
      cabin: [d.cab, d.h - 0.18, 0],
      engine: mid ? [E[0] + 0.1, d.h - 0.05 > 1.1 ? 1.1 : d.h - 0.05, 0] : [E[0], d.bonnet || 1.05, 0],
      gearbox: G.hs || (mid ? [G[0], Math.min(d.h - 0.3, G[1] + 0.32), 0] : [G[0], G[1] + 0.2, 0]),
      rear: [d.tail + 0.1, 0.45, 0],
      underbody: [-0.15, 0.13, d.zW - 0.05],
      wheels: [d.xR, 0.36, d.zW],
    };
    // Pin areas: centre + the plane pins spread in when they have no exact anchor.
    const wheelSlots = [];
    for (const [x, tag] of [[d.xF, 'Front'], [d.xR, 'Rear']]) {
      for (const [dx, dy] of [[0, 0], [-0.2, 0.12], [0.2, 0.12], [0, 0.24], [-0.22, -0.1], [0.22, -0.1]]) wheelSlots.push({ pos: [x + dx, 0.36 + dy, -d.zW - 0.17], tag }); // on the outer face, not inside the tyre
    }
    const area = {
      front: { c: [d.nose - 0.4, 0.55, 0], axes: 'zy', half: [0.75, 0.18] },
      'front-axle': { c: [d.xF, 0.36, 0], axes: 'xz', half: [0.3, 0.7] },
      cabin: { c: [d.cab, 0.68, 0], axes: 'xz', half: [0.65, 0.5] },
      engine: { c: [E[0], E[1], 0], axes: 'xz', half: [0.6, 0.45] },
      gearbox: { c: [G[0], G[1], 0], axes: 'xz', half: [0.35, 0.45] },
      rear: { c: [d.tail + 0.3, 0.6, 0], axes: 'zy', half: [0.75, 0.2] },
      underbody: { c: [0, 0.24, 0], axes: 'xz', half: [1.5, 0.35] },
      wheels: { c: [d.xF, 0.36, -d.zW - 0.17], slots: wheelSlots },
    };
    for (const z of ZONE_KEYS) { // zone views: pull back 20 % so the zone sits in context, not cropped
      const p = presets[z], t = p.target;
      p.pos = p.pos.map((v, i) => t[i] + (v - t[i]) * 1.2);
    }
    return { presets, hs, area };
  }

  const M = {};

  // ---------- Bugatti Veyron 16.4 (named groups; W16 modelled) ----------
  M.veyron = {
    dims: { nose: 2.231, tail: -2.231, h: 1.23, zW: 0.77, xF: 1.29, xR: -1.41, cab: 0.2, eng: [-1.1, 0.84], gear: [-1.55, 0.72] },
    glass: /^(Glass|Red_Light_Glass|White_Light_Glass|Side_Mirrors_Glass|White_Light_Designed_Glass)$/,
    keep: {
      front: /(Front_Grill|Front_Griil|Front_Storage|Front_Light|Headlight|Car_Front|Bugatti_Logo_|Hood_Connectors)/,
      'front-axle': /(Front_[LR]_Tyre|Front_Tyre_[LR])/,
      cabin: /(Door_[LR]_Inside|Door_[LR]_Interior|Door_[LR]_Controller|Car_Control|Metal_Shaft)/,
      engine: /(Engine_Cylinder|Engine_Pistons|Air_Flow|Gear_[LR]|Internal_Grid)/,
      gearbox: /(Engine_Cylinder|Engine_Pistons|Gear_[LR]|Back_[LR]_Tyre_Axle|Internal_Grid)/,
      rear: /(Back_Light|Strip_Light|Reflectors|Exhaust|Number_Plate|Bugatti_Back_Logo|Spoiler)/,
      underbody: /(Car_Bottom|Exhaust|Bottom_Side_Parts|_Tyre_Axle)/,
      wheels: /_Tyre/,
    },
    rim: 0.6,
    parts: {
      'bugatti-veyron-16-4-headlight-left': { pos: [1.88, 0.58, -0.62], basis: 'Front_Lights_89 box (x 1.67 to 2.05, y 0.52 to 0.63, z to -0.81), left cluster.' },
      'bugatti-veyron-16-4-trunk-lid-cover': { pos: [1.58, 0.8, 0], basis: 'Top of Hood_104 over the front storage area, centre line.' },
      'veyron-haldex-fluid': { pos: [1.29, 0.3, 0], basis: 'Front axle centre line (Front_*_Tyre_Axle, x 1.27 to 1.32, y 0.33 to 0.37), under the frunk.' },
      'bugatti-veyron-16-4-mirror-switch': { pos: [0.4, 0.62, -0.6], basis: 'Driver door card (Door_L_Inside_*), at armrest height.' },
      'veyron-air-filters': { pos: [-1.3, 0.87, 0.41], basis: 'Under the right roof scoop (Engine_Coolers_Covers_00_72, z +-0.45), outboard of the engine cover.' },
      'veyron-maf-sensors': { pos: [-1.26, 0.92, -0.39], basis: 'Left intake tract under the left roof scoop, between filter housing and throttle side.' },
      'veyron-ignition-coils': { pos: [-1.06, 0.93, -0.19], basis: 'Left cylinder bank, on top of the heads next to Engine_Cylinders_Extension_01_L_80.' },
      'veyron-spark-plugs': { pos: [-0.86, 0.9, 0.2], basis: 'Right bank head, front half of Engine_Coolers_Covers_01_74 / Engine_Cylinders_78.' },
      'bugatti-veyron-16-4-turbocharger': { pos: [-1.52, 0.62, 0.36], basis: 'Low at the rear corner of the W16 block (Engine_Cylinders_78 box ends at x -1.71).' },
      'bugatti-veyron-16-4-camshaft-sensor': { pos: [-0.7, 0.86, -0.1], basis: 'Front end of the cylinder heads, next to the bulkhead (engine box starts at x -0.52).' },
      'bugatti-veyron-16-4-alternator': { pos: [-0.74, 0.6, 0.3], basis: 'Low on the front face of the block, right side.' },
      'bugatti-veyron-16-4-alternator-harness': { pos: [-0.86, 0.5, 0.05], basis: 'Between the alternator and the block centre, below the heads.' },
      'bugatti-veyron-16-4-secondary-air-pump': { pos: [-1.62, 0.55, -0.36], basis: 'Low rear left corner of the engine bay, behind the left bank.' },
      'bugatti-veyron-16-4-air-filter-housing': { pos: [-1.46, 0.82, -0.5], basis: 'Left intake, under the left roof scoop (z -0.45), behind the MAF.' },
      'bugatti-veyron-16-4-boost-pressure-sensor': { pos: [-1.2, 0.98, 0.02], basis: 'Intake plenum on the centre line, top of the engine.' },
      'veyron-gearbox-pump-motor': { pos: [-1.6, 0.8, 0.13], basis: 'Rear of the engine bay ahead of Internal_Grid_107 (x -1.71), on top of the DSG.' },
      'veyron-gearbox-accumulators': { pos: [-1.56, 0.78, -0.17], basis: 'Same gearbox top, the other side of the pump.' },
      'bugatti-veyron-16-4-tail-light-left': { pos: [-2.05, 0.68, -0.72], basis: 'Back_Lights box (x -2.16 to -1.82, y 0.51 to 0.83, z to -0.94), left lamp.' },
      'bugatti-veyron-16-4-tail-light-right': { pos: [-2.05, 0.68, 0.72], basis: 'Back_Lights box, right lamp.' },
      'bugatti-veyron-16-4-in-tank-fuel-hose': { pos: [-0.45, 0.3, 0.14], basis: 'Fuel tank between cabin and engine, low on the centre line (no tank mesh).' },
      'bugatti-veyron-16-4-fuel-tank-control-unit': { pos: [-0.45, 0.42, -0.2], basis: 'Top of the same tank, left of centre.' },
      'bugatti-veyron-16-4-brake-pads': { pos: [1.16, 0.48, -0.93], basis: 'Front_L_Tyre_Break_Caliper (front left wheel box x 0.94 to 1.64, z to -0.91).' },
      'bugatti-veyron-16-4-tyres-pax': { pos: [-1.41, 0.73, -0.8], basis: 'Top of the rear left tyre tread (Back_L_Tyre_4).' },
      'bugatti-veyron-16-4-wheel': { pos: [-1.41, 0.35, -0.94], basis: 'Rear left rim hub (Back_L_Tyre_Rim).' },
    },
  };

  // ---------- Lamborghini Aventador SVJ (named groups; no engine modelled) ----------
  M['lamborghini-aventador-svj'] = {
    dims: { nose: 2.472, tail: -2.472, h: 1.143, zW: 0.85, xF: 1.23, xR: -1.48, cab: 0.2, eng: [-1.3, 0.72], gear: [-1.95, 0.55] },
    glass: /^(GLASS|GlassLights|HdLightsLens)$/,
    keep: {
      front: /(Headlights|Trunk)/,
      'front-axle': /(WheelFrLeft|BrakeFr)/,
      cabin: /(intPlastic|intAlcantara|intTexButtons)/,
      engine: /(MetalRedEngine|MetalExhaust)/,
      gearbox: /(MetalRedEngine|WheelRearLeft|BrakeRearLeft)/,
      rear: /(Taillights|Body\.001|Body001|MetalExhaust)/,
      underbody: /(Undercarriage)/,
      wheels: /(Wheel|Brake)/,
    },
    rim: 0.5,
    parts: {
      'svj-lambda-sensors': { pos: [-1.78, 0.45, 0.32], basis: 'Exhaust front pipes behind the V12, low at the rear of the engine bay (EngineHood box x -2.06 to -0.66).' },
      'svj-engine-cover-latches': { pos: [-1.98, 0.94, 0.6], basis: 'Rear corners of EngineHood_2 (z +-0.75, y 0.89 to 1.13).' },
      'svj-handbrake-motor': { pos: [-1.36, 0.42, -0.74], basis: 'BrakeRearLeft_10, on the back of the rear left caliper.' },
    },
  };

  // ---------- McLaren 570S (named groups; simple V8 blocks modelled) ----------
  M['mclaren-570s'] = {
    dims: { nose: 2.265, tail: -2.265, h: 1.208, zW: 0.8, xF: 1.19, xR: -1.48, cab: 0.0, eng: [-1.05, 0.66], gear: [-1.7, 0.5] },
    glass: /^(Glass_ext|glass|glass\.headlights)$/,
    keep: {
      front: /(front_|splitter|radiator|headlights|indicator-light-side-front|indicator_light_side_front)/,
      'front-axle': /((bolts|brake-caliper|brake-wheel-cube|wheel-base)-(left|right)_|tire-front)/,
      cabin: /(seats|dashboard|interior|steering)/,
      engine: /(v8|exhaust-engine|exhaust-pipe-engine|bars-engine|box_|bar-axis|transmission)/,
      gearbox: /(transmission|bar-axis|bar_axis|v8)/,
      rear: /(rear-|rear_|exhaust-piece|exhaust_piece|exhaust-pipe\.001|exhaust_pipe001)/,
      underbody: /(floor|side-skirts|side_skirts|transmission)/,
      wheels: /(wheel-base|wheel_base|tire|brake-|brake_|bolts)/,
    },
    rim: 0.5,
    parts: {
      'mclaren-12c-air-filter': { pos: [-1.82, 0.74, 0.48], basis: 'Rear corner of the engine bay over the right rear wheel (engine bay box x -2.14 to -0.43, y to 0.96).' },
      'mclaren-720s-front-pad-wear-sensor': { pos: [1.06, 0.47, -1.0], basis: 'brake-caliper-left_8 (front left wheel box x 0.82 to 1.56, z to -1.04).' },
    },
  };

  // ---------- Ferrari 458 Spider (named + many unnamed fer_* groups; no engine modelled) ----------
  M['ferrari-458-spider'] = {
    dims: { nose: 2.264, tail: -2.264, h: 1.234, zW: 0.84, xF: 1.16, xR: -1.5, cab: 0.25, eng: [-1.12, 0.66], gear: [-1.7, 0.45] },
    glass: /^(Translucent_Glass_Gray|Taillight_Glass|Projector_Glass)$/,
    keep: {
      front: /(Front_Bumper|Plastic_Under_Parts|Horse_Front|Headlight|Projector_Housing|LED_Markers|LED_Turn_Markers)/,
      'front-axle': /(Rim\b|Rim_2|Tire\b|Tire_2|Brake_Rotor_2\b|fer_f12_10\b|fer_f12_10_2|Front_Brakes)/,
      cabin: /(Seat_|Bucket_Seat|Steering_Wheel|Leather_Interior|Interior_Plastics|Carbon_Fiber_Trim|AC_Vents_Trim|Dashboard_Trim|Instrumentation|Selector_Switch|Right_Door_Interior|Tachometer)/,
      engine: /(Engine_Underbelly|Transmission_Casing|Side_Exhaust_Pipe)/,
      gearbox: /(Transmission_Casing|Engine_Underbelly)/,
      rear: /(Rear_Bumper|Rear_Body_Panel|Tail_Light_Assembly|Brake_Cover|Rear_Diffuser|Diffusers|Exhaust_Trim|Side_Exhaust_Pipe|Rear_Fog_Light|Third_Brake_Light|Plate_Light_Frame)/,
      underbody: /(Engine_Underbelly|Transmission_Casing|Plastic_Under_Parts|Running_Board|Rear_Diffuser)/,
      wheels: /(Rim|Tire|Brake_Rotor|fer_f12_10|Air_Valve|inner_rim|Brakes|Rotor_Lock)/,
    },
    rim: 0.5,
    parts: {
      'ferrari-458-italia-brake-light-switch': { pos: [0.78, 0.4, -0.36], basis: 'Driver footwell pedal box (left-hand drive, steering wheel at z -0.35), ahead of the seats.' },
      'ferrari-458-italia-rain-sensor': { pos: [0.32, 1.06, 0], basis: 'Top centre of the windscreen (fer_458sp8 glass, Windshield_Pillar top).' },
      'ferrari-458-italia-oil-filter': { pos: [-0.82, 0.6, 0.3], basis: 'Front right of the V8 under Engine_Bay_Bonnet (bay x -2.03 to -0.46).' },
      'ferrari-458-italia-rear-lambda-sensor': { pos: [-1.78, 0.38, -0.3], basis: 'Downstream of the left catalyst, low at the rear of the bay, ahead of the silencer.' },
      'ferrari-458-italia-throttle-body': { pos: [-1.02, 0.86, 0], basis: 'Intake plenum on the centre line under the deck lid.' },
      'ferrari-458-italia-ignition-coil': { pos: [-1.25, 0.8, 0.3], basis: 'Right cylinder bank top (V8 between the rear fenders, z +-0.35).' },
      'ferrari-458-italia-spark-plug': { pos: [-1.45, 0.76, -0.3], basis: 'Left cylinder bank head.' },
      'ferrari-458-italia-rear-silencer': { pos: [-1.96, 0.42, 0.4], basis: 'Right half of the rear silencer box above Rear_Diffuser, ahead of the Exhaust_Trim.' },
      'ferrari-458-italia-tpms-sensor': { pos: [-1.5, 0.55, -0.98], basis: 'Air_Valve on the rear left rim (Rim_1).' },
      'ferrari-458-italia-front-brake-pads': { pos: [1.04, 0.47, -0.98], basis: 'Front left caliper fer_f12_10 (FL wheel box x 0.80 to 1.51, z to -0.97).' },
      'ferrari-458-italia-rear-shock': { pos: [-1.44, 0.66, -0.62], basis: 'Above the rear left hub, inboard of the tyre (Tire_1).' },
    },
  };

  // ---------- Maserati GranTurismo MC 2018 (no semantic names, body is one mesh: material keep only) ----------
  M['maserati-granturismo-mc'] = {
    dims: { nose: 2.46, tail: -2.46, h: 1.386, zW: 0.81, xF: 1.54, xR: -1.4, cab: -0.35, eng: [1.12, 0.7], gear: [-1.4, 0.42], frontEngine: true, bonnet: 1.06 },
    glass: /^(GlassClear|GlassRed|Window|WindowDark|GlassAmber)$/,
    keep: {
      front: /(Grille1A|Grille4A|Grille6A|Grille2A|Lights|GlassClear)/,
      'front-axle': /(Wheel[123]A|Caliper)/,
      cabin: /(Interior)/,
      engine: /(\|Engine$|\|Engine\||EngineOpacity)/,
      gearbox: /(\|Engine$|\|Engine\|)/,
      rear: /(GlassRed|Lights)/,
      underbody: /(Carbon1|\|Base$|\|Base\||Coloured|\|Engine$|\|Engine\|)/,
      wheels: /(Wheel[123]A|Caliper)/,
    },
    rim: 0.5,
    parts: {
      'ferrari-458-italia-brake-light-switch': { pos: [0.62, 0.42, -0.36], basis: 'Driver footwell pedal box (left-hand drive), cabin box starts at x 1.01.' },
      'ferrari-458-italia-rain-sensor': { pos: [0.08, 1.24, 0], basis: 'Top centre of the windscreen (Window material, cabin box top y 1.34).' },
      'ferrari-f430-alternator-belt-tensioner-pulley': { pos: [1.86, 0.62, 0.22], basis: 'Front face of the V8 behind the radiator, inside the Engine mesh box.' },
      'ferrari-f430-starter-motor': { pos: [0.92, 0.45, -0.32], basis: 'Low on the left side of the block, at the bellhousing end.' },
      'maserati-mc20-oil-filter': { pos: [1.5, 0.5, 0.36], basis: 'Low on the right front of the block.' },
      'ferrari-f430-front-lambda-sensor': { pos: [1.0, 0.52, 0.44], basis: 'Right exhaust manifold outlet, beside the block.' },
      'ferrari-458-italia-rear-lambda-sensor': { pos: [0.5, 0.3, -0.4], basis: 'Downstream of the left catalyst, under the front footwell.' },
      'ferrari-f430-secondary-air-valve': { pos: [1.55, 0.86, -0.26], basis: 'Top left of the engine under the bonnet vents (Grille5A).' },
      'ferrari-458-italia-throttle-body': { pos: [1.15, 0.9, 0], basis: 'Intake plenum on the centre line under the bonnet.' },
      'ferrari-f430-diff-oil-seal-lh': { pos: [-1.4, 0.34, -0.2], basis: 'Left output of the rear differential on the rear axle line (x -1.40).' },
      'ferrari-458-italia-tpms-sensor': { pos: [-1.4, 0.55, -0.97], basis: 'Valve on the rear left rim (left wheel groups _36/_38/_40).' },
    },
  };

  // ---------- Rolls-Royce Ghost (no semantic names: material keep only; no engine modelled) ----------
  M['rolls-royce-ghost'] = {
    dims: { nose: 2.7, tail: -2.7, h: 1.573, zW: 0.83, xF: 1.79, xR: -1.5, cab: -0.2, eng: [1.6, 0.74], gear: [0.45, 0.4], frontEngine: true, bonnet: 1.16 },
    glass: /^(windshield_shad1|light_glass_shad|hdlight_inner_glass_shad|extra_light_glass_shad|brake_light_glass_shad|tailinght_inner_glass_shad)$/,
    keep: {
      front: /(hdlight|headlight|ext_light_shad|small_light_shad)/,
      'front-axle': /(brake_shad|rim_shad|wheel_rubber_shad)/,
      cabin: /(int_blocking_shad)/,
      engine: /(?!)/,
      gearbox: /(?!)/,
      rear: /(tailight|tailinght|brake_light)/,
      underbody: /(ext_matte_shad)/,
      wheels: /(brake_shad|rim_shad|wheel_rubber_shad)/,
    },
    rim: 2.4,       // black body on a near-black stage: a rim light keeps the outline
    envBoost: 1.25,
    overrides: {
      // Gearbox sits in the transmission tunnel under the front seats: look from the side, low.
      gearbox: { preset: { target: [0.45, 0.42, 0], pos: [1.4, 1.6, 4.4] }, hs: [0.45, 0.62, 0] },
    },
    parts: {
      'rolls-royce-ghost-rr4-wiper-blades': { pos: [0.98, 1.1, 0.25], basis: 'Base of the windscreen (g_14) at the scuttle, right blade.' },
      'rolls-royce-ghost-rr4-xenon-bulb': { pos: [2.32, 0.76, 0.66], basis: 'Back of the right headlamp (headlight box x 2.13 to 2.51, y 0.64 to 0.86).' },
      'rolls-royce-ghost-rr4-tie-rod-end': { pos: [1.72, 0.36, -0.64], basis: 'Inboard of the front left wheel (FL box x 1.41 to 2.16, z -0.97 to -0.69), behind the hub.' },
      'rolls-royce-ghost-rr4-tension-strut-left': { pos: [2.08, 0.3, -0.46], basis: 'Ahead of the front left hub, low, running to the subframe.' },
      'rolls-royce-ghost-rr4-cabin-filter': { pos: [0.86, 0.92, 0.4], basis: 'Scuttle housing under the windscreen base, right side.' },
      'ghost-idrive': { pos: [0.12, 0.66, 0], basis: 'Centre console between the front seats (interior int_* box).' },
      'rolls-royce-ghost-rr4-water-pump': { pos: [2.16, 0.68, 0], basis: 'Front face of the V12, behind the grille surround (g_116), under the bonnet (g_105).' },
      'rolls-royce-ghost-rr4-thermostat': { pos: [2.02, 0.84, -0.26], basis: 'Top front left of the engine.' },
      'rolls-royce-ghost-rr4-battery': { pos: [1.12, 0.84, 0.62], basis: 'Placed in the engine bay because the data lists it in the engine zone. On the RR4 the main battery sits in the boot; check before relying on this pin.' },
      'rolls-royce-ghost-rr4-engine-mount-left': { pos: [1.45, 0.44, -0.42], basis: 'Low left side of the block on the front subframe.' },
      'rolls-royce-ghost-rr4-oil-filter': { pos: [1.76, 0.54, 0.38], basis: 'Low right front of the block.' },
      'rolls-royce-ghost-rr4-lambda-probe': { pos: [1.22, 0.46, 0.5], basis: 'Right exhaust manifold outlet, beside the block.' },
      'rolls-royce-ghost-rr4-air-filter': { pos: [2.22, 0.9, 0.46], basis: 'Right front corner of the bay, under the bonnet (g_105 box x 0.98 to 2.44).' },
      'rolls-royce-ghost-rr4-maf-sensor': { pos: [1.96, 0.94, 0.62], basis: 'Right intake duct, after the air filter box.' },
      'rolls-royce-ghost-rr4-ignition-coil': { pos: [1.56, 0.98, 0.24], basis: 'Top of the right cylinder bank.' },
      'rolls-royce-ghost-rr4-spark-plug': { pos: [1.34, 0.92, -0.26], basis: 'Left cylinder bank head.' },
      'rolls-royce-ghost-rr4-transmission-filter-pan': { pos: [0.45, 0.24, 0], basis: 'Underside of the ZF 8HP in the transmission tunnel, behind the engine.' },
      'rolls-royce-ghost-rr4-flex-disc': { pos: [-0.12, 0.3, 0], basis: 'Gearbox output to the propshaft, centre line under the floor.' },
      'rolls-royce-ghost-rr4-front-brake-disc-left': { pos: [1.86, 0.28, -0.98], basis: 'Front left disc face (brake_shad in the FL wheel group g_164 to g_168).' },
      'rolls-royce-ghost-rr4-front-brake-pads': { pos: [1.62, 0.5, -0.98], basis: 'Front left caliper, top rear of the disc.' },
    },
  };

  // Resolve presets / hotspots / areas once per model.
  for (const [slug, m] of Object.entries(M)) {
    const b = build(m.dims);
    for (const [z, o] of Object.entries(m.overrides || {})) {
      if (o.preset) b.presets[z] = o.preset;
      if (o.hs) b.hs[z] = o.hs;
      if (o.area) b.area[z] = o.area;
    }
    Object.assign(m, b, { slug });
  }

  // ---------- pin layout ----------
  // Exact (estimated) anchors first; every other pin takes the free slot nearest the zone centre,
  // biased by its position words (Left/Right/Front/Rear). Pins never sit closer than `minGap` metres.
  const STEP = 0.2, MIN_GAP = 0.19;
  const AX = { x: 0, y: 1, z: 2 };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function candidates(area) {
    if (area.slots) return area.slots.map(s => ({ pos: s.pos.slice(), tag: s.tag }));
    const [a1, a2] = area.axes.split('').map(c => AX[c]);
    const out = [];
    const n1 = Math.floor(area.half[0] / STEP), n2 = Math.floor(area.half[1] / (STEP * 0.866));
    for (let j = -n2; j <= n2; j++) {
      const off = (Math.abs(j) % 2) * STEP / 2;
      for (let i = -n1 - 1; i <= n1; i++) {
        const u = i * STEP + off;
        if (Math.abs(u) > area.half[0] + 1e-6) continue;
        const p = area.c.slice();
        p[a1] += u; p[a2] += j * STEP * 0.866;
        out.push({ pos: p });
      }
    }
    return out;
  }
  function bias(area, words) {
    const c = area.c.slice();
    const w = (words || []).map(s => String(s).toLowerCase());
    if (w.includes('left')) c[2] -= 0.5;
    if (w.includes('right')) c[2] += 0.5;
    if (w.includes('front')) c[0] += 0.6;
    if (w.includes('rear')) c[0] -= 0.6;
    return c;
  }
  // pins: [{id, position?:[words]}] in list order. Returns [{id, pos, exact, estimated:true, basis}].
  function layout(slug, zone, pins) {
    const m = M[slug];
    if (!m) return [];
    const area = m.area[zone] || { c: [0, 0.5, 0], axes: 'xz', half: [0.6, 0.4] };
    const placed = [];
    const free = p => placed.every(q => dist(q.pos, p) >= MIN_GAP);
    const out = pins.map(p => ({ id: p.id, words: p.position || [], pos: null, exact: false, estimated: true, basis: '' }));
    for (const o of out) {
      const a = m.parts[o.id];
      if (a && free(a.pos)) { o.pos = a.pos.slice(); o.exact = true; o.basis = a.basis; placed.push(o); }
    }
    const cand = candidates(area);
    for (const o of out) {
      if (o.pos) continue;
      const want = bias(area, o.words);
      const tagged = o.words.map(s => String(s).toLowerCase());
      let best = null, bestD = Infinity;
      for (const c of cand) {
        if (!free(c.pos)) continue;
        let d = dist(c.pos, want);
        if (c.tag && (tagged.includes('front') || tagged.includes('rear')) && !tagged.includes(c.tag.toLowerCase())) d += 5;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) { // area full: step outwards along the first axis until free
        const p = area.c.slice();
        for (let i = 1; i < 60 && !free(p); i++) p[1] = area.c[1] + i * MIN_GAP;
        best = { pos: p };
      }
      o.pos = best.pos.slice();
      o.basis = (m.parts[o.id] ? 'Exact estimate collided with another pin; moved to the nearest free slot. ' : '') + 'Spread slot in the ' + zone + ' area, no exact anchor.';
      placed.push(o);
    }
    return out.map(({ words, ...r }) => r);
  }

  root.HWBT2_ANCHORS = { models: M, layout, ZONE_KEYS, MIN_GAP };
})(typeof window !== 'undefined' ? window : globalThis);
