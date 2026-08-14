# ADR-004 — Engine-independent deterministic simulation core

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 0 (recorded in Phase 1)

## Context

This is the single most consequential decision in the project.

Research surfaced a hard constraint: CI cannot measure rendering. GitHub Actions runs headless
Chromium on SwiftShader (software rasterisation), headless Firefox needs `xvfb` for WebGL, and
headless WebKit does not render canvas into screenshots at all. So any quality gate that depends on
the renderer is unreliable by construction.

## Decision

All game logic lives in `src/sim` as pure TypeScript: no Phaser, no Svelte, no DOM, no browser
globals, no `Math.random`, no wall-clock time, no timers. Fixed 20 Hz tick, seeded RNG split into
six independent streams, injected clock, command log, typed event bus. The renderer reads a
read-only view and interpolates.

## Alternatives considered

- **Game logic inside Phaser scenes** (the conventional approach). Rejected: it makes every one of
  the capabilities below impossible, and retrofitting determinism later is a rewrite, not a refactor.

## Consequences — one decision, six capabilities

1. The whole game is unit-testable in Vitest in milliseconds, with no browser.
2. Performance can be gated in CI on simulation tick time and allocation count — where our real
   bottleneck is — instead of on a meaningless SwiftShader frame rate.
3. Visual regression on a WebGL canvas becomes possible, because a frozen clock plus a fixed seed
   produces byte-identical frames.
4. Bug reports reproduce exactly from a seed plus a command log.
5. The economy can be validated in CI by replaying twelve simulated hours in seconds.
6. "Day Replay" — re-running the same seeded day after an upgrade to measure the true delta — is a
   designed gameplay feature that falls out for free.

Costs: stricter code in `src/sim` (injected clock and RNG everywhere), and a mechanical ban enforced
by ESLint and dependency-cruiser rather than by convention.

## Evidence

docs/RESEARCH_NOTES.md §3; docs/TECHNICAL_ARCHITECTURE.md §2, §5.
Enforcement is proven by `tests/unit/architecture/enforcement.test.ts`, which writes deliberately
illegal files into `src/sim` and asserts the real tools reject them.

## Reversal cost

Very high. This is why it is established in Phase 2, before any gameplay exists.
