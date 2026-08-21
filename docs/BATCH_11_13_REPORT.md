# BATCH 11–13 REPORT — Evolution, Balance, Tree

**Phases:** 11 (Restaurant Evolution) · 12 (Economy Balancing & Balance Simulator) · 13 (Upgrade System v2)
**Date:** 2026-08-16
**Result:** ✅ **three technical passes** — 1 319 tests, 128 E2E, 14 goldens, 21 perf budgets, economy gate green
**Branch:** `phase/11-evolution`, stacked on `phase/8-service-loop`

---

## 1. What the batch was for

Phase 11 gave the game its four stages. Phase 12 turned the economy into
something CI can fail a build over. Phase 13 gave the player thirty decisions to
make inside it. Individually they are three roadmap phases; together they are the
difference between a stand that works and a game that has a shape.

The measurable version of that:

|                                  | Before the batch   | After                              |
| -------------------------------- | ------------------ | ---------------------------------- |
| Stages that exist in the world   | 1                  | **4**, plus a drive-thru           |
| Menu items                       | 3                  | **13**                             |
| Upgrades                         | 6                  | **30**, across five families       |
| Stage 1 net income (day average) | ₡8.3 / min         | **₡12.8 / min** (designed ₡15)     |
| Time to Stage 2                  | never, or 46.7 min | **21.4 min** (window 10–22)        |
| Mean counter queue               | 0.00               | **0.38**                           |
| Economy assertions in CI         | 0                  | **11**, one of them merge-blocking |
| Tests                            | 1 180              | **1 319**                          |

---

## 2. The three findings that were worth more than the features

### 2.1 Reputation started at the bottom of its own scale

`reputationFactor` maps reputation 0..100 onto a published **0.60..1.40**
multiplier. A band written that way has a neutral point, and it is the middle.
Reputation started at **zero** — so "a stand nobody has heard of" and "the worst
reputation in the game" were the same state, and every new stand converted at 60%
of what its own factors said. It climbed out at 0.13 points per customer: about
**390 customers to reach neutral**.

The knock-on was worse than the conversion loss. Stage 3 requires reputation 40;
a fully-upgraded Stage 1 stand measured **38.7 after a hundred simulated
minutes**. Stage 3 was not slow to reach. It was unreachable.

### 2.2 The game will let you evolve into a stage you cannot operate

Evolution _spends_ the threshold. A stand holding ₡804 that accepts a ₡800
transition opens Stage 3 with ₡4 — and Stage 3 serves food to tables, which needs
a waiter it can no longer afford. Measured over twelve hours: **414 customers
served, then a flat line from ninety-two minutes to the end of the run**. The
cooks walked out unpaid six minutes later. Zero income, zero staff, no way back.

Nothing in the game objected, because cash never went negative — the rule that
exists to prevent unrecoverable states is about _debt_, and this stand had none.
Raised as a change request, not patched.

### 2.3 Two benchmarks were measuring the wrong thing

The **allocation** benchmark read a heap delta across a forced GC, which also
counts growth in the live set. Phase 12 doubled the customers on the lot and the
figure went from 12 to 49 bytes a tick against a 32-byte budget without a line of
tick code changing. Bisecting by system proved it: skipping `TimeSystem`, which
allocates nothing at all, _quadrupled_ the number, because removing the day curve
leaves traffic at its peak all night. Replaced with V8's sampling heap profiler
and the same budget: **0.113 B/tick**.

The **car park** was measuring nothing at all until something drew it. Phase 11's
Stage 3 and 4 rows were authored at three-metre centres for 4.5 m cars — every
neighbouring pair overlapping by 1.5 m — and nothing objected, because a parked
car is placed by its manoeuvre rather than pathfound into its bay.

---

## 3. Phase by phase

### Phase 11 — Restaurant Evolution → [report](phases/PHASE_11_REPORT.md)

The stand becomes a restaurant **in place**: no scene change, no camera cut, and
the first stand still standing in the corner of Stage 4. Progression gated on
cash _and_ a milestone; construction that takes twelve to thirty seconds of
simulated time; a drive-thru with its own lane, patience and manoeuvres; build
mode with a ghost that turns red before the click rather than after it.

Design questions **S4** (grid-snapped placement) and **S5** (player-confirmed
transitions) decided from measurements, and one of the two arguments for S4 was
**not supported by the data** and is recorded as unsupported rather than dropped.

