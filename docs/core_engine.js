/* Emotioncraft — Engine facade
   Minimal façade over EC.ACTIONS + core tick.
   Purpose: presentation modules should not mutate EC.SIM directly.
*/
(() => {
  const EC = (window.EC = window.EC || {});

  const ENGINE = (EC.ENGINE = EC.ENGINE || {});

  // SIM write-bracketing (used by SIM write-guard; warn-only).
  ENGINE._simWriteDepth = ENGINE._simWriteDepth || 0;
  ENGINE._simWriteTag = ENGINE._simWriteTag || '';
  ENGINE._withSimWrites = ENGINE._withSimWrites || function _withSimWrites(tag, fn) {
    // Never throws; always cleans up depth.
    let prevTag = '';
    try {
      prevTag = ENGINE._simWriteTag || '';
      ENGINE._simWriteDepth = (ENGINE._simWriteDepth || 0) + 1;
      const newTag = String(tag || '');
      ENGINE._simWriteTag = prevTag ? (prevTag + '>' + newTag) : newTag;
    } catch (_) {
      // If bracketing fails, still try to run the function.
    }
    try {
      if (typeof fn === 'function') return fn();
      return null;
    } catch (err) {
      try { console.error('[EC.ENGINE] _withSimWrites fn threw:', tag, err); } catch (_) {}
      return null;
    } finally {
      try {
        ENGINE._simWriteDepth = Math.max(0, (ENGINE._simWriteDepth || 1) - 1);
        if (ENGINE._simWriteDepth === 0) ENGINE._simWriteTag = '';
        else ENGINE._simWriteTag = prevTag;
      } catch (_) {
        try { ENGINE._simWriteDepth = 0; ENGINE._simWriteTag = ''; } catch (_) {}
      }
    }
  };

  // Dispatch an action by name (best-effort; never throws).
  ENGINE.dispatch = ENGINE.dispatch || function dispatch(actionName, ...args) {
    const _call = () => {
      const A = EC.ACTIONS;
      const fn = (A && actionName && typeof A[actionName] === 'function') ? A[actionName] : null;
      if (!fn) return { ok: false, reason: 'missing_action', action: String(actionName || '') };
      return fn.apply(A, args);
    };
    try {
      if (typeof ENGINE._withSimWrites === 'function') {
        return ENGINE._withSimWrites('dispatch:' + String(actionName || ''), _call);
      }
      return _call();
    } catch (err) {
      try {
        if (EC.UI_STATE && EC.UI_STATE.debugOn) {
          console.warn('[EC.ENGINE.dispatch] threw:', actionName, err);
        }
      } catch (_) {}
      return { ok: false, reason: 'dispatch_throw', action: String(actionName || '') };
    }
  };

  // Snapshot of key state containers (references are fine for now).
  ENGINE.getSnapshot = ENGINE.getSnapshot || function getSnapshot() {
    // Centralized, stable read surface for presentation modules.
    try {
      // Ensure buckets exist (best-effort; no throws).
      if (!EC.SIM) EC.SIM = {};
      if (!EC.UI_STATE) EC.UI_STATE = {};
      if (!EC.RENDER_STATE) EC.RENDER_STATE = { flags: {}, layout: {} };
      if (!EC.RENDER_STATE.flags) EC.RENDER_STATE.flags = {};
      if (!EC.RENDER_STATE.layout) EC.RENDER_STATE.layout = {};

      return {
        SIM: EC.SIM || {},
        UI: EC.UI_STATE || {},
        RENDER: EC.RENDER_STATE || {}
      };
    } catch (_) {
      // Fallback: avoid throwing from HUD/render paths.
      return {
        SIM: (EC && EC.SIM) ? EC.SIM : {},
        UI: (EC && EC.UI_STATE) ? EC.UI_STATE : {},
        RENDER: (EC && EC.RENDER_STATE) ? EC.RENDER_STATE : {}
      };
    }
  };

  // Tick façade: brackets sim mutations only (tickEngine) and runs UI outside bracket.
ENGINE.tick = ENGINE.tick || function tick(delta) {
  try {
    // Preferred split tick: sim (engine) then UI (presentation).
    if (typeof EC.tickEngine === 'function') {
      let safeDt = null;
      if (typeof ENGINE._withSimWrites === 'function') {
        safeDt = ENGINE._withSimWrites('tickEngine', () => EC.tickEngine(delta));
      } else {
        safeDt = EC.tickEngine(delta);
      }

      // Run UI updates outside the sim-write bracket.
      try {
        if (typeof EC.tickUI === 'function') EC.tickUI(safeDt);
      } catch (uiErr) {
        try {
          if (EC.UI_STATE && EC.UI_STATE.debugOn) {
            console.warn('[EC.ENGINE.tickUI] threw:', uiErr);
          }
        } catch (_) {}
      }
      return safeDt;
    }

    // Legacy fallback: bracket entire EC.tick if tickEngine isn't available yet.
    const _legacy = () => {
      if (typeof EC.tick === 'function') return EC.tick(delta);
      return null;
    };
    if (typeof ENGINE._withSimWrites === 'function') {
      return ENGINE._withSimWrites('tickLegacy', _legacy);
    }
    return _legacy();
  } catch (err) {
    try {
      if (EC.UI_STATE && EC.UI_STATE.debugOn) {
        console.warn('[EC.ENGINE.tick] threw:', err);
      }
    } catch (_) {}
    return null;
  }
};


  // Register module (best-effort).
  try {
    if (typeof EC._registerModule === 'function') {
      EC._registerModule('core_engine', {
        provides: ['EC.ENGINE.dispatch', 'EC.ENGINE.getSnapshot', 'EC.ENGINE.tick'],
      });
    }
  } catch (_) {}
})();
