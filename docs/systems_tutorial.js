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
  const TUTORIAL_PORTRAIT_PLACEHOLDER = '__PRINCESS__';

  function _btn(id){ try { return document.getElementById(id); } catch(_) { return null; } }

  const MOD = (EC.TUT = EC.TUT || {});

  let _def = null;
  let _stepStarted = false;
  let _psySnap = 0;
  let _didShowDone = false;
  let _altFocusT = 0;
  let _stepTapAdvanceHandler = null;

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

  function _setLobbyPulse(on) {
    const b = _btn('btnLobby');
    if (!b) return;
    if (on) b.classList.add('tutPulse');
    else b.classList.remove('tutPulse');
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


  function _removeStepTapAdvanceListener() {
    try {
      if (_stepTapAdvanceHandler) document.removeEventListener('pointerdown', _stepTapAdvanceHandler, true);
    } catch (_) {}
    _stepTapAdvanceHandler = null;
  }

  function _installStepTapAdvanceListener() {
    _removeStepTapAdvanceListener();
    _stepTapAdvanceHandler = (e) => {
      try {
        const t = e && e.target;
        if (t && t.closest && t.closest('#notifyControls')) return;
      } catch (_) {}
      try { if (e && e.preventDefault) e.preventDefault(); } catch (_) {}
      try { if (e && e.stopPropagation) e.stopPropagation(); } catch (_) {}
      try { if (e && e.stopImmediatePropagation) e.stopImmediatePropagation(); } catch (_) {}
      _advance();
    };
    try { document.addEventListener('pointerdown', _stepTapAdvanceHandler, true); } catch (_) { _stepTapAdvanceHandler = null; }
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
    try { SIM._patientPortrait = TUTORIAL_PORTRAIT_PLACEHOLDER; } catch(_) {}

    _initMVP(_def);

    // Tutorial flags
    SIM.tutorialActive = true;
    SIM._tutStep = 0;
    SIM._tutFocusWell = 0;
    SIM._tutFocusOpp = OPP[SIM._tutFocusWell] || 3;
    SIM._tutAllowWell = SIM._tutFocusWell;
    SIM._tutBlockSwipes = false;
    SIM._tutDrawerMode = 'INSTRUCT';
    SIM._tutPlanCurrent = '';
    SIM._tutPlanNext = '';
    SIM._tutSuppressOppPush = false;
    SIM._tutPulseOpp = false;
    SIM._tutPulseGoals = false;
    SIM._tutPulseSpin0 = false;
    SIM._tutPulsePair0 = false;
    SIM._tutSuccessFxOn = false;
    SIM._tutSpotlightPsyche = false;
    SIM._tutNoDim = false;
    // Ensure plan-hold fields are clean (tutorial uses them for hold steps without enabling PLAN UI).
    try {
      SIM._planHoldReqSec = 0;
      SIM.planHoldSec = 0;
      SIM._planStepOk = false;
    } catch (_) {}
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
    _altFocusT = 0;
    _setLobbyPulse(false);
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
    SIM._tutDrawerMode = '';
    SIM._tutPlanCurrent = '';
    SIM._tutPlanNext = '';
    SIM._tutSuppressOppPush = false;
    SIM._tutPulseOpp = false;
    SIM._tutPulseGoals = false;
    SIM._tutPulseSpin0 = false;
    SIM._tutPulsePair0 = false;
    SIM._tutSuccessFxOn = false;
    SIM._tutSpotlightPsyche = false;
    SIM._tutNoDim = false;
    SIM._tutNoHazards = false;
    try { delete SIM._tutNoHazards; } catch (_) {}
    try { delete SIM._patientPortrait; } catch (_) {}
    try { delete SIM._tutCanSpin0; } catch (_) {}
    try { delete SIM._tutCanPair0; } catch (_) {}
    try { delete SIM._tutDrawerMode; } catch (_) {}
    try { delete SIM._tutPlanCurrent; } catch (_) {}
    try { delete SIM._tutPlanNext; } catch (_) {}
    try { delete SIM._tutSuppressOppPush; } catch (_) {}
    try { delete SIM._tutPulseOpp; } catch (_) {}
    try { delete SIM._tutPulseGoals; } catch (_) {}
    try { delete SIM._tutPulseSpin0; } catch (_) {}
    try { delete SIM._tutPulsePair0; } catch (_) {}
    try { delete SIM._tutSuccessFxOn; } catch (_) {}
    try { delete SIM._tutSpotlightPsyche; } catch (_) {}
    // Clear any plan-hold fields so countdown never leaks into lobby/normal play.
    try {
      SIM._planHoldReqSec = 0;
      SIM.planHoldSec = 0;
      SIM._planStepOk = false;
    } catch (_) {}
    // Clear any goal viz from tutorial so it never leaks into normal play.
    try {
      if (SIM.goalViz && Array.isArray(SIM.goalViz.perHue)) {
        SIM.goalViz.perHue = new Array(6).fill(null);
      }
    } catch (_) {}
    _setBtnPulse(false, false);
    _setBtnsEnabled(false, false);
    _setLobbyPulse(false);
    _clearLastAction();
    _def = null;
    _stepStarted = false;
    _didShowDone = false;
    _altFocusT = 0;
    _removeStepTapAdvanceListener();
    try { SIM._tutNoDim = false; } catch (_) {}
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
      } else if (op.type === 'SET_GOALVIZ_FINAL') {
        try {
          SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
          const per = new Array(6).fill(null);
          if (Array.isArray(op.goals)) {
            for (let g = 0; g < op.goals.length; g++) {
              const entry = op.goals[g] || null;
              if (!entry || typeof entry.hue !== 'number') continue;
              const hue = entry.hue|0;
              if (hue < 0 || hue >= 6) continue;
              const type = String(entry.type || '').toUpperCase();
              if (type === 'OVER' || type === 'UNDER') {
                per[hue] = { type: type, target: entry.target };
              } else if (type === 'BAND') {
                per[hue] = { type: 'BAND', low: entry.low, high: entry.high };
              }
            }
          } else {
            const over = op.over || null;
            const under = op.under || null;
            if (over && typeof over.hue === 'number') per[over.hue|0] = { type: 'OVER', target: over.target };
            if (under && typeof under.hue === 'number') per[under.hue|0] = { type: 'UNDER', target: under.target };
          }
          SIM.goalViz.perHue = per;
        } catch(_) {}
      }
    }
  }

  function _onStepEnter(step) {
    _stepStarted = true;
    _clearLastAction();
    _altFocusT = 0;
    _removeStepTapAdvanceListener();

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

    // Focus target (drives highlight ring + tutorial gating).
    if (spec && typeof spec.focusWell === 'number' && spec.focusWell >= 0 && spec.focusWell < 6) {
      SIM._tutFocusWell = spec.focusWell|0;
    }
    SIM._tutFocusOpp = OPP[SIM._tutFocusWell|0] || ((SIM._tutFocusWell|0) + 3) % 6;

    const focus = SIM._tutFocusWell|0;

    SIM._tutAllowWell = (spec.allowWellMode === 'ALL') ? null : focus;
    SIM._tutBlockSwipes = !!spec.blockSwipes;

    // Drawer mode (tutorial-only)
    SIM._tutDrawerMode = (spec && typeof spec.drawerMode === 'string') ? spec.drawerMode : 'INSTRUCT';
    SIM._tutPlanCurrent = (spec && typeof spec.planCurrent === 'string') ? spec.planCurrent : '';
    SIM._tutPlanNext = (spec && typeof spec.planNext === 'string') ? spec.planNext : '';
    SIM._tutSpotlightPsyche = !!(spec && spec.spotlightPsyche);

    // Tutorial-only mechanics exception: suppress opposite push during first spin lesson.
    SIM._tutSuppressOppPush = !!(spec && spec.suppressOppPush);

    // Highlight both focus + opposite (used in the pair-zero lesson).
    SIM._tutPulseOpp = !!(spec && spec.pulseOpp);

    // Pulse goal shading during goal instruction step (tutorial-only).
    SIM._tutPulseGoals = !!(spec && spec.pulseGoals);
    // Tutorial button gating source-of-truth (ui_controls reads these flags).
    SIM._tutCanSpin0 = !!spec.canSpin0;
    SIM._tutCanPair0 = !!spec.canPair0;
    SIM._tutPulseSpin0 = !!spec.pulseSpin0;
    SIM._tutPulsePair0 = !!spec.pulsePair0;
    _setBtnsEnabled(SIM._tutCanSpin0, SIM._tutCanPair0);
    _setBtnPulse(!!SIM._tutPulseSpin0, !!SIM._tutPulsePair0);

    // Energy top-up (when applicable).
    try {
      const minE = (typeof spec.minEnergy === 'number') ? spec.minEnergy : 0;
      if (minE > 0) SIM.energy = Math.max(SIM.energy || 0, minE);
    } catch(_) {}

    // Objective copy.
    if (typeof spec.objectiveText === 'string') _setObjective(spec.objectiveText);

    // Enter ops (logic remains here; data is declarative).
    _applyEnterOps(step, spec);

    if (spec && spec.advanceOnTap) _installStepTapAdvanceListener();

    // Keep selection aligned with focus for tutorial clarity,
    // except for steps that require explicit tap selection (e.g., "tap Nerves").
    const noAutoSelect = !!(spec && spec.noAutoSelect);
    if (!noAutoSelect) _forceSelect(SIM._tutFocusWell|0);

    // Done step: pulse Lobby.
    if (SIM._tutDrawerMode === 'DONE') _setLobbyPulse(true);
    else _setLobbyPulse(false);
  }

  function _advance() {
    _removeStepTapAdvanceListener();
    const prevStep = (SIM._tutStep|0);
    if (prevStep === 2) SIM._tutNoDim = true;
    SIM._tutStep = prevStep + 1;
    _stepStarted = false;
  }

  MOD.update = function update(dt) {
    if (!SIM.tutorialActive) return;
    if (!_def) return;

    const TD = _tutData();
    const steps = (TD && Array.isArray(TD.STEPS)) ? TD.STEPS : null;
    const stepsLen = steps ? steps.length : 1;

    const step = (SIM._tutStep|0);
    if (!_stepStarted) _onStepEnter(step);

    // Tutorial-only hold flow uses the plan countdown fields. Clear by default.
    const spec0 = (steps && steps[step]) ? steps[step] : null;
    const sid = (spec0 && typeof spec0.id === 'string') ? spec0.id : '';
    const isHoldStep = (sid === 'HOLD_GOALS_10S' || sid === 'HOLD_SPINZERO_3S');
    if (!isHoldStep) {
      try {
        if ((SIM._planHoldReqSec || 0) !== 0) SIM._planHoldReqSec = 0;
        if ((SIM.planHoldSec || 0) !== 0) SIM.planHoldSec = 0;
        if (!!SIM._planStepOk) SIM._planStepOk = false;
      } catch (_) {}
    }

    const i = (typeof SIM._tutFocusWell === 'number') ? (SIM._tutFocusWell|0) : 0;
    const j = (typeof SIM._tutFocusOpp === 'number') ? (SIM._tutFocusOpp|0) : ((i + 3) % 6);
    const last = SIM._tutLastAction || null;

    function goalSatisfied(goal, psycheVal) {
      if (!goal) return true;
      const type = String(goal.type || '').toUpperCase();
      if (type === 'OVER') return psycheVal >= Number(goal.target || 0);
      if (type === 'UNDER') return psycheVal <= Number(goal.target || 0);
      if (type === 'BAND') {
        const lo = Number(goal.low);
        const hi = Number(goal.high);
        if (!isFinite(lo) || !isFinite(hi)) return false;
        return psycheVal >= lo && psycheVal <= hi;
      }
      return true;
    }

    function areTutorialGoalsSatisfied() {
      const gv = (SIM.goalViz && Array.isArray(SIM.goalViz.perHue)) ? SIM.goalViz.perHue : null;
      if (!gv) return false;
      let hasAny = false;
      for (let h = 0; h < gv.length; h++) {
        const goal = gv[h];
        if (!goal) continue;
        hasAny = true;
        const psycheVal = (SIM.psyP && typeof SIM.psyP[h] === 'number') ? SIM.psyP[h] : 0;
        if (!goalSatisfied(goal, psycheVal)) return false;
      }
      return hasAny;
    }

    // Step checks (tutorial progresses by doing actions)
    if (step === 0) {
      // Amount lesson
      if (last && last.kind === 'SWIPE' && last.well === i && Math.abs(last.dA || 0) > 1e-9) {
        _advance();
      }
    } else if (step === 1) {
      // Spin lesson (first-spin exception: no opposite push)
      if (last && last.kind === 'SWIPE' && last.well === i && Math.abs(last.dS || 0) > 1e-9) {
        _advance();
      }
    } else if (step === 2) {
      // Flux definition (watch psyche move)
      const now = (SIM.psyP && typeof SIM.psyP[i] === 'number') ? SIM.psyP[i] : 0;
      const req = (spec0 && typeof spec0.advancePsyDelta === 'number') ? Math.max(0, spec0.advancePsyDelta) : 5;
      if (Math.abs(now - _psySnap) >= req) {
        _advance();
      }
    } else if (step === 3) {
      // Set Spin 0
      if (last && last.kind === 'SPIN_ZERO' && last.well === i) {
        const s = (SIM.wellsS && typeof SIM.wellsS[i] === 'number') ? SIM.wellsS[i] : 999;
        if (Math.abs(s) <= 0.01) _advance();
      }
    } else if (step === 4) {
      // Tap-select Nerves
      if (last && last.kind === 'TAP_SELECT' && last.well === i) {
        _advance();
      }
    } else if (step === 5) {
      // Set Nerves spin to +10
      if (last && last.kind === 'SWIPE' && last.well === i && (last.dS || 0) > 0) {
        const s = (SIM.wellsS && typeof SIM.wellsS[i] === 'number') ? SIM.wellsS[i] : 0;
        if (s >= 9.5) _advance();
      }
    } else if (step === 6) {
      // Pair-zero lesson
      if (last && last.kind === 'PAIR_ZERO' && last.well === i) {
        const s0 = (SIM.wellsS && typeof SIM.wellsS[i] === 'number') ? SIM.wellsS[i] : 999;
        const s1 = (SIM.wellsS && typeof SIM.wellsS[j] === 'number') ? SIM.wellsS[j] : 999;
        if (Math.abs(s0) <= 0.01 && Math.abs(s1) <= 0.01) _advance();
      }
    } else if (step === 7) {
      // Goals instruction: wait for selecting Ego or Focus.
      if (last && last.kind === 'TAP_SELECT') {
        const w = last.well|0;
        if (w === 1 || w === 4) {
          _advance();
        }
      }
    } else if (step === 8) {
      // Goals active: wait for active goal-viz goals to be satisfied, then start the 10s hold step.
      if (areTutorialGoalsSatisfied()) {
        _advance();
      }
    } else if (sid === 'HOLD_GOALS_10S') {
      // Hold active goal-viz goals for 10 seconds (center countdown).
      const okGoals = areTutorialGoalsSatisfied();
      const dt0 = (typeof dt === 'number' && isFinite(dt) ? dt : 0);
      try {
        SIM._planHoldReqSec = 10;
        SIM._planStepOk = !!okGoals;
        if (!okGoals) {
          SIM.planHoldSec = 0;
        } else {
          SIM.planHoldSec = (SIM.planHoldSec || 0) + dt0;
          if (SIM.planHoldSec >= 10) {
            SIM.planHoldSec = 0;
            _advance();
          }
        }
      } catch (_) {}
    } else if (sid === 'HOLD_SPINZERO_3S') {
      // Set all spin to zero, then hold for 3 seconds.
      const eps = (EC.TUNE && typeof EC.TUNE.PAT_SPIN_ZERO_EPS === 'number') ? EC.TUNE.PAT_SPIN_ZERO_EPS : 0.01;
      let allZero = true;
      if (SIM.wellsS) {
        for (let k = 0; k < 6; k++) {
          const s = (typeof SIM.wellsS[k] === 'number') ? SIM.wellsS[k] : 0;
          if (Math.abs(s) > eps) { allZero = false; break; }
        }
      }
      const dt0 = (typeof dt === 'number' && isFinite(dt) ? dt : 0);
      try {
        SIM._planHoldReqSec = 3;
        SIM._planStepOk = !!allZero;
        if (!allZero) {
          SIM.planHoldSec = 0;
        } else {
          SIM.planHoldSec = (SIM.planHoldSec || 0) + dt0;
          if (SIM.planHoldSec >= 3) {
            SIM.planHoldSec = 0;
            if (!_didShowDone) {
              _didShowDone = true;
              SIM._tutSuccessFxOn = true;
              const stamp = 'TUT|' + String((typeof SIM._mvpInitStamp === 'number') ? SIM._mvpInitStamp : Date.now());
              if (EC.RENDER_SUCCESS_FX && typeof EC.RENDER_SUCCESS_FX.trigger === 'function') EC.RENDER_SUCCESS_FX.trigger(stamp);
            }
            _advance();
          }
        }
      } catch (_) {}
    } else {
      // DONE: wait for Lobby (or any exit)
    }

    // Transition into newly entered step.
    if ((SIM._tutStep|0) !== step) {
      _stepStarted = false;
    }
  };
})();
