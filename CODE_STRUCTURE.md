# Emotioncraft — Code Structure

## File map (who owns what)

- **index.html** — Script-tag load order + global CSS + HUD DOM shell.
- **ec_bootstrap.js** — Cross-frame state containers (EC.UI_STATE / EC.RENDER_STATE), debug helpers (EC.assert), startup checks, build stamp.
- **core_const.js** — Canonical contracts: hue indices/names, opposite mapping, well count.
- **core_tuning.js** — All tunables (mechanics feel, UI/layout numbers, render constants).
- **core_model.js** — Level definitions + SIM init/reset and per-level data wiring.
- **core_mechanics.js** — Simulation tick stages + call order (dispositions → spillover → clamp → well→psyche drive, etc.).
- **systems_dispositions.js** — Dispositions system (`EC.DISP`): initLevel/update + HUD state (no direct psyche edits).
- **render_wells_init.js** — Creates PIXI objects for wells/labels + ensure views exist.
- **render_wells_update.js** — Per-frame updates of existing well visuals/labels (no creation).
- **render_wells.js** — Thin orchestrator calling init/update (keeps external render entry points stable).
- **ui_controls.js** — Bottom control panel: selection display, sliders/targets, Zero Pair targeting, Apply, energy/cost display.
- **ui_hud.js** — Non-control UI: left info panel, disposition messages, objective text/summary.
- **ui_app.js** — Thin UI orchestrator: init + per-frame render dispatch to UI modules.
- **main.js** — Bootstrap: PIXI app setup, binds tick loop, wires resize.

## Where to put new work

- **New mechanics/system** → add a new `systems_*.js` module under `window.EC`.
- **Sim ordering changes** → only in `core_mechanics.js` (tick stage wrappers + call order).
- **UI changes** → `ui_controls.js` (controls) or `ui_hud.js` (HUD/panels).
- **Render changes** → `render_wells_init.js` (creation/layout) or `render_wells_update.js` (per-frame updates).
- **Numeric tuning** → only in `core_tuning.js`.
- **Shared indices/names/mappings** → only in `core_const.js`.
- **Persistent UI state** → only in `EC.UI_STATE` (avoid fragile locals across frames).

## Do NOT do this

- Don’t add ES modules or a bundler.
- Don’t reintroduce a monolithic “everything in main.js/ui_app.js” file.
- Don’t scatter tunables (keep them in `core_tuning.js`).
- Don’t hard-code hue indices/opposites in random files (use `core_const.js`).
