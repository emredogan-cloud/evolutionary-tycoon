import { describe, expect, it } from 'vitest';
import { ACTOR_KIND_SPECS, ACTOR_KIND_VEHICLE } from '@config/actors';
import { ALL_LAYOUTS, layoutFor, layoutForStage } from '@config/layouts';
import type { StageLayout } from '@config/layouts/stage1';
import { maxPropertyLevel, parkingBays, property } from '@config/properties';

/**
 * Geometry the four stage layouts have to satisfy — Phase 11.
 *
 * These are not style rules. Each one was written because a layout broke it and
 * the break was invisible until something drew it: the simulation places a
 * parked car by its manoeuvre rather than by pathfinding into its bay, so two
 * bays three metres apart accept two cars and simply render them through each
 * other. `navigationIntact` cannot see that — it asks whether people can walk,
 * and they can walk perfectly well past a car that is inside another car.
 */

const VEHICLE = ACTOR_KIND_SPECS[ACTOR_KIND_VEHICLE];

/** A parked car's footprint, oriented by the bay's authored heading. */
function carBox(bay: StageLayout['parking'][number]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const alongX = Math.abs(bay.heading.x) >= Math.abs(bay.heading.y);
  const halfX = (alongX ? (VEHICLE?.footprintX ?? 0) : (VEHICLE?.footprintY ?? 0)) / 2;
  const halfY = (alongX ? (VEHICLE?.footprintY ?? 0) : (VEHICLE?.footprintX ?? 0)) / 2;
  return { minX: bay.x - halfX, minY: bay.y - halfY, maxX: bay.x + halfX, maxY: bay.y + halfY };
}

