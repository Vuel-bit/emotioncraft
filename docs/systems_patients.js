/* Emotioncraft — Patient Lobby (v0)
   Hardcoded patients with trait-based start randomization, treatment templates,
   and fixed dispositions.

   Dispositions affect wells only; psyche changes via existing drive.

   Exposes: EC.PAT = { list(), get(id), start(id), backToLobby() }

   No ES modules; window.EC namespace.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const SIM = (EC.SIM = EC.SIM || {});
  const CONST = EC.CONST || {};

  const hueName = (i) => (EC.hueLabel ? EC.hueLabel(i) : ((CONST.HUES && CONST.HUES[i]) ? CONST.HUES[i] : `Hue ${i}`));

  // Trait ranges (exact presets from spec)
  const TRAITS = {
    Stable:    { aMin: 40, aMax: 60, sMin: -10, sMax: 10,  pMin: 150, pMax: 175 },
    Erratic:   { aMin: 30, aMax: 70, sMin: -30, sMax: 30,  pMin: 100, pMax: 250 },
    Depressed: { aMin: 30, aMax: 50, sMin: -30, sMax: 10,  pMin: 50,  pMax: 100 },
  };

  // Build a level def for a patient session (does not enter global EC.LEVELS list).
  function buildPatientLevelDef(patient) {
    const T = EC.TUNE || {};
    const trait = TRAITS[patient.trait] || TRAITS.Stable;
    const def = {
      id: patient.levelId,
      label: patient.name,
      // Match existing board setup style: use the same defaults as Level 3/4+.
      startRanges: {
        // IMPORTANT: core_model expects these exact keys/shape.
        wellsA: [trait.aMin, trait.aMax],
        wellsS: [trait.sMin, trait.sMax],
        psyP:   [trait.pMin, trait.pMax],
      },
      // Dispositions (random scheduler; no countdown shown)
      dispositionsRandom: true,
      dispositionsPool: Array.isArray(patient.dispositions) ? patient.dispositions.map((d) => ({
        duration:  (typeof d.duration === "number") ? d.duration : ((T.DISP_DEFAULT_DURATION != null) ? T.DISP_DEFAULT_DURATION : 30),
        hueIndex:  d.hueIndex,
        type:      d.type,
        strength:  (typeof d.strength === "number") ? d.strength : ((T.DISP_DEFAULT_STRENGTH != null) ? T.DISP_DEFAULT_STRENGTH : 4),
      })) : [],
    };

    // Treatment templates
    if (patient.treatment === 'Weekly') {
      const holdSec = 10;
      const focusHi = 300;
      const otherLo = 150;
      def.win = {
        type: 'WEEKLY_HOLD',
        focusHues: patient.focusHues.slice(0, 2),
        focusHi, otherLo, holdSec,
      };
      const f0 = def.win.focusHues[0];
      const f1 = def.win.focusHues[1];
      def.objectiveText = `Weekly: ${hueName(f0)} & ${hueName(f1)} ≥ ${focusHi}; others ≤ ${otherLo} (hold ${holdSec}s)`;
      // Goal viz mirrors objective (two OVER, four UNDER)
      def.goalVizPerHue = new Array(6).fill(null).map((_, i) => {
        if (i === f0 || i === f1) return { type: 'OVER', target: focusHi };
        return { type: 'UNDER', target: otherLo };
      });
    } else if (patient.treatment === 'Zen') {
      const holdSec = 10;
      def.win = {
        type: 'ZEN_CHAIN',
        steps: [
          { kind: 'ALL_OVER', threshold: 200, holdSec },
          { kind: 'ALL_BAND', low: 140, high: 175, holdSec },
          { kind: 'ALL_BAND', low: 100, high: 115, holdSec },
        ],
      };
      def.objectiveText = `Zen (3 steps): stabilize through ranges (hold ${holdSec}s each)`;
      // IMPORTANT: Zen needs goal-viz so the left objective panel can render numeric targets.
      // We seed with Step 1 (ALL_OVER 200). The live step goal-viz is updated during objective evaluation.
      def.goalVizPerHue = new Array(6).fill(null).map(() => ({ type: 'OVER', target: 200 }));
    } else {
      // Fallback: keep existing default behavior
      def.win = { type: 'ALL_OVER', threshold: (typeof T.LEVEL1_PSY_TARGET === 'number') ? T.LEVEL1_PSY_TARGET : 200 };
      def.objectiveText = `Raise ALL psyche colors to ≥ ${def.win.threshold}`;
      def.goalVizPerHue = new Array(6).fill(null).map(() => ({ type: 'OVER', target: def.win.threshold }));
    }

    def._isPatient = true;
    def._patientId = patient.id;
    def._patientTrait = patient.trait;
    def._patientTreatment = patient.treatment;

    return def;
  }

  // Hardcoded patients (coder-chosen details)
  const PATIENTS = [
    {
      id: 'p1', levelId: 101,
      name: 'Patient 1 — Grounded',
      trait: 'Stable',
      treatment: 'Weekly',
      focusHues: [2, 4], // Chill + Focus (coder-chosen)
      dispositions: [
        { type: 'TENDENCY', hueIndex: 2, startTime: 10 },
      ],
    },
    {
      id: 'p2', levelId: 102,
      name: 'Patient 2 — Quiet Spiral',
      trait: 'Stable',
      treatment: 'Zen',
      focusHues: [0, 3],
      dispositions: [
        { type: 'DAMPING', hueIndex: 2, startTime: 10 },
      ],
    },
    {
      id: 'p3', levelId: 103,
      name: 'Patient 3 — Restless',
      trait: 'Erratic',
      treatment: 'Weekly',
      focusHues: [0, 5], // Grit + Pep
      dispositions: [
        { type: 'AFFINITY', hueIndex: 2, startTime: 10 },
      ],
    },
    {
      id: 'p4', levelId: 104,
      name: 'Patient 4 — Low Tide',
      trait: 'Depressed',
      treatment: 'Weekly',
      focusHues: [2, 3], // Chill + Nerves
      dispositions: [
        { type: 'AVERSION', hueIndex: 2, startTime: 10 },
      ],
    },
    {
      id: 'p5', levelId: 105,
      name: 'Patient 5 — Loaded Spring',
      trait: 'Stable',
      treatment: 'Weekly',
      focusHues: [1, 2], // Ego + Chill
      dispositions: [
        { type: 'TENDENCY', hueIndex: 2, startTime: 10 },
        { type: 'AFFINITY', hueIndex: 2, startTime: 25 },
        { type: 'DAMPING', hueIndex: 2, startTime: 40 },
      ],
    },
  ];

  function getById(id) {
    return PATIENTS.find((p) => p.id === id) || null;
  }

  function list() {
    return PATIENTS.map((p) => ({
      id: p.id,
      name: p.name,
      trait: p.trait,
      treatment: p.treatment,
      dispositionCount: Array.isArray(p.dispositions) ? p.dispositions.length : 0,
    }));
  }

  function start(id) {
    const p = getById(id);
    if (!p) return;

    const def = buildPatientLevelDef(p);

    // Debug: verify objective shape for Zen/Weekly adapters.
    if (EC.DEBUG && def && def.win && p.treatment === 'Zen') {
      try { console.warn('[EC] Patient Zen objective def', def.win); } catch (e) {}
    }

    // Dev-only validation: fail loud in console, but don't crash with cryptic undefined property access.
    if (EC.DEBUG) {
      const ok = !!(def && def.startRanges && def.startRanges.wellsA && def.startRanges.wellsS && def.startRanges.psyP && def.win);
      if (!ok) {
        console.error('[EC] Patient definition invalid: missing objective params or startRanges', def);
        return;
      }
    }
    SIM._patientActive = true;
    SIM._patientId = p.id;
    SIM._patientLevelId = def.id;
    SIM.inLobby = false;

    if (SIM && typeof SIM.initMVP === 'function') {
      SIM.initMVP(def);
      // Ensure state flags used elsewhere are consistent.
      SIM.mvpWin = false;
      SIM.levelState = 'playing';
      SIM.mvpLose = false;
      SIM.gameOver = false;
      SIM.gameOverReason = '';
    }

    // Let UI know selection changed.
    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
  }

  function backToLobby() {
    SIM.inLobby = true;
    SIM._patientActive = false;
    SIM._patientId = null;
    SIM._patientLevelId = null;

    // Reset to a safe baseline level without advancing simulation.
    if (SIM && typeof SIM.initMVP === 'function') {
      SIM.initMVP(1);
      SIM.inLobby = true;
    }

    if (EC.UI_STATE) EC.UI_STATE._lobbyDirtyStamp = (EC.UI_STATE._lobbyDirtyStamp || 0) + 1;
  }

  // Hook Reset: when in a patient session, Reset returns to Lobby.
  if (!EC.PAT && typeof EC.resetRun === 'function') {
    const _baseReset = EC.resetRun;
    EC.resetRun = function resetRunWithLobby() {
      if (SIM && SIM._patientActive) {
        backToLobby();
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
    _buildDef: buildPatientLevelDef,
  };
})();
