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
