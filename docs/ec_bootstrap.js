/*
Emotioncraft — bootstrap + hardening helpers (no gameplay behavior changes)
- Defines EC.UI_STATE and EC.RENDER_STATE persistent containers
- Defines EC.assertReady / EC.assert (debug-only)
- Adds a friendly fatal overlay for startup/runtime errors
*/

(() => {
  const EC = (window.EC = window.EC || {});

  // Central build id (packaging convention)
  EC.BUILD_ID = EC.BUILD_ID || 'v0_2_103_passD';

  // Persistent cross-frame containers (hardening only; no gameplay/UI behavior changes)
  // Anything that must survive across frames/reset/level changes should live here.
  EC.UI_STATE = EC.UI_STATE || {
    prev: {},
    selectedWellIndex: 0,
    lastPreview: null,
    debugOn: false,
    debugStrict: false,
  };

  // Clamp/normalize UI selection (canonical selected well lives in UI_STATE).
  try {
    const U = EC.UI_STATE || (EC.UI_STATE = {});
    let idx = (typeof U.selectedWellIndex === 'number') ? (U.selectedWellIndex | 0) : 0;
    if (!(idx >= 0 && idx < 6)) idx = 0;
    U.selectedWellIndex = idx;
  } catch (_) {
    /* never throw */
  }

  EC.RENDER_STATE = EC.RENDER_STATE || {
    flags: {},
    layout: {},
    mvpPrevSpinT: null,
  };


  // Minimal module registry (best-effort; no gameplay impact)
  EC._modules = EC._modules || {};
  EC._registerModule = EC._registerModule || function _registerModule(name, meta) {
    try {
      if (!name) return;
      const map = (EC._modules = EC._modules || {});
      const rec = meta ? Object.assign({}, meta) : {};
      rec.name = String(name);
      rec.provides = Array.isArray(rec.provides) ? rec.provides : [];
      rec.loadedAt = (typeof rec.loadedAt === 'number') ? rec.loadedAt : Date.now();
      map[rec.name] = rec;
      if (EC.UI_STATE && EC.UI_STATE.debugOn) {
        console.log('[EC] module registered:', rec.name);
      }

      // Dependency queue pump hook (structural only): allow deferred init hooks to resolve
      // as modules register. Safe no-op when EC.require is unused.
      try {
        if (typeof EC._flushRequireQueue === 'function') EC._flushRequireQueue('module:' + rec.name);
      } catch (_) {
        /* never throw */
      }
    } catch (_) {
      /* never throw */
    }
  };

  // Safe wrapper: runs fn in try/catch; warns only in debugOn.
  EC.safe = EC.safe || function safe(label, fn) {
    try {
      if (typeof fn !== 'function') return undefined;
      return fn();
    } catch (err) {
      try {
        if (EC.UI_STATE && EC.UI_STATE.debugOn) {
          console.warn('[EC][SAFE]', label || 'safe', err);
        }
      } catch (_) {}
      return undefined;
    }
  };

  // Build / handoff metadata (non-functional)
  EC.BUILD = EC.BUILD || {
    name: 'emotioncraft-psyche-mvp',
    tag: 'v0_2_103_passD_pass7',
    updatedAt: '2026-02-13',
    notes: 'pass7: plans/progression (Tranquility/Transcendence) + per-template quirk ramp + break reset + Copy Debug.',
  };

  try { console.log('[EC] Build: ' + EC.BUILD_ID); } catch (e) {}
  try { console.log('[EC] Boot OK: build ' + EC.BUILD_ID); } catch (e) {}

  // Debug-only module presence log (helps confirm legacy modules are not loaded).
  // Enabled only when EC.UI_STATE.debugOn === true.
  if (EC.UI_STATE && EC.UI_STATE.debugOn) {
    try {
      console.log('[EC] Modules present:', {
        CONST: !!EC.CONST,
        DISP: !!EC.DISP,
        BREAK: !!EC.BREAK,
        PATIENTS: !!EC.PATIENTS,
        UI: !!EC.UI,
        UI_CONTROLS: !!EC.UI_CONTROLS,
        UI_HUD: !!EC.UI_HUD,
        RENDER: !!EC.RENDER,
        RENDER_WELLS_INIT: !!EC.RENDER_WELLS_INIT,
        RENDER_WELLS_UPDATE: !!EC.RENDER_WELLS_UPDATE,
      });
    } catch (e) {}
  }

  // Internal helper: safe nested path resolver
  // Supports dot paths like "EC.DATA.ROSTER".
  // (Optional trivial bracket support: foo[0], foo['bar'])
  EC._getPath = EC._getPath || function _getPath(pathString) {
    try {
      if (pathString == null) return undefined;
      let s = String(pathString).trim();
      if (!s) return undefined;

      // Trivial bracket support: a[0] -> a.0, a['b'] -> a.b
      s = s
        .replace(/\[(\d+)\]/g, '.$1')
        .replace(/\[['\"]([^'\"]+)['\"]\]/g, '.$1');

      const parts = s.split('.').filter(Boolean);
      let cur = window;
      for (let i = 0; i < parts.length; i++) {
        const k = parts[i];
        cur = (cur != null) ? cur[k] : undefined;
      }
      return cur;
    } catch (_) {
      return undefined;
    }
  };

  EC._missingPaths = EC._missingPaths || function _missingPaths(paths) {
    const list = [];
    const arr = Array.isArray(paths) ? paths : (paths != null ? [paths] : []);
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const v = EC._getPath(p);
      if (v === undefined || v === null) list.push(String(p));
    }
    return list;
  };

  // Internal helper: require presence of expected symbols
  EC._require = function _require(stage, paths) {
    const missing = EC._missingPaths(paths);
    if (missing.length) {
      const msg = '[Emotioncraft] Startup check failed at ' + stage + '. Missing: ' + missing.join(', ');
      throw new Error(msg);
    }
    return missing;
  };

  // Public: call this after scripts load to ensure expected surface exists.
  // Returns [] when satisfied; throws with a detailed missing list when not.
  EC.assertReady = function assertReady(stage, paths) {
    return EC._require(stage, paths);
  };

  // Deferred init helper (structural only): queue a callback until deps exist.
  // - Runs synchronously if deps already present.
  // - Otherwise retries until deps appear or a timeout triggers a fatal throw.
  EC._requireQueue = EC._requireQueue || [];
  EC._requirePumpOn = EC._requirePumpOn || false;

  EC._flushRequireQueue = EC._flushRequireQueue || function _flushRequireQueue(_reason) {
    const q = EC._requireQueue;
    if (!q || !q.length) return 0;

    let ran = 0;
    for (let i = q.length - 1; i >= 0; i--) {
      const it = q[i];
      if (!it || it._done) { q.splice(i, 1); continue; }

      const missing = EC._missingPaths(it.paths);
      if (!missing.length) {
        q.splice(i, 1);
        it._done = 1;
        ran++;
        it.fn();
        continue;
      }

      const age = Date.now() - (it.t0 || Date.now());
      const timeoutMs = (typeof it.timeoutMs === 'number' && isFinite(it.timeoutMs) && it.timeoutMs > 0) ? it.timeoutMs : 2500;
      if (age > timeoutMs) {
        const stage = it.stage || 'require';
        const msg = '[Emotioncraft] Require timed out at ' + stage + '. Missing: ' + missing.join(', ');
        throw new Error(msg);
      }
    }
    return ran;
  };

  EC._startRequirePump = EC._startRequirePump || function _startRequirePump() {
    if (EC._requirePumpOn) return;
    const q = EC._requireQueue;
    if (!q || !q.length) return;
    EC._requirePumpOn = true;

    const step = () => {
      EC._requirePumpOn = false;
      // Note: _flushRequireQueue may throw (fatal) on timeout.
      EC._flushRequireQueue('pump');
      if (EC._requireQueue && EC._requireQueue.length) EC._startRequirePump();
    };

    try {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step);
      else setTimeout(step, 0);
    } catch (_) {
      setTimeout(step, 0);
    }
  };

  EC.require = EC.require || function require(paths, fn, opts) {
    const pArr = Array.isArray(paths) ? paths : (paths != null ? [paths] : []);
    const stage = (opts && opts.stage) ? String(opts.stage) : 'require';
    const timeoutMs = (opts && typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 2500;

    // Run immediately when ready (synchronous when deps already exist).
    const missing = EC._missingPaths(pArr);
    if (!missing.length) {
      if (typeof fn === 'function') fn();
      return true;
    }

    // Otherwise queue for later.
    if (typeof fn === 'function') {
      EC._requireQueue.push({
        paths: pArr.slice(),
        fn,
        stage,
        timeoutMs,
        t0: Date.now(),
        _done: 0,
      });
      EC._startRequirePump();
    }
    return false;
  };

  // Unified debug-only assertion helper.
  // - In normal mode (default), this is a no-op (no logs, no throws).
  // - In debug mode (EC.UI_STATE.debugOn === true), it logs warnings.
  // - If EC.UI_STATE.debugStrict === true, it throws (explicit opt-in).
  EC.assert = EC.assert || function ecAssert(condition, message) {
    try {
      const st = EC.UI_STATE || {};
      if (!st.debugOn) return true;
      if (condition) return true;
      const msg = message || 'Assertion failed';
      console.warn('[EC][ASSERT]', msg);
      if (st.debugStrict) throw new Error(msg);
    } catch (_) {
      // Never break normal play.
    }
    return false;
  };

  // Friendly overlay for load/runtime failures (only shows on error)
  function showFatalOverlay(errText) {
    try {
      const existing = document.getElementById('ec-fatal');
      if (existing) return;
      const el = document.createElement('div');
      el.id = 'ec-fatal';
      el.style.position = 'fixed';
      el.style.inset = '12px';
      el.style.zIndex = '999999';
      el.style.background = 'rgba(10,12,16,0.92)';
      el.style.border = '1px solid rgba(255,255,255,0.15)';
      el.style.borderRadius = '12px';
      el.style.padding = '16px';
      el.style.color = '#fff';
      el.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      el.style.whiteSpace = 'pre-wrap';
      el.style.overflow = 'auto';
      el.innerText =
        'Emotioncraft failed to start.\n\n' +
        errText +
        '\n\nOpen DevTools → Console for details.';
      document.body.appendChild(el);
    } catch (_) {
      /* ignore */
    }
  }

  window.addEventListener('error', (e) => {
    // Only surface the first fatal error
    const msg = (e && (e.message || (e.error && e.error.message))) || String(e);
    showFatalOverlay(msg);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const msg = (e && e.reason && (e.reason.stack || e.reason.message)) || String(e.reason || e);
    showFatalOverlay(msg);
  });
})();
