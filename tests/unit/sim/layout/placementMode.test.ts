import { describe, expect, it } from 'vitest';
import { layoutForStage } from '@config/layouts';
import { Sim } from '@sim/core/Sim';
import { CELL_SIZE_METRES, NavGrid } from '@sim/nav/NavGrid';
import { navigationIntact } from '@sim/nav/reachability';
import { PLACEMENT_GRID_METRES, placeObject, snapToGrid } from '@sim/systems/LayoutSystem';

/**
 * **S4 — free-form or grid-snapped?** GAME_DESIGN_DOCUMENT §25.
 *
 * The roadmap: _"Build both cheaply, try both, decide, and record why."_ Both
 * were built — free placement is `placeObject` without the `snapToGrid` call —
 * and this file is the measurement the decision was made from. It stays in the
 * suite because the decision is only as good as the property it rests on, and a
 * future change that makes free placement predictable would be a reason to
 * revisit it.
 *
 * **The finding**: the navigation grid has 0.5 m cells, so a freely-placed
 * object either rounds to the same cells a snapped one would — in which case the
 * freedom is a lie the preview tells — or straddles a boundary and blocks a cell
 * the player can see they did not cover. Grid-snapped wins because it makes
 * "what will this block" answerable *before* the click.
 */

/** The cells an object at this world point blocks. */
function blockedCells(x: number, y: number): string {
  const layout = layoutForStage(1);
  const grid = new NavGrid(layout);
  grid.rebuild([{ objectId: 'ph-prop-short', x, y, z: 0 }]);

  const cells: string[] = [];
  for (let cy = 0; cy < grid.height; cy++) {
    for (let cx = 0; cx < grid.width; cx++) {
      if (grid.isBlocked(cx, cy)) cells.push(`${String(cx)},${String(cy)}`);
    }
  }
  return cells.join('|');
}

describe('the placement grid is the navigation grid', () => {
  it('snaps to exactly the cell size, not a prettier number', () => {
    /*
     * They are the same constant on purpose. A placement grid of, say, one
     * metre would put an object across two navigation cells and reintroduce
     * precisely the unpredictability snapping exists to remove.
     */
    expect(PLACEMENT_GRID_METRES).toBe(CELL_SIZE_METRES);
  });
});

describe('why free placement was rejected', () => {
  it('makes clicks the player cannot tell apart block different cells', () => {
    /*
     * **The measurement that decided it**, and it took two attempts to state
     * correctly.
     *
     * The first version swept a whole cell and compared — which is not the
     * question, because clicks half a cell apart *should* land differently under
     * either mode. The question is what happens inside one **snap basin**: the
     * ±0.25 m around a grid point, which is the region a player aiming at a
     * given cell will actually hit, and which they cannot subdivide by eye.
     *
     * Free placement blocks a different set of cells within that basin. Snapped
     * placement blocks exactly one set. From the player's side that is the
     * difference between an object that goes where they pointed and one that
     * sometimes eats a neighbouring cell.
     */
    const basin: number[] = [];
    for (let offset = -0.24; offset <= 0.24; offset += 0.06) basin.push(offset);

    const free = new Set(basin.map((offset) => blockedCells(8 + offset, 16 + offset)));
    const snapped = new Set(
      basin.map((offset) => blockedCells(snapToGrid(8 + offset), snapToGrid(16 + offset))),
    );

    expect(free.size, 'free placement was predictable after all').toBeGreaterThan(1);
    expect(snapped.size, 'snapping did not make it predictable').toBe(1);
  });

  it('does not, on this layout, change the accept/reject verdict', () => {
    /*
     * **A claim the measurement refused to support, recorded rather than
     * dropped.**
     *
     * The expectation was that free placement would also flip *whether* a wall
     * is allowed, depending on sub-cell aim. It does not — swept across a full
     * cell on this layout, every offset produced the same sequence of verdicts.
     *
     * So the case for snapping rests entirely on **which cells get blocked**
     * (above), not on the verdict being unstable. Asserting the stability keeps
     * that honest: if a future layout makes the verdict sub-cell sensitive, this
     * fails and the argument gets stronger rather than quietly changing shape.
     */
    const verdicts = new Set<string>();

    for (let offset = 0; offset < CELL_SIZE_METRES; offset += 0.1) {
      const sim = new Sim({ seed: 1 });
      const outcomes: string[] = [];
      for (let y = 9.5; y <= 18; y += CELL_SIZE_METRES) {
        // Placed without snapping, which is what "free-form" means.
        sim.world.layout.placed.push({ objectId: 'ph-prop-short', x: 11 + offset, y, z: 0 });
        sim.world.layout.revision++;
        if (!navigationIntact(sim.world)) {
          sim.world.layout.placed.pop();
          outcomes.push('refused');
        } else {
          outcomes.push('ok');
        }
      }
      verdicts.add(outcomes.join(''));
    }

    expect(verdicts.size).toBe(1);
  });

  it('gives grid placement one verdict per cell, whatever the player aimed at', () => {
    const verdicts = new Set<string>();

    for (let offset = 0; offset < CELL_SIZE_METRES; offset += 0.1) {
      const sim = new Sim({ seed: 1 });
      const outcomes: string[] = [];
      for (let y = 9.5; y <= 18; y += CELL_SIZE_METRES) {
        outcomes.push(placeObject(sim.world, 'ph-prop-short', 11 + offset, y, navigationIntact));
      }
      verdicts.add(outcomes.join(''));
    }

    expect(verdicts.size, 'snapped placement was still unpredictable').toBe(1);
  });
});
