import { describe, expect, it } from 'vitest';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { FlowField, UNREACHABLE } from '@sim/nav/FlowField';
import { FlowFieldCache, GOAL_COUNTER, GOAL_EXIT, parkingGoal } from '@sim/nav/FlowFieldCache';
import { NavGrid } from '@sim/nav/NavGrid';

const cache = new FlowFieldCache(STAGE1_LAYOUT);
const grid = cache.grid;

/**
 * Following the field from a cell, one step at a time.
 *
 * This is what an agent does, minus the steering — so it is the honest way to
 * ask "can you actually get there from here", which is stronger than asking
 * whether a cost exists.
 */
function walk(field: FlowField, startX: number, startY: number, limit = 4000): number {
  let cx = startX;
  let cy = startY;
  for (let step = 0; step < limit; step++) {
    if (cx === field.goalX && cy === field.goalY) return step;
    const index = grid.index(cx, cy);
    const dx = field.dirX[index] ?? 0;
    const dy = field.dirY[index] ?? 0;
    if (dx === 0 && dy === 0) return -1;
    cx += Math.round(dx);
    cy += Math.round(dy);
    if (!grid.inBounds(cx, cy)) return -1;
  }
  return -1;
}

describe('a flow field', () => {
  it('costs nothing at the goal, and falls the whole way there', () => {
    /*
     * Monotonic descent along the field rather than "further cells cost more",
     * because on a grid with obstacles those are different claims — a cell two
     * away round a corner is genuinely dearer than one eight away in the open.
     * What the steering system actually relies on is that following the arrows
     * always gets cheaper, and that is what is asserted.
     */
    const field = cache.field(GOAL_COUNTER);
    if (field === null) throw new Error('no counter field');
    expect(field.costAt(field.goalX, field.goalY)).toBe(0);

    let checked = 0;
    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        if (grid.isBlocked(cx, cy) || !field.reachable(cx, cy)) continue;
        if (cx === field.goalX && cy === field.goalY) continue;
        const index = grid.index(cx, cy);
        const dx = Math.round(field.dirX[index] ?? 0);
        const dy = Math.round(field.dirY[index] ?? 0);
        if (dx === 0 && dy === 0) continue;
        expect(
          field.costAt(cx + dx, cy + dy),
          `cell ${String(cx)},${String(cy)} steps to somewhere no cheaper`,
        ).toBeLessThan(field.costAt(cx, cy));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('charges √2 for a diagonal, not 1', () => {
    /*
     * A breadth-first search treats the two as equal, which makes a diagonal
     * look 41% cheaper than it is. The result staggers diagonally where it
     * should go straight — barely visible on open ground, obvious around a
     * corner.
     */
    /*
     * A genuinely empty lot: no statics, no bays, no queue — and **no road**.
     * Leaving the lanes in place blocks a seven-metre band through the middle,
     * which is where cell (10, 10) is, so the goal itself was solid and the
     * field came back empty.
     */
    const open = new NavGrid({
      ...STAGE1_LAYOUT,
      statics: [],
      parking: [],
      queue: [],
      road: { ...STAGE1_LAYOUT.road, lanes: [] },
    });
    const field = new FlowField(open, 10, 10);

    expect(field.costAt(12, 10)).toBeCloseTo(2, 6);
    expect(field.costAt(12, 12)).toBeCloseTo(2 * Math.SQRT2, 6);
    // And the diagonal is dearer than the same number of steps orthogonally.
    expect(field.costAt(12, 12)).toBeGreaterThan(field.costAt(12, 10));
  });

  it('reaches the goal from every reachable cell', () => {
    /*
     * GAME_EXECUTION_ROADMAP Phase 7's first testing requirement. "A cost
     * exists" is weaker than it sounds — a vector field built from a correct
     * cost field can still have a cell whose best neighbour is itself, and an
     * agent standing there never moves. This walks the field instead.
     */
    const field = cache.field(GOAL_COUNTER);
    if (field === null) throw new Error('no counter field');

    let reachable = 0;
    let stranded = 0;
    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        if (grid.isBlocked(cx, cy)) continue;
        if (!field.reachable(cx, cy)) continue;
        reachable++;
        if (walk(field, cx, cy) < 0) stranded++;
      }
    }

    expect(reachable).toBeGreaterThan(100);
    expect(stranded, `${String(stranded)} reachable cells cannot follow the field to the goal`).toBe(0);
  });

  it('marks cells it cannot reach, rather than pointing them somewhere hopeful', () => {
    // An agent on the far side of the road must not be told to walk into it.
    const field = cache.field(GOAL_COUNTER);
    if (field === null) throw new Error('no counter field');

    // A cell in the middle of the carriageway, away from the queue's spill.
    const roadX = grid.cellXAt(4);
    const roadY = grid.cellYAt(5);
    expect(grid.isBlocked(roadX, roadY)).toBe(true);
    expect(field.costAt(roadX, roadY)).toBe(UNREACHABLE);
    expect(field.reachable(roadX, roadY)).toBe(false);
  });

  it('never cuts a corner diagonally', () => {
    /*
     * A diagonal step is only legal when both orthogonals beside it are free.
     * Without the check the agent passes through the corner point of a solid
     * cell — on screen, straight through the furniture.
     */
    const field = cache.field(GOAL_COUNTER);
    if (field === null) throw new Error('no counter field');

    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        if (grid.isBlocked(cx, cy) || !field.reachable(cx, cy)) continue;
        const index = grid.index(cx, cy);
        const dx = Math.round(field.dirX[index] ?? 0);
        const dy = Math.round(field.dirY[index] ?? 0);
        if (dx === 0 || dy === 0) continue;
        expect(
          grid.isBlocked(cx + dx, cy) || grid.isBlocked(cx, cy + dy),
          `cell ${String(cx)},${String(cy)} cuts a corner`,
        ).toBe(false);
      }
    }
  });

  it('never points into a blocked cell', () => {
    const field = cache.field(GOAL_COUNTER);
    if (field === null) throw new Error('no counter field');

    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        if (grid.isBlocked(cx, cy) || !field.reachable(cx, cy)) continue;
        const index = grid.index(cx, cy);
        const dx = Math.round(field.dirX[index] ?? 0);
        const dy = Math.round(field.dirY[index] ?? 0);
        if (dx === 0 && dy === 0) continue;
        expect(grid.isBlocked(cx + dx, cy + dy), `cell ${String(cx)},${String(cy)}`).toBe(false);
      }
    }
  });

  it('produces a unit direction wherever it produces one at all', () => {
    // The steering system multiplies by a speed and trusts the length.
    const field = cache.field(GOAL_COUNTER);
    if (field === null) throw new Error('no counter field');

    for (let index = 0; index < grid.cellCount; index++) {
      const dx = field.dirX[index] ?? 0;
      const dy = field.dirY[index] ?? 0;
      if (dx === 0 && dy === 0) continue;
      expect(Math.hypot(dx, dy)).toBeCloseTo(1, 6);
    }
  });

  it('leaves an unreachable goal as an empty field rather than throwing', () => {
    // Reachable from a layout where the player has walled something in.
    const walled = new NavGrid(STAGE1_LAYOUT);
    const field = new FlowField(walled, walled.cellXAt(12), walled.cellYAt(11));
    // The counter's own cell is solid, so nothing can reach it.
    expect(field.costAt(0, 0)).toBe(UNREACHABLE);
  });
});

