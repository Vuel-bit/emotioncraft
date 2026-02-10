// core_tuning.js — extracted from v0.1.9.1 monolith (Step 1: tuning only)
// No behavior changes; provides EC.TUNING / EC.TUNE for the rest of the app.
//
// Tuning map:
// - EC.TUNING.*         legacy color-crafting tuning (kept as-is)
// - EC.TUNE.*           MVP gameplay tuning (caps, costs, regen, dispositions)
// - EC.TUNE.RENDER.*    MVP render/layout tunables (wells/labels)
// - EC.TUNE.COST.*      UI cost-preview helpers
// - EC.TUNE.DISP_*      Disposition HUD thresholds
(function () {
  const EC = (window.EC = window.EC || {});
  EC.TUNING = {
    maxComponent: 100,
    goalSeconds: 45,
    instabilityCap: 100,
    progressCap: 100,
    winRate: 10,
    // Dual progress bars: collapse should apply meaningful pressure early.
    loseRate: 80,
    progressP: 1.5,
    progressQ: 1.0,
    ccwInst: {
      rate: 0.040,            // instability per sec per (hueAmount * normalizedCCW)
      deadzone: 0.20,         // CCW smaller than this does not add instability
    },
    traumaFromOffHue: {
      base: 8,
      perAbsAmount: 0.22,
      perAttuneMag: 10,
    },
    traumaImprint: { add: 18 },
    breaks: {
      k: 0.22,                 // chance/sec multiplier on (trauma / hueAmount)
      maxChancePerSec: 0.30,  // cap chance/sec
      minSpendFrac: 0.15,
      maxSpendFrac: 0.45,
      minSpend: 2,
      maxSpend: 18,
      spendForMaxBoost: 18,
      minCCWBoost: 0.18,
      maxCCWBoost: 0.55,
      seconds: 2.2,
      telegraphSeconds: 0.35,
      stingGain: 0.045,
      soundCooldownSec: 0.75,
    },
    wellSize: {
      baseAmount: 60,
      minR: 72,
      maxR: 132,
    },
    traumaParticles: {
      max: 180,
      perTrauma: 4.2,
      jitter: 0.9,
    },
    swirlAnim: {
      // Scaled up so differences are obvious (e.g., 0.6 looks ~3x faster than 0.2).
      maxRadPerSec: 6.0, // at |netSwirl| = 1
    },

    // 0.1.6 UI state labels + feedback
    // (Primary vs Blended hysteresis, aspect deadzone, cue timings)
    stateLabels: {
      blendEnter: 0.20,
      blendExit: 0.15,
      deadzone: 0.20,
      audioCooldownSec: 0.50,
      rippleMs: 260,
      // Keep these subtle under browser playback constraints.
      chimeGain: 0.065,
      tickGain: 0.018,
    }
  };


  // ---------------------------------------------------------------------------
  // Redesign MVP tuning (Chunk 1) — stored separately from legacy EC.TUNING.
  // No behavior impact until the new MVP loop/render uses these values.
  EC.TUNE = Object.assign({}, EC.TUNE, {
    // Economy
    A_MIN: 25,
    A_MAX: 100,
    // MVP standardized spin range (model uses -100..100)
    S_MIN: -100,
    S_MAX: 100,
    // Testing-friendly energy (can tune down later)
    E_MAX: 200,
    E_REGEN: 1, // energy per second
    ENERGY_START: 10,
    ENERGY_REGEN_PER_SEC: 1,
    ENERGY_CAP: 200,

    // Psyche drive normalization (per spec): psycheDeltaPerSec = (A * S) / 1000
    PSY_FLUX_NORM: 1000,

    // Equalization rates (capped overflow/underflow equalization)
    // Preferred names (used by the spillover implementation):
    A_XFER_RATE: 20, // amount units per second (max transfer per well)
    S_XFER_RATE: 40, // spin units per second (max transfer per well)
    // Jam epsilon: unresolved overflow/underflow magnitude after spill propagation
    // that counts as a "jam" (used by mental break jam detection).
    // Jam detection epsilon (used only as fallback; sum-based triggers preferred)
    SPILL_JAM_EPS: 0.01,
    // NEW (v0.2.6): jam detection uses TOTAL unresolved overflow/underflow (sum)
    // so distributed deficit/surplus still triggers.
    // Jam detection (sum-based): lower so distributed overflow/underflow triggers reliably when saturated
    SPILL_JAM_SUM_EPS: 0.01,
    // Back-compat aliases (older code paths):
    A_RATE: 20,
    S_RATE: 40,

    // Player action cost normalization
    // Energy cost = abs(impulseCost) / COST_NORM
    COST_NORM: 100,
    // One-time opposite push strength (fraction of impulseSim)
    OPPOSITE_PUSH_K: 0.25,

    // Per-hue psyche clamp (UI + rules update)
    PSY_HUE_CAP: 500,

    // Total psyche capacity (UI core fill / overload threshold)
    PSY_TOTAL_CAP: 2000,

    // Mental Breaks (psyche-based triggers)
    BREAK_MSG_SECONDS: 6.0,
    BREAK_REDIRECT_DELTA: 20,
    BREAK_PENALTY_SPIN: 25,
    BREAK_NEIGHBOR_SPILL_DIV: 2,
    BREAK_RELIEF_LOW_TO: 20,
    BREAK_RELIEF_HIGH_TO: 480,

    // Zen level (Level 3) band + hold
    ZEN_LOW: 100,
    ZEN_HIGH: 120,
    ZEN_HOLD_SECONDS: 10,

    // Dispositions (v2) — external well-only waves (Level 3)
    DISP_DEFAULT_DURATION: 30,
    // Warning window shown before a disposition takes effect.
    // Quirk warning timeline: 3s flash + 3*(1.5s fill + 0.5s beat) = 9s total
    DISP_TELEGRAPH_SEC: 9,
    DISP_DEFAULT_STRENGTH: 3.0,

    // Quirk intensity scaling (tier steps: Low-Key→Noticeable→Intense)
    // Combined per-step impact ≈ 2× via (freq×dur×strength)
    DISP_TIER_FREQ_STEP: 1.30,
    DISP_TIER_DUR_STEP: 1.30,
    DISP_TIER_STR_STEP: 1.18,


    // Random disposition timing (patient sessions)
    // Each disposition slot is an independent event source.
    // Random scheduler mean per slot (tier 0 baseline). Tier multipliers below target 180/150/120.
    DISP_MEAN_INTERVAL_SEC_PER_SLOT: 180,
    // Minimum gap between the end of one disposition and the start of the next (global).
    // Global safety gap between disposition waves. Keep this small so
    // multi-slot patients scale their event rate properly.
    DISP_MIN_GAP_SEC: 3,

    // Back-compat (unused by current scheduler; kept for older builds/notes)
    DISP_MEAN_INTERVAL_SEC: 180,

    // Tier frequency multipliers (Low-Key / Noticeable / Intense)
    DISP_TIER_FREQ_MULTS: [1.0, 1.2, 1.5],

    // Integrated total-change targets per quirk (amount or spin impulse proxy)
    DISP_TIER_TOTAL_TARGETS: [40, 60, 80],
    // Optional per-tier jitter ranges for totals (min,max)
    DISP_TIER_TOTAL_JITTER: [[0.8, 1.2], [0.85, 1.15], [0.9, 1.1]],

    // ---------------------------------------------------------------------
    // Patient generation — Mindset + Vibe (v0.2.76)
    // ---------------------------------------------------------------------
    // Mindset total psyche targets (sum across 6 hues). Each label samples from a range.
    PAT_MINDSET_TOTAL_RANGES: {
      Spent: [525, 675],        // ~600 ±75
      Drained: [725, 875],      // ~800 ±75
      Steady: [925, 1075],      // ~1000 ±75
      Antsy: [1125, 1275],      // ~1200 ±75
      Overwhelmed: [1325, 1475] // ~1400 ±75
    },
    // Mindset distribution guardrails
    PAT_PSY_START_MIN: 50,
    PAT_PSY_START_MAX: 350,

    // Spread template shape parameters (relative to avg = total/6)
    // ≥30% tilt for Tilted/Split, ≥70% spike for Spike.
    PAT_SPREAD_TILT_FRAC: 0.35,
    PAT_SPREAD_SPIKE_FRAC: 0.75,
    PAT_SPREAD_FLAT_JITTER_FRAC: 0.10,

    // Vibe: starting wells
    PAT_VIBE_LABELS: ['Crisis', 'Blah', 'Mid', 'Anxious', 'Freaking'],
    PAT_VIBE_BANDS: {
      Crisis:   [-75, -50],
      Blah:     [-50, -25],
      Mid:      [-25,  25],
      Anxious:  [ 25,  50],
      Freaking: [ 50,  75]
    },
    PAT_VIBE_FLIP_CHANCE: 0.10,
    PAT_VIBE_MAX_FLIPS: 3,
    // Integrity checks (non-Erratic): preserve overall sign direction.
    PAT_VIBE_MEAN_NEG_MAX: -10,
    PAT_VIBE_MEAN_POS_MIN: 10,
    PAT_VIBE_NEG_COUNT_MIN: 4,
    PAT_VIBE_POS_COUNT_MIN: 4,
    // Erratic loosens but should not fully invert.
    PAT_VIBE_ERR_MEAN_NEG_MAX: -2,
    PAT_VIBE_ERR_MEAN_POS_MIN: 2,
    PAT_VIBE_ERR_NEG_COUNT_MIN: 3,
    PAT_VIBE_ERR_POS_COUNT_MIN: 3,

    // Treatment plan evaluation
    PAT_BAND_HOLD_SECONDS: 10,
    PAT_SPIN_ZERO_EPS: 1.0,

    // Plan step: "all spins = 0" epsilon
    PAT_SPIN_ZERO_EPS: 1.0,

    // Telegraph warning brightness per tier (muted / medium / bright)
    DISP_WARN_BRIGHTNESS_BY_TIER: [0.45, 0.70, 1.0],




    // Energy regen (spin-only, signed)
    // avgSpin = mean(Si) across wells; u = clamp(avgSpin/100, -1, +1)
    // regen = BASE * (1 - CW_PENALTY*max(0,u) + CCW_BONUS*max(0,-u))
    // clamped to [REGEN_MIN, REGEN_MAX]
    ENERGY_BASE_REGEN: 1.0,
    ENERGY_CW_PENALTY: 0.75,
    ENERGY_CCW_BONUS: 0.75,
    ENERGY_REGEN_MIN: 0.10,
    ENERGY_REGEN_MAX: 2.00,
    // Aliases (for readability / docs)
    BASE_REGEN: 1.0,
    CW_PENALTY: 0.75,
    CCW_BONUS: 0.75,
    REGEN_MIN: 0.10,
    REGEN_MAX: 2.00,

    // Neighbor coupling: spin-only, size-gated, and throttled by an interval.
    K_NEI: 0.60,
    NEIGHBOR_INTERVAL: 7.0,

    // Spin damping
    K_DAMP: 0.0,
    // MVP testing: keep spins persistent (no automatic decay).
    // If/when we want settling later, we can re-introduce damping at a much lower value.

    // Influence curves
    F_SIZE_EXP: 1.0,
    G_SIZE_EXP: 1.0,

    // Action costs (placeholders)
    COST_SPIN_BASE: 4,
    COST_SPIN_SCALE: 8,
    COST_AMT_BASE: 6,
    COST_AMT_SCALE: 10,

    // Win / hold
    WIN_TOLERANCE: 0.04,
    WIN_HOLD_SECONDS: 5,

    // Rendering
    PSYCHE_RADIUS: 110,
  });


  // ---------------------------------------------------------------------------
  // Consolidated tunables (Chunk 4) — keep values identical; move magic numbers out
  // of UI/render/mechanics modules for safer iteration later.
  // Sections:
  // - EC.TUNE.DISP_* : disposition waves HUD thresholds
  // - EC.TUNE.RENDER : MVP well/label rendering + layout constants
  // - EC.TUNE.COST   : action-cost preview helpers
  //
  // NOTE: Existing top-level EC.TUNE fields remain for back-compat.

  EC.TUNE.DISP_INTENSITY_MED_TH = 0.33;
  EC.TUNE.DISP_INTENSITY_HIGH_TH = 0.66;

  EC.TUNE.COST = EC.TUNE.COST || {};
  EC.TUNE.COST.S_SOFT_MULT = 3; // legacy fallback: 3x spin range

  EC.TUNE.RENDER = EC.TUNE.RENDER || {
    // MVP well palette + names (render_wells_update)
    MVP_WELL_COLORS: {
      red:    0xff4650,
      purple: 0xa46bff,
      blue:   0x5a96ff,
      green:  0x45d07a,
      yellow: 0xffdc55,
      orange: 0xff8f3d,
    },
    MVP_WELL_NAME: {
      // Theme pass (v0.2.28): presentation-only well names.
      // NOTE: Indices / mechanics stay identical.
      // Locked mapping:
      //   Blue   = Chill
      //   Orange = Pep
      //   Red    = Grit
      //   Green  = Nerves
      //   Yellow = Focus
      //   Purple = Ego
      red:    'Grit',
      yellow: 'Focus',
      blue:   'Chill',
      purple: 'Ego',
      green:  'Nerves',
      orange: 'Pep',
    },

    // Spin anim + preview
    SPIN_DEADZONE_NORM: 0.02,
    SPIN_MAX_OMEGA: 3.5,     // rad/sec at |spin|=1
    SPIN_DT_CAP: 0.05,       // seconds

    // Labels
    LABEL_FONT_MIN: 9,
    LABEL_FONT_MAX: 12,
    LABEL_FONT_SCALE: 0.22,

    NAME_FONT_MIN: 9,
    NAME_FONT_MAX: 18,
    NAME_FONT_SCALE: 0.16,
    NAME_WORDWRAP_MIN: 60,
    NAME_WORDWRAP_SCALE: 1.7,

    LABEL_OUTWARD_PAD: 14,       // default amount label outward from rim
    MID_SPIN_GAP_MIN: 16,        // tighter mid-well spin spacing
    MID_SPIN_GAP_SCALE: 0.30,

    PLANE_GAP_MIN: 8,            // top/bottom plane outward gap
    PLANE_GAP_SCALE: 0.10,
    PLANE_XOFF_MIN: 24,

    // More saturated sign colors for in-well A/S readability over liquid textures (visual-only).
    SPIN_POS_COLOR: 0x2dff7a,
    SPIN_NEG_COLOR: 0xff3b3b,
    SPIN_ZERO_COLOR: 0xffffff,

    // Ghost ring preview
    GHOST_RING_W_MIN: 1.5,
    GHOST_RING_W_SCALE: 0.055,
    GHOST_RING_ALPHA: 0.28,

    // Disposition visuals (telegraph + active)
    DISP_HALO_PAD: 6,           // extra radius beyond well rim
    DISP_HALO_W_MIN: 2,
    DISP_HALO_W_SCALE: 0.06,
    DISP_TELE_PULSE_HZ: 1.2,
    DISP_TELE_ALPHA_BASE: 0.10,
    DISP_TELE_ALPHA_GAIN: 0.35,
    DISP_ACTIVE_ALPHA_BASE: 0.15,
    DISP_ACTIVE_ALPHA_GAIN: 0.65,

    // Disposition halo colors + active fill meter
    // (warning halo is a magenta-red distinct from the red well (Grit) and selection highlight)
    DISP_WARN_HALO_COLOR: 0xff3d7f,
    DISP_ACTIVE_HALO_COLOR: 0xf5f5ff,
    DISP_ACTIVE_FILL_MAX_FRACTION: 1.00,

    DISP_ACTIVE_FILL_SEGMENTS: 72,
    // Neon tension gradient colors for active halo fill (not tied to well palette)
    DISP_TENSION_GREEN: 0x00ff66,
    DISP_TENSION_YELLOW: 0xfff000,
    DISP_TENSION_RED: 0xff0044,
    // Keep fill fully saturated (avoid washed-out look early/mid-fill)
    DISP_ACTIVE_FILL_ALPHA: 1.00,

    // Angle→tension mapping shaping
    // Hold green longer near the bottom region; then ramp to yellow/red.
    DISP_TENSION_GREEN_HOLD: 0.25,
    DISP_TENSION_GAMMA: 1.6,

    // Head glow riding the leading edge of the active progress ring
    DISP_HEAD_GLOW_COLOR: 0xffffff,
    DISP_HEAD_GLOW_ALPHA_MAX: 0.85,
    DISP_HEAD_GLOW_DEG: 16,
    DISP_HEAD_GLOW_WIDTH_SCALE: 1.6,

    // Optional subtle brightening of affected well during ACTIVE (secondary to halo)
    DISP_ACTIVE_BRIGHT_GAIN: 0.20,

  };

  // Shared hue display helper (presentation-only)
  // Used by lobby/objective UI to show consistent well names without touching mechanics.
  EC.hueLabel = EC.hueLabel || function hueLabel(i) {
    try {
      const hues = (EC.CONST && EC.CONST.HUES) || EC.HUES || ['red','purple','blue','green','yellow','orange'];
      const h = hues[i];
      const names = EC.TUNE && EC.TUNE.RENDER && EC.TUNE.RENDER.MVP_WELL_NAME;
      return (names && h && names[h]) ? names[h] : (h ? (h.charAt(0).toUpperCase() + h.slice(1)) : `Hue ${i}`);
    } catch (e) {
      return `Hue ${i}`;
    }
  };




  // Hardening: module registry (no gameplay impact)
  EC._registerModule && EC._registerModule('core_tuning', { provides: ["EC.TUNING"] });
})();
