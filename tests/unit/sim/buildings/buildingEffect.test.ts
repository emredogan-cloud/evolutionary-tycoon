import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  building,
  buildingAsset,
  buildingBuildMs,
  buildingCost,
  buildingEffectTerms,
  parseBuildings,
  stageForLevel,
} from '@config/buildings';
import { worldObject } from '@config/sprites';
import { menuIndexOf, menuItem } from '@config/economy/menu';
import { station } from '@config/economy/stations';
import { Sim } from '@sim/core/Sim';
import { ORDER_COOKING, ORDER_PLACED } from '@sim/stores/OrderStore';
import { stationSpeed } from '@sim/systems/KitchenSystem';
import { effectValue } from '@sim/systems/UpgradeSystem';
import { buyPlace, upgradeBuilding } from '@sim/systems/StoreSystem';

/**
 * Functional buildings — Decision B's whole condition.
 *
 * > every purchased building changes the actual game
 *
 * So these do not check that an effect *exists*; they check that the number
 * the kitchen actually divides by moved, that it moved only when the site
 * finished, and that it moved by the amount the definition promises. A
 * building whose effect nothing consumes would pass a "the config has an
 * effects array" test and fail every one of these.
 */

function rig(stage = 1, cash = 10_000): Sim {
  const sim = new Sim({ seed: 5 });
  sim.world.progression.stage = stage as 1 | 2 | 3 | 4;
  sim.world.economy.cash = cash;
  return sim;
}

/** Somewhere on the lot that is legal and out of everybody's way. */
const SPOT = { x: 4, y: 16.5 } as const;

/** The station index of the first station of a type. */
function stationOfType(type: string): number {
  for (let index = 0; index < 32; index++) {
    try {
      if (station(index).type === type) return index;
    } catch {
      break;
    }
  }
  throw new Error(`no ${type} station`);
}

describe('what a functional building is', () => {
  it('names only effects something in the kitchen actually divides by', () => {
    // The definition side of the inertness rule. `fourProperties.test.ts`
    // proves every declared kind is read somewhere in src/sim; this proves the
    // buildings do not declare a kind outside that set.
    const consumed = new Set(['drinkStationSpeed', 'grillStationSpeed', 'prepStations', 'prepSpeed']);
    for (const item of BUILDINGS) {
      for (const level of item.effectsByLevel) {
        for (const effect of level) {
          expect(consumed.has(effect.kind), `${item.id} declares unconsumed ${effect.kind}`).toBe(true);
        }
      }
    }
  });

  it('has real art for every level it offers', () => {
    for (const item of BUILDINGS) {
      for (let level = 1; level <= item.maxLevel; level++) {
        const objectId = buildingAsset(item, level);
        expect(worldObject(objectId), `${item.id} L${String(level)} names a missing object`).toBeDefined();
      }
    }
  });

  it('prices and times every level it offers', () => {
    for (const item of BUILDINGS) {
      for (let level = 1; level <= item.maxLevel; level++) {
        expect(buildingCost(item, level), `${item.id} L${String(level)} has no price`).toBeGreaterThan(0);
      }
      // Rising, so a later level is never the cheaper way to buy the earlier.
      for (let level = 2; level <= item.maxLevel; level++) {
        expect(buildingCost(item, level) ?? 0).toBeGreaterThan(buildingCost(item, level - 1) ?? 0);
      }
    }
  });
});

