# PHASE 5 REPORT — Traffic Simulation

**Phase:** 5 — the road comes alive
**Date:** 2026-08-15
**Result:** 🟡 **PARTIAL** — the traffic system is built, deterministic and tested; **two of the phase's own definition-of-done items are not met**, and one of them needs a decision that is not the agent's to make
**Branch:** `phase/05-traffic` (not merged)

---

## 1. Result, stated plainly

The simulation half of Phase 5 is complete and behaves correctly: lanes, a
deterministic inhomogeneous Poisson arrival process, IDM-lite car following,
despawn and pool return, four archetypes, the day curve, and vehicles drawn on
screen with procedural body motion. 723 tests pass, coverage is above its floor,
and eight of the ten absolute performance budgets pass comfortably.

Two DoD items do not pass, and neither is fixed by more implementation:

| #   | Item                                                  | Status                                                                                                        |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **"The road reads as alive rather than mechanical"**  | ❌ It does not. Measured: **one vehicle on the road on average, and completely empty 41% of the time.** §4    |
| 2   | **Zero steady-state allocation / no perf regression** | ❌ 29 B/tick against a budget of 8, and the recorded baseline predates the pipeline doing any work at all. §7 |

Item 1 is a conflict between three separately-approved numbers and needs a
product decision (§4.3). Item 2 is partly a stale baseline and partly an
unexplained measurement I could not resolve (§7.2) — reported rather than tuned
away.

**Phases 6 and 7 were not started.** Carrying a phase with two unmet DoD items
into the next one is exactly what the batch instruction forbids.

---

## 2. What was built

