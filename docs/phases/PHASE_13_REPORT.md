# PHASE 13 REPORT — Upgrade System v2 (Full Tree)

**Phase:** 13 — the tree becomes a decision
**Date:** 2026-08-16
**Result:** ✅ **PASS (technical)** — 1 319 tests, 128 E2E, 14 goldens, 21 perf budgets, balance green
**Branch:** `phase/11-evolution` (batch branch — P11, P12 and P13 ship together)

---

## 1. Result, stated plainly

**Thirty upgrades, five families, four stages**, with prerequisites that make each
family read as one object growing up: a painted sign becomes a lit one, becomes
neon, becomes a pylon on the roadline. Every one of them carries the four
properties §13.1 demands, and a test fails the build if any is missing.

The two questions the phase exists to answer are both answered by measurement:

- **Is it a tree or a corridor?** The balance simulator reports **2, 4 and 3
  distinct purchase sets** leaving Stages 1, 2 and 3 — the roadmap's "at least
  two valid investment paths per stage", proven rather than asserted.
- **Does the content run out?** Phase 12's assertion was `⊘` for want of anything
  to buy. It now passes: **12 to 26 upgrades still unbought after six hours**.

**Five things worth saying out loud:**

- The tree alone was not enough. **The menu stopped at Stage 1** — three of the
  design's fourteen items — so a Stage 3 diner sold lemonade at lemonade prices
  and no upgrade could fix it. The rest of §4 is now in. §3.
- **`MenuItem.stage` had existed since Phase 8 and nothing read it.** §3.
- Ten new effect kinds were added, and a test now **reads `src/sim` to prove each
  one has a consumer**. §4.
- A drive-thru customer who gave up **kept their lane slot**, deadlocking the
  lane behind them. Found because the longer menu made anyone run out of patience
  at all. §6.
- Two assertions remain **not evaluable**, and the blocker is now _computed_
  rather than asserted: the average ticket the design builds on is arithmetically
  out of reach with one item per order. §7.

---

## 2. The tree

| Family                                       | Upgrades | Runs from                                                  |
| -------------------------------------------- | -------: | ---------------------------------------------------------- |
| Görünürlük & Çekicilik (`VISIBILITY_APPEAL`) |        6 | painted sign → lit sign → neon → pylon                     |
| Mutfak (`KITCHEN`)                           |        8 | prep bench, cooler → heat lamp, ingredients → oven         |
| Kapasite & Alan (`CAPACITY`)                 |        7 | counter → barriers → forecourt; canopy → benches → terrace |
| Drive-thru (`DRIVE_THRU`)                    |        4 | lane → second post; window → card reader                   |
| Personel (`STAFF`)                           |        5 | shoes → headsets; training → staff room → supervisor       |

**Data, not code.** There is no `switch` on an upgrade id anywhere in `src/sim`
and there must never be. An upgrade is `{ id, family, stage, cost, prereqs,
effects, visual }`; adding one is editing an array. Adding a _kind_ is the only
thing that touches a system, and each kind is read in exactly one place.

---

## 3. The tree was not the blocker — the menu was

Building the tree made three balance assertions _evaluable_ for the first time,
and they immediately failed. Not because of the tree:

```
stage 2 income  ₡16.2/min  against a designed ₡55
stage 3 income  ₡15.3/min  against a designed ₡179
stage 4         never reached in twelve hours
```

**Three of the design's fourteen menu items existed, all Stage 1.** A Stage 3
diner sold lemonade, hot dogs and chips at Stage 1 prices, so its average ticket
was ₡4.50 where §3's envelope assumes ₡18 — and no upgrade, staffing level or
amount of traffic can move a ticket.

The other eleven items are now in, priced from §4 with the same ×1.35 scaling
Phase 12 applied to the first three and every published margin unchanged. Three
stations the later menu needs — fryer, coffee, dessert — were appended to
`STATIONS` (appended, never inserted: a station index is hashed into the world
digest and written into every save).

And **`MenuItem.stage` was wired**, which it never had been. The field had existed
since Phase 8 and nothing read it, so before the later items were added a
lemonade stand and a Stage 4 restaurant sold the same three things — and the
moment they were added, a lemonade stand would have started selling family meals.

Result: income now scales with the stage — **₡12.8 → ₡21.1 → ₡40.8 → ₡69.3 per
minute** — and Stage 4 is reached.

---

## 4. Ten new effect kinds, each with exactly one consumer

`nightVisibility` · `atmosphere` · `prepSpeed` · `foodQuality` · `patienceScale` ·
`laneCapacity` · `windowSpeed` · `orderPostSpeed` · `staffSpeed` · `staffSkill`

Two of them are worth naming. **`atmosphere` is the first of satisfaction's four
dormant inputs to be fed by anything** — the planters, the neon and the covered
terrace push on it, which is exactly what §13.2 describes. And **`laneCapacity`
had somewhere real to go**: Stage 4 authors six lane points and a capacity of
four, so the two spare points were always waiting for the upgrade that repaints
the lane further back.

The rule that makes this trustworthy is in `fourProperties.test.ts`: it **reads
every `.ts` file under `src/sim`** and fails if a declared effect kind has no
`effectValue(world, '<kind>')` call anywhere. "Has an effect" is easy to fake in
a config file; having a consumer is not.

---

## 5. What the tests enforce