describe('the flow field cache', () => {
  it('has a field for every goal Phase 7 owns', () => {
    expect(cache.field(GOAL_COUNTER)).not.toBeNull();
    expect(cache.field(GOAL_EXIT)).not.toBeNull();
    for (let bay = 0; bay < STAGE1_LAYOUT.parking.length; bay++) {
      expect(cache.field(parkingGoal(bay)), parkingGoal(bay)).not.toBeNull();
    }
  });

  it('returns null for a goal a later phase will introduce', () => {
    /*
     * Null rather than a throw. `kitchen_pass` and `table_<n>` belong to Phase 8
     * and are deliberately absent rather than aimed at a placeholder position —
     * a goal that exists and is wrong is worse than one that is missing, because
     * the missing one fails loudly.
     */
    expect(cache.field('kitchen_pass')).toBeNull();
    expect(cache.field('table_3')).toBeNull();
  });

  it('snaps a goal inside an obstacle onto the nearest cell you can stand in', () => {
    /*
     * The counter's authored position is the middle of the counter, which is
     * solid. Without snapping, "walk to the counter" would be unreachable from
     * everywhere and the field would be uniformly empty — a bug that looks like
     * customers ignoring the counter rather than like a grid detail.
     */
    const field = cache.field(GOAL_COUNTER);
    if (field === null) throw new Error('no counter field');
    expect(grid.isBlocked(field.goalX, field.goalY)).toBe(false);

    const counterCellX = grid.cellXAt(STAGE1_LAYOUT.counter.x);
    const counterCellY = grid.cellYAt(STAGE1_LAYOUT.counter.y);
    // Snapped, but not far — it is still the counter you are walking to.
    expect(Math.abs(field.goalX - counterCellX)).toBeLessThanOrEqual(3);
    expect(Math.abs(field.goalY - counterCellY)).toBeLessThanOrEqual(3);
  });

  it('gets a walkable direction from a bay door to the counter', () => {
    // The one route Phase 6 actually needs, end to end.
    const out = { x: 0, y: 0 };
    for (const bay of STAGE1_LAYOUT.parking) {
      expect(cache.directionAt(GOAL_COUNTER, bay.door.x, bay.door.y, out), bay.id).toBe(true);
      expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 6);
    }
  });

  it('reports failure rather than a zero vector for an unknown goal', () => {
    const out = { x: 9, y: 9 };
    expect(cache.directionAt('nowhere', 12, 12, out)).toBe(false);
    // Untouched, so a caller that ignores the return value does not get a
    // silent (0,0) that reads as "you have arrived".
    expect(out).toEqual({ x: 9, y: 9 });
  });

  it('rebuilds every field when the layout changes, and says that it did', () => {
    const local = new FlowFieldCache(STAGE1_LAYOUT);
    const before = local.version;
    /*
     * Placed at (7, 12) and not on the walkway at (12, 9.5), which was the first
     * choice and does not work: the queue is authored down that corridor and
     * `NavGrid.openQueue` forces those cells walkable last, so an object dropped
     * on a queue slot is silently ignored. That is the intended precedence —
     * the queue must always be standable or the spillover mechanic disappears —
     * but it makes the corridor the wrong place to test invalidation from.
     */
    const spot = { objectId: 'ph-prop-tall', x: 7, y: 12, z: 0 };
    const cx = local.grid.cellXAt(spot.x);
    const cy = local.grid.cellYAt(spot.y);
    expect(local.grid.isBlocked(cx, cy)).toBe(false);

    local.rebuild([spot]);
    // The grid is rebuilt immediately; the fields are queued. See below.
    local.finish();
    expect(local.version).toBeGreaterThan(before);
    expect(local.grid.isBlocked(cx, cy)).toBe(true);

    const field = local.field(GOAL_COUNTER);
    if (field === null) throw new Error('no counter field');
    // The cell is inside the obstacle now, so nothing routes from it.
    expect(field.reachable(cx, cy)).toBe(false);
    // And the rest of the lot still works — the rebuild did not strand anyone.
    const out = { x: 0, y: 0 };
    expect(local.directionAt(GOAL_COUNTER, STAGE1_LAYOUT.parking[0]?.door.x ?? 0, 10.1, out)).toBe(true);
  });

  it('produces identical fields from identical input', () => {
    // Determinism: the fields feed steering, which feeds positions, which the
    // world hash digests.
    const a = new FlowFieldCache(STAGE1_LAYOUT);
    const b = new FlowFieldCache(STAGE1_LAYOUT);
    const fieldA = a.field(GOAL_COUNTER);
    const fieldB = b.field(GOAL_COUNTER);
    if (fieldA === null || fieldB === null) throw new Error('no counter field');

    expect([...fieldA.cost]).toEqual([...fieldB.cost]);
    expect([...fieldA.dirX]).toEqual([...fieldB.dirX]);
    expect([...fieldA.dirY]).toEqual([...fieldB.dirY]);
  });
});

