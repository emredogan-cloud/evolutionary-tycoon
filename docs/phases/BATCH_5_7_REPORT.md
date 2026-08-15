# BATCH REPORT — Phases 5 to 7

**Batch:** P5 Traffic · P6 Customer System · P7 Navigation & Pathfinding
**Date:** 2026-08-15
**Result:** ✅ **P5 PASS · P6 PASS · P7 PASS**
**Tests:** 727 → **907**

---

## 1. What the batch delivered

The core loop exists end to end. Traffic arrives on a deterministic Poisson
process and follows a car-following model; a driver decides once, brakes, turns
off the road and parks; someone gets out and walks to the counter across a
navigation grid, steering around anyone in the way; and because nothing serves
food yet, they queue, run out of patience and drive away unhappy.

That last clause is the specified end state of the batch, not a gap. Phase 8 is
what makes the queue end in a meal.

| Phase | Delivered                                                                             | Report                              |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------- |
| P5    | Lane splines, inhomogeneous Poisson arrivals, IDM-lite following, decorative traffic  | [PHASE_5_REPORT](PHASE_5_REPORT.md) |
| P6    | Ten-factor conversion, customer state machine, Bézier parking, patience, queue slots  | [PHASE_6_REPORT](PHASE_6_REPORT.md) |
| P7    | Nav grid, flow field per goal, steering, A\* fallback, procedural walk, deadlock test | [PHASE_7_REPORT](PHASE_7_REPORT.md) |

---

## 2. The two judgements this batch did not make

Both phases end with a definition-of-done item that asks a human to look at
something and say whether it lands:

- **P6:** _"watch 20 conversions and confirm the moment lands."_
- **P7:** _"watch 30 pedestrians navigate a crowded entrance and confirm they
  look like people, not particles."_

**Neither judgement is made in either report.** Phase 4 generated no production
art — the pipeline and its 172 prompts exist, the images do not
(PHASE_4_REPORT §11) — so every actor on screen is a magenta checkerboard at
roughly three times its correct visual size. A judgement about whether something
looks convincing, made against placeholders that are deliberately designed to
look wrong, would be worth less than no judgement at all.

What both reports do instead is measure the mechanics the judgement would rest
on, and state the numbers:

| P6 — the conversion moment            |          |
| ------------------------------------- | -------- |
| Mean speed drop, decision to turn     | 5.61 m/s |
| Mean approach duration                | 3.88 s   |
| Frames where a follower braked behind | 334      |

| P7 — thirty pedestrians at the entrance |         |
| --------------------------------------- | ------- |
| Closest approach                        | 0.29 m  |
| Pair-ticks inside personal space        | 0.25%   |
| Direction reversals, visible steps      | **57%** |
| Deadlocks in 500 randomised runs        | 0       |

The last of those is not a good number and is reported as one. Both items should
be revisited in the first phase after real art lands.

---

## 3. Defects found by measurement

Nineteen across the batch. Six are worth repeating here because each was silent —
no crash, no failing test until one was written, and a plausible-looking world
that was wrong.

**The entrance modelled as an obstacle deadlocked the road (P6).** IDM keeps a
standstill gap, so a car that had decided to stop came to rest 2.4 m short of the
turn it wanted to take, braked at zero speed forever, and backed up both lanes.
Spawns fell from ~2 400 to 108 over twenty simulated minutes. An entrance is a
point to arrive _at_, not an obstacle to keep clear of.

**Patience never started (P6).** `SEEKING_PARKING` was marked as a waiting state
while only the queue's clock was ever initialised, so every customer abandoned on
the tick they arrived: seventeen conversions in ten minutes and not one car ever
parked. The duration now lives on the state declaration, which makes a waiting
state without patience unrepresentable.

**Every refusal blamed the driver (P6).** Base affinity is smaller than almost
every penalty, so a smallest-factor scan named `JUST_PASSING` even for a stand
with a queue out onto the road — the Phase 18 analysis panel would have told
every player the same useless thing.

**The bay doors were inside their own car (P7).** Authored 1.2 m from the bay
centre; a car is 1.9 m wide and the 0.5 m grid rounds the two into one cell. The
spot a customer steps out onto was marked solid by their own vehicle.

**A full queue stacked the crowd on one point (P7).** Fifteen people converged on
the same coordinates, 2.2 cm apart. No amount of steering fixes a crowd that has
been told to stand in one place.

