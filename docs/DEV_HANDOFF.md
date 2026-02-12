# Emotioncraft — Current Build Handoff (2026-02-12)

Build ID: **v0_2_99_chunk3b_partB**

## Non‑negotiables (project guardrails)
- **docs/** is the runnable web root (GitHub Pages).
- **No ES modules / no bundler.** Single global namespace: `window.EC`.
- Keep existing file split; add new systems as new files only if necessary and referenced in `docs/index.html` script order.
- Do **not** shrink the Pixi gameplay area; HUD/drawer changes must remain overlay-only.

## What this build is
- Lobby-driven patient roster (10 total, lobby shows 3 at a time).
- Each patient must complete **INTAKE** once; then player can choose **WEEKLY** or **ZEN** (boss) from plan-choice overlay.
- Core gameplay: stabilize 6 Wells (Amount + Spin) against timed Quirks.

## Authoritative state (read/modify via EC.SIM)
- `wellsA[6]` Amount (nominal 25..100)
- `wellsS[6]` Spin (-100..100)
- `psyP[6]` Psyche per hue (0..500 cap)
- `energy` float (HUD shows integer units via Math.round)
- PLAN_CHAIN: `SIM.planStepIndex`, `SIM.planHoldSec`, `SIM._planHoldReqSec`, `SIM._planStepFlashT`
- Zen: `SIM.zenTimeRemainingSec`

## Player-facing well names (index 0..5)
Grit, Ego, Chill, Nerves, Focus, Pep

## Psyche + breaks (current)
- No Total Psyche cap. Psyche is **per hue** only.
- **Hue break:** any `psyP[i] < 0` or `psyP[i] > PSY_HUE_CAP` triggers a break.
- **Jam breaks:** amount/spin extremes trigger relief/redirect + penalties.
- On any break: dispositions cancel, sim pauses, and `SIM._breakModal` + `SIM._breakPaused` drive a modal overlay. OK resumes.

## Treatment step hold (PLAN_CHAIN)
- Canonical hold: **10 seconds** for all steps except `SPIN_ZERO` (0s).
- Hold starts only when all step conditions are satisfied; resets if conditions break.
- Completion: brief flash (`SIM._planStepFlashT`) then immediate step advance.

## UI summary
- Top HUD: Energy + 2-line patient header
  - Line 1: Name + Traits
  - Line 2: Quirks (telegraph/active glow on words)
- Objective panel: also shows telegraph/active text from dispositions.
- Bottom drawer: left current step (3 lines max: Step + up to 2 conditions), right next step.
- Zen timer: top-right HUD pill (`#zenTimerHud`) shows `mm:ss` only during Zen.

## Quirks
- System lives in `docs/systems_dispositions.js` with telegraph + active phases.
- Global minimum spacing between scheduled fires uses `T.DISP_MIN_GAP_SEC` and trackers `_lastScheduledFireAt`, `_lastFiredAt`.

## Debug
- Default debug shows ONLY raw quirk force totals (`SIM._quirkForceTotals`) per well (+ optional by type).
- Input instrumentation is hidden unless URL includes `?inputdebug=1`.

## Key files by system
- Core sim + step: `docs/core_model.js`, `docs/core_mechanics.js`, `docs/core_tuning.js`
- Rendering: `docs/render_wells*.js`
- HUD/UI: `docs/ui_hud.js`, `docs/ui_controls.js`, `docs/ui_lobby.js`
- Patients/progression: `docs/systems_patients.js`
- Dispositions/quirks: `docs/systems_dispositions.js`
- Breaks: `docs/systems_breaks.js`
- SFX: `docs/systems_sfx.js`
- Firebase: `docs/systems_firebase.js`

## Smoke test checklist
1) Boot: **0 console errors**.
2) Lobby: select intake-complete patient → Start opens plan choice overlay.
3) INTAKE win → return to lobby → “Intake complete” modal shows once.
4) PLAN_CHAIN: satisfy conditions → center shows 10..1 countdown → flash → step advances immediately.
5) Zen: timer shows top-right and counts down from 10:00.
6) Trigger a break (force a jam or hue underflow) → sim pauses → modal shows well-name deltas → OK resumes.
7) Debug: default shows quirk force totals; add `?inputdebug=1` to see input instrumentation.

## Bug/polish backlog (next chat targets)
- Tune quirk spacing and tier cadence (edit `T.DISP_MIN_GAP_SEC`, tier totals/jitter).
- UI polish: spacing/line breaks on top HUD for long names/traits; adjust glow intensity.
- Break modal copy polish (shorter player-facing reasons; ensure consistent well-name mapping).
- Treatment conditions text polish (ensure semicolon splitting reads well and never overflows).
- Mobile QA: remote-debug via `chrome://inspect/#devices` (USB debugging) for any touch edge cases.

Pass A notes
- Next-step drawer: objectiveSummaryEl now defined; right side renders 3 lines for upcoming step.
- Log overlay added (#btnLog / #logOverlay). Opening pauses sim via SIM._uiPaused.
- Mental breaks: no modal. On break, SIM._hitStopT=0.5, SIM._breakToastT=5, SIM._breakFx drives center/wedge/well pulses; entry appended to EC.UI_STATE.logEntries.
- Psyche wedge threshold flash at 450/50 crossings.
- main.js no-energy swipe now calls EC.SFX.error().
- fragile trait removed.

Pass B notes
- Sally Sadeyes roster entry now references real portrait asset: `assets/patients/sally_sadeyes.png`.
- In-game portrait overlay position nudged slightly up/right (still clamped on-screen).
- Patient WIN auto-returns to lobby (no on-board "SUCCESS!" banner) so post-win popups show immediately.
- Lobby: added Heroes button + "Transcended" overlay (lists `STATE.transcendedIds` via `EC.PAT.listTranscended()`).

v0_2_102_passC
What changed:
- systems_dispositions.js: records per-quirk event summaries into SIM._quirkTimeline (capped) using unshielded force integration; resets buffers each run.
- ui_hud.js: Debug panel now displays QUIRK TIMELINE (this run) with mm:ss, type, tier label, well name, unshielded force, duration, gap.
- systems_patients.js: Sally Sadeyes portrait points to assets/patients/sally_sadeyes.png.
- core_model.js: initMVP resets SIM._autoWinHandled = false each run.
Validation:
- Debug shows event-based timeline (not per-tick spam).
- Sally portrait appears in lobby viewer + in-game.
- Auto-return on WIN works across multiple runs.

## v0_2_103_passD — Quirk timeline + global cadence (2026-02-12)
Changes:
- systems_dispositions.js: SIM._quirkTimeline implemented as authoritative event log (one entry per quirk when it ends). Each entry: tStart/tEnd/durSec/type/tier/hueIndex/force (unshielded; matches _quirkForceTotals semantics). Capped to 60.
- systems_dispositions.js: random-only cadence state machine alternates QUIET/BURST windows (global) via rate multiplier applied to exponential nextT scheduling. Scheduled mode unaffected.
- ui_hud.js: Debug timeline timestamps by tStart and computes gaps by tStart; shows optional cadence status.
- Console: disposition debug logs only appear with ?dispconsole=1.
Validation:
- Boot has zero console errors.
- In random-dispositions levels with Debug open, timeline populates with per-event entries (no per-tick spam).
- Over ~90s you can observe quiet and burst windows in event spacing.
- Scheduled test levels behave unchanged.