function overlaps(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

describe('every stage parks its cars in separate places', () => {
  it.each(ALL_LAYOUTS.map((layout, index) => [index + 1, layout] as const))(
    'stage %i has no two bays a car cannot both be in',
    (stage, layout) => {
      /**
       * **The defect this exists for.** Phase 11 authored the Stage 3 and Stage 4
       * rows at three-metre centres. A car is 4.5 m long and these bays are
       * parallel, so every neighbour pair overlapped by 1.5 m. Every test passed:
       * the sim was happy, navigation was intact, and the only symptom would have
       * been two cars occupying one patch of tarmac on screen.
       */
      const bays = layout.parking.map(carBox);
      for (let i = 0; i < bays.length; i++) {
        for (let j = i + 1; j < bays.length; j++) {
          const a = bays[i];
          const b = bays[j];
          if (a === undefined || b === undefined) continue;
          expect(
            overlaps(a, b),
            `stage ${String(stage)}: bays ${String(layout.parking[i]?.id)} and ` +
              `${String(layout.parking[j]?.id)} hold the same tarmac`,
          ).toBe(false);
        }
      }
    },
  );

  it.each(ALL_LAYOUTS.map((layout, index) => [index + 1, layout] as const))(
    'stage %i keeps every parked car inside the lot',
    (stage, layout) => {
      // A bay that hangs over the boundary draws a car floating off the edge of
      // the world, and the camera bounds are computed from the lot.
      for (const bay of layout.parking) {
        const box = carBox(bay);
        expect(box.minX, `stage ${String(stage)}: ${bay.id} hangs off the west edge`).toBeGreaterThanOrEqual(
          layout.lot.minX,
        );
        expect(box.maxX, `stage ${String(stage)}: ${bay.id} hangs off the east edge`).toBeLessThanOrEqual(
          layout.lot.maxX,
        );
        expect(box.maxY, `stage ${String(stage)}: ${bay.id} hangs off the south edge`).toBeLessThanOrEqual(
          layout.lot.maxY,
        );
      }
    },
  );

  it('never parks a car on top of a table', () => {
    /*
     * The east half of the lot becomes the restaurant at Stage 3, and the
     * temptation when a car park runs out of room is to keep going east. A bay
     * that reaches the dining room is a car in the dining room.
     */
    for (const layout of ALL_LAYOUTS) {
      for (const bay of layout.parking) {
        const box = carBox(bay);
        for (const table of layout.tables) {
          const pad = { minX: table.x - 0.7, minY: table.y - 0.7, maxX: table.x + 0.7, maxY: table.y + 0.7 };
          expect(overlaps(box, pad), `${bay.id} is parked on ${table.id}`).toBe(false);
        }
      }
    }
  });
});

describe('the lot only ever grows', () => {
  it('never takes a bay, a table or a queue slot away from the player', () => {
    /*
     * Evolution is meant to read as *expansion*. A stage that quietly removed
     * seating would be the one change the player cannot be told about
     * afterwards — they would simply find the restaurant worse and have no way
     * to know it was the upgrade that did it.
     *
     * Stage 4 adds no bays, and that is deliberate rather than an oversight: its
     * capacity comes from the drive-thru lane. This asserts the weaker, true
     * property — nothing is ever taken away — instead of a strict increase that
     * would have to be exempted for exactly that case.
     */
    for (let stage = 2; stage <= 4; stage++) {
      const previous = layoutForStage(stage - 1);
      const current = layoutForStage(stage);
      expect(current.parking.length, `stage ${String(stage)} lost parking`).toBeGreaterThanOrEqual(
        previous.parking.length,
      );
      expect(current.tables.length, `stage ${String(stage)} lost tables`).toBeGreaterThanOrEqual(
        previous.tables.length,
      );
      expect(current.queueCapacity, `stage ${String(stage)} lost queue`).toBeGreaterThanOrEqual(
        previous.queueCapacity,
      );
      expect(current.registers, `stage ${String(stage)} lost a register`).toBeGreaterThanOrEqual(
        previous.registers,
      );
    }
  });

  it('adds the drive-thru exactly once, at the stage that pays for it', () => {
    expect(layoutForStage(1).driveThru).toBeNull();
    expect(layoutForStage(2).driveThru).toBeNull();
    expect(layoutForStage(3).driveThru).toBeNull();
    expect(layoutForStage(4).driveThru).not.toBeNull();
  });
});

describe('every car park a property level can resolve', () => {
  /*
   * The property system makes the car park a dial the player turns *inside* a
   * stage, so the four authored layouts are no longer the only ones the game
   * runs. A Stage-1 lot with the level-2 car park is a combination nobody
   * authored, and it has to satisfy exactly the same geometry as the ones
   * somebody did — which is what the three rules above are for, applied to
   * every pair that `maxPropertyLevel` allows a world to be in.
   */
  const COMBINATIONS: readonly (readonly [number, number])[] = [1, 2, 3, 4].flatMap((stage) => {
    const levels: number[] = [];
    for (
      let level = 1;
      level <= Math.min(property('parking')?.maxLevel ?? 1, maxPropertyLevel(stage));
      level++
    ) {
      levels.push(level);
    }
    return levels.map((level) => [stage, level] as const);
  });

  it.each(COMBINATIONS)('stage %i at parking level %i keeps its cars apart and inside', (stage, level) => {
    const layout = layoutFor(stage, level);
    const where = `stage ${String(stage)} level ${String(level)}`;
    expect(layout.parking, where).toHaveLength(parkingBays(level));

    const bays = layout.parking.map(carBox);
    for (let i = 0; i < bays.length; i++) {
      const a = bays[i];
      if (a === undefined) continue;

      expect(a.minX, `${where}: ${String(layout.parking[i]?.id)} off the west edge`).toBeGreaterThanOrEqual(
        layout.lot.minX,
      );
      expect(a.maxX, `${where}: ${String(layout.parking[i]?.id)} off the east edge`).toBeLessThanOrEqual(
        layout.lot.maxX,
      );
      expect(a.maxY, `${where}: ${String(layout.parking[i]?.id)} off the south edge`).toBeLessThanOrEqual(
        layout.lot.maxY,
      );

      for (const table of layout.tables) {
        const pad = { minX: table.x - 0.7, minY: table.y - 0.7, maxX: table.x + 0.7, maxY: table.y + 0.7 };
        expect(overlaps(a, pad), `${where}: ${String(layout.parking[i]?.id)} parks on ${table.id}`).toBe(
          false,
        );
      }

      for (let j = i + 1; j < bays.length; j++) {
        const b = bays[j];
        if (b === undefined) continue;
        expect(
          overlaps(a, b),
          `${where}: ${String(layout.parking[i]?.id)} and ${String(layout.parking[j]?.id)} share tarmac`,
        ).toBe(false);
      }
    }
  });

  it('changes nothing but the car park', () => {
    // The level is a dial on one thing. If it ever moved a queue slot or a
    // table, the balance numbers measured per stage would stop meaning anything.
    for (const [stage, level] of COMBINATIONS) {
      const base = layoutForStage(stage);
      const resolved = layoutFor(stage, level);
      const where = `stage ${String(stage)} level ${String(level)}`;
      expect(resolved.queue, where).toBe(base.queue);
      expect(resolved.tables, where).toBe(base.tables);
      expect(resolved.statics, where).toBe(base.statics);
      expect(resolved.counter, where).toBe(base.counter);
      expect(resolved.driveThru, where).toBe(base.driveThru);
      expect(resolved.registers, where).toBe(base.registers);
    }
  });

  it('gives a Stage-1 player the bay they paid for', () => {
    /*
     * **The defect this exists for.** Sliced against the stage's own parking
     * list, buying the level-2 car park in Stage 1 charged the money, ran the
     * construction, raised the level — and delivered four bays, exactly as
     * before. The player would have had to evolve before their purchase did
     * anything, which is the fake benefit §39 forbids and is invisible from
     * inside the simulation: every level, cost and hash was correct.
     */
    expect(layoutFor(1, 2).parking.length).toBeGreaterThan(layoutFor(1, 1).parking.length);
  });
});
