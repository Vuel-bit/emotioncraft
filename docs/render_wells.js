// Emotioncraft render_wells.js — extracted Pixi view + animation helpers (Step 3)
(() => {
  const EC = (window.EC = window.EC || {});
  const TUNING = EC.TUNING;

  const { Container, Graphics, Text } = PIXI;

  // Pull commonly used helpers from the shared namespace
  const clamp = EC.clamp;
  const lerp = EC.lerp;
  const totalAmount = EC.totalAmount;
  const traumaDensity = EC.traumaDensity;
  const netSwirl = EC.netSwirl;
  const computeLaneForDisplay = EC.computeLaneForDisplay;
  const aspectZoneFromSwirl = EC.aspectZoneFromSwirl;
  const aspectIcon = EC.aspectIcon;
  const LANE_ASPECTS = EC.LANE_ASPECTS;

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
  const wellViews = (EC.RENDER.wellViews = EC.RENDER.wellViews || new Map());

  // ------------------------------------------------------------
  // Shared gesture helpers (used by per-well handlers + stage fallback)
  // ------------------------------------------------------------
  // Always-visible on-screen swipe debug line. (Can be gated later.)
  if (!EC.RENDER._setGestureDebug) {
    EC.RENDER._setGestureDebug = function _setGestureDebug(s) {
      EC.UI_STATE = EC.UI_STATE || {};
      EC.UI_STATE.gestureDebug = s;
      if (EC.DEBUG) {
        try { console.log(s); } catch (_) {}
      }
    };
  }

  // Robust extraction of clientX/clientY across PointerEvent / TouchEvent shims.
  if (!EC.RENDER._getClientXY) {
    EC.RENDER._getClientXY = function _getClientXY(ev) {
      const oe = (ev && ev.data && ev.data.originalEvent) ? ev.data.originalEvent : (ev && ev.nativeEvent ? ev.nativeEvent : null);

      // PointerEvent path
      if (oe && oe.clientX != null && oe.clientY != null) {
        return { x: oe.clientX, y: oe.clientY, oe };
      }

      // TouchEvent path (mobile Safari commonly)
      const t = (oe && oe.changedTouches && oe.changedTouches.length) ? oe.changedTouches[0]
              : (oe && oe.touches && oe.touches.length) ? oe.touches[0]
              : null;
      if (t && t.clientX != null && t.clientY != null) {
        return { x: t.clientX, y: t.clientY, oe };
      }

      // Fallback: Pixi global coords (stage/world coords; less ideal for gesture deltas)
      const x = (ev && ev.global ? ev.global.x : 0);
      const y = (ev && ev.global ? ev.global.y : 0);
      return { x, y, oe };
    };
  }
  function mixWellColor(w) {
    const rAmt = w.comp.red, bAmt = w.comp.blue, yAmt = w.comp.yellow;
    const sum = rAmt + bAmt + yAmt;

    // Empty / near-empty fallback
    if (sum <= 0.001) return { r: 90, g: 92, b: 110 };

    // Canonical single-hue colors (match the well look for pure wells).
    // (Blends are handled by an RYB-style pigment mix so Blue+Yellow reads as Green.)
    const CAN_R = { r: 255, g: 70,  b: 80  };
    const CAN_B = { r: 90,  g: 150, b: 255 };
    const CAN_Y = { r: 255, g: 220, b: 85  };

    const eps = 1e-6;
    const hasR = rAmt > eps;
    const hasB = bAmt > eps;
    const hasY = yAmt > eps;

    // If it's effectively a single-hue well, return the canonical hue color.
    if (hasR && !hasB && !hasY) return CAN_R;
    if (hasB && !hasR && !hasY) return CAN_B;
    if (hasY && !hasR && !hasB) return CAN_Y;

    // --- RYB pigment-style mixing ---
    // This is intentionally NOT additive RGB averaging; it produces expected artist blends:
    // Red+Blue -> Purple, Blue+Yellow -> Green, Red+Yellow -> Orange.
    let wr = rAmt / sum;
    let wb = bAmt / sum;
    let wy = yAmt / sum;

    function rybToRgb(r, y, b) {
      // Common RYB->RGB approximation (good enough for vivid blends).
      // Returns values in [0,1].
      let w = Math.min(r, y, b);
      r -= w; y -= w; b -= w;

      const my = Math.max(r, y, b);

      // green from yellow + blue
      let g = Math.min(y, b);
      y -= g; b -= g;

      // If blue & green are both present, amplify them.
      if (b > 0 && g > 0) {
        b *= 2.0;
        g *= 2.0;
      }

      // redistribute remaining yellow
      r += y;
      g += y;

      // normalize
      const mg = Math.max(r, g, b);
      if (mg > 0) {
        const n = my / mg;
        r *= n; g *= n; b *= n;
      }

      // add white back
      r += w; g += w; b += w;
      return { r, g, b };
    }

    function brighten01(x, floor, gamma) {
      // Lift dark blends so they still read clearly over the dark background.
      x = clamp(x, 0, 1);
      return floor + (1 - floor) * Math.pow(x, gamma);
    }

    const base = rybToRgb(wr, wy, wb);
    const floor = 0.18;
    const gamma = 0.75;

    return {
      r: Math.round(brighten01(base.r, floor, gamma) * 255),
      g: Math.round(brighten01(base.g, floor, gamma) * 255),
      b: Math.round(brighten01(base.b, floor, gamma) * 255),
    };
  }

  function rgbToHex({ r, g, b }) {
    return (r << 16) + (g << 8) + b;
  }
  function computeWellRadius(w) {
    // Amount excludes trauma (totalAmount already does); max useful hue total is 2 components.
    const amt = totalAmount(w);
    const maxTotal = 2 * TUNING.maxComponent;
    const t = clamp(amt / maxTotal, 0, 1);

    const minR = (EC.SIM.wellSize && EC.SIM.wellSize.minR) ? EC.SIM.wellSize.minR : TUNING.wellSize.minR;
    const maxR = (EC.SIM.wellSize && EC.SIM.wellSize.maxR) ? EC.SIM.wellSize.maxR : TUNING.wellSize.maxR;

    // area proportional: r^2 lerp
    const r2 = (minR * minR) + (maxR * maxR - minR * minR) * t;
    const r = Math.sqrt(r2);

    return clamp(r, minR, maxR);
  }

  function ensureWellView(w) {
    if (wellViews.has(w.id)) return wellViews.get(w.id);

    const c = new Container();

    const fill = new Graphics();
    c.addChild(fill);

    const ring = new Graphics();
    c.addChild(ring);

    const fxLayer = new Container();
    c.addChild(fxLayer);

    // Break visuals: a soft fill flash + ring pulse + label. This makes the event
    // unmissable during playtests (requested in 0.1.8 feedback).
    const breakFillG = new Graphics();
    fxLayer.addChild(breakFillG);

    const breakFlashG = new Graphics();
    fxLayer.addChild(breakFlashG);

    const breakText = new Text('BREAK', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: 16,
      fill: 0xfff2b5,
      align: 'center',
    });
    breakText.anchor.set(0.5);
    breakText.alpha = 0;
    fxLayer.addChild(breakText);

    const aspectFlashG = new Graphics();
    fxLayer.addChild(aspectFlashG);

    const swirlContainer = new Container();
    c.addChild(swirlContainer);

    const swirlG = new Graphics();
    swirlContainer.addChild(swirlG);

    const swirlText = new Text('', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: 12,
      fill: 0xe8eefc,
      align: 'center',
    });
    swirlText.anchor.set(0.5);
    swirlText.position.set(0, 0);
    swirlContainer.addChild(swirlText);

    const traumaLayer = new Container();
    c.addChild(traumaLayer);


    const tagContainer = new Container();
    c.addChild(tagContainer);

    const tagBg = new Graphics();
    tagContainer.addChild(tagBg);

    const tagText = new Text('', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: 13,
      fill: 0xe8eefc,
      align: 'center',
    });
    tagText.anchor.set(0.5);
    tagContainer.addChild(tagText);

    const label = new Text(w.name, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: 14,
      fill: 0xe8eefc,
      align: 'center',
    });
    label.anchor.set(0.5);
    EC.RENDER.labelLayer.addChild(label);

    c.eventMode = 'static';
    c.cursor = 'pointer';
    // Hit area is updated in updateWellView to match current radius; this is a safe default.
    c.hitArea = new PIXI.Circle(0, 0, 140);
    view.hitR = 140;

    // ------------------------------------------------------------
    // Mobile-first flick swipe controls (discrete ±5 steps)
    // Authoritative: PIXI interaction events on the well object.
    // Down/Up-only: do NOT depend on pointermove.
    // ------------------------------------------------------------

    const _setGestureDebug = EC.RENDER._setGestureDebug;
    const _getClientXY = EC.RENDER._getClientXY;

    // Per-pointer gesture state.
    c.on('pointerdown', (ev) => {
      const { x, y, oe } = _getClientXY(ev);
// Input instrumentation
try {
  EC.UI_STATE = EC.UI_STATE || {};
  const D = EC.UI_STATE.inputDbg;
  if (D) {
    D.pixiWell = D.pixiWell || { pd:0, pm:0, pu:0, po:0, pc:0 };
    D.pixiWell.pd = (D.pixiWell.pd||0) + 1;
    const pid0 = (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);
    D.lastWell = { wellIndex: _wellIndexById(w.id), type: 'pointerdown', pid: pid0 };
    if (Array.isArray(D.log)) D.log.push(((performance && performance.now)?Math.floor(performance.now()):Date.now()) + ' PIXI WELL down w=' + D.lastWell.wellIndex + ' pid=' + pid0);
    if (D.log && D.log.length > 120) D.log.splice(0, D.log.length - 120);
  }
} catch (_) {}

      // Prevent browser scroll/back gestures only when the gesture begins on a well.
      try { if (oe && typeof oe.preventDefault === 'function') oe.preventDefault(); } catch (_) {}
      try { if (oe && typeof oe.stopPropagation === 'function') oe.stopPropagation(); } catch (_) {}

      const pid = (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);
      const t0 = (performance && performance.now) ? performance.now() : Date.now();

      EC.RENDER = EC.RENDER || {};
      // Determine gesture key: touch uses Touch.identifier; pointer uses pointerId.
let gKind = 'pointer';
let gTouchId = null;
let gKey = 'p:' + pid;
try {
  const oe2 = oe;
  const t0ch = (oe2 && oe2.changedTouches && oe2.changedTouches.length) ? oe2.changedTouches[0]
            : (oe2 && oe2.touches && oe2.touches.length) ? oe2.touches[0]
            : null;
  if (t0ch && t0ch.identifier != null) {
    gKind = 'touch';
    gTouchId = t0ch.identifier;
    gKey = 't:' + gTouchId;
  }
} catch (_) {}

EC.RENDER._gesture = {
        active: true,
        kind: gKind,      // 'pointer' | 'touch'
        key: gKey,        // 'p:<pid>' | 't:<touchId>'
        touchId: gTouchId,
        wellId: w.id,
        pid,
        t0,
        x0: x,
        y0: y,
      };

// Update always-visible gesture line in debug overlay
try {
  const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
  if (D) {
    const wi = _wellIndexById(w.id);
    D.gestureLine = `active=1 key=${gKey} well=${wi} x0/y0=${Math.round(x)}/${Math.round(y)} t0=${Math.floor(t0)}`;
  }
} catch (_) {}

      // Pointer capture: improves reliability when finger drifts.
// Prefer capturing on the canvas element when available.
let _cap = 'n/a';
try {
  const view = EC.RENDER && EC.RENDER.app && EC.RENDER.app.view;
  if (view && typeof view.setPointerCapture === 'function' && pid != null && pid >= 0) {
    view.setPointerCapture(pid);
    _cap = 'OK(view)';
  } else if (oe && oe.target && typeof oe.target.setPointerCapture === 'function' && pid != null && pid >= 0) {
    oe.target.setPointerCapture(pid);
    _cap = 'OK(target)';
  } else {
    _cap = 'noapi';
  }
} catch (e) {
  _cap = 'err';
}
try {
  const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
  if (D) {
    D.lastDomPointer = D.lastDomPointer || {};
    D.lastDomPointer.capture = _cap;
    if (Array.isArray(D.log)) D.log.push(((performance && performance.now)?Math.floor(performance.now()):Date.now()) + ' CAPTURE ' + _cap + ' pid=' + pid);
    if (D.log && D.log.length > 120) D.log.splice(0, D.log.length - 120);
  }
} catch (_) {}


      _setGestureDebug(`SWIPE: down pid=${pid}`);
    });

    function _wellIndexById(wellId) {
      const SIM = EC.SIM;
      if (!SIM || !Array.isArray(SIM.wells)) return -1;
      for (let k = 0; k < SIM.wells.length; k++) {
        if (SIM.wells[k] && SIM.wells[k].id === wellId) return k;
      }
      return -1;
    }

    function _resolveGesture(ev, isOutside) {
      const st = EC.RENDER && EC.RENDER._gesture;
      if (!st || !st.active) return;

      // Keyed resolution: do not cross-resolve touch vs pointer.
      const pid = (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);

      // Prefer to read from originalEvent so we can detect Touch.identifier.
      const oe0 = (ev && ev.data && ev.data.originalEvent) ? ev.data.originalEvent : (ev && ev.nativeEvent ? ev.nativeEvent : null);

      // Determine event kind + key
      let evKind = 'pointer';
      let evKey = 'p:' + pid;
      let touchObj = null;
      try {
        if (oe0 && (oe0.changedTouches || oe0.touches)) {
          evKind = 'touch';
          const list = (oe0.changedTouches && oe0.changedTouches.length) ? oe0.changedTouches : (oe0.touches || []);
          const wantId = (st && st.kind === 'touch') ? st.touchId : null;
          if (wantId != null) {
            for (let k=0;k<list.length;k++) { if (list[k] && list[k].identifier === wantId) { touchObj = list[k]; break; } }
          }
          if (!touchObj && list && list.length) touchObj = list[0];
          if (touchObj && touchObj.identifier != null) evKey = 't:' + touchObj.identifier;
        }
      } catch (_) {}

      // Enforce same kind + key
      if (st.kind === 'pointer') {
        if (evKind !== 'pointer') return;
        if (st.pid != null && st.pid >= 0 && pid != null && pid >= 0 && pid !== st.pid) return;
        if (st.key && evKey && st.key !== evKey) return;
      } else if (st.kind === 'touch') {
        if (evKind !== 'touch') return;
        if (st.key && evKey && st.key !== evKey) return;
      }

      // Coordinates
      let x, y, oe;
      if (evKind === 'touch' && touchObj && touchObj.clientX != null && touchObj.clientY != null) {
        x = touchObj.clientX; y = touchObj.clientY; oe = oe0;
      } else {
        const xy = _getClientXY(ev);
        x = xy.x; y = xy.y; oe = xy.oe;
      }
      try { if (oe && typeof oe.preventDefault === 'function') oe.preventDefault(); } catch (_) {}

      const t1 = (performance && performance.now) ? performance.now() : Date.now();
      const dt = t1 - (st.t0 || t1);
      const dx = x - st.x0;
      const dy = y - st.y0;

      // Update resolve line baseline (will be refined below)
      try {
        const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
        if (D) {
          const wi = _wellIndexById(st.wellId);
          D.resolveLine = `hasGesture=1 key=${st.key||'?'} well=${wi} dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} class=? dir=? applied=? reason=?`;
        }
      } catch (_) {}

      // Clear active gesture
      EC.RENDER._gesture = null;

      const THRESH_MS = 400;
      const THRESH_PX = 18;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      const dist = Math.max(adx, ady);
      const isFlick = (dt <= THRESH_MS) && (dist >= THRESH_PX);

      if (!isFlick) {
        EC.onWellTap(st.wellId);
        try {
          const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
          if (D) D.resolveLine = `hasGesture=1 key=${st.key||'?'} well=${_wellIndexById(st.wellId)} dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} class=TAP dir=NONE applied=ok reason=`;
        } catch (_) {}
        _setGestureDebug(`SWIPE: dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => TAP`);
        return;
      }

      let dA = 0, dS = 0;
      if (adx > ady) {
        dS = (dx > 0) ? +5 : -5;
      } else {
        dA = (dy < 0) ? +5 : -5;
      }

      // Keep selection in sync
      EC.onWellTap(st.wellId);

      const SIM = EC.SIM;
      const i = _wellIndexById(st.wellId);
      const fn = EC.UI_CONTROLS && typeof EC.UI_CONTROLS.flickStep === 'function' ? EC.UI_CONTROLS.flickStep : null;
      const toast = EC.UI_CONTROLS && typeof EC.UI_CONTROLS.toast === 'function' ? EC.UI_CONTROLS.toast : null;
      if (!fn || i < 0) {
        if (toast) toast('Select a Well first.');
        try {
          const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
          if (D) D.resolveLine = `hasGesture=1 key=${st.key||'?'} kind=${st.kind||'?'} well=${_wellIndexById(st.wellId)} dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} class=FLICK dir=${(dS!==0?(dS>0?'RIGHT':'LEFT'):(dA>0?'UP':'DOWN'))} applied=fail reason=noindex`;
        } catch (_) {}
        _setGestureDebug(`SWIPE: dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => FLICK (no index)`);
        return;
      }
      try { SIM.selectedWellIndex = i; } catch (_) {}

      const res = fn(i, dA, dS) || { ok: false, reason: 'unknown' };
      const dirTxt = (dS !== 0) ? (dS > 0 ? 'RIGHT (S+5)' : 'LEFT (S-5)') : (dA > 0 ? 'UP (A+5)' : 'DOWN (A-5)');
      if (!res.ok) {
        if (res.reason === 'noenergy') {
          if (toast) toast('Not enough Energy.');
        }
        if (EC.SFX && typeof EC.SFX.error === 'function') EC.SFX.error();
        try {
          const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
          if (D) D.resolveLine = `hasGesture=1 key=${st.key||'?'} kind=${st.kind||'?'} well=${_wellIndexById(st.wellId)} dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} class=FLICK dir=${dirTxt} applied=FAIL(reason=${res.reason||'fail'})`;
        } catch (_) {}
        _setGestureDebug(`SWIPE: dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => ${dirTxt} ❌`);
        return;
      }

      if (EC.SFX && typeof EC.SFX.tick === 'function') EC.SFX.tick();
      try {
        const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
        if (D) D.resolveLine = `hasGesture=1 key=${st.key||'?'} kind=${st.kind||'?'} well=${_wellIndexById(st.wellId)} dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} class=FLICK dir=${dirTxt} applied=OK`;
      } catch (_) {}
      _setGestureDebug(`SWIPE: dt=${dt.toFixed(0)} dx=${dx.toFixed(0)} dy=${dy.toFixed(0)} => ${dirTxt} APPLIED ✅${isOutside ? ' (upoutside)' : ''}`);
    }


