/* Emotioncraft — Patients (v0_2_92_set0_units)
   - Authoritative 10-patient roster + 3-slot lobby rotation (pool queue).
   - Intake gating + plan choice (Weekly vs Zen timed).
   - Minimal outcome tracking (intakeDone + lastOutcome), in-memory only (no save schema yet).
   - Exposes: list(), get(id), beginFromLobby(id), startPending(planKey), startRun(id, planKey),
              start(id, planKey) (compat), backToLobby(), openLobbyPause(), resumeFromLobby(),
              restartActive(), update(dt) (no-op hook).
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
    if (s === 'AMPED') return 'Obsesses';
    if (s === 'LOCKS_IN') return 'Fixates';
    if (s === 'CRASHES') return 'Crashes';
    if (s === 'SPIRALS') return 'Spirals';
    // Legacy aliases
    if (s === 'TENDENCY') return 'Obsesses';
    if (s === 'DAMPING') return 'Spirals';
    if (s === 'AFFINITY') return 'Fixates';
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
  // ---------------------------------------------------------------------------
// Treatment plan generators (rolled per start)
function planName(key) {
  const k = String(key || '').toUpperCase();
  if (k === 'ZEN') return 'Zen';
  if (k === 'TRANQUILITY') return 'Tranquility';
  if (k === 'TRANSCENDENCE') return 'Transcendence';
  if (k === 'WEEKLY') return 'Weekly Checkup';
  if (k === 'INTAKE') return 'Intake Patient';
  return key;
}

function buildPlanZen() {
  // Timed 10:00 (timer handled by core_mechanics). No holds unless specified.
  return {
    planKey: 'ZEN',
    steps: [
      { kind: 'SET_BOUNDS', highs: [], lows: [0,1,2,3,4,5], hiMin: 0, loMax: 99, holdSec: 0, text: 'Step 1: All hues < 100' },
      { kind: 'ALL_BAND', low: 200, high: 250, holdSec: 0, text: 'Step 2: All hues 200–250' },
      { kind: 'ALL_OVER', threshold: 401, holdSec: 0, text: 'Step 3: All hues > 400' },
      { kind: 'SPIN_ZERO', text: 'Step 4: All well spins = 0' },
    ],
    // Seed goal viz with step 1
    goalVizPerHue: new Array(6).fill(null).map(() => ({ type: 'UNDER', target: 99 })),
  };
}

function buildPlanTranquility() {
  return {
    planKey: 'TRANQUILITY',
    steps: [
      { kind: 'ALL_OVER', threshold: 401, holdSec: 0, text: 'Step 1: All hues > 400' },
      { kind: 'ALL_BAND', low: 200, high: 250, holdSec: 0, text: 'Step 2: All hues 200–250' },
      { kind: 'ALL_BAND', low: 100, high: 125, holdSec: 0, text: 'Step 3: All hues 100–125' },
      { kind: 'SPIN_ZERO', text: 'Step 4: All well spins = 0' },
    ],
    goalVizPerHue: new Array(6).fill(null).map(() => ({ type: 'OVER', target: 401 })),
  };
}

function buildPlanTranscendence() {
  const even = [0,2,4];
  const odd = [1,3,5];
  const pickEvenLow = Math.random() < 0.5;
  const lowSet = pickEvenLow ? even : odd;
  const highSet = pickEvenLow ? odd : even;

  // "below 50" => <= 49; "above 450" => >= 451 (psyche is integer-rounded in PLAN_CHAIN)
  const loMax = 49;
  const hiMin = 451;

  const lowLabel = pickEvenLow ? '{0,2,4}' : '{1,3,5}';
  const highLabel = pickEvenLow ? '{1,3,5}' : '{0,2,4}';

  const steps = [
    { kind: 'ALL_BAND', low: 240, high: 260, holdSec: 0, text: 'Step 1: All hues 240–260' },
    {
      kind: 'SET_BOUNDS', highs: highSet.slice(), lows: lowSet.slice(), hiMin, loMax, holdSec: 0,
      text: `Step 2: Alternating — ${lowLabel} < 50; ${highLabel} > 450`
    },
    {
      kind: 'SET_BOUNDS', highs: lowSet.slice(), lows: highSet.slice(), hiMin, loMax, holdSec: 0,
      text: 'Step 3: Swap Step 2'
    },
    { kind: 'SPIN_ZERO', text: 'Step 4: All well spins = 0' },
  ];

  const goalVizPerHue = new Array(6).fill(null).map(() => ({ type: 'BAND', low: 240, high: 260 }));
  return { planKey: 'TRANSCENDENCE', steps, goalVizPerHue, rolled: { pickEvenLow } };
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
  // INTAKE (3 steps):
  // 1) Adjacent hues > 350; others < 150 (hold 10s)
  // 2) One non-adjacent hue > 300; others < 200 (hold 10s)
  // 3) All hues 200–300 (no hold)
  const pairStart = randInt(0, 5);
  const pair = [pairStart, (pairStart + 1) % 6];
  const remaining = [0,1,2,3,4,5].filter((h) => pair.indexOf(h) < 0);

  // Non-adjacent to the pair: the opposite pair (pairStart+3 or pairStart+4 mod 6)
  const cand = [ (pairStart + 3) % 6, (pairStart + 4) % 6 ];
  const third = pick(cand);

  // Integers match PLAN_CHAIN rounded psyche comparisons.
  const s1hi = 351, s1lo = 149;
  const s2hi = 301, s2lo = 199;

  const steps = [
    {
      kind: 'SET_BOUNDS', highs: pair.slice(), lows: remaining.slice(), hiMin: s1hi, loMax: s1lo, holdSec: 10,
      text: `Step 1: Adjacent ${hueName(pair[0])} + ${hueName(pair[1])} > 350; other 4 < 150 (hold 10s)`
    },
    {
      kind: 'SET_BOUNDS', highs: [third], lows: [0,1,2,3,4,5].filter((h) => h !== third), hiMin: s2hi, loMax: s2lo, holdSec: 10,
      text: `Step 2: Shift — ${hueName(third)} > 300; all others < 200 (hold 10s)`
    },
    {
      kind: 'ALL_BAND', low: 200, high: 300, holdSec: 0,
      text: 'Step 3: All hues 200–300'
    },
  ];

  // Seed goal viz with step 1
  const isHigh = (i) => (i === pair[0] || i === pair[1]);
  const goalVizPerHue = new Array(6).fill(null).map((_, i) => {
    if (isHigh(i)) return { type: 'OVER', target: s1hi };
    return { type: 'UNDER', target: s1lo };
  });

  return { planKey: 'INTAKE', steps, goalVizPerHue, rolled: { pair, third, pairStart } };
}

function buildTreatmentPlan(planKey) {
  const k = String(planKey || '').toUpperCase();
  if (k === 'WEEKLY') return buildPlanWeekly();
  if (k === 'INTAKE') return buildPlanIntake();
  if (k === 'TRANQUILITY') return buildPlanTranquility();
  if (k === 'TRANSCENDENCE') return buildPlanTranscendence();
  return buildPlanZen();
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
    // -------------------------------------------------------------------------
  // Patient roster (authoritative) + lobby rotation state
  // Notes:
  // - Mood label is player-facing; mood.template is internal-only (generation).
  // - Lobby shows 3 patients at a time (slots), drawn from a shuffled pool queue.
  // - Runtime state is kept in-memory (no save schema yet in this chunk).
  // -------------------------------------------------------------------------

  const ROSTER = [
    {
      id: 'steady_eddie',
      levelId: 201,
      name: 'Steady Eddie',
      tagline: 'No surprises, no refunds.',
      portrait: 'assets/patients/steady_eddie.png',
      mood: { label: 'Steady', template: 'Flat' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 1 },
      ],
    },
    {
      id: 'buzzy_barry',
      levelId: 202,
      name: 'Buzzy Barry',
      tagline: 'I came, I saw, I overcommitted.',
      portrait: 'assets/patients/buzzy_barry.png',
      mood: { label: 'Steady', template: 'Tilted' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 1 },
        { type: 'AMPED', intensityTier: 0 },
      ],
    },
    {
      id: 'waverly_wade',
      levelId: 203,
      name: 'Waverly Wade',
      tagline: 'Ask again later. Or earlier. Or never.',
      portrait: 'assets/patients/waverly_wade.png',
      mood: { label: 'Drained', template: 'Split' },
      vibe: { label: 'Mid' },
      traits: [],
      quirks: [
        { type: 'SPIRALS', intensityTier: 1 },
        { type: 'CRASHES', intensityTier: 1 },
      ],
    },
    {
      id: 'tightwire_tina',
      levelId: 204,
      name: 'Tightwire Tina',
      tagline: 'If it’s quiet, I’ll fix that.',
      portrait: 'assets/patients/tightwire_tina.png',
      mood: { label: 'Steady', template: 'Split' },
      vibe: { label: 'Anxious' },
      traits: [],
      quirks: [
        { type: 'AMPED', intensityTier: 1 },
        { type: 'LOCKS_IN', intensityTier: 1 },
      ],
    },
    {
      id: 'porcelain_paige',
      levelId: 205,
      name: 'Porcelain Paige',
      tagline: 'Please don’t tap the glass.',
      portrait: 'assets/patients/porcelain_paige.png',
      mood: { label: 'Steady', template: 'Spike' },
      vibe: { label: 'Anxious' },
      traits: ['sensitive'],
      quirks: [
        { type: 'SPIRALS', intensityTier: 0 },
        { type: 'LOCKS_IN', intensityTier: 1 },
      ],
    },
    {
      id: 'restless_rex',
      levelId: 206,
      name: 'Restless Rex',
      tagline: 'Tired is a rumor.',
      portrait: 'assets/patients/restless_rex.png',
      mood: { label: 'Drained', template: 'Tilted' },
      vibe: { label: 'Anxious' },
      traits: [],
      quirks: [
        { type: 'AMPED', intensityTier: 1 },
        { type: 'SPIRALS', intensityTier: 1 },
      ],
    },
    {
      id: 'brickwall_ben',
      levelId: 207,
      name: 'Brickwall Ben',
      tagline: 'I’ll compromise after the heat death of the universe.',
      portrait: 'assets/patients/brickwall_ben.png',
      mood: { label: 'Spent', template: 'Flat' },
      vibe: { label: 'Mid' },
      traits: ['stubborn'],
      quirks: [
        { type: 'SPIRALS', intensityTier: 0 },
        { type: 'CRASHES', intensityTier: 2 },
        { type: 'LOCKS_IN', intensityTier: 1 },
      ],
    },
    {
      id: 'fogbound_fiona',
      levelId: 208,
      name: 'Fogbound Fiona',
      tagline: 'I brought my personality—some assembly required.',
      portrait: 'assets/patients/fogbound_fiona.png',
      mood: { label: 'Overwhelmed', template: 'Flat' },
      vibe: { label: 'Blah' },
      traits: ['sensitive'],
      quirks: [
        { type: 'LOCKS_IN', intensityTier: 2 },
        { type: 'SPIRALS', intensityTier: 0 },
        { type: 'AMPED', intensityTier: 0 },
      ],
    },
    {
      id: 'cornered_carl',
      levelId: 209,
      name: 'Cornered Carl',
      tagline: 'I’m fine. I’m just… aggressively fine.',
      portrait: 'assets/patients/cornered_carl.png',
      mood: { label: 'Spent', template: 'Split' },
      vibe: { label: 'Anxious' },
      traits: ['stubborn'],
      quirks: [
        { type: 'AMPED', intensityTier: 1 },
        { type: 'CRASHES', intensityTier: 1 },
        { type: 'LOCKS_IN', intensityTier: 0 },
      ],
    },
    {
      id: 'sally_sadeyes',
      levelId: 210,
      name: 'Sally Sadeyes',
      tagline: 'If hope knocks, I’m ‘out of office.’',
      portrait: 'assets/patients/sally_sadeyes.png',
      mood: { label: 'Drained', template: 'Spike' },
      vibe: { label: 'Blah' },
      traits: ['sensitive'],
      quirks: [
        { type: 'SPIRALS', intensityTier: 1 },
        { type: 'CRASHES', intensityTier: 2 },
        { type: 'LOCKS_IN', intensityTier: 0 },
      ],
    },
    {
      id: 'clenchjaw_june',
      levelId: 211,
      name: 'Clenchjaw June',
      tagline: 'Deep breaths are for other people.',
      portrait: 'assets/patients/clenchjaw_june.png',
      mood: { label: 'Antsy', template: 'Tilted' },
      vibe: { label: 'Anxious' },
      traits: ['stubborn'],
      quirks: [
        { type: 'AMPED', intensityTier: 1 },
        { type: 'LOCKS_IN', intensityTier: 2 },
        { type: 'CRASHES', intensityTier: 0 },
      ],
    },
    {
      id: 'hurricane_hank',
      levelId: 212,
      name: 'Hurricane Hank',
      tagline: 'Fast isn’t frantic. It’s efficient.',
      portrait: 'assets/patients/hurricane_hank.png',
      mood: { label: 'Steady', template: 'Spike' },
      vibe: { label: 'Freaking' },
      traits: [],
      quirks: [
        { type: 'AMPED', intensityTier: 2 },
        { type: 'SPIRALS', intensityTier: 2 },
        { type: 'CRASHES', intensityTier: 0 },
        { type: 'LOCKS_IN', intensityTier: 0 },
      ],
    },
  ];


  const STATE = {
    patientsById: Object.create(null),
    poolQueue: [],
    lobbySlots: [null, null, null],
    transcendedIds: [],
    // Post-run progression UI state
    pendingWeeklyRewardId: null,
    pendingZenCongratsId: null,
    pendingIntakeCongratsId: null,
    pendingStartId: null,
    activePatientId: null,
  };

  function normTemplate(t) {
    const s = String(t || '').trim().toUpperCase();
    if (s === 'FLAT') return 'Flat';
    if (s === 'TILTED') return 'Tilted';
    if (s === 'SPIKE') return 'Spike';
    if (s === 'SPLIT') return 'Split';
    // Back-compat with older titlecase inputs.
    if (s === 'TILTED'.toUpperCase()) return 'Tilted';
    if (s === 'SPIKE'.toUpperCase()) return 'Spike';
    if (s === 'SPLIT'.toUpperCase()) return 'Split';
    if (s === 'FLAT'.toUpperCase()) return 'Flat';
    // If already a known titlecase string, keep it.
    const tt = String(t || 'Flat');
    if (tt === 'Flat' || tt === 'Tilted' || tt === 'Spike' || tt === 'Split') return tt;
    return 'Flat';
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function isTranscended(id) {
    return STATE.transcendedIds.indexOf(id) >= 0;
  }

  

  function getTranscendedCount() {
    const known = new Set(ROSTER.map((p) => p.id));
    const seen = new Set();
    let n = 0;
    (STATE.transcendedIds || []).forEach((id) => {
      const sid = id ? String(id) : '';
      if (!sid) return;
      if (!known.has(sid)) return;
      if (seen.has(sid)) return;
      seen.add(sid);
      n += 1;
    });
    return n;
  }

  function getUnlockedRosterCount() {
    // Only the first 8 are available initially; +1 unlocked per transcended, capped at roster size.
    return Math.min(8 + getTranscendedCount(), ROSTER.length);
  }

  function getUnlockedIdSet() {
    const n = getUnlockedRosterCount();
    const out = new Set();
    for (let i = 0; i < n; i++) out.add(ROSTER[i].id);
    return out;
  }

  function isUnlocked(id) {
    if (!id) return false;
    const sid = String(id);
    const n = getUnlockedRosterCount();
    for (let i = 0; i < n; i++) {
      if (ROSTER[i].id === sid) return true;
    }
    return false;
  }
function _uniq(arr) {
    const out = [];
    const seen = new Set();
    (arr || []).forEach((x) => {
      if (!x) return;
      if (seen.has(x)) return;
      seen.add(x);
      out.push(x);
    });
    return out;
  }

  function _sanitizeSlots(slots) {
    const out = [null, null, null];
    const seen = new Set();
    for (let i = 0; i < 3; i++) {
      const id = slots && slots[i] ? String(slots[i]) : null;
      if (!id) continue;
      if (!STATE.patientsById[id]) continue;
      if (!isUnlocked(id)) continue;
      if (isTranscended(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out[i] = id;
    }
    // Fill nulls from pool later.
    return out;
  }

  function ensurePoolIntegrity(reason) {
    try {
      // Remove transcended + duplicates.
      STATE.lobbySlots = _sanitizeSlots(STATE.lobbySlots);
      const slotSet = new Set(STATE.lobbySlots.filter(Boolean));
      const activeId = (SIM && SIM._patientActive && SIM._patientId) ? String(SIM._patientId) : null;
      STATE.poolQueue = _uniq((STATE.poolQueue || []).map((x) => String(x))).filter((id) => {
        if (!id) return false;
        if (!STATE.patientsById[id]) return false;
        if (!isUnlocked(id)) return false;
        if (isTranscended(id)) return false;
        if (slotSet.has(id)) return false;
        if (activeId && id === activeId) return false;
        return true;
      });

      // If poolQueue is empty, rebuild.
      if (!STATE.poolQueue.length) {
        rebuildPoolQueue();
      }

      // Fill any empty slots.
      for (let i = 0; i < 3; i++) {
        if (!STATE.lobbySlots[i]) fillSlot(i);
      }

      // Ensure no missing ids (except a held-out weekly-reward patient).
      const held = STATE.pendingWeeklyRewardId;
      const unlocked = getUnlockedIdSet();
      const all = Array.from(unlocked).filter((id) => !isTranscended(id));
      const present = new Set([ ...STATE.lobbySlots.filter(Boolean), ...(STATE.poolQueue || []), ...(activeId ? [activeId] : []) ]);
      all.forEach((id) => {
        if (held && id === held) return;
        if (activeId && id === activeId) return;
        if (!present.has(id)) {
          STATE.poolQueue.push(id);
          present.add(id);
        }
      });

      // Final de-dupe.
      const slotSet2 = new Set(STATE.lobbySlots.filter(Boolean));
      STATE.poolQueue = _uniq(STATE.poolQueue).filter((id) => !slotSet2.has(id) && isUnlocked(id) && !isTranscended(id) && !!STATE.patientsById[id]);

      if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
      if (reason) { try { requestSave(String(reason)); } catch (_) {} }
    } catch (_) {
      // Silent: never spam console.
    }
  }

  function initPatientsState() {
    STATE.patientsById = Object.create(null);
    ROSTER.forEach((p) => {
      STATE.patientsById[p.id] = {
        id: p.id,
        levelId: p.levelId,
        name: p.name,
        tagline: p.tagline || '',
        portrait: p.portrait || 'placeholder',
        mood: { label: (p.mood && p.mood.label) ? p.mood.label : 'Steady', template: (p.mood && p.mood.template) ? p.mood.template : 'FLAT' },
        vibe: { label: (p.vibe && p.vibe.label) ? p.vibe.label : 'Mid' },
        traits: Array.isArray(p.traits) ? p.traits.slice() : [],
        quirks: Array.isArray(p.quirks) ? p.quirks.map((q) => ({ type: q.type, intensityTier: (typeof q.intensityTier === 'number') ? q.intensityTier : 0 })) : [],
        // Runtime state (persist later; in-memory for now)
        intakeDone: false,
        zenDone: false,
        tranquilityDone: false,
        lastOutcome: '—',
      };
    });

    // Initial slot fill: shuffle unlocked, take first 3 to slots, remainder to poolQueue.
    const unlocked = getUnlockedIdSet();
    const ids = shuffle(Object.keys(STATE.patientsById).filter((id) => unlocked.has(id) && !isTranscended(id)));
    STATE.lobbySlots = [null, null, null];
    for (let i = 0; i < 3; i++) {
      STATE.lobbySlots[i] = ids[i] || null;
    }
    STATE.poolQueue = ids.slice(3);
  }

  function rebuildPoolQueue() {
    const inSlots = new Set(STATE.lobbySlots.filter(Boolean));
    const activeId = (SIM && SIM._patientActive && SIM._patientId) ? String(SIM._patientId) : null;
    const ids = Object.keys(STATE.patientsById).filter((id) => isUnlocked(id) && !isTranscended(id) && !inSlots.has(id) && (!activeId || id !== activeId));
    STATE.poolQueue = shuffle(ids);

    try { requestSave('rebuildPoolQueue'); } catch (_) {}
  }

  function nextFromPool() {
    const inSlots = new Set(STATE.lobbySlots.filter(Boolean));
    while (true) {
      if (!STATE.poolQueue || !STATE.poolQueue.length) rebuildPoolQueue();
      if (!STATE.poolQueue.length) return null;
      const id = STATE.poolQueue.shift();
      if (!id) continue;
      if (!STATE.patientsById[id]) continue;
      if (!isUnlocked(id)) continue;
      if (isTranscended(id)) continue;
      if (inSlots.has(id)) continue;
      return id;
    }
  }

  function fillSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex > 2) return;
    const nextId = nextFromPool();
    STATE.lobbySlots[slotIndex] = nextId;
  }

  function removeFromSlotsAndRefill(id) {
    const idx = STATE.lobbySlots.indexOf(id);
    if (idx >= 0) {
      STATE.lobbySlots[idx] = null;
      fillSlot(idx);
    }
    // Mark lobby dirty for rerender.
    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
    try { requestSave('slotRefill'); } catch (_) {}
  }

  function removeFromQueue(id) {
    if (!id) return;
    if (!STATE.poolQueue || !STATE.poolQueue.length) return;
    STATE.poolQueue = STATE.poolQueue.filter((x) => x !== id);
  }

  function removeFromSlots(id) {
    if (!id) return;
    const idx = STATE.lobbySlots.indexOf(id);
    if (idx >= 0) {
      STATE.lobbySlots[idx] = null;
      fillSlot(idx);
    }
  }

  function transcendPatient(id) {
    if (!id) return false;
    if (!STATE.patientsById[id]) return false;
    if (!isTranscended(id)) STATE.transcendedIds.push(id);
    // Remove everywhere.
    removeFromQueue(id);
    removeFromSlots(id);
    if (STATE.pendingStartId === id) STATE.pendingStartId = null;
    if (STATE.activePatientId === id) STATE.activePatientId = null;
    if (STATE.pendingWeeklyRewardId === id) STATE.pendingWeeklyRewardId = null;
    if (STATE.pendingZenCongratsId === id) STATE.pendingZenCongratsId = null;
    // Clear UI selection if it points at a transcended patient.
    if (EC.UI_STATE && EC.UI_STATE.selectedPatientId === id) EC.UI_STATE.selectedPatientId = null;
    ensurePoolIntegrity();
    return true;
  }

  function _titlecase(s) {
    return String(s || '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/(^|\s)\w/g, (m) => m.toUpperCase());
  }

  function _weeklyRewardLabel(kind, detail) {
    if (kind === 'QUIRK') return `Weekly success: eased ${quirkTypeName(detail)}.`;
    if (kind === 'MOOD') return 'Weekly success: mood steadier.';
    if (kind === 'VIBE') return 'Weekly success: vibe steadier.';
    if (kind === 'TRAIT') return `Weekly success: removed trait ${_titlecase(detail)}.`;
    return 'Weekly success.';
  }

  function applyWeeklyReward(action) {
    const pid = STATE.pendingWeeklyRewardId;
    if (!pid) return false;
    const p = getById(pid);
    if (!p) { STATE.pendingWeeklyRewardId = null; return false; }

    const a = action && typeof action === 'object' ? action : {};
    const kind = String(a.kind || '').toUpperCase();

    let did = false;
    if (kind === 'QUIRK') {
      const idx = (typeof a.index === 'number') ? Math.floor(a.index) : -1;
      if (Array.isArray(p.quirks) && idx >= 0 && idx < p.quirks.length) {
        const q = p.quirks[idx];
        const old = (typeof q.intensityTier === 'number') ? q.intensityTier : 0;
        q.intensityTier = Math.max(0, old - 1);
        p.lastOutcome = _weeklyRewardLabel('QUIRK', q.type);
        did = true;
      }
    } else if (kind === 'MOOD') {
      const cur = String((p.mood && p.mood.label) ? p.mood.label : 'Steady');
      const map = { 'Spent': 'Drained', 'Drained': 'Steady', 'Overwhelmed': 'Antsy', 'Antsy': 'Steady', 'Steady': 'Steady' };
      if (!p.mood || typeof p.mood !== 'object') p.mood = { label: 'Steady', template: 'FLAT' };
      p.mood.label = map[cur] || 'Steady';
      p.lastOutcome = _weeklyRewardLabel('MOOD');
      did = true;
    } else if (kind === 'VIBE') {
      const cur = String((p.vibe && p.vibe.label) ? p.vibe.label : 'Mid');
      const map = { 'Crisis': 'Blah', 'Blah': 'Mid', 'Freaking': 'Anxious', 'Anxious': 'Mid', 'Mid': 'Mid' };
      if (!p.vibe || typeof p.vibe !== 'object') p.vibe = { label: 'Mid' };
      p.vibe.label = map[cur] || 'Mid';
      p.lastOutcome = _weeklyRewardLabel('VIBE');
      did = true;
    } else if (kind === 'TRAIT') {
      const idx = (typeof a.index === 'number') ? Math.floor(a.index) : -1;
      if (Array.isArray(p.traits) && p.traits.length && idx >= 0 && idx < p.traits.length) {
        const removed = p.traits.splice(idx, 1)[0];
        p.lastOutcome = _weeklyRewardLabel('TRAIT', removed);
        did = true;
      }
    }

    if (!did) return false;

    // Return patient to end of queue.
    STATE.pendingWeeklyRewardId = null;
    const inSlots = STATE.lobbySlots.indexOf(pid) >= 0;
    const inQueue = STATE.poolQueue.indexOf(pid) >= 0;
    if (!inSlots && !inQueue && !isTranscended(pid)) STATE.poolQueue.push(pid);
    ensurePoolIntegrity();
    try { requestSave('weekly_reward'); } catch (_) {}
    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
    return true;
  }

  // Initialize on load
  initPatientsState();


  function getById(id) {
    return (id && STATE.patientsById && STATE.patientsById[id]) ? STATE.patientsById[id] : null;
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

    // List for lobby UI (3-slot view)
  function list() {
    const out = [];
    const slots = Array.isArray(STATE.lobbySlots) ? STATE.lobbySlots : [];
    for (let i = 0; i < slots.length; i++) {
      const id = slots[i];
      if (!id) continue;
      const p = getById(id);
      if (!p) continue;
      out.push({
        id: p.id,
        name: p.name,
        tagline: p.tagline || '',
        portrait: p.portrait || '',
        moodLabel: (p.mood && p.mood.label) ? p.mood.label : 'Steady',
        moodTemplate: (p.mood && p.mood.template) ? p.mood.template : 'FLAT',
        vibeLabel: (p.vibe && p.vibe.label) ? p.vibe.label : 'Mid',
        traits: Array.isArray(p.traits) ? p.traits.slice() : [],
        quirks: Array.isArray(p.quirks) ? p.quirks.map((q) => ({ type: q.type, intensityTier: (typeof q.intensityTier === 'number') ? q.intensityTier : 0 })) : [],
        intakeDone: !!p.intakeDone,
        zenDone: !!p.zenDone,
        tranquilityDone: !!p.tranquilityDone,
        lastOutcome: (typeof p.lastOutcome === 'string') ? p.lastOutcome : '—',
        quirkCount: Array.isArray(p.quirks) ? p.quirks.length : 0,
      });
    }
    return out;
  }

  // Generate a fresh start state + plan roll per run.
  function genStartState(patient) {
    const m = patient.mood || patient.mindset || { label: 'Steady', template: 'Flat' };
    const v = patient.vibe || { label: 'Mid' };

    const mRes = genMindsetPsy(m.label, normTemplate(m.template));
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

    // Lobby begin: remove patient from slots and immediately refill from poolQueue.
  // This reserves the patient for the upcoming run (plan selected in the lobby UI).
  function beginFromLobby(id) {
    if (!id) return;
    STATE.pendingStartId = id;
    removeFromSlotsAndRefill(id);
  }

  function startPending(planKey) {
    const id = STATE.pendingStartId;
    if (!id) return;
    STATE.pendingStartId = null;
    startRun(id, planKey);
  }

  function startRun(id, planKey) {
    const p = getById(id);
    if (!p) return;

    const k = String(planKey || '').toUpperCase();
    const useKey = k || (p.intakeDone ? 'WEEKLY' : 'INTAKE');

    // Attach current patient traits to SIM (used by EC.TRAITS).
    SIM.patientTraits = Array.isArray(p.traits) ? p.traits.slice() : [];

    // Cache active patient portrait path for rendering (avoid missing-asset fetch unless real art exists).
    const pr = (p && typeof p.portrait === 'string') ? (p.portrait || '') : '';
    SIM._patientPortrait = (pr && pr !== 'placeholder') ? pr : '';

    const ss = genStartState(p);
    const plan = buildTreatmentPlan(useKey);
    const def = buildPatientLevelDef(p, ss, plan);

    SIM._patientActive = true;
    SIM._patientId = p.id;
    SIM._patientLevelId = def.id;
    SIM._patientPlanKey = useKey;
    SIM.inLobby = false;

    STATE.activePatientId = p.id;

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

  // Back-compat: start immediately (no lobby rotation).
  function start(id, planKey) {
    startRun(id, planKey);
  }

  

  function backToLobby() {
    // Record outcome + progression logic before resetting SIM.
    try {
      const pid = (SIM && SIM._patientId) ? SIM._patientId : STATE.activePatientId;
      const p = pid ? getById(pid) : null;
      if (p) {
        const planKey = String((SIM && (SIM._patientPlanKey || SIM._activePlanKey)) || '').toUpperCase();
        const isWin = !!((SIM && (SIM.levelState === 'win')) || (SIM && SIM.mvpWin));
        const isLose = !!((SIM && (SIM.levelState === 'lose')) || (SIM && SIM.mvpLose) || (SIM && SIM.gameOver));
        const reason = (SIM && typeof SIM.gameOverReason === 'string') ? SIM.gameOverReason : '';


// INTAKE progression: on win, unlock plans.
if (planKey === 'INTAKE') {
  if (isWin) {
    p.intakeDone = true;
    p.lastOutcome = 'Intake complete.';
    // Show one-time lobby popup on return.
    STATE.pendingIntakeCongratsId = p.id;

    // Return to rotation.
    if (!isTranscended(p.id)) {
      const inSlots = STATE.lobbySlots.indexOf(p.id) >= 0;
      const inQueue = STATE.poolQueue.indexOf(p.id) >= 0;
      if (!inSlots && !inQueue) STATE.poolQueue.push(p.id);
    }
    try { requestSave('intake_complete'); } catch (_) {}
  }
} else if (planKey === 'WEEKLY') {
  if (isWin) {
    // Hold out of rotation until reward is chosen.
    STATE.pendingWeeklyRewardId = p.id;
    p.lastOutcome = 'Weekly success.';
    // Do not return to queue yet.
  } else if (isLose) {
    p.lastOutcome = 'Weekly failed.';
    const inSlots = STATE.lobbySlots.indexOf(p.id) >= 0;
    const inQueue = STATE.poolQueue.indexOf(p.id) >= 0;
    if (!inSlots && !inQueue && !isTranscended(p.id)) STATE.poolQueue.push(p.id);
    ensurePoolIntegrity();
    try { requestSave('weekly_loss'); } catch (_) {}
  }
} else if (planKey === 'ZEN') {
  if (isWin) {
    p.zenDone = true;
    p.lastOutcome = 'Zen complete.';
    // Return to rotation like a normal session.
    const inSlots = STATE.lobbySlots.indexOf(p.id) >= 0;
    const inQueue = STATE.poolQueue.indexOf(p.id) >= 0;
    if (!inSlots && !inQueue && !isTranscended(p.id)) STATE.poolQueue.push(p.id);
    ensurePoolIntegrity();
    try { requestSave('zen_complete'); } catch (_) {}
  } else if (isLose) {
    if (reason === 'Time expired.') p.lastOutcome = 'Zen failed: time expired.';
    else p.lastOutcome = 'Zen failed.';
    const inSlots = STATE.lobbySlots.indexOf(p.id) >= 0;
    const inQueue = STATE.poolQueue.indexOf(p.id) >= 0;
    if (!inSlots && !inQueue && !isTranscended(p.id)) STATE.poolQueue.push(p.id);
    ensurePoolIntegrity();
    try { requestSave('zen_loss'); } catch (_) {}
  }
} else if (planKey === 'TRANQUILITY') {
  if (isWin) {
    p.tranquilityDone = true;
    p.lastOutcome = 'Tranquility complete.';
    const inSlots = STATE.lobbySlots.indexOf(p.id) >= 0;
    const inQueue = STATE.poolQueue.indexOf(p.id) >= 0;
    if (!inSlots && !inQueue && !isTranscended(p.id)) STATE.poolQueue.push(p.id);
    ensurePoolIntegrity();
    try { requestSave('tranquility_complete'); } catch (_) {}
  } else if (isLose) {
    if (reason === 'Time expired.') p.lastOutcome = 'Tranquility failed: time expired.';
    else p.lastOutcome = 'Tranquility failed.';
    const inSlots = STATE.lobbySlots.indexOf(p.id) >= 0;
    const inQueue = STATE.poolQueue.indexOf(p.id) >= 0;
    if (!inSlots && !inQueue && !isTranscended(p.id)) STATE.poolQueue.push(p.id);
    ensurePoolIntegrity();
    try { requestSave('tranquility_loss'); } catch (_) {}
  }
} else if (planKey === 'TRANSCENDENCE') {
  if (isWin) {
    p.lastOutcome = 'Transcended.';
    // Permanently remove.
    transcendPatient(p.id);
    // Reuse the existing transcend congrats modal wiring.
    STATE.pendingZenCongratsId = p.id;
    try { requestSave('transcendence_win'); } catch (_) {}
  } else if (isLose) {
    if (reason === 'Time expired.') p.lastOutcome = 'Transcendence failed: time expired.';
    else p.lastOutcome = 'Transcendence failed.';
    const inSlots = STATE.lobbySlots.indexOf(p.id) >= 0;
    const inQueue = STATE.poolQueue.indexOf(p.id) >= 0;
    if (!inSlots && !inQueue && !isTranscended(p.id)) STATE.poolQueue.push(p.id);
    ensurePoolIntegrity();
    try { requestSave('transcendence_loss'); } catch (_) {}
  }
        } else {
          // Fallback sessions.
          const label = planKey || 'Session';
          if (isWin) p.lastOutcome = `${label} success.`;
          else if (isLose) p.lastOutcome = `${label} failed.`;
          const inSlots = STATE.lobbySlots.indexOf(p.id) >= 0;
          const inQueue = STATE.poolQueue.indexOf(p.id) >= 0;
          if (!inSlots && !inQueue && !isTranscended(p.id)) STATE.poolQueue.push(p.id);
          ensurePoolIntegrity();
          try { requestSave('outcome'); } catch (_) {}
        }
      }
    } catch (_) {}

    // Clear run-specific state
    STATE.activePatientId = null;
    STATE.pendingStartId = null;

    SIM.inLobby = true;
    SIM._patientActive = false;
    SIM._patientId = null;
    SIM.patientTraits = [];
    SIM._patientLevelId = null;
    SIM._patientPortrait = '';

    if (SIM && typeof SIM.initMVP === 'function') {
      SIM.initMVP(1);
      SIM.inLobby = true;
    }

    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
  }

  // Soft lobby open: pause the simulation behind the lobby overlay without resetting.
    // Optional tick hook (currently no-op; used for future progression logic)
  function update(dt) {
    // Intentionally empty for this chunk.
  }

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
    const k = (SIM && (SIM._patientPlanKey || SIM._activePlanKey)) ? (SIM._patientPlanKey || SIM._activePlanKey) : '';
    startRun(SIM._patientId, k);
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

  // ----------------------------
  // Save schema v2 (patients progression + pool state)
  // ----------------------------
  function getSaveBlob() {
    const out = {
      patients: Object.create(null),
      poolQueue: Array.isArray(STATE.poolQueue) ? STATE.poolQueue.slice() : [],
      lobbySlots: Array.isArray(STATE.lobbySlots) ? STATE.lobbySlots.slice(0, 3) : [null, null, null],
      transcendedIds: Array.isArray(STATE.transcendedIds) ? STATE.transcendedIds.slice() : [],
    };

    const byId = STATE.patientsById || {};
    Object.keys(byId).forEach((id) => {
      const p = byId[id];
      if (!p || !id) return;
      out.patients[id] = {
        intakeDone: !!p.intakeDone,
        zenDone: !!p.zenDone,
        tranquilityDone: !!p.tranquilityDone,
        lastOutcome: (typeof p.lastOutcome === 'string') ? p.lastOutcome : '—',
        traits: Array.isArray(p.traits) ? p.traits.filter((x) => typeof x === 'string') : [],
        mood: {
          label: (p.mood && typeof p.mood.label === 'string') ? p.mood.label : 'Steady',
          template: (p.mood && typeof p.mood.template === 'string') ? p.mood.template : 'FLAT',
        },
        vibe: {
          label: (p.vibe && typeof p.vibe.label === 'string') ? p.vibe.label : 'Mid',
        },
        quirks: Array.isArray(p.quirks)
          ? p.quirks
              .filter((q) => q && typeof q.type === 'string')
              .map((q) => ({ type: q.type, intensityTier: (typeof q.intensityTier === 'number') ? q.intensityTier : 0 }))
          : [],
      };
    });

    // Normalize arrays to safe forms.
    out.poolQueue = (Array.isArray(out.poolQueue) ? out.poolQueue : []).filter((x) => typeof x === 'string');
    out.transcendedIds = (Array.isArray(out.transcendedIds) ? out.transcendedIds : []).filter((x) => typeof x === 'string');

    // Ensure lobbySlots length 3.
    const ls = Array.isArray(out.lobbySlots) ? out.lobbySlots.slice(0, 3) : [];
    while (ls.length < 3) ls.push(null);
    out.lobbySlots = ls.map((x) => (typeof x === 'string' && x) ? x : null);

    return out;
  }

  function _uniqIds(list) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      if (!id || typeof id !== 'string') continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function applySaveBlob(patBlob) {
    if (!patBlob || typeof patBlob !== 'object') return false;

    // Merge per-patient runtime state.
    const srcPatients = (patBlob.patients && typeof patBlob.patients === 'object') ? patBlob.patients : null;
    if (srcPatients) {
      Object.keys(srcPatients).forEach((id) => {
        const dst = STATE.patientsById[id];
        const src = srcPatients[id];
        if (!dst || !src || typeof src !== 'object') return;

        if (typeof src.intakeDone === 'boolean') dst.intakeDone = src.intakeDone;
        if (typeof src.zenDone === 'boolean') dst.zenDone = src.zenDone;
        if (typeof src.tranquilityDone === 'boolean') dst.tranquilityDone = src.tranquilityDone;
        if (typeof src.lastOutcome === 'string') dst.lastOutcome = src.lastOutcome;

        if (Array.isArray(src.traits)) {
          dst.traits = src.traits.filter((x) => typeof x === 'string');
        }

        if (src.mood && typeof src.mood === 'object') {
          if (!dst.mood || typeof dst.mood !== 'object') dst.mood = { label: 'Steady', template: 'FLAT' };
          if (typeof src.mood.label === 'string') dst.mood.label = src.mood.label;
          if (typeof src.mood.template === 'string') dst.mood.template = src.mood.template;
        }

        if (src.vibe && typeof src.vibe === 'object') {
          if (!dst.vibe || typeof dst.vibe !== 'object') dst.vibe = { label: 'Mid' };
          if (typeof src.vibe.label === 'string') dst.vibe.label = src.vibe.label;
        }

        if (Array.isArray(src.quirks)) {
          dst.quirks = src.quirks
            .filter((q) => q && typeof q.type === 'string')
            .map((q) => ({ type: q.type, intensityTier: (typeof q.intensityTier === 'number') ? q.intensityTier : 0 }));
        }
      });
    }

    // Apply transcended ids first.
    const knownIds = new Set(Object.keys(STATE.patientsById || {}));
    if (Array.isArray(patBlob.transcendedIds)) {
      STATE.transcendedIds = _uniqIds(patBlob.transcendedIds).filter((id) => knownIds.has(id));
    }

    // Apply lobbySlots and poolQueue, validating aggressively.
    let slots = Array.isArray(patBlob.lobbySlots) ? patBlob.lobbySlots.slice(0, 3) : null;
    let queue = Array.isArray(patBlob.poolQueue) ? patBlob.poolQueue.slice() : null;

    const isValidId = (id) => !!(id && typeof id === 'string' && knownIds.has(id) && isUnlocked(id) && !isTranscended(id));

    let slotsOk = true;
    if (!slots || slots.length !== 3) slotsOk = false;

    const normSlots = [null, null, null];
    if (slotsOk) {
      const seen = new Set();
      for (let i = 0; i < 3; i++) {
        const id = slots[i];
        if (id == null) { normSlots[i] = null; continue; }
        if (!isValidId(id) || seen.has(id)) { normSlots[i] = null; continue; }
        seen.add(id);
        normSlots[i] = id;
      }
    }

    if (slotsOk) {
      STATE.lobbySlots = normSlots;
    }

    if (queue) {
      // Remove invalid/dup/slot ids/transcended.
      const slotSet = new Set((STATE.lobbySlots || []).filter(Boolean));
      const normQ = _uniqIds(queue).filter((id) => isValidId(id) && !slotSet.has(id));
      STATE.poolQueue = normQ;
    }

    // If slots are empty/invalid, rebuild from scratch and refill.
    const anySlot = (STATE.lobbySlots || []).some(Boolean);
    if (!anySlot) {
      rebuildPoolQueue();
      STATE.lobbySlots = [null, null, null];
      for (let i = 0; i < 3; i++) fillSlot(i);
    } else {
      // Ensure no empty slots remain if we can fill them.
      for (let i = 0; i < 3; i++) {
        if (!STATE.lobbySlots[i]) fillSlot(i);
      }
    }

    // Final integrity pass (no save on load).
    ensurePoolIntegrity();

    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
    return true;
  }

  function requestSave(reason) {
    // No-op if not signed in / Firebase unavailable.
    if (!EC.AUTH || !EC.AUTH.user) return false;
    if (!EC.SAVE || typeof EC.SAVE.debouncedWrite !== 'function') return false;

    const blob = getSaveBlob();
    const payload = { schemaVersion: 2, pat: blob };
    try {
      EC.SAVE.debouncedWrite(payload, { merge: true });
      return true;
    } catch (_) {
      return false;
    }
  }

  // UI hooks for progression modals
  function getPendingWeeklyRewardId() { return STATE.pendingWeeklyRewardId; }
  function getPendingZenCongratsId() { return STATE.pendingZenCongratsId; }
  function getPendingIntakeCongratsId() { return STATE.pendingIntakeCongratsId; }
  function clearPendingZenCongrats() { STATE.pendingZenCongratsId = null; }
  function clearPendingIntakeCongrats() { STATE.pendingIntakeCongratsId = null; }

  // Heroes page support: list transcended patients in STATE order.
  function listTranscended() {
    const ids = Array.isArray(STATE.transcendedIds) ? STATE.transcendedIds : [];
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const p = getById(ids[i]);
      if (p) out.push(p);
    }
    return out;
  }


  function getStartEnergyBonus() {
    return 5 * getTranscendedCount();
  }

  function hasWeeklyOptions(pid) {
    const p = getById(pid);
    if (!p) return false;

    // Any improvable/removable attributes?
    if (p.quirks && p.quirks.some((q) => q && typeof q.intensityTier === 'number' && q.intensityTier > 0)) return true;
    if (p.mood && typeof p.mood.label === 'string' && p.mood.label !== 'Steady') return true;
    if (p.vibe && typeof p.vibe.label === 'string' && p.vibe.label !== 'Mid') return true;
    if (Array.isArray(p.traits) && p.traits.length > 0) return true;

    return false;
  }

  EC.PAT = {
    list,
    get: getById,
    listTranscended,
    getStartEnergyBonus,
    hasWeeklyOptions,
    // Lobby progression helpers
    beginFromLobby,
    startPending,
    startRun,
    // Back-compat start (no lobby rotation)
    start,
    backToLobby,
    openLobbyPause,
    resumeFromLobby,
    restartActive,
    update,
    getSaveBlob,
    applySaveBlob,
    requestSave,
    // Progression loop
    applyWeeklyReward,
    getPendingWeeklyRewardId,
    getPendingZenCongratsId,
    getPendingIntakeCongratsId,
    clearPendingZenCongrats,
    clearPendingIntakeCongrats,
    _buildPlan: buildTreatmentPlan,
  };
})();
