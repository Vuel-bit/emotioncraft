/* Emotioncraft — Primary Tutorial (no patient, no save)
   Lightweight step machine that runs an isolated MVP level via SIM.initMVP(defOverride).

   Guardrails:
   - No patient slot usage.
   - No save/progression writes.
   - Minimal plumbing only.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const SIM = (EC.SIM = EC.SIM || {});

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
    try { SIM.selectedWellIndex = i; } catch(_) {}
  }

  function _clearLastAction() {
    try { SIM._tutLastAction = null; } catch(_) {}
  }

  function _mkDef() {
    // Stable, tutorial-friendly state: clear spins, moderate amounts, visible opposite amount.
    const focus = 0;
    const opp = OPP[focus] || 3;
    const wellsA = [70, 60, 60, 75, 60, 60];
    const wellsS = [0, 0, 0, 0, 0, 0];
    const psyP   = [160, 160, 160, 160, 160, 160];

    // Ensure the opposite well is “alive” for the nudge demo.
    wellsA[opp] = 80;

    return {
      id: 9001,
      label: 'Tutorial',
      name: 'Tutorial',
      objectiveShort: 'Tutorial',
      objectiveText: 'Tutorial: Swipe up/down on the highlighted well to change Amount.',
      dispositions: [],
      startState: { wellsA, wellsS, psyP },
      // Inert win definition: no plan chain, no timers.
      win: null,
    };
  }

  MOD.isActive = function isActive(){ return !!SIM.tutorialActive; };

  MOD.start = function start() {
    if (!SIM || typeof SIM.initMVP !== 'function') return;

    _def = _mkDef();

    // Ensure no patient context is attached.
    try { SIM._patientId = null; } catch(_) {}
    try { SIM._patientPlanKey = ''; } catch(_) {}

    SIM.initMVP(_def);

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
    try { SIM.energy = Math.max(SIM.energy || 0, 160); } catch(_) {}

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

  function _onStepEnter(step) {
    _stepStarted = true;
    _clearLastAction();

    // Default: focus-only swipes allowed.
    SIM._tutAllowWell = SIM._tutFocusWell;
    SIM._tutBlockSwipes = false;
    _setBtnsEnabled(false, false);
    _setBtnPulse(false, false);

    if (step === 0) {
      _setObjective('Swipe up/down on the highlighted well to change Amount.');
    } else if (step === 1) {
      _setObjective('Swipe left/right on the highlighted well to change Spin.');
    } else if (step === 2) {
      // Snapshot psyche for product demo.
      const i = SIM._tutFocusWell|0;
      _psySnap = (SIM.psyP && typeof SIM.psyP[i] === 'number') ? SIM.psyP[i] : 0;
      _setObjective('The product (Amount × Spin) changes Psyche over time. Keep some Spin and watch Psyche move.');
    } else if (step === 3) {
      // Stage: set a moderate nonzero spin so the nudge effect reads clearly.
      try {
        const i = SIM._tutFocusWell|0;
        if (SIM.wellsS) SIM.wellsS[i] = 55;
      } catch (_) {}
      _setObjective('Any action on a well nudges its opposite in the opposite direction. Swipe again and watch the opposite well react.');
    } else if (step === 4) {
      // Buttons only: Set Spin 0
      SIM._tutBlockSwipes = true;
      _setBtnsEnabled(true, false);
      _setBtnPulse(true, false);
      _setObjective('Press Set Spin 0 to zero the selected well’s Spin (costs energy).');
    } else if (step === 5) {
      // Buttons only: Set Pair Spin 0
      SIM._tutBlockSwipes = true;
      _setBtnsEnabled(false, true);
      _setBtnPulse(false, true);
      _setObjective('Press Set Pair Spin 0 to zero the selected well AND its opposite (costs energy).');
    } else if (step === 6) {
      // Final win-conditions step: allow full interaction.
      SIM._tutAllowWell = null;
      SIM._tutBlockSwipes = false;
      _setBtnsEnabled(true, true);
      _setBtnPulse(false, false);
      _setObjective('Win Conditions: Get Red (top) above 300 and Green (opposite) below 200, then stop all spin.');
    } else {
      // Safety fallback: treat as final step.
      SIM._tutAllowWell = null;
      SIM._tutBlockSwipes = false;
      _setBtnsEnabled(true, true);
      _setBtnPulse(false, false);
      _setObjective('Win Conditions: Get Red (top) above 300 and Green (opposite) below 200, then stop all spin.');
    }

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
    } else if (step === 6) {
      // Win conditions: Psyche[0] > 300, Psyche[3] < 200, and all spins are zero.
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
      if (!_didShowDone && p0 > 300 && p3 < 200 && allZero) {
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
                if (EC.PAT && typeof EC.PAT.backToLobby === 'function') EC.PAT.backToLobby();
                else {
                  SIM.inLobby = true;
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
