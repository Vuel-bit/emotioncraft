// Emotioncraft — Tutorial data (definition + step specs)
// Data-only module: no DOM, no SIM reads/writes, no randomness.
(() => {
  const EC = (window.EC = window.EC || {});
  EC.DATA = EC.DATA || {};

  // Tutorial “level def” (matches systems_tutorial.js prior _mkDef() output)
  EC.DATA.TUTORIAL = {
    DEF: {
      id: 9001,
      label: 'Tutorial',
      name: 'Tutorial',
      objectiveShort: 'Tutorial',
      objectiveText: 'Tutorial: Swipe up/down on the highlighted well to change Amount.',
      dispositions: [],
      startState: {
        // Stable, tutorial-friendly state: clear spins, moderate amounts.
        // Opposite well (index 3) is “alive” for the nudge demo.
        wellsA: [70, 60, 60, 80, 60, 60],
        wellsS: [0, 0, 0, 0, 0, 0],
        psyP:   [160, 160, 160, 160, 160, 160],
      },
      win: null,
      // Static knobs used by tutorial logic (kept as data so logic stays small).
      startMinEnergy: 160,
    },

    // Step specs / copy (one entry per step 0..6)
    STEPS: [
      {
        objectiveText: 'Swipe up/down on the highlighted well to change Amount.',
        blockSwipes: false,
        allowWellMode: 'FOCUS',
        canSpin0: false,
        canPair0: false,
        pulseSpin0: false,
        pulsePair0: false,
        minEnergy: 0,
        enterOps: [],
      },
      {
        objectiveText: 'Swipe left/right on the highlighted well to change Spin.',
        blockSwipes: false,
        allowWellMode: 'FOCUS',
        canSpin0: false,
        canPair0: false,
        pulseSpin0: false,
        pulsePair0: false,
        minEnergy: 0,
        enterOps: [],
      },
      {
        objectiveText: 'The product (Amount × Spin) changes Psyche over time. Keep some Spin and watch Psyche move.',
        blockSwipes: false,
        allowWellMode: 'FOCUS',
        canSpin0: false,
        canPair0: false,
        pulseSpin0: false,
        pulsePair0: false,
        minEnergy: 0,
        enterOps: [
          { type: 'SNAPSHOT_PSY_FOCUS' },
        ],
      },
      {
        objectiveText: 'Any action on a well nudges its opposite in the opposite direction. Swipe again and watch the opposite well react.',
        blockSwipes: false,
        allowWellMode: 'FOCUS',
        canSpin0: false,
        canPair0: false,
        pulseSpin0: false,
        pulsePair0: false,
        minEnergy: 0,
        enterOps: [
          { type: 'SET_FOCUS_SPIN', value: 55 },
        ],
      },
      {
        objectiveText: 'Press Set Spin 0 to zero the selected well’s Spin (costs energy).',
        blockSwipes: true,
        allowWellMode: 'FOCUS',
        canSpin0: true,
        canPair0: false,
        pulseSpin0: true,
        pulsePair0: false,
        minEnergy: 50,
        enterOps: [],
      },
      {
        objectiveText: 'Press Set Pair Spin 0 to zero the selected well AND its opposite (costs energy).',
        blockSwipes: true,
        allowWellMode: 'FOCUS',
        canSpin0: true,
        canPair0: true,
        pulseSpin0: false,
        pulsePair0: true,
        minEnergy: 50,
        enterOps: [
          { type: 'FORCE_PAIR_SPINS', a: 40, b: -40 },
        ],
      },
      {
        objectiveText: 'Win Conditions: Get Red (top) above 300 and Green (opposite) below 200, then stop all spin.',
        blockSwipes: false,
        allowWellMode: 'ALL',
        canSpin0: true,
        canPair0: true,
        pulseSpin0: false,
        pulsePair0: false,
        minEnergy: 50,
        enterOps: [
          { type: 'SET_GOALVIZ_FINAL', over: { hue: 0, target: 300 }, under: { hue: 3, target: 200 } },
        ],
      },
    ],
  };
})();
