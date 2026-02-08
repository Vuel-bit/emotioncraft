## v0_2_43_boardfirst_safezone_ui_hotfix

**Date:** 2026-02-07

**Summary**
- UI-only: enforced strict board no-overlap with top/bottom bars by reserving the bottom drawer’s actual on-screen footprint (uses `drawerRect.top`).
- UI-only: bottom bar now updates only Goal line + Energy under Spin, aligning UI updates with the compact layout.
- UI-only: improved in-well A/S readability (darker backing plate; more saturated +/- sign colors).
- No gameplay/mechanics changes.

**Files touched**
- render_wells.js (safe-zone bottom reservation)
- ui_controls.js (goal + energy compact updates)
- render_wells_update.js (stronger A/S backing plate)
- core_tuning.js (more saturated spin sign colors)
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_42_boardfirst_hotfix_boot_goalshade

**Date:** 2026-02-07

**Summary**
- Hotfix: fixed boot crash in `render_wells_update.js` (undefined `wellView` reference) by using the in-scope per-well `view` reference and guarding missing views (warn only under `EC.DEBUG`).
- Hotfix: restored psyche goal shading overlay (target/range bands) using existing `SIM.goalViz.perHue`, keeping gold satisfied rings + wedge numbers intact.
- No gameplay/mechanics changes.

**Files touched**
- render_wells_update.js (fix undefined `wellView` reference)
- render_wells.js (restore goal shading overlay layer)
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_41_boardfirst_space_reclaim

**Date:** 2026-02-07

**Summary**
- UI-only: remove clutter + reclaim space for board.
  - Removed the upper-left objective/text panel from the main play screen.
  - Consolidated Reset / Level / Debug into the top notification bar; removed the extra top row.
  - Compressed bottom controls panel (removed redundant text; reduced padding/margins).
  - Increased MVP well radii substantially while maintaining no-overlap.
  - Added a subtle dark backing plate behind the in-well A/S readout for legibility.
- No gameplay/mechanics changes.

**Files touched**
- index.html (topbar consolidation; hide objective panel; drawer compression styles)
- ui_hud.js (notification/patient content + topbar positioning)
- render_wells.js (board-first layout sizing; psyche wedge numbers + satisfied gold ring)
- render_wells_init.js, render_wells_update.js (A/S backing plate for readability)
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_40_boardfirst_portrait_ui

**Date:** 2026-02-07

**Summary**
- UI-only: board-first portrait layout pass.
  - Added top notification bar for dispositions/short system messages.
  - Moved patient + step to top-left within the notification area.
  - Board sizing now prioritizes screen width (no horizontal reservation for side panels).
- UI-only: psyche wedges now show live value numbers; satisfied wedges render a bright gold ring (uses existing goalViz logic).
- UI-only: wells now show in-well A/S readout under their name; spin is sign-colored.
- No gameplay/mechanics changes.

---

## v0_2_39_inkpool_crestline_aura_dirfix

**Date:** 2026-02-07

**Summary**
- Visual-only: wave indicator is now a dark ink-like crest line (not a white cloud), stays fully inside the well (size/offset clamped) and remains visible at low spins.
- Visual-only: ripple "mist/aura" rotation no longer contradicts spin direction (both ripple layers follow spin sign; wobble-only at rest).
- Visual-only: black interior line/streak contrast has a clearer baseline at spin=0 (still inert, optional tiny drift), while still darkening with higher |spin|.
- No gameplay/mechanics changes.

**Files touched**
- render_wells_init.js (wave-hand blend mode is NORMAL for dark crest line)
- render_wells_update.js (dark crest line visuals + low-spin floor + aura direction fix + rest readability)
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_37_inkpool_hand_nosquares

**Date:** 2026-02-07

**Summary**
- Visual-only: remove square artifact sprites by eliminating tiling sprites in the well interior; use circular-clipped textures only.
- Visual-only: direction cue is now a single dominant "wave hand" that sweeps CW/CCW with spin sign (no confusing spirals).
- Visual-only: motion speed maps to actual |spin| with a readable curve (8 looks mild, 90 looks intense).
- Visual-only: deepen pigment saturation and reduce chalky overlays (less pastel/muted).
- No gameplay/mechanics changes.

**Files touched**
- render_wells_init.js (switch interior to circular sprites; add circular-clipped ink textures; add wave-hand sprite)
- render_wells_update.js (readable speed mapping; wave-hand update; reduce spiral dominance; deepen color)
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_36_inkpool_ripples_overboard_hotfix

**Date:** 2026-02-07

