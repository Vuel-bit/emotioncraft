/* Emotioncraft — core mechanics (Step 4 split)
   Contains game-truth logic: breaks, instability.
   No behavior changes: moved from main.js.
*/
(function () {
  const EC = (window.EC = window.EC || {});
// -----------------------------
// Simulation state (moved from main.js in Step 6)
// -----------------------------
const SIM = (EC.SIM = EC.SIM || {
  wells: [],
  selectedWellId: null,
instability: 0,
  runSeconds: 0,
  winProgress: 0,
  loseProgress: 0,
  failed: false,
  won: false,
  lastEvent: null,
  layoutBaseR: 110,
  wellSize: { minR: 72, maxR: 132 },
  stats: {},
});


  // ---------------------------------------------------------------------------
  // Redesign MVP mechanics (Chunk 2)
  // Authoritative per-tick update for the Psyche + 6 Wells model.
  // Runs alongside the legacy prototype until later chunks replace rendering/UI.
  // ---------------------------------------------------------------------------
  EC.MECH = EC.MECH || {};

  // MVP pipeline (inlined from pipeline module in Pass 31)
  function stepMvpPipeline(dt) {
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
  }


  EC.MECH.step = EC.MECH.step || function stepMVP(dt) {
    const T = EC.TUNE || {};

    // dt safety against tab lag / spikes
    dt = Math.min(Math.max(dt || 0, 0), 0.05);
    if (dt <= 0) return;

    // Shared timebase for rendering (e.g., moving spin arrows)
    // Freeze the simulation on end states (lose/win) and in Lobby; UI continues to render.
    if (SIM.levelState === 'lose' || SIM.mvpLose || SIM.gameOver || SIM.levelState === 'win' || SIM.mvpWin) {
      return;
    }

    // Lobby: game renders/UI stays active, but simulation does not advance.
    if (SIM.inLobby) {
      return;
    }

    // UI overlay pause (e.g., Log overlay).
    if (SIM._uiPaused) {
      return;
    }

    // Hit-stop (short freeze used for mental breaks).
    if (SIM._hitStopT > 0) {
      SIM._hitStopT = Math.max(0, (SIM._hitStopT || 0) - dt);
      return;
    }

    // Break modal pause: freeze simulation until player acknowledges.
    if (SIM._breakPaused) {
      return;
    }

    // Stable tick id for single-break-per-tick guards (used by EC.BREAK)
    SIM._tickId = (typeof SIM._tickId === 'number') ? (SIM._tickId + 1) : 1;

    SIM.mvpTime = (SIM.mvpTime || 0) + dt;

    // Tutorial stepper (no patient / no save). Update early so HUD reads the new objective text this frame.
    try {
      if (EC.TUT && typeof EC.TUT.update === 'function' && SIM.tutorialActive) {
        EC.TUT.update(dt);
      }
    } catch (_) {}

    // UI-only plan step flash timer (set when a hold completes)
    if (typeof SIM._planStepFlashT === 'number' && SIM._planStepFlashT > 0) {
      SIM._planStepFlashT = Math.max(0, SIM._planStepFlashT - dt);
    }

    // Timed patient runs (ZEN / TRANQUILITY / TRANSCENDENCE). Uses SIM.zenTimeRemainingSec.
    const _pk = String(SIM._activePlanKey || '').toUpperCase();
    const _isTimed = (_pk === 'ZEN' || _pk === 'TRANQUILITY' || _pk === 'TRANSCENDENCE');
    if (_isTimed) {
      const LIMIT_BASE = (typeof T.ZEN_TIME_LIMIT_SEC === 'number') ? T.ZEN_TIME_LIMIT_SEC : (12 * 60);
      let LIMIT = LIMIT_BASE;
      try {
        if (EC.TRAITS && typeof EC.TRAITS.getTimedPlanLimitSec === 'function') {
          LIMIT = EC.TRAITS.getTimedPlanLimitSec(SIM, LIMIT_BASE);
        }
      } catch (_) {}

      if (typeof SIM.zenTimeRemainingSec !== 'number' || !isFinite(SIM.zenTimeRemainingSec)) {
        SIM.zenTimeRemainingSec = LIMIT;
      }

      // Safety clamp: grounded must never show > 10:00 due to stale values.
      if (typeof SIM.zenTimeRemainingSec === 'number' && isFinite(SIM.zenTimeRemainingSec) && SIM.zenTimeRemainingSec > LIMIT) {
        SIM.zenTimeRemainingSec = LIMIT;
      }
      SIM.zenTimeRemainingSec = Math.max(0, SIM.zenTimeRemainingSec - dt);
      if (SIM.zenTimeRemainingSec <= 0) {
        SIM.mvpLose = true;
        SIM.levelState = 'lose';
        SIM.gameOver = true;
        SIM.gameOverReason = 'Time expired.';
        return;
      }
    }


    // Ensure required arrays exist
    if (!SIM.wellsA || SIM.wellsA.length !== 6) SIM.wellsA = new Array(6).fill(50);
    if (!SIM.wellsS || SIM.wellsS.length !== 6) SIM.wellsS = new Array(6).fill(0);
    if (!SIM.psyP || SIM.psyP.length !== 6) SIM.psyP = new Array(6).fill(100);

    // Debug-only invariants (warn-only; never crashes in normal mode)
    if (EC.assert) {
      EC.assert(Array.isArray(SIM.wellsA) && SIM.wellsA.length === 6, 'SIM.wellsA must be length 6');
      EC.assert(Array.isArray(SIM.wellsS) && SIM.wellsS.length === 6, 'SIM.wellsS must be length 6');
      EC.assert(Array.isArray(SIM.psyP) && SIM.psyP.length === 6, 'SIM.psyP must be length 6');
      EC.assert(dt >= 0 && dt <= 0.05, 'dt clamp out of bounds');
    }

    // Testing mode: do NOT freeze the sim on win.
    // (We still track hold/error for visibility, but the loop keeps running.)

    // 1) Energy regen (constant)
    const E_CAP = (typeof T.ENERGY_CAP === "number") ? T.ENERGY_CAP : ((typeof T.E_MAX === "number") ? T.E_MAX : 200);
    const REGEN = (typeof T.ENERGY_REGEN_PER_SEC === "number") ? T.ENERGY_REGEN_PER_SEC : 1.0;
    if (typeof SIM.energy !== "number") SIM.energy = (typeof T.ENERGY_START === "number") ? T.ENERGY_START : 10;

    SIM.energyRegenPerSec = REGEN;
    SIM.energy = Math.min(E_CAP, (SIM.energy || 0) + REGEN * dt);

// Optional Auto-Test (Chunk 3): apply gentle nudges when enabled (T)
    if (SIM.autoTest) {
      for (let i = 0; i < 6; i++) {
        // small random nudge in the standardized spin units (-100..100)
        const n = (Math.random() - 0.5) * 10;
        SIM.wellsS[i] = (SIM.wellsS[i] || 0) + n * dt;
      }
    }

    // ---------------------------------------------------------------------
    // New MVP model (Chunk: Flux/Impulse/Equalization)
    // - No continuous neighbor spin cascade.
    // - Psyche fill is driven by Flux = amount * spin.
    // - Per-second psyche delta: (Flux / 1000).
    // - Separate capped overflow equalization (adjacent) for amount and spin.
    // ---------------------------------------------------------------------

    const A_MIN = (typeof T.A_MIN === 'number') ? T.A_MIN : 25;
    const A_MAX = (typeof T.A_MAX === 'number') ? T.A_MAX : 100;
    const S_MIN = (typeof T.S_MIN === 'number') ? T.S_MIN : -100;
    const S_MAX = (typeof T.S_MAX === 'number') ? T.S_MAX : 100;
    const A_RATE = (typeof T.A_XFER_RATE === 'number') ? T.A_XFER_RATE : T.A_RATE; // units/sec
    const S_RATE = (typeof T.S_XFER_RATE === 'number') ? T.S_XFER_RATE : T.S_RATE; // units/sec

    // For minimal debug visibility
    let spillActive = false;
    let spillATotal = 0;
    let spillSTotal = 0;
    let spillMsgs = [];

    
    // Dispositions (v2): apply well-only external waves (never modify psyche directly)
    (function stageDispositions(_dt) {
      if (EC.DISP && typeof EC.DISP.update === 'function') {
        EC.DISP.update(_dt);
      }
    })(dt);

    // 2) Overflow/Underflow Equalization (Spillover) — PURE OVERFLOW (authoritative)
    // Spillover uses RAW post-step values vs caps (no flux/psy adjustments).
    // Amount overflow/underflow transfers raw amount; Spin overflow/underflow transfers raw spin.
    const clampV = EC.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));

    // 2) Overflow/Underflow Equalization (Spillover) — PURE OVERFLOW (authoritative)
    // Tutorial safety: when SIM._tutNoHazards is set, spillover is disabled (no redistribution).
    if (SIM._tutNoHazards) {
      // Clamp only (no neighbor transfers, no spill/jam detection).
      try {
        if (SIM.wellsA) {
          for (let i = 0; i < 6; i++) SIM.wellsA[i] = clampV(Number(SIM.wellsA[i] || 0), A_MIN, A_MAX);
        }
        if (SIM.wellsS) {
          for (let i = 0; i < 6; i++) SIM.wellsS[i] = clampV(Number(SIM.wellsS[i] || 0), S_MIN, S_MAX);
        }
      } catch (_) {}
      spillActive = false;
      spillATotal = 0;
      spillSTotal = 0;
      spillMsgs = [];
      // Spillover debug flags (kept consistent)
      SIM._spillActive = false;
      SIM._spillA = 0;
      SIM._spillS = 0;
      SIM._spillMsg = '';
    } else (function stageSpillover(_dt) {
      // For minimal debug visibility
      spillActive = false;
      spillATotal = 0;
      spillSTotal = 0;
      spillMsgs = [];

      // -------------------------------------------------------------------
      // Spillover routing (v0.2.2): guaranteed outward propagation
      // - Compute PURE overflow vs clamps (no flux/psy adjustments).
      // - Prefer open side: if one neighbor is blocked and the other isn't,
      //   send 100% of spill to the open side (even if it creates overflow).
      // - If both neighbors blocked, force spill into secondaries anyway;
      //   iterative propagation pushes excess outward until capacity exists.
      // -------------------------------------------------------------------
      function propagateScalar(arr, vMin, vMax, ratePerSec, dtLocal, kindChar) {
        const EPS = 1e-6;
        const MAX_ITERS = 96;
        let hitMax = false;
        let didPos = false;
        let didNeg = false;

        for (let iter = 0; iter < MAX_ITERS; iter++) {
          let movedThisIter = 0;

          for (let i = 0; i < 6; i++) {
            const v = (arr[i] || 0);
            const vC = clampV(v, vMin, vMax);
            const over = v - vC; // + overflow above max, - underflow below min
            if (Math.abs(over) <= EPS) continue;

            const sign = (over > 0) ? 1 : -1;
            const mag = Math.min(Math.abs(over), ratePerSec * dtLocal);
            if (mag <= 0) continue;

            const L = (i + 5) % 6;
            const R = (i + 1) % 6;

            const vL = (arr[L] || 0);
            const vR = (arr[R] || 0);
            const vLC = clampV(vL, vMin, vMax);
            const vRC = clampV(vR, vMin, vMax);

            const blockedL = (sign > 0) ? (vLC >= vMax - EPS) : (vLC <= vMin + EPS);
            const blockedR = (sign > 0) ? (vRC >= vMax - EPS) : (vRC <= vMin + EPS);

            let wL = 0, wR = 0;
            if (!blockedL && blockedR) {
              // all spill to open side
              wL = 1; wR = 0;
            } else if (blockedL && !blockedR) {
              wL = 0; wR = 1;
            } else if (!blockedL && !blockedR) {
              // both open: split proportional to capacity in the relevant direction
              const capL = (sign > 0) ? Math.max(0, vMax - vLC) : Math.max(0, vLC - vMin);
              const capR = (sign > 0) ? Math.max(0, vMax - vRC) : Math.max(0, vRC - vMin);
              const capT = capL + capR;
              if (capT > EPS) {
                wL = capL / capT;
                wR = capR / capT;
              } else {
                // should be rare; treat as blocked
                wL = 0.5; wR = 0.5;
              }
            } else {
              // both blocked: force propagation (create overflow in secondaries)
              wL = 0.5; wR = 0.5;
            }

            const giveL = mag * wL;
            const giveR = mag * wR;
            const given = giveL + giveR;
            if (given <= EPS) continue;

            if (sign > 0) didPos = true;
            else didNeg = true;

            // Apply raw transfer (may create overflow in neighbors; that's desired)
            arr[i] = (arr[i] || 0) - sign * given;
            arr[L] = (arr[L] || 0) + sign * giveL;
            arr[R] = (arr[R] || 0) + sign * giveR;

            movedThisIter += given;

            // Light debug breadcrumbs (cap spam)
            if (spillMsgs.length < 6) {
              if (kindChar === 'A') {
                spillMsgs.push(sign > 0
                  ? `Spill A+: ${i}->${L} ${giveL.toFixed(1)}, ${i}->${R} ${giveR.toFixed(1)}`
                  : `Spill A-: ${i}<-${L} ${giveL.toFixed(1)}, ${i}<-${R} ${giveR.toFixed(1)}`
                );
              } else {
                spillMsgs.push(sign > 0
                  ? `Spill S+: ${i}->${L} ${giveL.toFixed(1)}, ${i}->${R} ${giveR.toFixed(1)}`
                  : `Spill S-: ${i}->${L} -${giveL.toFixed(1)}, ${i}->${R} -${giveR.toFixed(1)}`
                );
              }
            }
          }

          if (movedThisIter > EPS) {
            spillActive = true;
            if (kindChar === 'A') spillATotal += movedThisIter;
            else spillSTotal += movedThisIter;
          }

          // Converged: no overflow transfers remain within cap constraints
          if (movedThisIter <= EPS) break;

          if (iter === MAX_ITERS - 1) hitMax = true;
        }

        // Report any unresolved overflow after propagation passes.
        // A jam is defined by non-trivial overflow/underflow that could not be
        // eliminated by propagation (typically full-ring saturation).
        let posMax = 0, posIdx = -1;
        let negMax = 0, negIdx = -1;
        // NEW (v0.2.6): totals so distributed overflow/underflow still jams.
        // posSum: sum of positive overflow above max across all wells.
        // negSum: sum of negative underflow below min across all wells (as positive magnitude).
        let posSum = 0;
        let negSum = 0;
        for (let i = 0; i < 6; i++) {
          const v = (arr[i] || 0);
          const vC = clampV(v, vMin, vMax);
          const over = v - vC;
          if (over > posMax) { posMax = over; posIdx = i; }
          if (over < negMax) { negMax = over; negIdx = i; }
          if (over > 0) posSum += over;
          else if (over < 0) negSum += -over;
        }
        return { hitMaxIters: hitMax, posMax, posIdx, negMax, negIdx, posSum, negSum, didPos, didNeg };
      }

      // PASS 1 (Amount)
      const aRes = propagateScalar(SIM.wellsA, A_MIN, A_MAX, A_RATE, dt, 'A');

      // PASS 2 (Spin)
      const sRes = propagateScalar(SIM.wellsS, S_MIN, S_MAX, S_RATE, dt, 'S');

      // First-time informational popups for spill events (normal gameplay only).
      try {
        if (!SIM._tutNoHazards && EC.BREAK && typeof EC.BREAK.showInfoOnce === 'function') {
          const wellName = (idx) => {
            try {
              if (typeof EC.wellLabel === 'function') return EC.wellLabel(idx);
              if (typeof EC.hueLabel === 'function') return EC.hueLabel(idx);
            } catch (_) {}
            return 'Hue ' + idx;
          };

          if (aRes && aRes.didPos) {
            const wi = (typeof aRes.posIdx === 'number') ? aRes.posIdx : 0;
            EC.BREAK.showInfoOnce('spill_amount_up', 'Spill: Amount Overflow', [
              `The ${wellName(wi)} well is being pushed over ${A_MAX}. The excess is spilling into neighboring wells.`
            ]);
          }
          if (!SIM._breakPaused && aRes && aRes.didNeg) {
            const wi = (typeof aRes.negIdx === 'number') ? aRes.negIdx : 0;
            EC.BREAK.showInfoOnce('spill_amount_down', 'Spill: Amount Underflow', [
              `The ${wellName(wi)} well is being pulled below ${A_MIN}. The deficit is pulling from neighboring wells.`
            ]);
          }
          if (!SIM._breakPaused && sRes && sRes.didPos) {
            const wi = (typeof sRes.posIdx === 'number') ? sRes.posIdx : 0;
            EC.BREAK.showInfoOnce('spill_spin_up', 'Spill: Spin Overflow', [
              `The ${wellName(wi)} well is being pushed over +${S_MAX}. The excess spin is spilling into neighboring wells.`
            ]);
          }
          if (!SIM._breakPaused && sRes && sRes.didNeg) {
            const wi = (typeof sRes.negIdx === 'number') ? sRes.negIdx : 0;
            EC.BREAK.showInfoOnce('spill_spin_down', 'Spill: Spin Underflow', [
              `The ${wellName(wi)} well is being pulled under ${S_MIN}. The deficit is pulling spin from neighboring wells.`
            ]);
          }
        }
      } catch (_) {}  // Pause immediately if a first-time spill popup fired.
      if (SIM._breakPaused) return;

      // Debug-only spill summary (helps tune jam thresholds)
      // Enabled only when EC.UI_STATE.debugOn === true; throttled to avoid spam.
      try {
        const st = EC.UI_STATE || {};
        if (st.debugOn) {
          const nowMs = Date.now();
          const last = st._spillDbgLastMs || 0;
          if (nowMs - last >= 250) {
            st._spillDbgLastMs = nowMs;
            console.log('[EC][SPILL]',
              'A+Σ=' + aRes.posSum.toFixed(3),
              'A-Σ=' + aRes.negSum.toFixed(3),
              'S+Σ=' + sRes.posSum.toFixed(3),
              'S-Σ=' + sRes.negSum.toFixed(3)
            );
          }
        }
      } catch (_) { /* ignore */ }

      // Jam detection (v0.2.5): if propagation cannot resolve overflow/underflow,
      // trigger a jam mental break. Uses actual unresolved overflow, not heuristics.
      const JAM_SUM_EPS = (T.SPILL_JAM_SUM_EPS != null) ? T.SPILL_JAM_SUM_EPS
        : ((T.SPILL_JAM_EPS != null) ? T.SPILL_JAM_EPS : 0.05);
      let jam = null;
      // Choose the dominant unresolved overflow across A/S.
      const cand = [];
      // Trigger based on TOTAL unresolved overflow/underflow, not just max single-well.
      // Spin jam may only happen when the full ring is saturated at the limit (no capacity anywhere).
      const SPIN_SAT_EPS = 1e-6;
      let spinAllMax = true;
      let spinAllMin = true;
      for (let i = 0; i < 6; i++) {
        const sC = clampV((SIM.wellsS[i] || 0), S_MIN, S_MAX);
        if (sC < (S_MAX - SPIN_SAT_EPS)) spinAllMax = false;
        if (sC > (S_MIN + SPIN_SAT_EPS)) spinAllMin = false;
      }
      if (aRes.posSum > JAM_SUM_EPS) cand.push({ cause: 'AMOUNT_HIGH_JAM', mag: aRes.posSum, idx: aRes.posIdx });
      if (aRes.negSum > JAM_SUM_EPS) cand.push({ cause: 'AMOUNT_LOW_JAM', mag: aRes.negSum, idx: aRes.negIdx });
      if (sRes.posSum > JAM_SUM_EPS && spinAllMax) cand.push({ cause: 'SPIN_MAX_JAM', mag: sRes.posSum, idx: sRes.posIdx });
      if (sRes.negSum > JAM_SUM_EPS && spinAllMin) cand.push({ cause: 'SPIN_MIN_JAM', mag: sRes.negSum, idx: sRes.negIdx });
      if (cand.length) {
        cand.sort((a, b) => b.mag - a.mag);
        jam = cand[0];
      }

      if (jam && EC.BREAK && typeof EC.BREAK.triggerJam === 'function') {
        // Trigger jam break (relief + redirect + penalties for jam types).
        const firstCause = jam.cause;
        EC.BREAK.triggerJam(firstCause, { index: jam.idx, magnitude: jam.mag });

        // After relief/redirect, re-run propagation so redirects can overshoot and
        // still move outward via the refined spill rules (same tick).
        const aRes2 = propagateScalar(SIM.wellsA, A_MIN, A_MAX, A_RATE, dt, 'A');
        const sRes2 = propagateScalar(SIM.wellsS, S_MIN, S_MAX, S_RATE, dt, 'S');

        // Jam cascade (spin jam → amount jam):
        // If a SPIN_*_JAM redirect creates unavoidable amount overflow/underflow
        // that spillover cannot resolve, trigger the corresponding AMOUNT_*_JAM
        // BEFORE the final clamp would hide it.
        if (firstCause === 'SPIN_MAX_JAM' && aRes2 && aRes2.posSum > JAM_SUM_EPS) {
          EC.BREAK.triggerJam('AMOUNT_HIGH_JAM', { index: aRes2.posIdx, magnitude: aRes2.posSum });
          propagateScalar(SIM.wellsA, A_MIN, A_MAX, A_RATE, dt, 'A');
          propagateScalar(SIM.wellsS, S_MIN, S_MAX, S_RATE, dt, 'S');
        } else if (firstCause === 'SPIN_MIN_JAM' && aRes2 && aRes2.negSum > JAM_SUM_EPS) {
          EC.BREAK.triggerJam('AMOUNT_LOW_JAM', { index: aRes2.negIdx, magnitude: aRes2.negSum });
          propagateScalar(SIM.wellsA, A_MIN, A_MAX, A_RATE, dt, 'A');
          propagateScalar(SIM.wellsS, S_MIN, S_MAX, S_RATE, dt, 'S');
        }
      }

      // Spillover debug flags
      SIM._spillActive = spillActive;
      SIM._spillA = spillATotal;
      SIM._spillS = spillSTotal;
      SIM._spillMsg = (spillMsgs && spillMsgs.length) ? spillMsgs.slice(0, 3).join(' | ') : '';
    })(dt);

    // If a spill popup paused the sim, stop the tick immediately.
    if (SIM._breakPaused) return;

    // 3) Final clamp AFTER spillover (authoritative ordering)
    // Dispositions + impulses may temporarily overshoot caps; spillover resolves
    // pure overflow/underflow first, then we clamp the stored sim values.
    (function stageClamp() {
      for (let i = 0; i < 6; i++) {
        SIM.wellsA[i] = clampV((SIM.wellsA[i] || 0), A_MIN, A_MAX);
        SIM.wellsS[i] = clampV((SIM.wellsS[i] || 0), S_MIN, S_MAX);
      }
    })();

    // 4) Well → Psyche drive (Flux-normalized)
    // IMPORTANT: do not clamp psyche inside drive. Mental Breaks
    // need to observe out-of-bounds values (<0 / >cap / total>cap).
    (function stageDrivePsyche(_dt) {
      const PSY_NORM = (typeof T.PSY_FLUX_NORM === 'number') ? T.PSY_FLUX_NORM : 1000;
      for (let i = 0; i < 6; i++) {
        const A = Math.max(A_MIN, Math.min(A_MAX, (SIM.wellsA[i] || 0)));
        const S = Math.max(S_MIN, Math.min(S_MAX, (SIM.wellsS[i] || 0)));
        const flux = A * S;
        SIM.psyP[i] = (SIM.psyP[i] || 0) + (flux / PSY_NORM) * _dt;
      }
    })(dt);

    // MVP pipeline (systems ordering inlined)
    stepMvpPipeline(dt);

  };

  
