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

  // Objective summary text (used in bottom panel)
  MOD.getObjectiveSummaryText = function getObjectiveSummaryText() {
    const SIM = EC.SIM || {};
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
      const holdReq = (typeof st.holdSec === 'number') ? st.holdSec : 0;
      const holdCur = (typeof SIM.planHoldSec === 'number') ? SIM.planHoldSec : 0;
      const rawText = String(st.text || `Step ${idx+1}`);
      const clean = stripStepPrefix(rawText);

      let prog = '';
      const postOn = !!SIM.planPostHoldActive;
      const postLeft = (typeof SIM.planPostHoldRemaining === 'number') ? SIM.planPostHoldRemaining : 0;

      if (postOn) {
        prog = ` — Confirm: ${postLeft.toFixed(1)}s left`;
      } else if (holdReq > 0) {
        prog = ` — Hold: ${holdCur.toFixed(1)} / ${holdReq.toFixed(1)}s`;
      } else if (kind === 'SPIN_ZERO') {
        const eps = (typeof EC.TUNE.PAT_SPIN_ZERO_EPS === 'number') ? EC.TUNE.PAT_SPIN_ZERO_EPS : 1.0;
        let n = 0;
        for (let i = 0; i < 6; i++) if (Math.abs((SIM.wellsS && SIM.wellsS[i]) || 0) <= eps) n++;
        prog = ` — Spins at 0: ${n}/6`;
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
    const SIM = EC.SIM || {};
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

    const btnDebugEl = dom.btnDebugEl || document.getElementById('btnDebug');
    const btnLobbyEl = dom.btnLobbyEl || document.getElementById('btnLobby');

    // Reset button removed (Lobby + Debug cover reset flows)

    // Lobby button (must work even after WIN/LOSE freeze)
    if (btnLobbyEl && !UI_STATE._lobbyWired) {
      UI_STATE._lobbyWired = true;
      btnLobbyEl.addEventListener('click', () => {
        try {
          const SIM = EC.SIM || {};
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
    const gestureDbgEl = document.getElementById('gestureDebugOverlay');
    const patientInfoEl = document.getElementById('patientInfo');
    const topbarEl = document.getElementById('topbar');
    const objectivePanelEl = dom.objectivePanelEl || document.getElementById('objectivePanel');
    const levelSelectEl = dom.levelSelectEl || document.getElementById('levelSelect');
    const debugEl = dom.debugEl || document.getElementById('debug');

    // small transient message timer
    if (UI_STATE.uiMsgT > 0) UI_STATE.uiMsgT = Math.max(0, UI_STATE.uiMsgT - (dt || 0));
    if (UI_STATE.uiMsgFlashT > 0) UI_STATE.uiMsgFlashT = Math.max(0, UI_STATE.uiMsgFlashT - (dt || 0));

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
      // Banner priority: WIN/LOSE > mental break > normal disposition/short message
      const g = UI_STATE.gestureDebug || '';

      const isWin = (SIM.levelState === 'win') || !!SIM.mvpWin;
      const isLose = (SIM.levelState === 'lose') || !!SIM.mvpLose || !!SIM.gameOver;
      const isBreak = (!isWin && !isLose && UI_STATE.uiMsgT > 0 && UI_STATE.uiMsgKind === 'break');

      // Notify bar classes (visual styling)
      if (notifyBarEl) {
        notifyBarEl.classList.toggle('isBanner', !!(isWin || isLose));
        notifyBarEl.classList.toggle('bannerWin', !!isWin);
        notifyBarEl.classList.toggle('bannerLose', !!isLose);
        notifyBarEl.classList.toggle('breakMode', !!isBreak);
        notifyBarEl.classList.toggle('flashBreak', !!(isBreak && UI_STATE.uiMsgFlashT > 0));
      }

      if (isWin) {
        if (patientInfoEl) patientInfoEl.textContent = 'SUCCESS!';
        if (notifyTextEl) notifyTextEl.textContent = 'Treatment complete';
      } else if (isLose) {
        if (patientInfoEl) patientInfoEl.textContent = 'TREATMENT FAILED';
        // Optional second line: keep it short + player-facing.
        let line2 = 'Too many breaks';
        const r = String(SIM.gameOverReason || '').trim();
        if (r && !/4\s*breaks\s*in\s*5\s*seconds/i.test(r)) {
          // If reason isn't the standard one, show it.
          line2 = r;
        }
        if (notifyTextEl) notifyTextEl.textContent = line2;
      } else if (isBreak) {
        if (patientInfoEl) patientInfoEl.textContent = 'MENTAL BREAK';
        const reason = String(UI_STATE.uiMsgReason || '').trim() || '—';
        if (notifyTextEl) notifyTextEl.textContent = reason;
      } else {
        // Normal mode: show disposition HUD or short message + gesture debug line.
        // Hide disposition telegraph/active text from HUD; keep only UI messages.
        const short = ((UI_STATE.uiMsgT > 0 && UI_STATE.uiMsg) ? UI_STATE.uiMsg : '');
        if (notifyTextEl) notifyTextEl.textContent = g ? (short ? (short + "\n" + g) : g) : short;
      }

      // Always-visible debug overlay (does not depend on the notify bar state)
      if (gestureDbgEl) gestureDbgEl.textContent = g || 'SWIPE: (waiting)';
    } catch (_) { /* ignore */ }

    // Patient + step (top-left)
    try {
      // If a banner is active, we already replaced patientInfoEl above.
      if ((SIM.levelState === 'win') || !!SIM.mvpWin || (SIM.levelState === 'lose') || !!SIM.mvpLose || !!SIM.gameOver || (UI_STATE.uiMsgT > 0 && UI_STATE.uiMsgKind === 'break')) {
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
        // Line1: Name + Traits (single-word, colored)
        // Line2: Quirks as colored words (Lobby-style labels) with telegraph/active glow

        const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        // Traits source of truth
        let traits = [];
        try {
          traits = (EC.TRAITS && typeof EC.TRAITS.list === 'function') ? (EC.TRAITS.list(SIM) || []) : [];
        } catch (_) { traits = []; }

        const traitLabel = (k) => {
          const s = String(k || '').trim();
          if (!s) return '';
          return s.charAt(0).toUpperCase() + s.slice(1);
        };

        const traitColor = (k) => {
          const s = String(k || '').toLowerCase();
          if (s === 'sensitive') return 'rgba(255, 92, 92, 0.95)';
          if (s === 'stubborn') return 'rgba(230, 216, 92, 0.95)';
          if (s === 'fragile') return 'rgba(160, 170, 255, 0.95)';
          return 'rgba(200, 210, 235, 0.90)';
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
          if (s === 'LOCKS_IN') return 'Locks In';
          if (s === 'CRASHES') return 'Crashes';
          if (s === 'SPIRALS') return 'Spirals';
          if (s === 'AMPED') return 'Amped';
          return s ? (s.charAt(0) + s.slice(1).toLowerCase()) : 'Quirk';
        };

        let line1 = `<span class="hudPatientName">${esc(pName)}</span>`;
        if (traits && traits.length) {
          for (const tr of traits) {
            const lab = traitLabel(tr);
            if (!lab) continue;
            const c = traitColor(tr);
            line1 += ` <span class="hudTraitWord" style="color:${c}">${esc(lab)}</span>`;
          }
        }

        let line2 = '';
        if (quirks && quirks.length) {
          const words = [];
          for (const q of quirks) {
            const ty = q && q.type ? String(q.type).toUpperCase() : '';
            const tier = (q && typeof q.intensityTier === 'number') ? q.intensityTier : 0;
            const c = tierColor(tier);
            const cls = ['hudQuirkWord'];
            if (ty && activeTypes[ty]) cls.push('hudQuirkActiveText');
            else if (ty && teleTypes[ty]) cls.push('hudQuirkTeleText');
            words.push(`<span class="${cls.join(' ')}" style="color:${c}">${esc(quirkLabel(ty))}</span>`);
          }
          line2 = words.join(' ');
        }

        patientInfoEl.innerHTML = `<div class="hudLine1">${line1}</div><div class="hudLine2">${line2}</div>`;
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
      objectivePanelEl.innerHTML = `<div class="title">${title}</div>${objText ? `<div class="obj">${objText}</div>` : ''}${disp}${extra}${rows}${done}${loseBlock}`;
    }

    // Debug panel (monospace)
    if (debugEl) {
      const parts = [];
      const qs = (typeof window !== 'undefined' && window.location && window.location.search) ? window.location.search : '';
      const verbose = /(?:\?|&)inputdebug=1(?:&|$)/.test(qs);

      // Default: show ONLY quirk force totals.
      parts.push('QUIRK FORCE TOTALS (raw, per run)');
      parts.push('---------------------------');

      const Q = SIM._quirkForceTotals || null;
      if (!Q || !Array.isArray(Q.byWell)) {
        parts.push('No quirk force recorded yet.');
      } else {
        for (let wi = 0; wi < 6; wi++) {
          const name = _wellTitle(ctx, wi);
          const v = Number(Q.byWell[wi] || 0);
          parts.push(`${name}: ${v.toFixed(2)}`);
        }
        // Optional breakdown by type (kept compact)
        try {
          if (Q.byType) {
            parts.push('');
            parts.push('By type:');
            const types = ['LOCKS_IN','CRASHES','AMPED','SPIRALS'];
            for (const ty of types) {
              const arr = Q.byType[ty] || [];
              const seg = [];
              for (let wi = 0; wi < 6; wi++) seg.push(Number(arr[wi] || 0).toFixed(1));
              parts.push(`${ty}: ${seg.join('  ')}`);
            }
          }
        } catch (_) {}
      }

      // Input instrumentation is hidden unless explicitly requested.
      if (verbose) {
        parts.push('');
        parts.push('INPUT DEBUG (enabled by ?inputdebug=1)');
        parts.push('------------------------------');
        try {
          const D = (EC.UI_STATE && EC.UI_STATE.inputDbg) || null;
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

      // Wire copy button once (works when verbose is enabled)
      const btn = document.getElementById('btnCopyInputLog');
      if (btn && !UI_STATE._copyLogWired) {
        UI_STATE._copyLogWired = true;
        btn.addEventListener('click', async () => {
          try {
            const dbg = (EC.UI_STATE && EC.UI_STATE.inputDbg) || {};
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

      const pre = document.getElementById('debugPre');
      if (pre) pre.textContent = parts.join('\n');
      else debugEl.textContent = parts.join('\n');
    }
    try { if (MOD.updateBreakModal) MOD.updateBreakModal(); } catch (_) {}


    // Expose selected-hue drive for renderer pulse indicator
    SIM._selDrive = drive;
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
    const SIM = EC.SIM;
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
      if (el.ok && !el.ok._ecBound) {
        el.ok._ecBound = true;
        el.ok.addEventListener('click', function(){
          try { SIM._breakModal = null; } catch(_){}
          try { SIM._breakPaused = false; } catch(_){}
          try { const ov = qs('breakOverlay'); if (ov){ ov.classList.remove('show'); ov.setAttribute('aria-hidden','true'); } } catch(_){}
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
