# ADR-015 — The product is active-management with light idle, and the documents now say so consistently

**Status:** Accepted · **Date:** 2026-08-18 · **Phase:** consolidation batch (post P13, pre P14)

## Context

Two approved documents contradict each other, and the contradiction has a measured cost. ECONOMY_DESIGN
§13 requires **every** balance policy — the five-minute idle player included — to reach Stage 2 in
10–22 minutes. ECONOMY_DESIGN §5.1 makes the cook a Stage 2 role, so Stage 1 deliberately cannot be
automated: an idle player's Stage 1 pace is bounded by their own visits. Phase 12 measured the gap
(idle ~95 minutes against ~21 attentive) and carried it as an open change request rather than
resolving it by fiat.

The consolidation directive requires the product to be classified first — ACTIVE MANAGEMENT TYCOON or
IDLE/HYBRID — from the design documents, then the contradiction resolved by change control in
whichever direction the classification points, with experiments.

## The classification, from the documents

The GDD is not ambiguous, only §13 is:

- **§4 Tür:** "Real-time management + **light idle**".
- **§3 Hedef oyuncu:** the _primary_ audience is active short-session management players; idle
  players are _secondary_, expecting "long-term accumulation and **offline** progress".
- **§17 Offline/idle sistemi** (scheduled P14): offline earnings at **40% efficiency, 8-hour cap**,
  with the stated purpose "offline kazanç, aktif oyunun **yerine geçmez**, onu **korur**" — offline
  never replaces active play.
- **§5.1:** the cook is a Stage 2 role. Stage 1 is the stage that teaches the loop by being played.

So: **an active-management tycoon whose idleness is rewarded _between_ sessions (the P14 offline
system), not _during_ Stage 1.** The idle-player expectation in §13 was written before §5.1 fixed
the staffing ladder, and is the stale half.

## The experiment

Attention ladder, real simulation, seed 424242, 150 simulated minutes each
(`tools/balance-sim` policies; the check-in variants are the shipped idle policy at different
intervals; true idle never buys):

| Attention             | Stage 2 | Served | Upgrades | Peak sustained ₡/min |
| --------------------- | ------: | -----: | -------: | -------------------: |
| Attentive (greedy)    |  21.7 m |    529 |       26 |                 27.4 |
| Check-in every 2 min  |  36.2 m |    463 |       20 |                 26.0 |
| Check-in every 5 min  |  90.2 m |    280 |        6 |                 18.3 |
| Check-in every 10 min |   never |     70 |        3 |                  4.9 |
| True idle             |   never |    111 |        0 |                  5.5 |

Attention buys progression monotonically, and a loaded-and-left tab still earns a trickle but never
progresses — because the Stage 1→2 milestone requires a _purchase_, which is a decision, which is
the point of the milestone. This is the designed shape, now measured end to end.

## Decision

1. **The product classification is recorded**: active-management with light idle. In-session Stage 1
   progression requires attention by design; the idle audience is served by the §17 offline system
   in P14 (40% efficiency, 8-hour cap, expenses still accrue).
2. **ECONOMY_DESIGN §13 is amended by this change control**: the stage-timing assertions bind the
   four _strategic_ policies; the idle player's pace is reported as the attention spread rather than
   asserted into the strategic window. This ratifies in the document what Phase 12 already
   implemented and documented in the assertion source — the code and the contract now agree.
3. **No in-session automation is added to Stage 1.** The directive's warning is taken literally:
   automation invented to satisfy a benchmark would be fake, would collapse the attention ladder
   above, and would pre-empt P14's actual offline design.

## Consequences

- No code changed for this ADR; the balance gate already binds the strategic policies. The document
  now says what the gate enforces.
- The idle audience's real feature remains P14 scope and is not started here (§34 of the directive).
- The attention ladder becomes a reusable experiment: any future change claiming to help idle play
  has five numbers to move, not an anecdote.