// Instrumentation only (no gameplay logic) — track pointermove delivery on well objects.
c.on('pointermove', (ev) => {
  try {
    const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
    if (D) {
      D.pixiWell = D.pixiWell || { pd:0, pm:0, pu:0, po:0, pc:0 };
      D.pixiWell.pm = (D.pixiWell.pm||0) + 1;
      const pid = (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);
      D.lastWell = { wellIndex: _wellIndexById(w.id), type: 'pointermove', pid };
    }
  } catch (_) {}
});

// 
// ------------------------------------------------------------
// DOM touchstart arming (keys off Touch.identifier)
// ------------------------------------------------------------
// Called from main.js DOM listeners. Arms a gesture only if touchstart began on a well.
EC.RENDER._armGestureFromDomTouchStart = function(domTouchEvent, app) {
  try {
    const oe = domTouchEvent;
    if (!oe) return false;
    // Do not override an active gesture.
    const cur = EC.RENDER && EC.RENDER._gesture;
    if (cur && cur.active) return false;

    const ch = (oe.changedTouches && oe.changedTouches.length) ? oe.changedTouches[0] : null;
    const t = ch || (oe.touches && oe.touches.length ? oe.touches[0] : null);
    if (!t || t.identifier == null) return false;

    const clientX = t.clientX, clientY = t.clientY;
    const touchId = t.identifier;
    const key = 't:' + touchId;
    const t0 = (performance && performance.now) ? performance.now() : Date.now();

    const appRef = app || (EC.RENDER && EC.RENDER.app);
    if (!appRef || !appRef.view || !appRef.renderer) return false;

    // Map client coords -> Pixi screen/global coords
    const rect = appRef.view.getBoundingClientRect();
    const rx = (clientX - rect.left) * (appRef.renderer.width / Math.max(1, rect.width));
    const ry = (clientY - rect.top) * (appRef.renderer.height / Math.max(1, rect.height));

    // Find a well under this point by distance to its global position.
    const views = (EC.RENDER && EC.RENDER.wellViews) ? EC.RENDER.wellViews : null;
    if (!views) return false;

    let bestId = null;
    let bestD = 1e9;

    views.forEach((v, id) => {
      if (!v || !v.c) return;
      const gp = v.c.getGlobalPosition ? v.c.getGlobalPosition() : null;
      if (!gp) return;
      const dx = rx - gp.x;
      const dy = ry - gp.y;
      const d2 = dx*dx + dy*dy;
      const r = (v.hitR != null) ? v.hitR : ((v.c.hitArea && v.c.hitArea.radius) ? v.c.hitArea.radius : 140);
      if (d2 <= (r*r) && d2 < bestD) { bestD = d2; bestId = id; }
    });

    if (!bestId) return false;

    EC.RENDER._gesture = {
      active: true,
      kind: 'touch',
      key,
      touchId,
      wellId: bestId,
      pid: -1,
      t0,
      x0: clientX,
      y0: clientY,
    };

    // Update gesture line
    try {
      const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
      if (D) D.gestureLine = `active=1 key=${key} well=${_wellIndexById(bestId)} x0/y0=${Math.round(clientX)}/${Math.round(clientY)} t0=${Math.floor(t0)}`;
    } catch (_) {}

    try {
      const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
      if (D && Array.isArray(D.log)) D.log.push(((performance && performance.now)?Math.floor(performance.now()):Date.now()) + ' ARM touch DOM key=' + key + ' well=' + _wellIndexById(bestId));
    } catch (_) {}

    return true;
  } catch (_) { return false; }
};
// DOM fallback resolver (Android/iOS): resolve or cancel gesture end from raw DOM events on the canvas.
// This calls the same internal resolve path used by the well pointerup handlers.
EC.RENDER._resolveGestureFromDom = function(domEv, kind) {
  try {
    const st = EC.RENDER && EC.RENDER._gesture;

    // Always update resolve line on end/cancel, even if no gesture.
    const nowT = (performance && performance.now) ? performance.now() : Date.now();
    if (!st || !st.active) {
      try {
        const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
        if (D) D.resolveLine = `hasGesture=0 key=? dt=? dx=? dy=? class=NONE dir=NONE applied=na reason=no_gesture end=${kind||'end'}`;
      } catch (_) {}
      return;
    }

    // Enforce kind/key matching (no cross resolve).
    let ok = false;
    let wrapped = { pointerId: (domEv && domEv.pointerId != null) ? domEv.pointerId : -1, data: { originalEvent: domEv } };

    if (st.kind === 'touch') {
      const oe = domEv;
      const list = (oe && oe.changedTouches && oe.changedTouches.length) ? oe.changedTouches
                : (oe && oe.touches && oe.touches.length) ? oe.touches
                : [];
      let found = null;
      for (let i=0;i<list.length;i++) { if (list[i] && list[i].identifier === st.touchId) { found = list[i]; break; } }
      if (!found) return; // not our touch
      ok = true;
      wrapped.pointerId = -1;
      wrapped.data.originalEvent = domEv;
    } else {
      // pointer
      const pid = (domEv && domEv.pointerId != null) ? domEv.pointerId : -1;
      if (st.pid != null && st.pid >= 0 && pid != null && pid >= 0 && pid !== st.pid) return;
      ok = true;
      wrapped.pointerId = pid;
      wrapped.data.originalEvent = domEv;
    }

    if (!ok) return;

    if (kind === 'cancel') {
      EC.RENDER._gesture = null;
      if (EC.RENDER && typeof EC.RENDER._setGestureDebug === 'function') EC.RENDER._setGestureDebug('SWIPE: cancel(DOM)');
      try {
        const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
        if (D) D.resolveLine = `hasGesture=1 key=${st.key||'?'} kind=${st.kind||'?'} well=${_wellIndexById(st.wellId)} dt=? dx=? dy=? classified=CANCEL dir=NONE applied=NA`;
        if (D && Array.isArray(D.log)) D.log.push(((performance && performance.now)?Math.floor(performance.now()):Date.now()) + ' DOM cancel -> cleared key=' + (st.key||'?'));
      } catch (_) {}
      return;
    }

    _resolveGesture(wrapped, true);
  } catch (_) {}
};
    c.on('pointerup', (ev) => { try { const D=EC.UI_STATE&&EC.UI_STATE.inputDbg; if(D){D.pixiWell= D.pixiWell||{pd:0,pm:0,pu:0,po:0,pc:0}; D.pixiWell.pu=(D.pixiWell.pu||0)+1; D.lastWell={wellIndex:_wellIndexById(w.id), type:'pointerup', pid:(ev&&ev.pointerId!=null)?ev.pointerId:(ev&&ev.data&&ev.data.pointerId!=null?ev.data.pointerId:-1)}; } } catch(_){} _resolveGesture(ev, false); });
    c.on('pointerupoutside', (ev) => { try { const D=EC.UI_STATE&&EC.UI_STATE.inputDbg; if(D){D.pixiWell= D.pixiWell||{pd:0,pm:0,pu:0,po:0,pc:0}; D.pixiWell.po=(D.pixiWell.po||0)+1; D.lastWell={wellIndex:_wellIndexById(w.id), type:'pointerupoutside', pid:(ev&&ev.pointerId!=null)?ev.pointerId:(ev&&ev.data&&ev.data.pointerId!=null?ev.data.pointerId:-1)}; } } catch(_){} _resolveGesture(ev, true); });
    c.on('pointercancel', (ev) => { try { const D=EC.UI_STATE&&EC.UI_STATE.inputDbg; if(D){D.pixiWell= D.pixiWell||{pd:0,pm:0,pu:0,po:0,pc:0}; D.pixiWell.pc=(D.pixiWell.pc||0)+1; D.lastWell={wellIndex:_wellIndexById(w.id), type:'pointercancel', pid:(ev&&ev.pointerId!=null)?ev.pointerId:(ev&&ev.data&&ev.data.pointerId!=null?ev.data.pointerId:-1)}; } } catch(_){}
      const st = EC.RENDER && EC.RENDER._gesture;
      if (!st || !st.active) return;
      EC.RENDER._gesture = null;
      _setGestureDebug('SWIPE: cancel');
    });

    EC.RENDER.wellLayer.addChild(c);

    const view = {
      c, fill, ring,
      fxLayer,
      breakFillG,
      breakFlashG,
      breakText,
      aspectFlashG,
      swirlContainer, swirlG, swirlText,
      traumaLayer,
      tagContainer, tagBg, tagText,
      label,
      particles: [],
      ripples: [],
      aspectFlashUntil: 0,
      tagPopUntil: 0,
      tagPopAmp: 0,
      swirlPhase: Math.random() * Math.PI * 2,
    };
    wellViews.set(w.id, view);
    return view;
  }

  function updateWellView(w) {
    const v = ensureWellView(w);
    const { c, fill, ring, swirlContainer, swirlG, swirlText, traumaLayer, label } = v;

    w.radius = computeWellRadius(w);

    c.position.set(w.pos.x, w.pos.y);
    label.position.set(w.pos.x, w.pos.y + w.radius + 18);

    c.hitArea = new PIXI.Circle(0, 0, w.radius + 14);

    const isSelected = (EC.SIM.selectedWellId === w.id);

    const col = mixWellColor(w);
    fill.clear();
    // Debug-only: allow isolating the MVP liquid interior by hiding the legacy base fill.
    // (No gameplay impact; only affects visuals when EC.DEBUG is true.)
    const dbgLay = (EC.DEBUG && EC.DEBUG_LIQUID_LAYERS) ? EC.DEBUG_LIQUID_LAYERS : null;
    const fillA = (!dbgLay || dbgLay.baseFill !== false) ? 0.88 : 0.0;
    fill.beginFill(rgbToHex(col), fillA);
    fill.drawCircle(0, 0, w.radius);
    fill.endFill();

    ring.clear();

    // Selected well affordance: subtle pulse so you always know what will be affected.
    const tSel = EC.SIM.runSeconds;
    let ringW = 4;
    let ringA = isSelected ? 0.92 : 0.22;
    if (isSelected) {
      const p = 0.5 + 0.5 * Math.sin(tSel * 5.2);
      ringW = 4 + 1.6 * p;
      ringA = 0.65 + 0.30 * p;
    }
    ring.lineStyle(ringW, isSelected ? 0x7aa2ff : 0xffffff, ringA);
    ring.drawCircle(0, 0, w.radius + 3);

    const now = EC.SIM.runSeconds;

    // Slight scale pulse for key events (kept tiny to avoid hit-area weirdness).
    let scaleFactor = 1;

    // Break cue (telegraph + active pulse) — made more noticeable per feedback.
    if (v.breakFlashG && v.breakFillG && v.breakText) {
      const tel = TUNING.breaks.telegraphSeconds ?? 0.28;
      const active = (now >= w.breakStart && now < w.breakUntil);
      const telegraph = (w.breakTelegraphAt > 0 && now >= w.breakTelegraphAt && now < w.breakStart);
      const linger = (w.breakCueUntil && now < w.breakCueUntil);

      if (active || telegraph || linger) {
        v.breakFlashG.clear();
        v.breakFillG.clear();

        // Label
        v.breakText.position.set(0, -w.radius * 0.18);

        if (telegraph) {
          const tt = clamp((now - w.breakTelegraphAt) / tel, 0, 1);
          const rr = w.radius * (0.55 + 0.65 * tt);
          const a = (1 - tt) * 0.95;

          // Soft fill flash so you notice it even in peripheral vision.
          v.breakFillG.beginFill(0xfff2b5, 0.10 + 0.10 * a);
          v.breakFillG.drawCircle(0, 0, w.radius * 0.98);
          v.breakFillG.endFill();

          // Expanding ring
          v.breakFlashG.lineStyle(10, 0xfff2b5, a * 0.65);
          v.breakFlashG.drawCircle(0, 0, rr);
          v.breakFlashG.lineStyle(6, 0xffffff, a * 0.40);
          v.breakFlashG.drawCircle(0, 0, rr);

          v.breakText.alpha = 0.45 + 0.35 * a;
          v.breakText.scale.set(1.00 + 0.08 * (1 - tt));
          scaleFactor = 1.00 + 0.010 * a;
        } else {
          const pulse = 0.5 + 0.5 * Math.sin(now * 12.0);
          const rr = w.radius + 12 + 7 * pulse;
          const a = active ? 0.70 : 0.35;

          v.breakFillG.beginFill(0xfff2b5, 0.10 + 0.10 * pulse);
          v.breakFillG.drawCircle(0, 0, w.radius * 0.98);
          v.breakFillG.endFill();

          v.breakFlashG.lineStyle(9, 0xfff2b5, a * 0.60);
          v.breakFlashG.drawCircle(0, 0, rr);
          v.breakFlashG.lineStyle(5, 0xffffff, a * 0.40);
          v.breakFlashG.drawCircle(0, 0, rr);

          v.breakText.alpha = active ? 0.85 : 0.35;
          v.breakText.scale.set(1.06 + 0.10 * pulse);
          scaleFactor = active ? (1.00 + 0.020 * pulse) : 1.00;
        }
      } else {
        v.breakFlashG.clear();
        v.breakFillG.clear();
        v.breakText.alpha = 0;
        v.breakText.scale.set(1);
      }
    }

    c.scale.set(scaleFactor);

    // Swirl indicator
    const ns = netSwirl(w, now);
    swirlText.text = ns.dir === 0 ? 'STILL 0.00' : `${ns.dir > 0 ? 'CW' : 'CCW'} ${ns.mag.toFixed(2)}`;

    swirlG.clear();
    const thickness = 3 + ns.mag * 4;
    const alpha = 0.16 + ns.mag * 0.55;
    swirlG.lineStyle(thickness, 0x0b0f16, alpha);

    const sr = w.radius * 0.70;
    const start = -Math.PI * 0.15;
    const end = Math.PI * 1.15;
    swirlG.arc(0, 0, sr, start, end);

    const ax = Math.cos(end) * sr;
    const ay = Math.sin(end) * sr;
    const head = 10 + ns.mag * 10;
    const ang = end + 0.35;
    swirlG.moveTo(ax, ay);
    swirlG.lineTo(ax - Math.cos(ang) * head, ay - Math.sin(ang) * head);
    swirlG.moveTo(ax, ay);
    swirlG.lineTo(ax - Math.cos(ang + 0.55) * head, ay - Math.sin(ang + 0.55) * head);

    
    // Aspect tag (no lane name; lane inferred by color)
    const lane = computeLaneForDisplay(w);
    const signedS = ns.dir * ns.mag;
    const zone = aspectZoneFromSwirl(signedS);
    const word = (LANE_ASPECTS[lane] && LANE_ASPECTS[lane][zone]) ? LANE_ASPECTS[lane][zone] : '...';
    v.tagText.text = `${aspectIcon(zone)} ${word}`;

    // tag layout (inside well, near top)
    v.tagContainer.position.set(0, -w.radius * 0.62);
    const padX = 10, padY = 6;
    const tw = v.tagText.width;
    const th = v.tagText.height;
    v.tagBg.clear();
    v.tagBg.beginFill(0x0b0f16, 0.42);
    v.tagBg.lineStyle(1, 0xffffff, 0.14);
    v.tagBg.drawRoundedRect(-tw/2 - padX, -th/2 - padY, tw + padX*2, th + padY*2, 8);
    v.tagBg.endFill();

    swirlContainer.alpha = ns.dir === 0 ? 0.6 : 1.0;

    // Trauma particles
    const targetCount = Math.min(TUNING.traumaParticles.max, Math.floor(w.trauma * TUNING.traumaParticles.perTrauma));

    while (v.particles.length < targetCount) {
      const g = new Graphics();
      g.beginFill(0x000000, 0.55);
      const pr = 1.6 + Math.random() * 3.0;
      g.drawCircle(0, 0, pr);
      g.endFill();
      traumaLayer.addChild(g);
      const p = { g, x: 0, y: 0 };
      const pt = randomPointInCircle(w.radius * 0.92);
      p.x = pt.x; p.y = pt.y;
      g.position.set(p.x, p.y);
      v.particles.push(p);
    }

    while (v.particles.length > targetCount) {
      const p = v.particles.pop();
      traumaLayer.removeChild(p.g);
      p.g.destroy();
    }

    label.alpha = isSelected ? 1.0 : 0.78;
  }

  function spawnBlendRipple(w) {
    const v = ensureWellView(w);
    const g = new Graphics();
    v.fxLayer.addChild(g);
    v.ripples.push({ g, start: EC.SIM.runSeconds });
    // subtle tag pop (more visible)
    v.tagPopUntil = Math.max(v.tagPopUntil, EC.SIM.runSeconds + 0.20);
    v.tagPopAmp = Math.max(v.tagPopAmp || 0, 0.14);
  }

  function spawnAspectNudge(w) {
    const v = ensureWellView(w);
    v.tagPopUntil = Math.max(v.tagPopUntil, EC.SIM.runSeconds + 0.14);
    v.tagPopAmp = Math.max(v.tagPopAmp || 0, 0.10);
    v.aspectFlashUntil = Math.max(v.aspectFlashUntil || 0, EC.SIM.runSeconds + 0.16);
  }

  function snapshotAspectZone(w, now) {
    const ns = netSwirl(w, now);
    const signedS = ns.dir * ns.mag;
    return aspectZoneFromSwirl(signedS);
  }

  function randomPointInCircle(r) {
    const t = Math.random() * 2 * Math.PI;
    const u = Math.random() + Math.random();
    const rr = (u > 1 ? 2 - u : u) * r;
    return { x: Math.cos(t) * rr, y: Math.sin(t) * rr };
  }

  function animateParticlesAndSwirl(dt) {
    const now = EC.SIM.runSeconds;

    for (const w of EC.SIM.wells) {
      const v = ensureWellView(w);
      const ns = netSwirl(w, now);

      // Rotate swirl cue so direction is obvious
      const radPerSec = TUNING.swirlAnim.maxRadPerSec * ns.mag;
      v.swirlPhase += ns.dir * radPerSec * dt;
      v.swirlContainer.rotation = v.swirlPhase;

      // Rotate trauma particles in same field (purely visual)
      const spinSpeed = ns.dir * ns.mag * 0.9;
      for (const p of v.particles) {
        const g = p.g;

        const ang = spinSpeed * dt;
        const cos = Math.cos(ang), sin = Math.sin(ang);
        const x = p.x * cos - p.y * sin;
        const y = p.x * sin + p.y * cos;
        p.x = x; p.y = y;

        const jit = TUNING.traumaParticles.jitter;
        p.x += (Math.random() - 0.5) * jit;
        p.y += (Math.random() - 0.5) * jit;

        const d = Math.sqrt(p.x * p.x + p.y * p.y);
        if (d > w.radius * 0.93) {
          const s = (w.radius * 0.90) / (d + 0.001);
          p.x *= s; p.y *= s;
        }

        g.position.set(p.x, p.y);
        g.alpha = 0.30 + clamp(traumaDensity(w) * 0.9, 0, 0.60);
      }

      // State-shift visuals: blend ripple + tag pulse
      // Ripple animation lives here so it stays synced to dt.
      if (v.ripples && v.ripples.length) {
        const dur = TUNING.stateLabels.rippleMs / 1000;
        for (let i = v.ripples.length - 1; i >= 0; i--) {
          const r = v.ripples[i];
          const t = (now - r.start) / dur;
          if (t >= 1) {
            v.fxLayer.removeChild(r.g);
            r.g.destroy();
            v.ripples.splice(i, 1);
            continue;
          }
          const ease = 1 - Math.pow(1 - t, 2);
          const alpha = (1 - ease) * 0.70;
          const rr = w.radius * (0.35 + 0.80 * ease);
          r.g.clear();
          r.g.lineStyle(4, 0xffffff, alpha * 0.75);
          r.g.drawCircle(0, 0, rr);
          r.g.lineStyle(3, 0x7aa2ff, alpha * 0.55);
          r.g.drawCircle(0, 0, rr + 3);
        }
      }

      
      // Aspect-shift flash: quick ring glow so zone changes are noticeable
      if (v.aspectFlashG) {
        if (v.aspectFlashUntil && now < v.aspectFlashUntil) {
          const t = 1 - clamp((v.aspectFlashUntil - now) / 0.16, 0, 1);
          const alphaF = (1 - t) * 0.75;
          v.aspectFlashG.clear();
          v.aspectFlashG.lineStyle(6, 0xffffff, alphaF * 0.35);
          v.aspectFlashG.drawCircle(0, 0, w.radius + 6);
          v.aspectFlashG.lineStyle(4, 0x7aa2ff, alphaF * 0.25);
          v.aspectFlashG.drawCircle(0, 0, w.radius + 6);
        } else {
          v.aspectFlashG.clear();
        }
      }


      if (v.tagPopUntil && now < v.tagPopUntil) {
        const t = clamp((v.tagPopUntil - now) / 0.20, 0, 1);
        const amp = v.tagPopAmp || 0.10;
        const k = 1 + (1 - t) * amp;
        v.tagContainer.scale.set(k);
      } else {
        v.tagContainer.scale.set(1);
        v.tagPopAmp = 0;
      }
    }
  }



