# PHASE 11 REPORT — Restaurant Evolution

**Phase:** 11 — the stand becomes a restaurant
**Date:** 2026-08-16
**Result:** ✅ **PASS (technical)** — 1 218 tests, 114 E2E, 14 goldens, 21 perf budgets
**Branch:** `phase/11-evolution` (stacked on `phase/8-service-loop`)

---

## 1. Result, stated plainly

The lemonade stand grows into a restaurant **in place**. The camera does not cut,
the scene is never swapped, and the first stand is still standing in the corner
of Stage 4. Four stages, three transitions, each one gated on cash _and_ on a
milestone, each one revealed by a stencil mask driven by the simulation's own
progress figure rather than by a timer.

`pnpm verify` is green end to end: **1 218 tests, 84 files, 21 performance
budgets, no threshold moved**. E2E is **114 across Chromium and Firefox**. Visual
regression is **14 goldens**, three of them new — one per stage.

**Six things worth saying out loud, none of them buried:**

- The renderer was **hardwired to Stage 1's layout**. Every stage after the first
  existed in the simulation and nowhere on screen. §4.
- Drawing the lot exposed a **car park that parked cars through each other** —
  three-metre centres for 4.5 m cars, in layouts I had written earlier this
  phase. Every test passed while it was wrong. §5.
- **Stage 4 adds no parking bays.** It cannot: the west block is full and the
  east half is the restaurant. Its capacity is the drive-thru, which is what a
  drive-thru is for. §5.1.
- Stage 1 takes **46.7 to 55.2 minutes** to complete against a designed **12 to
  18**. That is Phase 12's problem and it now has a failing test waiting for it.
  §7.
- **Design questions S4 and S5 are decided**, from measurements, and one of the
  two arguments I expected to make **was not supported by the data** and is
  recorded as unsupported. §6.
- **WebKit smoke could not run on this host** — a missing system library, not a
  code failure. §10.1.

---

## 2. What was built

| Area         | What                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| Progression  | `ProgressionSystem` fills its reserved pipeline slot; cash **and** milestone gate |
| Layouts      | `stage2/3/4.ts` + `layoutForStage()`; tables, drive-thru, registers, growing park |
| Construction | `ConstructionSystem`, `ConstructionMask` — reveal in place, no scene change       |
| Drive-thru   | `DriveThruSystem`, `driveThruFsm`, lane compaction, 0.4× patience                 |
| Build mode   | `LayoutSystem`, `reachability`, `BuildMode.svelte`, ghost with a live verdict     |
| Save         | schema **v7 → v8**, chained migration, committed `save-v8.json` fixture           |
| Render       | `WorldScene` now draws the **current stage**: bays, tables, the lane              |
| Bridge       | `SimView.stage`, `HudModel.placed`, `UiCommands.previewPlacement`                 |

**None of it is a nineteenth system slot.** The eighteen slots and their order are
architecture (WORKING_DISCIPLINE §6), so `LayoutSystem`, `ConstructionSystem` and
`DriveThruSystem` are free-function modules called from inside existing slots —
`compactDriveThruLane` and `seatCustomers` run at the top of `QueueSystem.run`,
construction advances inside the progression slot that was already reserved.

---

## 3. Evolution is not a scene change

The roadmap is explicit and the rule is easy to satisfy dishonestly: a cross-fade
between two prepared scenes would look almost right and would make the claim
false. `ConstructionMask` sweeps a **world-space** rectangle upward and projects
it, because an isometric projection turns a horizontal world plane into a diamond
— a screen-space wipe cuts the building along a line that corresponds to nothing
and reads as a wipe rather than as a building going up.

Three properties are under test in `tests/unit/render/constructionMask.test.ts`:

- the drawn quadrilateral **is** the projection of the world rectangle it claims
  to be, corner for corner;
- `update(p)` is a **pure function of `p`** — which is what lets a frozen scene
  photograph identically, and the visual goldens depend on it directly;
