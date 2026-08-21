import { layoutForStage } from '@config/layouts';
import type { World } from '../core/World';
import { NavGrid } from './NavGrid';

/**
 * "Would this placement strand somebody?" — Phase 11.
 *
 * A placement that blocks navigation must be **rejected**, not accepted and then
 * discovered later as a lot full of people who cannot reach the counter. This
 * is the check that decides, and it asks the navigation grid rather than
 * comparing rectangles: the grid is the authority on where people can walk, and
 * a second implementation would disagree with it on exactly the case that
 * matters — the diagonal gap between two objects that looks passable and is not.
 *
 * ## Why a flood fill and not a path
 *
 * A path from one bay to the counter proves that *one* route survives. The
 * question is whether **every** door still reaches the counter, and a flood fill
 * from the counter answers all of them in one pass — cheaper than N path
 * searches and, more importantly, impossible to get subtly wrong by picking the
 * wrong representative bay.
 *
 * ## Why it builds a grid rather than reusing the cached one
 *
 * The cached grid belongs to `NavigationSystem` and reflects the world as it was
 * before this placement. Rebuilding it to test a *hypothetical* would leave the
 * live cache describing a world that may be rolled back a line later. A grid is
 * a `Uint8Array` of a few thousand cells; building one is cheap and it is only
 * done when the player places something.
 */

/**
 * Is every parking door still able to reach the counter?
 *
 * Also checks the drive-thru window from Stage 4, because a car park that
 * reaches the counter is no comfort to a lane that does not reach its window.
 */
export function navigationIntact(world: World): boolean {
  const layout = layoutForStage(world.progression.stage);
  const grid = new NavGrid(layout);
  grid.rebuild(world.layout.placed);

  /*
   * Flooded from the **first queue slot**, not the counter.
   *
   * The counter is a static object, so its own cell is blocked — flooding from
   * it returns nothing and every placement looks like it walls the world in.
   * That was the first version of this function and it rejected every placement
   * in the game, including on an empty lot.
   *
   * The queue's slots are forced walkable by `NavGrid.openQueue` precisely
   * because people have to be able to stand there, which makes slot 0 the
   * closest guaranteed-walkable point to the counter.
   */
  const origin = layout.queue[0] ?? layout.counter;
  const reached = floodFrom(grid, origin.x, origin.y);
  if (reached === null) return false;

  for (const bay of layout.parking) {
    const cx = grid.cellXAt(bay.door.x);
    const cy = grid.cellYAt(bay.door.y);
    if (!grid.inBounds(cx, cy)) continue;
    /*
     * A blocked door is not a failure. Parking bays are blocked in the grid by
     * design — a car occupies them — and what matters is that the *door cell*,
     * which the customer walks from, is reachable. If the door itself is
     * blocked the customer never gets out, and that is caught below.
     */
    if (grid.isBlocked(cx, cy)) return false;
    if (reached[grid.index(cx, cy)] !== 1) return false;
  }

  return true;
}

/**
 * Every cell reachable from a world point, as a flag array.
 *
 * Null when the origin is itself blocked, which is a distinct answer from
 * "nothing is reachable": one means the placement walled in the counter, the
 * other would mean the lot has no walkable cells at all.
 *
 * Four-connected rather than eight. The flow field uses diagonals with a
 * corner-cutting rule, so an eight-connected fill here would call a diagonal
 * squeeze passable that the actual navigation refuses — and the placement would
 * be approved on a route nobody can walk.
 */
function floodFrom(grid: NavGrid, worldX: number, worldY: number): Uint8Array | null {
  const startX = grid.cellXAt(worldX);
  const startY = grid.cellYAt(worldY);
  if (!grid.inBounds(startX, startY) || grid.isBlocked(startX, startY)) return null;

  const reached = new Uint8Array(grid.cellCount);
  // A plain array as a ring-free queue: the fill visits each cell once, so the
  // total pushes are bounded by the cell count and the growth is amortised.
  const queue: number[] = [grid.index(startX, startY)];
  reached[queue[0] ?? 0] = 1;

  // Indexed rather than `for-of`, because the array **grows while it is being
  // read** — that is the whole mechanism of a breadth-first fill, and `for-of`
  // over a mutating array is a different algorithm.
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head] ?? 0;
    const cx = index % grid.width;
    const cy = Math.floor(index / grid.width);

    for (let direction = 0; direction < 4; direction++) {
      const nx = cx + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
      const ny = cy + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
      if (!grid.inBounds(nx, ny)) continue;
      if (grid.isBlocked(nx, ny)) continue;

      const neighbour = grid.index(nx, ny);
      if (reached[neighbour] === 1) continue;
      reached[neighbour] = 1;
      queue.push(neighbour);
    }
  }

  return reached;
}
