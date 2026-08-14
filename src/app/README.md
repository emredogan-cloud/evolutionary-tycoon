# `src/app` — Composition root

Wires the layers together. Decides _what_ runs; never decides _how the game behaves_.

From Phase 2 onward this holds `GameLoop` (fixed 20 Hz accumulator + interpolation alpha) and
`bridge/` (the throttled sim → UI view model). No game logic lives here.

**Status (Phase 2):** `main.ts` (boot + capability gate + kernel start) · `container.ts` (seed
resolution, storage backend selection, wiring) · `GameLoop.ts` (fixed 20 Hz accumulator +
interpolation alpha) · `SaveService.ts` (simulation ↔ storage bridge, and where the wall clock
enters) · `testHooks.ts` (`window.__EVOTYCOON__`, gated on `?e2e=1`) · `debug/DebugOverlay.ts`
(dev-only, tree-shaken from production).

`bridge/` — the throttled sim → UI view model — arrives in Phase 3 with the renderer.
