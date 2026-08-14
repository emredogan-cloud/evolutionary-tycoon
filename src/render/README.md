# `src/render` — Phaser, isometric projection, depth sorting

Phaser 4 (WebGL) lives here and nowhere else. This layer **reads** the simulation and never writes
to it: `SimView` is readonly throughout, `dependency-cruiser` blocks the reverse direction, and
`tests/unit/render/renderBridge.test.ts` freezes the view and runs a hundred ticks through it.

## What is here (Phase 3)

```
iso/          IsoProjection (2:1 dimetric, exact round trip) · DepthSorter · depthConstants
camera/       cameraMath (pure, unit-tested) · CameraController (Phaser wiring)
scenes/       BootScene (texture load) · WorldScene (the world)
debug/        DevOverlays — grid, coordinate readout, drawn count
SceneGraph    the nine layers from TECHNICAL_ARCHITECTURE §6.3
RenderBridge  simulation view → ordered, interpolated actor views
ActorView     the pooled view record and its pool
RenderContext what the renderer needs from src/app — implemented there, declared here
```

## Three things that will trip you up

1. **`SpriteGPULayer` cannot be depth-sorted**, and changing a member is expensive
   (RESEARCH_NOTES §4). Actors must never go in one. It is right for the sky, parallax and static
   scatter, which is where Phase 16 will use it.
2. **There is no isometric tilemap.** `TilemapGPULayer` is orthographic-only, so the ground is a
   handful of hand-composed bakes per stage, not tiles.
3. **Depth sorting is painter's algorithm, deliberately.** Topological sorting is the textbook
   answer and the wrong one: worst case O(n²), and it needs cycle detection. Cycles are prevented by
   an _authoring_ rule instead — anything taller than 160 px at 2x is split into `_lower`/`_upper`,
   and the Phase 4 validator fails the build otherwise.

## Visual regression works because of the determinism mode

`?seed=&freezeAt=&noParticles=1&fixedViewport=1&dpr=1&hideHud=1` pins everything that would
otherwise differ between two runs of the same scene. Verified, not assumed: ten runs produce
byte-identical PNGs, and the golden set generated on the host matches the set generated inside the
pinned CI container exactly.

**Status:** rendering foundation complete. Traffic arrives in Phase 5; real art in Phase 4.
