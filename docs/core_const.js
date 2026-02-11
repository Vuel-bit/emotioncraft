// core_const.js — shared contracts (Chunk 7)
// Canonical shared indices/mappings used by sim/UI/render.
// No gameplay or visual behavior changes.
(function () {
  const EC = (window.EC = window.EC || {});

  // Canonical constants container
  EC.CONST = EC.CONST || {};

  // Hue order (index): 0 Red, 1 Purple, 2 Blue, 3 Green, 4 Yellow, 5 Orange
  const HUES = EC.CONST.HUES || ["red", "purple", "blue", "green", "yellow", "orange"];
  EC.CONST.HUES = HUES;

  // Player-facing well display names (must match the canonical hue index order above).
  // 0 red    => Grit
  // 1 purple => Ego
  // 2 blue   => Chill
  // 3 green  => Nerves
  // 4 yellow => Focus
  // 5 orange => Pep
  EC.CONST.WELL_DISPLAY_NAMES = ["Grit", "Ego", "Chill", "Nerves", "Focus", "Pep"];

  // Keep legacy/global alias for compatibility (many modules already use EC.HUES).
  EC.HUES = EC.HUES || HUES;

  // Opposite well mapping for the 6-well ring (0↔3, 1↔4, 2↔5)
  // Used by Zero Pair and opposite-push logic.
  EC.CONST.OPPOSITE_OF = EC.CONST.OPPOSITE_OF || [3, 4, 5, 0, 1, 2];

  // Common size / ring assumptions
  EC.CONST.WELL_COUNT = EC.CONST.WELL_COUNT || 6;

  // Register (best-effort)
  if (EC._registerModule) EC._registerModule('core_const', { provides: ['EC.CONST'] });
})();
