# PHASE 5 REPORT — Traffic Simulation

**Phase:** 5 — the road comes alive
**Date:** 2026-08-15
**Result:** ✅ **PASS** — both blocking items resolved by executive decision on 2026-08-15 and implemented; 15/15 CI checks green
**Branch:** `phase/05-traffic`

---

## 1. Result, stated plainly

The traffic system is complete, deterministic and tested: lanes, a deterministic
inhomogeneous Poisson arrival process, IDM-lite car following, despawn and pool
return, four archetypes, the day curve, and vehicles drawn on screen with
procedural body motion. **727 tests pass and all 15 CI checks are green.**

This report was first written as **PARTIAL** with two unmet definition-of-done
items. Both were resolved by executive decision on 2026-08-15 and are recorded as
such — overridden and then implemented, not quietly satisfied:

| #   | Item                                                                             | Resolution                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The road did not read as alive — 1.05 vehicles on average, empty 41% of the time | **Decision: option B.** Decorative traffic added on top of unchanged demand. Occupancy doubled, empty time cut to 15%, followers now present 37% of ticks. §4 |
| 2   | Allocation 29 B/tick against a budget of 8                                       | **Decision: budget raised to 32.** Then CI measured **7.4 B/tick** on the same commit — the 29 was one machine's V8, not the code. §7                         |

Everything below the line in §4 and §7 is the original measurement and reasoning,
kept because the numbers are what the decisions were made on.

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

### 4.3 The decision, and what it produced

**Approved 2026-08-15: option B.** The four options as originally presented:

| Option                                                                                      | Cost                                                                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A.** Raise stage-1 arrivals to ~90–120/real-min and scale conversion down to hold revenue | Changes ECONOMY_DESIGN §3 and the conversion cap — the whole economy is calibrated on this number |
| **B.** Keep 24/min as _converting_ demand and add decorative traffic on top                 | Changes what "traffic" means in the model; conversion denominator needs redefining                |
| **C.** Slow vehicles to ~25 km/h                                                            | Doubles occupancy to ~2. Not enough alone, and 25 km/h on an open road is not credible            |
| **D.** Lengthen the road and pull the camera back                                           | Visible density is set by the camera, not the lane; changes framing and every golden              |

**Option B was chosen** — the only one that leaves the economy's calibration
untouched.

### 4.4 What decorative traffic actually did

Two independent Poisson processes rather than one with marked arrivals. Marking
is mathematically exact and needs only one cursor, but a shared process shares
its refusals, and congestion — the entire point of the decorative layer — starved
convertible arrivals from 24/min down to a measured **7.3/min**. Convertible now
runs first and claims lane space first.

That alone was not enough: a decorative vehicle admitted two seconds ago already
occupies the lane head. Decorative traffic therefore needs a much larger entry
gap (28 m against 12 m), reserving the space between the two for the traffic the
economy depends on.

Tuned by measuring a full game day at each setting:

| decorative | entry gap | mean on road | ticks with a follower | delivered convertible |
| ---------- | --------: | -----------: | --------------------: | --------------------: |
| none       |         — |         1.05 |                   ~0% |              21.2/min |
| ×3         |      34 m |         1.76 |                 26.6% |              20.3/min |
| **×4**     |  **28 m** |     **2.05** |             **36.6%** |          **19.5/min** |
| ×4         |      22 m |         2.26 |                 47.5% |              18.3/min |
| ×6         |      24 m |         2.34 |                 50.1% |              18.0/min |

Result against the original problem:

|                               | before |     after |
| ----------------------------- | -----: | --------: |
| mean vehicles on the road     |   1.05 |  **2.05** |
| road completely empty         |  40.9% | **14.6%** |
| ticks with a follower present |    ~0% | **36.6%** |

**Honest judgement on "does the road read as alive":** materially better, not
transformed. Car following now happens more than a third of the time, so the
accordion wave the model exists for actually runs in normal play, and the road is
rarely empty. But at peak hour it shows two to three vehicles, not a stream. A
36 m lane at 13.9 m/s carries about 45 vehicles a minute in total, and 24 of
those must stay convertible, so ~2 average occupancy is the ceiling this road
allows. Reading it as _busy_ traffic would need a longer road or a slower speed
limit, both outside this decision.