**Summary**
- Hotfix: fix crash on load (TDZ) by defining spin-derived vars (including magEff) before ripple layer uses them.
- Visual-only: upgrade wells toward a deep, rich "ink pool" look with living ripples even at spin=0.
- Visual-only: stronger flow readability via dragged ink streak turbulence + a bold direction cue.
- Visual-only: reduce muted/filtered appearance by keeping pigment dominant and tinting highlights toward the hue.
- No gameplay/mechanics changes.

**Files touched**
- render_wells_init.js
- render_wells_update.js
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_34_liquid_wells_tracers_bloomfix

**Date:** 2026-02-07

**Summary**
- Visual-only: add rotating curved tracer arcs inside wells so CW/CCW direction is readable at a glance (no arrow glyphs).
- Visual-only: flip radial "bloom vs tighten" feel so +spin (CW) blooms outward and -spin (CCW) tightens inward.
- Visual-only: subtle rim specular arc + inner edge shading to reduce flat/"blob" feel while keeping a perfect circle.

**Files touched**
- render_wells_init.js (added tracer + inner-edge textures; created tracer/edge sprites per well)
- render_wells_update.js (drive tracers by spin; strengthened bloom/tighten mapping; add subtle rim specular)

---

## v0_2_33_liquid_wells_swirl_visible
Date: 2026-02-07

Summary:
- Visual-only: make liquid wells unmistakably different from the legacy flat blob by adding a spiral swirl texture and dual-layer motion.
- Direction readability: interior rotation shows CW/CCW at a glance (no arrow glyphs).
- Magnitude readability: |spin| increases rotation speed and tightens the swirl.
- No gameplay/mechanics changes.

Files touched:
- render_wells_init.js, render_wells_update.js
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_32_liquid_wells_maskless_circular_textures
Date: 2026-02-07

Summary:
- Fix (visual): avoid default PIXI masking for the liquid interior (mobile-safe). Highlight + marbling textures are now circular (alpha-clipped) so the interior renders correctly without masking.
- Fix (visual): mask alpha is no longer fully 0 (0.001) and remains renderable for debug toggling.
- Debug-only: init log + throttled 1Hz liquid inspector under EC.DEBUG; added legacy baseFill toggle.
- No gameplay/mechanics changes.

Files touched:
- render_wells_init.js, render_wells_update.js, render_wells.js
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_31_liquid_wells_selection_mask_fix
Date: 2026-02-07

Summary:
- Fix (visual): MVP well interior masks kept renderable on some platforms (visible=true, alpha=0, renderable=true) so pigment/marble/highlight layers can draw.
- Fix (input): MVP wells tappable again via stable hitArea synced to radius.

Files touched:
- render_wells_init.js, render_wells_update.js

---

## v0_2_30_liquid_wells_mobilefix
Date: 2026-02-07

Summary:
- Visual-only well pass: upgraded the 6 wells to a liquid pigment interior with organic swirl motion.
  Spin direction and magnitude are readable via the liquid rotation (no arrow glyphs).
  Crisp circular rim (separate from outer halo) keeps wells reading as containers; selection uses rim/outer ring emphasis.
  Mobile/WebGL safety: removed dark full-field shading and clamped marbling tint so interiors stay vivid (no black orbs).
- Fix: mobile/WebGL safety — marbling no longer uses dark MULTIPLY-style full-field shading; tint is clamped above near-black.
- Debug: under EC.DEBUG, `EC.DEBUG_LIQUID_LAYERS` toggles pigment/marbles/highlight/coreGlow for diagnosis.
- Presentation-only theme pass: renamed the 6 wells/hues across UI/render/objective text.
  Blue=Chill, Orange=Pep, Red=Grit, Green=Nerves, Yellow=Focus, Purple=Ego.
- Opposite pairs unchanged (Red↔Green, Yellow↔Purple, Blue↔Orange). No mechanics changes.

Files touched:
- render_wells_init.js, render_wells_update.js
- BUILD_INFO.txt, CHANGELOG.txt, PROJECT_INDEX.md

---

## v0_2_13_zen_objectives_fix
Date: 2026-02-06

Summary:
- Fix Zen patient objective wiring so Zen sessions have valid goals (no "No goals") and show Step 1/3 → 2/3 → 3/3 with holds.
- Restore upper-left numeric goal panel for Zen via live per-step goal-viz updates.

Files touched:
- systems_patients.js
- core_mechanics.js
- ui_hud.js
- BUILD_INFO.txt / ec_bootstrap.js

---

## v0_2_12_disp_random
Date: 2026-02-06

