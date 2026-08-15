# PHASE 8 REPORT — Food / Order / Service Loop

**Phase:** 8 — the loop closes
**Date:** 2026-08-15
**Result:** ✅ **PASS (technical)** — 1 008 tests green, 68 E2E, 9 visual goldens, all budgets met
**Branch:** `phase/8-service-loop`

---

## 1. Result, stated plainly

The game is playable. A car slows, a driver parks, walks to the counter, orders,
waits, is handed food, eats, pays, walks back and drives away — and the number on
the HUD goes up. That is the first time every one of those steps has existed at
the same time.

1 008 tests pass. Lint, format, type-check, dependency-cruiser and knip are
clean. The service tick costs **0.185 ms against a 2.8 ms budget**. Sixty-eight
E2E tests pass on Chromium and Firefox; nine visual goldens pass, generated in
the pinned container and verified byte-identical on this host.

**Three things in this report are not good news and are not buried:**

- The roadmap's headline success metric — three customers served in sixty
  seconds — **cannot be met with the approved economy numbers**. The ceiling is
  1.8/minute and the constraint is the road, not the kitchen. §5.
- Food never sits on the pass. Not rarely — **zero ticks out of 24 000**. Hold
  temperature is implemented, tested and currently unreachable in play. §6.
- Two definition-of-done items are visual judgements that **were not made**,
  because no production art exists. §10.

---

## 2. What was built

| Piece                | Where                                   | What it does                                                  |
| -------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `OrderStore`         | `src/sim/stores/OrderStore.ts`          | Pooled order records; timestamps, never durations             |
| `KitchenSystem`      | `src/sim/systems/KitchenSystem.ts`      | Station reservation, FIFO, prep, the pass                     |
| `ServiceSystem`      | `src/sim/systems/ServiceSystem.ts`      | Ordering, delivery, eating, payment                           |
| `SatisfactionSystem` | `src/sim/systems/SatisfactionSystem.ts` | Wait, quality and price; the rest neutral with TODOs          |
| Menu and stations    | `src/config/economy/`                   | Zod-validated, append-only, three Stage 1 items               |
| `MANUAL_PREP`        | `src/sim/core/commands.ts`              | The player is the cook                                        |
| `UiBridge`           | `src/app/bridge/`                       | The first Svelte↔sim connection, throttled to 10 Hz           |
| Overlay              | `src/ui/components/`                    | Cash HUD, order bubble, progress ring, pass plate, coin popup |

Three systems joined the eighteen-slot pipeline in the documented order:
`KitchenSystem` before `ServiceSystem`, so a plate that finishes this tick is
handed over on the same tick rather than the next.

---

## 3. The bridge, and why it is the interesting part

`src/ui` cannot import `src/sim` — dependency-cruiser enforces it. So the HUD
reads a view model published by `src/app/bridge/UiBridge`, at most ten times a
second.

Two clocks, deliberately:

- **Wall time gates the rate.** Its job is to bound DOM work per real second. At
  4× speed the world moves four times as fast and the player's eyes do not.
- **Simulation time drives the content**, including how far a coin popup has
  floated. A frozen world therefore produces a frozen overlay, which is what
  makes a visual golden of it possible at all. A popup fading on `Date.now()`
  would flake, and at a different rate on CI than here.

Sampling hangs off the **rendered** frame (`RenderContext.onFrame`), not off the
simulation loop. That distinction is load-bearing and was found the hard way: a
frozen scene stops the loop and keeps drawing, so a loop-driven bridge leaves the
overlay stuck on whatever it published before the camera existed.

---

## 4. Seven defects found by measurement

### 4.1 Orders leaked when their customer left

Thirty live orders against four live customers. The pool filled and the stand
silently stopped taking money — which looks exactly like a balance problem.
`discardOrdersFor` now runs when a customer record is released, and wasted food
is counted rather than forgotten (`stats.ordersWasted`).

### 4.2 Everybody ordered at once

A customer stepping up to the counter left the queue, so the next person
compacted into index 0 and ordered on the same tick, and so on. `wantsQueue` now
includes `ORDERING`, so the person being served holds their place.

### 4.3 Customers waiting for food had nowhere to stand

Closest approach 7.9 cm. A waiting area was added, and then corrected three
times, each time by measuring: both sides of the counter made people cross in
front of it (5.4 cm); first-free assignment walked them along occupied rows
(23 cm); nearest-free recomputed every tick made them weave (14.9 cm). Sticky
nearest-free, one side, 1.8 m aisle: **19.5 cm**.

