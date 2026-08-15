import type { NavGrid } from './NavGrid';

/**
 * One goal's flow field — GAME_DESIGN_DOCUMENT §10, RESEARCH_NOTES §8.
 *
 * Dijkstra backwards from the goal produces an **integration field** (cost to
 * reach the goal from every cell), and the gradient of that produces a **vector
 * field** (which way to step from every cell). An agent then navigates by a
 * single array lookup, no search at all.
 *
 * That is the whole argument for doing it this way here: few goals, many agents,
 * a small map that changes rarely. Forty customers heading for the same counter
 * would otherwise run forty A* searches over the same corridor. The usual
 * flow-field objection — memory on a large map — does not apply to 48×36 cells.
 *
 * ## Why Dijkstra and not breadth-first search
 *
 * Diagonal steps cost √2 and orthogonal steps cost 1. A breadth-first search
 * treats them as equal, which makes a diagonal look 41% cheaper than it is and
 * produces paths that stagger diagonally when they should go straight. The
 * difference is small on open ground and very visible around a corner.
 *
 * ## Corner cutting
 *
 * A diagonal step is only allowed when **both** orthogonal neighbours it passes
 * between are free. Without that check an agent clips the corner of the counter
 * — geometrically it passes through a point the grid says is solid, and on
 * screen it walks through the furniture. The check is written out inline in both
 * loops rather than factored into a helper: they are the two hottest loops in
 * the phase, and the call was measurable.
 */

/** Cost of an orthogonal step, in cells. */
const STEP_ORTHOGONAL = 1;
/** Cost of a diagonal step. Not 1 — see the class comment. */
const STEP_DIAGONAL = Math.SQRT2;

/** Marks a cell the goal cannot be reached from. */
export const UNREACHABLE = Number.POSITIVE_INFINITY;

/**
 * The eight neighbour offsets, orthogonals first so ties resolve predictably.
 *
 * Three flat arrays rather than an array of tuples, and the difference is not
 * stylistic. `for (const [dx, dy, step] of NEIGHBOURS)` destructures on every
 * iteration, and a full rebuild at the budget's scale runs that loop about
 * 650 000 times — it measured **42.9 ms against a 12 ms budget** before this
 * change and 8.9 ms after, with no change to what is computed.
 */
const NEIGHBOUR_DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const NEIGHBOUR_DY = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);
const NEIGHBOUR_STEP = new Float64Array([
  STEP_ORTHOGONAL,
  STEP_ORTHOGONAL,
  STEP_ORTHOGONAL,
  STEP_ORTHOGONAL,
  STEP_DIAGONAL,
  STEP_DIAGONAL,
  STEP_DIAGONAL,
  STEP_DIAGONAL,
]);
const NEIGHBOUR_COUNT = 8;

export class FlowField {
  /** Cost to reach the goal from each cell; `UNREACHABLE` where it cannot. */
  readonly cost: Float64Array;
  /** Unit direction to step from each cell, as two parallel arrays. */
  readonly dirX: Float32Array;
  readonly dirY: Float32Array;

  readonly goalX: number;
  readonly goalY: number;

  private readonly grid: NavGrid;
  /**
   * Scratch for the Dijkstra frontier, sized to the grid once.
   *
   * A binary heap over cell indices. Preallocated because `FlowFieldCache`
   * rebuilds every field on a layout change, and twenty allocations of a
   * thousand-entry array in one frame is the kind of thing that turns a build
   * into a stutter.
   */
  private readonly heap: Int32Array;
  private heapSize = 0;

  constructor(grid: NavGrid, goalCellX: number, goalCellY: number) {
    this.grid = grid;
    this.goalX = goalCellX;
    this.goalY = goalCellY;

    const count = grid.cellCount;
    this.cost = new Float64Array(count);
    this.dirX = new Float32Array(count);
    this.dirY = new Float32Array(count);
    this.heap = new Int32Array(count);

    this.rebuild();
  }

  /** Cost from a cell to the goal. `UNREACHABLE` when there is no route. */
  costAt(cx: number, cy: number): number {
    if (!this.grid.inBounds(cx, cy)) return UNREACHABLE;
    return this.cost[this.grid.index(cx, cy)] ?? UNREACHABLE;
  }

  reachable(cx: number, cy: number): boolean {
    return Number.isFinite(this.costAt(cx, cy));
  }