Summary:
- Patient-session dispositions now trigger randomly (mean 180s, min gap 30s) with telegraph warnings only.
- Patient sessions provide a disposition pool; 3-disposition patient chooses randomly per event.

Files touched:
- core_tuning.js
- systems_dispositions.js
- systems_patients.js
- BUILD_INFO.txt / ec_bootstrap.js

---

# PROJECT_INDEX

A running log of packaged builds.

## v0_2_27_disp_telegraph_timeslice_peakfix (2026-02-07)

Changes
- Dispositions: telegraph scheduling fixed so warning halos reliably appear (events are announced at fireAt - telegraphSeconds).
- Dispositions: continuous peakTime corrected to true argmax so the intensity peak maps to 180° (progress(peak)=0.5).
- Dispositions: painted halo is time-sliced (segments laid down using per-slice time→progress + time→intensity).
- Mental Break: clears slot telegraph bookkeeping (announced flags) so scheduling resumes cleanly.
- Debug: under EC.DEBUG, 1Hz throttled logs for telegraph count/targets and one active continuous instance sample.

Files touched
- systems_dispositions.js
- BUILD_INFO.txt / CHANGELOG.txt / PROJECT_INDEX.md

---

## v0_2_26_disp_painted_warped_halo (2026-02-07)
- Active disposition halo is now painted as accumulated segments (historical colors remain visible; head/glow reflects current pressure).
- Halo head motion is envelope-warped so peak intensity always occurs at 180° from the start (progress(peak)=0.5) while still completing exactly once by the end.
- Telegraph/warning halo visibility fixed (reliably shows during telegraph).

Files touched:
- systems_dispositions.js
- render_wells_update.js
- BUILD_INFO.txt / CHANGELOG.txt / PROJECT_INDEX.md

## v0_2_25_disp_pressure_color (2026-02-07)
- Disposition halo color now truthfully represents current pressure intensity over time (green→yellow→red), driven by the same intensity01 used for mechanics.
- Optional per-event discrete mode (25% chance) snaps halo colors and intensity between Low/Med/High/Med/Low phases.

Files touched:
- systems_dispositions.js
- render_wells_update.js
- BUILD_INFO.txt / CHANGELOG.txt / PROJECT_INDEX.md

## v0_2_21_bootfix (2026-02-06)
- Active disposition halo fill is now time-based and monotonic (fills once to full circle).
- Added a leading-edge head glow whose intensity follows a bell curve over time.

Files touched:
- systems_dispositions.js
- render_wells_update.js
- core_tuning.js

## v0_2_11_lobby_start_fix (2026-02-06)
- Fixed patient Start Session crash by adapting patient startRanges to match core_model expectations (wellsA/wellsS/psyP).
- Added debug-only patient definition validation to avoid cryptic undefined property errors.

## v0.2.0-chunk7 (2026-02-06)
- Added shared contracts (hue indices/names, opposite mapping) + standardized debug assertions.
- No gameplay/UI changes.

## v0.2.0-chunk8 (2026-02-06)
- Documentation + packaging/versioning conventions.
- Added BUILD_INFO.txt, DEV_CHECKLIST.md, PROJECT_INDEX.md.
- Centralized build stamp: `[EC] Build: v0.2.0-chunk8`.
- No gameplay/UI/render/tuning changes.

## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Completed Disposition types (Affinity/Aversion/Damping) in EC.DISP and added quick-test Levels 4–6.
- Set dispositions in Levels 3–6 to start at ~10s for fast validation.

Files (high level)
- systems_dispositions.js, core_model.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Completed Disposition types (Affinity/Aversion/Damping) in EC.DISP and added quick-test Levels 4–6.
- Set dispositions in Levels 3–6 to start at ~10s for fast validation.

Files (high level)
- systems_dispositions.js, core_model.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Completed Disposition types (Affinity/Aversion/Damping) in EC.DISP and added quick-test Levels 4–6.
- Set dispositions in Levels 3–6 to start at ~10s for fast validation.

Files (high level)
- systems_dispositions.js, core_model.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Completed Disposition types (Affinity/Aversion/Damping) and added quick-test Levels 4–6.
- Set dispositions in Levels 3–6 to start at ~10s for fast validation.

Files (high level)
- systems_dispositions.js, core_model.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Completed disposition types and added L4–L6 test levels (Chill target).

Files
- core_model.js, ec_bootstrap.js, systems_dispositions.js

## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Completed disposition set and added test Levels 4–6 (Zen variants).

Files (high level)
- core_model.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Added Levels 4-6 for Affinity/Aversion/Damping disposition testing on Chill (waves at ~10s).

