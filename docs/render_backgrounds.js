// Emotioncraft render_backgrounds.js — plan-specific treatment board backgrounds (visual-only)
(() => {
  const EC = (window.EC = window.EC || {});
  const PIXI = window.PIXI;

  const PLAN_BG_PATHS = {
    WEEKLY: 'assets/background/background_weekly.png',
    ZEN: 'assets/background/background_zen.png',
    TRANQUILITY: 'assets/background/background_tranquility.png',
    TRANSCENDENCE: 'assets/background/background_transcendence.png',
  };

  const _failedByPath = {};
  const _pendingByPath = {};

  function normalizePlanKey(raw) {
    return String(raw || '').toUpperCase().replace(/[\s-]+/g, '_');
  }

  function resolvePathForPlan(planKeyRaw) {
    const k = normalizePlanKey(planKeyRaw);
    if (!k) return null;
    if (k === 'WEEKLY' || k.indexOf('WEEKLY_') === 0) return PLAN_BG_PATHS.WEEKLY;
    if (k === 'ZEN') return PLAN_BG_PATHS.ZEN;
    if (k === 'TRANQUILITY') return PLAN_BG_PATHS.TRANQUILITY;
    if (k === 'TRANSCENDENCE') return PLAN_BG_PATHS.TRANSCENDENCE;
    if (k === 'LOBBY' || k === 'INTAKE') return null;
    return null;
  }

  function _ensureLayer() {
    const R = EC.RENDER || {};
    const root = R.root;
    if (!root || !PIXI) return null;

    if (!R.bgImageLayer) {
      const layer = new PIXI.Container();
      layer.eventMode = 'none';
      layer.interactiveChildren = false;
      layer.visible = false;
      R.bgImageLayer = layer;
      try {
        const bgIndex = Math.max(0, root.getChildIndex(R.bg));
        root.addChildAt(layer, bgIndex + 1);
      } catch (_) {
        root.addChild(layer);
      }
    }

    return R.bgImageLayer;
  }

  function _clearActiveImage() {
    const R = EC.RENDER || {};
    if (R.bgImageSprite && R.bgImageLayer && R.bgImageSprite.parent === R.bgImageLayer) {
      try { R.bgImageLayer.removeChild(R.bgImageSprite); } catch (_) {}
    }
    R.bgImageSprite = null;
    if (R.bgImageLayer) R.bgImageLayer.visible = false;
    R._activeBoardBgPath = '';
  }

  function resizeActiveBackground() {
    const R = EC.RENDER || {};
    const app = R.app;
    const sp = R.bgImageSprite;
    if (!app || !app.screen || !sp || !sp.texture || !sp.texture.valid) return;

    const w = app.screen.width;
    const h = app.screen.height;
    const tw = sp.texture.width;
    const th = sp.texture.height;
    if (!(w > 0 && h > 0 && tw > 0 && th > 0)) return;

    const s = Math.max(w / tw, h / th);
    sp.scale.set(s, s);
    sp.position.set(w * 0.5, h * 0.5);
  }

  function _applyTexture(path, texture) {
    const R = EC.RENDER || {};
    const layer = _ensureLayer();
    if (!layer || !texture || !texture.valid) return;

    if (!R.bgImageSprite) {
      const sp = new PIXI.Sprite(texture);
      sp.eventMode = 'none';
      sp.interactive = false;
      sp.anchor.set(0.5, 0.5);
      sp.alpha = 0.88;
      R.bgImageSprite = sp;
      layer.addChild(sp);
    } else {
      R.bgImageSprite.texture = texture;
    }

    layer.visible = true;
    R._activeBoardBgPath = path;
    resizeActiveBackground();
  }

  function syncActiveBackground() {
    const SIM = EC.SIM || {};
    const inLobby = !!SIM.inLobby;
    const planKey = normalizePlanKey(SIM._patientPlanKey || SIM._activePlanKey);
    const desiredPath = inLobby ? null : resolvePathForPlan(planKey);
    const R = EC.RENDER || {};

    _ensureLayer();

    if (!desiredPath) {
      if (R._activeBoardBgPath) _clearActiveImage();
      return;
    }

    if (R._activeBoardBgPath === desiredPath && R.bgImageSprite && R.bgImageLayer && R.bgImageLayer.visible) {
      return;
    }

    if (_failedByPath[desiredPath]) {
      _clearActiveImage();
      return;
    }

    let tex = null;
    try {
      tex = PIXI.Texture.from(desiredPath);
    } catch (_) {
      _failedByPath[desiredPath] = true;
      _clearActiveImage();
      return;
    }

    if (tex && tex.baseTexture && tex.baseTexture.valid) {
      _applyTexture(desiredPath, tex);
      return;
    }

    if (_pendingByPath[desiredPath]) return;

    _pendingByPath[desiredPath] = true;
    const bt = tex && tex.baseTexture;
    if (!bt) {
      _pendingByPath[desiredPath] = false;
      _failedByPath[desiredPath] = true;
      _clearActiveImage();
      return;
    }

    const cleanup = () => { _pendingByPath[desiredPath] = false; };

    bt.once('loaded', () => {
      cleanup();
      if ((EC.RENDER || {})._activeBoardBgPath === desiredPath) return;
      const SIM_NOW = EC.SIM || {};
      const nowPlanPath = (!!SIM_NOW.inLobby) ? null : resolvePathForPlan(normalizePlanKey(SIM_NOW._patientPlanKey || SIM_NOW._activePlanKey));
      if (nowPlanPath !== desiredPath) return;
      _applyTexture(desiredPath, tex);
    });

    bt.once('error', () => {
      cleanup();
      _failedByPath[desiredPath] = true;
      const R2 = EC.RENDER || {};
      if (R2._activeBoardBgPath === desiredPath) _clearActiveImage();
    });
  }

  EC.RENDER_BACKGROUNDS = {
    normalizePlanKey,
    resolvePathForPlan,
    syncActiveBackground,
    resizeActiveBackground,
    ensureLayer: _ensureLayer,
  };

  EC._registerModule && EC._registerModule('render_backgrounds', {
    provides: ['EC.RENDER_BACKGROUNDS'],
  });
})();
