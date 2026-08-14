# ADR-006 — Layered navigation: lane splines, manoeuvre splines, flow fields

**Status:** Accepted · **Date:** 2026-08-14 · **Phase:** 0 (recorded in Phase 1)

## Context

Three different movement problems, usually solved with one hammer: vehicles on a road, vehicles
parking, and pedestrians crossing a small lot to a handful of fixed destinations.

## Decision

Three layers, each matched to its problem:

1. **Vehicles on the road** — 1D agents on arc-length-parameterised lane splines with an IDM-lite
   car-following model. No search: cars follow a lane, they do not solve a maze.
2. **Parking and drive-thru** — authored Bézier manoeuvre splines. Parking is an animation problem,
   not a search problem.
3. **Pedestrians** — a 0.5 m uniform grid with a precomputed flow field per named destination
   (Dijkstra from the goal), recomputed only when the layout changes, plus local separation steering
   and explicit queue slots at doors and counters.
4. **A\*** — fallback only, for rare one-off dynamic targets.

## Alternatives considered

- **Pure A\*.** Rejected: forty customers heading to the same counter re-search the same corridor
  forty times.
- **NavMesh.** Rejected: over-engineering for a 64×64 grid, plus a mesh-generation toolchain.
- **Pure waypoint graph.** Rejected: needs manual maintenance every time furniture moves.
- **Full RVO for local avoidance.** Rejected: unnecessary complexity. Queue slots produce more
  readable behaviour — people should queue at a door, not shove.

## Consequences

Flow fields' known weakness is large maps (memory, slow updates). Irrelevant here: 64×64 × 20 goals
× 2 floats ≈ 650 kB, and layouts change only when the player builds.

## Evidence

docs/RESEARCH_NOTES.md §8; comparative study of flow field vs A* in tower-defence pathfinding.

## Reversal cost

Low — navigation is self-contained in `src/sim/nav`.