Files
- core_model.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Completed Disposition types (Affinity/Aversion/Damping) and added Levels 4-6 for isolation testing.

Files (high level)
- core_model.js, systems_dispositions.js, ec_bootstrap.js, BUILD_INFO.txt


## v0_2_1_disp4types_levels3to6
Date: 2026-02-06

Summary
- Completed Disposition types (Affinity/Aversion/Damping) and added Levels 4–6 for isolated testing on Chill.
- Adjusted disposition wave start time to ~10s on Levels 3–6.

Files (high level)
- core_model.js, systems_dispositions.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_2_spillroute_outward
Date: 2026-02-06

Summary
- Spillover routing updated so spill propagates outward even when both adjacent neighbors are blocked.
- Prefer open side routing (100% to the unblocked neighbor); otherwise forced propagation via chained passing.

Files (high level)
- core_mechanics.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_3_mentalbreaks
Date: 2026-02-06
Summary:
- Added Mental Break framework (psyche bounds triggers) with disposition cancellation and HUD message.
Files touched:
- index.html, core_mechanics.js, core_tuning.js, systems_dispositions.js, ec_bootstrap.js
- NEW: systems_breaks.js

## v0_2_4_mentalbreaks_lose
Date: 2026-02-06

Summary
- Enforced lose condition: 4 breaks within any rolling 5-second window triggers "Mind Shattered".
- Game enters lose state and freezes until Reset; HUD/objective panel show reason.

Files (high level)
- systems_breaks.js, core_mechanics.js, core_model.js, ui_hud.js, ec_bootstrap.js, BUILD_INFO.txt


## v0_2_5_jam_breaks
Date: 2026-02-06

Summary
- Added well jam mental breaks triggered by unresolved spillover (amount/spin, high/low).
- Jam breaks cancel dispositions and apply relief + redirect only (no jam penalties yet).

Files (high level)
- core_mechanics.js, systems_breaks.js, core_tuning.js, ec_bootstrap.js, BUILD_INFO.txt


## v0_2_6_jam_breaks_sum
Date: 2026-02-06

Summary
- Jam detection now uses TOTAL unresolved overflow/underflow (sum) rather than max-per-well, so distributed underflow (e.g., all wells at min under Aversion) triggers AMOUNT_LOW_JAM correctly.

Files (high level)
- core_mechanics.js, core_tuning.js, ec_bootstrap.js, BUILD_INFO.txt


## v0_2_7_jam_eps_debug
Date: 2026-02-06

Summary
- Lowered jam sum epsilon so saturated-ring pressure triggers jam breaks reliably.
- Added debug-only spill Σ readout (A+/A-/S+/S-) to confirm sums during saturation.

Files (high level)
- core_tuning.js, core_mechanics.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_8_jam_penalties
Date: 2026-02-06

Summary
- Implemented penalties for jam-type mental breaks:
  - AMOUNT_HIGH_JAM / SPIN_MAX_JAM: +200 total psyche distributed randomly across hues.
  - AMOUNT_LOW_JAM / SPIN_MIN_JAM: subtract 100 from each of the top 2 psyche hues (after relief+redirect).
- Jam break UI "why" messages now include penalty summary.

Files (high level)
- systems_breaks.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_9_patient_lobby
Date: 2026-02-06

Summary
- Added Patient Lobby with 5 hardcoded test patients (traits + treatment type + disposition count).
- Added patient-session objectives: Weekly (2 focus hues) and Zen (3-step chain), with hold tracking.
- Sessions are started from lobby; simulation is frozen while lobby is open.

Files (high level)
- index.html, systems_patients.js, ui_lobby.js, ui_app.js, ui_hud.js, core_model.js, core_mechanics.js, ec_bootstrap.js, BUILD_INFO.txt

## v0_2_10_lobby_interactive
Date: 2026-02-06

Summary
- Fixed Patient Lobby wiring: correct DOM ids, row selection highlight, and Start Session behavior.
- Start Session now reliably launches the selected patient session and hides the lobby overlay.

Files (high level)
- ui_lobby.js, ec_bootstrap.js, BUILD_INFO.txt, CHANGELOG.txt

## v0_2_14_disp_slots_random_targets
Date: 2026-02-06

Summary
- Dispositions: slot-based random scheduling (N slots ⇒ ~N× event rate) with global min-gap and no overlap.
- Dispositions now target a random well each time; telegraph text shows the chosen target during the warning window.

Files (high level)
- systems_dispositions.js, core_tuning.js, ec_bootstrap.js, BUILD_INFO.txt, PROJECT_INDEX.md, CHANGELOG.txt

