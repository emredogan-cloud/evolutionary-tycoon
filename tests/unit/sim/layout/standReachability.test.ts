import { describe, expect, it } from 'vitest';
import { layoutForStage } from '@config/layouts';
import { CELL_SIZE_METRES, NavGrid } from '@sim/nav/NavGrid';
import { Sim } from '@sim/core/Sim';
import { navigationIntact } from '@sim/nav/reachability';

/** The four restaurant stages, as the type the world actually holds. */
const STAGES = [1, 2, 3, 4] as const;

/**
 * The stand moved inward, and every stage still walks — Decision D.
 *
 * The counter went from y 11 to y 12.6 in the stage-1 expansion pass, and the
 * awning, the sign, the queue, the serving spots and the bin moved with it.
 * The directive is explicit that this is not finished because a report says it
 * happened, so what is checked here is the property the move exists to
 * establish rather than the coordinates it was made with:
 *
 * > every parking door can still reach the counter, on a **bare** lot, at
 * > **every** stage.
 *
 * `navigationIntact` is used everywhere in the suite to judge a *placement*,
 * and there was no test asking it about the layouts themselves. So a layout
 * edit that sealed a bay off would have been caught only by whichever
 * placement test happened to stand near the damage — or by nobody.
 *
 * ## Why the walkway is measured rather than asserted at a number
 *
 * `stage1.ts` claims the move opened a walkway band between the parked cars
 * and the stand. A band is a consequence of four separate numbers (bay centre,
 * car length, counter position, counter footprint), and pinning it to a
 * literal here would just be a fifth place for those to disagree. The band is
 * measured from the grid and required to be *at least one cell deep*, which is
 * the real requirement: a walkway thinner than the navigation grid is not a
 * walkway.
 */

/** The rows a pedestrian can stand on, between the layby and the counter. */
function walkableRowsBetween(stage: number): { rows: number[]; grid: NavGrid } {
  const layout = layoutForStage(stage);
  const grid = new NavGrid(layout);
  grid.rebuild([]);

  const doorY = Math.min(...layout.parking.map((bay) => bay.door.y));
  const rows: number[] = [];
  for (let y = doorY; y < layout.counter.y; y += CELL_SIZE_METRES) {
    const cy = grid.cellYAt(y);
    const cx = grid.cellXAt(layout.counter.x);
    if (!grid.isBlocked(cx, cy)) rows.push(Number(y.toFixed(2)));
  }
  return { rows, grid };
}

describe('the stand sits inward and the lot still walks', () => {
  it('puts the counter at the same place in all four stages', () => {
    /*
     * The same-plot evolution law: the counter is THE fixed point every stage
     * is built around, so a move that reached only Stage 1 would make the
     * building grow out from under its own front door.
     */
    const counters = STAGES.map((stage) => layoutForStage(stage).counter);
    for (const counter of counters) {
      expect(counter).toEqual(counters[0]);
    }
    expect(counters[0]?.y, 'the counter did not move inward').toBeGreaterThan(11);
  });

  it.each(STAGES)('stage %i: every parking door reaches the counter on a bare lot', (stage) => {
    const sim = new Sim({ seed: 424242 });
    sim.world.progression.stage = stage;
    expect(navigationIntact(sim.world), `stage ${String(stage)} strands a bay`).toBe(true);
  });

  it.each(STAGES)('stage %i: there is a walkway between the cars and the counter', (stage) => {
    const { rows } = walkableRowsBetween(stage);
    expect(
      rows.length,
      `stage ${String(stage)} walkable rows in front of the counter: ${rows.length === 0 ? 'none' : rows.join(', ')}`,
    ).toBeGreaterThan(0);
  });

  it('keeps the queue in front of the counter, not inside it', () => {
    /*
     * The dependent most likely to be forgotten in a move, because it is the
     * only one that is a list. Slot 0 is where somebody stands to be served,
     * so it has to be *outside* the counter's footprint and *walkable*.
     */
    for (const stage of STAGES) {
      const layout = layoutForStage(stage);
      const grid = new NavGrid(layout);
      grid.rebuild([]);

      const slot = layout.queue[0];
      expect(slot, `stage ${String(stage)} has no queue`).toBeDefined();
      if (slot === undefined) continue;

      expect(slot.y, `stage ${String(stage)} slot 0 is behind the counter`).toBeLessThan(layout.counter.y);
      expect(
        grid.isBlocked(grid.cellXAt(slot.x), grid.cellYAt(slot.y)),
        `stage ${String(stage)} slot 0 is inside a solid object`,
      ).toBe(false);
    }
  });

  it('leaves the queue tail reaching the road, which is the mechanic', () => {
    /*
     * The opposite failure to the one above, and the reason the move was
     * *graded* rather than a rigid translation: slots past `queueCapacity` are
     * meant to sit at the road edge so an overwhelmed stand is visible to the
     * drivers it is losing (ECONOMY_DESIGN §7, Fren 4). Moving the whole queue
     * 1.6 m inward would have quietly deleted the economy's only negative
     * feedback loop by pulling its tail off the road.
     */
    const layout = layoutForStage(1);
    const tail = layout.queue.at(-1);
    const head = layout.queue[0];
    expect(tail).toBeDefined();
    expect(head).toBeDefined();
    if (tail === undefined || head === undefined) return;

    expect(tail.y, 'the queue tail left the roadside').toBeLessThan(layout.parking[0]?.y ?? 0);
    expect(head.y - tail.y, 'the queue no longer spans from counter to road').toBeGreaterThan(4);
  });
});
