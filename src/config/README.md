# `src/config` — Data and types only

Pure data. May import `zod` and type-only modules; nothing else from the project.

No economic, balancing or timing value may appear as a literal in gameplay code — all of it lives
here, typed, `readonly`, and validated by Zod in dev builds (validation tree-shakes out of
production).

The Zod schemas also check logical consistency (`price > baseCost`, `L2.cost > L1.cost`,
`stage[n+1].traffic > stage[n].traffic`, …), so an inconsistent config fails to boot in dev rather
than producing a subtly wrong game.

See [ECONOMY_DESIGN §12](../../docs/ECONOMY_DESIGN.md).

**Status:** `simulation.ts` (tick rate, catch-up limits, entity capacities, save schema version) ·
`world.ts` (tile geometry, camera limits, the nine render layers) · `actors.ts` (the render
catalogue) · `layouts/stage1.ts` (lot, road, statics) · `scenes.ts` (authored fixtures for visual
regression and performance).

Economy data arrives in Phase 9, and with it the first Zod schemas — compile-time constants are
already guaranteed by `as const`, and a runtime schema over values that cannot vary is theatre. The
save schema is validated with Zod because a save is genuinely untrusted input; that lives in
`src/persistence`.
