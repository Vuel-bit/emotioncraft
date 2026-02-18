/* Emotioncraft — UI Controls module (Chunk 2 split)
   Owns only the bottom control panel logic.
   No behavior or layout changes: code moved from ui_app.js.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const MOD = (EC.UI_CONTROLS = EC.UI_CONTROLS || {});

  function _getCtx(ctxIn) {
    try {
      const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
      const UI = snap.UI || {};
      return ctxIn || UI.mvpCtx || {};
    } catch (_) {
      return ctxIn || (EC.UI_STATE && EC.UI_STATE.mvpCtx) || {};
    }
  }


  // Selection helper: selection lives in EC.UI_STATE.selectedWellIndex.
  function _getSelIndex(i) {
    if (typeof i === 'number') return (i | 0);
    try {
      const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
      const UI_STATE = snap.UI || {};
      const u = UI_STATE.selectedWellIndex;
      if (typeof u === 'number' && u >= 0 && u < 6) return (u | 0);
    } catch (_) {}
    return -1;
  }



// ---------------------------------------------------------------------------
// Module-scope helpers used by MOD.render().
//
// A prior UI pass scoped these helpers inside MOD.init(), but MOD.render() is
// module-scoped and is called during desktop boot. Keep lightweight versions
// here so desktop does not crash if render() runs before init-scoped symbols
// exist.
function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

// Canonical integer “energy units” helpers for Set-0 buttons.
// These must match the Energy HUD rounding behavior (whole numbers).
function costToUnits(costFloat) {
  try {
    const AM = EC.ACTION_MATH;
    if (AM && typeof AM.costToUnits === 'function') return AM.costToUnits(costFloat);
  } catch (_) {}
  const u = Math.round(costFloat || 0);
  return Math.max(0, u);
}

function energyToUnits(energyFloat) {
  try {
    const AM = EC.ACTION_MATH;
    if (AM && typeof AM.energyToUnits === 'function') return AM.energyToUnits(energyFloat);
  } catch (_) {}
  const u = Math.round(energyFloat || 0);
  return Math.max(0, u);
}

// Trait-driven energy cost multiplier (stubborn).
function _getEnergyCostMult(simIn) {
  const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
  const SIM = simIn || snap.SIM || {};
  try {
    const AM = EC.ACTION_MATH;
    if (AM && typeof AM.getEnergyCostMult === 'function') return AM.getEnergyCostMult(SIM);
  } catch (_) {}
  try {
    return (EC.TRAITS && typeof EC.TRAITS.getEnergyCostMult === "function")
      ? (EC.TRAITS.getEnergyCostMult(SIM) || 1.0)
      : 1.0;
  } catch (_) {
    return 1.0;
  }
}


// Preview for a single well apply (used by MOD.render on desktop).
// Mirrors the init-scoped helper to avoid behavior changes.
function computeApplyPreview(i, A1In, S1In) {
  const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
  try {
    const AM = EC.ACTION_MATH;
    if (AM && typeof AM.computeApplyPreview === 'function') return AM.computeApplyPreview(i, A1In, S1In);
  } catch (_) {}
  const SIM = snap.SIM;
  const UI = EC.UI || {};
  const T = EC.TUNE || {};
  if (!SIM || !SIM.wellsA || !SIM.wellsS) {
    return { changed:false, cost:0, impulseCost:0, push:0, A0:0, S0:0, A1:0, S1:0 };
  }

  const A_MIN = (typeof T.A_MIN === 'number') ? T.A_MIN : 0;
  const A_MAX = (typeof T.A_MAX === 'number') ? T.A_MAX : 100;
  const S_MIN = (typeof T.S_MIN === 'number') ? T.S_MIN : -100;
  const S_MAX = (typeof T.S_MAX === 'number') ? T.S_MAX : 100;
  const COST_NORM = (typeof T.COST_NORM === 'number' && T.COST_NORM !== 0) ? T.COST_NORM : 100;
  const kPush = (typeof T.OPPOSITE_PUSH_K === 'number') ? T.OPPOSITE_PUSH_K : 0;

  const idx = _getSelIndex(i);
  if (idx < 0 || idx >= 6) {
    return { changed:false, cost:0, impulseCost:0, push:0, A0:0, S0:0, A1:0, S1:0 };
  }

  const A0 = SIM.wellsA[idx];
  const S0 = SIM.wellsS[idx];
  const A1 = _clamp(A1In, A_MIN, A_MAX);
  const S1 = _clamp(S1In, S_MIN, S_MAX);

  const changed = (A1 !== A0) || (S1 !== S0);

  const dFlux = _fluxCost(A1, S1, T) - _fluxCost(A0, S0, T);
  const impulseCost = Math.abs(dFlux);
  const cost = Math.abs(impulseCost) / COST_NORM;

  const impulseSim = _fluxSim(A1, S1) - _fluxSim(A0, S0);
  const push = impulseSim * kPush;

  return { changed, cost, impulseCost, push, A0, S0, A1, S1 };
}

// Cost for the "zero pair" action.
// Returns { cost, i, j, baseCost1, pushCost1, baseCost2, pushCost2 } where cost is a FLOAT
// in the same energy scale as Apply/swipes (before integer "HUD units" rounding).
function computeZeroPairCost(i) {
  const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
  const SIM = snap.SIM;
  const T = EC.TUNE || {};
  if (!SIM || !SIM.wellsA || !SIM.wellsS) return { cost: 0, i, j: _oppIndex(i) };

  const A_MIN = (typeof T.A_MIN === 'number') ? T.A_MIN : 0;
  const A_MAX = (typeof T.A_MAX === 'number') ? T.A_MAX : 100;
  const S_MIN = (typeof T.S_MIN === 'number') ? T.S_MIN : -100;
  const S_MAX = (typeof T.S_MAX === 'number') ? T.S_MAX : 100;

  const COST_NORM = (typeof T.COST_NORM === 'number' && T.COST_NORM !== 0) ? T.COST_NORM : 100;
  const kPush = (typeof T.OPPOSITE_PUSH_K === 'number') ? T.OPPOSITE_PUSH_K : 0;

  const idx = _getSelIndex(i);
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
function computeZeroPairCostCanonical(i) {
  try {
    const AM = EC.ACTION_MATH;
    if (AM && typeof AM.computeZeroPairCostCanonical === 'function') return AM.computeZeroPairCostCanonical(i);
  } catch (_) {}
  const idx = _getSelIndex(i);
  const j = _oppIndex(idx);
  const c1 = computeZeroPairCost(idx);
  const c2 = computeZeroPairCost(j);
  const a = (c1 && typeof c1.cost === 'number') ? c1.cost : 0;
  const b = (c2 && typeof c2.cost === 'number') ? c2.cost : 0;
  const cost = 0.5 * (a + b);
  return { cost, i: idx, j: j, dirA: a, dirB: b };
}

  MOD.init = function init(ctxIn) {
    const ctx = _getCtx(ctxIn);
    const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
    const SIM = snap.SIM;
    const UI_STATE = (ctx.UI_STATE = ctx.UI_STATE || snap.UI || {});
    ctx.SIM = SIM;
    if (!SIM) return;

    // Idempotent init
    if (UI_STATE._controlsInited) return;
    UI_STATE._controlsInited = true;

    const UI = (ctx.UI = ctx.UI || (EC.UI = EC.UI || {}));
    const clamp = ctx.clamp || EC.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));

    const dom = ctx.dom || {};
    const deltaAEl = dom.deltaAEl || document.getElementById('deltaA');
    const deltaAValEl = dom.deltaAValEl || document.getElementById('deltaAVal');
    const deltaSEl = dom.deltaSEl || document.getElementById('deltaS');
    const deltaSValEl = dom.deltaSValEl || document.getElementById('deltaSVal');
    const costPillEl = dom.costPillEl || document.getElementById('costPill');
    const previewPillEl = dom.previewPillEl || document.getElementById('previewPill');
    const objectiveSummaryEl = dom.objectiveSummaryEl || document.getElementById('objectiveSummary');
    const btnApplyEl = dom.btnApplyEl || document.getElementById('btnApply');
    const btnSpinZeroEl = dom.btnSpinZeroEl || document.getElementById('btnSpinZero');
    const btnZeroPairEl = dom.btnZeroPairEl || document.getElementById('btnZeroPair');
    const costSpinZeroEl = dom.costSpinZeroEl || document.getElementById('costSpinZero');
    const costZeroPairEl = dom.costZeroPairEl || document.getElementById('costZeroPair');
    const energyHudEl = dom.energyHudEl || document.getElementById('energyHud');


    // Persistent caches (hardening)
    UI.targetA = (typeof UI.targetA === 'number') ? UI.targetA : 0;
    UI.targetS = (typeof UI.targetS === 'number') ? UI.targetS : 0;
    UI.zeroPairArmed = !!UI.zeroPairArmed;
    UI.zeroPairOpp = (typeof UI.zeroPairOpp === 'number') ? UI.zeroPairOpp : -1;

    UI_STATE.lastPreview = UI_STATE.lastPreview || null;
    UI_STATE.prevSel = (typeof UI_STATE.prevSel === 'number') ? UI_STATE.prevSel : -999;
    UI_STATE.lastInitStamp = (typeof UI_STATE.lastInitStamp === 'number') ? UI_STATE.lastInitStamp : -1;

    // Tuning mirrors (must match prior behavior)
    const T = EC.TUNE || {};
    const E_CAP = T.ENERGY_CAP;
    const A_MIN = T.A_MIN;
    const A_MAX = T.A_MAX;
    const S_MIN = T.S_MIN;
    const S_MAX = T.S_MAX;
    const COST_NORM = T.COST_NORM;

    // Opposite pairs follow hue index order: red(0)↔green(3), purple(1)↔yellow(4), blue(2)↔orange(5)
    const OPP = (EC.CONST && EC.CONST.OPPOSITE_OF) || [3, 4, 5, 0, 1, 2];

    const wellTitle = ctx.wellTitle || ((i) => String(i));

    // computeZeroPairCost is canonical at module scope.

    function setTargetsFromSelection(i) {
      if (i == null || i < 0) return;
      UI.targetA = clamp((SIM.wellsA[i] || 0), A_MIN, A_MAX);
      UI.targetS = clamp((SIM.wellsS[i] || 0), S_MIN, S_MAX);
      if (deltaAEl) deltaAEl.value = String(UI.targetA);
      if (deltaSEl) deltaSEl.value = String(UI.targetS);
    }

    function toast(msg) {
      UI_STATE.uiMsg = msg;
      UI_STATE.uiMsgT = 1.2;
    }

    // Expose a minimal toast hook for other input paths (e.g., swipe/flick).
    // This keeps messaging consistent without introducing new UI systems.
    MOD.toast = toast;

    // Public: perform a single discrete +/-5 flick step on a well and auto-apply.
    // Mechanics live in EC.ACTIONS; this wrapper only keeps UI sliders aligned.
    MOD.flickStep = function flickStep(i, dA, dS) {
      const act = (EC.ACTIONS && typeof EC.ACTIONS.flickStep === 'function') ? EC.ACTIONS.flickStep : null;
      let res = null;
      try {
        if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') res = EC.ENGINE.dispatch('flickStep', i, dA, dS);
      } catch (_) {}
      if (!res || res.reason === 'missing_action') res = act ? act(i, dA, dS) : { ok: false, reason: 'missing_actions', cost: 0 };
      if (!res || !res.ok) return res;

      // Keep UI sliders aligned with the new values (presentation only).
      if (i != null && i >= 0 && i < 6) {
        UI.targetA = clamp((SIM.wellsA[i] || 0), A_MIN, A_MAX);
        UI.targetS = clamp((SIM.wellsS[i] || 0), S_MIN, S_MAX);
        if (deltaAEl) deltaAEl.value = String(UI.targetA);
        if (deltaSEl) deltaSEl.value = String(UI.targetS);
        syncDeltaLabels();
      }

      return res;
    };

    // Public: set selected well spin to 0 using authoritative actions.
    // Charges integer HUD units when opts.chargeUnits is true.
    MOD.spinZero = function spinZero(i, opts) {
      const act = (EC.ACTIONS && typeof EC.ACTIONS.spinZero === 'function') ? EC.ACTIONS.spinZero : null;
      let res = null;
      try {
        if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') res = EC.ENGINE.dispatch('spinZero', i, opts);
      } catch (_) {}
      if (!res || res.reason === 'missing_action') res = act ? act(i, opts) : { ok: false, reason: 'missing_actions', cost: 0, well: i, A: 0, S: 0 };

      // Keep UI tidy (presentation only).
      if (res && res.ok) {
        UI.targetA = (res && typeof res.A === 'number') ? res.A : UI.targetA;
        UI.targetS = (res && typeof res.S === 'number') ? res.S : UI.targetS;
        if (deltaAEl) deltaAEl.value = String(UI.targetA);
        if (deltaSEl) deltaSEl.value = String(UI.targetS);
        syncDeltaLabels();
      }

      return res;
    };

    // Public: atomically set selected well and opposite well spins to 0 (no slider retarget).
    MOD.zeroPair = function zeroPair(sel, opts) {
      const act = (EC.ACTIONS && typeof EC.ACTIONS.zeroPair === 'function') ? EC.ACTIONS.zeroPair : null;
      let res = null;
      try {
        if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') res = EC.ENGINE.dispatch('zeroPair', sel, opts);
      } catch (_) {}
      if (!res || res.reason === 'missing_action') res = act ? act(sel, opts) : { ok: false, reason: 'missing_actions', cost: 0, well: sel, opp: _oppIndex(sel) };
      return res;
    };

    function syncDeltaLabels() {
      if (deltaAValEl) deltaAValEl.textContent = String(Math.round(UI.targetA || 0));
      if (deltaSValEl) deltaSValEl.textContent = String(Math.round(UI.targetS || 0));

      const i = _getSelIndex(null, SIM);
      if (i !== UI_STATE.prevSel) {
        UI_STATE.prevSel = i;
        if (i >= 0) {
          setTargetsFromSelection(i);
        }
      }

      const prev = (() => {
        if (i < 0) return { cost: 0, changed: false, push: 0, A0: 0, S0: 0, A1: 0, S1: 0, zeroPair: false, j: -1 };
        if (UI.zeroPairArmed) {
          const j = (typeof UI.zeroPairOpp === 'number') ? UI.zeroPairOpp : _oppIndex(i);
          const c = computeZeroPairCostCanonical(i);
          const cost = c.cost || 0;
          return { cost, changed: true, push: 0, A0: SIM.wellsA[i]||0, S0: SIM.wellsS[i]||0, A1: SIM.wellsA[i]||0, S1: 0, zeroPair: true, j };
        }
        const p = computeApplyPreview(i, UI.targetA, UI.targetS);
        p.zeroPair = false;
        p.j = -1;
        return p;
      })();

      // Persist the latest preview for other UI render paths (defensive: first render has no prev)
      UI_STATE.lastPreview = prev;

      // Apply trait-driven cost multiplier (stubborn) for display + gating.
      const costRaw = ((prev && prev.cost) || 0);
      const costMult = _getEnergyCostMult(SIM);
      const costFinal = costRaw * costMult;
      prev._costRaw = costRaw;
      prev._costMult = costMult;
      prev._costFinal = costFinal;

      if (costPillEl) costPillEl.textContent = 'Cost: ' + (costFinal.toFixed(2));

      if (objectiveSummaryEl) {
        // PLAN_CHAIN layout is handled in the drawer header block above.
        try {
          const lvl = SIM.levelId || 1;
          const def = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef()
            : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(lvl) : null);
          const win = def && def.win ? def.win : null;
          if (win && win.type === 'PLAN_CHAIN') {
            // no-op here
          } else {
            const getNext = (EC.UI_HUD && typeof EC.UI_HUD.getNextObjectiveText === 'function')
              ? EC.UI_HUD.getNextObjectiveText
              : null;
            const rawNext = getNext ? String(getNext() || '') : '';
            const nextTxt = rawNext && rawNext.trim() ? rawNext.trim() : '—';
            objectiveSummaryEl.textContent = 'Next: ' + nextTxt;
          }
        } catch (_) {}
      }

      if (previewPillEl) {
        if (i >= 0) {
          if (prev.zeroPair) {
            const j = prev.j;
            const oppName = (j != null && j >= 0) ? wellTitle(j) : 'Opp';
            const curTxt = `Current: S ${(SIM.wellsS[i]>=0?'+':'') + Math.round(SIM.wellsS[i]||0)} | ${oppName} ${(SIM.wellsS[j] >=0?'+':'') + Math.round(SIM.wellsS[j]||0)}`;
            const tgtTxt = `Target: S 0 | ${oppName} 0`;
            previewPillEl.textContent = `${curTxt} | ${tgtTxt}`;
          } else {
            const curTxt = `Current: A ${Math.round(prev.A0)}  S ${(prev.S0 >= 0 ? '+' : '') + Math.round(prev.S0)}`;
            const tgtTxt = `Target: A ${Math.round(prev.A1)}  S ${(prev.S1 >= 0 ? '+' : '') + Math.round(prev.S1)}`;
            const pushTxt = `Opp: ${(prev.push >= 0 ? '+' : '') + prev.push.toFixed(1)}`;
            previewPillEl.textContent = `${curTxt} | ${tgtTxt} | ${pushTxt}`;
          }
        } else {
          previewPillEl.textContent = 'Current: - | Target: -';
        }
      }

      const can = (i >= 0) && prev.changed && (SIM.energy || 0) >= (prev._costFinal || 0);
      if (btnApplyEl) {
        btnApplyEl.disabled = !can;
        btnApplyEl.style.opacity = can ? '1' : '0.55';
      }

      if (btnSpinZeroEl) {
        const ok = (i >= 0);
        btnSpinZeroEl.disabled = !ok;
        btnSpinZeroEl.style.opacity = ok ? '1' : '0.55';
      }
      if (btnZeroPairEl) {
        const ok = (i >= 0);
        btnZeroPairEl.disabled = !ok;
        btnZeroPairEl.style.opacity = ok ? '1' : '0.55';
      }
    }

    // Expose helpers to module + others
    MOD._setTargetsFromSelection = setTargetsFromSelection;
    MOD._syncDeltaLabels = syncDeltaLabels;

    if (deltaAEl) {
      deltaAEl.addEventListener('input', () => {
        UI.targetA = clamp(parseFloat(deltaAEl.value || '0') || 0, A_MIN, A_MAX);
        syncDeltaLabels();
      });
    }
    if (deltaSEl) {
      deltaSEl.addEventListener('input', () => {
        UI.zeroPairArmed = false;
        UI.zeroPairOpp = -1;

        UI.targetS = clamp(parseFloat(deltaSEl.value || '0') || 0, S_MIN, S_MAX);
        syncDeltaLabels();
      });
    }

    if (btnSpinZeroEl) {
      btnSpinZeroEl.addEventListener('click', () => {
        const i = _getSelIndex(null, SIM);
        if (i < 0) return;

        const act = (EC.ACTIONS && typeof EC.ACTIONS.spinZero === 'function') ? EC.ACTIONS.spinZero : null;
        const res = act ? act(i, { chargeUnits: true }) : { ok: false, reason: 'missing_actions', cost: 0 };

        // Keep UI tidy (presentation only).
        if (res && res.ok) {
          // Tutorial instrumentation
          try {
            if (SIM && SIM.tutorialActive) {
              const payload = { kind: 'SPIN_ZERO', well: i, cost: (res && typeof res.cost === 'number') ? res.cost : 0 };
              try {
                if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') EC.ENGINE.dispatch('recordTutLastAction', payload);
                else if (EC.ACTIONS && typeof EC.ACTIONS.recordTutLastAction === 'function') EC.ACTIONS.recordTutLastAction(payload);
              } catch (_) {}
            }
          } catch (_) {}

          UI.targetA = (res && typeof res.A === 'number') ? res.A : UI.targetA;
          UI.targetS = (res && typeof res.S === 'number') ? res.S : UI.targetS;
          if (deltaAEl) deltaAEl.value = String(UI.targetA);
          if (deltaSEl) deltaSEl.value = String(UI.targetS);
          syncDeltaLabels();
        }
      });
    }
if (btnZeroPairEl) {
      btnZeroPairEl.addEventListener('click', () => {
        // Resolve selection robustly (matches render + avoids selection mismatch UI bugs)
        let sel = _getSelIndex(null, SIM);
        if (!(sel >= 0 && sel < 6)) {
          const ps = (UI_STATE && typeof UI_STATE.prevSel === 'number') ? UI_STATE.prevSel : -1;
          if (ps >= 0 && ps < 6) sel = ps;
        }
        if (sel < 0) return;

        const j = OPP[sel];
        if (j == null || j < 0 || j >= 6) return;

        const act = (EC.ACTIONS && typeof EC.ACTIONS.zeroPair === 'function') ? EC.ACTIONS.zeroPair : null;
        const res = act ? act(sel) : { ok: false, reason: 'missing_actions', cost: 0, well: sel, opp: j };
        if (!(res && res.ok)) return;

        // Tutorial instrumentation
        try {
          if (SIM && SIM.tutorialActive) {
            const oppIndex = (res && typeof res.opp === 'number') ? res.opp : j;
            const cost = (res && typeof res.cost === 'number') ? res.cost : 0;
            const payload = { kind: 'PAIR_ZERO', well: sel, oppIndex: oppIndex, cost: cost };
            try {
              if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') EC.ENGINE.dispatch('recordTutLastAction', payload);
              else if (EC.ACTIONS && typeof EC.ACTIONS.recordTutLastAction === 'function') EC.ACTIONS.recordTutLastAction(payload);
            } catch (_) {};

          }
        } catch (_) {}
      });
    }

    // Apply button removed in mobile-first controls.

// Initial sync on init
    const _initSel = _getSelIndex(null, SIM);
    if (_initSel >= 0) setTargetsFromSelection(_initSel);
    syncDeltaLabels();
  };

  MOD.render = function render(dt, ctxIn) {
    const ctx = _getCtx(ctxIn);
    const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
    const SIM = snap.SIM;
    const UI_STATE = (ctx.UI_STATE = ctx.UI_STATE || snap.UI || {});
    ctx.SIM = SIM;
    if (!SIM) return;
    const dom = ctx.dom || {};

    // Resync sliders/targets after a reset/start (SIM._mvpInitStamp)
    const stampNow = (typeof SIM._mvpInitStamp === 'number') ? SIM._mvpInitStamp : 0;
    if (stampNow !== UI_STATE.lastInitStamp) {
      UI_STATE.lastInitStamp = stampNow;
      const selResync = (_getSelIndex(null, SIM) >= 0 ? _getSelIndex(null, SIM) : 0);
      if (selResync >= 0 && typeof MOD._setTargetsFromSelection === 'function') {
        MOD._setTargetsFromSelection(selResync);
        // Force preview text refresh even if selection didn't change
        UI_STATE.prevSel = -999;
        if (typeof MOD._syncDeltaLabels === 'function') MOD._syncDeltaLabels();
      }
    }


    // Resync sliders/targets after action-driven control changes (UI_STATE._controlsSyncStamp)
    const cStampNow = (typeof UI_STATE._controlsSyncStamp === 'number') ? UI_STATE._controlsSyncStamp : 0;
    if (typeof UI_STATE.lastControlsSyncStamp !== 'number') {
      UI_STATE.lastControlsSyncStamp = cStampNow;
    } else if (cStampNow !== UI_STATE.lastControlsSyncStamp) {
      UI_STATE.lastControlsSyncStamp = cStampNow;
      let selResync = _getSelIndex(null, SIM);
      if (!(selResync >= 0 && selResync < 6)) {
        const ss = (typeof UI_STATE._controlsSyncSel === 'number') ? UI_STATE._controlsSyncSel : -1;
        if (ss >= 0 && ss < 6) selResync = ss;
      }
      if (selResync >= 0 && typeof MOD._setTargetsFromSelection === 'function') {
        MOD._setTargetsFromSelection(selResync);
        // Force preview text refresh even if selection didn't change
        UI_STATE.prevSel = -999;
        if (typeof MOD._syncDeltaLabels === 'function') MOD._syncDeltaLabels();
      }
    }

    // Bottom-bar compact info: Goal line + Energy under Spin
    const T = EC.TUNE || {};
    const E_CAP = T.ENERGY_CAP;
    const energyUnderSpinEl = dom.energyUnderSpinEl || document.getElementById('energyUnderSpin');
    if (energyUnderSpinEl) {
      energyUnderSpinEl.textContent = `Energy: ${Math.round(SIM.energy || 0)}/${E_CAP}`;
    }

    const goalLineEl = dom.goalLineEl || document.getElementById('goalLine');
    const objectiveSummaryEl = dom.objectiveSummaryEl || document.getElementById('objectiveSummary');

    // Bottom drawer top: current step (left, 3 lines) + next step (right).
    try {
      const lvl = SIM.levelId || 1;
      const def = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef()
        : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(lvl) : null);
      const win = def && def.win ? def.win : null;

      if (win && win.type === 'PLAN_CHAIN' && Array.isArray(win.steps)) {
        const steps = win.steps;
        const total = steps.length || 1;
        const step = (typeof SIM.planStep === 'number') ? SIM.planStep : 0;
        const curIdx = Math.max(0, Math.min(total - 1, step));
        const st = steps[curIdx] || {};
        const raw = String(st.text || '').replace(/^\s*Step\s*\d+\s*:\s*/i, '').trim();
        const parts = raw.split(';').map(s => String(s || '').trim()).filter(Boolean);
        const line1 = `Treatment step ${curIdx + 1}/${total}`;
        const line2 = parts[0] || '';
        const line3 = parts[1] || '';

        if (goalLineEl) goalLineEl.textContent = [line1, line2, line3].join('\n');

        if (objectiveSummaryEl) {
          const nextIdx = curIdx + 1;
          if (nextIdx >= total) {
            objectiveSummaryEl.textContent = ['Treatment complete', '', ''].join('\n');
          } else {
            const nst = steps[nextIdx] || {};
            const nraw = String(nst.text || '').replace(/^\s*Step\s*\d+\s*:\s*/i, '').trim();
            const nparts = nraw.split(';').map(s => String(s || '').trim()).filter(Boolean);
            const n1 = `Treatment step ${nextIdx + 1}/${total}`;
            const n2 = nparts[0] || '';
            const n3 = nparts[1] || '';
            objectiveSummaryEl.textContent = [n1, n2, n3].join('\n');
          }
        }
      } else {
        if (goalLineEl && EC.UI_HUD && typeof EC.UI_HUD.getObjectiveSummaryText === 'function') {
          const raw = String(EC.UI_HUD.getObjectiveSummaryText() || '').replace(/^\s*Goal:\s*/i, '');
          goalLineEl.textContent = 'Current: ' + raw;
        }
        if (objectiveSummaryEl) {
          const getNext = (EC.UI_HUD && typeof EC.UI_HUD.getNextObjectiveText === 'function')
            ? EC.UI_HUD.getNextObjectiveText
            : null;
          const rawNext = getNext ? String(getNext() || '') : '';
          const nextTxt = rawNext && rawNext.trim() ? rawNext.trim() : '—';
          objectiveSummaryEl.textContent = 'Next: ' + nextTxt;
        }
      }
    } catch (_) {}

    
    // Keep apply validity fresh
    if (typeof MOD._syncDeltaLabels === 'function') MOD._syncDeltaLabels();

    // Mobile-first controls: live energy HUD + inline costs for immediate buttons.
    const E_CAP2 = (typeof T.ENERGY_CAP === 'number') ? T.ENERGY_CAP : ((typeof T.E_MAX === 'number') ? T.E_MAX : 200);
    const energyHudEl2 = dom.energyHudEl || document.getElementById('energyHud');
    if (energyHudEl2) {
      energyHudEl2.textContent = `⚡ ${(SIM.energy || 0).toFixed(0)}/${E_CAP2}`;
    }

    // Timed plan timer HUD (upper-right)
    // Reuses the Zen timer field for any timed patient plan.
    try {
      const zEl = dom.zenTimerHudEl || document.getElementById('zenTimerHud');
      if (zEl) {
        const pk = String(SIM._activePlanKey || '').toUpperCase();
        const t = SIM.zenTimeRemainingSec;
        const isTimed = (pk === 'ZEN' || pk === 'TRANQUILITY' || pk === 'TRANSCENDENCE');
        if (isTimed && typeof t === 'number' && isFinite(t)) {
          const label = (pk === 'ZEN') ? 'ZEN' : (pk === 'TRANQUILITY') ? 'TRANQ' : (pk === 'TRANSCENDENCE') ? 'TRANSCEND' : 'TIME';
          const sec = Math.max(0, Math.floor(t));
          const mm = Math.floor(sec / 60);
          const ss = sec % 60;
          const txt = `${label} ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
          if (zEl.textContent !== txt) zEl.textContent = txt;
          zEl.style.display = 'block';
        } else {
          zEl.style.display = 'none';
        }
      }
    } catch (_) {}


    let sel = _getSelIndex(null, SIM);
    // Robust selection for bottom-bar costs: fall back to last known UI selection
    if (!(sel >= 0 && sel < 6)) {
      const ps = (UI_STATE && typeof UI_STATE.prevSel === 'number') ? UI_STATE.prevSel : -1;
      if (ps >= 0 && ps < 6) sel = ps;
    }
    const hasSel = (sel >= 0 && sel < 6);

    const btnSpinZeroEl2 = dom.btnSpinZeroEl || document.getElementById('btnSpinZero');
    const btnZeroPairEl2 = dom.btnZeroPairEl || document.getElementById('btnZeroPair');
    if (btnSpinZeroEl2) btnSpinZeroEl2.disabled = !hasSel;
    
    if (!hasSel) {
      const costSpinZeroEl2 = dom.costSpinZeroEl || document.getElementById('costSpinZero');
      const costZeroPairEl2 = dom.costZeroPairEl || document.getElementById('costZeroPair');
      if (costSpinZeroEl2) costSpinZeroEl2.textContent = '—';
      if (costZeroPairEl2) costZeroPairEl2.textContent = '—';
    } else {
      const mult = _getEnergyCostMult(SIM);
      const eU = energyToUnits(SIM.energy || 0);
      const A0 = (SIM.wellsA[sel] || 0);
      const c1 = computeApplyPreview(sel, A0, 0);
      const cost1Raw = (c1 && c1.changed) ? (c1.cost || 0) : 0;
      const cost1FloatFinal = cost1Raw * mult;
      const cost1Units = costToUnits(cost1FloatFinal);
      const costSpinZeroEl2 = dom.costSpinZeroEl || document.getElementById('costSpinZero');
      const costZeroPairEl2 = dom.costZeroPairEl || document.getElementById('costZeroPair');
      if (costSpinZeroEl2) costSpinZeroEl2.textContent = `Cost ${cost1Units}`;

      if (btnSpinZeroEl2) {
        const changedSpin = (c1 && c1.changed);
        const spinUnits = changedSpin ? cost1Units : 0;
        let canSpin = hasSel && changedSpin && (eU >= spinUnits);
        // Tutorial gating: use SIM._tutCanSpin0 if present (source of truth = tutorial step machine)
        if (SIM && SIM.tutorialActive && (typeof SIM._tutCanSpin0 === 'boolean')) {
          canSpin = canSpin && !!SIM._tutCanSpin0;
        }
        btnSpinZeroEl2.disabled = !canSpin;
        btnSpinZeroEl2.style.opacity = canSpin ? '1' : '0.55';

        // Tutorial pulse highlight
        try {
          if (SIM && SIM.tutorialActive && (typeof SIM._tutCanSpin0 === 'boolean')) {
            if (SIM._tutCanSpin0) btnSpinZeroEl2.classList.add('tutPulse');
            else btnSpinZeroEl2.classList.remove('tutPulse');
          } else {
            btnSpinZeroEl2.classList.remove('tutPulse');
          }
        } catch (_) {}
      }


      const c2 = computeZeroPairCostCanonical(sel);
      const j = _oppIndex(sel);
      const changedPair = (j != null && j >= 0 && j < 6) && ((Math.abs(SIM.wellsS[sel] || 0) > 1e-9) || (Math.abs(SIM.wellsS[j] || 0) > 1e-9));
      const pairCostRaw = changedPair ? (c2.cost || 0) : 0;
      const pairCostFloatFinal = pairCostRaw * mult;
      const pairUnits = costToUnits(pairCostFloatFinal);
      if (costZeroPairEl2) costZeroPairEl2.textContent = `Cost ${pairUnits}`;

      // Gating must match displayed cost exactly.
      if (btnZeroPairEl2) {
        let canPair = hasSel && changedPair && (eU >= pairUnits);
        // Tutorial gating: use SIM._tutCanPair0 if present (source of truth = tutorial step machine)
        if (SIM && SIM.tutorialActive && (typeof SIM._tutCanPair0 === 'boolean')) {
          canPair = canPair && !!SIM._tutCanPair0;
        }
        btnZeroPairEl2.disabled = !canPair;
        btnZeroPairEl2.style.opacity = canPair ? '1' : '0.55';

        // Tutorial pulse highlight
        try {
          if (SIM && SIM.tutorialActive && (typeof SIM._tutCanPair0 === 'boolean')) {
            if (SIM._tutCanPair0) btnZeroPairEl2.classList.add('tutPulse');
            else btnZeroPairEl2.classList.remove('tutPulse');
          } else {
            btnZeroPairEl2.classList.remove('tutPulse');
          }
        } catch (_) {}
      }
    }
  };

  MOD.onResize = function onResize() {
    if (typeof EC.resize === 'function') EC.resize();
  };
})();