| Area                  | Detail                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Polyline`            | Arc-length parameterised polyline; binary search for the segment; allocation-free sampling into a caller-supplied object                              |
| `LaneGraph`           | Lanes built from the authored stage-1 layout; decision point resolved against each lane's own arc length so it is correct in both directions          |
| `TrafficSpawnSystem`  | Inhomogeneous Poisson by **thinning**; 24-point day curve normalised to a mean of 1; four archetypes with hourly bias; lane spill instead of dropping |
| `VehicleMotionSystem` | IDM-lite; counting sort + insertion sort per lane; accelerate-then-integrate in separate passes; despawn and pool return                              |
| `idm.ts`              | The model, isolated and independently tested, with every acceleration clamped                                                                         |
| `TimeSystem`          | The day curve as a pure function of the clock, continuous at every hour boundary including the midnight wrap                                          |
| `VehicleView`         | 8-direction selection with the world→screen projection applied, distance-driven suspension bob, clamped nose dip, framerate-independent heading blend |
| Save                  | Schema **v2 → v3**: the Poisson cursor is persistent state; migration + committed `save-v3.json` fixture                                              |
| Events                | `VEHICLE_SPAWNED`, `VEHICLE_BRAKED`, `VEHICLE_DESPAWNED`, pooled like the rest                                                                        |

### 2.1 Why thinning

The arrival rate varies continuously through the day, which rules out both
obvious implementations. A per-tick Bernoulli trial only approximates a Poisson
process and its error grows with the rate — enough to fail a distribution test at
10 000 samples. Drawing one exponential gap against the _current_ rate assumes
the rate holds until the next arrival, which it does not across a peak.

Thinning (Lewis-Shedler) generates candidates at the day's peak rate and accepts
each with probability `rate(t) / peak`. It is exact for a time-varying rate and —
the property that matters here — consumes a number of random draws that depends
only on simulation state, so the same seed and tick count always produce the same
arrivals.

---

## 3. Tests

**723 passing** (up from 709 before this phase's own additions were counted;
+124 over the Phase 4 baseline of 599 excluding tool tests).

| Suite                             | Covers                                                                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `traffic/lane.test.ts` (13)       | Arc length across joints, unit tangents, clamping instead of NaN, binary search at every joint, decision point in both lane directions              |
| `traffic/idm.test.ts` (16)        | Desired gap, acceleration limits, no overlap, no negative speed, **brake wave propagates strictly upstream**, convergence rather than oscillation   |
| `traffic/spawn.test.ts` (18)      | Poisson determinism at **10 000 spawns**, day-curve continuity at every boundary, curve mean exactly 1, archetype mix within 2 points, lane balance |
| `traffic/motion.test.ts` (10)     | No overlap over 30 simulated minutes, forward-only motion, despawn and pool balance, slot reuse, distinct entity ids, road occupancy                |
| `traffic/limits.test.ts` (15)     | Store full, both lane heads blocked, zero-length tick, lane removed under a live vehicle, event pools exhausted, render buffer bound                |
| `traffic/archetypes.test.ts` (6)  | Table order (load-bearing — it is hashed), real dimensions, non-zero speed spread                                                                   |
| `render/vehicleView.test.ts` (17) | World→screen direction mapping, all eight sprites reachable, bob by distance not time, pitch clamp, short-way heading blend                         |

### 3.1 The assertion that matters most

`propagates a brake upstream as a wave` — the leader brakes, and each follower
reaches its own minimum speed _strictly later_ than the one ahead of it. That
emergent accordion is the reason IDM was chosen over a simpler model, and it is
precisely the kind of property someone removes while making the simulation
"smoother". It is now impossible to remove silently.

---

## 4. The road does not look alive

### 4.1 What was measured

Full game day, seed 424242, stage 1:

```
lane length 36 m  |  1 game day = 12 real min
mean vehicles on the road   1.05        p50 1   p95 3   peak 5
road COMPLETELY EMPTY       40.9% of ticks
mean speed                  11.9 m/s
spawned 254, refused 29 (10.2%)
```

Confirmed visually in a real browser at the busiest hour of the day (18:00, the
largest peak on the curve): **one vehicle on screen.**

### 4.2 Why — three approved numbers that do not fit together

| Value                     | Source                             | Approved in |
| ------------------------- | ---------------------------------- | ----------- |
| Lane length 36 m          | `stage1.ts` authored layout        | Phase 3     |
| ~13.9 m/s (50 km/h)       | Real vehicle dimensions and speeds | Phase 2/3   |
| 24 vehicles / real minute | ECONOMY_DESIGN §3, stage 1         | GATE 0      |

Transit time is 36 / 13.9 ≈ **2.6 s**. Arrivals are 0.4/s. Expected occupancy is
0.4 × 2.6 ≈ **1.04 vehicles** — exactly what was measured. The implementation is
behaving correctly; the numbers simply do not produce traffic.

The consequence is not only cosmetic. With one vehicle there is never a follower,
so **the car-following model never runs against a leader in normal play** — the
accordion wave that Phase 5 exists to produce cannot be seen, and the risk table's
"traffic looks like a conveyor belt" is beaten only by there being no belt.

### 4.3 This needs a decision, not a fix

Every remedy changes an approved contract, so none was applied:

| Option                                                                                      | Cost                                                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A.** Raise stage-1 arrivals to ~90–120/real-min and scale conversion down to hold revenue | Changes ECONOMY_DESIGN §3 and the conversion cap — the whole economy is calibrated on this number |
| **B.** Keep 24/min as _converting_ demand and add decorative traffic on top                 | Changes what "traffic" means in the model; conversion denominator needs redefining                |
| **C.** Slow vehicles to ~25 km/h                                                            | Doubles occupancy to ~2. Not enough alone, and 25 km/h on an open road is not credible            |
| **D.** Lengthen the road and pull the camera back                                           | Visible density is set by the camera, not the lane; changes framing and every golden              |

**Recommendation: B.** It is the only one that leaves the economy's calibration
untouched — 24 converting-eligible vehicles per minute stays exactly as designed,
and the road gets the density the fantasy needs. It is still a design change and
belongs to the user.

---

## 5. Defects found and fixed

| #   | Defect                                                                                                                                                                                     | How it surfaced                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| 1   | The lane-ordering pass aliased its counting array as a write cursor, so the acceleration pass afterwards read cursors instead of counts                                                    | Re-reading the code before running it |
| 2   | **23% of all arrivals were dropped** because the drawn lane happened to be occupied — silent demand loss the economy would never have seen                                                 | First behavioural probe               |
| 3   | A restored save with a stale Poisson cursor walked the spawn loop forward from it in exponential steps — for a migrated save, a whole day of backlog inside one tick, presenting as a hang | Reasoning about the v2→v3 migration   |
| 4   | The despawn pass indexed the lane graph directly, so a vehicle on a removed lane threw and took the tick loop down; it had also been un-despawnable, holding a slot forever                | Writing the limits tests              |
| 5   | `forbiddenGlobals` scanned the transient `__fixture__` directory the architecture test writes, so the two raced in parallel workers                                                        | Full suite under coverage             |
| 6   | Prettier could not stably format a comment between a test body and its timeout argument — output differed on every run                                                                     | `format:check` after `format`         |

Defect 2 is the one worth dwelling on: it was invisible from the code, cost a
quarter of all demand, and only appeared because the first thing done after the
system compiled was to print what it actually did.

---

## 6. Verification

```
pnpm lint            exit 0
pnpm format:check    All matched files use Prettier code style!
pnpm typecheck       231 files, 0 errors, 0 warnings
pnpm depcruise       no dependency violations (83 modules, 207 dependencies)
pnpm knip            exit 0
pnpm assets:validate 0 assets (unchanged — no art exists)
pnpm assets:build    all budgets within limits
pnpm test:coverage   723 passed · statements 97.51% · branches 89.09% · functions 97.13% · lines 98.64%
pnpm build           414.22 kB gzip / 550 kB
pnpm bench:sim       8 of 10 — see §7
```

Coverage note: branch coverage initially fell to 83.67% against an 85% floor.
Fixed by collapsing unreachable `?? 0` guards into the existing `at()` helper
(plus a new `atIn` for plain arrays) and adding real tests for the reachable
edge paths — the same treatment Phase 2 applied, and **not** by moving the floor.

---

## 7. Performance — what passes and what does not

### 7.1 Passing, comfortably

| Budget                             | Measured    |
| ---------------------------------- | ----------- |
| 1000 empty ticks < 5 ms            | **1.53 ms** |
| Depth sort, 260 objects < 0.15 ms  | pass        |
| World hash < 500 µs                | pass        |
| Command per tick < 20 µs           | pass        |
| Event flush, 3 subscribers < 10 µs | pass        |
| Spawn/despawn per entity < 5 µs    | pass        |
| Save serialise < 8 ms              | pass        |

### 7.2 Failing

**Allocation: 29 B/tick against a budget of 8.** Both numbers are real. The
budget was set in Phase 2 when every one of the eighteen system slots was a
no-op, so "essentially nothing per tick" was measured against a pipeline that did
nothing. Bisected as far as: the spawn system contributes ~6 B/tick and the
motion system ~16 B/tick, but **each of the motion system's three passes measures
0.17 B/tick in isolation while the three together measure 16** — and no
individual operation inside them allocates when measured alone. Empty class
instances in the same pipeline position allocate nothing, so it is not the call
site's shape.

I could not explain this and stopped rather than guess. In practical terms 29
B/tick is 580 B/s at 20 Hz, about 2 MB per hour — a minor collection every few
minutes, well below anything that produces the frame stutter the budget exists to
prevent. That is an argument for revisiting the budget consciously, **not** for
quietly editing the number, so the test is left failing.

**Regression gate: "1000 empty ticks" 1.53 ms vs a 0.27 ms baseline.** The
baseline was recorded on the empty pipeline. Three systems now do real work every
tick, so this is a genuine and expected workload change rather than a regression —
and the absolute budget for the same measurement (5 ms) passes with 3× headroom.
Re-recording the baseline from CI is the correct action and is a deliberate act
that should be visible, so it has not been done unilaterally.

### 7.3 Not measured

**No real-GPU frame rate.** The Phase 3 measurement stands and was not re-run.
The 120-vehicle render target cannot be measured meaningfully at stage 1 anyway,
because the road never holds more than five vehicles (§4.1) — measuring it needs
either the §4.3 decision or an artificial stress scene, and inventing one to
produce a number would be measuring the harness rather than the game.

---

## 8. The time-scale decision — not made

GDD §25 S1 asks how many real minutes make one game day, with 12 as the
candidate, to be decided **by playing**. It is not decided here, and the reason is
§4: at one vehicle on screen and an empty road 41% of the time, there is nothing
to judge a day's rhythm against. Comparing 8, 12 and 18 minutes would be
comparing three versions of an empty road, and recording a decision from that
would be fabricating the judgement the roadmap explicitly asks a human to make by
playing.

`MS_PER_GAME_DAY` remains at 12 real minutes, still marked provisional. The
decision is deferred until the traffic density question is settled, and it should
be cheap then — the machinery to compare is all in place.

---

## 9. What Phase 5 leaves open

1. **Traffic density** — §4.3, a product decision.
2. **The allocation budget** — §7.2, an unexplained 29 B/tick and a budget set
   against an empty pipeline.
3. **The perf baseline** — stale by construction; re-record from CI.
4. **The time-scale decision** — blocked on 1.
5. **Real-GPU FPS with traffic** — blocked on 1.
6. **Phaser WebGL1/WebGL2** — untouched, still open from Phase 3, still not
   blocking.

---

## 10. Assessment

The traffic kernel is good work: deterministic where it must be, honest about its
own limits, and it found five real defects in itself before anything downstream
could. The IDM model does what it was chosen for — the wave test proves it.

But Phase 5's own definition of done asks whether the road looks alive, and the
answer measured on a real browser at the busiest hour of the day is no: one car,
and an empty road four ticks in ten. That is not something the phase can fix from
inside its own scope, because the three numbers producing it were each approved
separately and each is correct on its own.

**Phase 5: PARTIAL.** Reporting it as a pass would require either ignoring its
own DoD or quietly changing an approved economic constant, and both are worse
than saying it plainly.
