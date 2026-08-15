# PHASE 6 REPORT — Customer System

**Phase:** 6 — the loop closes
**Date:** 2026-08-15
**Result:** ✅ **PASS** — 834 tests green, all quality gates clean, both goldens generated and reviewed
**Branch:** `phase/6-customer-system`

---

## 1. Result, stated plainly

A vehicle now brakes, indicates, turns off the road, parks, and someone gets out
and walks to the counter — because of geometry the player will be able to change.
Nothing serves them yet, so they queue, run out of patience, walk back and drive
off unhappy. **That is the specified Phase 6 end state**, not a gap: the roadmap's
deployment note for this phase reads _"araçlar duruyor, park ediyor, bekliyor,
sıkılıp gidiyor"_ — vehicles stop, park, wait, get bored and leave.

834 tests pass. Lint, type-check, dependency-cruiser, knip and format are clean.
The performance budget is met with 195× headroom. Both required visual goldens
are generated and were reviewed by eye before being committed.

**One definition-of-done item is not met and cannot be**, and it is stated here
rather than buried: the roadmap asks the implementer to _"watch 20 conversions
and confirm the moment lands"_. That judgement requires production art and
motion. Phase 4 generated none — the pipeline and its 172 prompts exist, the
images do not (PHASE_4_REPORT §11) — so every actor on screen is a magenta
checkerboard three times its correct visual size. **No such judgement is made in
this report.** §8 measures the mechanics the judgement would rest on instead.

## 2. What was built

