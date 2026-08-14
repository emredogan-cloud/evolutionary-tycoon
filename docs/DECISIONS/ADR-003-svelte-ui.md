# ADR-003 — Svelte 5 DOM overlay for UI

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 0 (recorded in Phase 1)

## Context

A tycoon game needs substantial UI: HUD, upgrade cards, staff panel, analytics, settings,
notifications, onboarding. It must work on phones, be accessible, and be testable.

## Decision

Real DOM overlay built with Svelte 5.56.9 (runes), sitting above the Phaser canvas.

## Alternatives considered

- **Canvas-drawn UI.** Rejected on three counts: Playwright cannot query inside a canvas, so E2E
  would need a bespoke debug bridge forever; accessibility (screen readers, keyboard, zoom,
  `prefers-reduced-motion`) would have to be reimplemented; responsive layout would be hand-rolled.
- **React 19.** ~42 kB gzip vs ~2–5 kB, and a VDOM reconciliation pass. Our HUD updates ~10×/second;
  doing that correctly in React requires memoisation discipline that is hard to enforce in CI. In
  Svelte the correct behaviour is the default.
- **Preact / Solid / vanilla.** Preact keeps React's model at lower cost but not its ecosystem
  advantage; Solid is comparable to Svelte with a smaller docs corpus; vanilla means reinventing
  reactivity and writing more code to test.

## Consequences

- `src/ui` must never import `src/sim` — data flows through `src/app/bridge`, throttled to 10 Hz.
  This makes it structurally impossible for the UI to consume the frame budget. Enforced by
  dependency-cruiser and ESLint.
- One counter-argument accepted openly: React has more training data, which matters for an
  AI-built project. Judged outweighed by the smaller total UI surface.

## Evidence

docs/RESEARCH_NOTES.md §12. `@sveltejs/vite-plugin-svelte@7.3.0` peer `vite ^8.0.0` — exact match
with the pinned Vite 8.2.1, so no version risk.

## Reversal cost

Low–medium. The UI layer is isolated behind the bridge.
