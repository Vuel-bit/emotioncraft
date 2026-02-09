// Emotioncraft render_wells_update.js — MVP wells per-frame updates (Chunk 3)
(() => {
  const EC = (window.EC = window.EC || {});
  const clamp = EC.clamp;
  const R = (EC.TUNE && EC.TUNE.RENDER) || {};
  // Render tunables live in EC.TUNE.RENDER (see core_tuning.js)
  const MVP_WELL_COLORS = R.MVP_WELL_COLORS;
  const MVP_WELL_NAME = R.MVP_WELL_NAME;

  function mixRgb(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    const r = (ar + (br - ar) * t) | 0;
    const g = (ag + (bg - ag) * t) | 0;
    const bl = (ab + (bb - ab) * t) | 0;
    return (r << 16) | (g << 8) | bl;
  }

  function mixTowardWhite(rgb, k) {
    k = clamp(k, 0, 1);
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    const nr = (r + (255 - r) * k) | 0;
    const ng = (g + (255 - g) * k) | 0;
    const nb = (b + (255 - b) * k) | 0;
    return (nr << 16) | (ng << 8) | nb;
  }

  function mixToward(rgb, target, k) {
    k = clamp(k, 0, 1);
    const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
    const tr = (target >> 16) & 255, tg = (target >> 8) & 255, tb = target & 255;
    const nr = (r + (tr - r) * k) | 0;
    const ng = (g + (tg - g) * k) | 0;
    const nb = (b + (tb - b) * k) | 0;
    return ((nr & 255) << 16) | ((ng & 255) << 8) | (nb & 255);
  }

  function clampChannelFloor(rgb, floor) {
    const r = Math.max(floor, (rgb >> 16) & 255);
    const g = Math.max(floor, (rgb >> 8) & 255);
    const b = Math.max(floor, rgb & 255);
    return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
  }

  // Cheap saturation/depth boost without HSV conversion.
  // Push channels away from their mean (saturation) and optionally darken slightly (depth).
  function saturateAndDeepen(rgb, satBoost, darkenK) {
    satBoost = satBoost || 0;
    darkenK = darkenK || 0;
    const r0 = (rgb >> 16) & 255;
    const g0 = (rgb >> 8) & 255;
    const b0 = rgb & 255;
    const m = (r0 + g0 + b0) / 3;
    const k = 1 + satBoost;
    let r = m + (r0 - m) * k;
    let g = m + (g0 - m) * k;
    let b = m + (b0 - m) * k;
    // Depth: mix toward black a bit (keeps highlights handled by other layers)
    r = r * (1 - darkenK);
    g = g * (1 - darkenK);
    b = b * (1 - darkenK);
    r = Math.max(0, Math.min(255, r)) | 0;
    g = Math.max(0, Math.min(255, g)) | 0;
    b = Math.max(0, Math.min(255, b)) | 0;
    return (r << 16) | (g << 8) | b;
  }

  EC.RENDER_WELLS_UPDATE = EC.RENDER_WELLS_UPDATE || {};

  function computeMvpWellRadius(A, minR, maxR, Amax) {
    const a = Math.max(0, A || 0);
    const t = (Amax > 0) ? clamp(a / Amax, 0, 1) : 0;
    const r2 = (minR * minR) + (maxR * maxR - minR * minR) * t;
    return Math.sqrt(r2);
  }

  // Canonical visual spin mapping (VISUALS ONLY).
  // - spinRaw comes from SIM.wellsS[i] (expected -100..100)
  // - dir: +1 CW, -1 CCW, 0 inert
  // - omega: rad/s (directional rotation rate)
  // - magEff: 0..1 used for alphas/contrast
  function spinVisual(spinRaw) {
    spinRaw = (typeof spinRaw === 'number') ? spinRaw : 0;
    const dir = (spinRaw > 0) ? 1 : ((spinRaw < 0) ? -1 : 0);
    const spinNorm = clamp(Math.abs(spinRaw) / 100, 0, 1);
    const magEff = spinNorm;
    const omegaMax = (typeof MVP_OMEGA_MAX === 'number') ? MVP_OMEGA_MAX : 3.40; // rad/s
    const gamma = (typeof MVP_OMEGA_GAMMA === 'number') ? MVP_OMEGA_GAMMA : 1.40;
    const omega = (dir === 0) ? 0 : (dir * omegaMax * Math.pow(spinNorm, gamma));
    return { dir, spinNorm, magEff, omega };
  }
  // Expose for debug / reuse by other renderers (keeps layers consistent).
  EC.RENDER = EC.RENDER || {};
  if (!EC.RENDER.spinVisual) EC.RENDER.spinVisual = spinVisual;
  
  function drawSpinIndicator(g, r, s, tNow) {
    // Clean, consistent circular arrow glyph:
    // - Fixed arc span
    // - Single arrowhead at the end
    // - Direction flips with sign(s)
    // - Thickness/opacity scale with |s|
    const mag = Math.min(1, Math.max(0, Math.abs(s || 0)));
    if (mag <= 0.001) return;
    const cw = (s || 0) > 0;
  
    const pad = Math.max(4, r * 0.18);
    const arcR = Math.max(6, r - pad);
    const thickness = Math.max(2, r * 0.06) + (r * 0.06) * mag;
    const alpha = 0.22 + 0.55 * mag;
  
    const arcLen = Math.PI * 1.45;
    const startAngle = -Math.PI * 0.85;
    const endAngle = cw ? (startAngle + arcLen) : (startAngle - arcLen);
  
    g.lineStyle(thickness, 0x0b0f16, alpha, 0.5);
    g.arc(0, 0, arcR, startAngle, endAngle, !cw);
  
    // Arrowhead at the end of the arc
    const ex = Math.cos(endAngle) * arcR;
    const ey = Math.sin(endAngle) * arcR;
    const head = Math.max(5, r * 0.14);
    // Tangent direction at end of arc
    const tanAng = endAngle + (cw ? Math.PI / 2 : -Math.PI / 2);
    const left = tanAng + Math.PI * 0.80;
    const right = tanAng - Math.PI * 0.80;
    const lx = ex + Math.cos(left) * head;
    const ly = ey + Math.sin(left) * head;
    const rx = ex + Math.cos(right) * head;
    const ry = ey + Math.sin(right) * head;
  
    g.beginFill(0x0b0f16, Math.min(1, alpha + 0.10));
    g.moveTo(ex, ey);
    g.lineTo(lx, ly);
    g.lineTo(rx, ry);
    g.closePath();
    g.endFill();
  }
  
  function drawGhostSpinIndicator(g, r, s) {
    // Static preview glyph for target spin:
    // - No rotation animation
    // - Arc length scales with |s|
    // - Low alpha so it's clearly "ghost"
    const mag = Math.min(1, Math.max(0, Math.abs(s || 0)));
    if (mag <= 0.001) return;
    const cw = (s || 0) > 0;
  
    const pad = Math.max(6, r * 0.22);
    const arcR = Math.max(6, r - pad);
    const thickness = Math.max(1.5, r * 0.045);
    const alpha = 0.16 + 0.22 * mag;
  
    const arcLen = (Math.PI * 1.45) * mag; // proportional to |spin|
    const startAngle = -Math.PI * 0.85;
    const endAngle = cw ? (startAngle + arcLen) : (startAngle - arcLen);
  
    g.lineStyle(thickness, 0xffffff, alpha, 0.5);
    g.arc(0, 0, arcR, startAngle, endAngle, !cw);
  
    // Arrowhead at the end of the arc (subtle)
    const ex = Math.cos(endAngle) * arcR;
    const ey = Math.sin(endAngle) * arcR;
    const head = Math.max(4, r * 0.12);
    const tanAng = endAngle + (cw ? Math.PI / 2 : -Math.PI / 2);
    const left = tanAng + Math.PI * 0.80;
    const right = tanAng - Math.PI * 0.80;
    const lx = ex + Math.cos(left) * head;
    const ly = ey + Math.sin(left) * head;
    const rx = ex + Math.cos(right) * head;
    const ry = ey + Math.sin(right) * head;
  
    g.beginFill(0xffffff, Math.min(1, alpha + 0.05));
    g.moveTo(ex, ey);
    g.lineTo(lx, ly);
    g.lineTo(rx, ry);
    g.closePath();
    g.endFill();
  }
  const MVP_SPIN_DEADZONE = R.SPIN_DEADZONE_NORM;
  const MVP_MAX_OMEGA = R.SPIN_MAX_OMEGA; // rad/sec at |spin|=1
  
  
  function updateMvpBoardView() {
    const SIM = EC.SIM;
    if (!SIM || !SIM.wellsA || SIM.wellsA.length !== 6) return;
    const RSTATE = (EC.RENDER_STATE = EC.RENDER_STATE || { flags: {}, layout: {}, mvpPrevSpinT: null });
    if (EC.RENDER_WELLS_INIT && EC.RENDER_WELLS_INIT.ensure) EC.RENDER_WELLS_INIT.ensure();
    if (!EC.RENDER || !EC.RENDER.mvpWells) return;
    // Defensive: if views didn't fully build (e.g., during a reset), don't hard-crash.
    if (EC.RENDER.mvpWells.length !== 6) {
      if (EC.assert) EC.assert(false, 'EC.RENDER.mvpWells must be length 6 after init (got ' + EC.RENDER.mvpWells.length + ')');
      return;
    }
  
    const geom = SIM.mvpGeom;
    if (!geom) return;

    // ------------------------------------------------------------
    // Authoritative well geometry for DOM hit-testing (mobile)
    // Stored in canvas-local coordinates (Pixi screen coords)
    // ------------------------------------------------------------
    const dbg = (EC.UI_STATE = EC.UI_STATE || {}).inputDbg = (EC.UI_STATE.inputDbg || {});
    const RENDER = (EC.RENDER = EC.RENDER || {});
    const WG = (RENDER.wellGeom = RENDER.wellGeom || {
      cx: new Array(6).fill(NaN),
      cy: new Array(6).fill(NaN),
      hitR: new Array(6).fill(NaN),
      ready: 0,
      updatedAt: 0,
      src: 'none'
    });
    const _wgNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let _wgAnyValid = false;
    let _wgMinR = 1e9;
    let _wgMaxR = 0;
  
    const hues = (EC.CONST && EC.CONST.HUES) || EC.HUES || ['red','purple','blue','green','yellow','orange'];
    const A_MIN = EC.TUNE.A_MIN;
    const A_MAX = EC.TUNE.A_MAX;
    const Amax = A_MAX;
    const Smin = EC.TUNE.S_MIN;
    const Smax = EC.TUNE.S_MAX;
  
    // dt in seconds (smooth, framerate-independent spin animation)
    const tNow = (typeof SIM.mvpTime === 'number') ? SIM.mvpTime : 0;
    let dt = 0;
    const prev = (typeof RSTATE.mvpPrevSpinT === 'number') ? RSTATE.mvpPrevSpinT : tNow;
    dt = tNow - prev;
    RSTATE.mvpPrevSpinT = tNow;
    if (!isFinite(dt) || dt < 0) dt = 0;
    // Cap dt to avoid huge jumps after tab switches
    if (dt > R.SPIN_DT_CAP) dt = R.SPIN_DT_CAP;
  
    // Disposition render states (telegraph/active) — multiple wells supported.
    const DISP_LIST = (EC.DISP && typeof EC.DISP.getRenderStates === 'function')
      ? EC.DISP.getRenderStates()
      : ((EC.DISP && typeof EC.DISP.getRenderState === 'function') ? [EC.DISP.getRenderState()] : []);

    // Build a per-well map with ACTIVE preferred over TELEGRAPH (never more than one per well by rule).
    const dispByWell = new Array(6).fill(null);
    for (let k = 0; k < (DISP_LIST ? DISP_LIST.length : 0); k++) {
      const d = DISP_LIST[k];
      if (!d || typeof d.targetIndex !== 'number') continue;
      const idx = d.targetIndex | 0;
      if (idx < 0 || idx >= 6) continue;
      if (!dispByWell[idx]) {
        dispByWell[idx] = d;
      } else {
        // Prefer active if conflict
        const a = dispByWell[idx];
        if (a && a.phase !== 'active' && d.phase === 'active') dispByWell[idx] = d;
      }
    }

    // Debug-only layer toggles for diagnosing mobile blending issues.
    // Usage (console): EC.DEBUG_LIQUID_LAYERS.marbleA = false
    const DBG_LAY = (EC.DEBUG)
      ? (EC.DEBUG_LIQUID_LAYERS = (EC.DEBUG_LIQUID_LAYERS || {
          // Legacy base fill (from render_wells.js) — toggled there.
          baseFill: true,
          // Liquid stack layers
          pigment: true,
          marbleA: true,
          marbleB: true,
          highlight: true,
          coreGlow: true,
          // Mask
          mask: true,
        }))
      : null;

    for (let i = 0; i < 6; i++) {
      const hue = hues[i];
      const view = EC.RENDER.mvpWells[i];
      if (!view) continue;
      const { g, interior, maskG, pigment, rippleA, rippleB, swirlA, swirlB, inkDark, inkLight, waveHand, edgeShade, marbleA, marbleB, highlight, coreGlow, rimG, selG, spinG, dispHalo, ghostG, ghostSpinG, name, amountLabel, spinText } = view;
  
      const ang = geom.baseAngle + i * (Math.PI * 2 / 6);
      const cx = geom.cx + Math.cos(ang) * geom.ringR;
      const cy = geom.cy + Math.sin(ang) * geom.ringR;
  
      const r = computeMvpWellRadius(SIM.wellsA[i], geom.wellMinR, geom.wellMaxR, Amax);

      // Update authoritative DOM hit-testing geometry.
      // Slightly inside the visible rim so taps are conservative.
      try {
        WG.cx[i] = cx;
        WG.cy[i] = cy;
        WG.hitR[i] = Math.max(8, r * 1.02);
        _wgAnyValid = true;
        _wgMinR = Math.min(_wgMinR, WG.hitR[i]);
        _wgMaxR = Math.max(_wgMaxR, WG.hitR[i]);
      } catch (_) {}

      // Keep pointer hit area in sync with current radius so taps are reliable.
      // (Visual-only; no gameplay changes.)
      try {
        if (g && g.hitArea && typeof g.hitArea.radius === 'number') {
          g.hitArea.radius = Math.max(r, 10);
        }
      } catch (e) {}
  
      // Liquid well visuals (visual-only): pigment body + subtle marbling + crisp rim.
      g.position.set(cx, cy);
      const baseCol = MVP_WELL_COLORS[hue] ?? 0x777777;
      const DISP = dispByWell[i];
      const dispPhase = DISP ? DISP.phase : 'none';
      const dispIntensity = (DISP && typeof DISP.intensity01 === 'number') ? DISP.intensity01 : 0;
      const dispType = (DISP && typeof DISP.type === 'string') ? DISP.type : '';

      const isDispTarget = (dispPhase !== "none");

      // Pigment body tint (slightly brightens during ACTIVE as a secondary cue)
      // Deep, rich pigment: boost saturation and slightly deepen midtones.
      // Push saturation + depth so wells read as rich ink (not pastel).
      let bodyCol = saturateAndDeepen(baseCol, 0.62, 0.10);
      if (isDispTarget && dispPhase === 'active') {
        const gain = (typeof R.DISP_ACTIVE_BRIGHT_GAIN === 'number') ? R.DISP_ACTIVE_BRIGHT_GAIN : 0;
        bodyCol = mixTowardWhite(bodyCol, clamp(dispIntensity, 0, 1) * gain);
      }

      // Amount can slightly increase interior saturation/opacity (subtle)
      const aNorm = (Amax > 0) ? clamp((SIM.wellsA[i] || 0) / Amax, 0, 1) : 0;
      // Keep pigment rich and dominant (avoid any muted/filtered look).
      const bodyAlpha = 0.98 + 0.02 * aNorm;
      pigment.tint = bodyCol;
      pigment.alpha = bodyAlpha;
      pigment.width = pigment.height = r * 2.06;

      if (DBG_LAY) pigment.visible = !!DBG_LAY.pigment;

      // Spin-derived visual controls (visual-only)
      // IMPORTANT: SIM.wellsS is in the gameplay range (-100..100). Do NOT clamp to (-1..1)
      // or you destroy readability (10 would look like 80). All directional motion in the
      // well visuals must use the same canonical mapping.
      const spinRaw = (SIM.wellsS[i] || 0);
      const sv = spinVisual(spinRaw);
      const dir = sv.dir;
      const spinNorm = sv.spinNorm;
      const magEff = sv.magEff;
      const omega = sv.omega;

      // Visual-only: outward vs inward feel.
      // Positive spin (CW) should read as outward/blooming; negative (CCW) as inward/tightening.
      const bloom = (dir > 0) ? magEff : 0;
      const contract = (dir < 0) ? magEff : 0;

      // Ripple surface: animated even at spin=0 (living pool surface)
      view._ripT = (view._ripT || 0) + dt;
      const ripT = view._ripT;
      if (rippleA && rippleB) {
        // Keep ripples hue-tinted (avoid pastel/washed overlays)
        // Keep ripples in-hue and avoid chalky overlays that mute saturation.
        // Keep ripples in-family without chalky desaturation.
        rippleA.tint = mixTowardWhite(bodyCol, 0.10);
        rippleB.tint = mixTowardWhite(bodyCol, 0.16);

        // Size: slightly larger than pigment to cover edge.
        rippleA.width = rippleA.height = r * 2.18;
        rippleB.width = rippleB.height = r * 2.18;

        // Always animate (never static). With circular sprites we use rotation + subtle offset drift.
        const driftA = 2.0 + 7.0 * magEff;
        const driftB = 1.6 + 5.5 * magEff;
        rippleA.position.x = Math.sin(ripT * 0.37 + i) * (3.0 + 6.0 * magEff);
        rippleA.position.y = Math.cos(ripT * 0.29 + i * 0.7) * (2.6 + 5.0 * magEff);
        rippleB.position.x = Math.cos(ripT * 0.23 + i * 0.9) * (2.2 + 4.0 * magEff);
        rippleB.position.y = Math.sin(ripT * 0.31 + i * 0.6) * (2.0 + 3.8 * magEff);

        // Alpha: subtle at rest, stronger under spin
        // Remove remaining "mist/haze" around wells (visual noise)
        rippleA.alpha = 0;
        rippleB.alpha = 0;

        // Wobble rotation (organic, non-repeating)
        const wob = 0.08 * Math.sin(ripT * 0.55 + i) + 0.05 * Math.sin(ripT * 0.91 + i * 1.7);
        // At spin=0, no directional rotation (only wobble). When spinning, direction follows sign.
        // IMPORTANT: the faint "mist/aura" should not contradict spin direction.
        // Keep both ripple layers rotating in the SAME direction (or wobble-only at rest).
        rippleA.rotation = wob + dir * ripT * (0.12 + 0.35 * magEff);
        rippleB.rotation = -wob * 0.6 + dir * ripT * (0.08 + 0.26 * magEff);
      }

      // Store per-well angles (no allocations)
      // Monotonic directional angle accumulator. If spin=0, this remains steady.
      view._swirlAng = (view._swirlAng || 0) + omega * dt;
      view._sheenAng = (view._sheenAng || 0) + 0.4 * dt;

      // Swirl layers: unmistakable internal motion cue for direction + magnitude.
      // Two layers with different speeds and subtle counter-rotation.
      if (swirlA && swirlB) {
        const swirlTintA = mixTowardWhite(bodyCol, 0.22);
        const swirlTintB = mixTowardWhite(bodyCol, 0.34);
        swirlA.tint = swirlTintA;
        swirlB.tint = swirlTintB;

        // Scale responds to |spin| with a sign-aware radial "feel":
        //  +spin: bloom outward (slightly larger layers)
        //  -spin: tighten inward (slightly smaller layers + higher contrast from core)
        // Exaggerate the sign-aware radial feel so it reads at a glance:
        //  +spin (CW): bloom/outward
        //  -spin (CCW): tighten/inward
        const sizeA = (1.00 + 0.28 * bloom - 0.20 * contract);
        const sizeB = (1.00 + 0.34 * bloom - 0.14 * contract);
        swirlA.width = swirlA.height = r * 2.10 * sizeA;
        swirlB.width = swirlB.height = r * 2.20 * sizeB;

        // Alpha increases with |spin| so motion reads at moderate values.
        // Keep these as background turbulence (direction is primarily the wave hand).
        swirlA.alpha = 0.06 + 0.20 * magEff;
        swirlB.alpha = 0.04 + 0.14 * magEff;

        // Rotation conveys direction (spin sign) and speed conveys magnitude.
        const wob2 = 0.10 * Math.sin(ripT * 0.83 + i) + 0.06 * Math.sin(ripT * 1.37 + i * 1.9);
        swirlA.rotation = view._swirlAng * 1.25 + wob2;
        // Counter-rotation + wobble adds organic turbulence while preserving sign readability.
        swirlB.rotation = view._swirlAng * 0.82 - dir * 0.35 * Math.sin((tNow || 0) * 0.95 + i) - wob2 * 0.6;
      }

      // Ink streaks: high-contrast turbulence dragged around. (Circular sprites; no tiling squares.)
      if (inkDark && inkLight) {
        // Dark streaks can be near-black, but the texture is sparse so it won't black-out the well.
        inkDark.tint = 0x0b0f16;
        inkLight.tint = mixTowardWhite(bodyCol, 0.65);

        // Size slightly larger than pigment; scale responds to bloom/contract to imply outward vs inward.
        const sA = 1.04 + 0.22 * bloom - 0.18 * contract;
        inkDark.width = inkDark.height = r * 2.24 * sA;
        inkLight.width = inkLight.height = r * 2.30 * (1.02 + 0.18 * bloom - 0.12 * contract);

        // Stronger contrast when spinning; still visible at rest.
        // At spin=0 the black line/streak pattern should be readable (but not loud).
        inkDark.alpha = 0.16 + 0.40 * magEff;
        inkLight.alpha = 0.12 + 0.26 * magEff;

        // Organic drift (position) + rotation to avoid perfect spirals.
        inkDark.position.x = Math.sin(ripT * 0.61 + i) * (3.0 + 10.0 * magEff);
        inkDark.position.y = Math.cos(ripT * 0.49 + i * 0.7) * (2.6 + 8.5 * magEff);
        inkLight.position.x = Math.cos(ripT * 0.43 + i * 0.9) * (2.4 + 9.0 * magEff);
        inkLight.position.y = Math.sin(ripT * 0.57 + i * 0.6) * (2.2 + 7.8 * magEff);

        const wob = 0.07 * Math.sin(ripT * 0.72 + i) + 0.05 * Math.sin(ripT * 1.11 + i * 1.3);
        inkDark.rotation = view._swirlAng * 0.62 + wob;
        inkLight.rotation = -view._swirlAng * 0.44 - wob * 0.7;
      }

      // Wave-hand (dominant direction cue): a DARK ink-like crest line/band.
      // Must remain fully inside the well and remain visible at low spin.
      if (waveHand) {
        // Dark crest (not white cloud). Keep it ink-like.
        waveHand.tint = 0x06070a;

        // Keep fully inside the circular well: never exceed the inner diameter.
        // (No mask is used on some platforms; size/position must guarantee containment.)
        const crestScale = (0.92 + 0.06 * bloom - 0.05 * contract);
        waveHand.width = waveHand.height = r * 2.00 * crestScale;

        // Visibility floor: do NOT disappear at low spin; at rest, present but non-rotating.
        const baseVis = 0.42;
        const vis = baseVis + (1 - baseVis) * Math.pow(spinNorm, 0.85);
        waveHand.alpha = 0.10 + 0.55 * vis;

        // Rotation conveys direction and speed.
        // At spin=0, avoid directional rotation; allow only a tiny non-directional wobble.
        const wob = 0.10 * Math.sin(ripT * 0.88 + i * 1.1) + 0.06 * Math.sin(ripT * 1.31 + i * 0.7);
        if (spinRaw === 0) {
          waveHand.rotation = wob * 0.12;
        } else {
          waveHand.rotation = view._swirlAng * 1.05 + wob * (0.9 + 0.4 * spinNorm);
        }

        // Keep drift tiny so it never escapes the circle.
        waveHand.position.x = Math.sin(view._swirlAng * 0.55 + i) * (0.25 + 0.85 * spinNorm);
        waveHand.position.y = Math.cos(view._swirlAng * 0.55 + i) * (0.20 + 0.75 * spinNorm);
      }

      // Pigment body subtle sign-aware size to enhance bloom vs contraction.
      const bodyScale = 1.00 + 0.10 * bloom - 0.08 * contract;
      pigment.width = pigment.height = r * 2.06 * bodyScale;

      // Marbling scale supports radial feel without darkening.
      const tight = 1.02 + 0.36 * (contract * contract);
      const marbleScale = (r * 2.15) / 256 * (1.00 + 0.16 * bloom - 0.10 * contract);
      // MOBILE-SAFE marbling: do not allow near-black full-field overlays.
      // Use a slightly darker version of the pigment color with a per-channel floor.
      let veinCol = mixToward(bodyCol, 0x000000, 0.10 + 0.08 * magEff);
      veinCol = clampChannelFloor(veinCol, 40); // keep above near-black
      marbleA.tint = veinCol;
      marbleA.width = marbleA.height = 256 * marbleScale * tight;
      marbleA.rotation = view._swirlAng;
      marbleA.alpha = 0.03 + 0.12 * magEff;
      if (DBG_LAY) marbleA.visible = !!DBG_LAY.marbleA;

      marbleB.tint = 0xffffff;
      marbleB.width = marbleB.height = 256 * marbleScale * (1.0 + 0.08 * magEff);
      marbleB.rotation = -view._swirlAng * 0.72;
      marbleB.alpha = 0.02 + 0.10 * magEff;
      if (DBG_LAY) marbleB.visible = !!DBG_LAY.marbleB;

      highlight.width = highlight.height = r * 2.06;
      highlight.rotation = view._sheenAng;
      // Tint highlights toward the hue (avoid grey/filtered look).
      highlight.tint = mixTowardWhite(bodyCol, 0.52);
      // Less milky at rest; more sparkle under spin.
      highlight.alpha = 0.14 + 0.16 * (1 - magEff) + 0.14 * magEff;
      if (DBG_LAY) highlight.visible = !!DBG_LAY.highlight;

      // Subtle core glow scales with |spin| (brightness, not black intensity)
      coreGlow.tint = 0xffffff;
      coreGlow.width = coreGlow.height = r * 1.55 * (1.00 + 0.28 * bloom - 0.18 * contract);
      coreGlow.alpha = 0.04 + 0.16 * magEff + 0.08 * contract - 0.04 * bloom;
      coreGlow.rotation = -view._sheenAng * 0.6;
      if (DBG_LAY) coreGlow.visible = !!DBG_LAY.coreGlow;

      // Inner edge shading (lens depth) — keep subtle and non-black.
      if (edgeShade) {
        edgeShade.tint = mixToward(bodyCol, 0xffffff, 0.15);
        edgeShade.width = edgeShade.height = r * 2.06;
        // Remove remaining "mist/haze" around wells (keep rim/selection crisp)
        edgeShade.alpha = 0;
      }

      // Mask and rim keep the well a perfect circle at all times.
      if (maskG) {
        maskG.clear();
        maskG.beginFill(0xffffff, 1);
        maskG.drawCircle(0, 0, r);
        maskG.endFill();
      }

      // Debug: allow masking to be toggled at runtime.
      // If disabling the mask suddenly reveals pigment, the mask pipeline is the issue.
      if (DBG_LAY && interior) {
        const wantMask = !!DBG_LAY.mask;
        if (!wantMask) {
          if (interior.mask) interior.mask = null;
        } else {
          if (!interior.mask && maskG) interior.mask = maskG;
        }
      }

      // Crisp rim + selection (separate from outer halo)
      const sel = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : -1;
      const isSel = (i === sel);
      if (rimG) {
        rimG.clear();
        // Rim must NOT read like a constant selection ring.
        // Keep only a very subtle lens edge; selection/halo does the heavy lifting.
        const rimW = Math.max(1, r * 0.022);
        const rimA = isSel ? 0.18 : 0.08;
        const rimCol = mixTowardWhite(bodyCol, 0.70);
        rimG.lineStyle(rimW, rimCol, rimA, 0.5);
        rimG.drawCircle(0, 0, r + 0.25);

        // Tiny specular hint (subtle; avoids the "all selected" look)
        const specA = (isSel ? 0.12 : 0.08) + 0.04 * Math.sin((tNow || 0) * 1.4 + i);
        rimG.lineStyle(Math.max(1, rimW * 0.9), 0xffffff, specA, 0.5);
        rimG.arc(0, 0, r + 0.25, -1.10, -0.45);
      }
      if (selG) {
        selG.clear();
        if (isSel) {
          const pulse = 0.55 + 0.45 * Math.sin((tNow || 0) * 3.2);
          const w = Math.max(2, r * 0.055);
          selG.lineStyle(w, 0xffffff, 0.18 + 0.22 * pulse, 0.5);
          selG.drawCircle(0, 0, r + Math.max(6, r * 0.12));
        }
      }

      // Disposition telegraph/active marker (halo + active progress ring)
      if (dispHalo) {
        dispHalo.position.set(cx, cy);
        dispHalo.clear();
        const isTarget = (dispPhase !== 'none');
        dispHalo.visible = !!isTarget;

        if (isTarget) {
          const haloR = r + R.DISP_HALO_PAD;
          const baseW = Math.max(R.DISP_HALO_W_MIN, r * R.DISP_HALO_W_SCALE);

          // Telegraph warning (red). Intensity tier controls brightness via DISP.intensity01.
          const warnCol = (typeof R.DISP_WARN_HALO_COLOR === 'number') ? R.DISP_WARN_HALO_COLOR : 0xff0033;
          const activeCol = (typeof R.DISP_ACTIVE_HALO_COLOR === 'number') ? R.DISP_ACTIVE_HALO_COLOR : 0xf5f5ff; // whitish
          const headGlowCol = (typeof R.DISP_HEAD_GLOW_COLOR === 'number') ? R.DISP_HEAD_GLOW_COLOR : 0xffffff;
          const headGlowAlphaMax = (typeof R.DISP_HEAD_GLOW_ALPHA_MAX === 'number') ? R.DISP_HEAD_GLOW_ALPHA_MAX : 0.85;
          const headGlowSpanDeg = (typeof R.DISP_HEAD_GLOW_DEG === 'number') ? R.DISP_HEAD_GLOW_DEG : 16;
          const headGlowWScale = (typeof R.DISP_HEAD_GLOW_WIDTH_SCALE === 'number') ? R.DISP_HEAD_GLOW_WIDTH_SCALE : 1.6;

          if (dispPhase === 'telegraph') {
            // Telegraph modes (provided by systems_dispositions.js):
            //  - flash: 3s flashing ring
            //  - fill: 3 directional fill cycles (1.5s fill + 0.5s beat)
            //  - beat: reset beat between fills
            const mode = (DISP && typeof DISP.teleMode === 'string') ? DISP.teleMode : 'flash';
            const inten = clamp(dispIntensity, 0, 1); // already tier-scaled (muted→bright)
            const twoPi = Math.PI * 2;

            const start = (DISP && typeof DISP.startAngleRad === 'number') ? DISP.startAngleRad : (Math.PI / 2);
            const dirSign = (DISP && typeof DISP.dirSign === 'number') ? (DISP.dirSign < 0 ? -1 : 1) : 1;
            const anti = (dirSign < 0);

            // Faint constant outline so the cue is always readable.
            const outlineA = 0.10 + 0.18 * inten;
            dispHalo.lineStyle(Math.max(2, baseW * 0.55), warnCol, clamp(outlineA, 0, 1));
            dispHalo.drawCircle(0, 0, haloR);

            if (mode === 'flash') {
              const f = (DISP && typeof DISP.flash01 === 'number') ? clamp(DISP.flash01, 0, 1) : 0.6;
              const a = clamp(0.15 + 0.85 * f * inten, 0, 1);
              const w = baseW * (0.85 + 0.30 * f);
              dispHalo.lineStyle(w, warnCol, a);
              dispHalo.drawCircle(0, 0, haloR);
            } else if (mode === 'fill') {
              const p = (DISP && typeof DISP.progress01 === 'number') ? clamp(DISP.progress01, 0, 1) : 0;
              const arcW = Math.max(3, baseW * 0.92);
              const a1 = start + dirSign * (twoPi * p);
              const alpha = clamp(0.35 + 0.65 * inten, 0, 1);
              dispHalo.lineStyle(arcW, warnCol, alpha);
              dispHalo.arc(0, 0, haloR, start, a1, anti);
            } else {
              // Beat/reset: keep only faint outline (already drawn).
            }
          } else if (dispPhase === 'active') {
            // Whitish outline + monotonic progress ring (time-based; fills once to full circle).
            // Keep outline secondary so the neon fill remains fully saturated.
            const inten = clamp(dispIntensity, 0, 1);
            const outlineA = 0.55;
            const outlineW = Math.max(2, baseW * 0.55);

            // Outline (thin; does not wash out the fill)
            dispHalo.lineStyle(outlineW, activeCol, outlineA);
            dispHalo.drawCircle(0, 0, haloR);

            // Painted progress ring: segments keep their historical color forever.
            const prog01 = (DISP && typeof DISP.progress01 === 'number') ? clamp(DISP.progress01, 0, 1) : 0;
            if (prog01 > 0) {
              const arcW = Math.max(3, baseW * 0.92);
              const start = (DISP && typeof DISP.startAngleRad === 'number') ? DISP.startAngleRad : (Math.PI / 2);
              const dirSign = (DISP && typeof DISP.dirSign === 'number') ? (DISP.dirSign < 0 ? -1 : 1) : 1;
              const anti = (dirSign < 0);

              const cG = (typeof R.DISP_TENSION_GREEN === 'number') ? R.DISP_TENSION_GREEN : 0x00ff66;
              const cY = (typeof R.DISP_TENSION_YELLOW === 'number') ? R.DISP_TENSION_YELLOW : 0xfff000;
              const cR = (typeof R.DISP_TENSION_RED === 'number') ? R.DISP_TENSION_RED : 0xff0044;
              const alpha = (typeof R.DISP_ACTIVE_FILL_ALPHA === 'number') ? R.DISP_ACTIVE_FILL_ALPHA : 1.0;

              const isDiscrete = !!(DISP && DISP.isDiscrete);
              function segColor(val) {
                if (isDiscrete) {
                  // val is 0/1/2 (low/med/high)
                  if (val >= 1.5) return cR;
                  if (val >= 0.5) return cY;
                  return cG;
                }
                // val is intensity01 (0..1)
                const x = clamp(val, 0, 1);
                if (x <= 0.5) return mixRgb(cG, cY, x / 0.5);
                return mixRgb(cY, cR, (x - 0.5) / 0.5);
              }

              // Draw accumulated segments (immutable history)
              const n = (DISP && typeof DISP.segN === 'number') ? (DISP.segN | 0) : 0;
              const p0 = DISP && DISP.segP0;
              const p1 = DISP && DISP.segP1;
              const pv = DISP && DISP.segVal;
              if (n > 0 && p0 && p1 && pv) {
                const twoPi = Math.PI * 2;
                for (let si = 0; si < n; si++) {
                  const a0 = start + dirSign * (twoPi * p0[si]);
                  const a1 = start + dirSign * (twoPi * p1[si]);
                  const col = segColor(pv[si]);
                  dispHalo.lineStyle(arcW, col, alpha);
                  dispHalo.arc(0, 0, haloR, a0, a1, anti);
                }
              }

              // Head glow: rides at leading edge; color tracks *current* intensity
              const totalLen = (Math.PI * 2) * prog01;
              const bell = Math.sin(Math.PI * prog01);
              const glowA = clamp(bell, 0, 1) * headGlowAlphaMax * (0.35 + 0.65 * clamp(dispIntensity, 0, 1));
              if (glowA > 0.01) {
                const colNow = segColor(isDiscrete ? ((DISP && DISP.phaseLevel === 'high') ? 2 : ((DISP && DISP.phaseLevel === 'med') ? 1 : 0)) : dispIntensity);
                const headAng = start + dirSign * totalLen;
                const span = (headGlowSpanDeg * Math.PI) / 180;
                const g0 = headAng - span * 0.5;
                const g1 = headAng + span * 0.5;
                dispHalo.lineStyle(arcW * headGlowWScale, colNow, glowA);
                dispHalo.arc(0, 0, haloR, g0, g1, false);
              }
            }
          }
        }
      }

      // Spin direction + magnitude readability is handled by the liquid interior swirl.
      // Keep legacy spinG present (structure stability), but hidden.
      if (spinG) {
        spinG.visible = false;
        spinG.position.set(cx, cy);
        spinG.clear();
        spinG.rotation = 0;
      }
  
      // Ghost Target preview removed: wells should only show actual applied state.
      if (ghostG && ghostSpinG) {
        ghostG.position.set(cx, cy);
        ghostSpinG.position.set(cx, cy);
        ghostG.rotation = 0;
        ghostSpinG.rotation = 0;
        ghostG.clear();
        ghostSpinG.clear();
        ghostG.visible = false;
        ghostSpinG.visible = false;
      }
  
      // Name label + in-well A/S readout (all are children of g, so positions are local)
      name.text = MVP_WELL_NAME[hue] || '';
      const fsName = clamp(Math.round(r * R.NAME_FONT_SCALE), R.NAME_FONT_MIN, R.NAME_FONT_MAX);
      if (name.style && name.style.fontSize !== fsName) name.style.fontSize = fsName;
      if (name.style && name.style.wordWrapWidth !== Math.max(R.NAME_WORDWRAP_MIN, Math.round(r * R.NAME_WORDWRAP_SCALE))) {
        name.style.wordWrapWidth = Math.max(R.NAME_WORDWRAP_MIN, Math.round(r * R.NAME_WORDWRAP_SCALE));
      }
      name.position.set(0, -r * 0.22);

      const aVal = Math.round(SIM.wellsA[i] || 0);
      const sVal = (SIM.wellsS[i] || 0);
      const sInt = Math.round(sVal);

      // A/S format: 50/-35 (spin sign colored)
      const fsAS = Math.max(R.LABEL_FONT_MIN, Math.min(R.LABEL_FONT_MAX, Math.floor(r * R.LABEL_FONT_SCALE)));
      amountLabel.style.fontSize = fsAS;
      spinText.style.fontSize = fsAS;
      amountLabel.text = `${aVal}/`;
      spinText.text = `${sInt}`;
      if (spinText.style) {
        if (sInt > 0) spinText.style.fill = R.SPIN_POS_COLOR;
        else if (sInt < 0) spinText.style.fill = R.SPIN_NEG_COLOR;
        else spinText.style.fill = R.SPIN_ZERO_COLOR;
      }

      const yAS = r * 0.10;
      // Keep centered overall; nudge based on text widths without allocations.
      const wA = amountLabel.width || 0;
      const wS = spinText.width || 0;
      const totalW = wA + wS;

      // Subtle backing plate behind A/S for legibility.
      const asPlate = view && view.asPlate;
      if (!view) {
        if (EC.DEBUG) console.warn('[EC][wells] missing well view for index', i);
        continue;
      }
      if (asPlate) {
        const padX = Math.max(6, Math.round(fsAS * 0.55));
        const padY = Math.max(3, Math.round(fsAS * 0.30));
        const bw = Math.ceil(totalW + padX * 2);
        const bh = Math.ceil(fsAS + padY * 2);
        const rr = Math.min(10, Math.round(bh * 0.48));
        asPlate.clear();
        // Darker backing for legibility over active liquid textures.
        asPlate.lineStyle(1, 0x000000, 0.45);
        asPlate.beginFill(0x000000, 0.68);
        asPlate.drawRoundedRect(-bw * 0.5, yAS - bh * 0.5, bw, bh, rr);
        asPlate.endFill();
        asPlate.position.set(0, 0);
      }
      amountLabel.position.set(-totalW * 0.5 + wA * 0.5, yAS);
      spinText.position.set(-totalW * 0.5 + wA + wS * 0.5, yAS);
  
    }

    // Finalize authoritative geometry + debug line (always-visible in snapshot)
    try {
      WG.ready = _wgAnyValid ? 1 : 0;
      WG.updatedAt = _wgNow;
      WG.src = 'updateMvpBoardView';

      // One-time log the moment geometry becomes valid (or after resets)
      if (_wgAnyValid && !RENDER._wellGeomLogged) {
        RENDER._wellGeomLogged = true;
        const line = `WELLGEOM_SET: ready=1 updatedAt=${Math.round(_wgNow)} src=${WG.src} r=[${_wgMinR.toFixed(1)}..${_wgMaxR.toFixed(1)}]`;
        if (dbg && Array.isArray(dbg.log)) {
          dbg.log.push(((performance && performance.now)?Math.floor(performance.now()):Date.now()) + ' ' + line);
          if (dbg.log.length > 200) dbg.log.splice(0, dbg.log.length - 200);
        }
        // Also pin it so it can't scroll out of the snapshot.
        dbg.lastWellGeomSet = line;
      }

      // Always-visible snapshot line
      const _fmt = (v) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(1) : 'NaN';
      const c = (i) => `${_fmt(WG.cx[i])},${_fmt(WG.cy[i])}`;
      const r = (i) => `${_fmt(WG.hitR[i])}`;
      dbg.wellGeomLine = `WELLGEOM: ready=${WG.ready} ` +
        `c0=${c(0)} r0=${r(0)} ` +
        `c1=${c(1)} r1=${r(1)} ` +
        `c2=${c(2)} r2=${r(2)} ` +
        `c3=${c(3)} r3=${r(3)} ` +
        `c4=${c(4)} r4=${r(4)} ` +
        `c5=${c(5)} r5=${r(5)} ` +
        `updatedAt=${Math.round(WG.updatedAt)} src=${WG.src}`;
    } catch (_) {}

    // Debug-only: throttled inspector to confirm interior layers are renderable.
    if (EC.DEBUG) {
      const nowS = (typeof SIM.runSeconds === 'number') ? SIM.runSeconds : tNow;
      const st = (EC.RENDER_STATE = EC.RENDER_STATE || {});
      if (!st._dbgLiquidNext || nowS >= st._dbgLiquidNext) {
        st._dbgLiquidNext = nowS + 1.0;
        try {
          const v0 = EC.RENDER.mvpWells && EC.RENDER.mvpWells[0];
          if (v0 && v0.pigment && v0.interior) {
            console.log('[EC][liquid] v0', {
              pigment: { alpha: v0.pigment.alpha, visible: v0.pigment.visible, tint: '0x' + (v0.pigment.tint >>> 0).toString(16) },
              marbleA: { alpha: v0.marbleA && v0.marbleA.alpha, visible: v0.marbleA && v0.marbleA.visible },
              highlight: { alpha: v0.highlight && v0.highlight.alpha, visible: v0.highlight && v0.highlight.visible },
              mask: { alpha: v0.maskG && v0.maskG.alpha, visible: v0.maskG && v0.maskG.visible, renderable: v0.maskG && v0.maskG.renderable },
              hasMask: !!(v0.interior && v0.interior.mask),
            });
          }
        } catch (e) {}
      }
    }
  }
  
  // Expose for core loop
  EC.updateMvpBoardView = updateMvpBoardView;
})();
