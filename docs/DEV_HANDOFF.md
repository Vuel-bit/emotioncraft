# Emotioncraft — Current Build Handoff (2026-02-19)

Build ID: **emotioncraft_v0_2_103_passD_passA40c_hotfix_inputRestore**

## Pass A40c summary (hotfix)
- Restored **swipe/drag/long-press** + selection by hardening `systems_input.js` hit-testing: if `EC.RENDER.wellGeom` isn't ready, input now falls back to `layout.mvpGeom` to compute well tap targets. This also restores **Spin buttons** that depend on selection.

## Pass A40 summary (UI/visual only)
- **Psyche center wedges** now reuse the true **well interior stack** (same textures + nebula/water FX) and are clipped by crisp wedge masks (feels like "mini wells"; avoids hue muting).
- **Treatment Plan text** rendering fixed for current step kinds (ALL_OVER / ALL_BAND / SET_BOUNDS / PER_HUE_BOUNDS / SPIN_ZERO): grouped where possible, plain-language thresholds, no inequality symbols; unknown kinds fall back to `step.text`.

## Non-negotiables (project guardrails)
- **docs/** is the runnable web root (GitHub Pages).
- **No ES modules / no bundler.** Single global namespace: `window.EC`.
- Keep existing file split; only add new files if necessary and wire them into `docs/index.html` script order.
- Do **not** shrink the Pixi gameplay area; HUD/drawer changes must remain overlay-only.

## Engine façade (Pass A1 — boundary start)
- New façade: `docs/core_engine.js` exposes `EC.ENGINE.dispatch(actionName, ...args)` -> calls `EC.ACTIONS[actionName](...args)` (best-effort, no-throw).
- `EC.ENGINE.getSnapshot()` returns `{ SIM: EC.SIM, UI: EC.UI_STATE, RENDER: EC.RENDER_STATE }` (references).
- `EC.ENGINE.tick(delta)` brackets `EC.tickEngine(delta)` (sim only) and then calls `EC.tickUI(safeDt)` outside the bracket; falls back to `EC.tick(delta)` if split tick is unavailable.
- **Rule start:** presentation modules should not mutate `EC.SIM` directly; route SIM writes through `EC.ENGINE.dispatch(...)` (or `EC.ACTIONS.*` when needed).
- Render-only layout state moved under `EC.RENDER_STATE.layout` (`mvpGeom`, `psycheRadius`). Render code must not write these into SIM.
- Pass A2: presentation no longer writes SIM directly for: autoTest toggle, auto-win handled flag, break modal ack/close, tutorial last-action recording, and HUD selDrive (moved to EC.UI_STATE).
- Pass A3: canonical selected well moved to `EC.UI_STATE.selectedWellIndex`; presentation reads prefer UI_STATE.
- Pass A5: `EC.SIM` no longer stores selection at all (no `SIM selectedWellIndex`).
- Pass A6: Control-sync stamps moved from SIM into `EC.UI_STATE._controlsSyncStamp/_controlsSyncSel` (ui_controls reads UI_STATE). Engine systems route lobby state changes through `EC.ACTIONS.setInLobby` (systems no longer assign `SIM.inLobby` directly).
- Pass A7: Optional debug SIM root write-guard (?simguard=1 or UI_STATE.debugStrict). Warns on SIM root writes outside ENGINE dispatch/tickEngine brackets; warn-only with cap + stats in UI_STATE.simGuardStats.
- Pass A8: Tick split into `EC.tickEngine` (sim) + `EC.tickUI` (presentation). Engine bracketing covers only tickEngine; UI runs outside bracket.
- Pass A9: SIM write-guard improved — tag chaining uses '>' for nested contexts (e.g., tickEngine>dispatch:spinZero). Action wrappers only bracket when depth==0 (dispatch/tickEngine tags stay clean). Debug overlay prints sim-guard suspicious-write totals (top keys shown when ?inputdebug=1).
- Pass A10: Presentation reads begin migrating to EC.ENGINE.getSnapshot() (Phase 1: ui_hud.js, ui_controls.js, render_wells_update.js).
- Pass A4: Lobby no longer mutates `SIM.inLobby` directly; uses `EC.ACTIONS.setInLobby` via `EC.ENGINE.dispatch('setInLobby', ...)`.


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

## Recent passes (quick notes)
- **Pass A39:** Hotfix (UI/visual only): fixed ui_controls spin button cost label crash; forced energy/timer HUD anchors to auto (prevents stretched right-side shading); fully hid legacy ctrlPanel strip. No mechanics changes.
- **Pass A37:** Visual-only/UI-only: Psyche wedges upgraded to vivid, clearly animated "plasma depth" (adds a new animated layer + stronger motion; crisp wedge masks; hue identity preserved). HUD presentation swapped: traits are neutral pills; quirks are colored text by default and switch to colored pills when ACTIVE. Board UI layout repositioned using live well geometry (Energy + timer top-right of graphics square; portrait centered above orange; Spin-0 buttons moved onto the board with two-line labels + cost inside). Drawer text capacity increased.
- **Pass A36:** Visual-only: spill magnitude now shown via discrete traveling pulses (one per ~1 unit transferred) using per-tick Abs deltas + `spillFx.seq` to avoid double-count. Base stream widths are stable (not the main magnitude cue). Spin stream upgraded to a stronger corkscrew/helix; spin pulses are diamond/rotating and ride the helix. Psyche depth FX revised to preserve hue identity (no mute) and animate more visibly while keeping crisp wedge masks.
- **Pass A35:** Visual-only: spill FX triggers earlier + is stable (adds abs-activity telemetry alongside signed nets; renderer uses abs for intensity/thickness + adds hold timers to avoid flicker). Spill thickness scaling is more obvious. Psyche wedges gain subtle “well depth at rest” interior FX with crisp wedge masks.
- **Pass A34:** Visual-only: spin ~2× faster than A33; spill FX now visible (layer above wells); amount vs spin spill streams differentiated (spin corkscrew + diamond droplets; supports +/− spin).
- **Pass A33:** Visual-only: spin reads 3× faster; spill stream FX (ribbon + droplets) with overflow on outer lane and underflow on inner lane. Added runtime-only spill edge telemetry bucket (`SIM._spillFx`) for the renderer (no mechanics changes).
- **Pass A28:** Added one-time “Back-Alley Psychiatry (BAP)” intro cutscene overlay (`docs/ui_intro_cutscene.js`). Wired in `docs/index.html` (before `ui_app.js`) and invoked from `EC.initUI()` in `docs/ui_app.js`. Persisted via Firestore save doc `ui.seenIntroBAP` (schema v2) in `docs/systems_firebase.js`, with `sessionStorage` fallback key `ec_seenIntroBAP` when signed out.
- PLAN_CHAIN: `SIM.planStepIndex`, `SIM.planHoldSec`, `SIM._planHoldReqSec`, `SIM._planStepFlashT` (each step may define `holdSec`; default 10s)
- Pause flags: `SIM._uiPaused` (Log overlay), `SIM._hitStopT` (break hit-stop)
- Break FX: `SIM._breakFx`
- Timed plans: `SIM.zenTimeRemainingSec` (countdown reused for Zen / Tranquility / Transcendence)
- Debug: `SIM._quirkTimeline` (event-based), `SIM._quirkForceTotals` (optional)

## Player-facing well names (index 0..5)
Grit, Ego, Chill, Nerves, Focus, Pep

## UI quick map
- Top HUD (`docs/ui_hud.js`):
  - Line 1: patient name (bold) + **trait pills**
  - Line 2: **quirks as colored text** by default; **ACTIVE quirks become colored pills**; telegraph/active state via `EC.DISP.getRenderStates()`
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

**Pass A5 (selection cleanup)**
- `EC.SIM` no longer stores selection. All selection reads use `EC.UI_STATE.selectedWellIndex`.

**Pass A11 (snapshot reads phase 2)**
- Presentation modules now read state via `EC.ENGINE.getSnapshot()` in: `render_wells`, `render_wells_init`, `systems_input`, `ui_lobby`.
- Selection reads remain UI-only: `EC.UI_STATE.selectedWellIndex`.

**Pass A12 (pause via ACTIONS + snapshot glue)**
- Added `EC.ACTIONS.setUiPaused(flag)`; Log overlay pause now uses `EC.ENGINE.dispatch('setUiPaused', ...)` (fallback to ACTIONS). HUD no longer writes `SIM._uiPaused` directly.
- ui_app seeds SIM/UI pointers via `EC.ENGINE.getSnapshot()` (defensive fallback).

**Pass A14 (SIM write-guard HUD improvements)**
- When `?simguard=1` is enabled and suspicious root writes occur, the Debug panel always shows total count + top 5 keys (sorted).
- The guard also records up to 10 `{key, tag}` samples (tag includes the chained context) that are shown only when `?inputdebug=1`.


### Pass A15
- Startup/reset + MVP init are routed through ENGINE.dispatch/ACTIONS (resetRun, initMVP) so simguard brackets levelState/mvpWin/mvpLose/gameOver* writes during init/reset.

### Pass A16
- Patient session transitions are now routed through ENGINE.dispatch/ACTIONS wrappers (beginFromLobby/startPending/resumeFromLobby/openLobbyPause/backToLobby) so simguard does not flag patient-session root writes triggered from UI.

### Pass A21
- Treatment plan runtime moved into `docs/patients_plans.js` (systems_patients delegates; no behavior change).

### Pass A22
- Well rendering visual upgrade only: `docs/render_wells_fx_nebula.js` adds nebula/energy interior FX (displacement warp + wisps + subtle glow).
- Wired in `docs/index.html` (loaded before `render_wells_init.js`).
- `render_wells_init.js` applies the FX per well; `render_wells_update.js` drives it each frame using existing spin visuals.

### Pass A23
- Well rendering visual update only: reused the same wiring/API, but changed the interior FX aesthetic from “nebula/energy” to “water/fluid”.
- `docs/render_wells_fx_nebula.js` now implements:
  - Refraction/distortion using an RG normal-map style displacement texture (x/y gradients encoded separately).
  - Two faint caustics shimmer layers (SCREEN blend) with slow coherent drift/rotation.
  - A subtle specular gloss highlight (SCREEN blend) with gentle motion (no hard wheel rotation).
  - A thin fresnel rim highlight (SCREEN blend) kept restrained for readability.
- `docs/render_wells_update.js` slightly increased ripple visibility and further dampened the base “hard rotation” feel when FX is active (visual-only).

### Pass A24
- Well edge definition pass (render-only):
  - `docs/render_wells_update.js`: upgraded the always-on rim to a two-pass stroke (dark under-stroke + bright fresnel top rim) so the circular boundary reads crisply at normal play size without looking "selected".
  - `docs/render_wells_fx_nebula.js`: slightly increased rimSpr contribution (alpha base/gain) and made the rim texture band thinner/crisper via adjusted radial gradient stops.
- Selection/tutorial targeting rings remain distinct (selG still the strong outer ring).

### Pass A25
- Well edge definition + motion clarity (render-only):
  - `docs/render_wells_update.js`: upgraded baseline rim to a bevel-like 3-pass edge (outer dark definition + main bright fresnel + inner shadow stroke) while keeping `selG` clearly stronger.
  - Added a render-only spin speed multiplier for the swirl angle accumulator (≈5× visual speed at spin=100) to make direction cues more prominent.
  - Added a small activity floor and gated any outside-edge shading to high spins only by clamping most interior layer diameters to ≤2r at low/mid spins.
- Fixed spin neutrality (render-only):
  - `docs/render_wells_fx_nebula.js`: removed the forced CW direction at `dir===0` (no more `dir2=(dir===0)?1:dir`). At spin=0, motion remains "alive" via drift/oscillation only (no monotonic rotation accumulation).
  - Caustics/spec/rim sizing also gated so any beyond-edge shading is allowed only at high spins.

### Pass A26
- Well edge + motion cleanup (render-only):
  - `docs/render_wells_update.js`: removed baseline rim stroke drawing (`rimG` now clears only) so wells have **no solid outline**; selection/tutorial remains `selG`.
  - Disabled the legacy `waveHand` direction cue (hidden/non-renderable). Spin direction is now conveyed by the full interior motion.
  - Reduced the render-only spin speed multiplier from ~5× to ~2.5×.
- `docs/render_wells_fx_nebula.js` (water FX module): softened the fresnel rim texture/alpha so it reads as a natural band (not a ring), and tied displacement/caustics/spec rotation rates to `omega` so the entire interior participates in spin.

### Pass A27
- Spin (render-only):
  - `docs/render_wells_update.js`: increased `SPIN_VIS_SPEED_MULT` from **2.5 → 3.75** (+50%).
  - `docs/render_wells_update.js`: passed `omegaFx = omega * 1.5` into the water FX update so displacement/caustics/spec drift/rotation also runs +50% faster (visual-only; omega remains 0 when spin is 0).
- Circular containment (render-only):
  - `docs/render_wells_init.js`: added `maskSoft` per well using `TEX.circle` (soft-edge sprite mask) and set `interior.mask = maskSoft` by default; debug mask toggle still supported.
  - `docs/render_wells_update.js`: sizes `maskSoft` so its feathered edge lands at the true radius (≈ `r * 2.18`).
- Color-driven border (render-only):
  - `docs/render_wells_update.js`: re-tinted `edgeShade` toward the well hue (slight saturation + depth) and raised alpha slightly using the activity floor so the edge reads as a broad circular pigment band **without** a stroke/outline.

### Pass A27b
- Hotfix (render-only): `docs/render_wells_init.js` now keeps the soft sprite mask visible (`maskSoft.visible=true`) so SpriteMask masking works; restores well interiors rendering. (Sprite masks do not draw a visible ring in the scene.)

### Pass A28
- Added an initial one-time “Back-Alley Psychiatry (BAP)” intro cutscene module (`docs/ui_intro_cutscene.js`) with Skip + tap-anywhere skip.
- Wired in `docs/ui_app.js` (init calls `EC.UI_INTRO.maybeAutoPlay(ctx)`) and persisted via Firestore `ui.seenIntroBAP` with sessionStorage fallback when signed out.

### Pass A29
- Replaced the A28 intro with a cinematic **15.0s** fullscreen plate timeline using 5 provided plates in `docs/assets/intro_bap/`.
- All words are DOM/CSS overlays (no baked text): scene captions + neon sign gag + PRINCESS name tag.
- New persistence key: `ui.seenIntroBAP_v3` (schema v2) + sessionStorage `ec_seenIntroBAP_v3` so the new cutscene plays once even if the legacy intro was seen.
- Overlay blocks all input while visible; Skip button + tap/click anywhere to skip; no pop-in (preload gate).

### Pass A29b
- Hotfix: corrected intro overlay opacity so it stays visible for the full cutscene duration and only fades out in the final ~250ms.

### Pass A30
- Updated BAP intro cutscene to a cinematic **30.0s** timeline (plates A–E), with slower readable dialogue beats and refined scene dwell times.
- Removed all DOM neon sign + PRINCESS nametag overlays; storefront sign text and Princess dog tag are now baked into the plate art (no DOM lettering for sign/tag).
- Intro now launches the Tutorial immediately when it ends naturally OR is skipped (only when the cutscene actually played); ensures lobby is hidden (setInLobby(false)) before starting tutorial.
- Updated intro plate assets: replaced `plate_c.png` (Psychiatry sign), `plate_d.png` (PAWN + inventor), and `plate_e.png` (Princess tag) in `docs/assets/intro_bap/`.

### Pass A31
- Cutscene framing + pacing polish (intro BAP):
  - `docs/ui_intro_cutscene.js`: updated to a **31.0s** 6-shot timeline A→B→C0(blank)→D→C1(changed)→E, with standard ~310ms crossfades and a snappier ~130ms D→C1 reveal.
  - Captions rewritten per spec; removed the special helmet/label styling and made all captions consistent scrim text.
  - Fixed the ‘starts zoomed-in’ issue by removing the negative plate inset enlargement and switching plate images to `object-fit: contain` (full fit view at shot start); added a dark stage gradient so letterboxing looks intentional on tall phones.
  - Motion retuned so every shot starts at scale 1.00 and only some shots push in (A pushes in only in the second half).
  - Added the original Plate C as `docs/assets/intro_bap/plate_c_blank.png` and preloaded/played both C variants.
- Persistence + tutorial handoff unchanged (`ui.seenIntroBAP_v3` schema v2 + `sessionStorage['ec_seenIntroBAP_v3']`; tutorial auto-start only when cutscene actually played).

## Pass A32 — Intro BAP: auto-advance + tap override

**Goal:** Make the intro cutscene advance automatically per-shot but allow tap-anywhere to advance sooner (Skip still ends), retune A/B beats, extend C0/D/C1/E durations, and add a stronger sign focus move on C1.

**Files changed**
- UPDATED: `docs/ui_intro_cutscene.js`
  - Replaced the prior global timeline with a shot state machine:
    - auto-advance when the current shot’s max duration elapses
    - tap/click anywhere advances immediately to the next shot
    - `isAdvancing` lock prevents double-firing during crossfades
  - Plate A: holds wide framing for 4.0s on line 1, then swaps to line 2 and begins a deliberate push/pan toward the helmet.
  - Plate B: strict no-zoom camera; caption beats: Guaranteed (5.0s) → Probably (1.5s) → Most likely (1.5s) → Hopefully (1.5s).
  - Updated shot durations: C0(blank)=7s, D=6s, C1(changed)=7s, E=7s.
  - Plate C1: more aggressive pan/zoom to the upper-right sign.

**Non-changes (guardrails honored)**
- Persistence scheme unchanged: runtime `EC.UI_STATE._seenIntroBAP_v3`, Firestore `ui.seenIntroBAP_v3` (schema v2), session fallback `sessionStorage['ec_seenIntroBAP_v3']`.
- Tutorial handoff unchanged: tutorial auto-start occurs only when cutscene actually played and then ended/skipped.
- No DOM neon sign lettering or DOM Princess nametag lettering (baked art remains). Captions remain DOM.

## Pass A38 — UI polish: timer fit + 2-line spin buttons + plan text

**Goal:** Fix timer placement under Energy, enforce strict 2-line Spin button labels, align buttons to the green well bottom, reclaim bottom drawer space, and reformat Treatment Plan text for readability (≤ only).

**Files changed**
- UPDATED: `docs/ui_controls.js`
  - Timer HUD placement: now anchors below Energy with fallback alignment (left-align if fits, else right-align, else center).
  - Spin overlay buttons: strict 2-line template (`0 Spin` / `Cost X`, `0 Pair Spin` / `Cost X`), no extra lines; legacy cost spans no longer updated.
  - Button vertical anchor: uses the green well’s true radius (no downward drift).
  - Treatment Plan text: renders structured "Treatment Step x/y:" header + up to 3 rows of constraints (≤ only) with colored well names; next step on right or "Treatment complete".
- UPDATED: `docs/index.html`
  - Added `.btnTwoLine` styles for the new button templates.
  - Collapsed `#ctrlPanel` visuals so the bottom panel doesn’t reserve the old empty strip.
  - Added plan text styling (`.tpHdr`, `.tpRow`) and colored well-name classes (`.goalRed`…`goalOrange`).
  - Reduced drawer goal line clamps to allow up to 4 lines per side without aggressive truncation.

**Non-changes (guardrails honored)**
- No mechanics/balance changes.
- No new files; no ES modules; load order unchanged.

## Pass A39 — Hotfix: spin cost crash + HUD anchors + ctrl strip hide

**Goal:** Fix a boot-time crash from undefined spin cost label variables, prevent right-side HUD stretching (top+bottom anchors), and fully hide the legacy bottom control strip.

**Files changed**
- UPDATED: `docs/ui_controls.js`
  - Spin overlay buttons no longer reference undefined cost vars; show `Cost —` when no selection.
  - Energy/Timer HUD: forced `right/bottom` anchors to `auto` when geometry-positioned to prevent stretching.
  - Buttons enforced as strict 2-line templates.
- UPDATED: `docs/index.html`
  - Fully hid `#ctrlPanel` / `#ctrlRow` so the drawer doesn’t reserve an empty band.

## Pass A40 — Psyche mini-wells + plan text fix

**Goal:** Make psyche wedges feel like "mini wells" (true well interior plasma stack) while keeping crisp wedge edges; rework Treatment Plan bottom-panel formatting for correctness + clarity with safe fallbacks.

**Files changed**
- UPDATED: `docs/render_wells_init.js`
  - Added helper to build a well interior stack for psyche FX reuse.
- UPDATED: `docs/render_wells_update.js`
  - Added helper updater so psyche interiors animate using the same math/FX pipeline as wells.
- UPDATED: `docs/render_wells.js`
  - Psyche FX wedges now reuse the well interior stack and are clipped by crisp annular wedge masks.
- UPDATED: `docs/ui_controls.js`
  - Treatment plan text: correctness-first formatter with grouping (e.g., "All Hues under 100") and safe fallback to the original step text when unknown.

## Pass A40b — Hotfix: psyche FX boot crash

**Goal:** Fix a start-up crash in psyche FX creation (`cx` undefined).

**Files changed**
- UPDATED: `docs/render_wells.js`
  - Fixed psyche FX creation to use local psyche space (0,0) instead of undefined `cx/cy`.
  - Corrected palette reference (`PSYCHE_COLORS`) and added local `hues` definition.
