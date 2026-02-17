/* Emotioncraft — MVP pipeline (Pass 28)
   Extracted MVP systems update ordering from EC.MECH.step(dt).
   No behavior changes.
*/
(function () {
  const EC = (window.EC = window.EC || {});

  EC.PIPE = EC.PIPE || {};

  EC.PIPE.stepMvp = EC.PIPE.stepMvp || function stepMvp(dt) {
    const SIM = EC.SIM;
    const T = EC.TUNE || {};
    const clampV = EC.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));

    // 4.5) Mental Breaks (psyche-based) — may modify psyche and well spins
    (function stageBreaks(_dt) {
      if (SIM._tutNoHazards) return;
      if (EC.BREAK && typeof EC.BREAK.checkBreaks === 'function') {
        EC.BREAK.checkBreaks(_dt);
      }
    })(dt);

    // If a break modal paused the sim, stop the tick immediately.
    if (SIM._breakPaused) return;

    // If a break triggered the lose condition, stop the tick immediately.
    if (SIM.levelState === 'lose' || SIM.mvpLose || SIM.gameOver) {
      return;
    }

    // If a break caused a lose, stop further sim stages this tick.
    if (SIM.levelState === 'lose' || SIM.mvpLose || SIM.gameOver) {
      return;
    }

    // 4.6) Psyche clamp (keeps render/UI stable after break processing)
    (function stageClampPsyche() {
      const PSY_HUE_CAP = (typeof T.PSY_HUE_CAP === 'number') ? T.PSY_HUE_CAP : 500;
      for (let i = 0; i < 6; i++) {
        SIM.psyP[i] = clampV((SIM.psyP[i] || 0), 0, PSY_HUE_CAP);
      }
    })();

    // 4.7) UI-only psyche warning flash triggers (read by renderer via SIM._psyWarnFx)
    // Trigger when a hue crosses into warning thresholds: >450 or <50.
    (function stagePsyWarnFx() {
      const nowMs = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') ? performance.now() : Date.now();
      if (!Array.isArray(SIM._psyWarnFx) || SIM._psyWarnFx.length !== 6) SIM._psyWarnFx = new Array(6).fill(0);
      if (!Array.isArray(SIM._psyWarnPrev) || SIM._psyWarnPrev.length !== 6) {
        SIM._psyWarnPrev = new Array(6);
        for (let i = 0; i < 6; i++) SIM._psyWarnPrev[i] = Math.round(SIM.psyP[i] || 0);
      }
      for (let i = 0; i < 6; i++) {
        const cur = Math.round(SIM.psyP[i] || 0);
        const prev = (typeof SIM._psyWarnPrev[i] === 'number') ? SIM._psyWarnPrev[i] : cur;
        if ((prev <= 450 && cur > 450) || (prev >= 50 && cur < 50)) {
          SIM._psyWarnFx[i] = nowMs;
        }
        SIM._psyWarnPrev[i] = cur;
      }
    })();

    // 5) Level objective evaluation (data-driven; Level 1 / Level 2 supported)
    (function stageObjectives(_dt) {
    // HUE ORDER (index): 0 Red, 1 Purple, 2 Blue, 3 Green, 4 Yellow, 5 Orange
    const L1_TARGET = (typeof T.LEVEL1_PSY_TARGET === 'number') ? T.LEVEL1_PSY_TARGET : 200;
    const L2_TARGET = (typeof T.LEVEL2_PSY_TARGET === 'number') ? T.LEVEL2_PSY_TARGET : 300;

    const lvlDef = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef() : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(SIM.levelId) : null);
    const winDef = (lvlDef && lvlDef.win) ? lvlDef.win : null;

    let didWin = false;

    if (winDef && winDef.type === 'PLAN_CHAIN' && Array.isArray(winDef.steps)) {
      const eps = (typeof T.PAT_SPIN_ZERO_EPS === 'number') ? T.PAT_SPIN_ZERO_EPS : 1.0;
      const psyI = (i) => Math.round(SIM.psyP[i] || 0);
      const FLASH_SEC = (typeof T.PLAN_STEP_FLASH_SEC === 'number') ? T.PLAN_STEP_FLASH_SEC : 0.45;
      if (typeof SIM.planStep !== 'number') SIM.planStep = 0;
      if (typeof SIM.planHoldSec !== 'number') SIM.planHoldSec = 0;
      if (typeof SIM.planAdvanceT !== 'number') SIM.planAdvanceT = 0;
      if (typeof SIM._planStepOk !== 'boolean') SIM._planStepOk = false;
      if (typeof SIM._planHoldReqSec !== 'number') SIM._planHoldReqSec = 0;
      if (typeof SIM._planStepFlashT !== 'number') SIM._planStepFlashT = 0;

      const stepIdx = Math.max(0, Math.min(winDef.steps.length - 1, SIM.planStep));
      const st = winDef.steps[stepIdx];
      const kind = st ? String(st.kind || '').toUpperCase() : '';
      const isSpinZeroStep = (kind === 'SPIN_ZERO');
      const hasHoldOverride = (st && Number.isFinite(st.holdSec) && st.holdSec > 0);
      const holdReq = hasHoldOverride ? st.holdSec : (isSpinZeroStep ? 3 : 10);

      let ok = true;
      if (kind === 'ALL_OVER') {
        const thr = (typeof st.threshold === 'number') ? st.threshold : 0;
        for (let k = 0; k < 6; k++) { if (psyI(k) < thr) { ok = false; break; } }
        SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
        SIM.goalViz.perHue = new Array(6).fill(null).map(() => ({ type: 'OVER', target: thr }));
      } else if (kind === 'SET_BOUNDS') {
        const highs = Array.isArray(st.highs) ? st.highs : [];
        const lows  = Array.isArray(st.lows)  ? st.lows  : [];
        const hiMin = (typeof st.hiMin === 'number') ? st.hiMin : 0;
        const loMax = (typeof st.loMax === 'number') ? st.loMax : 999999;
        const isHigh = (i) => highs.indexOf(i) >= 0;
        const isLow  = (i) => lows.indexOf(i) >= 0;
        for (let k = 0; k < 6; k++) {
          const v = psyI(k);
          if (isHigh(k)) { if (v < hiMin) { ok = false; break; } }
          else if (isLow(k)) { if (v > loMax) { ok = false; break; } }
        }

        // Goal viz reflects the current step.
        SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
        SIM.goalViz.perHue = new Array(6).fill(null).map((_, i) => {
          if (isHigh(i)) return { type: 'OVER', target: hiMin };
          if (isLow(i)) return { type: 'UNDER', target: loMax };
          return null;
        });
      } else if (kind === 'PER_HUE_BOUNDS') {
        const bounds = Array.isArray(st.bounds) ? st.bounds : null;
        ok = true;
        SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
        SIM.goalViz.perHue = new Array(6).fill(null);
        for (let i = 0; i < 6; i++) {
          const b = bounds ? bounds[i] : null;
          const lo = (b && typeof b.low === 'number') ? b.low : null;
          const hi = (b && typeof b.high === 'number') ? b.high : null;
          const v = psyI(i);
          if (lo != null && v < lo) ok = false;
          if (hi != null && v > hi) ok = false;
          if (lo != null && hi != null) SIM.goalViz.perHue[i] = { type: 'BAND', low: lo, high: hi };
          else if (lo != null) SIM.goalViz.perHue[i] = { type: 'OVER', target: lo };
          else if (hi != null) SIM.goalViz.perHue[i] = { type: 'UNDER', target: hi };
          else SIM.goalViz.perHue[i] = null;
        }

      } else if (kind === 'ALL_BAND') {
        const low = (typeof st.low === 'number') ? st.low : 0;
        const high = (typeof st.high === 'number') ? st.high : 999999;
        for (let k = 0; k < 6; k++) {
          const v = psyI(k);
          if (v < low || v > high) { ok = false; break; }
        }
        SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
        SIM.goalViz.perHue = new Array(6).fill(null).map(() => ({ type: 'BAND', low: low, high: high }));
      } else if (kind === 'SPIN_ZERO') {
        for (let k = 0; k < 6; k++) {
          if (Math.abs(SIM.wellsS[k] || 0) > eps) { ok = false; break; }
        }
        // No psyche goal viz for this step.
        SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
        SIM.goalViz.perHue = new Array(6).fill(null);
      }

      // Expose satisfied/hold info for render/UI (countdown + ring)
      SIM._planStepOk = !!ok;
      SIM._planHoldReqSec = holdReq;

      // Canonical hold:
      // - All steps require a satisfied hold for holdReq seconds (defaults: 10s non-spin, 3s SPIN_ZERO),
      //   unless a positive holdSec override is provided on the step.
      // - Reset the hold timer if the condition breaks (except during the brief completion flash).
      // After completion: brief flash, then advance (no extra hidden delay)
      const inFlash = (SIM.planAdvanceT || 0) > 0;
      if (holdReq > 0) {
        // During the brief completion flash, we finish the transition even if the player
        // momentarily breaks the condition.
        if (!ok && !inFlash) {
          SIM.planHoldSec = 0;
          SIM.planAdvanceT = 0;
        } else if (!inFlash) {
          SIM.planHoldSec = (SIM.planHoldSec || 0) + _dt;
          if (SIM.planHoldSec >= holdReq) {
            SIM.planHoldSec = holdReq;
            SIM._planStepFlashT = FLASH_SEC;
            SIM.planAdvanceT = FLASH_SEC;
          }
        } else {
          SIM.planAdvanceT = Math.max(0, (SIM.planAdvanceT || 0) - _dt);
        }
      } else {
        SIM.planHoldSec = 0;
        SIM.planAdvanceT = 0;
      }

      // Completion state: for held steps, once the hold requirement is met we treat the step as complete
      // even if the condition breaks during the brief completion flash.
      const stepHeld = (holdReq <= 0) ? ok : (SIM.planHoldSec >= holdReq);

// Objective completion bookkeeping
      if (!Array.isArray(SIM.objectives) || SIM.objectives.length !== winDef.steps.length) {
        SIM.objectives = winDef.steps.map((_, i) => ({ id: `PLAN_STEP_${i+1}`, text: `Step ${i+1}`, complete: false }));
      }
      for (let i = 0; i < winDef.steps.length; i++) {
        if (!SIM.objectives[i]) continue;
        if (i < SIM.planStep) SIM.objectives[i].complete = true;
        else if (i === SIM.planStep) {
          // Mark current step complete once the canonical hold is met (SPIN_ZERO is held too; default 3s).
          SIM.objectives[i].complete = stepHeld;
        }
        else SIM.objectives[i].complete = false;
      }

      // Advance:
      // - SPIN_ZERO: advance as soon as its hold requirement is met.
      // - others: advance after the hold is met and the brief flash window completes.
      const flashLeft = (typeof SIM._planStepFlashT === 'number') ? SIM._planStepFlashT : 0;
      if ((isSpinZeroStep && stepHeld) || (!isSpinZeroStep && stepHeld && (SIM.planAdvanceT <= 0) && (flashLeft <= 0))) {
        SIM.planStep += 1;
        SIM.planHoldSec = 0;
        SIM.planAdvanceT = 0;
      }

      didWin = (SIM.planStep >= winDef.steps.length);
    } else if (winDef && winDef.type === 'ZEN_CHAIN' && Array.isArray(winDef.steps)) {
      // 3-step Zen chain: advance when each condition is held.
      const POST_HOLD_REQ = (typeof T.PLAN_POST_STEP_HOLD_SEC === 'number') ? T.PLAN_POST_STEP_HOLD_SEC : 10;
      if (typeof SIM.zenChainStep !== 'number') SIM.zenChainStep = 0;
      if (typeof SIM.zenChainHoldSec !== 'number') SIM.zenChainHoldSec = 0;
      if (typeof SIM.zenPostHoldActive !== 'boolean') SIM.zenPostHoldActive = false;
      if (typeof SIM.zenPostHoldRemaining !== 'number') SIM.zenPostHoldRemaining = 0;

      const stepIdx = Math.max(0, Math.min(winDef.steps.length - 1, SIM.zenChainStep));
      const st = winDef.steps[stepIdx];
      const holdReq = (typeof st.holdSec === 'number') ? st.holdSec : 10;

      let ok = true;
      if (st.kind === 'ALL_OVER') {
        const thr = (typeof st.threshold === 'number') ? st.threshold : 200;
        for (let k = 0; k < 6; k++) { if ((SIM.psyP[k] || 0) < thr) { ok = false; break; } }

        // Goal viz for HUD/overlay (numeric targets). Updated live per-step.
        SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
        SIM.goalViz.perHue = new Array(6).fill(null).map(() => ({ type: 'OVER', target: thr }));
      } else if (st.kind === 'ALL_BAND') {
        const low = (typeof st.low === 'number') ? st.low : 100;
        const high = (typeof st.high === 'number') ? st.high : 120;
        for (let k = 0; k < 6; k++) {
          const v = (SIM.psyP[k] || 0);
          if (v < low || v > high) { ok = false; break; }
        }

        // Goal viz for HUD/overlay (numeric targets). Updated live per-step.
        SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
        SIM.goalViz.perHue = new Array(6).fill(null).map(() => ({ type: 'BAND', low: low, high: high }));
      }

      SIM.zenChainHoldSec = ok ? (SIM.zenChainHoldSec + _dt) : 0;

      // NEW: post-step confirmation hold (does NOT advance step index).
      const stepHeld = ok && (SIM.zenChainHoldSec >= holdReq);
      if (!stepHeld) {
        SIM.zenPostHoldActive = false;
        SIM.zenPostHoldRemaining = 0;
      } else {
        if (!SIM.zenPostHoldActive) {
          SIM.zenPostHoldActive = true;
          SIM.zenPostHoldRemaining = POST_HOLD_REQ;
        } else {
          SIM.zenPostHoldRemaining = Math.max(0, (SIM.zenPostHoldRemaining || 0) - _dt);
        }
      }

      // Objective completion bookkeeping (side panel)
      if (!Array.isArray(SIM.objectives) || SIM.objectives.length !== winDef.steps.length) {
        // Fallback: core_model normally sets these; keep safe.
        SIM.objectives = winDef.steps.map((_, i) => ({ id: `ZEN_STEP_${i+1}`, text: `Zen Step ${i+1}`, complete: false }));
      }
      for (let i = 0; i < winDef.steps.length; i++) {
        if (!SIM.objectives[i]) continue;
        if (i < SIM.zenChainStep) SIM.objectives[i].complete = true;
        else if (i === SIM.zenChainStep) {
          SIM.objectives[i].complete = stepHeld && SIM.zenPostHoldActive && (SIM.zenPostHoldRemaining <= 0);
        } else SIM.objectives[i].complete = false;
      }

      if (stepHeld && SIM.zenPostHoldActive && (SIM.zenPostHoldRemaining <= 0)) {
        SIM.zenChainStep += 1;
        SIM.zenChainHoldSec = 0;
        SIM.zenPostHoldActive = false;
        SIM.zenPostHoldRemaining = 0;
      }

      didWin = (SIM.zenChainStep >= winDef.steps.length);
    } else if (winDef && winDef.type === 'WEEKLY_HOLD' && Array.isArray(winDef.focusHues)) {
      const POST_HOLD_REQ = (typeof T.PLAN_POST_STEP_HOLD_SEC === 'number') ? T.PLAN_POST_STEP_HOLD_SEC : 10;
      const hi = (typeof winDef.focusHi === 'number') ? winDef.focusHi : 300;
      const lo = (typeof winDef.otherLo === 'number') ? winDef.otherLo : 150;
      const holdReq = (typeof winDef.holdSec === 'number') ? winDef.holdSec : 10;
      const focus = winDef.focusHues.slice(0, 2);
      const isFocus = (i) => (i === focus[0] || i === focus[1]);

      let ok = true;
      for (let k = 0; k < 6; k++) {
        const v = (SIM.psyP[k] || 0);
        if (isFocus(k)) {
          if (v < hi) { ok = false; break; }
        } else {
          if (v > lo) { ok = false; break; }
        }
      }
      if (typeof SIM.weeklyHoldSec !== 'number') SIM.weeklyHoldSec = 0;
      if (typeof SIM.weeklyPostHoldActive !== 'boolean') SIM.weeklyPostHoldActive = false;
      if (typeof SIM.weeklyPostHoldRemaining !== 'number') SIM.weeklyPostHoldRemaining = 0;
      SIM.weeklyHoldSec = ok ? (SIM.weeklyHoldSec + _dt) : 0;

      const stepHeld = ok && (SIM.weeklyHoldSec >= holdReq);
      if (!stepHeld) {
        SIM.weeklyPostHoldActive = false;
        SIM.weeklyPostHoldRemaining = 0;
      } else {
        if (!SIM.weeklyPostHoldActive) {
          SIM.weeklyPostHoldActive = true;
          SIM.weeklyPostHoldRemaining = POST_HOLD_REQ;
        } else {
          SIM.weeklyPostHoldRemaining = Math.max(0, (SIM.weeklyPostHoldRemaining || 0) - _dt);
        }
      }

      if (!Array.isArray(SIM.objectives) || SIM.objectives.length < 1) {
        SIM.objectives = [{ id: 'WEEKLY', text: 'Weekly', complete: false }];
      }
      if (SIM.objectives[0]) SIM.objectives[0].complete = stepHeld && SIM.weeklyPostHoldActive && (SIM.weeklyPostHoldRemaining <= 0);

      didWin = stepHeld && SIM.weeklyPostHoldActive && (SIM.weeklyPostHoldRemaining <= 0);
    } else if (winDef && winDef.type === 'ALL_BAND_HOLD') {
      const POST_HOLD_REQ = (typeof T.PLAN_POST_STEP_HOLD_SEC === 'number') ? T.PLAN_POST_STEP_HOLD_SEC : 10;
      const low = (typeof winDef.low === 'number') ? winDef.low : ((typeof T.ZEN_LOW === 'number') ? T.ZEN_LOW : 100);
      const high = (typeof winDef.high === 'number') ? winDef.high : ((typeof T.ZEN_HIGH === 'number') ? T.ZEN_HIGH : 120);
      const holdReq = (typeof winDef.holdSec === 'number') ? winDef.holdSec : ((typeof T.ZEN_HOLD_SECONDS === 'number') ? T.ZEN_HOLD_SECONDS : 10);

      let bandOk = true;
      for (let k = 0; k < 6; k++) {
        const v = (SIM.psyP[k] || 0);
        if (v < low || v > high) { bandOk = false; break; }
      }

      if (typeof SIM.zenHoldSec !== 'number') SIM.zenHoldSec = 0;
      if (typeof SIM.zenPostHoldActive !== 'boolean') SIM.zenPostHoldActive = false;
      if (typeof SIM.zenPostHoldRemaining !== 'number') SIM.zenPostHoldRemaining = 0;
      SIM.zenHoldSec = bandOk ? (SIM.zenHoldSec + _dt) : 0;

      const stepHeld = bandOk && (SIM.zenHoldSec >= holdReq);
      if (!stepHeld) {
        SIM.zenPostHoldActive = false;
        SIM.zenPostHoldRemaining = 0;
      } else {
        if (!SIM.zenPostHoldActive) {
          SIM.zenPostHoldActive = true;
          SIM.zenPostHoldRemaining = POST_HOLD_REQ;
        } else {
          SIM.zenPostHoldRemaining = Math.max(0, (SIM.zenPostHoldRemaining || 0) - _dt);
        }
      }

      // Minimal objective tracking
      if (!Array.isArray(SIM.objectives) || SIM.objectives.length < 1 || (SIM.objectives[0] && SIM.objectives[0].id !== 'L3_ZEN')) {
        SIM.objectives = [{ id: 'L3_ZEN', text: `Zen: keep all hues ${low}–${high} for ${holdReq}s`, complete: false }];
      }
      if (SIM.objectives[0]) SIM.objectives[0].complete = stepHeld && SIM.zenPostHoldActive && (SIM.zenPostHoldRemaining <= 0);

      didWin = stepHeld && SIM.zenPostHoldActive && (SIM.zenPostHoldRemaining <= 0);
    } else if (winDef && winDef.type === 'SOME_OVER' && Array.isArray(winDef.hues)) {
      const thr = (typeof winDef.threshold === 'number') ? winDef.threshold : L2_TARGET;

      // Ensure objectives array is present (used by objective panel and future systems)
      if (!Array.isArray(SIM.objectives) || SIM.objectives.length !== winDef.hues.length) {
        SIM.objectives = winDef.hues.map((h) => ({
          id: `L${SIM.levelId}_H${h}_${thr}`,
          text: `Hue ${h} ≥ ${thr}`,
          complete: false,
          hue: h,
          type: 'OVER',
          target: thr
        }));
      }

      didWin = true;
      for (let n = 0; n < winDef.hues.length; n++) {
        const h = winDef.hues[n];
        const ok = ((SIM.psyP[h] || 0) >= thr);
        if (SIM.objectives[n]) SIM.objectives[n].complete = ok;
        if (!ok) didWin = false;
      }
    } else {
      const thr = (winDef && winDef.type === 'ALL_OVER' && (typeof winDef.threshold === 'number')) ? winDef.threshold : L1_TARGET;

      let allOk = true;
      for (let k = 0; k < 6; k++) {
        if ((SIM.psyP[k] || 0) < thr) { allOk = false; break; }
      }

      // Maintain the single-objective behavior for Level 1
      if (!Array.isArray(SIM.objectives) || SIM.objectives.length < 1) {
        SIM.objectives = [{ id: 'L1_ALL_PSY', text: `Raise ALL psyche colors to ≥ ${thr}`, complete: false }];
      }
      SIM.objectives[0].complete = allOk;

      didWin = allOk;
    }

    if (SIM.levelState === 'playing' && didWin) {
      SIM.levelState = 'win';
    }
    SIM.mvpWin = (SIM.levelState === 'win');
    })(dt);

  };

  try {
    if (EC._registerModule) EC._registerModule('core_pipeline_mvp', { provides: ['EC.PIPE.stepMvp'] });
  } catch (_) {}
})();
