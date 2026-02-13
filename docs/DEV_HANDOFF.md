# Emotioncraft — Current Build Handoff (2026-02-12)

Build ID: **v0_2_103_passD**

## Non‑negotiables (project guardrails)
- **docs/** is the runnable web root (GitHub Pages).
- **No ES modules / no bundler.** Single global namespace: `window.EC`.
- Keep existing file split; only add new files if necessary and wire them into `docs/index.html` script order.
- Do **not** shrink the Pixi gameplay area; HUD/drawer changes must remain overlay-only.

## What this build is
- Lobby-driven patient roster (10 total; lobby shows 3 slots at a time).
- Each patient must complete **INTAKE** once; then player can choose **WEEKLY** or **ZEN** from the plan-choice overlay.
- Core gameplay: stabilize 6 Wells (Amount + Spin) against timed Quirks.
- Patient **WIN** auto-returns to Lobby so post-win popups appear without pressing Lobby. LOSE does not auto-return.

## Authoritative state (read/modify via EC.SIM)
- `wellsA[6]` Amount
- `wellsS[6]` Spin (-100..100)
- `psyP[6]` Psyche per hue (0..500 cap)
- `energy` float (HUD shows integer units via Math.round)
- PLAN_CHAIN: `SIM.planStepIndex`, `SIM.planHoldSec`, `SIM._planHoldReqSec`, `SIM._planStepFlashT`
- Pause flags: `SIM._uiPaused` (Log overlay), `SIM._hitStopT` (break hit-stop)
- Break visuals: `SIM._breakFx`, `SIM._breakToastT`, `SIM._breakToastText`
- Zen: `SIM.zenTimeRemainingSec`
- Debug: `SIM._quirkTimeline` (event-based), `SIM._quirkForceTotals` (optional)

## Player-facing well names (index 0..5)
Grit, Ego, Chill, Nerves, Focus, Pep

## UI quick map
- Top HUD (patient header): `docs/ui_hud.js` renders:
  - line 1: patient name (bold) + traits
  - line 2: quirk pills; telegraph/active highlight via EC.DISP.getRenderStates()
  - line 3: transient alerts (MENTAL BREAK)
  - Log button opens opaque Log overlay and pauses sim (`SIM._uiPaused`)
  - Zen timer pill appears top-right in Zen
- Bottom drawer: `docs/ui_controls.js` formats Treatment step UI (current/next; 3 lines each) and Set-0 buttons/costs.

## Mental breaks (no popup)
Source: `docs/systems_breaks.js`
- Triggers:
  - Psyche out of bounds (<0 or >500)
  - Jam breaks: AMOUNT_HIGH/LOW_JAM, SPIN_MAX/MIN_JAM (relief + redirect + psyche penalty)
- On break:
  - Cancel dispositions (EC.DISP.cancelAll())
  - Append a detailed log entry (color-coded) to `EC.UI_STATE.logEntries`
  - Apply ~0.5s hit-stop (`SIM._hitStopT`)
  - Show HUD toast (line 3) for ~5s
  - Drive render FX (`SIM._breakFx`: center flash + wedges/well rims)

Psyche warning flashes (visual-only): wedge flashes 3x when a hue crosses >=450 or <=50 (see `docs/render_wells.js`).

## Dispositions / Quirks
Source: `docs/systems_dispositions.js`
- Telegraph + active phases; render-facing states via `EC.DISP.getRenderStates()`.
- Random mode scheduling:
  - Global min spacing: `EC.TUNE.DISP_MIN_GAP_SEC`
  - Global quiet/burst cadence windows: `DISP_CADENCE_*` (modulates scheduling density; mechanics/force unchanged)
- Debug timeline:
  - Each instance accumulates an unshielded force metric and pushes a summary entry into `SIM._quirkTimeline` on end (cap 60).

## Patients / Lobby / Progression
Source: `docs/systems_patients.js`, `docs/ui_lobby.js`
- Patient progress is stored per-user (Firestore) when signed in.
- Zen win → patient added to `transcendedIds` and removed from pool.
- Lobby Heroes button shows transcended list.

## Tuning knobs (common)
- Energy cap/regen: `docs/core_tuning.js`
- Dispositions cadence + spacing: `DISP_MIN_GAP_SEC`, `DISP_CADENCE_*` in `docs/core_tuning.js`

## Smoke-test checklist
1) Launch `docs/index.html` → zero console errors.
2) Select Sally Sadeyes → portrait loads in lobby + in-game.
3) Complete a patient board → auto-return to lobby and post-win popup appears.
4) Trigger a mental break → hit-stop + HUD toast + log entry appears; no popup.
5) Enable Debug → quirk timeline fills as quirks occur.
6) Zen plan → top-right timer counts down.

## Notes for future polish (not required)
- Add more patient portraits under `docs/assets/patients/`
- Expand log overlay to include other events (wins/losses/rewards) if desired.
- Optional: show cadence state in debug for faster tuning.

