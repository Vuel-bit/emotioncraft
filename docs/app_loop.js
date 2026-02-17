/* Emotioncraft — App Loop (MVP orchestration)
   Owns the MVP branch inside EC.tick (legacy loop remains in core_mechanics).
   No DOM access.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const APP = (EC.APP = EC.APP || {});

  APP.tickMvp = function tickMvp(delta) {
    const SIM = EC.SIM;
    const dt = (delta || 0) / 60;

    // MVP mode detection: six-well redesign sim
    if (SIM && SIM.wellsA && Array.isArray(SIM.wellsA) && SIM.wellsA.length === 6) {
      const safeDt = Math.min(dt, 0.05);
      if (EC.MECH && EC.MECH.step) EC.MECH.step(safeDt);
      if (EC.updatePsycheView) EC.updatePsycheView();
      if (EC.updateMvpBoardView) EC.updateMvpBoardView();
      if (EC.updateUI) EC.updateUI(safeDt);
      return true;
    }

    return false;
  };

  if (EC._registerModule) {
    EC._registerModule('app_loop', { provides: ['EC.APP.tickMvp'] });
  }
})();
