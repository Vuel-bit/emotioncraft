// systems_coach.js — top-bar stepper coach mode (board-visible, pause-preserving)
(() => {
  const EC = (window.EC = window.EC || {});
  const MOD = (EC.COACH = EC.COACH || {});

  function _sim() { return EC.SIM || null; }
  function _ui() { return (EC.UI_STATE = EC.UI_STATE || {}); }

  function _seenMap() {
    const UI = _ui();
    UI._seenFirstPopups = UI._seenFirstPopups || {};
    return UI._seenFirstPopups;
  }

  function _persistSeen() {
    try {
      if (EC.SAVE && typeof EC.SAVE.debouncedWrite === 'function') {
        const seenFirstPopups = Object.assign({}, _seenMap());
        EC.SAVE.debouncedWrite({ schemaVersion: 2, ui: { seenFirstPopups } }, { merge: true });
      }
    } catch (_) {}
  }

  function _ensureCoachObj(SIM) {
    SIM._coach = SIM._coach || {
      active: false,
      key: '',
      steps: [],
      stepIdx: 0,
      focusMask: [false, false, false, false, false, false],
      wellIdx: -1,
      kind: '',
      dir: '',
      _lastAdvanceMs: 0
    };
    if (!Array.isArray(SIM._coach.focusMask) || SIM._coach.focusMask.length !== 6) {
      SIM._coach.focusMask = [false, false, false, false, false, false];
    }
    return SIM._coach;
  }

  function _toMask(indices) {
    const mask = [false, false, false, false, false, false];
    if (Array.isArray(indices)) {
      for (let i = 0; i < indices.length; i++) {
        const idx = indices[i] | 0;
        if (idx >= 0 && idx < 6) mask[idx] = true;
      }
    }
    return mask;
  }

  function _applyStepFocus(SIM) {
    const c = _ensureCoachObj(SIM);
    const step = (Array.isArray(c.steps) && c.steps[c.stepIdx]) ? c.steps[c.stepIdx] : null;
    const focus = (step && Array.isArray(step.spotlight)) ? step.spotlight : (step && Array.isArray(step.focus) ? step.focus : []);
    c.focusMask = _toMask(focus);
  }

  MOD._setFocus = function _setFocus(wellIndicesArray) {
    const SIM = _sim();
    if (!SIM) return;
    const c = _ensureCoachObj(SIM);
    c.focusMask = _toMask(wellIndicesArray);
  };

  MOD.finish = function finish() {
    const SIM = _sim();
    if (!SIM) return;
    const c = _ensureCoachObj(SIM);
    c.active = false;
    c.key = '';
    c.steps = [];
    c.stepIdx = 0;
    c.focusMask = [false, false, false, false, false, false];
    c.wellIdx = -1;
    c.kind = '';
    c.dir = '';
    c._lastAdvanceMs = 0;
    SIM._breakPaused = false;
  };

  MOD.tapAdvance = function tapAdvance() {
    const SIM = _sim();
    if (!SIM || !SIM._coach || !SIM._coach.active) return;
    const c = _ensureCoachObj(SIM);
    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const lastMs = (typeof c._lastAdvanceMs === 'number') ? c._lastAdvanceMs : 0;
    if (nowMs - lastMs < 150) return;
    c._lastAdvanceMs = nowMs;
    c.stepIdx += 1;
    if (c.stepIdx >= c.steps.length) {
      MOD.finish();
      return;
    }
    _applyStepFocus(SIM);
  };

  MOD.update = function update(dt) {
    const SIM = _sim();
    if (!SIM || !SIM._coach || !SIM._coach.active) return;
    // Coach progression is tap-only; keep update as a no-op for HUD tick compatibility.
    void dt;
  };

  MOD.startOnce = function startOnce(key, spec) {
    const SIM = _sim();
    if (!SIM) return { started: false };
    if (SIM._tutNoHazards) return { started: false };

    const k = String(key || '');
    if (!k) return { started: false };

    const seen = _seenMap();
    if (seen[k]) return { started: false };

    const cNow = SIM._coach;
    if (cNow && cNow.active) return { started: false };

    const stepsIn = (spec && Array.isArray(spec.steps)) ? spec.steps : [];
    const steps = [];
    for (let i = 0; i < stepsIn.length; i++) {
      const st = stepsIn[i] || {};
      const txt = String(st.text || '').trim();
      if (!txt) continue;
      steps.push({
        text: txt,
        focus: Array.isArray(st.focus) ? st.focus.slice(0) : [],
        spotlight: Array.isArray(st.spotlight) ? st.spotlight.slice(0) : null,
        domSpotlightId: (st && st.domSpotlightId != null) ? String(st.domSpotlightId) : ''
      });
    }
    if (!steps.length) return { started: false };

    seen[k] = true;
    _persistSeen();

    const c = _ensureCoachObj(SIM);
    c.active = true;
    c.key = k;
    c.steps = steps;
    c.stepIdx = 0;
    c.wellIdx = (spec && typeof spec.wellIdx === 'number') ? (spec.wellIdx | 0) : -1;
    c.kind = (spec && spec.kind != null) ? String(spec.kind) : '';
    c.dir = (spec && spec.dir != null) ? String(spec.dir) : '';
    c._lastAdvanceMs = 0;
    _applyStepFocus(SIM);

    SIM._breakPaused = true;
    return { started: true };
  };
})();