| Area                    | Detail                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConversionSystem`      | The ten-factor model from GAME_DESIGN_DOCUMENT §9.5; **one roll per vehicle, ever**; reason code on every refusal                              |
| `customerFsm.ts`        | The dine-in branch of §8.1 as a declared graph, with patience durations on the states themselves                                               |
| `CustomerFsmSystem`     | Timers, walking, and the handoffs to the vehicle; every move goes through a guard that refuses an edge the graph does not declare              |
| `VehicleManeuverSystem` | Entry, parking and exit along authored Bézier curves; nearest-free-bay assignment with a deterministic tie-break; the merge back onto the road |
| `QueueSystem`           | Named queue slots, arrival-ordered, closing up when someone leaves — the basic half; capacity and service are Phase 8                          |
| `maneuvers.ts`          | Cubic Béziers from authored poses, flattened into `Polyline` so arc length and constant speed come from the existing mechanism                 |
| `CustomerView`          | Four poses × eight directions, and the patience ring as a pure function                                                                        |
| Layout                  | Four parking bays, six queue slots, the entry and rejoin tie-in points                                                                         |
| Save                    | Schema **v4 → v5**: the conversion funnel counters; migration plus a committed `save-v5.json` fixture                                          |
| Events                  | `CONVERSION_SUCCEEDED`, `CONVERSION_FAILED`, `VEHICLE_PARKED`, `CUSTOMER_SPAWNED`, `CUSTOMER_LEFT_ANGRY` — pooled like the rest                |

### 2.1 The single roll

`P(convert)` is evaluated **once per vehicle**, at a decision point 14 m before
the counter, and the answer is stored in a three-valued field so that "not asked"
and "asked, said no" stay distinguishable.

The determinism argument is the obvious one. The gameplay argument is stronger: a
vehicle that re-tested every tick as it crawled past would convert with
probability approaching 1, so the effective conversion rate would depend on how
slowly a car happened to be moving — **traffic jams would quietly become the best
marketing in the game.**

### 2.2 The reason code

Every refusal carries the factor that hurt most. GAME_DESIGN_DOCUMENT §14.4 makes
"why didn't they stop?" the game's main UX differentiator and Phase 18 builds
that panel entirely from this stream. The factors that produced any given
decision are gone the moment the tick ends, so collecting it later is not
possible; collecting it now costs one comparison per failure.

Decorative traffic is skipped outright rather than rolled and refused. Refusing
would flood the panel with four fifths of all traffic reporting `JUST_PASSING`
and — worse — would tie the conversion RNG to how much scenery is on the road, so
adding a decorative car would change which real cars convert.

### 2.3 Parking is an animation problem

A car leaving a lane for a bay has one sensible path and it is one a person can
author. Each manoeuvre is a cubic Bézier whose control points come from geometry
that is already authored — where the lane is, which way it runs, where the bay
is, which way it faces — with a single authored handle length.

They are flattened into `Polyline` at construction rather than sampled by curve
parameter. A Bézier's `t` is not arc length, so advancing it at a constant rate
moves a car quickly through the straight part of a turn and slowly through the
tight part, which is the opposite of how anyone drives and is obvious on screen.
Flattening reuses the cumulative-length table, the binary search and the
allocation-free `sample` that Phase 5 already tested.

---

## 3. Seven defects found by measurement

Each of these was found by a test or a measurement, not by review.

### 3.1 The entrance as an obstacle deadlocked the road

The approach deceleration was first modelled by giving the follower model a
virtual leader sitting at the entrance. IDM keeps a standstill gap, so a
committed car came to rest **2.4 m short of the turn it wanted to take**, sat
there braking at zero speed forever, and both lanes backed up behind it.

Measured: spawns collapsed from ~2 400 to **108** over twenty simulated minutes,
mean speed 0.00 m/s.

An entrance is a point to arrive **at**, not an obstacle to stay clear of, and
only one of those two things has a minimum gap. Replaced with kinematics —
`v² = u² + 2as` solved for the acceleration that turns the current speed into the
approach speed over the remaining distance. It is the gentlest braking that still
works, so it starts early and eases off.

### 3.2 Patience never started

`SEEKING_PARKING` was marked as a waiting state while only the queue's clock was
ever initialised. Its patience began at zero, so **every customer abandoned on
the tick they arrived**: seventeen conversions over ten simulated minutes and not
one car ever parked.

The fix is structural rather than a missing call. The duration now lives on the
state declaration itself, which makes "a waiting state without patience"
unrepresentable — a waiting state added in a later phase gets its clock without
anybody remembering to wire one up.

### 3.3 A turned-away car reserved a bay it was only driving through

A driver who finds the car park full still turns in — the player has to see the
cost of under-building. That car was routed over bay 0's curve, and
`Math.max(0, -1)` gave it bay 0 as a reservation, so **four bays became three**
the first time anybody was turned away.

Now there is a per-lane pass-through curve across the apron, and `parkingSlot`
stays -1 so such a car reserves nothing.

### 3.4 Every refusal blamed the driver

`baseAffinity` is between 0.22 and 0.34, smaller than almost every penalty, so a
plain smallest-factor scan named `JUST_PASSING` even for a stand with a queue out
onto the road. Affinity is who the driver is, not something that went wrong; only
the modifiers are blameable now.

### 3.5 The novelty floor could not fire

A hand-written floor of 0.75, below the 0.76 a full window can actually reach. A
limit that cannot be reached is a claim the code does not keep. It is computed
from the window and the per-conversion rate now, so the two cannot disagree.

### 3.6 The forced merge could put one car inside another

Waiting indefinitely for a comfortable 16 m gap deadlocks at peak — cars pile up
at the mouth of the lot holding their bays until nothing can convert — but
merging regardless put a car **2.08 m inside** the one ahead, which the follower
model then resolved with a shock wave up the road.

The requirement now relaxes from "comfortable" to "does not overlap" after eight
seconds, and never past it. The bay is released once the car reaches the lane
edge, so a driver still waiting is not holding a space anyone could use.

### 3.7 The schema version was written out by hand

`z.literal(4)` sat beside the `SAVE_SCHEMA_VERSION` constant it duplicated. On
the bump to v5 the composer began emitting saves its own schema rejected — the
same duplication that left the production smoke test asserting `!== 1` three
phases after v1. Derived from the constant now.

---

## 4. The conversion rate

ECONOMY_DESIGN §3 calibrates the Stage 1 economy on a **0.09** conversion rate
with nothing upgraded, and a hard ceiling of **0.22**.

| Measurement                                 | Value      |
| ------------------------------------------- | ---------- |
| Whole-day model average, share-weighted     | **0.087**  |
| Twenty-minute simulated run                 | **9.8%**   |
| At noon (meal-time factor at its highest)   | 0.130      |
| At 03:00 (night visibility, low appetite)   | 0.031      |
| Ceiling, Stage 1, reputation 100, best hour | 0.22 (hit) |

The calibration test asserts the **daily average**, not a single hour. Asserting
the noon figure would have been a test that agreed with the code and disagreed
with the design document.

---

## 5. Performance

| Measurement                             | Budget      | Measured                |
| --------------------------------------- | ----------- | ----------------------- |
| Tick, 120 vehicles + 20 customers, p95  | ≤ 2.2 ms    | **0.0112 ms** (11.2 µs) |
| 1000 ticks, ordinary load               | < 5 ms      | **1.01 ms**             |
| Steady-state allocation                 | < 32 B/tick | **11.1 B/tick**         |
| World hash, 120 vehicles + 60 customers | < 500 µs    | 106 µs                  |

The tick budget is met with **195× headroom**.

### 5.1 The tick got faster, with four more systems in it

Every per-tick system sweeps a store looking for live entities, and Phase 6 added
two more such sweeps. With a capacity of 160 and a dozen cars on the road, 90% of
each sweep was spent finding nothing — measured at 1.4 µs of a 5 µs tick, a third
of the whole empty-tick budget.

`scanLimit` is one past the highest live slot, maintained on spawn and despawn.
The free list hands out low slots first, so the live set stays clustered and the
bound is tight. **Net effect: a tick is 44% cheaper than the Phase 5 baseline
despite four more systems in the pipeline.**

The invariant is one-sided and the tests are built around that: the bound may lag
high after a burst of despawns, costing a few wasted iterations, but it must
never be too low — a bound below a live slot hides an entity from every system at
once, and the symptom is a car that stops moving rather than an error.

### 5.2 What got slower, and why that is correct

The world hash is **104% slower** than the Phase 5 baseline. That is the cost of
Phase 6 state entering the digest: nineteen more fields per customer and four
more per vehicle, each of which can change an outcome. The baseline was
re-recorded rather than the budget moved.

### 5.3 The load the budget is written against

120 vehicles and 20 customers is the desktop cap from TECHNICAL_ARCHITECTURE
§11.2, and **Stage 1's road cannot hold it at realistic spacing** — two 36 m
lanes are 72 m of tarmac against 540 m of car. The benchmark packs them
deliberately tighter than any real run produces.

The first version of that benchmark spawned 120 vehicles and let them drive. A
36 m lane at 13.9 m/s empties in 52 ticks, so by the time the measurement started
the world was back to a dozen cars and the benchmark was quietly reporting the
cost of an ordinary tick. A test now asserts the load is still there after a full
sample.

---

## 6. Tests

| Suite                            | Count | What it pins                                                        |
| -------------------------------- | ----- | ------------------------------------------------------------------- |
| `customer/fsm.test.ts`           | 14    | Graph shape: reachability, terminality, abandon paths, no cycles    |
| `customer/conversion.test.ts`    | 19    | Every factor isolated; the ceiling; the single roll; reason codes   |
| `customer/parking.test.ts`       | 11    | Bay assignment, reservation, the turned-away path, the full funnel  |
| `customer/patience.test.ts`      | 15    | Patience durations, countdown, abandonment, queue order and closing |
| `customer/maneuver.test.ts`      | 17    | Spline endpoints and angles, constant speed, staying inside the lot |
| `customer/moment.test.ts`        | 4     | Deceleration length, arrival speed, brake lights, the wave behind   |
| `render/customerView.test.ts`    | 15    | Sprite selection, poses, the patience ring, what crosses the bridge |
| `sim/stores.test.ts` (additions) | 6     | The scan bound, exhaustively, including an awkward despawn order    |

**Total: 834 tests**, up from 727 at the end of Phase 5.

### 6.1 What the FSM tests actually check

These are properties of the graph's _shape_, and a shape you can only discover by
executing it can only be tested by executing it — which is the entire reason the
machine is declared as data rather than written as a `switch`.

A deadlocked customer does not crash anything. It stands still forever while the
game keeps running, and it is found weeks later by someone noticing the queue
never shortens. "Every state has an exit" is weaker than it sounds: two states
pointing at each other satisfy it and trap the customer between them. The test
that matters is that **every state can reach the terminal state**.

---

## 7. Coverage

| Metric     | Value      |
| ---------- | ---------- |
| Statements | **97.05%** |
| Branches   | **88.58%** |
| Functions  | **97.49%** |
| Lines      | **98.68%** |

All per-layer thresholds hold; none was moved.

---

## 8. The moment — measured, not judged

The roadmap's phase-completion condition asks for a human judgement on whether
the conversion moment lands, and §1 explains why that judgement is not available
in this phase. What can be measured are the mechanics it would rest on. Over ten
simulated minutes on seed 4242, fifteen conversions traced from the decision
point to the turn:

| Measurement                           | Value        |
| ------------------------------------- | ------------ |
| Mean speed drop, decision to turn     | **5.61 m/s** |
| Mean approach duration                | **3.88 s**   |
| Arrival speed at the turn             | > 0 always   |
| Actor-frames showing brake lights     | 33.2%        |
| Frames where a follower braked behind | 334          |

Nearly four seconds of deceleration is long enough to read as a decision rather
than a snap, and 334 frames of followers braking is the accordion wave arriving —
which is the visible consequence, with no UI at all, of the player's stand
existing. That is why the approach deceleration goes through the ordinary
follower model rather than being scripted in the manoeuvre system.

**One observation to carry forward:** brake lights are on for a third of all
actor-frames. That is high enough that they are close to not meaning anything,
and it is worth revisiting when Phase 12 balances traffic density. It is recorded
rather than tuned here, because changing it changes the traffic model and this
phase's numbers were measured against the current one.

---

## 9. Visual goldens

`stage1-first-customer` (tick 4264) and `stage1-queue` (tick 7940) were generated
in the pinned container and **looked at before being committed**, per
TESTING_STRATEGY §8.4. The three existing goldens are byte-identical, which
confirms Phase 6 changed nothing about how the empty lot, the depth test card or
the camera bounds render.

These are the first goldens that photograph a **simulated** state rather than an
authored arrangement. There is no way to author them: a customer standing beside
a parked car is the product of a roll, a braking curve, a manoeuvre and a walk,
and placing one by hand would only prove the renderer can draw a person — which
the depth test card already does.

The cost is that the tick numbers are load-bearing. They come from seed 424242,
the seed every golden already uses, and a balance change will move them and
produce a diff. That is the right amount of friction for a change that moves when
the first customer arrives.

**What the goldens show, honestly:** magenta checkerboard placeholders, several
of them overlapping, at roughly three times the visual size the real art will be.
A customer is present and distinguishable in both. They are fit for their purpose
— catching an unintended render change — and they are not fit for judging whether
the moment lands.

---

## 10. Definition of done — WORKING_DISCIPLINE §4

| #   | Item                               | Status | Evidence                                                  |
| --- | ---------------------------------- | ------ | --------------------------------------------------------- |
| 1   | Feature complete to the phase spec | ✅     | §2; conversion, FSM, manoeuvres, parking, patience, queue |
| 2   | Unit tests                         | ✅     | 834 pass                                                  |
| 3   | Integration tests                  | ✅     | Full funnel, end to end, in `parking.test.ts`             |
| 4   | Determinism suite                  | ✅     | Green; save/resume narrowed and re-verified at schema v5  |
| 5   | Coverage thresholds                | ✅     | §7, none moved                                            |
| 6   | Lint / format / types              | ✅     | Clean                                                     |
| 7   | Architecture boundaries            | ✅     | `depcruise` clean, 93 modules                             |
| 8   | Dead code                          | ✅     | `knip` clean                                              |
| 9   | Performance budget                 | ✅     | §5, 195× headroom                                         |
| 10  | Allocation budget                  | ✅     | 11.1 B/tick against 32                                    |
| 11  | Visual goldens                     | ✅     | §9, generated in the container and reviewed               |
| 12  | E2E                                | ✅     | 11/11 chromium; both Phase 6 tests pass                   |
| 13  | Save migration + fixture           | ✅     | v4 → v5, `save-v5.json` committed with a non-zero funnel  |
| 14  | Documentation                      | ✅     | This report; PROJECT_MEMORY §21 updated                   |
| 15  | **Conversion-moment judgement**    | ❌     | **Not made.** No production art exists — §1 and §8        |

Fourteen of fifteen. Item 15 is not deferred quietly: it is blocked on the same
asset gate PHASE_4_REPORT §11 records, and it should be revisited in the first
phase after real art lands.

---

## 11. Open items carried forward

| Item                                                                               | Owner phase |
| ---------------------------------------------------------------------------------- | ----------- |
| Conversion-moment judgement, once real art exists                                  | post-art    |
| Brake lights on 33% of actor-frames — likely too many to mean anything             | 12          |
| `globalDifficultyCurve` placement relative to the clamp — the two documents differ | 12          |
| `menuAppeal` is a literal 1.0                                                      | 8           |
| `priceFit` is a literal 1.0                                                        | 9           |
| `weatherFactor` is a literal 1.0                                                   | 15          |
| Customers walk in straight lines; the flow field replaces the direction source     | 7           |

### 11.1 The document discrepancy, recorded rather than resolved

GAME_DESIGN_DOCUMENT §9.5 writes `clamp01(product) × globalDifficultyCurve`.
GAME_EXECUTION_ROADMAP Phase 6 and ECONOMY_DESIGN §7 both write
`clamp(product, 0, MAX_CONVERSION[stage])` and do not mention the curve.

The implementation applies the ceiling, then the curve, then the ceiling again.
While `GLOBAL_DIFFICULTY_CURVE` is 1.0 — which it is in this phase and every
phase until balance tuning — all three formulations are numerically identical, so
**nothing in Phase 6 depends on which reading is intended**. The difference
becomes real the first time the curve moves off 1.0, and the decision belongs to
that phase. Recorded here and in `src/config/conversion.ts` so it is found then.

---

## 12. What Phase 7 inherits

Customers exist, walk, queue and leave. They walk in straight lines towards a
target, which is correct today because Stage 1's car park is an open rectangle
with nothing to walk into — the straight line and a flow field agree on it.

Phase 7 replaces the **direction source** and adds separation. The speed, the
arrival test, the queue slots and every state around them stay exactly as they
are: `CustomerFsmSystem.walk` is the one function that changes.