describe('chunking the recompute', () => {
  it('rebuilds the grid at once and the fields one at a time', () => {
    /*
     * GAME_EXECUTION_ROADMAP Phase 7: the recompute "must not block a frame —
     * chunk it per goal if necessary", with 12 ms for all twenty goals as the
     * threshold. Measured at that scale it is 9.8 ms on a developer machine and
     * 19.7 ms on a CI runner, so it is necessary.
     *
     * The grid itself is cheap and is rebuilt immediately, because everything
     * else reads it — a queued grid would have agents routing against geometry
     * that no longer exists.
     */
    const local = new FlowFieldCache(STAGE1_LAYOUT);
    expect(local.rebuilding).toBe(false);

    local.rebuild([{ objectId: 'ph-prop-tall', x: 7, y: 12, z: 0 }]);
    expect(local.grid.isBlocked(local.grid.cellXAt(7), local.grid.cellYAt(12))).toBe(true);
    expect(local.rebuilding, 'nothing was queued').toBe(true);

    let steps = 0;
    while (local.rebuilding) {
      expect(local.step(1)).toBe(1);
      steps++;
      expect(steps, 'the queue never drained').toBeLessThan(100);
    }
    expect(steps).toBe(STAGE1_LAYOUT.parking.length + 2);
  });

  it('keeps serving the previous field while the queue drains', () => {
    /*
     * Stale, not wrong. Each existing field routes around every obstacle that
     * existed a moment ago; it simply does not know about the one just placed.
     * For the fraction of a second before its turn comes, that is a far smaller
     * error than leaving every agent with no route at all — which is what
     * clearing the fields on `rebuild` would do.
     */
    const local = new FlowFieldCache(STAGE1_LAYOUT);
    const out = { x: 0, y: 0 };
    const door = STAGE1_LAYOUT.parking[0]?.door;
    if (door === undefined) throw new Error('layout');

    expect(local.directionAt(GOAL_COUNTER, door.x, door.y, out)).toBe(true);

    local.rebuild([{ objectId: 'ph-prop-tall', x: 7, y: 12, z: 0 }]);
    expect(local.directionAt(GOAL_COUNTER, door.x, door.y, out), 'no route mid-rebuild').toBe(true);

    local.finish();
    expect(local.directionAt(GOAL_COUNTER, door.x, door.y, out)).toBe(true);
  });

  it('is eager at construction, because there is no frame to protect yet', () => {
    // And no previous field to fall back on, which is the stronger reason.
    const local = new FlowFieldCache(STAGE1_LAYOUT);
    expect(local.rebuilding).toBe(false);
    expect(local.field(GOAL_COUNTER)).not.toBeNull();
  });

  it('drops a superseded queue rather than rebuilding twice', () => {
    // Two builds in quick succession: the second invalidates the first, and
    // draining both would spend a second of ticks on fields nobody will read.
    const local = new FlowFieldCache(STAGE1_LAYOUT);
    local.rebuild([{ objectId: 'ph-prop-tall', x: 7, y: 12, z: 0 }]);
    local.step(1);
    local.rebuild([]);

    let steps = 0;
    while (local.rebuilding) {
      local.step(1);
      steps++;
    }
    expect(steps).toBe(STAGE1_LAYOUT.parking.length + 2);
  });
});
