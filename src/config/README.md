# `src/config` — Data and types only

Pure data. May import `zod` and type-only modules; nothing else from the project.

No economic, balancing or timing value may appear as a literal in gameplay code — all of it lives
here, typed, `readonly`, and validated by Zod in dev builds (validation tree-shakes out of
production).

The Zod schemas also check logical consistency (`price > baseCost`, `L2.cost > L1.cost`,
`stage[n+1].traffic > stage[n].traffic`, …), so an inconsistent config fails to boot in dev rather
than producing a subtly wrong game.

See [ECONOMY_DESIGN §12](../../docs/ECONOMY_DESIGN.md).

**Status:** empty. Populated from Phase 3 (world/layout) and Phase 9 (economy).