## v0_2_15_disp_ratefix
Date: 2026-02-06

Summary
- Fixed disposition frequency scaling: arrivals during telegraph/active are queued (size 1) instead of discarded.
- Per-slot exponential scheduling is now based on trigger time (not wave end), preserving correct long-run rates.
- Reduced global disposition safety gap so multi-slot patients fire proportionally more often.

Files (high level)
- systems_dispositions.js, core_tuning.js, ui_hud.js, ec_bootstrap.js, BUILD_INFO.txt, PROJECT_INDEX.md, CHANGELOG.txt

## v0_2_17_disp_lock_brightness
Date: 2026-02-06

Summary
- Dispositions: telegraph window increased to 10s (no countdown leakage).
- Added per-well disposition telegraph/active visuals (halo + intensity glow).
- Render reads clean render-state getters (EC.DISP.getRenderStates / getRenderState) instead of touching internal disposition state.

Files (high level)
- core_tuning.js, systems_dispositions.js, render_wells_init.js, render_wells_update.js, ec_bootstrap.js, BUILD_INFO.txt, PROJECT_INDEX.md, CHANGELOG.txt

## v0_2_17_disp_lock_brightness
Date: 2026-02-06
Summary:
- Fix telegraph/target mismatch by locking telegraphed event target.
- Add obvious target-well brightness modulation during active dispositions.
Files touched:
- systems_dispositions.js
- render_wells_update.js
- core_tuning.js


## v0_2_18_disp_halo_meter
Date: 2026-02-06

Summary:
- Disposition FX: halo-only active intensity meter (monotonic arc), distinct warning color.
- Fix: mental break cancellation no longer stops disposition scheduling.

Files touched (high level):
- systems_dispositions.js
- render_wells_update.js
- core_tuning.js
- ec_bootstrap.js


## v0_2_18_disp_halo_meter
Date: 2026-02-06

Summary:
- Disposition FX: halo-only indicator; active phase uses whitish outline + monotonic arc fill meter (max 50% ring).
- Telegraph halo uses distinct magenta-red warning tone.
- Fix: mental breaks cancel current disposition without disabling future disposition scheduling.

Files touched:
- core_tuning.js
- systems_dispositions.js
- render_wells_update.js
- ec_bootstrap.js

## v0_2_19_disp_halo_gradient
Date: 2026-02-06
Summary:
- Visual-only refinement: active disposition halo uses neon tension-gradient segments (no full-white ring).
- Subtle ACTIVE-only well brightening restored as secondary cue.
Files touched:
- core_tuning.js
- render_wells_update.js
- BUILD_INFO.txt
- PROJECT_INDEX.md

## v0_2_21_bootfix
Date: 2026-02-06

Summary:
- Fix: ec_bootstrap.js syntax error ("Unexpected token const") that prevented startup.
- Add: boot sanity log line "[EC] Boot OK: build <id>".

Files touched:
- ec_bootstrap.js
- BUILD_INFO.txt
- CHANGELOG.txt
- PROJECT_INDEX.md

## v0_2_22_halo_saturation_fix
Date: 2026-02-06

Summary:
- Fix: disposition halo fill no longer uses additive blend mode; neon gradient stays saturated throughout fill.
- Tuning: halo fill alpha set to 1.0 and gradient shaping (green hold + gamma) to keep bottom green dominant and top red vivid.

Files touched:
- render_wells_init.js
- render_wells_update.js
- core_tuning.js
- ec_bootstrap.js
- BUILD_INFO.txt
- CHANGELOG.txt
- PROJECT_INDEX.md

## v0_2_23_halo_invert_noghost
Date: 2026-02-06

Summary:
- Visual: invert disposition halo gradient for AVERSION + DAMPING (top=green, bottom=red).
- UI: remove pre-Apply ghost overlays/arrows on wells (selection highlight remains).

Files touched:
- render_wells_update.js
- ec_bootstrap.js
- BUILD_INFO.txt
- CHANGELOG.txt
- PROJECT_INDEX.md

---

## v0_2_24_disp_concurrency (FAILED / do not use)
Date: 2026-02-06

Summary:
- Attempted to add concurrent dispositions.
- Build crashed with `ReferenceError: Cannot access 'dispType' before initialization` in render_wells_update.js and regressed halo visuals.

Action:
- Revert base to v0_2_23_halo_invert_noghost before retrying concurrency.

- v0.2.34 — Liquid Wells: tracer arcs + corrected bloom/contract visual mapping (+spin blooms, -spin tightens)
