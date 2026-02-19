/* Emotioncraft — Intro cutscene (Back-Alley Psychiatry) v3
   - Fullscreen DOM overlay, plates only (no baked text)
   - Skippable: button + tap/click anywhere
   - Blocks all game/canvas input while visible
   - Preloads all plates (no pop-in)
   - Persistence:
       runtime: EC.UI_STATE._seenIntroBAP_v3
       firestore: ui.seenIntroBAP_v3 (schema v2)
       session fallback: sessionStorage['ec_seenIntroBAP_v3']
   - Fail-safe: if anything throws, mark session seen and exit
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const MOD = (EC.UI_INTRO = EC.UI_INTRO || {});

  const KEY_SS = 'ec_seenIntroBAP_v3';

  const ASSETS = {
    A: './assets/intro_bap/plate_a.png',
    B: './assets/intro_bap/plate_b.png',
    C: './assets/intro_bap/plate_c.png',
    D: './assets/intro_bap/plate_d.png',
    E: './assets/intro_bap/plate_e.png',
  };

  const DUR_MS = 15000;

  // Scene marks (ms)
  const T = {
    s1a: 0,
    s1b: 3700,
    s2b: 7800,
    s3c1: 9600,
    s3c2: 10700,
    s3b: 12300,
    end: 15000,
  };

  // Text timings (ms)
  const TXT = {
    l1: [300, 1800],
    l2: [1200, 3700],
    l3: [3800, 6100],
    l4: [6100, 7800],
    l5: [7800, 9600],
    l6: [10700, 12300],
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

      .ecIntroStageV3{ position:absolute; inset:0; width:100%; height:100%; overflow:hidden; }

      .ecPlate{ position:absolute; inset:-2vh -2vw; width:calc(100% + 4vw); height:calc(100% + 4vh);
        opacity:0; will-change: transform, opacity; transform-origin: 50% 50%;
        filter: none;
      }
      .ecPlate img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; user-select:none; -webkit-user-drag:none; }
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

      /* Neon sign overlays */
      .ecSignLayer{ position:absolute; inset:0; pointer-events:none; }
      .ecSignBox{ position:absolute; left: 50%; top: 26.5%; width: 62%; height: 30.5%; transform: translate(-50%, -50%);
        display:flex; align-items:center; justify-content:center;
      }
      .ecSignStack{ width: 86%; height: 80%; display:flex; flex-direction:column; justify-content:center; gap: 0.12em; text-align:left; }
      .ecTube{ font-weight: 950; letter-spacing: 0.08em; font-size: clamp(22px, 6.0vw, 56px); line-height: 0.92;
        color: rgba(250,245,232,0.98);
        text-shadow: 0 0 9px rgba(255,255,255,0.35), 0 0 22px rgba(120,180,255,0.22), 0 0 36px rgba(255,120,120,0.15);
        filter: saturate(1.05);
      }
      .ecTube.flick{ animation: ecFlick 820ms steps(1,end) infinite; }
      @keyframes ecFlick{ 0%{ opacity:1 } 6%{ opacity:0.35 } 10%{ opacity:1 } 69%{ opacity:1 } 72%{ opacity:0.55 } 75%{ opacity:1 } 100%{ opacity:1 } }

      .ecTube.dead{ opacity:0.18; text-shadow:none; }

      .ecPcombo{ display:flex; align-items:baseline; gap: 0.18em; }
      .ecPcombo .pNeon{ font-weight: 950; letter-spacing: 0.08em; font-size: clamp(22px, 6.0vw, 56px); line-height: 0.92;
        color: rgba(250,245,232,0.98);
        text-shadow: 0 0 9px rgba(255,255,255,0.35), 0 0 22px rgba(120,180,255,0.22), 0 0 36px rgba(255,120,120,0.15);
      }
      .ecPcombo .tapeWord{ font-weight: 850; letter-spacing: 0.02em; font-size: clamp(17px, 4.4vw, 44px); line-height: 0.95;
        color: rgba(25,28,34,0.90);
        background: rgba(226, 216, 196, 0.82);
        padding: 0.12em 0.22em;
        border-radius: 10px;
        box-shadow: 0 6px 20px rgba(0,0,0,0.28);
        transform: rotate(-2.5deg) skewX(-4deg);
      }

      .ecPawnMask{ position:absolute; right: 8%; bottom: 10%; width: 44%; height: 30%;
        background: rgba(220, 214, 198, 0.84);
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.30);
        opacity:0;
        transform: rotate(-2deg);
      }

      .ecTapeSlap{ position:absolute; left: 58%; top: 36%; width: 18%; height: 6%;
        background: rgba(220, 214, 198, 0.78);
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.32);
        opacity:0;
        transform: translate(-50%, -50%) rotate(6deg) scale(0.92);
        will-change: opacity, transform;
      }

      /* Princess nametag */
      .ecNameTag{ position:absolute; left: 50%; top: 90.6%; transform: translate(-50%, -50%);
        width: 42%; max-width: 520px;
        text-align:center; pointer-events:none;
        opacity:0;
      }
      .ecNameTag .tagText{
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        font-weight: 950;
        letter-spacing: 0.16em;
        font-size: clamp(14px, 3.1vw, 28px);
        color: rgba(30, 34, 40, 0.88);
        text-shadow: 0 1px 0 rgba(255,255,255,0.22);
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
        .ecSignBox{ width: 72%; }
        .ecNameTag{ width: 58%; }
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
      C: mkPlate('C', 'photor'),
      D: mkPlate('D', 'photor'),
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
      l1: mkLine('center top', `<span class="scrim"><span class="t1">We’ve done it, Princess!</span></span>`),
      l2: mkLine('helmetTitle', `<span class="scrim"><span class="t2">The Noodler 2000</span></span>`),
      l3: mkLine('center bot', `<span class="scrim"><span class="tBody">With this helmet and our skilled hands, mental health problems vanish.</span></span>`),
      l4: mkLine('center bot', `<span class="scrim"><span class="tBody">Transcendence is guaranteed — mostly. Probably. We’ll see.</span></span>`),
      l5: mkLine('center bot', `<span class="scrim"><span class="tBody">We already have an office.</span></span>`),
      l6: mkLine('center bot', `<span class="scrim"><span class="tBody">Now we just need our first patient to cure.</span></span>`),
    };
    stage.appendChild(textLayer);

    // Sign overlays
    const signLayer = document.createElement('div');
    signLayer.className = 'ecSignLayer';

    const signBox = document.createElement('div');
    signBox.className = 'ecSignBox';

    const signStack = document.createElement('div');
    signStack.className = 'ecSignStack';

    const neonBack = document.createElement('div'); neonBack.className = 'ecTube flick'; neonBack.textContent = 'BACK';
    const neonAlley = document.createElement('div'); neonAlley.className = 'ecTube flick'; neonAlley.textContent = 'ALLEY';
    const neonThird = document.createElement('div'); neonThird.className = 'ecTube flick'; neonThird.textContent = 'PAWN';

    const altThird = document.createElement('div');
    altThird.className = 'ecPcombo';
    altThird.innerHTML = `<span class="pNeon">P</span><span class="tapeWord">sychiatry</span>`;

    signStack.appendChild(neonBack);
    signStack.appendChild(neonAlley);
    signStack.appendChild(neonThird);

    const pawnMask = document.createElement('div');
    pawnMask.className = 'ecPawnMask';

    const tapeSlap = document.createElement('div');
    tapeSlap.className = 'ecTapeSlap';

    signBox.appendChild(signStack);
    signBox.appendChild(pawnMask);
    signBox.appendChild(tapeSlap);
    signLayer.appendChild(signBox);
    stage.appendChild(signLayer);

    // Name tag overlay
    const nameTag = document.createElement('div');
    nameTag.className = 'ecNameTag';
    nameTag.innerHTML = `<div class="tagText">PRINCESS</div>`;
    stage.appendChild(nameTag);

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
    MOD._sign = { signLayer, signBox, signStack, neonThird, altThird, pawnMask, tapeSlap, neonBack, neonAlley };
    MOD._nameTag = nameTag;
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
    const urls = [ASSETS.A, ASSETS.B, ASSETS.C, ASSETS.D, ASSETS.E];
    MOD._preloadPromise = Promise.all(urls.map(_loadImage));
    return MOD._preloadPromise;
  }

  // ----------------------------
  // Timeline helpers
  // ----------------------------
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function _fade(t, t0, t1, fin, fout) {
    const inD = (fin == null ? 220 : fin);
    const outD = (fout == null ? 220 : fout);
    if (t < t0 - inD) return 0;
    if (t >= t1 + outD) return 0;
    let a = 1;
    if (t < t0) a = clamp01((t - (t0 - inD)) / inD);
    if (t > t1) a = clamp01(1 - (t - t1) / outD);
    return a;
  }

  function _plateCross(t, fromKey, toKey, startMs, durMs) {
    const p = clamp01((t - startMs) / durMs);
    const aTo = p;
    const aFrom = 1 - p;
    return { aFrom, aTo };
  }

  function _noise(n) {
    // deterministic pseudo-noise in [0,1)
    const x = Math.sin(n) * 43758.5453123;
    return x - Math.floor(x);
  }

  function _shake(t, center, dur, ampPx) {
    const dt = t - center;
    if (dt < 0 || dt > dur) return { x: 0, y: 0, s: 0 };
    const k = 1 - dt / dur;
    const a = ampPx * k;
    const n1 = _noise((t + 17.7) * 0.07);
    const n2 = _noise((t + 91.3) * 0.07);
    return { x: (n1 - 0.5) * 2 * a, y: (n2 - 0.5) * 2 * a, s: a };
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

  function _setSignState(state) {
    const S = MOD._sign;
    if (!S) return;
    // state 0: hidden; 1: PAWN; 2: P+sychiatry
    if (state === 0) {
      S.signLayer.style.opacity = '0';
      return;
    }
    S.signLayer.style.opacity = '1';

    // Clear third line content
    try {
      while (S.neonThird.firstChild) S.neonThird.removeChild(S.neonThird.firstChild);
    } catch (_) {}

    if (state === 1) {
      S.neonThird.textContent = 'PAWN';
      if (!S.neonThird.classList.contains('ecTube')) S.neonThird.className = 'ecTube flick';
    } else {
      // Replace the 3rd line node with the P combo
      S.neonThird.textContent = '';
      // Ensure stack contains altThird at index 2
      try {
        if (S.signStack.children[2] !== S.altThird) {
          if (S.altThird.parentNode) S.altThird.parentNode.removeChild(S.altThird);
          // remove existing third
          if (S.neonThird.parentNode === S.signStack) S.signStack.removeChild(S.neonThird);
          S.signStack.appendChild(S.altThird);
        }
      } catch (_) {}
    }

    // Ensure PAWN state restores neonThird
    if (state === 1) {
      try {
        if (S.signStack.children[2] !== S.neonThird) {
          if (S.neonThird.parentNode) S.neonThird.parentNode.removeChild(S.neonThird);
          if (S.altThird.parentNode === S.signStack) S.signStack.removeChild(S.altThird);
          S.signStack.appendChild(S.neonThird);
        }
      } catch (_) {}
    }
  }

  function _tick(now) {
    if (!MOD._playing) return;

    const t = now - MOD._t0;

    // End fade (keep fully visible until the last 250ms)
    let endFade = 1;
    if (t > (T.end - 250)) {
      endFade = clamp01(1 - (t - (T.end - 250)) / 250);
    }
    if (MOD._overlayEl) MOD._overlayEl.style.opacity = String(endFade);

    // Global micro shakes
    const shSign = _shake(t, 10700, 140, 10);
    const shDog = _shake(t, 12300, 120, 10);
    const sx = shSign.x + shDog.x;
    const sy = shSign.y + shDog.y;
    if (MOD._stageEl) MOD._stageEl.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;

    // Plate opacities + transforms (Ken Burns)
    const vw = (window.innerWidth || 360);
    const vh = (window.innerHeight || 640);
    const base = Math.min(vw, vh);

    // Default everything hidden
    const op = { A: 0, B: 0, C: 0, D: 0, E: 0 };

    // Determine which plates are active + crossfades
    if (t < T.s1b) {
      op.A = 1;
    } else if (t < T.s2b) {
      // A -> B crossfade 260ms
      const c = _plateCross(t, 'A', 'B', T.s1b, 260);
      op.A = c.aFrom;
      op.B = c.aTo;
    } else if (t < T.s3c1) {
      // B -> C crossfade 260ms
      const c = _plateCross(t, 'B', 'C', T.s2b, 260);
      op.B = c.aFrom;
      op.C = c.aTo;
    } else if (t < T.s3c2) {
      // C -> D snappy 130ms
      const c = _plateCross(t, 'C', 'D', T.s3c1, 130);
      op.C = c.aFrom;
      op.D = c.aTo;
    } else if (t < T.s3b) {
      // D -> C snappy 130ms
      const c = _plateCross(t, 'D', 'C', T.s3c2, 130);
      op.D = c.aFrom;
      op.C = c.aTo;
    } else {
      // C -> E crossfade 260ms
      const c = _plateCross(t, 'C', 'E', T.s3b, 260);
      op.C = c.aFrom;
      op.E = c.aTo;
    }

    // Scene motion params
    // Scene 1 (A): slow push toward helmet
    const pA = clamp01(t / T.s1b);
    const A_sc = lerp(1.02, 1.12, pA);
    const A_tx = lerp(-18, -6, pA);
    const A_ty = lerp(18, -10, pA);

    // Scene 2 (B): start low → drift up to face
    const pB = clamp01((t - T.s1b) / (T.s2b - T.s1b));
    const B_sc = lerp(1.02, 1.14, pB);
    const B_tx = lerp(0, -10, pB);
    const B_ty = lerp(42, -10, pB);

    // Scene 3 (C/D): push into sign; final zoom tighter
    const pC1 = clamp01((t - T.s2b) / (T.s3c1 - T.s2b));
    const C1_sc = lerp(1.02, 1.10, pC1);
    const C1_tx = lerp(0, 0, pC1);
    const C1_ty = lerp(26, -8, pC1);

    const pD = clamp01((t - T.s3c1) / (T.s3c2 - T.s3c1));
    const D_sc = lerp(1.06, 1.10, pD);
    const D_tx = lerp(10, 4, pD);
    const D_ty = lerp(18, 6, pD);

    const pC2 = clamp01((t - T.s3c2) / (T.s3b - T.s3c2));
    const C2_sc = lerp(1.10, 1.34, pC2);
    const C2_tx = lerp(0, 0, pC2);
    const C2_ty = lerp(10, -58, pC2);

    // Scene 4 (E): slow push into dog face + bonk bounce
    const pE = clamp01((t - T.s3b) / (T.end - T.s3b));
    let E_sc = lerp(1.01, 1.14, pE);
    let E_tx = lerp(0, 0, pE);
    let E_ty = lerp(10, -18, pE);

    // Bonk bounce: first ~90ms after scene start
    if (t >= T.s3b && t < T.s3b + 90) {
      const bb = 1 + 0.045 * (1 - (t - T.s3b) / 90);
      E_sc *= bb;
      E_tx += (shDog.x * 0.4);
      E_ty += (shDog.y * 0.4);
    }

    // Choose correct C motion segment based on timeline
    const useC2 = (t >= T.s3c2);

    // Apply transforms
    _applyPlate('A', op.A, A_tx, A_ty, A_sc);
    _applyPlate('B', op.B, B_tx, B_ty, B_sc);
    _applyPlate('C', op.C, useC2 ? C2_tx : C1_tx, useC2 ? C2_ty : C1_ty, useC2 ? C2_sc : C1_sc);
    _applyPlate('D', op.D, D_tx, D_ty, D_sc);
    _applyPlate('E', op.E, E_tx, E_ty, E_sc);

    // Text overlays
    const a1 = _fade(t, TXT.l1[0], TXT.l1[1], 220, 220);
    const a2 = _fade(t, TXT.l2[0], TXT.l2[1], 220, 240);
    const a3 = _fade(t, TXT.l3[0], TXT.l3[1], 220, 220);
    const a4 = _fade(t, TXT.l4[0], TXT.l4[1], 220, 220);
    const a5 = _fade(t, TXT.l5[0], TXT.l5[1], 220, 220);
    const a6 = _fade(t, TXT.l6[0], TXT.l6[1], 220, 220);

    _applyLine(MOD._lines && MOD._lines.l1, a1);
    _applyLine(MOD._lines && MOD._lines.l2, a2);
    _applyLine(MOD._lines && MOD._lines.l3, a3);
    _applyLine(MOD._lines && MOD._lines.l4, a4);
    _applyLine(MOD._lines && MOD._lines.l5, a5);
    _applyLine(MOD._lines && MOD._lines.l6, a6);

    // Sign overlays (Scene 3)
    let signState = 0;
    if (t >= 7800 && t < 9600) signState = 1;
    if (t >= 9600 && t < 10700) signState = 1;
    if (t >= 10700 && t < 12300) signState = 2;

    _setSignState(signState);

    // Pawn mask during D segment
    if (MOD._sign && MOD._sign.pawnMask) {
      const pm = _fade(t, 9600, 10700, 120, 160);
      MOD._sign.pawnMask.style.opacity = String(pm);
    }

    // Tape slap cue near start of D segment
    if (MOD._sign && MOD._sign.tapeSlap) {
      const ts = _fade(t, 9650, 9770, 60, 80);
      MOD._sign.tapeSlap.style.opacity = String(ts);
      const tp = clamp01((t - 9650) / 90);
      const sPop = lerp(0.92, 1.05, tp);
      MOD._sign.tapeSlap.style.transform = `translate(-50%, -50%) rotate(6deg) scale(${sPop})`;
    }

    // Neon dead/stutter (random tube) during scene 3
    if (signState !== 0) {
      const S = MOD._sign;
      if (S) {
        if (!MOD._nextFlickAt || t > MOD._nextFlickAt) {
          MOD._nextFlickAt = t + 260 + Math.floor(_noise(t * 0.003 + 7.2) * 420);
          const r = _noise(t * 0.006 + 2.1);
          S.neonBack.classList.toggle('dead', r < 0.04);
          S.neonAlley.classList.toggle('dead', r > 0.04 && r < 0.08);
          // third line is swapped in state 2; keep stutter on back/alley only
        }
      }
    } else {
      const S = MOD._sign;
      if (S) {
        S.neonBack.classList.remove('dead');
        S.neonAlley.classList.remove('dead');
      }
    }

    // Glow pulses
    const G = MOD._glow;
    if (G && G.layer) {
      let glowOn = 0;
      if (t >= T.s1b && t < T.s2b) {
        // Plate B energy pulse
        const p = (t - T.s1b) / 380;
        glowOn = 0.55 + 0.25 * Math.sin(p * Math.PI * 2);
        G.layer.style.opacity = String(0.75);
        G.r.style.opacity = String(0.55 * glowOn);
        G.g.style.opacity = String(0.50 * glowOn);
        G.y.style.opacity = String(0.35 * glowOn);
        G.hr.style.opacity = '0';
        G.hg.style.opacity = '0';
        G.hy.style.opacity = '0';
      } else if (t >= T.s3b && t < T.end) {
        // Plate E bulb pulse
        const p = (t - T.s3b) / 520;
        glowOn = 0.55 + 0.25 * Math.sin(p * Math.PI * 2);
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

    // Name tag overlay (Scene 4)
    if (MOD._nameTag) {
      const nt = _fade(t, 12300, 15000, 180, 250);
      MOD._nameTag.style.opacity = String(nt);
    }

    // Finish
    if (t >= DUR_MS) {
      try { _finish(); } catch (_) {}
      return;
    }

    MOD._raf = requestAnimationFrame(_tick);
  }

  function _finish() {
    if (!MOD._playing) return;
    MOD._playing = false;

    try { if (MOD._raf) cancelAnimationFrame(MOD._raf); } catch (_) {}
    MOD._raf = 0;

    _setSeenRuntime();
    _persistSeenBestEffort();

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
          // Keep overlay object for reuse (but unmounted)
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
        // If preload fails, fail-safe: mark seen (session) and do not loop.
        try { _safeSSSet(); } catch (_) {}
        try { _finish(); } catch (_) {}
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
      _finish();
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
