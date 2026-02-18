// Emotioncraft render_wells_fx_nebula.js — render-only nebula/energy FX for well interiors
// Purpose: upgrade the liquid look (wispy turbulence + gentle glow) without changing any mechanics.
(() => {
  const EC = (window.EC = window.EC || {});
  const PIXI = window.PIXI;
  if (!PIXI) return;

  EC.RENDER_WELLS_FX = EC.RENDER_WELLS_FX || {};

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
    // Desktop target can be 512, but 384 keeps init-time and GPU memory safer.
    const main = mob ? 256 : 384;
    return {
      mobile: mob,
      texMain: main,
      dispScaleBase: mob ? 10 : 14,
      dispScaleGain: mob ? 18 : 26,
      wispAlphaBase: mob ? 0.06 : 0.07,
      wispAlphaGain: mob ? 0.10 : 0.14,
      glowAlphaBase: mob ? 0.05 : 0.06,
      glowAlphaGain: mob ? 0.12 : 0.16,
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

  function _makeCloudTex(size, seed) {
    const c = _canvas(size);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const n = Math.max(220, (size * size) / 700);
    const s1 = (seed || 0) * 9973 + 17;
    function rnd(k) {
      // tiny deterministic-ish PRNG
      const x = Math.sin((k + 1) * 999 + s1) * 10000;
      return x - Math.floor(x);
    }
    function blob(x, y, r, a) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      const x = rnd(i * 3.1) * size;
      const y = rnd(i * 4.7 + 2.0) * size;
      const rr = (0.04 + 0.12 * rnd(i * 1.9 + 7.0)) * size;
      const aa = 0.020 + 0.060 * rnd(i * 2.3 + 11.0);
      blob(x, y, rr, aa);
    }
    // Add a few wispy streaks (soft curves)
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(2, size * 0.010);
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      const x0 = rnd(i * 9.1 + 3.0) * size;
      const y0 = rnd(i * 7.7 + 5.0) * size;
      ctx.moveTo(x0, y0);
      for (let k = 0; k < 3; k++) {
        ctx.quadraticCurveTo(
          rnd(i * 5.1 + k * 2.0) * size,
          rnd(i * 6.3 + k * 3.0) * size,
          rnd(i * 8.2 + k * 4.0) * size,
          rnd(i * 4.4 + k * 5.0) * size
        );
      }
      ctx.stroke();
    }
    _softenViaDownscale(ctx, c, size, Math.max(72, (size / 4) | 0));
    _clipCircle(ctx, size, 0.48);
    const tex = PIXI.Texture.from(c);
    _setLinear(tex);
    return tex;
  }

  function _makeDispTex(size, seed) {
    const c = _canvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const s1 = (seed || 0) * 19391 + 7;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        // Lightweight pseudo-fBm: layered sines + a little hash.
        const v1 = Math.sin((nx * 3.1 + ny * 1.7 + s1 * 0.0003) * Math.PI * 2);
        const v2 = Math.sin((nx * 7.2 - ny * 5.4 + s1 * 0.0007) * Math.PI * 2);
        const v3 = Math.sin((nx * 13.1 + ny * 11.3 + s1 * 0.0011) * Math.PI * 2);
        const h = Math.sin((x * 12.9898 + y * 78.233 + s1) * 43758.5453);
        const r = h - Math.floor(h);
        const v = 0.55 + 0.18 * v1 + 0.14 * v2 + 0.08 * v3 + 0.10 * (r - 0.5);
        const vv = Math.max(0, Math.min(1, v));
        const c8 = (vv * 255) | 0;
        const i = (y * size + x) * 4;
        img.data[i + 0] = c8;
        img.data[i + 1] = c8;
        img.data[i + 2] = c8;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    _softenViaDownscale(ctx, c, size, Math.max(96, (size / 3) | 0));
    const tex = PIXI.Texture.from(c);
    _setLinear(tex);
    return tex;
  }

  function ensureAssets() {
    if (_TEX._ready) return;
    const Q = _quality();
    _TEX._q = Q;
    _TEX.dispA = _makeDispTex(Q.texMain, 1);
    _TEX.dispB = _makeDispTex(Q.texMain, 2);
    _TEX.wispA = _makeCloudTex(Q.texMain, 3);
    _TEX.wispB = _makeCloudTex(Q.texMain, 4);

    // Cheap radial rim highlight (edge falloff / depth cue)
    try {
      const size = Q.texMain;
      const c = _canvas(size);
      const ctx = c.getContext('2d');
      const cx = size / 2,
        cy = size / 2;
      const r = size * 0.48;
      const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.04)');
      g.addColorStop(1, 'rgba(255,255,255,0.12)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      _clipCircle(ctx, size, 0.48);
      _TEX.rim = PIXI.Texture.from(c);
      _setLinear(_TEX.rim);
    } catch (_) {}

    // Shared blur filter for glow impression (kept very cheap).
    try {
      const bf = new PIXI.filters.BlurFilter();
      bf.blur = Q.mobile ? 2 : 3;
      bf.quality = 1;
      FX._sharedBlur = bf;
    } catch (_) {
      FX._sharedBlur = null;
    }

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
    const dispSpr = new PIXI.Sprite(dispTex);
    dispSpr.anchor && dispSpr.anchor.set(0.5);
    // Keep visible so transforms update; mark non-renderable so it never draws.
    dispSpr.visible = true;
    dispSpr.renderable = false;
    dispSpr.alpha = 0;
    dispSpr.eventMode = 'none';
    mapsLayer.addChild(dispSpr);

    let dispFilter = null;
    try {
      dispFilter = new PIXI.filters.DisplacementFilter(dispSpr);
      // Padding prevents clipped warps on edges.
      dispFilter.padding = 12;
      dispFilter.scale.x = Q.dispScaleBase;
      dispFilter.scale.y = Q.dispScaleBase;
    } catch (_) {
      dispFilter = null;
    }

    // Glow impression: blurred pigment copy behind the interior stack.
    let glowSpr = null;
    try {
      glowSpr = new PIXI.Sprite((view.pigment && view.pigment.texture) ? view.pigment.texture : PIXI.Texture.WHITE);
      glowSpr.anchor && glowSpr.anchor.set(0.5);
      glowSpr.eventMode = 'none';
      glowSpr.alpha = 0;
      try {
        glowSpr.blendMode = PIXI.BLEND_MODES.ADD;
      } catch (_) {}
      if (FX._sharedBlur) glowSpr.filters = [FX._sharedBlur];
      interior.addChildAt(glowSpr, 0);
    } catch (_) {
      glowSpr = null;
    }

    // Wisps: two soft cloud layers (additive/screen) with independent drift.
    const wispA = new PIXI.Sprite(_TEX.wispA || PIXI.Texture.WHITE);
    const wispB = new PIXI.Sprite(_TEX.wispB || PIXI.Texture.WHITE);
    for (const w of [wispA, wispB]) {
      w.anchor && w.anchor.set(0.5);
      w.eventMode = 'none';
      w.alpha = 0;
      try {
        w.blendMode = PIXI.BLEND_MODES.ADD;
      } catch (_) {}
    }

    // Depth cue (edge falloff / rim hint)
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

    // Insert wisps under highlight/coreGlow so readability stays high.
    try {
      const hi = view.highlight;
      let idx = interior.children.length;
      if (hi && hi.parent === interior) idx = interior.getChildIndex(hi);
      if (rimSpr) interior.addChildAt(rimSpr, Math.max(0, idx));
      interior.addChildAt(wispA, idx + (rimSpr ? 1 : 0));
      interior.addChildAt(wispB, idx + (rimSpr ? 2 : 1));
    } catch (_) {
      if (rimSpr) interior.addChild(rimSpr);
      interior.addChild(wispA);
      interior.addChild(wispB);
    }

    // Apply filter stack (domain warp). Keep it minimal and mobile-safe.
    if (dispFilter) {
      try {
        interior.filters = [dispFilter];
      } catch (_) {}
    }

    view._nebulaFx = {
      q: Q,
      dispSpr,
      dispFilter,
      wispA,
      wispB,
      glowSpr,
      rimSpr,
      // per-well seeds (no per-frame randomness)
      s1: (Math.random() * 10) + 0.5,
      s2: (Math.random() * 10) + 0.5,
    };
  }

  function mixTowardWhite(rgb, k) {
    k = Math.max(0, Math.min(1, k));
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

    // Domain warp scale: increases with |spin| (but stays subtle).
    if (n.dispFilter) {
      const sc = Q.dispScaleBase + Q.dispScaleGain * magEff;
      n.dispFilter.scale.x = sc;
      n.dispFilter.scale.y = sc * 0.92;
    }

    // Displacement map animation: coherent drift + slow rotation (direction follows spin sign).
    if (n.dispSpr) {
      const t = (tNow || 0) * 0.001;
      const drift = 10 + 28 * magEff;
      n.dispSpr.rotation += dt * (0.10 + 0.55 * magEff) * dir;
      // Drift the map in a consistent direction with a small orbital wobble.
      n.dispSpr.position.x += Math.sin(t * 0.9 + n.s1 + i) * drift * 0.12;
      n.dispSpr.position.y += Math.cos(t * 0.8 + n.s2 + i * 0.7) * drift * 0.12;
      // Ensure the map covers the filter area (oversized so edges are never visible).
      const cover = Math.max(1.8, 2.2 + 1.1 * magEff);
      const base = (_TEX._q && _TEX._q.texMain) ? _TEX._q.texMain : Q.texMain;
      const s = (r * 2 * cover) / Math.max(64, base);
      n.dispSpr.scale.x = s;
      n.dispSpr.scale.y = s;
    }

    // Wisps: keep subtle at rest; become more present as |spin| rises.
    const wA = n.wispA;
    const wB = n.wispB;
    if (wA && wB) {
      const t = (ripT || 0);
      const tintA = mixTowardWhite(bodyCol, 0.35);
      const tintB = mixTowardWhite(bodyCol, 0.55);
      wA.tint = tintA;
      wB.tint = tintB;

      wA.width = wA.height = r * 2.28;
      wB.width = wB.height = r * 2.40;
      wA.alpha = Q.wispAlphaBase + Q.wispAlphaGain * Math.pow(spinNorm, 0.85);
      wB.alpha = (Q.wispAlphaBase * 0.8) + (Q.wispAlphaGain * 0.85) * Math.pow(spinNorm, 0.95);

      // Coherent flow: scroll/rotate gently. Direction follows spin sign.
      wA.rotation += dt * (0.06 + 0.20 * magEff) * dir;
      wB.rotation -= dt * (0.04 + 0.16 * magEff) * dir;
      wA.position.x = Math.sin(t * 0.33 + i + n.s1) * (1.2 + 5.0 * magEff);
      wA.position.y = Math.cos(t * 0.29 + i * 0.7 + n.s2) * (1.0 + 4.2 * magEff);
      wB.position.x = Math.cos(t * 0.27 + i * 0.9 + n.s2) * (1.0 + 4.6 * magEff);
      wB.position.y = Math.sin(t * 0.31 + i * 0.6 + n.s1) * (0.9 + 3.8 * magEff);
    }

    // Glow: subtle halo impression (scaled by |spin|).
    if (n.glowSpr) {
      n.glowSpr.tint = bodyCol;
      n.glowSpr.width = n.glowSpr.height = r * (2.20 + 0.20 * magEff);
      n.glowSpr.alpha = Q.glowAlphaBase + Q.glowAlphaGain * Math.pow(spinNorm, 0.90);
    }

    // Edge falloff / depth cue.
    if (n.rimSpr) {
      n.rimSpr.tint = mixTowardWhite(bodyCol, 0.55);
      n.rimSpr.width = n.rimSpr.height = r * 2.06;
      n.rimSpr.alpha = 0.05 + 0.06 * Math.pow(spinNorm, 0.70);
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
