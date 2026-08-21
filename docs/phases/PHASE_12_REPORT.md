# PHASE 12 REPORT — Economy Balancing & Balance Simulator

**Phase:** 12 — the economy becomes a testable contract
**Date:** 2026-08-16
**Result:** ✅ **PASS (technical)** — 1 218 tests, 5 balance assertions, 114 E2E, 14 goldens, 21 perf budgets
**Branch:** `phase/11-evolution` (batch branch — P11, P12 and P13 ship together)

---

## 1. Result, stated plainly

There is now a **merge gate on the economy**. `pnpm balance:check` plays ten
simulated hours in six seconds, judges the result against the ten assertions of
ECONOMY_DESIGN §13, and fails the build if the pacing leaves its designed
envelope. That is the phase's deliverable — the simulator is the easy half.

And the starvation the executive directive named is fixed, in config, with no
mechanic changed:

| Measure                              | Before Phase 12 | After           | Design          |
| ------------------------------------ | --------------- | --------------- | --------------- |
| Stage 1 net income (day average)     | **₡8.3 / min**  | **₡12.8 / min** | ₡15 ceiling     |
| Time to Stage 2 (spendthrift player) | **46.7 min**    | **21.2 min**    | 12–18 target    |
| Time to Stage 2 (budgeted policies)  | never reached   | **21.4 min**    | 10–22 assertion |
| Mean counter queue                   | **0.00**        | **0.38**        | must form       |
| Zero-upgrade conversion              | 0.104           | **0.090**       | 0.09            |
| Fully-upgraded conversion            | 0.203           | **0.211**       | 0.22            |
| Reputation after 100 min             | 38.7 (of 100)   | **~52**         | 50 is neutral   |

**Six things worth saying out loud:**

- **Reputation started at zero**, which `reputationFactor` maps to the _worst_
  multiplier in the game. Every new stand converted at 60% of what its own
  factors said. §4.1.
- **Stage 3 was unreachable.** It requires reputation 40; a fully-upgraded Stage
  1 stand measured 38.7 after a hundred minutes. §4.1.
- **One upgrade was measurably harmful** and has been removed. §4.4.
- **The game will let you evolve into a stage you cannot operate**, and the run
  that did it never recovered. §6.
- **The allocation benchmark was measuring the economy, not the code.** §7.
- **Four change requests are raised, not acted on.** §8.

---

## 2. What was built

```
tools/balance-sim/
  types.ts        the policy contract and the result shape
  runner.ts       plays one policy against the real src/sim, headless
  policies/       greedy-cheapest · roi-optimal · throughput-first · margin-first · idle-player
  experiment.ts   paired A/B runs that measure what an upgrade is worth
  assertions.ts   the ten, as data rather than as expect() calls
  report.ts       docs/BALANCE_REPORT.md + docs/balance/curves.csv
tests/balance/economy.test.ts      the gate
vitest.balance.config.ts           its own runner, for its own wall-clock budget
.github/workflows/ci.yml           a merge-blocking job
```

**Speed.** 4.84 µs per simulated tick, so twelve simulated hours cost about four
seconds per policy. The whole gate — five policies × two hours, plus thirty
paired upgrade experiments — runs in **6.2 s against a 90 s budget**, and the
suite asserts that budget on itself so a slowdown is caught as a slowdown rather
than fixed by quietly simulating less.

---

## 3. The ten assertions

From `docs/BALANCE_REPORT.md`, twelve simulated hours per policy:

