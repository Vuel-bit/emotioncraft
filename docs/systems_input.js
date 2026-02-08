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
