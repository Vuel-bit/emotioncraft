// systems_input.js — stable input API for manual well picking + gesture arm/resolve (no mechanics changes)
(() => {
  const EC = (window.EC = window.EC || {});
  EC.INPUT = EC.INPUT || {};


  // Canonical gesture state (single source of truth)
  // Never replace this object reference; mutate fields only.
  if (!EC.INPUT.gestureState) {
    const rid = (Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6)).slice(0, 8);
    EC.INPUT.gestureState = { _id: rid, active: 0, key: '', kind: '', well: -1, x0: 0, y0: 0, t0: 0, touchId: null, pid: -1 };
  }


// ------------------------------------------------------------
// Input Debug helpers (moved from main.js)
// ------------------------------------------------------------
(function(){
  let _cached = null;

  EC.INPUT.isInputDebugEnabled = function isInputDebugEnabled(){
    if (_cached != null) return _cached;
    try {
      const q = String((typeof location !== 'undefined' && location.search) ? location.search : '');
      _cached = /(?:\?|&)inputdebug=1(?:&|$)/.test(q);
    } catch (_) {
      _cached = false;
    }
    return _cached;
  };

  EC.INPUT.ensureInputDbg = function ensureInputDbg(){
    try {
      EC.UI_STATE = EC.UI_STATE || {};
      const D = EC.UI_STATE.inputDbg = EC.UI_STATE.inputDbg || {};
      D.dom = D.dom || { pd:0, pm:0, pu:0, pc:0, ts:0, tm:0, te:0, tc:0 };
      D.pixiStage = D.pixiStage || { pd:0, pm:0, pu:0, po:0, pc:0 };
      D.pixiWell = D.pixiWell || { pd:0, pm:0, pu:0, po:0, pc:0 };
      if (!('lastDomPointer' in D)) D.lastDomPointer = null;
      if (!('lastDomTouch' in D)) D.lastDomTouch = null;
      if (!('lastStage' in D)) D.lastStage = null;
      if (!('lastWell' in D)) D.lastWell = null;
      // Allocate log array only when explicitly enabled
      if (EC.INPUT.isInputDebugEnabled()) {
        if (!Array.isArray(D.log)) D.log = [];
      }
      return D;
    } catch (_) {
      return null;
    }
  };

  function _stamp(){
    const t = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return String(Math.floor(t)).padStart(6,'0');
  }

  function _touchXY(te){
    try {
      const ch = (te && te.changedTouches && te.changedTouches[0]) ? te.changedTouches[0] : null;
      const t = ch || ((te && te.touches && te.touches[0]) ? te.touches[0] : null);
      if (t) return { x: t.clientX, y: t.clientY };
    } catch (_) {}
    return { x: null, y: null };
  }

  EC.INPUT.dbgLog = function dbgLog(line){
    if (!EC.INPUT.isInputDebugEnabled()) return;
    const D = EC.INPUT.ensureInputDbg();
    if (!D) return;
    if (!Array.isArray(D.log)) D.log = [];
    D.log.push(_stamp() + ' ' + line);
    if (D.log.length > 120) D.log.splice(0, D.log.length - 120);
  };

  EC.INPUT.dbgRecordDomPointer = function dbgRecordDomPointer(e, phase, extra){
    if (!EC.INPUT.isInputDebugEnabled()) return;
    const D = EC.INPUT.ensureInputDbg();
    if (!D) return;
    D.dom[phase] = (D.dom[phase]||0) + 1;
    D.lastDomPointer = {
      type: e && e.type,
      pid: e && e.pointerId,
      pointerType: e && e.pointerType,
      isPrimary: !!(e && e.isPrimary),
      x: (e && typeof e.clientX === 'number') ? Math.round(e.clientX) : null,
      y: (e && typeof e.clientY === 'number') ? Math.round(e.clientY) : null,
      defaultPrevented: !!(e && e.defaultPrevented),
      capture: extra || '',
    };
    EC.INPUT.dbgLog(`DOM ${e && e.type ? e.type : '?'} pid=${e && e.pointerId != null ? e.pointerId : '?'} pt=${(e && e.pointerType) ? e.pointerType : '?'} x=${D.lastDomPointer.x} y=${D.lastDomPointer.y} defPrev=${D.lastDomPointer.defaultPrevented?'Y':'n'} ${extra||''}`.trim());
  };

  EC.INPUT.dbgRecordDomTouch = function dbgRecordDomTouch(e, phase){
    if (!EC.INPUT.isInputDebugEnabled()) return;
    const D = EC.INPUT.ensureInputDbg();
    if (!D) return;
    D.dom[phase] = (D.dom[phase]||0) + 1;
    const xy = _touchXY(e);
    D.lastDomTouch = {
      type: e && e.type,
      touches: (e && e.touches && e.touches.length) ? e.touches.length : 0,
      changed: (e && e.changedTouches && e.changedTouches.length) ? e.changedTouches.length : 0,
      x: (typeof xy.x === 'number') ? Math.round(xy.x) : null,
      y: (typeof xy.y === 'number') ? Math.round(xy.y) : null,
      defaultPrevented: !!(e && e.defaultPrevented),
    };
    EC.INPUT.dbgLog(`DOM ${e && e.type ? e.type : '?'} touches=${D.lastDomTouch.touches} changed=${D.lastDomTouch.changed} x=${D.lastDomTouch.x} y=${D.lastDomTouch.y} defPrev=${D.lastDomTouch.defaultPrevented?'Y':'n'}`);
  };

  function _pidFromEv(ev){
    return (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);
  }

  EC.INPUT.dbgStage = function dbgStage(ev, kind){
    if (!EC.INPUT.isInputDebugEnabled()) return;
    const D = EC.INPUT.ensureInputDbg();
    if (!D) return;
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
    EC.INPUT.dbgLog(`PIXI STAGE ${kind} pid=${pid} x=${x} y=${y} src=${src}`);
  };

  // Canonical DOM touchstart arming wrapper (keeps main.js thin)
  EC.INPUT.armGestureFromDomTouchStart = function armGestureFromDomTouchStart(te){
    try {
      const oe = te;
      const touchesN0 = (oe && oe.touches) ? oe.touches.length : 0;
      if (touchesN0 > 1) {
        EC.INPUT.dbgLog('TOUCHSTART_RETURN: reason=multitouch_block');
        return false;
      }
      const ch = (oe && oe.changedTouches && oe.changedTouches.length) ? oe.changedTouches[0] : null;
      const t = ch || ((oe && oe.touches && oe.touches.length) ? oe.touches[0] : null);
      if (!t || t.identifier == null) {
        EC.INPUT.dbgLog('TOUCHSTART_RETURN: reason=no_touch_identifier');
        return false;
      }
      const clientX = t.clientX, clientY = t.clientY;
      const touchId = t.identifier;
      const nowMs = (performance && performance.now) ? Math.floor(performance.now()) : Date.now();

      const pickFn = EC.INPUT && typeof EC.INPUT.pickWellIndexFromClientXY === 'function' ? EC.INPUT.pickWellIndexFromClientXY : null;
      const armFn = EC.INPUT && typeof EC.INPUT.armGestureFromPick === 'function' ? EC.INPUT.armGestureFromPick : null;
      if (!pickFn || !armFn) return false;

      const pick = pickFn(clientX, clientY);
      if (!pick || !pick.inside || pick.idx == null || pick.idx < 0) {
        EC.INPUT.dbgLog(`PICK: idx=-1 cx/cy=${clientX.toFixed(1)},${clientY.toFixed(1)} inside=n`);
        return false;
      }
      EC.INPUT.dbgLog(`PICK: idx=${pick.idx} cx/cy=${clientX.toFixed(1)},${clientY.toFixed(1)} inside=Y`);

      const key = 't:' + touchId;
      const armed = !!armFn({ kind:'touch', key, idx: pick.idx, clientX, clientY, t0: nowMs, touchId: touchId });
      const lastArm = (EC.INPUT && EC.INPUT._lastArm) ? EC.INPUT._lastArm : null;
      const reason = armed ? 'ok' : ((lastArm && lastArm.reason) ? lastArm.reason : 'unknown_false');
      EC.INPUT.dbgLog(`ARM: ok=${armed?'y':'n'} key=${key} well=${pick.idx} reason=${reason}`);
      return armed;
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      EC.INPUT.dbgLog('TOUCHSTART_THROW: ' + msg);
      return false;
    }
  };

})();
  // ------------------------------------------------------------
  // Gesture helpers + DOM pointer bridge (canonical: EC.INPUT.*)
  // ------------------------------------------------------------
  // Always-visible on-screen swipe debug line (gated by EC.DEBUG for console).
  EC.INPUT._setGestureDebug = EC.INPUT._setGestureDebug || function _setGestureDebug(s) {
    // Default OFF: only show gesture debug when ?inputdebug=1.
    try {
      const enabled = (EC.INPUT && typeof EC.INPUT.isInputDebugEnabled === 'function') ? !!EC.INPUT.isInputDebugEnabled() : false;
      EC.UI_STATE = EC.UI_STATE || {};
      if (!enabled) {
        EC.UI_STATE.gestureDebug = '';
        return;
      }
      EC.UI_STATE.gestureDebug = s;
      if (EC.DEBUG) {
        try { console.log(s); } catch (_) {}
      }
    } catch (_) {
      try {
        EC.UI_STATE = EC.UI_STATE || {};
        EC.UI_STATE.gestureDebug = '';
      } catch (_) {}
    }
  };

  // Robust extraction of clientX/clientY across Pixi events and DOM Pointer/Touch events.
  EC.INPUT._getClientXY = EC.INPUT._getClientXY || function _getClientXY(ev) {
    // Prefer Pixi-wrapped originalEvent when present
    const oe = (ev && ev.data && ev.data.originalEvent) ? ev.data.originalEvent : (ev && ev.nativeEvent ? ev.nativeEvent : null);

    // Raw DOM PointerEvent path
    if (ev && ev.clientX != null && ev.clientY != null) {
      return { x: ev.clientX, y: ev.clientY, oe: ev };
    }

    // PointerEvent path (originalEvent)
    if (oe && oe.clientX != null && oe.clientY != null) {
      return { x: oe.clientX, y: oe.clientY, oe };
    }

    // TouchEvent path
    const t = (oe && oe.changedTouches && oe.changedTouches.length) ? oe.changedTouches[0]
            : (oe && oe.touches && oe.touches.length) ? oe.touches[0]
            : (ev && ev.changedTouches && ev.changedTouches.length) ? ev.changedTouches[0]
            : (ev && ev.touches && ev.touches.length) ? ev.touches[0]
            : null;
    if (t && t.clientX != null && t.clientY != null) {
      return { x: t.clientX, y: t.clientY, oe };
    }

    // Fallback: Pixi global coords
    const x = (ev && ev.global ? ev.global.x : 0);
    const y = (ev && ev.global ? ev.global.y : 0);
    return { x, y, oe };
  };

  // DOM pointerdown bridge used by bootstrap (main.js).
  EC.INPUT.armGestureFromDomPointerDown = EC.INPUT.armGestureFromDomPointerDown || function armGestureFromDomPointerDown(domEv) {
    try {
      if (!EC.INPUT || typeof EC.INPUT.pickWellIndexFromClientXY !== 'function' || typeof EC.INPUT.armGestureFromPick !== 'function') return false;
      const pid = (domEv && domEv.pointerId != null) ? domEv.pointerId : 0;
      const cx = (domEv && domEv.clientX != null) ? domEv.clientX : 0;
      const cy = (domEv && domEv.clientY != null) ? domEv.clientY : 0;
      const pick = EC.INPUT.pickWellIndexFromClientXY(cx, cy);
      const idx = pick && typeof pick.idx === 'number' ? pick.idx : -1;
      if (idx < 0) return false;
      EC.INPUT.armGestureFromPick({ kind: 'pointer', pid, key: 'p:' + pid, idx, clientX: cx, clientY: cy });
      return true;
    } catch (_) {
      return false;
    }
  };

  // DOM pointerup/pointercancel bridge used by bootstrap (main.js).
  EC.INPUT.resolveGestureFromDom = EC.INPUT.resolveGestureFromDom || function resolveGestureFromDom(domEv, kind) {
    try {
      if (!EC.INPUT) return false;
      if (kind === 'cancel') {
        if (typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('dom_cancel', { why: 'pointercancel' });
        return true;
      }
      // Canonical DOM release resolver (supports tap / flick / long-press drag).
      const st = EC.INPUT.gestureState;
      if (!st || !st.active) return false;
      if (st.kind && st.kind !== 'pointer') return false;

      const pid = (domEv && domEv.pointerId != null) ? domEv.pointerId : null;
      const storedKey = st.key || '';
      const endKey = (pid != null) ? ('p:' + pid) : 'p:?';

      // Require matching pointer id/key.
      if (endKey !== storedKey) {
        try {
          const gsId = (st && st._id) ? st._id : '?';
          _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=key_mismatch storedKey=${storedKey || '?'} endKey=${endKey}`);
          _setResolveLine(`hasGesture=0 reason=key_mismatch storedKey=${storedKey || '?'} endKey=${endKey}`, 'resolved_key_mismatch');
        } catch (_) {}
        if (typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('resolved_key_mismatch', { why: 'dom_pointer_end', storedKey: storedKey || '?', endKey: endKey });
        return true;
      }

      const getXY = EC.INPUT._getClientXY;
      const xy = getXY ? getXY(domEv) : null;
      const x = xy ? xy.x : null;
      const y = xy ? xy.y : null;
      if (x == null || y == null) {
        try {
          const gsId = (st && st._id) ? st._id : '?';
          _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=missing_coords`);
          _setResolveLine(`hasGesture=0 reason=missing_coords key=${storedKey || '?'} cx=${x} cy=${y}`, 'resolved_missing_coords');
        } catch (_) {}
        if (typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('resolved_missing_coords', { why: 'dom_pointer_end', key: storedKey || '?' });
        return true;
      }

      const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      resolveGestureOnRelease(st, x, y, nowMs, 'dom_pointer_end');
      return true;
    } catch (_) {
      return false;
    }
  };



  // Helper: safe number
  const _num = (v, d=0) => (typeof v === 'number' && isFinite(v)) ? v : d;

  // Map DOM client coords -> renderer coords using canvas rect and renderer screen size.
  function _clientToRenderXY(clientX, clientY, app) {
    try {
      const app2 = app || (EC.RENDER && EC.RENDER.app);
      if (!app2 || !app2.view || !app2.renderer) return null;
      const rect = app2.view.getBoundingClientRect();
      const sw = (app2.renderer && app2.renderer.screen && app2.renderer.screen.width) ? app2.renderer.screen.width : app2.renderer.width;
      const sh = (app2.renderer && app2.renderer.screen && app2.renderer.screen.height) ? app2.renderer.screen.height : app2.renderer.height;
      const rx = (clientX - rect.left) * (sw / Math.max(1, rect.width));
      const ry = (clientY - rect.top)  * (sh / Math.max(1, rect.height));
      return { rx, ry, rectW: rect.width, rectH: rect.height, sw, sh };
    } catch (_) {
      return null;
    }
  }

  // Stable API: pick a well index from DOM client coords.
  // Returns 0..5 or -1. Also stores last pick detail on EC.UI_STATE.inputDbg for snapshot/debug.
  EC.INPUT.pickWellIndexFromClientXY = function(clientX, clientY) {
    const app = (EC.RENDER && EC.RENDER.app) ? EC.RENDER.app : null;
    const map = _clientToRenderXY(clientX, clientY, app);
    if (!map) return { idx: -1, inside: false, rx: 0, ry: 0, dist: 0, r: 0 };

    const { rx, ry } = map;

    // Authoritative geometry comes from EC.RENDER.wellGeom (updated by render_wells).
    const geom = (EC.RENDER && EC.RENDER.wellGeom) ? EC.RENDER.wellGeom : null;
    if (!geom || !geom.cx || !geom.cy || !geom.hitR) {
      return { idx: -1, inside: false, rx, ry, cand: -1, err: 'wellGeom_not_ready' };
    }
    if (!geom.ready) {
      return { idx: -1, inside: false, rx, ry, cand: -1, err: 'wellGeom_not_ready' };
    }

    let bestCand = -1;
    let bestD2 = 1e18;
    for (let i=0;i<6;i++) {
      const cx = _num(geom.cx[i], NaN);
      const cy = _num(geom.cy[i], NaN);
      const r  = _num(geom.hitR[i], NaN);
      if (!isFinite(cx) || !isFinite(cy) || !isFinite(r) || r <= 0) continue;
      const dx = rx - cx;
      const dy = ry - cy;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; bestCand = i; }
    }

    if (bestCand < 0) {
      return { idx: -1, inside: false, rx, ry, cand: -1, err: 'wellGeom_not_ready' };
    }

    const cx = _num(geom.cx[bestCand], NaN);
    const cy = _num(geom.cy[bestCand], NaN);
    const r  = _num(geom.hitR[bestCand], NaN);
    const dist = Math.sqrt(bestD2);
    const inside = (r > 0) && (dist <= r);
    const out = { idx: inside ? bestCand : -1, inside, rx, ry, dist, r, cand: bestCand, cx, cy };
// Snapshot for debug (optional; main.js also logs)
    try {
      EC.UI_STATE = EC.UI_STATE || {};
      EC.UI_STATE.inputDbg = EC.UI_STATE.inputDbg || {};
      EC.UI_STATE.inputDbg.lastPickDetail = out;
    } catch (_) {}

    return out;
  };

  // Optional helpers: arm/resolve using existing EC.RENDER gesture pipeline
  EC.INPUT.armGestureFromPick = function(info) {
    // Returns boolean; writes a detailed reason snapshot to EC.INPUT._lastArm
    const nowT = (performance && performance.now) ? performance.now() : Date.now();
    const res = {
      ok: false,
      reason: 'unknown_false',
      active: 0,
      storedKey: '?',
      incomingKey: '?',
      storedWell: '?',
      incomingWell: '?',
      now: Math.floor(nowT),
    };

    try {
      if (!info) {
        res.reason = 'missing_state_container';
        EC.INPUT._lastArm = res;
        return false;
      }

      const R = (EC.RENDER = EC.RENDER || {});
      const gs = EC.INPUT.gestureState; const cur = gs;
      res.active = (cur && cur.active) ? 1 : 0;
      res.storedKey = (cur && cur.key) ? String(cur.key) : '?';
      res.storedWell = (cur && cur.well != null) ? String(cur.well) : '?';

      const kind = info.kind || 'touch';
      const incomingKey = (info.key != null) ? String(info.key) : '';
      const idx = (info.idx != null) ? info.idx : -1;
      res.incomingKey = incomingKey || '?';
      res.incomingWell = (idx != null) ? String(idx) : '?';

      // If a gesture is already active, block.
      if (cur && cur.active) {
        res.reason = 'already_active';
        EC.INPUT._lastArm = res;
        _writeArmLine(res);
        return false;
      }

      // Validate idx
      if (typeof idx !== 'number' || idx < 0 || idx > 5) {
        res.reason = 'invalid_idx';
        EC.INPUT._lastArm = res;
        _writeArmLine(res);
        return false;
      }

      // Validate key by kind
      if (kind === 'touch') {
        if (!incomingKey || !incomingKey.startsWith('t:')) {
          res.reason = 'key_mismatch_or_missing_key';
          EC.INPUT._lastArm = res;
          _writeArmLine(res);
          return false;
        }
      } else {
        if (!incomingKey || !incomingKey.startsWith('p:')) {
          res.reason = 'key_mismatch_or_missing_key';
          EC.INPUT._lastArm = res;
          _writeArmLine(res);
          return false;
        }
      }

      // Arm succeeds: store state used by resolve.
      const t0 = (info.t0 != null) ? info.t0 : nowT;
      const x0 = (info.clientX != null) ? info.clientX : 0;
      const y0 = (info.clientY != null) ? info.clientY : 0;
      const touchId = (kind === 'touch') ? (info.touchId != null ? info.touchId : (incomingKey.startsWith('t:') ? parseInt(incomingKey.slice(2), 10) : null)) : null;
      const pid = (kind === 'pointer') ? (info.pid != null ? info.pid : (incomingKey.startsWith('p:') ? parseInt(incomingKey.slice(2), 10) : -1)) : -1;

      Object.assign(EC.INPUT.gestureState, {
        active: true,
        kind,
        key: incomingKey,
        touchId,
        pid,
        well: idx,
        t0,
        x0,
        y0,
      });

      res.ok = true;
      res.reason = 'ok';
      res.active = 1;
      res.storedKey = incomingKey;
      res.storedWell = String(idx);
      EC.INPUT._lastArm = res;

      // Update always-visible gesture line
      try {
        const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
        if (D) D.gestureLine = `active=1 key=${incomingKey||'?'} well=${idx} x0/y0=${Math.round(x0)}/${Math.round(y0)} t0=${Math.round(t0)}`;
      } catch (_) {}

      _writeArmLine(res);
      return true;
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      res.ok = false;
      res.reason = 'missing_state_container';
      res.err = msg;
      EC.INPUT._lastArm = res;
      _writeArmLine(res);
      return false;
    }
  };

  function _writeArmLine(res) {
    try {
      const D = EC.UI_STATE && EC.UI_STATE.inputDbg;
      if (!D) return;
      const ok = res.ok ? 'Y' : 'N';
      D.armLine = `ok=${ok} reason=${res.reason||'unknown_false'} gsId=${(EC.INPUT.gestureState&&EC.INPUT.gestureState._id)||'?'} gsPtrOk=1 active=${res.active||0} storedKey=${res.storedKey||'?'} incomingKey=${res.incomingKey||'?'} storedWell=${res.storedWell||'?'} incomingWell=${res.incomingWell||'?'}${res.err ? (' err=' + res.err) : ''}`;
      if (Array.isArray(D.log)) {
        D.log.push(`${res.now||0} ARM ok=${ok} reason=${res.reason||'unknown_false'} gsId=${(EC.INPUT.gestureState&&EC.INPUT.gestureState._id)||'?'} active=${res.active||0} storedKey=${res.storedKey||'?'} incomingKey=${res.incomingKey||'?'} storedWell=${res.storedWell||'?'} incomingWell=${res.incomingWell||'?'}${res.err ? (' err=' + res.err) : ''}`);
        if (D.log.length > 180) D.log.splice(0, D.log.length - 180);
      }
    } catch (_) {}
  }

  EC.INPUT.resolveGestureFromKey = function(kind, key, clientX, clientY, tMs) {
    try {
      if (!EC.RENDER || typeof EC.RENDER._resolveGesture !== 'function') return null;
      return EC.RENDER._resolveGesture({ kind, key, clientX, clientY, t1: tMs }, (EC.RENDER && EC.RENDER.app) ? EC.RENDER.app : null);
    } catch (err) {
      return { err: (err && err.message) ? err.message : String(err) };
    }
  };


  // --- Fail-safe gesture lifecycle (mobile DOM end/cancel) ---
  // Canonical state lives in EC.INPUT.gestureState.
  // These helpers are instrumentation + state hygiene only (no gameplay/mechanics changes).

  function _idbgSafe() {
    try {
      EC.UI_STATE = EC.UI_STATE || {};
      EC.UI_STATE.inputDbg = EC.UI_STATE.inputDbg || {};
      const D = EC.UI_STATE.inputDbg;
      const enabled = (EC.INPUT && typeof EC.INPUT.isInputDebugEnabled === 'function') ? !!EC.INPUT.isInputDebugEnabled() : false;
      if (enabled) {
        if (!Array.isArray(D.log)) D.log = [];
      }
      return D;
    } catch (e) {
      return null;
    }
  }

  function _ilog(line) {
    try {
      const D = _idbgSafe();
      if (!D || !Array.isArray(D.log)) return;
      const ts = (typeof performance !== 'undefined' && performance.now) ? Math.floor(performance.now()) : Date.now();
      D.log.push(ts + ' ' + line);
      if (D.log.length > 260) D.log.splice(0, D.log.length - 260);
    } catch (e) {}
  }

  function _setResolveLine(line, status) {
    try {
      const D = _idbgSafe();
      if (!D || !Array.isArray(D.log)) return;
      D.resolveLine = String(line || '');
      D.lastResolve = D.resolveLine;
      D.lastResolveStatus = String(status || '');
    } catch (e) {}
  }

  function _kv(meta) {
    try {
      if (!meta) return '';
      const parts = [];
      for (const k in meta) {
        if (!Object.prototype.hasOwnProperty.call(meta, k)) continue;
        let v = meta[k];
        if (v == null) v = '';
        v = String(v);
        if (v.length > 80) v = v.slice(0, 80) + '…';
        parts.push(k + '=' + v);
      }
      return parts.join(' ');
    } catch (e) {
      return '';
    }
  }

  // ------------------------------------------------------------
  // Canonical release resolver (tap / flick / long-press drag)
  // Shared by DOM pointer release and DOM touch end/cancel.
  // ------------------------------------------------------------
  function resolveGestureOnRelease(st, endClientX, endClientY, endMs, kindTag) {
    const gsId = (st && st._id) ? st._id : '?';
    const storedKey = (st && st.key) ? st.key : '?';
    let status = 'resolved_exception';
    let resolveLine = '';

    try {
      if (!st || !st.active) {
        status = 'resolved_no_gesture';
        resolveLine = `hasGesture=0 reason=no_gesture`;
        _setResolveLine(resolveLine, status);
        _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=no_gesture`);
        return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: 0 };
      }

      const cx = endClientX;
      const cy = endClientY;
      if (cx == null || cy == null || st.x0 == null || st.y0 == null || st.t0 == null) {
        status = 'resolved_missing_coords';
        resolveLine = `hasGesture=0 reason=missing_coords key=${storedKey || '?'} cx=${cx} cy=${cy}`;
        _setResolveLine(resolveLine, status);
        _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=missing_coords`);
        try { EC.INPUT.clearGesture(status, { why: kindTag || '', key: storedKey || '?' }); } catch (_) {}
        return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (st.active ? 1 : 0) };
      }

      const now = (endMs != null) ? endMs : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
      const dt = Math.max(0, now - st.t0);
      const dx = (cx - st.x0);
      const dy = (cy - st.y0);

      const THRESH_MS = 400;
      const THRESH_PX = 18;
      const STEP_UNIT = 5;

      // DRAG tuning (slow swipe / press-and-drag)
      const DRAG_PX_PER_STEP = 28;   // px per 5-step (tunable)
      const DRAG_MAX_STEPS   = 16;   // max multiplier (tunable) => max change = 80
      const HOLD_MS          = 750;  // long-press threshold (tunable)
      const HOLD_MULT        = 2.0;  // long-press acceleration (tunable)

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const distAxis = Math.max(absDx, absDy);

      const flick = (dt <= THRESH_MS) && (distAxis >= THRESH_PX);
      const drag  = (!flick) && (distAxis >= THRESH_PX);

      const _clampI = (v, lo, hi) => Math.max(lo, Math.min(hi, v|0));

      let cls = flick ? 'FLICK' : (drag ? 'DRAG' : 'TAP');
      let steps = flick ? 1 : (drag ? _clampI(Math.round(distAxis / DRAG_PX_PER_STEP), 1, DRAG_MAX_STEPS) : 0);
      let held = 0;
      if (drag && steps > 0 && dt >= HOLD_MS) {
        held = 1;
        steps = _clampI(Math.round(steps * HOLD_MULT), 1, DRAG_MAX_STEPS);
      }

      let dir = 'NONE';
      let applied = 'ok';
      let applyReason = 'ok';
      let dA = 0, dS = 0;
      let cost = 0;
      const dist = distAxis;
      const hold = held;

      const w = (st.well != null) ? st.well : -1;
      if (w < 0 || w > 5) {
        applied = 'fail';
        applyReason = 'invalid_idx';
      } else {
        // Tutorial gating: block non-focus interactions (and optionally block swipes entirely during button steps).
        const tutOn = !!(EC.SIM && EC.SIM.tutorialActive);
        const allow = tutOn && (typeof EC.SIM._tutAllowWell === 'number') ? (EC.SIM._tutAllowWell|0) : -1;
        const blockSwipes = tutOn ? !!EC.SIM._tutBlockSwipes : false;

        const tutGateTap = tutOn && (allow >= 0) && (w !== allow);
        const tutGateSwipe = tutOn && ((blockSwipes && cls !== 'TAP') || ((allow >= 0) && (w !== allow)));

        if (cls === 'TAP') {
          // TAP selects the well only (no sim change). In tutorial mode, only the allowed well can be selected.
          applied = '0';
          applyReason = tutGateTap ? 'tut_gate' : 'tap';
          if (!tutGateTap) {
            try { if (EC.SIM) EC.SIM.selectedWellIndex = w; } catch (_) {}
          }
        } else if (tutGateSwipe) {
          applied = '0';
          applyReason = (blockSwipes && cls !== 'TAP') ? 'tut_block' : 'tut_gate';
        } else {
          // FLICK and DRAG both route through the same flickStep() path for consistent energy/cost.
          dA = 0; dS = 0;
          const stepAmt = STEP_UNIT * (steps || 1);

          if (absDx >= absDy) {
            dir = (dx >= 0) ? 'RIGHT' : 'LEFT';
            dS = (dx >= 0) ? stepAmt : -stepAmt;
          } else {
            dir = (dy <= 0) ? 'UP' : 'DOWN';
            dA = (dy <= 0) ? stepAmt : -stepAmt;
          }

          // Long-press + drag: snap to extreme (max out) on the affected stat.
          if (hold && cls === 'DRAG') {
            const A0c = (EC.SIM && EC.SIM.wellsA) ? (EC.SIM.wellsA[w] || 0) : 0;
            const S0c = (EC.SIM && EC.SIM.wellsS) ? (EC.SIM.wellsS[w] || 0) : 0;

            if (dir === 'RIGHT') {
              const tgt = 100;
              dS = (tgt - S0c);
              dA = 0;
            } else if (dir === 'LEFT') {
              const tgt = -100;
              dS = (tgt - S0c);
              dA = 0;
            } else if (dir === 'UP') {
              const tgt = 100;
              dA = (tgt - A0c);
              dS = 0;
            } else if (dir === 'DOWN') {
              const tgt = 25;
              dA = (tgt - A0c);
              dS = 0;
            }

            // Update steps for debug readability (how many 5-units worth of change).
            steps = _clampI(Math.max(1, Math.round(Math.abs((Math.abs(dA) > 0) ? dA : dS) / STEP_UNIT)), 1, DRAG_MAX_STEPS);
          }

          try { if (EC.SIM) EC.SIM.selectedWellIndex = w; } catch (_) {}

          // Tutorial instrumentation: record opposite spin before/after for step checks.
          let oppIndex = -1;
          let oppSpinBefore = 0;
          try {
            if (EC.SIM && EC.SIM.tutorialActive && EC.CONST && Array.isArray(EC.CONST.OPP)) {
              oppIndex = EC.CONST.OPP[w];
              if (oppIndex != null && oppIndex >= 0 && oppIndex < 6) oppSpinBefore = (EC.SIM.wellsS && typeof EC.SIM.wellsS[oppIndex] === 'number') ? EC.SIM.wellsS[oppIndex] : 0;
            }
          } catch (_) {}

          cost = 0;
          const fn = (EC.ACTIONS && typeof EC.ACTIONS.flickStep === 'function') ? EC.ACTIONS.flickStep : null;
          if (fn) {
            try {
              const res = fn(w, dA, dS);
              const ok = !!(res && res.ok);
              cost = (res && typeof res.cost === 'number') ? res.cost : 0;
              if (!ok) {
                applied = 'fail';
                applyReason = (res && res.reason) ? res.reason : 'apply_failed';
                // SFX: error beep ONLY for lack-of-energy swipe/drag attempts.
                try {
                  if (applyReason === 'noenergy' && EC.SFX && typeof EC.SFX.play === 'function') {
                    EC.SFX.play('bong_001');
                  }
                } catch (_) {}
              }

              // Record the last successful tutorial action.
              try {
                if (EC.SIM && EC.SIM.tutorialActive && ok) {
                  let oppSpinAfter = 0;
                  if (oppIndex != null && oppIndex >= 0 && oppIndex < 6) {
                    oppSpinAfter = (EC.SIM.wellsS && typeof EC.SIM.wellsS[oppIndex] === 'number') ? EC.SIM.wellsS[oppIndex] : 0;
                  }
                  EC.SIM._tutLastAction = {
                    kind: 'SWIPE',
                    well: w,
                    dA: dA,
                    dS: dS,
                    cost: cost,
                    oppIndex: oppIndex,
                    oppSpinBefore: oppSpinBefore,
                    oppSpinAfter: oppSpinAfter,
                  };
                }
              } catch (_) {}
            } catch (_) {
              applied = 'fail';
              applyReason = 'apply_throw';
            }
          } else {
            applied = 'fail';
            applyReason = 'missing_flickStep';
          }
        }
      }

      status = (cls === 'FLICK') ? 'resolved_ok_flick' : ((cls === 'DRAG') ? 'resolved_ok_drag' : 'resolved_ok_tap');
      resolveLine = `hasGesture=1 key=${storedKey || '?'} dt=${dt.toFixed(0)} dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} dist=${dist.toFixed(1)} class=${cls} dir=${dir} steps=${steps} dA=${dA} dS=${dS} ok=${(applied === 'ok') ? 1 : 0} cost=${(typeof cost === 'number') ? cost : 0} reason=${applyReason}`;
      _setResolveLine(resolveLine, status);
      _ilog(`RESOLVE_OK: gsId=${gsId} dt=${dt.toFixed(0)} dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} dist=${dist.toFixed(1)} class=${cls} dir=${dir} steps=${steps} dA=${dA} dS=${dS} ok=${(applied === 'ok') ? 1 : 0} cost=${(typeof cost === 'number') ? cost : 0} reason=${applyReason}`);

      // Always clear after an end/cancel resolve attempt.
      try { EC.INPUT.clearGesture('resolved_ok', { status: status, why: kindTag || '' }); } catch (_) {}

      _ilog(`RESOLVE_RETURN: cls=${cls} dir=${dir} steps=${steps} dA=${dA} dS=${dS} ok=${(applied === 'ok') ? 1 : 0} cost=${(typeof cost === 'number') ? cost : 0} reason=${applyReason} status=${status} activeAfter=${st.active ? 1 : 0} resolveLineSet=Y`);
      return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (st.active ? 1 : 0) };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      status = 'resolved_exception';
      resolveLine = `hasGesture=0 reason=exception msg=${msg}`;
      _setResolveLine(resolveLine, status);
      _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=exception msg=${msg}`);
      try { EC.INPUT.clearGesture('resolved_exception', { msg: msg, why: kindTag || '' }); } catch (_) {}
      _ilog(`RESOLVE_RETURN: gsId=${gsId} status=${status} activeAfter=${(st && st.active) ? 1 : 0} resolveLineSet=Y`);
      return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (st && st.active) ? 1 : 0 };
    }
  }

  if (typeof EC.INPUT.clearGesture !== 'function') {
    EC.INPUT.clearGesture = function clearGesture(reason, meta) {
      const gs = EC.INPUT.gestureState;
      if (!gs) return false;
      const prevKey = gs.key || '?';
      const prevWell = (gs.well != null) ? gs.well : '?';
      const prevActive = !!gs.active;

      gs.active = 0;
      gs.key = '';
      gs.kind = '';
      gs.well = -1;
      gs.pid = -1;
      gs.touchId = null;
      gs.x0 = 0;
      gs.y0 = 0;
      gs.t0 = 0;

      try {
        const D = _idbgSafe();
        if (D) {
          D.gestureLine = `active=0 key=? well=? x0/y0=? t0=?`;
          D.lastGestureClear = `reason=${reason || ''} prevActive=${prevActive ? 1 : 0} prevKey=${prevKey} prevWell=${prevWell}`;
        }
      } catch (e) {}

      _ilog(`RESOLVE_CLEAR: reason=${reason || ''} active=0 key=? well=? prevActive=${prevActive ? 1 : 0} prevKey=${prevKey} prevWell=${prevWell} ${_kv(meta)}`);
      return true;
    };
  }

  if (typeof EC.INPUT.resolveDomTouchEnd !== 'function') {
    EC.INPUT.resolveDomTouchEnd = function resolveDomTouchEnd(domEv, why) {
      const gs = EC.INPUT.gestureState;
      const gsId = (gs && gs._id) ? gs._id : '?';

      let status = 'resolved_exception';
      let resolveLine = '';

      // Snapshot-ish fields for the Copy Input Log header.
      try {
        const D = _idbgSafe();
        if (D) D.lastResolveCall = `why=${why || ''} gsId=${gsId}`;
      } catch (e) {}

      _ilog(`RESOLVE_ENTER: why=${why || ''} gsId=${gsId} active=${(gs && gs.active) ? 1 : 0} storedKey=${(gs && gs.key) ? gs.key : '?'}`);

      try {
        if (!gs || !gs.active) {
          status = 'resolved_no_gesture';
          resolveLine = `hasGesture=0 reason=no_gesture`;
          _setResolveLine(resolveLine, status);
          _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=no_gesture`);
          _ilog(`RESOLVE_RETURN: gsId=${gsId} status=${status} activeAfter=0 resolveLineSet=Y`);
          return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: 0 };
        }

        // Compute endKey + end client coords.
        let endKey = '?:?';
        let cx = null, cy = null;
        let endTouchId = null;

        const isTouchEvt = !!(domEv && (domEv.changedTouches || domEv.touches));
        const storedKey = gs.key || '';

        if (gs.kind === 'touch') {
          // Prefer matching the stored touchId.
          let ct = null;
          if (domEv && domEv.changedTouches && domEv.changedTouches.length) {
            for (let i = 0; i < domEv.changedTouches.length; i++) {
              const t = domEv.changedTouches[i];
              if (t && gs.touchId != null && t.identifier === gs.touchId) { ct = t; break; }
            }
            if (!ct) ct = domEv.changedTouches[0];
          }
          if (ct && ct.identifier != null) {
            endTouchId = ct.identifier;
            endKey = 't:' + endTouchId;
            cx = ct.clientX;
            cy = ct.clientY;
          } else {
            endKey = 't:?';
          }

          // Require matching key.
          if (endKey !== storedKey) {
            status = (endKey === 't:?') ? 'resolved_touch_not_found' : 'resolved_key_mismatch';
            resolveLine = `hasGesture=0 reason=${status} storedKey=${storedKey || '?'} endKey=${endKey}`;
            _setResolveLine(resolveLine, status);
            _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=${status} storedKey=${storedKey || '?'} endKey=${endKey}`);
            EC.INPUT.clearGesture(status, { why: why || '', storedKey: storedKey || '?', endKey: endKey });
            _ilog(`RESOLVE_RETURN: gsId=${gsId} status=${status} activeAfter=${gs.active ? 1 : 0} resolveLineSet=Y`);
            return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (gs.active ? 1 : 0) };
          }

        } else if (gs.kind === 'pointer') {
          const pid = (domEv && domEv.pointerId != null) ? domEv.pointerId : null;
          endKey = (pid != null) ? ('p:' + pid) : 'p:?';
          cx = domEv ? domEv.clientX : null;
          cy = domEv ? domEv.clientY : null;
          if (endKey !== storedKey) {
            status = 'resolved_key_mismatch';
            resolveLine = `hasGesture=0 reason=key_mismatch storedKey=${storedKey || '?'} endKey=${endKey}`;
            _setResolveLine(resolveLine, status);
            _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=key_mismatch storedKey=${storedKey || '?'} endKey=${endKey}`);
            EC.INPUT.clearGesture(status, { why: why || '', storedKey: storedKey || '?', endKey: endKey });
            _ilog(`RESOLVE_RETURN: gsId=${gsId} status=${status} activeAfter=${gs.active ? 1 : 0} resolveLineSet=Y`);
            return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (gs.active ? 1 : 0) };
          }

        } else {
          status = 'resolved_key_mismatch';
          resolveLine = `hasGesture=0 reason=unknown_kind storedKey=${storedKey || '?'} kind=${gs.kind || '?'}`;
          _setResolveLine(resolveLine, status);
          _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=unknown_kind kind=${gs.kind || '?'}`);
          EC.INPUT.clearGesture(status, { why: why || '', storedKey: storedKey || '?' });
          _ilog(`RESOLVE_RETURN: gsId=${gsId} status=${status} activeAfter=${gs.active ? 1 : 0} resolveLineSet=Y`);
          return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (gs.active ? 1 : 0) };
        }

        if (cx == null || cy == null || gs.x0 == null || gs.y0 == null || gs.t0 == null) {
          status = 'resolved_missing_coords';
          resolveLine = `hasGesture=0 reason=missing_coords key=${storedKey || '?'} cx=${cx} cy=${cy}`;
          _setResolveLine(resolveLine, status);
          _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=missing_coords`);
          EC.INPUT.clearGesture(status, { why: why || '', key: storedKey || '?' });
          _ilog(`RESOLVE_RETURN: gsId=${gsId} status=${status} activeAfter=${gs.active ? 1 : 0} resolveLineSet=Y`);
          return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (gs.active ? 1 : 0) };
        }

        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        return resolveGestureOnRelease(gs, cx, cy, now, why || '');

      } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        status = 'resolved_exception';
        resolveLine = `hasGesture=0 reason=exception msg=${msg}`;
        _setResolveLine(resolveLine, status);
        _ilog(`RESOLVE_EARLY: gsId=${gsId} reason=exception msg=${msg}`);
        try { EC.INPUT.clearGesture('resolved_exception', { msg: msg, why: why || '' }); } catch (e) {}
        _ilog(`RESOLVE_RETURN: gsId=${gsId} status=${status} activeAfter=${(gs && gs.active) ? 1 : 0} resolveLineSet=Y`);
        return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (gs && gs.active) ? 1 : 0 };
      }
    };
  }

  // Stage-level pointerup gesture resolver (transplanted from main.js)
  // Keeps Pixi stage fallback localized to the input system (no behavior changes).
  function _pidFromEvStage(ev) {
    return (ev && ev.pointerId != null) ? ev.pointerId : (ev && ev.data && ev.data.pointerId != null ? ev.data.pointerId : -1);
  }

  EC.INPUT.resolveActiveGestureFromStagePointerUp = EC.INPUT.resolveActiveGestureFromStagePointerUp || function resolveActiveGestureFromStagePointerUp(ev, isOutside) {
  // NOTE: Stage fallback should only resolve pointer-based gestures.
  // Touch gestures are resolved via DOM touchend/touchcancel.
  const st = EC.INPUT.gestureState;
  if (!st || !st.active) return;
  if (st.kind && st.kind !== 'pointer') return;

  // Match pointerId when available.
  let pid = _pidFromEvStage(ev);
  try {
    const oePid = (ev && ev.data && ev.data.originalEvent && ev.data.originalEvent.pointerId != null) ? ev.data.originalEvent.pointerId : null;
    if ((pid == null || pid < 0) && (oePid != null)) pid = oePid;
  } catch (_) {}
  if (st.pid != null && st.pid >= 0 && pid != null && pid >= 0 && pid !== st.pid) return;

  const getXY = EC.INPUT._getClientXY;
  const xy = (getXY ? getXY(ev) : null);

  // Require real DOM client coords (avoid Pixi global fallback, which is not in client space).
  const oe = xy ? xy.oe : null;
  const hasDomClient = !!(
    (oe && typeof oe.clientX === 'number' && typeof oe.clientY === 'number') ||
    (oe && oe.changedTouches && oe.changedTouches[0] && typeof oe.changedTouches[0].clientX === 'number' && typeof oe.changedTouches[0].clientY === 'number') ||
    (oe && oe.touches && oe.touches[0] && typeof oe.touches[0].clientX === 'number' && typeof oe.touches[0].clientY === 'number') ||
    (ev && typeof ev.clientX === 'number' && typeof ev.clientY === 'number')
  );

  const x = xy ? xy.x : null;
  const y = xy ? xy.y : null;

  try { if (oe && typeof oe.preventDefault === 'function') oe.preventDefault(); } catch (_) {}

  if (!hasDomClient || x == null || y == null) {
    // If we can't resolve client coords, clear to avoid a stuck gesture.
    try {
      if (EC.INPUT && typeof EC.INPUT.clearGesture === 'function') EC.INPUT.clearGesture('resolved_missing_coords', { why: 'stage_pointerup' });
      else { st.active = 0; st.key = ''; }
    } catch (_) {}
    return;
  }

  const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  resolveGestureOnRelease(st, x, y, nowMs, isOutside ? 'stage_upoutside' : 'stage_up');
};

})();
