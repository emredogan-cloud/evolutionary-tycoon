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

## What is here (Phase 2)

```
core/     Clock · Rng (6 streams) · World (+ hash) · SystemPipeline (18 slots) ·
          CommandLog · commands · EventBus · events · snapshot · Sim
stores/   VehicleStore (SoA typed arrays) · SlotPool · actor and order records
math/     hash (FNV-1a 64) · typedArray
systems/  the eighteen reserved slots, all no-ops until their phase
```

`vec2` and `easing` are deliberately **not** here yet. The roadmap lists them under Phase 2, but
nothing in Phase 2 consumes them and unused code in the deterministic core is worse than absent
code — `knip` fails the build on it, and rule 12 forbids a feature without a defined purpose. They
arrive in Phase 3 with the projection and camera maths that need them.

**Status:** deterministic kernel complete. Gameplay systems arrive from Phase 5 onward.
