// Emotioncraft core_model.js — extracted helpers + constructors (Step 2)
(() => {
  const EC = (window.EC = window.EC || {});
  const TUNING = EC.TUNING;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function _ecStartEnergy() {
    const T = EC.TUNE || {};
    const base = (typeof T.ENERGY_START === 'number') ? T.ENERGY_START : 0;
    const cap = (typeof T.ENERGY_CAP === 'number') ? T.ENERGY_CAP : 200;
    let bonus = 0;
    try {
      if (EC.PAT && typeof EC.PAT.getStartEnergyBonus === 'function') bonus = (EC.PAT.getStartEnergyBonus() || 0);
    } catch (_) {}
    return clamp(base + bonus, 0, cap);
  }


  function lerp(a, b, t) { return a + (b - a) * t; }
  function sign0(v) { return v === 0 ? 0 : (v > 0 ? 1 : -1); }

  // Export shared math helpers
  EC.clamp = clamp;
  EC.lerp = lerp;
  EC.sign0 = sign0;


  // ---------------------------------------------------------------------------
  // Redesign MVP model (Chunk 1)
  // Adds new state + board definition without disturbing legacy prototype state.
  // Canonical hue list lives in core_const.js (EC.CONST.HUES). Keep EC.HUES as alias.
  EC.HUES = EC.HUES || (EC.CONST && EC.CONST.HUES) || ["red","purple","blue","green","yellow","orange"];

  EC.BOARDS = EC.BOARDS || {};
  EC.BOARDS.ZEN = EC.BOARDS.ZEN || {
    targetW: [1/6, 1/6, 1/6, 1/6, 1/6, 1/6],
    tolerance: (EC.TUNE && EC.TUNE.WIN_TOLERANCE) ? EC.TUNE.WIN_TOLERANCE : 0.04,
    holdSeconds: (EC.TUNE && EC.TUNE.WIN_HOLD_SECONDS) ? EC.TUNE.WIN_HOLD_SECONDS : 5,
  };

  // Attach MVP fields onto EC.SIM (does not replace existing SIM usage).
  let SIM = (EC.SIM = EC.SIM || {});

  // Debug SIM root write-guard (warn-only). Enable via:
  // - URL: ?simguard=1
  // - OR EC.UI_STATE.debugStrict === true
  // Root-level only (catches SIM.someKey = ...). Never blocks, never throws.
  (function _maybeWrapSimGuard() {
    try {
      const U = (EC.UI_STATE = EC.UI_STATE || {});
      const qs = (typeof location !== 'undefined' && location && typeof location.search === 'string') ? location.search : '';
      const enabled = (U && U.debugStrict === true) || (qs.indexOf('simguard=1') !== -1);
      if (!enabled) return;
      if (U._simGuardWrapped) return;

      const target = EC.SIM;
      if (!target || typeof target !== 'object') return;

      U._simGuardWrapped = true;
      U.simGuardStats = U.simGuardStats || { count: 0, byKey: {}, samples: [] };
      if (typeof U._simGuardWarnBudget !== 'number') U._simGuardWarnBudget = 50;

      EC.SIM = new Proxy(target, {
        set(t, prop, value, receiver) {
          let allowed = false;
          try {
            // Before ENGINE exists (load-order), allow bootstrap writes to avoid noisy startup spam.
            if (!EC.ENGINE) allowed = true;
            else allowed = !!(EC.ENGINE && EC.ENGINE._simWriteDepth > 0);
          } catch (_) {}

          if (!allowed) {
            try {
              const key = String(prop);
              const stats = (U.simGuardStats = U.simGuardStats || { count: 0, byKey: {}, samples: [] });
              stats.count = (stats.count || 0) + 1;
              if (!stats.byKey || typeof stats.byKey !== 'object') stats.byKey = {};
              stats.byKey[key] = (stats.byKey[key] || 0) + 1;

              // Capture a few samples (key + current tag chain) for HUD display.
              if (!Array.isArray(stats.samples)) stats.samples = [];
              if (stats.samples.length < 10) {
                const tag = (EC.ENGINE && EC.ENGINE._simWriteTag) ? EC.ENGINE._simWriteTag : '';
                stats.samples.push({ key: key, tag: String(tag || '') });
              }

              if ((U._simGuardWarnBudget || 0) > 0) {
                U._simGuardWarnBudget = (U._simGuardWarnBudget || 0) - 1;
                const tag = (EC.ENGINE && EC.ENGINE._simWriteTag) ? EC.ENGINE._simWriteTag : '';
                console.warn('[SIM write-guard] root write outside ENGINE:', key, 'tag=', tag);
                if (U._simGuardWarnBudget === 0) {
                  console.warn('[SIM write-guard] further warnings suppressed');
                }
              }
            } catch (_) {}
          }

          try { return Reflect.set(t, prop, value, receiver); } catch (_) {
            try { t[prop] = value; } catch (_) {}
            return true;
          }
        }
      });

      // Ensure local SIM alias points at the guarded SIM proxy.
      SIM = EC.SIM;
    } catch (_) {}
  })();

  SIM.wellsA = SIM.wellsA || new Array(6).fill(50);
  SIM.wellsS = SIM.wellsS || new Array(6).fill(0);
  SIM.psyP   = SIM.psyP   || new Array(6).fill(100);

  SIM.targetW = SIM.targetW || EC.BOARDS.ZEN.targetW.slice();
  SIM.tolerance = (typeof SIM.tolerance === "number") ? SIM.tolerance : EC.BOARDS.ZEN.tolerance;
  SIM.holdRequired = (typeof SIM.holdRequired === "number") ? SIM.holdRequired : EC.BOARDS.ZEN.holdSeconds;
  SIM.holdCurrent = (typeof SIM.holdCurrent === "number") ? SIM.holdCurrent : 0;

  SIM.energy = (typeof SIM.energy === "number") ? SIM.energy : _ecStartEnergy();
  // ---------------------------------------------------------------------------
  // MVP Level registry (data-driven skeleton)
  // Defines levels as data so adding levels is mostly data-only.
  EC.LEVELS = EC.LEVELS || {};
  if (!EC.LEVELS._inited) {
    const T = EC.TUNE || {};
    const L1_T = (typeof T.LEVEL1_PSY_TARGET === 'number') ? T.LEVEL1_PSY_TARGET : 200;
    const L2_T = (typeof T.LEVEL2_PSY_TARGET === 'number') ? T.LEVEL2_PSY_TARGET : 300;
    const ZEN_LOW = (typeof T.ZEN_LOW === 'number') ? T.ZEN_LOW : 100;
    const ZEN_HIGH = (typeof T.ZEN_HIGH === 'number') ? T.ZEN_HIGH : 120;
    const ZEN_HOLD = (typeof T.ZEN_HOLD_SECONDS === 'number') ? T.ZEN_HOLD_SECONDS : 10;

    const baseRanges = { wellsA: [40, 60], wellsS: [-20, 20], psyP: [80, 120] };

    const mkAllOver = (thr) => Array(6).fill(0).map(() => ({ type: 'OVER', target: thr }));

    const mkAllBand = (low, high) => Array(6).fill(0).map(() => ({ type: 'BAND', low: low, high: high }));

    const defs = [
      {
        id: 1,
        label: 'Level 1',
        name: `All ≥ ${L1_T}`,
        objectiveText: `All psyche colors ≥ ${L1_T}`,
        startRanges: baseRanges,
        goalVizPerHue: mkAllOver(L1_T),
        win: { type: 'ALL_OVER', threshold: L1_T }
      },
      {
        id: 2,
        label: 'Level 2',
        name: `Grit + Nerves ≥ ${L2_T}`,
        objectiveText: `Grit (Red) ≥ ${L2_T} • Nerves (Green) ≥ ${L2_T}`,
        startRanges: baseRanges,
        goalVizPerHue: [
          { type: 'OVER', target: L2_T }, // 0 Red / Grit
          null,                           // 1 Purple
          null,                           // 2 Blue
          { type: 'OVER', target: L2_T }, // 3 Green / Nerves
          null,                           // 4 Yellow
          null,                           // 5 Orange
        ],
        win: { type: 'SOME_OVER', threshold: L2_T, hues: [0, 3] }
      },
      {
        id: 3,
        label: 'Level 3',
        name: 'Zen',
        objectiveText: `Zen: keep all hues ${ZEN_LOW}–${ZEN_HIGH} for ${ZEN_HOLD}s`,
        startRanges: baseRanges,
        goalVizPerHue: mkAllBand(ZEN_LOW, ZEN_HIGH),
        // Dispositions (v2): well-only external waves (psyche changes only via existing well→psyche drive)
        dispositions: [
          // Demo: TENDENCY pushes spin upward (can cross from negative through 0). Amount shields via (A/100).
          { startTime: 10, duration: 30, hueIndex: 2, type: 'TENDENCY', strength: 4.0 }
        ],
        win: { type: 'ALL_BAND_HOLD', low: ZEN_LOW, high: ZEN_HIGH, holdSec: ZEN_HOLD }
      },

      {
        id: 4,
        label: 'Level 4',
        name: 'Zen — Affinity',
        objectiveText: `Zen: keep all hues ${ZEN_LOW}–${ZEN_HIGH} for ${ZEN_HOLD}s`,
        startRanges: baseRanges,
        goalVizPerHue: mkAllBand(ZEN_LOW, ZEN_HIGH),
        dispositions: [
          // AFFINITY: Amount ↑ on Chill (Blue). Allows overshoot for spillover.
          { startTime: 10, duration: 30, hueIndex: 2, type: 'AFFINITY', strength: 4.0 }
        ],
        win: { type: 'ALL_BAND_HOLD', low: ZEN_LOW, high: ZEN_HIGH, holdSec: ZEN_HOLD }
      },
      {
        id: 5,
        label: 'Level 5',
        name: 'Zen — Aversion',
        objectiveText: `Zen: keep all hues ${ZEN_LOW}–${ZEN_HIGH} for ${ZEN_HOLD}s`,
        startRanges: baseRanges,
        goalVizPerHue: mkAllBand(ZEN_LOW, ZEN_HIGH),
        dispositions: [
          // AVERSION: Amount ↓ on Chill (Blue). Allows underflow for spillover.
          { startTime: 10, duration: 30, hueIndex: 2, type: 'AVERSION', strength: 4.0 }
        ],
        win: { type: 'ALL_BAND_HOLD', low: ZEN_LOW, high: ZEN_HIGH, holdSec: ZEN_HOLD }
      },
      {
        id: 6,
        label: 'Level 6',
        name: 'Zen — Damping',
        objectiveText: `Zen: keep all hues ${ZEN_LOW}–${ZEN_HIGH} for ${ZEN_HOLD}s`,
        startRanges: baseRanges,
        goalVizPerHue: mkAllBand(ZEN_LOW, ZEN_HIGH),
        dispositions: [
          // DAMPING: Spin ↓ on Chill (Blue). Scaled by Amount shield (A/100).
          { startTime: 10, duration: 30, hueIndex: 2, type: 'DAMPING', strength: 4.0 }
        ],
        win: { type: 'ALL_BAND_HOLD', low: ZEN_LOW, high: ZEN_HIGH, holdSec: ZEN_HOLD }
      },
    ];

    EC.LEVELS.defs = defs;
    EC.LEVELS.byId = {};
    defs.forEach(d => { EC.LEVELS.byId[d.id] = d; });

    EC.LEVELS.get = function getLevelDef(id) { return EC.LEVELS.byId[id] || null; };
    EC.LEVELS.list = function listLevels() { return EC.LEVELS.defs.slice(); };
    EC.LEVELS._inited = true;
  }


  // Initializes/loads MVP defaults. Safe to call multiple times.
    // Initializes/loads MVP defaults for a given level. Safe to call multiple times.
  // MVP init accepts either a numeric levelId OR a full level definition object.
  // If an object is provided, it becomes the active level definition for this session.
  SIM.initMVP = function initMVP(levelId) {
    const T = EC.TUNE || {};
    const randInt = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));

    // Determine definition: either direct def override or registry lookup.
    const defOverride = (levelId && typeof levelId === 'object') ? levelId : null;
    const reqId = (defOverride && typeof defOverride.id === 'number')
      ? defOverride.id
      : ((typeof levelId === 'number') ? levelId : ((typeof SIM.levelId === 'number') ? SIM.levelId : 1));

    const def = defOverride || ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? (EC.LEVELS.get(reqId) || EC.LEVELS.get(1)) : null);
    const lvl = def ? (def.id || 1) : 1;

    // Remember the active definition so UI/mechanics can reference it without relying on the registry.
    SIM._activeLevelDef = defOverride ? def : null;

    // Level skeleton
    SIM.levelId = lvl;


    SIM.levelState = 'playing';
    SIM.mvpLose = false;
    SIM.gameOver = false;
    SIM.gameOverReason = '';
    SIM.breaksInWindow = 0;

    // Reset MVP timebase on level init so time-gated systems (e.g., Dispositions) restart cleanly.
    SIM.mvpTime = 0;
    // One-shot auto-win return guard (patient sessions). Reset every run.
    SIM._autoWinHandled = false;

    // Log overlay resets per run/patient.
    try {
      const UI = (EC.UI_STATE = EC.UI_STATE || {});
      UI.logEntries = [];
      UI._logRenderN = -1;
    } catch (_) {}

    // Active plan key (patient plans) — used for timed Zen runs.
    try {
      const pk = def && def.win ? def.win.planKey : null;
      SIM._activePlanKey = pk ? String(pk).toUpperCase() : '';
    } catch (_) {
      SIM._activePlanKey = '';
    }

    const _timedKey = String(SIM._activePlanKey || '').toUpperCase();
    const _isTimedPlan = (_timedKey === 'ZEN' || _timedKey === 'TRANQUILITY' || _timedKey === 'TRANSCENDENCE');
    if (_isTimedPlan) {
      const T = EC.TUNE || {};
      const baseSec = (typeof T.ZEN_TIME_LIMIT_SEC === 'number') ? T.ZEN_TIME_LIMIT_SEC : (12 * 60);
      let sec = baseSec;
      try {
        if (EC.TRAITS && typeof EC.TRAITS.getTimedPlanLimitSec === 'function') {
          sec = EC.TRAITS.getTimedPlanLimitSec(SIM, baseSec);
        }
      } catch (_) {}
      SIM.zenTimeRemainingSec = sec;
    } else {
      SIM.zenTimeRemainingSec = null;
    }

    // Init Dispositions for this level (no-op if the module isn't present)
    if (EC.DISP && typeof EC.DISP.initLevel === 'function') {
      EC.DISP.initLevel(def || null);
    }
    // Reset mental-break rolling window + UI banner timers
    if (EC.BREAK && typeof EC.BREAK.reset === 'function') {
      EC.BREAK.reset();
    }

    // Start state:
    // - Patient sessions can provide an explicit startState override (psyP/wellsA/wellsS arrays).
    // - Otherwise we fall back to randomized startRanges.
    const ss = (def && def.startState) ? def.startState : null;
    const hasSS = !!(ss && Array.isArray(ss.psyP) && Array.isArray(ss.wellsA) && Array.isArray(ss.wellsS));
    if (hasSS) {
      for (let i = 0; i < 6; i++) {
        SIM.wellsA[i] = Number(ss.wellsA[i] || 0);
        SIM.wellsS[i] = Number(ss.wellsS[i] || 0);
        SIM.psyP[i]   = Number(ss.psyP[i] || 0);
      }
    } else {
      // Randomized start ranges (defaults)
      const ranges = (def && def.startRanges) ? def.startRanges : { wellsA: [40, 60], wellsS: [-20, 20], psyP: [80, 120] };
      for (let i = 0; i < 6; i++) {
        SIM.wellsA[i] = randInt(ranges.wellsA[0], ranges.wellsA[1]);
        SIM.wellsS[i] = randInt(ranges.wellsS[0], ranges.wellsS[1]);
        SIM.psyP[i]   = randInt(ranges.psyP[0], ranges.psyP[1]);
      }
    }

    // Apply clamps (keep within standardized MVP ranges)
    const A_MIN = (typeof T.A_MIN === 'number') ? T.A_MIN : 25;
    const A_MAX = (typeof T.A_MAX === 'number') ? T.A_MAX : 100;
    const S_MIN = (typeof T.S_MIN === 'number') ? T.S_MIN : -100;
    const S_MAX = (typeof T.S_MAX === 'number') ? T.S_MAX : 100;
    const PSY_HUE_CAP = (typeof T.PSY_HUE_CAP === 'number') ? T.PSY_HUE_CAP : 500;

    for (let i = 0; i < 6; i++) {
      SIM.wellsA[i] = Math.max(A_MIN, Math.min(A_MAX, SIM.wellsA[i]));
      SIM.wellsS[i] = Math.max(S_MIN, Math.min(S_MAX, SIM.wellsS[i]));
      SIM.psyP[i]   = Math.max(0, Math.min(PSY_HUE_CAP, SIM.psyP[i]));
    }

    // Goal viz (used by psyche overlay renderer)
    const cloneGoal = (g) => (g ? { type: g.type, target: g.target, low: g.low, high: g.high } : null);
    const srcGoals = (def && Array.isArray(def.goalVizPerHue)) ? def.goalVizPerHue : null;
    SIM.goalViz = SIM.goalViz || { perHue: new Array(6).fill(null) };
    SIM.goalViz.perHue = new Array(6).fill(null).map((_, i) => cloneGoal(srcGoals ? srcGoals[i] : null));

    // Reset Zen hold timer (used by Level 3)
    SIM.zenHoldSec = 0;


    // Objectives (for side panel / bottom plan panel)
    if (def && def.win && def.win.type === 'PLAN_CHAIN' && Array.isArray(def.win.steps)) {
      SIM.planStep = 0;
      SIM.planHoldSec = 0;
      SIM.objectives = def.win.steps.map((st, i) => ({
        id: `${String(def.win.planKey || 'PLAN').toUpperCase()}_STEP_${i+1}`,
        text: st.text || `Step ${i+1}`,
        complete: false,
        type: 'PLAN_STEP',
        stepIndex: i,
        kind: st.kind,
        holdSec: st.holdSec,
      }));
    } else if (def && def.win && def.win.type === 'ZEN_CHAIN' && Array.isArray(def.win.steps)) {
      // Patient Zen 3-step chain.
      SIM.zenChainStep = 0;
      SIM.zenChainHoldSec = 0;
      SIM.objectives = def.win.steps.map((st, i) => {
        const n = i + 1;
        let text = `Zen Step ${n}: `;
        if (st.kind === 'ALL_OVER') {
          text += `All hues ≥ ${st.threshold}`;
        } else if (st.kind === 'ALL_BAND') {
          text += `All hues ${st.low}–${st.high}`;
        } else {
          text += `Condition`;
        }
        text += ` (hold ${st.holdSec}s)`;
        return { id: `ZEN_STEP_${n}`, text: text, complete: false, type: 'ZEN_STEP', stepIndex: i, holdSec: st.holdSec, kind: st.kind, threshold: st.threshold, low: st.low, high: st.high };
      });
    } else if (def && def.win && def.win.type === 'WEEKLY_HOLD' && Array.isArray(def.win.focusHues)) {
      const hi = (typeof def.win.focusHi === 'number') ? def.win.focusHi : 300;
      const lo = (typeof def.win.otherLo === 'number') ? def.win.otherLo : 150;
      const holdReq = (typeof def.win.holdSec === 'number') ? def.win.holdSec : 10;
      const f = def.win.focusHues.slice(0, 2);
      const n0 = (EC.hueLabel ? EC.hueLabel(f[0]) : (EC.CONST && EC.CONST.HUES ? EC.CONST.HUES[f[0]] : `Hue ${f[0]}`));
      const n1 = (EC.hueLabel ? EC.hueLabel(f[1]) : (EC.CONST && EC.CONST.HUES ? EC.CONST.HUES[f[1]] : `Hue ${f[1]}`));
      SIM.weeklyHoldSec = 0;
      SIM.objectives = [
        { id: 'WEEKLY_FOCUS', text: `Weekly: ${n0} & ${n1} ≥ ${hi}; others ≤ ${lo} (hold ${holdReq}s)`, complete: false, type: 'WEEKLY', focusHues: f, focusHi: hi, otherLo: lo, holdSec: holdReq },
      ];
    } else if (def && def.win && def.win.type === 'ALL_BAND_HOLD') {
      const low = (typeof def.win.low === 'number') ? def.win.low : ((typeof T.ZEN_LOW === 'number') ? T.ZEN_LOW : 100);
      const high = (typeof def.win.high === 'number') ? def.win.high : ((typeof T.ZEN_HIGH === 'number') ? T.ZEN_HIGH : 120);
      const holdReq = (typeof def.win.holdSec === 'number') ? def.win.holdSec : ((typeof T.ZEN_HOLD_SECONDS === 'number') ? T.ZEN_HOLD_SECONDS : 10);
      SIM.objectives = [{ id: 'L3_ZEN', text: `Zen: keep all hues ${low}–${high} for ${holdReq}s`, complete: false, type: 'BAND_HOLD', low: low, high: high, holdSec: holdReq }];
    } else if (def && def.win && def.win.type === 'SOME_OVER' && Array.isArray(def.win.hues)) {
      const thr = (typeof def.win.threshold === 'number') ? def.win.threshold : ((typeof T.LEVEL2_PSY_TARGET === 'number') ? T.LEVEL2_PSY_TARGET : 300);
      SIM.objectives = [
        { id: 'L2_RED_300',   text: `Grit (Red) ≥ ${thr}`,   complete: false, hue: 0, type: 'OVER', target: thr },
        { id: 'L2_GREEN_300', text: `Nerves (Green) ≥ ${thr}`, complete: false, hue: 3, type: 'OVER', target: thr },
      ];
    } else {
      const thr = (def && def.win && typeof def.win.threshold === 'number') ? def.win.threshold : ((typeof T.LEVEL1_PSY_TARGET === 'number') ? T.LEVEL1_PSY_TARGET : 200);
      SIM.objectives = [{ id: 'L1_ALL_PSY_200', text: `Raise ALL psyche colors to ≥ ${thr}`, complete: false }];
    }

    // Reset energy on level start
    SIM.energy = _ecStartEnergy();

    // Selection defaults + slider resync stamp
    // Selection is UI-only (EC.UI_STATE.selectedWellIndex). SIM must not store selectedWellIndex.
    try {
      const UI_STATE = EC.UI_STATE || (EC.UI_STATE = {});
      let sel = (typeof UI_STATE.selectedWellIndex === 'number') ? (UI_STATE.selectedWellIndex | 0) : 0;
      if (!(sel >= 0 && sel < 6)) sel = 0;
      UI_STATE.selectedWellIndex = sel;
      // Force control panel to resync to current selection.
      UI_STATE._controlsSyncStamp = (UI_STATE._controlsSyncStamp || 0) + 1;
      UI_STATE._controlsSyncSel = sel;
    } catch (_) {}

    SIM._mvpInitStamp = (typeof SIM._mvpInitStamp === 'number') ? (SIM._mvpInitStamp + 1) : 1;

    // Clear win flags
    SIM.mvpWin = false;
  };

  // Alias requested name for later chunks. Does not break current prototype.
  SIM.init = SIM.init || function init() { SIM.initMVP(); };

  // Canonical accessor used across UI/render to avoid duplicating lookup logic.
  EC.getActiveLevelDef = EC.getActiveLevelDef || function getActiveLevelDef() {
    const id = (typeof SIM.levelId === 'number') ? SIM.levelId : 1;
    return (SIM._activeLevelDef || (EC.LEVELS && typeof EC.LEVELS.get === 'function' ? EC.LEVELS.get(id) : null));
  };

  // Unified reset hook used by the UI + main init.
  // In MVP mode this resets ONLY the new arrays/state.
  EC.resetRun = EC.resetRun || function resetRunMVP() {
    if (SIM && typeof SIM.initMVP === 'function') {
      SIM.initMVP();
      SIM.mvpWin = false;
      SIM.hasWon = false;
      SIM._loggedMvpWin = false;
      // Clamp UI selection and resync controls (selection is UI-only).
      try {
        const UI_STATE = EC.UI_STATE || (EC.UI_STATE = {});
        let sel = (typeof UI_STATE.selectedWellIndex === 'number') ? (UI_STATE.selectedWellIndex | 0) : 0;
        if (!(sel >= 0 && sel < 6)) sel = 0;
        UI_STATE.selectedWellIndex = sel;
        UI_STATE._controlsSyncStamp = (UI_STATE._controlsSyncStamp || 0) + 1;
      UI_STATE._controlsSyncSel = sel;
      } catch (_) {}
    }
  };

  SIM.getPsycheW = SIM.getPsycheW || function getPsycheW() {
    const P = SIM.psyP || [];
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += (P[i] || 0);
    if (sum <= 0) return [1/6,1/6,1/6,1/6,1/6,1/6];
    const W = new Array(6);
    for (let i = 0; i < 6; i++) W[i] = (P[i] || 0) / sum;
    return W;
  };

  SIM.getWinError = SIM.getWinError || function getWinError() {
    const W = SIM.getPsycheW();
    const Tgt = SIM.targetW || [1/6,1/6,1/6,1/6,1/6,1/6];
    let maxErr = 0;
    for (let i = 0; i < 6; i++) {
      const err = Math.abs((W[i] || 0) - (Tgt[i] || 0));
      if (err > maxErr) maxErr = err;
    }
    return maxErr;
  };


  // Hardening: module registry (no gameplay impact)
  EC._registerModule && EC._registerModule('core_model', { provides: ["EC.clamp", "EC.lerp", "EC.sign0", "EC.getActiveLevelDef", "EC.resetRun"] });
})();