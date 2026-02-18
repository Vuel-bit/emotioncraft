/* Emotioncraft — UI HUD module (Chunk 2 split)
   Owns non-control UI: top HUD, left objective/info panel, disposition messages, debug.
   No behavior or layout changes: code moved from ui_app.js.
*/
(() => {
  const EC = (window.EC = window.EC || {});
  const MOD = (EC.UI_HUD = EC.UI_HUD || {});

  function _getCtx(ctxIn) {
    return ctxIn || (EC.UI_STATE && EC.UI_STATE.mvpCtx) || {};
  }

  function _wellTitle(ctx, i) {
    if (ctx && typeof ctx.wellTitle === 'function') return ctx.wellTitle(i);
    return String(i);
  }


  // HUD DOM diff helpers (perf hygiene; no behavioral changes)
  function setText(el, cacheKey, value) {
    try {
      if (!el) return;
      const st = UI_STATE;
      const prev = (st.prev = st.prev || {});
      const k = 'hud:' + String(cacheKey || '');
      const v = (value == null) ? '' : String(value);
      if (prev[k] === v) return;
      prev[k] = v;
      el.textContent = v;
    } catch (_) { /* ignore */ }
  }

  function setHTML(el, cacheKey, value) {
    try {
      if (!el) return;
      const st = UI_STATE;
      const prev = (st.prev = st.prev || {});
      const k = 'hud:' + String(cacheKey || '');
      const v = (value == null) ? '' : String(value);
      if (prev[k] === v) return;
      prev[k] = v;
      el.innerHTML = v;
    } catch (_) { /* ignore */ }
  }

  // Objective summary text (used in bottom panel)
  MOD.getObjectiveSummaryText = function getObjectiveSummaryText() {
    const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
    const SIM = snap.SIM || {};
    const UI = snap.UI || {};
    const lvl = SIM.levelId || 1;
    const def = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef() : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(lvl) : null);

    const stripStepPrefix = (s) => String(s || '').replace(/^\s*Step\s*\d+\s*:\s*/i, '').trim();

    // Keep bottom panel treatment-plan only (no patient name / level label / step counter).
    const objText = def ? (def.objectiveText || def.name || '') : '';

    // Patient Weekly hold timer
    if (def && def.win && def.win.type === 'WEEKLY_HOLD') {
      const holdReq = (typeof def.win.holdSec === 'number') ? def.win.holdSec : 10;
      const holdCur = (typeof SIM.weeklyHoldSec === 'number') ? SIM.weeklyHoldSec : 0;
      const shortName = (def && def.objectiveShort) ? def.objectiveShort : (objText || 'Weekly');
      const postOn = !!SIM.weeklyPostHoldActive;
      const postLeft = (typeof SIM.weeklyPostHoldRemaining === 'number') ? SIM.weeklyPostHoldRemaining : 0;
      const extra = postOn ? ` — Confirm: ${postLeft.toFixed(1)}s left` : '';
      return `${shortName} — Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s${extra}`;
    }

    // Patient Zen chain (3-step)
    if (def && def.win && def.win.type === 'ZEN_CHAIN') {
      const step = (typeof SIM.zenChainStep === 'number') ? SIM.zenChainStep : 0;
      const holdReq = (def.win.steps && def.win.steps[step] && typeof def.win.steps[step].holdSec === 'number') ? def.win.steps[step].holdSec : 10;
      const holdCur = (typeof SIM.zenChainHoldSec === 'number') ? SIM.zenChainHoldSec : 0;
      const stepName = (def.objectiveShort || 'Zen');
      // If Zen uses post-step confirmation holds, show Confirm countdown.
      const postOn = !!SIM.zenPostHoldActive;
      const postLeft = (typeof SIM.zenPostHoldRemaining === 'number') ? SIM.zenPostHoldRemaining : 0;
      const extra = postOn ? ` — Confirm: ${postLeft.toFixed(1)}s left` : '';
      return `${stepName} — Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s${extra}`;
    }

    // Patient treatment plans (PLAN_CHAIN)
    if (def && def.win && def.win.type === 'PLAN_CHAIN' && Array.isArray(def.win.steps)) {
      const steps = def.win.steps;
      const total = steps.length || 1;
      const step = (typeof SIM.planStep === 'number') ? SIM.planStep : 0;
      const idx = Math.max(0, Math.min(total - 1, step));
      const st = steps[idx] || {};
      const kind = String(st.kind || '').toUpperCase();
      const holdReq = (typeof SIM._planHoldReqSec === 'number') ? SIM._planHoldReqSec : (((typeof st.holdSec === 'number') && st.holdSec > 0) ? st.holdSec : ((kind === 'SPIN_ZERO') ? 3 : 10));
      const holdCur = (typeof SIM.planHoldSec === 'number') ? SIM.planHoldSec : 0;
      const rawText = String(st.text || `Step ${idx+1}`);
      const clean = stripStepPrefix(rawText);

      let prog = '';
      const postOn = !!SIM.planPostHoldActive;
      const postLeft = (typeof SIM.planPostHoldRemaining === 'number') ? SIM.planPostHoldRemaining : 0;

      if (postOn) {
        prog = ` — Confirm: ${postLeft.toFixed(1)}s left`;
      } else if (kind === 'SPIN_ZERO') {
        const eps = (typeof EC.TUNE.PAT_SPIN_ZERO_EPS === 'number') ? EC.TUNE.PAT_SPIN_ZERO_EPS : 1.0;
        let n = 0;
        for (let i = 0; i < 6; i++) if (Math.abs((SIM.wellsS && SIM.wellsS[i]) || 0) <= eps) n++;
        if (n < 6) {
          prog = ` — Spins at 0: ${n}/6`;
        } else if (holdReq > 0) {
          prog = ` — Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s`;
        }
      } else if (holdReq > 0) {
        prog = ` — Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s`;
      } else {
        // Psyche goals: count satisfied hues based on current goalViz.
        const goals = (SIM.goalViz && Array.isArray(SIM.goalViz.perHue)) ? SIM.goalViz.perHue : null;
        if (goals) {
          let done = 0;
          let tot = 0;
          for (let i = 0; i < 6; i++) {
            const g = goals[i];
            if (!g) continue;
            tot++;
            const v = Math.round((SIM.psyP && SIM.psyP[i]) || 0);
            let ok = true;
            if (g.type === 'OVER') ok = v >= g.target;
            else if (g.type === 'UNDER') ok = v <= g.target;
            else if (g.type === 'BAND') ok = (v >= g.low) && (v <= g.high);
            if (ok) done++;
          }
          if (tot > 0) prog = ` — Progress: ${done}/${tot}`;
        }
      }

      return `${clean}${prog}`;
    }

    // Legacy Zen-style hold timer
    if (def && def.win && def.win.type === 'ALL_BAND_HOLD') {
      const holdReq = (typeof def.win.holdSec === 'number') ? def.win.holdSec : EC.TUNE.ZEN_HOLD_SECONDS;
      const holdCur = (typeof SIM.zenHoldSec === 'number') ? SIM.zenHoldSec : 0;
      const shortName = (def && def.objectiveShort) ? def.objectiveShort : (objText || 'Zen');
      const postOn = !!SIM.zenPostHoldActive;
      const postLeft = (typeof SIM.zenPostHoldRemaining === 'number') ? SIM.zenPostHoldRemaining : 0;
      const extra = postOn ? ` — Confirm: ${postLeft.toFixed(1)}s left` : '';
      return `${shortName} — Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s${extra}`;
    }

    // Level 1 style “All hues ≥ 200” progress
    const goals = (SIM.goalViz && Array.isArray(SIM.goalViz.perHue)) ? SIM.goalViz.perHue : (def ? def.goalVizPerHue : null);
    if (goals && goals.length) {
      let done = 0;
      let total = 0;
      for (let i = 0; i < 6; i++) {
        const g = goals[i];
        if (!g) continue;
        total++;
        const v = Math.round((SIM.psyP && SIM.psyP[i]) || 0);
        let ok = true;
        if (g.type === 'OVER') ok = v >= g.target;
        else if (g.type === 'UNDER') ok = v <= g.target;
        else if (g.type === 'BAND') ok = (v >= g.low) && (v <= g.high);
        if (ok) done++;
      }
      const shortName = (def && def.objectiveShort) ? def.objectiveShort : (objText || 'Objective');
      if (total > 0) return `${shortName} (${done}/${total})`;
    }

    return stripStepPrefix(objText || '');
  };

  // Next objective hint (UI only). If a level has no explicit "next", return empty and UI will show —.
  MOD.getNextObjectiveText = function getNextObjectiveText() {
    const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
    const SIM = snap.SIM || {};
    const UI = snap.UI || {};
    const lvl = SIM.levelId || 1;
    const def = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef()
      : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(lvl) : null);
    if (!def || !def.win) return '';
    const win = def.win;

    const stripStepPrefix = (s) => String(s || '').replace(/^\s*Step\s*\d+\s*:\s*/i, '').trim();

    // ZEN_CHAIN: show the next step instruction if present.
    if (win.type === 'ZEN_CHAIN') {
      const step = (typeof SIM.zenChainStep === 'number') ? SIM.zenChainStep : 0;
      const total = (win.steps && Array.isArray(win.steps)) ? win.steps.length : 3;
      const nextStep = step + 1;
      if (nextStep >= total) return '';
      const st = (win.steps && win.steps[nextStep]) ? win.steps[nextStep] : null;
      const raw = st && st.text ? String(st.text) : `Step ${nextStep+1}`;
      return stripStepPrefix(raw);
    }

    // PLAN_CHAIN: show next step's instruction if any.
    if (win.type === 'PLAN_CHAIN' && Array.isArray(win.steps)) {
      const steps = win.steps;
      const total = steps.length || 1;
      const step = (typeof SIM.planStep === 'number') ? SIM.planStep : 0;
      const next = step + 1;
      if (next >= total) return '';
      const st = steps[next] || {};
      const rawText = String(st.text || `Step ${next+1}`);
      const clean = stripStepPrefix(rawText);
      return clean;
    }

    // Other win types don't have an explicit next step in current design.
    return '';
  };


  MOD.init = function init(ctxIn) {
    const ctx = _getCtx(ctxIn);
    const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
    const SIM = snap.SIM;
    const UI_STATE = (ctx.UI_STATE = ctx.UI_STATE || snap.UI || {});
    ctx.SIM = SIM;
    if (!SIM) return;

    if (UI_STATE._hudInited) return;
    UI_STATE._hudInited = true;

    UI_STATE.uiMsg = (typeof UI_STATE.uiMsg === 'string') ? UI_STATE.uiMsg : '';
    UI_STATE.uiMsgT = (typeof UI_STATE.uiMsgT === 'number') ? UI_STATE.uiMsgT : 0;
    UI_STATE.debugOn = !!UI_STATE.debugOn;

    const dom = ctx.dom || {};
    const debugEl = dom.debugEl || document.getElementById('debug');
    const objectivePanelEl = dom.objectivePanelEl || document.getElementById('objectivePanel');
    const levelSelectEl = dom.levelSelectEl || document.getElementById('levelSelect');
    const mvpHudEl = dom.mvpHudEl || document.getElementById('mvpHud');

    const btnDebugEl = dom.btnDebugEl || document.getElementById('btnDebug');
    const btnLobbyEl = dom.btnLobbyEl || document.getElementById('btnLobby');
    const btnLogEl = dom.btnLogEl || document.getElementById('btnLog');
    const btnLogCloseEl = dom.btnLogCloseEl || document.getElementById('btnLogClose');
    const logOverlayEl = dom.logOverlayEl || document.getElementById('logOverlay');
    const logBodyEl = dom.logBodyEl || document.getElementById('logBody');

    // Reset button removed (Lobby + Debug cover reset flows)

    // Lobby button (must work even after WIN/LOSE freeze)
    if (btnLobbyEl && !UI_STATE._lobbyWired) {
      UI_STATE._lobbyWired = true;
      btnLobbyEl.addEventListener('click', () => {
        try {
          const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
          const SIM = (snap && snap.SIM) ? snap.SIM : {};
          const isWin = (SIM.levelState === 'win') || !!SIM.mvpWin;
          const isLose = (SIM.levelState === 'lose') || !!SIM.mvpLose || !!SIM.gameOver;
          const resumable = !!(SIM._patientActive && !isWin && !isLose);

          if (resumable && EC.PAT && typeof EC.PAT.openLobbyPause === 'function') {
            EC.PAT.openLobbyPause();
            return;
          }
          if (EC.PAT && typeof EC.PAT.backToLobby === 'function') EC.PAT.backToLobby();
        } catch (_) { /* ignore */ }
      });
    }

    // Debug button + key toggle
    if (!UI_STATE._debugWired) {
      UI_STATE._debugWired = true;
      let debugOn = !!UI_STATE.debugOn;

      const setDbg = (on) => {
        debugOn = !!on;
        if (debugEl) debugEl.classList.toggle('show', debugOn);
        UI_STATE.debugOn = debugOn;
      };

      if (btnDebugEl) {
        btnDebugEl.addEventListener('click', () => setDbg(!debugOn));
      }
      window.addEventListener('keydown', (e) => {
        if ((e.key || '').toLowerCase() === 'd') setDbg(!debugOn);
      });
      setDbg(debugOn);
      // Log overlay (pauses sim)
      let _logOpen = false;

      function _getLogDom() {
        const overlay = document.getElementById('logOverlay');
        const body = document.getElementById('logBody');
        return { overlay, body };
      }

      function _renderLogBody() {
        const domL = _getLogDom();
        const logBodyEl2 = domL.body;
        if (!logBodyEl2) return;
        const entries = (UI_STATE && UI_STATE.logEntries) ? UI_STATE.logEntries : [];
        const parts = [];
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i] || {};
          const t = (typeof e.tSec === 'number') ? e.tSec : 0;
          const mm = String(Math.floor(t / 60)).padStart(2,'0');
          const ss = String(Math.floor(t % 60)).padStart(2,'0');
          const hdr = `<div class=\"logT\">[${mm}:${ss}]</div>`;
          parts.push(`<div class=\"logEntry\">${hdr}${e.html || ''}</div>`);
        }
        logBodyEl2.innerHTML = parts.join('');
        try { logBodyEl2.scrollTop = logBodyEl2.scrollHeight; } catch (_) {}
      }

      function setLog(on) {
        const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
        const SIM = (snap && snap.SIM) ? snap.SIM : {};
        function _setUiPaused(flag) {
          try {
            if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') return EC.ENGINE.dispatch('setUiPaused', !!flag);
            if (EC.ACTIONS && typeof EC.ACTIONS.setUiPaused === 'function') return EC.ACTIONS.setUiPaused(!!flag);
          } catch (_) {}
          return { ok: false, reason: 'missing_action' };
        }
        const domL = _getLogDom();
        const overlay = domL.overlay;
        // If the overlay isn't in the DOM yet (it lives after scripts), don't toggle pause.
        if (!overlay) {
          _logOpen = false;
          _setUiPaused(false);
          return;
        }

        _logOpen = !!on;
        _setUiPaused(_logOpen ? true : false);
        overlay.classList.toggle('show', _logOpen);
        overlay.setAttribute('aria-hidden', _logOpen ? 'false' : 'true');
        if (_logOpen) _renderLogBody();
      }

      if (btnLogEl) {
        btnLogEl.addEventListener('click', () => setLog(!_logOpen));
      }

      // Close handler uses event delegation because #btnLogClose is inside #logOverlay,
      // which is declared after scripts in index.html.
      if (!UI_STATE._logCloseDelegated) {
        UI_STATE._logCloseDelegated = true;
        document.addEventListener('click', (e) => {
          const t = e.target;
          if (!t) return;

          // Copy Log
          if (t.id === 'btnLogCopy' || (t.closest && t.closest('#btnLogCopy'))) {
            try {
              const entries = (UI_STATE && UI_STATE.logEntries) ? UI_STATE.logEntries : [];
              const tmp = document.createElement('div');
              const lines = [];
              for (let i = 0; i < entries.length; i++) {
                const e2 = entries[i] || {};
                const tSec = (typeof e2.tSec === 'number') ? e2.tSec : 0;
                const mm = String(Math.floor(tSec / 60)).padStart(2,'0');
                const ss = String(Math.floor(tSec % 60)).padStart(2,'0');
                const html = (e2.html != null) ? String(e2.html) : '';
                tmp.innerHTML = html;
                const msg = (tmp.textContent != null) ? String(tmp.textContent) : '';
                const clean = msg.replace(/\s+/g, ' ').trim();
                lines.push(`[${mm}:${ss}] ${clean}`.trim());
              }
              const out = lines.join('\n');

              (async () => {
                try {
                  if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(out);
                  else {
                    const ta = document.createElement('textarea');
                    ta.value = out;
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                  if (EC.UI_STATE) {
                    EC.UI_STATE.uiMsg = 'Copied log.';
                    EC.UI_STATE.uiMsgT = 1.5;
                  }
                } catch (_) {
                  if (EC.UI_STATE) {
                    EC.UI_STATE.uiMsg = 'Copy failed.';
                    EC.UI_STATE.uiMsgT = 1.5;
                  }
                }
              })();
            } catch (_) {
              if (EC.UI_STATE) {
                EC.UI_STATE.uiMsg = 'Copy failed.';
                EC.UI_STATE.uiMsgT = 1.5;
              }
            }
            return;
          }

          // Close Log
          if (t.id === 'btnLogClose' || (t.closest && t.closest('#btnLogClose'))) {
            setLog(false);
          }
        });
      }
}

    // Level selector (visible UI)
    if (levelSelectEl && !UI_STATE._levelSelectWired) {
      UI_STATE._levelSelectWired = true;

      // Populate from registry if available
      try {
        const defs = (EC.LEVELS && typeof EC.LEVELS.list === 'function') ? EC.LEVELS.list() : null;
        if (defs && defs.length) {
          levelSelectEl.innerHTML = '';
          defs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = String(d.id);
            opt.textContent = d.label || (`Level ${d.id}`);
            levelSelectEl.appendChild(opt);
          });
        }
      } catch (_) { /* ignore */ }

      levelSelectEl.value = String(SIM.levelId || 1);

      levelSelectEl.addEventListener('change', () => {
        const lvl = parseInt(levelSelectEl.value, 10) || 1;
        // Route initMVP through ENGINE/ACTIONS so SIM init writes are bracketed.
        try {
          if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') {
            const r = EC.ENGINE.dispatch('initMVP', lvl);
            if (r && r.ok) return;
          }
        } catch (_) {}
        try {
          if (EC.ACTIONS && typeof EC.ACTIONS.initMVP === 'function') { EC.ACTIONS.initMVP(lvl); return; }
        } catch (_) {}
        // Route initMVP through ENGINE/ACTIONS so SIM init writes are bracketed.
        try {
          if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') {
            const r = EC.ENGINE.dispatch('initMVP', lvl);
            if (r && r.ok) return;
          }
        } catch (_) {}
        try {
          if (EC.ACTIONS && typeof EC.ACTIONS.initMVP === 'function') { EC.ACTIONS.initMVP(lvl); return; }
        } catch (_) {}
        if (SIM && typeof SIM.initMVP === 'function') SIM.initMVP(lvl);
      });
    }

    // Chunk 3 optional: Auto-Test toggle (T) — preserved
    if (!EC._mvpKeysWired) {
      EC._mvpKeysWired = true;
      window.addEventListener('keydown', (e) => {
        const k = (e.key || '').toLowerCase();
        if (k === 't') {
          let res = null;
          try {
            if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') res = EC.ENGINE.dispatch('toggleAutoTest');
          } catch (_) {}
          if (!res) {
            try {
              if (EC.ACTIONS && typeof EC.ACTIONS.toggleAutoTest === 'function') res = EC.ACTIONS.toggleAutoTest();
            } catch (_) {}
          }
          try {
            const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
            const SIM = (snap && snap.SIM) ? snap.SIM : {};
            const onB = (res && typeof res.on === 'boolean') ? res.on : !!SIM.autoTest;
            console.log('Auto-Test (T): ' + (onB ? 'ON' : 'OFF'));
          } catch (_) {}
        }
      });
    }

    // Cache DOM refs for render
    ctx.dom = ctx.dom || {};
    ctx.dom.debugEl = debugEl;
    ctx.dom.objectivePanelEl = objectivePanelEl;
    ctx.dom.levelSelectEl = levelSelectEl;
    ctx.dom.mvpHudEl = mvpHudEl;
  };

  MOD.render = function render(dt, ctxIn) {
    const ctx = _getCtx(ctxIn);
    const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
    const SIM = snap.SIM;
    const UI_STATE = (ctx.UI_STATE = ctx.UI_STATE || snap.UI || {});
    ctx.SIM = SIM;
    if (!SIM) return;
    const dom = ctx.dom || {};
    const mvpHudEl = dom.mvpHudEl || document.getElementById('mvpHud');
    const notifyBarEl = document.getElementById('notifyBar');
    const notifyTextEl = document.getElementById('notifyText');
    const gestureDbgEl = document.getElementById('gestureDebugOverlay');
    const patientInfoEl = document.getElementById('patientInfo');
    const topbarEl = document.getElementById('topbar');
    const objectivePanelEl = dom.objectivePanelEl || document.getElementById('objectivePanel');
    const levelSelectEl = dom.levelSelectEl || document.getElementById('levelSelect');
    const debugEl = dom.debugEl || document.getElementById('debug');

    // small transient message timer
    if (UI_STATE.uiMsgT > 0) UI_STATE.uiMsgT = Math.max(0, UI_STATE.uiMsgT - (dt || 0));
    if (UI_STATE.uiMsgFlashT > 0) UI_STATE.uiMsgFlashT = Math.max(0, UI_STATE.uiMsgFlashT - (dt || 0));

    // Patient WIN auto-advance: for patient sessions only, jump back to the lobby so
    // post-win popups (weekly reward / zen congrats / intake congrats) appear
    // without requiring the player to press Lobby. Do not auto-advance on lose.
    const _isWinNow = (SIM.levelState === 'win') || !!SIM.mvpWin;
    if (_isWinNow && SIM._patientActive && !SIM._autoWinHandled) {
      const pk = String((SIM && (SIM._patientPlanKey || SIM._activePlanKey)) || '').toUpperCase();
      try { if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') EC.ENGINE.dispatch('markAutoWinHandled', true); else if (EC.ACTIONS && typeof EC.ACTIONS.markAutoWinHandled === 'function') EC.ACTIONS.markAutoWinHandled(true); } catch (_) {}
      if (pk === 'INTAKE') {
        try { if (EC.endAllMentalBreaks) EC.endAllMentalBreaks(); } catch (_) {}
      } else {
        try { if (EC.PAT && typeof EC.PAT.backToLobby === 'function') EC.PAT.backToLobby(); } catch (_) {}
        return;
      }
    }

    const T = EC.TUNE || {};
    const E_CAP = (typeof T.ENERGY_CAP === 'number') ? T.ENERGY_CAP : ((typeof T.E_MAX === 'number') ? T.E_MAX : 200);
    const selUI = (typeof UI_STATE.selectedWellIndex === 'number') ? UI_STATE.selectedWellIndex : -1;
    const i = (selUI >= 0 && selUI < 6) ? selUI : -1;
    const A = (i >= 0) ? (SIM.wellsA[i] || 0) : 0;
    const S = (i >= 0) ? (SIM.wellsS[i] || 0) : 0;
    const psy = (i >= 0) ? (SIM.psyP[i] || 0) : 0;
    const W = (SIM.getPsycheW ? SIM.getPsycheW() : [1/6,1/6,1/6,1/6,1/6,1/6]);
    const Wi = (i >= 0) ? (W[i] || 0) : 0;

    const PSY_NORM = (typeof T.PSY_FLUX_NORM === 'number') ? T.PSY_FLUX_NORM : 1000;
    const drive = (i >= 0) ? ((A * S) / PSY_NORM) : 0; // psyche units per second

    const err = (SIM.getWinError ? SIM.getWinError() : 0);
    const hold = SIM.holdCurrent || 0;
    const holdReq = SIM.holdRequired || ((typeof T.WIN_HOLD_SECONDS === 'number') ? T.WIN_HOLD_SECONDS : 5);
    const won = !!SIM.mvpWin;
    const lost = (SIM.levelState === 'lose') || !!SIM.mvpLose || !!SIM.gameOver;
    const regen = (typeof SIM.energyRegenPerSec === 'number') ? SIM.energyRegenPerSec : 0;
    const spillOn = !!SIM._spillActive;

    // Board-first: position topbar below notify bar without affecting board width.
    if (notifyBarEl && topbarEl) {
      const nh = Math.ceil(notifyBarEl.offsetHeight || 0);
      const desired = (8 + nh + 8); // keep a small gap
      if (!EC._topbarY || EC._topbarY !== desired) {
        EC._topbarY = desired;
        topbarEl.style.top = desired + 'px';
      }
    }

    // Top notification bar content (dispositions + short messages)
    try {
      const hud = (EC.DISP && typeof EC.DISP.getHudState === 'function') ? EC.DISP.getHudState() : { telegraphText: '', activeText: '' };
      const tele = hud.telegraphText || '';
      const act = hud.activeText || '';
      // Banner priority: WIN/LOSE > normal disposition/short message
      // Gesture debug is default OFF; only show when ?inputdebug=1.
      const inputDbgOn = (EC.INPUT && typeof EC.INPUT.isInputDebugEnabled === 'function') ? !!EC.INPUT.isInputDebugEnabled() : false;
      const g = inputDbgOn ? (UI_STATE.gestureDebug || '') : '';

      const isWin = (SIM.levelState === 'win') || !!SIM.mvpWin;
      const isLose = (SIM.levelState === 'lose') || !!SIM.mvpLose || !!SIM.gameOver;
      // Notify bar classes (visual styling)
      if (notifyBarEl) {
        notifyBarEl.classList.toggle('isBanner', !!(isWin || isLose));
        notifyBarEl.classList.toggle('bannerWin', !!isWin);
        notifyBarEl.classList.toggle('bannerLose', !!isLose);
}

      if (isWin) {
        setText(patientInfoEl, 'patientInfo', 'SUCCESS!');
        const pk = String((SIM && (SIM._patientPlanKey || SIM._activePlanKey)) || '').toUpperCase();
        setText(notifyTextEl, 'notifyText', (pk === 'INTAKE') ? 'Treatment Complete' : 'Treatment complete');
      } else if (isLose) {
        setText(patientInfoEl, 'patientInfo', 'TREATMENT FAILED');
        // Optional second line: keep it short + player-facing.
        let line2 = 'Too many breaks';
        const r = String(SIM.gameOverReason || '').trim();
        if (r && !/4\s*breaks\s*in\s*5\s*seconds/i.test(r)) {
          // If reason isn't the standard one, show it.
          line2 = r;
        }
        setText(notifyTextEl, 'notifyText', line2);
      } else {
        // Normal mode: show disposition HUD or short message + gesture debug line.
        // Hide disposition telegraph/active text from HUD; keep only UI messages.
        const short = ((UI_STATE.uiMsgT > 0 && UI_STATE.uiMsg) ? UI_STATE.uiMsg : '');
        setText(notifyTextEl, 'notifyText', g ? (short ? (short + "\n" + g) : g) : short);
      }

      // Always-visible debug overlay (does not depend on the notify bar state)
      // Default hidden unless inputdebug is enabled.
      setText(gestureDbgEl, 'gestureDbg', inputDbgOn ? (g || 'SWIPE: (waiting)') : '');
    } catch (_) { /* ignore */ }

    // Patient + step (top-left)
    try {
      // If a banner is active, we already replaced patientInfoEl above.
      if ((SIM.levelState === 'win') || !!SIM.mvpWin || (SIM.levelState === 'lose') || !!SIM.mvpLose || !!SIM.gameOver) {
        // No-op: keep banner/break header.
      } else {
      const lvl = SIM.levelId || 1;
      const def = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef() : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(lvl) : null);
      const pName = (SIM._patientLabel || (def && def.label) || `Patient ${lvl}`);
      let stepLine = '';
      if (def && def.win && def.win.type === 'ZEN_CHAIN') {
        const step = (typeof SIM.zenChainStep === 'number') ? SIM.zenChainStep : 0;
        const total = (def.win.steps && def.win.steps.length) ? def.win.steps.length : 3;
        const prefix = def.objectiveShort || 'Step';
        stepLine = `${prefix} ${step + 1}/${total}`;
      } else if (def && def.win && def.win.type === 'PLAN_CHAIN' && Array.isArray(def.win.steps)) {
        const step = (typeof SIM.planStep === 'number') ? SIM.planStep : 0;
        const total = def.win.steps.length || 1;
        stepLine = `Step ${step + 1}/${total}`;
      } else {
        stepLine = 'Step 1/1';
      }
      if (patientInfoEl) {
        // Top HUD: 2-line patient header
        // Line1: Name + Traits (plain text)
        // Line2: Quirks as colored pills with telegraph/active glow

        const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // Traits source of truth
        let traits = [];
        try {
          traits = (EC.TRAITS && typeof EC.TRAITS.list === 'function') ? (EC.TRAITS.list(SIM) || []) : [];
        } catch (_) { traits = []; }

        const traitLabel = (k) => {
          const raw = String(k || '').trim();
          if (!raw) return '';
          const s = raw.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
          return s.replace(/\b\w/g, (m) => m.toUpperCase());
        };
        // Quirks source of truth
        let patientId = (def && def._patientId) ? def._patientId : null;
        let quirks = [];
        try {
          const p = (EC.PAT && typeof EC.PAT.get === 'function' && patientId) ? EC.PAT.get(patientId) : null;
          quirks = (p && Array.isArray(p.quirks)) ? p.quirks : [];
        } catch (_) { quirks = []; }

        // Determine which quirk is telegraphing/active.
        const activeTypes = Object.create(null);
        const teleTypes = Object.create(null);
        try {
          const list = (EC.DISP && typeof EC.DISP.getRenderStates === 'function') ? EC.DISP.getRenderStates() : [];
          if (Array.isArray(list)) {
            for (const it of list) {
              const ph = (it && it.phase) ? String(it.phase) : '';
              const ty = (it && it.type) ? String(it.type).toUpperCase() : '';
              if (!ty) continue;
              if (ph === 'active') activeTypes[ty] = true;
              else if (ph === 'telegraph') teleTypes[ty] = true;
            }
          }
        } catch (_) {}

        const tierColor = (t) => {
          const n = (typeof t === 'number') ? t : 0;
          if (n >= 2) return 'rgba(255, 92, 92, 0.95)';
          if (n === 1) return 'rgba(230, 216, 92, 0.95)';
          return 'rgba(123, 220, 123, 0.95)';
        };

        const quirkLabel = (type) => {
          const s = String(type || '').toUpperCase();
          if (s === 'LOCKS_IN') return 'Fixates';
          if (s === 'CRASHES') return 'Crashes';
          if (s === 'SPIRALS') return 'Spirals';
          if (s === 'AMPED') return 'Obsesses';
          return s ? (s.charAt(0) + s.slice(1).toLowerCase()) : 'Quirk';
        };

        let line1 = `<span class="hudPatientName">${esc(pName)}</span>`;
        if (traits && traits.length) {
          const labs = [];
          for (const tr of traits) {
            const lab = traitLabel(tr);
            if (lab) labs.push(lab);
          }
          if (labs.length) {
            line1 += ` — ${esc(labs.join(', '))}`;
          }
        }

        let line2 = '';
        if (quirks && quirks.length) {
          const pills = [];
          for (const q of quirks) {
            const ty = q && q.type ? String(q.type).toUpperCase() : '';
            const tier = (q && typeof q.intensityTier === 'number') ? q.intensityTier : 0;
            const c = tierColor(tier);
            const cls = ['hudQuirkPill'];
            if (ty && activeTypes[ty]) cls.push('hudQuirkActive');
            if (ty && teleTypes[ty]) cls.push('hudQuirkTele');
            pills.push(`<span class="${cls.join(' ')}" style="background:${c}">${esc(quirkLabel(ty))}</span>`);
          }
          line2 = pills.join(' ');
        }
let html = `<div class="hudLine1">${line1}</div><div class="hudLine2">${line2}</div>`;
        patientInfoEl.innerHTML = html;
      }
    }
    } catch (_) { /* ignore */ }

    // Top compact HUD (kept for now; minimized in future pass)
    if (mvpHudEl) {
      const selTxt = (i >= 0) ? `${_wellTitle(ctx, i)} [${i}]` : 'None';
      const msg = (UI_STATE.uiMsgT > 0 && UI_STATE.uiMsg) ? ` | ${UI_STATE.uiMsg}` : '';
      const selAS = (i >= 0) ? ` A:${A.toFixed(0)} S:${(S>=0?'+':'')}${S.toFixed(0)}` : '';
      const spillTxt = spillOn ? '  |  Spill: ON' : '';
      const loseTxt = lost ? (`  |  GAME OVER: ${SIM.gameOverReason || 'Mind Shattered'}`) : '';
      mvpHudEl.textContent = `Hold: ${hold.toFixed(1)} / ${holdReq}s  |  Error: ${err.toFixed(3)}  |  Selected: ${selTxt}${selAS}  |  E: ${(SIM.energy||0).toFixed(1)}/${E_CAP} (+${regen.toFixed(2)}/s)${spillTxt}${won ? '  |  WIN' : ''}${loseTxt}${msg}`;
    }

    // Objective panel (data-driven: uses SIM.goalViz / EC.LEVELS)
    if (objectivePanelEl) {
      // Keep level select in sync (hotkeys/UI both supported)
      if (levelSelectEl && String(levelSelectEl.value) !== String(SIM.levelId || 1)) {
        levelSelectEl.value = String(SIM.levelId || 1);
      }

      const lvl = SIM.levelId || 1;
      const def = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef() : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(lvl) : null);
      const goals = (SIM.goalViz && Array.isArray(SIM.goalViz.perHue)) ? SIM.goalViz.perHue : (def ? def.goalVizPerHue : null);
      const psyArr = SIM.psyP || [];
      const fmt = (n)=> (Math.round(n||0));
      const won2 = (SIM.levelState === 'win');
      const lost2 = (SIM.levelState === 'lose') || !!SIM.mvpLose || !!SIM.gameOver;

      const title = def ? (def.label || `Level ${lvl}`) : `Level ${lvl}`;

      // Objective text: keep existing strings, but ensure Zen chain shows current step.
      let objText = def ? (def.objectiveText || def.name || '') : '';
      if (def && def.win && def.win.type === 'ZEN_CHAIN' && Array.isArray(def.win.steps)) {
        const step = (typeof SIM.zenChainStep === 'number') ? SIM.zenChainStep : 0;
        const st = def.win.steps[Math.max(0, Math.min(def.win.steps.length - 1, step))] || null;
        const n = Math.max(0, Math.min(def.win.steps.length, step)) + 1;
        if (st) {
          if (st.kind === 'ALL_OVER') objText = `Zen Step ${n}/${def.win.steps.length}: All hues ≥ ${st.threshold}`;
          else if (st.kind === 'ALL_BAND') objText = `Zen Step ${n}/${def.win.steps.length}: All hues ${st.low}–${st.high}`;
          else objText = `Zen Step ${n}/${def.win.steps.length}`;
        }
      }

      let rows = '';
      let any = false;

      if (goals) {
        for (let k = 0; k < 6; k++) {
          const g = goals[k];
          if (!g) continue;
          any = true;

          const v = fmt(psyArr[k]);

          let ok = true;
          let rhs = '';
          if (g.type === 'OVER') {
            ok = v >= g.target;
            rhs = `${v}/${fmt(g.target)}`;
          } else if (g.type === 'UNDER') {
            ok = v <= g.target;
            rhs = `${v}/${fmt(g.target)}`;
          } else if (g.type === 'BAND') {
            ok = (v >= g.low) && (v <= g.high);
            rhs = `${v}/${fmt(g.low)}–${fmt(g.high)}`;
          } else {
            rhs = `${v}`;
          }

          rows += `<div class="row"><span class="chk">${ok ? '✓' : '□'}</span><span class="h">${_wellTitle(ctx, k)}</span><span class="v">${rhs}</span></div>`;
        }
      }

      if (!any) {
        rows += `<div class="row"><span class="h">No goals</span></div>`;
      }

      let extra = '';
      if (def && def.win && def.win.type === 'ZEN_CHAIN' && Array.isArray(def.win.steps)) {
        const step = (typeof SIM.zenChainStep === 'number') ? SIM.zenChainStep : 0;
        const st = def.win.steps[Math.max(0, Math.min(def.win.steps.length - 1, step))] || null;
        const holdReq2 = (st && typeof st.holdSec === 'number') ? st.holdSec : 10;
        const holdCur = (typeof SIM.zenChainHoldSec === 'number') ? SIM.zenChainHoldSec : 0;
        extra = `<div class="hold">Hold: ${holdCur.toFixed(1)} / ${holdReq2.toFixed(1)}s</div>`;
      } else if (def && def.win && def.win.type === 'ALL_BAND_HOLD') {
        const holdReq2 = (typeof def.win.holdSec === 'number') ? def.win.holdSec : EC.TUNE.ZEN_HOLD_SECONDS;
        const holdCur = (typeof SIM.zenHoldSec === 'number') ? SIM.zenHoldSec : 0;
        extra = `<div class="hold">Hold: ${holdCur.toFixed(1)} / ${holdReq2.toFixed(1)}s</div>`;
      }

      // Dispositions HUD (v2) — UI reads only state (no sim logic here)
      let disp = '';
      if (EC.DISP && typeof EC.DISP.getHudState === 'function') {
        const hs = EC.DISP.getHudState() || {};
        if (hs.telegraphText) disp += `<div class="obj" style="margin-top:6px;color:rgba(232,238,252,0.85)">${hs.telegraphText}</div>`;
        if (hs.activeText) disp += `<div class="obj" style="margin-top:4px;color:rgba(255,209,102,0.95)">${hs.activeText}</div>`;
      }

      const done = won2 ? '<div class="done">Objective Complete</div>' : '';
      const loseBlock = lost2 ? `<div class="done" style="margin-top:8px;color:rgba(255,96,96,0.95)">Mind Shattered</div><div class="obj" style="margin-top:4px;color:rgba(255,184,184,0.95)">${(SIM.gameOverReason || '4 breaks in 5 seconds')}</div>${(typeof SIM.breaksInWindow === 'number') ? `<div class="obj" style="margin-top:2px;color:rgba(255,184,184,0.85)">Breaks in last 5s: ${SIM.breaksInWindow}</div>` : ''}` : '';
      setHTML(objectivePanelEl, 'objectivePanel', `<div class="title">${title}</div>${objText ? `<div class="obj">${objText}</div>` : ''}${disp}${extra}${rows}${done}${loseBlock}`);
    }

    // Debug panel (monospace)
    if (debugEl) {
      const parts = [];
      const qs = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
      const verbose = /(?:\?|&)inputdebug=1(?:&|$)/.test(qs);

      // SIM root write-guard summary (warn-only; enable via ?simguard=1 or UI_STATE.debugStrict).
      try {
        const SG = (UI_STATE && UI_STATE.simGuardStats) ? UI_STATE.simGuardStats : null;
        if (SG && typeof SG.count === 'number' && SG.count > 0) {
          parts.push('SIM WRITE-GUARD: ' + SG.count + ' suspicious root writes');
          if (SG.byKey && typeof SG.byKey === 'object') {
            const bk = SG.byKey;
            const keys = Object.keys(bk).sort((a, b) => (Number(bk[b] || 0) - Number(bk[a] || 0)));
            const topK = keys.slice(0, 5);
            if (topK.length) {
              parts.push('Top keys:');
              for (let i = 0; i < topK.length; i++) {
                const k = topK[i];
                parts.push('  ' + k + ': ' + String(bk[k] || 0));
              }
            }
          }

          // Samples are verbose-only to avoid clutter.
          if (verbose && Array.isArray(SG.samples) && SG.samples.length) {
            parts.push('Samples:');
            for (let i = 0; i < SG.samples.length && i < 10; i++) {
              const s = SG.samples[i] || {};
              parts.push('  ' + String(s.key || '?') + (s.tag ? (' @ ' + String(s.tag)) : ''));
            }
          }
          parts.push('');
        }
      } catch (_) {}

      // Default: show ONLY quirk timeline (event-based), capped.
      parts.push('QUIRK TIMELINE (this run)');
      parts.push('------------------------');

      const TL = Array.isArray(SIM._quirkTimeline) ? SIM._quirkTimeline : null;
      const typeLabel = (t) => {
        const k = String(t || '').toUpperCase();
        if (k === 'LOCKS_IN') return 'Fixates';
        if (k === 'CRASHES') return 'Crashes';
        if (k === 'AMPED') return 'Obsesses';
        if (k === 'SPIRALS') return 'Spirals';
        return k || 'Unknown';
      };
      const tierLabel = (x) => {
        const ti = Math.max(0, Math.min(2, (x | 0)));
        return (ti === 0) ? 'Low-Key' : (ti === 1) ? 'Noticeable' : 'Intense';
      };
      const mmss = (sec) => {
        sec = Math.max(0, Math.floor(Number(sec || 0)));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const ss = (s < 10) ? ('0' + s) : String(s);
        return m + ':' + ss;
      };
      // Optional: show global cadence window for random-dispositions scheduling
      try {
        const C = SIM._dispCadenceDbg || null;
        if (C && typeof C.mode === 'string' && typeof C.until === 'number') {
          const nowT = (typeof C.now === 'number') ? C.now : null;
          const rem = (nowT != null) ? Math.max(0, (Number(C.until || 0) - Number(nowT || 0))) : null;
          const mode = String(C.mode || '').toUpperCase();
          parts.push(`Cadence: ${mode}${(rem != null) ? (' (ends in ' + rem.toFixed(1) + 's)') : ''}`);
          parts.push('');
        }
      } catch (_) {}

      if (!TL) {
        parts.push('Timeline not initialized (SIM._quirkTimeline missing).');
      } else if (TL.length === 0) {
        parts.push('— no quirk events recorded yet —');
      } else {
        const startAt = Math.max(0, TL.length - 60);
        let prevStart = null;
        for (let i = startAt; i < TL.length; i++) {
          const e = TL[i] || {};
          const tStart = Number((e.tStart != null) ? e.tStart : (e.startT != null ? e.startT : (e.tEnd || 0)));
          const wi = (e.hueIndex != null) ? (e.hueIndex | 0) : -1;
          const wName = (wi >= 0 && wi < 6) ? _wellTitle(ctx, wi) : '—';
          const force = Number(e.force || 0);
          const sign = (force >= 0) ? '+' : '';
          const dur = Number(e.durSec || 0);
          const gap = (prevStart != null) ? Math.max(0, (tStart - prevStart)) : 0;
          const gapTxt = (prevStart != null) ? ` gap ${gap.toFixed(1)}s` : '';
          parts.push(`[${mmss(tStart)}] ${typeLabel(e.type)} (${tierLabel(e.tier)}) — ${wName} — force ${sign}${force.toFixed(2)} (dur ${dur.toFixed(1)}s${gapTxt})`);
          prevStart = tStart;
        }
      }

      // Optional compact totals below timeline (useful as a sanity check)
      try {
        const Q = SIM._quirkForceTotals || null;
        if (Q && Array.isArray(Q.byWell)) {
          parts.push('');
          parts.push('TOTAL FORCE (raw, per run)');
          for (let wi = 0; wi < 6; wi++) {
            const name = _wellTitle(ctx, wi);
            const v = Number(Q.byWell[wi] || 0);
            parts.push(`${name}: ${v.toFixed(2)}`);
          }
        }
      } catch (_) {}
if (verbose) {
        parts.push('');
        parts.push('INPUT DEBUG (enabled by ?inputdebug=1)');
        parts.push('------------------------------');
        try {
          const D = (UI_STATE && UI_STATE.inputDbg) || null;
          if (D) {
            const dom = D.dom || {};
            parts.push(`DOM(canvas) counters: pd=${dom.pd||0} pm=${dom.pm||0} pu=${dom.pu||0} pc=${dom.pc||0}   ts=${dom.ts||0} tm=${dom.tm||0} te=${dom.te||0} tc=${dom.tc||0}`);
            parts.push(`${D.wellGeomLine || ''}`.trim());
            parts.push(`${D.gestureLine || ''}`.trim());
            parts.push(`${D.resolveLine || ''}`.trim());
            if (Array.isArray(D.log) && D.log.length) {
              parts.push('');
              parts.push('INPUT LOG (tail 20)');
              const tail = D.log.slice(Math.max(0, D.log.length - 20));
              for (let ii=0; ii<tail.length; ii++) parts.push(tail[ii]);
            }
          } else {
            parts.push('No input debug buffer.');
          }
        } catch (_) {}
      }

      // Build debug overlay DOM once.
      if (!UI_STATE._dbgBuilt && debugEl) {
        UI_STATE._dbgBuilt = true;
        debugEl.innerHTML = [
          '<div class="dbgTop">',
          '  <div class="dbgTitle">DEBUG</div>',
          '  <div class="dbgActions">',
          '    <button class="dbgBtn" id="btnCopyDebug" type="button">Copy Debug</button>',
          '    <button class="dbgBtn" id="btnCopyInputLog" type="button">Copy Input Log</button>',
          '  </div>',
          '</div>',
          '<pre class="dbgPre" id="debugPre"></pre>',
        ].join('\n');
      }

      // Hide Copy button unless verbose
      try {
        const btn = document.getElementById('btnCopyInputLog');
        if (btn) btn.style.display = verbose ? '' : 'none';
      } catch (_) {}

      // Wire Copy Debug button once (copies the currently displayed debug text)
      const btnDbg = document.getElementById('btnCopyDebug');
      if (btnDbg && !UI_STATE._copyDbgWired) {
        UI_STATE._copyDbgWired = true;
        btnDbg.addEventListener('click', async () => {
          try {
            const pre = document.getElementById('debugPre');
            const txt = (pre && pre.textContent != null) ? String(pre.textContent) : '';
            if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(txt);
            else {
              const ta = document.createElement('textarea');
              ta.value = txt;
              ta.style.position = 'fixed';
              ta.style.left = '-9999px';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
            UI_STATE.uiMsg = 'Copied debug.';
            UI_STATE.uiMsgT = 1.5;
          } catch (_) {
            UI_STATE.uiMsg = 'Copy failed.';
            UI_STATE.uiMsgT = 1.5;
          }
        });
      }

      // Wire copy button once (works when verbose is enabled)
      const btn = document.getElementById('btnCopyInputLog');
      if (btn && !UI_STATE._copyLogWired) {
        UI_STATE._copyLogWired = true;
        btn.addEventListener('click', async () => {
          try {
            const dbg = (UI_STATE && UI_STATE.inputDbg) || {};
            const log = Array.isArray(dbg.log) ? dbg.log : [];
            const tailLines = log.slice(Math.max(0, log.length - 50));
            const snap = ['=== INPUT LOG (last 50) ===', ...tailLines, '=== END ==='].join('\n');
            if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(snap);
            else {
              const ta = document.createElement('textarea');
              ta.value = snap;
              ta.style.position = 'fixed';
              ta.style.left = '-9999px';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
            UI_STATE.uiMsg = 'Copied input log.';
            UI_STATE.uiMsgT = 1.5;
          } catch (_) {
            UI_STATE.uiMsg = 'Copy failed.';
            UI_STATE.uiMsgT = 1.5;
          }
        });
      }
      const dbgText = parts.join('\n');
      const st = UI_STATE;
      const prev = (st.prev = st.prev || {});
      const k = 'hud:debugText';
      if (prev[k] !== dbgText) {
        prev[k] = dbgText;
        const pre = document.getElementById('debugPre');
        if (pre) pre.textContent = dbgText;
        else debugEl.textContent = dbgText;
      }
    }
    try { if (MOD.updateBreakModal) MOD.updateBreakModal(); } catch (_) {}


    // Expose selected-hue drive for renderer pulse indicator
    
    // Log overlay: if open, keep it updated and auto-scroll on new entries.
    try {
      const ov = document.getElementById('logOverlay');
      if (ov && ov.classList.contains('show')) {
        const body = document.getElementById('logBody');
        const entries = (UI_STATE && UI_STATE.logEntries) ? UI_STATE.logEntries : [];
        const n = entries.length;
        if (UI_STATE) {
          const lastN = (typeof UI_STATE._logRenderN === 'number') ? UI_STATE._logRenderN : -1;
          if (n !== lastN && body) {
            const parts = [];
            for (let i = 0; i < n; i++) {
              const e = entries[i] || {};
              const t = (typeof e.tSec === 'number') ? e.tSec : 0;
              const mm = String(Math.floor(t / 60)).padStart(2,'0');
              const ss = String(Math.floor(t % 60)).padStart(2,'0');
              parts.push(`<div class="logEntry"><div class="logT">[${mm}:${ss}]</div>${e.html || ''}</div>`);
            }
            body.innerHTML = parts.join('');
            try { body.scrollTop = body.scrollHeight; } catch (_) {}
            UI_STATE._logRenderN = n;
          }
        }
      }
    } catch (_) {}

    try { UI_STATE._selDrive = drive; } catch (_) {}
};

  MOD.onResize = function onResize() {
    if (typeof EC.resize === 'function') EC.resize();
  };
})();


