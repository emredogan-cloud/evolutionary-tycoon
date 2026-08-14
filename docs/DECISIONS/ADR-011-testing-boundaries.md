# ADR-011 — Testing boundaries: Chromium-only visual regression, no FPS claims from CI

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 1

## Context

Research into browser testing produced three inconvenient facts:

- GitHub Actions' headless Chromium reports **SwiftShader** as the WebGL renderer — software
  rasterisation. It works, but it does not represent a GPU.
- Headless **Firefox** WebGL is unstable without `xvfb-run`.
- Headless **WebKit** has no hardware acceleration and **does not render canvas content into
  screenshots** (microsoft/playwright#586).

## Decision

1. **Visual regression runs on Chromium only**, inside the pinned container
   `mcr.microsoft.com/playwright:v1.62.1-noble`, with SwiftShader forced via
   `--use-gl=angle --use-angle=swiftshader --disable-gpu`. Goldens are generated in the same
   container so local and CI output match.
2. **Firefox E2E runs under `xvfb-run`** in CI.
3. **WebKit runs a reduced smoke suite** — boot, DOM, console health — and never takes a canvas
   screenshot. It is `continue-on-error` because it would otherwise gate merges on platform
   limitations we do not control.
4. **CI never asserts or reports a frame rate.** Performance gating in CI is headless simulation
   throughput and allocation count. Real FPS is measured manually on real hardware and recorded in
   `docs/PERF_LOG.md`.

## Consequences

- Visual regression only works because rendering is deterministic (frozen clock, seeded RNG, fixed
  viewport, forced DPR) — which is an ADR-004 dividend.
- We accept a genuine coverage gap on Safari rendering, documented rather than papered over.

## Evidence

docs/RESEARCH_NOTES.md §3; playwright#586; playwright#21783.

## Reversal cost

Low, but the underlying platform constraints are not ours to change.
