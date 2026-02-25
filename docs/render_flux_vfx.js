// Emotioncraft render_flux_vfx.js — Psyche↔Well Flux VFX (visual-only) (PASS A52)
// Amorphous wisps + particles + tiny eddies between each well and its matching psyche wedge.
// Hard constraints:
// - Masked to ONLY its own wedge annulus + its own well circle (no bleeding)
// - Lives in EC.RENDER.psycheFluxLayer inserted between psycheFxLayer and goal/text layers
// - Toggleable via EC.TUNE.FLUX_VFX.enabled
(() => {
  const EC = (window.EC = window.EC || {});
  EC.RENDER_FLUX_VFX = EC.RENDER_FLUX_VFX || {};
  const MOD = EC.RENDER_FLUX_VFX;

  const TWO_PI = Math.PI * 2;
  const DEG = Math.PI / 180;

  const STATE = {
    _errOnce: false,
    inited: false,
    layer: null,
    lanes: null,
    texParticle: null,
    texWisp: null,
    texEddy: null,
    t: 0,
    // smoothed intensity 0..1
    intenSm: new Float32Array(6),
    hold: new Float32Array(6),
    dir: new Int8Array(6),
    // cached geom pieces
    r0: 0,
    r1: 0,
    startAng: new Float32Array(6),
    endAng: new Float32Array(6),
    centerAng: new Float32Array(6),
    // per-lane corridor clamp (unwrapped relative to center)
    edgeU: new Float32Array(6),
    centerU: new Float32Array(6),
    // per-lane side sign for curve bias (+1/-1)
    curveSide: new Int8Array(6),
    // scratch
    _p0: { x: 0, y: 0 },
    _p1: { x: 0, y: 0 },
    _p2: { x: 0, y: 0 },
    _tmp: { x: 0, y: 0 },
    _tmpD: { x: 0, y: 0 },
  };

  function _clamp(v, a, b) {
    v = +v;
    if (v < a) return a;
    if (v > b) return b;
    return v;
  }

  function _mix(a, b, t) {
    return a + (b - a) * t;
  }

  function _wrapPi(a) {
    a = a % TWO_PI;
    if (a >= Math.PI) a -= TWO_PI;
    if (a < -Math.PI) a += TWO_PI;
    return a;
  }

  function _angDiff(a, b) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
  }

  function _unwrapToNear(a, ref) {
    const d = _angDiff(a, ref);
    return ref + d;
  }

  function _getTune() {
    const T = (EC.TUNE && EC.TUNE.FLUX_VFX) ? EC.TUNE.FLUX_VFX : null;
    return T || {};
  }

  function _ensureTexParticle() {
    if (STATE.texParticle) return STATE.texParticle;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.22, 'rgba(255,255,255,0.70)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.20)');
      g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(32, 32, 32, 0, TWO_PI);
      ctx.fill();
      const tex = PIXI.Texture.from(c);
      try {
        if (tex && tex.baseTexture && PIXI.SCALE_MODES) tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      } catch (_) {}
      STATE.texParticle = tex;
      return tex;
    } catch (_) {
      STATE.texParticle = (PIXI && PIXI.Texture) ? PIXI.Texture.WHITE : null;
      return STATE.texParticle;
    }
  }

  function _ensureTexWisp() {
    if (STATE.texWisp) return STATE.texWisp;
    try {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 64;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);

      const lg = ctx.createLinearGradient(0, 0, c.width, 0);
      lg.addColorStop(0.00, 'rgba(255,255,255,0.00)');
      lg.addColorStop(0.12, 'rgba(255,255,255,0.28)');
      lg.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      lg.addColorStop(0.68, 'rgba(255,255,255,0.25)');
      lg.addColorStop(1.00, 'rgba(255,255,255,0.00)');

      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, c.width, c.height);

      // Vertical falloff mask
      const vg = ctx.createLinearGradient(0, 0, 0, c.height);
      vg.addColorStop(0.00, 'rgba(0,0,0,0.00)');
      vg.addColorStop(0.35, 'rgba(0,0,0,1.00)');
      vg.addColorStop(0.65, 'rgba(0,0,0,1.00)');
      vg.addColorStop(1.00, 'rgba(0,0,0,0.00)');
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';

      // Mild hotspot for direction cue
      const rg = ctx.createRadialGradient(56, 32, 0, 56, 32, 34);
      rg.addColorStop(0.00, 'rgba(255,255,255,0.80)');
      rg.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(56, 32, 52, 18, 0, 0, TWO_PI);
      ctx.fill();
      ctx.globalAlpha = 1;

      const tex = PIXI.Texture.from(c);
      try {
        if (tex && tex.baseTexture && PIXI.SCALE_MODES) tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      } catch (_) {}
      STATE.texWisp = tex;
      return tex;
    } catch (_) {
      STATE.texWisp = (PIXI && PIXI.Texture) ? PIXI.Texture.WHITE : null;
      return STATE.texWisp;
    }
  }

  function _ensureTexEddy() {
    if (STATE.texEddy) return STATE.texEddy;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, 96, 96);
      ctx.translate(48, 48);

      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 44);
      g.addColorStop(0.00, 'rgba(255,255,255,0.00)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.08)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.26)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.10)');
      g.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, TWO_PI);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 80; k++) {
        const t = k / 79;
        const a = t * TWO_PI * 1.25;
        const r = _mix(8, 40, t);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const tex = PIXI.Texture.from(c);
      try {
        if (tex && tex.baseTexture && PIXI.SCALE_MODES) tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
      } catch (_) {}
      STATE.texEddy = tex;
      return tex;
    } catch (_) {
      STATE.texEddy = (PIXI && PIXI.Texture) ? PIXI.Texture.WHITE : null;
      return STATE.texEddy;
    }
  }

  function _ensureLayerInserted() {
    if (!EC.RENDER || !EC.RENDER.psycheLayer || !EC.RENDER.psycheFxLayer) return false;
    const psycheLayer = EC.RENDER.psycheLayer;
    const fxLayer = EC.RENDER.psycheFxLayer;

    let layer = EC.RENDER.psycheFluxLayer || STATE.layer;
    if (!layer || !layer.parent || layer.parent !== psycheLayer) {
      layer = new PIXI.Container();
      layer.eventMode = 'none';
      layer.interactiveChildren = false;
      layer.name = 'psycheFluxLayer';
      try {
        const idx = (typeof psycheLayer.getChildIndex === 'function') ? psycheLayer.getChildIndex(fxLayer) : -1;
        if (idx >= 0) psycheLayer.addChildAt(layer, idx + 1);
        else psycheLayer.addChild(layer);
      } catch (_) {
        try { psycheLayer.addChild(layer); } catch (e2) {}
      }
      EC.RENDER.psycheFluxLayer = layer;
      STATE.layer = layer;
    }

    // Reassert correct ordering if other children were appended later.
    try {
      const idxFx = psycheLayer.getChildIndex(fxLayer);
      const idxMe = psycheLayer.getChildIndex(layer);
      if (idxFx >= 0 && idxMe >= 0 && idxMe !== idxFx + 1) {
        psycheLayer.removeChild(layer);
        psycheLayer.addChildAt(layer, idxFx + 1);
      }
    } catch (_) {}

    return true;
  }

  function ensure() {
    if (STATE.inited) {
      try { _ensureLayerInserted(); } catch (_) {}
      return true;
    }
    if (typeof PIXI === 'undefined') return false;
    if (!EC.RENDER || !EC.RENDER.root) return false;
    if (!_ensureLayerInserted()) return false;

    const layer = EC.RENDER.psycheFluxLayer;
    if (!layer) return false;

    const texP = _ensureTexParticle();
    const texW = _ensureTexWisp();
    const texE = _ensureTexEddy();

    const lanes = new Array(6);
    const BLEND_SCREEN = (PIXI.BLEND_MODES && PIXI.BLEND_MODES.SCREEN != null)
      ? PIXI.BLEND_MODES.SCREEN
      : ((PIXI.BLEND_MODES && PIXI.BLEND_MODES.ADD != null) ? PIXI.BLEND_MODES.ADD : 0);

    for (let i = 0; i < 6; i++) {
      const wrap = new PIXI.Container();
      wrap.eventMode = 'none';
      wrap.interactiveChildren = false;
      wrap.name = 'fluxLaneWrap_' + i;

      const view = new PIXI.Container();
      view.eventMode = 'none';
      view.interactiveChildren = false;
      view.name = 'fluxLaneView_' + i;

      const maskG = new PIXI.Graphics();
      maskG.eventMode = 'none';
      maskG.interactiveChildren = false;
      // Keep masks renderable (Android Chrome can skip invisible/zero-alpha masks).
      maskG.alpha = 0.001;
      maskG.name = 'fluxLaneMask_' + i;
      view.mask = maskG;

      wrap.addChild(view);
      wrap.addChild(maskG);
      layer.addChild(wrap);

      const particles = [];
      const wisps = [];
      const eddies = [];

      for (let k = 0; k < 18; k++) {
        const s = new PIXI.Sprite(texP || PIXI.Texture.WHITE);
        if (s.anchor) s.anchor.set(0.5);
        s.eventMode = 'none';
        s.visible = false;
        s.alpha = 0;
        s.blendMode = BLEND_SCREEN;
        s._u = Math.random();
        s._spd = _mix(0.50, 1.25, Math.random());
        s._ph = Math.random() * TWO_PI;
        s._sOff = Math.random();
        particles.push(s);
        view.addChild(s);
      }

      for (let k = 0; k < 10; k++) {
        const w = new PIXI.Sprite(texW || PIXI.Texture.WHITE);
        if (w.anchor) w.anchor.set(0.10, 0.50);
        w.eventMode = 'none';
        w.visible = false;
        w.alpha = 0;
        w.blendMode = BLEND_SCREEN;
        w._u = Math.random();
        w._spd = _mix(0.22, 0.65, Math.random());
        w._ph = Math.random() * TWO_PI;
        w._len = _mix(0.34, 0.70, Math.random());
        w._wid = _mix(0.20, 0.52, Math.random());
        w._sOff = Math.random();
        wisps.push(w);
        view.addChild(w);
      }

      for (let k = 0; k < 3; k++) {
        const e = new PIXI.Sprite(texE || PIXI.Texture.WHITE);
        if (e.anchor) e.anchor.set(0.5);
        e.eventMode = 'none';
        e.visible = false;
        e.alpha = 0;
        e.blendMode = BLEND_SCREEN;
        e._ph = Math.random() * TWO_PI;
        e._spd = _mix(0.35, 0.85, Math.random());
        e._rad = _mix(0.55, 1.05, Math.random());
        eddies.push(e);
        view.addChild(e);
      }

      
      // Lane tint (match hue color; keeps FX airy but readable).
      const FALLBACK_HUES = ['red','purple','blue','green','yellow','orange'];
      let laneColor = 0xffffff;
      try {
        const hueKey = (EC && typeof EC.hueKey === 'function') ? EC.hueKey(i)
          : ((EC && EC.CONST && EC.CONST.HUES && EC.CONST.HUES[i]) ? EC.CONST.HUES[i] : (FALLBACK_HUES[i] || 'red'));
        const pal = (EC && EC.TUNE && EC.TUNE.RENDER && EC.TUNE.RENDER.MVP_WELL_COLORS) ? EC.TUNE.RENDER.MVP_WELL_COLORS : null;
        if (pal && pal[hueKey] != null) laneColor = pal[hueKey] >>> 0;
      } catch (_) {}
      try {
        for (let k = 0; k < particles.length; k++) particles[k].tint = laneColor;
        for (let k = 0; k < wisps.length; k++) wisps[k].tint = laneColor;
        for (let k = 0; k < eddies.length; k++) eddies[k].tint = laneColor;
      } catch (_) {}
lanes[i] = { wrap, view, maskG, particles, wisps, eddies };
    }

    STATE.lanes = lanes;
    STATE.inited = true;
    return true;
  }

  function _drawAnnularWedge(gr, cx, cy, rin, rout, a0, a1) {
    gr.moveTo(cx + rout * Math.cos(a0), cy + rout * Math.sin(a0));
    gr.arc(cx, cy, rout, a0, a1, false);
    gr.lineTo(cx + rin * Math.cos(a1), cy + rin * Math.sin(a1));
    gr.arc(cx, cy, rin, a1, a0, true);
    gr.closePath();
  }

  function _bezier2(p0, p1, p2, u, out) {
    const iu = 1 - u;
    const a = iu * iu;
    const b = 2 * iu * u;
    const c = u * u;
    out.x = a * p0.x + b * p1.x + c * p2.x;
    out.y = a * p0.y + b * p1.y + c * p2.y;
    return out;
  }

  function _bezier2Deriv(p0, p1, p2, u, out) {
    const iu = 1 - u;
    out.x = 2 * iu * (p1.x - p0.x) + 2 * u * (p2.x - p1.x);
    out.y = 2 * iu * (p1.y - p0.y) + 2 * u * (p2.y - p1.y);
    return out;
  }

  function _clampPointToCorridor(p, edgeU, centerU, marginRad) {
    const r = Math.hypot(p.x, p.y);
    if (!isFinite(r) || r <= 0.0001) return p;
    // Only clamp inside the psyche ring-ish radius; leave wells unaffected.
    if (r > STATE.r1 * 1.06) return p;

    const ang = Math.atan2(p.y, p.x);
    let aU = _unwrapToNear(ang, centerU);

    // Clamp to the interval between edgeU and centerU regardless of which is larger.
    // This prevents the "endAng skew" case from forcing edgeU below centerU via -2π shifts.
    const lo = Math.min(edgeU, centerU) + marginRad;
    const hi = Math.max(edgeU, centerU) - marginRad;
    if (hi <= lo) {
      // Corridor collapsed (can happen with huge margins); snap to centerU.
      aU = centerU;
    } else {
      if (aU < lo) aU = lo;
      if (aU > hi) aU = hi;
    }

    const aW = _wrapPi(aU);
    p.x = Math.cos(aW) * r;
    p.y = Math.sin(aW) * r;
    return p;
  }

  function _updateGeom(geom) {
    const ringR = (geom && typeof geom.ringR === 'number') ? geom.ringR : 140;
    const wellMaxR = (geom && typeof geom.wellMaxR === 'number') ? geom.wellMaxR : 60;
    const padding = (geom && typeof geom.boardSize === 'number') ? Math.max(12, geom.boardSize * 0.020) : 12;
    const safeR = Math.max(30, ringR - wellMaxR - padding);
    STATE.r1 = safeR * 0.98;
    STATE.r0 = safeR * 0.20;

    const slice = TWO_PI / 6;
    const gap = slice * 0.06;
    const span = slice - gap;
    const PSYCHE_ROT = -Math.PI / 6;
    const base = -Math.PI / 2 + PSYCHE_ROT;
    for (let i = 0; i < 6; i++) {
      const start = base + i * slice + gap / 2;
      const end = start + span;
      STATE.startAng[i] = start;
      STATE.endAng[i] = end;
      STATE.centerAng[i] = (start + end) * 0.5;
    }
  }

  function update(snap, geom, dt, mvpWellGeom) {
    try {
      const T = _getTune();
      const enabled = (T && T.enabled !== false);
      if (!enabled) {
        try { if (EC.RENDER && EC.RENDER.psycheFluxLayer) EC.RENDER.psycheFluxLayer.visible = false; } catch (_) {}
        return;
      }

      if (!ensure()) return;
      if (!snap || !snap.SIM || !geom || !mvpWellGeom) return;

      const SIM = snap.SIM;
      const P = SIM.psyP || [0, 0, 0, 0, 0, 0];
      const Aarr = SIM.wellsA || [0, 0, 0, 0, 0, 0];
      const Sarr = SIM.wellsS || [0, 0, 0, 0, 0, 0];
      if (!Aarr || Aarr.length !== 6 || !Sarr || Sarr.length !== 6) return;

      const _dt = (typeof dt === 'number' && isFinite(dt)) ? Math.max(0, Math.min(0.05, dt)) : 0;
      STATE.t += _dt;

      try { _ensureLayerInserted(); } catch (_) {}
      try { if (EC.RENDER && EC.RENDER.psycheFluxLayer) EC.RENDER.psycheFluxLayer.visible = true; } catch (_) {}

      _updateGeom(geom);

      const HUE_CAP = (EC.TUNE && typeof EC.TUNE.PSY_HUE_CAP === 'number') ? EC.TUNE.PSY_HUE_CAP : 500;
      const PSY_NORM = (EC.TUNE && typeof EC.TUNE.PSY_FLUX_NORM === 'number') ? EC.TUNE.PSY_FLUX_NORM : 1000;

      const rateRef = (typeof T.rateRef === 'number' && isFinite(T.rateRef) && T.rateRef > 0) ? T.rateRef : 8.0;
      const dead01 = _clamp((typeof T.deadzone01 === 'number') ? T.deadzone01 : 0.025, 0, 0.80);
      const alphaMax = _clamp((typeof T.alphaMax === 'number') ? T.alphaMax : 0.35, 0, 0.75);
      const alphaGain = _clamp((typeof T.alphaGain === 'number') ? T.alphaGain : 2.0, 0, 6.0);
      const alphaCap = _clamp((typeof T.alphaCap === 'number') ? T.alphaCap : 0.50, 0, 0.95);
      const activityGain = _clamp((typeof T.activityGain === 'number') ? T.activityGain : 2.0, 0.5, 4.0);
      const holdSec = _clamp((typeof T.holdSec === 'number') ? T.holdSec : 0.22, 0, 2.0);
      const smoothHz = _clamp((typeof T.smoothingHz === 'number') ? T.smoothingHz : 8.0, 0.1, 60);
      const corrMargin = _clamp((typeof T.corridorMarginRad === 'number') ? T.corridorMarginRad : (2.0 * DEG), 0.0, 0.40);

      const dbgForceOn = !!(T && T.debugForceOn);
      const dbgShowMasks = !!(T && T.debugShowMasks);
      const dbgTinySpin = (typeof T.debugTinySpin === 'number' && isFinite(T.debugTinySpin)) ? Math.max(0, T.debugTinySpin) : 0.02;

      const pCountMax = _clamp((typeof T.particlesMax === 'number') ? T.particlesMax : 16, 4, 24) | 0;
      const wCountMax = _clamp((typeof T.wispsMax === 'number') ? T.wispsMax : 8, 2, 12) | 0;
      const eCountMax = _clamp((typeof T.eddiesMax === 'number') ? T.eddiesMax : 2, 0, 3) | 0;

      const cx = (typeof geom.cx === 'number') ? geom.cx : 0;
      const cy = (typeof geom.cy === 'number') ? geom.cy : 0;

      const lanes = STATE.lanes;
      if (!lanes) return;

      for (let i = 0; i < 6; i++) {
        const lane = lanes[i];
        if (!lane) continue;

        const wx = (mvpWellGeom.cx && typeof mvpWellGeom.cx[i] === 'number') ? mvpWellGeom.cx[i] : NaN;
        const wy = (mvpWellGeom.cy && typeof mvpWellGeom.cy[i] === 'number') ? mvpWellGeom.cy[i] : NaN;
        const wr = (mvpWellGeom.r && typeof mvpWellGeom.r[i] === 'number') ? mvpWellGeom.r[i] : NaN;
        if (!isFinite(wx) || !isFinite(wy) || !isFinite(wr) || wr <= 1) {
          lane.wrap.visible = false;
          continue;
        }

        const wxL = wx - cx;
        const wyL = wy - cy;

        const A = +Aarr[i] || 0;
        const S = +Sarr[i] || 0;
        const flux = A * S;
        const rateAbs = Math.abs(flux) / (PSY_NORM || 1000);
        let intenRaw = _clamp(rateAbs / rateRef, 0, 1);
        let target = 0;
        if (intenRaw > dead01) target = (intenRaw - dead01) / (1 - dead01);

        const sign = (flux >= 0) ? 1 : -1;
        if (intenRaw > (dead01 + 0.03)) STATE.dir[i] = sign;
        let dir = (STATE.dir[i] === 0) ? sign : STATE.dir[i];

        if (target > 0) {
          STATE.hold[i] = holdSec;
        } else if (_dt > 0) {
          STATE.hold[i] = Math.max(0, (STATE.hold[i] || 0) - _dt);
          if ((STATE.hold[i] || 0) > 0) {
            const k = (STATE.hold[i] || 0) / (holdSec || 0.0001);
            target = Math.max(target, 0.16 * k);
          }
        }

        const a = (_dt > 0) ? (1 - Math.exp(-_dt * smoothHz)) : 0;
        const sm = STATE.intenSm[i] = (STATE.intenSm[i] || 0) + (target - (STATE.intenSm[i] || 0)) * a;
        let intensity = _clamp(sm, 0, 1);

        const dbgLaneOn = dbgForceOn && (Math.abs(S) > dbgTinySpin);
        if (dbgLaneOn) {
          // Force-on for mobile validation: keep geometry/masks/layering visible.
          intensity = Math.max(intensity, 0.70);
          dir = (S >= 0) ? 1 : -1;
          STATE.dir[i] = dir;
        }

        if (intensity <= 0.001) {
          lane.wrap.visible = false;
          continue;
        }
        lane.wrap.visible = true;

        const startAng = STATE.startAng[i];
        const endAng = STATE.endAng[i];
        const centerAng = STATE.centerAng[i];

        const inwardAng = Math.atan2(-wyL, -wxL);
        const arcSpan = (typeof T.anchorArcDeg === 'number' ? T.anchorArcDeg : 70) * DEG;
        const midAng = inwardAng - arcSpan * 0.5;
        const ax = wxL + wr * Math.cos(midAng);
        const ay = wyL + wr * Math.sin(midAng);
        const phi = Math.atan2(ay, ax);

        const d0 = Math.abs(_angDiff(phi, startAng));
        const d1 = Math.abs(_angDiff(phi, endAng));
        const edgeAng = (d0 <= d1) ? startAng : endAng;

        const centerU = centerAng;
        let edgeU = _unwrapToNear(edgeAng, centerU);
        const fluxCenterU = (edgeU + centerU) * 0.5;
        const fluxCenterAng = _wrapPi(fluxCenterU);

        STATE.edgeU[i] = edgeU;
        STATE.centerU[i] = centerU;

        const v = _clamp(+P[i] || 0, 0, HUE_CAP);
        const tFill = (HUE_CAP > 0) ? (v / HUE_CAP) : 0;
        const rf = Math.sqrt(STATE.r0 * STATE.r0 + tFill * (STATE.r1 * STATE.r1 - STATE.r0 * STATE.r0));
        const ex = Math.cos(fluxCenterAng) * rf;
        const ey = Math.sin(fluxCenterAng) * rf;

        try {
          const mg = lane.maskG;
          mg.clear();
          mg.beginFill(0xffffff, 1);
          _drawAnnularWedge(mg, 0, 0, STATE.r0, STATE.r1, startAng, endAng);
          // Bridge wedge to avoid clipping in the radial gap between wheel and well.
          const wellCenterR = Math.hypot(wxL, wyL);
          const rBridge = Math.max(STATE.r1, wellCenterR - wr + 6);
          if (rBridge > STATE.r1 + 0.5) {
            _drawAnnularWedge(mg, 0, 0, STATE.r1, rBridge, startAng, endAng);
          }
          mg.drawCircle(wxL, wyL, wr * 1.05);
          mg.endFill();
          // Masks must remain renderable; keep alpha > 0. Debug can reveal mask region.
          mg.visible = true;
          mg.alpha = dbgShowMasks ? 0.06 : 0.001;
        } catch (_) {}

        // curve bias side
        let side = STATE.curveSide[i] || 1;
        try {
          const dx = ex - ax;
          const dy = ey - ay;
          const dlen = Math.hypot(dx, dy) || 1;
          const px = -dy / dlen;
          const py = dx / dlen;
          const testMag = Math.max(2, Math.min(10, dlen * 0.05));
          const mx = _mix(ax, ex, 0.5);
          const my = _mix(ay, ey, 0.5);
          const aPlus = Math.atan2(my + py * testMag, mx + px * testMag);
          const aMinus = Math.atan2(my - py * testMag, mx - px * testMag);
          const dp = Math.abs(_angDiff(aPlus, edgeAng));
          const dm = Math.abs(_angDiff(aMinus, edgeAng));
          side = (dp <= dm) ? 1 : -1;
        } catch (_) {}
        STATE.curveSide[i] = side;

        const pFloor = (intensity < 0.20) ? 0 : ((intensity < 0.40) ? 1 : 2);
        const pCap = Math.min(pCountMax, (lane.particles ? lane.particles.length : pCountMax));
        const pActive = Math.max(0, Math.min(pCap, Math.round(_mix(pFloor, pCap, intensity) * activityGain)));

        const wFloor = (intensity < 0.25) ? 0 : ((intensity < 0.45) ? 1 : 2);
        const wCap = Math.min(wCountMax, (lane.wisps ? lane.wisps.length : wCountMax));
        const wActive = Math.max(0, Math.min(wCap, Math.round(_mix(wFloor, wCap, intensity) * activityGain)));

        const eFloor = (intensity < 0.55) ? 0 : 1;
        const eCap = Math.min(eCountMax, (lane.eddies ? lane.eddies.length : eCountMax));
        const eActive = Math.max(0, Math.min(eCap, Math.round(_mix(eFloor, eCap, intensity) * activityGain)));

        // Double alpha contribution (PASS A55) while keeping a hard translucency cap.
        const baseAlpha = Math.min(alphaCap, (alphaMax * intensity) * alphaGain);

        // Particles
        const parts = lane.particles;
        for (let k = 0; k < parts.length; k++) {
          const s = parts[k];
          if (!s) continue;
          if (k >= pActive) {
            s.visible = false;
            continue;
          }
          s.visible = true;
          if (_dt > 0) {
            const spd = (0.55 + 1.55 * intensity) * (s._spd || 1);
            s._u = (s._u || 0) + (dir >= 0 ? 1 : -1) * _dt * spd;
            if (s._u > 1) s._u -= 1;
            if (s._u < 0) s._u += 1;
          }
          const u = _clamp(s._u || 0, 0, 1);

          const wob = 0.06 * Math.sin((STATE.t * 1.7) + (s._ph || 0));
          const theta = inwardAng - (s._sOff || 0) * arcSpan + wob;
          const sx = wxL + wr * Math.cos(theta);
          const sy = wyL + wr * Math.sin(theta);

          const p0 = STATE._p0; p0.x = sx; p0.y = sy;
          const p2 = STATE._p2; p2.x = ex; p2.y = ey;
          const dx = p2.x - p0.x;
          const dy = p2.y - p0.y;
          const dlen = Math.hypot(dx, dy) || 1;
          const px = (-dy / dlen) * side;
          const py = (dx / dlen) * side;
          const curv = dlen * _mix(0.06, 0.16, intensity);
          const p1 = STATE._p1;
          p1.x = _mix(p0.x, p2.x, 0.46) + px * curv;
          p1.y = _mix(p0.y, p2.y, 0.46) + py * curv;

          const out = STATE._tmp;
          _bezier2(p0, p1, p2, u, out);
          const drift = (0.55 + 0.45 * intensity) * Math.sin((s._ph || 0) + STATE.t * _mix(2.2, 4.2, intensity) + u * 6.0);
          out.x += px * drift * _mix(2.0, 6.0, intensity);
          out.y += py * drift * _mix(2.0, 6.0, intensity);
          _clampPointToCorridor(out, edgeU, centerU, corrMargin);
          s.position.set(out.x, out.y);

          const aPulse = 0.72 + 0.28 * Math.sin((s._ph || 0) + STATE.t * 3.5);
          s.alpha = baseAlpha * 0.55 * aPulse;
          const sc = _mix(0.20, 0.60, intensity) * _mix(0.75, 1.25, (k / Math.max(1, pActive - 1)));
          s.scale.set(sc);
        }

        // Wisps
        const wisps = lane.wisps;
        for (let k = 0; k < wisps.length; k++) {
          const w = wisps[k];
          if (!w) continue;
          if (k >= wActive) {
            w.visible = false;
            continue;
          }
          w.visible = true;
          if (_dt > 0) {
            const spd = (0.20 + 0.95 * intensity) * (w._spd || 1);
            w._u = (w._u || 0) + (dir >= 0 ? 1 : -1) * _dt * spd;
            if (w._u > 1) w._u -= 1;
            if (w._u < 0) w._u += 1;
          }
          const u = _clamp(w._u || 0, 0, 1);

          const wob = 0.04 * Math.sin((STATE.t * 1.2) + (w._ph || 0));
          const theta = inwardAng - (w._sOff || 0) * arcSpan + wob;
          const sx = wxL + wr * Math.cos(theta);
          const sy = wyL + wr * Math.sin(theta);

          const p0 = STATE._p0; p0.x = sx; p0.y = sy;
          const p2 = STATE._p2; p2.x = ex; p2.y = ey;
          const dx = p2.x - p0.x;
          const dy = p2.y - p0.y;
          const dlen = Math.hypot(dx, dy) || 1;
          const px = (-dy / dlen) * side;
          const py = (dx / dlen) * side;
          const curv = dlen * _mix(0.05, 0.14, intensity);
          const p1 = STATE._p1;
          p1.x = _mix(p0.x, p2.x, 0.48) + px * curv;
          p1.y = _mix(p0.y, p2.y, 0.48) + py * curv;

          const out = STATE._tmp;
          _bezier2(p0, p1, p2, u, out);
          const drift = Math.sin((w._ph || 0) + STATE.t * _mix(1.4, 2.6, intensity) + u * 4.0);
          out.x += px * drift * _mix(1.0, 4.0, intensity);
          out.y += py * drift * _mix(1.0, 4.0, intensity);
          _clampPointToCorridor(out, edgeU, centerU, corrMargin);
          w.position.set(out.x, out.y);

          const deriv = STATE._tmpD;
          _bezier2Deriv(p0, p1, p2, u, deriv);
          w.rotation = Math.atan2(deriv.y, deriv.x);

          const pulse = 0.65 + 0.35 * Math.sin((w._ph || 0) + STATE.t * 1.6);
          w.alpha = baseAlpha * 0.72 * pulse;
          const len = _mix(0.36, 0.78, intensity) * (w._len || 0.55);
          const wid = _mix(0.22, 0.55, intensity) * (w._wid || 0.35);
          w.scale.set(len * _mix(0.90, 1.15, intensity), wid);
        }

        // Eddies
        const eds = lane.eddies;
        for (let k = 0; k < eds.length; k++) {
          const e = eds[k];
          if (!e) continue;
          if (k >= eActive) {
            e.visible = false;
            continue;
          }
          e.visible = true;
          let px0 = 0, py0 = 0;
          if (k === 0) {
            px0 = wxL + wr * 0.84 * Math.cos(inwardAng);
            py0 = wyL + wr * 0.84 * Math.sin(inwardAng);
          } else {
            px0 = ex;
            py0 = ey;
          }

          const wobR = _mix(1.5, 5.0, intensity) * (e._rad || 1);
          const angW = (e._ph || 0) + STATE.t * _mix(0.9, 1.7, intensity) * (dir >= 0 ? 1 : -1);
          const out = STATE._tmp;
          out.x = px0 + Math.cos(angW) * wobR;
          out.y = py0 + Math.sin(angW) * wobR;
          _clampPointToCorridor(out, edgeU, centerU, corrMargin);
          e.position.set(out.x, out.y);

          if (_dt > 0) {
            e.rotation = (e.rotation || 0) + _dt * (dir >= 0 ? 1 : -1) * _mix(0.7, 2.2, intensity) * (e._spd || 1);
          }
          e.alpha = baseAlpha * _mix(0.22, 0.45, intensity);
          e.scale.set(_mix(0.06, 0.14, intensity));
        }
      }
    } catch (e) {
      if (!STATE._errOnce) {
        STATE._errOnce = true;
        try {
          console.warn('FluxVFX update failed:', (e && e.message) ? e.message : e);
        } catch (_) {}
      }
    }
  }

  MOD.ensure = ensure;
  MOD.update = update;
})();
