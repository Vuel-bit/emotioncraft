/* Emotioncraft — Primary Tutorial (no patient, no save)
   Lightweight step machine that runs an isolated MVP level via _initMVP(defOverride).

   Guardrails:
   - No patient slot usage.
   - No save/progression writes.
   - Minimal plumbing only.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const SIM = (EC.SIM = EC.SIM || {});


  // Route MVP init through ENGINE/ACTIONS so SIM init writes are bracketed (simguard-friendly).
  function _initMVP(levelOrDef) {
    try {
      const eng = EC.ENGINE;
      if (eng && typeof eng.dispatch === 'function') {
        const r = eng.dispatch('initMVP', levelOrDef);
        if (r && r.ok) return r;
      }
    } catch (_) {}
    try {
      if (EC.ACTIONS && typeof EC.ACTIONS.initMVP === 'function') {
        const r2 = EC.ACTIONS.initMVP(levelOrDef);
        if (r2 && r2.ok) return r2;
      }
    } catch (_) {}
    try {
      if (SIM && typeof SIM.initMVP === 'function') { _initMVP(levelOrDef); return { ok: true }; }
    } catch (_) {}
    return { ok: false, reason: 'missing_initMVP' };
  }


  const OPP = (EC.CONST && Array.isArray(EC.CONST.OPP)) ? EC.CONST.OPP : [3,4,5,0,1,2];

  function _btn(id){ try { return document.getElementById(id); } catch(_) { return null; } }

  const MOD = (EC.TUT = EC.TUT || {});

  let _def = null;
  let _stepStarted = false;
  let _psySnap = 0;
  let _didShowDone = false;

  function _setBtnPulse(spin0On, pairOn) {
    const b1 = _btn('btnSpinZero');
    const b2 = _btn('btnZeroPair');
    if (b1) {
      if (spin0On) b1.classList.add('tutPulse'); else b1.classList.remove('tutPulse');
    }
    if (b2) {
      if (pairOn) b2.classList.add('tutPulse'); else b2.classList.remove('tutPulse');
    }
  }

  function _setBtnsEnabled(canSpin0, canPair0) {
    const b1 = _btn('btnSpinZero');
    const b2 = _btn('btnZeroPair');
    if (b1) b1.disabled = !canSpin0;
    if (b2) b2.disabled = !canPair0;
  }

  function _forceSelect(i) {
    try {
      const eng = EC.ENGINE;
      if (eng && typeof eng.dispatch === 'function') eng.dispatch('selectWell', i);
      else if (EC.ACTIONS && typeof EC.ACTIONS.selectWell === 'function') EC.ACTIONS.selectWell(i);
    } catch(_) {}
  }

  // Route lobby state changes through ACTIONS (single SIM write point).
  function _setInLobby(flag) {
    try {
      if (EC.ACTIONS && typeof EC.ACTIONS.setInLobby === 'function') return EC.ACTIONS.setInLobby(!!flag);
      const eng = EC.ENGINE;
      if (eng && typeof eng.dispatch === 'function') return eng.dispatch('setInLobby', !!flag);
    } catch (_) {}
    return { ok: false, reason: 'missing_setInLobby' };
  }

  function _clearLastAction() {
    try { SIM._tutLastAction = null; } catch(_) {}
  }

  function _tutData(){
    try { return (EC.DATA && EC.DATA.TUTORIAL) ? EC.DATA.TUTORIAL : null; } catch(_) { return null; }
  }

  function _cloneDef(def0){
    // Minimal defensive clone so step objective edits don't mutate the shared data template.
    const ss0 = def0 && def0.startState ? def0.startState : null;
    const wellsA = (ss0 && Array.isArray(ss0.wellsA)) ? ss0.wellsA.slice() : null;
    const wellsS = (ss0 && Array.isArray(ss0.wellsS)) ? ss0.wellsS.slice() : null;
    const psyP   = (ss0 && Array.isArray(ss0.psyP))   ? ss0.psyP.slice()   : null;
    const dispositions = (def0 && Array.isArray(def0.dispositions)) ? def0.dispositions.slice() : [];
    return {
      id: def0 && def0.id,
      label: def0 && def0.label,
      name: def0 && def0.name,
      objectiveShort: def0 && def0.objectiveShort,
      objectiveText: def0 && def0.objectiveText,
      dispositions,
      startState: { wellsA, wellsS, psyP },
      win: (def0 && def0.win) || null,
    };
  }

  MOD.isActive = function isActive(){ return !!SIM.tutorialActive; };

  MOD.start = function start() {
    if (!SIM || typeof SIM.initMVP !== 'function') return;

    const TD = _tutData();
    const def0 = TD && TD.DEF ? TD.DEF : null;
    const steps0 = TD && Array.isArray(TD.STEPS) ? TD.STEPS : null;
    if (!def0 || !steps0) {
      try { SIM._tutorialMissing = true; } catch(_) {}
      return;
    }

    _def = _cloneDef(def0);

    // Ensure no patient context is attached.
    try { SIM._patientId = null; } catch(_) {}
    try { SIM._patientPlanKey = ''; } catch(_) {}

    _initMVP(_def);

    // Tutorial flags
    SIM.tutorialActive = true;
    SIM._tutStep = 0;
    SIM._tutFocusWell = 0;
    SIM._tutFocusOpp = OPP[SIM._tutFocusWell] || 3;
    SIM._tutAllowWell = SIM._tutFocusWell;
    SIM._tutBlockSwipes = false;
    // Strict safety: tutorial must never trigger spill or mental breaks.
    SIM._tutNoHazards = true;
    _forceSelect(SIM._tutFocusWell);

    // Give generous energy for button steps.
    try {
      const minE = (typeof def0.startMinEnergy === 'number') ? def0.startMinEnergy : 160;
      SIM.energy = Math.max(SIM.energy || 0, minE);
    } catch(_) {}

    _stepStarted = false;
    _didShowDone = false;
    _clearLastAction();

    // Clear any lingering UI pause.
    try { SIM._uiPaused = false; } catch(_) {}
  };

  MOD.stop = function stop() {
    SIM.tutorialActive = false;
    SIM._tutStep = 0;
    SIM._tutFocusWell = null;
    SIM._tutFocusOpp = null;
    SIM._tutAllowWell = null;
    SIM._tutBlockSwipes = false;
    SIM._tutNoHazards = false;
    try { delete SIM._tutNoHazards; } catch (_) {}
    try { delete SIM._tutCanSpin0; } catch (_) {}
    try { delete SIM._tutCanPair0; } catch (_) {}
    // Clear any goal viz from tutorial so it never leaks into normal play.
    try {
      if (SIM.goalViz && Array.isArray(SIM.goalViz.perHue)) {
        SIM.goalViz.perHue = new Array(6).fill(null);
      }
    } catch (_) {}
    _setBtnPulse(false, false);
    _setBtnsEnabled(false, false);
    _clearLastAction();
    _def = null;
    _stepStarted = false;
    _didShowDone = false;
  };

  function _setObjective(text) {
    if (!_def) return;
    _def.objectiveText = text;
  }

  function _applyEnterOps(step, spec) {
    if (!spec || !Array.isArray(spec.enterOps)) return;
    const i = SIM._tutFocusWell|0;
    for (let n = 0; n < spec.enterOps.length; n++) {
      const op = spec.enterOps[n];
      if (!op || !op.type) continue;
      if (op.type === 'SNAPSHOT_PSY_FOCUS') {
        _psySnap = (SIM.psyP && typeof SIM.psyP[i] === 'number') ? SIM.psyP[i] : 0;
      } else if (op.type === 'SET_FOCUS_SPIN') {
        try { if (SIM.wellsS) SIM.wellsS[i] = op.value; } catch(_) {}
      } else if (op.type === 'FORCE_PAIR_SPINS') {
        try {
          const j = (OPP && typeof OPP[i] === 'number') ? (OPP[i]|0) : ((i + 3) % 6);
          if (SIM.wellsS) {
            SIM.wellsS[i] = op.a;
            if (j >= 0 && j < 6) SIM.wellsS[j] = op.b;
          }
        } catch(_) {}
      } else if (op.type === 'SET_GOALVIZ_FINAL') {
        try {
          SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
          const per = new Array(6).fill(null);
          const over = op.over || null;
          const under = op.under || null;
          if (over && typeof over.hue === 'number') per[over.hue|0] = { type: 'OVER', target: over.target };
          if (under && typeof under.hue === 'number') per[under.hue|0] = { type: 'UNDER', target: under.target };
          SIM.goalViz.perHue = per;
        } catch(_) {}
      }
    }
  }

  function _onStepEnter(step) {
    _stepStarted = true;
    _clearLastAction();

    const TD = _tutData();
    const steps = TD && Array.isArray(TD.STEPS) ? TD.STEPS : null;
    if (!steps) { try { SIM._tutorialMissing = true; } catch(_) {} return; }

    let spec = steps[step] || null;
    if (!spec) {
      const last = steps.length ? steps[steps.length - 1] : null;
      spec = {
        objectiveText: (last && last.objectiveText) || '',
        blockSwipes: false,
        allowWellMode: 'ALL',
        canSpin0: true,
        canPair0: true,
        pulseSpin0: false,
        pulsePair0: false,
        minEnergy: 0,
        enterOps: [],
      };
    }

    // Apply common fields from the step spec.
    const focus = SIM._tutFocusWell|0;
    SIM._tutAllowWell = (spec.allowWellMode === 'ALL') ? null : focus;
    SIM._tutBlockSwipes = !!spec.blockSwipes;

    // Tutorial button gating source-of-truth (ui_controls reads these flags).
    SIM._tutCanSpin0 = !!spec.canSpin0;
    SIM._tutCanPair0 = !!spec.canPair0;
    _setBtnsEnabled(SIM._tutCanSpin0, SIM._tutCanPair0);
    _setBtnPulse(!!spec.pulseSpin0, !!spec.pulsePair0);

    // Energy top-up (when applicable).
    try {
      const minE = (typeof spec.minEnergy === 'number') ? spec.minEnergy : 0;
      if (minE > 0) SIM.energy = Math.max(SIM.energy || 0, minE);
    } catch(_) {}

    // Objective copy.
    if (typeof spec.objectiveText === 'string') _setObjective(spec.objectiveText);

    // Enter ops (logic remains here; data is declarative).
    _applyEnterOps(step, spec);

    // Keep selection locked to focus well during early steps.
    if (step <= 5) _forceSelect(SIM._tutFocusWell|0);
  }

  function _advance() {
    SIM._tutStep = (SIM._tutStep|0) + 1;
    _stepStarted = false;
  }

  MOD.update = function update(dt) {
    if (!SIM.tutorialActive) return;
    if (!_def) return;

    const TD = _tutData();
    const stepsLen = (TD && Array.isArray(TD.STEPS)) ? TD.STEPS.length : 7;
    const finalStep = Math.max(0, (stepsLen|0) - 1);

    const step = (SIM._tutStep|0);
    if (!_stepStarted) _onStepEnter(step);

    // Keep selection stable during early steps.
    if (step <= 5) _forceSelect(SIM._tutFocusWell|0);

    const i = SIM._tutFocusWell|0;
    const j = SIM._tutFocusOpp|0;
    const last = SIM._tutLastAction || null;

    // Step checks
    if (step === 0) {
      if (last && last.kind === 'SWIPE' && last.well === i && Math.abs(last.dA || 0) > 1e-9) {
        _advance();
      }
    } else if (step === 1) {
      if (last && last.kind === 'SWIPE' && last.well === i && Math.abs(last.dS || 0) > 1e-9) {
        _advance();
      }
    } else if (step === 2) {
      const now = (SIM.psyP && typeof SIM.psyP[i] === 'number') ? SIM.psyP[i] : 0;
      if (Math.abs(now - _psySnap) >= 3) {
        _advance();
      }
    } else if (step === 3) {
      if (last && last.kind === 'SWIPE' && last.well === i) {
        const b = (typeof last.oppSpinBefore === 'number') ? last.oppSpinBefore : null;
        const a = (typeof last.oppSpinAfter === 'number') ? last.oppSpinAfter : null;
        if (b != null && a != null && Math.abs(a - b) >= 0.25) {
          _advance();
        }
      }
    } else if (step === 4) {
      if (last && last.kind === 'SPIN_ZERO' && last.well === i) {
        const s = (SIM.wellsS && typeof SIM.wellsS[i] === 'number') ? SIM.wellsS[i] : 999;
        if (Math.abs(s) <= 0.01) _advance();
      }
    } else if (step === 5) {
      if (last && last.kind === 'PAIR_ZERO' && last.well === i) {
        const s0 = (SIM.wellsS && typeof SIM.wellsS[i] === 'number') ? SIM.wellsS[i] : 999;
        const s1 = (SIM.wellsS && typeof SIM.wellsS[j] === 'number') ? SIM.wellsS[j] : 999;
        if (Math.abs(s0) <= 0.01 && Math.abs(s1) <= 0.01) _advance();
      }
    } else if (step === finalStep) {
      // Win conditions: Psyche[0] >= 300, Psyche[3] <= 200, and all spins are zero.
      const eps = (EC.TUNE && typeof EC.TUNE.PAT_SPIN_ZERO_EPS === 'number') ? EC.TUNE.PAT_SPIN_ZERO_EPS : 0.01;
      const p0 = (SIM.psyP && typeof SIM.psyP[0] === 'number') ? SIM.psyP[0] : 0;
      const p3 = (SIM.psyP && typeof SIM.psyP[3] === 'number') ? SIM.psyP[3] : 0;
      let allZero = true;
      if (SIM.wellsS) {
        for (let k = 0; k < 6; k++) {
          const s = (typeof SIM.wellsS[k] === 'number') ? SIM.wellsS[k] : 0;
          if (Math.abs(s) > eps) { allZero = false; break; }
        }
      }
      if (!_didShowDone && p0 >= 300 && p3 <= 200 && allZero) {
        _didShowDone = true;
        // Pause + show completion modal with button.
        try {
          SIM._breakPaused = true;
          SIM._breakModal = {
            title: 'Tutorial complete',
            lines: [
              'Nice work.',
              'You met the win conditions and stopped all spin.'
            ],
            okText: 'Back to Lobby',
            onOk: function () {
              try { MOD.stop(); } catch (_) {}
              try {
                let did = false;
                try {
                  if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') {
                    EC.ENGINE.dispatch('patBackToLobby');
                    did = true;
                  } else if (EC.ACTIONS && typeof EC.ACTIONS.patBackToLobby === 'function') {
                    EC.ACTIONS.patBackToLobby();
                    did = true;
                  } else if (EC.PAT && typeof EC.PAT.backToLobby === 'function') {
                    EC.PAT.backToLobby();
                    did = true;
                  }
                } catch (_) {}
                if (!did) {
                  _setInLobby(true);
                  const ov = document.getElementById('lobbyOverlay');
                  if (ov) ov.classList.add('show');
                }
              } catch (_) {}
            }
          };
        } catch (_) {}
      }
    }

    // Transition into newly entered step.
    if ((SIM._tutStep|0) !== step) {
      _stepStarted = false;
    }
  };
})();
