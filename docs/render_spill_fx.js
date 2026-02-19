// Emotioncraft render_spill_fx.js — Spill stream FX (visual-only) (PASS A34)
(() => {
  const EC = (window.EC = window.EC || {});
  EC.RENDER_SPILL_FX = EC.RENDER_SPILL_FX || {};

  const MOD = EC.RENDER_SPILL_FX;

  const STATE = {
    inited: false,
    layer: null,

    // Amount ribbons
    gAOver: null,
    gAUnder: null,

    // Spin ribbons
    gSOver: null,
    gSUnder: null,

    // Droplet textures + pools
    texA: null,
    texS: null,
    dropletsA: [],
    dropletsS: [],

    // Smoothed intensities (0..1)
    overA_sm: new Float32Array(6),
    underA_sm: new Float32Array(6),
    overS_sm: new Float32Array(6),
    underS_sm: new Float32Array(6),

    // Smoothed magnitude for thickness (0..1)
    overA_mag_sm: new Float32Array(6),
    underA_mag_sm: new Float32Array(6),
    overS_mag_sm: new Float32Array(6),
    underS_mag_sm: new Float32Array(6),

    // Hold timers (secs) to prevent flicker on small/canceling signals
    overA_hold: new Float32Array(6),
    underA_hold: new Float32Array(6),
    overS_hold: new Float32Array(6),
    underS_hold: new Float32Array(6),

    // Cached direction sign when signed net cancels to ~0
    overA_dir: new Int8Array(6),
    underA_dir: new Int8Array(6),
    overS_dir: new Int8Array(6),
    underS_dir: new Int8Array(6),

    // Signed per-seam values
    overA_val: new Float32Array(6),
    underA_val: new Float32Array(6),
    overS_val: new Float32Array(6),
    underS_val: new Float32Array(6),

    // Absolute per-seam activity values (for intensity/thickness)
    overA_abs: new Float32Array(6),
    underA_abs: new Float32Array(6),
    overS_abs: new Float32Array(6),
    underS_abs: new Float32Array(6),

    // Curve caches (avoid allocations)
    curvesAOver: new Array(6),
    curvesAUnder: new Array(6),
    curvesSOver: new Array(6),
    curvesSUnder: new Array(6),

    capRound: 1,
    joinRound: 1,

    t: 0,
    spinPhase: 0,
  };

  function _mixTowardWhite(rgb, k) {
    k = Math.max(0, Math.min(1, k));
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    const nr = (r + (255 - r) * k) | 0;
    const ng = (g + (255 - g) * k) | 0;
    const nb = (b + (255 - b) * k) | 0;
    return (nr << 16) | (ng << 8) | nb;
  }

  function _getWellColor(idx) {
    try {
      const R = (EC.TUNE && EC.TUNE.RENDER) || {};
      const cols = R.MVP_WELL_COLORS;
      if (cols && typeof cols[idx] === 'number') return cols[idx];
      if (cols && cols[idx] != null) return cols[idx] >>> 0;
    } catch (_) {}
    const fallback = [0xd94141, 0x8b54d4, 0x2f7de1, 0x45b56a, 0xd8c23a, 0xe37b2c];
    return fallback[idx % fallback.length];
  }

  function _ensureCircleTex() {
    if (STATE.texA) return STATE.texA;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');

      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.70)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
      g.addColorStop(1.00, 'rgba(255,255,255,0.00)');

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(32, 32, 32, 0, Math.PI * 2);
      ctx.fill();

      const tex = PIXI.Texture.from(c);
      try {
        if (tex && tex.baseTexture && PIXI.SCALE_MODES) tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      } catch (_) {}
      STATE.texA = tex;
      return tex;
    } catch (e) {
      STATE.texA = PIXI.Texture.WHITE;
      return STATE.texA;
    }
  }

  function _ensureDiamondTex() {
    if (STATE.texS) return STATE.texS;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');

      // Diamond mask
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(32, 2);
      ctx.lineTo(62, 32);
      ctx.lineTo(32, 62);
      ctx.lineTo(2, 32);
      ctx.closePath();
      ctx.clip();

      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 34);
      g.addColorStop(0.00, 'rgba(255,255,255,0.98)');
      g.addColorStop(0.30, 'rgba(255,255,255,0.78)');
      g.addColorStop(0.65, 'rgba(255,255,255,0.22)');
      g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      ctx.restore();

      const tex = PIXI.Texture.from(c);
      try {
        if (tex && tex.baseTexture && PIXI.SCALE_MODES) tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      } catch (_) {}
      STATE.texS = tex;
      return tex;
    } catch (e) {
      STATE.texS = PIXI.Texture.WHITE;
      return STATE.texS;
    }
  }

  function ensure() {
    if (STATE.inited) return true;
    if (typeof PIXI === 'undefined') return false;
    if (!EC.RENDER || !EC.RENDER.root) return false;

    const root = EC.RENDER.root;

    // Cache cap/join enums (avoid undefined access later)
    try {
      STATE.capRound = (PIXI.LINE_CAP && PIXI.LINE_CAP.ROUND != null) ? PIXI.LINE_CAP.ROUND : 1;
      STATE.joinRound = (PIXI.LINE_JOIN && PIXI.LINE_JOIN.ROUND != null) ? PIXI.LINE_JOIN.ROUND : 1;
    } catch (_) {
      STATE.capRound = 1;
      STATE.joinRound = 1;
    }

    // Dedicated spill layer — MUST be non-interactive and never block input.
    const layer = new PIXI.Container();
    layer.name = 'mvpSpillLayer';
    layer.eventMode = 'none';
    layer.interactiveChildren = false;

    // Amount ribbons (liquid)
    const gAOver = new PIXI.Graphics();
    const gAUnder = new PIXI.Graphics();

    // Spin ribbons (corkscrew/wave)
    const gSOver = new PIXI.Graphics();
    const gSUnder = new PIXI.Graphics();

    gAOver.eventMode = 'none';
    gAUnder.eventMode = 'none';
    gSOver.eventMode = 'none';
    gSUnder.eventMode = 'none';

    // Draw order: amount first, spin on top (so it reads distinct)
    layer.addChild(gAOver);
    layer.addChild(gAUnder);
    layer.addChild(gSOver);
    layer.addChild(gSUnder);

    // Droplet pools
    const texA = _ensureCircleTex();
    const texS = _ensureDiamondTex();

    const dropletsA = [];
    const dropletsS = [];

    const PER_A = 4;
    const TOTAL_A = 6 * 2 * PER_A;
    for (let k = 0; k < TOTAL_A; k++) {
      const spr = new PIXI.Sprite(texA);
      if (spr.anchor) spr.anchor.set(0.5);
      spr.eventMode = 'none';
      spr.visible = false;
      spr.alpha = 0;
      spr._lane = (k < (TOTAL_A / 2)) ? 'over' : 'under';
      spr._seam = ((k % (TOTAL_A / 2)) / PER_A) | 0;
      spr._slot = (k % PER_A) | 0;
      spr._t = Math.random();
      spr._spd = 0.55 + Math.random() * 0.25;
      dropletsA.push(spr);
      layer.addChild(spr);
    }

    const PER_S = 3;
    const TOTAL_S = 6 * 2 * PER_S;
    for (let k = 0; k < TOTAL_S; k++) {
      const spr = new PIXI.Sprite(texS);
      if (spr.anchor) spr.anchor.set(0.5);
      spr.eventMode = 'none';
      spr.visible = false;
      spr.alpha = 0;
      spr._lane = (k < (TOTAL_S / 2)) ? 'over' : 'under';
      spr._seam = ((k % (TOTAL_S / 2)) / PER_S) | 0;
      spr._slot = (k % PER_S) | 0;
      spr._t = Math.random();
      spr._spd = 0.62 + Math.random() * 0.28;
      spr._rotSpd = 2.2 + Math.random() * 2.2;
      spr._rotDir = (Math.random() < 0.5) ? -1 : 1;
      dropletsS.push(spr);
      layer.addChild(spr);
    }

    // Insert ABOVE mvpWellLayer (streams must be visible, not hidden under wells)
    try {
      const wl = EC.RENDER.mvpWellLayer;
      if (wl && typeof root.getChildIndex === 'function') {
        const idx = root.getChildIndex(wl);
        const at = idx + 1;
        if (at >= root.children.length) root.addChild(layer);
        else root.addChildAt(layer, at);
      } else {
        root.addChild(layer);
      }
    } catch (_) {
      try { root.addChild(layer); } catch (e2) {}
    }

    EC.RENDER.mvpSpillLayer = layer;

    STATE.layer = layer;
    STATE.gAOver = gAOver;
    STATE.gAUnder = gAUnder;
    STATE.gSOver = gSOver;
    STATE.gSUnder = gSUnder;

    STATE.dropletsA = dropletsA;
    STATE.dropletsS = dropletsS;

    // Pre-create curve param objects (avoid per-frame allocations)
    for (let i = 0; i < 6; i++) {
      if (!STATE.curvesAOver[i]) STATE.curvesAOver[i] = { active: false, p0x: 0, p0y: 0, cpx: 0, cpy: 0, p1x: 0, p1y: 0, col: 0xffffff };
      if (!STATE.curvesAUnder[i]) STATE.curvesAUnder[i] = { active: false, p0x: 0, p0y: 0, cpx: 0, cpy: 0, p1x: 0, p1y: 0, col: 0xffffff };
      if (!STATE.curvesSOver[i]) STATE.curvesSOver[i] = { active: false, p0x: 0, p0y: 0, cpx: 0, cpy: 0, p1x: 0, p1y: 0, col: 0xffffff };
      if (!STATE.curvesSUnder[i]) STATE.curvesSUnder[i] = { active: false, p0x: 0, p0y: 0, cpx: 0, cpy: 0, p1x: 0, p1y: 0, col: 0xffffff };
    }

    STATE.inited = true;
    return true;
  }

  function _approach(cur, tgt, dt, tau) {
    if (!isFinite(cur)) cur = 0;
    if (!isFinite(tgt)) tgt = 0;
    tau = Math.max(0.0001, tau || 0.12);
    const k = 1 - Math.exp(-dt / tau);
    return cur + (tgt - cur) * k;
  }

  // Build quadratic curve geometry for a seam and signed flow.
  function _buildCurve(out, seamIdx, signedVal, lane, cx, cy, ringR, mvpWellGeom, extraPush) {
    if (!out) return null;
    if (!signedVal) return null;

    const j = (seamIdx + 1) % 6;
    const donor = (signedVal > 0) ? seamIdx : j;
    const recv = (signedVal > 0) ? j : seamIdx;

    const dCx = mvpWellGeom.cx[donor];
    const dCy = mvpWellGeom.cy[donor];
    const rCx = mvpWellGeom.cx[recv];
    const rCy = mvpWellGeom.cy[recv];
    const dR = (mvpWellGeom.r[donor] || 0);
    const rR = (mvpWellGeom.r[recv] || 0);

    if (!isFinite(dCx) || !isFinite(dCy) || !isFinite(rCx) || !isFinite(rCy)) return null;

    const vx = rCx - dCx;
    const vy = rCy - dCy;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    const nx = vx / len;
    const ny = vy / len;

    // Start/end near facing edges (keep readable between wells)
    const pad = 0.92;
    const p0x = dCx + nx * (dR * pad);
    const p0y = dCy + ny * (dR * pad);
    const p1x = rCx - nx * (rR * pad);
    const p1y = rCy - ny * (rR * pad);

    // Control point pushed outward/inward from board center.
    const mx = (p0x + p1x) * 0.5;
    const my = (p0y + p1y) * 0.5;
    let rx = mx - cx;
    let ry = my - cy;
    const rlen = Math.sqrt(rx * rx + ry * ry) || 1;
    rx /= rlen; ry /= rlen;

    const basePush = 14 + ringR * 0.22 + ((dR + rR) * 0.10) + (extraPush || 0);
    const dirLane = (lane === 'over') ? 1 : -1;
    const cpx = mx + rx * basePush * dirLane;
    const cpy = my + ry * basePush * dirLane;

    out.active = true;
    out.p0x = p0x; out.p0y = p0y;
    out.cpx = cpx; out.cpy = cpy;
    out.p1x = p1x; out.p1y = p1y;
    out.col = _getWellColor(donor);
    return out;
  }

  function _drawAmountRibbon(g, curve, inten01, mag01) {
    if (!curve || !curve.active) return;
    const col = curve.col;
    const colCore = _mixTowardWhite(col, 0.28);

    // Tasteful but clearly readable: width uses BOTH intensity + magnitude so thickness scaling is obvious.
    const wBase = 6.0 + 9.0 * inten01 + 16.0 * mag01;
    const wCore = 2.2 + 3.8 * inten01 + 6.5 * mag01;
    const aBase = 0.16 + 0.30 * inten01;
    const aCore = 0.34 + 0.52 * inten01;

    g.lineStyle({ width: wBase, color: col, alpha: aBase, cap: STATE.capRound, join: STATE.joinRound });
    g.moveTo(curve.p0x, curve.p0y);
    g.quadraticCurveTo(curve.cpx, curve.cpy, curve.p1x, curve.p1y);

    g.lineStyle({ width: wCore, color: colCore, alpha: aCore, cap: STATE.capRound, join: STATE.joinRound });
    g.moveTo(curve.p0x, curve.p0y);
    g.quadraticCurveTo(curve.cpx, curve.cpy, curve.p1x, curve.p1y);
  }

  function _drawSpinWave(g, curve, inten01, mag01, seamIdx, lane, phaseSign) {
    if (!curve || !curve.active) return;

    // Spin should read distinct: thinner + whiter corkscrew on same path.
    const colBase = _mixTowardWhite(curve.col, 0.38);
    const colCore = _mixTowardWhite(curve.col, 0.72);

    const wBase = 2.8 + 2.6 * inten01 + 4.4 * mag01;
    const wCore = 1.2 + 1.4 * inten01 + 2.0 * mag01;
    const aBase = 0.14 + 0.30 * inten01;
    const aCore = 0.40 + 0.54 * inten01;

    const N = 20; // segments
    const cycles = 2.2;
    const freq = cycles * Math.PI * 2;
    const amp = (1.4 + 2.8 * inten01 + 1.8 * mag01);
    const baseOff = ((lane === 'over') ? 1 : -1) * 2.6; // small lateral offset so it doesn't perfectly overlap
    const phase = (phaseSign >= 0 ? 1 : -1) * STATE.spinPhase + seamIdx * 0.55;

    function sample(t, outObj) {
      const it = 1 - t;
      const a = it * it;
      const b = 2 * it * t;
      const c = t * t;

      const x = a * curve.p0x + b * curve.cpx + c * curve.p1x;
      const y = a * curve.p0y + b * curve.cpy + c * curve.p1y;

      // Derivative for tangent/normal
      const dx = 2 * it * (curve.cpx - curve.p0x) + 2 * t * (curve.p1x - curve.cpx);
      const dy = 2 * it * (curve.cpy - curve.p0y) + 2 * t * (curve.p1y - curve.cpy);
      const dlen = Math.sqrt(dx * dx + dy * dy) || 1;
      const tx = dx / dlen;
      const ty = dy / dlen;
      const nx = -ty;
      const ny = tx;

      const wave = Math.sin(phase + t * freq) * amp;
      const off = baseOff + wave;

      outObj.x = x + nx * off;
      outObj.y = y + ny * off;
    }

    // Base stroke
    g.lineStyle({ width: wBase, color: colBase, alpha: aBase, cap: STATE.capRound, join: STATE.joinRound });
    const p = { x: 0, y: 0 };
    sample(0, p);
    g.moveTo(p.x, p.y);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      sample(t, p);
      g.lineTo(p.x, p.y);
    }

    // Core stroke
    g.lineStyle({ width: wCore, color: colCore, alpha: aCore, cap: STATE.capRound, join: STATE.joinRound });
    sample(0, p);
    g.moveTo(p.x, p.y);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      sample(t, p);
      g.lineTo(p.x, p.y);
    }
  }

  MOD.update = function update(snap, geom, dt, mvpWellGeom) {
    // Never throw from render path.
    try {
      if (!ensure()) return;

      const SIM = snap && snap.SIM ? snap.SIM : EC.SIM;
      if (!SIM) return;

      // Tutorial safety: when hazards are disabled, never show spill streams.
      if (SIM._tutNoHazards) {
        if (STATE.layer) STATE.layer.visible = false;
        return;
      }

      const fx = SIM._spillFx;
      if (!fx || !mvpWellGeom || !mvpWellGeom.cx) {
        if (STATE.layer) STATE.layer.visible = false;
        return;
      }

      STATE.layer.visible = true;

      dt = (typeof dt === 'number' && isFinite(dt)) ? dt : 0;
      if (dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;

      STATE.t += dt;
      STATE.spinPhase += dt * 7.6;

      const cx = (geom && typeof geom.cx === 'number') ? geom.cx : 0;
      const cy = (geom && typeof geom.cy === 'number') ? geom.cy : 0;
      const ringR = (geom && typeof geom.ringR === 'number') ? geom.ringR : 160;

      const aOver = fx.aOver;
      const aUnder = fx.aUnder;
      const sOver = fx.sOver;
      const sUnder = fx.sUnder;

      // PASS A35: absolute activity arrays (may be missing in older builds; fallback safely)
      const aOverAbs = fx.aOverAbs;
      const aUnderAbs = fx.aUnderAbs;
      const sOverAbs = fx.sOverAbs;
      const sUnderAbs = fx.sUnderAbs;

      // Targets: keep channels separate (Amount vs Spin)
      for (let i = 0; i < 6; i++) {
        const ovA = aOver ? (aOver[i] || 0) : 0;
        const unA = aUnder ? (aUnder[i] || 0) : 0;
        const ovS = sOver ? (sOver[i] || 0) : 0;
        const unS = sUnder ? (sUnder[i] || 0) : 0;

        STATE.overA_val[i] = ovA;
        STATE.underA_val[i] = unA;
        STATE.overS_val[i] = ovS;
        STATE.underS_val[i] = unS;

        // Absolute activity (fallback to abs(signed) if abs arrays missing)
        STATE.overA_abs[i] = aOverAbs ? (aOverAbs[i] || 0) : Math.abs(ovA);
        STATE.underA_abs[i] = aUnderAbs ? (aUnderAbs[i] || 0) : Math.abs(unA);
        STATE.overS_abs[i] = sOverAbs ? (sOverAbs[i] || 0) : Math.abs(ovS);
        STATE.underS_abs[i] = sUnderAbs ? (sUnderAbs[i] || 0) : Math.abs(unS);
      }

      // Visibility tuning: trigger earlier + stable (abs-activity driven)
      const EPS_ACTIVE = 1e-4;
      const DIR_EPS = 1e-6;

      // sqrt mapping makes small transfers visible; separate refs for unit differences.
      const REF_A_ABS = 1.10;
      const REF_S_ABS = 0.60;
      const MIN_A = 0.10;
      const MIN_S = 0.12;

      // Hold to prevent flicker when signed nets cancel/oscillate
      const HOLD_SECS = 0.24;

      // Thickness mapping (separate from intensity) — obvious scaling
      const MAG_REF_A = 0.80;
      const MAG_REF_S = 0.55;

      const ON_TAU = 0.08;
      const OFF_TAU = 0.24;

      let anyA = false;
      let anyS = false;

      for (let i = 0; i < 6; i++) {
        const ovA = STATE.overA_val[i];
        const unA = STATE.underA_val[i];
        const ovS = STATE.overS_val[i];
        const unS = STATE.underS_val[i];

        const oa = STATE.overA_abs[i];
        const ua = STATE.underA_abs[i];
        const os = STATE.overS_abs[i];
        const us = STATE.underS_abs[i];

        // Cache direction sign when signed net cancels to ~0
        if (Math.abs(ovA) > DIR_EPS) STATE.overA_dir[i] = (ovA > 0) ? 1 : -1;
        if (Math.abs(unA) > DIR_EPS) STATE.underA_dir[i] = (unA > 0) ? 1 : -1;
        if (Math.abs(ovS) > DIR_EPS) STATE.overS_dir[i] = (ovS > 0) ? 1 : -1;
        if (Math.abs(unS) > DIR_EPS) STATE.underS_dir[i] = (unS > 0) ? 1 : -1;

        // Hold timers
        if (oa > EPS_ACTIVE) STATE.overA_hold[i] = HOLD_SECS;
        if (ua > EPS_ACTIVE) STATE.underA_hold[i] = HOLD_SECS;
        if (os > EPS_ACTIVE) STATE.overS_hold[i] = HOLD_SECS;
        if (us > EPS_ACTIVE) STATE.underS_hold[i] = HOLD_SECS;

        STATE.overA_hold[i] = Math.max(0, STATE.overA_hold[i] - dt);
        STATE.underA_hold[i] = Math.max(0, STATE.underA_hold[i] - dt);
        STATE.overS_hold[i] = Math.max(0, STATE.overS_hold[i] - dt);
        STATE.underS_hold[i] = Math.max(0, STATE.underS_hold[i] - dt);

        // Intensity from ABS (sqrt mapping) + activity floor
        let toA = (oa > 0) ? Math.sqrt(oa / REF_A_ABS) : 0;
        let tuA = (ua > 0) ? Math.sqrt(ua / REF_A_ABS) : 0;
        let toS = (os > 0) ? Math.sqrt(os / REF_S_ABS) : 0;
        let tuS = (us > 0) ? Math.sqrt(us / REF_S_ABS) : 0;

        toA = Math.max(0, Math.min(1, toA));
        tuA = Math.max(0, Math.min(1, tuA));
        toS = Math.max(0, Math.min(1, toS));
        tuS = Math.max(0, Math.min(1, tuS));

        if (oa > EPS_ACTIVE) toA = Math.max(toA, MIN_A);
        if (ua > EPS_ACTIVE) tuA = Math.max(tuA, MIN_A);
        if (os > EPS_ACTIVE) toS = Math.max(toS, MIN_S);
        if (us > EPS_ACTIVE) tuS = Math.max(tuS, MIN_S);

        // Hold hysteresis: keep minimal visibility while hold is active
        if (STATE.overA_hold[i] > 0) toA = Math.max(toA, MIN_A * 0.75);
        if (STATE.underA_hold[i] > 0) tuA = Math.max(tuA, MIN_A * 0.75);
        if (STATE.overS_hold[i] > 0) toS = Math.max(toS, MIN_S * 0.75);
        if (STATE.underS_hold[i] > 0) tuS = Math.max(tuS, MIN_S * 0.75);

        STATE.overA_sm[i] = _approach(STATE.overA_sm[i], toA, dt, (toA > STATE.overA_sm[i]) ? ON_TAU : OFF_TAU);
        STATE.underA_sm[i] = _approach(STATE.underA_sm[i], tuA, dt, (tuA > STATE.underA_sm[i]) ? ON_TAU : OFF_TAU);
        STATE.overS_sm[i] = _approach(STATE.overS_sm[i], toS, dt, (toS > STATE.overS_sm[i]) ? ON_TAU : OFF_TAU);
        STATE.underS_sm[i] = _approach(STATE.underS_sm[i], tuS, dt, (tuS > STATE.underS_sm[i]) ? ON_TAU : OFF_TAU);

        // Thickness magnitude (0..1) from ABS (separate mapping); also smoothed.
        const mOA = 1 - Math.exp(-(oa / MAG_REF_A));
        const mUA = 1 - Math.exp(-(ua / MAG_REF_A));
        const mOS = 1 - Math.exp(-(os / MAG_REF_S));
        const mUS = 1 - Math.exp(-(us / MAG_REF_S));

        STATE.overA_mag_sm[i] = _approach(STATE.overA_mag_sm[i], mOA, dt, (mOA > STATE.overA_mag_sm[i]) ? ON_TAU : OFF_TAU);
        STATE.underA_mag_sm[i] = _approach(STATE.underA_mag_sm[i], mUA, dt, (mUA > STATE.underA_mag_sm[i]) ? ON_TAU : OFF_TAU);
        STATE.overS_mag_sm[i] = _approach(STATE.overS_mag_sm[i], mOS, dt, (mOS > STATE.overS_mag_sm[i]) ? ON_TAU : OFF_TAU);
        STATE.underS_mag_sm[i] = _approach(STATE.underS_mag_sm[i], mUS, dt, (mUS > STATE.underS_mag_sm[i]) ? ON_TAU : OFF_TAU);

        if (STATE.overA_sm[i] > 0.01 || STATE.underA_sm[i] > 0.01) anyA = true;
        if (STATE.overS_sm[i] > 0.01 || STATE.underS_sm[i] > 0.01) anyS = true;
      }

      // Clear and redraw graphics
      const gAOver = STATE.gAOver;
      const gAUnder = STATE.gAUnder;
      const gSOver = STATE.gSOver;
      const gSUnder = STATE.gSUnder;

      gAOver.clear();
      gAUnder.clear();
      gSOver.clear();
      gSUnder.clear();

      // Reset curve actives
      for (let i = 0; i < 6; i++) {
        STATE.curvesAOver[i].active = false;
        STATE.curvesAUnder[i].active = false;
        STATE.curvesSOver[i].active = false;
        STATE.curvesSUnder[i].active = false;
      }

      // Amount streams (liquid ribbon + circle droplets)
      if (anyA) {
        for (let i = 0; i < 6; i++) {
          if (STATE.overA_sm[i] > 0.01) {
            const dir = (Math.abs(STATE.overA_val[i]) > DIR_EPS) ? 0 : (STATE.overA_dir[i] || 1);
            const signedForCurve = (Math.abs(STATE.overA_val[i]) > DIR_EPS) ? STATE.overA_val[i] : (dir * (STATE.overA_abs[i] || 1e-6));
            const c = _buildCurve(STATE.curvesAOver[i], i, signedForCurve, 'over', cx, cy, ringR, mvpWellGeom, 0);
            if (c) _drawAmountRibbon(gAOver, c, STATE.overA_sm[i], STATE.overA_mag_sm[i]);
          }
          if (STATE.underA_sm[i] > 0.01) {
            const dir = (Math.abs(STATE.underA_val[i]) > DIR_EPS) ? 0 : (STATE.underA_dir[i] || 1);
            const signedForCurve = (Math.abs(STATE.underA_val[i]) > DIR_EPS) ? STATE.underA_val[i] : (dir * (STATE.underA_abs[i] || 1e-6));
            const c = _buildCurve(STATE.curvesAUnder[i], i, signedForCurve, 'under', cx, cy, ringR, mvpWellGeom, 0);
            if (c) _drawAmountRibbon(gAUnder, c, STATE.underA_sm[i], STATE.underA_mag_sm[i]);
          }
        }
      }

      // Spin streams (distinct corkscrew/wave + diamond droplets)
      if (anyS) {
        const SPIN_EXTRA_PUSH = 6;
        for (let i = 0; i < 6; i++) {
          if (STATE.overS_sm[i] > 0.01) {
            const dir = (Math.abs(STATE.overS_val[i]) > DIR_EPS) ? 0 : (STATE.overS_dir[i] || 1);
            const signedForCurve = (Math.abs(STATE.overS_val[i]) > DIR_EPS) ? STATE.overS_val[i] : (dir * (STATE.overS_abs[i] || 1e-6));
            const c = _buildCurve(STATE.curvesSOver[i], i, signedForCurve, 'over', cx, cy, ringR, mvpWellGeom, SPIN_EXTRA_PUSH);
            if (c) _drawSpinWave(gSOver, c, STATE.overS_sm[i], STATE.overS_mag_sm[i], i, 'over', +1); // positive spin overflow
          }
          if (STATE.underS_sm[i] > 0.01) {
            const dir = (Math.abs(STATE.underS_val[i]) > DIR_EPS) ? 0 : (STATE.underS_dir[i] || 1);
            const signedForCurve = (Math.abs(STATE.underS_val[i]) > DIR_EPS) ? STATE.underS_val[i] : (dir * (STATE.underS_abs[i] || 1e-6));
            const c = _buildCurve(STATE.curvesSUnder[i], i, signedForCurve, 'under', cx, cy, ringR, mvpWellGeom, SPIN_EXTRA_PUSH);
            if (c) _drawSpinWave(gSUnder, c, STATE.underS_sm[i], STATE.underS_mag_sm[i], i, 'under', -1); // negative spin underflow
          }
        }
      }

      // Update droplets — Amount
      const dropletsA = STATE.dropletsA;
      for (let k = 0; k < dropletsA.length; k++) {
        const spr = dropletsA[k];
        const lane = spr._lane;
        const seam = spr._seam | 0;
        const slot = spr._slot | 0;

        const curve = (lane === 'over') ? STATE.curvesAOver[seam] : STATE.curvesAUnder[seam];
        const inten01 = (lane === 'over') ? STATE.overA_sm[seam] : STATE.underA_sm[seam];
        const mag01 = (lane === 'over') ? STATE.overA_mag_sm[seam] : STATE.underA_mag_sm[seam];

        if (!curve || !curve.active || inten01 <= 0.01) {
          spr.visible = false;
          continue;
        }

        // Advance along the curve
        const baseSpd = spr._spd || 0.6;
        const spd = baseSpd * (0.55 + 1.65 * inten01);
        spr._t = (spr._t || 0) + spd * dt;

        // Stagger via slot
        const t0 = (spr._t + (slot / 4)) % 1;

        // Quadratic Bezier point (no allocations)
        const it = 1 - t0;
        const a = it * it;
        const b = 2 * it * t0;
        const c = t0 * t0;
        const px = a * curve.p0x + b * curve.cpx + c * curve.p1x;
        const py = a * curve.p0y + b * curve.cpy + c * curve.p1y;
        spr.position.set(px, py);

        spr.visible = true;
        spr.tint = curve.col;
        spr.alpha = 0.14 + 0.60 * inten01;
        const size = 2.0 + 4.2 * inten01 + 3.2 * mag01;
        spr.width = spr.height = size;
      }

      // Update droplets — Spin (diamond + subtle rotation)
      const dropletsS = STATE.dropletsS;
      for (let k = 0; k < dropletsS.length; k++) {
        const spr = dropletsS[k];
        const lane = spr._lane;
        const seam = spr._seam | 0;
        const slot = spr._slot | 0;

        // For spin, lane maps to over/under buckets in the spin channel.
        const curve = (lane === 'over') ? STATE.curvesSOver[seam] : STATE.curvesSUnder[seam];
        const inten01 = (lane === 'over') ? STATE.overS_sm[seam] : STATE.underS_sm[seam];
        const mag01 = (lane === 'over') ? STATE.overS_mag_sm[seam] : STATE.underS_mag_sm[seam];

        if (!curve || !curve.active || inten01 <= 0.01) {
          spr.visible = false;
          continue;
        }

        const baseSpd = spr._spd || 0.75;
        const spd = baseSpd * (0.60 + 1.85 * inten01);
        spr._t = (spr._t || 0) + spd * dt;

        const t0 = (spr._t + (slot / 3)) % 1;

        const it = 1 - t0;
        const a = it * it;
        const b = 2 * it * t0;
        const c = t0 * t0;
        const px = a * curve.p0x + b * curve.cpx + c * curve.p1x;
        const py = a * curve.p0y + b * curve.cpy + c * curve.p1y;
        spr.position.set(px, py);

        spr.visible = true;
        // Slightly whiter tint for spin droplets
        spr.tint = _mixTowardWhite(curve.col, 0.55);
        spr.alpha = 0.18 + 0.65 * inten01;
        const size = 1.8 + 3.5 * inten01 + 2.2 * mag01;
        spr.width = spr.height = size;

        const rotSpd = spr._rotSpd || 3.0;
        const rotDir = spr._rotDir || 1;
        spr.rotation = (spr.rotation || 0) + rotDir * rotSpd * dt;
      }

      // If nothing active, hide quickly.
      if (!anyA && !anyS) {
        for (let k = 0; k < dropletsA.length; k++) dropletsA[k].visible = false;
        for (let k = 0; k < dropletsS.length; k++) dropletsS[k].visible = false;
      }
    } catch (e) {
      // Fail-safe: never break the frame.
      try { if (STATE.layer) STATE.layer.visible = false; } catch (_) {}
    }
  };
})();
