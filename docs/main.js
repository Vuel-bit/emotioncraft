
/* Emotioncraft Prototype — thin bootstrap
   main.js intentionally stays minimal:
   - create Pixi Application + core layers
   - expose render context via EC.RENDER
   - wire DOM + stage events to EC.INPUT
   - hook resize + ticker
   - call EC.init()
*/
(() => {
  const EC = (window.EC = window.EC || {});

  // Build label used by UI summary/debug
  EC.BUILD = EC.BUILD || 'v0_2_103_passD';

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

  // Mobile gesture reliability: prevent the browser from hijacking swipes over the canvas.
  try {
    app.view.style.touchAction = 'none';
    app.view.style.userSelect = 'none';
    app.view.style.webkitUserSelect = 'none';
  } catch (_) {}

  const root = new PIXI.Container();
  app.stage.addChild(root);

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  // -----------------------------
  // DOM event wiring (gesture arming + resolve)
  // -----------------------------
  try {
    const view = app.view;
    const opts = { capture: true, passive: false };

    const isDbg = () => (EC.INPUT && typeof EC.INPUT.isInputDebugEnabled === 'function') ? !!EC.INPUT.isInputDebugEnabled() : false;
    const ensureDbg = () => { try { if (EC.INPUT && typeof EC.INPUT.ensureInputDbg === 'function') EC.INPUT.ensureInputDbg(); } catch (_) {} };

    // Touch events (canonical arming lives in systems_input)
    view.addEventListener('touchstart', (e) => {
      try { e.preventDefault(); } catch (_) {}
      if (isDbg()) { ensureDbg(); try { EC.INPUT.dbgRecordDomTouch && EC.INPUT.dbgRecordDomTouch(e, 'ts'); } catch (_) {} }
      try { EC.INPUT && EC.INPUT.armGestureFromDomTouchStart && EC.INPUT.armGestureFromDomTouchStart(e); } catch (_) {}
    }, opts);

    view.addEventListener('touchmove', (e) => {
      try { e.preventDefault(); } catch (_) {}
      if (isDbg()) { ensureDbg(); try { EC.INPUT.dbgRecordDomTouch && EC.INPUT.dbgRecordDomTouch(e, 'tm'); } catch (_) {} }
    }, opts);

    view.addEventListener('touchend', (e) => {
      try { e.preventDefault(); } catch (_) {}
      if (isDbg()) { ensureDbg(); try { EC.INPUT.dbgRecordDomTouch && EC.INPUT.dbgRecordDomTouch(e, 'te'); } catch (_) {} }
      try { if (EC.INPUT && typeof EC.INPUT.resolveDomTouchEnd === 'function') EC.INPUT.resolveDomTouchEnd(e, 'touchend'); } catch (_) {}
    }, opts);

    view.addEventListener('touchcancel', (e) => {
      try { e.preventDefault(); } catch (_) {}
      if (isDbg()) { ensureDbg(); try { EC.INPUT.dbgRecordDomTouch && EC.INPUT.dbgRecordDomTouch(e, 'tc'); } catch (_) {} }
      try { if (EC.INPUT && typeof EC.INPUT.resolveDomTouchEnd === 'function') EC.INPUT.resolveDomTouchEnd(e, 'touchcancel'); } catch (_) {}
    }, opts);

    // Pointer events (flick/drag)
    view.addEventListener('pointerdown', (e) => {
      try { if (EC.SFX && typeof EC.SFX.unlock === 'function') EC.SFX.unlock(); } catch (_) {}
      try { e.preventDefault(); } catch (_) {}

      // Arm gesture first (behavior lock), then attempt pointer capture.
      try { EC.INPUT && EC.INPUT.armGestureFromDomPointerDown && EC.INPUT.armGestureFromDomPointerDown(e); } catch (_) {}

      let capInfo = '';
      try { view.setPointerCapture(e.pointerId); capInfo = 'cap=SET'; }
      catch (_) { capInfo = 'cap=FAIL'; }

      if (isDbg()) {
        ensureDbg();
        try { EC.INPUT.dbgRecordDomPointer && EC.INPUT.dbgRecordDomPointer(e, 'pd', capInfo); } catch (_) {}
      }
    }, opts);


    view.addEventListener('pointermove', (e) => {
      try { e.preventDefault(); } catch (_) {}
      if (isDbg()) { ensureDbg(); try { EC.INPUT.dbgRecordDomPointer && EC.INPUT.dbgRecordDomPointer(e, 'pm'); } catch (_) {} }
    }, opts);

    view.addEventListener('pointerup', (e) => {
      try { e.preventDefault(); } catch (_) {}
      if (isDbg()) { ensureDbg(); try { EC.INPUT.dbgRecordDomPointer && EC.INPUT.dbgRecordDomPointer(e, 'pu'); } catch (_) {} }
      try { EC.INPUT && EC.INPUT.resolveGestureFromDom && EC.INPUT.resolveGestureFromDom(e, 'end'); } catch (_) {}
      try { view.releasePointerCapture(e.pointerId); } catch (_) {}
    }, opts);

    view.addEventListener('pointercancel', (e) => {
      try { e.preventDefault(); } catch (_) {}
      if (isDbg()) { ensureDbg(); try { EC.INPUT.dbgRecordDomPointer && EC.INPUT.dbgRecordDomPointer(e, 'pc'); } catch (_) {} }
      try { EC.INPUT && EC.INPUT.resolveGestureFromDom && EC.INPUT.resolveGestureFromDom(e, 'cancel'); } catch (_) {}
      try { view.releasePointerCapture(e.pointerId); } catch (_) {}
    }, opts);

  } catch (_) {}

  // -----------------------------
  // Stage-level fallback handlers (mobile reliability)
  // -----------------------------
  const _dbgEnabled = (EC.INPUT && typeof EC.INPUT.isInputDebugEnabled === 'function') ? !!EC.INPUT.isInputDebugEnabled() : false;
  if (_dbgEnabled) {
    app.stage.on('pointerdown', (ev) => { try { EC.INPUT.dbgStage && EC.INPUT.dbgStage(ev, 'pointerdown'); } catch (_) {} });
    app.stage.on('pointermove', (ev) => { try { EC.INPUT.dbgStage && EC.INPUT.dbgStage(ev, 'pointermove'); } catch (_) {} });
  }

  app.stage.on('pointerup', (ev) => {
    try { EC.INPUT.dbgStage && EC.INPUT.dbgStage(ev, 'pointerup'); } catch (_) {}
    try { if (EC.INPUT && typeof EC.INPUT.resolveActiveGestureFromStagePointerUp === 'function') EC.INPUT.resolveActiveGestureFromStagePointerUp(ev, false); } catch (_) {}
  });

  app.stage.on('pointerupoutside', (ev) => {
    try { EC.INPUT.dbgStage && EC.INPUT.dbgStage(ev, 'pointerupoutside'); } catch (_) {}
    try { if (EC.INPUT && typeof EC.INPUT.resolveActiveGestureFromStagePointerUp === 'function') EC.INPUT.resolveActiveGestureFromStagePointerUp(ev, true); } catch (_) {}
  });

  app.stage.on('pointercancel', (ev) => {
    try { EC.INPUT.dbgStage && EC.INPUT.dbgStage(ev, 'pointercancel'); } catch (_) {}

    const st = (EC.INPUT && EC.INPUT.gestureState) ? EC.INPUT.gestureState : null;
    if (!st || !st.active) return;
    if (st.kind && st.kind !== 'pointer') return;

    const pid = (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);
    if (st.pid != null && st.pid >= 0 && pid != null && pid >= 0 && pid !== st.pid) return;

    try {
      if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('stage_cancel', { pid });
      else { st.active = 0; st.key = ''; }
    } catch (_) {}

    const setDbg = EC.INPUT && EC.INPUT._setGestureDebug;
    if (setDbg) setDbg('SWIPE: cancel(stage)');
  });

  // -----------------------------
  // Core layers
  // -----------------------------
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

  // SFX init (safe no-op until unlocked by user gesture)
  if (typeof EC.safe === 'function') {
    EC.safe('SFX.init', () => { if (EC.SFX && typeof EC.SFX.init === 'function') EC.SFX.init(); });
  } else {
    try { if (EC.SFX && typeof EC.SFX.init === 'function') EC.SFX.init(); } catch (_) {}
  }

  // -----------------------------
  // Start
  // -----------------------------
  if (EC.assertReady) {
    EC.assertReady('boot', ["EC.TUNING", "EC.layout", "EC.initUI", "EC.SIM"]);
  }

  // Ensure debug buffer exists early when enabled (for HUD "Copy Input Log")
  try { if (EC.INPUT && typeof EC.INPUT.isInputDebugEnabled === 'function' && EC.INPUT.isInputDebugEnabled()) EC.INPUT.ensureInputDbg && EC.INPUT.ensureInputDbg(); } catch (_) {}

  if (typeof EC.init === 'function') EC.init();

  // Post-load layout reliability on mobile: deterministic double rAF after initial paint.
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
