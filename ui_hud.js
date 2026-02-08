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

  // Objective summary text (used in bottom panel; kept identical)
  MOD.getObjectiveSummaryText = function getObjectiveSummaryText() {
    const SIM = EC.SIM || {};
    const lvl = SIM.levelId || 1;
    const def = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef() : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(lvl) : null);

    // Prefer explicit short label if present, else reuse existing strings
    const label = def ? (def.label || `Level ${lvl}`) : `Level ${lvl}`;
    const objText = def ? (def.objectiveText || def.name || '') : '';

    // Patient Weekly hold timer
    if (def && def.win && def.win.type === 'WEEKLY_HOLD') {
      const holdReq = (typeof def.win.holdSec === 'number') ? def.win.holdSec : 10;
      const holdCur = (typeof SIM.weeklyHoldSec === 'number') ? SIM.weeklyHoldSec : 0;
      const shortName = (def && def.objectiveShort) ? def.objectiveShort : (objText || 'Weekly');
      return `${label} — ${shortName}: Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s`;
    }

    // Patient Zen chain (3-step)
    if (def && def.win && def.win.type === 'ZEN_CHAIN') {
      const step = (typeof SIM.zenChainStep === 'number') ? SIM.zenChainStep : 0;
      const holdReq = (def.win.steps && def.win.steps[step] && typeof def.win.steps[step].holdSec === 'number') ? def.win.steps[step].holdSec : 10;
      const holdCur = (typeof SIM.zenChainHoldSec === 'number') ? SIM.zenChainHoldSec : 0;
      const stepName = (def.objectiveShort || 'Zen') + ` Step ${step + 1}/` + String((def.win.steps && def.win.steps.length) || 3);
      return `${label} — ${stepName}: Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s`;
    }

    // Legacy Zen-style hold timer
    if (def && def.win && def.win.type === 'ALL_BAND_HOLD') {
      const holdReq = (typeof def.win.holdSec === 'number') ? def.win.holdSec : EC.TUNE.ZEN_HOLD_SECONDS;
      const holdCur = (typeof SIM.zenHoldSec === 'number') ? SIM.zenHoldSec : 0;
      const shortName = (def && def.objectiveShort) ? def.objectiveShort : (objText || 'Zen');
      return `${label} — ${shortName}: Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s`;
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
      if (total > 0) return `${label} — ${shortName} (${done}/${total})`;
    }

    return `${label}${objText ? ` — ${objText}` : ''}`;
  };

  MOD.init = function init(ctxIn) {
    const ctx = _getCtx(ctxIn);
    const SIM = ctx.SIM || EC.SIM;
    if (!SIM) return;

    const UI_STATE = (ctx.UI_STATE = ctx.UI_STATE || (EC.UI_STATE = EC.UI_STATE || {}));
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

    const btnResetEl = dom.btnResetEl || document.getElementById('btnReset');
    const btnDebugEl = dom.btnDebugEl || document.getElementById('btnDebug');

    // Reset button
    if (btnResetEl && !UI_STATE._resetWired) {
      UI_STATE._resetWired = true;
      btnResetEl.addEventListener('click', () => EC.resetRun && EC.resetRun());
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
        if (SIM && typeof SIM.initMVP === 'function') SIM.initMVP(lvl);
      });
    }

    // Chunk 3 optional: Auto-Test toggle (T) — preserved
    if (!EC._mvpKeysWired) {
      EC._mvpKeysWired = true;
      window.addEventListener('keydown', (e) => {
        const k = (e.key || '').toLowerCase();
        if (k === 't') {
          EC.SIM.autoTest = !EC.SIM.autoTest;
          try {
            const on = EC.SIM.autoTest ? 'ON' : 'OFF';
            console.log('Auto-Test (T): ' + on);
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
    const SIM = ctx.SIM || EC.SIM;
    if (!SIM) return;

    const UI_STATE = ctx.UI_STATE || EC.UI_STATE || {};
    const dom = ctx.dom || {};
    const mvpHudEl = dom.mvpHudEl || document.getElementById('mvpHud');
    const notifyBarEl = document.getElementById('notifyBar');
    const notifyTextEl = document.getElementById('notifyText');
    const patientInfoEl = document.getElementById('patientInfo');
    const topbarEl = document.getElementById('topbar');
    const objectivePanelEl = dom.objectivePanelEl || document.getElementById('objectivePanel');
    const levelSelectEl = dom.levelSelectEl || document.getElementById('levelSelect');
    const debugEl = dom.debugEl || document.getElementById('debug');

    // small transient message timer
    if (UI_STATE.uiMsgT > 0) UI_STATE.uiMsgT = Math.max(0, UI_STATE.uiMsgT - (dt || 0));

    const T = EC.TUNE || {};
    const E_CAP = (typeof T.ENERGY_CAP === 'number') ? T.ENERGY_CAP : ((typeof T.E_MAX === 'number') ? T.E_MAX : 200);

    const i = (typeof SIM.selectedWellIndex === 'number') ? SIM.selectedWellIndex : -1;
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
      const short = (act || tele) || ((UI_STATE.uiMsgT > 0 && UI_STATE.uiMsg) ? UI_STATE.uiMsg : '');
      if (notifyTextEl) notifyTextEl.textContent = short;
    } catch (_) { /* ignore */ }

    // Patient + step (top-left)
    try {
      const lvl = SIM.levelId || 1;
      const def = (typeof EC.getActiveLevelDef === 'function') ? EC.getActiveLevelDef() : ((EC.LEVELS && typeof EC.LEVELS.get === 'function') ? EC.LEVELS.get(lvl) : null);
      const pName = (SIM._patientLabel || (def && def.label) || `Patient ${lvl}`);
      let stepLine = '';
      if (def && def.win && def.win.type === 'ZEN_CHAIN') {
        const step = (typeof SIM.zenChainStep === 'number') ? SIM.zenChainStep : 0;
        const total = (def.win.steps && def.win.steps.length) ? def.win.steps.length : 3;
        const prefix = def.objectiveShort || 'Step';
        stepLine = `${prefix} ${step + 1}/${total}`;
      } else {
        stepLine = 'Step 1/1';
      }
      if (patientInfoEl) patientInfoEl.textContent = `${pName}\n${stepLine}`;
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
      objectivePanelEl.innerHTML = `<div class="title">${title}</div>${objText ? `<div class="obj">${objText}</div>` : ''}${disp}${extra}${rows}${done}${loseBlock}`;
    }

    // Debug panel (monospace)
    if (debugEl) {
      const parts = [];
      parts.push(`MVP Debug`);
      parts.push(`energy=${(SIM.energy||0).toFixed(3)}  regen=${regen.toFixed(3)}/s  spill=${spillOn ? 'ON' : 'off'}  spillA=${(SIM._spillA||0).toFixed(2)}  spillS=${(SIM._spillS||0).toFixed(2)}`);
      if (SIM._spillMsg) parts.push('spillMsg: ' + SIM._spillMsg);
      parts.push(`selected=${i}`);
      parts.push(`energy=${(SIM.energy||0).toFixed(2)}  regen/s=${regen.toFixed(3)}  spill=${spillOn ? 'ON' : 'off'}  dA=${(SIM._spillA||0).toFixed(2)}  dS=${(SIM._spillS||0).toFixed(2)}`);
      if (i >= 0) {
        parts.push(`A=${A.toFixed(2)}  S=${Math.round(S)}  flux=${(A*S).toFixed(2)}`);
        parts.push(`psyΔ/sec=${drive.toFixed(3)}  psyP=${psy.toFixed(3)}  W=${Wi.toFixed(3)}`);
      }
      parts.push(`S: ${SIM.wellsS.map(v => (v>=0?'+':'') + Math.round((v||0))).join(' ')}`);
      parts.push(`P: ${SIM.psyP.map(v => Math.round((v||0))).join(' ')}`);
      parts.push(`W: ${W.map(v => Math.round((v||0))).join(' ')}`);
      if (SIM._dispDbg) {
        const d = SIM._dispDbg;
        parts.push(`disp: slots=${d.slots||0}  fires/180s=${d.fires180||0}  epm=${(d.epm||0).toFixed(2)}`);
      }
      parts.push(`hold: ${hold.toFixed(2)} / ${holdReq}`);
      parts.push(`err: ${err.toFixed(4)}  won=${won}`);
      debugEl.textContent = parts.join('\n');
    }

    // Expose selected-hue drive for renderer pulse indicator
    SIM._selDrive = drive;
  };

  MOD.onResize = function onResize() {
    if (typeof EC.resize === 'function') EC.resize();
  };
})();
