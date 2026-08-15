import { describe, expect, it } from 'vitest';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { CELL_SIZE_METRES, NavGrid } from '@sim/nav/NavGrid';

const grid = new NavGrid(STAGE1_LAYOUT);

/**
 * The walkable grid.
 *
 * Everything a pedestrian does downstream is a consequence of this array, and a
 * mistake here does not look like a grid bug — it looks like an agent walking
 * through a wall, or standing still forever because the only route out of its
 * cell was blocked by half a metre of rounding.
 */
describe('NavGrid geometry', () => {
  it('covers the lot at the authored resolution', () => {
    const { lot } = STAGE1_LAYOUT;
    expect(grid.width).toBe(Math.ceil((lot.maxX - lot.minX) / CELL_SIZE_METRES));
    expect(grid.height).toBe(Math.ceil((lot.maxY - lot.minY) / CELL_SIZE_METRES));
    expect(grid.cellCount).toBe(grid.width * grid.height);
    // RESEARCH_NOTES §8 sizes the whole approach on this being small.
    expect(grid.cellCount).toBeLessThan(64 * 64);
  });

  it('round-trips a world position through a cell centre', () => {
    for (const [x, y] of [
      [0.1, 0.1],
      [12, 11],
      [23.9, 17.9],
    ] as const) {
      const cx = grid.cellXAt(x);
      const cy = grid.cellYAt(y);
      // Within half a cell — the definition of "this cell contains that point".
      expect(Math.abs(grid.centreX(cx) - x)).toBeLessThanOrEqual(CELL_SIZE_METRES / 2);
      expect(Math.abs(grid.centreY(cy) - y)).toBeLessThanOrEqual(CELL_SIZE_METRES / 2);
    }
  });

  it('clamps a position outside the lot rather than returning a negative cell', () => {
    // Reachable: the road runs past the lot edge, so an agent's position can be
    // outside it for a tick. A negative index would silently read another row.
    expect(grid.cellXAt(-100)).toBe(0);
    expect(grid.cellYAt(-100)).toBe(0);
    expect(grid.cellXAt(1000)).toBe(grid.width - 1);
    expect(grid.cellYAt(1000)).toBe(grid.height - 1);
  });

  it('treats everything outside its bounds as blocked', () => {
    // So a steering step that walks off the edge is refused rather than crashing.
    expect(grid.isBlocked(-1, 0)).toBe(true);
    expect(grid.isBlocked(0, -1)).toBe(true);
    expect(grid.isBlocked(grid.width, 0)).toBe(true);
    expect(grid.isBlocked(0, grid.height)).toBe(true);
  });
});

