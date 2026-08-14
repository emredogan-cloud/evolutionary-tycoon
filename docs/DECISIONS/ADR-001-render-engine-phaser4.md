# ADR-001 — Phaser 4 as the render engine

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 0 (recorded in Phase 1)

## Context

The game is 2D isometric with modest entity counts (≤300 on screen), needs scene management, input,
camera, tweens, particles, audio, an asset loader and texture atlases, and will be built largely by
an AI agent across many sessions.

## Decision

Phaser 4.2.1 (WebGL2) as the render engine.

## Alternatives considered

- **PixiJS 8.19** — a renderer, not a framework. Choosing it means writing scene management, input,
  camera, tweens, particles, audio and the loader ourselves: 4–6 weeks of work, none of which
  differentiates this game. Its bundle advantage (~150 kB vs ~310 kB gzip) is erased by the code we
  would add.
- **Three.js 0.185** — a 3D engine; wrong tool for 2D isometric.
- **Custom WebGL2** — educational, undeliverable.

Weighted scoring across 15 criteria: Phaser 274/305, Pixi 228, Three 189, custom 148
(GAME_EXECUTION_ROADMAP §18).

## Consequences

- Phaser 4 deprecated the Canvas renderer → **WebGL2 is mandatory**, so a tier-C unsupported-browser
  screen is a product requirement, not a nicety.
- `SpriteGPULayer` cannot be depth-sorted and `TilemapGPULayer` is orthographic-only, so actors never
  use GPU layers and the ground is baked sprites rather than tiles (ADR-009).
- v4.2 gives us cone lights (headlights, lit signage), stencil rendering (construction masks) and
  Mesh2D for free.

## Evidence

docs/RESEARCH_NOTES.md §4, §5. Phaser 4 release notes (Apr 2026), v4.2 "Giedi" (19 Jun 2026),
SpriteGPULayer performance article (May 2026).

## Reversal cost

Medium (~2–3 weeks, confined to `src/render`), because the simulation core carries no renderer
dependency (ADR-004). That isolation is the insurance premium we deliberately pay.