### 4.4 Vehicles could overlap by 4 cm

A finite tick step lets a follower pass through its leader's tail between
integrations. `enforceGaps` clamps to a 5 cm bumper gap. The first attempt
clamped to exactly the bumper — a gap of zero — which the strict assertion
caught.

### 4.5 Ordering took no time at all

The customer reached the counter and was already in the waiting area. There is
now a 1 200 ms beat at the counter, because the moment the player built the whole
stand for should be visible.

### 4.6 The overlay updated once and then froze

The bridge publishes the same object every sample so that it allocates nothing.
Svelte's reactivity is reference-based: assigning an unchanged reference
invalidates nothing, and a `$derived` returning the same object does not re-run
its dependents. The HUD rendered at boot and never again — indistinguishable from
a stopped simulation. Values are now copied out at the component boundary.

### 4.7 The projector was given a scene name that does not exist

`phaserProjector(game, 'WorldScene')` — the registered key is `'world'`. It never
found a camera, quietly answered "not on screen" for every marker, and the first
`stage1-serving` golden came out with a working HUD and no world markers at all.
Nothing threw, because "off screen" is a legitimate answer. The key now comes
from the exported constant, and `tests/unit/app/screenProjector.test.ts` covers
all four not-ready paths.

---

## 5. The throughput conflict — two approved documents disagree

**This needs a decision and one is not taken here.**

GAME_EXECUTION_ROADMAP Phase 8 gives the success metric as:

> _"E2E: 60 saniyede en az 3 müşteri servis ediliyor ve nakit artıyor."_

ECONOMY_DESIGN §3 fixes the Stage 1 conversion rate with zero upgrades at
**0.09**, and PHASE_5_REPORT measured the road at **~19.5 convertible arrivals a
minute**. So:

```
19.5 arrivals/min x 0.09 = 1.755 customers/min
```

Three in sixty seconds is above the ceiling, and **no kitchen improvement can
reach it** — the constraint is upstream of the stand entirely.

Measured over ten minutes, seed 424242:

| Quantity              | Count      |
| --------------------- | ---------- |
| Convertible arrivals  | 195        |
| Conversions succeeded | 21         |
| Turned away, no bay   | 2          |
| **Served**            | **18**     |
| Abandoned             | **0**      |
| Wasted                | **0**      |
| Cash                  | **₡52.34** |

Zero abandoned and zero wasted, with 18 of the 19 who reached the counter served.
The kitchen keeps up with everybody who arrives.

**This may well be the design working.** Stage 1 with nothing bought is meant to
be starved of customers, and the first two Phase 9 upgrades are a hand-painted
sign and a roadside marker — both of which raise conversion. But the roadmap
number cannot hold at Stage 1, and choosing which document moves is not a
decision to take quietly inside a test file.

**Handled as the Phase 5 traffic-density conflict was:** the tests assert what the
economy permits, the conflict is recorded verbatim in the test that would
otherwise have hidden it, and it is carried to PROJECT_MEMORY §12 for a user
decision. Nothing was tuned to make a number go green.

---

## 6. Hold temperature is correct, tested, and currently unreachable

The formula is implemented exactly as the roadmap specifies, including the 0.6
loss ceiling, and asserted term by term against the document in
`tests/unit/sim/service/holdTemperature.test.ts` (8 tests).

It never fires in play. Measured over 24 000 ticks with an attentive cook:

```
ticks with a plate on the pass: 0/24000 (0.00%), max concurrent 0, served 33
```

Not "rarely" — **never**. `KitchenSystem` moves a finished order onto the pass,
and `ServiceSystem` runs in the next slot of the same tick and hands it straight
over, because Stage 1 has no waiters and delivery is automatic. There is no tick
boundary at which a plate is waiting.

That is a direct consequence of the specified design rather than a defect:
Phase 10's employees are what put a delay between "ready" and "delivered", and
the roadmap's own words for this mechanic are that it "will later punish 'many
cooks, too few waiters'" — _later_ being the operative word.

Two consequences, recorded rather than smoothed over:

1. The roadmap's UI item _"Pass'te hazır yemek + sıcaklık göstergesi"_ is built
   (`PassPlate.svelte`, freshness bar, unit-tested) but **a player cannot see it
   in Phase 8**. It is asserted by unit test, not by E2E, because no E2E can
   produce the state.
