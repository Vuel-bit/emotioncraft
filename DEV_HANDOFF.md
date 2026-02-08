# Emotioncraft — Current Build Handoff (v0_2_23_halo_invert_noghost)

Date: 2026-02-07  
Status: **Last known-good visual + disposition build**. Use this as the safe base for any new work.

---

## What this build is
- **6 Wells** around a center **Psyche wheel** (6 donut wedges with area-fill mapping).
- **Energy** economy (start 10, cap 200, regen +1/sec) gates Apply actions.
- **Opposite push** (one-time, no cascade): applying impulse on a well pushes its opposite well’s spin by -25% of impulseSim.
- **Spillover / equalization** at bounds for Amount and Spin (adjacent neighbors on the ring), including jam/break detection support.
- **Mental Breaks system**: multiple break triggers with pressure relief + penalties; rapid-break “game over” guard exists (see systems_breaks.js).
- **Patients + Lobby**: player selects a patient and starts a session (hardcoded test patients), with objectives (including multi-step Zen).
- **Dispositions**: 4 types (Affinity / Aversion / Tendency / Damping) that target wells with a telegraph → active wave; random timing model is in place.

---

## Authoritative state + core ranges
State lives under `EC.SIM`:
- `wellsA[6]`: Amount, clamped **25..100**
- `wellsS[6]`: Spin, clamped **-100..100**
- `psyP[6]`: Psyche per hue, clamped **0..500**
- Total Psyche display uses **TOTAL_CAP = 2000** (center-core indicator / break logic uses this cap)

Other key state:
- `EC.DISP` handles dispositions (telegraph + active).
- `EC.BREAKS` / `systems_breaks.js` handles break triggers + penalties.
- Patient/lobby flow in `systems_patients.js` + `ui_lobby.js`.

---

## Energy + Apply cost (current rules)
- Energy: start **10**, cap **200**, regen **+1.0/sec**.
- Apply cost uses **cost-flux** with a *zero rule for cost only*:
  - if `S == 0`, treat as `+1` for cost math (simulation flux still uses true 0).
  - `impulseCost = Δ(A * spinCost)`
  - `energyCost = abs(impulseCost) / 100`

---

## Dispositions (current UX + visuals)
- Telegraph uses a **warning halo** (red distinct from selection highlight).
- Active uses a **whitish outline** + a **neon ring-fill meter**:
  - Fill start/direction varies by type (see systems_dispositions.js).
  - Gradient inversion for AVERSION + DAMPING (top green / bottom red) is enabled in this build.
- **Ghost previews removed**: no pre-Apply ghost arrows/amount halos from sliders.

Note: This build currently assumes **one disposition at a time** (no concurrency). A later attempt to add concurrency regressed/errored.

---

## Known-good build + known-bad attempt
- ✅ **Use:** `v0_2_23_halo_invert_noghost` (this build) as the base.
- ❌ **Do not use:** `v0_2_24_disp_concurrency` attempt — it threw `ReferenceError: Cannot access 'dispType' before initialization` in `render_wells_update.js` and also regressed halo visuals.

---

## Next planned work (after this handoff)
1) Re-attempt **disposition concurrency** (multiple events at once on different wells) **starting from this build**, with strict “do not touch halo semantics/appearance” constraints.
2) After concurrency is stable, revisit “halo color represents current pressure” semantics (separate, tightly scoped pass).
3) Patient progression / queue / accept-skip loop (lobby meta-loop), once disposition system is stable.

