# `src/ui` — DOM overlay (Svelte 5)

Real DOM, not canvas-drawn UI. Chosen for accessibility, responsive layout, and — decisively —
E2E testability: Playwright cannot query inside a canvas.

## Contract

`src/ui` **must not import `src/sim`**. Data arrives through `src/app/bridge`, throttled to 10 Hz.
This makes it structurally impossible for the UI to read simulation state per frame and eat the
frame budget.

UI chrome may occupy at most 22% of the viewport on desktop and 28% on mobile. That is a measured
constraint, not an aspiration (Phase 18 tests it).

See [TECHNICAL_ARCHITECTURE §7](../../docs/TECHNICAL_ARCHITECTURE.md).

**Status:** shell only (`shell/`, `theme/`). Full screens land in Phase 18.