- it **never reads a clock**: `performance.now` and `Date.now` are spied and
  asserted uncalled, so a paused world holds a half-built building and a 4×
  world genuinely builds four times faster.

And the E2E watches the actual canvas element across the transition
(`evolutionFlow.spec.ts`): same node, one canvas, world hash still advancing
afterwards. A scene swap would pass every simulation test in the suite and fail
exactly there.

---

## 4. The renderer was drawing Stage 1 forever

`WorldScene` imported `STAGE1_LAYOUT` directly — the ground, the road, the camera
bounds and the statics all came from it, unconditionally. So the Stage 3 dining
room and the Stage 4 drive-thru lane existed in the simulation, were navigable,
were served by employees, and **appeared nowhere on screen**.

It survived because nothing looked. The simulation tests do not render; the
goldens were all Stage 1. The first Stage 2 golden and the first Stage 4 golden
came out **byte-identical apart from a parked car**, which is what made it
visible.

The fix is `SimView.stage` plus a stage comparison in `update()`, in the same
shape as the existing `upgradeRevision` check and for the same reason: it changes
a handful of times a session, so rebuilding on a change beats diffing a layout
sixty times a second. `drawSurfaces()` paints the bays, the table pads and the
lane; the three new goldens are of that.

---

## 5. A car park that parked cars through each other

Drawing the bays is what found it. `ACTOR_KIND_SPECS` says a vehicle is
**4.5 m × 1.9 m**, the bays' authored heading is `(1, 0)` so the length runs along
x — and the Stage 3 and Stage 4 rows I had written earlier in this phase were at
**three-metre centres**. Every neighbouring pair overlapped by 1.5 m.

Nothing objected, and nothing was going to. A parked car is placed by its
manoeuvre rather than pathfound into its bay, so the navigation grid never sees
the conflict; `navigationIntact` asks whether people can _walk_, and people can
walk perfectly well past a car that is inside another car. The only symptom would
have been two cars occupying one patch of tarmac on screen, in a stage nothing
had photographed yet.

Fixed to five-metre centres — the original row's own spacing, 0.5 m between
bumpers — and `tests/unit/sim/layout/stageLayouts.test.ts` now asserts, for every
stage, that no two bays hold the same tarmac, that no bay hangs off the lot, and
that no bay reaches into the dining room.

### 5.1 Stage 4 adds no bays, deliberately

Respacing left nowhere for the four Stage 4 bays to go. The lot is 24 × 18 m; the
road is blocked from y 1.5 to 8.5; the east half south of the road is the
restaurant from Stage 3 onward. That leaves a west block of two columns and three
rows — **eight bays, and Stage 3 already uses all eight**.

That is not a shortfall, it is the stage's own design. Stage 4's answer to "more
cars than the car park holds" is the drive-thru: four cars in the lane, none of
them in a bay, none of their occupants crossing the car park on foot. A version
that solved it with more tarmac would have made the lane decorative.

`stageLayouts.test.ts` therefore asserts the honest property — **nothing is ever
taken away** — rather than a strict increase that would need exempting for
exactly this case.

---

## 6. S4 and S5, decided from measurements

Both are recorded in GAME_DESIGN_DOCUMENT §25.1 and §25.2 with their data.

**S4 — free-form or grid-snapped? → grid-snapped.** The navigation grid has 0.5 m
cells. Measured inside one snap basin (±0.25 m, the region a player aiming at a
cell actually hits and cannot subdivide by eye): free placement produces **more
than one distinct blocked-cell set**, snapped produces **exactly one**. So the
freedom is either a lie the preview tells or an object that eats a neighbouring
cell.

**And the second argument for it did not survive contact with the data.** I
expected free placement to also flip _whether_ a wall is allowed, depending on
sub-cell aim. Swept across a full cell on this layout, every offset produced the
same sequence of verdicts. The case for snapping rests entirely on which cells
get blocked. `placementMode.test.ts` now asserts that stability so that a future
layout which breaks it fails loudly and the argument gets _stronger_ rather than
quietly changing shape.