// -----------------------------
// -----------------------------
// Main sim tick (moved from main.js in Step 6)
// -----------------------------
// -----------------------------
// Sim-only tick (MECH step). Returns safeDt when active; null when inactive.
// -----------------------------
EC.tickEngine = function tickEngine(delta) {
  const SIM = EC.SIM;
  const dt = (delta || 0) / 60;

  // MVP-only runtime: if not in MVP sim mode, tick is a no-op.
  if (!(SIM && SIM.wellsA && Array.isArray(SIM.wellsA) && SIM.wellsA.length === 6)) return null;

  const safeDt = Math.min(dt, 0.05);
  if (EC.MECH && EC.MECH.step) EC.MECH.step(safeDt);
  return safeDt;
};

// -----------------------------
// Presentation tick (views/UI). Consumes safeDt computed by tickEngine.
// -----------------------------
EC.tickUI = function tickUI(safeDt) {
  if (!(typeof safeDt === 'number' && isFinite(safeDt) && safeDt > 0)) return;
  if (EC.updatePsycheView) EC.updatePsycheView();
  if (EC.updateMvpBoardView) EC.updateMvpBoardView();
  if (EC.updateUI) EC.updateUI(safeDt);
};

// -----------------------------
// Compatibility wrapper: EC.tick(delta) -> tickEngine + tickUI
// -----------------------------
EC.tick = function tick(delta) {
  const safeDt = (typeof EC.tickEngine === 'function') ? EC.tickEngine(delta) : null;
  if (safeDt != null && typeof EC.tickUI === 'function') EC.tickUI(safeDt);
};