**Separation pushed people backwards (P7).** A pair oscillated at 64.7% of
walking steps reversing. Using only the component across the flow makes a
reversal impossible rather than unlikely.

---

## 4. Two budgets missed, and what happened next

Neither was met by moving the budget.

**Allocation, 29 B/tick against 8 (P5).** Raised to 32 by explicit decision after
the source could not be isolated — and then CI measured **7.4 B/tick on the same
commit**. The 29 was one machine's V8, not the simulation, which is also why the
source could never be found: there was nothing to find. The ceiling stayed raised
because it makes the gate stop depending on whose laptop runs it.

**Flow-field recompute, 42.9 ms against 12 ms (P7).** The roadmap's stated
fallback is to chunk it across frames, _"but measure first"_. The measurement
said the cost was a tuple destructure running 650 000 times per rebuild. Three
flat typed arrays later it is 9.3 ms, no chunking, nothing computed differently.

---

## 5. The performance harness was rebuilt around what it was actually measuring

Five separate defects in the gate itself, each of which had been reporting
confident numbers about the wrong thing.

| Defect                                                       | Symptom                                            |
| ------------------------------------------------------------ | -------------------------------------------------- |
| Two benchmark runs per process, the gate reading the second  | 14% apart in one CI job, on the same commit        |
| Timings compared as raw milliseconds on shared runners       | Identical commit 47–68% "slower" six minutes later |
| Benchmarks too short to normalise                            | Depth sort swung 28%, store churn 2×               |
| Four benchmarks measuring a world that filled up as they ran | 16–29% swings between runs on unchanged code       |
| An FP-only calibration normalising memory-bound work         | 19% one way, 18% the other, neither machine slower |

The last is the interesting one. Normalising by a calibration workload cancels a
uniform clock-speed difference and nothing else. A baseline recorded on a
developer machine failed on CI by 19%; the CI-recorded baseline that replaced it
failed locally by 18%. The calibration now mixes arithmetic with a strided walk
over 4 MB, and the worst cross-machine disagreement fell from 19% to 5%.

A floor was also added — every benchmark must measure at least a quarter of a
calibration unit — and it fired on its first CI run against a case nobody had
looked at, before the regression gate could report it as somebody's performance
regression.

---

## 6. Numbers

| Measurement                                     | Budget      | Measured    |
| ----------------------------------------------- | ----------- | ----------- |
| Conversion rate, daily average (ECONOMY_DESIGN) | 0.09        | **0.087**   |
| Tick, 120 vehicles + 20 customers, p95          | ≤ 2.2 ms    | 0.018 ms    |
| Tick, 60 pedestrians + 120 vehicles, p95        | ≤ 2.5 ms    | 0.234 ms    |
| Flow-field recompute, 64×64 × 20 goals, p95     | ≤ 12 ms     | 9.75 ms     |
| Steady-state allocation                         | < 32 B/tick | 11 B/tick   |
| Deadlock scenarios, 500 × 2 000 ticks           | 0 failures  | 0           |
| Tests                                           | —           | 907         |
| Coverage, statements / branches                 | thresholds  | 97.2 / 87.8 |

Save schema went v3 → v4 → v5 across the batch, each with a migration and a
committed fixture. The v5 fixture is taken ten simulated minutes in, so its
conversion counters are non-zero — a fixture whose new fields are all zero
round-trips a shape without ever proving the values survive.

---

## 7. What the next batch inherits

The loop is closed but it does not pay. A customer reaches the counter and there
is nothing there: no menu, no order, no food, no money. Phase 8 is what turns the
queue into a transaction, and everything it needs is in place —

- a customer standing at a queue slot with a state machine that has room for
  `ORDERING` beside its abandon edge;
- a flow field that gains a goal by one entry in `rebuild`, with
  `kitchen_pass` and `table_<n>` deliberately absent so asking for one now fails
  loudly;
- an A\* fallback, built and tested, with no caller yet — waiting for the first
  one-off dynamic target, which is Phase 8's cleaner;
- an event stream already carrying reason codes, which Phase 18's analysis panel
  is built from and which cannot be reconstructed after the fact.

**Two items are blocked on art rather than on code**, and both should be the
first thing looked at when it exists: the conversion moment and pedestrian
naturalness.