**S5 — automatic or player-confirmed? → player-confirmed.** Across five seeds the
Stage 1 requirements were met with **1 to 6 customers mid-transaction and 3 to 10
cars on the lot, every single time**. There is no quiet moment to evolve in,
because the requirements are met _by serving people_. Construction then disrupts
the stand for 12 to 30 seconds. Firing that automatically fires it when the
player is busiest; a confirmation makes it a decision they chose the timing of,
and the requirements stay met, so nothing is lost by waiting.

---

## 7. Stage 1 takes three to four times as long as designed

The same five-seed run produced a number that is wrong on purpose:

| Measure                     | Value                   |
| --------------------------- | ----------------------- |
| ECONOMY_DESIGN §3, designed | **12 – 18 minutes**     |
| Measured, five seeds        | **46.7 – 55.2 minutes** |

This is the demand starvation Phases 8 to 10 kept running into — 1.8 customers a
minute against a 5.3 ceiling — seen from the progression side. It is a **Phase 12
balance problem**, and `stageTransitionPacing.test.ts` asserts the current, wrong
bound (`> 25` minutes) precisely so that Phase 12 has a number to move rather than
an impression. **That test is expected to fail when the economy is tuned.**
Failing is the signal.

---

## 8. The pass plate finally has something on it

PHASE_8_REPORT §6 measured food sitting on the pass for **0 ticks out of 24 000**,
which left the pass plate (P8), the cooler (P9) and the entire waiter role (P10)
built and dormant. Stage 3's tables plus non-instantaneous delivery is what turns
them on:

```
stage 1, 0 waiter(s): served 18 (dt 0)  abandoned 0  · plate on the pass 0/12000
stage 3, 1 waiter(s): served 27 (dt 0)  abandoned 0  · plate on the pass 1269/12000
stage 3, 0 waiter(s): served 0  (dt 0)  abandoned 11 · plate on the pass 8225/12000
stage 4, 2 waiter(s): served 27 (dt 3)  abandoned 0  · plate on the pass 1063/12000
```

The third row is the one that proves the mechanism rather than the plumbing: take
the waiter away and the pass jams at **8 225 ticks out of 12 000** and eleven
customers give up. The waiter is now load-bearing.

---

## 9. Performance

| Measurement                                   | Result        | Budget    |
| --------------------------------------------- | ------------- | --------- |
| Stage 4 tick (8 employees, 60 peds, 120 cars) | **0.307 ms**  | 3.2 ms    |
| Staffed tick (Phase 10 budget)                | within        | 3.0 ms    |
| Allocation, steady state                      | 11.8 B/tick   | 32 B/tick |
| Perf budget tests                             | **21 passed** | —         |

Baseline re-recorded as `recordedAt: "phase11"` with the new Stage 4 benchmark in
it. Measured on this development machine, not in CI — CI has no GPU and cannot
measure frame rate at all (CLAUDE.md §6).

---

## 10. Definition of done — WORKING_DISCIPLINE §4

