import { describe, expect, it } from 'vitest';
import { UPGRADES } from '@config/economy/upgrades';
import { STATIONS } from '@config/economy/stations';
import { ALL_LAYOUTS, layoutFor, layoutForStage } from '@config/layouts';
import { STAGE_REQUIREMENTS } from '@config/progression';
import { worldObject } from '@config/sprites';
import {
  PROPERTIES,
  maxPropertyLevel,
  parkingBays,
  parseProperties,
  property,
  propertyBuildMs,
  propertyCost,
  propertyLevelArt,
  propertyVia,
} from '@config/properties';

/**
 * The property ladder's own rules — `docs/RESTAURANT_EVOLUTION_ROADMAP.md` §B.
 *
 * The design's whole claim is that a property is a **named view over what the
 * player already owns**, not a second economy. That claim is falsifiable, and
 * these are the falsifications: a derived rung that names an upgrade nobody
 * sells, a level whose bay count is not a real authored set, a stage floor
 * asking for a level the stage cannot reach, or a ladder with a level the
 * simulation has nothing to do with.
 */

describe('the property table', () => {
  it('rejects a ladder shorter than the levels it claims', () => {
    /*
     * The validator, given deliberately bad input. A check that is only ever
     * run on data known to be correct is a check nobody has checked — the same
     * reasoning that put `parseBuildings` and `parseRoles` under test.
     */
    const short = () =>
      parseProperties([
        {
          id: 'parking',
          label: 'Otopark',
          description: 'x',
          ladder: 'own',
          maxLevel: 3,
          costByLevel: [5],
          buildMsByLevel: [1000, 2000],
        },
      ]);
    expect(short).toThrow(/costByLevel has 1 entries for 2 rungs/);

    const missingVia = () =>
      parseProperties([
        { id: 'kitchen', label: 'Mutfak', description: 'x', ladder: 'derived', maxLevel: 3, viaByLevel: [] },
      ]);
    expect(missingVia).toThrow(/viaByLevel has 0 entries for 2 rungs/);
  });

  it('names a real upgrade for every derived rung', () => {
    // A rung pointing at an id nobody sells is a card whose button does
    // nothing — and it would look identical to a working one.
    const known = new Set(UPGRADES.map((item) => item.id));
    for (const spec of PROPERTIES) {
      if (spec.ladder !== 'derived') continue;
      for (let level = 2; level <= spec.maxLevel; level++) {
        const via = propertyVia(spec, level);
        expect(via, `${spec.id} level ${String(level)} names no rung`).toBeDefined();
        expect(known.has(via ?? ''), `${spec.id} -> ${String(via)} is not an upgrade`).toBe(true);
      }
    }
  });

  it('prices and times every rung of an own ladder', () => {
    for (const spec of PROPERTIES) {
      if (spec.ladder !== 'own') continue;
      expect(spec.costByLevel).toHaveLength(spec.maxLevel - 1);
      expect(spec.buildMsByLevel).toHaveLength(spec.maxLevel - 1);
      // Strictly rising: a later level that costs less would be bought first.
      for (let i = 1; i < spec.costByLevel.length; i++) {
        expect(spec.costByLevel[i] ?? 0).toBeGreaterThan(spec.costByLevel[i - 1] ?? 0);
      }
    }
  });

  it('gives every level a name and an art verdict that holds up', () => {
    /*
     * §23's zero-omission rule, mechanised — and the check that was missing.
     *
     * The car park shipped as "verified art" with no asset at all, so the card
     * rendered "the art is still being made" under `data-art="real"`: a promise
     * of a picture nobody is drawing, over a claim that it already exists. Only
     * the browser noticed. These three rules make the combination unsayable.
     */
    for (const spec of PROPERTIES) {
      for (let level = 1; level <= spec.maxLevel; level++) {
        const art = propertyLevelArt(spec.id, level);
        const where = `${spec.id} level ${String(level)}`;
        expect(art.name, `${where} has no name`).not.toBe('');

        if (art.kind === 'sprite') {
          // Claimed as this level's own art: the frame has to exist, and it has
          // to be a *different* object from the level below, or it is a repeat
          // wearing a verified badge.
          expect(worldObject(art.asset), `${where} draws unknown object "${art.asset}"`).toBeDefined();
          if (level > 1) {
            expect(art.asset, `${where} repeats the level below and calls it new`).not.toBe(
              propertyLevelArt(spec.id, level - 1).asset,
            );
          }
        } else if (art.kind === 'procedural') {
          // Painted from the layout, so there is nothing to look up and there
          // is something to count.
          expect(art.asset, `${where} is procedural but names a sprite`).toBe('');
          expect(art.cells, `${where} paints nothing`).toBeGreaterThan(0);
        } else {
          // Art not delivered. It may still name what the world draws today —
          // that is the truth about the world — but the preview refuses it.
          if (art.asset !== '') {
            expect(worldObject(art.asset), `${where} names an object nobody draws`).toBeDefined();
          }
        }
      }
    }
  });

  it('answers a level nobody has, without inventing one', () => {
    /*
     * These lookups are reached by a loaded save, a replayed log and a build
     * that has since changed a ladder's length — none of which promise a level
     * in range. Every one clamps or returns `undefined`; none throws, and none
     * makes up a price.
     */
    expect(propertyLevelArt('parking', 0)).toEqual(propertyLevelArt('parking', 1));
    expect(propertyLevelArt('parking', 99)).toEqual(propertyLevelArt('parking', 3));
    // An id with no art table at all — a property added to the config and not
    // to the art. It reports no name, which is what the §23 test then fails on.
    expect(propertyLevelArt('helipad', 1).name).toBe('');

    expect(parkingBays(0)).toBe(parkingBays(1));
    expect(parkingBays(99)).toBe(parkingBays(3));

    const parking = property('parking');
    if (parking === undefined) throw new Error('no parking');
    expect(propertyCost(parking, 1)).toBeUndefined();
    expect(propertyCost(parking, 99)).toBeUndefined();
    expect(propertyBuildMs(parking, 99)).toBeUndefined();

    const frontage = property('frontage');
    if (frontage === undefined) throw new Error('no frontage');
    expect(propertyVia(frontage, 99)).toBeUndefined();

    // The stage ceiling clamps at both ends: a corrupt stage 0 and a stage 9
    // both land somewhere the ladders can actually reach.
    expect(maxPropertyLevel(0)).toBe(2);
    expect(maxPropertyLevel(9)).toBe(4);
  });

  it('paints the car park preview from the bay table, not from a second list', () => {
    for (let level = 1; level <= (property('parking')?.maxLevel ?? 1); level++) {
      expect(propertyLevelArt('parking', level).cells).toBe(parkingBays(level));
    }
  });
});

