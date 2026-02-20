// Emotioncraft render_success_fx.js — Win celebration FX (visual-only) (PASS A41c)
(() => {
  const EC = (window.EC = window.EC || {});
  EC.RENDER_SUCCESS_FX = EC.RENDER_SUCCESS_FX || {};

  const MOD = EC.RENDER_SUCCESS_FX;

  const STATE = {
    inited: false,
    layer: null,
    parts: [],
    text: null,
    active: false,
    stamp: '',
    t: 0,
    spawned: false,
    _cx: 0,
    _cy: 0,
    _boardSize: 0,
    _psyR: 0,
  };

  function _clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function _easeOutCubic(x) { x = _clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); }

  function _palette() {
    try {
      const R = (EC.TUNE && EC.TUNE.RENDER) || {};
      const cols = R.MVP_WELL_COLORS;
      if (cols && cols.length >= 6) return cols;
    } catch (_) {}
    return [0xd94141, 0x8b54d4, 0x2f7de1, 0x45b56a, 0xd8c23a, 0xe37b2c];
  }

  function _getCenter() {
    // Prefer render-only layout state.
    try {
      const RS = EC.RENDER_STATE || {};
      const lay = RS.layout || {};
      const g = lay.mvpGeom || null;
      if (g && isFinite(g.cx) && isFinite(g.cy)) {
        STATE._cx = g.cx;
        STATE._cy = g.cy;
        STATE._boardSize = (typeof g.boardSize === 'number' && isFinite(g.boardSize)) ? g.boardSize : 0;
        STATE._psyR = (typeof g.psycheR === 'number' && isFinite(g.psycheR)) ? g.psycheR : 0;
        return;
      }
    } catch (_) {}

    // Fallback to Pixi screen center.
    try {
      const app = EC.RENDER && EC.RENDER.app;
      const scr = app && app.screen;
      if (scr && isFinite(scr.width) && isFinite(scr.height)) {
        STATE._cx = scr.width * 0.5;
        STATE._cy = scr.height * 0.5;
        STATE._boardSize = Math.min(scr.width, scr.height);
        STATE._psyR = 0;
        return;
      }
    } catch (_) {}

    STATE._cx = (typeof window !== 'undefined' ? (window.innerWidth || 0) : 0) * 0.5;
    STATE._cy = (typeof window !== 'undefined' ? (window.innerHeight || 0) : 0) * 0.5;
    STATE._boardSize = Math.min((window.innerWidth || 0), (window.innerHeight || 0));
    STATE._psyR = 0;
  }

  function ensure() {
    if (STATE.inited) return true;
    if (typeof PIXI === 'undefined') return false;
    if (!EC.RENDER || !EC.RENDER.root) return false;

    const root = EC.RENDER.root;

    const layer = new PIXI.Container();
    layer.name = 'mvpSuccessFxLayer';
    layer.eventMode = 'none';
    layer.interactiveChildren = false;

    // Confetti particles (pooled)
    const parts = [];
    const N = 70;
    const pal = _palette();
    for (let i = 0; i < N; i++) {
      const s = new PIXI.Sprite(PIXI.Texture.WHITE);
      if (s.anchor) s.anchor.set(0.5);
      s.eventMode = 'none';
      s.visible = false;
      s.alpha = 0;
      s.tint = pal[i % pal.length] >>> 0;
      // pooled motion fields
      s._vx = 0;
      s._vy = 0;
      s._vr = 0;
      s._life = 0;
      parts.push(s);
      layer.addChild(s);
    }

    // Success text overlay
    let txt = null;
    try {
      const style = new PIXI.TextStyle({
        fontFamily: 'Arial',
        fontSize: 72,
        fontWeight: '900',
        fill: 0xffffff,
        stroke: 0x081018,
        strokeThickness: 8,
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowBlur: 8,
        dropShadowDistance: 2,
      });
      txt = new PIXI.Text('Success!', style);
    } catch (_) {
      txt = new PIXI.Text('Success!');
    }
    if (txt && txt.anchor) txt.anchor.set(0.5);
    if (txt) {
      txt.eventMode = 'none';
      txt.visible = false;
      txt.alpha = 0;
      layer.addChild(txt);
    }

    // Insert at the top of the board render stack.
    try { root.addChild(layer); } catch (_) {}

    STATE.layer = layer;
    STATE.parts = parts;
    STATE.text = txt;
    STATE.inited = true;
    return true;
  }

  function _resetVisuals() {
    if (STATE.parts) {
      for (let i = 0; i < STATE.parts.length; i++) {
        const p = STATE.parts[i];
        if (!p) continue;
        p.visible = false;
        p.alpha = 0;
        p._life = 0;
      }
    }
    if (STATE.text) {
      STATE.text.visible = false;
      STATE.text.alpha = 0;
      try { STATE.text.scale.set(1); } catch (_) {}
    }
    if (STATE.layer) STATE.layer.visible = false;
  }

  function reset() {
    STATE.active = false;
    STATE.stamp = '';
    STATE.t = 0;
    STATE.spawned = false;
    _resetVisuals();
  }

  function _spawn() {
    if (!STATE.inited) return;
    _getCenter();
    const cx = STATE._cx;
    const cy = STATE._cy;
    const boardSize = STATE._boardSize || 420;

    const speedBase = Math.max(220, boardSize * 0.75);
    const pal = _palette();

    for (let i = 0; i < STATE.parts.length; i++) {
      const p = STATE.parts[i];
      if (!p) continue;
      const ang = Math.random() * Math.PI * 2;
      const spd = speedBase * (0.55 + Math.random() * 0.75);
      p.x = cx;
      p.y = cy;
      p._vx = Math.cos(ang) * spd;
      p._vy = Math.sin(ang) * spd - (0.35 * speedBase);
      p._vr = (Math.random() * 2 - 1) * 9.0;
      p.rotation = Math.random() * Math.PI * 2;
      p.tint = pal[(i + ((Math.random() * pal.length) | 0)) % pal.length] >>> 0;

      // size variety
      const w = 4 + Math.random() * 10;
      const h = 4 + Math.random() * 14;
      try {
        p.width = w;
        p.height = h;
      } catch (_) {
        try { p.scale.set(w / 10, h / 10); } catch (_) {}
      }

      p._life = 0;
      p.alpha = 1;
      p.visible = true;
    }

    if (STATE.layer) STATE.layer.visible = true;
    if (STATE.text) {
      STATE.text.visible = true;
      STATE.text.alpha = 0;
      try { STATE.text.scale.set(0.95); } catch (_) {}
    }
  }

  MOD.ensure = ensure;

  MOD.trigger = function trigger(runStamp) {
    const stamp = String(runStamp || '');
    if (!stamp) return;
    STATE.stamp = stamp;
    STATE.active = true;
    STATE.t = 0;
    STATE.spawned = false;

    if (!ensure()) return;
    _spawn();
    STATE.spawned = true;
  };

  MOD.resetIfNewRun = function resetIfNewRun(runStamp) {
    const stamp = String(runStamp || '');
    if (STATE.stamp && stamp && stamp !== STATE.stamp) reset();
  };

  MOD.update = function update(dt) {
    if (!(typeof dt === 'number' && isFinite(dt) && dt > 0)) return;
    if (!STATE.active && !STATE.stamp) return;
    if (!ensure()) return;

    const SIM = EC.SIM || {};
    const isWin = (SIM.levelState === 'win') || !!SIM.mvpWin;
    const inLobby = !!SIM.inLobby;
    const runStamp = String((typeof SIM._mvpInitStamp === 'number') ? SIM._mvpInitStamp : 0) + '|' + String(SIM._patientLevelId || SIM._patientId || '');

    // Leaving WIN/lobby/new run: clear the effect.
    if (!isWin || inLobby || !SIM._patientActive) {
      reset();
      return;
    }
    if (STATE.stamp && runStamp && runStamp !== STATE.stamp) {
      reset();
      return;
    }

    // If trigger happened before Pixi was ready, spawn lazily once.
    if (STATE.active && !STATE.spawned) {
      _spawn();
      STATE.spawned = true;
    }

    STATE.t += dt;
    _getCenter();
    const cx = STATE._cx;
    const cy = STATE._cy;
    const boardSize = STATE._boardSize || 420;

    // Text position/scale
    if (STATE.text) {
      STATE.text.x = cx;
      STATE.text.y = cy - (STATE._psyR ? (STATE._psyR * 0.10) : 0);

      // Scale to board size for readability.
      const targetScale = _clamp(boardSize / 520, 0.75, 1.25);
      // Fade/scale in after a short delay.
      const t0 = 0.55;
      const dur = 0.35;
      const a = _clamp((STATE.t - t0) / dur, 0, 1);
      const e = _easeOutCubic(a);
      STATE.text.alpha = e;
      try {
        const s = targetScale * (0.95 + 0.08 * e);
        STATE.text.scale.set(s);
      } catch (_) {}
    }

    // Confetti sim (first ~2s)
    const grav = Math.max(520, boardSize * 1.35);
    const fadeAt = 1.15;
    const fadeDur = 0.65;

    for (let i = 0; i < STATE.parts.length; i++) {
      const p = STATE.parts[i];
      if (!p || !p.visible) continue;
      p._life += dt;

      // Basic ballistic motion + a little drag
      p._vy += grav * dt;
      p._vx *= (1 - 0.55 * dt);
      p._vy *= (1 - 0.18 * dt);

      p.x += p._vx * dt;
      p.y += p._vy * dt;
      p.rotation += p._vr * dt;

      if (p._life >= fadeAt) {
        const a = 1 - _clamp((p._life - fadeAt) / fadeDur, 0, 1);
        p.alpha = a;
        if (a <= 0.01) {
          p.visible = false;
          p.alpha = 0;
        }
      }
    }
  };

  MOD.reset = reset;
})();
