# DEV_CHECKLIST (per-build smoke test)

1) Load game → no console errors.
2) Level switch: Level 1 ↔ Level 3 (use level selector) → no errors.
3) Reset spam: press Reset 10x quickly → no errors, no missing wells/labels.
4) Controls: select a well, change spin target, Apply → energy/cost updates.
5) Zero Pair: click Zero Pair (targets only), then Apply → both targets set to 0.
6) Dispositions: Level 3 shows incoming/active disposition text during waves.
7) Spillover overshoot: during Spin ↑ wave at cap (S=100), confirm neighbor spins rise.
8) Amount spill: push amount above/below bounds and confirm neighbor amount spill/deficit.
9) Narrow window: half-browser width → nothing off-screen; no overlaps with wells/psyche.
10) Build stamp: console shows `[EC] Build: <BUILD_ID>` and matches zip/folder name.


## Known-bad builds
- v0_2_24_disp_concurrency: ReferenceError in render_wells_update.js; do not use as base.
