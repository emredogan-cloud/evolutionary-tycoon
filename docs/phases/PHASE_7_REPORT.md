# PHASE 7 REPORT — Navigation & Pathfinding

**Phase:** 7 — people walk
**Date:** 2026-08-15
**Result:** ✅ **PASS** — 907 tests green, all budgets met, deadlock harness clean over 500 scenarios
**Branch:** `phase/7-navigation`

---

## 1. Result, stated plainly

Pedestrians navigate. A grid is derived from the layout, a flow field is built
backwards from every named goal, and agents follow it, steer around each other
and queue at the counter. The deadlock harness runs 500 randomised
configurations for 2 000 ticks each and finds no state where nobody can move.

907 tests pass. Lint, type-check, dependency-cruiser, knip and format are clean.
Both Phase 7 budgets are met with room: the crowded tick at **0.234 ms against
2.5 ms**, and a full flow-field recompute at **9.75 ms against 12 ms** — the
latter measured at the scale the budget is written for, which Stage 1 is not.

**One definition-of-done item is not met**, and for the same reason as Phase 6's:
the roadmap asks the implementer to _"watch 30 pedestrians navigate a crowded
entrance and confirm they look like people, not particles"_. That is a visual
judgement, no production character art exists (PHASE_4_REPORT §11), and **it is
not made here.** §8 reports what was measured instead, including a number that is
not good and is not hidden.

## 2. What was built

| Area               | Detail                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `NavGrid`          | 0.5 m cells from the layout; road, counter, bays and placed objects blocked; one rebuild entry point        |
| `FlowField`        | Dijkstra from the goal to an integration field, then a descent step per cell into a vector field            |
| `FlowFieldCache`   | One field per named goal; rebuilt only on layout change; goals snapped to the nearest cell you can stand in |
| `steering.ts`      | Flow, separation across the flow, arrival damping, and the personal-space floor — all pure                  |
| `aStar.ts`         | Octile-heuristic A\*, sharing the grid, the √2 diagonal and the corner rule with the flow field             |
| `NavigationSystem` | Takes movement over from the state machine; steers, then resolves overlaps as a constraint                  |
| `DollRig`          | Six parts, distance-driven phase, speed-scaled amplitude — pure maths in `src/render`                       |
| Nav debug overlay  | Blocked cells shaded, goals ringed                                                                          |
| Deadlock harness   | 500 configurations × 2 000 ticks, permanent in the integration suite                                        |

### 2.1 Why flow fields, and why they are cheap here

Forty customers heading for the same counter would run forty A\* searches over
the same corridor. One field serves them all at an array lookup. The usual
objection — memory on a large map — does not apply: Stage 1's grid is 48×36
cells, and RESEARCH_NOTES §8 sizes even the 64×64 × 20-goal case at about 650 KB.

The cost is in _building_ them, and the trade only works because a build happens
when the player places something rather than in the game loop.

### 2.2 Three decisions inside the field

**Dijkstra, not breadth-first.** A diagonal costs √2 and an orthogonal step
costs 1. Treating them as equal makes a diagonal look 41% cheaper than it is,
and paths stagger diagonally where they should go straight — barely visible in
the open, obvious around a corner.

**A diagonal is only legal when both orthogonals beside it are free.** Otherwise
the agent passes through the corner point of a cell the grid calls solid, which
on screen is walking through the furniture.

**The queue's road cells are forced walkable, last.** The last queue slots are
authored onto the road on purpose — that is the entire spillover mechanic — so
the grid's own road rule has to yield to them, or the economy quietly loses its
only negative feedback loop by way of a grid detail.

---

## 3. The budget that was missed, and fixed rather than deferred

Measured at the scale the roadmap writes it for — 64×64 cells, 20 goals — a full
recompute took **42.9 ms against a 12 ms budget**.