2. The satisfaction model's quality input is therefore always the recipe base
   times the station factor. Nothing degrades it yet.

---

## 7. Performance

Measured on this host with `pnpm bench:sim`, calibration 0.9124 ms:

| Load                                                   | Budget | Measured p95 | Of budget |
| ------------------------------------------------------ | -----: | -----------: | --------: |
| populated tick — 120 vehicles, 20 customers (Ph. 6)    | 2.2 ms | **0.113 ms** |      5.1% |
| crowded tick — 120 vehicles, 60 pedestrians (Ph. 7)    | 2.5 ms | **0.339 ms** |     13.5% |
| service tick — 120 vehicles, 40 pedestrians, 20 orders | 2.8 ms | **0.185 ms** |      6.6% |

Allocation: **4.83 B/tick** against a 32 B budget.

### 7.1 The baseline moved 18%, and why that is not a regression to fix

`tools/bench/baseline.json` was re-recorded. The populated tick went from 2.7582
to 3.3314 calibration units — **18% slower** — against a baseline recorded at
`82655f2`, which predates the three Phase 8 systems.

Attributed by substitution, after two wrong guesses:

1. `enforceGaps` disabled, benchmark re-run: still 18% slower. Not the cause.
2. `KitchenSystem`, `ServiceSystem` and `SatisfactionSystem` replaced with the
   no-op slots they occupied until this phase: **the regression disappeared
   entirely.**

So it is the cost of adding three systems to the pipeline, `ServiceSystem`
dominating because it visits every live customer every tick. Every absolute
budget passes with an order of magnitude of headroom, so nothing was optimised on
the strength of a figure that is 5% of its own ceiling.

A first attempt to attribute this with a wrapped-system profiler was discarded:
wrapping eighteen `run` methods reported 189 µs/tick against a real cost of
15 µs/tick, so the harness was 92% of what it was measuring. Recorded in
PERF_LOG so the next person does not repeat it.

**No FPS was measured in Phase 8 and none is claimed.** The renderer gained
nothing this phase, and the overlay it did gain is throttled precisely so it
cannot appear in a frame time.

---

## 8. Tests

| Suite                         | Count              |
| ----------------------------- | ------------------ |
| Unit + integration            | **1 008** pass     |
| — kitchen (`kitchen.test.ts`) | 18                 |
| — hold temperature            | 8                  |
| — satisfaction                | 22                 |
| — menu and stations as data   | 8                  |
| — UI bridge                   | 19                 |
| — screen projector            | 8                  |
| — service loop integration    | 10                 |
| E2E (Chromium + Firefox)      | **68** pass        |
| Visual goldens                | **9** pass         |
| Coverage                      | thresholds unmoved |

No threshold was lowered and no test was weakened. Coverage failed twice during
the phase and was fixed by writing tests — `menu.test.ts` and
`screenProjector.test.ts` both exist because the gate said so, and both found
real gaps (the throw paths, and all four camera-not-ready branches).

### 8.1 The exploit test

`tests/unit/sim/service/kitchen.test.ts` runs two identical worlds, one of them
receiving twenty `MANUAL_PREP` commands per tick, and asserts identical
`readyAtMs`. Clicking faster cannot shorten preparation (exploit E9). The finish
time is derived from `startedAtMs + prepTimeMs / speed` rather than counted down,
which is also what makes 1×, 2× and 4× produce the same result.

### 8.2 The deadlock test

All stations busy, queue full, pass full — the loop still progresses. Asserted by
running it, not by inspection.

---

## 9. Visual goldens

Nine, all generated inside the pinned container and all passing on this host.

`stage1-serving` (tick 8280, `cook=1`) is new: five customers, eight vehicles,
₡24.03 taken, one order cooking. `cook=1` is a new visual-determinism parameter —
in Stage 1 the player is the cook, so a fast-forward that issues no commands
arrives at tick 8280 with a queue and a cold kitchen, which would have been a
golden of a stand that is not serving filed under the name `stage1-serving`.

**`stage1-queue` was re-derived, not re-recorded.** Phase 8 gave the counter an
exit: customers now order, step aside and leave, so the queue drains continuously
and tick 10417 no longer photographs anything interesting. The busiest the
counter now gets is four people, at **tick 5309**, one of them down to 9.8% of
their patience. Third re-derivation of this golden (7940 → 10417 → 5309), and for
the third time the tick moved because the thing it photographs moved.

