/* Emotioncraft — Plan Data (MVP)
   Data-only treatment plan specs. No DOM, no SIM access, no randomness.
   systems_patients.js interprets templates for rolled indices.
*/
(function(){
  const EC = (window.EC = window.EC || {});
  EC.DATA = EC.DATA || {};

  // NOTE: Some plans are deterministic and include concrete steps; others provide templates
  // that systems_patients.js expands using rolled indices (e.g., random primary).
  EC.DATA.PLANS = {
    ZEN: {
      planKey: 'ZEN',
      // Timed 10:00 (timer handled by core_mechanics).
      steps: [
        { kind: 'SET_BOUNDS', highs: [], lows: [0,1,2,3,4,5], hiMin: 0, loMax: 100, text: 'Step 1: All hues ≤ 100' },
        { kind: 'ALL_BAND', low: 200, high: 250, text: 'Step 2: All hues 200–250' },
        { kind: 'ALL_OVER', threshold: 400, text: 'Step 3: All hues ≥ 400' },
        { kind: 'SPIN_ZERO', text: 'Step 4: All well spins = 0' }
      ],
      goalVizPerHue: [
        { type: 'UNDER', target: 100 }, { type: 'UNDER', target: 100 }, { type: 'UNDER', target: 100 },
        { type: 'UNDER', target: 100 }, { type: 'UNDER', target: 100 }, { type: 'UNDER', target: 100 }
      ]
    },

    WEEKLY_B: {
      planKey: 'WEEKLY_B',
      steps: [
        { kind: 'SET_BOUNDS', highs: [], lows: [0,1,2,3,4,5], hiMin: 0, loMax: 150, text: 'Step 1: All under 150' },
        { kind: 'ALL_BAND', low: 200, high: 300, text: 'Step 2: All 200–300' },
        { kind: 'ALL_OVER', threshold: 350, text: 'Step 3: All over 350' },
        { kind: 'SPIN_ZERO', text: 'Step 4: Spin 0' }
      ],
      goalVizPerHue: [
        { type: 'UNDER', target: 150 }, { type: 'UNDER', target: 150 }, { type: 'UNDER', target: 150 },
        { type: 'UNDER', target: 150 }, { type: 'UNDER', target: 150 }, { type: 'UNDER', target: 150 }
      ]
    },

    // Weekly A: alternating sets; Step 3 uses holdSec from T().PAT_BAND_HOLD_SECONDS (default 10).
    WEEKLY_A: {
      planKey: 'WEEKLY_A',
      consts: { s1hi: 350, s1lo: 150, s2hi: 300, s2lo: 200, bandLow: 200, bandHigh: 300 },
      stepsTmpl: [
        {
          kind: 'SET_BOUNDS',
          highs: '$HI_SET',
          lows: '$LO_SET',
          hiMin: 350,
          loMax: 150,
          textTmpl: 'Step 1: Alternating {SET_LABEL} ≥ 350; other 3 ≤ 150'
        },
        {
          kind: 'SET_BOUNDS',
          highs: '$LO_SET',
          lows: '$HI_SET',
          hiMin: 300,
          loMax: 200,
          textTmpl: 'Step 2: Swap — previous highs ≤ 200; other 3 ≥ 300'
        },
        {
          kind: 'ALL_BAND',
          low: 200,
          high: 300,
          holdSec: '$HOLD_SEC',
          textTmpl: 'Step 3: All hues 200–300 (hold {HOLD_SEC}s)'
        }
      ]
    },

    // Weekly C: rolled primary; bounds templates are expanded by systems_patients.js.
    WEEKLY_C: {
      planKey: 'WEEKLY_C',
      consts: { neutralLow: 100, neutralHigh: 400 },
      // Mod rules for PER_HUE_BOUNDS construction
      boundsMods: {
        step1: {
          primary: { low: null, high: 50 },
          left:    { low: 450, high: null },
          right:   { low: 450, high: null },
          opp:     { low: 300, high: null }
        },
        step3: {
          primary: { low: 50, high: null },
          left:    { low: null, high: 150 },
          right:   { low: null, high: 150 },
          opp:     { low: null, high: 200 }
        }
      },
      stepsTmpl: [
        {
          kind: 'PER_HUE_BOUNDS',
          bounds: '$B1',
          primaryIndex: '$PRIMARY',
          textTmpl: 'Step 1: Primary {PRIMARY_NAME} ≤ 50; Neighbors ≥ 450'
        },
        { kind: 'SPIN_ZERO', text: 'Step 2: All spin stop' },
        {
          kind: 'PER_HUE_BOUNDS',
          bounds: '$B3',
          primaryIndex: '$PRIMARY',
          textTmpl: 'Step 3: Primary {PRIMARY_NAME} ≥ 50; Neighbors ≤ 150'
        },
        { kind: 'SPIN_ZERO', text: 'Step 4: All spin stop' }
      ]
    },

    // Intake: rolled adjacent pair + rolled third (non-adjacent).
    INTAKE: {
      planKey: 'INTAKE',
      consts: { s1hi: 350, s1lo: 150, s2hi: 300, s2lo: 200 },
      stepsTmpl: [
        {
          kind: 'SET_BOUNDS',
          highs: '$PAIR',
          lows: '$REMAINING',
          hiMin: 350,
          loMax: 150,
          holdSec: 10,
          textTmpl: 'Step 1: Adjacent {H0} + {H1} ≥ 350; other 4 ≤ 150 (hold 10s)'
        },
        {
          kind: 'SET_BOUNDS',
          highs: '$THIRD_ARR',
          lows: '$NOT_THIRD',
          hiMin: 300,
          loMax: 200,
          holdSec: 10,
          textTmpl: 'Step 2: Shift — {THIRD_NAME} ≥ 300; all others ≤ 200 (hold 10s)'
        },
        { kind: 'ALL_BAND', low: 200, high: 300, text: 'Step 3: All hues 200–300' }
      ]
    },

    // Tranquility: rolled primary; stairs bands are expanded in logic using these offsets.
    TRANQUILITY: {
      planKey: 'TRANQUILITY',
      stairsBandsByOffset: [
        { low: 350, high: 400 },
        { low: 300, high: 350 },
        { low: 250, high: 300 },
        { low: 200, high: 250 },
        { low: 150, high: 200 },
        { low: 100, high: 150 }
      ],
      stepsTmpl: [
        { kind: 'ALL_OVER', threshold: 400, text: 'Step 1: All over 400' },
        {
          kind: 'PER_HUE_BOUNDS',
          bounds: '$STAIRS_BANDS',
          primaryIndex: '$PRIMARY',
          textTmpl: 'Step 2: Stairs; Target: {PRIMARY_NAME}'
        },
        { kind: 'SET_BOUNDS', highs: [], lows: [0,1,2,3,4,5], hiMin: 0, loMax: 100, text: 'Step 3: All under 100' },
        { kind: 'SPIN_ZERO', text: 'Step 4: All spin stop' }
      ],
      goalVizPerHue: [
        { type: 'OVER', target: 400 }, { type: 'OVER', target: 400 }, { type: 'OVER', target: 400 },
        { type: 'OVER', target: 400 }, { type: 'OVER', target: 400 }, { type: 'OVER', target: 400 }
      ]
    },

    TRANSCENDENCE: {
      planKey: 'TRANSCENDENCE',
      consts: { loMax: 50, hiMin: 450 },
      stepsTmpl: [
        { kind: 'ALL_BAND', low: 240, high: 260, text: 'Step 1: All hues 240–260' },
        {
          kind: 'SET_BOUNDS',
          highs: '$HIGH_SET',
          lows: '$LOW_SET',
          hiMin: 450,
          loMax: 50,
          textTmpl: 'Step 2: Alternating — {LOW_LABEL} ≤ 50; {HIGH_LABEL} ≥ 450 (hold 10s)'
        },
        {
          kind: 'SET_BOUNDS',
          highs: '$LOW_SET',
          lows: '$HIGH_SET',
          hiMin: 450,
          loMax: 50,
          text: 'Step 3: Swap Step 2'
        },
        { kind: 'SPIN_ZERO', text: 'Step 4: All well spins = 0' }
      ],
      goalVizPerHue: [
        { type: 'BAND', low: 240, high: 260 }, { type: 'BAND', low: 240, high: 260 }, { type: 'BAND', low: 240, high: 260 },
        { type: 'BAND', low: 240, high: 260 }, { type: 'BAND', low: 240, high: 260 }, { type: 'BAND', low: 240, high: 260 }
      ]
    }
  };
})();