The roadmap's stated fallback is to chunk the recompute across frames per goal,
_"but measure first"_. The measurement said the cost was a **tuple destructure in
the innermost loop**: `for (const [dx, dy, step] of NEIGHBOURS)` runs about
650 000 times per rebuild. Three flat typed arrays instead, and the same
computation takes **9.3 ms**. No chunking was needed and nothing is computed
differently.

Stage 1's own six goals over 48×36 cells rebuild in about 2 ms. The benchmark
deliberately does not measure that: reporting it against a budget written for
four times the work would have looked four times better than the requirement
asked for.

---

## 4. Five defects found by measurement

### 4.1 The bay doors were inside their own car

Authored 1.2 m from the bay centre. A car is 1.9 m wide, so 1.2 m clears the
bodywork by 25 cm — and then the 0.5 m grid rounds the two into the same cell.
**The spot a customer steps out onto was marked solid by their own car**, so
nothing could be routed from it or to it. Doors are 1.5 m out now.

### 4.2 A full queue stacked the crowd on one point

Every customer who could not get a slot was told to walk at the counter. With
thirty pedestrians at the entrance — this phase's own naturalness scenario —
fifteen converged on the **same point**: closest approach 2.2 cm and 5.5% of all
pair-ticks inside 30 cm, which is people standing inside each other.

No amount of steering fixes that. Separation is outvoted by fifteen agents pulled
the same way. They hold position instead.

### 4.3 Separation pushed people backwards

Applying the whole push let it oppose the flow, so a pair oscillated: push apart,
flow pulls together, push apart. **64.7% of walking steps reversed direction.**

Only the component across the flow is used now, which makes a reversal impossible
rather than unlikely — the blended vector's dot product with the flow is 1
whatever the push.

### 4.4 Overlap corrections compounded across neighbours

Applied per pair as each was found, so an agent in a cluster was moved once per
neighbour and the result was neither bounded nor symmetric — peaks of 2.06 m/s
against a 1.35 m/s walk. Accumulated per agent and applied once now.

### 4.5 Three benchmarks were measuring a moving target

`benchEventFlush` and `benchCommandProcessing` ticked one world that filled up
across twenty-five samples; `benchPopulatedTick` and `benchCrowdedTick` let a
120-vehicle jam clear across them. Both showed as **16–29% swings between runs
minutes apart on unchanged code**. Each sample rebuilds its own load now, and
three consecutive runs are clean.

---

## 5. Two things that were tried and rejected on evidence

Both are recorded in the code, because the next person to have the same idea
should find the measurement rather than repeat it.

**A cap on the overlap correction.** Bounding how far a correction may move an
agent per tick looked obviously right and made the separation strictly worse:
closest approach fell from 29 cm to 6 cm and the share of too-close pair-ticks
more than doubled, while buying no measurable smoothness. Capping a constraint
just means it is not satisfied.

**Extending the queue past its last slot.** This is what a real queue does and it
is wrong on this layout: Stage 1's queue is authored pointing _at the road_,
because an overflowing queue spilling towards traffic is the spillover mechanic.
Extending it walks people into the carriageway, the grid refuses them, and they
pile against the kerb — 0.9 cm closest approach and 11% of pair-ticks too close,
**forty times worse** than having them hold position. A layout whose queue ran
along the counter could extend, and the note in `QueueSystem` says so.

---

## 6. Performance

| Measurement                                      | Budget      | Measured     |
| ------------------------------------------------ | ----------- | ------------ |
| Tick, 60 pedestrians + 120 vehicles, p95         | ≤ 2.5 ms    | **0.234 ms** |
| Full flow-field recompute, 64×64 × 20 goals, p95 | ≤ 12 ms     | **9.75 ms**  |
| Tick, 120 vehicles + 20 customers, p95 (Phase 6) | ≤ 2.2 ms    | 0.018 ms     |
| 1000 ticks from a fresh world                    | < 5 ms      | 1.37 ms      |
| Steady-state allocation                          | < 32 B/tick | 11 B/tick    |

