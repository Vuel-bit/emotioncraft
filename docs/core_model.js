// Emotioncraft core_model.js — extracted helpers + constructors (Step 2)
(() => {
  const EC = (window.EC = window.EC || {});
  const TUNING = EC.TUNING;

  const Hue = {
    RED: 'red',
    BLUE: 'blue',
    YELLOW: 'yellow',
    TRAUMA: 'trauma'
  };


  const Lane = {
    RED: 'red',
    BLUE: 'blue',
    YELLOW: 'yellow',
    GREEN: 'green',
    ORANGE: 'orange',
    PURPLE: 'purple',
  };

  const LANE_ASPECTS = {
    red:    { ccw: 'Anger',      still: 'Force',        cw: 'Resolve' },
    blue:   { ccw: 'Fear',       still: 'Mystery',      cw: 'Wonder' },
    yellow: { ccw: 'Greed',      still: 'Want',         cw: 'Purpose' },
    green:  { ccw: 'Envy',       still: 'Comparison',   cw: 'Appreciation' },
    orange: { ccw: 'Obsession',  still: 'Drive',        cw: 'Determination' },
    purple: { ccw: 'Panic',      still: 'Alertness',    cw: 'Vigilance' },
  };

  function blendLaneFromPair(a, b) {
    const set = new Set([a, b]);
    if (set.has('blue') && set.has('yellow')) return Lane.GREEN;
    if (set.has('red') && set.has('blue')) return Lane.PURPLE;
    if (set.has('red') && set.has('yellow')) return Lane.ORANGE;
    return a; // fallback (should not happen)
  }

  function computeDisplayBlendState(w) {
    // Determine dominant/secondary amounts (ignore trauma)
    const comps = [
      { h: 'red', v: w.comp.red },
      { h: 'blue', v: w.comp.blue },
      { h: 'yellow', v: w.comp.yellow },
    ].filter(o => o.v > 0.0001).sort((p,q)=>q.v-p.v);

    if (comps.length < 2) {
      // No meaningful secondary
      w.displayBlend = false;
      return;
    }
    const A1 = comps[0].v;
    const A2 = comps[1].v;
    const T = A1 + A2;
    const r = T <= 0.0001 ? 0 : (A2 / T);
    const enter = TUNING.stateLabels.blendEnter;
    const exit = TUNING.stateLabels.blendExit;
    if (!w.displayBlend) {
      if (r >= enter) w.displayBlend = true;
    } else {
      if (r <= exit) w.displayBlend = false;
    }
  }

  function computeLaneForDisplay(w) {
    const comps = [
      { h: 'red', v: w.comp.red },
      { h: 'blue', v: w.comp.blue },
      { h: 'yellow', v: w.comp.yellow },
    ].filter(o => o.v > 0.0001).sort((p,q)=>q.v-p.v);

    if (comps.length === 0) return Lane.BLUE;
    if (comps.length === 1) return comps[0].h;

    // Ensure blend flag updated
    computeDisplayBlendState(w);

    if (!w.displayBlend) {
      return comps[0].h; // primary lane: dominant hue
    }
    return blendLaneFromPair(comps[0].h, comps[1].h);
  }

  function aspectZoneFromSwirl(s) {
    const dz = TUNING.stateLabels.deadzone;
    if (s <= -dz) return 'ccw';
    if (s >= dz) return 'cw';
    return 'still';
  }

  function aspectIcon(zone) {
    if (zone === 'ccw') return '↺';
    if (zone === 'cw') return '↻';
    return '•';
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sign0(v) { return v === 0 ? 0 : (v > 0 ? 1 : -1); }

  // -----------------------------
  // State model (v0.3-aligned)
  // -----------------------------
  function makeWell(id, name, x, y) {
    return {
      id,
      name,
      pos: { x, y },
      // Nonnegative component amounts
      comp: { red: 0, blue: 0, yellow: 0 },
      // Per-component swirl value in [-1, +1] (CCW negative, Still 0, CW positive)
      swirl: { red: 0, blue: 0, yellow: 0 },
      trauma: 0,
      // temporary event modifiers
      breakTelegraphAt: 0,
      breakStart: 0,
      breakUntil: 0,
      breakBoost: 0,
      breakDir: 1,
      breakCueUntil: 0,
      lastBreakSoundAt: 0,
      breakCooldownUntil: 0,
      // UI feedback cooldowns (safe init; avoids NaN comparisons)
      lastBlendAudioAt: -Infinity,
      lastAspectAudioAt: -Infinity,
      // derived)
      radius: 110,
    };
  }

  function totalAmount(w) {
    return w.comp.red + w.comp.blue + w.comp.yellow;
  }

  

function traumaDensity(w) {
    // visual-only helper (used for particle opacity)
    return w.trauma / (totalAmount(w) + 1);
  }

function netSwirl(w, now) {
    const aR = w.comp.red, aB = w.comp.blue, aY = w.comp.yellow;
    const den = aR + aB + aY;
    let raw = 0;
    if (den > 0) raw = (aR * w.swirl.red + aB * w.swirl.blue + aY * w.swirl.yellow) / den;

    // Break: after a short telegraph window, temporarily boosts net swirl magnitude.
    if (now >= w.breakStart && now < w.breakUntil) {
      // Direction follows current raw swirl; if near still, use pre-chosen breakDir.
      const dz = TUNING.stateLabels.deadzone ?? 0.20;
      const dir = (Math.abs(raw) >= dz) ? Math.sign(raw) : (w.breakDir || 1);
      raw -= w.breakBoost;
    }

    raw = clamp(raw, -1, 1);
    return { raw, dir: sign0(raw), mag: Math.abs(raw) };
  }

  


  // -----------------------------
  // Prototype content
  // -----------------------------
  const PRESETS = {
      mindformA() {
        const w1 = makeWell('w1', 'Well A', 0, 0);
        const w2 = makeWell('w2', 'Well B', 0, 0);

        // Simple start: two primary wells (single-hue) with light swirl and low trauma
        // A: Blue primary
        w1.comp.blue = 36;
        w1.trauma = 2;
        w1.swirl.blue = -0.25;

        // B: Red primary
        w2.comp.red = 34;
        w2.trauma = 2;
        w2.swirl.red = -0.22;

        return [w1, w2];
      }
    };

  // Imprints (prototype set)
  // attune is continuous signed [-1..+1] (CCW negative, Still 0, CW positive)
  const IMPRINTS = [
      {
        id: 'imp_blue_still',
        title: 'Blue • Still • +18',
        hue: Hue.BLUE,
        amount: 18,
        attune: 0,
        catharsis: false,
        desc: 'On-hue. Adds Blue amount. (No attunement)'
      },
      {
        id: 'imp_red_cw',
        title: 'Red • CW • +10 (attune)',
        hue: Hue.RED,
        amount: 10,
        attune: +0.65,
        catharsis: false,
        desc: 'On-hue. Adds Red amount and nudges Red toward CW (positive).'
      },
      {
        id: 'imp_trauma',
        title: 'Trauma Imprint',
        hue: Hue.TRAUMA,
        amount: 0,
        attune: 0,
        catharsis: false,
        desc: 'Adds Trauma to a random Well.'
      },
      {
        id: 'imp_yellow',
        title: 'Yellow • Still • +22',
        hue: Hue.YELLOW,
        amount: 22,
        attune: 0,
        catharsis: false,
        desc: 'Adds Yellow amount. (Use on a primary well to create a two-hue blend.)'
      },
    ];

  function getWellById(id) {
    const SIM = EC.SIM;
    if (!SIM || !Array.isArray(SIM.wells)) return null;
    return SIM.wells.find(w => w.id === id) || null;
  }

  function getImprintById(id) {
    return IMPRINTS.find(i => i.id === id) || null;
  }
  // Export to the single global namespace
  EC.Hue = Hue;
  EC.Lane = Lane;
  EC.LANE_ASPECTS = LANE_ASPECTS;

  EC.blendLaneFromPair = blendLaneFromPair;
  EC.computeDisplayBlendState = computeDisplayBlendState;
  EC.computeLaneForDisplay = computeLaneForDisplay;

  EC.aspectZoneFromSwirl = aspectZoneFromSwirl;
  EC.aspectIcon = aspectIcon;

  EC.clamp = clamp;
  EC.lerp = lerp;
  EC.sign0 = sign0;

  EC.makeWell = makeWell;
  EC.totalAmount = totalAmount;
  EC.traumaDensity = traumaDensity;
  EC.netSwirl = netSwirl;

  EC.PRESETS = PRESETS;
  EC.IMPRINTS = IMPRINTS;
  EC.getWellById = getWellById;
  EC.getImprintById = getImprintById;


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
  const SIM = (EC.SIM = EC.SIM || {});
  SIM.wellsA = SIM.wellsA || new Array(6).fill(50);
  SIM.wellsS = SIM.wellsS || new Array(6).fill(0);
  SIM.psyP   = SIM.psyP   || new Array(6).fill(100);

  SIM.targetW = SIM.targetW || EC.BOARDS.ZEN.targetW.slice();
  SIM.tolerance = (typeof SIM.tolerance === "number") ? SIM.tolerance : EC.BOARDS.ZEN.tolerance;
  SIM.holdRequired = (typeof SIM.holdRequired === "number") ? SIM.holdRequired : EC.BOARDS.ZEN.holdSeconds;
  SIM.holdCurrent = (typeof SIM.holdCurrent === "number") ? SIM.holdCurrent : 0;

  SIM.energy = (typeof SIM.energy === "number") ? SIM.energy : ((EC.TUNE && typeof EC.TUNE.ENERGY_START === 'number') ? EC.TUNE.ENERGY_START : 10);
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

    // Active level definition (patient sessions can supply an override)
    SIM._activeLevelDef = defOverride ? def : null;

    SIM.levelState = 'playing';
    SIM.mvpLose = false;
    SIM.gameOver = false;
    SIM.gameOverReason = '';
    SIM.breaksInWindow = 0;

    // Reset MVP timebase on level init so time-gated systems (e.g., Dispositions) restart cleanly.
    SIM.mvpTime = 0;

    // Init Dispositions for this level (no-op if the module isn't present)
    if (EC.DISP && typeof EC.DISP.initLevel === 'function') {
      EC.DISP.initLevel(def || null);
    }

    // Reset mental-break rolling window + UI banner timers
    if (EC.BREAK && typeof EC.BREAK.reset === 'function') {
      EC.BREAK.reset();
    }

    // Reset break rolling-window timestamps (no impact unless breaks occur)
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
    SIM.energy = (typeof T.ENERGY_START === 'number') ? T.ENERGY_START : 10;

    // Selection defaults + slider resync stamp
    SIM.selectedWellIndex = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : 0;
    if (SIM.selectedWellIndex < 0 || SIM.selectedWellIndex > 5) SIM.selectedWellIndex = 0;

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
      // Keep selection valid but safe.
      if (typeof SIM.selectedWellIndex !== 'number') SIM.selectedWellIndex = 0;
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
  EC._registerModule && EC._registerModule('core_model', { provides: ["EC.Hue", "EC.Lane", "EC.LANE_ASPECTS", "EC.blendLaneFromPair", "EC.computeDisplayBlendState", "EC.computeLaneForDisplay", "EC.aspectZoneFromSwirl", "EC.aspectIcon", "EC.clamp", "EC.lerp", "EC.sign0", "EC.makeWell", "EC.totalAmount", "EC.traumaDensity", "EC.netSwirl", "EC.PRESETS", "EC.IMPRINTS", "EC.getWellById", "EC.getImprintById"] });
})();
