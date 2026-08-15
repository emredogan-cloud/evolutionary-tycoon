import type { NavGrid } from './NavGrid';

/**
 * A* — the fallback, and only the fallback.
 *
 * RESEARCH_NOTES §8 is explicit that this is not the main path: flow fields
 * serve the many-agents-few-goals case, and A* exists for the rare one-off
 * dynamic target — a cleaner sent to a specific spill, a delivery to a specific
 * spot. Using it for the counter would mean re-searching the same corridor once
 * per customer.
 *
 * It shares the grid, the neighbour set, the √2 diagonal cost and the
 * corner-cutting rule with `FlowField`, deliberately: the roadmap requires a
 * test that on an open grid the two produce the same optimal path, and they
 * cannot unless they agree on what a step costs.
 *
 * The heuristic is octile distance, which is exact for eight-way movement with
 * these costs — so it is admissible and consistent, and A* returns a genuinely
 * optimal path rather than a good one.
 */

const STEP_ORTHOGONAL = 1;
const STEP_DIAGONAL = Math.SQRT2;

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, STEP_ORTHOGONAL],
  [-1, 0, STEP_ORTHOGONAL],
  [0, 1, STEP_ORTHOGONAL],
  [0, -1, STEP_ORTHOGONAL],
  [1, 1, STEP_DIAGONAL],
  [1, -1, STEP_DIAGONAL],
  [-1, 1, STEP_DIAGONAL],
  [-1, -1, STEP_DIAGONAL],
];

/**
 * Exact cost of the cheapest unobstructed eight-way route.
 *
 * Admissible because no real route can be cheaper, and consistent because it
 * satisfies the triangle inequality on this neighbour set — which together mean
 * the first time A* pops the goal it has the optimal path, with no reopening.
 */
export function octileDistance(fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  return Math.max(dx, dy) + (STEP_DIAGONAL - 1) * Math.min(dx, dy);
}

export interface PathResult {
  /** Cell indices from start to goal inclusive, or empty when there is no route. */
  readonly cells: readonly number[];
  readonly cost: number;
}

const NO_PATH: PathResult = { cells: [], cost: Number.POSITIVE_INFINITY };

/**
 * Cheapest route between two cells, or `NO_PATH`.
 *
 * Allocates. That is acceptable and is part of why this is the fallback: it runs
 * when a one-off task is created, not per tick, and the steady-state allocation
 * budget is about the tick loop. A version of this on the hot path would need
 * the same preallocated-scratch treatment `FlowField` has.
 */
export function findPath(
  grid: NavGrid,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
): PathResult {
  if (grid.isBlocked(startX, startY) || grid.isBlocked(goalX, goalY)) return NO_PATH;

  const goalIndex = grid.index(goalX, goalY);
  const startIndex = grid.index(startX, startY);
  if (startIndex === goalIndex) return { cells: [startIndex], cost: 0 };

  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[startIndex, 0]]);
  /*
   * A sorted array rather than a heap. The fallback runs over a few hundred
   * cells a handful of times a session, and an array whose comparison order is
   * written down here is easier to reason about than a heap — the determinism
   * suite compares world hashes across engines, and `Array.prototype.sort` on
   * equal keys is not specified to be stable everywhere it matters.
   */
  const open: { index: number; f: number; g: number }[] = [
    { index: startIndex, f: octileDistance(startX, startY, goalX, goalY), g: 0 },
  ];

  while (open.length > 0) {
    /*
     * Lowest f, and ties broken on the lower cell index. Any total order will
     * do; what matters is that it is the same order on every engine, because two
     * equally good paths are still two different paths and the world hash can
     * tell them apart.
     */
    let bestAt = 0;
    for (let i = 1; i < open.length; i++) {
      const candidate = open[i];
      const best = open[bestAt];
      if (candidate === undefined || best === undefined) continue;
      if (candidate.f < best.f || (candidate.f === best.f && candidate.index < best.index)) {
        bestAt = i;
      }
    }

    const current = open.splice(bestAt, 1)[0];
    if (current === undefined) break;
    if (current.index === goalIndex) return reconstruct(cameFrom, goalIndex, current.g);

    // A stale entry: a cheaper route to this cell was found after it was queued.
    if (current.g > (gScore.get(current.index) ?? Number.POSITIVE_INFINITY)) continue;

    const cx = current.index % grid.width;
    const cy = (current.index - cx) / grid.width;

    for (const [dx, dy, step] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (grid.isBlocked(nx, ny)) continue;
      // The same corner rule as the flow field, or the two disagree about what
      // is legal and the test that compares them is comparing two models.
      if (dx !== 0 && dy !== 0 && (grid.isBlocked(cx + dx, cy) || grid.isBlocked(cx, cy + dy))) {
        continue;
      }

      const neighbour = grid.index(nx, ny);
      const tentative = current.g + step;
      if (tentative >= (gScore.get(neighbour) ?? Number.POSITIVE_INFINITY)) continue;

      cameFrom.set(neighbour, current.index);
      gScore.set(neighbour, tentative);
      open.push({
        index: neighbour,
        g: tentative,
        f: tentative + octileDistance(nx, ny, goalX, goalY),
      });
    }
  }

  return NO_PATH;
}

function reconstruct(cameFrom: Map<number, number>, goalIndex: number, cost: number): PathResult {
  const cells: number[] = [goalIndex];
  let cursor = goalIndex;
  while (cameFrom.has(cursor)) {
    const previous = cameFrom.get(cursor);
    if (previous === undefined) break;
    cells.push(previous);
    cursor = previous;
  }
  cells.reverse();
  return { cells, cost };
}
