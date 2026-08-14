# `src/sim` — Simulation core

**Pure TypeScript. Deterministic. Headless.**

## Contract (enforced by CI, not by convention)

Forbidden here — `eslint.config.js` and `.dependency-cruiser.cjs` fail the build on any of these:

- imports from `phaser`, `svelte`, `idb`, `src/render`, `src/ui`, `src/persistence`, `src/platform`, `src/app`
- `Math.random()` → use an injected `Rng` stream
- `Date.now()`, `new Date()`, `performance.now()` → use the injected `Clock`
- `setTimeout` / `setInterval` / `requestAnimationFrame` → the sim is driven by a fixed 20 Hz tick
- browser globals (`window`, `document`, `navigator`, `localStorage`, `fetch`, …)

## Why this is absolute

Same seed + same command log must produce the same world hash after N ticks, on any machine, at any
tick rate. That single property is what makes all of the following possible at once:

- unit-testing the entire game in Vitest in milliseconds, with no browser
- measuring performance in CI, where there is no GPU (headless Chromium uses SwiftShader)
- pixel-exact visual regression on a WebGL canvas
- bug reports that reproduce exactly from a seed
- validating the economy in CI with the balance simulator
- the "Day Replay" gameplay feature

One stray `Math.random()` destroys all six, and the damage surfaces much later as "flaky tests".

See [TECHNICAL_ARCHITECTURE §2 and §5](../../docs/TECHNICAL_ARCHITECTURE.md).

**Status:** empty. Populated in Phase 2 (Simulation Core & Determinism).