|     | Assertion                              | Measured                              |
| --- | -------------------------------------- | ------------------------------------- |
| ⊘   | Stage 2 in 10–22 min                   | Stage 2 has no content of its own yet |
| ⊘   | Stage 3 in 28–70 min                   | Stage 3 has no content of its own yet |
| ⊘   | Stage 4 in 140–320 min                 | Stage 4 has no content of its own yet |
| ✅  | Net income within ±25% of the envelope | Stage 1 ₡12.8/min against ₡15         |
| ✅  | **Cheapest upgrade ≤ 90 s of income**  | worst 68 s                            |
| ✅  | No purchase reduces revenue            | worst Δ +0.0                          |
| ✅  | Best/worst policy ≤ 2.5×               | 1.0×                                  |
| ✅  | Income < ₡600/min after 12 h           | peak ₡37.1/min                        |
| ✅  | Cash never negative                    | lowest ₡0.0                           |
| ⊘   | Stage 4 content remains after 6 h      | no run reached Stage 4                |

**`⊘` is not a pass.** Three of the ten are about stages with **no content**:
three of the design's fourteen menu items exist, and five of its upgrades, all
Stage 1. An assertion with nothing to look at is reported as not-evaluable and
listed by name in a test that pins the set, so the gate cannot go quietly green
over a hole. Phase 13 builds the tree; the menu is change request §8.2.

---

## 4. The tuning, and what each number was

Every change below is a **config constant**. No mechanic was changed, which is
the directive's own constraint and also the only way the gate means anything.

### 4.1 Reputation started at the bottom of its own scale

`reputationFactor` maps reputation 0..100 onto a **0.60..1.40** multiplier
(ECONOMY_DESIGN §9). A band written that way has a neutral point in the middle.
Reputation started at **zero** — so "no history yet" and "the worst reputation in
the game" were the same state, and every new stand converted at 60% of what its
factors said. It climbed out at 0.13 points per customer served: roughly **390
customers to reach neutral**.

The knock-on was worse than the conversion loss. Stage 3 requires reputation 40;
a fully-upgraded Stage 1 stand measured **38.7 after a hundred simulated
minutes**. Stage 3 was not slow, it was unreachable.

`STARTING_REPUTATION = 50`, and `REPUTATION.neutral` moved from 0.6 to 0.9 so
reputation settles instead of accumulating — before, it ran to **92** and handed
a mature stand a permanent 1.33× bonus.

### 4.2 The archetype affinities were set against that handicap

With the handicap removed, the zero-upgrade conversion rate measured **0.1195
against the 0.09 §3 calibrates on**. The four `baseAffinity` values were scaled
by 0.75, which puts it back on the design at **0.090**.

### 4.3 The upgrade ladder broke the dead-end rule

ECONOMY_DESIGN §8: the cheapest meaningful upgrade may never cost more than
ninety seconds of income. The Stage 1 ladder was **12, 28, 45, 40, 60, 35** — one
cheap rung and then a cliff. Measured: **172 seconds** at fifteen minutes.

Rescaled to **6, 8, 10, 11, 13, 16**, which also brings the first three inside
the ₡55 in-stage budget §3 costs the stage against. Measured now: **68 seconds**.

### 4.4 One upgrade was making things worse

The paired experiment (§5) measured every level of `roadside-marker` as _costing_
revenue. The mechanism is worth writing down because it will catch the next
person: **a converted driver reserves a parking bay the moment they decide**, not
when they arrive. The marker moved the decision thirty metres further up the
road, so it held one of Stage 1's four bays for the whole drive down the lane —
and parking is what limits Stage 1 at peak.

Removed rather than weakened: §6.3 says an upgrade ships only with an effect the
player notices inside sixty seconds, and a negative one does not ship. Phase 13
owns the REACH family; the constraint it inherits is that reach must not reserve
capacity early.

### 4.5 Traffic delivered 19 of the designed 24 arrivals a minute

The spawn process produced exactly 24 convertible arrivals per real minute and
the road refused **24% of them** at an occupied lane head. Attempted rate raised
to 28 and the decorative multiplier halved to 2, which delivers **23.7/min** —
the design's own number — while leaving the road's mean occupancy where it was
(5.2 vehicles) because the old setting was saturating and dropping most of the
decorative stream anyway.

