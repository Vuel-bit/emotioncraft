/* Emotioncraft — Mental Break framework (psyche-triggered)
   - Dispositions still affect wells only; breaks are based on psyche bounds.
   - A single break may be processed per tick.
   - On break: cancel active dispositions, apply relief → redirect → penalty.

   Causes implemented (v0.2.3):
     1) Psyche hue < 0
     2) Psyche hue > PSY_HUE_CAP (default 500)
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const T = () => (EC.TUNE || {});

  EC.BREAK = EC.BREAK || {};

  // Persistent history scaffold (rolling lose condition can be layered later)
  EC.BREAK.history = EC.BREAK.history || [];
  // Rolling window timestamps for "Mind Shattered" lose condition
  EC.BREAK.timestamps = EC.BREAK.timestamps || [];

  // One-time informational popups (per browser session, in-memory).
  EC.BREAK.showInfoOnce = function showInfoOnce(key, title, lines, okText, onOk) {
    const SIM = EC.SIM;
    if (!SIM) return false;
    // Never show in tutorial / hazards disabled.
    if (SIM._tutNoHazards) return false;
    // If another modal is already visible, do nothing.
    if (SIM._breakModal) return false;

    const UI = EC.UI_STATE || (EC.UI_STATE = {});
    UI._seenFirstPopups = UI._seenFirstPopups || {};
    const k = String(key || '');
    if (!k) return false;
    if (UI._seenFirstPopups[k]) return false;
    UI._seenFirstPopups[k] = true;

    try {
      SIM._breakPaused = true;
      SIM._breakModal = {
        title: String(title || 'Info'),
        lines: Array.isArray(lines) ? lines.map((x) => String(x)) : [String(lines || '')],
        okText: okText ? String(okText) : 'OK',
        onOk: (typeof onOk === 'function') ? onOk : null
      };
      return true;
    } catch (_) {
      return false;
    }
  };

  let _cooldownMsgT = 0;
  let _lastTickId = -1;
  // Jam-only cascade guard (allows jam→jam within a single tick, capped)
  let _lastJamTickId = -1;
  let _jamCountThisTick = 0;

  function _wellName(i) {
    try {
      if (typeof EC.wellLabel === 'function') {
        const v = EC.wellLabel(i);
        if (v && String(v).indexOf('Hue ') !== 0) return String(v);
      }
    } catch (_) {}
    if (EC.CONST && Array.isArray(EC.CONST.WELL_DISPLAY_NAMES)) return EC.CONST.WELL_DISPLAY_NAMES[i] || String(i);
    return _hueName(i);
  }

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
    // Break messaging is log-only: no HUD notify/toast.
    try { if (EC.SFX && typeof EC.SFX.play === 'function') EC.SFX.play('error_003'); } catch (_) {}
  }

  function _nowMs() {
    try { return (performance && performance.now) ? performance.now() : Date.now(); } catch (_) { return Date.now(); }
  }

  function _mmss(sec) {
    const t = Math.max(0, sec || 0);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function _wellDispName(i) {
    try {
      if (typeof EC.wellLabel === 'function') {
        const v = EC.wellLabel(i);
        if (v && String(v).indexOf('Hue ') !== 0) return String(v);
      }
      const n = (EC.CONST && EC.CONST.WELL_DISPLAY_NAMES && EC.CONST.WELL_DISPLAY_NAMES[i]) || null;
      return n || ('Well ' + (i + 1));
    } catch (_) { return 'Well ' + (i + 1); }
  }

  function _spanWell(i) {
    const n = _wellDispName(i);
    return '<span class="logWell w' + i + '">' + String(n) + '</span>';
  }

  function _ensureLogStore() {
    const UI = (EC.UI_STATE = EC.UI_STATE || {});
    UI.logEntries = UI.logEntries || [];
    return UI.logEntries;
  }

  function _appendLog(sim, html) {
    const arr = _ensureLogStore();
    arr.push({ tSec: (sim && typeof sim.mvpTime === 'number') ? sim.mvpTime : 0, html: String(html || '') });
  }

  function _triggerBreakUI(sim, titleLine, before, after) {
    if (!sim) return;
    // Quirks must not carry through a mental break: cancel pending/telegraph/active and reset ramp timers.
    try {
      if (EC.DISP && typeof EC.DISP.resetAllQuirkTimers === 'function') EC.DISP.resetAllQuirkTimers();
    } catch (_) {}
    // 0.5s hit-stop
    sim._hitStopT = 0.5;
    // FX masks
    const wellMask = new Array(6).fill(false);
    const psyMask = new Array(6).fill(false);
    try {
      for (let i = 0; i < 6; i++) {
        if ((before.a[i] | 0) !== (after.a[i] | 0)) wellMask[i] = true;
        if ((before.s[i] | 0) !== (after.s[i] | 0)) wellMask[i] = true;
        if ((before.psy[i] | 0) !== (after.psy[i] | 0)) psyMask[i] = true;
      }
    } catch (_) {}
    sim._breakFx = { startMs: _nowMs(), durMs: 900, wellMask, psyMask };
    // Log entry
    try {
      const lines = [];
      lines.push('<div><b>Mental Break</b> — ' + String(titleLine || '') + '</div>');
      const adj = [];
      for (let i = 0; i < 6; i++) {
        const da = (after.a[i] || 0) - (before.a[i] || 0);
        const ds = (after.s[i] || 0) - (before.s[i] || 0);
        if (da || ds) {
          const bits = [];
          if (da) bits.push('amount ' + (da > 0 ? '+' : '') + da);
          if (ds) bits.push('spin ' + (ds > 0 ? '+' : '') + ds.toFixed(2));
          adj.push('• ' + _spanWell(i) + ' ' + bits.join(', '));
        }
      }
      if (adj.length) lines.push('<div style="margin-top:6px">' + adj.join('<br>') + '</div>');
      const psy = [];
      for (let i = 0; i < 6; i++) {
        const dp = (after.psy[i] || 0) - (before.psy[i] || 0);
        if (dp) psy.push('• ' + _spanWell(i) + ' psyche ' + (dp > 0 ? '+' : '') + dp);
      }
      if (psy.length) lines.push('<div style="margin-top:6px">' + psy.join('<br>') + '</div>');
      _appendLog(sim, lines.join(''));
    } catch (_) {}
  }




  function _setBreakModal(sim, title, reason, before, after) {
    if (!sim) return;
    const lines = [];
    if (reason) lines.push(String(reason));
    // Adjusted wells (amount/spin)
    const adj = [];
    for (let i = 0; i < 6; i++) {
      const n = _wellName(i);
      const a0 = before && before.a ? before.a[i] : null;
      const a1 = after && after.a ? after.a[i] : null;
      const s0 = before && before.s ? before.s[i] : null;
      const s1 = after && after.s ? after.s[i] : null;
      if (a0 != null && a1 != null && Math.round(a0) !== Math.round(a1)) adj.push(`${n}: Amount ${Math.round(a0)}→${Math.round(a1)}`);
      if (s0 != null && s1 != null && Math.round(s0) !== Math.round(s1)) adj.push(`${n}: Spin ${Math.round(s0)}→${Math.round(s1)}`);
    }
    if (adj.length) {
      lines.push('');
      lines.push('Wells adjusted:');
      for (const t of adj) lines.push('• ' + t);
    }
    // Psyche changes
    const psy = [];
    for (let i = 0; i < 6; i++) {
      const n = _wellName(i);
      const p0 = before && before.psy ? before.psy[i] : null;
      const p1 = after && after.psy ? after.psy[i] : null;
      if (p0 != null && p1 != null && Math.round(p0) !== Math.round(p1)) psy.push(`${n}: Psyche ${Math.round(p0)}→${Math.round(p1)}`);
    }
    if (psy.length) {
      lines.push('');
      lines.push('Psyche changes:');
      for (const t of psy) lines.push('• ' + t);
    }
    sim._breakModal = { title: String(title || 'Mental Break'), lines: lines };
    // sim._breakPaused removed (break modal disabled);
  }


  function _snap(sim) {
    const a = new Array(6);
    const s = new Array(6);
    const psy = new Array(6);
    for (let i = 0; i < 6; i++) {
      a[i] = Number((sim.wellsA && sim.wellsA[i]) || 0);
      s[i] = Number((sim.wellsS && sim.wellsS[i]) || 0);
      psy[i] = Number((sim.psyP && sim.psyP[i]) || 0);
    }
    return { a, s, psy };
  }

  function _formatPsycheDelta(before, after) {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const d = Math.round((after[i] || 0) - (before[i] || 0));
      if (!d) continue;
      parts.push(`${_wellName(i)} ${d > 0 ? '+' : ''}${d}`);
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
      parts.push(`${_wellName(i)} ${v >= 0 ? '+' : ''}${v}`);
    }
    return parts.length ? ('Spin: ' + parts.join(', ')) : 'Spin: (no change)';
  }

  function _formatAmountDelta(before, after) {
    const deltas = new Array(6);
    for (let i = 0; i < 6; i++) deltas[i] = (after[i] || 0) - (before[i] || 0);

    // If all deltas are identical (and non-zero), summarize.
    let same = true;
    for (let i = 1; i < 6; i++) {
      if (Math.abs(deltas[i] - deltas[0]) > 1e-6) { same = false; break; }
    }
    if (same && Math.abs(deltas[0]) > 1e-6) {
      const d = Math.round(deltas[0]);
      return `Amount: ALL ${d >= 0 ? '+' : ''}${d}`;
    }

    const parts = [];
    for (let i = 0; i < 6; i++) {
      const d = Math.round(deltas[i]);
      if (!d) continue;
      parts.push(`${_wellName(i)} ${d > 0 ? '+' : ''}${d}`);
    }
    return parts.length ? ('Amount: ' + parts.join(', ')) : 'Amount: (no change)';
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
    const typeLine = `Mental Break: Hue Break — ${_wellName(h)} ${kind === 'LOW' ? 'below 0' : 'above cap'}`;

    // Build log lines first; first-occurrence popup must reuse this exact text.
    const titleLine = (msg && typeof msg === 'string') ? msg : typeLine;
    const msgArr = [
      titleLine,
      _formatPsycheDelta(before.psy, after.psy),
      _formatAmountDelta(before.a, after.a),
      _formatSpinDelta(before.s, after.s),
    ];

    // First-time informational popup (additive; does not change mechanics).
    // Spec: title = first line, body = remaining lines.
    try {
      if (EC.BREAK && typeof EC.BREAK.showInfoOnce === 'function') {
        if (kind === 'LOW') {
          EC.BREAK.showInfoOnce('break_hue_under_floor', msgArr[0], msgArr.slice(1));
        } else {
          EC.BREAK.showInfoOnce('break_hue_over_cap', msgArr[0], msgArr.slice(1));
        }
      }
    } catch (_) {}

    const msgLines = msgArr.join('\n');
    _pushBreakMsg(msgLines);
    _triggerBreakUI(sim, typeLine, before, after);
    _record(sim.mvpTime || 0, kind === 'LOW' ? 'PSY_HUE_LOW' : 'PSY_HUE_HIGH', { hue: h, value: val }, msgLines);
    _maybeTriggerLose(sim);
  }
    // ---------------------------------------------------------------------
  // Jam breaks (v0.2.5): triggered when spill propagation cannot resolve
  // overflow/underflow. Relief + Redirect + penalty (as specified).
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

  function _addToLowest2Psyche(sim, addEach) {
    const amt = (typeof addEach === 'number' && isFinite(addEach)) ? addEach : 0;
    // Find two lowest distinct hues (ties: any).
    let a = 0, b = 1;
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        const si = Number(sim.psyP[i] || 0);
        const sj = Number(sim.psyP[j] || 0);
        const sa = Number(sim.psyP[a] || 0);
        const sbv = Number(sim.psyP[b] || 0);
        if ((si + sj) < (sa + sbv)) { a = i; b = j; }
      }
    }
    const PSY_HUE_CAP = (typeof T().PSY_HUE_CAP === 'number') ? T().PSY_HUE_CAP : 500;
    const before = [Number(sim.psyP[a] || 0), Number(sim.psyP[b] || 0)];
    sim.psyP[a] = Math.min(PSY_HUE_CAP, Number(sim.psyP[a] || 0) + amt);
    sim.psyP[b] = Math.min(PSY_HUE_CAP, Number(sim.psyP[b] || 0) + amt);
    return { idx: [a, b], before: before, after: [Number(sim.psyP[a] || 0), Number(sim.psyP[b] || 0)], add: amt };
  }

    // Relief + Redirect, then Penalty (jams only):
    // Redirects/penalties may overshoot; spillover will resolve this in the same tick.
    let msg = '';
    let penaltySummary = '';
    let penaltyDetails = null;
    if (cause === 'AMOUNT_HIGH_JAM') {
      const j = (details && typeof details.index === 'number') ? (details.index|0) : 0;
      // Relief: set JAMMED well's amount to 85
      sim.wellsA[j] = 85;
      // Redirect: +15 spin to ALL wells
      for (let i = 0; i < 6; i++) sim.wellsS[i] = (sim.wellsS[i] || 0) + 15;
      // Penalty: +100 to each of the two lowest psyche hues
      const low2 = _addToLowest2Psyche(sim, 100);
      penaltySummary = 'Penalty: +100 to two lowest hues';
      penaltyDetails = { psyAddLow2: low2 };
      msg = 'Mental Break: Amount High Jam → ' + _wellName(j) + ' Amount=85, Spin +15 all, ' + penaltySummary;
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
      // Penalty: +100 to each of the two lowest psyche hues
      const low2 = _addToLowest2Psyche(sim, 100);
      penaltySummary = 'Penalty: +100 to two lowest hues';
      penaltyDetails = { psyAddLow2: low2 };
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

    // Build log lines first; first-occurrence popup must reuse this exact text.
    const msgArr = [
      typeLine,
      _formatPsycheDelta(before.psy, after.psy),
      _formatSpinDelta(before.s, after.s),
    ];

    // First-time informational popup (spin jam min/max required).
    // Spec: title = first line, body = remaining lines.
    try {
      if (EC.BREAK && typeof EC.BREAK.showInfoOnce === 'function') {
        if (cause === 'SPIN_MAX_JAM') {
          EC.BREAK.showInfoOnce('break_jam_spin_max', msgArr[0], msgArr.slice(1));
        } else if (cause === 'SPIN_MIN_JAM') {
          EC.BREAK.showInfoOnce('break_jam_spin_min', msgArr[0], msgArr.slice(1));
        }
      }
    } catch (_) {}

    const msgLines = msgArr.join('\n');
    _pushBreakMsg(msgLines);
    _triggerBreakUI(sim, typeLine, before, after);
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

    // Allow up to 2 jam breaks per tick (jam→jam only).
    // This enables cascades (e.g., SPIN_MAX_JAM causing AMOUNT_HIGH_JAM)
    // while still preventing psyche breaks from firing in the same tick.
    if (tickId !== _lastJamTickId) {
      _lastJamTickId = tickId;
      _jamCountThisTick = 0;
    }
    if (_jamCountThisTick >= 2) return null;
    _jamCountThisTick += 1;

    // Still consume the shared per-tick break guard so psyche breaks
    // cannot fire during the same tick as any jam break.
    _lastTickId = tickId;

    _triggerJam(SIM, cause, details);
    return EC.BREAK.history[EC.BREAK.history.length - 1] || null;
  };

  // Public: attempt to trigger at most one break per tick
  EC.BREAK.checkBreaks = function checkBreaks(dt) {
    const SIM = EC.SIM;
    if (!SIM || !SIM.psyP || !SIM.wellsS) return null;

    // Tutorial safety: never process breaks when hazards are disabled.
    if (SIM._tutNoHazards) return null;

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

    return null;
  };

  // Reset helper (called by level init/reset)
  EC.BREAK.reset = function resetBreaks() {
    try {
      EC.BREAK.timestamps = [];
      _lastTickId = -1;
      _lastJamTickId = -1;
      _jamCountThisTick = 0;
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