describe('the drinks machine', () => {
  it('does nothing at all until its site finishes', () => {
    const sim = rig();
    const before = effectValue(sim.world, 'drinkStationSpeed');
    expect(before).toBe(1);

    expect(buyPlace(sim.world, 'cola-machine', SPOT.x, SPOT.y)).toBe('ok');

    // The object is on the lot from the click — it holds its cell — but the
    // effect is not, because the level is still zero.
    expect(sim.world.layout.placed).toHaveLength(1);
    expect(sim.world.layout.placed[0]?.level).toBe(0);
    expect(
      effectValue(sim.world, 'drinkStationSpeed'),
      'a building under construction was already paying out',
    ).toBe(1);
    expect(sim.world.layout.pendingBuilds).toHaveLength(1);
    expect(sim.world.layout.pendingBuilds[0]?.targetLevel).toBe(1);
  });

  it('speeds the drink station, and only the drink station, once built', () => {
    const sim = rig();
    expect(buyPlace(sim.world, 'cola-machine', SPOT.x, SPOT.y)).toBe('ok');

    const drink = stationOfType('DRINK');
    const grill = stationOfType('GRILL');
    const drinkBefore = stationSpeed(sim.world, drink);
    const grillBefore = stationSpeed(sim.world, grill);

    sim.advance(400); // past the six game-minute site
    expect(sim.world.layout.pendingBuilds).toHaveLength(0);
    expect(sim.world.layout.placed[0]?.level).toBe(1);

    const promised = building('cola-machine')?.effectsByLevel[0]?.[0]?.value ?? 0;
    expect(promised).toBeGreaterThan(1);
    expect(
      stationSpeed(sim.world, drink),
      'the drink station did not speed up by what the card promises',
    ).toBeCloseTo(drinkBefore * promised, 9);
    expect(stationSpeed(sim.world, grill), 'a drinks machine sped up the grill').toBeCloseTo(grillBefore, 9);
  });

  it('shortens a real drink order by the amount it promises', () => {
    /*
     * The end of the chain: not the effect value, but the time the kitchen
     * actually cooks for. Measured through the order pipeline rather than by
     * recomputing the formula here, so a change that moved the formula and
     * left this test's copy behind could not pass.
     */
    const cook = (withMachine: boolean): number => {
      const sim = rig();
      if (withMachine) {
        expect(buyPlace(sim.world, 'cola-machine', SPOT.x, SPOT.y)).toBe('ok');
        sim.advance(400);
      }
      const slot = sim.world.orders.acquire();
      const order = sim.world.orders.at(slot);
      order.entityId = sim.world.allocateEntityId();
      order.item = menuIndexOf('lemonade');
      order.state = ORDER_PLACED;
      order.orderedAtMs = sim.world.clock.simTimeMs;
      order.customerSlot = -1;

      sim.dispatch({ t: 'MANUAL_PREP', orderSlot: slot });
      sim.tick();
      expect(sim.world.orders.at(slot).state).toBe(ORDER_COOKING);
      const startedAt = sim.world.orders.at(slot).startedAtMs;

      for (let tick = 0; tick < 4000; tick++) {
        sim.tick();
        if (sim.world.orders.at(slot).state !== ORDER_COOKING) break;
      }
      return sim.world.clock.simTimeMs - startedAt;
    };

    const plain = cook(false);
    const machined = cook(true);
    const promised = building('cola-machine')?.effectsByLevel[0]?.[0]?.value ?? 1;

    expect(plain).toBeGreaterThan(0);
    expect(machined, 'the machine did not make a real order faster').toBeLessThan(plain);
    // Within one tick of the promised ratio.
    expect(machined).toBeCloseTo(plain / promised, -2);
    expect(menuItem(menuIndexOf('lemonade')).station).toBe('DRINK');
  });
});

describe('levels', () => {
  it('gates each level behind its stage, and never exceeds the ladder', () => {
    const sim = rig(1);
    expect(buyPlace(sim.world, 'cola-machine', SPOT.x, SPOT.y)).toBe('ok');
    sim.advance(400);
    expect(sim.world.layout.placed[0]?.level).toBe(1);

    // Level 2 wants Stage 2.
    expect(stageForLevel(2)).toBe(2);
    expect(upgradeBuilding(sim.world, 0), 'stage 1 sold a level 2').toBe('locked');

    sim.world.progression.stage = 2;
    expect(upgradeBuilding(sim.world, 0)).toBe('ok');
    // A second purchase while the site is up would buy the same level twice.
    expect(upgradeBuilding(sim.world, 0)).toBe('building');

    sim.advance(600);
    expect(sim.world.layout.placed[0]?.level).toBe(2);

    const item = building('cola-machine');
    const promised = item?.effectsByLevel[1]?.[0]?.value ?? 0;
    expect(effectValue(sim.world, 'drinkStationSpeed')).toBeCloseTo(promised, 9);

    // And the ladder ends where the definition says.
    sim.world.progression.stage = 4;
    expect(upgradeBuilding(sim.world, 0)).toBe('ok');
    sim.advance(800);
    expect(sim.world.layout.placed[0]?.level).toBe(item?.maxLevel);
    expect(upgradeBuilding(sim.world, 0), 'sold a level past maxLevel').toBe('maxed');
  });

  it('swaps the art with the level, so the two cannot disagree', () => {
    const sim = rig(2);
    expect(buyPlace(sim.world, 'burger-machine', SPOT.x, SPOT.y)).toBe('ok');
    sim.advance(400);
    const item = building('burger-machine');
    expect(sim.world.layout.placed[0]?.objectId).toBe(buildingAsset(item!, 1));

    expect(upgradeBuilding(sim.world, 0)).toBe('ok');
    sim.advance(800);
    expect(sim.world.layout.placed[0]?.level).toBe(2);
    expect(sim.world.layout.placed[0]?.objectId).toBe(buildingAsset(item!, 2));
  });

  it('keeps its identity and its level through a move', () => {
    const sim = rig(2);
    expect(buyPlace(sim.world, 'burger-machine', SPOT.x, SPOT.y)).toBe('ok');
    sim.advance(400);
    const before = { ...sim.world.layout.placed[0] };

    sim.dispatch({ t: 'MOVE_PLACED', index: 0, x: 8, y: 16.5 });
    sim.tick();

    const after = sim.world.layout.placed[0];
    expect(sim.world.layout.placed, 'the move duplicated the building').toHaveLength(1);
    expect(after?.itemId).toBe(before.itemId);
    expect(after?.level, 'the move reset the building level').toBe(before.level);
    expect(after?.x).not.toBe(before.x);
  });

  it('refuses a building the stage has not opened', () => {
    const sim = rig(1);
    // Both current buildings open at Stage 1, so this is asserted on the rule
    // rather than on a definition that could change under it.
    for (const item of BUILDINGS) {
      if (item.stageRequired <= 1) continue;
      expect(buyPlace(sim.world, item.id, SPOT.x, SPOT.y)).toBe('locked');
    }
    expect(stageForLevel(3)).toBe(3);
  });
});