Pushing further was tried and rejected: at 42 attempted the road **jams**, the
day curve flattens from 19× peak-to-trough to 2.8×, and the peak-hour multiplier
the economy depends on stops existing.

### 4.6 The average ticket

₡3.85 against a designed ₡4.50, and it accounts for the _whole_ of the remaining
income gap: ₡10.6 × (4.50/3.85) = ₡12.4, inside the band. §4 publishes ₡3, ₡5 and
₡2 and the simulation picks between them uniformly, which averages ₡3.33 — so §3
and §4 cannot both be right as implemented.

The three prices **and their three ingredient costs** were scaled together by
4.50 / 3.33, which lands the average on ₡4.50 exactly and leaves every published
margin unchanged (73%, 64%, 75%). Recorded as change request §8.1: when the menu
is complete and choice is weighted by the `appealTags` §4 already carries, they
should go back to ₡3 / ₡5 / ₡2.

---

## 5. Measuring an upgrade, three ways, two of them wrong

The "no purchase reduces income" assertion took three attempts, and the wrong
ones are worth recording because both looked reasonable.

**Attempt 1 — the income curve before and after.** Reported **five of the first
eleven purchases as regressions**. None were. A policy buys when it has cash, and
it has cash just after a good minute, so the next minute is worse whatever it
buys; and the day curve swings by 2.2× over twelve real minutes, so two readings
two minutes apart are routinely two different economies.

**Attempt 2 — a paired run on one seed.** Two runs from the same seed, one
buying. The noise cancels rather than averaging, because both arms saw the same
arrivals. It reported `roadside-marker` at **−5.9%** — but an upgrade that changes
_when_ a driver decides also changes the order of every later RNG draw, so the
arms diverge in sequence while staying identical in distribution.

**Attempt 3 — paired runs across three seeds.** The divergence noise averages
below the 2% tolerance while a genuine effect stays obvious: the sign measures
**+19%**. And `roadside-marker` still measured negative at every level, on every
seed — which is how §4.4 was decided rather than argued.

---

## 6. The finding that cost the most: evolving into a stage you cannot open

Evolution **spends** the threshold. A stand holding ₡804 that accepts Stage 3 is
left with ₡4 — and Stage 3 serves food to tables, which needs a waiter it cannot
now afford. Measured over a twelve-hour run: **414 customers served, then a flat
line from ninety-two minutes to the end**. Six minutes after the transition the
two cooks walked out unpaid. Zero income, zero staff, zero customers, no way
back.

Nothing in the game objected, because cash never went negative — the rule that
exists to stop exactly this class of unrecoverable state is about _debt_, and
this stand had none.

The simulator's policies were taught to keep an opening float, which is what a
player would do. **The hazard itself is untouched and is change request §8.4**,
because a real player will do what the policy did.

---

## 7. The allocation benchmark was measuring the economy

`pnpm bench:sim` reported allocation rising from **12 to 49 bytes a tick** against
a 32-byte budget, without a line of tick code changing.

It was a heap delta: force a GC, run 200 000 ticks, divide the change in
`heapUsed`. Two things are wrong with that, and only the first was known. Runtime
bookkeeping inflates it — handled by taking the minimum of five samples. And a
delta across a forced collection also includes **growth in the live set**, which
no number of samples removes: Phase 12 roughly doubled the customers on the lot.

Bisecting by system proved the measurement rather than the code was at fault:
skipping `TimeSystem`, which allocates nothing at all, **quadrupled** the figure —
because removing the day curve leaves traffic at its peak all night.

It now uses **V8's sampling heap profiler** and counts only bytes attributed to a
frame inside `src/`. Same budget, unchanged: measured **0.113 B/tick**, worst
sample 1.17. That is the number TECHNICAL_ARCHITECTURE §11.1's "0 B/tick" was
always asking for, and the old instrument could not have shown it either way.

One real allocation was found and removed on the way: `parkingGoal(bay)` built a
template string on every tick for every customer walking back to their car. It
is interned now.

---

