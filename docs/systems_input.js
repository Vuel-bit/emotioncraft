// systems_input.js — stable input API for manual well picking + gesture arm/resolve (no mechanics changes)
(() => {
  const EC = (window.EC = window.EC || {});
  EC.INPUT = EC.INPUT || {};

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

    // Prefer live wellViews: each view has container "c" and a hit radius.
    const views = (EC.RENDER && EC.RENDER.wellViews) ? EC.RENDER.wellViews : null;
    if (!views || !views.forEach) return { idx: -1, inside: false, rx, ry, dist: 0, r: 0 };

    let bestInside = null;
    let bestInsideD2 = 1e18;
    let bestAny = null;
    let bestAnyD2 = 1e18;

    views.forEach((v, id) => {
      if (!v || !v.c || typeof v.c.getGlobalPosition !== 'function') return;
      const gp = v.c.getGlobalPosition();
      const dx = rx - _num(gp.x);
      const dy = ry - _num(gp.y);
      const d2 = dx*dx + dy*dy;

      // Determine hit radius: prefer explicit hitR, then hitArea radius, else a conservative fallback.
      let r = null;
      if (v.hitR != null) r = v.hitR;
      else if (v.c.hitArea && v.c.hitArea.radius != null) r = v.c.hitArea.radius;
      else if (v.c.hitArea && v.c.hitArea.r != null) r = v.c.hitArea.r;
      // Fallback: use tuned well radius if available, else 80.
      if (r == null) {
        r = (EC.TUNING && EC.TUNING.WELL && EC.TUNING.WELL.R_OUT) ? EC.TUNING.WELL.R_OUT : 80;
      }
      r = _num(r, 80);

      const inside = d2 <= (r*r);
      const rec = { idx: id, rx, ry, dist: Math.sqrt(d2), r, inside };

      if (inside && d2 < bestInsideD2) {
        bestInside = rec; bestInsideD2 = d2;
      }
      if (d2 < bestAnyD2) {
        bestAny = rec; bestAnyD2 = d2;
      }
    });

    const best = bestInside || bestAny || { idx: -1, rx, ry, dist: 0, r: 0, inside: false };

    // If nothing is "inside", return idx=-1 (we don't want near-misses to arm gestures).
    const out = best.inside ? best : { idx: -1, rx, ry, dist: best.dist, r: best.r, inside: false };

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
    try {
      if (!EC.RENDER || typeof EC.RENDER._armGestureFromPick !== 'function') return false;
      return !!EC.RENDER._armGestureFromPick(info, (EC.RENDER && EC.RENDER.app) ? EC.RENDER.app : null);
    } catch (_) {
      return false;
    }
  };

  EC.INPUT.resolveGestureFromKey = function(kind, key, clientX, clientY, tMs) {
    try {
      if (!EC.RENDER || typeof EC.RENDER._resolveGesture !== 'function') return null;
      return EC.RENDER._resolveGesture({ kind, key, clientX, clientY, t1: tMs }, (EC.RENDER && EC.RENDER.app) ? EC.RENDER.app : null);
    } catch (err) {
      return { err: (err && err.message) ? err.message : String(err) };
    }
  };
})();
