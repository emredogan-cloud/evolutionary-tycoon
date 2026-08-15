# BATCH 8–10 REPORT — the loop, the economy, and the staff

**Batch:** P8 → P9 → P10, authorised 2026-08-15, executed without stopping between phases
**Result:** ✅ **three technical passes** · ⚠️ **one gate deferred, four judgements not made**
**Branch:** `phase/8-service-loop` · PR [#17](https://github.com/emredogan-cloud/evolutionary-tycoon/pull/17)

---

## 1. What changed, in one line each

| Phase   | Before                                     | After                                                      |
| ------- | ------------------------------------------ | ---------------------------------------------------------- |
| **P8**  | People walked to a counter and stood there | They order, wait, are served, eat, pay — and cash rises    |
| **P9**  | Cash accumulated and did nothing           | Six upgrades, each changing a number, an object and a game |
| **P10** | The player clicked the station forever     | Hire a cook and stop clicking                              |

Measured, twenty minutes, same seed: **29 customers served by a human clicking
every tick; 30 by one cook while nobody touched the controls.**

---

## 2. The numbers

|                          | Batch start (P7) |        Batch end (P10) |
| ------------------------ | ---------------: | ---------------------: |
| Unit + integration tests |              969 |              **1 131** |
| E2E (Chromium + Firefox) |               64 |                **104** |
| Visual goldens           |                8 |                 **11** |
| Performance budgets      |               15 |                 **20** |
| Save schema              |               v5 |                 **v7** |
| Bundle (gzip)            |        428.97 kB | **439.23 kB** / 550 kB |
| Allocation               |      4.19 B/tick | **1.39 B/tick** / 32 B |

Three new performance budgets, all met with an order of magnitude to spare:

| Load                                                           | Budget | Measured p95 |
| -------------------------------------------------------------- | -----: | -----------: |
| service tick (P8) — 120 vehicles, 40 pedestrians, 20 orders    | 2.8 ms | **0.172 ms** |
| staffed tick (P10) — 8 employees, 60 pedestrians, 120 vehicles | 3.0 ms | **0.216 ms** |
| save snapshot                                                  |   8 ms | **0.008 ms** |

`pnpm verify` is clean end to end. **No threshold was lowered and no test was
weakened at any point in the batch.** Coverage failed three times and was fixed
three times by writing tests — each of which found a real gap.

---

## 3. Defects found by measurement, not by crashing

Nineteen across the batch. The ones worth remembering are the ones that produced
no error at all:

| Phase | Defect                                                                                                                                          | How it was found                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| P8    | Orders leaked when their customer left — 30 live orders against 4 customers, then the stand silently stopped taking money                       | A leak check, written because pools always leak eventually |
| P8    | Everybody at the counter ordered at once                                                                                                        | Watching the queue index                                   |
| P8    | **The overlay drew once and froze** — Svelte compares references and the bridge reuses its object                                               | The HUD read ₡0.00 after ten minutes of trading            |
| P8    | **The projector was handed a scene name that does not exist** (`WorldScene` ≠ `world`) so every world marker was silently off screen            | A golden with a working HUD and no bubbles                 |
| P9    | The counter upgrade had three levels, two of which changed nothing                                                                              | The integration test that buys _every level_ and measures  |
| P10   | The task board was O(n²) — 153 seconds for one unit test                                                                                        | An existing test suddenly taking three minutes             |
| P10   | **A `Set`, cleared per tick, cost 123 B/tick against a 32 B budget** — and a separately-reported 44% slowdown was the same object's GC pressure | The allocation gate                                        |
| P10   | The task board ran its full scan on every world with no employees — 57% of a populated tick                                                     | The regression gate, after the above                       |

The pattern across all eight: **nothing threw.** Each produced a plausible wrong
answer or a quiet cost, and each was caught by a gate that exists specifically
because that class of failure is invisible.

---

## 4. Four things the user needs to decide

These are carried in PROJECT_MEMORY §12 and §21. None was resolved during the
batch, and none should have been.

### 4.1 🔴 The Vertical Slice Gate is open

Phase 9 contains the project's most important gate. Of its eight criteria:

- **2 evidenced** — 30 simulated minutes with zero console errors and a heap flat
  at 21.7 MB; save → refresh → load, proved idempotent across two round trips.
- **5 pending human review** — four need three people playing; one (_"is the
  screenshot above the genre average"_) **cannot be judged today**, because every
  actor on screen is a magenta chequerboard.
- **1 not measured** — 60 FPS desktop and 40 mobile on real devices. CI cannot
  measure a frame rate and no real-device run was made.

The user's executive decision authorised proceeding to Phase 10 once the
mechanical criteria passed. That is what happened. **The gate is not declared
passed** — GAME_DESIGN_DOCUMENT calls it "pazarlığa kapalı" and this batch does
not negotiate it.

### 4.2 🔴 Nothing ever waits on the pass

Measured in Phase 8: **zero ticks out of 24 000**. Delivery is automatic and runs
in the same tick as the food becoming ready.

Three phases, three features built and dormant:

| Phase | Feature                            | State                                             |
| ----- | ---------------------------------- | ------------------------------------------------- |
| P8    | Pass plate + temperature indicator | Built, tested, **a player never sees it**         |
| P9    | Cooler upgrade                     | Effect real and measured, **never fires in play** |
| P10   | Waiter role                        | Implemented and tested, **no plate to carry**     |

And hold temperature — the mechanic the roadmap says to "get right now" — never
bites. Two options, neither chosen: make Stage 1 delivery non-instantaneous, or
wait for Phase 11's tables. A test asserts the absence today and will **break**
when it stops being true, which is the signal.

### 4.3 🔴 The throughput target and the economy disagree

The roadmap's Phase 8 metric is 3 customers in 60 seconds. ECONOMY_DESIGN fixes
Stage 1 conversion at 0.09 against ~19.5 convertible arrivals a minute — a
ceiling of **1.8/minute**, with the road rather than the kitchen as the
constraint (18 of the 19 who reached the counter were served, nobody abandoned).

Phase 9's sign lifts that ceiling to roughly 2.3, and a fully upgraded sign to
about 3.2. So the metric is reachable **after investment**. Whether it was meant
to hold from the first minute is the decision.

### 4.4 Four judgements that need eyes and art

| Phase | Question                                    | Status     |
| ----- | ------------------------------------------- | ---------- |
| P6    | Does the conversion moment land?            | NOT JUDGED |
| P7    | Do 30 pedestrians look like people?         | NOT JUDGED |
| P8    | Is the loop satisfying?                     | NOT JUDGED |
| P10   | Do employees look like workers with intent? | NOT JUDGED |

All four are **AWAITING EXTERNAL ART**, per the batch directive: no phase was
blocked on missing art, no procedural art was passed off as final, and no upload
was requested during the batch.

For P10 the mechanical half _was_ measured, and it is not flattering: a cook is
**BLOCKED 98% of the shift**. At 1.8 customers a minute there is about one second
of work every thirty. Whatever the art does, something motionless 98% of the time
will read as a token — and the fix is more work, not better animation.

---

## 5. What was deliberately not done

- **No architecture was changed to fit a feature.** The eighteen system slots and
  their order are unchanged; `UpgradeSystem` and `StaffSystem` are free functions
  precisely because there is no slot for them and adding one is a change request.
- **No approved number was quietly adjusted.** Where a document could not be
  satisfied, it is recorded as a conflict (§4.2, §4.3) or as a reading with the
  ambiguity written down (ECONOMY_DESIGN §6.2's effect table).
- **No golden was accepted without looking at it.** `stage1-queue` was
  **re-derived** to a new tick rather than re-recorded at the old one, because
  Phase 8 gave the counter an exit and tick 10417 no longer photographs a queue.
- **The overlay is in no visual golden.** With DOM text mounted, one golden
  differed between the pinned container and the development host by 4 283 pixels,
  every one of them a glyph. The markers are asserted by test id instead.
- **WebKit smoke was not run locally** — a missing system library on this host —
  and is not reported as passing. It runs in CI.

---

## 6. Status

**P8 = PASS (technical) · P9 = PASS (mechanical, gate deferred) · P10 = PASS (technical)**

**P11+ is not authorised.** The batch ends here, as instructed.
