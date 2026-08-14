# ADR-005 — Config-driven economy with a 90-second dead-end gate

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 0, corrected and recorded in Phase 1

## Context

Uncontrolled exponential growth and progression dead ends are the two most common ways a tycoon
economy fails. Both are usually discovered by playing, late, after the numbers have spread through
the code.

## Decision

1. No economic, balancing or timing value may appear as a literal in gameplay code. All of it lives
   in `src/config/economy/**`, typed, `readonly`, validated by Zod in dev builds (tree-shaken from
   production).
2. Income is structurally capped by five independent brakes (fixed traffic rate per stage, a hard
   conversion ceiling, finite capacity, queue-spillover penalty, and recurring costs that scale with
   income) — see ECONOMY_DESIGN §7.
3. The dead-end rule is a **hard, merge-blocking CI assertion**:
   `cheapestMeaningfulUpgrade.cost ≤ currentNetIncomePerMin × 1.5` — **90 seconds of income**.

## Correction applied 2026-08-14 (user-approved)

The Phase 12 assertion list previously said 120 s while ECONOMY_DESIGN said 90 s. **90 seconds is
canonical.** All references now use it. The warning band was moved _below_ the gate (75–90 s,
visible only in `pnpm balance:tune`) — a warning band above the gate would be meaningless, because
the build is already red there. The 120 s threshold is retired.

## Alternatives considered

- Balancing by feel and playtesting alone. Rejected: it cannot catch a config change that silently
  breaks progression three phases later.
- Widening the envelope when an assertion fails. Explicitly forbidden: the envelope is the design
  contract; changing it requires approval and a roadmap change request.

## Consequences

- Economy balance becomes a regression test rather than an opinion.
- Requires the headless simulator (Phase 12) and therefore requires ADR-004.

## Evidence

docs/ECONOMY_DESIGN.md §7, §8, §13, §14.

## Reversal cost

Low for the numbers, high for the structure.