// Break modal overlay (pauses sim until acknowledged)
(function(){
  const EC = (window.EC = window.EC || {});
  function qs(id){ return document.getElementById(id); }
  function ensure(){
    const ov = qs('breakOverlay');
    if (!ov) return null;
    const t = qs('breakTitle');
    const b = qs('breakBody');
    const ok = qs('breakOk');
    return { ov, t, b, ok };
  }
  EC.UI_HUD = EC.UI_HUD || {};
  EC.UI_HUD.updateBreakModal = function(){
    const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
    const SIM = snap.SIM;
    const UI = snap.UI || {};
    const el = ensure();
    if (!SIM || !el) return;
    const modal = SIM._breakModal;
    if (modal) {
      el.ov.classList.add('show');
      el.ov.setAttribute('aria-hidden','false');
      if (el.t) el.t.textContent = String(modal.title || 'Mental Break');
      if (el.b) {
        const lines = Array.isArray(modal.lines) ? modal.lines : [String(modal.lines||'')];
        el.b.textContent = lines.join('\n');
      }
	      try { if (el.ok) el.ok.textContent = String(modal.okText || 'OK'); } catch(_){ }
      if (el.ok && !el.ok._ecBound) {
        el.ok._ecBound = true;
        el.ok.addEventListener('click', function(){
          let res = null;
          try {
            if (EC.ENGINE && typeof EC.ENGINE.dispatch === 'function') res = EC.ENGINE.dispatch('ackBreakModal');
            else if (EC.ACTIONS && typeof EC.ACTIONS.ackBreakModal === 'function') res = EC.ACTIONS.ackBreakModal();
          } catch (_){}
          try { const ov = qs('breakOverlay'); if (ov){ ov.classList.remove('show'); ov.setAttribute('aria-hidden','true'); } } catch(_){}
          try { const modal2 = (res && res.modal) ? res.modal : null; if (modal2 && typeof modal2.onOk === 'function') modal2.onOk(); } catch(_){}
          try { if (el.ok) el.ok.textContent = 'OK'; } catch(_){}
        });
}
    } else {
      if (el.ov.classList.contains('show')) {
        el.ov.classList.remove('show');
        el.ov.setAttribute('aria-hidden','true');
      }
    }
  };
})();
