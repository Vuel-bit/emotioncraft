/* Emotioncraft — One-time intro cutscene (Back-Alley Psychiatry)
   - DOM overlay only (no new libs)
   - Skippable: button + tap anywhere
   - Persistence: Firestore ui.seenIntroBAP (schema v2) via systems_firebase SAVE._writeCurrentPat
   - Signed-out fallback: sessionStorage (per-tab/session)
*/
(() => {
  const EC = (window.EC = window.EC || {});

  const MOD = (EC.UI_INTRO = EC.UI_INTRO || {});

  const KEY_SS = 'ec_seenIntroBAP';
  const DUR_MS = 10000;
  const SCENE_CUTS = [0.0, 0.8, 2.2, 3.6, 5.2, 6.8, 8.8, 10.0];

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
    if (UI._seenIntroBAP) return true;
    return _safeSSGet() === '1';
  }

  function _setSeenRuntime() {
    const UI = _ensureUIState();
    UI._seenIntroBAP = true;
    _safeSSSet();
  }

  function _persistSeenBestEffort() {
    // Firestore persistence only when signed in.
    if (!_isAuthed()) return;
    if (!EC.SAVE || typeof EC.SAVE._writeCurrentPat !== 'function') return;
    // Avoid spamming writes.
    if (MOD._persistAttempted) return;
    MOD._persistAttempted = true;
    try { EC.SAVE._writeCurrentPat('seenIntroBAP'); } catch (_) {}
  }

  function _injectStyles() {
    if (MOD._styleInjected) return;
    MOD._styleInjected = true;
    const css = `
      .ecIntroOverlay{ position:fixed; inset:0; z-index: 10000; display:none; align-items:center; justify-content:center; background: rgba(8,10,14,0.92); color: rgba(232,238,252,0.95); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      .ecIntroOverlay.show{ display:flex; }
      .ecIntroOverlay *{ box-sizing:border-box; }
      .ecIntroCard{ width:min(900px, calc(100vw - 24px)); height:min(520px, calc(100vh - 24px)); border-radius: 18px; border: 1px solid rgba(255,255,255,0.12); background: rgba(18,22,35,0.70); box-shadow: 0 20px 70px rgba(0,0,0,0.55); overflow:hidden; position:relative; }
      .ecIntroStage{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding: 18px; }
      .ecIntroSkip{ position:absolute; top: 10px; right: 10px; z-index: 3; border: 1px solid rgba(255,255,255,0.18); background: rgba(12,16,26,0.78); color: rgba(232,238,252,0.95); border-radius: 999px; padding: 8px 12px; font-size: 12px; cursor:pointer; }
      .ecIntroSkip:active{ transform: translateY(1px); }
      .ecIntroHint{ position:absolute; left: 12px; bottom: 10px; z-index: 3; font-size: 12px; color: rgba(232,238,252,0.72); }

      .ecIntroScene{ width:100%; height:100%; display:none; align-items:center; justify-content:center; }
      .ecIntroScene.show{ display:flex; }
      .ecIntroCenter{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap: 14px; text-align:center; width:100%; }

      .ecNeon{ font-weight: 900; letter-spacing: 1.2px; font-size: clamp(28px, 5.2vw, 52px); padding: 16px 18px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.16);
        color: rgba(255,245,210,0.96);
        text-shadow: 0 0 10px rgba(255, 220, 120, 0.55), 0 0 26px rgba(255, 140, 240, 0.30);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.05) inset, 0 16px 60px rgba(0,0,0,0.35);
        background: radial-gradient(circle at 30% 30%, rgba(255, 70, 200, 0.16), rgba(20,24,38,0.65));
        animation: ecNeonFlicker 850ms steps(1,end) infinite;
      }
      @keyframes ecNeonFlicker{ 0%{ opacity:1 } 7%{ opacity:0.35 } 10%{ opacity:1 } 68%{ opacity:1 } 71%{ opacity:0.55 } 74%{ opacity:1 } 100%{ opacity:1 } }

      .ecSmall{ font-size: 12px; color: rgba(232,238,252,0.70); }
      .ecBig{ font-weight: 900; font-size: clamp(26px, 4.6vw, 44px); letter-spacing: 0.4px; }
      .ecSub{ font-size: clamp(13px, 2.2vw, 16px); color: rgba(232,238,252,0.78); }

      .ecTable{ width:min(760px, 100%); display:flex; align-items:center; justify-content:space-between; gap: 16px; }
      .ecBench{ flex:1; height: 220px; border-radius: 16px; background: linear-gradient(180deg, rgba(10,12,18,0.32), rgba(10,12,18,0.74)); border: 1px solid rgba(255,255,255,0.10); position:relative; overflow:hidden; }
      .ecBench:before{ content:''; position:absolute; left:-20%; right:-20%; bottom:-30px; height: 90px; background: rgba(255,255,255,0.06); transform: skewX(-14deg); }
      .ecHelmet{ width: 230px; height: 220px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.12); background: rgba(12,16,26,0.78); position:relative; display:flex; align-items:center; justify-content:center; }
      .ecHelmShell{ width: 170px; height: 110px; border-radius: 60px; background: rgba(232,238,252,0.10); border: 1px solid rgba(255,255,255,0.16); position:relative; }
      .ecHelmShell:before{ content:''; position:absolute; left: 16px; right: 16px; top: 18px; height: 20px; border-radius: 999px; background: rgba(0,0,0,0.22); }
      .ecKnob{ width: 18px; height: 18px; border-radius: 999px; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.18); position:absolute; top: -10px; }
      .ecKnob.k1{ left: 22px; }
      .ecKnob.k2{ left: 70px; }
      .ecKnob.k3{ left: 120px; }
      .ecRefund{ position:absolute; bottom: 10px; left: 12px; right: 12px; font-size: 12px; color: rgba(255, 196, 210, 0.86); text-align:center; }

      .ecDogWrap{ width:min(820px, 100%); display:flex; align-items:center; justify-content:center; gap: 22px; }
      .ecDogHead{ width: 260px; height: 220px; border-radius: 110px; background: rgba(150, 98, 58, 0.92); border: 1px solid rgba(255,255,255,0.10); position:relative; box-shadow: 0 22px 70px rgba(0,0,0,0.45); }
      .ecDogEar{ width: 86px; height: 110px; border-radius: 80px; background: rgba(120, 76, 44, 0.92); position:absolute; top: 10px; }
      .ecDogEar.l{ left: 8px; transform: rotate(-18deg); }
      .ecDogEar.r{ right: 8px; transform: rotate(18deg); }
      .ecDogFace{ position:absolute; left: 46px; right: 46px; top: 64px; bottom: 34px; border-radius: 90px; background: rgba(170, 122, 78, 0.92); border: 1px solid rgba(255,255,255,0.08); }
      .ecDogEye{ width: 46px; height: 16px; border-radius: 999px; background: rgba(12,16,26,0.55); position:absolute; top: 58px; }
      .ecDogEye.l{ left: 64px; transform: rotate(-6deg); }
      .ecDogEye.r{ right: 64px; transform: rotate(6deg); }
      .ecDogNose{ width: 46px; height: 34px; border-radius: 18px; background: rgba(12,16,26,0.65); position:absolute; left: 50%; top: 114px; transform: translateX(-50%); }
      .ecDrool{ width: 16px; height: 26px; border-radius: 12px; background: rgba(210, 240, 255, 0.78); position:absolute; left: 52%; top: 148px; transform: translateX(-50%); filter: blur(0.2px); opacity: 0.88; }
      .ecHelmetOnDog{ position:absolute; left: 50%; top: 12px; transform: translateX(-50%); width: 190px; height: 86px; border-radius: 56px; background: rgba(232,238,252,0.12); border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 12px 40px rgba(0,0,0,0.35); }
      .ecHelmetOnDog:before{ content:''; position:absolute; left: 16px; right: 16px; top: 14px; height: 14px; border-radius: 999px; background: rgba(0,0,0,0.22); }
      .ecBonk{ font-weight: 900; letter-spacing: 0.6px; padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(12,16,26,0.55); }
      .ecBonkPop{ animation: ecPop 520ms ease-out infinite; }
      @keyframes ecPop{ 0%{ transform: translateY(0) scale(1); } 50%{ transform: translateY(-4px) scale(1.04);} 100%{ transform: translateY(0) scale(1);} }

      .ecKnobGrid{ display:grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 14px; width:min(760px, 100%); }
      .ecKnobCard{ border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); background: rgba(12,16,26,0.62); padding: 14px; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
      .ecKnobDial{ width: 64px; height: 64px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.18); background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.16), rgba(0,0,0,0.28)); position:relative; animation: ecWiggle 160ms ease-in-out infinite alternate; }
      .ecKnobDial:after{ content:''; position:absolute; left: 50%; top: 8px; width: 4px; height: 22px; border-radius: 2px; background: rgba(255,255,255,0.55); transform: translateX(-50%); }
      @keyframes ecWiggle{ from{ transform: rotate(-4deg);} to{ transform: rotate(7deg);} }
      .ecKnobLabel{ font-weight: 800; letter-spacing: 0.5px; }
      .ecKnobSub{ font-size: 12px; color: rgba(232,238,252,0.72); }
      .ecWhine{ font-size: 12px; color: rgba(255, 232, 170, 0.88); }

      .ecHelmetView{ width:min(820px, 100%); height: 360px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.14);
        background: rgba(8,10,14,0.22);
        position:relative; overflow:hidden;
      }
      .ecHelmetFrame{ position:absolute; inset: 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 0 0 1px rgba(0,0,0,0.35) inset; }
      .ecScan{ position:absolute; inset:0; pointer-events:none; opacity: 0.9;
        background-image:
          repeating-linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 1px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px),
          radial-gradient(circle at 50% 20%, rgba(255,255,255,0.08), rgba(0,0,0,0) 55%);
        animation: ecScanMove 750ms linear infinite;
        mix-blend-mode: overlay;
      }
      @keyframes ecScanMove{ from{ transform: translateY(-10px);} to{ transform: translateY(10px);} }
      .ecJitter{ animation: ecJitter 120ms steps(1,end) infinite; }
      @keyframes ecJitter{ 0%{ transform: translate(0,0);} 25%{ transform: translate(1px,-1px);} 50%{ transform: translate(-1px,1px);} 75%{ transform: translate(1px,1px);} 100%{ transform: translate(0,0);} }
    `;
    try {
      const st = document.createElement('style');
      st.type = 'text/css';
      st.setAttribute('data-ec-intro', '1');
      st.appendChild(document.createTextNode(css));
      document.head.appendChild(st);
    } catch (_) {}
  }

  function _buildOverlay() {
    if (MOD._overlayEl) return;
    _injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'ecIntroOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.id = 'ecIntroOverlayBAP';

    const card = document.createElement('div');
    card.className = 'ecIntroCard';

    const stage = document.createElement('div');
    stage.className = 'ecIntroStage';

    const btn = document.createElement('button');
    btn.className = 'ecIntroSkip';
    btn.type = 'button';
    btn.textContent = 'Skip';

    const hint = document.createElement('div');
    hint.className = 'ecIntroHint';
    hint.textContent = 'Tap anywhere to skip';

    card.appendChild(stage);
    card.appendChild(btn);
    card.appendChild(hint);
    overlay.appendChild(card);

    // Scene nodes (created once)
    const scenes = [];
    function mkScene() {
      const s = document.createElement('div');
      s.className = 'ecIntroScene';
      stage.appendChild(s);
      scenes.push(s);
      return s;
    }

    // Scene 0: neon sign
    {
      const s = mkScene();
      const c = document.createElement('div');
      c.className = 'ecIntroCenter';
      const neon = document.createElement('div');
      neon.className = 'ecNeon';
      neon.textContent = 'BACK-ALLEY PSYCHIATRY';
      const sub = document.createElement('div');
      sub.className = 'ecSmall';
      sub.textContent = '(buzzing neon… probably safe)';
      c.appendChild(neon);
      c.appendChild(sub);
      s.appendChild(c);
    }

    // Scene 1: clinic table + helmet
    {
      const s = mkScene();
      const wrap = document.createElement('div');
      wrap.className = 'ecTable';
      const bench = document.createElement('div');
      bench.className = 'ecBench';
      const helmet = document.createElement('div');
      helmet.className = 'ecHelmet';
      const shell = document.createElement('div');
      shell.className = 'ecHelmShell';
      const k1 = document.createElement('div'); k1.className = 'ecKnob k1';
      const k2 = document.createElement('div'); k2.className = 'ecKnob k2';
      const k3 = document.createElement('div'); k3.className = 'ecKnob k3';
      shell.appendChild(k1); shell.appendChild(k2); shell.appendChild(k3);
      const refund = document.createElement('div');
      refund.className = 'ecRefund';
      refund.textContent = 'No refunds.';
      helmet.appendChild(shell);
      helmet.appendChild(refund);
      wrap.appendChild(bench);
      wrap.appendChild(helmet);
      s.appendChild(wrap);
    }

    // Scene 2: inventor boast
    {
      const s = mkScene();
      const c = document.createElement('div');
      c.className = 'ecIntroCenter';
      const big = document.createElement('div');
      big.className = 'ecBig';
      big.textContent = 'I can fix your vibes.';
      const sub = document.createElement('div');
      sub.className = 'ecSub';
      sub.textContent = 'Certified-ish. Mostly.';
      c.appendChild(big);
      c.appendChild(sub);
      s.appendChild(c);
    }

    // Scene 3: helmet on the dog
    {
      const s = mkScene();
      const wrap = document.createElement('div');
      wrap.className = 'ecDogWrap';
      const dog = document.createElement('div');
      dog.className = 'ecDogHead';
      const earL = document.createElement('div'); earL.className = 'ecDogEar l';
      const earR = document.createElement('div'); earR.className = 'ecDogEar r';
      const face = document.createElement('div'); face.className = 'ecDogFace';
      const eyeL = document.createElement('div'); eyeL.className = 'ecDogEye l';
      const eyeR = document.createElement('div'); eyeR.className = 'ecDogEye r';
      const nose = document.createElement('div'); nose.className = 'ecDogNose';
      const drool = document.createElement('div'); drool.className = 'ecDrool';
      const helm = document.createElement('div'); helm.className = 'ecHelmetOnDog';
      dog.appendChild(earL); dog.appendChild(earR);
      dog.appendChild(face);
      dog.appendChild(eyeL); dog.appendChild(eyeR);
      dog.appendChild(nose); dog.appendChild(drool);
      dog.appendChild(helm);
      const bonk = document.createElement('div');
      bonk.className = 'ecBonk ecBonkPop';
      bonk.textContent = 'BONK';
      wrap.appendChild(dog);
      wrap.appendChild(bonk);
      s.appendChild(wrap);
    }

    // Scene 4: knob chaos
    {
      const s = mkScene();
      const c = document.createElement('div');
      c.className = 'ecIntroCenter';
      const grid = document.createElement('div');
      grid.className = 'ecKnobGrid';
      const labels = [
        { t: 'FEELINGS', sub: 'probably important' },
        { t: 'SPIN', sub: 'make it… science?' },
        { t: 'VIBES', sub: 'turn left for “sure”' },
        { t: 'UH-OH', sub: 'do NOT turn this' },
      ];
      for (let i = 0; i < labels.length; i++) {
        const card2 = document.createElement('div');
        card2.className = 'ecKnobCard';
        const left = document.createElement('div');
        const lbl = document.createElement('div'); lbl.className = 'ecKnobLabel'; lbl.textContent = labels[i].t;
        const sub = document.createElement('div'); sub.className = 'ecKnobSub'; sub.textContent = labels[i].sub;
        left.appendChild(lbl); left.appendChild(sub);
        const dial = document.createElement('div'); dial.className = 'ecKnobDial';
        card2.appendChild(left);
        card2.appendChild(dial);
        grid.appendChild(card2);
      }
      const whine = document.createElement('div');
      whine.className = 'ecWhine';
      whine.textContent = '(click-click… rising whiiiiine…)';
      c.appendChild(grid);
      c.appendChild(whine);
      s.appendChild(c);
    }

    // Scene 5: inside helmet → existing wells behind
    {
      const s = mkScene();
      const c = document.createElement('div');
      c.className = 'ecIntroCenter';
      const view = document.createElement('div');
      view.className = 'ecHelmetView ecJitter';
      const frame = document.createElement('div');
      frame.className = 'ecHelmetFrame';
      const scan = document.createElement('div');
      scan.className = 'ecScan';
      view.appendChild(frame);
      view.appendChild(scan);
      const sub = document.createElement('div');
      sub.className = 'ecSub';
      sub.textContent = 'Inside the helmet: noise / static / misalignment…';
      c.appendChild(view);
      c.appendChild(sub);
      s.appendChild(c);
    }

    // Scene 6: title card
    {
      const s = mkScene();
      const c = document.createElement('div');
      c.className = 'ecIntroCenter';
      const big = document.createElement('div');
      big.className = 'ecBig';
      big.textContent = 'BACK-ALLEY PSYCHIATRY (BAP)';
      const sub = document.createElement('div');
      sub.className = 'ecSub';
      sub.textContent = 'Turn the knobs. Stabilize the mess.';
      c.appendChild(big);
      c.appendChild(sub);
      s.appendChild(c);
    }

    // Input handling (skip anywhere)
    function onAny(ev) {
      if (!MOD._playing) return;
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (_) {}
      MOD.skip();
    }
    function onBtn(ev) {
      if (!MOD._playing) return;
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (_) {}
      MOD.skip();
    }
    overlay.addEventListener('pointerdown', onAny, { capture: true, passive: false });
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
    MOD._skipBtnEl = btn;
    MOD._hintEl = hint;
    MOD._scenes = scenes;

    try { document.body.appendChild(overlay); } catch (_) {}
  }

  function _showScene(idx) {
    const arr = MOD._scenes || [];
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      if (i === idx) arr[i].classList.add('show');
      else arr[i].classList.remove('show');
    }
    MOD._sceneIdx = idx;

    // During the “inside helmet” scene, reduce overlay darkness so the game wells show through.
    try {
      if (MOD._overlayEl) {
        MOD._overlayEl.style.background = (idx === 5) ? 'rgba(8,10,14,0.35)' : 'rgba(8,10,14,0.92)';
      }
    } catch (_) {}
  }

  function _tick(now) {
    if (!MOD._playing) return;
    const t = (now - MOD._t0) / 1000;
    let idx = 0;
    if (t < SCENE_CUTS[1]) idx = 0;
    else if (t < SCENE_CUTS[2]) idx = 1;
    else if (t < SCENE_CUTS[3]) idx = 2;
    else if (t < SCENE_CUTS[4]) idx = 3;
    else if (t < SCENE_CUTS[5]) idx = 4;
    else if (t < SCENE_CUTS[6]) idx = 5;
    else idx = 6;
    if (idx !== MOD._sceneIdx) _showScene(idx);
    MOD._raf = requestAnimationFrame(_tick);
  }

  function _finish() {
    MOD._playing = false;
    try { if (MOD._overlayEl) MOD._overlayEl.classList.remove('show'); } catch (_) {}
    try { if (MOD._overlayEl) MOD._overlayEl.setAttribute('aria-hidden', 'true'); } catch (_) {}
    try { if (MOD._raf) cancelAnimationFrame(MOD._raf); } catch (_) {}
    MOD._raf = 0;
    try { if (MOD._tDone) clearTimeout(MOD._tDone); } catch (_) {}
    MOD._tDone = 0;
    try { if (MOD._overlayEl) MOD._overlayEl.style.background = 'rgba(8,10,14,0.92)'; } catch (_) {}

    _setSeenRuntime();
    _persistSeenBestEffort();
  }

  // -----------------------------
  // Public API
  // -----------------------------
  MOD.init = MOD.init || function init(ctx) {
    if (MOD._inited) return;
    MOD._inited = true;
    MOD._ctx = ctx || MOD._ctx || null;
    MOD._saveLoaded = false;
    MOD._autoRequested = false;
    MOD._autoPending = false;
    MOD._sceneIdx = -1;
    MOD._persistAttempted = false;

    // Apply per-tab seen immediately (signed-out behavior).
    if (_safeSSGet() === '1') {
      try { _ensureUIState()._seenIntroBAP = true; } catch (_) {}
    }

    try { _buildOverlay(); } catch (_) {
      // Fail-safe: never loop on init errors.
      _safeSSSet();
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

    // Mirror persisted ui.seenIntroBAP into runtime state.
    try {
      if (data && data.ui && data.ui.seenIntroBAP === true) {
        _ensureUIState()._seenIntroBAP = true;
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
      _buildOverlay();
      if (!MOD._overlayEl) throw new Error('missing overlay');
      MOD._playing = true;
      MOD._sceneIdx = -1;
      MOD._overlayEl.classList.add('show');
      MOD._overlayEl.setAttribute('aria-hidden', 'false');
      _showScene(0);
      MOD._t0 = performance.now();
      MOD._raf = requestAnimationFrame(_tick);
      try { MOD._tDone = setTimeout(() => { try { _finish(); } catch (_) {} }, DUR_MS + 30); } catch (_) {}
    } catch (e) {
      try { if (MOD._overlayEl) MOD._overlayEl.classList.remove('show'); } catch (_) {}
      MOD._playing = false;
      _safeSSSet();
      throw e;
    }
  };

  MOD.skip = MOD.skip || function skip() {
    if (!MOD._playing) {
      _setSeenRuntime();
      _persistSeenBestEffort();
      return;
    }
    try { _finish(); } catch (_) {
      try { if (MOD._overlayEl) MOD._overlayEl.classList.remove('show'); } catch (_) {}
      MOD._playing = false;
      _safeSSSet();
    }
  };

  MOD.isPlaying = MOD.isPlaying || function isPlaying() {
    return !!MOD._playing;
  };
})();