### 4.5 A finding that changes what 24/min means

**The road never delivered 24 convertible vehicles a minute, and never had.**
Even with no decorative traffic at all it delivered **21.2/min**, because ~12% of
arrivals are refused when a lane head is occupied. Decorative traffic takes that
to 19.5/min.

The economy is calibrated on 24. The road supplies 19.5. That gap is not
introduced by this phase — it was there from the first measurement — but it is
recorded here because Phase 9 will calibrate revenue against a demand figure that
the road does not actually deliver.

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

### 7.2 Resolved — and the resolution found something better

**Allocation.** Measured 29 B/tick locally against a budget of 8. The budget was
set in Phase 2 when all eighteen system slots were no-ops, so "essentially
nothing per tick" had been calibrated against a pipeline that did nothing. Three
bisection passes could not isolate the source: each of the motion system's three
passes measured 0.17 B/tick alone while the three together measured 16, and no
individual operation inside them allocated on its own.

The owner raised the budget to 32 B/tick on the arithmetic — 580 B/s, about 2 MB
an hour, far below anything that causes the stutter the budget exists to prevent.

**Then CI measured 7.4 B/tick on the same commit.** The 29 is a property of one
developer machine's V8, not of the simulation — which is also why the source
could never be found: there was nothing to find. The raised ceiling stays,
because it stops the gate depending on whose machine runs it, but the number that
describes the code is CI's 7.4 and that is what the baseline records.

**The regression gate.** Re-recording the baseline from CI exposed a deeper
problem: the identical commit re-ran on GitHub Actions six minutes later and
reported itself **47–68% slower**. Taking the minimum of 25 samples removes
scheduler contention but cannot remove a different CPU, and the runner fleet is
heterogeneous.

Every timing is now divided by a calibration workload run in the same process, so
machine speed cancels and the comparison is a ratio. The 15% threshold is
untouched; only the quantity compared changed. The validation is that a baseline
recorded on a laptop now passes on CI — which is what a regression gate has to be
able to do to be worth having.

An earlier attempt gated the comparison to CI only. That was the wrong fix: it
made the gate silent for developers and would still have failed, because the
variance is between runs rather than between machine classes.

### 7.3 Not measured

**No real-GPU frame rate.** The Phase 3 measurement stands and was not re-run.
The 120-vehicle render target still cannot be measured meaningfully at stage 1:
even with decorative traffic the road peaks at about seven vehicles, because
that is what a 36 m lane holds. Measuring 120 needs an artificial stress scene,
and inventing one to produce a number would be measuring the harness rather than
the game.

---

## 8. The time-scale decision — still open, and honestly so

GDD §25 S1 asks how many real minutes make one game day, with 12 as the
candidate, to be decided **by playing**. `MS_PER_GAME_DAY` remains at 12 real
minutes and is still marked provisional.

The density blocker is gone, so the comparison is now possible — but it is a
judgement the roadmap explicitly asks a _human_ to make by playing, about whether
a peak hour feels like a peak and whether a six-minute session shows the rhythm
change. An agent reporting a verdict on that would be fabricating the one thing
the instruction was careful to assign to a person. The machinery is in place:
`?seed=&freezeAt=` and the day curve make an 8/12/18 comparison a few minutes of
play.

---

## 9. What Phase 5 leaves open

1. **The time-scale decision** — a human judgement, made by playing (§8).
2. **Delivered demand is 19.5/min against a calibrated 24** (§4.5). Not
   introduced here, but Phase 9 will calibrate revenue against it.
3. **Real-GPU FPS with traffic** — the road holds ~7 vehicles, so the
   120-vehicle target needs a stress scene rather than gameplay (§7.3).
4. **Phaser WebGL1/WebGL2** — untouched, still open from Phase 3, still not
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

**Phase 5: PASS**, with both blocking items resolved by recorded executive
decision rather than by quietly moving a number.

Worth keeping visible: reporting this phase as PARTIAL first is what produced the
two most useful findings in it. The density measurement led to a design decision
that doubled the road's occupancy, and re-recording the "stale" baseline exposed
a regression gate that had never been able to work on shared runners — and, along
the way, showed that the 29 B/tick allocation problem did not exist outside one
laptop.
