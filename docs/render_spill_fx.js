// Emotioncraft render_spill_fx.js — Spill stream FX (visual-only) (PASS A33)
(() => {
  const EC = (window.EC = window.EC || {});
  EC.RENDER_SPILL_FX = EC.RENDER_SPILL_FX || {};

  const MOD = EC.RENDER_SPILL_FX;

  const STATE = {
    inited: false,
    layer: null,
    gOver: null,
    gUnder: null,
    dropletTex: null,
    droplets: [],
    overSm: new Float32Array(6),
    underSm: new Float32Array(6),
    overVal: new Float32Array(6),
    underVal: new Float32Array(6),
    curvesOver: new Array(6),
    curvesUnder: new Array(6),
    capRound: 1,
    joinRound: 1,
    t: 0,
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
    // Fallback: match canonical hue ordering
    const fallback = [0xd94141, 0x8b54d4, 0x2f7de1, 0x45b56a, 0xd8c23a, 0xe37b2c];
    return fallback[idx % fallback.length];
  }

  function _ensureDropletTex() {
    if (STATE.dropletTex) return STATE.dropletTex;
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
      STATE.dropletTex = tex;
      return tex;
    } catch (e) {
      STATE.dropletTex = PIXI.Texture.WHITE;
      return STATE.dropletTex;
    }
  }

  function ensure() {
    if (STATE.inited) return true;
    if (typeof PIXI === 'undefined') return false;
    if (!EC.RENDER || !EC.RENDER.root) return false;

    const root = EC.RENDER.root;

    // Cache line cap/join enums (avoid undefined access later)
    try {
      STATE.capRound = (PIXI.LINE_CAP && PIXI.LINE_CAP.ROUND != null) ? PIXI.LINE_CAP.ROUND : 1;
      STATE.joinRound = (PIXI.LINE_JOIN && PIXI.LINE_JOIN.ROUND != null) ? PIXI.LINE_JOIN.ROUND : 1;
    } catch (_) {
      STATE.capRound = 1;
      STATE.joinRound = 1;
    }

    // Dedicated spill layer inserted below wells so streams tuck under rims/selection.
    const layer = new PIXI.Container();
    layer.name = 'mvpSpillLayer';
    layer.eventMode = 'none';
    layer.interactiveChildren = false;

    const gOver = new PIXI.Graphics();
    const gUnder = new PIXI.Graphics();
    gOver.eventMode = 'none';
    gUnder.eventMode = 'none';

    layer.addChild(gOver);
    layer.addChild(gUnder);

    // Droplet pool (tiny circles) to add motion along the stream.
    const tex = _ensureDropletTex();
    const droplets = [];
    const PER_STREAM = 4;
    const TOTAL = 6 * 2 * PER_STREAM;
    for (let k = 0; k < TOTAL; k++) {
      const spr = new PIXI.Sprite(tex);
      spr.anchor && spr.anchor.set(0.5);
      spr.eventMode = 'none';
      spr.visible = false;
      spr.alpha = 0;
      spr._lane = (k < (TOTAL / 2)) ? 'over' : 'under';
      spr._seam = ((k % (TOTAL / 2)) / PER_STREAM) | 0;
      spr._slot = (k % PER_STREAM) | 0;
      spr._t = Math.random();
      spr._spd = 0.55 + Math.random() * 0.25; // normalized along-curve speed
      droplets.push(spr);
      layer.addChild(spr);
    }

    // Insert below mvpWellLayer (or just add if unknown)
    try {
      const wl = EC.RENDER.mvpWellLayer;
      if (wl && typeof root.getChildIndex === 'function') {
        const idx = root.getChildIndex(wl);
        root.addChildAt(layer, Math.max(0, idx));
      } else {
        root.addChild(layer);
      }
    } catch (_) {
      try { root.addChildAt(layer, 0); } catch (e2) { root.addChild(layer); }
    }

    EC.RENDER.mvpSpillLayer = layer;
    STATE.layer = layer;
    STATE.gOver = gOver;
    STATE.gUnder = gUnder;
    STATE.droplets = droplets;

    // Pre-create curve param objects (avoid per-frame allocations)
    for (let i = 0; i < 6; i++) {
      if (!STATE.curvesOver[i]) STATE.curvesOver[i] = { active: false, p0x: 0, p0y: 0, cpx: 0, cpy: 0, p1x: 0, p1y: 0, col: 0xffffff };
      if (!STATE.curvesUnder[i]) STATE.curvesUnder[i] = { active: false, p0x: 0, p0y: 0, cpx: 0, cpy: 0, p1x: 0, p1y: 0, col: 0xffffff };
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
        // Hide everything if telemetry isn't present.
        if (STATE.layer) STATE.layer.visible = false;
        return;
      }

      // Show layer (but remain non-interactive)
      STATE.layer.visible = true;

      dt = (typeof dt === 'number' && isFinite(dt)) ? dt : 0;
      if (dt < 0) dt = 0;
      if (dt > 0.05) dt = 0.05;
      STATE.t += dt;

      const cx = (geom && typeof geom.cx === 'number') ? geom.cx : 0;
      const cy = (geom && typeof geom.cy === 'number') ? geom.cy : 0;
      const ringR = (geom && typeof geom.ringR === 'number') ? geom.ringR : 160;

      const aOver = fx.aOver;
      const aUnder = fx.aUnder;
      const sOver = fx.sOver;
      const sUnder = fx.sUnder;

      // Build target signed values per seam (amount + faint spin contribution).
      const SPIN_K = 0.14;
      for (let i = 0; i < 6; i++) {
        const ov = (aOver ? (aOver[i] || 0) : 0) + SPIN_K * (sOver ? (sOver[i] || 0) : 0);
        const un = (aUnder ? (aUnder[i] || 0) : 0) + SPIN_K * (sUnder ? (sUnder[i] || 0) : 0);
        STATE.overVal[i] = ov;
        STATE.underVal[i] = un;
      }

      // Smooth intensity and fade quickly when flow stops.
      // Convert per-frame transferred units into a 0..1 intensity.
      const REF = 10; // ~units/frame at which the stream hits full brightness
      const ON_TAU = 0.08;
      const OFF_TAU = 0.28;
      let anyOver = false;
      let anyUnder = false;
      for (let i = 0; i < 6; i++) {
        const ov = STATE.overVal[i];
        const un = STATE.underVal[i];
        const to = Math.min(1, Math.abs(ov) / REF);
        const tu = Math.min(1, Math.abs(un) / REF);
        STATE.overSm[i] = _approach(STATE.overSm[i], to, dt, (to > STATE.overSm[i]) ? ON_TAU : OFF_TAU);
        STATE.underSm[i] = _approach(STATE.underSm[i], tu, dt, (tu > STATE.underSm[i]) ? ON_TAU : OFF_TAU);
        if (STATE.overSm[i] > 0.01) anyOver = true;
        if (STATE.underSm[i] > 0.01) anyUnder = true;
      }

      // Clear and redraw ribbons.
      const gO = STATE.gOver;
      const gU = STATE.gUnder;
      gO.clear();
      gU.clear();

      // Helper to draw one stream.
      function drawStream(out, g, seamIdx, signedVal, inten01, lane) {
        if (inten01 <= 0.01 || !signedVal) return null;
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

        // Start/end points near facing edges.
        const pad = 0.88;
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

        const push = 14 + ringR * 0.22 + ((dR + rR) * 0.10);
        const dirLane = (lane === 'over') ? 1 : -1;
        const cpx = mx + rx * push * dirLane;
        const cpy = my + ry * push * dirLane;

        const col = _getWellColor(donor);
        const colCore = _mixTowardWhite(col, 0.30);

        // Ribbon: soft base + bright core
        const wBase = 6 + 10 * inten01;
        const wCore = 2.2 + 4.0 * inten01;
        const aBase = 0.10 + 0.18 * inten01;
        const aCore = 0.28 + 0.42 * inten01;

        g.lineStyle({ width: wBase, color: col, alpha: aBase, cap: STATE.capRound, join: STATE.joinRound });
        g.moveTo(p0x, p0y);
        g.quadraticCurveTo(cpx, cpy, p1x, p1y);

        g.lineStyle({ width: wCore, color: colCore, alpha: aCore, cap: STATE.capRound, join: STATE.joinRound });
        g.moveTo(p0x, p0y);
        g.quadraticCurveTo(cpx, cpy, p1x, p1y);

        out.active = true;
        out.p0x = p0x; out.p0y = p0y;
        out.cpx = cpx; out.cpy = cpy;
        out.p1x = p1x; out.p1y = p1y;
        out.col = col;
        return out;
      }

      // Reset curve actives
      for (let i = 0; i < 6; i++) {
        STATE.curvesOver[i].active = false;
        STATE.curvesUnder[i].active = false;
      }

      if (anyOver) {
        for (let i = 0; i < 6; i++) {
          if (STATE.overSm[i] <= 0.01) continue;
          drawStream(STATE.curvesOver[i], gO, i, STATE.overVal[i], STATE.overSm[i], 'over');
        }
      }
      if (anyUnder) {
        for (let i = 0; i < 6; i++) {
          if (STATE.underSm[i] <= 0.01) continue;
          drawStream(STATE.curvesUnder[i], gU, i, STATE.underVal[i], STATE.underSm[i], 'under');
        }
      }

      // Droplets: 3–5 per active seam, drift along the curve.
      const droplets = STATE.droplets;
      for (let k = 0; k < droplets.length; k++) {
        const spr = droplets[k];
        const lane = spr._lane;
        const seam = spr._seam | 0;
        const slot = spr._slot | 0;

        const curve = (lane === 'over') ? STATE.curvesOver[seam] : STATE.curvesUnder[seam];
        const inten01 = (lane === 'over') ? STATE.overSm[seam] : STATE.underSm[seam];

        if (!curve || !curve.active || inten01 <= 0.01) {
          spr.visible = false;
          continue;
        }

        // Advance along the curve.
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

        // Visuals
        spr.visible = true;
        spr.tint = curve.col;
        spr.alpha = 0.10 + 0.55 * inten01;
        const size = 2.0 + 4.5 * inten01;
        spr.width = spr.height = size;
      }

      // If no streams are active, fade droplets quickly.
      if (!anyOver && !anyUnder) {
        for (let k = 0; k < droplets.length; k++) droplets[k].visible = false;
      }
    } catch (e) {
      // Fail-safe: never break the frame.
      try { if (STATE.layer) STATE.layer.visible = false; } catch (_) {}
    }
  };
})();
