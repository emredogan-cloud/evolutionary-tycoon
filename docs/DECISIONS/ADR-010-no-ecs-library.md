# ADR-010 — No ECS library; targeted structure-of-arrays instead

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 0 (recorded in Phase 1)

## Context

An ECS library (bitECS and similar) is the reflexive choice for a simulation-heavy game.

## Decision

No ECS library. Hot, numerous, homogeneous entities (vehicles) use structure-of-arrays over typed
arrays with a free list. Everything else uses plain objects with pooling.

## Rationale

An ECS adds a dependency, a learning curve and an abstraction layer. Our entity counts (≤300 on
screen) and archetype diversity do not justify it. Typed arrays are used only where profiling shows
they are needed, and extended when measurement demands it — not in advance.

## Consequences

- Simulation code reads as ordinary TypeScript, which matters on a project written across many
  sessions.
- If profiling later shows a genuine need, converting a store to SoA is local work, not a rewrite.

## Evidence

docs/TECHNICAL_ARCHITECTURE.md §5.4.

## Reversal cost

Low.