Separation is O(n²) over the pedestrians and that was a deliberate choice rather
than an oversight: sixty agents is 3 600 pair checks, over a store whose scan
bound keeps the loop tight. A spatial hash would be faster asymptotically and
slower here, and would be a second structure to keep in step with the positions.
The measurement is what decides it, and at ten times under budget it decides in
favour of the simple thing.

### 6.1 The perf gate's calibration was fixed along the way

The regression gate divides every timing by a calibration workload so machine
speed cancels. It cancelled a uniform clock-speed difference and nothing else,
because the calibration was pure floating-point arithmetic while the things it
normalises walk memory. That broke it in both directions: a baseline recorded on
a developer machine reported CI as 19% slower, and the CI-recorded baseline that
replaced it reported the developer machine as 18% slower. **Neither machine was
slower than the other.**

The calibration now mixes arithmetic with a strided walk over 4 MB. Across the
same two machines:

| benchmark                       | FP only | mixed   |
| ------------------------------- | ------- | ------- |
| world hash (most memory-bound)  | +19%    | **−5%** |
| world snapshot + JSON           | +11%    | −5%     |
| 1000 ticks from a fresh world   | +7%     | −7%     |
| depth sort (least memory-bound) | −1%     | −2%     |

---

## 7. Tests

| Suite                              | Count | What it pins                                                      |
| ---------------------------------- | ----- | ----------------------------------------------------------------- |
| `nav/grid.test.ts`                 | 13    | Cell geometry, what is blocked, rebuild and invalidation          |
| `nav/flowField.test.ts`            | 15    | Reachability by walking the field, corner cutting, determinism    |
| `nav/aStar.test.ts`                | 11    | Agreement with the flow field, path validity, refusing no-path    |
| `nav/steering.test.ts`             | 15    | Each force isolated; that a reversal is now impossible            |
| `render/dollRig.test.ts`           | 14    | Phase from distance, amplitude from speed, limb ranges            |
| `integration/nav/deadlock.test.ts` | 5     | 500 × 2 000 ticks, a stacked crowd, co-located agents, separation |

**Total: 907 tests**, up from 834 at the end of Phase 6. Coverage 97.15%
statements, 87.77% branches; no threshold moved.

### 7.1 What the deadlock harness actually asserts

500 randomised configurations, 2 000 ticks each, and in every one at least one
agent must reach its goal. It runs the full 2 000 ticks every time: an early exit
once somebody arrived was tried and removed, because it answers "did anyone get
going" rather than "does this still work after two thousand ticks", and a jam
that forms late is exactly the kind this exists for. The whole thing is 6.6 s.

### 7.2 Reachability is asserted by walking, not by looking

A vector field built from a correct cost field can still contain a cell whose
best neighbour is itself, and an agent standing there never moves again. The
test follows the arrows from every free cell to the goal rather than checking a
cost exists.

---

## 8. Pedestrians — measured, not judged

The roadmap's phase-completion condition asks for a human judgement on whether
thirty pedestrians look like people rather than particles. §1 says why it is not
made. What was measured:

| Measurement                        | Normal play | Crowded entrance |
| ---------------------------------- | ----------- | ---------------- |
| Peak pedestrians on foot           | 4           | 21               |
| Closest approach                   | 0.40 m      | **0.29 m**       |
| Pair-ticks inside 0.45 m           | 1.5%        | 0.25%            |
| Direction reversals, visible steps | 41%         | **57%**          |
| Deadlocks in 500 randomised runs   | —           | **0**            |

The first three are good: nobody walks through anybody, and a crowd at a
congested entrance keeps shoulders apart.

**The fourth is not, and it is not resolved.** Fifty-seven per cent of
perceptible movement steps reverse direction relative to the one before. Two
mechanisms were found and fixed and it barely moved, which says the metric is
partly measuring something legitimate — a queue of twenty-one people waiting for
six places genuinely mills about — and partly measuring something that is not:
a person adjusting their footing by a centimetre counts as a full reversal, and
at this scale one pixel is 2.9 cm.