**The overlay is deliberately not in any golden.** It was, briefly: with the DOM
mounted, `stage1-serving` differed between the pinned container and this host by
**4 283 pixels, every one of them a glyph**. The canvas matched exactly.
`system-ui` resolves differently in the two images and font rasterisation is not
portable even when the family is. Rather than accept a host-specific golden, the
markers are asserted by test id in `tests/e2e/serviceLoop.spec.ts` — stricter than
a screenshot, and it does not go stale when a font does.

---

## 10. Definition of done — WORKING_DISCIPLINE §4

| #   | Item                           | Status | Evidence                                            |
| --- | ------------------------------ | ------ | --------------------------------------------------- |
| 1   | Feature complete to phase spec | ✅     | §2; §6 notes one UI item unreachable by design      |
| 2   | Unit tests                     | ✅     | 1 008 pass                                          |
| 3   | Integration tests              | ✅     | `serviceLoop.test.ts`, 10 tests                     |
| 4   | Determinism suite              | ✅     | Green                                               |
| 5   | Coverage thresholds            | ✅     | §8 — none moved, two gaps closed with tests         |
| 6   | Lint / format / types          | ✅     | Clean                                               |
| 7   | Architecture boundaries        | ✅     | `depcruise` clean, 117 modules                      |
| 8   | Dead code                      | ✅     | `knip` clean — six dead exports removed             |
| 9   | Performance budgets            | ✅     | §7 — 0.185 ms against 2.8 ms                        |
| 10  | Allocation budget              | ✅     | 4.83 B/tick against 32                              |
| 11  | Visual goldens                 | ✅     | §9 — 9 pass, one re-derived with reasoning          |
| 12  | E2E                            | ✅     | 68 pass, Chromium + Firefox                         |
| 13  | Save migration                 | n/a    | Orders are not persisted; schema unchanged at v5    |
| 14  | Documentation                  | ✅     | This report, PERF_LOG, PLACEHOLDER_REGISTER, memory |
| 15  | **Is the loop satisfying?**    | ⚠️     | **Not judged — awaiting external art.** §11         |

Fourteen of fifteen, with the same class of blocked item as Phases 6 and 7.

**WebKit smoke was not run on this host.** Playwright's WebKit cannot launch here
— a missing system library (`libevent-2.1-7t64`) — and installing system packages
is out of scope for a phase. It runs in CI. This is stated rather than reported
as a pass.

---

## 11. The judgement that was not made

The roadmap asks whether the loop is _satisfying_. That is a question about how
it feels to watch a customer arrive, order and pay, and it depends almost
entirely on art that does not exist: the food icons are placeholders, the
customers are magenta chequerboards, and the order bubble is a dashed magenta box
with the word `SOSİSLİ` in it.

**NOT JUDGED: AWAITING EXTERNAL ART.**

What can be said without art is mechanical and is said above: the loop closes,
nobody is dropped, the arithmetic is right to six decimal places, cash is net of
ingredient cost, and every stage is visible in the DOM.

One thing is worth flagging for whoever does make that judgement. At 1.8
customers a minute, **the stand is idle most of the time**. Whether that reads as
"a quiet roadside stand waiting for its first upgrade" or as "nothing is
happening" is exactly the judgement art and pacing decide, and it is the same
question as §5 seen from the player's side rather than the spreadsheet's.

---

## 12. Open items carried forward

1. **The throughput conflict (§5)** — needs a user decision. Either the roadmap's
   "3 in 60 s" moves, or ECONOMY_DESIGN's Stage 1 conversion rate does, or the
   metric is restated as post-upgrade. Recorded in PROJECT_MEMORY.
2. **Hold temperature is dormant (§6)** — becomes live in Phase 10. If it does
   not, the mechanic is decorative and that should be noticed then.
3. **Satisfaction's four neutral inputs** — cleanliness, atmosphere, service and
   accessibility all score 1.0 with TODOs naming their phases. A perfect score is
   currently reachable and correct; it stops being so in Phase 11.
4. **The order bubble and pass plate are placeholders** — registered in
   PLACEHOLDER_REGISTER, the first entries there that are not files.

---

## 13. What Phase 9 inherits

A closed loop with money in it, a bridge to a Svelte overlay that updates, and
six economic numbers that are already Zod-validated in `src/config/economy`. The
two upgrades that raise conversion — the sign and the roadside marker — land
directly on the constraint measured in §5, which makes Phase 9 the first chance
to find out whether that ceiling was the design or a mistake.