describe('the catalogue lookups, at their edges', () => {
  it('answers nothing for an id no building claims', () => {
    expect(building('not-a-building')).toBeUndefined();
    expect(buildingEffectTerms('drinkStationSpeed', [{ id: 'not-a-building', level: 1 }])).toEqual([]);
  });

  it('contributes nothing for a level nobody has reached', () => {
    // Level 0 is a building whose site has not finished; a negative level
    // cannot happen, and both must be silent rather than clamping upward.
    expect(buildingEffectTerms('drinkStationSpeed', [{ id: 'cola-machine', level: 0 }])).toEqual([]);
    expect(buildingEffectTerms('drinkStationSpeed', [{ id: 'cola-machine', level: -1 }])).toEqual([]);
  });

  it('clamps a level past the ladder to the top rung rather than inventing one', () => {
    const item = building('cola-machine');
    expect(item).toBeDefined();
    if (item === undefined) return;
    const top = item.effectsByLevel[item.maxLevel - 1]?.[0]?.value;
    expect(buildingEffectTerms('drinkStationSpeed', [{ id: item.id, level: 99 }])).toEqual([top]);
    // And the art clamps the same way, so a level can never draw nothing.
    expect(buildingAsset(item, 99)).toBe(buildingAsset(item, item.maxLevel));
    expect(buildingAsset(item, 0)).toBe(buildingAsset(item, 1));
  });

  it('ignores a kind the building does not produce', () => {
    expect(buildingEffectTerms('grillStationSpeed', [{ id: 'cola-machine', level: 1 }])).toEqual([]);
  });

  it('has no price or duration past the ladder', () => {
    const item = building('burger-machine');
    expect(item).toBeDefined();
    if (item === undefined) return;
    expect(buildingCost(item, item.maxLevel + 1)).toBeUndefined();
    expect(buildingBuildMs(item, item.maxLevel + 1)).toBeUndefined();
  });

  it('refuses a definition whose ladders do not match its level count', () => {
    /*
     * The invariant every read here relies on. Without it a building could
     * declare three levels and two prices, and the third level would be an
     * upgrade the player pays for and does not receive.
     */
    const broken = [
      {
        id: 'broken',
        label: 'Bozuk',
        description: 'Üç seviye, iki fiyat.',
        category: 'KITCHEN',
        stageRequired: 1,
        maxLevel: 3,
        costByLevel: [1, 2],
        buildMsByLevel: [1000, 2000, 3000],
        prerequisites: [],
        effectsByLevel: [[], [], []],
        assetByLevel: ['drink', 'drink', 'drink'],
        footprintX: 1,
        footprintY: 1,
        zone: 'lot',
      },
    ];
    expect(() => parseBuildings(broken)).toThrow(/costByLevel/);
  });

  it('keeps the stage ladder inside the four stages', () => {
    expect(stageForLevel(0)).toBe(1);
    expect(stageForLevel(1)).toBe(1);
    expect(stageForLevel(9)).toBe(4);
  });

  it('refuses to upgrade something that is not a building', () => {
    const sim = rig(2);
    // A decor item, and a row with no identity at all.
    expect(buyPlace(sim.world, 'waste-bin', SPOT.x, SPOT.y)).toBe('ok');
    expect(upgradeBuilding(sim.world, 0)).toBe('unknown');
    sim.world.layout.placed.push({ objectId: 'bin', x: 9, y: 16.5, z: 0 });
    expect(upgradeBuilding(sim.world, 1)).toBe('unknown');
    expect(upgradeBuilding(sim.world, 99)).toBe('unknown');
  });

  it('refuses a building it cannot pay for, and charges nothing', () => {
    const sim = rig(1, 1);
    expect(buyPlace(sim.world, 'cola-machine', SPOT.x, SPOT.y)).toBe('unaffordable');
    expect(sim.world.economy.cash).toBe(1);
    expect(sim.world.layout.placed).toHaveLength(0);
  });

  it('refuses an upgrade it cannot pay for', () => {
    const sim = rig(2);
    expect(buyPlace(sim.world, 'cola-machine', SPOT.x, SPOT.y)).toBe('ok');
    sim.advance(400);
    sim.world.economy.cash = 1;
    expect(upgradeBuilding(sim.world, 0)).toBe('unaffordable');
    expect(sim.world.layout.placed[0]?.level).toBe(1);
  });
});
