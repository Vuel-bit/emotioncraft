Validation:
- Boot 0 console errors.
- Intake-complete patient -> Start shows plan choice modal and stays open.
- Finish Intake -> back to lobby shows Intake Complete modal once.
- Bottom drawer goal/next formatting correct for PLAN_CHAIN.
- Top bar quirk pills show and pulse.
- No-energy swipe plays error sound.
- Set Pair cost identical either side.
## Chunk 3B
- Total psyche cap system removed (no warn visuals, no total break trigger; traits total-cap deprecated).
- Center core is now treatment hold progress ring (yellow) + completion flash (SIM._planStepFlashT).
- Jam break relief/penalty updated; both AMOUNT_HIGH_JAM and SPIN_MAX_JAM apply +100 to the two lowest psyche hues.
- Break modal overlay added (docs/index.html #breakOverlay) and wired via SIM._breakModal + SIM._breakPaused.

## Hotfix (post Chunk 3B)
- FIX: _setBreakModal ReferenceError (systems_breaks.js brace/scope).
- FIX: Break snapshots now include amount + consistent keys {a,s,psy}; modal “Wells adjusted” populates.
- FIX: #breakOverlay moved inside <body>; index.html closing tags corrected.
- FIX: MOD.updateBreakModal() called once per HUD render (removed from tierColor helper).

## Chunk 3B (Part A)
- Drawer layout: #goalLine flexes and #objectiveSummary constrained so “Next step” stays on-screen.
- PLAN_CHAIN: canonical hold rule (10s for all non-SPIN_ZERO steps), hold accumulates only while satisfied, no extra post-hold delay; brief flash then immediate step advance.
- Center core: added countdown number during treatment hold; ring timing matches canonical hold.
- Zen timer: standardized to 10:00 via T.ZEN_TIME_LIMIT_SEC; added top-right HUD pill (#zenTimerHud).
- Lobby: fixed broken hideZenCongrats() that could interfere with intake congrats; intake modal copy now: “{Name} is no longer an intake patient.”
- HTML: fixed missing closing </div> for #breakOverlay.

## Chunk 3B (Part B)
- Top HUD patient header: #patientInfo now renders a 2-line structure (Name+Traits line 1, Quirks line 2). Quirk words glow/pulse when telegraphing/active.
- Quirk scheduling: enforce global spacing using T.DISP_MIN_GAP_SEC via _lastScheduledFireAt (at telegraph creation) and _lastFiredAt (at actual fire time).
- Debug panel: now prints only raw quirk force totals by default (SIM._quirkForceTotals). Input instrumentation is hidden unless URL has ?inputdebug=1; Copy Input Log button also hidden unless enabled.
