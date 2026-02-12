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
  EC.BUILD = EC.BUILD || 'v0_2_63_resolve_failsafe_unified';

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
  const opts = { capture: true, passive: false };

function _domArmHookLog(e, label) {
  const D = _idbg(); 
  const t = (performance && performance.now) ? performance.now() : Date.now();
  let cx = null, cy = null, touchesN = 0, changedN = 0;
  try {
    if (e && (e.changedTouches || e.touches)) {
      touchesN = (e.touches && e.touches.length) ? e.touches.length : 0;
      changedN = (e.changedTouches && e.changedTouches.length) ? e.changedTouches.length : 0;
      const xy = _touchXY(e);
      cx = (typeof xy.x === 'number') ? Math.round(xy.x) : null;
      cy = (typeof xy.y === 'number') ? Math.round(xy.y) : null;
    } else if (e && typeof e.clientX === 'number') {
      cx = Math.round(e.clientX); cy = Math.round(e.clientY);
    }
  } catch (_) {}
  const before = !!(e && e.defaultPrevented);
  let after = before;
  try { if (e && (e.type === 'touchstart' || e.type === 'touchmove')) e.preventDefault(); } catch (_) {}
  try { after = !!(e && e.defaultPrevented); } catch (_) {}
  const line = `DOM_ARM_HOOK: type=${e && e.type ? e.type : '?'} touches=${touchesN} changed=${changedN} cx/cy=${cx},${cy} defPrevBefore=${before?'Y':'n'} defPrevAfter=${after?'Y':'n'} ${label||''}`.trim();
  if (D) {
    D.domArmHook = line;
  }
  _ilog(line);
  return { before, after, cx, cy };
}



  // Touch events (some Android devices still emit these alongside Pointer Events)
  view.addEventListener('touchstart', (e) => {
  _domArmHookLog(e, 'canvas');
  _recordDomTouch(e,'ts');

  // Execution Ladder — make it impossible for arming/picking to be silent.
  const D = _idbg();
  const _setLast = (k,v) => { try { if (D) D[k]=v; } catch (_) {} };

  try {
    _setLast('lastTouchstartStatus','ENTER');
    _ilog('TOUCHSTART_ENTER');

    const hasEC = !!window.EC;
    const hasRENDER = !!(window.EC && EC.RENDER);
    const hasSIM = !!(window.EC && EC.SIM);
    const hasAPP = !!(app);
    const hasVIEW = !!(app && app.view);
    const hasPickFn = !!(window.EC && EC.INPUT && typeof EC.INPUT.pickWellIndexFromClientXY === 'function');
    const hasArmFn = !!(window.EC && EC.INPUT && typeof EC.INPUT.armGestureFromPick === 'function');
    const nowMs = (performance && performance.now) ? Math.floor(performance.now()) : Date.now();
    _ilog(`TOUCHSTART_ENV: hasEC=${hasEC?1:0} hasRENDER=${hasRENDER?1:0} hasSIM=${hasSIM?1:0} hasAPP=${hasAPP?1:0} hasVIEW=${hasVIEW?1:0} hasPickFn=${hasPickFn?1:0} hasArmFn=${hasArmFn?1:0} now=${nowMs}`);
    _setLast('lastTouchstartStatus','ENV');

    // Ensure we actively prevent default (in addition to _domArmHookLog) and prove it.
    let before = !!(e && e.defaultPrevented);
    try { e.preventDefault(); } catch (_) {}
    let after = !!(e && e.defaultPrevented);
    _ilog(`TOUCHSTART_PREVENT: defPrevBefore=${before?'Y':'n'} defPrevAfter=${after?'Y':'n'}`);

    _ilog('TOUCHSTART_BEFORE_PICK');
    _setLast('lastTouchstartStatus','BEFORE_PICK');

    const oe = e;
    // Multi-touch rule: only the first finger can arm. If a second finger is present at start, ignore.
    const touchesN0 = (oe && oe.touches) ? oe.touches.length : 0;
    if (touchesN0 > 1) {
      _ilog('TOUCHSTART_RETURN: reason=multitouch_block');
      _setLast('lastTouchstartStatus','RETURN(multitouch_block)');
      // Also snapshot ARM failure explicitly.
      _ilog(`ARM: gsId=${(EC.INPUT&&EC.INPUT.gestureState&&EC.INPUT.gestureState._id)||'?' } ok=n key=t:? well=-1 reason=multitouch_block`);
      _setLast('lastArm', 'ok=n key=t:? well=-1 reason=multitouch_block');
      return;
    }
    const ch = (oe && oe.changedTouches && oe.changedTouches.length) ? oe.changedTouches[0] : null;
    const t = ch || ((oe && oe.touches && oe.touches.length) ? oe.touches[0] : null);
    if (!t || t.identifier == null) {
      _ilog('TOUCHSTART_RETURN: reason=no_touch_identifier');
      _setLast('lastTouchstartStatus','RETURN(no_touch_identifier)');
      return;
    }

    const clientX = t.clientX, clientY = t.clientY;
    const touchId = t.identifier;
    const endKey = 't:' + touchId; // for snapshot convenience
    let pick = null;

    try {
      if (EC.INPUT && typeof EC.INPUT.pickWellIndexFromClientXY === 'function') {
        pick = EC.INPUT.pickWellIndexFromClientXY(clientX, clientY);
      } else {
        _ilog('PICK_ERR: missing_pick_fn');
      }
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      _ilog('PICK_ERR: ' + msg);
      _setLast('lastPick', `idx=? inside=? cx/cy=${clientX},${clientY}`);
      _setLast('lastTouchstartStatus','PICK_ERR');
      _ilog('TOUCHSTART_BEFORE_ARM');
      _ilog(`ARM: gsId= ok=n key= well=-1 reason=pick_throw`);
      _setLast('lastArm', `ok=n key=${endKey} well=-1 reason=pick_throw`);
      _setLast('lastTouchstartStatus','EXIT');
      _ilog('TOUCHSTART_EXIT');
      return;
    }

    try {
      if (pick && typeof pick.idx === 'number') {
        const inside = pick.inside ? 'Y' : 'n';
        const cand = (pick.cand != null) ? pick.cand : pick.idx;
        const cxw = (pick.cx != null) ? pick.cx : NaN;
        const cyw = (pick.cy != null) ? pick.cy : NaN;
        const line = `PICK: idx=${pick.idx} cand=${cand} cx/cy=${clientX.toFixed(1)},${clientY.toFixed(1)} local=${pick.rx.toFixed(1)},${pick.ry.toFixed(1)} wellc=${isFinite(cxw)?cxw.toFixed(1):'?'} ,${isFinite(cyw)?cyw.toFixed(1):'?'} dist=${pick.dist.toFixed(1)} r=${pick.r.toFixed(1)} inside=${inside}`;
        _ilog(line);
        _setLast('lastPick', `idx=${pick.idx} cand=${(pick.cand!=null?pick.cand:pick.idx)} inside=${inside} dist=${(pick.dist!=null && isFinite(pick.dist))?pick.dist.toFixed(1):'?'} r=${(pick.r!=null && isFinite(pick.r))?pick.r.toFixed(1):'?'} cx/cy=${clientX.toFixed(1)},${clientY.toFixed(1)}`);
      } else {
        const line = `PICK: idx=-1 cx/cy=${clientX.toFixed(1)},${clientY.toFixed(1)} local=? dist=? r=? inside=n`;
        _ilog(line);
        _setLast('lastPick', `idx=-1 inside=n cx/cy=${clientX.toFixed(1)},${clientY.toFixed(1)}`);
      }
    } catch (_) {}

    _ilog('TOUCHSTART_BEFORE_ARM');
    _setLast('lastTouchstartStatus','BEFORE_ARM');

    // Arm only on pick hit.
    if (!pick || !pick.inside || pick.idx == null || pick.idx < 0) {
      _ilog(`ARM: gsId= ok=n key= well=-1 reason=pick_miss`);
      _setLast('lastArm', `ok=n key=${endKey} well=-1 reason=pick_miss`);
      _setLast('lastTouchstartStatus','EXIT');
      _ilog('TOUCHSTART_EXIT');
      return;
    }

    const key = 't:' + touchId;
    let armed = false;
    try {
      if (EC.INPUT && typeof EC.INPUT.armGestureFromPick === 'function') {
        armed = !!EC.INPUT.armGestureFromPick({ kind:'touch', key, idx: pick.idx, clientX, clientY, t0: nowMs, touchId: touchId });
      }
      // Use detailed reason from EC.INPUT._lastArm if available.
      const lastArm = (EC.INPUT && EC.INPUT._lastArm) ? EC.INPUT._lastArm : null;
      const reason = armed ? 'ok' : ((lastArm && lastArm.reason) ? lastArm.reason : 'unknown_false');
      const storedKey = lastArm && lastArm.storedKey ? lastArm.storedKey : '?';
      const incomingKey = lastArm && lastArm.incomingKey ? lastArm.incomingKey : key;
      const storedWell = (lastArm && lastArm.storedWell != null) ? lastArm.storedWell : '?';
      const incomingWell = (lastArm && lastArm.incomingWell != null) ? lastArm.incomingWell : String(pick.idx);
      _ilog(`ARM: gsId=${(EC.INPUT&&EC.INPUT.gestureState&&EC.INPUT.gestureState._id)||'?'} ok=${armed?'y':'n'} key=${key} well=${pick.idx} reason=${reason} active=${lastArm?lastArm.active:0} storedKey=${storedKey} incomingKey=${incomingKey} storedWell=${storedWell} incomingWell=${incomingWell}`);
      _setLast('lastArm', `ok=${armed?'y':'n'} key=${key} well=${pick.idx} reason=${reason}`);
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      _ilog('ARM_ERR: ' + msg);
      _ilog(`ARM: gsId=${(EC.INPUT&&EC.INPUT.gestureState&&EC.INPUT.gestureState._id)||'?'} ok=n key=${key} well=${pick.idx} reason=arm_throw`);
      _setLast('lastArm', `ok=n key=${key} well=${pick.idx} reason=arm_throw`);
    }

    _setLast('lastTouchstartStatus','EXIT');
    _ilog('TOUCHSTART_EXIT');
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    _setLast('lastTouchstartStatus','THROW');
    _ilog('TOUCHSTART_THROW: ' + msg);
  }
}, opts);
  view.addEventListener('touchmove', (e) => {
  _domArmHookLog(e, 'canvas');
  _recordDomTouch(e,'tm');
}, opts);
  view.addEventListener('touchend', (e) => {
  _domArmHookLog(e, 'canvas');
  _recordDomTouch(e,'te');

  const D = _idbg();
  const touchesN = (e && e.touches) ? e.touches.length : 0;
  const changedN = (e && e.changedTouches) ? e.changedTouches.length : 0;
  const ch = (e && e.changedTouches && e.changedTouches.length) ? e.changedTouches[0] : null;
  const endId = (ch && ch.identifier != null) ? ch.identifier : -1;
  const endKey = (endId >= 0) ? ('t:' + endId) : 't:?';

  try {
    if (D) D.lastTouchend = `type=touchend touches=${touchesN} changed=${changedN} endKey=${endKey}`;
  } catch (_) {}

  _ilog(`TOUCHEND_ENTER type=touchend touches=${touchesN} changed=${changedN} endKey=${endKey}`);

  // Resolve attempt logging (even if no gesture)
  try {
    const st = (EC.INPUT && EC.INPUT.gestureState) ? EC.INPUT.gestureState : null;
    const storedActive = !!(st && st.active);
    const storedKey = st && st.key ? st.key : '?';
    const match = storedActive && (storedKey === endKey);
    let reason = 'ok';
    if (!storedActive) reason = 'no_gesture';
    else if (!match) reason = 'key_mismatch';
    _ilog(`RESOLVE_ATTEMPT: gsId=${(EC.INPUT&&EC.INPUT.gestureState&&EC.INPUT.gestureState._id)||'?'} storedActive=${storedActive?1:0} storedKey=${storedKey} endKey=${endKey} match=${match?'y':'n'} reason=${reason}`);
  } catch (_) {}

  // Call canonical resolver (fail-safe) for DOM touchend
  let __resolveStatus = 'unrun';
  try {
    const st0 = (EC.INPUT && EC.INPUT.gestureState) ? EC.INPUT.gestureState : null;
    const hasFn = !!(EC.INPUT && typeof EC.INPUT.resolveDomTouchEnd === 'function');
    const storedActive0 = !!(st0 && st0.active);
    const storedKey0 = (st0 && st0.key) ? st0.key : '?';
    _ilog(`RESOLVE_CALL: hasFn=${hasFn?'Y':'N'} fn=EC.INPUT.resolveDomTouchEnd gsId=${(st0&&st0._id)||'?'} storedActive=${storedActive0?1:0} storedKey=${storedKey0} endKey=${endKey} why=touchend`);
    if (hasFn) {
      const rv = EC.INPUT.resolveDomTouchEnd(e, 'touchend');
      __resolveStatus = (rv && rv.status) ? rv.status : (((EC.UI_STATE&&EC.UI_STATE.inputDbg)&&EC.UI_STATE.inputDbg.lastResolveStatus) ? EC.UI_STATE.inputDbg.lastResolveStatus : 'ok');
    } else {
      // Function missing: clear defensively if anything is active
      if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') {
        EC.INPUT.clearGesture('resolved_fn_missing', { why: 'touchend', endKey });
      } else if (st0) {
        try { st0.active = 0; st0.key = ''; st0.kind = ''; st0.well = -1; } catch (_) {}
      }
      __resolveStatus = 'resolved_fn_missing';
    }
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    _ilog('RESOLVE_ERR: ' + msg);
    try { if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('resolved_exception', { why: 'touchend', msg }); } catch (_) {}
    __resolveStatus = 'resolved_exception';
  }

  try {
    const dbg = (EC.UI_STATE && EC.UI_STATE.inputDbg) || null;
    if (dbg) {
      let activeAfter = !!(EC.INPUT && EC.INPUT.gestureState && EC.INPUT.gestureState.active);
      if (activeAfter && storedActive) {
        try {
          if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('post_resolve_force_clear', { why: 'touchend' });
        } catch (_) {}
        activeAfter = !!(EC.INPUT && EC.INPUT.gestureState && EC.INPUT.gestureState.active);
      }
      const resolveLineSet = dbg.resolveLine ? 'Y' : 'N';
      if (!dbg.resolveLine) {
        dbg.resolveLine = 'hasGesture=0 reason=resolve_missing';
      }
      dbg.lastResolve = dbg.resolveLine;
      // Prefer resolver status if it set one
      if (!dbg.lastResolveStatus) dbg.lastResolveStatus = __resolveStatus;
      _ilog(`RESOLVE_RETURN: status=${dbg.lastResolveStatus||__resolveStatus} activeAfter=${activeAfter?1:0} resolveLineSet=${resolveLineSet}`);
      _ilog('RESOLVE: ' + dbg.resolveLine);
    }
  } catch (_) {}
}, opts);
  view.addEventListener('touchcancel', (e) => {
  _domArmHookLog(e, 'canvas');
  _recordDomTouch(e,'tc');

  const D = _idbg();
  const touchesN = (e && e.touches) ? e.touches.length : 0;
  const changedN = (e && e.changedTouches) ? e.changedTouches.length : 0;
  const ch = (e && e.changedTouches && e.changedTouches.length) ? e.changedTouches[0] : null;
  const endId = (ch && ch.identifier != null) ? ch.identifier : -1;
  const endKey = (endId >= 0) ? ('t:' + endId) : 't:?';

  try {
    if (D) D.lastTouchend = `type=touchcancel touches=${touchesN} changed=${changedN} endKey=${endKey}`;
  } catch (_) {}

  _ilog(`TOUCHEND_ENTER type=touchcancel touches=${touchesN} changed=${changedN} endKey=${endKey}`);

  // Resolve attempt logging (even if no gesture)
  try {
    const st = (EC.INPUT && EC.INPUT.gestureState) ? EC.INPUT.gestureState : null;
    const storedActive = !!(st && st.active);
    const storedKey = st && st.key ? st.key : '?';
    const match = storedActive && (storedKey === endKey);
    let reason = 'ok';
    if (!storedActive) reason = 'no_gesture';
    else if (!match) reason = 'key_mismatch';
    _ilog(`RESOLVE_ATTEMPT: gsId=${(EC.INPUT&&EC.INPUT.gestureState&&EC.INPUT.gestureState._id)||'?'} storedActive=${storedActive?1:0} storedKey=${storedKey} endKey=${endKey} match=${match?'y':'n'} reason=${reason}`);
  } catch (_) {}

  // Call canonical resolver (fail-safe) for DOM touchcancel
  let __resolveStatus = 'unrun';
  try {
    const st0 = (EC.INPUT && EC.INPUT.gestureState) ? EC.INPUT.gestureState : null;
    const hasFn = !!(EC.INPUT && typeof EC.INPUT.resolveDomTouchEnd === 'function');
    const storedActive0 = !!(st0 && st0.active);
    const storedKey0 = (st0 && st0.key) ? st0.key : '?';
    _ilog(`RESOLVE_CALL: hasFn=${hasFn?'Y':'N'} fn=EC.INPUT.resolveDomTouchEnd gsId=${(st0&&st0._id)||'?'} storedActive=${storedActive0?1:0} storedKey=${storedKey0} endKey=${endKey} why=touchcancel`);
    if (hasFn) {
      const rv = EC.INPUT.resolveDomTouchEnd(e, 'touchcancel');
      __resolveStatus = (rv && rv.status) ? rv.status : (((EC.UI_STATE&&EC.UI_STATE.inputDbg)&&EC.UI_STATE.inputDbg.lastResolveStatus) ? EC.UI_STATE.inputDbg.lastResolveStatus : 'ok');
    } else {
      // Function missing: clear defensively if anything is active
      if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') {
        EC.INPUT.clearGesture('resolved_fn_missing', { why: 'touchcancel', endKey });
      } else if (st0) {
        try { st0.active = 0; st0.key = ''; st0.kind = ''; st0.well = -1; } catch (_) {}
      }
      __resolveStatus = 'resolved_fn_missing';
    }
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    _ilog('RESOLVE_ERR: ' + msg);
    try { if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('resolved_exception', { why: 'touchcancel', msg }); } catch (_) {}
    __resolveStatus = 'resolved_exception';
  }

  try {
    const dbg = (EC.UI_STATE && EC.UI_STATE.inputDbg) || null;
    if (dbg) {
      let activeAfter = !!(EC.INPUT && EC.INPUT.gestureState && EC.INPUT.gestureState.active);
      if (activeAfter && storedActive) {
        try {
          if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('post_resolve_force_clear', { why: 'touchcancel' });
        } catch (_) {}
        activeAfter = !!(EC.INPUT && EC.INPUT.gestureState && EC.INPUT.gestureState.active);
      }
      const resolveLineSet = dbg.resolveLine ? 'Y' : 'N';
      if (!dbg.resolveLine) {
        dbg.resolveLine = 'hasGesture=0 reason=resolve_missing';
      }
      dbg.lastResolve = dbg.resolveLine;
      // Prefer resolver status if it set one
      if (!dbg.lastResolveStatus) dbg.lastResolveStatus = __resolveStatus;
      _ilog(`RESOLVE_RETURN: status=${dbg.lastResolveStatus||__resolveStatus} activeAfter=${activeAfter?1:0} resolveLineSet=${resolveLineSet}`);
      _ilog('RESOLVE: ' + dbg.resolveLine);
    }
  } catch (_) {}
}, opts);

  // Pointer events on the canvas element (raw DOM instrumentation)
  view.addEventListener('pointerdown', (e) => {
    // Mobile autoplay restrictions: unlock audio inside a real user gesture.
    try { if (EC.SFX && typeof EC.SFX.unlock === 'function') EC.SFX.unlock(); } catch (_) {}
    _recordDomPointer(e,'pd');
    let armed = false;
    try { e.preventDefault(); } catch (_) {}
    // Arm gesture at DOM level (manual picker). Desktop remains pointer-keyed.
    try {
      if (EC.RENDER && typeof EC.RENDER._armGestureFromDomPointerDown === 'function') {
        armed = EC.RENDER._armGestureFromDomPointerDown(e, app);
        _ilog('DOM pointerdown arm=' + (armed ? 'Y' : 'n'));
      }
    } catch (_) {}

    // Pointer capture (best-effort) so we get pointerup even if finger leaves canvas
    try {
      if (armed && view.setPointerCapture && e.pointerId != null) {
        view.setPointerCapture(e.pointerId);
        _ilog('DOM setPointerCapture pid=' + e.pointerId + ' ok=Y');
      }
    } catch (_) { try { _ilog('DOM setPointerCapture ok=n'); } catch(__){} }
  }, opts);
  view.addEventListener('pointermove', (e) => { _recordDomPointer(e,'pm'); try { e.preventDefault(); } catch (_) {} }, opts);

  view.addEventListener('pointerup', (e) => {
    _recordDomPointer(e,'pu');
    try { e.preventDefault(); } catch (_) {}
    try {
      if (EC.RENDER && EC.RENDER._gesture && EC.RENDER._gesture.active && typeof EC.RENDER._resolveGestureFromDom === 'function') {
        EC.RENDER._resolveGestureFromDom(e, 'end');
      }
      try { if (view.releasePointerCapture && e.pointerId != null) view.releasePointerCapture(e.pointerId); } catch (_) {}
    } catch (_) {}
  }, opts);

  view.addEventListener('pointercancel', (e) => {
    _recordDomPointer(e,'pc');
    try { e.preventDefault(); } catch (_) {}
    try {
      if (EC.RENDER && EC.RENDER._gesture && EC.RENDER._gesture.active && typeof EC.RENDER._resolveGestureFromDom === 'function') {
        EC.RENDER._resolveGestureFromDom(e, 'cancel');
      }
      try { if (view.releasePointerCapture && e.pointerId != null) view.releasePointerCapture(e.pointerId); } catch (_) {}
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
    // NOTE: Stage fallback should only resolve pointer-based gestures.
    // Touch gestures are resolved via DOM touchend/touchcancel.
    const st = (EC.INPUT && EC.INPUT.gestureState) ? EC.INPUT.gestureState : (EC.RENDER && EC.RENDER._gesture);
    if (!st || !st.active) return;
    if (st.kind && st.kind !== 'pointer') return;

    const pid = _pidFromEv(ev);
    if (st.pid != null && st.pid >= 0 && pid != null && pid >= 0 && pid !== st.pid) return;

    const getXY = EC.RENDER && EC.RENDER._getClientXY;
    const setDbg = EC.RENDER && EC.RENDER._setGestureDebug;
    const xy = (getXY ? getXY(ev) : null);
    if (!xy) return;
    const x = xy.x, y = xy.y, oe = xy.oe;
    try { if (oe && typeof oe.preventDefault === 'function') oe.preventDefault(); } catch (_) {}

    const t1 = (performance && performance.now) ? performance.now() : Date.now();
    const dt = t1 - (st.t0 || t1);
    const dx = x - (st.x0 || x);
    const dy = y - (st.y0 || y);

    const THRESH_MS = 400;
    const THRESH_PX = 18;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dist = Math.max(adx, ady);
    const isFlick = (dt <= THRESH_MS) && (dist >= THRESH_PX);

    // Determine target well index
    let iWell = -1;
    if (typeof st.well === 'number') iWell = st.well;
    else if (typeof st.wellId !== 'undefined') iWell = _wellIndexById(st.wellId);

    // Clear gesture deterministically (canonical state)
    try {
      if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('stage_resolve', { outside: !!isOutside, dt: Math.round(dt) });
      else { st.active = 0; st.key = ''; }
    } catch (_) {}

    if (!isFlick) {
      try { if (iWell >= 0 && EC.SIM) EC.SIM.selectedWellIndex = iWell; } catch (_) {}
      if (setDbg) setDbg(`SWIPE: up(stage) dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => TAP`);
      return;
    }

    let dA = 0, dS = 0;
    let dirTxt = '';
    if (adx > ady) { dS = (dx > 0) ? +5 : -5; dirTxt = (dS > 0) ? 'RIGHT (S+5)' : 'LEFT (S-5)'; }
    else { dA = (dy < 0) ? +5 : -5; dirTxt = (dA > 0) ? 'UP (A+5)' : 'DOWN (A-5)'; }

    const fn = EC.UI_CONTROLS && typeof EC.UI_CONTROLS.flickStep === 'function' ? EC.UI_CONTROLS.flickStep : null;
    const toast = EC.UI_CONTROLS && typeof EC.UI_CONTROLS.toast === 'function' ? EC.UI_CONTROLS.toast : null;
    const SIM = EC.SIM;

    if (!fn || iWell < 0) {
      if (toast) toast('Select a Well first.');
      if (setDbg) setDbg(`SWIPE: up(stage) dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => FLICK (no index)`);
      return;
    }

    try { SIM.selectedWellIndex = iWell; } catch (_) {}

    let res = null;
    try { res = fn(iWell, dA, dS) || { ok: false, reason: 'unknown' }; } catch (e) { res = { ok: false, reason: 'exception' }; }

    if (!res.ok) {
      if (res.reason === 'noenergy') {
        if (toast) toast('Not enough Energy.');
        try {
          if (EC.SFX && typeof EC.SFX.error === 'function') EC.SFX.error();
          else if (EC.SFX && typeof EC.SFX.play === 'function') EC.SFX.play('bong_001');
        } catch (_) {}
      }
      // keep silent for other failure reasons
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
  app.stage.on('pointercancel', (ev) => {
  _stageDbg(ev,'pointercancel');
  const st = (EC.INPUT && EC.INPUT.gestureState) ? EC.INPUT.gestureState : (EC.RENDER && EC.RENDER._gesture);
  if (!st || !st.active) return;
  if (st.kind && st.kind !== 'pointer') return;
  const pid = _pidFromEv(ev);
  if (st.pid != null && st.pid >= 0 && pid != null && pid >= 0 && pid !== st.pid) return;
  try {
    if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('stage_cancel', { pid });
    else { st.active = 0; st.key = ''; }
  } catch (_) {}
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

  // SFX init (safe no-op until unlocked by user gesture)
  try { if (EC.SFX && typeof EC.SFX.init === 'function') EC.SFX.init(); } catch (_) {}

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
