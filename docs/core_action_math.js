/* Emotioncraft — Core Action Math
   Canonical math/preview/cost helpers shared by EC.ACTIONS and EC.UI_CONTROLS.
   No DOM access.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const AM = (EC.ACTION_MATH = EC.ACTION_MATH || {});

  function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Canonical integer “energy units” helpers for Set-0 buttons.
  // These must match the Energy HUD rounding behavior (whole numbers).
  AM.costToUnits = function costToUnits(costFloat) {
    const u = Math.round(costFloat || 0);
    return Math.max(0, u);
  };

  AM.energyToUnits = function energyToUnits(energyFloat) {
    const u = Math.round(energyFloat || 0);
    return Math.max(0, u);
  };

  // Trait-driven energy cost multiplier (stubborn).
  AM.getEnergyCostMult = function getEnergyCostMult(simIn) {
    const SIM = simIn || EC.SIM || {};
    try {
      return (EC.TRAITS && typeof EC.TRAITS.getEnergyCostMult === 'function')
        ? (EC.TRAITS.getEnergyCostMult(SIM) || 1.0)
        : 1.0;
    } catch (_) {
      return 1.0;
    }
  };


  // ---------------------------------------------------------------------------
  // Apply preview + apply mechanics (authoritative)
  // ---------------------------------------------------------------------------

  function fluxSim(A, S) { return A * S; }
  function fluxCost(A, S) {
    const spinCost = (S === 0 ? 1 : S); // zero-rule ONLY for cost
    return A * spinCost;
  }

  AM.computeApplyPreview = function computeApplyPreview(i, A1_in, S1_in) {
    const SIM = EC.SIM;
    const T = EC.TUNE || {};
    const clamp = EC.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));

    const A_MIN = T.A_MIN;
    const A_MAX = T.A_MAX;
    const S_MIN = T.S_MIN;
    const S_MAX = T.S_MAX;
    const COST_NORM = T.COST_NORM;

    if (i == null || i < 0) {
      return { cost: 0, changed: false, impulseSim: 0, impulseCost: 0, push: 0, A0: 0, S0: 0, A1: 0, S1: 0 };
    }
    if (!SIM || !SIM.wellsA || !SIM.wellsS) {
      return { cost: 0, changed: false, impulseSim: 0, impulseCost: 0, push: 0, A0: 0, S0: 0, A1: 0, S1: 0 };
    }

    const A0 = (SIM.wellsA[i] || 0);
    const S0 = (SIM.wellsS[i] || 0);
    const A1 = clamp((A1_in == null ? A0 : A1_in), A_MIN, A_MAX);
    const S1 = clamp((S1_in == null ? S0 : S1_in), S_MIN, S_MAX);

    const impulseSim = fluxSim(A1, S1) - fluxSim(A0, S0);
    const impulseCost = fluxCost(A1, S1) - fluxCost(A0, S0);
    const raw = Math.abs(impulseCost) / Math.max(1e-6, COST_NORM);
    const changed = (Math.abs(A1 - A0) > 1e-9) || (Math.abs(S1 - S0) > 1e-9);
    const cost = changed ? raw : 0;

    const kPush = T.OPPOSITE_PUSH_K;
    const push = -kPush * impulseSim; // uses sim impulse (no zero hack)
    return { cost, changed, impulseSim, impulseCost, push, A0, S0, A1, S1 };
  };

  AM.applyPreviewToSim = function applyPreviewToSim(i, prev, opts) {
    const SIM = EC.SIM;
    const T = EC.TUNE || {};

    // Opposite pairs follow hue index order: red(0)↔green(3), purple(1)↔yellow(4), blue(2)↔orange(5)
    const OPP = (EC.CONST && EC.CONST.OPPOSITE_OF) || [3, 4, 5, 0, 1, 2];
    const S_MIN = T.S_MIN;
    const S_MAX = T.S_MAX;

    const costRaw = (prev && typeof prev._costRaw === 'number') ? prev._costRaw : ((prev && prev.cost) || 0);
    const mult = AM.getEnergyCostMult(SIM);
    const costFloatFinal = costRaw * mult;

    if (!prev || !prev.changed) return { ok: false, reason: 'nochange', cost: costFloatFinal };

    const chargeUnits = !!(opts && opts.chargeUnits);
    const costUnits = chargeUnits ? AM.costToUnits(costFloatFinal) : 0;
    const costFinal = chargeUnits ? costUnits : costFloatFinal;

    // Debug: record last evaluated spend attempt
    SIM._dbgLastCostRaw = costRaw;
    SIM._dbgLastCostMult = mult;
    SIM._dbgLastCostFinal = costFinal;

    if (chargeUnits) {
      const eU = AM.energyToUnits(SIM.energy || 0);
      if (eU < costUnits) {
        SIM._dbgLastCostNoEnergy = true;
        return { ok: false, reason: 'noenergy', cost: costFinal };
      }
      SIM._dbgLastCostNoEnergy = false;
      SIM.energy = Math.max(0, eU - costUnits);
    } else {
      if ((SIM.energy || 0) < costFloatFinal) {
        SIM._dbgLastCostNoEnergy = true;
        return { ok: false, reason: 'noenergy', cost: costFinal };
      }
      SIM._dbgLastCostNoEnergy = false;
      SIM.energy = Math.max(0, (SIM.energy || 0) - costFloatFinal);
    }

    // Apply to selected well (absolute targets; clamped)
    SIM.wellsA[i] = prev.A1;
    SIM.wellsS[i] = prev.S1;

    // One-time opposite push (spin only; amount unchanged)
    const push = prev.push || 0;
    const j = OPP[i];
    if (j != null && j >= 0 && j < 6 && Math.abs(push) > 1e-9) {
      const Aj = (SIM.wellsA[j] || 0);
      if (Aj > 0.001) {
        const Sj0 = (SIM.wellsS[j] || 0);
        const fluxOppOld = Aj * Sj0;
        const fluxOppNew = fluxOppOld + push;
        let Sj1 = fluxOppNew / Aj;
        // IMPORTANT: do not clamp to [-100,+100] here; allow temporary overflow so spillover can transfer it.
        const S_SOFT = (typeof T.S_SOFT_MAX === 'number')
          ? T.S_SOFT_MAX
          : (Math.max(Math.abs(S_MIN), Math.abs(S_MAX)) * (T.COST && typeof T.COST.S_SOFT_MULT === 'number' ? T.COST.S_SOFT_MULT : 3));
        Sj1 = Math.max(-S_SOFT, Math.min(S_SOFT, Sj1));
        SIM.wellsS[j] = Sj1;
      }
    }

    return { ok: true, reason: 'ok', cost: costFinal };
  };


  // ---------------------------------------------------------------------------
  // Canonical zero-pair cost (authoritative)
  // ---------------------------------------------------------------------------

  function _oppIndex(i) {
    const opp = (EC.CONST && EC.CONST.OPP);
    if (Array.isArray(opp) && opp.length >= 6 && typeof opp[i] === 'number') return opp[i];
    // Fallback for 6 wells: opposite is +3 mod 6
    return (i + 3) % 6;
  }

  function _fluxSim(A, S) { return A * S; }

  function _fluxCost(A, S, T) {
    const costCfg = (T && T.COST) || {};
    const sZeroAsOne = !!costCfg.S_ZERO_AS_ONE;
    const spinCost = (Math.abs(S) < 1e-9 && sZeroAsOne) ? 1.0 : S;
    return A * spinCost;
  }

  // Cost for the "zero pair" action.
  // Returns { cost, i, j, baseCost1, pushCost1, baseCost2, pushCost2 } where cost is a FLOAT
  // in the same energy scale as Apply/swipes (before integer "HUD units" rounding).
  function computeZeroPairCost(i) {
    const idx = (typeof i === 'number') ? (i | 0) : -1;
    if (!(idx >= 0 && idx < 6)) {
      return { cost: 0, i: -1, j: -1, baseCost1: 0, pushCost1: 0, baseCost2: 0, pushCost2: 0, reason: 'nosel' };
    }

    const SIM = EC.SIM;
    const T = EC.TUNE || {};
    if (!SIM || !SIM.wellsA || !SIM.wellsS) return { cost: 0, i: idx, j: _oppIndex(idx), baseCost1: 0, pushCost1: 0, baseCost2: 0, pushCost2: 0, reason: 'missing_sim' };

    const A_MIN = (typeof T.A_MIN === 'number') ? T.A_MIN : 0;
    const A_MAX = (typeof T.A_MAX === 'number') ? T.A_MAX : 100;
    const S_MIN = (typeof T.S_MIN === 'number') ? T.S_MIN : -100;
    const S_MAX = (typeof T.S_MAX === 'number') ? T.S_MAX : 100;

    const COST_NORM = (typeof T.COST_NORM === 'number' && T.COST_NORM !== 0) ? T.COST_NORM : 100;
    const kPush = (typeof T.OPPOSITE_PUSH_K === 'number') ? T.OPPOSITE_PUSH_K : 0;
    const j = _oppIndex(idx);
    if (!(idx >= 0 && idx < 6) || !(j >= 0 && j < 6)) return { cost: 0, i: idx, j };

    // Soft clamp used for scratch pushes (mirrors Apply behavior cost envelope).
    const S_SOFT = (typeof T.S_SOFT_MAX === 'number')
      ? T.S_SOFT_MAX
      : (Math.max(Math.abs(S_MIN), Math.abs(S_MAX)) * (T.COST && typeof T.COST.S_SOFT_MULT === 'number' ? T.COST.S_SOFT_MULT : 3));

    const Ai = (SIM.wellsA[idx] || 0);
    const Aj = (SIM.wellsA[j] || 0);
    const Si0 = (SIM.wellsS[idx] || 0);
    const Sj0 = (SIM.wellsS[j] || 0);

    // Step 1: selected well -> 0 (amount unchanged)
    const A1i = _clamp(Ai, A_MIN, A_MAX);
    const S1i = 0;
    const impulseSim1 = _fluxSim(A1i, S1i) - _fluxSim(Ai, Si0);
    const baseCost1 = Math.abs(_fluxCost(A1i, S1i, T) - _fluxCost(Ai, Si0, T)) / Math.max(1e-6, COST_NORM);
    const push1 = -kPush * impulseSim1;

    // Apply push1 to opposite in scratch (as normal Apply would)
    let Sj1 = Sj0;
    let pushCost1 = 0;
    if (Aj > 0.001 && Math.abs(push1) > 1e-9) {
      const fluxOld = Aj * Sj0;
      const fluxNew = fluxOld + push1;
      Sj1 = fluxNew / Aj;
      Sj1 = Math.max(-S_SOFT, Math.min(S_SOFT, Sj1));
      pushCost1 = Math.abs(_fluxCost(Aj, Sj1, T) - _fluxCost(Aj, Sj0, T)) / Math.max(1e-6, COST_NORM);
    }

    // Step 2: opposite well -> 0 (from scratch Sj1)
    const impulseSim2 = _fluxSim(Aj, 0) - _fluxSim(Aj, Sj1);
    const baseCost2 = Math.abs(_fluxCost(Aj, 0, T) - _fluxCost(Aj, Sj1, T)) / Math.max(1e-6, COST_NORM);
    const push2 = -kPush * impulseSim2;

    // Apply push2 back to selected in scratch (selected is at 0 after step 1)
    let Si2 = 0;
    let pushCost2 = 0;
    if (Ai > 0.001 && Math.abs(push2) > 1e-9) {
      const fluxOld = 0; // Ai * 0
      const fluxNew = fluxOld + push2;
      Si2 = fluxNew / Ai;
      Si2 = Math.max(-S_SOFT, Math.min(S_SOFT, Si2));
      pushCost2 = Math.abs(_fluxCost(Ai, Si2, T) - _fluxCost(Ai, 0, T)) / Math.max(1e-6, COST_NORM);
    }

    const total = (baseCost1 + pushCost1 + baseCost2 + pushCost2);
    return { cost: total, i: idx, j, baseCost1, pushCost1, baseCost2, pushCost2 };
  }

  // Canonical zero-pair cost: averaged across both selection directions for symmetry.
  AM.computeZeroPairCostCanonical = function computeZeroPairCostCanonical(i) {
    const idx = (typeof i === 'number') ? (i | 0) : -1;
    if (!(idx >= 0 && idx < 6)) {
      return { cost: 0, i: -1, j: -1, dirA: 0, dirB: 0, reason: 'nosel' };
    }
    const j = _oppIndex(idx);
    const c1 = computeZeroPairCost(idx);
    const c2 = computeZeroPairCost(j);
    const a = (c1 && typeof c1.cost === 'number') ? c1.cost : 0;
    const b = (c2 && typeof c2.cost === 'number') ? c2.cost : 0;
    const cost = 0.5 * (a + b);
    return { cost, i: idx, j: j, dirA: a, dirB: b };
  };
})();
