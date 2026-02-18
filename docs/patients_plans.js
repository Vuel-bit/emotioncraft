/* Emotioncraft — Patient Treatment Plans (runtime)
   - Treatment plan generation + template expansion only.
   - No roster / lobby rotation / persistence / Firebase.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const SIM = (EC.SIM = EC.SIM || {});
  const CONST = EC.CONST || {};

  const T = () => (EC.TUNE || {});

  const hueName = (i) => (EC.hueLabel ? EC.hueLabel(i) : ((CONST.HUES && CONST.HUES[i]) ? CONST.HUES[i] : `Hue ${i}`));
  const randInt = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const PLANS = (EC.DATA && EC.DATA.PLANS) ? EC.DATA.PLANS : null;
  if (!PLANS) {
    // Missing plan specs should not crash the game; plan selection may be unavailable.
    try { SIM._plansMissing = true; } catch (_) {}
  }

function _deepClone(v) {
  // Steps are plain data (numbers/arrays/objects); deep clone prevents runtime mutation drift.
  return (v == null) ? v : JSON.parse(JSON.stringify(v));
}

function _tmpl(str, dict) {
  const s = String(str || '');
  return s.replace(/\{([A-Z0-9_]+)\}/g, (m, k) => (dict && (k in dict)) ? String(dict[k]) : '');
}

function _expandStepsFromTemplate(stepsTmpl, repl, tokens) {
  const out = [];
  const src = Array.isArray(stepsTmpl) ? stepsTmpl : [];
  for (let i = 0; i < src.length; i++) {
    const st = _deepClone(src[i]);
    if (!st) continue;

    // Replace marker fields
    if (st.highs === '$HI_SET' && repl && repl.hiSet) st.highs = repl.hiSet.slice();
    if (st.lows === '$LO_SET' && repl && repl.loSet) st.lows = repl.loSet.slice();
    if (st.highs === '$LO_SET' && repl && repl.loSet) st.highs = repl.loSet.slice();
    if (st.lows === '$HI_SET' && repl && repl.hiSet) st.lows = repl.hiSet.slice();
    if (st.highs === '$LOW_SET' && repl && repl.lowSet) st.highs = repl.lowSet.slice();
    if (st.lows === '$LOW_SET' && repl && repl.lowSet) st.lows = repl.lowSet.slice();
    if (st.highs === '$HIGH_SET' && repl && repl.highSet) st.highs = repl.highSet.slice();
    if (st.lows === '$HIGH_SET' && repl && repl.highSet) st.lows = repl.highSet.slice();

    if (st.highs === '$PAIR' && repl && repl.pair) st.highs = repl.pair.slice();
    if (st.lows === '$REMAINING' && repl && repl.remaining) st.lows = repl.remaining.slice();
    if (st.highs === '$THIRD_ARR' && repl && repl.thirdArr) st.highs = repl.thirdArr.slice();
    if (st.lows === '$NOT_THIRD' && repl && repl.notThird) st.lows = repl.notThird.slice();

    if (st.bounds === '$B1' && repl && repl.b1) st.bounds = repl.b1;
    if (st.bounds === '$B3' && repl && repl.b3) st.bounds = repl.b3;
    if (st.bounds === '$STAIRS_BANDS' && repl && repl.stairsBands) st.bounds = repl.stairsBands;

    if (st.primaryIndex === '$PRIMARY' && repl && typeof repl.primary === 'number') st.primaryIndex = repl.primary;

    if (st.holdSec === '$HOLD_SEC' && repl && typeof repl.holdSec === 'number') st.holdSec = repl.holdSec;

    // Expand text template tokens
    if (st.textTmpl) {
      st.text = _tmpl(st.textTmpl, tokens || {});
      delete st.textTmpl;
    }

    out.push(st);
  }
  return out;
}

function _planData(key) {
  const k = String(key || '').toUpperCase();
  return (PLANS && PLANS[k]) ? PLANS[k] : null;
}

function buildPlanZen() {
  const D = _planData('ZEN');
  if (!D || !Array.isArray(D.steps)) {
    SIM._plansMissing = true;
    return { planKey: 'ZEN', steps: [], goalVizPerHue: new Array(6).fill(null) };
  }
  return { planKey: 'ZEN', steps: _deepClone(D.steps), goalVizPerHue: _deepClone(D.goalVizPerHue) };
}

function buildPlanTranquility() {
  const D = _planData('TRANQUILITY');
  if (!D) {
    SIM._plansMissing = true;
    return { planKey: 'TRANQUILITY', steps: [], goalVizPerHue: new Array(6).fill(null) };
  }

  // New Tranquility (timed): 1) All over 300  2) Stairs (rolled primary)  3) All under 100  4) All spin stop
  const primary = randInt(0, 5);
  const bands = new Array(6);
  const idx = (d) => (primary + d) % 6;

  const offsets = Array.isArray(D.stairsBandsByOffset) ? D.stairsBandsByOffset : [];
  for (let d = 0; d < 6; d++) {
    const b = offsets[d] || {};
    bands[idx(d)] = { low: (typeof b.low === 'number') ? b.low : null, high: (typeof b.high === 'number') ? b.high : null };
  }

  const tokens = { PRIMARY_NAME: hueName(primary) };
  const steps = _expandStepsFromTemplate(D.stepsTmpl, { stairsBands: bands, primary }, tokens);
  const goalVizPerHue = _deepClone(D.goalVizPerHue);

  return { planKey: 'TRANQUILITY', steps, goalVizPerHue, rolled: { primary } };
}

function buildPlanTranscendence() {
  const D = _planData('TRANSCENDENCE');
  if (!D) {
    SIM._plansMissing = true;
    return { planKey: 'TRANSCENDENCE', steps: [], goalVizPerHue: new Array(6).fill(null) };
  }

  const even = [0,2,4];
  const odd = [1,3,5];
  const pickEvenLow = Math.random() < 0.5;
  const lowSet = pickEvenLow ? even : odd;
  const highSet = pickEvenLow ? odd : even;

  const lowLabel = pickEvenLow ? '{0,2,4}' : '{1,3,5}';
  const highLabel = pickEvenLow ? '{1,3,5}' : '{0,2,4}';

  const tokens = { LOW_LABEL: lowLabel, HIGH_LABEL: highLabel };
  const steps = _expandStepsFromTemplate(D.stepsTmpl, { lowSet, highSet }, tokens);

  const goalVizPerHue = _deepClone(D.goalVizPerHue);
  return { planKey: 'TRANSCENDENCE', steps, goalVizPerHue, rolled: { pickEvenLow } };
}

function buildPlanWeeklyA() {
  const D = _planData('WEEKLY_A');
  if (!D) {
    SIM._plansMissing = true;
    return { planKey: 'WEEKLY_A', steps: [], goalVizPerHue: new Array(6).fill(null) };
  }

  // Weekly A: preserves the prior Weekly plan logic.
  const holdSec = (typeof T().PAT_BAND_HOLD_SECONDS === 'number') ? T().PAT_BAND_HOLD_SECONDS : 10;
  const even = [0,2,4];
  const odd = [1,3,5];
  const pickEven = Math.random() < 0.5;
  const hiSet = pickEven ? even : odd;
  const loSet = pickEven ? odd : even;

  const setLabel = pickEven ? '{0,2,4}' : '{1,3,5}';

  const tokens = { SET_LABEL: setLabel, HOLD_SEC: holdSec };
  const steps = _expandStepsFromTemplate(D.stepsTmpl, { hiSet, loSet, holdSec }, tokens);

  // Seed goal viz with step 1
  const isHigh = (i) => hiSet.indexOf(i) >= 0;
  const isLow = (i) => loSet.indexOf(i) >= 0;
  const goalVizPerHue = new Array(6).fill(null).map((_, i) => {
    if (isHigh(i)) return { type: 'OVER', target: 350 };
    if (isLow(i)) return { type: 'UNDER', target: 150 };
    return null;
  });

  return { planKey: 'WEEKLY_A', steps, goalVizPerHue, rolled: { pickEven } };
}

function buildPlanWeeklyB() {
  const D = _planData('WEEKLY_B');
  if (!D || !Array.isArray(D.steps)) {
    SIM._plansMissing = true;
    return { planKey: 'WEEKLY_B', steps: [], goalVizPerHue: new Array(6).fill(null) };
  }
  return { planKey: 'WEEKLY_B', steps: _deepClone(D.steps), goalVizPerHue: _deepClone(D.goalVizPerHue) };
}

function buildPlanWeeklyC() {
  const D = _planData('WEEKLY_C');
  if (!D) {
    SIM._plansMissing = true;
    return { planKey: 'WEEKLY_C', steps: [], goalVizPerHue: new Array(6).fill(null) };
  }

  const primary = randInt(0, 5);
  const left = (primary + 5) % 6;
  const right = (primary + 1) % 6;
  const opp = (primary + 3) % 6;

  const c = (D.consts || {});
  const neutralLow = (typeof c.neutralLow === 'number') ? c.neutralLow : 100;
  const neutralHigh = (typeof c.neutralHigh === 'number') ? c.neutralHigh : 400;
  const makeNeutral = () => new Array(6).fill(null).map(() => ({ low: neutralLow, high: neutralHigh }));

  const mods = (D.boundsMods || {});
  const m1 = (mods.step1 || {});
  const m3 = (mods.step3 || {});

  const b1 = makeNeutral();
  b1[primary] = _deepClone(m1.primary);
  b1[left] = _deepClone(m1.left);
  b1[right] = _deepClone(m1.right);
  b1[opp] = _deepClone(m1.opp);

  const b3 = makeNeutral();
  b3[primary] = _deepClone(m3.primary);
  b3[left] = _deepClone(m3.left);
  b3[right] = _deepClone(m3.right);
  b3[opp] = _deepClone(m3.opp);

  const tokens = { PRIMARY_NAME: hueName(primary) };
  const steps = _expandStepsFromTemplate(D.stepsTmpl, { b1, b3, primary }, tokens);

  // Seed goal viz with step 1
  const goalVizPerHue = new Array(6).fill(null).map((_, i) => {
    const b = b1[i] || {};
    const lo = (typeof b.low === 'number') ? b.low : null;
    const hi = (typeof b.high === 'number') ? b.high : null;
    if (lo != null && hi != null) return { type: 'BAND', low: lo, high: hi };
    if (lo != null) return { type: 'OVER', target: lo };
    if (hi != null) return { type: 'UNDER', target: hi };
    return null;
  });

  return { planKey: 'WEEKLY_C', steps, goalVizPerHue, rolled: { primary } };
}

function buildPlanIntake() {
  const D = _planData('INTAKE');
  if (!D) {
    SIM._plansMissing = true;
    return { planKey: 'INTAKE', steps: [], goalVizPerHue: new Array(6).fill(null) };
  }

  // INTAKE (3 steps):
  // 1) Adjacent hues ≥ 350; others ≤ 150 (hold 10s)
  // 2) One non-adjacent hue ≥ 300; others ≤ 200 (hold 10s)
  // 3) All hues 200–300
  const pairStart = randInt(0, 5);
  const pair = [pairStart, (pairStart + 1) % 6];
  const remaining = [0,1,2,3,4,5].filter((h) => pair.indexOf(h) < 0);

  // Non-adjacent to the pair: the opposite pair (pairStart+3 or pairStart+4 mod 6)
  const cand = [ (pairStart + 3) % 6, (pairStart + 4) % 6 ];
  const third = pick(cand);

  const tokens = {
    H0: hueName(pair[0]),
    H1: hueName(pair[1]),
    THIRD_NAME: hueName(third)
  };

  const steps = _expandStepsFromTemplate(
    D.stepsTmpl,
    {
      pair,
      remaining,
      thirdArr: [third],
      notThird: [0,1,2,3,4,5].filter((h) => h !== third)
    },
    tokens
  );

  // Seed goal viz with step 1
  const isHigh = (i) => (i === pair[0] || i === pair[1]);
  const goalVizPerHue = new Array(6).fill(null).map((_, i) => {
    if (isHigh(i)) return { type: 'OVER', target: 350 };
    return { type: 'UNDER', target: 150 };
  });

  return { planKey: 'INTAKE', steps, goalVizPerHue, rolled: { pair, third, pairStart } };
}

function buildTreatmentPlan(planKey) {
  const k = String(planKey || '').toUpperCase();

  // Player-facing selection stays WEEKLY, but each run resolves to Weekly A/B/C.
  if (k === 'WEEKLY') {
    const variants = ['WEEKLY_A', 'WEEKLY_B', 'WEEKLY_C'];
    const resolved = variants[Math.floor(Math.random() * variants.length)];
    return buildTreatmentPlan(resolved);
  }

  if (k === 'WEEKLY_A') return buildPlanWeeklyA();
  if (k === 'WEEKLY_B') return buildPlanWeeklyB();
  if (k === 'WEEKLY_C') return buildPlanWeeklyC();

  if (k === 'INTAKE') return buildPlanIntake();
  if (k === 'TRANQUILITY') return buildPlanTranquility();
  if (k === 'TRANSCENDENCE') return buildPlanTranscendence();
  return buildPlanZen();
}

  EC.PAT_PLANS = EC.PAT_PLANS || {};
  EC.PAT_PLANS.buildTreatmentPlan = buildTreatmentPlan;

  // Optional: debug tooling integration
  try {
    EC._registerModule && EC._registerModule('patients_plans', { provides: ['EC.PAT_PLANS.buildTreatmentPlan'] });
  } catch (_) {}
})();
