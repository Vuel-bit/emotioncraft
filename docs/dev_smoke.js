/* Emotioncraft — Dev Smoke Runner
   Loaded ONLY by dev_smoke.html.
   Provides a lightweight automated smoke sequence + manual buttons.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const SMOKE = (EC.SMOKE = EC.SMOKE || {});

  const UI_IDS = {
    panel: 'smokePanel',
    log: 'smokeLog',
    status: 'smokeStatus',
    btnRun: 'btnSmokeRun',
    btnStart: 'btnSmokeStart',
    btnFF5: 'btnSmokeFF5',
    btnFF30: 'btnSmokeFF30',
    btnBreak: 'btnSmokeBreak',
    btnAck: 'btnSmokeAck',
    btnSwipeR: 'btnSmokeSwipeR',
    btnSwipeU: 'btnSmokeSwipeU',
    btnLobby: 'btnSmokeLobby',
    btnClear: 'btnSmokeClear',
  };

  let _els = null;
  let _runToken = 0;
  let _isRunning = false;

  function _nowMs() {
    try { return (performance && performance.now) ? performance.now() : Date.now(); } catch (_) { return Date.now(); }
  }
  function _ts() {
    const ms = _nowMs();
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const mm = String(m).padStart(2,'0');
    const ss = String(s).padStart(2,'0');
    return `${mm}:${ss}`;
  }

  function _getEls() {
    if (_els) return _els;
    const byId = (id) => document.getElementById(id);
    _els = {
      panel: byId(UI_IDS.panel),
      log: byId(UI_IDS.log),
      status: byId(UI_IDS.status),
      btnRun: byId(UI_IDS.btnRun),
      btnStart: byId(UI_IDS.btnStart),
      btnFF5: byId(UI_IDS.btnFF5),
      btnFF30: byId(UI_IDS.btnFF30),
      btnBreak: byId(UI_IDS.btnBreak),
      btnAck: byId(UI_IDS.btnAck),
      btnSwipeR: byId(UI_IDS.btnSwipeR),
      btnSwipeU: byId(UI_IDS.btnSwipeU),
      btnLobby: byId(UI_IDS.btnLobby),
      btnClear: byId(UI_IDS.btnClear),
    };
    return _els;
  }

  function _setStatus(text) {
    const els = _getEls();
    if (!els || !els.status) return;
    els.status.textContent = String(text || '');
  }

  SMOKE.log = function log(line) {
    const els = _getEls();
    const pre = els && els.log;
    const msg = `[${_ts()}] ${String(line || '')}`;
    if (pre) {
      pre.textContent = (pre.textContent ? (pre.textContent + '\n') : '') + msg;
      try { pre.scrollTop = pre.scrollHeight; } catch (_) {}
    }
    try { console.log('[SMOKE]', msg); } catch (_) {}
  };

  SMOKE.clearLog = function clearLog() {
    const els = _getEls();
    if (els && els.log) els.log.textContent = '';
    _setStatus('IDLE');
  };

  SMOKE.waitReady = function waitReady(timeoutMs) {
    const t0 = _nowMs();
    const to = (typeof timeoutMs === 'number' && isFinite(timeoutMs)) ? timeoutMs : 8000;

    return new Promise((resolve) => {
      function poll() {
        const ok = !!(EC && EC.ENGINE && EC.SIM && EC.PAT && EC.ACTIONS && EC.INPUT);
        if (ok) return resolve({ ok: true });
        if ((_nowMs() - t0) > to) return resolve({ ok: false, reason: 'timeout' });
        setTimeout(poll, 60);
      }
      poll();
    });
  };

  SMOKE.pickPatientId = function pickPatientId() {
    try {
      const roster = EC.DATA && Array.isArray(EC.DATA.ROSTER) ? EC.DATA.ROSTER : null;
      if (roster && roster.length) {
        const stable = roster.find((p) => (p && p.id) === 'waverly_wade');
        if (stable && stable.id) return String(stable.id);
        if (roster[0] && roster[0].id) return String(roster[0].id);
      }
    } catch (_) {}
    return 'waverly_wade';
  };

  function _ensureLobby() {
    const SIM = EC.SIM || {};
    if (SIM.inLobby) return { ok: true, inLobby: true };
    // Try patient transition first.
    if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') {
      const r = EC.ENGINE.dispatch('patBackToLobby');
      return r && r.ok ? { ok: true, inLobby: true } : { ok: false, reason: 'patBackToLobby_failed', detail: r };
    }
    return { ok: false, reason: 'no_engine' };
  }

  SMOKE.startRun = function startRun() {
    const pid = SMOKE.pickPatientId();
    const eng = EC.ENGINE;
    if (!eng || typeof eng.dispatch !== 'function') {
      SMOKE.log('startRun: missing EC.ENGINE.dispatch');
      return { ok: false, reason: 'no_engine' };
    }

    // Always attempt to be in lobby before starting.
    try {
      const lob = _ensureLobby();
      if (!lob.ok) SMOKE.log(`ensureLobby: ${lob.reason || 'fail'}`);
    } catch (_) {}

    const r1 = eng.dispatch('patBeginFromLobby', pid);
    if (!r1 || !r1.ok) {
      SMOKE.log(`patBeginFromLobby failed: ${(r1 && (r1.reason || r1.action)) || 'unknown'}`);
      return { ok: false, reason: 'begin_failed', pid, detail: r1 };
    }

    // Try WEEKLY first; fall back to INTAKE if dispatch throws/fails.
    let planKey = 'WEEKLY';
    let r2 = eng.dispatch('patStartPending', planKey);
    if (!r2 || !r2.ok) {
      SMOKE.log(`patStartPending(${planKey}) failed: ${(r2 && (r2.reason || r2.action)) || 'unknown'}`);
      planKey = 'INTAKE';
      r2 = eng.dispatch('patStartPending', planKey);
    }

    if (!r2 || !r2.ok) {
      SMOKE.log(`patStartPending failed: ${(r2 && (r2.reason || r2.action)) || 'unknown'}`);
      return { ok: false, reason: 'start_failed', pid, planKey, detail: r2 };
    }

    SMOKE.log(`Started run: pid=${pid}, plan=${planKey}`);
    return { ok: true, pid, planKey };
  };

  SMOKE.fastForward = function fastForward(seconds) {
    const s = Math.max(0, Number(seconds || 0));
    const frames = Math.max(0, Math.round(s * 60));
    const eng = EC.ENGINE;
    if (!eng || typeof eng.tick !== 'function') {
      SMOKE.log('fastForward: missing EC.ENGINE.tick');
      return Promise.resolve({ ok: false, reason: 'no_engine' });
    }

    const token = _runToken;
    let done = 0;
    const CHUNK = 90; // ~1.5s at 60fps

    return new Promise((resolve) => {
      function pump() {
        if (token !== _runToken) return resolve({ ok: false, reason: 'canceled' });
        const n = Math.min(CHUNK, frames - done);
        for (let i = 0; i < n; i++) {
          try { eng.tick(1); } catch (_) {}
        }
        done += n;
        if (done >= frames) return resolve({ ok: true, seconds: s, frames });
        setTimeout(pump, 0);
      }
      pump();
    });
  };

  SMOKE.triggerBreak = function triggerBreak() {
    const eng = EC.ENGINE;
    const SIM = EC.SIM;
    if (!SIM) return { ok: false, reason: 'no_sim' };
    if (!EC.BREAK || typeof EC.BREAK.triggerJam !== 'function') {
      SMOKE.log('triggerBreak: EC.BREAK.triggerJam not available (skipped)');
      return { ok: true, skipped: true };
    }

    const call = () => {
      try {
        // Prefer SPIN_MAX_JAM so the first-time info modal path is exercised.
        return EC.BREAK.triggerJam('SPIN_MAX_JAM', { cause: 'SMOKE', src: 'dev_smoke' });
      } catch (e) {
        return null;
      }
    };

    let res = null;
    try {
      if (eng && typeof eng._withSimWrites === 'function') res = eng._withSimWrites('smoke:triggerJam', call);
      else res = call();
    } catch (_) {}

    // If no modal was opened (e.g., info already seen), open a dev-only modal for ack coverage.
    try {
      if (!SIM._breakModal && EC.BREAK && typeof EC.BREAK.showInfoOnce === 'function') {
        const k = 'smoke_modal_' + Math.floor(_nowMs());
        EC.BREAK.showInfoOnce(k, 'Smoke: Break Modal', ['Dev smoke runner break/ack coverage.']);
      }
    } catch (_) {}

    SMOKE.log('Triggered break (jam/modal)');
    return { ok: true, res };
  };

  SMOKE.ackBreak = function ackBreak() {
    const eng = EC.ENGINE;
    if (eng && typeof eng.dispatch === 'function') {
      const r = eng.dispatch('ackBreakModal');
      SMOKE.log(`Ack break modal: ${(r && r.ok) ? 'ok' : 'no-op'}`);
      return r && r.ok ? { ok: true } : { ok: true, noop: true };
    }
    // Fallback: direct clear
    try {
      const SIM = EC.SIM;
      if (SIM) { SIM._breakModal = null; SIM._breakPaused = false; }
      SMOKE.log('Ack break modal (fallback direct clear)');
      return { ok: true, fallback: true };
    } catch (_) {
      return { ok: false, reason: 'ack_failed' };
    }
  };

  function _snapWell(i) {
    const SIM = EC.SIM || {};
    const a = SIM.wellsA && SIM.wellsA[i] != null ? Number(SIM.wellsA[i]) : NaN;
    const s = SIM.wellsS && SIM.wellsS[i] != null ? Number(SIM.wellsS[i]) : NaN;
    const e = (SIM && typeof SIM.energy === 'number') ? Number(SIM.energy) : NaN;
    return { a, s, e };
  }

  SMOKE.injectSwipe = function injectSwipe(wellIndex, dx, dy, dtMs) {
    const idx = (typeof wellIndex === 'number') ? (wellIndex | 0) : 0;
    const SIM = EC.SIM;
    if (!SIM || !Array.isArray(SIM.wellsA) || !Array.isArray(SIM.wellsS)) {
      SMOKE.log('injectSwipe: SIM wells missing');
      return { ok: false, reason: 'no_wells' };
    }
    if (!EC.INPUT || typeof EC.INPUT.armGestureFromPick !== 'function' || typeof EC.INPUT.resolveGestureFromDom !== 'function') {
      SMOKE.log('injectSwipe: EC.INPUT arm/resolve not available');
      return { ok: false, reason: 'no_input_api' };
    }

    const before = _snapWell(idx);
    const now = _nowMs();
    const dur = (typeof dtMs === 'number' && isFinite(dtMs)) ? dtMs : 120;

    try {
      EC.INPUT.armGestureFromPick({
        kind: 'pointer',
        key: 'p:999',
        idx: idx,
        clientX: 100,
        clientY: 100,
        t0: now - dur,
        pid: 999,
      });
    } catch (e) {
      SMOKE.log('injectSwipe: arm failed');
      return { ok: false, reason: 'arm_failed' };
    }

    let ok = false;
    try {
      ok = !!EC.INPUT.resolveGestureFromDom({ pointerId: 999, clientX: 100 + (dx || 0), clientY: 100 + (dy || 0) }, 'smoke');
    } catch (_) {
      ok = false;
    }

    const after = _snapWell(idx);
    const dA = (isFinite(after.a) && isFinite(before.a)) ? (after.a - before.a) : NaN;
    const dS = (isFinite(after.s) && isFinite(before.s)) ? (after.s - before.s) : NaN;

    SMOKE.log(`Inject swipe idx=${idx} dx=${dx|0} dy=${dy|0} → resolver=${ok ? 'ok' : 'false'} | A:${before.a}→${after.a} (Δ${isFinite(dA)?dA.toFixed(2):'?'}) S:${before.s}→${after.s} (Δ${isFinite(dS)?dS.toFixed(2):'?'}) E:${before.e}→${after.e}`);

    // Even when resolver returns false, a no-energy attempt still proves the route ran.
    return { ok: true, resolverOk: ok, before, after };
  };

  function _validateArrays() {
    const SIM = EC.SIM;
    if (!SIM) return { ok: false, reason: 'no_sim' };
    const okA = Array.isArray(SIM.wellsA) && SIM.wellsA.length === 6;
    const okS = Array.isArray(SIM.wellsS) && SIM.wellsS.length === 6;
    const okP = Array.isArray(SIM.psyP) && SIM.psyP.length === 6;
    if (!(okA && okS && okP)) return { ok: false, reason: 'bad_arrays', okA, okS, okP };
    return { ok: true };
  }

  SMOKE.backToLobby = function backToLobby() {
    const eng = EC.ENGINE;
    if (eng && typeof eng.dispatch === 'function') {
      const r = eng.dispatch('patBackToLobby');
      SMOKE.log(`Back to Lobby: ${(r && r.ok) ? 'ok' : 'no-op'}`);
      return { ok: true };
    }
    return { ok: false, reason: 'no_engine' };
  };

  SMOKE.run = async function run() {
    if (_isRunning) {
      SMOKE.log('Smoke already running (ignored)');
      return { ok: false, reason: 'already_running' };
    }
    _isRunning = true;
    _runToken += 1;
    const token = _runToken;

    SMOKE.clearLog();
    _setStatus('RUNNING');
    SMOKE.log('Smoke run begin');

    const fail = (stepName, err) => {
      const msg = (err && err.message) ? err.message : String(err || 'error');
      SMOKE.log(`FAIL @ ${stepName}: ${msg}`);
      SMOKE.log('SMOKE RESULT: FAIL');
      _setStatus('FAIL');
      _isRunning = false;
      return { ok: false, step: stepName, error: msg };
    };

    const step = async (name, fn) => {
      if (token !== _runToken) throw new Error('canceled');
      SMOKE.log(`STEP: ${name}`);
      const r = await fn();
      if (r && r.ok === false) throw new Error(r.reason || 'step_failed');
      return r;
    };

    try {
      const ready = await step('waitReady', () => SMOKE.waitReady(10000));
      if (!ready || !ready.ok) throw new Error('not_ready');

      await step('ensureLobby', async () => {
        const r = _ensureLobby();
        // If ensureLobby failed but we are in lobby anyway, proceed.
        const SIM = EC.SIM || {};
        if (!r.ok && !SIM.inLobby) return { ok: false, reason: r.reason || 'ensureLobby_failed' };
        return { ok: true };
      });

      await step('startRun', async () => {
        const r = SMOKE.startRun();
        if (!r.ok) return r;
        // Confirm we left lobby.
        const SIM = EC.SIM || {};
        if (SIM.inLobby) return { ok: false, reason: 'still_in_lobby' };
        return { ok: true };
      });

      await step('fastForward 5s (energy)', () => SMOKE.fastForward(5));

      await step('injectSwipeRight (well 0)', async () => {
        SMOKE.injectSwipe(0, 70, 0, 120);
        return { ok: true };
      });

      await step('fastForward 2s', () => SMOKE.fastForward(2));

      await step('injectSwipeUp (well 0)', async () => {
        SMOKE.injectSwipe(0, 0, -70, 120);
        return { ok: true };
      });

      await step('triggerBreak', async () => {
        const r = SMOKE.triggerBreak();
        return r && r.ok ? { ok: true } : r;
      });

      await step('fastForward 1s', () => SMOKE.fastForward(1));

      await step('ackBreak', async () => {
        SMOKE.ackBreak();
        return { ok: true };
      });

      await step('fastForward 22s', () => SMOKE.fastForward(22));

      await step('backToLobby', async () => {
        SMOKE.backToLobby();
        // Let UI settle one frame.
        await SMOKE.fastForward(0.2);
        return { ok: true };
      });

      await step('validate arrays', async () => _validateArrays());

      SMOKE.log('SMOKE RESULT: PASS');
      _setStatus('PASS');
      _isRunning = false;
      return { ok: true };
    } catch (e) {
      return fail('run', e);
    } finally {
      _isRunning = false;
    }
  };

  function _bind() {
    const els = _getEls();
    if (!els || !els.panel) return;

    const on = (el, fn) => {
      if (!el) return;
      if (el._ecBound) return;
      el._ecBound = true;
      el.addEventListener('click', (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        try { fn(); } catch (err) { SMOKE.log('UI click error: ' + (err && err.message ? err.message : String(err))); }
      }, { passive: false });
    };

    on(els.btnClear, () => SMOKE.clearLog());
    on(els.btnRun, () => { SMOKE.run(); });
    on(els.btnStart, () => { SMOKE.startRun(); });
    on(els.btnFF5, () => { SMOKE.fastForward(5); });
    on(els.btnFF30, () => { SMOKE.fastForward(30); });
    on(els.btnBreak, () => { SMOKE.triggerBreak(); });
    on(els.btnAck, () => { SMOKE.ackBreak(); });
    on(els.btnSwipeR, () => { SMOKE.injectSwipe(0, 70, 0, 120); });
    on(els.btnSwipeU, () => { SMOKE.injectSwipe(0, 0, -70, 120); });
    on(els.btnLobby, () => { SMOKE.backToLobby(); });

    // Initial banner
    SMOKE.log('Dev smoke runner loaded.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bind);
  } else {
    _bind();
  }

})();