I could not, in this phase, build a metric I trust enough to call this good or
bad. It is recorded as an open question with the number attached, and it should
be settled by watching it once there is art to watch.

---

## 9. Definition of done — WORKING_DISCIPLINE §4

| #   | Item                           | Status | Evidence                                           |
| --- | ------------------------------ | ------ | -------------------------------------------------- |
| 1   | Feature complete to phase spec | ✅     | §2 — grid, fields, steering, queue slots, A\*, rig |
| 2   | Unit tests                     | ✅     | 907 pass                                           |
| 3   | Integration tests              | ✅     | Deadlock harness, 500 × 2 000 ticks                |
| 4   | Determinism suite              | ✅     | Green                                              |
| 5   | Coverage thresholds            | ✅     | §7, none moved                                     |
| 6   | Lint / format / types          | ✅     | Clean                                              |
| 7   | Architecture boundaries        | ✅     | `depcruise` clean, 100 modules                     |
| 8   | Dead code                      | ✅     | `knip` clean                                       |
| 9   | Performance budgets            | ✅     | §6 — both Phase 7 budgets met                      |
| 10  | Allocation budget              | ✅     | 11 B/tick against 32                               |
| 11  | Visual goldens                 | ✅     | §10                                                |
| 12  | E2E                            | ✅     | 13/13 chromium; two Phase 7 tests                  |
| 13  | Save migration                 | n/a    | No persistent state added                          |
| 14  | Documentation                  | ✅     | This report; PROJECT_MEMORY updated                |
| 15  | **Pedestrian naturalness**     | ❌     | **Not judged.** No production art — §1 and §8      |

Fourteen of fifteen, with the same blocked item as Phase 6 and for the same
reason.

---

## 10. Visual goldens

`stage1-queue` moved from tick 7940 to tick 10392, and the tick was re-derived
rather than the golden re-recorded where it was. Flow-field routes differ from
straight lines, which shifts arrival times and with them every patience clock
downstream, so the busiest the counter gets is now a different moment. A
screenshot named `stage1-queue` that no longer photographs the busiest queue
lies about its subject, and would go on lying quietly for as long as the pixels
stayed stable.

The other four goldens are byte-identical, which confirms Phase 7 changed nothing
about how the empty lot, the depth test card, the camera bounds or the first
customer render.

---

## 11. Open items carried forward

| Item                                                                        | Owner phase |
| --------------------------------------------------------------------------- | ----------- |
| Pedestrian naturalness judgement, once real art exists                      | post-art    |
| 57% direction reversals at a congested entrance — metric and behaviour both | post-art    |
| Layout invalidation keys on `placed.length`; a _move_ would slip past       | 11          |
| Goals for `kitchen_pass`, `table_<n>`, `bin_<n>`, `dt_window` are absent    | 8, 11       |
| Brake lights on 33% of actor-frames (from Phase 6)                          | 12          |
| `globalDifficultyCurve` placement — the two documents differ (from Phase 6) | 12          |

### 11.1 The invalidation signature is deliberately weak

`NavigationSystem` rebuilds the fields when `world.layout.placed.length` changes.
That catches building and demolishing and would miss a _move_ that keeps the
count. Phase 11 is what introduces moving, and it should bring a proper version
counter with it. It is recorded here rather than assumed away, because a missed
invalidation is the failure this phase's own risk table rates most likely.

---

## 12. What Phase 8 inherits

A grid, a field per goal, and agents that follow them. Adding a goal is one entry
in `FlowFieldCache.rebuild`; `kitchen_pass` and `table_<n>` are absent rather
than pointed at a placeholder position, so asking for one fails loudly instead of
sending a waiter somewhere plausible and wrong.

`AStarFallback` is built and tested and has no caller yet. That is correct: it
exists for one-off dynamic targets, and Phase 8's cleaner is the first system
that will have one.
