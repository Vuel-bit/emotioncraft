// Emotioncraft render_wells_fx_nebula.js — render-only WELL FX (A23: water / fluid look)
// NOTE: Public API names remain applyNebulaFX/updateNebulaFX for wiring stability.
// This module is strictly visual: no mechanics, tuning, or input behavior changes.
(() => {
  const EC = (window.EC = window.EC || {});
  const PIXI = window.PIXI;
  if (!PIXI) return;

  EC.RENDER_WELLS_FX = EC.RENDER_WELLS_FX || {};

  // Keep the NEBULA bucket name to avoid rewiring call sites.
  const FX = (EC.RENDER_WELLS_FX.NEBULA = EC.RENDER_WELLS_FX.NEBULA || {});
  const _TEX = (FX._TEX = FX._TEX || {});

  function _isMobileLike() {
    try {
      const w = Math.min(window.innerWidth || 0, window.innerHeight || 0);
      const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
      if (w && w <= 760) return true;
      return /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
    } catch (_) {
      return false;
    }
  }

  function _quality() {
    const mob = _isMobileLike();
    // Matches A22 heuristic (safe on mobile; higher on desktop).
    const main = mob ? 256 : 384;
    return {
      mobile: mob,
      texMain: main,
      // Water surface distortion should be present at rest but subtle.
      dispScaleBase: mob ? 5 : 7,
      dispScaleGain: mob ? 11 : 16,
      // Caustics + spec are subtle; visibility increases with |spin|.
      caustAlphaBase: mob ? 0.018 : 0.020,
      caustAlphaGain: mob ? 0.040 : 0.048,
      specAlphaBase: mob ? 0.020 : 0.022,
      specAlphaGain: mob ? 0.050 : 0.060,
      // Slight bump for crisper bowl edge contribution (still restrained vs selection).
      rimAlphaBase: mob ? 0.054 : 0.058,
      rimAlphaGain: mob ? 0.068 : 0.080,
      // Normal-map gradient scale
      gradK: mob ? 18 : 22,
    };
  }

  function _setLinear(tex) {
    try {
      if (tex && tex.baseTexture && PIXI.SCALE_MODES) tex.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
    } catch (_) {}
  }

  function _canvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function _clipCircle(ctx, size, radiusFrac) {
    const cx = size / 2,
      cy = size / 2;
    const r = size * (radiusFrac || 0.48);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function _softenViaDownscale(ctx, c, size, down) {
    try {
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = down;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.clearRect(0, 0, down, down);
      tctx.drawImage(c, 0, 0, down, down);
      ctx.clearRect(0, 0, size, size);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tmp, 0, 0, size, size);
    } catch (_) {}
  }

  function _makeWaterNormalMap(size, seed, Q) {
    const c = _canvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);

    // 1) Build a smooth height field (cheap pseudo-fBm: layered sines + tiny hash).
    const h = new Float32Array(size * size);
    const s1 = (seed || 0) * 19391 + 7;
    const TAU = Math.PI * 2;
    for (let y = 0; y < size; y++) {
      const ny = y / size;
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const v1 = Math.sin((nx * 3.1 + ny * 1.7 + s1 * 0.0003) * TAU);
        const v2 = Math.sin((nx * 7.2 - ny * 5.4 + s1 * 0.0007) * TAU);
        const v3 = Math.sin((nx * 13.1 + ny * 11.3 + s1 * 0.0011) * TAU);
        const hh = Math.sin((x * 12.9898 + y * 78.233 + s1) * 43758.5453);
        const r = hh - Math.floor(hh);
        const vv = 0.55 + 0.19 * v1 + 0.14 * v2 + 0.08 * v3 + 0.06 * (r - 0.5);
        h[y * size + x] = vv;
      }
    }

    // 2) Approximate gradients and encode into RG (x/y offsets differ).
    // Convert pixel-step diffs into normalized-coordinate gradients for stable scaling.
    const gk = (Q && Q.gradK) ? Q.gradK : 20;
    const pxScale = size * 0.5;
    for (let y = 0; y < size; y++) {
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size;
        const xp = (x + 1) % size;
        const hx1 = h[y * size + xp];
        const hx0 = h[y * size + xm];
        const hy1 = h[yp * size + x];
        const hy0 = h[ym * size + x];

        let dx = (hx1 - hx0) * pxScale;
        let dy = (hy1 - hy0) * pxScale;

        let rr = 128 + (dx * gk);
        let gg = 128 + (dy * gk);
        // Clamp
        rr = rr < 0 ? 0 : (rr > 255 ? 255 : rr);
        gg = gg < 0 ? 0 : (gg > 255 ? 255 : gg);

        const i = (y * size + x) * 4;
        img.data[i + 0] = rr | 0;
        img.data[i + 1] = gg | 0;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    // Soften to avoid harsh pixel gradients.
    _softenViaDownscale(ctx, c, size, Math.max(96, (size / 3) | 0));

    const tex = PIXI.Texture.from(c);
    _setLinear(tex);
    return tex;
  }

  function _makeCausticsTex(size, seed) {
    const c = _canvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const TAU = Math.PI * 2;

    const s = (seed || 0) * 1013 + 17;
    const f1 = 5.7 + (s % 7) * 0.11;
    const f2 = 4.1 + (s % 5) * 0.13;
    const f3 = 8.3 + (s % 9) * 0.09;
    const f4 = 6.9 + (s % 11) * 0.07;
    const f5 = 12.2 + (s % 13) * 0.05;
    const f6 = 9.1 + (s % 17) * 0.04;
    const ff = 20.0 + (s % 19) * 0.08;

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;

        // Interference-like field -> net-like bright ridges.
        const a = Math.sin((u * f1 + v * f2 + s * 0.0007) * TAU);
        const b = Math.sin((u * f3 - v * f4 + s * 0.0009) * TAU);
        const d = Math.sin((u * f5 + v * f6 + s * 0.0011) * TAU);
        let m = Math.abs(a * b + 0.55 * b * d + 0.35 * a * d);
        if (m > 1) m = 1;
        let lines = 1 - m * 1.65;
        if (lines < 0) lines = 0;
        lines = lines * lines * lines * lines;

        let fine = Math.abs(Math.sin((u * ff + v * (ff * 0.82) + s * 0.0005) * TAU));
        // Make fine contribution sparse.
        fine = Math.pow(fine, 14);

        let val = 0.78 * lines + 0.22 * fine;
        if (val < 0) val = 0;
        if (val > 1) val = 1;

        const c8 = (val * 255) | 0;
        const i = (y * size + x) * 4;
        img.data[i + 0] = c8;
        img.data[i + 1] = c8;
        img.data[i + 2] = c8;
        img.data[i + 3] = c8; // alpha matches brightness
      }
    }

    ctx.putImageData(img, 0, 0);
    // Soften + reduce harsh repeat feel.
    _softenViaDownscale(ctx, c, size, Math.max(88, (size / 2.6) | 0));
    _clipCircle(ctx, size, 0.48);

    const tex = PIXI.Texture.from(c);
    _setLinear(tex);
    return tex;
  }

  function _makeSpecTex(size, seed) {
    const c = _canvas(size);
    const ctx = c.getContext('2d');
    const cx = size / 2,
      cy = size / 2;
    const r = size * 0.48;

    ctx.clearRect(0, 0, size, size);

    // Primary elongated glint band.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.55 + (seed || 0) * 0.07);
    const g1 = ctx.createLinearGradient(-r, 0, r, 0);
    g1.addColorStop(0.00, 'rgba(255,255,255,0)');
    g1.addColorStop(0.38, 'rgba(255,255,255,0)');
    g1.addColorStop(0.52, 'rgba(255,255,255,0.30)');
    g1.addColorStop(0.62, 'rgba(255,255,255,0.06)');
    g1.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(-r, -r * 0.18, r * 2, r * 0.36);

    // Secondary smaller glint.
    ctx.rotate(0.85);
    const g2 = ctx.createLinearGradient(-r * 0.6, 0, r * 0.6, 0);
    g2.addColorStop(0.00, 'rgba(255,255,255,0)');
    g2.addColorStop(0.45, 'rgba(255,255,255,0.16)');
    g2.addColorStop(0.55, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = g2;
    ctx.fillRect(-r * 0.6, -r * 0.08, r * 1.2, r * 0.16);

    ctx.restore();

    _softenViaDownscale(ctx, c, size, Math.max(96, (size / 3.2) | 0));
    _clipCircle(ctx, size, 0.48);

    const tex = PIXI.Texture.from(c);
    _setLinear(tex);
    return tex;
  }

  function ensureAssets() {
    if (_TEX._ready) return;
    const Q = _quality();
    _TEX._q = Q;

    // Two normal maps so adjacent wells aren't identical.
    _TEX.dispA = _makeWaterNormalMap(Q.texMain, 1, Q);
    _TEX.dispB = _makeWaterNormalMap(Q.texMain, 2, Q);

    // Two caustics maps.
    _TEX.caustA = _makeCausticsTex(Q.texMain, 3);
    _TEX.caustB = _makeCausticsTex(Q.texMain, 4);

    // Spec highlight texture.
    _TEX.spec = _makeSpecTex(Q.texMain, 5);

    // Fresnel-ish rim highlight (thin bright edge).
    try {
      const size = Q.texMain;
      const c = _canvas(size);
      const ctx = c.getContext('2d');
      const cx = size / 2,
        cy = size / 2;
      const r = size * 0.48;
      const g = ctx.createRadialGradient(cx, cy, r * 0.78, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      // Crisper/thinner rim band (water fresnel) — slightly stronger outer alpha for definition.
      g.addColorStop(0.88, 'rgba(255,255,255,0)');
      g.addColorStop(0.935, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.970, 'rgba(255,255,255,0.22)');
      g.addColorStop(0.992, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(255,255,255,0.30)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      _clipCircle(ctx, size, 0.48);
      _TEX.rim = PIXI.Texture.from(c);
      _setLinear(_TEX.rim);
    } catch (_) {}

    _TEX._ready = true;
  }

  function _ensureFxLayer() {
    if (!EC.RENDER || !EC.RENDER.root) return null;
    if (!EC.RENDER._nebulaFxMaps) {
      const layer = new PIXI.Container();
      layer.name = 'nebulaFxMaps';
      layer.eventMode = 'none';
      // Children are non-renderable; this layer stays on stage so transforms are computed.
      layer.renderable = true;
      layer.alpha = 1;
      try {
        EC.RENDER.root.addChild(layer);
      } catch (_) {}
      EC.RENDER._nebulaFxMaps = layer;
    }
    return EC.RENDER._nebulaFxMaps;
  }

  function apply(view, opts) {
    if (!view || view._nebulaFx) return;
    ensureAssets();
    const Q = _TEX._q || _quality();
    const mapsLayer = _ensureFxLayer();
    if (!mapsLayer) return;

    const interior = view.interior;
    if (!interior) return;

    const useAlt = !!(opts && opts.alt);
    const dispTex = useAlt ? (_TEX.dispB || _TEX.dispA) : (_TEX.dispA || _TEX.dispB);

    // Displacement map sprite: attached to stage (non-renderable) so filter can sample it.
    const dispSpr = new PIXI.Sprite(dispTex);
    dispSpr.anchor && dispSpr.anchor.set(0.5);
    dispSpr.visible = true;
    dispSpr.renderable = false;
    dispSpr.alpha = 0;
    dispSpr.eventMode = 'none';
    mapsLayer.addChild(dispSpr);

    let dispFilter = null;
    try {
      dispFilter = new PIXI.filters.DisplacementFilter(dispSpr);
      dispFilter.padding = 12;
      dispFilter.scale.x = Q.dispScaleBase;
      dispFilter.scale.y = Q.dispScaleBase;
    } catch (_) {
      dispFilter = null;
    }

    // Create a warpGroup so refraction distorts the pigment underneath, while surface sheen stays crisp.
    const warpGroup = new PIXI.Container();
    warpGroup.name = 'waterWarpGroup';
    warpGroup.eventMode = 'none';

    // Move underlying pigment/motion layers into the warp group (one-time; no per-frame allocations).
    // Keep ripple/highlight/edgeShade as surface layers (unwarped) for a water-in-bowl read.
    try {
      const toWarp = [view.pigment, view.swirlA, view.swirlB, view.inkDark, view.inkLight, view.waveHand, view.marbleA, view.marbleB];
      for (let k = 0; k < toWarp.length; k++) {
        const ch = toWarp[k];
        if (ch && ch.parent === interior) {
          interior.removeChild(ch);
          warpGroup.addChild(ch);
        }
      }
      // Insert warpGroup behind surface layers.
      interior.addChildAt(warpGroup, 0);
    } catch (_) {
      // Fallback: if something goes wrong, keep no grouping (safe).
      try {
        if (warpGroup.parent) warpGroup.parent.removeChild(warpGroup);
      } catch (_) {}
    }

    // Apply refraction filter to warpGroup (preferred) or interior (fallback).
    if (dispFilter) {
      try {
        if (warpGroup && warpGroup.parent) warpGroup.filters = [dispFilter];
        else interior.filters = [dispFilter];
      } catch (_) {}
    }

    // Caustics (below ripples, above warped pigment): two layers.
    const caustA = new PIXI.Sprite(_TEX.caustA || PIXI.Texture.WHITE);
    const caustB = new PIXI.Sprite(_TEX.caustB || PIXI.Texture.WHITE);
    for (const cst of [caustA, caustB]) {
      cst.anchor && cst.anchor.set(0.5);
      cst.eventMode = 'none';
      cst.alpha = 0;
      try {
        cst.blendMode = PIXI.BLEND_MODES.SCREEN;
      } catch (_) {}
    }

    // Specular highlight (surface gloss): single sprite.
    let specSpr = null;
    try {
      specSpr = new PIXI.Sprite(_TEX.spec || PIXI.Texture.WHITE);
      specSpr.anchor && specSpr.anchor.set(0.5);
      specSpr.eventMode = 'none';
      specSpr.alpha = 0;
      try {
        specSpr.blendMode = PIXI.BLEND_MODES.SCREEN;
      } catch (_) {}
    } catch (_) {
      specSpr = null;
    }

    // Fresnel rim (thin bright edge).
    let rimSpr = null;
    try {
      rimSpr = new PIXI.Sprite(_TEX.rim || PIXI.Texture.WHITE);
      rimSpr.anchor && rimSpr.anchor.set(0.5);
      rimSpr.eventMode = 'none';
      rimSpr.alpha = 0;
      try {
        rimSpr.blendMode = PIXI.BLEND_MODES.SCREEN;
      } catch (_) {}
    } catch (_) {
      rimSpr = null;
    }

    // Insert caustics right above warpGroup (below ripples).
    try {
      const ripA = view.rippleA;
      let idx = 1;
      if (ripA && ripA.parent === interior) idx = interior.getChildIndex(ripA);
      interior.addChildAt(caustA, idx);
      interior.addChildAt(caustB, idx + 1);
    } catch (_) {
      interior.addChild(caustA);
      interior.addChild(caustB);
    }

    // Insert rim + spec just under the existing highlight sprite (keeps UI sheen crisp).
    try {
      const hi = view.highlight;
      let idx2 = interior.children.length;
      if (hi && hi.parent === interior) idx2 = interior.getChildIndex(hi);
      if (rimSpr) interior.addChildAt(rimSpr, Math.max(0, idx2));
      if (specSpr) interior.addChildAt(specSpr, Math.max(0, idx2 + (rimSpr ? 1 : 0)));
    } catch (_) {
      if (rimSpr) interior.addChild(rimSpr);
      if (specSpr) interior.addChild(specSpr);
    }

    view._nebulaFx = {
      q: Q,
      dispSpr,
      dispFilter,
      warpGroup: (warpGroup && warpGroup.parent) ? warpGroup : null,
      caustA,
      caustB,
      specSpr,
      rimSpr,
      // Stable per-well seeds (no per-frame randomness)
      s1: (Math.random() * 10) + 0.5,
      s2: (Math.random() * 10) + 0.5,
    };
  }

  function mixTowardWhite(rgb, k) {
    k = k < 0 ? 0 : (k > 1 ? 1 : k);
    const rr = (rgb >> 16) & 255;
    const gg = (rgb >> 8) & 255;
    const bb = rgb & 255;
    const nr = (rr + (255 - rr) * k) | 0;
    const ng = (gg + (255 - gg) * k) | 0;
    const nb = (bb + (255 - bb) * k) | 0;
    return (nr << 16) | (ng << 8) | nb;
  }

  function update(view, dt, r, bodyCol, dir, magEff, spinNorm, omega, tNow, ripT, i) {
    const n = view && view._nebulaFx;
    if (!n) return;
    const Q = n.q || _quality();

    // Keep map sprite centered on the well in world space.
    const g = view.g;
    if (g && n.dispSpr) {
      n.dispSpr.position.x = g.position.x;
      n.dispSpr.position.y = g.position.y;
    }

    // Refraction strength (displacement). Present at rest; increases with |spin|.
    if (n.dispFilter) {
      // Activity floor: keep refraction alive at rest, but subtle.
      const act = 0.35 + 0.65 * magEff;
      const sc = Q.dispScaleBase + Q.dispScaleGain * (0.12 + 0.68 * act);
      n.dispFilter.scale.x = sc;
      n.dispFilter.scale.y = sc * 0.92;
    }

    // Displacement map animation: coherent drift + slow rotation.
    // If spin=0, drift still runs but does not imply directionality.
    if (n.dispSpr) {
      const t = (tNow || 0) * 0.001;
      // NOTE (A25): no monotonic rotation accumulation when dir===0.
      if (n._dispAng == null) n._dispAng = 0;
      if (dir !== 0) n._dispAng += dt * (0.05 + 0.22 * magEff) * dir;
      const act = 0.35 + 0.65 * magEff;
      const osc = (0.10 * act) * Math.sin(t * 0.62 + n.s1 + i) + (0.07 * act) * Math.sin(t * 0.46 + n.s2);
      n.dispSpr.rotation = n._dispAng + osc;

      // Coherent drift (non-directional). Use absolute offset (no accumulated wander).
      const drift = 6 + 16 * act;
      const bx = (g && g.position) ? g.position.x : 0;
      const by = (g && g.position) ? g.position.y : 0;
      n.dispSpr.position.x = bx + Math.sin(t * 0.85 + n.s1 + i) * drift * 0.10;
      n.dispSpr.position.y = by + Math.cos(t * 0.78 + n.s2 + i * 0.7) * drift * 0.10;

      const cover = Math.max(1.9, 2.2 + 1.0 * magEff);
      const base = (_TEX._q && _TEX._q.texMain) ? _TEX._q.texMain : Q.texMain;
      const s = (r * 2 * cover) / Math.max(64, base);
      n.dispSpr.scale.x = s;
      n.dispSpr.scale.y = s;
    }

    // Caustics shimmer (very subtle). Tint near-white with a slight hue bias.
    if (n.caustA && n.caustB) {
      const t = (ripT || 0);
      const act = 0.35 + 0.65 * magEff;
      const outer01 = Math.max(0, Math.min(1, (spinNorm - 0.75) / 0.25));
      const tintA = mixTowardWhite(bodyCol, 0.88);
      const tintB = mixTowardWhite(bodyCol, 0.94);

      n.caustA.tint = tintA;
      n.caustB.tint = tintB;

      // Keep within the bowl at low/mid spins; allow slight overshoot only at high spins.
      n.caustA.width = n.caustA.height = r * (1.96 + 0.26 * outer01);
      n.caustB.width = n.caustB.height = r * (1.98 + 0.28 * outer01);

      // Activity floor: caustics present at rest, still subtle.
      const vis = Q.caustAlphaBase + Q.caustAlphaGain * Math.pow(act, 1.15) * 0.65;
      n.caustA.alpha = vis;
      n.caustB.alpha = vis * 0.75;

      // Slow coherent scroll + slight rotation.
      // NOTE (A25): no monotonic rotation accumulation when dir===0.
      if (n._caustAngA == null) n._caustAngA = 0;
      if (n._caustAngB == null) n._caustAngB = 0;
      if (dir !== 0) {
        n._caustAngA += dt * (0.02 + 0.10 * magEff) * dir;
        n._caustAngB += dt * (0.015 + 0.08 * magEff) * dir;
      }
      const oscA = (0.08 * act) * Math.sin(t * 0.33 + n.s1 + i);
      const oscB = (0.07 * act) * Math.sin(t * 0.31 + n.s2 + i * 0.7);
      n.caustA.rotation = n._caustAngA + oscA;
      n.caustB.rotation = -n._caustAngB + oscB;

      const ampA = 0.35 + (1.6 * act) * outer01;
      const ampB = 0.30 + (1.4 * act) * outer01;
      n.caustA.position.x = Math.sin(t * 0.20 + i + n.s1) * ampA;
      n.caustA.position.y = Math.cos(t * 0.18 + i * 0.7 + n.s2) * (ampA * 0.85);
      n.caustB.position.x = Math.cos(t * 0.17 + i * 0.9 + n.s2) * ampB;
      n.caustB.position.y = Math.sin(t * 0.19 + i * 0.6 + n.s1) * (ampB * 0.85);
    }

    // Specular highlight (surface gloss). Present at rest; stronger with |spin|.
    if (n.specSpr) {
      const t = (ripT || 0);
      const act = 0.35 + 0.65 * magEff;
      const outer01 = Math.max(0, Math.min(1, (spinNorm - 0.75) / 0.25));
      n.specSpr.tint = 0xffffff;
      n.specSpr.width = n.specSpr.height = r * (1.92 + 0.30 * outer01);
      const a = Q.specAlphaBase + Q.specAlphaGain * Math.pow(act, 1.05) * 0.60;
      n.specSpr.alpha = a;
      // Gentle drift and slow rotation (do not read as a spinning stamp).
      if (n._specAng == null) n._specAng = 0;
      if (dir !== 0) n._specAng += dt * (0.02 + 0.08 * magEff) * dir;
      const osc = 0.25 * Math.sin(t * 0.22 + n.s1) + 0.08 * Math.sin(t * 0.41 + i);
      n.specSpr.rotation = n._specAng + osc;
      const amp = 0.35 + (1.3 * act) * outer01;
      n.specSpr.position.x = Math.sin(t * 0.26 + n.s2 + i * 0.9) * amp;
      n.specSpr.position.y = Math.cos(t * 0.21 + n.s1 + i * 0.6) * (amp * 0.85);
    }

    // Fresnel rim highlight (thin edge). Do not over-brighten.
    if (n.rimSpr) {
      const act = 0.35 + 0.65 * magEff;
      const outer01 = Math.max(0, Math.min(1, (spinNorm - 0.75) / 0.25));
      n.rimSpr.tint = mixTowardWhite(bodyCol, 0.92);
      n.rimSpr.width = n.rimSpr.height = r * (2.00 + 0.18 * outer01);
      n.rimSpr.alpha = Q.rimAlphaBase + Q.rimAlphaGain * Math.pow(act, 0.90) * 0.55;
    }
  }

  // Public wrappers (stable names)
  EC.RENDER_WELLS_FX.applyNebulaFX = function (view, opts) {
    try {
      apply(view, opts);
    } catch (_) {}
  };
  EC.RENDER_WELLS_FX.updateNebulaFX = function (view, dt, r, bodyCol, dir, magEff, spinNorm, omega, tNow, ripT, i) {
    try {
      update(view, dt, r, bodyCol, dir, magEff, spinNorm, omega, tNow, ripT, i);
    } catch (_) {}
  };
})();
