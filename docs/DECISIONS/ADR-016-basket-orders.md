# ADR-016 — Orders become baskets, and the average ticket becomes reachable

**Status:** Accepted · **Date:** 2026-08-18 · **Phase:** consolidation batch (post P13, pre P14)

## Context

ECONOMY_DESIGN §3's stage envelopes are built on average tickets of **₡4.5 / ₡9 / ₡18 / ₡30**. The
shipped mechanic was one item per order, chosen uniformly from the stage menu, so the ticket a stage
could produce was the _mean price of its menu_: **₡4.5 / ₡5.85 / ₡9.57 / ₡15.58**. Nothing in the
simulation could move that number — no upgrade, no staffing, no traffic. Phase 12 stated the blocker
as arithmetic (change request §8.1), computed it inside the balance gate so two assertions marked
themselves NOT EVALUABLE, and left the decision open rather than hiding it in a price change.

The directive requires a deliberate design resolution among: (A) appeal-weighted single-item choice,
(B) multi-item orders, (C) a combination, (D) another documented design — with simulation
experiments, and with the constraint that menu identities stay meaningful, behaviour stays
deterministic and understandable, and no purchase exploit appears.

## Why not (A) alone

Weighted single-item choice can only raise a stage's ticket by concentrating sales on its priciest
items. Reaching ₡30 on a menu whose mean is ₡15.58 needs most customers buying the ₡64.80 family
meal — at which point chips, cola and the dessert stop selling, and every upgrade that touches their
stations stops mattering. The mechanism that fixes the ticket would break the menu.

## Decision — (C), the combo basket

**A customer orders a basket: the base item they came for, plus side and drink draws.**

- The **base item stays uniformly chosen from the stage menu** — Phase 13's stage-menu rule intact,
  every item keeping its identity and its sales.
- **Extras** come from two explicit pools (`SIDE_POOL` = chips, fries, dessert; `DRINK_POOL` =
  lemonade, cola, coffee), drawn with per-stage chances. Stage 4 makes **two** draw passes — the
  family-van archetype orders in twos, and that is also what lets ₡30 exist without any probability
  exceeding 1.
- **The chances are solved, not tuned.** `E[ticket] = mean(menu) + draws × (sideChance × mean(sides)
  - drinkChance × mean(drinks))`, solved against §3 with the shipped prices:

  | Stage | sideChance | drinkChance | draws | E[ticket] | §3 designed |
  | ----: | ---------: | ----------: | ----: | --------: | ----------: |
  |     1 |          0 |           0 |     0 |     ₡4.50 |       ₡4.50 |
  |     2 |       0.39 |        0.39 |     1 |     ₡9.01 |       ₡9.00 |
  |     3 |       0.75 |        0.75 |     1 |    ₡18.01 |      ₡18.00 |
  |     4 |       0.64 |        0.64 |     2 |    ₡29.98 |      ₡30.00 |

  Stage 1 is deliberately zero: its measured ticket already sits on the design (P12 scaled its
  prices for exactly that), and a lemonade stand selling combos would move an envelope that is
  currently right.

- **The tray rule.** A basket is handed over complete — the counter delivers when every plate is on
  the pass, a waiter carries the whole tray in one trip (the task board posts one delivery per
  basket, on its lowest order slot), and the drive-thru passes one bag through the window. This is
  what makes multi-item hold temperature _mean_ something: the first-cooked item genuinely waits for
  the last.
- **Per-person accounting.** Plates keep their own captured prices and their own quality clocks;
  satisfaction is the mean over the basket, the tip rides the whole bill, and reputation and
  `customersServed` move once per person. Counting per plate would have doubled reputation gain at
  Stage 2 purely because baskets grew.
- **Determinism.** All rolls come from the `customer` stream in a fixed order (base, then per draw:
  side roll, side pick, drink roll, drink pick). `tests/unit/config/basket.test.ts` pins the solved
  chances to §3, compares ten thousand simulated baskets per stage against the closed formula, and
  replays the roll for bit-equality.
- **No purchase exploit**: extras are priced through the same captured-at-order, ±50%-banded price
  path as everything else; a basket is just more orders.

**Found while wiring it:** the drive-thru still chose from the **whole menu** — Phase 13's
stage-menu fix had missed it, so a Stage 4 lane sold items by a distribution no stage defines. It
now rolls the same basket the counter does.

## What the unblocked gate measured, and the calibration boundary

`ticketReachable` now computes `expectedTicket()` — the same function the roll follows — so the
blocked assertions unblocked themselves exactly as Phase 12 designed. First basket-era gate run:

- **Stage 2 and Stage 3 timing pass** (Stage 3: 28–70 min window, previously never evaluable).
- **Stage 4's window (≤ 320 min) is unobservable in a 120-minute CI run** — the assertion now says
  so and skips, and binds in the 720-minute `pnpm balance`.
- **The envelope's original form was unsatisfiable next to the timing assertions**: "peak within
  ±25% of the fully-upgraded ceiling" requires dwelling in a stage; the timing assertion forbids
  dwelling. It now asserts the **corridor** §3 actually publishes (entry → ceiling, ±25% grace),
  which still catches stagnation below entry and blow-outs past the ceiling.
- **Stages 2–4 measure as uncalibrated**, which is true: Phase 12's tuning pass (reputation,
  affinities, ladder, prices) was performed for Stage 1 against a then-unblocked ticket; stages 2–4
  could not be calibrated against arithmetic that forbade their income. The first measurements show
  the shape — Stage 3's peak ₡56.7/min under its own ₡62 entry design; a ₡308 cheapest-upgrade
  reading at Stage 3 and a 166-second one at Stage 2's own entry against the 90-second dead-end
  rule. The boundary was first guessed as `[1, 2]` and Stage 2's first-ever probe corrected the
  guess. `CALIBRATED_STAGES = [1]` names the boundary:
  calibrated stages **assert**, uncalibrated stages **report their numbers** — the same posture the
  gate took while the ticket was blocked, one level up, and the traffic-density decision the user
  owns (PROJECT_MEMORY §10) is one of the knobs that calibration will need. Growing the list is the
  definition of calibration landing; shrinking it is forbidden.

## Consequences

- ECONOMY_DESIGN §3's tickets are now mechanically real; §13's NOT EVALUABLE rows are gone.
- Save format untouched: a basket is N pooled orders, and orders were always world state.
- The kitchen sees more, smaller orders; extras skew to fast stations (drinks, fryer, prep), which
  is load the stations were designed for.
- The Stage 2/3/4 economy can now be _calibrated at all_ — that tuning pass is the successor work
  this ADR hands to the phase that owns it, with the first real measurements attached.
