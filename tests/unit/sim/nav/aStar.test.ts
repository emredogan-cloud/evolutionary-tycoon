import { describe, expect, it } from 'vitest';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { findPath, octileDistance } from '@sim/nav/aStar';
import { FlowField } from '@sim/nav/FlowField';
import { NavGrid } from '@sim/nav/NavGrid';

/** An empty lot: no road, no statics, no bays, no queue. */
function openGrid(): NavGrid {
  return new NavGrid({
    ...STAGE1_LAYOUT,
    statics: [],
    parking: [],
    queue: [],
    road: { ...STAGE1_LAYOUT.road, lanes: [] },
  });
}

/**
 * A* is the fallback and only the fallback (RESEARCH_NOTES §8).
 *
 * The roadmap's requirement is specific: on an open grid it must find the same
 * optimal path as the flow field. The two are separate implementations of the
 * same movement rules, so the test is really asking whether they agree about
 * what a step costs and what is legal — and if they ever stop agreeing, an agent
 * sent to a one-off target would take a visibly different route from everyone
 * else crossing the same ground.
 */
describe('the octile heuristic', () => {
  it('is exact on an unobstructed grid', () => {
    // Which is what makes it admissible: no real route can be cheaper.
    expect(octileDistance(0, 0, 3, 0)).toBeCloseTo(3, 9);
    expect(octileDistance(0, 0, 3, 3)).toBeCloseTo(3 * Math.SQRT2, 9);
    // Two diagonals then one straight.
    expect(octileDistance(0, 0, 3, 2)).toBeCloseTo(1 + 2 * Math.SQRT2, 9);
  });

  it('is symmetric and zero at the goal', () => {
    expect(octileDistance(4, 7, 4, 7)).toBe(0);
    expect(octileDistance(1, 2, 9, 8)).toBeCloseTo(octileDistance(9, 8, 1, 2), 12);
  });
});

describe('A* against the flow field', () => {
  it('finds the same cost on an open grid', () => {
    /*
     * GAME_EXECUTION_ROADMAP Phase 7's third testing requirement. Costs rather
     * than cell-by-cell routes, because with equal-cost alternatives there are
     * many optimal paths and only the cost is unique — asserting one particular
     * route would be asserting a tie-break, not correctness.
     */
    const grid = openGrid();
    const goalX = 30;
    const goalY = 24;
    const field = new FlowField(grid, goalX, goalY);

    let compared = 0;
    for (let cy = 2; cy < grid.height - 2; cy += 5) {
      for (let cx = 2; cx < grid.width - 2; cx += 5) {
        if (grid.isBlocked(cx, cy)) continue;
        const path = findPath(grid, cx, cy, goalX, goalY);
        expect(path.cost, `from ${String(cx)},${String(cy)}`).toBeCloseTo(field.costAt(cx, cy), 6);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(20);
  });

  it('agrees with the flow field around real obstacles too', () => {
    // The open-grid case is the roadmap's requirement; this is the one that
    // would actually catch a disagreement about corner cutting.
    const grid = new NavGrid(STAGE1_LAYOUT);
    const goalX = grid.cellXAt(12);
    const goalY = grid.cellYAt(9.8);
    if (grid.isBlocked(goalX, goalY)) throw new Error('goal is blocked');
    const field = new FlowField(grid, goalX, goalY);

    let compared = 0;
    for (let cy = 0; cy < grid.height; cy += 3) {
      for (let cx = 0; cx < grid.width; cx += 3) {
        if (grid.isBlocked(cx, cy) || !field.reachable(cx, cy)) continue;
        const path = findPath(grid, cx, cy, goalX, goalY);
        expect(path.cost, `from ${String(cx)},${String(cy)}`).toBeCloseTo(field.costAt(cx, cy), 6);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(20);
  });
});

describe('the path itself', () => {
  it('starts at the start and ends at the goal', () => {
    const grid = openGrid();
    const path = findPath(grid, 4, 4, 20, 16);
    expect(path.cells[0]).toBe(grid.index(4, 4));
    expect(path.cells[path.cells.length - 1]).toBe(grid.index(20, 16));
  });

  it('steps only between neighbouring cells', () => {
    // A path that jumps is a reconstruction bug, and it shows up as an agent
    // teleporting rather than as an error.
    const grid = new NavGrid(STAGE1_LAYOUT);
    const path = findPath(
      grid,
      grid.cellXAt(3.5),
      grid.cellYAt(10.75),
      grid.cellXAt(20.5),
      grid.cellYAt(10.75),
    );
    expect(path.cells.length).toBeGreaterThan(1);

    for (let i = 1; i < path.cells.length; i++) {
      const previous = path.cells[i - 1] ?? 0;
      const current = path.cells[i] ?? 0;
      const px = previous % grid.width;
      const py = (previous - px) / grid.width;
      const cx = current % grid.width;
      const cy = (current - cx) / grid.width;
      expect(Math.max(Math.abs(cx - px), Math.abs(cy - py)), `step ${String(i)} jumps`).toBe(1);
    }
  });

  it('never routes through a blocked cell', () => {
    const grid = new NavGrid(STAGE1_LAYOUT);
    const path = findPath(
      grid,
      grid.cellXAt(3.5),
      grid.cellYAt(10.75),
      grid.cellXAt(20.5),
      grid.cellYAt(10.75),
    );
    for (const cell of path.cells) {
      const cx = cell % grid.width;
      const cy = (cell - cx) / grid.width;
      expect(grid.isBlocked(cx, cy), `cell ${String(cx)},${String(cy)}`).toBe(false);
    }
  });

  it('reports no path rather than an approximate one', () => {
    /*
     * The caller has to be able to tell. An A* that returns its closest attempt
     * sends an agent confidently to the wrong side of a wall, which looks like
     * a navigation bug and is really an API that could not say "no".
     */
    const grid = new NavGrid(STAGE1_LAYOUT);
    // The far side of the road, which is not walkable.
    const path = findPath(grid, grid.cellXAt(4), grid.cellYAt(12), grid.cellXAt(4), grid.cellYAt(1));
    expect(path.cells).toEqual([]);
    expect(path.cost).toBe(Number.POSITIVE_INFINITY);
  });

  it('refuses a start or goal that is inside something solid', () => {
    const grid = new NavGrid(STAGE1_LAYOUT);
    const counterX = grid.cellXAt(STAGE1_LAYOUT.counter.x);
    const counterY = grid.cellYAt(STAGE1_LAYOUT.counter.y);
    expect(findPath(grid, counterX, counterY, 4, 24).cells).toEqual([]);
    expect(findPath(grid, 4, 24, counterX, counterY).cells).toEqual([]);
  });

  it('returns the single cell when the start is the goal', () => {
    const grid = openGrid();
    const path = findPath(grid, 8, 8, 8, 8);
    expect(path.cells).toEqual([grid.index(8, 8)]);
    expect(path.cost).toBe(0);
  });

  it('produces the same path twice', () => {
    // Ties are broken on the lower cell index precisely so that two equally good
    // routes resolve the same way on every engine.
    const grid = new NavGrid(STAGE1_LAYOUT);
    const a = findPath(grid, 6, 22, 40, 26);
    const b = findPath(grid, 6, 22, 40, 26);
    expect(a.cells).toEqual(b.cells);
  });
});
