/* Emotioncraft Prototype 0.1.9 — thin bootstrap (Step 6 split)
   main.js is intentionally minimal:
   - create Pixi Application + layers
   - expose render context via EC.RENDER
   - hook resize + ticker
   - call EC.init()
*/
(() => {
  const EC = (window.EC = window.EC || {});

  // Build label used by UI summary/debug
  EC.BUILD = EC.BUILD || '0.1.9';

  // -----------------------------
  // Pixi setup
  // -----------------------------
  const appEl = document.getElementById('app');

  const app = new PIXI.Application({
    backgroundAlpha: 0,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  appEl.appendChild(app.view);

  // Mobile gesture reliability: disable browser gesture handling on the canvas.
  // Flick input uses Pointer Events; `touch-action: none` prevents the browser
  // from hijacking swipes for scrolling/back navigation over the game surface.
  try {
    app.view.style.touchAction = 'none';
    app.view.style.userSelect = 'none';
    app.view.style.webkitUserSelect = 'none';
  } catch (_) {}

  const root = new PIXI.Container();
  app.stage.addChild(root);

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  const bg = new PIXI.Graphics();
  root.addChild(bg);

  const wellLayer = new PIXI.Container();
  root.addChild(wellLayer);

  const labelLayer = new PIXI.Container();
  root.addChild(labelLayer);

  // Shared render context for render_wells.js
  EC.RENDER = EC.RENDER || {};
  EC.RENDER.app = app;
  EC.RENDER.root = root;
  EC.RENDER.bg = bg;
  EC.RENDER.wellLayer = wellLayer;
  EC.RENDER.labelLayer = labelLayer;

  // -----------------------------
  // Resize + tick hooks
  // -----------------------------
  if (app.renderer && EC.resize) {
    app.renderer.on('resize', EC.resize);
  }
  window.addEventListener('resize', () => EC.resize && EC.resize());
  window.addEventListener('orientationchange', () => EC.resize && EC.resize());

  if (EC.tick) app.ticker.add(EC.tick);

  // -----------------------------
  // Start
  // -----------------------------
  if (EC.init) 

  // Hardening: verify required surface exists (no-op when healthy)
  if (EC.assertReady) {
    EC.assertReady('boot', ["EC.TUNING", "EC.makeWell", "EC.ensureWellView", "EC.applyImprintToWell", "EC.initUI", "EC.SIM"]);
  }

EC.init();


  // Hardening: module registry (no gameplay impact)
  EC._registerModule && EC._registerModule('main', { provides: ["bootstrap Pixi app", "ticker", "resize hook"] });
})();