// -----------------------------
// Init hook (moved from main.js in Step 6)
// -----------------------------
EC.init = function init() {
  // UI must initialize first so it can wire handlers and expose fail/win helpers.
  if (EC.initUI) EC.initUI();
  if (EC.resetRun) EC.resetRun();
};


  // Helper: force-end all break telegraphs/active state (safe no-op if absent).
  EC.endAllMentalBreaks = function endAllMentalBreaks() {
    const sim = EC.SIM || {};
    try {
      if (Array.isArray(sim.wells)) {
        for (let i = 0; i < sim.wells.length; i++) {
          const w = sim.wells[i];
          if (!w || typeof w !== 'object') continue;
          if ('breakTelegraphAt' in w) w.breakTelegraphAt = 0;
          if ('breakStart' in w) w.breakStart = 0;
          if ('breakUntil' in w) w.breakUntil = 0;
          if ('breakBoost' in w) w.breakBoost = 0;
          if ('breakDir' in w) w.breakDir = 1;
          if ('breakCueUntil' in w) w.breakCueUntil = 0;
          if ('breakCooldownUntil' in w) w.breakCooldownUntil = 0;
          if ('lastBreakSoundAt' in w) w.lastBreakSoundAt = 0;
        }
      }
      if ('_hitStopT' in sim) sim._hitStopT = 0;
      if ('_breakFx' in sim) sim._breakFx = null;
      if ('_breakToastT' in sim) sim._breakToastT = 0;
      if ('_breakToastText' in sim) sim._breakToastText = '';
    } catch (_) {}
  };




  // Debug utility (no gameplay impact): sanity-check psyche drive scale.
  // Expected delta = A*S*K_PSY*seconds. For target tuning: ~4 points over 20s at A=100,S=+1.
  EC.runPsycheDriveSanityTest = function runPsycheDriveSanityTest(seconds) {
    const secs = (typeof seconds === 'number' && isFinite(seconds) && seconds > 0) ? seconds : 20;
    const T = EC.TUNE || {};
    const K = (typeof T.K_PSY === 'number') ? T.K_PSY : 0;
    const A = 100;
    const S = 1;
    const expectedDelta = A * S * K * secs;
    return {
      seconds: secs,
      K_PSY: K,
      expectedDelta: expectedDelta,
      targetDelta20s: 4,
      within20pctAt20s: (secs === 20) ? (expectedDelta >= 3.2 && expectedDelta <= 4.8) : null,
    };
  };

  // Hardening: module registry (no gameplay impact)
  EC._registerModule && EC._registerModule('core_mechanics', { provides: ["EC.failRun", "EC.resetRun", "EC.init", "EC.tickEngine", "EC.tickUI", "EC.tick", "EC.SIM"] });
})();