describe('the parking ladder is the existing layouts', () => {
  it('opens exactly the bay counts the four stages already author', () => {
    /*
     * The claim that makes this system cheap: a level does not invent a car
     * park, it says how much of the authored one is built. If these ever stop
     * matching, `layoutFor` starts slicing a list whose members were never
     * navigation-tested together.
     */
    expect(parkingBays(1)).toBe(ALL_LAYOUTS[0]?.parking.length);
    expect(parkingBays(2)).toBe(ALL_LAYOUTS[1]?.parking.length);
    expect(parkingBays(3)).toBe(ALL_LAYOUTS[2]?.parking.length);
    // Stage 4 adds the drive-thru rather than more tarmac.
    expect(ALL_LAYOUTS[3]?.parking.length).toBe(ALL_LAYOUTS[2]?.parking.length);
  });

  it('is a prefix chain, so a slice is always an authored set', () => {
    for (let i = 1; i < ALL_LAYOUTS.length; i++) {
      const previous = ALL_LAYOUTS[i - 1]?.parking ?? [];
      const current = ALL_LAYOUTS[i]?.parking ?? [];
      expect(current.length).toBeGreaterThanOrEqual(previous.length);
      for (let bay = 0; bay < previous.length; bay++) {
        expect(current[bay], `stage ${String(i + 1)} moved bay ${String(bay)}`).toEqual(previous[bay]);
      }
    }
  });

  it('resolves a layout that differs from its stage in the car park and nothing else', () => {
    const base = layoutForStage(3);
    const reduced = layoutFor(3, 1);

    expect(reduced.parking).toHaveLength(4);
    expect(base.parking).toHaveLength(8);
    // Everything else is the same object graph: a level is a slice, not a
    // second layout to keep in step.
    expect(reduced.queue).toBe(base.queue);
    expect(reduced.tables).toBe(base.tables);
    expect(reduced.statics).toBe(base.statics);
    expect(reduced.counter).toBe(base.counter);

    // At the level that matches the stage, it *is* the stage layout — which is
    // what keeps every pre-existing balance number exactly where it was.
    expect(layoutFor(3, 3)).toBe(base);
  });
});

describe('the stage floor is reachable from inside the stage below', () => {
  it('never asks for a level the previous stage cannot build', () => {
    /*
     * The ceiling is `min(4, stage + 1)`: one tier of headroom, so a Stage-2
     * floor of "level 2" is bought during Stage 1. A floor above the ceiling
     * would be a requirement no amount of play can meet.
     */
    for (const requirement of STAGE_REQUIREMENTS) {
      const from = requirement.stage - 1;
      const ceiling = maxPropertyLevel(from);
      for (const [id, need] of Object.entries(requirement.requiredProperties)) {
        expect(
          need,
          `stage ${String(requirement.stage)} asks ${id} ${String(need)} > ceiling`,
        ).toBeLessThanOrEqual(ceiling);
        const spec = property(id);
        expect(spec, `stage ${String(requirement.stage)} names unknown property ${id}`).toBeDefined();
        expect(need).toBeLessThanOrEqual(spec?.maxLevel ?? 0);
      }
    }
  });

  it('never asks for less than the stage before it', () => {
    for (let i = 1; i < STAGE_REQUIREMENTS.length; i++) {
      const previous = STAGE_REQUIREMENTS[i - 1]?.requiredProperties ?? {};
      const current = STAGE_REQUIREMENTS[i]?.requiredProperties ?? {};
      for (const [id, need] of Object.entries(previous)) {
        expect(current[id] ?? 0, `${id} went backwards at stage ${String(i + 2)}`).toBeGreaterThanOrEqual(
          need,
        );
      }
    }
  });
});

describe('a level means something the simulation does', () => {
  it('caps the kitchen at the benches that actually exist', () => {
    /*
     * `prepStations` unlocks a bench per point, and `STATIONS` carries exactly
     * two behind it. A kitchen ladder longer than that would be a level whose
     * number rises and whose kitchen does not — the fake benefit §39 forbids.
     */
    const gated = STATIONS.filter((station) => station.requiresPrepStations > 0);
    const highest = Math.max(0, ...gated.map((station) => station.requiresPrepStations));
    expect(property('kitchen')?.maxLevel).toBe(1 + highest);
  });

  it('caps parking where the lot runs out, not at four for symmetry', () => {
    expect(property('parking')?.maxLevel).toBe(parkingBays(3) === parkingBays(4) ? 3 : 4);
  });
});
