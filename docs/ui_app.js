/* Emotioncraft — UI app (Step 5 split)
   DOM wiring, selection logic, debug panel.
   No behavior changes: moved from main.js.
*/
(() => {
  const EC = (window.EC = window.EC || {});

  EC.initUI = function initUI() {
    // Pull shared state + helpers from the global namespace.
    const snap = (EC.ENGINE && EC.ENGINE.getSnapshot) ? EC.ENGINE.getSnapshot() : { SIM: (EC.SIM||{}), UI: (EC.UI_STATE||{}), RENDER: (EC.RENDER_STATE||{}) };
    const SIM = (snap && snap.SIM) ? snap.SIM : (EC.SIM || {});
    const UI_STATE = (snap && snap.UI) ? snap.UI : (EC.UI_STATE || {});

    // ---------------------------------------------------------------------
    // MVP Redesign UI (Chunk 5)
    // - No inventory, no crafting, no release.
    // - Click a Well to select, then Apply ΔAmount / ΔSpin with Energy.
    // - Compact HUD with live readouts for mechanics verification.
    // ---------------------------------------------------------------------
    const mvpMode = !!(SIM && Array.isArray(SIM.wellsA) && SIM.wellsA.length === 6);
    if (mvpMode) {
const clamp = EC.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));

// Shared MVP UI context (hardening + split UI modules)
const UI = (EC.UI = EC.UI || {});
const UI_STATE = (EC.UI_STATE = EC.UI_STATE || { prev: {}, lastPreview: null, debugOn: false });
UI_STATE.mvpCtx = UI_STATE.mvpCtx || {};

const topbarEl = document.querySelector('.topbar');
const legacyMetersEl = document.getElementById('legacyMeters');
const mvpHudEl = document.getElementById('mvpHud');
const debugEl = document.getElementById('debug');
const objectivePanelEl = document.getElementById('objectivePanel');
const levelSelectEl = document.getElementById('levelSelect');

const selectedWellPillEl = document.getElementById('selectedWellPill');
const energyCostPillEl = document.getElementById('energyCostPill');
const deltaAEl = document.getElementById('deltaA');
const deltaAValEl = document.getElementById('deltaAVal');
const deltaSEl = document.getElementById('deltaS');
const deltaSValEl = document.getElementById('deltaSVal');
const costPillEl = document.getElementById('costPill');
const previewPillEl = document.getElementById('previewPill');
const objectiveSummaryEl = document.getElementById('objectiveSummary');
const btnApplyEl = document.getElementById('btnApply');
const btnSpinZeroEl = document.getElementById('btnSpinZero');
const btnZeroPairEl = document.getElementById('btnZeroPair');
const energyMiniFillEl = document.getElementById('energyMiniFill');

const btnDebugEl = document.getElementById('btnDebug');

// Apply MVP layout toggles exactly as before
if (topbarEl) topbarEl.classList.add('compact');
if (legacyMetersEl) legacyMetersEl.style.display = 'none';
if (mvpHudEl) mvpHudEl.style.display = 'block';

// Hue/well naming helpers (presentation-only)
// Single source of truth lives in core_const/core_tuning.
const HUES = (EC.CONST && EC.CONST.HUES) || EC.HUES || ['red','purple','blue','green','yellow','orange'];
const hueName = (i) => {
  try {
    if (typeof EC.hueTitle === 'function') return EC.hueTitle(i);
    const h = HUES[i] || '??';
    return h.charAt(0).toUpperCase() + h.slice(1);
  } catch (_) { return 'Hue ' + i; }
};
const wellTitle = (i) => {
  try {
    if (typeof EC.wellLabel === 'function') return EC.wellLabel(i);
    if (typeof EC.hueLabel === 'function') return EC.hueLabel(i);
    return hueName(i);
  } catch (_) { return 'Hue ' + i; }
};

// Ensure persistent MVP UI caches exist (hardening)
UI.targetA = (typeof UI.targetA === 'number') ? UI.targetA : 0;
UI.targetS = (typeof UI.targetS === 'number') ? UI.targetS : 0;
UI.zeroPairArmed = !!UI.zeroPairArmed;
UI.zeroPairOpp = (typeof UI.zeroPairOpp === 'number') ? UI.zeroPairOpp : -1;

UI_STATE.uiMsg = (typeof UI_STATE.uiMsg === 'string') ? UI_STATE.uiMsg : '';
UI_STATE.uiMsgT = (typeof UI_STATE.uiMsgT === 'number') ? UI_STATE.uiMsgT : 0;
UI_STATE.prevSel = (typeof UI_STATE.prevSel === 'number') ? UI_STATE.prevSel : -999;
UI_STATE.lastInitStamp = (typeof UI_STATE.lastInitStamp === 'number') ? UI_STATE.lastInitStamp : -1;

// Build and store a stable context object for the split UI modules
const ctx = UI_STATE.mvpCtx;
ctx.clamp = clamp;
ctx.SIM = SIM;
ctx.UI = UI;
ctx.UI_STATE = UI_STATE;
ctx.wellTitle = wellTitle;
ctx.hueName = hueName;
ctx.HUES = HUES;

ctx.dom = {
  topbarEl, legacyMetersEl, mvpHudEl, debugEl, objectivePanelEl, levelSelectEl,
  selectedWellPillEl, energyCostPillEl, deltaAEl, deltaAValEl, deltaSEl, deltaSValEl,
  costPillEl, previewPillEl, objectiveSummaryEl, btnApplyEl, btnSpinZeroEl, btnZeroPairEl,
  energyMiniFillEl, btnDebugEl,
};

// Init split modules (idempotent)
if (EC.UI_HUD && typeof EC.UI_HUD.init === 'function') EC.UI_HUD.init(ctx);
if (EC.UI_CONTROLS && typeof EC.UI_CONTROLS.init === 'function') EC.UI_CONTROLS.init(ctx);
if (EC.UI_LOBBY && typeof EC.UI_LOBBY.init === 'function') EC.UI_LOBBY.init(ctx);

function updateUI(dt) {
  if (EC.UI_LOBBY && typeof EC.UI_LOBBY.render === 'function') EC.UI_LOBBY.render(dt, ctx);
  if (EC.UI_HUD && typeof EC.UI_HUD.render === 'function') EC.UI_HUD.render(dt, ctx);
  if (EC.PAT && typeof EC.PAT.update === 'function') EC.PAT.update(dt);
  if (EC.UI_CONTROLS && typeof EC.UI_CONTROLS.render === 'function') EC.UI_CONTROLS.render(dt, ctx);
}

EC.updateUI = updateUI;
EC.failRun = EC.failRun || function () {};
EC.winRun = EC.winRun || function () {};

// Ensure labels are correct on load
updateUI(0);

return; // MVP UI completely replaces legacy UI below.
    }

    // Non-MVP / legacy UI paths were removed in Chunk 6 (L2) because they are
    // unreachable in the current prototype.
  };
})();
