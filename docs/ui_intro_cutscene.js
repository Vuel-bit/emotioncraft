/* Emotioncraft — Intro cutscene (Back-Alley Psychiatry) v3
   - Fullscreen DOM overlay (plates + DOM dialogue text)
   - Storefront sign + Princess nametag lettering are baked into the plate art (NO DOM sign/tag lettering)
   - Skippable: button + tap/click anywhere
   - Blocks all game/canvas input while visible
   - Preloads all plates (no pop-in)
   - Persistence:
       runtime: EC.UI_STATE._seenIntroBAP_v3
       firestore: ui.seenIntroBAP_v3 (schema v2)
       session fallback: sessionStorage['ec_seenIntroBAP_v3']
   - Fail-safe: if anything throws, mark session seen and exit (no tutorial auto-start)
   - On natural end OR skip (only when the cutscene actually played): hide lobby and start Tutorial.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const MOD = (EC.UI_INTRO = EC.UI_INTRO || {});

  const KEY_SS = 'ec_seenIntroBAP_v3';

  const ASSETS = {
    A: './assets/intro_bap/plate_a.png',
    B: './assets/intro_bap/plate_b.png',
    C0: './assets/intro_bap/plate_c_blank.png',
    D: './assets/intro_bap/plate_d.png',
    C: './assets/intro_bap/plate_c.png',
    E: './assets/intro_bap/plate_e.png',
  };

  const DUR_MS = 31000;

  // Shot marks (ms)
  const T = {
    A: 0,
    B: 6000,
    C0: 12000,
    D: 17000,
    C1: 21000,
    E: 26000,
    end: 31000,
  };

  // Caption timings (ms)
  const TXT = {
    l1: [200, 2650],
    l2: [2800, 5850],

    l3: [6200, 9450],
    l4: [9600, 11850],

    l5: [12200, 16800],
    l6: [17200, 20800],
    l7: [21200, 25800],
    l8: [26200, 30800],
  };

  function _safeSSGet() {
    try { return String(sessionStorage.getItem(KEY_SS) || ''); } catch (_) { return ''; }
  }
  function _safeSSSet() {
    try { sessionStorage.setItem(KEY_SS, '1'); } catch (_) {}
  }

  function _ensureUIState() {
    EC.UI_STATE = EC.UI_STATE || {};
    return EC.UI_STATE;
  }

  function _isAuthed() {
    try { return !!(EC.AUTH && EC.AUTH.user && EC.AUTH.user.uid); } catch (_) { return false; }
  }

  function _readSeen() {
    const UI = _ensureUIState();
    if (UI._seenIntroBAP_v3) return true;
    return _safeSSGet() === '1';
  }

  function _setSeenRuntime() {
    const UI = _ensureUIState();
    UI._seenIntroBAP_v3 = true;
    _safeSSSet();
  }

  function _persistSeenBestEffort() {
    // Firestore persistence only when signed in.
    if (!_isAuthed()) return;
    if (!EC.SAVE || typeof EC.SAVE._writeCurrentPat !== 'function') return;
    if (MOD._persistAttempted) return;
    MOD._persistAttempted = true;
    try { EC.SAVE._writeCurrentPat('seenIntroBAP_v3'); } catch (_) {}
  }

  // ----------------------------
  // Styles
  // ----------------------------
  function _injectStyles() {
    if (MOD._styleInjected) return;
    MOD._styleInjected = true;

    const css = `
      .ecIntroV3{ position:fixed; inset:0; width:100vw; height:100vh; z-index:10000; display:none; background:#050608; overflow:hidden; touch-action:none; }
      .ecIntroV3.show{ display:block; }
      .ecIntroV3 *{ box-sizing:border-box; }

      .ecIntroStageV3{position:absolute; inset:0; width:100%; height:100%; overflow:hidden; background: radial-gradient(circle at 50% 40%, rgba(18,20,30,0.95) 0%, rgba(5,6,8,1) 62%, rgba(0,0,0,1) 100%); }

      .ecPlate{ position:absolute; inset:0; width:100%; height:100%;
        opacity:0; will-change: transform, opacity; transform-origin: 50% 50%;
        filter:none; }
      .ecPlate img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; user-select:none; -webkit-user-drag:none; }
      .ecPlate.photor{ filter: contrast(1.06) saturate(1.05) brightness(0.98); }

      .ecFX{ position:absolute; inset:0; pointer-events:none; }
      .ecVignette{ background: radial-gradient(circle at 50% 40%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.55) 100%); opacity:0.55; }
      .ecGrain{ opacity:0.16; background-image:
        repeating-linear-gradient(0deg, rgba(255,255,255,0.035), rgba(255,255,255,0.035) 1px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px);
        mix-blend-mode: overlay;
      }

      .ecTextLayer{ position:absolute; inset:0; pointer-events:none; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .ecLine{ position:absolute; left:6vw; right:6vw; opacity:0; transform: translateY(10px); will-change: opacity, transform; }
      .ecLine.center{ left:10vw; right:10vw; text-align:center; }
      .ecLine.top{ top: 7vh; }
      .ecLine.mid{ top: 18vh; }
      .ecLine.bot{ bottom: 9vh; }
      .ecLine.helmetTitle{ top: 18vh; left: 46vw; right: 6vw; text-align:left; }

      .ecLine .scrim{ display:inline-block; padding: 10px 12px; border-radius: 14px;
        background: rgba(0,0,0,0.34);
        box-shadow: 0 10px 35px rgba(0,0,0,0.35);
        backdrop-filter: blur(2px);
      }
      .ecLine .t1{ font-weight: 800; letter-spacing: 0.2px; font-size: clamp(18px, 4.2vw, 34px); line-height: 1.15; color: rgba(248,250,255,0.96); text-shadow: 0 2px 14px rgba(0,0,0,0.55); }
      .ecLine .t2{ font-weight: 950; letter-spacing: 0.4px; font-size: clamp(22px, 5.4vw, 44px); line-height: 1.05; color: rgba(255,246,220,0.98);
        text-shadow: 0 0 18px rgba(255, 184, 110, 0.32), 0 2px 18px rgba(0,0,0,0.55);
      }
      .ecLine .tBody{ font-weight: 750; font-size: clamp(15px, 3.4vw, 26px); line-height: 1.22; color: rgba(248,250,255,0.95); text-shadow: 0 2px 14px rgba(0,0,0,0.60); }

      .ecSkip{ position:absolute; top: 10px; right: 10px; z-index: 4;
        border: 1px solid rgba(255,255,255,0.18); background: rgba(12,16,26,0.72);
        color: rgba(232,238,252,0.95); border-radius: 999px; padding: 9px 12px; font-size: 12px; cursor:pointer;
      }
      .ecSkip:active{ transform: translateY(1px); }
      .ecHint{ position:absolute; left: 12px; bottom: 10px; z-index: 4; font-size: 12px; color: rgba(232,238,252,0.70);
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
      }

      /* Subtle glow blobs */
      .ecGlowLayer{ position:absolute; inset:0; pointer-events:none; mix-blend-mode: screen; opacity:0; }
      .ecGlow{ position:absolute; width: 34vmin; height: 34vmin; border-radius: 999px; filter: blur(18px); opacity:0; }
      .ecGlow.r{ left: 18%; top: 56%; background: rgba(255, 80, 50, 0.42); }
      .ecGlow.g{ left: 43%; top: 54%; background: rgba(80, 255, 120, 0.36); }
      .ecGlow.y{ left: 60%; top: 58%; background: rgba(255, 220, 90, 0.26); }
      .ecGlow.helmetR{ left: 40%; top: 9%; width: 22vmin; height: 22vmin; background: rgba(255, 80, 50, 0.28); }
      .ecGlow.helmetG{ left: 49%; top: 8%; width: 22vmin; height: 22vmin; background: rgba(80, 255, 120, 0.22); }
      .ecGlow.helmetY{ left: 58%; top: 9%; width: 22vmin; height: 22vmin; background: rgba(255, 220, 90, 0.18); }

      @media (max-width: 480px){
        .ecLine.helmetTitle{ left: 40vw; }
      }
    `;

    try {
      const st = document.createElement('style');
      st.type = 'text/css';
      st.setAttribute('data-ec-intro-v3', '1');
      st.appendChild(document.createTextNode(css));
      document.head.appendChild(st);
    } catch (_) {}
  }

  // ----------------------------
  // DOM build
  // ----------------------------
  function _buildOverlay() {
    if (MOD._overlayEl) return;
    _injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'ecIntroV3';
    overlay.id = 'ecIntroOverlayBAPv3';
    overlay.setAttribute('aria-hidden', 'true');

    const stage = document.createElement('div');
    stage.className = 'ecIntroStageV3';
    overlay.appendChild(stage);

    function mkPlate(key, extraClass) {
      const p = document.createElement('div');
      p.className = 'ecPlate ' + (extraClass || '');
      p.setAttribute('data-plate', key);
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      img.src = ASSETS[key];
      p.appendChild(img);
      stage.appendChild(p);
      return p;
    }

    const plates = {
      A: mkPlate('A'),
      B: mkPlate('B'),
      C0: mkPlate('C0', 'photor'),
      D: mkPlate('D', 'photor'),
      C: mkPlate('C', 'photor'),
      E: mkPlate('E'),
    };

    // FX overlays
    const fxV = document.createElement('div'); fxV.className = 'ecFX ecVignette';
    const fxG = document.createElement('div'); fxG.className = 'ecFX ecGrain';
    stage.appendChild(fxV);
    stage.appendChild(fxG);

    // Glow layer
    const glowLayer = document.createElement('div');
    glowLayer.className = 'ecGlowLayer';
    const glowR = document.createElement('div'); glowR.className = 'ecGlow r';
    const glowG = document.createElement('div'); glowG.className = 'ecGlow g';
    const glowY = document.createElement('div'); glowY.className = 'ecGlow y';
    const glowHR = document.createElement('div'); glowHR.className = 'ecGlow helmetR';
    const glowHG = document.createElement('div'); glowHG.className = 'ecGlow helmetG';
    const glowHY = document.createElement('div'); glowHY.className = 'ecGlow helmetY';
    glowLayer.appendChild(glowR); glowLayer.appendChild(glowG); glowLayer.appendChild(glowY);
    glowLayer.appendChild(glowHR); glowLayer.appendChild(glowHG); glowLayer.appendChild(glowHY);
    stage.appendChild(glowLayer);

    // Text layer
    const textLayer = document.createElement('div');
    textLayer.className = 'ecTextLayer';

    function mkLine(cls, innerHtml) {
      const d = document.createElement('div');
      d.className = 'ecLine ' + cls;
      d.innerHTML = innerHtml;
      textLayer.appendChild(d);
      return d;
    }

    const lines = {
      l1: mkLine('center bot', `<span class="scrim"><span class="tBody">We’ve done it, Princess!</span></span>`),
      l2: mkLine('center bot', `<span class="scrim"><span class="tBody">The Noodler 2000 is finally ready.</span></span>`),

      l3: mkLine('center bot', `<span class="scrim"><span class="tBody">In just a few sessions under the helmet, every one of our patients can reach true enlightenment.</span></span>`),
      l4: mkLine('center bot', `<span class="scrim"><span class="tBody">Or something close. Maybe. Hopefully.</span></span>`),

      l5: mkLine('center bot', `<span class="scrim"><span class="tBody">We already have the office space.</span></span>`),
      l6: mkLine('center bot', `<span class="scrim"><span class="tBody">We just need some quick changes.</span></span>`),
      l7: mkLine('center bot', `<span class="scrim"><span class="tBody">Now we just need our first patient. Princess...</span></span>`),
      l8: mkLine('center bot', `<span class="scrim"><span class="tBody">Let’s get to work.</span></span>`),
    };
    stage.appendChild(textLayer);

    // Skip + hint
    const btn = document.createElement('button');
    btn.className = 'ecSkip';
    btn.type = 'button';
    btn.textContent = 'Skip';

    const hint = document.createElement('div');
    hint.className = 'ecHint';
    hint.textContent = 'Tap anywhere to skip';

    overlay.appendChild(btn);
    overlay.appendChild(hint);

    // Input handling (block + skip)
    function onAny(ev) {
      if (!MOD._playing) return;
      try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
      MOD.skip();
    }
    function onBtn(ev) {
      if (!MOD._playing) return;
      try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {}
      MOD.skip();
    }

    // Capture to ensure nothing leaks.
    overlay.addEventListener('pointerdown', onAny, { capture: true, passive: false });
    overlay.addEventListener('pointerup', onAny, { capture: true, passive: false });
    overlay.addEventListener('pointermove', (ev) => { if (!MOD._playing) return; try { ev.preventDefault(); ev.stopPropagation(); } catch (_) {} }, { capture: true, passive: false });
    overlay.addEventListener('click', onAny, { capture: true, passive: false });
    btn.addEventListener('click', onBtn, { capture: true, passive: false });

    // Escape to skip (desktop)
    function onKey(ev) {
      if (!MOD._playing) return;
      const k = ev && (ev.key || ev.code || '');
      if (k === 'Escape') {
        try { ev.preventDefault(); } catch (_) {}
        MOD.skip();
      }
    }
    window.addEventListener('keydown', onKey, { capture: true });

    MOD._overlayEl = overlay;
    MOD._stageEl = stage;
    MOD._plates = plates;
    MOD._lines = lines;
    MOD._glow = { layer: glowLayer, r: glowR, g: glowG, y: glowY, hr: glowHR, hg: glowHG, hy: glowHY };
  }

  function _mountOverlay() {
    if (!MOD._overlayEl) _buildOverlay();
    if (!MOD._overlayEl) return;
    try {
      if (!MOD._overlayEl.parentNode) document.body.appendChild(MOD._overlayEl);
    } catch (_) {}
  }

  function _unmountOverlay() {
    try {
      if (MOD._overlayEl && MOD._overlayEl.parentNode) MOD._overlayEl.parentNode.removeChild(MOD._overlayEl);
    } catch (_) {}
  }

  // ----------------------------
  // Preload
  // ----------------------------
  function _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error('failed ' + url));
      img.src = url;
    });
  }

  function _preloadAll() {
    if (MOD._preloadPromise) return MOD._preloadPromise;
    const urls = [ASSETS.A, ASSETS.B, ASSETS.C0, ASSETS.D, ASSETS.C, ASSETS.E];
    MOD._preloadPromise = Promise.all(urls.map(_loadImage));
    return MOD._preloadPromise;
  }

  // ----------------------------
  // Timeline helpers
  // ----------------------------
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function _fade(t, t0, t1, fin, fout) {
    const inD = (fin == null ? 240 : fin);
    const outD = (fout == null ? 240 : fout);
    if (t < t0 - inD) return 0;
    if (t >= t1 + outD) return 0;
    let a = 1;
    if (t < t0) a = clamp01((t - (t0 - inD)) / inD);
    if (t > t1) a = clamp01(1 - (t - t1) / outD);
    return a;
  }

  function _plateCross(t, startMs, durMs) {
    const p = clamp01((t - startMs) / durMs);
    const aTo = p;
    const aFrom = 1 - p;
    return { aFrom, aTo };
  }

  function _noise(n) {
    const x = Math.sin(n) * 43758.5453123;
    return x - Math.floor(x);
  }

  function _shake(t, start, dur, ampPx) {
    const dt = t - start;
    if (dt < 0 || dt > dur) return { x: 0, y: 0 };
    const k = 1 - dt / dur;
    const a = ampPx * k;
    const n1 = _noise((t + 17.7) * 0.07);
    const n2 = _noise((t + 91.3) * 0.07);
    return { x: (n1 - 0.5) * 2 * a, y: (n2 - 0.5) * 2 * a };
  }

  // ----------------------------
  // Render tick
  // ----------------------------
  function _applyPlate(key, opacity, tx, ty, sc) {
    const p = MOD._plates && MOD._plates[key];
    if (!p) return;
    if (opacity <= 0.001) {
      if (p.style.opacity !== '0') p.style.opacity = '0';
      return;
    }
    p.style.opacity = String(opacity);
    p.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${sc})`;
  }

  function _applyLine(el, a) {
    if (!el) return;
    const aa = (a <= 0.001) ? 0 : a;
    el.style.opacity = String(aa);
    el.style.transform = `translateY(${lerp(10, 0, aa)}px)`;
  }

  function _tick(now) {
    try {
      if (!MOD._playing) return;

    const t = now - MOD._t0;

    // End fade (keep fully visible until the last 320ms)
    let endFade = 1;
    if (t > (T.end - 320)) {
      endFade = clamp01(1 - (t - (T.end - 320)) / 320);
    }
    if (MOD._overlayEl) MOD._overlayEl.style.opacity = String(endFade);

    // Micro bonk shake at Scene 4 start
    const shBonk = _shake(t, T.E, 120, 10);
    if (MOD._stageEl) MOD._stageEl.style.transform = `translate3d(${shBonk.x}px, ${shBonk.y}px, 0)`;

    // Plate opacities + transforms
    const op = { A: 0, B: 0, C0: 0, D: 0, C: 0, E: 0 };

    // Crossfades
    if (t < T.B) {
      op.A = 1;
    } else if (t < T.C0) {
      const c = _plateCross(t, T.B, 310);
      op.A = c.aFrom;
      op.B = c.aTo;
    } else if (t < T.D) {
      const c = _plateCross(t, T.C0, 310);
      op.B = c.aFrom;
      op.C0 = c.aTo;
    } else if (t < T.C1) {
      const c = _plateCross(t, T.D, 310);
      op.C0 = c.aFrom;
      op.D = c.aTo;
    } else if (t < T.E) {
      const c = _plateCross(t, T.C1, 130);
      op.D = c.aFrom;
      op.C = c.aTo;
    } else {
      const c = _plateCross(t, T.E, 310);
      op.C = c.aFrom;
      op.E = c.aTo;
    }

    // Scene motion params
    // Shot A (0–6s): start full/fit, then push in toward helmet in the second half
    const pA = clamp01((t - T.A) / (T.B - T.A));
    const pA2 = clamp01((pA - 0.5) * 2);
    const A_sc = lerp(1.00, 1.10, pA2);
    const A_tx = lerp(0, -26, pA2);
    const A_ty = lerp(0, -14, pA2);

    // Shot B (6–12s): subtle push + slight upward drift
    const pB = clamp01((t - T.B) / (T.C0 - T.B));
    const B_sc = lerp(1.00, 1.05, pB);
    const B_tx = lerp(0, -10, pB);
    const B_ty = lerp(0, -14, pB);

    // Shot C0 (12–17s): basically static; ensure sign frame is fully visible
    const pC0 = clamp01((t - T.C0) / (T.D - T.C0));
    const C0_sc = lerp(1.00, 1.02, pC0);
    const C0_tx = 0;
    const C0_ty = 0;

    // Shot D (17–21s): tiny push
    const pD = clamp01((t - T.D) / (T.C1 - T.D));
    const D_sc = lerp(1.00, 1.03, pD);
    const D_tx = lerp(0, 4, pD);
    const D_ty = lerp(0, 2, pD);

    // Shot C1 (21–26s): mild zoom toward the sign
    const pC1 = clamp01((t - T.C1) / (T.E - T.C1));
    const C_sc = lerp(1.00, 1.06, pC1);
    const C_tx = 0;
    const C_ty = lerp(0, -18, pC1);

    // Shot E (26–31s): gentle push-in on dog face + micro bonk at start
    const pE = clamp01((t - T.E) / (T.end - T.E));
    let E_sc = lerp(1.00, 1.06, pE);
    let E_tx = 0;
    let E_ty = lerp(0, -20, pE);

    if (t >= T.E && t < T.E + 90) {
      const bb = 1 + 0.035 * (1 - (t - T.E) / 90);
      E_sc *= bb;
      E_tx += (shBonk.x * 0.35);
      E_ty += (shBonk.y * 0.35);
    }

    // Apply transforms
    _applyPlate('A', op.A, A_tx, A_ty, A_sc);
    _applyPlate('B', op.B, B_tx, B_ty, B_sc);
    _applyPlate('C0', op.C0, C0_tx, C0_ty, C0_sc);
    _applyPlate('D', op.D, D_tx, D_ty, D_sc);
    _applyPlate('C', op.C, C_tx, C_ty, C_sc);
    _applyPlate('E', op.E, E_tx, E_ty, E_sc);

    // Text overlays
    const a1 = _fade(t, TXT.l1[0], TXT.l1[1], 250, 250);
    const a2 = _fade(t, TXT.l2[0], TXT.l2[1], 250, 250);
    const a3 = _fade(t, TXT.l3[0], TXT.l3[1], 250, 250);
    const a4 = _fade(t, TXT.l4[0], TXT.l4[1], 250, 250);
    const a5 = _fade(t, TXT.l5[0], TXT.l5[1], 250, 250);
    const a6 = _fade(t, TXT.l6[0], TXT.l6[1], 250, 250);
    const a7 = _fade(t, TXT.l7[0], TXT.l7[1], 250, 250);
    const a8 = _fade(t, TXT.l8[0], TXT.l8[1], 250, 250);

    _applyLine(MOD._lines && MOD._lines.l1, a1);
    _applyLine(MOD._lines && MOD._lines.l2, a2);
    _applyLine(MOD._lines && MOD._lines.l3, a3);
    _applyLine(MOD._lines && MOD._lines.l4, a4);
    _applyLine(MOD._lines && MOD._lines.l5, a5);
    _applyLine(MOD._lines && MOD._lines.l6, a6);
    _applyLine(MOD._lines && MOD._lines.l7, a7);
    _applyLine(MOD._lines && MOD._lines.l8, a8);

    // Glow pulses
    const G = MOD._glow;
    if (G && G.layer) {
      if (t >= T.B && t < T.C0) {
        // Plate B energy pulse
        const p = (t - T.B) / 420;
        const glowOn = 0.55 + 0.25 * Math.sin(p * Math.PI * 2);
        G.layer.style.opacity = String(0.75);
        G.r.style.opacity = String(0.55 * glowOn);
        G.g.style.opacity = String(0.50 * glowOn);
        G.y.style.opacity = String(0.35 * glowOn);
        G.hr.style.opacity = '0';
        G.hg.style.opacity = '0';
        G.hy.style.opacity = '0';
      } else if (t >= T.E && t < T.end) {
        // Plate E bulb pulse
        const p = (t - T.E) / 520;
        const glowOn = 0.55 + 0.25 * Math.sin(p * Math.PI * 2);
        G.layer.style.opacity = String(0.65);
        G.r.style.opacity = '0';
        G.g.style.opacity = '0';
        G.y.style.opacity = '0';
        G.hr.style.opacity = String(0.55 * glowOn);
        G.hg.style.opacity = String(0.45 * glowOn);
        G.hy.style.opacity = String(0.35 * glowOn);
      } else {
        G.layer.style.opacity = '0';
        G.r.style.opacity = '0';
        G.g.style.opacity = '0';
        G.y.style.opacity = '0';
        G.hr.style.opacity = '0';
        G.hg.style.opacity = '0';
        G.hy.style.opacity = '0';
      }
    }

    // Finish
    if (t >= DUR_MS) {
      try { _finish(true); } catch (_) {}
      return;
    }

    MOD._raf = requestAnimationFrame(_tick);
    } catch (e) {
      try { _safeSSSet(); } catch (_) {}
      try { _finish(false); } catch (_) {
        try { MOD._playing = false; } catch (_) {}
        try { _unmountOverlay(); } catch (_) {}
      }
    }
  }

  function _launchTutorial() {
    if (MOD._didLaunchTutorial) return;
    MOD._didLaunchTutorial = true;

    // Hide lobby
    try {
      if (EC.ACTIONS && typeof EC.ACTIONS.setInLobby === 'function') EC.ACTIONS.setInLobby(false);
      else if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') EC.ENGINE.dispatch('setInLobby', false);
    } catch (_) {}

    // Start tutorial
    try {
      if (EC.TUT && typeof EC.TUT.start === 'function') EC.TUT.start();
    } catch (_) {}
  }

  function _finish(launchTut) {
    if (!MOD._playing) return;
    MOD._playing = false;

    try { if (MOD._raf) cancelAnimationFrame(MOD._raf); } catch (_) {}
    MOD._raf = 0;

    _setSeenRuntime();
    _persistSeenBestEffort();

    if (launchTut) {
      _launchTutorial();
    }

    // Fast fade out then remove
    const ov = MOD._overlayEl;
    if (ov) {
      try {
        ov.style.transition = 'opacity 200ms ease-out';
        ov.style.opacity = '0';
      } catch (_) {}
      try {
        setTimeout(() => {
          try {
            ov.classList.remove('show');
            ov.setAttribute('aria-hidden', 'true');
          } catch (_) {}
          _unmountOverlay();
        }, 210);
      } catch (_) {
        _unmountOverlay();
      }
    }
  }

  // -----------------------------
  // Public API
  // -----------------------------
  MOD.init = MOD.init || function init(ctx) {
    if (MOD._inited) return;
    MOD._inited = true;
    MOD._ctx = ctx || null;
    MOD._persistAttempted = false;
    MOD._saveLoaded = false;
    MOD._autoRequested = false;
    MOD._autoPending = false;
    MOD._didLaunchTutorial = false;

    // Apply per-tab seen immediately (signed-out behavior)
    if (_safeSSGet() === '1') {
      try { _ensureUIState()._seenIntroBAP_v3 = true; } catch (_) {}
    }

    try {
      _buildOverlay();
    } catch (_) {
      // Fail-safe: never loop on init errors.
      _safeSSSet();
      try { _unmountOverlay(); } catch (_) {}
    }

    // If save doc was loaded before this module existed, consume it now.
    try {
      if (EC.SAVE && EC.SAVE._loadedOnce && !MOD._saveLoaded) {
        if (typeof MOD.onSaveLoaded === 'function') MOD.onSaveLoaded(EC.SAVE._lastLoadedDoc || null);
      }
    } catch (_) {}

    // If the user signs in later during this session and intro was already seen, persist it.
    try {
      if (EC.AUTH && typeof EC.AUTH.onChange === 'function') {
        EC.AUTH.onChange((u) => {
          if (u && _readSeen()) {
            try { setTimeout(() => { try { _persistSeenBestEffort(); } catch (_) {} }, 50); } catch (_) { _persistSeenBestEffort(); }
          }
        });
      }
    } catch (_) {}
  };

  MOD.onSaveLoaded = MOD.onSaveLoaded || function onSaveLoaded(data) {
    MOD._saveLoaded = true;
    try {
      if (data && data.ui && data.ui.seenIntroBAP_v3 === true) {
        _ensureUIState()._seenIntroBAP_v3 = true;
      }
    } catch (_) {}

    if (MOD._autoPending && !MOD._playing) {
      MOD._autoPending = false;
      if (!_readSeen()) {
        try { MOD.play(); } catch (_) {}
      }
    }
  };

  MOD.maybeAutoPlay = MOD.maybeAutoPlay || function maybeAutoPlay(ctx) {
    try { if (!MOD._inited) MOD.init(ctx); } catch (_) {}
    if (MOD._autoRequested) return;
    MOD._autoRequested = true;

    // Priority order:
    // 1) runtime flag
    // 2) sessionStorage fallback
    if (_readSeen()) return;

    // Signed-in users: wait for SAVE load before deciding, so we never replay for returning users.
    if (_isAuthed() && !MOD._saveLoaded) {
      MOD._autoPending = true;
      return;
    }

    try { MOD.play(); } catch (_) {
      try { _safeSSSet(); } catch (_) {}
    }
  };

  MOD.play = MOD.play || function play() {
    if (MOD._playing) return;
    if (_readSeen()) return;

    try {
      _mountOverlay();
      if (!MOD._overlayEl) throw new Error('missing overlay');

      MOD._playing = true;
      MOD._didLaunchTutorial = false;
      MOD._overlayEl.style.opacity = '1';
      MOD._overlayEl.style.transition = '';
      MOD._overlayEl.classList.add('show');
      MOD._overlayEl.setAttribute('aria-hidden', 'false');

      // Gate start on preload
      _preloadAll().then(() => {
        if (!MOD._playing) return;
        MOD._t0 = performance.now();
        MOD._raf = requestAnimationFrame(_tick);
      }).catch(() => {
        // If preload fails, fail-safe: mark seen (session) and do not loop. Do NOT auto-start tutorial.
        try { _safeSSSet(); } catch (_) {}
        try { _finish(false); } catch (_) {}
      });
    } catch (e) {
      MOD._playing = false;
      try { _safeSSSet(); } catch (_) {}
      try { _unmountOverlay(); } catch (_) {}
      throw e;
    }
  };

  MOD.skip = MOD.skip || function skip() {
    // If not playing, still ensure we don't loop this session.
    if (!MOD._playing) {
      _setSeenRuntime();
      _persistSeenBestEffort();
      return;
    }

    try {
      _finish(true);
    } catch (_) {
      MOD._playing = false;
      try { _safeSSSet(); } catch (_) {}
      try { _unmountOverlay(); } catch (_) {}
    }
  };

  MOD.isPlaying = MOD.isPlaying || function isPlaying() {
    return !!MOD._playing;
  };
})();
