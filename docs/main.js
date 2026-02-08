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

// ------------------------------------------------------------
// Raw input instrumentation (for mobile swipe diagnosis)
// ------------------------------------------------------------
EC.UI_STATE = EC.UI_STATE || {};
EC.UI_STATE.inputDbg = EC.UI_STATE.inputDbg || {
  dom: { pd:0, pm:0, pu:0, pc:0, ts:0, tm:0, te:0, tc:0 },
  pixiStage: { pd:0, pm:0, pu:0, po:0, pc:0 },
  pixiWell: { pd:0, pm:0, pu:0, po:0, pc:0 },
  lastDomPointer: null,
  lastDomTouch: null,
  lastStage: null,
  lastWell: null,
  log: [],
};

function _idbg() { return (EC.UI_STATE && EC.UI_STATE.inputDbg) || null; }
function _ilog(line) {
  const D = _idbg();
  if (!D) return;
  const t = (performance && performance.now) ? performance.now() : Date.now();
  const stamp = ('' + Math.floor(t)).padStart(6,'0');
  D.log = Array.isArray(D.log) ? D.log : [];
  D.log.push(stamp + ' ' + line);
  if (D.log.length > 120) D.log.splice(0, D.log.length - 120);
}

function _touchXY(te) {
  try {
    const ch = (te && te.changedTouches && te.changedTouches[0]) ? te.changedTouches[0] : null;
    const t = ch || (te && te.touches && te.touches[0]) || null;
    if (t) return { x: t.clientX, y: t.clientY };
  } catch (_) {}
  return { x: null, y: null };
}

function _recordDomPointer(e, phase, extra) {
  const D = _idbg(); if (!D) return;
  D.dom[phase] = (D.dom[phase]||0) + 1;
  D.lastDomPointer = {
    type: e.type,
    pid: e.pointerId,
    pointerType: e.pointerType,
    isPrimary: !!e.isPrimary,
    x: (typeof e.clientX === 'number') ? Math.round(e.clientX) : null,
    y: (typeof e.clientY === 'number') ? Math.round(e.clientY) : null,
    defaultPrevented: !!e.defaultPrevented,
    capture: extra || '',
  };
  _ilog(`DOM ${e.type} pid=${e.pointerId} pt=${e.pointerType||'?'} x=${D.lastDomPointer.x} y=${D.lastDomPointer.y} defPrev=${D.lastDomPointer.defaultPrevented?'Y':'n'} ${extra||''}`.trim());
}

