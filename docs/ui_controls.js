/* Emotioncraft — UI Controls module (Chunk 2 split)
   Owns only the bottom control panel logic.
   No behavior or layout changes: code moved from ui_app.js.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const MOD = (EC.UI_CONTROLS = EC.UI_CONTROLS || {});

  function _getCtx(ctxIn) {
    return ctxIn || (EC.UI_STATE && EC.UI_STATE.mvpCtx) || {};
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

// Preview for a single well apply (used by MOD.render on desktop).
// Mirrors the init-scoped helper to avoid behavior changes.
function computeApplyPreview(i, A1In, S1In) {
  const SIM = EC.SIM;
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

  const idx = (typeof i === 'number') ? i : (typeof SIM.selectedWellIndex === 'number' ? SIM.selectedWellIndex : -1);
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
// Canonical single source of truth used for display, gating, and deduction.
// Returns { cost, i, j, baseCost1, pushCost1, baseCost2, pushCost2 } with cost in energy units.
function computeZeroPairCost(i) {
  const SIM = EC.SIM;
  const T = EC.TUNE || {};
  if (!SIM || !SIM.wellsA || !SIM.wellsS) return { cost: 0, i, j: _oppIndex(i) };

  const A_MIN = (typeof T.A_MIN === 'number') ? T.A_MIN : 0;
  const A_MAX = (typeof T.A_MAX === 'number') ? T.A_MAX : 100;
  const S_MIN = (typeof T.S_MIN === 'number') ? T.S_MIN : -100;
  const S_MAX = (typeof T.S_MAX === 'number') ? T.S_MAX : 100;

  const COST_NORM = (typeof T.COST_NORM === 'number' && T.COST_NORM !== 0) ? T.COST_NORM : 100;
  const kPush = (typeof T.OPPOSITE_PUSH_K === 'number') ? T.OPPOSITE_PUSH_K : 0;

  const idx = (typeof i === 'number') ? i : (typeof SIM.selectedWellIndex === 'number' ? SIM.selectedWellIndex : -1);
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

  MOD.init = function init(ctxIn) {
    const ctx = _getCtx(ctxIn);
    const SIM = ctx.SIM || EC.SIM;
    if (!SIM) return;

    // Idempotent init
    const UI_STATE = (ctx.UI_STATE = ctx.UI_STATE || (EC.UI_STATE = EC.UI_STATE || {}));
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

    function fluxSim(A, S) { return A * S; }
    function fluxCost(A, S) {
      const spinCost = (S === 0 ? 1 : S); // zero-rule ONLY for cost
      return A * spinCost;
    }

    function computeApplyPreview(i, A1_in, S1_in) {
      if (i == null || i < 0) {
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
    }


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

    // Apply a preview (same logic as the Apply button) without touching tuning.
    function applyPreviewToSim(i, prev) {
      const cost = prev.cost || 0;
      if (!prev.changed) return { ok: false, reason: 'nochange', cost };
      if ((SIM.energy || 0) < cost) return { ok: false, reason: 'noenergy', cost };

      SIM.energy = Math.max(0, (SIM.energy || 0) - cost);

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
          const S_SOFT = (typeof T.S_SOFT_MAX === 'number') ? T.S_SOFT_MAX : (Math.max(Math.abs(S_MIN), Math.abs(S_MAX)) * (T.COST && typeof T.COST.S_SOFT_MULT === 'number' ? T.COST.S_SOFT_MULT : 3));
          Sj1 = Math.max(-S_SOFT, Math.min(S_SOFT, Sj1));
          SIM.wellsS[j] = Sj1;
        }
      }

      return { ok: true, reason: 'ok', cost };
    }

    // Public: perform a single discrete +/-5 flick step on a well and auto-apply.
    // This uses the same preview+apply path as the Apply button to avoid mechanic drift.
    MOD.flickStep = function flickStep(i, dA, dS) {
      if (i == null || i < 0 || i >= 6) return { ok: false, reason: 'nosel', cost: 0 };
      if ((dA === 0 || !dA) && (dS === 0 || !dS)) return { ok: false, reason: 'noop', cost: 0 };

      // Compute new absolute targets based on current state.
      const A0 = clamp((SIM.wellsA[i] || 0), A_MIN, A_MAX);
      const S0 = clamp((SIM.wellsS[i] || 0), S_MIN, S_MAX);
      const A1t = clamp(A0 + (dA || 0), A_MIN, A_MAX);
      const S1t = clamp(S0 + (dS || 0), S_MIN, S_MAX);

      const prev = computeApplyPreview(i, A1t, S1t);
      const res = applyPreviewToSim(i, prev);
      if (!res.ok) return res;

      // Keep UI sliders aligned with the new values (presentation only).
      UI.targetA = prev.A1;
      UI.targetS = prev.S1;
      if (deltaAEl) deltaAEl.value = String(UI.targetA);
      if (deltaSEl) deltaSEl.value = String(UI.targetS);
      syncDeltaLabels();

      return res;
    };

    function syncDeltaLabels() {
      if (deltaAValEl) deltaAValEl.textContent = String(Math.round(UI.targetA || 0));
      if (deltaSValEl) deltaSValEl.textContent = String(Math.round(UI.targetS || 0));

      const i = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : -1;
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
          const c = computeZeroPairCost(i);
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

      if (costPillEl) costPillEl.textContent = 'Cost: ' + (((prev && prev.cost) || 0).toFixed(2));

      if (objectiveSummaryEl) {
        const getNext = (EC.UI_HUD && typeof EC.UI_HUD.getNextObjectiveText === 'function')
          ? EC.UI_HUD.getNextObjectiveText
          : null;
        const rawNext = getNext ? String(getNext() || '') : '';
        const nextTxt = rawNext && rawNext.trim() ? rawNext.trim() : '—';
        objectiveSummaryEl.textContent = 'Next: ' + nextTxt;
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

      const can = (i >= 0) && prev.changed && (SIM.energy || 0) >= (prev.cost || 0);
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
        const i = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : -1;
        if (i < 0) return;

        // Immediate execute: set selected well spin to 0 via the same preview/apply path as swipes.
        const S0 = (SIM.wellsS[i] || 0);
        const dS = (0 - S0);
        const res = MOD.flickStep(i, 0, dS);

        // Keep UI tidy; costs will refresh on next render.
        if (!res || !res.ok) {
          // no toast spam; debug overlay will show apply reason if needed
        }
      });
    }
if (btnZeroPairEl) {
      btnZeroPairEl.addEventListener('click', () => {
        // Resolve selection robustly (matches render + avoids selection mismatch UI bugs)
        let sel = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : -1;
        if (!(sel >= 0 && sel < 6)) {
          const ps = (UI_STATE && typeof UI_STATE.prevSel === 'number') ? UI_STATE.prevSel : -1;
          if (ps >= 0 && ps < 6) sel = ps;
        }
        if (sel < 0) return;

        const j = OPP[sel];
        if (j == null || j < 0 || j >= 6) return;

        // Immediate execute: atomic dual-spin-to-zero update.
        const c = computeZeroPairCost(sel);
        const pairCostRaw = c.cost || 0;
        const pairCost = Math.ceil(pairCostRaw * 100) / 100; // round UP to cents so gating never exceeds display

        const changed = (Math.abs(SIM.wellsS[sel] || 0) > 1e-9) || (Math.abs(SIM.wellsS[j] || 0) > 1e-9);
        if (!changed) return;
        if ((SIM.energy || 0) < pairCost) return;

        SIM.energy = Math.max(0, (SIM.energy || 0) - pairCost);
        SIM.wellsS[sel] = 0;
        SIM.wellsS[j] = 0;
      });
    }

    // Apply button removed in mobile-first controls.

// Initial sync on init
    const _initSel = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : -1;
    if (_initSel >= 0) setTargetsFromSelection(_initSel);
    syncDeltaLabels();
  };

  MOD.render = function render(dt, ctxIn) {
    const ctx = _getCtx(ctxIn);
    const SIM = ctx.SIM || EC.SIM;
    if (!SIM) return;
    const UI_STATE = ctx.UI_STATE || EC.UI_STATE || {};
    const dom = ctx.dom || {};

    // Resync sliders/targets after a reset/start (SIM._mvpInitStamp)
    const stampNow = (typeof SIM._mvpInitStamp === 'number') ? SIM._mvpInitStamp : 0;
    if (stampNow !== UI_STATE.lastInitStamp) {
      UI_STATE.lastInitStamp = stampNow;
      const selResync = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : 0;
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
    if (goalLineEl && EC.UI_HUD && typeof EC.UI_HUD.getObjectiveSummaryText === 'function') {
      const raw = String(EC.UI_HUD.getObjectiveSummaryText() || '').replace(/^\s*Goal:\s*/i, '');
      // Do not hard-truncate: the drawer clamps/wraps via CSS so plan steps stay readable.
      goalLineEl.textContent = 'Current: ' + raw;
    }

    // Keep apply validity fresh
    if (typeof MOD._syncDeltaLabels === 'function') MOD._syncDeltaLabels();

    // Mobile-first controls: live energy HUD + inline costs for immediate buttons.
    const E_CAP2 = (typeof T.ENERGY_CAP === 'number') ? T.ENERGY_CAP : ((typeof T.E_MAX === 'number') ? T.E_MAX : 200);
    const energyHudEl2 = dom.energyHudEl || document.getElementById('energyHud');
    if (energyHudEl2) {
      energyHudEl2.textContent = `⚡ ${(SIM.energy || 0).toFixed(0)}/${E_CAP2}`;
    }

    let sel = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : -1;
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
      const A0 = (SIM.wellsA[sel] || 0);
      const c1 = computeApplyPreview(sel, A0, 0);
      const cost1 = (c1 && c1.changed) ? (c1.cost || 0) : 0;
      const costSpinZeroEl2 = dom.costSpinZeroEl || document.getElementById('costSpinZero');
      const costZeroPairEl2 = dom.costZeroPairEl || document.getElementById('costZeroPair');
      if (costSpinZeroEl2) costSpinZeroEl2.textContent = `Cost ${cost1.toFixed(2)}`;

      const c2 = computeZeroPairCost(sel);
      const j = _oppIndex(sel);
      const changedPair = (j != null && j >= 0 && j < 6) && ((Math.abs(SIM.wellsS[sel] || 0) > 1e-9) || (Math.abs(SIM.wellsS[j] || 0) > 1e-9));
      const pairCostRaw = changedPair ? (c2.cost || 0) : 0;
      const pairCost = Math.ceil(pairCostRaw * 100) / 100; // round UP to cents so gating never exceeds display
      if (costZeroPairEl2) costZeroPairEl2.textContent = `Cost ${pairCost.toFixed(2)}`;

      // Gating must match displayed cost exactly.
      if (btnZeroPairEl2) btnZeroPairEl2.disabled = !hasSel || !changedPair || ((SIM.energy || 0) < pairCost);
    }
  };

  MOD.onResize = function onResize() {
    if (typeof EC.resize === 'function') EC.resize();
  };
})();