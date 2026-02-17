/* Emotioncraft — Traits system (Chunk: Traits + Zen timer)
   Provides simple per-run modifiers driven by the active patient.
   - sensitive: quirk strength x1.5
   - stubborn: energy costs x1.2
   - fragile: (deprecated) total psyche cap was removed

   Guardrails:
   - No ES modules; attaches to window.EC.
   - Safe when traits are missing.
*/
(function () {
  const EC = (window.EC = window.EC || {});

  const MOD = (EC.TRAITS = EC.TRAITS || {});

  const CANON = {
    sensitive: true,
    stubborn: true,
    fragile: true,
    grounded: true,
  };

  function normKey(k) {
    return String(k || '').trim().toLowerCase();
  }

  // Returns a normalized, de-duped trait list from SIM.
  // Source of truth: SIM.patientTraits (array of strings).
  MOD.list = function list(simIn) {
    const SIM = simIn || EC.SIM || {};
    const raw = SIM.patientTraits || SIM._patientTraits || [];
    if (!Array.isArray(raw)) return [];

    const out = [];
    const seen = Object.create(null);
    for (let i = 0; i < raw.length; i++) {
      const k = normKey(raw[i]);
      if (!k || !CANON[k] || seen[k]) continue;
      seen[k] = true;
      out.push(k);
    }
    return out;
  };

  MOD.has = function has(simIn, key) {
    const k = normKey(key);
    if (!CANON[k]) return false;
    const ls = MOD.list(simIn);
    for (let i = 0; i < ls.length; i++) if (ls[i] === k) return true;
    return false;
  };

  MOD.getQuirkStrengthMult = function getQuirkStrengthMult(simIn) {
    return MOD.has(simIn, 'sensitive') ? 1.5 : 1.0;
  };

  MOD.getEnergyCostMult = function getEnergyCostMult(simIn) {
    return MOD.has(simIn, 'stubborn') ? 1.2 : 1.0;
  };

  // Deprecated: total psyche cap system removed (Chunk 3B).
  // Kept only for compatibility; returns null so callers can ignore.
  MOD.getPsyTotalCap = function getPsyTotalCap(_simIn) {
    return null;
  };

  // Timed-plan limit override (used by grounded trait).
  // If the active patient has 'grounded', timed boards start at 10:00.
  MOD.getTimedPlanLimitSec = function getTimedPlanLimitSec(simIn, baseSec) {
    const b = (typeof baseSec === 'number' && isFinite(baseSec)) ? baseSec : (12 * 60);
    return MOD.has(simIn, 'grounded') ? (10 * 60) : b;
  };

})();
