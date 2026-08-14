# `src/app` — Composition root

Wires the layers together. Decides _what_ runs; never decides _how the game behaves_.

From Phase 2 onward this holds `GameLoop` (fixed 20 Hz accumulator + interpolation alpha) and
`bridge/` (the throttled sim → UI view model). No game logic lives here.

**Status (Phase 2):** `main.ts` (boot + capability gate + kernel start) · `container.ts` (seed
resolution, storage backend selection, wiring) · `GameLoop.ts` (fixed 20 Hz accumulator +
interpolation alpha) · `SaveService.ts` (simulation ↔ storage bridge, and where the wall clock
enters) · `testHooks.ts` (`window.__EVOTYCOON__`, gated on `?e2e=1`) · `debug/DebugOverlay.ts`
(dev-only, tree-shaken from production).

Phase 3 adds `container.ts`'s render wiring (`RenderContext`), `renderMode.ts` (the visual
determinism mode), `devScene.ts` (authored scene staging — test scaffolding, replaced by real
spawning in Phase 5) and `FrameMeter.ts` (the `?bench=1` frame sampler).

`bridge/` — the throttled sim → UI view model — is still to come. Phase 3 needed no UI data, so
building it would have been a guess at what Phase 9's HUD wants.