| File                     | What it refuses to let through                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fourProperties.test.ts` | a cost of zero · no effect · an effect nothing reads · no world change · a placeholder the renderer cannot draw · an anchor outside the lot · two cards on one spot · a consequence that just restates the effect |
| `prereq.test.ts`         | a missing prerequisite · a two-node cycle · a longer cycle · self-reference · **a prerequisite from a later stage** · a family with no root · and the simulation refusing a locked purchase                       |
| `tree.test.ts`           | fewer than four upgrades or two families per stage · a stage whose cheapest upgrade breaks the ninety-second rule · a first pass over the stage budget · one upgrade strictly dominating another                  |
| `significance.test.ts`   | an upgrade whose purchase **does not move the number the simulation reads**, including on its last level                                                                                                          |

The prerequisite-from-a-later-stage rule is the quiet one. The graph is acyclic
and every id exists, so nothing structural is wrong — the upgrade is simply
greyed out forever.

---

## 6. A drive-thru customer who gave up kept their slot

`collect()` clears `laneSlot` when a car drives off with its order. The
_abandonment_ path did not. A driver who ran out of patience left the slot marked
occupied by a car that was already leaving, and the car behind could not creep
past: the window sat empty with a full lane behind it and nothing moving.

It had never fired because nobody ran out of patience in a drive-thru — until
Phase 13's menu made a family meal take twenty-six seconds to prepare. Fixed
where the customer stops being in the queue, not in the compaction pass, because
that is the fact rather than an inference of it one tick later.

---

## 7. Two assertions are blocked, and the blocker is arithmetic

| Assertion                      | Why it cannot be evaluated                                                |
| ------------------------------ | ------------------------------------------------------------------------- |
| Stage 3 reached in 28–70 min   | Stage 2's menu averages **₡5.80** against the **₡9.00** ticket §3 assumes |
| Stage 4 reached in 140–320 min | Stage 3's menu averages **₡9.60** against **₡18.00**                      |

An order is one item and the item is chosen uniformly from what the stage sells,
so the average ticket a stage can produce **is the mean price of its menu**.
Nothing else in the simulation can move it. §3's tickets therefore assume
something the game does not do — multi-item orders, or a mix weighted by the
`appealTags` §4 already carries. Either is a mechanic and a decision, which is
why it is change request §8.1 from Phase 12 rather than something slipped in
here.

`ticketReachable()` **computes** this rather than listing it, so the assertions
unblock themselves the day that decision lands: implement the weighting and they
start evaluating without anyone remembering to come back.

Scaling prices instead was tried on paper and rejected: closing Stage 2's gap by
price alone needs ×1.875 on its items, which puts a cola at ₡7.60.

---

## 8. The interface

- **`UpgradeCard` v2** — the family, and **two different kinds of no**. "You have
  not unlocked this" names the missing prerequisite; "you cannot afford this"
  says by how much. A card that greyed the button out for both would leave the
  player guessing which, and only one of them is solved by waiting.
- **`BuildMenu`** — the whole tree, grouped by family, with later stages dimmed
  rather than hidden. It has **no buy button**: selecting a row opens the card
  beside the object, because a list is faster to click through than a world is to
  look at, and a second place to buy would quietly become the first.
- **Per-family bursts** — five shapes, not five colours. Colour alone fails for
  anyone who cannot separate two of them and fails again on a placeholder-magenta
  scene; the kitchen rises like steam, capacity pushes outward, the drive-thru
  sweeps along the lane.

One real defect fell out of the E2E: the world-anchored card had **no stacking
order**, so it could open underneath Phase 11's build panel — visible, enabled
and unclickable. Firefox found it as a two-minute timeout on a button the test
could see the whole time.

---

## 9. Definition of done — WORKING_DISCIPLINE §4

| #   | Item                                 | Status | Evidence                                                            |
| --- | ------------------------------------ | ------ | ------------------------------------------------------------------- |
| 1   | Feature complete to phase spec       | ✅     | 30 upgrades, 5 families, prereqs, menu v2, card v2, burst set       |
| 2   | Unit tests                           | ✅     | 1 319 pass                                                          |
| 3   | Integration tests                    | ✅     | plus 5 balance-gate tests                                           |
| 4   | Determinism suite                    | ✅     | green                                                               |
| 5   | Coverage thresholds                  | ✅     | none moved                                                          |
| 6   | Lint / format / types                | ✅     | clean, 303 files, 0 warnings                                        |
| 7   | Architecture boundaries              | ✅     | `depcruise` clean — 155 modules                                     |
| 8   | Dead code                            | ✅     | `knip` clean                                                        |
| 9   | Performance budgets                  | ✅     | 21 pass                                                             |
| 10  | Allocation budget                    | ✅     | within budget, profiler-measured                                    |
| 11  | Visual goldens                       | ✅     | 14 pass; `upgrades-after` regenerated — the upgrade set changed     |
| 12  | E2E                                  | ⚠️     | **128 pass** Chromium + Firefox; **WebKit cannot run on this host** |
| 13  | Save migration                       | ✅     | none needed — no schema field changed                               |
| 14  | Documentation                        | ✅     | this report, BALANCE_REPORT, PROJECT_MEMORY                         |
| 15  | **Balance green with the full tree** | ✅     | 9 of 11 evaluated and passing, 2 blocked by §8.1                    |

---

## 10. Open items

| Item                                               | Where                            |
| -------------------------------------------------- | -------------------------------- |
| Weighted or multi-item orders — the ticket blocker | change request §8.1              |
| Idle player cannot progress through Stage 1        | change request §8.3              |
| Evolution can strand the player                    | change request §8.4              |
| Three players, one hour                            | needs people and art             |
| Stage art, silhouettes, upgrade art                | Phase 16                         |
| `priceFit` still a placeholder 1.0                 | so pricing cannot be exercised   |
| WebKit smoke on this host                          | needs `libevent-2.1-7t64` (root) |
