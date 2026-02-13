// Emotioncraft render_wells_init.js — MVP wells PIXI object creation (Chunk 3)
(() => {
  const EC = (window.EC = window.EC || {});
  const { Container, Graphics, Text, Sprite } = PIXI;

  EC.RENDER_WELLS_INIT = EC.RENDER_WELLS_INIT || {};

  // MVP 6-well ring (Chunk 4)
  // -----------------------------
  // Presentation-only mapping; source-of-truth lives in EC.TUNE.RENDER.
  const MVP_WELL_COLORS = (EC.TUNE && EC.TUNE.RENDER && EC.TUNE.RENDER.MVP_WELL_COLORS) || {
    red:    0xff4650,
    purple: 0xa46bff,
    blue:   0x5a96ff,
    green:  0x45d07a,
    yellow: 0xffdc55,
    orange: 0xff8f3d,
  };
  const MVP_WELL_LABEL = { red:'R', purple:'P', blue:'B', green:'G', yellow:'Y', orange:'O' };
  const MVP_WELL_NAME = (EC.TUNE && EC.TUNE.RENDER && EC.TUNE.RENDER.MVP_WELL_NAME) || {};

  // -----------------------------
  // Liquid well interior textures (visual-only)
  // -----------------------------
  // We generate a small set of reusable textures once and re-use them for every well.
  // This avoids per-frame allocations and keeps mobile performance stable.
  const TEX = (EC.RENDER_WELLS_INIT._TEX = EC.RENDER_WELLS_INIT._TEX || {});
  function ensureTextures() {
    if (TEX._ready) return;
    // Helper: clip the current canvas content to a circle (destination-in).
    function clipCircle(ctx, size, radiusFrac) {
      const cx = size / 2, cy = size / 2;
      const r = size * (radiusFrac || 0.46);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }


    // Helper: create a PIXI texture from a canvas
    function texFromCanvas(c) {
      // PIXI.Texture.from(canvas) is supported in Pixi v6/v7
      return PIXI.Texture.from(c);
    }

    // 1) Soft-edge circle texture (white circle with soft edge)
    {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const cx = size / 2, cy = size / 2;
      const r = size * 0.46;
      const g = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.92, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      TEX.circle = texFromCanvas(c);
    }

    // (liquid body/swirl textures are defined below; keep a single authoritative set)

    // 1b) Pigment body texture: vivid midtone body + soft edge.
    // This is the main interior "liquid" mass (tinted per hue).
    {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const cx = size / 2, cy = size / 2;
      const r = size * 0.46;
      ctx.clearRect(0, 0, size, size);
      // Midtone body (white -> transparent edge) so tint reads strongly.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.96)');
      g.addColorStop(0.90, 'rgba(255,255,255,0.92)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      TEX.body = texFromCanvas(c);
    }

    // 1c) Swirl texture: spiral streaks + soft radial falloff (tinted per hue).
    // Designed to be obvious even at moderate spin.
    {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const cx = size / 2, cy = size / 2;
      const r = size * 0.46;
      ctx.clearRect(0, 0, size, size);

      // Spiral strokes (white with varying alpha)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = 'round';
      for (let k = 0; k < 140; k++) {
        const t = k / 140;
        const ang0 = t * Math.PI * 10.0;
        const ang1 = ang0 + (0.25 + 0.55 * (1 - t));
        const rr0 = (0.10 + 0.82 * t) * r;
        const rr1 = rr0 + (0.05 + 0.12 * (1 - t)) * r;
        const a = 0.10 + 0.22 * (1 - t);
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = 1.0 + 2.6 * (1 - t);
        ctx.beginPath();
        // Approximate spiral by small arc segment at radius rr
        ctx.arc(0, 0, rr0, ang0, ang1);
        ctx.stroke();
        // occasional secondary arc to increase texture richness
        if (k % 5 === 0) {
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.55})`;
          ctx.lineWidth = Math.max(0.8, ctx.lineWidth * 0.55);
          ctx.beginPath();
          ctx.arc(0, 0, rr1, ang0 + 0.25, ang1 + 0.35);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Soft falloff so it stays circular without masks.
      clipCircle(ctx, size, 0.46);
      TEX.swirl = texFromCanvas(c);
    }

    // 1d) Tracer texture: 2–4 faint curved arcs to help CW/CCW readability at a glance.
    // Tint per hue; keep subtle. Circle-clipped so we remain maskless/mobile-safe.
    {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const cx = size / 2, cy = size / 2;
      const r = size * 0.46;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Draw a few arcs at different radii with soft alpha.
      const arcs = [
        { rr: 0.22 * r, span: 0.9, a: 0.18, w: 4.0 },
        { rr: 0.33 * r, span: 0.75, a: 0.14, w: 3.4 },
        { rr: 0.44 * r, span: 0.6, a: 0.12, w: 3.0 },
        { rr: 0.56 * r, span: 0.5, a: 0.10, w: 2.6 },
      ];
      for (let k = 0; k < arcs.length; k++) {
        const it = arcs[k];
        const ang0 = (k * 1.4) + 0.35;
        const ang1 = ang0 + it.span;
        ctx.strokeStyle = `rgba(255,255,255,${it.a})`;
        ctx.lineWidth = it.w;
        ctx.beginPath();
        ctx.arc(0, 0, it.rr, ang0, ang1);
        ctx.stroke();
      }
      ctx.restore();

      // Soften: downscale then upscale.
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 96;
      const tctx = tmp.getContext('2d');
      tctx.clearRect(0, 0, 96, 96);
      tctx.drawImage(c, 0, 0, 96, 96);
      ctx.clearRect(0, 0, size, size);
      ctx.globalAlpha = 1;
      ctx.drawImage(tmp, 0, 0, size, size);

      clipCircle(ctx, size, 0.46);
      TEX.tracers = texFromCanvas(c);
    }

    // 1e) Inner edge shading (very subtle) for a "lens" feel. Not near-black.
    {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const cx = size / 2, cy = size / 2;
      const r = size * 0.46;
      ctx.clearRect(0, 0, size, size);
      // Transparent center -> slightly stronger edge.
      const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.78, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(255,255,255,0.12)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      TEX.edge = texFromCanvas(c);
    }

    // 2) Radial highlight texture (white -> transparent)
    {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const cx = size / 2, cy = size / 2;
      const r = size * 0.5;
      const g = ctx.createRadialGradient(cx * 0.80, cy * 0.75, 0, cx * 0.80, cy * 0.75, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.25)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      // Keep strictly circular so we do not depend on PIXI masking (mobile-safe).
      clipCircle(ctx, size, 0.46);
      TEX.highlight = texFromCanvas(c);
    }

    // 3) Marbling/noise texture (ink-in-water feel). Low-contrast by design.
    {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');

      // Background: transparent
      ctx.clearRect(0, 0, size, size);

      // Draw many soft blobs then blur by scaling.
      function softBlob(x, y, r, a) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 220; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 10 + Math.random() * 40;
        const a = 0.035 + Math.random() * 0.06;
        softBlob(x, y, r, a);
      }

      // Add a few darker vein streaks (still subtle; no dominant black).
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        const x0 = Math.random() * size;
        const y0 = Math.random() * size;
        ctx.moveTo(x0, y0);
        for (let k = 0; k < 4; k++) {
          ctx.quadraticCurveTo(
            Math.random() * size,
            Math.random() * size,
            Math.random() * size,
            Math.random() * size
          );
        }
        ctx.stroke();
      }

      // Poor-man blur: downscale then upscale.
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 64;
      const tctx = tmp.getContext('2d');
      tctx.clearRect(0, 0, 64, 64);
      tctx.drawImage(c, 0, 0, 64, 64);
      ctx.clearRect(0, 0, size, size);
      ctx.globalAlpha = 1;
      ctx.drawImage(tmp, 0, 0, size, size);

      // Keep strictly circular so we do not depend on PIXI masking (mobile-safe).
      clipCircle(ctx, size, 0.46);

      TEX.marble = texFromCanvas(c);
    }

    // 4) Ripple noise texture (living pool surface).
    // NOTE: We avoid rendering square tiling sprites in the scene (mobile artifacts).
    // We generate a circular ripple texture and animate it via rotation/offset.
    // Keep it bright enough that it can never black-mute the pigment on mobile.
    {
      const size = 128;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(size, size);
      // Simple value noise (cheap): layered sines + randomness
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const nx = x / size;
          const ny = y / size;
          const v = 0.55
            + 0.18 * Math.sin((nx * 6.0 + ny * 2.0) * Math.PI * 2)
            + 0.14 * Math.sin((nx * 1.5 - ny * 5.0) * Math.PI * 2)
            + 0.10 * (Math.random() - 0.5);
          const vv = Math.max(0, Math.min(1, v));
          const i = (y * size + x) * 4;
          const c8 = (vv * 255) | 0;
          img.data[i + 0] = c8;
          img.data[i + 1] = c8;
          img.data[i + 2] = c8;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      // Soften: downscale then upscale
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 64;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(c, 0, 0, 64, 64);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(tmp, 0, 0, size, size);
      TEX.rippleTile = texFromCanvas(c);

      // Also generate a circular version at a higher resolution so no square edges can appear.
      try {
        const size2 = 256;
        const c2 = document.createElement('canvas');
        c2.width = c2.height = size2;
        const ctx2 = c2.getContext('2d');
        ctx2.imageSmoothingEnabled = true;
        ctx2.drawImage(c, 0, 0, size2, size2);
        clipCircle(ctx2, size2, 0.48);
        TEX.rippleCircle = texFromCanvas(c2);
      } catch (e) {
        TEX.rippleCircle = TEX.rippleTile;
      }
    }

    // 5) Ink streak tiles (dark + light) — sparse strokes that add depth and make direction obvious.
    // These are tiling textures; they must remain mostly transparent to avoid black-out.
    function makeStrokeTile(kind) {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw a handful of imperfect bezier arcs (not perfect spirals)
      const n = (kind === 'dark') ? 26 : 20;
      for (let i = 0; i < n; i++) {
        const a = (kind === 'dark') ? (0.18 + Math.random() * 0.18) : (0.10 + Math.random() * 0.12);
        const w = (kind === 'dark') ? (6 + Math.random() * 10) : (4 + Math.random() * 8);
        const x0 = Math.random() * size;
        const y0 = Math.random() * size;
        const x3 = Math.random() * size;
        const y3 = Math.random() * size;
        const x1 = x0 + (Math.random() - 0.5) * size * 0.9;
        const y1 = y0 + (Math.random() - 0.5) * size * 0.9;
        const x2 = x3 + (Math.random() - 0.5) * size * 0.9;
        const y2 = y3 + (Math.random() - 0.5) * size * 0.9;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
        ctx.stroke();

        // occasional thicker blot to create turbulence
        if (i % 5 === 0) {
          const bx = (x0 + x3) * 0.5 + (Math.random() - 0.5) * 30;
          const by = (y0 + y3) * 0.5 + (Math.random() - 0.5) * 30;
          const br = (kind === 'dark') ? (10 + Math.random() * 18) : (8 + Math.random() * 14);
          const ga = (kind === 'dark') ? 0.12 : 0.09;
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          g.addColorStop(0, `rgba(255,255,255,${ga})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      // Soft blur via downscale/upscale
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 96;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(c, 0, 0, 96, 96);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(tmp, 0, 0, size, size);

      return texFromCanvas(c);
    }
    TEX.inkDarkTile = makeStrokeTile('dark');
    TEX.inkLightTile = makeStrokeTile('light');

    // Also pre-clip circular versions so no square boundaries can ever appear.
    try {
      const size2 = 256;
      const mkCircleFromTex = (tex) => {
        const c = document.createElement('canvas');
        c.width = c.height = size2;
        const ctx = c.getContext('2d');
        // Draw the source texture into canvas
        const base = (tex && tex.baseTexture && tex.baseTexture.resource && tex.baseTexture.resource.source) ? tex.baseTexture.resource.source : null;
        if (base) ctx.drawImage(base, 0, 0, size2, size2);
        clipCircle(ctx, size2, 0.48);
        return texFromCanvas(c);
      };
      TEX.inkDarkCircle = mkCircleFromTex(TEX.inkDarkTile);
      TEX.inkLightCircle = mkCircleFromTex(TEX.inkLightTile);
    } catch (e) {
      TEX.inkDarkCircle = TEX.inkDarkTile;
      TEX.inkLightCircle = TEX.inkLightTile;
    }

    // 6) Directional band texture (very obvious motion cue when spin != 0).
    // Not a clean geometric spiral: thick, imperfect sweeps with gaps.
    {
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const cx = size / 2, cy = size / 2;
      const r = size * 0.46;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let k = 0; k < 9; k++) {
        const rr = (0.18 + 0.08 * k) * r;
        const ang0 = (Math.random() * Math.PI * 2);
        const span = (0.35 + Math.random() * 0.75);
        const wob = (Math.random() - 0.5) * 0.35;
        ctx.strokeStyle = `rgba(255,255,255,${0.10 + Math.random() * 0.12})`;
        ctx.lineWidth = 10 + Math.random() * 14;
        ctx.beginPath();
        // imperfect arc with a slight wobble (approx via 2 arcs)
        ctx.arc(0, 0, rr, ang0, ang0 + span);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.08})`;
        ctx.lineWidth = Math.max(3, ctx.lineWidth * 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, rr + wob * r * 0.08, ang0 + 0.12, ang0 + span - 0.08);
        ctx.stroke();
      }
      ctx.restore();

      // Soften a bit to look like ink bands, not sharp glyphs
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 96;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(c, 0, 0, 96, 96);
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(tmp, 0, 0, size, size);
      clipCircle(ctx, size, 0.46);
      TEX.bands = texFromCanvas(c);
    }

    // 7) Wave hand texture — a single dominant sweeping band (clock-hand style), organic and soft.
    {
      // Wave-hand: an amorphous crest/band (NOT a cone/beam). This is an alpha mask
      // tinted in the renderer. We build a noisy partial-ring band with a clear
      // leading crest and trailing fade.
      const size = 256;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const cx = size / 2, cy = size / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(cx, cy);

      const a0 = -0.65;
      const a1 =  0.65;
      const steps = 90;
      const baseR = size * 0.34;
      const baseW = size * 0.22;

      // Two noise fields (cheap) for thickness + edge wobble.
      const p1 = Math.random() * 10;
      const p2 = Math.random() * 10;
      const q1 = Math.random() * 10;
      const q2 = Math.random() * 10;

      function n1(t){ return Math.sin(t * 3.1 + p1) * 0.55 + Math.sin(t * 5.3 + p2) * 0.45; }
      function n2(t){ return Math.sin(t * 2.7 + q1) * 0.60 + Math.sin(t * 6.2 + q2) * 0.40; }

      // Paint in short quads so opacity can fade along the arc.
      for (let k = 0; k < steps; k++) {
        const tA = k / steps;
        const tB = (k + 1) / steps;
        const angA = a0 + (a1 - a0) * tA;
        const angB = a0 + (a1 - a0) * tB;

        // Fade: brightest around the "crest" near t=0.55 (slightly ahead of center)
        const crestT = 0.55;
        const dist = Math.abs(tA - crestT);
        const fade = Math.max(0, 1 - dist / 0.55);
        const alpha = 0.08 + 0.38 * Math.pow(fade, 1.6);

        const wobA = n1(tA * Math.PI * 2) * 10;
        const wobB = n1(tB * Math.PI * 2) * 10;
        const wA = baseW * (0.75 + 0.35 * (0.5 + 0.5 * n2(tA * Math.PI * 2))) + (Math.random() - 0.5) * 2;
        const wB = baseW * (0.75 + 0.35 * (0.5 + 0.5 * n2(tB * Math.PI * 2))) + (Math.random() - 0.5) * 2;

        const rOutA = baseR + wobA + wA * 0.52;
        const rInA  = baseR + wobA - wA * 0.48;
        const rOutB = baseR + wobB + wB * 0.52;
        const rInB  = baseR + wobB - wB * 0.48;

        const ax0 = Math.cos(angA) * rInA;
        const ay0 = Math.sin(angA) * rInA;
        const ax1 = Math.cos(angA) * rOutA;
        const ay1 = Math.sin(angA) * rOutA;
        const bx0 = Math.cos(angB) * rInB;
        const by0 = Math.sin(angB) * rInB;
        const bx1 = Math.cos(angB) * rOutB;
        const by1 = Math.sin(angB) * rOutB;

        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(ax0, ay0);
        ctx.lineTo(ax1, ay1);
        ctx.lineTo(bx1, by1);
        ctx.lineTo(bx0, by0);
        ctx.closePath();
        ctx.fill();
      }

      // Add turbulent blotches along the crest to break up uniformity.
      for (let b = 0; b < 10; b++) {
        const t = 0.30 + Math.random() * 0.55;
        const ang = a0 + (a1 - a0) * t;
        const rr = baseR + (Math.random() - 0.5) * 18;
        const bx = Math.cos(ang) * rr;
        const by = Math.sin(ang) * rr;
        const br = 12 + Math.random() * 22;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(255,255,255,${0.10 + Math.random() * 0.18})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      // Gentle soften
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 128;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(c, 0, 0, 128, 128);
      ctx.clearRect(0, 0, size, size);
      ctx.globalAlpha = 1;
      ctx.drawImage(tmp, 0, 0, size, size);
      clipCircle(ctx, size, 0.48);
      TEX.waveHand = texFromCanvas(c);
    }


    TEX._ready = true;
  }
  
  function ensureMvpWellViews() {
    if (!EC.RENDER || !EC.RENDER.root) return;
    ensureTextures();
    if (!EC.RENDER.mvpWellLayer) {
      const layer = new Container();
      layer.eventMode = 'passive';
      EC.RENDER.mvpWellLayer = layer;
      EC.RENDER.root.addChild(layer);
    }

    // Patient portrait sprite (board overlay, non-interactive)
    if (!EC.RENDER.patientPortraitSprite) {
      const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
      spr.name = 'patientPortrait';
      spr.anchor && spr.anchor.set(0.5, 0.5);
      spr.eventMode = 'none';
      spr.visible = false;
      EC.RENDER.patientPortraitSprite = spr;
      try {
        // Insert below interactive wells so it never blocks taps.
        EC.RENDER.mvpWellLayer.addChildAt(spr, 0);
      } catch (e) {
        EC.RENDER.mvpWellLayer.addChild(spr);
      }
    }
    if (!EC.RENDER.mvpWells) {
      EC.RENDER.mvpWells = [];
      const hues = (EC.CONST && EC.CONST.HUES) || EC.HUES || ['red','purple','blue','green','yellow','orange'];
      for (let i = 0; i < 6; i++) {
        const hue = hues[i];

        // Root container (interactive)
        const g = new Container();
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointertap', () => {
          if (!EC.SIM) return;
          EC.SIM.selectedWellIndex = i;
          // Debug: confirm taps fire on mobile.
          if (EC.DEBUG) {
            try { console.log('[EC][tap] selectedWellIndex=', i); } catch (e) {}
          }
        });

        // Ensure the well is always tappable even if some interior layers are masked.
        // (Hit area is refined to the actual radius in render_wells_update.js.)
        try { g.hitArea = new PIXI.Circle(0, 0, 72); } catch (e) {}

        // Interior container masked to a perfect circle
        const interior = new Container();
        interior.eventMode = 'none';
        g.addChild(interior);

        const maskG = new Graphics();
        maskG.beginFill(0xffffff, 1);
        maskG.drawCircle(0, 0, 64);
        maskG.endFill();
        // IMPORTANT: keep mask renderable across platforms.
        // Some mobile/PMA paths early-out masks when worldAlpha is 0, causing the
        // interior to be fully masked away (appearing as a black orb on some devices).
        // Keep the mask effectively invisible, but NOT fully transparent.
        maskG.visible = true;
        maskG.alpha = 0.001;
        maskG.renderable = true;
        maskG.eventMode = 'none';
        g.addChild(maskG);
        // NOTE: We intentionally avoid relying on Pixi masking for the liquid interior by default.
        // Some mobile browsers show masked containers as fully clipped (black interior).
        // Our liquid textures are authored with transparent edges so they stay circular without a mask.
        // A debug toggle can re-enable masking to diagnose platform-specific issues.
        // (See render_wells_update.js EC.DEBUG_LIQUID_LAYERS.mask)

        // Pigment body (tinted liquid mass)
        const pigment = new PIXI.Sprite(TEX.body || TEX.circle);
        pigment.name = 'pigment';
        pigment.anchor.set(0.5);
        pigment.eventMode = 'none';
        interior.addChild(pigment);

        // Ripple surface (living pool) — circular noise sprite (no tiling squares).
        const rippleA = new PIXI.Sprite(TEX.rippleCircle || TEX.rippleTile || TEX.circle);
        rippleA.name = 'rippleA';
        rippleA.anchor.set(0.5);
        rippleA.eventMode = 'none';
        rippleA.alpha = 0.16;
        try { rippleA.blendMode = PIXI.BLEND_MODES.SCREEN; } catch (e) {}
        interior.addChild(rippleA);

        const rippleB = new PIXI.Sprite(TEX.rippleCircle || TEX.rippleTile || TEX.circle);
        rippleB.name = 'rippleB';
        rippleB.anchor.set(0.5);
        rippleB.eventMode = 'none';
        rippleB.alpha = 0.10;
        try { rippleB.blendMode = PIXI.BLEND_MODES.SCREEN; } catch (e) {}
        interior.addChild(rippleB);

        // Swirl layers: these are the primary "ink-in-water" motion cues.
        // Two layers with slightly different speeds (and optional opposite rotation)
        // make direction/magnitude readable at a glance.
        const swirlA = new PIXI.Sprite(TEX.swirl || TEX.marble || TEX.circle);
        swirlA.name = 'swirlA';
        swirlA.anchor.set(0.5);
        swirlA.alpha = 0.34;
        swirlA.eventMode = 'none';
        try { swirlA.blendMode = PIXI.BLEND_MODES.SCREEN; } catch (e) {}
        interior.addChild(swirlA);

        const swirlB = new PIXI.Sprite(TEX.swirl || TEX.marble || TEX.circle);
        swirlB.name = 'swirlB';
        swirlB.anchor.set(0.5);
        swirlB.alpha = 0.22;
        swirlB.eventMode = 'none';
        try { swirlB.blendMode = PIXI.BLEND_MODES.SCREEN; } catch (e) {}
        interior.addChild(swirlB);

        // Ink streaks (dark + light) — circular sprites (no tiling squares).
        const inkDark = new PIXI.Sprite(TEX.inkDarkCircle || TEX.inkDarkTile || TEX.marble);
        inkDark.name = 'inkDark';
        inkDark.anchor.set(0.5);
        inkDark.eventMode = 'none';
        inkDark.alpha = 0.22;
        try { inkDark.blendMode = PIXI.BLEND_MODES.NORMAL; } catch (e) {}
        interior.addChild(inkDark);

        const inkLight = new PIXI.Sprite(TEX.inkLightCircle || TEX.inkLightTile || TEX.marble);
        inkLight.name = 'inkLight';
        inkLight.anchor.set(0.5);
        inkLight.eventMode = 'none';
        inkLight.alpha = 0.16;
        try { inkLight.blendMode = PIXI.BLEND_MODES.SCREEN; } catch (e) {}
        interior.addChild(inkLight);

        // Wave-hand direction cue (dominant sweeping band)
        // NOTE: This must read as a DARK ink-like crest line, not a white cloud.
        // Keep it on NORMAL blend so it never washes the pool to grey/white.
        const waveHand = new PIXI.Sprite(TEX.waveHand || TEX.bands || TEX.circle);
        waveHand.name = 'waveHand';
        waveHand.anchor.set(0.5);
        waveHand.alpha = 0.0; // driven by |spin| (with a small visibility floor in update)
        waveHand.eventMode = 'none';
        try { waveHand.blendMode = PIXI.BLEND_MODES.NORMAL; } catch (e) {}
        interior.addChild(waveHand);

        // Subtle inner edge shading to reduce "blob" feel (lens/container depth).
        const edgeShade = new PIXI.Sprite(TEX.edge || TEX.circle);
        edgeShade.name = 'edgeShade';
        edgeShade.anchor.set(0.5);
        edgeShade.alpha = 0.10;
        edgeShade.eventMode = 'none';
        try { edgeShade.blendMode = PIXI.BLEND_MODES.NORMAL; } catch (e) {}
        interior.addChild(edgeShade);

        // Two marbling layers for organic “ink-in-water” motion
        const marbleA = new PIXI.Sprite(TEX.marble);
        marbleA.name = 'marbleA';
        marbleA.anchor.set(0.5);
        // Keep subtle and MOBILE-safe: dark MULTIPLY can black-out the whole well with premultiplied alpha.
        marbleA.alpha = 0.09;
        marbleA.eventMode = 'none';
        // Prefer NORMAL for sparse marbling; do not use near-black MULTIPLY full-field.
        try { marbleA.blendMode = PIXI.BLEND_MODES.NORMAL; } catch (e) {}
        interior.addChild(marbleA);

        const marbleB = new PIXI.Sprite(TEX.marble);
        marbleB.name = 'marbleB';
        marbleB.anchor.set(0.5);
        marbleB.alpha = 0.10;
        marbleB.eventMode = 'none';
        try { marbleB.blendMode = PIXI.BLEND_MODES.SCREEN; } catch (e) {}
        interior.addChild(marbleB);

        // Soft highlight (lens/liquid sheen)
        const highlight = new PIXI.Sprite(TEX.highlight);
        highlight.name = 'highlight';
        highlight.anchor.set(0.5);
        highlight.alpha = 0.32;
        highlight.eventMode = 'none';
        try { highlight.blendMode = PIXI.BLEND_MODES.SCREEN; } catch (e) {}
        interior.addChild(highlight);

        // Core glow (subtle; scales with |spin|)
        const coreGlow = new PIXI.Sprite(TEX.highlight);
        coreGlow.name = 'coreGlow';
        coreGlow.anchor.set(0.5);
        coreGlow.alpha = 0.0;
        coreGlow.eventMode = 'none';
        try { coreGlow.blendMode = PIXI.BLEND_MODES.SCREEN; } catch (e) {}
        interior.addChild(coreGlow);

        // Rim and selection are separate crisp strokes (no shape distortion)
        const rimG = new Graphics();
        rimG.eventMode = 'none';
        g.addChild(rimG);
        const selG = new Graphics();
        selG.eventMode = 'none';
        g.addChild(selG);

        // Placeholder (removed arrow glyphs; direction is visible via liquid motion)
        const spinG = new Graphics();
        spinG.eventMode = 'none';
        spinG.visible = false;
  
        // Ghost preview overlay (target state; only visible for selected well)
        const ghostG = new Graphics();
        ghostG.eventMode = 'none';
        const ghostSpinG = new Graphics();
        ghostSpinG.eventMode = 'none';
  
        // Name label inside the well
        const _wellNameStr = (typeof EC.wellLabelByHue === 'function') ? EC.wellLabelByHue(hue) : (MVP_WELL_NAME[hue] || '');
        const name = new Text(_wellNameStr || '', {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: 14,
          fontWeight: '800',
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 5,
          letterSpacing: 0.5,
          align: 'center',
          wordWrap: true,
          wordWrapWidth: 120,
        });
        name.anchor.set(0.5);
        name.eventMode = 'none';
  
        // In-well A/S readout (amount/spin), rendered under the name.
        // We keep amount and spin as separate text objects so spin can be sign-colored.
        // Backing plate (subtle dark pill) to preserve legibility over liquid textures.
        const asPlate = new Graphics();
        asPlate.eventMode = 'none';
        asPlate.visible = true;
        const amountLabel = new Text('', {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: 12,
          fontWeight: '800',
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 4,
          align: 'center',
        });
        // NOTE: typo fix — was `label` (undefined), should be `amountLabel`.
        amountLabel.anchor.set(0.5);
        amountLabel.eventMode = 'none';
  
        // Spin portion for A/S (sign-colored in update)
        const spinText = new Text('', {
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
          fontSize: 11,
          fontWeight: '800',
          fill: 0xffffff,
          stroke: 0x000000,
          strokeThickness: 4,
          align: 'center',
        });
        spinText.anchor.set(0.5);
        spinText.eventMode = 'none';
  
        // Disposition FX (telegraph/active marker) — created once, updated in render_wells_update
        const dispHalo = new Graphics();
        dispHalo.eventMode = 'none';
        dispHalo.visible = false;
        // IMPORTANT: Keep halo fill colors saturated.
        // Additive blending tends to wash neon colors toward white on bright overlaps,
        // so we force normal blending for the disposition halo.
        try {
          if (typeof PIXI !== 'undefined' && PIXI.BLEND_MODES) {
            dispHalo.blendMode = PIXI.BLEND_MODES.NORMAL;
          }
        } catch (e) {
          // ignore
        }

        // Visible well container is g. Keep all interior labels attached to g so they move/scale with the well.
        g.addChild(name);
        g.addChild(asPlate);
        g.addChild(amountLabel);
        g.addChild(spinText);

        EC.RENDER.mvpWellLayer.addChild(g);
        EC.RENDER.mvpWellLayer.addChild(spinG);
        EC.RENDER.mvpWellLayer.addChild(dispHalo);
        EC.RENDER.mvpWellLayer.addChild(ghostG);
        EC.RENDER.mvpWellLayer.addChild(ghostSpinG);
  
        EC.RENDER.mvpWells.push({
          g,
          interior,
          maskG,
          pigment,
          rippleA,
          rippleB,
          swirlA,
          swirlB,
          inkDark,
          inkLight,
          waveHand,
          edgeShade,
          marbleA,
          marbleB,
          highlight,
          coreGlow,
          rimG,
          selG,
          spinG,
          dispHalo,
          ghostG,
          ghostSpinG,
          name,
          asPlate,
          amountLabel,
          spinText,
          _swirlAng: 0,
          _sheenAng: 0,
          _ripT: 0,
        });
      }

      // Debug-only: confirm liquid stack is created and visible in the display tree.
      if (EC.DEBUG && !EC.RENDER_WELLS_INIT._didLiquidInitLog) {
        EC.RENDER_WELLS_INIT._didLiquidInitLog = true;
        try {
          const wells = EC.RENDER.mvpWells || [];
          console.log('[EC][liquid-init] wellsWithLiquid=', wells.length);
          if (wells[0]) {
            const it = wells[0].interior;
            const kids = (it && it.children) ? it.children : [];
            const info = kids.map(ch => ({
              name: ch.name || ch.constructor?.name,
              alpha: ch.alpha,
              visible: ch.visible,
              renderable: ch.renderable,
              blendMode: ch.blendMode,
              tint: (typeof ch.tint === 'number') ? '0x' + ch.tint.toString(16) : undefined,
            }));
            console.log('[EC][liquid-init] sampleInteriorChildren=', info);
            const m = wells[0].maskG;
            console.log('[EC][liquid-init] sampleMask=', {
              visible: m && m.visible,
              alpha: m && m.alpha,
              renderable: m && m.renderable,
            });
          }
        } catch (e) {}
      }
    }
  }
  // Module exports
  EC.RENDER_WELLS_INIT.MVP_WELL_COLORS = MVP_WELL_COLORS;
  EC.RENDER_WELLS_INIT.MVP_WELL_LABEL = MVP_WELL_LABEL;
  EC.RENDER_WELLS_INIT.MVP_WELL_NAME = MVP_WELL_NAME;
  EC.RENDER_WELLS_INIT.ensure = ensureMvpWellViews;
  // Layout rebuild hooks (no-ops for now; kept for future safety)
  EC.RENDER_WELLS_INIT.rebuildLayoutIfNeeded = EC.RENDER_WELLS_INIT.rebuildLayoutIfNeeded || function() {};
  EC.RENDER_WELLS_INIT.resetViewsIfNeeded = EC.RENDER_WELLS_INIT.resetViewsIfNeeded || function() {};
})();
