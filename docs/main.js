/* Emotioncraft Prototype 0.1.9 — thin bootstrap (Step 6 split)
   main.js is intentionally minimal:
   - create Pixi Application + layers
   - expose render context via EC.RENDER
   - hook resize + ticker
   - call EC.init()
*/
(() => {
  const EC = (window.EC = window.EC || {});

  // Build label used by UI summary/debug
  EC.BUILD = EC.BUILD || '0.1.9';

  // -----------------------------
  // Pixi setup
  // -----------------------------
  const appEl = document.getElementById('app');

  const app = new PIXI.Application({
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  appEl.appendChild(app.view);

  // Mobile gesture reliability: disable browser gesture handling on the canvas.
  // Flick input uses Pointer Events; `touch-action: none` prevents the browser
  // from hijacking swipes for scrolling/back navigation over the game surface.
  try {
    app.view.style.touchAction = 'none';
    app.view.style.userSelect = 'none';
    app.view.style.webkitUserSelect = 'none';
  } catch (_) {}

  const root = new PIXI.Container();
  app.stage.addChild(root);

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  // ------------------------------------------------------------
  // Mobile gesture hardening
  // - stage-level pointerup fallback (pointerup may not return to original well)
  // - canvas event protections (prevent scroll/back/rubber-band)
  // ------------------------------------------------------------

  // Best-effort: prevent browser gesture hijack on iOS/Android.
  // Keep minimal; do not interfere with non-canvas page UI.
  try {
    const view = app.view;
    const opts = { passive: false };
    view.addEventListener('touchstart', (e) => { try { e.preventDefault(); } catch (_) {} }, opts);
    view.addEventListener('touchmove', (e) => { try { e.preventDefault(); } catch (_) {} }, opts);
    view.addEventListener('touchend', (e) => { try { e.preventDefault(); } catch (_) {} }, opts);
    view.addEventListener('gesturestart', (e) => { try { e.preventDefault(); } catch (_) {} }, opts);
  } catch (_) {}

  function _pidFromEv(ev) {
    return (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);
  }

  function _wellIndexById(wellId) {
    const SIM = EC.SIM;
    if (!SIM || !Array.isArray(SIM.wells)) return -1;
    for (let k = 0; k < SIM.wells.length; k++) {
      if (SIM.wells[k] && SIM.wells[k].id === wellId) return k;
    }
    return -1;
  }

  function _resolveActiveGestureFromStage(ev, isOutside) {
    const st = EC.RENDER && EC.RENDER._gesture;
    if (!st || !st.active) return;

    const pid = _pidFromEv(ev);
    if (st.pid != null && st.pid >= 0 && pid != null && pid >= 0 && pid !== st.pid) return;

    const getXY = EC.RENDER && EC.RENDER._getClientXY;
    const setDbg = EC.RENDER && EC.RENDER._setGestureDebug;
    const { x, y, oe } = (getXY ? getXY(ev) : { x: 0, y: 0, oe: null });
    try { if (oe && typeof oe.preventDefault === 'function') oe.preventDefault(); } catch (_) {}

    const t1 = (performance && performance.now) ? performance.now() : Date.now();
    const dt = t1 - (st.t0 || t1);
    const dx = x - st.x0;
    const dy = y - st.y0;

    EC.RENDER._gesture = null;

    const THRESH_MS = 400;
    const THRESH_PX = 18;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dist = Math.max(adx, ady);
    const isFlick = (dt <= THRESH_MS) && (dist >= THRESH_PX);

    if (!isFlick) {
      EC.onWellTap && EC.onWellTap(st.wellId);
      if (setDbg) setDbg(`SWIPE: up(stage) dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => TAP`);
      return;
    }

    let dA = 0, dS = 0;
    if (adx > ady) dS = (dx > 0) ? +5 : -5;
    else dA = (dy < 0) ? +5 : -5;

    EC.onWellTap && EC.onWellTap(st.wellId);

    const SIM = EC.SIM;
    const i = _wellIndexById(st.wellId);
    const fn = EC.UI_CONTROLS && typeof EC.UI_CONTROLS.flickStep === 'function' ? EC.UI_CONTROLS.flickStep : null;
    const toast = EC.UI_CONTROLS && typeof EC.UI_CONTROLS.toast === 'function' ? EC.UI_CONTROLS.toast : null;
    if (!fn || i < 0) {
      if (toast) toast('Select a Well first.');
      if (setDbg) setDbg(`SWIPE: up(stage) dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => FLICK (no index)`);
      return;
    }
    try { SIM.selectedWellIndex = i; } catch (_) {}

    const res = fn(i, dA, dS) || { ok: false, reason: 'unknown' };
    const dirTxt = (dS !== 0) ? (dS > 0 ? 'RIGHT (S+5)' : 'LEFT (S-5)') : (dA > 0 ? 'UP (A+5)' : 'DOWN (A-5)');
    if (!res.ok) {
      if (res.reason === 'noenergy') { if (toast) toast('Not enough Energy.'); }
      if (EC.SFX && typeof EC.SFX.error === 'function') EC.SFX.error();
      if (setDbg) setDbg(`SWIPE: up(stage) dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => ${dirTxt} ❌`);
      return;
    }

    if (EC.SFX && typeof EC.SFX.tick === 'function') EC.SFX.tick();
    if (setDbg) setDbg(`SWIPE: up(stage) dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => ${dirTxt} APPLIED ✅${isOutside ? ' (upoutside)' : ''}`);
  }

  // Stage-level fallback handlers (mobile reliability)
  app.stage.on('pointerup', (ev) => _resolveActiveGestureFromStage(ev, false));
  app.stage.on('pointerupoutside', (ev) => _resolveActiveGestureFromStage(ev, true));
  app.stage.on('pointercancel', (ev) => {
    const st = EC.RENDER && EC.RENDER._gesture;
    if (!st || !st.active) return;
    const pid = _pidFromEv(ev);
    if (st.pid != null && st.pid >= 0 && pid != null && pid >= 0 && pid !== st.pid) return;
    EC.RENDER._gesture = null;
    const setDbg = EC.RENDER && EC.RENDER._setGestureDebug;
    if (setDbg) setDbg('SWIPE: cancel(stage)');
  });

  const bg = new PIXI.Graphics();
  root.addChild(bg);

  const wellLayer = new PIXI.Container();
  root.addChild(wellLayer);

  const labelLayer = new PIXI.Container();
  root.addChild(labelLayer);

  // Shared render context for render_wells.js
  EC.RENDER = EC.RENDER || {};
  EC.RENDER.app = app;
  EC.RENDER.root = root;
  EC.RENDER.bg = bg;
  EC.RENDER.wellLayer = wellLayer;
  EC.RENDER.labelLayer = labelLayer;

  // -----------------------------
  // Resize + tick hooks
  // -----------------------------
  // Ensure stage hitArea stays in sync with the screen after any resize.
  // This avoids missed pointerup events after orientation changes.
  const _origResize = EC.resize;
  EC.resize = function wrappedResize() {
    try { app.stage.hitArea = app.screen; } catch (_) {}
    if (typeof _origResize === 'function') _origResize();
  };

  if (app.renderer && EC.resize) {
    app.renderer.on('resize', EC.resize);
  }
  window.addEventListener('resize', () => EC.resize && EC.resize());
  window.addEventListener('orientationchange', () => EC.resize && EC.resize());

  if (EC.tick) app.ticker.add(EC.tick);

  // -----------------------------
  // Start
  // -----------------------------
  if (EC.init) 

  // Hardening: verify required surface exists (no-op when healthy)
  if (EC.assertReady) {
    EC.assertReady('boot', ["EC.TUNING", "EC.makeWell", "EC.ensureWellView", "EC.applyImprintToWell", "EC.initUI", "EC.SIM"]);
  }

EC.init();

  // Post-load layout reliability on mobile:
  // do a deterministic "double rAF" recompute after initial paint.
  // This helps when the browser reports initial viewport sizes late (especially iOS).
  try {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof EC.resize === 'function') EC.resize();
      });
    });
  } catch (_) {}

  // Orientation changes can deliver stale sizes for one frame; re-run with a double rAF.
  try {
    window.addEventListener('orientationchange', () => {
      try {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (typeof EC.resize === 'function') EC.resize();
          });
        });
      } catch (_) {}
    });
  } catch (_) {}


  // Hardening: module registry (no gameplay impact)
  EC._registerModule && EC._registerModule('main', { provides: ["bootstrap Pixi app", "ticker", "resize hook"] });
})();
