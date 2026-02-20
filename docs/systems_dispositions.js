/* systems_dispositions.js — Quirks (random-ready)
   - Owns EC.DISP (initLevel/update/getHudState/cancelAll/resetAllQuirkTimers)
   - Applies well-only drift during telegraph + active phases
   - No direct psyche modification (psyche changes only via existing well→psyche drive)

   Quirk types (player-facing):
     LOCKS_IN = Fixates  (Amount ↑)
     CRASHES  = Crashes  (Amount ↓)
     AMPED    = Obsesses (Spin -> +100)
     SPIRALS  = Spirals  (Spin -> -100)

   Scheduling modes:
     - Scheduled: waves have explicit startTime (legacy test levels)
     - Random: a pool is provided; scheduling uses a per-template per-second ramp chance
       (tier steps 0.025 / 0.05 / 0.1), resetting when that quirk instance ends.
       Scheduler is capped to at most one newly scheduled quirk per second.

   Notes:
   - Wave shape is smooth 0→1→0 over duration (sin(pi*phase))
   - Spin-type dispositions are scaled by Amount shield: rate *= (A/100)
   - Quirks must NOT clamp stored sim values (overshoot enables spillover)
*/
(() => {
  const EC = (window.EC = window.EC || {});

  EC._registerModule && EC._registerModule('systems_dispositions', {
    provides: ['EC.DISP'],
    requires: ['EC.TUNE', 'EC.HUES', 'EC.clamp', 'EC.SIM']
  });

  const TYPES = {
    AMPED: 'AMPED',
    LOCKS_IN: 'LOCKS_IN',
    CRASHES: 'CRASHES',
    SPIRALS: 'SPIRALS'
  };

  // Back-compat: accept older type names in level defs/patient pools.
  const LEGACY_TYPE_MAP = {
    AFFINITY: TYPES.LOCKS_IN,
    AVERSION: TYPES.CRASHES,
    TENDENCY: TYPES.AMPED,
    DAMPING: TYPES.SPIRALS,
  };

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function shape01(phase01) {
    const p = clamp01(phase01);
    return Math.sin(Math.PI * p);
  }

  function hueName(idx) {
    try {
      if (typeof EC.wellLabel === 'function') {
        const v = EC.wellLabel(idx);
        if (v && String(v).indexOf('Hue ') !== 0) return String(v);
      }
    } catch (_) {}

    const N = (EC.CONST && EC.CONST.WELL_DISPLAY_NAMES) || null;
    if (N && N[idx]) return String(N[idx]);

    // Fallback to legacy hue names (Title Case)
    const H = EC.HUES || (EC.CONST && EC.CONST.HUES) || [];
    const s = (H && H[idx]) ? String(H[idx]) : `Hue${idx}`;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function dirText(type) {
    if (type === TYPES.LOCKS_IN) return 'Amount ↑';
    if (type === TYPES.CRASHES) return 'Amount ↓';
    if (type === TYPES.AMPED) return 'Spin → +100';
    if (type === TYPES.SPIRALS) return 'Spin → -100';
    return '';
  }

  function typeDisplayName(type) {
    if (type === TYPES.AMPED) return 'Obsesses';
    if (type === TYPES.LOCKS_IN) return 'Fixates';
    if (type === TYPES.CRASHES) return 'Crashes';
    if (type === TYPES.SPIRALS) return 'Spirals';
    // Legacy fallbacks
    if (type === 'TENDENCY') return 'Obsesses';
    if (type === 'DAMPING') return 'Spirals';
    if (type === 'AFFINITY') return 'Fixates';
    if (type === 'AVERSION') return 'Crashes';
    return String(type || '');
  }

  function _escHtml(s) {
    const str = String(s == null ? '' : s);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _spanLogWell(i) {
    const idx = (i | 0);
    const name = hueName(idx);
    return '<span class="logWell w' + idx + '">' + _escHtml(name) + '</span>';
  }

  function intensityLabel(x01) {
    const T = EC.TUNE || {};
    const hi = (typeof T.DISP_INTENSITY_HIGH_TH === 'number') ? T.DISP_INTENSITY_HIGH_TH : 0.66;
    const med = (typeof T.DISP_INTENSITY_MED_TH === 'number') ? T.DISP_INTENSITY_MED_TH : 0.33;
    if (x01 >= hi) return 'Intense';
    if (x01 >= med) return 'Noticeable';
    return 'Low-Key';
  }

  function warnBrightnessForTier(tier) {
    const T = EC.TUNE || {};
    const b = Array.isArray(T.DISP_WARN_BRIGHTNESS_BY_TIER) ? T.DISP_WARN_BRIGHTNESS_BY_TIER : null;
    if (b && typeof b[tier] === 'number') return clamp01(Number(b[tier]));
    // Default: muted / medium / bright
    if (tier >= 2) return 1.0;
    if (tier === 1) return 0.70;
    return 0.45;
  }

  function totalTargetForTier(tier) {
    const T = EC.TUNE || {};
    const totals = Array.isArray(T.DISP_TIER_TOTAL_TARGETS) ? T.DISP_TIER_TOTAL_TARGETS : [40, 60, 80];
    const t0 = (typeof totals[tier] === 'number') ? Number(totals[tier]) : (tier === 2 ? 80 : (tier === 1 ? 60 : 40));

    const jit = Array.isArray(T.DISP_TIER_TOTAL_JITTER) ? T.DISP_TIER_TOTAL_JITTER : null;
    let lo = 0.9, hi = 1.1;
    if (tier === 0) { lo = 0.8; hi = 1.2; }
    else if (tier === 1) { lo = 0.85; hi = 1.15; }
    else { lo = 0.9; hi = 1.1; }
    if (jit && Array.isArray(jit[tier]) && jit[tier].length >= 2) {
      if (typeof jit[tier][0] === 'number') lo = Number(jit[tier][0]);
      if (typeof jit[tier][1] === 'number') hi = Number(jit[tier][1]);
    }
    const r = lo + (hi - lo) * Math.random();
    return t0 * r;
  }

  function ringParamsForType(type) {
    // Used by the renderer for the halo progress ring.
    // Angles are in radians: 0 at +X, increasing clockwise.
    const BOTTOM = Math.PI * 0.5; // 6 o'clock
    const TOP = -Math.PI * 0.5;   // 12 o'clock

    // Direction: +1 = clockwise, -1 = counterclockwise.
    // Authoritative mapping:
    // Tendency: start bottom, CW
    // Affinity: start bottom, CCW
    // Aversion: start top, CCW
    // Damping: start top, CW
    if (type === TYPES.AMPED) return { startAngleRad: BOTTOM, dirSign: +1 };
    if (type === TYPES.LOCKS_IN) return { startAngleRad: BOTTOM, dirSign: -1 };
    if (type === TYPES.CRASHES) return { startAngleRad: TOP, dirSign: -1 };
    if (type === TYPES.SPIRALS) return { startAngleRad: TOP, dirSign: +1 };
    return { startAngleRad: BOTTOM, dirSign: +1 };
  }

  // ---- Per-instance envelope plan (low→med→high→med→low) ----
  function smoothstep01(x) {
    const t = clamp01(x);
    return t * t * (3 - 2 * t);
  }

  function rollDurationSec(baseDurationSec) {
    const base = Math.max(0.1, Number(baseDurationSec || 0));
    const jitter = (Math.random() * 10) - 5; // ±5s
    const dur = base + jitter;
    // Authoritative clamp example
    return Math.max(8, Math.min(40, dur));
  }

  function rollPhaseWeights5() {
    // 5 positive weights that sum to 1.0, each clamped 0.10–0.30.
    // Resample until valid.
    for (let tries = 0; tries < 500; tries++) {
      const a = [Math.random(), Math.random(), Math.random(), Math.random(), Math.random()];
      let sum = a[0] + a[1] + a[2] + a[3] + a[4];
      if (sum <= 1e-9) continue;
      const w = a.map(v => v / sum);
      let ok = true;
      for (let i = 0; i < 5; i++) {
        if (w[i] < 0.10 || w[i] > 0.30) { ok = false; break; }
      }
      if (!ok) continue;
      // Floating error guard
      const s2 = w[0] + w[1] + w[2] + w[3] + w[4];
      if (Math.abs(s2 - 1.0) > 1e-3) continue;
      return w;
    }
    // Fallback (should be rare)
    return [0.20, 0.20, 0.20, 0.20, 0.20];
  }

  function buildEnvelopePlan(durationSec) {
    const w = rollPhaseWeights5();
    const d = w.map(x => x * durationSec);
    const t = [0, d[0], d[0] + d[1], d[0] + d[1] + d[2], d[0] + d[1] + d[2] + d[3], durationSec];
    const levels = [0.0, 0.5, 1.0, 0.5, 0.0];
    return { durationSec, weights: w, bounds: t, levels };
  }

  // Discrete mode: stepwise levels per phase (L/M/H/M/L)
  const STEP_LEVELS_5 = [0.15, 0.55, 0.95, 0.55, 0.15];

  function rollIsDiscrete() {
    // Rolled once per instance; default continuous.
    // Authoritative example: 25% discrete.
    const T = EC.TUNE || {};
    const p = (typeof T.DISP_DISCRETE_CHANCE === 'number') ? T.DISP_DISCRETE_CHANCE : 0.25;
    const pp = Math.max(0, Math.min(1, Number(p || 0)));
    return Math.random() < pp;
  }

  function phaseIndexAt(env, ttSec) {
    // returns 0..4
    if (!env || !env.bounds) return 0;
    const b = env.bounds;
    const x = Math.max(0, ttSec);
    if (x < b[1]) return 0;
    if (x < b[2]) return 1;
    if (x < b[3]) return 2;
    if (x < b[4]) return 3;
    return 4;
  }

  // Source-of-truth intensity evaluation for both mechanics and rendering.
  // Returns { intensity01, phaseIndex, phaseLevel:'low'|'med'|'high' }
  function evalIntensity(inst, nowT) {
    if (!inst || !inst.env || inst.state !== 'active') {
      return { intensity01: 0, phaseIndex: 0, phaseLevel: 'low' };
    }
    const env = inst.env;
    const dur = Math.max(1e-6, env.durationSec || 1);
    const tt = Math.max(0, Math.min(dur, (nowT - inst.startT)));
    const pi = phaseIndexAt(env, tt);

    if (inst.isDiscrete) {
      const v = STEP_LEVELS_5[pi] || 0;
      const lvl = (pi === 2) ? 'high' : ((pi === 1 || pi === 3) ? 'med' : 'low');
      return { intensity01: clamp01(v), phaseIndex: pi, phaseLevel: lvl };
    }

    // Continuous: piecewise smooth ramps through the 5 phase boundaries.
    const b = env.bounds;
    const lv = env.levels;
    const t0 = b[0], t1 = b[1], t2 = b[2], t3 = b[3], t4 = b[4], t5 = b[5];
    const x = tt;
    function seg(x0, x1, v0, v1) {
      const denom = Math.max(1e-6, x1 - x0);
      const u = smoothstep01((x - x0) / denom);
      return v0 + (v1 - v0) * u;
    }
    let out;
    if (x < t1) out = seg(t0, t1, lv[0], lv[1]);
    else if (x < t2) out = seg(t1, t2, lv[1], lv[2]);
    else if (x < t3) out = seg(t2, t3, lv[2], lv[3]);
    else if (x < t4) out = seg(t3, t4, lv[3], lv[4]);
    else out = seg(t4, t5, lv[4], 0.0);

    const T = EC.TUNE || {};
    const hi = (typeof T.DISP_INTENSITY_HIGH_TH === 'number') ? T.DISP_INTENSITY_HIGH_TH : 0.66;
    const med = (typeof T.DISP_INTENSITY_MED_TH === 'number') ? T.DISP_INTENSITY_MED_TH : 0.33;
    const lvl = (out >= hi) ? 'high' : ((out >= med) ? 'med' : 'low');
    return { intensity01: clamp01(out), phaseIndex: pi, phaseLevel: lvl };
  }

  function envelopeIntensityAt(inst, nowT) {
    return evalIntensity(inst, nowT).intensity01;
  }

  // ---- Envelope-warped progress mapping (peak always at 50%) ----
  // Precompute a cumulative integral I(t)=∫ intensity(u)du so we can map time→progress:
  //  - progress(0)=0
  //  - progress(duration)=1
  //  - progress(peakTime)=0.5 exactly
  // Uses piecewise normalization so area before peak maps to 0.5 and after peak maps to 0.5.
  const WARP_SAMPLES = 256;
  const WARP_EPS = 1e-6;

  function peakElapsedSec(inst) {
    // Authoritative:
    // - Discrete envelopes have a high plateau (phase 3). Peak time is midpoint of that plateau.
    // - Continuous envelopes have a single apex unless explicitly plateaued; peak time is argmax.
    // Our continuous evaluator ramps up into the high point at bounds[2], then ramps down.
    // Therefore argmax is at bounds[2].
    if (!inst || !inst.env || !inst.env.bounds) return 0;
    const b = inst.env.bounds;
    const t2 = b[2] || 0;
    const t3 = b[3] || t2;
    if (inst.isDiscrete) return 0.5 * (t2 + t3);
    return t2;
  }

  function buildWarpLUT(inst) {
    if (!inst || !inst.env) return null;
    const dur = Math.max(1e-6, Number(inst.env.durationSec || 0));
    const N = (typeof inst.warpNSamples === 'number') ? Math.max(32, Math.min(1024, inst.warpNSamples | 0)) : WARP_SAMPLES;
    const dt = dur / N;
    const cum = new Float32Array(N + 1);
    let prev = 0;
    for (let i = 0; i <= N; i++) {
      const tt = i * dt;
      const nowT = inst.startT + tt;
      const v = clamp01(evalIntensity(inst, nowT).intensity01);
      if (i === 0) {
        cum[i] = 0;
      } else {
        cum[i] = cum[i - 1] + 0.5 * (prev + v) * dt;
      }
      prev = v;
    }

    const peakEl = Math.max(0, Math.min(dur, peakElapsedSec(inst)));
    const peakIdx = Math.max(0, Math.min(N, Math.floor(peakEl / dt)));
    const frac = (peakEl - peakIdx * dt) / Math.max(WARP_EPS, dt);
    const I0 = cum[peakIdx];
    const I1 = cum[Math.min(N, peakIdx + 1)];
    const Ipeak = I0 + (I1 - I0) * clamp01(frac);
    const Iend = cum[N];
    const preArea = Math.max(WARP_EPS, Ipeak);
    const postArea = Math.max(WARP_EPS, Iend - Ipeak);
    return { N, dt, dur, cum, peakEl, Ipeak, Iend, preArea, postArea };
  }

  function integralAtElapsed(warp, elSec) {
    if (!warp) return 0;
    const el = Math.max(0, Math.min(warp.dur, elSec));
    const x = el / Math.max(WARP_EPS, warp.dt);
    const i0 = Math.floor(x);
    const i1 = Math.min(warp.N, i0 + 1);
    const f = clamp01(x - i0);
    const a0 = warp.cum[Math.max(0, Math.min(warp.N, i0))];
    const a1 = warp.cum[i1];
    return a0 + (a1 - a0) * f;
  }

  function warpedProgress01(inst, nowT) {
    if (!inst || inst.state !== 'active' || !inst.warp) return 0;
    const w = inst.warp;
    const el = Math.max(0, Math.min(w.dur, (nowT - inst.startT)));
    const I = integralAtElapsed(w, el);
    if (el <= w.peakEl) {
      return clamp01(0.5 * (I / w.preArea));
    }
    return clamp01(0.5 + 0.5 * ((I - w.Ipeak) / w.postArea));
  }

  // ---- Painted halo segment history (per instance) ----
  // Store progress-space segments [p0,p1] with an immutable "segment value":
  //  - continuous: segVal = intensity01 snapshot (0..1)
  //  - discrete: segVal = 0(low)/1(med)/2(high)
  // Renderer maps segVal → color. Previously painted segments never change.
  const SEG_STEP = 1 / 240; // stable, low allocation rate
  const SEG_MAX = 4096;

  function initSegHistory(inst) {
    inst.segP0 = inst.segP0 || new Float32Array(SEG_MAX);
    inst.segP1 = inst.segP1 || new Float32Array(SEG_MAX);
    inst.segVal = inst.segVal || new Float32Array(SEG_MAX);
    inst.segN = 0;
    inst.paintedProg01 = 0;
    // Time-sliced painting bookkeeping (authoritative: paint based on time sampling).
    inst.lastPaintT = inst.startT;
  }

  function levelCodeFromPhaseLevel(phaseLevel) {
    if (phaseLevel === 'high') return 2;
    if (phaseLevel === 'med') return 1;
    return 0;
  }

  function paintSegmentsUpTo(inst, newProg01, intensity01, phaseLevel) {
    if (!inst) return;
    const pNew = clamp01(newProg01);
    let p = clamp01(inst.paintedProg01 || 0);
    if (pNew <= p + 1e-7) return;
    if (!inst.segP0 || !inst.segP1 || !inst.segVal) initSegHistory(inst);

    const isDisc = !!inst.isDiscrete;
    const v = isDisc ? levelCodeFromPhaseLevel(phaseLevel) : clamp01(intensity01);

    // Quantize to stable steps to avoid per-frame tiny allocations.
    while (p + SEG_STEP <= pNew - 1e-7 && inst.segN < SEG_MAX) {
      const n = inst.segN | 0;
      inst.segP0[n] = p;
      inst.segP1[n] = p + SEG_STEP;
      inst.segVal[n] = v;
      inst.segN = n + 1;
      p += SEG_STEP;
    }
    if (pNew > p + 1e-7 && inst.segN < SEG_MAX) {
      const n = inst.segN | 0;
      inst.segP0[n] = p;
      inst.segP1[n] = pNew;
      inst.segVal[n] = v;
      inst.segN = n + 1;
      p = pNew;
    }
    inst.paintedProg01 = p;
  }

  // Authoritative painting method:
  // Advance from inst.lastPaintT to nowT in small time slices.
  // For each slice, compute progress01(tSlice) and intensity01(tSlice) and
  // paint ONLY the delta progress that occurred during that slice using that slice's intensity.
  function paintTimeSliced(inst, nowT) {
    if (!inst || inst.state !== 'active') return;
    if (!inst.warp || !inst.env) return;
    if (!inst.segP0 || !inst.segP1 || !inst.segVal) initSegHistory(inst);

    const tEnd = Math.min(nowT, inst.endT || nowT);
    let t0 = (typeof inst.lastPaintT === 'number') ? inst.lastPaintT : inst.startT;
    if (!isFinite(t0)) t0 = inst.startT;
    if (tEnd <= t0 + 1e-6) return;

    // Stable step strategy: target ~20ms slices, cap per frame.
    const total = tEnd - t0;
    const targetStep = 0.02;
    let slices = Math.ceil(total / targetStep);
    const MAX_SLICES = 12;
    if (slices < 1) slices = 1;
    if (slices > MAX_SLICES) slices = MAX_SLICES;

    for (let s = 0; s < slices; s++) {
      const ta = t0 + (total * (s / slices));
      const tb = t0 + (total * ((s + 1) / slices));
      const ts = 0.5 * (ta + tb);
      const ev = evalIntensity(inst, ts);
      const prog01 = warpedProgress01(inst, ts);
      paintSegmentsUpTo(inst, prog01, ev.intensity01, ev.phaseLevel);
    }

    inst.lastPaintT = tEnd;
  }

  function normWave(w, withStartTime) {
    const T = EC.TUNE || {};

    const baseDur = (typeof w.duration === 'number') ? w.duration
      : ((typeof T.DISP_DEFAULT_DURATION === 'number') ? T.DISP_DEFAULT_DURATION : 30);

    // Type normalization + legacy mapping
    const rawType = String(w.type || TYPES.AMPED).toUpperCase();
    const mapped = TYPES[rawType] ? TYPES[rawType] : (LEGACY_TYPE_MAP[rawType] || TYPES.AMPED);

    // Intensity tier (0=Low-Key, 1=Noticeable, 2=Intense)
    let tier = 0;
    if (typeof w.intensityTier === 'number') tier = Math.round(w.intensityTier);
    else if (typeof w.intensity === 'number') tier = Math.round(w.intensity);
    else if (typeof w.tier === 'number') tier = Math.round(w.tier);
    tier = Math.max(0, Math.min(2, tier));

    // Tier scaling (scheduler + duration/strength). Prefer explicit per-tier lists if provided.
    const freqStep = (typeof T.DISP_TIER_FREQ_STEP === 'number') ? T.DISP_TIER_FREQ_STEP : 1.30;
    const durStep  = (typeof T.DISP_TIER_DUR_STEP === 'number') ? T.DISP_TIER_DUR_STEP : 1.30;
    const strStep  = (typeof T.DISP_TIER_STR_STEP === 'number') ? T.DISP_TIER_STR_STEP : 1.18;

    const freqMults = Array.isArray(T.DISP_TIER_FREQ_MULTS) ? T.DISP_TIER_FREQ_MULTS : null;
    const durMults  = Array.isArray(T.DISP_TIER_DUR_MULTS) ? T.DISP_TIER_DUR_MULTS : null;
    const strMults  = Array.isArray(T.DISP_TIER_STR_MULTS) ? T.DISP_TIER_STR_MULTS : null;

    const durMult  = (durMults && typeof durMults[tier] === 'number') ? Number(durMults[tier]) : Math.pow(durStep, tier);
    const strMult  = (strMults && typeof strMults[tier] === 'number') ? Number(strMults[tier]) : Math.pow(strStep, tier);
    const freqMult = (freqMults && typeof freqMults[tier] === 'number') ? Number(freqMults[tier]) : Math.pow(freqStep, tier);

    const baseStrength = (typeof w.strength === 'number') ? w.strength
      : ((typeof T.DISP_DEFAULT_STRENGTH === 'number') ? T.DISP_DEFAULT_STRENGTH : 3.0);

    const o = {
      duration: Math.max(0.1, Number(baseDur || 30)) * durMult,
      hueIndex: Math.max(0, Math.min(5, Number(w.hueIndex || 0))),
      type: mapped,
      strength: Number(baseStrength || 0) * strMult,

      // Keep tier for display + scheduler scaling
      intensityTier: tier,
      _freqMult: freqMult,
    };
    if (withStartTime) o.startTime = Math.max(0, Number(w.startTime || 0));
    return o;
  }

  function sampleExp(meanSec) {
    const m = Math.max(0.001, Number(meanSec || 1));
    const r = Math.random();
    return -m * Math.log(1 - r);
  }

  // Public API
  EC.DISP = EC.DISP || {};

  // Internal state
  let _mode = 'scheduled';
  let _waves = [];     // scheduled normalized
  let _pool = [];      // random pool normalized
  let _t = 0;

  // Random schedule state (slot-based)
  // Each slot is an independent exponential clock.
  let _slots = [];         // [{ tpl, nextT }]

  // Random schedule state (ramp-based)
  // Pre-partitioned pool per tier to avoid per-second scans.
  let _poolByTier = [[], [], []];
  // Per-template ramp timers (random mode only): each tpl tracks elapsed seconds and lock state.
  // Guard to ensure ramp checks only run when crossing whole seconds.
  let _lastWholeSec = -1;
  // Multiple concurrent disposition instances (telegraph or active).
  // Constraint enforced: at most one instance per well in telegraph OR active.
  // Instance shape:
  // { id, state:'telegraph'|'active', tpl, type, slotIdx, hueIndex,
  //   teleStartT, fireAt, startT, endT, durationSec, env }
  let _instances = [];
  let _nextId = 1;

  // Pending/delayed event arrivals (not yet telegraphed). Each is:
  // { tpl, slotIdx, fireAt }
  let _pending = [];

  // Debug counters (debug-only UI uses SIM._dispDbg)
  let _dbgFireTs = [];
  let _dbgLastLogT = -1e9;
  let _dbgLastSampleId = -1;

  let _hud = { telegraphText: '', activeText: '' };
  // Render-facing state for well FX (telegraph/active marker)
  // Multiple instances are supported; renderer should read getRenderStates().
  // Each render entry:
  // { phase, targetIndex, type, intensity01, progress01, startAngleRad, dirSign }
  let _renderList = [];

  // Global spacing guards to reduce frequent clumping.
  // - _lastScheduledFireAt: spacing for scheduled fireAt when telegraphs are created
  // - _lastFiredAt: safety net to prevent back-to-back firing bursts
  let _lastScheduledFireAt = -1e9;
  let _lastFiredAt = -1e9;


  // Cadence state machine (random mode only): alternates quiet/burst windows.
  // Affects ONLY scheduling in _mode==='random' (not mechanics/force math).
  let _cadenceMode = 'quiet';     // 'quiet' | 'burst'
  let _cadenceUntilT = 0;         // seconds (match time)
  let _cadenceRateMult = 1.0;     // quiet<1 => rarer, burst>1 => denser

  // Gate console diagnostics behind query flag (?dispconsole=1)
  const _dbgConsoleEnabled = (() => {
    try {
      const qs = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
      return /(?:\?|&)dispconsole=1(?:&|$)/.test(qs);
    } catch (_) { return false; }
  })();

  function _tuneNum(key, defVal) {
    const T = EC.TUNE || {};
    const v = Number(T[key]);
    return (isFinite(v)) ? v : defVal;
  }

  function _randRange(lo, hi) {
    lo = Number(lo); hi = Number(hi);
    if (!isFinite(lo)) lo = 0;
    if (!isFinite(hi)) hi = lo;
    if (hi < lo) { const t = lo; lo = hi; hi = t; }
    return lo + (hi - lo) * Math.random();
  }

  function _cadenceInit() {
    _cadenceMode = 'quiet';
    _cadenceRateMult = Math.max(0.01, _tuneNum('DISP_CADENCE_QUIET_RATE_MULT', 0.55));
    const a = _tuneNum('DISP_CADENCE_START_QUIET_MIN_SEC', 15);
    const b = _tuneNum('DISP_CADENCE_START_QUIET_MAX_SEC', 30);
    _cadenceUntilT = _randRange(a, b);
  }

  function _cadenceFlip(nowT) {
    if (_cadenceMode === 'quiet') {
      _cadenceMode = 'burst';
      _cadenceRateMult = Math.max(0.01, _tuneNum('DISP_CADENCE_BURST_RATE_MULT', 1.75));
      const a = _tuneNum('DISP_CADENCE_BURST_MIN_SEC', 5);
      const b = _tuneNum('DISP_CADENCE_BURST_MAX_SEC', 12);
      _cadenceUntilT = nowT + _randRange(a, b);
    } else {
      _cadenceMode = 'quiet';
      _cadenceRateMult = Math.max(0.01, _tuneNum('DISP_CADENCE_QUIET_RATE_MULT', 0.55));
      const a = _tuneNum('DISP_CADENCE_QUIET_MIN_SEC', 12);
      const b = _tuneNum('DISP_CADENCE_QUIET_MAX_SEC', 28);
      _cadenceUntilT = nowT + _randRange(a, b);
    }
  }

  function _cadenceTick(nowT) {
    // Advance through cadence windows; use a loop to handle large dt safely.
    for (let guard = 0; guard < 8 && nowT >= _cadenceUntilT; guard++) {
      _cadenceFlip(nowT);
    }
    // Expose for debug overlay (optional)
    try { EC.SIM._dispCadenceDbg = { mode: _cadenceMode, until: _cadenceUntilT, now: nowT }; } catch (_) {}
  }

  function _cadenceMult() {
    const m = Number(_cadenceRateMult);
    return (isFinite(m) && m > 0) ? m : 1.0;
  }
  function meanPerSlot() {
    const T = EC.TUNE || {};
    const m = (typeof T.DISP_MEAN_INTERVAL_SEC_PER_SLOT === 'number') ? T.DISP_MEAN_INTERVAL_SEC_PER_SLOT
      : ((typeof T.DISP_MEAN_INTERVAL_SEC === 'number') ? T.DISP_MEAN_INTERVAL_SEC : 180);
    return Math.max(0.25, Number(m || 180));
  }

  function minGapSec() {
    const T = EC.TUNE || {};
    const g = (typeof T.DISP_MIN_GAP_SEC === 'number') ? T.DISP_MIN_GAP_SEC : 3;
    return Math.max(0, Number(g || 0));
  }

  function rescheduleSlot(i, nowT) {
    if (!_slots[i]) return;
    const f = ( (_slots[i].tpl && _slots[i].tpl._freqMult) ? _slots[i].tpl._freqMult : 1 );
    const cm = _cadenceMult();
    _slots[i].nextT = nowT + sampleExp((meanPerSlot() / f) / cm);
  }

  function enqueuePending(evt) {
    if (!evt) return;
    _pending.push({ tpl: evt.tpl, slotIdx: evt.slotIdx, fireAt: Number(evt.fireAt || 0) });
    // Keep earliest-first so telegraphing prefers older arrivals.
    _pending.sort((x, y) => (x.fireAt - y.fireAt));
  }

  // Announce arrivals early enough to show the telegraph window.
  // IMPORTANT: We do NOT reschedule the slot until the event actually fires.
  // This preserves the intended Poisson timing while allowing telegraphing.
  function announceArrivalsForTelegraph(nowT, teleSec) {
    if (!_slots || _slots.length === 0) return;
    const tele = Math.max(0, Number(teleSec || 0));
    for (let i = 0; i < _slots.length; i++) {
      const s = _slots[i];
      if (!s) continue;
      const nt = (typeof s.nextT === 'number') ? s.nextT : 1e18;
      if (s.announced) continue;
      // Normal path: announce when we enter the telegraph window.
      if (nowT >= (nt - tele)) {
        enqueuePending({ slotIdx: i, tpl: s.tpl, fireAt: nt });
        s.announced = true;
      }
    }
  }

  function buildSlotsFromPool(nowT) {
    _slots = [];
    if (!_pool || _pool.length === 0) return;
    const m = meanPerSlot();
    for (let i = 0; i < _pool.length; i++) {
      const tpl = _pool[i];
      const f = (tpl && tpl._freqMult) ? tpl._freqMult : 1;
      const cm = _cadenceMult();
      _slots.push({ tpl, nextT: nowT + sampleExp((m / f) / cm), announced: false });
    }
  }

  EC.DISP.initLevel = function initLevel(levelDef) {
    _t = 0;
    _waves = [];
    _pool = [];
    _slots = [];
    _instances = [];
    _nextId = 1;
    _pending = [];

    _dbgFireTs = [];

    _hud.telegraphText = '';
    _hud.activeText = '';
    _renderList = [];

    // Reset global spacing guards each run.
    _lastScheduledFireAt = -1e9;
    _lastFiredAt = -1e9;

    // Reset per-run quirk force totals (debug-only).
    try {
      const z = new Array(6).fill(0);
      const zt = () => ({ LOCKS_IN: z.slice(), CRASHES: z.slice(), AMPED: z.slice(), SPIRALS: z.slice() });
      EC.SIM._quirkForceTotals = { byWell: z.slice(), byType: zt(), startedAtT: 0, lastT: 0 };
    } catch (_) {}

    // Debug: per-run quirk event timeline buffer (authoritative for Debug panel)
    try { EC.SIM._quirkTimeline = []; } catch (_) {}
    try { EC.SIM._dispCadenceDbg = null; } catch (_) {}

    const wantsRandom = !!(levelDef && (levelDef.dispositionsRandom || levelDef._dispositionsRandom));

    if (wantsRandom) {
      _mode = 'random';
      const src = (levelDef && Array.isArray(levelDef.dispositionsPool)) ? levelDef.dispositionsPool : ((levelDef && Array.isArray(levelDef.dispositions)) ? levelDef.dispositions : []);
      _pool = src.map((d) => normWave(d, false));
      // Ramp-based random scheduling: pre-partition the pool per tier once.
      _poolByTier = [[], [], []];
      for (let i = 0; i < _pool.length; i++) {
        const tpl = _pool[i];
        if (tpl) { tpl._rampElapsedSec = 0; tpl._rampLocked = false; }
        const tier = (tpl && typeof tpl.intensityTier === 'number') ? (tpl.intensityTier | 0) : 0;
        if (tier >= 0 && tier <= 2) _poolByTier[tier].push(tpl);
      }
      _lastWholeSec = 0;

      // Slot/cadence scheduling is legacy and intentionally disabled for random mode in this build.
      _slots = [];
      try { EC.SIM._dispCadenceDbg = null; } catch (_) {}
      return;
    }

    _mode = 'scheduled';
    if (levelDef && Array.isArray(levelDef.dispositions)) {
      _waves = levelDef.dispositions.map((d) => normWave(d, true));
    } else {
      _waves = [];
    }
  };

  function applyWaveToWell(SIM, w, dt, sh) {
    const T = EC.TUNE || {};

    // Defaults / caps for reference reads only
    const A_MIN = (typeof T.A_MIN === 'number') ? T.A_MIN : 25;
    const A_MAX = (typeof T.A_MAX === 'number') ? T.A_MAX : 100;
    const S_MIN = (typeof T.S_MIN === 'number') ? T.S_MIN : -100;
    const S_MAX = (typeof T.S_MAX === 'number') ? T.S_MAX : 100;

    const EPS = 1e-6; // cap-push epsilon (overshoot allowed)

    const traitMult = (EC.TRAITS && typeof EC.TRAITS.getQuirkStrengthMult === "function") ? EC.TRAITS.getQuirkStrengthMult(SIM) : 1.0;
    const rateRaw = (w.strength || 0) * sh; // per second (raw)
    const rate = rateRaw * traitMult;

    // Debug-only: accumulate raw quirk force totals (not mitigated by Amount shield).
    try {
      if (!SIM._quirkForceTotals) {
        const z = new Array(6).fill(0);
        SIM._quirkForceTotals = {
          byWell: z.slice(),
          byType: { LOCKS_IN: z.slice(), CRASHES: z.slice(), AMPED: z.slice(), SPIRALS: z.slice() },
          startedAtT: _t,
          lastT: _t
        };
      }
    } catch (_) {}

    const hi = w.hueIndex;
    const A_raw = (SIM.wellsA && SIM.wellsA[hi] != null) ? Number(SIM.wellsA[hi]) : 0;
    const S_raw = (SIM.wellsS && SIM.wellsS[hi] != null) ? Number(SIM.wellsS[hi]) : 0;

    // Clamp for reference/shield scaling only
    const A_ref = Math.max(A_MIN, Math.min(A_MAX, A_raw));
    const S_ref = Math.max(S_MIN, Math.min(S_MAX, S_raw));

    if (w.type === TYPES.LOCKS_IN) {
      SIM.wellsA[hi] = A_raw + rate * dt;
      try { SIM._quirkForceTotals.byWell[hi] += (rate * dt); SIM._quirkForceTotals.byType.LOCKS_IN[hi] += (rate * dt); } catch (_) {}
    } else if (w.type === TYPES.CRASHES) {
      SIM.wellsA[hi] = A_raw - rate * dt;
      try { SIM._quirkForceTotals.byWell[hi] -= (rate * dt); SIM._quirkForceTotals.byType.CRASHES[hi] -= (rate * dt); } catch (_) {}
    } else if (w.type === TYPES.AMPED) {
      // Push toward +100 specifically (no clamping; overshoot allowed by design).
      const rateSpin = rate * (A_ref / 100);
      const target = S_MAX;
      let deltaNorm;
      if (S_raw >= target - EPS) {
        deltaNorm = 1;
      } else {
        deltaNorm = Math.max(0, Math.min(1, (target - S_raw) / 100));
      }
      SIM.wellsS[hi] = S_raw + rateSpin * deltaNorm * dt;
      // Track force ignoring A_ref/100 mitigation. Direction is by type (Amped=+).
      try { const mag = (rate * Math.abs(deltaNorm) * dt); SIM._quirkForceTotals.byWell[hi] += mag; SIM._quirkForceTotals.byType.AMPED[hi] += mag; } catch (_) {}
    } else if (w.type === TYPES.SPIRALS) {
      // Push toward -100 specifically.
      const rateSpin = rate * (A_ref / 100);
      const target = S_MIN;
      let deltaNorm;
      if (S_raw <= target + EPS) {
        deltaNorm = -1;
      } else {
        deltaNorm = Math.max(-1, Math.min(0, (target - S_raw) / 100));
      }
      SIM.wellsS[hi] = S_raw + rateSpin * deltaNorm * dt;
      // Track force ignoring A_ref/100 mitigation. Direction is by type (Spirals=-).
      try { const mag = (rate * Math.abs(deltaNorm) * dt); SIM._quirkForceTotals.byWell[hi] -= mag; SIM._quirkForceTotals.byType.SPIRALS[hi] -= mag; } catch (_) {}
    }

    // S_ref is unused, but keeping read consistent for future debug.
    void S_ref;
  }

  EC.DISP.update = function update(dt) {
    const SIM = EC.SIM;
    const T = EC.TUNE || {};
    if (!SIM) return;

    dt = Math.min(Math.max(dt || 0, 0), 0.05);
    if (dt <= 0) return;

    _t += dt;

    const tele = (typeof T.DISP_TELEGRAPH_SEC === 'number') ? T.DISP_TELEGRAPH_SEC : 4;

    let teleText = '';
    let activeText = '';
    // Default render state each tick
    _renderList = [];

    if (_mode === 'random') {
      const retryDelay = 0.5;

      // Ramp-based random scheduling (random mode only):
      // Per-template ramp timers: each tpl increments once per second while idle.
      // At most one new quirk is scheduled per second.

      // Per-second ramp step expressed as probability (0..1). 0.00025 = 0.025% per sec.
      const STEP_BY_TIER = [0.00025, 0.0005, 0.001]; // tier 0/1/2

      function tplWeight(tpl) {
        const w = (tpl && typeof tpl._freqMult === 'number') ? Number(tpl._freqMult) : 1;
        return (isFinite(w) && w > 0) ? w : 1;
      }

      function pickWeightedTpl(arr) {
        if (!arr || arr.length === 0) return null;
        let sum = 0;
        for (let i = 0; i < arr.length; i++) sum += tplWeight(arr[i]);
        if (!(sum > 0)) return arr[(Math.random() * arr.length) | 0];
        let r = Math.random() * sum;
        for (let i = 0; i < arr.length; i++) {
          r -= tplWeight(arr[i]);
          if (r <= 0) return arr[i];
        }
        return arr[arr.length - 1];
      }

      function rampTickOneSecond(nowT) {
        const winners = [];
        for (let i = 0; i < _pool.length; i++) {
          const tpl = _pool[i];
          if (!tpl) continue;
          if (tpl._rampLocked) continue; // idle-only increment/roll
          tpl._rampElapsedSec = (tpl._rampElapsedSec | 0) + 1;
          const tier = (tpl && typeof tpl.intensityTier === 'number') ? (tpl.intensityTier | 0) : 0;
          const step = (tier >= 0 && tier <= 2) ? STEP_BY_TIER[tier] : STEP_BY_TIER[0];
          const chance = Math.min(1, (tpl._rampElapsedSec | 0) * step);
          if (Math.random() < chance) winners.push(tpl);
        }
        if (winners.length === 0) return;

        const chosen = pickWeightedTpl(winners);
        if (!chosen) return;

        // Preserve a full telegraph window: schedule fireAt = now + telegraph.
        enqueuePending({ tpl: chosen, slotIdx: -1, fireAt: nowT + tele });
        // Lock immediately; unlock/reset only when this tpl's instance ends (or cancelAll/break reset).
        chosen._rampLocked = true;
      }

      // Run ramp checks only when crossing whole seconds.
      const wholeNow = Math.floor(_t);
      if (wholeNow > _lastWholeSec) {
        for (let s = _lastWholeSec + 1; s <= wholeNow; s++) {
          rampTickOneSecond(_t);
        }
        _lastWholeSec = wholeNow;
      }

      function isReservedWell(idx) {
        for (let k = 0; k < _instances.length; k++) {
          const inst = _instances[k];
          if (!inst) continue;
          if (inst.hueIndex === idx && (inst.state === 'telegraph' || inst.state === 'active')) return true;
        }
        return false;
      }

      function getFreeWells() {
        const free = [];
        for (let i = 0; i < 6; i++) if (!isReservedWell(i)) free.push(i);
        return free;
      }

      // Returns:
      //   1 = telegraph started
      //   0 = no free well (retry-delay)
      //  -1 = deferred (min-gap pushed fireAt; preserve full telegraph)
      function beginTelegraphFromPending(p) {
        const tpl = p.tpl;
        if (!tpl) return 1;
        // Enforce global minimum gap between scheduled events so telegraphs don't clump.
        // IMPORTANT: preserve full telegraph by delaying start if min-gap pushes fireAt forward.
        const mg = minGapSec();
        let fireAt = Number(p.fireAt || 0);
        if (mg > 0 && fireAt < (_lastScheduledFireAt + mg)) {
          fireAt = _lastScheduledFireAt + mg;
          p.fireAt = fireAt;
          // keep sorted by fireAt
          _pending.sort((a, b) => a.fireAt - b.fireAt);
          return -1;
        }

        const free = getFreeWells();
        if (free.length === 0) return 0;
        const hi = free[(Math.random() * free.length) | 0];
        const type = tpl.type;

        _lastScheduledFireAt = fireAt;
        const inst = {
          id: _nextId++,
          state: 'telegraph',
          tpl,
          type,
          slotIdx: (p.slotIdx != null ? p.slotIdx : -1),
          hueIndex: hi,
          teleStartT: fireAt - tele,
          fireAt: fireAt,
          startT: 0,
          endT: 0,
          durationSec: 0,
          env: null
        };
        _instances.push(inst);
        return 1;
      }

      // 1) Start telegraphs for pending arrivals when in warning window
      //    If no wells are free, delay the arrival (do not discard).
      for (let i = 0; i < _pending.length; i++) {
        const p = _pending[i];
        if (!p) continue;
        if (_t < (p.fireAt - tele)) continue; // not yet in telegraph window
        // Try to allocate a free well.
        const r = beginTelegraphFromPending(p);
        if (r === 1) {
          _pending.splice(i, 1);
          i--;
        } else if (r === 0) {
          // Delay and retry later
          p.fireAt = _t + retryDelay;
          // keep sorted by fireAt
          _pending.sort((a, b) => a.fireAt - b.fireAt);
          break;
        } else {
          // Deferred due to min-gap adjustment (fireAt already updated). Stop for this tick.
          break;
        }
      }

      // 2) Promote telegraphs to active when their fire time hits.
      for (let k = 0; k < _instances.length; k++) {
        const inst = _instances[k];
        if (!inst || inst.state !== 'telegraph') continue;
        if (_t >= inst.fireAt) {
          // Safety net: if another quirk just fired, extend this telegraph to respect min gap.
          const mg = minGapSec();
          if (mg > 0 && _t < (_lastFiredAt + mg)) {
            const newFireAt = _lastFiredAt + mg;
            inst.fireAt = newFireAt;
            inst.teleStartT = newFireAt - tele;
            continue;
          }
          _lastFiredAt = inst.fireAt;
          const baseDur = (inst.tpl && typeof inst.tpl.duration === 'number') ? inst.tpl.duration : ((typeof T.DISP_DEFAULT_DURATION === 'number') ? T.DISP_DEFAULT_DURATION : 30);
          const durSec = rollDurationSec(baseDur);
          inst.durationSec = durSec;
          inst.env = buildEnvelopePlan(durSec);
          inst.isDiscrete = rollIsDiscrete();
          inst.state = 'active';
          // Telegraph SFX tracking should not carry into active state.
          try { delete inst._sndPulse; } catch (_) {}
          inst.startT = _t;
          inst.endT = _t + durSec;

          // PASS A41c (UI/log only): record quirk activations into the Log overlay.
          try {
            if (!inst._logActive) {
              inst._logActive = true;
              const UI = (EC.UI_STATE = EC.UI_STATE || {});
              UI.logEntries = UI.logEntries || [];
              const tier = (inst.tpl && typeof inst.tpl.intensityTier === 'number') ? (inst.tpl.intensityTier | 0) : 0;
              const tierTxt = (tier <= 0) ? 'LOW' : (tier === 1) ? 'MID' : 'HIGH';
              const w = (typeof inst.hueIndex === 'number') ? (inst.hueIndex | 0) : 0;
              const typ = typeDisplayName(inst.type);
              UI.logEntries.push({
                tSec: (typeof inst.startT === 'number') ? inst.startT : _t,
                html: '<div><b>Quirk</b> — ' + _escHtml(typ) + ' (' + tierTxt + ') on ' + _spanLogWell(w) + '</div>'
              });
            }
          } catch (_) {}
          // Debug timeline accumulator (event-based; push on end, not per-tick spam)
          try {
            inst._tl = {
              tStart: _t,
              type: inst.type,
              tier: (inst.tpl && typeof inst.tpl.intensityTier === 'number') ? (inst.tpl.intensityTier | 0) : 0,
              hueIndex: inst.hueIndex | 0,
              force: 0
            };
          } catch (_) {}
          // Build warped-progress LUT + initialize painted halo history.
          inst.warp = buildWarpLUT(inst);
          initSegHistory(inst);

          // Per-event amplitude scaling so the integrated total change matches tier targets
          // while preserving the existing ramp→peak→fall envelope shape.
          // For amount-type quirks, total change ≈ strengthEff * ∫intensity(t)dt.
          // For spin-type quirks, this is an impulse proxy; still scales feel by tier.
          try {
            const tier = (inst.tpl && typeof inst.tpl.intensityTier === 'number') ? (inst.tpl.intensityTier | 0) : 0;
            const targetTotal = totalTargetForTier(tier);
            const area = (inst.warp && typeof inst.warp.Iend === 'number') ? Math.max(1e-6, inst.warp.Iend) : Math.max(1e-6, durSec * 0.5);
            inst._strengthEff = targetTotal / area;
          } catch (e) {
            inst._strengthEff = (inst.tpl && typeof inst.tpl.strength === 'number') ? inst.tpl.strength : ((typeof T.DISP_DEFAULT_STRENGTH === 'number') ? T.DISP_DEFAULT_STRENGTH : 3.0);
          }

          // Cache warning brightness for telegraph rendering.
          inst._warnBright = warnBrightnessForTier((inst.tpl && typeof inst.tpl.intensityTier === 'number') ? (inst.tpl.intensityTier | 0) : 0);
          // Slot-based rescheduling is intentionally unused in ramp-based random mode.
          // Roll is per-event; record fire for debug stats
          if (EC.DEBUG) _dbgFireTs.push(_t);
        }
      }

      // 4) Apply active effects + cull ended
      const activeLines = [];
      const teleLines = [];

      for (let k = 0; k < _instances.length; k++) {
        const inst = _instances[k];
        if (!inst) continue;

        if (inst.state === 'telegraph') {
          if (_t < inst.fireAt) {
            const hi = inst.hueIndex;
            teleLines.push(`${typeDisplayName(inst.type)} — ${hueName(hi)} (${dirText(inst.type)})`);
            const rp = ringParamsForType(inst.type);

            // Telegraph timeline (total length = tele):
            //  - First 3.0s: flashing warning ring
            //  - Then 3 cycles: 1.5s fill + 0.5s beat/reset
            const tier = (inst.tpl && typeof inst.tpl.intensityTier === 'number') ? (inst.tpl.intensityTier | 0) : 0;
            const bright = (typeof inst._warnBright === 'number') ? clamp01(inst._warnBright) : warnBrightnessForTier(tier);
            const tInto = clamp01((_t - (inst.fireAt - tele)) / Math.max(1e-6, tele)) * tele;
            let teleMode = 'flash';
            let flash01 = 0;
            let fill01 = 0;
            let beat01 = 0;

            if (tInto < 3.0) {
              teleMode = 'flash';
              const hz = 1.3; // >=3 flashes in 3s
              flash01 = 0.5 + 0.5 * Math.sin((Math.PI * 2) * hz * tInto);
              // SFX: play once per flash pulse during telegraph warning.
              try {
                const pulseIdx = Math.floor(hz * tInto);
                if ((inst._sndPulse | 0) !== pulseIdx) {
                  inst._sndPulse = pulseIdx;
                  if (EC.SFX && typeof EC.SFX.play === 'function') EC.SFX.play('pluck_002');
                }
              } catch (_) {}
            } else {
              const t2 = tInto - 3.0;
              const cycLen = 2.0;
              const inCyc = t2 % cycLen;
              const fillDur = 1.5;
              if (inCyc < fillDur) {
                teleMode = 'fill';
                fill01 = clamp01(inCyc / fillDur);
              } else {
                teleMode = 'beat';
                beat01 = clamp01((inCyc - fillDur) / (cycLen - fillDur));
              }
            }

            _renderList.push({
              phase: 'telegraph',
              teleMode,
              flash01,
              beat01,
              targetIndex: hi,
              type: inst.type,
              intensity01: bright,
              progress01: fill01,
              startAngleRad: rp.startAngleRad,
              dirSign: rp.dirSign
            });
          }
          continue;
        }

        if (inst.state === 'active') {
          if (_t <= inst.endT) {
            // Authoritative: time-sliced painting so historical segment colors are faithful.
            paintTimeSliced(inst, _t);
            const ev = evalIntensity(inst, _t);
            const sh = clamp01(ev.intensity01);
            // Warped halo progress (peak maps to 50% regardless of peak timing)
            const prog01 = warpedProgress01(inst, _t);
            const w = Object.assign({}, inst.tpl, { hueIndex: inst.hueIndex, type: inst.type });
            if (typeof inst._strengthEff === 'number' && isFinite(inst._strengthEff)) w.strength = inst._strengthEff;
            // Debug timeline force accumulation (unshielded; matches SIM._quirkForceTotals semantics)
            try {
              if (inst._tl) {
                const traitMult = (EC.TRAITS && typeof EC.TRAITS.getQuirkStrengthMult === "function") ? EC.TRAITS.getQuirkStrengthMult(SIM) : 1.0;
                const rate = ((w.strength || 0) * sh) * traitMult;
                let dForce = 0;
                if (inst.type === TYPES.LOCKS_IN) {
                  dForce = rate * dt;
                } else if (inst.type === TYPES.CRASHES) {
                  dForce = -rate * dt;
                } else {
                  const S_MIN = (typeof T.S_MIN === 'number') ? T.S_MIN : -100;
                  const S_MAX = (typeof T.S_MAX === 'number') ? T.S_MAX : 100;
                  const hi = inst.hueIndex | 0;
                  const S_raw = (SIM.wellsS && SIM.wellsS[hi] != null) ? Number(SIM.wellsS[hi]) : 0;
                  const target = (inst.type === TYPES.AMPED) ? S_MAX : S_MIN;
                  const delta = target - S_raw;
                  const deltaNorm = Math.max(-1, Math.min(1, delta / 100));
                  const mag = rate * Math.abs(deltaNorm) * dt;
                  dForce = (inst.type === TYPES.AMPED) ? mag : -mag;
                }
                if (isFinite(dForce)) inst._tl.force += dForce;
              }
            } catch (_) {}
            applyWaveToWell(SIM, w, dt, sh);
            activeLines.push(`${typeDisplayName(inst.type)} — ${hueName(inst.hueIndex)} (${intensityLabel(sh)})`);
            const rp = ringParamsForType(inst.type);
            _renderList.push({
              phase: 'active',
              targetIndex: inst.hueIndex,
              type: inst.type,
              intensity01: sh,
              isDiscrete: !!inst.isDiscrete,
              phaseLevel: ev.phaseLevel,
              progress01: prog01,
              // Painted segment history (immutable)
              segP0: inst.segP0,
              segP1: inst.segP1,
              segVal: inst.segVal,
              segN: inst.segN | 0,
              startAngleRad: rp.startAngleRad,
              dirSign: rp.dirSign
            });
          } else {
            // Debug timeline: finalize on end (event-based; uses inst.endT for accuracy)
            try {
              if (inst._tl) {
                if (!Array.isArray(SIM._quirkTimeline)) SIM._quirkTimeline = [];
                const e = inst._tl;
                e.tEnd = inst.endT;
                e.durSec = inst.endT - inst.startT;
                e.type = inst.type;
                e.tier = (e.tier | 0);
                e.hueIndex = inst.hueIndex | 0;
                if (!isFinite(Number(e.force))) e.force = 0;
                SIM._quirkTimeline.push(e);
                while (SIM._quirkTimeline.length > 60) SIM._quirkTimeline.shift();
              }
            } catch (_) {}
            // Per-template ramp: unlock/reset only when this instance ends.
            try {
              const tpl = inst.tpl;
              if (tpl) { tpl._rampLocked = false; tpl._rampElapsedSec = 0; }
            } catch (_) {}
            _instances.splice(k, 1);
            k--;
          }
        }
      }

      // 5) HUD summaries
      if (teleLines.length) {
        teleText = `Incoming Quirk${teleLines.length > 1 ? 's' : ''}: ` + teleLines.slice(0, 2).join(' | ') + (teleLines.length > 2 ? ' ...' : '');
      }
      if (activeLines.length) {
        activeText = `Quirk${activeLines.length > 1 ? 's' : ''} Active: ` + activeLines.slice(0, 2).join(' | ') + (activeLines.length > 2 ? ' ...' : '');
      }

      // Debug-only: events/min over last 180s, plus slot count
      if (EC.DEBUG) {
        const win = 180;
        const cutoff = _t - win;
        _dbgFireTs = _dbgFireTs.filter(ts => ts >= cutoff);
        const epm = (_dbgFireTs.length / (win / 60));
        SIM._dispDbg = {
          slots: _slots ? _slots.length : 0,
          fires180: _dbgFireTs.length,
          epm
        };

        // Throttled console diagnostics (required by prompt)
        if (_dbgConsoleEnabled && ((_t - _dbgLastLogT) >= 1.0)) {
          _dbgLastLogT = _t;
          // Telegraph count + target indices
          const teleIdx = [];
          for (let kk = 0; kk < _instances.length; kk++) {
            const inst = _instances[kk];
            if (inst && inst.state === 'telegraph') teleIdx.push(inst.hueIndex | 0);
          }
          console.log('[EC.DISP][DBG] telegraphs:', teleIdx.length, teleIdx);

          // One active continuous instance sample
          let samp = null;
          for (let kk = 0; kk < _instances.length; kk++) {
            const inst = _instances[kk];
            if (inst && inst.state === 'active' && !inst.isDiscrete && inst.warp) { samp = inst; break; }
          }
          if (samp) {
            const el = Math.max(0, Math.min(samp.env.durationSec || 0, _t - samp.startT));
            const ev = evalIntensity(samp, _t);
            const pNow = warpedProgress01(samp, _t);
            const peakT = samp.startT + (samp.warp.peakEl || 0);
            const pPeak = warpedProgress01(samp, peakT);
            if (_dbgLastSampleId !== samp.id) {
              _dbgLastSampleId = samp.id;
              console.log('[EC.DISP][DBG] sampling continuous id=', samp.id);
            }
            console.log('[EC.DISP][DBG] t/el=', _t.toFixed(2), el.toFixed(2), 'int=', (ev.intensity01 || 0).toFixed(3), 'prog=', pNow.toFixed(3), 'prog@peak≈', pPeak.toFixed(3));
          }
        }
      }

      _hud.telegraphText = teleText;
      _hud.activeText = activeText;
      return;
    }

    // Scheduled mode (legacy test levels)
    for (let i = 0; i < _waves.length; i++) {
      const w = _waves[i];
      const t0 = w.startTime;
      const t1 = w.startTime + w.duration;

      if (_t >= (t0 - tele) && _t < t0) {
        teleText = `Incoming Quirk: ${typeDisplayName(w.type)} — ${hueName(w.hueIndex)} (${dirText(w.type)})`;
        const rp = ringParamsForType(w.type);
        _renderList.push({
          phase: 'telegraph',
          targetIndex: w.hueIndex,
          type: w.type,
          intensity01: clamp01(1 - ((t0 - _t) / Math.max(1e-6, tele))),
          progress01: 0,
          startAngleRad: rp.startAngleRad,
          dirSign: rp.dirSign
        });
      }

      if (_t >= t0 && _t <= t1) {
        const dur = (w.duration || 1);
        const phase = (_t - t0) / dur;
        const sh = shape01(phase);
        applyWaveToWell(SIM, w, dt, sh);
        activeText = `Quirk Active: ${typeDisplayName(w.type)} — ${hueName(w.hueIndex)} (${intensityLabel(sh)})`;
        const rp = ringParamsForType(w.type);
        _renderList.push({
          phase: 'active',
          targetIndex: w.hueIndex,
          type: w.type,
          intensity01: clamp01(sh),
          progress01: clamp01((_t - t0) / dur),
          startAngleRad: rp.startAngleRad,
          dirSign: rp.dirSign
        });
      }
    }

    _hud.telegraphText = teleText;
    _hud.activeText = activeText;
  };

  EC.DISP.getHudState = function getHudState() {
    return {
      telegraphText: _hud.telegraphText || '',
      activeText: _hud.activeText || ''
    };
  };

  // Render-facing state for well highlight/halo.
  // Multiple entries possible (one per reserved well; never more than one per well).
  EC.DISP.getRenderStates = function getRenderStates() {
    // Defensive shallow copy so the renderer doesn't mutate internal arrays.
    return Array.isArray(_renderList) ? _renderList.map(x => Object.assign({}, x)) : [];
  };

  // Backward-compatible single-entry getter (returns first render entry or "none").
  EC.DISP.getRenderState = function getRenderState() {
    const a = (EC.DISP.getRenderStates && EC.DISP.getRenderStates()) || [];
    return a && a.length ? a[0] : {
      phase: 'none',
      targetIndex: -1,
      type: '',
      intensity01: 0,
      progress01: 0,
      startAngleRad: Math.PI * 0.5,
      dirSign: 1
    };
  };

  // Cancels all remaining dispositions (used by Mental Breaks).
  EC.DISP.cancelAll = function cancelAll() {
    // Called by mental breaks: cancel current telegraph/active disposition, but DO NOT disable scheduling.
    // Keep slots/pool intact so dispositions continue normally after a break.
    const hadActive = (_instances && _instances.length) || (_pending && _pending.length);
    _instances = [];
    _pending = [];
    _renderList = [];
    // Clear reservations and delayed/telegraph state bookkeeping
    if (_slots && _slots.length) {
      for (let i = 0; i < _slots.length; i++) {
        if (_slots[i]) _slots[i].announced = false;
      }
    }

    // Reset per-template ramp timers/locks (random mode only).
    try {
      if (_pool && _pool.length) {
        for (let i = 0; i < _pool.length; i++) {
          const tpl = _pool[i];
          if (tpl) { tpl._rampLocked = false; tpl._rampElapsedSec = 0; }
        }
      }
    } catch (_) {}
    // Align whole-second guard so we don't immediately ramp/schedule on the same tick as a break.
    try { _lastWholeSec = Math.floor(_t); } catch (_) {}

    _hud.telegraphText = '';
    _hud.activeText = '';
    // Reset safety net so we don't immediately re-fire a stacked burst after a break.
    _lastFiredAt = -1e9;
    _lastScheduledFireAt = -1e9;

    if (EC.DEBUG && hadActive && _dbgConsoleEnabled) {
      const nexts = _slots.map(s => (s ? (s.nextT != null ? Number(s.nextT).toFixed(1) : 'na') : 'na')).join(',');
      console.log('[EC] DISP cancelAll (break): scheduler intact. slots=' + _slots.length + ' nextT=[' + nexts + ']');
    }
  };

  // Public helper: reset all quirk timers and cancel any pending/telegraph/active quirks.
  // Safe/no-throw; used by mental breaks so quirks do not carry through a break.
  EC.DISP.resetAllQuirkTimers = function resetAllQuirkTimers() {
    try {
      if (EC.DISP && typeof EC.DISP.cancelAll === 'function') EC.DISP.cancelAll();
    } catch (_) {}
  };
})();
