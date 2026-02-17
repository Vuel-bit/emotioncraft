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
    const SIM = EC.SIM;
    if (!SIM) return;
    SIM._controlsSyncStamp = (SIM._controlsSyncStamp || 0) + 1;
    SIM._controlsSyncSel = i;
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
    const S0 = clamp((SIM.wellsS[i] || 0), S_MIN, S_MAX);
    const A1t = clamp(A0 + (dA || 0), A_MIN, A_MAX);
    const S1t = clamp(S0 + (dS || 0), S_MIN, S_MAX);

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
})();
