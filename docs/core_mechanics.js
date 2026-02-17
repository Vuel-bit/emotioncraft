/* Emotioncraft — core mechanics (Step 4 split)
   Contains game-truth logic: applying imprints, breaks, instability.
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
  selectedImprintId: null,
  instability: 0,
  runSeconds: 0,
  winProgress: 0,
  loseProgress: 0,
  failed: false,
  won: false,
  lastEvent: null,
  layoutBaseR: 110,
  wellSize: { minR: 72, maxR: 132 },
  stats: {
    imprintsApplied: 0,
    traumaFromOffHue: 0,
    traumaFromOverflow: 0,
    traumaFromTraumaImprints: 0,
    offHueReleases: 0,
    overflowEvents: 0,
    breaks: 0,
    traumaSpentOnBreaks: 0,
    breakPeakSpend: 0,
    breakPeakBoost: 0,
    peakInstability: 0,
    peakWell: null,
    peakDriver: null,
  },
});


  // ---------------------------------------------------------------------------
  // Redesign MVP mechanics (Chunk 2)
  // Authoritative per-tick update for the Psyche + 6 Wells model.
  // Runs alongside the legacy prototype until later chunks replace rendering/UI.
  // ---------------------------------------------------------------------------
  EC.MECH = EC.MECH || {};

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

    // MVP pipeline (systems ordering extracted)
    if (EC.PIPE && typeof EC.PIPE.stepMvp === 'function') {
      EC.PIPE.stepMvp(dt);
    }

  };
  EC.breakRatio = EC.breakRatio = function breakRatio(w) {
    const totalAmount = EC.totalAmount;

    const a = totalAmount(w);
    const den = Math.max(a, 0.001);
    return w.trauma / den;
    };
  EC.breakChancePerSec = function breakChancePerSec(w) {
    const clamp = EC.clamp;
    const breakRatio = EC.breakRatio;
    const TUNING = EC.TUNING;

    return clamp(breakRatio(w) * TUNING.breaks.k, 0, TUNING.breaks.maxChancePerSec);
    };
  EC.recomputeInstability = function recomputeInstability(dt) {
    const SIM = EC.SIM;
    const TUNING = EC.TUNING;
    const totalAmount = EC.totalAmount;
    const netSwirl = EC.netSwirl;
    const clamp = EC.clamp;

    // Instability is a failure meter that rises ONLY from CCW (negative) swirl.
    // More CCW + faster CCW + larger hue pool => more instability gain.
    const now = SIM.runSeconds;
    const dz = TUNING.ccwInst.deadzone ?? 0.20;
    const den = Math.max(1e-6, 1 - dz);

    dt = dt ?? 0;

    let gainTotal = 0;
    let peak = { v: -1, label: '', well: null };

    for (const w of SIM.wells) {
      const hueAmt = totalAmount(w); // Trauma excluded by design
      if (hueAmt <= 0.001) continue;

      const ns = netSwirl(w, now);
      // Normalize CCW past deadzone into [0..1]
      const ccwRaw = Math.max(0, -(ns.raw) - dz);
      const ccwNorm = clamp(ccwRaw / den, 0, 1);

      const gain = hueAmt * ccwNorm * TUNING.ccwInst.rate * dt;
      gainTotal += gain;

      if (gain > peak.v) peak = { v: gain, label: `CCW attunement in ${w.name}`, well: w.name };
    }

    SIM.instability = clamp(SIM.instability + gainTotal, 0, TUNING.instabilityCap);

    if (SIM.instability > (SIM.stats.peakInstability || 0)) {
      SIM.stats.peakInstability = SIM.instability;
      SIM.stats.peakWell = peak.well;
      SIM.stats.peakDriver = peak.label || null;
    }
    };
  EC.maybeTriggerBreak = function maybeTriggerBreak(w, now, dt) {
    const SIM = EC.SIM;
    const TUNING = EC.TUNING;
    const totalAmount = EC.totalAmount;
    const clamp = EC.clamp;
    const lerp = EC.lerp;
    const breakChancePerSec = EC.breakChancePerSec;
    const playBreakSting = EC.playBreakSting;

    // Breaks: Trauma periodically converts into CCW swirl, based on trauma/hueAmount ratio.
    const hueAmt = totalAmount(w);
    if (w.trauma <= 0.01) return null;

    // Prevent rapid retriggers (guardrail)
    if (now < (w.breakCooldownUntil || 0)) return null;

    const chancePerSec = breakChancePerSec(w);
    const p = clamp(chancePerSec * dt, 0, 0.95);
    if (Math.random() >= p) return null;

    const frac = TUNING.breaks.minSpendFrac + Math.random() * (TUNING.breaks.maxSpendFrac - TUNING.breaks.minSpendFrac);
    let spend = w.trauma * frac;
    spend = clamp(spend, TUNING.breaks.minSpend, TUNING.breaks.maxSpend);
    spend = Math.min(spend, w.trauma);
    if (spend <= 0.01) return null;

    w.trauma -= spend;

    const t = clamp(spend / TUNING.breaks.spendForMaxBoost, 0, 1);
    const boost = lerp(TUNING.breaks.minCCWBoost, TUNING.breaks.maxCCWBoost, t);

    w.breakTelegraphAt = now;
    w.breakStart = now + TUNING.breaks.telegraphSeconds;
    w.breakUntil = w.breakStart + TUNING.breaks.seconds;
    w.breakBoost = boost;
    w.breakCueUntil = w.breakUntil;

    w.breakCooldownUntil = now + 0.50;

    // Stats
    SIM.stats.breaks = (SIM.stats.breaks || 0) + 1;
    SIM.stats.traumaSpentOnBreaks = (SIM.stats.traumaSpentOnBreaks || 0) + spend;
    SIM.stats.breakPeakSpend = Math.max(SIM.stats.breakPeakSpend || 0, spend);
    SIM.stats.breakPeakBoost = Math.max(SIM.stats.breakPeakBoost || 0, boost);

    // Audio cooldown per well
    const cd = TUNING.breaks.soundCooldownSec ?? 0.75;
    if ((now - (w.lastBreakSoundAt || 0)) >= cd) {
      playBreakSting();
      w.lastBreakSoundAt = now;
    }

    return `EVENT: Break (${w.name}) spent ${spend.toFixed(0)} Trauma → CCW +${boost.toFixed(2)} for ${TUNING.breaks.seconds.toFixed(1)}s`;
    };
  EC.applyImprintToWell = function applyImprintToWell(imprint, wellId) {
    const SIM = EC.SIM;
    const TUNING = EC.TUNING;
    const Hue = EC.Hue;
    const clamp = EC.clamp;
    const computeLaneForDisplay = EC.computeLaneForDisplay;
    const snapshotAspectZone = EC.snapshotAspectZone;
    const getWellById = EC.getWellById;
    const setActionLine = EC.setActionLine;
    const playTick = EC.playTick;
    const updateUI = EC.updateUI;

    if (SIM.failed || SIM.won) return;
    const now = SIM.runSeconds;

    const targetWell = getWellById(wellId);
    if (!targetWell) return;

    // Capture pre-action display state for cues (player-caused only).
    const prevLane = computeLaneForDisplay(targetWell);
    const prevBlend = targetWell.displayBlend;
    const prevZone = snapshotAspectZone(targetWell, now);

    SIM.stats.imprintsApplied += 1;

    const log = [];

    // Trauma imprint: random target
    if (imprint.hue === Hue.TRAUMA) {
      const idx = Math.floor(Math.random() * SIM.wells.length);
      const w = SIM.wells[idx];
      const addT = Math.max(0, Number(imprint.trauma != null ? imprint.trauma : (TUNING.traumaImprint && TUNING.traumaImprint.add)));
      w.trauma += addT;
      SIM.stats.traumaFromTraumaImprints += addT;
      log.push(`Trauma +${addT} → ${w.name}`);
      const baseMsg = `Trauma imprint → +${addT} Trauma to ${w.name}`;
      setActionLine(baseMsg);
      updateUI(0);
      return;
    }

    const hue = imprint.hue;

    // Off-hue behavior (design update):
    // Primary Well (0–1 hues present): any hue can be added → becomes a two-hue blend.
    // Blended Well (exactly 2 hues present): only hues already present add normally.
    // Third hue into a blended Well: converts to Trauma (fail-forward).
    const presentHues = ['red','blue','yellow'].filter(h => targetWell.comp[h] > 0.0001);
    

    const isPrimaryWell = presentHues.length <= 1;
    const isTwoHueBlend = presentHues.length === 2;
    const hueAlreadyPresent = targetWell.comp[hue] > 0.0001;
    const allowAdd = isPrimaryWell || !isTwoHueBlend || hueAlreadyPresent;
// Catharsis flips Amount sign only; clamp to minimum 0 (v0.3 lock)
    const delta = imprint.amount * (imprint.catharsis ? -1 : 1);

    if (!allowAdd) {
      const traumaAdd = Math.round(Math.abs(imprint.amount));
      targetWell.trauma += traumaAdd;
      SIM.stats.offHueReleases += 1;
      SIM.stats.traumaFromOffHue += traumaAdd;
      log.push(`Third hue → Trauma +${traumaAdd}`);
    } else {
      const oldAmt = targetWell.comp[hue];
      // v0.1.3: cap each component at maxComponent; overflow becomes Trauma (prevents wells growing off-screen).
      const raw = oldAmt + delta;
      let newAmt = clamp(raw, 0, TUNING.maxComponent);
      const overflow = raw > TUNING.maxComponent ? (raw - TUNING.maxComponent) : 0;
      const applied = newAmt - oldAmt; // actual applied after clamp
      targetWell.comp[hue] = newAmt;

      if (overflow > 0.0001) {
        const o = Math.round(overflow);
        targetWell.trauma += o;
        SIM.stats.overflowEvents += 1;
        SIM.stats.traumaFromOverflow += o;
      }

      // Attunement impulse model (v0.3):
      // spinPower = (Imprint Amount) * (Imprint Attunement)
      // newSwirl = (oldAmt*oldSwirl + spinPower) / newAmt
      // Catharsis does NOT flip attunement.
      const oldSwirl = targetWell.swirl[hue] || 0;
      const oldMomentum = oldAmt * oldSwirl;
      const spinPower = imprint.amount * imprint.attune;

      let newSwirl = 0;
      if (newAmt > 0.0001) newSwirl = (oldMomentum + spinPower) / newAmt;
      newSwirl = clamp(newSwirl, -1, 1);
      targetWell.swirl[hue] = newSwirl;

      const sgn = applied >= 0 ? '+' : '';
      log.push(`${hue.toUpperCase()} ${sgn}${applied}`);
      if (raw > TUNING.maxComponent) log.push(`overflow → Trauma +${Math.round(raw - TUNING.maxComponent)}`);
      if (imprint.attune !== 0) log.push(`${imprint.attune > 0 ? 'CW' : 'CCW'} attune`);
    }


// Optional trauma contamination on a hue imprint (applies to the selected well).
if (imprint.hue !== Hue.TRAUMA) {
  const contam = Math.max(0, Number(imprint.trauma || 0));
  if (contam > 0) {
    targetWell.trauma += contam;
    log.push(`contamination → Trauma +${Math.round(contam)}`);
  }
}


    // Post-action state-shift cues (player-caused)
    const newLane = computeLaneForDisplay(targetWell);
    const newBlend = targetWell.displayBlend;
    const newZone = snapshotAspectZone(targetWell, now);

    const blendChanged = (newBlend !== prevBlend);
    const zoneChanged = (!blendChanged && newZone !== prevZone); // priority rule: suppress aspect cue if blend changed

    if (blendChanged) {
      // cooldown
      if (now - targetWell.lastBlendAudioAt >= TUNING.stateLabels.audioCooldownSec) {
        targetWell.lastBlendAudioAt = now;
        if (EC.spawnBlendRipple) EC.spawnBlendRipple(targetWell);
        // chime: rising when entering blend, falling when leaving
        if (EC.playTwoTone) EC.playTwoTone(newBlend, TUNING.stateLabels.chimeGain);
      } else {
        if (EC.spawnBlendRipple) EC.spawnBlendRipple(targetWell);
      }
    } else if (zoneChanged) {
      // subtle cue only
      if (now - targetWell.lastAspectAudioAt >= TUNING.stateLabels.audioCooldownSec) {
        targetWell.lastAspectAudioAt = now;
        // Optional: keep audio restrained; currently no tick (visual only)
        // playTick();
      }
      if (EC.spawnAspectNudge) EC.spawnAspectNudge(targetWell);
    }

    targetWell.lastAspectZone = newZone;


    
    // -----------------------------
    // Last Action Line (single persistent line)
    // -----------------------------
    const zoneLabel = (z) => (z === 'ccw' ? 'CCW' : (z === 'cw' ? 'CW' : 'Still'));

    let baseMsg = '';
    const thirdHueMatch = log.find(s => s.startsWith('Third hue → Trauma'));
    if (thirdHueMatch) {
      baseMsg = `3rd hue into blend → ${thirdHueMatch.replace('Third hue → ', '')} (${targetWell.name})`;
    } else {
      // Prefer a simple "Applied X" message
      const hueLine = log.find(s => /^[A-Z]+ [+\-]?\d+/.test(s));
      if (hueLine) {
        baseMsg = `Applied ${hueLine} to ${targetWell.name}`;
      } else {
        baseMsg = `Applied imprint to ${targetWell.name}`;
      }
      const overflowLine = log.find(s => s.startsWith('overflow →'));
      if (overflowLine) baseMsg += ` | ${overflowLine}`;
    }

    const extras = [];
    if (blendChanged) extras.push(`State: ${prevBlend ? 'Blended' : 'Primary'}→${newBlend ? 'Blended' : 'Primary'}`);
    if (newZone !== prevZone) extras.push(`Aspect: ${zoneLabel(prevZone)}→${zoneLabel(newZone)}`);

    let msg = baseMsg;
    if (extras.length) msg += ` | ${extras.join(' | ')}`;
    setActionLine(msg);

    updateUI(0);
    };

// -----------------------------
// Main sim tick (moved from main.js in Step 6)
// -----------------------------
EC.tick = function tick(delta) {
  const TUNING = EC.TUNING;

  const dt = (delta || 0) / 60;


  // MVP redesign mode: delegate branch to app loop.
  try {
    if (EC.APP && typeof EC.APP.tickMvp === 'function') {
      if (EC.APP.tickMvp(delta)) return;
    }
  } catch (_) {}


  if (SIM.failed || SIM.won) return;

  SIM.runSeconds += dt;

  // Visual animation step (particles + swirl indicators)
  if (EC.animateParticlesAndSwirl) EC.animateParticlesAndSwirl(dt);

  // Breaks: trauma periodically converts to CCW swirl
  for (const w of SIM.wells) {
    EC.maybeTriggerBreak(w, SIM.runSeconds, dt);
  }

  // Dual progress bars: Stabilization (CW) vs Collapse (CCW)
  let winAdd = 0;
  let loseAdd = 0;
  const P = TUNING.progressP ?? 1.5;
  const Q = TUNING.progressQ ?? 1.0;
  const WIN_RATE = TUNING.winRate ?? 10;
  const LOSE_RATE = TUNING.loseRate ?? 40;

  for (const w of SIM.wells) {
    let s = (EC.netSwirl ? EC.netSwirl(w, SIM.runSeconds).raw : 0) || 0;
    const pos = Math.max(s, 0);
    const neg = Math.max(-s, 0);

    const amt = (EC.totalAmount ? EC.totalAmount(w) : 0) || 0; // Trauma excluded
    const amtFactor = Math.max(0, Math.min(1, amt / (2 * (TUNING.maxComponent || 100))));

    if (pos > 0 && amtFactor > 0) winAdd += WIN_RATE * Math.pow(pos, P) * Math.pow(amtFactor, Q) * dt;
    if (neg > 0 && amtFactor > 0) loseAdd += LOSE_RATE * Math.pow(neg, P) * Math.pow(amtFactor, Q) * dt;
  }



  // For UI/debug: instantaneous fill rates (per second)
  if (dt > 0) {
    SIM.winRateNow = winAdd / dt;
    SIM.loseRateNow = loseAdd / dt;
  } else {
    SIM.winRateNow = 0;
    SIM.loseRateNow = 0;
  }

  const CAP = TUNING.progressCap ?? 100;
  SIM.winProgress = Math.min(CAP, (SIM.winProgress || 0) + winAdd);
  SIM.loseProgress = Math.min(CAP, (SIM.loseProgress || 0) + loseAdd);

  if (EC.updateInstabilityBar) EC.updateInstabilityBar(); // now Collapse
  if (EC.updateGoalBar) EC.updateGoalBar();               // now Stabilization
  if (EC.updateDebug) EC.updateDebug();

  // Render wells
  if (EC.updateWellView) {
    for (const w of SIM.wells) EC.updateWellView(w);
  }

  // Render Psyche bars (UI)
  if (EC.updatePsycheView) EC.updatePsycheView();

  // End conditions: first bar to cap ends the match
  if (SIM.loseProgress >= CAP) {
    if (EC.failRun) EC.failRun('Collapse reached its cap. CCW currents overwhelmed the Mindform.');
    return;
  }
  if (SIM.winProgress >= CAP) {
    if (EC.winRun) EC.winRun('Stabilization reached its cap. The Mindform is stable.');
    return;
  }
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
  EC._registerModule && EC._registerModule('core_mechanics', { provides: ["EC.applyImprintToWell", "EC.breakRatio", "EC.breakChancePerSec", "EC.maybeTriggerBreak", "EC.recomputeInstability", "EC.failRun", "EC.resetRun", "EC.init", "EC.tick", "EC.SIM"] });
})();