// Emotioncraft render_wells.js — MVP-only layout + psyche donut + resize scheduling
(() => {
  const EC = (window.EC = window.EC || {});
  const TUNING = EC.TUNING;
  const PIXI = window.PIXI;

  const { Container, Graphics, Text } = PIXI;

  // Pull commonly used helpers from the shared namespace
  const clamp = EC.clamp;
  const lerp = EC.lerp;
  const sign0 = EC.sign0;

  // Small render-only helper
  function _mixTowardWhite(col, t) {
    const tt = clamp(t || 0, 0, 1);
    const r = (col >> 16) & 255;
    const g = (col >> 8) & 255;
    const b = col & 255;
    const rr = (r + (255 - r) * tt) | 0;
    const gg = (g + (255 - g) * tt) | 0;
    const bb = (b + (255 - b) * tt) | 0;
    return (rr << 16) | (gg << 8) | bb;
  }

  function _mixTowardBlack(col, t) {
    t = Math.max(0, Math.min(1, t));
    const r = (col >> 16) & 255;
    const g = (col >> 8) & 255;
    const b = col & 255;
    const k = 1 - t;
    return ((Math.round(r * k) & 255) << 16) | ((Math.round(g * k) & 255) << 8) | (Math.round(b * k) & 255);
  }

  function drawBackground() {
    // IMPORTANT: Use EC.RENDER.app.screen (logical units) for layout/draw coordinates.
    // With autoDensity + resolution, renderer.width/height are in device pixels,
    // but the stage coordinate space is in logical pixels. Using renderer.* can
    // push elements off-screen on some desktop/browser DPI configs.
    const w = EC.RENDER.app.screen.width;
    const h = EC.RENDER.app.screen.height;
    EC.RENDER.bg.clear();
    EC.RENDER.bg.beginFill(0x0b0f16);
    EC.RENDER.bg.drawRect(0, 0, w, h);
    EC.RENDER.bg.endFill();

    EC.RENDER.bg.beginFill(0x000000, 0.18);
    EC.RENDER.bg.drawRect(0, 0, w, h);
    EC.RENDER.bg.endFill();
  }

  EC.RENDER = EC.RENDER || {};
  // Authoritative well geometry for DOM hit-testing (updated by MVP view update)
  EC.RENDER.wellGeom = EC.RENDER.wellGeom || { cx: new Array(6).fill(0), cy: new Array(6).fill(0), hitR: new Array(6).fill(0) };

  function _snap(){
    try {
      if (EC.ENGINE && typeof EC.ENGINE.getSnapshot === 'function') {
        const s = EC.ENGINE.getSnapshot();
        return { SIM: (s && s.SIM) ? s.SIM : (EC.SIM || {}), UI: (s && s.UI) ? s.UI : (EC.UI_STATE || {}), RSTATE: (s && s.RENDER) ? s.RENDER : (EC.RENDER_STATE || { flags:{}, layout:{} }) };
      }
    } catch (_) {}
    try { EC.UI_STATE = EC.UI_STATE || {}; } catch (_) {}
    try {
      EC.RENDER_STATE = EC.RENDER_STATE || { flags:{}, layout:{} };
      EC.RENDER_STATE.flags = EC.RENDER_STATE.flags || {};
      EC.RENDER_STATE.layout = EC.RENDER_STATE.layout || {};
    } catch (_) {}
    return { SIM: EC.SIM || {}, UI: EC.UI_STATE || {}, RSTATE: EC.RENDER_STATE || { flags:{}, layout:{} } };
  }


  const PSYCHE_COLORS = {
  red:    0xff4650,
  purple: 0xa46bff,
  blue:   0x5a96ff,
  green:  0x45d07a,
  yellow: 0xffdc55,
  orange: 0xff8f3d,
};

function ensurePsycheView() {
  if (!EC.RENDER || !EC.RENDER.root) return;

  if (!EC.RENDER.psycheLayer) {
    const layer = new Container();
    layer.eventMode = 'none';
    EC.RENDER.psycheLayer = layer;

    // Insert above bg and below wells.
    const root = EC.RENDER.root;
    const bgIndex = Math.max(0, root.getChildIndex(EC.RENDER.bg));
    root.addChildAt(layer, bgIndex + 1);
  }

  if (!EC.RENDER.psycheG) {
    EC.RENDER.psycheG = new Graphics();
    EC.RENDER.psycheLayer.addChild(EC.RENDER.psycheG);
  }

  // PASS A35 (visual-only): subtle "well depth at rest" interior FX for psyche wedges.
  // Insert ABOVE psycheG (flat fills) and BELOW goal shading/text/rings to preserve readability.
  if (!EC.RENDER.psycheFxLayer) {
    const fx = new Container();
    fx.eventMode = 'none';
    fx.interactiveChildren = false;
    fx.name = 'psycheFxLayer';
    EC.RENDER.psycheFxLayer = fx;

    try {
      const layer = EC.RENDER.psycheLayer;
      const g = EC.RENDER.psycheG;
      const idx = (layer && g && typeof layer.getChildIndex === 'function') ? layer.getChildIndex(g) : -1;
      if (idx >= 0) layer.addChildAt(fx, idx + 1);
      else layer.addChild(fx);
    } catch (_) {
      try { EC.RENDER.psycheLayer.addChild(fx); } catch (e2) {}
    }
  }

  // Create per-wedge masked sprite stacks (crisp wedge mask keeps boundaries sharp).
  if (!EC.RENDER.psycheFxWedges || !EC.RENDER.psycheFxMasks) {
    const wedges = [];
    const masks = [];
    const fxLayer = EC.RENDER.psycheFxLayer;
    const TEX = (EC.RENDER_WELLS_INIT && EC.RENDER_WELLS_INIT._TEX) ? EC.RENDER_WELLS_INIT._TEX : null;

    // Safe blend mode access (Pixi v6/v7)
    const BM = (PIXI && PIXI.BLEND_MODES) ? PIXI.BLEND_MODES : null;
    const BM_NORMAL = BM ? BM.NORMAL : 0;
    const BM_SCREEN = BM ? (BM.SCREEN != null ? BM.SCREEN : BM.ADD) : 0;
    const BM_MULT = BM ? (BM.MULTIPLY != null ? BM.MULTIPLY : BM.NORMAL) : 0;

    for (let i = 0; i < 6; i++) {
      const wc = new Container();
      wc.eventMode = 'none';
      wc.interactiveChildren = false;
      wc.visible = false;

      // PASS A36: base pigment body (preserve hue)
      const sprBody = new PIXI.Sprite((TEX && (TEX.body || TEX.rippleCircle || TEX.circle)) ? (TEX.body || TEX.rippleCircle || TEX.circle) : PIXI.Texture.WHITE);
      sprBody.anchor && sprBody.anchor.set(0.5);
      sprBody.alpha = 0.20;
      sprBody.blendMode = BM_NORMAL;
      wc.addChild(sprBody);

      // Internal variation (tracers/swirl/marble) — animated parallax
      const sprVar = new PIXI.Sprite((TEX && (TEX.tracers || TEX.swirl || TEX.marble || TEX.rippleCircle || TEX.body || TEX.circle)) ? (TEX.tracers || TEX.swirl || TEX.marble || TEX.rippleCircle || TEX.body || TEX.circle) : PIXI.Texture.WHITE);
      sprVar.anchor && sprVar.anchor.set(0.5);
      sprVar.alpha = 0.14;
      sprVar.blendMode = BM_SCREEN;
      wc.addChild(sprVar);

      // Inner shading (edge) — keep subtle; avoid black multiply that mutes/desaturates.
      const sprEdge = new PIXI.Sprite((TEX && (TEX.edge || TEX.rippleCircle || TEX.circle)) ? (TEX.edge || TEX.rippleCircle || TEX.circle) : PIXI.Texture.WHITE);
      sprEdge.anchor && sprEdge.anchor.set(0.5);
      sprEdge.alpha = 0.06;
      sprEdge.tint = 0xffffff; // actual tint applied per-frame from hue
      sprEdge.blendMode = BM_NORMAL;
      wc.addChild(sprEdge);

      // Soft spec highlight (tinted to hue, not white-wash)
      const sprHi = new PIXI.Sprite((TEX && (TEX.highlight || TEX.tracers || TEX.rippleCircle || TEX.body || TEX.circle)) ? (TEX.highlight || TEX.tracers || TEX.rippleCircle || TEX.body || TEX.circle) : PIXI.Texture.WHITE);
      sprHi.anchor && sprHi.anchor.set(0.5);
      sprHi.alpha = 0.16;
      sprHi.blendMode = BM_SCREEN;
      wc.addChild(sprHi);

      // Crisp wedge mask (Graphics)
      const m = new Graphics();
      m.eventMode = 'none';
      m.interactiveChildren = false;
      wc.mask = m;

      // Store refs for per-frame update
      wc._fx = { body: sprBody, vari: sprVar, edge: sprEdge, hi: sprHi };

      masks.push(m);
      wedges.push(wc);
      fxLayer.addChild(m);
      fxLayer.addChild(wc);
    }

    EC.RENDER.psycheFxWedges = wedges;
    EC.RENDER.psycheFxMasks = masks;
  }

  // Goal shading overlay (visualizes current per-hue objective ranges)
  // Rendered above wedges but below gold satisfied rings + numbers.
  if (!EC.RENDER.psycheGoalShadeG) {
    const gs = new Graphics();
    gs.eventMode = 'none';
    EC.RENDER.psycheGoalShadeG = gs;
    EC.RENDER.psycheLayer.addChild(gs);
  }

  if (!EC.RENDER.psycheTextLayer) {
    const tl = new Container();
    tl.eventMode = 'none';
    EC.RENDER.psycheTextLayer = tl;
    EC.RENDER.psycheLayer.addChild(tl);
  }

  // Gold satisfied ring overlay (per-wedge)
  if (!EC.RENDER.psycheGoalRingG) {
    const gg = new Graphics();
    gg.eventMode = 'none';
    EC.RENDER.psycheGoalRingG = gg;
    EC.RENDER.psycheLayer.addChild(gg);
  }

  // Per-wedge numeric readouts (psyche values)
  if (!EC.RENDER.psycheWedgeValueTexts) {
    const arr = [];
    for (let i = 0; i < 6; i++) {
      const t = new Text('0', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
        fontSize: 14,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 4,
        align: 'center',
      });
      t.anchor && t.anchor.set(0.5, 0.5);
      t.eventMode = 'none';
      arr.push(t);
      EC.RENDER.psycheTextLayer.addChild(t);
    }
    EC.RENDER.psycheWedgeValueTexts = arr;
  }

  // Center countdown text (treatment hold timer)
  if (!EC.RENDER.psycheCenterText) {
    const t = new Text('', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: 26,
      fill: 0xffd166,
      stroke: 0x000000,
      strokeThickness: 5,
      align: 'center',
    });
    t.anchor && t.anchor.set(0.5, 0.5);
    t.eventMode = 'none';
    EC.RENDER.psycheCenterText = t;
    EC.RENDER.psycheTextLayer.addChild(t);
  }

  // Remove legacy bar-chart text objects if they exist (donut wedge UI uses center-only text).
  if (EC.RENDER.psycheBarValueTexts || EC.RENDER.psycheBarRateTexts) {
    try {
      const arrs = [EC.RENDER.psycheBarValueTexts, EC.RENDER.psycheBarRateTexts];
      for (const arr of arrs) {
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const t = arr[i];
          if (t && t.parent) t.parent.removeChild(t);
          if (t && t.destroy) t.destroy();
        }
      }
    } catch (e) {}
    EC.RENDER.psycheBarValueTexts = null;
    EC.RENDER.psycheBarRateTexts = null;
  }

  // Total readout removed (older builds)
  if (EC.RENDER.psycheTotalText) {
    try {
      EC.RENDER.psycheTotalText.visible = false;
      if (EC.RENDER.psycheTotalText.parent) EC.RENDER.psycheTotalText.parent.removeChild(EC.RENDER.psycheTotalText);
      if (EC.RENDER.psycheTotalText.destroy) EC.RENDER.psycheTotalText.destroy();
    } catch (e) {}
    EC.RENDER.psycheTotalText = null;
  }
}