// -----------------------------
// Psyche donut wedges (UI pass) — replaces bullseye/bars
// -----------------------------
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

  // Center total text inside the donut core
  if (!EC.RENDER.psycheCenterText) {
    const ct = new Text('0', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: 22,
      fill: 0xffffff,
      stroke: 0x000000,
      strokeThickness: 4,
      align: 'center',
    });
    ct.anchor && ct.anchor.set(0.5, 0.5);
    ct.eventMode = 'none';
    EC.RENDER.psycheCenterText = ct;
    EC.RENDER.psycheTextLayer.addChild(ct);
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
  const HUE_CAP = EC.TUNE.PSY_HUE_CAP;

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

      // Boundary lines for readability
      shadeG.lineStyle({ width: lineW, color: col, alpha: lineAlpha });
      if (typeof b0 === 'number') {
        drawAnnularWedge(shadeG, 0, 0, b0, b0 + 0.01, start, end);
      }
      if (typeof b1 === 'number') {
        drawAnnularWedge(shadeG, 0, 0, b1, b1 + 0.01, start, end);
      }
      shadeG.lineStyle();
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

  for (let i = 0; i < N; i++) {
    const start = base + i * slice + gap / 2;
    const end = start + span;
    const mid = (start + end) * 0.5;

    // Numeric psyche value inside wedge
    if (wedgeTexts && wedgeTexts[i]) {
      const t = wedgeTexts[i];
      const vv = Math.round((P[i] || 0));
      if (t.text !== String(vv)) t.text = String(vv);
      if (t.style && t.style.fontSize !== fontSize) {
        // Pixi Text style assignment can be expensive; only change when needed.
        t.style = { ...t.style, fontSize: fontSize };
      }
      t.position.set(Math.cos(mid) * textR, Math.sin(mid) * textR);
      t.visible = true;
    }

    // Gold ring if this wedge currently satisfies its objective condition
    const ok = goalPerHue ? goalOk(goalPerHue[i], P[i]) : false;
    if (ok && ringG) {
      ringG.lineStyle({ width: ringW, color: gold, alpha: 0.92 });
      drawAnnularWedge(ringG, 0, 0, r0, r1, start, end);
      ringG.closePath();
      ringG.endFill && ringG.endFill();
      ringG.lineStyle();
    }
  }
  // Center core (total fill 0..TOTAL_CAP): background disc + radial fill sector + centered total number
  let total = 0;
  for (let i = 0; i < 6; i++) total += (P[i] || 0);

  const coreR = r0 * 0.90; // keep core smaller than r0 so wedges start cleanly
  const TOTAL_CAP = EC.TUNE.PSY_TOTAL_CAP;
  const tTotal = clamp(total, 0, TOTAL_CAP) / TOTAL_CAP;

  // Background core disc
  g.beginFill(0x000000, 0.46);
  g.drawCircle(0, 0, coreR);
  g.endFill();

  // Filled pie sector (0..1000)
  if (tTotal > 0) {
    const fillCol = (total > TOTAL_CAP) ? 0xff3b3b : 0xffffff;
    const fillAlpha = (total > TOTAL_CAP) ? 0.22 : 0.18;
    g.beginFill(fillCol, fillAlpha);
    g.moveTo(0, 0);
    g.arc(0, 0, coreR, -Math.PI / 2, -Math.PI / 2 + tTotal * Math.PI * 2, false);
    g.closePath();
    g.endFill();
  }

  // Thin outline
  g.lineStyle(1, 0xffffff, 0.12);
  g.drawCircle(0, 0, coreR);
  g.lineStyle(0, 0, 0);

  // Center total text
  const ct = EC.RENDER.psycheCenterText;
  if (ct) {
    const fs = clamp(Math.round(coreR * 0.62), 12, 40);
    if (ct.style && ct.style.fontSize !== fs) ct.style.fontSize = fs;
    ct.text = '' + Math.round(total);
    ct.position.set(0, 0);
    ct.alpha = 0.95;
    ct.tint = (total >= TOTAL_CAP) ? 0xffc7c7 : 0xffffff;
  }
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

  // Hide legacy well views (two-well layout) if present
  if (EC.RENDER && EC.RENDER.wellViews) {
    for (const id in EC.RENDER.wellViews) {
      const v = EC.RENDER.wellViews[id];
      if (v && v.container) v.container.visible = false;
    }
  }

  // Ensure MVP wells render and are positioned
  if (EC.updateMvpBoardView) EC.updateMvpBoardView();
  return;
}
// Dynamic well sizing so two wells can always sit side-by-side in portrait without overlap.
  const margin = 14;
  const gap = 18;
  const maxRByWidth = Math.floor((w - 2 * margin - gap) / 4); // derived from 2 circles + gap
  // Allow a much wider radius range so area-proportional scaling reads clearly.
  // (Still constrained by maxRByWidth, so the two wells won't overlap.)
  const maxR = clamp(maxRByWidth, 60, 220);
  // Keep minimum small so low-amount wells stay meaningfully smaller by area.
  const minR = clamp(Math.floor(maxR * 0.28), 24, Math.floor(maxR * 0.60));

  SIM.wellSize = { minR, maxR };

  // Base radius for other visuals
  SIM.layoutBaseR = Math.min(maxR, Math.max(72, Math.floor(Math.min(w, availableH) * 0.18)));

  const y = clamp(topReserved + availableH * 0.52, topReserved + maxR + 6, h - bottomReserved - maxR - 6);

  // Psyche sits at the center between wells for Chunk 3.
  if (EC.RENDER && EC.RENDER.psycheLayer) {
    EC.RENDER.psycheLayer.position.set(w / 2, y);
  }
  if (EC.RENDER && EC.RENDER.psycheDebugText) {
    EC.RENDER.psycheDebugText.position.set(14, 10);
  }

  if (SIM.wells.length >= 2) {
    const leftX = margin + maxR;
    const rightX = w - margin - maxR;
    SIM.wells[0].pos.x = leftX;
    SIM.wells[0].pos.y = y;
    SIM.wells[1].pos.x = rightX;
    SIM.wells[1].pos.y = y;
  } else if (SIM.wells.length === 1) {
    SIM.wells[0].pos.x = w / 2;
    SIM.wells[0].pos.y = y;
  }

  for (const well of SIM.wells) updateWellView(well);

  // Draw/update psyche rings.
  if (EC.renderPsyche) EC.renderPsyche();
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
  EC.mixWellColor = mixWellColor;
  EC.rgbToHex = rgbToHex;
  EC.computeWellRadius = computeWellRadius;
  EC.ensureWellView = ensureWellView;
  EC.updateWellView = updateWellView;
  EC.spawnBlendRipple = spawnBlendRipple;
  EC.spawnAspectNudge = spawnAspectNudge;
  EC.snapshotAspectZone = snapshotAspectZone;
  EC.animateParticlesAndSwirl = animateParticlesAndSwirl;

  EC.layout = layout;
  EC.scheduleRelayout = scheduleRelayout;
  // Public resize hook used by UI and bootstrap
  EC.resize = scheduleRelayout;


  // Hardening: module registry (no gameplay impact)
  EC._registerModule && EC._registerModule('render_wells', { provides: ["EC.ensureWellView", "EC.updateWellView", "EC.layout", "EC.scheduleRelayout", "EC.drawBackground", "EC.snapshotAspectZone", "EC.spawnAspectFlash", "EC.spawnBoundaryRipple", "EC.ensurePsycheView", "EC.renderPsyche", "EC.updatePsycheView", "EC.RENDER"] });
})();
