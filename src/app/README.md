# `src/app` — Composition root

Wires the layers together. Decides _what_ runs; never decides _how the game behaves_.

From Phase 2 onward this holds `GameLoop` (fixed 20 Hz accumulator + interpolation alpha) and
`bridge/` (the throttled sim → UI view model). No game logic lives here.

**Status:** `main.ts` (boot + capability gate).
