/*
Emotioncraft — bootstrap + hardening helpers (no gameplay behavior changes)
- Defines EC.UI_STATE and EC.RENDER_STATE persistent containers
- Defines EC.assertReady / EC.assert (debug-only)
- Adds a friendly fatal overlay for startup/runtime errors
*/

(() => {
  const EC = (window.EC = window.EC || {});

  // Central build id (packaging convention)
  EC.BUILD_ID = EC.BUILD_ID || 'v0_2_79_lobby_hotfix';

  // Persistent cross-frame containers (hardening only; no gameplay/UI behavior changes)
  // Anything that must survive across frames/reset/level changes should live here.
  EC.UI_STATE = EC.UI_STATE || {
    prev: {},
    lastPreview: null,
    debugOn: false,
    debugStrict: false,
  };

  EC.RENDER_STATE = EC.RENDER_STATE || {
    flags: {},
    layout: {},
    mvpPrevSpinT: null,
  };

  // Build / handoff metadata (non-functional)
  EC.BUILD = EC.BUILD || {
    name: 'emotioncraft-mvp-redesign',
    chunk: 5,
    tag: 'neighbor-throttle-spin-glyph-persist',
    updatedAt: '2026-02-03',
    notes: 'MVP redesign: 6 wells around psyche, no inventory; selection+apply panel; neighbor influence throttled.',
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

  // Internal helper: require presence of expected symbols
  EC._require = EC._require || function _require(stage, paths) {
    const missing = [];
    for (let i = 0; i < (paths || []).length; i++) {
      const p = paths[i];
      let cur = window;
      const parts = String(p).split('.');
      for (let j = 0; j < parts.length; j++) {
        cur = cur ? cur[parts[j]] : undefined;
      }
      if (cur === undefined || cur === null) missing.push(p);
    }
    if (missing.length) {
      const msg = '[Emotioncraft] Startup check failed at ' + stage + '. Missing: ' + missing.join(', ');
      console.error(msg);
      throw new Error(msg);
    }
  };

  // Public: call this after scripts load to ensure expected surface exists
  EC.assertReady = EC.assertReady || function assertReady(stage, paths) {
    EC._require(stage, paths);
    return true;
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