Found and fixed: the renderer was hardwired to Stage 1's layout, so every later
stage existed in the simulation and nowhere on screen.

### Phase 12 — Economy Balancing → [report](phases/PHASE_12_REPORT.md)

`tools/balance-sim`: five policies, ten assertions, a merge-blocking CI job, and
a report regenerated on every run so a config change shows up as a **diff in the
numbers**. Twelve simulated hours in about four seconds a policy.

The starvation the directive named is fixed **entirely in config** — reputation's
starting point and neutral point, archetype affinities, the upgrade ladder,
traffic, and Stage 1 prices scaled with their ingredient costs so every published
margin is unchanged. No mechanic was touched, which is what makes the gate mean
anything.

The measuring is the phase's other half: the "no purchase reduces income"
assertion took **three attempts**, and the two wrong ones both looked reasonable.

### Phase 13 — Upgrade System v2 → [report](phases/PHASE_13_REPORT.md)

Thirty upgrades across the design's five families with prerequisite chains, ten
new effect kinds each wired to exactly one consumer, and a test that **reads
`src/sim`** to prove none of them is inert. The build menu maps the tree; the card
explains two different kinds of no; the bursts differ by shape rather than only
by colour.

The tree alone was not enough — **the menu stopped at Stage 1**, so a Stage 3
diner sold lemonade at lemonade prices. The rest of §4's fourteen items are in,
and `MenuItem.stage`, which had existed since Phase 8 and which nothing read, is
wired.

Proven rather than asserted: **2, 4 and 3 distinct investment paths** leave
Stages 1, 2 and 3, and **12 to 26 upgrades remain unbought after six hours**.

---

## 4. What is green, and what is honestly not

**Green:** `pnpm verify` end to end — lint, format, three TypeScript projects and
svelte-check across 303 files, dependency-cruiser over 155 modules, knip,
the asset pipeline, 1 319 tests with unmoved coverage thresholds, the economy
gate, 21 performance budgets, the build and the bundle budget. Plus 128 E2E
across Chromium and Firefox, and 14 visual goldens.

**Not green, and not hidden:**

|                              |                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WebKit**                   | cannot launch on this machine — `libevent-2.1-7t64`, which needs root. Not run, so nothing is claimed. It runs in the pinned CI container.                                        |
| **Three players, one hour**  | **not done.** An agent cannot run a playtest, and the game is drawn entirely in placeholder art. No substitute is claimed.                                                        |
| **Two balance assertions**   | not evaluable: the designed average ticket is arithmetically out of reach with one item per order. The blocker is _computed_, so they unblock themselves when the decision lands. |
| **Art-dependent judgements** | five of them now, from Phases 6, 7, 8, 10 and 11. All **NOT JUDGED: AWAITING EXTERNAL ART**.                                                                                      |
| **Vertical slice gate**      | still open from Phase 9: two of eight criteria proved, five need people, one needs real hardware.                                                                                 |

---

## 5. Change requests raised, not acted on

WORKING_DISCIPLINE §6: a published design number changes by decision, not by
edit. All four are printed in `docs/BALANCE_REPORT.md` on every run.

1. **§3's average ticket and §4's prices disagree** under one-item orders. Phase
   12 scaled prices to close Stage 1; the real fix is weighted or multi-item
   orders, and it is what blocks two assertions.
2. **§13 and §5.1 contradict each other on the idle player.** §13 asks every
   policy to reach Stage 2 in 10–22 minutes; §5.1 makes the cook a Stage 2 role,
   so Stage 1 cannot be automated at all. Measured: **95 minutes** idle against
   21 attentive.
3. **Evolution can strand the player.** §2.2 above.
4. **`roadside-marker` was removed**, having measured as _costing_ revenue at
   every level on every seed. A converted driver reserves a parking bay the
   moment they decide, so moving the decision up the road held one of four bays
   for the whole drive down the lane. The REACH family is empty until Phase 13's
   successor gives it an effect that does not trade reach for capacity.

---

## 6. What the next phase inherits

A game with four stages that are visibly different, an economy that is a testable
contract, and thirty upgrades that measurably do something. The three things it
cannot inherit are people to play it, art to look at, and the four decisions
above.
