# UI CONSOLIDATION REPORT — the pre-P19 product pass

> 2026-08-21 → 2026-08-22, `phase/consolidation-ui`. The directive: make the
> current game visually premium, screen-filling, playable without dead
> states, understandable without debug tooling — with every branch first
> consolidated onto main and everything browser-verified. Companion records:
> UI_REFERENCE_AUDIT · UI_SYSTEM · GAMEPLAY_INTERACTION_AUDIT ·
> GAMEPLAY_INTERACTION_REPORT · PROGRESSION_DESIGN.

## 1. Branch consolidation

- Pre-merge main: `3d3b036` (Phase 7, 2026-08-15) — six phases behind.
- Ancestry verified branch by branch (`git merge-base --is-ancestor`):
  phase/{8-service-loop 62561c3 · 11-evolution a63928c · 14-offline 26d4587 ·
  15-events-weather 7ea73ab · 16-asset-v2 c6a827f · 17-anim-vfx-audio 77d6566 ·
  consolidation-art 4394acf} all ancestors of the P18 tip; the two diverged
  branches were already on main as squashed PRs #12/#14; dependabot branches
  deliberately excluded (dependency discipline). No blind merge.
- PR-level CodeQL surfaced two real findings, fixed at root first
  (`1c1deba`): prototype-key guard in the save-tamper hook; a stat-then-read
  race in the sim-source walk.
- **Merged: PR #18, squash `6237a64` (repo precedent), 16/16 checks green,
  CLEAN.** Superseded PR #17 closed with its reason. Main CI green:
  run 32515954664.
- Work continued on `phase/consolidation-ui` from that main.

## 2. The user's deliveries, ingested

- **127 externally generated assets** (the audit prompts P177–P303) through
  the real pipeline: import (name conditioning, alpha plateau, projection
  fit, anchors) → nine checks (**279 source assets, 0 failing**, 75 recorded
  exceptions — flat-icon and mirrored-slot light waivers, each with its
  measured value) → atlases → manifest. Direction audit v2: the old rear-view
  gap rows close with true rear art, read by eye; reassignment scopes to the
  default variant it was read from.
- **Requirements matrix: 289 PRESENT+VERIFIED, 0 missing, 0 regen** —
  image debt zero. Licence record gains the delivery appendix under the
  standing §1.5 override.
- Pipeline contract changes, recorded not slipped: §1.4 split scoped to
  walkable-field objects (a bus is one kinematic unit); §13 rows
  veh/ui/ground resized for the delivered set (6.5/1.9/11.5 MB); the
  **deferred load tier** (vehicles2, ui2, stage-2..4 ground bakes) keeps the
  critical path at **3.58 / 4.00 MB** with twice the art.

## 3. The interface (reference → product)

Reference audit first (three images, pixel by pixel), then the rebuild:
economy pill (animated cash, ₡/dk, player level + XP), time pill with the
painted weather set, top-right navigation tiles, left speed rail
(`SET_SPEED`), bottom-left action tiles, the bottom-centre build panel —
**the whole 30-rung tree, family-grouped, painted icons, explicit lock
reasons (Aşama/önkoşul/Seviye/₡), the "+" hotspot model deleted** — the
centred upgrade detail, the stage-checklist objective card, order cards, the
evolution chip bottom-right. Full-bleed world (environment skirt + one-band
vignette; no letterboxing at any viewport). Debug telemetry behind `?debug=1`
in every build. Details: UI_SYSTEM.md.

## 4. The game, playable

The money dead-start's root cause (no prep verb in the UI, ever) and its
repair are the interaction reports' subject: **cash 0.00 → 3.72 through the
real button**, then scenarios B/C/D/E/F as living specs — table seating
geometric, waiter service hands-free, staff automation, purchases changing
the world, evolution with its reward line. Progression: the derived player
level (no new state, no hash movement), twelve showcase level-gates proven
non-binding by the balance gate, PROGRESSION_DESIGN.md carrying the whole
inventory and the pacing evidence.

## 5. The world, honest

Ten archetypes on the road (8% reserve share; balance asserted rows green
with the mix), brake-light frames, the parking clearance corridor replacing
the sweep-through, draw-time west mirroring at zero bytes, stage-3 tables
served by real waiters. Thirteenth hash-pin renewal, reasons attached.

## 6. Verification

- `pnpm verify` **exit 0** end to end (typecheck ×3+svelte, lint 0/0,
  depcruise 198 modules 0 violations, knip clean, 1548 unit+integration,
  determinism 61/61, balance 5/5 with asserted stage rows, bench 22/22
  budgets, bundle 7.3 kB CSS gz / world assets within §13, coverage back
  over every threshold with new tests, nothing lowered).
- Chromium E2E **99 passed** (incl. the new `tableService`), visual goldens
  **24/24 in the pinned container ×2 runs + host-byte-identical world set**,
  every regenerated golden inspected by eye before acceptance.
- CI + Preview E2E: green at the consolidation SHA (numbers in
  PROJECT_MEMORY §22 checkpoint AT).

## 7. Remaining, honestly

- Human playtest **NOT RUN** (no humans; protocol intact).
- 23 audio files + 1 OFL font remain the external queue (unchanged).
- The user's standing decisions: road/lot structure (S4), GDD §8 ⊗ §6.1,
  S7 i18n, perf backstop 5→8 CR.
- Production promotion of this pass (main merge #2) is the close's final
  step; the first real production-smoke run rides it.
