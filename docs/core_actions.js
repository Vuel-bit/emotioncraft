/* Emotioncraft — Core Actions
   Stable command surface: EC.ACTIONS.*
   Authoritative spend/mutation (no DOM access).
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const MOD = (EC.ACTIONS = EC.ACTIONS || {});

  function _missing() {
    return { ok: false, reason: 'missing_impl', cost: 0 };
  }

  function _stampControlsSync(i) {
    const UI_STATE = EC.UI_STATE || (EC.UI_STATE = {});
    UI_STATE._controlsSyncStamp = (UI_STATE._controlsSyncStamp || 0) + 1;
    UI_STATE._controlsSyncSel = i;
  }

  function _getAM() {
    const AM = EC.ACTION_MATH;
    if (!AM) return null;
    if (typeof AM.computeApplyPreview !== 'function') return null;
    if (typeof AM.applyPreviewToSim !== 'function') return null;
    if (typeof AM.computeZeroPairCostCanonical !== 'function') return null;
    if (typeof AM.costToUnits !== 'function') return null;
    if (typeof AM.energyToUnits !== 'function') return null;
    if (typeof AM.getEnergyCostMult !== 'function') return null;
    return AM;
  }

  // ---------------------------------------------------------------------------
  // Public EC.ACTIONS implementations
  // ---------------------------------------------------------------------------

  // Select the active well (presentation should call via EC.ENGINE.dispatch).
  MOD.selectWell = function selectWell(i) {
    const idx = (typeof i === 'number') ? (i | 0) : -1;
    if (!(idx >= 0 && idx < 6)) return { ok: false, reason: 'invalid_idx', well: idx };

    // Canonical selection lives in UI_STATE (presentation context).
    const UI_STATE = EC.UI_STATE || (EC.UI_STATE = {});
    UI_STATE.selectedWellIndex = idx;

    // Stamp controls sync (selection is UI-only; SIM does not store selectedWellIndex).
    _stampControlsSync(idx);

    return { ok: true, well: idx };
  };

  MOD.flickStep = function flickStep(i, dA, dS) {
    const SIM = EC.SIM;
    if (!SIM || !SIM.wellsA || !SIM.wellsS) return _missing();

    const AM = _getAM();
    if (!AM) return _missing();

    const T = EC.TUNE || {};
    const clamp = EC.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));
    const A_MIN = T.A_MIN;
    const A_MAX = T.A_MAX;
    const S_MIN = T.S_MIN;
    const S_MAX = T.S_MAX;

    if (i == null || i < 0 || i >= 6) return { ok: false, reason: 'nosel', cost: 0 };
    if ((dA === 0 || !dA) && (dS === 0 || !dS)) return { ok: false, reason: 'noop', cost: 0 };

    // Compute new absolute targets based on current state.
    const A0 = clamp((SIM.wellsA[i] || 0), A_MIN, A_MAX);

    // Spin: do not hard-clamp to ±S_MAX here; allow temporary overflow so spillover can route it.
    const sAbs = Math.max(1, Math.abs(S_MIN || 0), Math.abs(S_MAX || 0));
    const S_SOFT = (typeof T.S_SOFT_MAX === 'number')
      ? T.S_SOFT_MAX
      : (sAbs * ((T.COST && typeof T.COST.S_SOFT_MULT === 'number') ? T.COST.S_SOFT_MULT : 3));
    const S0 = clamp((SIM.wellsS[i] || 0), -S_SOFT, S_SOFT);

    const A1t = clamp(A0 + (dA || 0), A_MIN, A_MAX);
    const S1t = clamp(S0 + (dS || 0), -S_SOFT, S_SOFT);

    const prev = AM.computeApplyPreview(i, A1t, S1t);
    const res = AM.applyPreviewToSim(i, prev);
    if (res && res.ok) _stampControlsSync(i);
    return res;
  };

  MOD.spinZero = function spinZero(i, opts) {
    const SIM = EC.SIM;
    if (!SIM || !SIM.wellsA || !SIM.wellsS) return _missing();

    const AM = _getAM();
    if (!AM) return _missing();

    if (i == null || i < 0 || i >= 6) return { ok: false, reason: 'nosel', cost: 0 };

    const A0 = (SIM.wellsA[i] || 0);
    const prev = AM.computeApplyPreview(i, A0, 0);
    const res = AM.applyPreviewToSim(i, prev, opts);

    const ok = !!(res && res.ok);
    const reason = (res && res.reason) ? res.reason : (ok ? 'ok' : 'fail');
    const cost = (res && typeof res.cost === 'number') ? res.cost : 0;

    if (ok) _stampControlsSync(i);

    return { ok: ok, reason: reason, cost: cost, well: i, A: prev.A1, S: prev.S1 };
  };

  MOD.zeroPair = function zeroPair(sel, opts) {
    const SIM = EC.SIM;
    if (!SIM || !SIM.wellsA || !SIM.wellsS) return _missing();

    const AM = _getAM();
    if (!AM) return _missing();

    const OPP = (EC.CONST && EC.CONST.OPPOSITE_OF) || [3, 4, 5, 0, 1, 2];

    const i = (typeof sel === 'number') ? sel : -1;
    if (!(i >= 0 && i < 6)) return { ok: false, reason: 'nosel', cost: 0 };

    const j = OPP[i];
    if (!(j >= 0 && j < 6)) return { ok: false, reason: 'noopp', cost: 0, well: i, opp: j };

    const c = AM.computeZeroPairCostCanonical(i);
    const pairCostRaw = c.cost || 0;
    const mult = AM.getEnergyCostMult(SIM);
    const pairCostFloatFinal = pairCostRaw * mult;
    const pairUnits = AM.costToUnits(pairCostFloatFinal);

    // Debug: record last evaluated spend attempt
    SIM._dbgLastCostRaw = pairCostRaw;
    SIM._dbgLastCostMult = mult;
    SIM._dbgLastCostFinal = pairUnits;

    const changed = (Math.abs(SIM.wellsS[i] || 0) > 1e-9) || (Math.abs(SIM.wellsS[j] || 0) > 1e-9);
    if (!changed) return { ok: false, reason: 'nochange', cost: pairUnits, well: i, opp: j };

    const eU = AM.energyToUnits(SIM.energy || 0);
    if (eU < pairUnits) {
      SIM._dbgLastCostNoEnergy = true;
      return { ok: false, reason: 'noenergy', cost: pairUnits, well: i, opp: j };
    }
    SIM._dbgLastCostNoEnergy = false;

    SIM.energy = Math.max(0, eU - pairUnits);
    SIM.wellsS[i] = 0;
    SIM.wellsS[j] = 0;

    return { ok: true, reason: 'ok', cost: pairUnits, well: i, opp: j };
  };
  // ---------------------------------------------------------------------------
  // UI-facing helpers (to keep presentation from mutating SIM directly)
  // ---------------------------------------------------------------------------

  MOD.toggleAutoTest = function toggleAutoTest() {
    const SIM = EC.SIM;
    if (!SIM) return _missing();
    SIM.autoTest = !SIM.autoTest;
    return { ok: true, on: !!SIM.autoTest };
  };

  MOD.markAutoWinHandled = function markAutoWinHandled(flag = true) {
    const SIM = EC.SIM;
    if (!SIM) return _missing();
    SIM._autoWinHandled = !!flag;
    return { ok: true };
  };


MOD.setUiPaused = function setUiPaused(flag) {
  const SIM = EC.SIM;
  if (!SIM) return { ok: false, reason: 'missing_sim' };
  SIM._uiPaused = !!flag;
  return { ok: true, paused: !!SIM._uiPaused };
};


  MOD.ackBreakModal = function ackBreakModal() {
    const SIM = EC.SIM;
    if (!SIM) return _missing();
    let modal = null;
    try { modal = SIM._breakModal || null; } catch (_) { modal = null; }
    try { SIM._breakModal = null; } catch (_) {}
    try { SIM._breakPaused = false; } catch (_) {}
    return { ok: true, modal };
  };

  MOD.recordTutLastAction = function recordTutLastAction(payload) {
    const SIM = EC.SIM;
    if (!SIM) return _missing();
    if (!SIM.tutorialActive) return { ok: false, reason: 'notutorial' };
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'badpayload' };
    SIM._tutLastAction = payload;
    return { ok: true };
  };

  MOD.setInLobby = function setInLobby(flag) {
    const SIM = EC.SIM;
    if (!SIM) return { ok: false, reason: 'missing_sim' };
    SIM.inLobby = !!flag;
    return { ok: true, inLobby: !!SIM.inLobby };
  };

  MOD.initMVP = function initMVP(levelOrDef) {
    const SIM = EC.SIM;
    if (!SIM || typeof SIM.initMVP !== 'function') return { ok: false, reason: 'missing_initMVP' };
    SIM.initMVP(levelOrDef);
    return { ok: true };
  };

  MOD.resetRun = function resetRun() {
    if (typeof EC.resetRun !== 'function') return { ok: false, reason: 'missing_resetRun' };
    EC.resetRun();
    return { ok: true };
  };

  // ---------------------------------------------------------------------------
  // Patient session transition wrappers (UI should dispatch these; keeps patient
  // session SIM writes inside the ENGINE/ACTIONS bracket for simguard).
  // ---------------------------------------------------------------------------

  MOD.patBeginFromLobby = function patBeginFromLobby(pid) {
    if (!EC.PAT || typeof EC.PAT.beginFromLobby !== 'function') return { ok: false, reason: 'missing_beginFromLobby' };
    EC.PAT.beginFromLobby(pid);
    return { ok: true };
  };

  MOD.patStartPending = function patStartPending(planKey) {
    if (!EC.PAT || typeof EC.PAT.startPending !== 'function') return { ok: false, reason: 'missing_startPending' };
    EC.PAT.startPending(planKey);
    return { ok: true };
  };

  MOD.patBackToLobby = function patBackToLobby() {
    if (!EC.PAT || typeof EC.PAT.backToLobby !== 'function') return { ok: false, reason: 'missing_backToLobby' };
    EC.PAT.backToLobby();
    return { ok: true };
  };

  MOD.patOpenLobbyPause = function patOpenLobbyPause() {
    if (!EC.PAT || typeof EC.PAT.openLobbyPause !== 'function') return { ok: false, reason: 'missing_openLobbyPause' };
    EC.PAT.openLobbyPause();
    return { ok: true };
  };

  MOD.patResumeFromLobby = function patResumeFromLobby() {
    if (!EC.PAT || typeof EC.PAT.resumeFromLobby !== 'function') return { ok: false, reason: 'missing_resumeFromLobby' };
    EC.PAT.resumeFromLobby();
    return { ok: true };
  };



  // Wrap all actions so direct EC.ACTIONS.* calls are considered "allowed" SIM writes
  // by the SIM write-guard (best-effort; idempotent).
  try {
    const A = EC.ACTIONS || MOD;
    if (A) {
      Object.keys(A).forEach((name) => {
        const fn = A[name];
        if (typeof fn !== 'function') return;
        if (fn.__ecWrapped) return;
        const wrapped = function(...args) {
          try {
            if (EC.ENGINE && typeof EC.ENGINE._withSimWrites === 'function') {
              const d = Number(EC.ENGINE._simWriteDepth || 0);
              if (d > 0) return fn.apply(A, args);
              return EC.ENGINE._withSimWrites('action:' + name, () => fn.apply(A, args));
            }
          } catch (_) {}
          return fn.apply(A, args);
        };
        wrapped.__ecWrapped = true;
        wrapped.__ecOrig = fn;
        try { A[name] = wrapped; } catch (_) {}
      });
    }
  } catch (_) {}
})();
