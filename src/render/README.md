# `src/render` — Rendering layer (Phaser 4)

Phaser 4.2.1, WebGL2. Reads a **read-only** view of the simulation; never mutates it.

## Key constraints discovered in research

- `SpriteGPULayer` **cannot be depth-sorted** and modifying members is expensive → use it only for
  parallax, static decorative scatter behind the actor plane, and one-shot particle bursts.
  Never for vehicles, people, or anything that must sort.
- `TilemapGPULayer` is **orthographic only** → there is no isometric tilemap. The ground is 2–6
  large hand-composed static sprites per evolution stage.
- Phaser 4 deprecated the Canvas renderer → WebGL2 is mandatory; `src/platform/capability.ts`
  gates on it.

See [RESEARCH_NOTES §4](../../docs/RESEARCH_NOTES.md) and [TECHNICAL_ARCHITECTURE §6](../../docs/TECHNICAL_ARCHITECTURE.md).

**Status:** empty. Populated in Phase 3 (Isometric Rendering & World).
