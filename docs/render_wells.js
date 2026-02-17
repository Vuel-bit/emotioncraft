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

  const SIM = EC.SIM;
  if (!SIM || !EC.RENDER || !EC.RENDER.psycheG) return;

  const hues = (EC.CONST && EC.CONST.HUES) || EC.HUES || ['red', 'purple', 'blue', 'green', 'yellow', 'orange'];
  const P = SIM.psyP || new Array(6).fill(0);
  const HUE_CAP = (EC.TUNE && typeof EC.TUNE.PSY_HUE_CAP === 'number') ? EC.TUNE.PSY_HUE_CAP : 500;

  const nowMs = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance.now() : Date.now();

  // --- Safe circle inside the well ring (guaranteed no collision with wells) ---
  const geom = SIM.mvpGeom || null;
  const ringR = (geom && typeof geom.ringR === 'number')
    ? geom.ringR
    : ((typeof SIM.psycheRadius === 'number') ? SIM.psycheRadius * 2.4 : 140);

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
  const SIM = EC.SIM;

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

    SIM.mvpGeom = {
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
    // Store radius for renderPsyche
    SIM.psycheRadius = psycheR;

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
