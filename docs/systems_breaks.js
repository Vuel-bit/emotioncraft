/* Emotioncraft — Mental Break framework (psyche-triggered)
   - Dispositions still affect wells only; breaks are based on psyche bounds.
   - A single break may be processed per tick.
   - On break: cancel active dispositions, apply relief → redirect → penalty.

   Causes implemented (v0.2.3):
     1) Psyche hue < 0
     2) Psyche hue > PSY_HUE_CAP (default 500)
     3) Psyche total > PSY_TOTAL_CAP (default 2000)
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const T = () => (EC.TUNE || {});

  EC.BREAK = EC.BREAK || {};

  // Persistent history scaffold (rolling lose condition can be layered later)
  EC.BREAK.history = EC.BREAK.history || [];
  // Rolling window timestamps for "Mind Shattered" lose condition
  EC.BREAK.timestamps = EC.BREAK.timestamps || [];

  let _cooldownMsgT = 0;
  let _lastTickId = -1;

  function _hueName(i) {
    if (EC.CONST && Array.isArray(EC.CONST.HUE_NAMES)) return EC.CONST.HUE_NAMES[i] || String(i);
    return String(i);
  }

  function _opp(i) {
    if (EC.CONST && Array.isArray(EC.CONST.OPPOSITE_OF)) return EC.CONST.OPPOSITE_OF[i] ?? ((i + 3) % 6);
    return (i + 3) % 6;
  }

  function _neighbors(i) {
    return [ (i + 5) % 6, (i + 1) % 6 ];
  }

  function _pushUiMsg(text) {
    const UI = EC.UI_STATE || (EC.UI_STATE = {});
    const msgSec = (typeof T().BREAK_MSG_SECONDS === 'number') ? T().BREAK_MSG_SECONDS : 4.5;
    const msg = String(text || '');
    UI.uiMsg = msg;
    UI.uiMsgT = msgSec;
    UI.uiMsgKind = '';
    UI.uiMsgReason = '';
  }

  function _pushBreakMsg(reasonText) {
    const UI = EC.UI_STATE || (EC.UI_STATE = {});
    const msgSec = (typeof T().BREAK_MSG_SECONDS === 'number') ? T().BREAK_MSG_SECONDS : 4.5;
    UI.uiMsgKind = 'break';
    UI.uiMsgFlashT = 0.80; // brief attention grab
    UI.uiMsgT = msgSec;
    UI.uiMsg = 'Mental Break';
    UI.uiMsgReason = String(reasonText || '').trim();
  
    try { if (EC.SFX && typeof EC.SFX.play === 'function') EC.SFX.play('error_003'); } catch (_) {}
}

  function _snap(sim) {
    const psy = new Array(6);
    const spin = new Array(6);
    for (let i = 0; i < 6; i++) {
      psy[i] = Number((sim.psyP && sim.psyP[i]) || 0);
      spin[i] = Number((sim.wellsS && sim.wellsS[i]) || 0);
    }
    return { psy, spin };
  }

  function _formatPsycheDelta(before, after) {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const d = Math.round((after[i] || 0) - (before[i] || 0));
      if (!d) continue;
      parts.push(`${_hueName(i)} ${d > 0 ? '+' : ''}${d}`);
    }
    return parts.length ? ('Psyche: ' + parts.join(', ')) : 'Psyche: (no change)';
  }

  function _formatSpinDelta(before, after) {
    const deltas = new Array(6);
    for (let i = 0; i < 6; i++) deltas[i] = (after[i] || 0) - (before[i] || 0);

    // If all deltas are identical (and non-zero), summarize.
    let same = true;
    for (let i = 1; i < 6; i++) {
      if (Math.abs(deltas[i] - deltas[0]) > 1e-6) { same = false; break; }
    }
    if (same && Math.abs(deltas[0]) > 1e-6) {
      const d = deltas[0];
      const v = (Math.round(d * 10) / 10);
      return `Spin: ALL ${v >= 0 ? '+' : ''}${v}`;
    }

    const parts = [];
    for (let i = 0; i < 6; i++) {
      const d = deltas[i];
      if (Math.abs(d) <= 1e-6) continue;
      const v = (Math.round(d * 10) / 10);
      parts.push(`${_hueName(i)} ${v >= 0 ? '+' : ''}${v}`);
    }
    return parts.length ? ('Spin: ' + parts.join(', ')) : 'Spin: (no change)';
  }

  function _cancelDispositions() {
    if (EC.DISP && typeof EC.DISP.cancelAll === 'function') {
      EC.DISP.cancelAll();
      return;
    }
    // Fallback: no-op if cancel not available
  }

  function _record(simTime, cause, details, message) {
    const rec = {
      time: simTime,
      cause: cause,
      details: details || {},
      message: message || ''
    };
    EC.BREAK.history.push(rec);
    // keep history bounded
    const max = (typeof T().BREAK_HISTORY_MAX === 'number') ? T().BREAK_HISTORY_MAX : 64;
    if (EC.BREAK.history.length > max) EC.BREAK.history.splice(0, EC.BREAK.history.length - max);
    return rec;
  }

  function _maybeTriggerLose(sim) {
    // Enforce: more than 3 breaks in any rolling 5-second window (i.e., >= 4)
    const now = Number(sim.mvpTime || 0);
    const arr = EC.BREAK.timestamps;
    arr.push(now);
    const cutoff = now - 5;
    // keep only entries in window
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] < cutoff) arr.splice(i, 1);
    }
    if (arr.length >= 4) {
      sim.levelState = 'lose';
      sim.mvpLose = true;
      sim.gameOver = true;
      sim.gameOverReason = 'Mind Shattered: 4 breaks in 5 seconds';
      sim.breaksInWindow = arr.length;
      // Short UI banner (HUD renders the full Game Over state)
      _pushUiMsg(sim.gameOverReason);
      return true;
    }
    sim.breaksInWindow = arr.length;
    return false;
  }

  function _triggerHueBreak(sim, h, kind, val) {
    // kind: 'LOW' or 'HIGH'
    const before = _snap(sim);
    const opp = _opp(h);
    const [L, R] = _neighbors(h);
    const oldS = (sim.wellsS && sim.wellsS[h] != null) ? Number(sim.wellsS[h]) : 0;

    // Relief: set psyche to safe band edge and zero the triggering well spin
    if (kind === 'LOW') {
      sim.psyP[h] = 20;
    } else {
      sim.psyP[h] = 480;
    }
    sim.wellsS[h] = 0;

    // Redirect: adjust opposite psyche
    if (kind === 'LOW') {
      sim.psyP[opp] = (sim.psyP[opp] || 0) - 20;
    } else {
      sim.psyP[opp] = (sim.psyP[opp] || 0) + 20;
    }

    // Neighbor spill: based on delta spin magnitude
    const deltaS = 0 - oldS;
    const mag = Math.abs(deltaS) / 2;
    if (mag > 0) {
      const sign = (kind === 'LOW') ? -1 : +1;
      sim.wellsS[L] = (sim.wellsS[L] || 0) + sign * mag;
      sim.wellsS[R] = (sim.wellsS[R] || 0) + sign * mag;
    }

    // Penalty: opposite well spin impulse
    if (kind === 'LOW') {
      sim.wellsS[opp] = (sim.wellsS[opp] || 0) - 25;
    } else {
      sim.wellsS[opp] = (sim.wellsS[opp] || 0) + 25;
    }

    const after = _snap(sim);
    const typeLine = `Mental Break: Hue Break — ${_hueName(h)} ${kind === 'LOW' ? 'below 0' : 'above cap'}`;
    const msgLines = [
      typeLine,
      _formatPsycheDelta(before.psy, after.psy),
      _formatSpinDelta(before.spin, after.spin),
    ].join('\n');
    _pushBreakMsg(msgLines);
    _record(sim.mvpTime || 0, kind === 'LOW' ? 'PSY_HUE_LOW' : 'PSY_HUE_HIGH', { hue: h, value: val }, msgLines);
    _maybeTriggerLose(sim);
  }

  function _triggerTotalBreak(sim, total) {
    const before = _snap(sim);
    // Relief: halve max psyche hue
    let maxI = 0;
    let maxV = -Infinity;
    for (let i = 0; i < 6; i++) {
      const v = Number(sim.psyP[i] || 0);
      if (v > maxV) { maxV = v; maxI = i; }
    }
    sim.psyP[maxI] = (sim.psyP[maxI] || 0) * 0.5;

    // Redirect/Penalty: all well spins -= 25
    for (let i = 0; i < 6; i++) {
      sim.wellsS[i] = (sim.wellsS[i] || 0) - 25;
    }

    const after = _snap(sim);
    const typeLine = `Mental Break: Total Break — total psyche above cap`;
    const msgLines = [
      typeLine,
      _formatPsycheDelta(before.psy, after.psy),
      _formatSpinDelta(before.spin, after.spin),
    ].join('\n');
    _pushBreakMsg(msgLines);
    _record(sim.mvpTime || 0, 'PSY_TOTAL_HIGH', { total: total, halvedHue: maxI, halvedFrom: maxV }, msgLines);
    _maybeTriggerLose(sim);
  }

  // ---------------------------------------------------------------------
  // Jam breaks (v0.2.5): triggered when spill propagation cannot resolve
  // overflow/underflow. Relief + Redirect only (no penalties for jams).
  // Causes:
  //   AMOUNT_HIGH_JAM, AMOUNT_LOW_JAM, SPIN_MAX_JAM, SPIN_MIN_JAM
  // ---------------------------------------------------------------------
  function _triggerJam(sim, cause, details) {
    // End dispositions immediately
    const before = _snap(sim);
    _cancelDispositions();

    function _addRandomPsyche(total) {
      // Distribute an integer total across 6 hues, sum exactly == total.
      const w = new Array(6);
      let ws = 0;
      for (let i = 0; i < 6; i++) {
        // Ensure some variance but allow zeros after rounding.
        const r = Math.random();
        w[i] = r;
        ws += r;
      }
      if (ws <= 0) ws = 1;

      const raw = new Array(6);
      const base = new Array(6);
      const frac = new Array(6);
      let sumBase = 0;
      for (let i = 0; i < 6; i++) {
        raw[i] = (w[i] / ws) * total;
        base[i] = Math.floor(raw[i]);
        frac[i] = raw[i] - base[i];
        sumBase += base[i];
      }
      let rem = total - sumBase;
      const order = [0,1,2,3,4,5].sort(function(a,b){ return frac[b] - frac[a]; });
      for (let k = 0; k < order.length && rem > 0; k++) {
        base[order[k]] += 1;
        rem -= 1;
      }
      // If still remainder due to all fracs==0, distribute deterministically.
      let idx = 0;
      while (rem > 0) {
        base[idx % 6] += 1;
        rem -= 1;
        idx++;
      }
      for (let i = 0; i < 6; i++) {
        sim.psyP[i] = (sim.psyP[i] || 0) + base[i];
      }
      return base;
    }

    function _reduceTop2Psyche(amountEach) {
      const arr = [0,1,2,3,4,5].map(function(i){ return { i:i, v:Number(sim.psyP[i]||0) }; });
      arr.sort(function(a,b){
        if (b.v !== a.v) return b.v - a.v;
        return a.i - b.i;
      });
      const i1 = arr[0].i;
      const i2 = arr[1].i;
      sim.psyP[i1] = (sim.psyP[i1] || 0) - amountEach;
      sim.psyP[i2] = (sim.psyP[i2] || 0) - amountEach;
      return [i1, i2];
    }

    // Relief + Redirect, then Penalty (jams only):
    // Redirects/penalties may overshoot; spillover will resolve this in the same tick.
    let msg = '';
    let penaltySummary = '';
    let penaltyDetails = null;
    if (cause === 'AMOUNT_HIGH_JAM') {
      for (let i = 0; i < 6; i++) sim.wellsA[i] = 80;
      for (let i = 0; i < 6; i++) sim.wellsS[i] = (sim.wellsS[i] || 0) + 20;
      // Penalty: +200 total psyche distributed randomly
      const dist = _addRandomPsyche(200);
      penaltySummary = 'Penalty: +200 psyche (random)';
      penaltyDetails = { psyAdd: dist };
      msg = 'Mental Break: Amount High Jam → A=80, Spin +20, ' + penaltySummary;
    } else if (cause === 'AMOUNT_LOW_JAM') {
      for (let i = 0; i < 6; i++) sim.wellsA[i] = 40;
      for (let i = 0; i < 6; i++) sim.wellsS[i] = (sim.wellsS[i] || 0) - 15;
      // Penalty: reduce top 2 psyche hues by 100 each (after relief+redirect)
      const top2 = _reduceTop2Psyche(100);
      penaltySummary = 'Penalty: -100 from top 2 hues';
      penaltyDetails = { psySubTop2: top2 };
      msg = 'Mental Break: Amount Low Jam → A=40, Spin -15, ' + penaltySummary;
    } else if (cause === 'SPIN_MAX_JAM') {
      for (let i = 0; i < 6; i++) sim.wellsS[i] = 80;
      for (let i = 0; i < 6; i++) sim.wellsA[i] = (sim.wellsA[i] || 0) + 20;
      const dist = _addRandomPsyche(200);
      penaltySummary = 'Penalty: +200 psyche (random)';
      penaltyDetails = { psyAdd: dist };
      msg = 'Mental Break: Spin Max Jam → S=+80, Amount +20, ' + penaltySummary;
    } else if (cause === 'SPIN_MIN_JAM') {
      for (let i = 0; i < 6; i++) sim.wellsS[i] = -80;
      for (let i = 0; i < 6; i++) sim.wellsA[i] = (sim.wellsA[i] || 0) - 20;
      const top2 = _reduceTop2Psyche(100);
      penaltySummary = 'Penalty: -100 from top 2 hues';
      penaltyDetails = { psySubTop2: top2 };
      msg = 'Mental Break: Spin Min Jam → S=-80, Amount -20, ' + penaltySummary;
    } else {
      msg = `Mental Break: Jam (${cause})`;
    }

    const after = _snap(sim);
    const typeLine = `Mental Break: Jam Break — ${String(cause || '').replace(/_/g, ' ')}`;
    const msgLines = [
      typeLine,
      _formatPsycheDelta(before.psy, after.psy),
      _formatSpinDelta(before.spin, after.spin),
    ].join('\n');
    _pushBreakMsg(msgLines);
    const recDetails = details ? Object.assign({}, details) : {};
    if (penaltyDetails) recDetails.penalty = penaltyDetails;
    _record(sim.mvpTime || 0, cause, recDetails, msgLines);
    _maybeTriggerLose(sim);
  }

  function _currentTickId(sim) {
    return (typeof sim._tickId === 'number') ? sim._tickId : Math.floor((sim.mvpTime || 0) * 1000);
  }

  // Public: trigger a jam break (single-break-per-tick guarded)
  EC.BREAK.triggerJam = function triggerJam(cause, details) {
    const SIM = EC.SIM;
    if (!SIM || !SIM.wellsA || !SIM.wellsS) return null;

    // If the run is already over, do nothing.
    if (SIM.levelState === 'lose' || SIM.mvpLose || SIM.gameOver) return null;

    const tickId = _currentTickId(SIM);
    if (tickId === _lastTickId) return null;
    _lastTickId = tickId;

    _triggerJam(SIM, cause, details);
    return EC.BREAK.history[EC.BREAK.history.length - 1] || null;
  };

  // Public: attempt to trigger at most one break per tick
  EC.BREAK.checkBreaks = function checkBreaks(dt) {
    const SIM = EC.SIM;
    if (!SIM || !SIM.psyP || !SIM.wellsS) return null;

    // If the run is already over, do not process additional breaks.
    if (SIM.levelState === 'lose' || SIM.mvpLose || SIM.gameOver) return null;

    // If already game over, do not process further breaks.
    if (SIM.levelState === 'lose' || SIM.gameOver || SIM.mvpLose) return null;

    // Single-break-per-tick guard:
    // Use an incrementing tick counter if present, else fall back to time quantization.
    const tickId = (typeof SIM._tickId === 'number') ? SIM._tickId : Math.floor((SIM.mvpTime || 0) * 1000);
    if (tickId === _lastTickId) return null;
    _lastTickId = tickId;

    const Tn = T();
    const PSY_HUE_CAP = (typeof Tn.PSY_HUE_CAP === 'number') ? Tn.PSY_HUE_CAP : 500;
    const PSY_TOTAL_CAP = (typeof Tn.PSY_TOTAL_CAP === 'number') ? Tn.PSY_TOTAL_CAP : 2000;

    // Scan hues (priority: hue bounds first)
    for (let i = 0; i < 6; i++) {
      const v = Number(SIM.psyP[i] || 0);
      if (v < 0) {
        _cancelDispositions();
        _triggerHueBreak(SIM, i, 'LOW', v);
        return EC.BREAK.history[EC.BREAK.history.length - 1] || null;
      }
      if (v > PSY_HUE_CAP) {
        _cancelDispositions();
        _triggerHueBreak(SIM, i, 'HIGH', v);
        return EC.BREAK.history[EC.BREAK.history.length - 1] || null;
      }
    }

    // Total check
    let total = 0;
    for (let i = 0; i < 6; i++) total += Number(SIM.psyP[i] || 0);
    if (total > PSY_TOTAL_CAP) {
      _cancelDispositions();
      _triggerTotalBreak(SIM, total);
      return EC.BREAK.history[EC.BREAK.history.length - 1] || null;
    }

    return null;
  };

  // Reset helper (called by level init/reset)
  EC.BREAK.reset = function resetBreaks() {
    try {
      EC.BREAK.timestamps = [];
      _lastTickId = -1;
      // Keep full history for debugging unless explicitly cleared
      // (history is bounded by BREAK_HISTORY_MAX).
      const UI = EC.UI_STATE || (EC.UI_STATE = {});
      UI.uiMsgT = 0;
      UI.uiMsg = '';
    } catch (_) { /* ignore */ }
  };

  // Alias per request
  EC.BREAK.maybeTrigger = EC.BREAK.checkBreaks;
})();
