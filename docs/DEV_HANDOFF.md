# Emotioncraft — Current Build Handoff (2026-02-13)

Build ID: **v0_2_103_passD (pass7)**

## Non-negotiables (project guardrails)
- **docs/** is the runnable web root (GitHub Pages).
- **No ES modules / no bundler.** Single global namespace: `window.EC`.
- Keep existing file split; only add new files if necessary and wire them into `docs/index.html` script order.
- Do **not** shrink the Pixi gameplay area; HUD/drawer changes must remain overlay-only.

## What this build is
- Lobby-driven patient roster (10 total; lobby shows 3 slots at a time).
- Each patient must complete **INTAKE** once; then player can choose **WEEKLY**, **ZEN**, or **TRANQUILITY** from the plan-choice overlay.
- **TRANSCENDENCE** unlocks only after both **ZEN** and **TRANQUILITY** are completed for that patient.
- Patient **transcends** (removed from rotation + contributes to start-energy bonus) only when **TRANSCENDENCE** is completed.
- Core gameplay: stabilize 6 Wells (Amount + Spin) against timed Quirks.
- Patient **WIN** auto-returns to Lobby so post-win popups appear without pressing Lobby. LOSE does not auto-return.

## Authoritative state (read/modify via EC.SIM)
- `wellsA[6]` Amount
- `wellsS[6]` Spin (-100..100)
- `psyP[6]` Psyche per hue (0..500 cap)
- `energy` float (HUD shows integer units via Math.round)
- PLAN_CHAIN: `SIM.planStepIndex`, `SIM.planHoldSec`, `SIM._planHoldReqSec`, `SIM._planStepFlashT` (each step may define `holdSec`; default 10s)
- Pause flags: `SIM._uiPaused` (Log overlay), `SIM._hitStopT` (break hit-stop)
- Break FX: `SIM._breakFx`
- Timed plans: `SIM.zenTimeRemainingSec` (countdown reused for Zen / Tranquility / Transcendence)
- Debug: `SIM._quirkTimeline` (event-based), `SIM._quirkForceTotals` (optional)

## Player-facing well names (index 0..5)
Grit, Ego, Chill, Nerves, Focus, Pep

## UI quick map
- Top HUD (`docs/ui_hud.js`):
  - Line 1: patient name (bold) + traits
  - Line 2: quirk pills; telegraph/active highlight via `EC.DISP.getRenderStates()`
  - Line 3: transient alerts (e.g., break messaging via `EC.UI_STATE.uiMsg`)
  - Log button opens opaque Log overlay and pauses sim (`SIM._uiPaused`)
  - Timed plan timer pill appears top-right during Zen / Tranquility / Transcendence
- Bottom drawer (`docs/ui_controls.js`): Treatment step display (current/next; 3 lines each) + Set-0 buttons/costs.
- Debug overlay: includes **Copy Debug** button (copies current debug text to clipboard).

## Mental breaks (no popup)
Source: `docs/systems_breaks.js`
- Triggers:
  - Psyche out of bounds (<0 or >500)
  - Jam breaks: AMOUNT_HIGH/LOW_JAM, SPIN_MAX/MIN_JAM (relief + redirect + psyche penalty)
- On break:
  - **Quirks are cancelled and all quirk ramp timers reset** (`EC.DISP.resetAllQuirkTimers()`)
  - Apply ~0.5s hit-stop (`SIM._hitStopT`)
  - Append a detailed log entry (color-coded) to `EC.UI_STATE.logEntries`
  - Drive render FX (`SIM._breakFx`: center flash + wedges/well rims)

Psyche warning flashes (visual-only): wedge flashes 3x when a hue crosses >=450 or <=50 (see `docs/render_wells.js`).

## Dispositions / Quirks
Source: `docs/systems_dispositions.js`
- Telegraph + active phases; render-facing states via `EC.DISP.getRenderStates()`.
- Multiple quirks can be active at once, **but never more than one on the same well**.
- Random mode scheduling:
  - Global min spacing: `EC.TUNE.DISP_MIN_GAP_SEC`
  - **Per-template ramp chance (once per second):** each quirk template tracks its own elapsed seconds since it last finished. Each second while idle, chance increases by a tier step: **0.025 / 0.05 / 0.1** (tier 0/1/2). When a template fires, it locks until that quirk instance ends; then its timer resets and it can ramp again.
  - Scheduler is capped to at most **one** newly scheduled quirk per second; if min-gap pushes scheduling out, telegraph is deferred to preserve the full telegraph window.
  - Mental breaks cancel pending/telegraph/active quirks and reset all ramp timers.
- Debug timeline:
  - Each instance accumulates an unshielded force metric and pushes a summary entry into `SIM._quirkTimeline` on end (cap 60).

## Patients / Lobby / Progression
Source: `docs/systems_patients.js`, `docs/ui_lobby.js`
- Patient progress is stored per-user (Firestore) when signed in.
- After **INTAKE**, choose **WEEKLY**, **ZEN** (timed 10:00), or **TRANQUILITY** (timed 10:00).
- Completion flags:
  - Zen win sets `zenDone: true` (persists)
  - Tranquility win sets `tranquilityDone: true` (persists)
- **TRANSCENDENCE** (timed 10:00) unlocks only when `zenDone && tranquilityDone` for that patient.
- Transcendence win adds the patient to `transcendedIds` (removed from rotation) and shows the existing Transcended congrats overlay.
- Lobby Heroes button shows transcended list.
- Lobby details panel shows small badges when Zen and/or Tranquility are completed.

## Smoke-test checklist
1) Launch `docs/index.html` -> zero console errors.
2) Pick any patient -> portrait loads in lobby + in-game.
3) Complete a patient run -> auto-return to lobby and post-win popup appears.
4) Trigger a mental break -> hit-stop + FX + log entry; quirks cancel and ramp timers reset.
5) Enable Debug -> quirk timeline fills as quirks occur; Copy Debug copies text.
6) Zen / Tranquility / Transcendence -> top-right timer counts down; timer-expiry loss reason is exactly "Time expired."