describe('what the grid blocks', () => {
  it('blocks the road', () => {
    /*
     * A design decision rather than a physical one: pedestrians crossing traffic
     * would be the most interesting thing on screen and it is not a mechanic
     * this game has.
     */
    /*
     * Probed away from x = 12. The queue is authored to spill onto the road
     * there on purpose, and those cells are forced walkable — so a probe at the
     * queue would be testing the exception rather than the rule.
     */
    for (const lane of STAGE1_LAYOUT.road.lanes) {
      const point = lane.points[0];
      if (point === undefined) continue;
      expect(grid.isBlocked(grid.cellXAt(4), grid.cellYAt(point.y)), lane.id).toBe(true);
      expect(grid.isBlocked(grid.cellXAt(20), grid.cellYAt(point.y)), lane.id).toBe(true);
    }
  });

  it('blocks the counter and the parking bays', () => {
    const counter = STAGE1_LAYOUT.counter;
    expect(grid.isBlocked(grid.cellXAt(counter.x), grid.cellYAt(counter.y))).toBe(true);

    for (const bay of STAGE1_LAYOUT.parking) {
      expect(grid.isBlocked(grid.cellXAt(bay.x), grid.cellYAt(bay.y)), bay.id).toBe(true);
    }
  });

  it('leaves the bay doors walkable', () => {
    /*
     * A customer steps out here. This failed when the doors were authored 1.2 m
     * from the bay centre: a car is 1.9 m wide, so 1.2 m clears the bodywork but
     * the 0.5 m grid rounded the two into the same cell and marked the spot
     * solid. Every flow-field lookup from a bay door returned nothing.
     */
    for (const bay of STAGE1_LAYOUT.parking) {
      expect(grid.isBlocked(grid.cellXAt(bay.door.x), grid.cellYAt(bay.door.y)), bay.id).toBe(false);
    }
  });

  it('leaves every authored queue slot walkable, including the ones on the road', () => {
    /*
     * The last queue slots are deliberately on the road — that is the whole
     * spillover mechanic (ECONOMY_DESIGN §7, Fren 4). Blocking them would remove
     * the economy's only negative feedback loop by way of a grid detail, and it
     * would do it silently: the queue would simply never grow past four.
     */
    for (const slot of STAGE1_LAYOUT.queue) {
      expect(
        grid.isBlocked(grid.cellXAt(slot.x), grid.cellYAt(slot.y)),
        `queue slot at ${String(slot.x)},${String(slot.y)}`,
      ).toBe(false);
    }
  });

  it('leaves the walkway between the middle bays open', () => {
    // The corridor customers use to reach the counter. It is authored as a gap
    // in the bay positions, so it is worth asserting it survived the footprints.
    const corridorX = grid.cellXAt(12);
    let open = 0;
    for (let cy = grid.cellYAt(9.5); cy <= grid.cellYAt(10.2); cy++) {
      if (!grid.isBlocked(corridorX, cy)) open++;
    }
    expect(open, 'the walkway to the counter is blocked').toBeGreaterThan(0);
  });

  it('leaves most of the lot walkable', () => {
    // A sanity bound. A grid that blocked nearly everything would still satisfy
    // every check above and would strand every agent.
    let free = 0;
    for (let cy = 0; cy < grid.height; cy++) {
      for (let cx = 0; cx < grid.width; cx++) {
        if (!grid.isBlocked(cx, cy)) free++;
      }
    }
    const fraction = free / grid.cellCount;
    expect(fraction, `${(fraction * 100).toFixed(0)}% of the lot is walkable`).toBeGreaterThan(0.4);
  });
});

describe('rebuilding', () => {
  it('blocks a newly placed object and frees it again when removed', () => {
    // The invalidation path, which Phase 7's risk table calls out. `rebuild` is
    // the only entry point precisely so this cannot be got half right.
    const local = new NavGrid(STAGE1_LAYOUT);
    const spot = { x: 6, y: 13, z: 0 };
    const cx = local.cellXAt(spot.x);
    const cy = local.cellYAt(spot.y);
    expect(local.isBlocked(cx, cy)).toBe(false);

    local.rebuild([{ objectId: 'ph-prop-tall', ...spot }]);
    expect(local.isBlocked(cx, cy)).toBe(true);

    local.rebuild([]);
    expect(local.isBlocked(cx, cy)).toBe(false);
  });

  it('ignores an object the catalogue does not know', () => {
    /*
     * A save written by a build that had an object this one has dropped must
     * load. It should load as a gap in the scenery rather than as a crash —
     * which is what an unknown key would be if it threw.
     */
    const local = new NavGrid(STAGE1_LAYOUT);
    expect(() => {
      local.rebuild([{ objectId: 'not-a-real-object', x: 6, y: 13, z: 0 }]);
    }).not.toThrow();
    expect(local.isBlocked(local.cellXAt(6), local.cellYAt(13))).toBe(false);
  });

  it('produces the same grid from the same input, every time', () => {
    const a = new NavGrid(STAGE1_LAYOUT);
    const b = new NavGrid(STAGE1_LAYOUT);
    expect([...a.cells]).toEqual([...b.cells]);

    a.rebuild([{ objectId: 'ph-prop-short', x: 5, y: 12, z: 0 }]);
    b.rebuild([{ objectId: 'ph-prop-short', x: 5, y: 12, z: 0 }]);
    expect([...a.cells]).toEqual([...b.cells]);
  });
});
