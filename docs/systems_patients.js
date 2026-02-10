/* Emotioncraft — Patients (v0.2.76)
   Patients are randomized per start (no persistence):
   - Identity: name, tagline, portrait (scaffold)
   - Starting State: Mindset (psyche) + Vibe (wells)
   - Quirks: uses existing systems_dispositions.js engine
   - Treatment Plan: multi-step chain with rolled targets
   - Traits scaffold (no mechanics yet)

   Exposes: EC.PAT = { list(), get(id), start(id), backToLobby() }
   No ES modules; window.EC namespace.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const SIM = (EC.SIM = EC.SIM || {});
  const CONST = EC.CONST || {};

  const T = () => (EC.TUNE || {});

  const hueName = (i) => (EC.hueLabel ? EC.hueLabel(i) : ((CONST.HUES && CONST.HUES[i]) ? CONST.HUES[i] : `Hue ${i}`));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => (a + Math.random() * (b - a));
  const randInt = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------------------------------------------------------------------------
  // Player-facing quirk names/intensity labels
  function quirkTypeName(t) {
    const s = String(t || '').toUpperCase();
    if (s === 'AMPED') return 'Amped';
    if (s === 'LOCKS_IN') return 'Locks In';
    if (s === 'CRASHES') return 'Crashes';
    if (s === 'SPIRALS') return 'Spirals';
    // Legacy aliases
    if (s === 'TENDENCY') return 'Amped';
    if (s === 'DAMPING') return 'Spirals';
    if (s === 'AFFINITY') return 'Locks In';
    if (s === 'AVERSION') return 'Crashes';
    return s;
  }

  function quirkIntensityLabel(tier) {
    const n = Math.max(0, Math.min(2, Math.round(Number(tier || 0))));
    if (n === 2) return 'Intense';
    if (n === 1) return 'Noticeable';
    return 'Low-Key';
  }

  // ---------------------------------------------------------------------------
  // Mindset generator (psyche start)
  function sampleMindsetTotal(label) {
    const ranges = T().PAT_MINDSET_TOTAL_RANGES || {};
    const r = ranges[label] || ranges.Steady || [925, 1075];
    return randInt(r[0], r[1]);
  }

  // Adjust array to sum to total while respecting min/max bounds.
  function forceSumWithBounds(vals, total, minV, maxV) {
    const out = vals.slice(0, 6);
    for (let i = 0; i < 6; i++) out[i] = clamp(Math.round(out[i]), minV, maxV);

    let sum = out.reduce((a, b) => a + b, 0);
    let guard = 0;
    while (sum !== total && guard++ < 4000) {
      const need = total - sum;
      // If we need to add, choose a hue with room.
      if (need > 0) {
        const candidates = [];
        for (let i = 0; i < 6; i++) if (out[i] < maxV) candidates.push(i);
        if (!candidates.length) break;
        const idx = pick(candidates);
        out[idx] += 1;
        sum += 1;
      } else {
        const candidates = [];
        for (let i = 0; i < 6; i++) if (out[i] > minV) candidates.push(i);
        if (!candidates.length) break;
        const idx = pick(candidates);
        out[idx] -= 1;
        sum -= 1;
      }
    }
    return { out, ok: (sum === total) };
  }

  function genMindsetPsy(label, template) {
    const total = sampleMindsetTotal(label);
    const avg = total / 6;
    const minV = (typeof T().PAT_PSY_START_MIN === 'number') ? T().PAT_PSY_START_MIN : 50;
    const maxV = (typeof T().PAT_PSY_START_MAX === 'number') ? T().PAT_PSY_START_MAX : 350;
    const tiltFrac = (typeof T().PAT_SPREAD_TILT_FRAC === 'number') ? T().PAT_SPREAD_TILT_FRAC : 0.35;
    const spikeFrac = (typeof T().PAT_SPREAD_SPIKE_FRAC === 'number') ? T().PAT_SPREAD_SPIKE_FRAC : 0.75;
    const flatJ = (typeof T().PAT_SPREAD_FLAT_JITTER_FRAC === 'number') ? T().PAT_SPREAD_FLAT_JITTER_FRAC : 0.10;

    const tries = 40;
    const temp = String(template || 'Flat');

    for (let attempt = 0; attempt < tries; attempt++) {
      const vals = new Array(6).fill(avg);
      const deltas = new Array(6).fill(0);

      if (temp === 'Flat') {
        // Small jitter only.
        for (let i = 0; i < 6; i++) {
          deltas[i] += rand(-flatJ, flatJ) * avg;
        }
      } else if (temp === 'Tilted') {
        // Two hues both high OR both low by ≥30% of avg.
        const idxs = [0,1,2,3,4,5].sort(() => Math.random() - 0.5).slice(0, 2);
        const sign = (Math.random() < 0.5) ? -1 : 1;
        const d = sign * (tiltFrac * avg);
        deltas[idxs[0]] += d;
        deltas[idxs[1]] += d;
        // Compensate across the other four.
        const comp = -2 * d / 4;
        for (let i = 0; i < 6; i++) if (idxs.indexOf(i) < 0) deltas[i] += comp;
        // Light jitter
        for (let i = 0; i < 6; i++) deltas[i] += rand(-0.03, 0.03) * avg;
      } else if (temp === 'Split') {
        // One high and one low.
        const idxs = [0,1,2,3,4,5].sort(() => Math.random() - 0.5);
        const hi = idxs[0], lo = idxs[1];
        const d = tiltFrac * avg;
        deltas[hi] += d;
        deltas[lo] -= d;
        for (let i = 0; i < 6; i++) deltas[i] += rand(-0.03, 0.03) * avg;
      } else if (temp === 'Spike') {
        // One hue high OR low by ≥70% of avg.
        const idx = randInt(0, 5);
        const sign = (Math.random() < 0.5) ? -1 : 1;
        const d = sign * (spikeFrac * avg);
        deltas[idx] += d;
        const comp = -d / 5;
        for (let i = 0; i < 6; i++) if (i !== idx) deltas[i] += comp;
        for (let i = 0; i < 6; i++) deltas[i] += rand(-0.02, 0.02) * avg;
      } else {
        // Unknown template: fallback to Flat.
        for (let i = 0; i < 6; i++) deltas[i] += rand(-flatJ, flatJ) * avg;
      }

      for (let i = 0; i < 6; i++) vals[i] = avg + deltas[i];

      // First clamp, then force exact sum.
      const { out, ok } = forceSumWithBounds(vals, total, minV, maxV);
      if (!ok) continue;

      // Additional template validity checks (relative to avg).
      const rel = out.map((v) => (v - avg) / Math.max(1e-6, avg));
      const absRel = rel.map((r) => Math.abs(r));
      if (temp === 'Tilted') {
        const above = rel.filter((r) => r >= 0.30).length;
        const below = rel.filter((r) => r <= -0.30).length;
        if (!(above >= 2 || below >= 2)) continue;
      }
      if (temp === 'Split') {
        const above = rel.filter((r) => r >= 0.30).length;
        const below = rel.filter((r) => r <= -0.30).length;
        if (!(above >= 1 && below >= 1)) continue;
      }
      if (temp === 'Spike') {
        if (!(absRel.some((r) => r >= 0.70))) continue;
      }

      return { total, psyP: out };
    }

    // Fail-safe fallback: Flat-ish within bounds.
    const total2 = total;
    const base = new Array(6).fill(avg);
    for (let i = 0; i < 6; i++) base[i] += rand(-flatJ, flatJ) * avg;
    const { out } = forceSumWithBounds(base, total2, minV, maxV);
    return { total: total2, psyP: out };
  }

  // ---------------------------------------------------------------------------
  // Vibe generator (wells start)
  function triSample(minV, maxV) {
    // Triangular distribution peaked mid.
    const u = Math.random();
    const v = Math.random();
    const t = (u + v) / 2;
    return minV + t * (maxV - minV);
  }

  function genVibeWells(vibeLabel) {
    const A_MIN = (typeof T().A_MIN === 'number') ? T().A_MIN : 25;
    const A_MAX = (typeof T().A_MAX === 'number') ? T().A_MAX : 100;
    const S_MIN = (typeof T().S_MIN === 'number') ? T().S_MIN : -100;
    const S_MAX = (typeof T().S_MAX === 'number') ? T().S_MAX : 100;

    const bands = T().PAT_VIBE_BANDS || {
      Crisis: [-75,-50], Blah: [-50,-25], Mid: [-25,25], Anxious: [25,50], Freaking: [50,75]
    };
    const band = bands[vibeLabel] || bands.Mid || [-25, 25];
    const flipChance = (typeof T().PAT_VIBE_FLIP_CHANCE === 'number') ? T().PAT_VIBE_FLIP_CHANCE : 0.10;
    const maxFlips = (typeof T().PAT_VIBE_MAX_FLIPS === 'number') ? T().PAT_VIBE_MAX_FLIPS : 3;

    const meanNegMax = (typeof T().PAT_VIBE_MEAN_NEG_MAX === 'number') ? T().PAT_VIBE_MEAN_NEG_MAX : -10;
    const meanPosMin = (typeof T().PAT_VIBE_MEAN_POS_MIN === 'number') ? T().PAT_VIBE_MEAN_POS_MIN : 10;
    const negCountMin = (typeof T().PAT_VIBE_NEG_COUNT_MIN === 'number') ? T().PAT_VIBE_NEG_COUNT_MIN : 4;
    const posCountMin = (typeof T().PAT_VIBE_POS_COUNT_MIN === 'number') ? T().PAT_VIBE_POS_COUNT_MIN : 4;

    const errMeanNegMax = (typeof T().PAT_VIBE_ERR_MEAN_NEG_MAX === 'number') ? T().PAT_VIBE_ERR_MEAN_NEG_MAX : -2;
    const errMeanPosMin = (typeof T().PAT_VIBE_ERR_MEAN_POS_MIN === 'number') ? T().PAT_VIBE_ERR_MEAN_POS_MIN : 2;
    const errNegCountMin = (typeof T().PAT_VIBE_ERR_NEG_COUNT_MIN === 'number') ? T().PAT_VIBE_ERR_NEG_COUNT_MIN : 3;
    const errPosCountMin = (typeof T().PAT_VIBE_ERR_POS_COUNT_MIN === 'number') ? T().PAT_VIBE_ERR_POS_COUNT_MIN : 3;

    const wantNeg = (vibeLabel === 'Crisis' || vibeLabel === 'Blah');
    const wantPos = (vibeLabel === 'Anxious' || vibeLabel === 'Freaking');
    const wantMid = (vibeLabel === 'Mid');

    for (let attempt = 0; attempt < 80; attempt++) {
      const wellsA = new Array(6).fill(0).map(() => Math.round(triSample(A_MIN, A_MAX)));
      let wellsS = new Array(6).fill(0).map(() => randInt(band[0], band[1]));

      // Apply flip chance with max flips.
      let flips = 0;
      const flipIdx = [0,1,2,3,4,5].sort(() => Math.random() - 0.5);
      for (let i = 0; i < 6; i++) {
        if (flips >= maxFlips) break;
        const idx = flipIdx[i];
        if (Math.random() < flipChance) {
          wellsS[idx] = -wellsS[idx];
          flips += 1;
        }
      }

      // Clamp spins
      wellsS = wellsS.map((s) => clamp(s, S_MIN, S_MAX));

      // Integrity checks
      const mean = wellsS.reduce((a,b)=>a+b,0) / 6;
      const negCount = wellsS.filter((s)=>s < 0).length;
      const posCount = wellsS.filter((s)=>s > 0).length;

      const erratic = (flips >= 2);
      let ok = true;
      if (wantNeg) {
        if (!erratic) {
          ok = (mean <= meanNegMax) && (negCount >= negCountMin);
        } else {
          ok = (mean <= errMeanNegMax) && (negCount >= errNegCountMin);
        }
      } else if (wantPos) {
        if (!erratic) {
          ok = (mean >= meanPosMin) && (posCount >= posCountMin);
        } else {
          ok = (mean >= errMeanPosMin) && (posCount >= errPosCountMin);
        }
      } else if (wantMid) {
        // Centered: avoid strong bias.
        ok = (Math.abs(mean) <= 10);
      }

      if (!ok) continue;

      const vibeTag = erratic ? `${vibeLabel} (Erratic)` : vibeLabel;
      return { wellsA, wellsS, vibeTag, erratic };
    }

    // Fail-safe
    const wellsA = new Array(6).fill(0).map(() => Math.round(triSample(A_MIN, A_MAX)));
    const wellsS = new Array(6).fill(0).map(() => 0);
    return { wellsA, wellsS, vibeTag: `${vibeLabel} (Erratic)`, erratic: true };
  }

  // ---------------------------------------------------------------------------
  // Treatment plan generators (rolled per start)
  function planName(key) {
    const k = String(key || '').toUpperCase();
    if (k === 'ZEN') return 'Zen';
    if (k === 'WEEKLY') return 'Weekly Checkup';
    if (k === 'INTAKE') return 'Intake Patient';
    return key;
  }

  function buildPlanZen() {
    const holdSec = (typeof T().PAT_BAND_HOLD_SECONDS === 'number') ? T().PAT_BAND_HOLD_SECONDS : 10;
    return {
      planKey: 'ZEN',
      steps: [
        { kind: 'ALL_OVER', threshold: 200, holdSec, text: `Step 1: All hues ≥ 200 (hold ${holdSec}s)` },
        { kind: 'ALL_BAND', low: 140, high: 175, holdSec, text: `Step 2: All hues 140–175 (hold ${holdSec}s)` },
        { kind: 'ALL_BAND', low: 100, high: 115, holdSec, text: `Step 3: All hues 100–115 (hold ${holdSec}s)` },
        { kind: 'SPIN_ZERO', text: `Step 4: All well spins = 0` },
      ],
      goalVizPerHue: new Array(6).fill(null).map(() => ({ type: 'OVER', target: 200 })),
    };
  }

  function buildPlanWeekly() {
    const holdSec = (typeof T().PAT_BAND_HOLD_SECONDS === 'number') ? T().PAT_BAND_HOLD_SECONDS : 10;
    const even = [0,2,4];
    const odd = [1,3,5];
    const pickEven = Math.random() < 0.5;
    const hiSet = pickEven ? even : odd;
    const loSet = pickEven ? odd : even;

    const s1hi = 350, s1lo = 150;
    const s2hi = 300, s2lo = 200;
    const bandLow = 200, bandHigh = 300;

    const setLabel = pickEven ? '{0,2,4}' : '{1,3,5}';

    const steps = [
      {
        kind: 'SET_BOUNDS', highs: hiSet.slice(), lows: loSet.slice(), hiMin: s1hi, loMax: s1lo,
        text: `Step 1: Alternating ${setLabel} ≥ ${s1hi}; other 3 ≤ ${s1lo}`
      },
      {
        kind: 'SET_BOUNDS', highs: loSet.slice(), lows: hiSet.slice(), hiMin: s2hi, loMax: s2lo,
        text: `Step 2: Swap — previous highs ≤ ${s2lo}; other 3 ≥ ${s2hi}`
      },
      {
        kind: 'ALL_BAND', low: bandLow, high: bandHigh, holdSec,
        text: `Step 3: All hues 200–300 (hold ${holdSec}s)`
      },
      { kind: 'SPIN_ZERO', text: `Step 4: All well spins = 0` },
    ];

    // Seed goal viz with step 1
    const isHigh = (i) => hiSet.indexOf(i) >= 0;
    const isLow = (i) => loSet.indexOf(i) >= 0;
    const goalVizPerHue = new Array(6).fill(null).map((_, i) => {
      if (isHigh(i)) return { type: 'OVER', target: s1hi };
      if (isLow(i)) return { type: 'UNDER', target: s1lo };
      return null;
    });

    return { planKey: 'WEEKLY', steps, goalVizPerHue, rolled: { pickEven } };
  }

  function buildPlanIntake() {
    const holdSec = (typeof T().PAT_BAND_HOLD_SECONDS === 'number') ? T().PAT_BAND_HOLD_SECONDS : 10;
    const pairStart = randInt(0, 5);
    const pair = [pairStart, (pairStart + 1) % 6];
    const remaining = [0,1,2,3,4,5].filter((h) => pair.indexOf(h) < 0);
    const third = pick(remaining);

    const s1hi = 300, s1lo = 150;
    const s2hi = 300, s2lo = 200;
    const bandLow = 200, bandHigh = 300;

    const steps = [
      {
        kind: 'SET_BOUNDS', highs: pair.slice(), lows: remaining.slice(), hiMin: s1hi, loMax: s1lo,
        text: `Step 1: Adjacent ${hueName(pair[0])} + ${hueName(pair[1])} ≥ ${s1hi}; other 4 ≤ ${s1lo}`
      },
      {
        kind: 'SET_BOUNDS', highs: [third], lows: [0,1,2,3,4,5].filter((h) => h !== third), hiMin: s2hi, loMax: s2lo,
        text: `Step 2: Shift — ${hueName(third)} ≥ ${s2hi}; all others ≤ ${s2lo}`
      },
      {
        kind: 'ALL_BAND', low: bandLow, high: bandHigh, holdSec,
        text: `Step 3: All hues 200–300 (hold ${holdSec}s)`
      },
      { kind: 'SPIN_ZERO', text: `Step 4: All well spins = 0` },
    ];

    // Seed goal viz with step 1
    const isHigh = (i) => (i === pair[0] || i === pair[1]);
    const goalVizPerHue = new Array(6).fill(null).map((_, i) => {
      if (isHigh(i)) return { type: 'OVER', target: s1hi };
      return { type: 'UNDER', target: s1lo };
    });

    return { planKey: 'INTAKE', steps, goalVizPerHue, rolled: { pair, third } };
  }

  function buildTreatmentPlan(planKey) {
    const k = String(planKey || '').toUpperCase();
    if (k === 'WEEKLY') return buildPlanWeekly();
    if (k === 'INTAKE') return buildPlanIntake();
    return buildPlanZen();
  }

  // ---------------------------------------------------------------------------
  // Patient schema
  const PATIENTS = [
  {
    id: 'sally', levelId: 201,
    name: 'Sally Sadeyes',
    tagline: '“What’s the point?”',
    portrait: 'assets/patients/sally_sadeyes.png',
    mood: { label: 'Drained', template: 'Tilted' },
    vibe: { label: 'Blah' },
    planKey: 'INTAKE',
    quirks: [
      { type: 'SPIRALS', intensityTier: 0 },
      { type: 'CRASHES', intensityTier: 1 },
    ],
    traits: [],
  },
  {
    id: 'stan', levelId: 202,
    name: 'Stable Stan',
    tagline: '“It’s all good”',
    portrait: 'placeholder',
    mood: { label: 'Steady', template: 'Flat' },
    vibe: { label: 'Mid' },
    planKey: 'WEEKLY',
    quirks: [
      { type: 'LOCKS_IN', intensityTier: 0 },
      { type: 'AMPED', intensityTier: 0 },
    ],
    traits: [],
  },
  {
    id: 'carl', levelId: 203,
    name: 'Crackhead Carl',
    tagline: '“MORE!”',
    portrait: 'placeholder',
    mood: { label: 'Antsy', template: 'Spike' },
    vibe: { label: 'Anxious' },
    planKey: 'WEEKLY',
    quirks: [
      { type: 'AMPED', intensityTier: 2 },
      { type: 'LOCKS_IN', intensityTier: 1 },
    ],
    traits: [],
  },
  {
    id: 'randy', levelId: 204,
    name: 'Raging Randy',
    tagline: '“!!”',
    portrait: 'placeholder',
    mood: { label: 'Overwhelmed', template: 'Split' },
    vibe: { label: 'Freaking' },
    planKey: 'INTAKE',
    quirks: [
      { type: 'CRASHES', intensityTier: 0 },
      { type: 'LOCKS_IN', intensityTier: 0 },
    ],
    traits: [],
  },
  {
    id: 'yew', levelId: 205,
    name: 'Yew Luus',
    tagline: '“you lose”',
    portrait: 'placeholder',
    mood: { label: 'Spent', template: 'Spike' },
    vibe: { label: 'Crisis' },
    planKey: 'ZEN',
    quirks: [
      { type: 'CRASHES', intensityTier: 2 },
      { type: 'SPIRALS', intensityTier: 2 },
    ],
    traits: [],
  },
  {
    id: 'russ', levelId: 206,
    name: 'Russ Random',
    tagline: '“anything can happen”',
    portrait: 'placeholder',
    mood: { label: 'Drained', template: 'Split' },
    vibe: { label: 'Anxious' },
    planKey: 'WEEKLY',
    quirks: [
      { type: 'AMPED', intensityTier: 1 },
      { type: 'SPIRALS', intensityTier: 1 },
    ],
    traits: [],
  },
];


  function getById(id) {
    return PATIENTS.find((p) => p.id === id) || null;
  }

  // Build a level def for a patient session. Patients randomize startState + plan params per start().
  function buildPatientLevelDef(patient, startState, plan) {
    const def = {
      id: patient.levelId,
      label: patient.name,

      // Patient starts are explicit arrays.
      startState: startState,

      // Quirks (random scheduler)
      dispositionsRandom: true,
      dispositionsPool: Array.isArray(patient.quirks)
        ? patient.quirks.map((q) => ({
            duration: (typeof q.duration === 'number') ? q.duration : ((T().DISP_DEFAULT_DURATION != null) ? T().DISP_DEFAULT_DURATION : 30),
            hueIndex: q.hueIndex,
            type: q.type,
            strength: (typeof q.strength === 'number') ? q.strength : ((T().DISP_DEFAULT_STRENGTH != null) ? T().DISP_DEFAULT_STRENGTH : 3.0),
            intensityTier: (typeof q.intensityTier === 'number') ? q.intensityTier : 0,
          }))
        : [],

      // Treatment plan
      win: {
        type: 'PLAN_CHAIN',
        planKey: plan.planKey,
        steps: plan.steps,
        rolled: plan.rolled || {},
      },
      objectiveText: `${planName(plan.planKey)} — ${plan.steps.length} steps`,
      goalVizPerHue: plan.goalVizPerHue,

      _isPatient: true,
      _patientId: patient.id,
      _patientName: patient.name,
      _patientTagline: patient.tagline || '',
      _patientPortrait: patient.portrait || '',
      _patientMindset: patient._mindsetTag || '',
      _patientVibe: patient._vibeTag || '',
      _patientPlanName: planName(plan.planKey),
    };
    return def;
  }

  // List for lobby UI
  function list() {
    return PATIENTS.map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline || '',
      portrait: p.portrait || '',
      mindsetLabel: (p.mood || p.mindset) ? (p.mood || p.mindset).label : 'Steady',
      moodLabel: (p.mood || p.mindset) ? (p.mood || p.mindset).label : 'Steady',
      mindsetTemplate: (p.mood || p.mindset) ? (p.mood || p.mindset).template : 'Flat',
      moodTemplate: (p.mood || p.mindset) ? (p.mood || p.mindset).template : 'Flat',
      vibeLabel: p.vibe ? p.vibe.label : 'Mid',
      planKey: p.planKey,
      planName: planName(p.planKey),
      quirkCount: Array.isArray(p.quirks) ? p.quirks.length : 0,
      quirkSummary: Array.isArray(p.quirks) ? p.quirks.map((q) => quirkTypeName(q.type)).join(', ') : '',
      quirkLineTexts: Array.isArray(p.quirks) ? p.quirks.map((q) => `${quirkTypeName(q.type)}: ${quirkIntensityLabel(q.intensityTier)}`) : [],
    }));
  }

  // Generate a fresh start state + plan roll per run.
  function genStartState(patient) {
    const m = patient.mood || patient.mindset || { label: 'Steady', template: 'Flat' };
    const v = patient.vibe || { label: 'Mid' };

    const mRes = genMindsetPsy(m.label, m.template);
    const vRes = genVibeWells(v.label);

    // Tag strings for lobby/hud.
    patient._mindsetTag = `${m.label} • ${m.template}`;
    patient._vibeTag = vRes.vibeTag;

    // Clamp psyche to engine cap (starts max 350 anyway)
    const PSY_CAP = (typeof T().PSY_HUE_CAP === 'number') ? T().PSY_HUE_CAP : 500;
    const psyP = mRes.psyP.map((x) => clamp(x, 0, PSY_CAP));

    return {
      psyP,
      wellsA: vRes.wellsA,
      wellsS: vRes.wellsS,
    };
  }

  function start(id) {
    const p = getById(id);
    if (!p) return;

    // Cache active patient portrait path for rendering (so render code doesn't chase defs).
    const pr = (p && typeof p.portrait === 'string') ? (p.portrait || '') : '';
    SIM._patientPortrait = (pr && pr !== 'placeholder') ? pr : '';

    const ss = genStartState(p);
    const plan = buildTreatmentPlan(p.planKey);
    const def = buildPatientLevelDef(p, ss, plan);

    SIM._patientActive = true;
    SIM._patientId = p.id;
    SIM._patientLevelId = def.id;
    SIM.inLobby = false;

    if (SIM && typeof SIM.initMVP === 'function') {
      SIM.initMVP(def);
      // Ensure state flags are consistent.
      SIM.mvpWin = false;
      SIM.levelState = 'playing';
      SIM.mvpLose = false;
      SIM.gameOver = false;
      SIM.gameOverReason = '';
    }

    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
  }

  function backToLobby() {
    SIM.inLobby = true;
    SIM._patientActive = false;
    SIM._patientId = null;
    SIM._patientLevelId = null;
    SIM._patientPortrait = '';
    SIM._patientPortrait = '';

    if (SIM && typeof SIM.initMVP === 'function') {
      SIM.initMVP(1);
      SIM.inLobby = true;
    }

    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
  }

  // Soft lobby open: pause the simulation behind the lobby overlay without resetting.
  function openLobbyPause() {
    SIM.inLobby = true;
    // Keep SIM._patientActive + current sim state intact for Resume.
    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
  }

  function resumeFromLobby() {
    SIM.inLobby = false;
    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
  }

  // Restart the currently active patient session from scratch.
  function restartActive() {
    if (!SIM._patientActive || !SIM._patientId) return;
    start(SIM._patientId);
  }

  // Hook Reset: when in a patient session, Reset restarts the same patient (not Lobby).
  if (!EC.PAT && typeof EC.resetRun === 'function') {
    const _baseReset = EC.resetRun;
    EC.resetRun = function resetRunPatientsAware() {
      if (SIM && SIM._patientActive) {
        restartActive();
        return;
      }
      _baseReset();
    };
  }

  EC.PAT = {
    list,
    get: getById,
    start,
    backToLobby,
    openLobbyPause,
    resumeFromLobby,
    restartActive,
    _buildPlan: buildTreatmentPlan,
  };
})();
