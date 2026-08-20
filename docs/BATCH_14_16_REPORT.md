# BATCH 14–16 REPORT — Offline, the Calendar, and the Road

**Phases:** 14 (Offline Progression) · 15 (Advanced Traffic / Events / Weather / Day-Night) · 16 (Asset Pipeline v2)
**Date:** 2026-08-20
**Result:** ✅ P14 PASS · ✅ P15 PASS · 🟡 P16 PARTIAL (by capability, deliberately — §3)
**Branches:** `phase/14-offline` → `phase/15-events-weather` → `phase/16-asset-v2`, stacked on `phase/consolidation-art`

---

## 1. What the batch was for

P14 made leaving and returning a real mechanic; P15 made two days stop being
the same day; P16 was the roadmap owner for finishing the world's art with
whatever source material actually existed. The measurable version:

|                          | Before the batch                           | After                                                                                             |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Persistence              | test-hook only — no boot load, no autosave | boot-load, 30 s autosave, lifecycle writes, save **v8 → v10** with fixtures                       |
| Returning after 8 h away | nothing                                    | a priced, explained, claim-once report with four tested clock defences                            |
| Second visit bandwidth   | full re-download                           | **1.3 KB** over the network (SW precache, measured)                                               |
| Events / weather / night | none                                       | 6 events + 4 weathers on a deterministic calendar; a full lighting pass; +1–2 draw calls measured |
| Vehicle archetypes       | 4                                          | **10** (six behaviour-complete, spawn-gated on art)                                               |
| The road                 | procedural polygon                         | the delivered bake, 9/9 checks, at every stage                                                    |
| Tests                    | 1 374                                      | **1 474** unit+integration · E2E 80+6 · goldens **18** · determinism 61                           |
| World-hash pin           | 8th renewal                                | 9th (calendar entered the digest)                                                                 |

## 2. The findings that were worth more than the features

1. **The offline report lied at low occupancy** — "parking limited you" at 9%
   utilisation. Caught by looking at the screen; fixed with a significance
   threshold and an honest `demand` limiter (ECONOMY_DESIGN §10 amended).
2. **The goldens had been photographing 00:30 for thirteen phases.** Invisible
   until the sky could paint; the noon pin then turned out to be a _boot_ pin
   (600 ticks = one game hour), faithfully producing 18:54 dusk in
   `stage1-serving`. `frozenUrl` now solves the start hour backwards.
3. **The economy was nearly re-priced twice by features that arrived after its
   calibration.** Weather live from Stage 1 pushed stage-2 arrival to 22.1 min
   of a 22 ceiling; the left turn live from Stage 1 starved delivered demand
   23.7 → 14.7/min. Both effects belong to Stage 4 by the GDD's own §9.6
   scoping — and the measurements are now in the config comments.
4. **A held left-turner deadlocked the exit merge for a measured 18 minutes**
   — a car committed to leaving the lane is not oncoming traffic. And the
   first "deadlock" before it was an ADR-014-illegal fixture world, which is
   its own lesson.
5. **`setMask` does nothing on this Phaser 4 WebGL build** (and runtime
   CanvasTextures render nothing). Two render-layer plans died on measurement
   and were rebuilt on `Graphics`; the ground bake's diamond turns out to be
   bounded by its own alpha, not by the mask that has been inert all along.
6. **CI's absolute perf budget caught a real architecture mistake** — charging
   every stage the festival's ×3 thinning headroom (5.32 ms of 5). The
   stage-aware envelope restored stages 1–3 to the pre-P15 candidate stream.

## 3. Why P16 is PARTIAL, and what that means

The agent cannot generate images (Phase 4's finding, unchanged). P16 therefore
did everything that had source material — the user-delivered road slice, end to
end — and re-verified the whole pool (173 assets, 0 failing) plus the
four-stage consistency judgement in a real browser. The ~290-sprite Stage 3/4
production plan and the regeneration list (which _grew_ by the six new
archetypes' art) remain named debt with owners, not silent gaps. Production
screens hold machine-zero placeholders throughout.

## 4. Verification at the batch head (exact numbers)

Recorded per phase in PHASE_14/15/16_REPORT §3–4 with run IDs; the final-SHA CI
and preview evidence for P16 is in its §4. Headlines: lint/format/typecheck/
depcruise/knip clean · coverage floors met (branches 85.4% global) ·
determinism 61/61 · balance 5/5 · bench 21/21 on the re-recorded `phase15`
baseline (§11 discipline, old numbers retained) · E2E 80+6 · goldens 18/18
container-regenerated and host-byte-identical · `pnpm audit` clean · SW
precache 30 entries.

## 5. Open decisions for the user (the real ones)

1. **ADR-017 — WebGL gate** (inherited, untouched, still Proposed).
2. **Traffic density conflict #7 + road width + lane-change activation + the
   four-lane look of the delivered road art** — one entangled decision.
3. **Game start hour** — the world boots at midnight; now that night paints,
   the first session opens dark and thin against §19's first-car-in-8 s target.
   One config line; renews hashes and seed fixtures.
4. **Absolute sim-perf backstop resize (5 → 8 ms)** — the Phase-2 reference now
   flips on CI runner lottery after P15's §11-recorded cost (PHASE_16_REPORT
   §7.4 has the numbers). Proposed with the old value retained; not applied.
5. **Stage 2–4 income calibration** — unchanged (`CALIBRATED_STAGES=[1]`),
   protected this batch by the two §9.6 scoping fixes.
6. **Road slice provenance** — confirm tool/licence (LICENSES appendix).

## 6. Human playtest

**NOT RUN.** No sessions occurred; the protocol and template stand ready.
Nothing in this batch's browser work is player feedback.