## 8. Change requests — raised, not acted on

WORKING_DISCIPLINE §6: a published design number changes by decision, not by
edit. All four are also printed in `docs/BALANCE_REPORT.md`.

1. **§3's ₡4.50 average ticket and §4's prices disagree** under uniform item
   choice. Phase 12 scaled the prices to close it; the real fix is weighted
   choice from the `appealTags` §4 already carries. §4.6.
2. **Stages 2–4 have no content.** Three of fourteen menu items exist. Three
   assertions cannot be evaluated until they do.
3. **§13 and §5.1 contradict each other on the idle player.** §13 asks every
   policy to reach Stage 2 in 10–22 minutes; §5.1 makes the cook a Stage 2 role,
   so Stage 1 cannot be automated at all. Measured: **95 minutes** for
   `idle-player` against 21 for an attentive one. The stage-timing and dead-end
   assertions are evaluated over the four strategic policies for that reason,
   with the idle figures reported alongside rather than filtered away.
4. **Evolution can strand the player.** §6.

---

## 9. Definition of done — WORKING_DISCIPLINE §4

| #   | Item                           | Status | Evidence                                                           |
| --- | ------------------------------ | ------ | ------------------------------------------------------------------ |
| 1   | Feature complete to phase spec | ✅     | §2; 5 policies, 10 assertions, CI gate, report                     |
| 2   | Unit tests                     | ✅     | 1 218 pass                                                         |
| 3   | Integration tests              | ✅     | plus 5 balance-gate tests in their own suite                       |
| 4   | Determinism suite              | ✅     | green; the gate asserts run-to-run reproducibility itself          |
| 5   | Coverage thresholds            | ✅     | none moved                                                         |
| 6   | Lint / format / types          | ✅     | clean, 301 files, 0 warnings                                       |
| 7   | Architecture boundaries        | ✅     | `depcruise` clean                                                  |
| 8   | Dead code                      | ✅     | `knip` clean                                                       |
| 9   | Performance budgets            | ✅     | 21 pass; the allocation instrument was replaced, not the budget    |
| 10  | Allocation budget              | ✅     | **0.113 B/tick** against 32 — §7                                   |
| 11  | Visual goldens                 | ✅     | 14 pass; 8 regenerated because the _world_ changed, not the render |
| 12  | E2E                            | ⚠️     | 114 pass Chromium + Firefox; **WebKit cannot run on this host**    |
| 13  | Save migration                 | ✅     | none needed — no schema field changed                              |
| 14  | Documentation                  | ✅     | this report, BALANCE_REPORT, ECONOMY_DESIGN §15, PROJECT_MEMORY    |
| 15  | **Three players, one hour**    | ❌     | **NOT DONE.** §10                                                  |

### 10. The human validation was not done

The roadmap asks for three real people playing for an hour, watching for "I don't
know what to buy", "nothing is happening", "I'm just waiting". **That did not
happen, and no substitute is claimed.** An agent cannot run a playtest, and the
game is still drawn entirely in placeholder art — the two things a tester would
react to first are the same two things that are not there yet.

What exists instead is the measurement: every automated assertion, and the
`idle-player` figures that say plainly that somebody checking in every five
minutes has a **four times slower** Stage 1 than somebody at the controls.
Whether that _feels_ like idle play or like being punished is exactly the
question three people would answer.

---

## 11. Open items carried forward

| Item                                        | Where                            |
| ------------------------------------------- | -------------------------------- |
| Stages 2–4 upgrade tree                     | **Phase 13** (this batch)        |
| Menu items 4–14 and weighted item choice    | change request §8.1              |
| Idle player cannot progress through Stage 1 | change request §8.3              |
| Evolution can strand the player             | change request §8.4              |
| Three players, one hour                     | needs people and art             |
| `priceFit` still a placeholder 1.0          | so pricing cannot be exercised   |
| WebKit smoke on this host                   | needs `libevent-2.1-7t64` (root) |