| #   | Item                           | Status | Evidence                                                                     |
| --- | ------------------------------ | ------ | ---------------------------------------------------------------------------- |
| 1   | Feature complete to phase spec | ✅     | §2; S4 and S5 decided and implemented (§6)                                   |
| 2   | Unit tests                     | ✅     | 1 218 pass, 84 files                                                         |
| 3   | Integration tests              | ✅     | `evolution` 20, `layoutChange` 12, `driveThru` 12, `stageTransitionPacing` 2 |
| 4   | Determinism suite              | ✅     | Green; browser hash matches Node exactly (§10.2)                             |
| 5   | Coverage thresholds            | ✅     | None moved; four new test files closed the gaps                              |
| 6   | Lint / format / types          | ✅     | Clean, 301 files, 0 warnings                                                 |
| 7   | Architecture boundaries        | ✅     | `depcruise` clean — 153 modules, 532 dependencies                            |
| 8   | Dead code                      | ✅     | `knip` clean — eleven exports narrowed or deleted rather than kept           |
| 9   | Performance budgets            | ✅     | §9 — 0.307 ms against 3.2 ms                                                 |
| 10  | Allocation budget              | ✅     | 11.8 B/tick against 32                                                       |
| 11  | Visual goldens                 | ✅     | **14 pass**, three new — `stage2/3/4-layout.png`                             |
| 12  | E2E                            | ⚠️     | **114 pass** Chromium + Firefox; **WebKit could not run here** (§10.1)       |
| 13  | **Save migration**             | ✅     | **v7 → v8**, chained, `save-v8.json` fixture                                 |
| 14  | Documentation                  | ✅     | This report, GAME_DESIGN_DOCUMENT §25.1/§25.2, PROJECT_MEMORY                |
| 15  | **Stage art / silhouettes**    | ⚠️     | **NOT JUDGED — awaiting external art.** §11                                  |

Thirteen of fifteen clean, one blocked by the host and one by art.

### 10.1 WebKit smoke did not run on this machine

```
Error: browserType.launch:
Host system is missing dependencies to run browsers.
    sudo apt-get install libevent-2.1-7t64
```

An environment gap, not a code failure: installing it needs root, which is the
user's call and not mine to take. `pnpm e2e:smoke` runs in the pinned CI
container, where the dependency is present. **Nothing about WebKit is claimed
here** — it was not run, so it is not reported as passing.

### 10.2 The reference world hash was regenerated, for the sixth time

`tests/e2e/simulation.spec.ts` failed on the cross-engine determinism check:

```
Expected: "a0d410cfd8310444"   (recorded in Phase 10)
Received: "6b9fb66d69f685fc"
```

The digest legitimately grew: evolution put a pending stage, a construction timer
and the layout revision into it, customers grew a table and a service channel,
and the statistics grew a drive-thru counter. Every one of those can change an
outcome — which stage you are in decides the layout, and the layout decides where
everybody walks — so every one of them is hashed.

**Confirmed as a growth rather than a divergence before touching the fixture**:
the Node suite computes `6b9fb66d69f685fc` at tick 0 and `ac08da8925b9e88d` at
tick 1 000, and the browser produced exactly the first of those. Node and both
browser engines agree; the recorded constant was simply stale.

---

## 11. NOT JUDGED — awaiting external art

The roadmap's Phase 11 question is whether the four stages read as _the same
place, growing_ — whether the player recognises their first stand inside the
restaurant. That is a judgement about silhouettes, and every building in the game
is currently a magenta checkerboard placeholder.

The three new goldens photograph the **geometry**: where the bays are, where the
dining room is, where the lane runs. That is the part that can be protected now,
and it is what a real-art diff would be measured against. The silhouette question
is deferred to Phase 16, where the roadmap puts stage art.

---

## 12. Open items carried forward

| Item                                              | Where it goes                     |
| ------------------------------------------------- | --------------------------------- |
| Stage 1 pacing 46.7–55.2 min vs 12–18 designed    | **Phase 12** — failing test ready |
| Traffic starvation: 1.8/min against a 5.3 ceiling | **Phase 12**                      |
| Stage art, silhouette judgement                   | Phase 16                          |
| WebKit smoke on this host                         | needs `libevent-2.1-7t64` (root)  |
| Phaser WebGL 1 vs 2 contradiction                 | still open — PROJECT_MEMORY §12   |
| Asset licence gate                                | opened by override, not satisfied |

---

## 13. What Phase 12 inherits

A restaurant with four stages, a drive-thru, tables that fill, a waiter that
matters, and **an economy that is too slow to reach any of it at the designed
pace**. Every mechanism Phase 12 needs to tune is now built and measured; what it
has to change is the constants, not the mechanics.