function _trendGlyph(ratePerSec) {
  const r = (typeof ratePerSec === 'number' && isFinite(ratePerSec)) ? ratePerSec : 0;
  const dead = 0.03; // deadzone to prevent flicker
  if (r > dead) return '▲';
  if (r < -dead) return '▼';
  return '•';
}

function renderPsyche() {
  ensurePsycheView();

  const snap = _snap();
  const SIM = snap.SIM;
  const UI = snap.UI;
  const RSTATE = snap.RSTATE;
  if (!SIM || !EC.RENDER || !EC.RENDER.psycheG) return;

  // Render state bucket (created by ENGINE.getSnapshot or _snap fallback)
  RSTATE.flags = RSTATE.flags || {};
  RSTATE.layout = RSTATE.layout || {};
  if (!('mvpPrevSpinT' in RSTATE)) RSTATE.mvpPrevSpinT = null;
  const LAYOUT = (RSTATE.layout = RSTATE.layout || {});

  const hues = (EC.CONST && EC.CONST.HUES) || EC.HUES || ['red', 'purple', 'blue', 'green', 'yellow', 'orange'];
  const P = SIM.psyP || new Array(6).fill(0);
  const HUE_CAP = (EC.TUNE && typeof EC.TUNE.PSY_HUE_CAP === 'number') ? EC.TUNE.PSY_HUE_CAP : 500;

  const nowMs = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance.now() : Date.now();

  // --- Safe circle inside the well ring (guaranteed no collision with wells) ---
  const geom = (LAYOUT && LAYOUT.mvpGeom) ? LAYOUT.mvpGeom : (SIM.mvpGeom || null);
  const ringR = (geom && typeof geom.ringR === 'number')
    ? geom.ringR
    : ((typeof LAYOUT.psycheRadius==='number') ? LAYOUT.psycheRadius * 2.4 : ((typeof SIM.psycheRadius==='number') ? SIM.psycheRadius * 2.4 : 140));

  const wellMaxR = (geom && typeof geom.wellMaxR === 'number')
    ? geom.wellMaxR
    : ((SIM.wellSize && typeof SIM.wellSize.maxR === 'number') ? SIM.wellSize.maxR : 60);

  const padding = (geom && typeof geom.boardSize === 'number')
    ? Math.max(12, geom.boardSize * 0.020)
    : 12;

  const safeR = Math.max(30, ringR - wellMaxR - padding);

  // Donut geometry (ratios so it scales cleanly)
  const r1 = safeR * 0.98; // outer radius of wedges
  const r0 = safeR * 0.20; // inner radius of wedges (edge of core) — smaller core, thicker donut

  const g = EC.RENDER.psycheG;
  g.clear();

  // PASS A35: psyche wedge depth FX layer refs
  const fxW = EC.RENDER.psycheFxWedges;
  const fxM = EC.RENDER.psycheFxMasks;
  const haveFx = fxW && fxM && fxW.length === 6 && fxM.length === 6;
  const tSec = nowMs * 0.001;

  // Helper: draw an annular sector (donut slice)
  function drawAnnularWedge(gr, cx, cy, rin, rout, a0, a1) {
    // outer arc start
    gr.moveTo(cx + rout * Math.cos(a0), cy + rout * Math.sin(a0));
    gr.arc(cx, cy, rout, a0, a1, false);
    // connect to inner arc
    gr.lineTo(cx + rin * Math.cos(a1), cy + rin * Math.sin(a1));
    gr.arc(cx, cy, rin, a1, a0, true);
    gr.closePath();
  }

  // Subtle background circle to define the panel (uses full safe circle, no inscribed-square waste)
  g.beginFill(0x000000, 0.14);
  g.drawCircle(0, 0, r1);
  g.endFill();
  g.lineStyle(1, 0xffffff, 0.10);
  g.drawCircle(0, 0, r1);

  // Faint per-hue reference rings at every 100 (100/200/300/400/500)
  g.lineStyle(1, 0xffffff, 0.07);
  for (let k = 100; k <= HUE_CAP; k += 100) {
    const tk = k / HUE_CAP;
    const rk = Math.sqrt(r0 * r0 + tk * (r1 * r1 - r0 * r0));
    g.drawCircle(0, 0, rk);
  }
  // Reset stroke for filled wedges
  g.lineStyle(0, 0, 0);

  // Wedges
  const N = 6;
  const slice = (Math.PI * 2) / N;
  const gap = slice * 0.06;
  const span = slice - gap;
  // Rotate wedges so each wedge centerline aligns with the well centerline (red well at top).
  // Negative rotates CCW in screen coords. Tune by eye if needed.
  const PSYCHE_ROT = -Math.PI / 6;
  const base = -Math.PI / 2 + PSYCHE_ROT; // start angle for wedge 0

  for (let i = 0; i < N; i++) {
    const hue = hues[i];
    const color = PSYCHE_COLORS[hue] || 0xffffff;

    const start = base + i * slice + gap / 2;
    const end = start + span;

    // Track (background)
    g.beginFill(color, 0.10);
    drawAnnularWedge(g, 0, 0, r0, r1, start, end);
    g.endFill();

    // Filled radius using area-linear mapping in an annulus:
    // rf = sqrt(r0^2 + t*(r1^2 - r0^2))
    const A = clamp(P[i] || 0, 0, HUE_CAP);
    const t = (HUE_CAP > 0) ? (A / HUE_CAP) : 0;
    const rf = Math.sqrt(r0 * r0 + t * (r1 * r1 - r0 * r0));

    // Update psyche depth FX mask + subtle motion (crisp boundaries via Graphics mask)
    if (haveFx) {
      const wc = fxW[i];
      const m = fxM[i];
      if (wc && m) {
        if (rf > r0 + 0.5) {
          wc.visible = true;
          m.visible = true;

          // Redraw crisp annular wedge mask (r0 -> rf)
          m.clear();
          m.beginFill(0xffffff, 1);
          drawAnnularWedge(m, 0, 0, r0, rf, start, end);
          m.endFill();

          const fx = wc._fx;
          if (fx) {
            const size = r1 * 2.10;
            // PASS A36: preserve hue identity — avoid black multiply + white wash.
            fx.body.tint = color;
            fx.vari.tint = _mixTowardWhite(color, 0.08);
            fx.edge.tint = _mixTowardBlack(color, 0.28);
            fx.hi.tint = _mixTowardWhite(color, 0.10);

            fx.body.width = fx.body.height = size;
            fx.vari.width = fx.vari.height = size;
            fx.edge.width = fx.edge.height = size;
            fx.hi.width = fx.hi.height = size;

            // Clear, subtle "liquid depth" motion (mask keeps wedge edges crisp)
            const s0 = (i % 2 === 0) ? 1 : -1;

            fx.body.rotation = tSec * 0.22 + i * 0.28;
            fx.body.position.set(Math.cos(tSec * 0.55 + i * 0.9) * 2.0, Math.sin(tSec * 0.50 + i * 0.8) * 2.0);

            fx.vari.rotation = s0 * (tSec * 0.36) + i * 0.22;
            fx.vari.position.set(Math.cos(tSec * 0.78 + i * 0.7) * 6.0, Math.sin(tSec * 0.70 + i * 0.6) * 6.0);

            fx.hi.rotation = tSec * 0.28 + i * 0.18;
            fx.hi.position.set(Math.cos(tSec * 0.92 + i * 0.6) * 10.0, -Math.sin(tSec * 0.84 + i * 0.6) * 10.0);

            fx.edge.rotation = tSec * 0.10;
            fx.edge.position.set(Math.cos(tSec * 0.42 + i * 0.5) * 3.0, Math.sin(tSec * 0.46 + i * 0.4) * 3.0);
          }
        } else {
          wc.visible = false;
          m.clear();
          m.visible = false;
        }
      }
    }

    if (rf > r0 + 0.5) {
      g.beginFill(color, 0.86);
      drawAnnularWedge(g, 0, 0, r0, rf, start, end);
      g.endFill();
    }
  }

  // Goal shading overlay (restored): show target/range regions per hue using SIM.goalViz.perHue.
  // This is purely presentational and uses existing objective evaluation logic & data.
  const goalPerHue = (SIM.goalViz && Array.isArray(SIM.goalViz.perHue)) ? SIM.goalViz.perHue : null;
  const shadeG = EC.RENDER.psycheGoalShadeG;
  if (shadeG) shadeG.clear();
  if (goalPerHue && shadeG) {
    const shadeAlpha = 0.18;
    const lineAlpha = 0.26;
    const lineW = Math.max(1, Math.min(4, safeR * 0.022));

    const radiusAt = (val) => {
      const v = clamp(val || 0, 0, HUE_CAP);
      const tt = (HUE_CAP > 0) ? (v / HUE_CAP) : 0;
      return Math.sqrt(r0 * r0 + tt * (r1 * r1 - r0 * r0));
    };

    for (let i = 0; i < N; i++) {
      const goal = goalPerHue[i] || null;
      if (!goal || !goal.type) continue;
      const type = String(goal.type).toUpperCase();
      const start = base + i * slice + gap / 2;
      const end = start + span;
      const hue = hues[i];
      const col = PSYCHE_COLORS[hue] || 0xffffff;

      let rin = null;
      let rout = null;
      let b0 = null;
      let b1 = null;

      if (type === 'OVER') {
        const thr = (typeof goal.target === 'number') ? goal.target : 0;
        rin = radiusAt(thr);
        rout = r1;
        b0 = rin;
      } else if (type === 'UNDER') {
        const thr = (typeof goal.target === 'number') ? goal.target : 0;
        rin = r0;
        rout = radiusAt(thr);
        b0 = rout;
      } else if (type === 'BAND') {
        const lowV = (typeof goal.low === 'number') ? goal.low : (typeof goal.min === 'number' ? goal.min : 0);
        const highV = (typeof goal.high === 'number') ? goal.high : (typeof goal.max === 'number' ? goal.max : lowV);
        const lo = Math.min(lowV, highV);
        const hi = Math.max(lowV, highV);
        rin = radiusAt(lo);
        rout = radiusAt(hi);
        b0 = rin;
        b1 = rout;
      }

      if (rin == null || rout == null) continue;
      rin = Math.max(r0, Math.min(r1, rin));
      rout = Math.max(r0, Math.min(r1, rout));
      if (rout <= rin + 0.5) continue;

      // Soft shaded band
      shadeG.beginFill(col, shadeAlpha);
      drawAnnularWedge(shadeG, 0, 0, rin, rout, start, end);
      shadeG.endFill();

      // Boundary lines for readability (drawn ON TOP of hue fill).
      // Use high-contrast lines so UNDER/BAND goals remain visible even when the wedge is fully saturated.
      const drawBoundary = (b) => {
        if (typeof b !== 'number') return;
        // Use a thin FILLED band (no stroke) to avoid "black rails" / anti-alias seams that can look
        // like the fill hits a wall. Keep it crisp and bright, but non-occluding.
        const bandW = Math.max(1.5, Math.min(3.0, lineW));
        shadeG.beginFill(0xFFFFFF, 0.86);
        drawAnnularWedge(shadeG, 0, 0, b - (bandW * 0.5), b + (bandW * 0.5), start, end);
        shadeG.endFill();
      };
      drawBoundary(b0);
      drawBoundary(b1);
    }
  }


  // Per-wedge satisfied indicator (gold ring) + numeric readouts.
  // Uses the same per-hue objective evaluation logic already present in SIM.goalViz.
  // (goalPerHue already resolved above)
  const ringG = EC.RENDER.psycheGoalRingG;
  if (ringG) ringG.clear();

  const wedgeTexts = EC.RENDER.psycheWedgeValueTexts || null;

  function goalOk(goal, value) {
    if (!goal || !goal.type) return false;
    const type = String(goal.type).toUpperCase();
    const v = (typeof value === 'number' && isFinite(value)) ? value : 0;
    if (type === 'OVER') return v >= (goal.target || 0);
    if (type === 'UNDER') return v <= (goal.target || 0);
    if (type === 'BAND') {
      const lowV = (typeof goal.low === 'number') ? goal.low : (typeof goal.min === 'number' ? goal.min : 0);
      const highV = (typeof goal.high === 'number') ? goal.high : (typeof goal.max === 'number' ? goal.max : lowV);
      const lo = Math.min(lowV, highV);
      const hi = Math.max(lowV, highV);
      return v >= lo && v <= hi;
    }
    return false;
  }

  // Position text and draw satisfied rings in the same wedge geometry.
  const gold = 0xffd166;
  const ringW = Math.max(2, Math.min(6, safeR * 0.03));
  const textR = r0 + (r1 - r0) * 0.62;
  const fontSize = Math.max(12, Math.min(22, safeR * 0.16));

  // UI-only flash when a treatment hold completes
  const flashDur = (EC.TUNE && typeof EC.TUNE.PLAN_STEP_FLASH_SEC === 'number') ? EC.TUNE.PLAN_STEP_FLASH_SEC : 0.45;
  const flashT = (SIM && typeof SIM._planStepFlashT === 'number') ? SIM._planStepFlashT : 0;
  const flash = clamp(flashT / Math.max(0.001, flashDur), 0, 1);

  for (let i = 0; i < N; i++) {
    const start = base + i * slice + gap / 2;
    const end = start + span;
    const mid = (start + end) * 0.5;

    const rawP = (P[i] || 0);
    const vv = Math.round(rawP);

    // Numeric psyche value inside wedge
    if (wedgeTexts && wedgeTexts[i]) {
      const t = wedgeTexts[i];
      if (t.text !== String(vv)) t.text = String(vv);
      if (t.style && t.style.fontSize !== fontSize) {
        // Pixi Text style assignment can be expensive; only change when needed.
        t.style = { ...t.style, fontSize: fontSize };
      }
      t.position.set(Math.cos(mid) * textR, Math.sin(mid) * textR);
      t.visible = true;
    }

    // Gold ring if this wedge currently satisfies its objective condition
    const ok = goalPerHue ? goalOk(goalPerHue[i], vv) : false;
    if (ok && ringG) {
      ringG.lineStyle({ width: ringW, color: gold, alpha: (0.92 + 0.38 * flash) });
      drawAnnularWedge(ringG, 0, 0, r0, r1, start, end);
      ringG.closePath();
      ringG.endFill && ringG.endFill();
      ringG.lineStyle();
    }

    // UI-only psyche warning flashes + break highlight overlays (per wedge)
    try {
      const wf = (SIM && SIM._psyWarnFx) ? SIM._psyWarnFx : null;
      const bf = (SIM && SIM._breakFx) ? SIM._breakFx : null;
      const w0 = (wf && typeof wf[i] === 'number') ? wf[i] : 0;
      const wdt = nowMs - w0;
      const wdur = 900;
      const wPulse = (wdt >= 0 && wdt <= wdur)
        ? (Math.abs(Math.sin((wdt / wdur) * Math.PI * 3)) * (1 - (wdt / wdur)))
        : 0;

      let bPulse = 0;
      if (bf && bf.psyMask && bf.psyMask[i] && typeof bf.startMs === 'number') {
        const bdt = nowMs - bf.startMs;
        const bdur = (typeof bf.durMs === 'number') ? bf.durMs : 900;
        if (bdt >= 0 && bdt <= bdur) bPulse = 1 - (bdt / bdur);
      }

      // Warning flashes: fill wedge with pulsing red (player expectation: pies flash red)
      if (wPulse > 0.01) {
        const a = Math.min(0.70, 0.18 + 0.52 * wPulse);
        g.beginFill(0xff2a2a, a);
        drawAnnularWedge(g, 0, 0, r0 + 1, r1 - 1, start, end);
        g.endFill();
      }

      // Break highlight: crisp white outline over affected wedges
      if (bPulse > 0.01) {
        g.lineStyle({ width: 3, color: 0xFFFFFF, alpha: 0.85 * bPulse });
        drawAnnularWedge(g, 0, 0, r0 + 1, r1 - 1, start, end);
        g.closePath();
        g.endFill && g.endFill();
        g.lineStyle();
      }
    } catch (_) { /* ignore */ }
  }

  // Center core: Treatment hold progress (yellow)
  // ------------------------------------------------------------
  const coreR = r0 * 0.92;
  g.beginFill(0x0b1020, 0.92);
  g.drawCircle(0, 0, coreR);
  g.endFill();
  // Mental break center flash (visual only; driven by real time so it animates during hit-stop)
  try {
    const bf = SIM._breakFx;
    if (bf) {
      const bdt = nowMs - (bf.startMs || 0);
      const bn = (bf.durMs || 0);
      if (bdt >= 0 && bdt <= bn) {
        const bp = 1.0 - (bdt / bn);
        const pulse = (0.30 + 0.70 * Math.abs(Math.sin((bdt / bn) * Math.PI * 3))) * bp;
        g.beginFill(0xff2a2a, Math.min(0.85, pulse));
        g.drawCircle(0, 0, coreR);
        g.endFill();
      }
    }
  } catch (_) {}


// Compute hold fraction for active PLAN_CHAIN step
  // Canonical rule: 10s for all non-SPIN_ZERO steps (mechanics publishes _planHoldReqSec).
  let frac = 0;
  const holdReq = (SIM && typeof SIM._planHoldReqSec === 'number') ? SIM._planHoldReqSec : 0;
  const holdNow = (typeof SIM.planHoldSec === 'number') ? SIM.planHoldSec : 0;
  frac = (holdReq > 0) ? clamp(holdNow / holdReq, 0, 1) : 0;

  if (frac > 0) {
    const col = 0xffd166;
    const a = 0.28 + 0.34 * flash;
    g.beginFill(col, a);
    g.moveTo(0, 0);
    g.arc(0, 0, coreR, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
    g.closePath();
    g.endFill();
  }

  // Center countdown text (treatment hold timer)
  const ct = EC.RENDER.psycheCenterText || null;
  if (ct) {
    let show = false;
    let txt = '';
    try {
      const req = (SIM && typeof SIM._planHoldReqSec === 'number') ? SIM._planHoldReqSec : 0;
      const ok = !!(SIM && SIM._planStepOk);
      if (req > 0) {
        // Show countdown only while the step is satisfied (or during completion flash).
        if (ok || (holdNow > 0) || (flashT > 0)) {
          const rem = Math.ceil(clamp(req - holdNow, 0, req));
          txt = String(Math.max(0, Math.min(req, rem)));
          show = true;
        }
      }
    } catch (_) {}
    if (!show) {
      if (ct.text !== '') ct.text = '';
      ct.visible = false;
    } else {
      if (ct.text !== txt) ct.text = txt;
      ct.visible = true;
      ct.position.set(0, 0);
    }
  }

  // Subtle outline
  g.lineStyle(1, 0xffffff, 0.12 + 0.16 * flash);
  g.drawCircle(0, 0, coreR);
  g.lineStyle(0, 0, 0);
}


EC.ensurePsycheView = ensurePsycheView;
EC.renderPsyche = renderPsyche;
EC.updatePsycheView = renderPsyche;

// -----------------------------
// Layout (moved from main.js in Step 6)


// -----------------------------
// MVP 6-well ring (Chunk 4)
// (moved to render_wells_init.js + render_wells_update.js in Chunk 3)
// -----------------------------

// -----------------------------

function layout() {
  drawBackground();

  // Ensure psyche exists before laying out other items.
  if (EC.ensurePsycheView) EC.ensurePsycheView();

  const app = EC.RENDER.app;
  const snap = _snap();
  const SIM = snap.SIM;
  const UI = snap.UI;
  const RSTATE = snap.RSTATE;
  // Render state bucket (created by ENGINE.getSnapshot or _snap fallback)
  RSTATE.flags = RSTATE.flags || {};
  RSTATE.layout = RSTATE.layout || {};
  if (!('mvpPrevSpinT' in RSTATE)) RSTATE.mvpPrevSpinT = null;
  const LAYOUT = (RSTATE.layout = RSTATE.layout || {});

  // Use logical pixels (app.screen) for layout; renderer.* are device pixels.
  const w = app.screen.width;
  const h = app.screen.height;

  // Keep pointer hit testing aligned after resizes.
  app.stage.hitArea = app.screen;

  // Measure HUD so wells never sit under the drawer/top notification bar.
  const notify = document.getElementById('notifyBar');
  const drawer = document.getElementById('drawer');
  const notifyRect = notify ? notify.getBoundingClientRect() : { bottom: 0, height: 0 };
  const drawerRect = drawer ? drawer.getBoundingClientRect() : { height: 0, top: h };
  // Board-first portrait UI: do not reserve horizontal space for side panels.
  // The board should be constrained primarily by screen width.
  const leftReserved = 0;

  const topReserved = Math.max(0, notifyRect.bottom + 8);
  // Reserve the *actual* on-screen area occupied by the bottom drawer so the board never overlaps.
  // Using height alone can be wrong when CSS/viewport changes cause the drawer to float.
  const bottomReserved = Math.max(0, (h - (drawerRect.top || h)) + 8);

  const availableH = Math.max(120, h - topReserved - bottomReserved);

  // MVP redesign layout: compact board region with Psyche + 6 wells in a ring.
  if (SIM && SIM.wellsA && Array.isArray(SIM.wellsA) && SIM.wellsA.length === 6) {
    const pad = 14;
    const leftX = pad + (typeof leftReserved === 'number' ? leftReserved : 0);
    const rightX = w - pad;
    const availW = Math.max(160, rightX - leftX);
    const boardSize = Math.max(160, Math.min(availW, availableH - 8));
    const cx = (leftX + rightX) / 2;
    const cy = clamp(topReserved + availableH * 0.50, topReserved + boardSize * 0.20, h - bottomReserved - boardSize * 0.20);

    // Prioritize much larger wells (tap targets) while keeping no-overlap.
    // Psyche stays readable; ring radius expands to accommodate bigger wells.
    const psycheR = clamp(boardSize * 0.13, 30, 78);
    const wellMinR = clamp(boardSize * 0.095, 22, 78);
    const wellMaxR = clamp(boardSize * 0.145, wellMinR + 8, 110);
    const ringR = clamp(boardSize * 0.43, psycheR + wellMaxR + 18, boardSize * 0.49);

    LAYOUT.mvpGeom = {
      cx, cy,
      boardSize,
      psycheR,
      ringR,
      wellMinR,
      wellMaxR,
      baseAngle: -Math.PI / 2, // start at top
      // Layout reservations for non-board UI (used by overlay clamping)
      topReserved,
      bottomReserved,
    };

    // Psyche centered
    if (EC.RENDER && EC.RENDER.psycheLayer) {
      EC.RENDER.psycheLayer.position.set(cx, cy);
    }
    // Store radius for renderPsyche (render-only state; do not write to SIM)
    LAYOUT.psycheRadius = psycheR;

    // Place psyche debug text at top-left
    if (EC.RENDER && EC.RENDER.psycheDebugText) {
      EC.RENDER.psycheDebugText.position.set(14, 10);
    }

    // Ensure MVP wells render and are positioned
    if (EC.updateMvpBoardView) EC.updateMvpBoardView();
    return;
  }

  // Non-MVP (legacy) layouts are intentionally unreachable; no-op.
  return;
}

// Layout scheduling
// Chrome can fire window resize handlers BEFORE Pixi has resized its renderer, which
// causes wells to be positioned using stale dimensions (e.g., full-width coords while
// the canvas is smaller). To keep layout in sync with the actual renderer size, we
// relayout AFTER the renderer reports a resize.
let relayoutRAF = 0;
function scheduleRelayout() {
  if (relayoutRAF) cancelAnimationFrame(relayoutRAF);
  relayoutRAF = requestAnimationFrame(() => {
    relayoutRAF = 0;
    layout();
  });
}

  // Export moved functions
  EC.drawBackground = drawBackground;
  EC.layout = layout;
  EC.scheduleRelayout = scheduleRelayout;
  // Public resize hook used by UI and bootstrap
  EC.resize = scheduleRelayout;

  // Hardening: module registry (no gameplay impact)
  EC._registerModule && EC._registerModule('render_wells', { provides: ["EC.layout", "EC.scheduleRelayout", "EC.drawBackground", "EC.ensurePsycheView", "EC.renderPsyche", "EC.updatePsycheView", "EC.RENDER"] });
})();
