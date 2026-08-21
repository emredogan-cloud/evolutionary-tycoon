# ADR-014 — Evolution requires an operating reserve

**Status:** Accepted · **Date:** 2026-08-18 · **Phase:** consolidation batch (post P13, pre P14)

## Context

Phase 12's balance simulator found that a normal, valid player action produces an unrecoverable
zero-income state. Evolution _spends_ its cash threshold (a deliberate Phase 11 decision — a
threshold you merely touch is one you can hover at forever). A stand holding **₡804** that accepts
the **₡800** Stage 3 therefore opens the diner with **₡4**. Stage 3 serves food at tables, food
reaches a table in a waiter's hands, and a waiter costs ₡18 to hire — so the diner has zero income,
the cooks walk out unpaid six minutes later, and the recorded twelve-hour run is a flat line from
minute 92 onward. Nothing objected, because the one rule about unrecoverable states is about _debt_,
and this stand had none.

The consolidation directive names four candidate mechanisms and requires one to be chosen
deliberately: a minimum post-evolution reserve, folding mandatory infrastructure into the evolution
cost, blocking evolution until operations are satisfiable, or reserving the required setup cost
before confirming.

## Decision

**The evolution gate requires `cash ≥ cashRequired + operatingReserve`, and still spends only
`cashRequired`.** The reserve is what the stand must _still be holding_ when the new stage opens.

The reserve is derived from existing config, not chosen:

```
reserve = Σ hireCost(required roles not yet employed)
        + (UNPAID_GRACE_MS / 60 000) × (current payroll ₡/min + missing roles at base wage)
```

- **Required roles** are a new field on each stage requirement (`requiredRoles`), stating what the
  _incoming_ stage cannot earn without: `[]` for Stage 2 (the truck's counter works like the
  stand's), `['waiter']` for Stages 3 and 4. This is deliberately not the `employeesHired`
  milestone — that is a lesson check on the outgoing stage; this is an operating fact about the
  incoming one.
- **The wage runway is the grace window** (`UNPAID_GRACE_MS`, 3 minutes) — the wage system's own
  tolerance, which is exactly the time income has to restart in before staff start leaving. It
  covers the payroll the stand will actually have: everyone employed now, plus the missing hires at
  base wage.
- Missing hires are priced at **skill 0** — the cheapest viable path. A player who hires above it
  is making a visible choice with money they can see.

In practice: ₡21.65 on top of Stage 3's ₡800 for the recorded scenario (waiter hire ₡18 + 3 min of
a ₡0.715 cook and a ₡0.50 waiter). The recorded ₡804 stranding is now refused by the gate, and the
regression suite reproduces it verbatim (`tests/integration/evolutionReserve.test.ts`).

The UI shows the enforced sum: the bridge's cash requirement row is
`cashRequired + reserveFor(world)`, computed by the same function the gate uses, so the bar the
player watches cannot disagree with the refusal they would get.

## Alternatives rejected

- **Fold the waiter into the evolution cost** (auto-hire on transition). Removes a decision the
  player currently makes — who to hire, at what skill — and turns a visible cost into a hidden one.
  The design principle since Phase 11 is that evolution is a _decision_; this would make part of it
  a side effect.
- **Block evolution until a waiter is already employed.** Forces the hire _before_ the diner
  exists, paying wages for a role with nothing to do during construction — a punishment for
  following the rule.
- **A flat reserve number.** Would drift the first time a wage or hire cost changes. Deriving it
  from the same config the costs live in means it cannot.
- **Reduce evolution prices.** Explicitly forbidden by the directive, and rightly: the problem is
  recoverability, not price.

## Consequences

- The player must save roughly 3% past a stage threshold before the confirm unlocks. Measured
  against the balance gate: no assertion moved (Stage 2's reserve is zero with no staff, and the
  Stage 3/4 timing assertions are blocked on the average-ticket decision and remain so).
- `meetsRequirement` is stricter, so anything that qualifies programmatically — tests, balance
  policies — funds the reserve implicitly through the same gate the player uses.
- Save compatibility is untouched: the reserve is computed, never stored.
- If a future stage adds a different mandatory role (a drive-thru operator, say), it is one line of
  config, and the reserve reprices itself.