function _recordDomTouch(e, phase) {
  const D = _idbg(); if (!D) return;
  D.dom[phase] = (D.dom[phase]||0) + 1;
  const xy = _touchXY(e);
  D.lastDomTouch = {
    type: e.type,
    touches: (e.touches && e.touches.length) ? e.touches.length : 0,
    changed: (e.changedTouches && e.changedTouches.length) ? e.changedTouches.length : 0,
    x: (typeof xy.x === 'number') ? Math.round(xy.x) : null,
    y: (typeof xy.y === 'number') ? Math.round(xy.y) : null,
    defaultPrevented: !!e.defaultPrevented,
  };
  _ilog(`DOM ${e.type} touches=${D.lastDomTouch.touches} changed=${D.lastDomTouch.changed} x=${D.lastDomTouch.x} y=${D.lastDomTouch.y} defPrev=${D.lastDomTouch.defaultPrevented?'Y':'n'}`);
}

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

  // Touch events (some Android devices still emit these alongside Pointer Events)
  view.addEventListener('touchstart', (e) => {
    _recordDomTouch(e,'ts');
    try { e.preventDefault(); } catch (_) {}
    // Arm gesture using Touch.identifier when touch starts over a well (DOM-level, independent of Pixi pointer events).
    try {
      if (EC.RENDER && typeof EC.RENDER._armGestureFromDomTouchStart === 'function') {
        const armed = EC.RENDER._armGestureFromDomTouchStart(e, app);
        _ilog('DOM touchstart arm=' + (armed ? 'Y' : 'n'));
      }
    } catch (_) {}
  }, opts);
  view.addEventListener('touchmove', (e) => { _recordDomTouch(e,'tm'); try { e.preventDefault(); } catch (_) {} }, opts);
  view.addEventListener('touchend', (e) => {
    _recordDomTouch(e,'te');
    try { e.preventDefault(); } catch (_) {}
    // DOM fallback: resolve gesture end even if Pixi doesn't receive pointerup
    try {
      if (EC.RENDER && EC.RENDER._gesture && EC.RENDER._gesture.active && typeof EC.RENDER._resolveGestureFromDom === 'function') {
        EC.RENDER._resolveGestureFromDom(e, 'end');
      }
    } catch (_) {}
  }, opts);
  view.addEventListener('touchcancel', (e) => {
    _recordDomTouch(e,'tc');
    try { e.preventDefault(); } catch (_) {}
    try {
      if (EC.RENDER && EC.RENDER._gesture && EC.RENDER._gesture.active && typeof EC.RENDER._resolveGestureFromDom === 'function') {
        EC.RENDER._resolveGestureFromDom(e, 'cancel');
      }
    } catch (_) {}
  }, opts);

  // Pointer events on the canvas element (raw DOM instrumentation)
  view.addEventListener('pointerdown', (e) => { _recordDomPointer(e,'pd'); try { e.preventDefault(); } catch (_) {} }, opts);
  view.addEventListener('pointermove', (e) => { _recordDomPointer(e,'pm'); try { e.preventDefault(); } catch (_) {} }, opts);

  view.addEventListener('pointerup', (e) => {
    _recordDomPointer(e,'pu');
    try { e.preventDefault(); } catch (_) {}
    try {
      if (EC.RENDER && EC.RENDER._gesture && EC.RENDER._gesture.active && typeof EC.RENDER._resolveGestureFromDom === 'function') {
        EC.RENDER._resolveGestureFromDom(e, 'end');
      }
    } catch (_) {}
  }, opts);

  view.addEventListener('pointercancel', (e) => {
    _recordDomPointer(e,'pc');
    try { e.preventDefault(); } catch (_) {}
    try {
      if (EC.RENDER && EC.RENDER._gesture && EC.RENDER._gesture.active && typeof EC.RENDER._resolveGestureFromDom === 'function') {
        EC.RENDER._resolveGestureFromDom(e, 'cancel');
      }
    } catch (_) {}
  }, opts);

  view.addEventListener('gesturestart', (e) => { try { e.preventDefault(); } catch (_) {} }, opts);
} catch (_) {}

  function _pidFromEv(ev) {
    return (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);
  }

function _stageDbg(ev, kind) {
  const D = _idbg(); if (!D) return;
  const map = { pointerdown:'pd', pointermove:'pm', pointerup:'pu', pointerupoutside:'po', pointercancel:'pc' };
  const k = map[kind] || null;
  if (k) D.pixiStage[k] = (D.pixiStage[k]||0) + 1;

  const pid = _pidFromEv(ev);
  let x = null, y = null, src = 'global';
  try {
    const oe = ev && ev.data && ev.data.originalEvent;
    if (oe && typeof oe.clientX === 'number') { x = Math.round(oe.clientX); y = Math.round(oe.clientY); src = 'originalEvent'; }
    else if (oe && oe.changedTouches && oe.changedTouches[0]) { x = Math.round(oe.changedTouches[0].clientX); y = Math.round(oe.changedTouches[0].clientY); src = 'touch'; }
    else if (ev && ev.global) { x = Math.round(ev.global.x); y = Math.round(ev.global.y); src = 'global'; }
  } catch (_) {}
  D.lastStage = { type: kind, pid, x, y, src };
  _ilog(`PIXI STAGE ${kind} pid=${pid} x=${x} y=${y} src=${src}`);
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
// Stage-level instrumentation (does not affect gameplay)
app.stage.on('pointerdown', (ev) => { _stageDbg(ev,'pointerdown'); });
app.stage.on('pointermove', (ev) => { _stageDbg(ev,'pointermove'); });

  app.stage.on('pointerup', (ev) => { _stageDbg(ev,'pointerup'); _resolveActiveGestureFromStage(ev, false); });
  app.stage.on('pointerupoutside', (ev) => { _stageDbg(ev,'pointerupoutside'); _resolveActiveGestureFromStage(ev, true); });
  app.stage.on('pointercancel', (ev) => { _stageDbg(ev,'pointercancel');
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
