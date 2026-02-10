// systems_input.js — stable input API for manual well picking + gesture arm/resolve (no mechanics changes)
(() => {
  const EC = (window.EC = window.EC || {});
  EC.INPUT = EC.INPUT || {};


  // Canonical gesture state (single source of truth)
  // Never replace this object reference; mutate fields only.
  if (!EC.INPUT.gestureState) {
    const rid = (Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6)).slice(0, 8);
    EC.INPUT.gestureState = { _id: rid, active: 0, key: '', kind: '', well: -1, x0: 0, y0: 0, t0: 0, touchId: null, pid: -1, wellId: null };
  }

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
  // Returns 0..5 or -1. Also stores last pick detail on EC.UI_STATE.inputDebug for snapshot/debug.
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
      EC.UI_STATE.inputDebug = EC.UI_STATE.inputDebug || {};
      EC.UI_STATE.inputDebug.lastPickDetail = out;
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
        wellId: (info.wellId != null ? info.wellId : null),
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
      if (!Array.isArray(D.log)) D.log = [];
      return D;
    } catch (e) {
      return null;
    }
  }

  function _ilog(line) {
    try {
      const D = _idbgSafe();
      if (!D) return;
      const ts = (typeof performance !== 'undefined' && performance.now) ? Math.floor(performance.now()) : Date.now();
      D.log.push(ts + ' ' + line);
      if (D.log.length > 260) D.log.splice(0, D.log.length - 260);
    } catch (e) {}
  }

  function _setResolveLine(line, status) {
    try {
      const D = _idbgSafe();
      if (!D) return;
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
        const dt = Math.max(0, now - gs.t0);
        const dx = (cx - gs.x0);
        const dy = (cy - gs.y0);

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

        const w = (gs.well != null) ? gs.well : -1;
        if (w < 0 || w > 5) {
          applied = 'fail';
          applyReason = 'invalid_idx';
        } else if (cls === 'TAP') {
          // TAP selects the well only (no sim change).
          applied = '0';
          applyReason = 'tap';
          try { if (EC.SIM) EC.SIM.selectedWellIndex = w; } catch (e) {}
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

          

          // Long-press + drag: snap to extreme ("max out") on the affected stat.
          // This is input interpretation only; apply still routes through the same flickStep() path.
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
try { if (EC.SIM) EC.SIM.selectedWellIndex = w; } catch (e) {}

          cost = 0;
          if (EC.UI_CONTROLS && typeof EC.UI_CONTROLS.flickStep === 'function') {
            try {
              const res = EC.UI_CONTROLS.flickStep(w, dA, dS);
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
            } catch (e) {
              applied = 'fail';
              applyReason = 'apply_throw';
            }
          } else {
            applied = 'fail';
            applyReason = 'missing_flickStep';
          }
        }

        status = (cls === 'FLICK') ? 'resolved_ok_flick' : ((cls === 'DRAG') ? 'resolved_ok_drag' : 'resolved_ok_tap');
        resolveLine = `hasGesture=1 key=${storedKey || '?'} dt=${dt.toFixed(0)} dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} dist=${dist.toFixed(1)} class=${cls} dir=${dir} steps=${steps} dA=${dA} dS=${dS} ok=${(applied === 'ok') ? 1 : 0} cost=${(typeof cost === 'number') ? cost : 0} reason=${applyReason}`;
        _setResolveLine(resolveLine, status);
        _ilog(`RESOLVE_OK: gsId=${gsId} dt=${dt.toFixed(0)} dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} dist=${dist.toFixed(1)} class=${cls} dir=${dir} steps=${steps} dA=${dA} dS=${dS} ok=${(applied === 'ok') ? 1 : 0} cost=${(typeof cost === 'number') ? cost : 0} reason=${applyReason}`);

        // Always clear after an end/cancel resolve attempt.
        EC.INPUT.clearGesture('resolved_ok', { status: status, why: why || '' });

        _ilog(`RESOLVE_RETURN: cls=${cls} dir=${dir} steps=${steps} dA=${dA} dS=${dS} ok=${(applied === 'ok') ? 1 : 0} cost=${(typeof cost === 'number') ? cost : 0} reason=${applyReason} status=${status} activeAfter=${gs.active ? 1 : 0} resolveLineSet=Y`);
        return { status: status, resolveLine: resolveLine, resolveLineSet: true, activeAfter: (gs.active ? 1 : 0) };

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

})();
