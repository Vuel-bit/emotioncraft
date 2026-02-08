/* systems_dispositions.js — Dispositions (random-ready)
   - Owns EC.DISP (initLevel/update/getHudState/cancelAll)
   - Applies well-only drift during telegraphed waves
   - No direct psyche modification (psyche changes only via existing well→psyche drive)

   Disposition types (player-facing):
     AFFINITY  = Amount ↑
     AVERSION  = Amount ↓
     TENDENCY  = Spin ↑  (always pushes upward)
     DAMPING   = Spin ↓  (always pushes downward)

   Scheduling modes:
     - Scheduled: waves have explicit startTime (legacy test levels)
     - Random: a pool is provided; one wave is selected at a random time

   Notes:
   - Wave shape is smooth 0→1→0 over duration (sin(pi*phase))
   - Spin-type dispositions are scaled by Amount shield: rate *= (A/100)
   - Dispositions must NOT clamp stored sim values (overshoot enables spillover)
*/
(() => {
  const EC = (window.EC = window.EC || {});

  EC._registerModule && EC._registerModule('systems_dispositions', {
    provides: ['EC.DISP'],
    requires: ['EC.TUNE', 'EC.HUES', 'EC.clamp', 'EC.SIM']
  });

  const TYPES = {
    AFFINITY: 'AFFINITY',
    AVERSION: 'AVERSION',
    TENDENCY: 'TENDENCY',
    DAMPING: 'DAMPING'
  };

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function shape01(phase01) {
    const p = clamp01(phase01);
    return Math.sin(Math.PI * p);
  }

  function hueName(idx) {
    const H = EC.HUES || (EC.CONST && EC.CONST.HUES) || [];
    const s = (H && H[idx]) ? String(H[idx]) : `Hue${idx}`;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function dirText(type) {
    if (type === TYPES.AFFINITY) return 'Amount ↑';
    if (type === TYPES.AVERSION) return 'Amount ↓';
    if (type === TYPES.TENDENCY) return 'Spin ↑';
    if (type === TYPES.DAMPING) return 'Spin ↓';
    return '';
  }

  function intensityLabel(x01) {
    const T = EC.TUNE || {};
    const hi = (typeof T.DISP_INTENSITY_HIGH_TH === 'number') ? T.DISP_INTENSITY_HIGH_TH : 0.66;
    const med = (typeof T.DISP_INTENSITY_MED_TH === 'number') ? T.DISP_INTENSITY_MED_TH : 0.33;
    if (x01 >= hi) return 'High';
    if (x01 >= med) return 'Med';
    return 'Low';
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
    if (type === TYPES.TENDENCY) return { startAngleRad: BOTTOM, dirSign: +1 };
    if (type === TYPES.AFFINITY) return { startAngleRad: BOTTOM, dirSign: -1 };
    if (type === TYPES.AVERSION) return { startAngleRad: TOP, dirSign: -1 };
    if (type === TYPES.DAMPING) return { startAngleRad: TOP, dirSign: +1 };
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
    const dur = (typeof w.duration === 'number') ? w.duration : ((typeof T.DISP_DEFAULT_DURATION === 'number') ? T.DISP_DEFAULT_DURATION : 30);
    const type = String(w.type || TYPES.TENDENCY).toUpperCase();
    const o = {
      duration: Math.max(0.1, Number(dur || 30)),
      hueIndex: Math.max(0, Math.min(5, Number(w.hueIndex || 0))),
      type: (TYPES[type] ? TYPES[type] : TYPES.TENDENCY),
      strength: (typeof w.strength === 'number') ? w.strength : ((typeof T.DISP_DEFAULT_STRENGTH === 'number') ? T.DISP_DEFAULT_STRENGTH : 3.0)
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
    _slots[i].nextT = nowT + sampleExp(meanPerSlot());
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
      _slots.push({ tpl: _pool[i], nextT: nowT + sampleExp(m), announced: false });
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

    const wantsRandom = !!(levelDef && (levelDef.dispositionsRandom || levelDef._dispositionsRandom));

    if (wantsRandom) {
      _mode = 'random';
      const src = (levelDef && Array.isArray(levelDef.dispositionsPool)) ? levelDef.dispositionsPool : ((levelDef && Array.isArray(levelDef.dispositions)) ? levelDef.dispositions : []);
      _pool = src.map((d) => normWave(d, false));
      buildSlotsFromPool(_t);
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

    const rateRaw = (w.strength || 0) * sh;

    const hi = w.hueIndex;
    const A_raw = (SIM.wellsA && SIM.wellsA[hi] != null) ? Number(SIM.wellsA[hi]) : 0;
    const S_raw = (SIM.wellsS && SIM.wellsS[hi] != null) ? Number(SIM.wellsS[hi]) : 0;

    // Clamp for reference/shield scaling only
    const A_ref = Math.max(A_MIN, Math.min(A_MAX, A_raw));
    const S_ref = Math.max(S_MIN, Math.min(S_MAX, S_raw));

    if (w.type === TYPES.AFFINITY) {
      SIM.wellsA[hi] = A_raw + rateRaw * dt;
    } else if (w.type === TYPES.AVERSION) {
      SIM.wellsA[hi] = A_raw - rateRaw * dt;
    } else if (w.type === TYPES.TENDENCY) {
      const rateSpin = rateRaw * (A_ref / 100);
      SIM.wellsS[hi] = S_raw + rateSpin * dt;
    } else if (w.type === TYPES.DAMPING) {
      const rateSpin = rateRaw * (A_ref / 100);
      SIM.wellsS[hi] = S_raw - rateSpin * dt;
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

      function beginTelegraphFromPending(p) {
        const free = getFreeWells();
        if (free.length === 0) return false;
        const hi = free[(Math.random() * free.length) | 0];
        const tpl = p.tpl;
        const type = tpl.type;
        const inst = {
          id: _nextId++,
          state: 'telegraph',
          tpl,
          type,
          slotIdx: (p.slotIdx != null ? p.slotIdx : -1),
          hueIndex: hi,
          teleStartT: p.fireAt - tele,
          fireAt: p.fireAt,
          startT: 0,
          endT: 0,
          durationSec: 0,
          env: null
        };
        _instances.push(inst);
        return true;
      }

      // 1) Announce arrivals early enough to show the full telegraph window.
      announceArrivalsForTelegraph(_t, tele);

      // 2) Start telegraphs for pending arrivals when in warning window
      //    If no wells are free, delay the arrival (do not discard).
      for (let i = 0; i < _pending.length; i++) {
        const p = _pending[i];
        if (!p) continue;
        if (_t < (p.fireAt - tele)) continue; // not yet in telegraph window
        // Try to allocate a free well.
        const ok = beginTelegraphFromPending(p);
        if (ok) {
          _pending.splice(i, 1);
          i--;
        } else {
          // Delay and retry later
          p.fireAt = _t + retryDelay;
          // keep sorted by fireAt
          _pending.sort((a, b) => a.fireAt - b.fireAt);
          break;
        }
      }

      // 3) Promote telegraphs to active when their fire time hits.
      for (let k = 0; k < _instances.length; k++) {
        const inst = _instances[k];
        if (!inst || inst.state !== 'telegraph') continue;
        if (_t >= inst.fireAt) {
          const baseDur = (inst.tpl && typeof inst.tpl.duration === 'number') ? inst.tpl.duration : ((typeof T.DISP_DEFAULT_DURATION === 'number') ? T.DISP_DEFAULT_DURATION : 30);
          const durSec = rollDurationSec(baseDur);
          inst.durationSec = durSec;
          inst.env = buildEnvelopePlan(durSec);
          inst.isDiscrete = rollIsDiscrete();
          inst.state = 'active';
          inst.startT = _t;
          inst.endT = _t + durSec;
          // Build warped-progress LUT + initialize painted halo history.
          inst.warp = buildWarpLUT(inst);
          initSegHistory(inst);
          // Now that the event has actually fired, reschedule its slot and clear "announced".
          if (inst.slotIdx != null && inst.slotIdx >= 0) {
            rescheduleSlot(inst.slotIdx, inst.fireAt);
            if (_slots && _slots[inst.slotIdx]) _slots[inst.slotIdx].announced = false;
          }
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
            teleLines.push(`${inst.type} — ${hueName(hi)} (${dirText(inst.type)})`);
            const inten = clamp01(1 - ((inst.fireAt - _t) / Math.max(1e-6, tele)));
            const rp = ringParamsForType(inst.type);
            _renderList.push({
              phase: 'telegraph',
              targetIndex: hi,
              type: inst.type,
              intensity01: inten,
              progress01: 0,
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
            applyWaveToWell(SIM, w, dt, sh);
            activeLines.push(`${inst.type} — ${hueName(inst.hueIndex)} (${intensityLabel(sh)})`);
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
            _instances.splice(k, 1);
            k--;
          }
        }
      }

      // 5) HUD summaries
      if (teleLines.length) {
        teleText = `Incoming Disposition${teleLines.length > 1 ? 's' : ''}: ` + teleLines.slice(0, 2).join(' | ') + (teleLines.length > 2 ? ' ...' : '');
      }
      if (activeLines.length) {
        activeText = `Disposition${activeLines.length > 1 ? 's' : ''} Active: ` + activeLines.slice(0, 2).join(' | ') + (activeLines.length > 2 ? ' ...' : '');
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
        if ((_t - _dbgLastLogT) >= 1.0) {
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
        teleText = `Incoming Disposition: ${w.type} — ${hueName(w.hueIndex)} (${dirText(w.type)})`;
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
        activeText = `Disposition Active: ${w.type} — ${hueName(w.hueIndex)} (${intensityLabel(sh)})`;
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

    _hud.telegraphText = '';
    _hud.activeText = '';
    // No special gap logic; scheduler continues immediately.

    if (EC.DEBUG && hadActive) {
      const nexts = _slots.map(s => (s ? (s.nextT != null ? Number(s.nextT).toFixed(1) : 'na') : 'na')).join(',');
      console.log('[EC] DISP cancelAll (break): scheduler intact. slots=' + _slots.length + ' nextT=[' + nexts + ']');
    }
  };
})();