  /**
   * Recompute from the grid as it currently is.
   *
   * Called by `FlowFieldCache` on a layout change and never per tick — the whole
   * point of the approach is that this is rare.
   */
  rebuild(): void {
    this.cost.fill(UNREACHABLE);
    this.dirX.fill(0);
    this.dirY.fill(0);
    this.heapSize = 0;

    const grid = this.grid;
    if (grid.isBlocked(this.goalX, this.goalY)) return;

    const goalIndex = grid.index(this.goalX, this.goalY);
    this.cost[goalIndex] = 0;
    this.push(goalIndex);

    /*
     * Hoisted out of the loop and read directly rather than through
     * `grid.isBlocked`. This is the innermost loop of the most expensive thing
     * in the phase, and a method call plus a bounds check per neighbour was a
     * measurable fraction of it.
     */
    const cells = grid.cells;
    const width = grid.width;
    const height = grid.height;

    while (this.heapSize > 0) {
      const index = this.pop();
      const cx = index % width;
      const cy = (index - cx) / width;
      const here = this.cost[index] ?? UNREACHABLE;

      for (let n = 0; n < NEIGHBOUR_COUNT; n++) {
        const dx = NEIGHBOUR_DX[n] ?? 0;
        const dy = NEIGHBOUR_DY[n] ?? 0;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

        const neighbour = ny * width + nx;
        if (cells[neighbour] !== 0) continue;
        if (dx !== 0 && dy !== 0) {
          if (cells[cy * width + nx] !== 0 || cells[ny * width + cx] !== 0) continue;
        }

        const next = here + (NEIGHBOUR_STEP[n] ?? 1);
        if (next >= (this.cost[neighbour] ?? UNREACHABLE)) continue;
        this.cost[neighbour] = next;
        this.push(neighbour);
      }
    }

    this.buildVectors();
  }

  /**
   * Turn the integration field into directions.
   *
   * Each cell points at whichever reachable neighbour has the lowest cost, which
   * is a descent step rather than a true gradient. That is the right choice on a
   * grid this coarse: an interpolated gradient produces directions that do not
   * point at any cell an agent can actually stand in, and around a doorway it
   * aims them at the door frame.
   */
  private buildVectors(): void {
    const grid = this.grid;
    const cells = grid.cells;
    const width = grid.width;
    const height = grid.height;
    const goalIndex = grid.index(this.goalX, this.goalY);

    for (let cy = 0; cy < height; cy++) {
      for (let cx = 0; cx < width; cx++) {
        const index = cy * width + cx;
        if (!Number.isFinite(this.cost[index] ?? UNREACHABLE)) continue;
        if (index === goalIndex) continue;

        let bestCost = this.cost[index] ?? UNREACHABLE;
        let bestX = 0;
        let bestY = 0;

        for (let n = 0; n < NEIGHBOUR_COUNT; n++) {
          const dx = NEIGHBOUR_DX[n] ?? 0;
          const dy = NEIGHBOUR_DY[n] ?? 0;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

          const neighbour = ny * width + nx;
          if (cells[neighbour] !== 0) continue;
          if (dx !== 0 && dy !== 0) {
            if (cells[cy * width + nx] !== 0 || cells[ny * width + cx] !== 0) continue;
          }

          const neighbourCost = this.cost[neighbour] ?? UNREACHABLE;
          // Strictly less than, so the first neighbour in a tie wins and the
          // order above — orthogonals before diagonals — decides it. A tie
          // broken by iteration order is still a tie broken the same way on
          // every engine, which is what determinism needs.
          if (neighbourCost < bestCost) {
            bestCost = neighbourCost;
            bestX = dx;
            bestY = dy;
          }
        }

        if (bestX === 0 && bestY === 0) continue;
        const length = Math.hypot(bestX, bestY);
        this.dirX[index] = bestX / length;
        this.dirY[index] = bestY / length;
      }
    }
  }

  // --- binary min-heap over cell indices, keyed by `cost` ------------------
  //
  // Hand-written rather than a library or an array sort: it works on a
  // preallocated Int32Array, so a rebuild allocates nothing, and its comparison
  // order is fixed rather than engine-defined. The same reasoning as the lane
  // ordering in `VehicleMotionSystem`.

  /*
   * Lazy deletion. A cell can be queued more than once, and popping it again
   * re-relaxes its neighbours against `cost[index]` — which by then holds the
   * best value found, so the second pass computes the same answers and changes
   * nothing. Redundant work, never wrong work, and far cheaper than maintaining
   * a decrease-key index over the heap for a graph this size.
   */
  private push(index: number): void {
    if (this.heapSize >= this.heap.length) return;
    let child = this.heapSize;
    this.heap[child] = index;
    this.heapSize++;

    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.keyAt(parent) <= this.keyAt(child)) break;
      this.swap(parent, child);
      child = parent;
    }
  }

  private pop(): number {
    const top = this.heap[0] ?? 0;
    this.heapSize--;
    this.heap[0] = this.heap[this.heapSize] ?? 0;

    let parent = 0;
    for (;;) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < this.heapSize && this.keyAt(left) < this.keyAt(smallest)) smallest = left;
      if (right < this.heapSize && this.keyAt(right) < this.keyAt(smallest)) smallest = right;
      if (smallest === parent) break;
      this.swap(parent, smallest);
      parent = smallest;
    }
    return top;
  }

  private keyAt(slot: number): number {
    return this.cost[this.heap[slot] ?? 0] ?? UNREACHABLE;
  }

  private swap(a: number, b: number): void {
    const temp = this.heap[a] ?? 0;
    this.heap[a] = this.heap[b] ?? 0;
    this.heap[b] = temp;
  }
}
