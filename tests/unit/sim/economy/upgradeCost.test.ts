import { describe, expect, it } from 'vitest';
import {
  LEVEL_GROWTH,
  parseUpgrades,
  MIN_SIGNIFICANCE,
  STAGE_MULTIPLIER,
  UPGRADES,
  upgrade,
  upgradeCost,
} from '@config/economy/upgrades';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { STATIONS } from '@config/economy/stations';
import { ORDERING_MS } from '@config/satisfaction';

/**
 * The upgrade table as *data* — ECONOMY_DESIGN §6, and the roadmap's four hard
 * rules for Phase 9.
 *
 * The interesting assertions here are the ones that would still be true after a
 * balance pass: the cost formula matches the document, the effect curves
 * diminish, and — the one that matters most — **every upgrade at every level
 * changes something a player can notice**. The roadmap bans "+3% efficiency"
 * upgrades outright, and a ban that is only written down is not a ban.
 */
describe('the cost formula', () => {
  it('matches ECONOMY_DESIGN §6.1 term by term', () => {
    for (const item of UPGRADES) {
      for (let level = 1; level <= item.maxLevel; level++) {
        const expected = Math.round(item.baseCost * (STAGE_MULTIPLIER[0] ?? 1) * LEVEL_GROWTH ** (level - 1));
        expect(upgradeCost(item, level, 1), `${item.id} level ${String(level)}`).toBe(expected);
      }
    }
  });

  it('charges 2.2x more for each level', () => {
    // The reason the growth is steeper than the effect curve: every level buys
    // less for more, which is what pushes a player to diversify instead of
    // maxing one family. That is the decision the phase exists to create.
    const sign = upgrade('hand-painted-sign');
    for (let level = 2; level <= sign.maxLevel; level++) {
      const here = upgradeCost(sign, level, 1);
      const before = upgradeCost(sign, level - 1, 1);
      expect(here / before, `level ${String(level)}`).toBeCloseTo(LEVEL_GROWTH, 1);
    }
  });

  it('multiplies by the stage', () => {
    const sign = upgrade('hand-painted-sign');
    expect(upgradeCost(sign, 1, 2)).toBe(sign.baseCost * 4);
    expect(upgradeCost(sign, 1, 3)).toBe(sign.baseCost * 14);
    expect(upgradeCost(sign, 1, 4)).toBe(sign.baseCost * 55);
  });

  it('never quotes a fraction of a credit', () => {
    // A price with three decimals in it is noise the player reads past every
    // time they open a card.
    for (const item of UPGRADES) {
      for (let level = 1; level <= item.maxLevel; level++) {
        expect(Number.isInteger(upgradeCost(item, level, 1))).toBe(true);
      }
    }
  });
});

describe('the four-property rule', () => {
  it('gives every upgrade a cost, an effect, a world change and a consequence', () => {
    /*
     * The roadmap: "Every upgrade must have all four of: cost, measurable
     * simulation effect, visible world change, and a gameplay consequence. An
     * upgrade missing any one of these does not ship."
     *
     * Three of the four are checkable here. The fourth — that the effect is
     * *measurable* — is `tests/integration/upgradeEffect.test.ts`, which buys
     * each one and measures the world before and after.
     */
    for (const item of UPGRADES) {
      expect(item.baseCost, `${item.id} cost`).toBeGreaterThan(0);
      expect(item.effects.length, `${item.id} effects`).toBeGreaterThan(0);
      expect(item.worldChange.length, `${item.id} world change`).toBeGreaterThan(0);
      expect(item.consequence.length, `${item.id} consequence`).toBeGreaterThan(0);
      expect(item.iconKey.length, `${item.id} icon`).toBeGreaterThan(0);
    }
  });

  it('gives every family exactly one bottleneck, and is down to five of them', () => {
    /*
     * **Five, not six, since Phase 12.** The REACH family's only member —
     * `roadside-marker` — was measured as *costing* revenue at every level and
     * was removed; the reasoning is in `src/config/economy/upgrades.ts` beside
     * the gap it left. Phase 13 rebuilds the tree and brings the family back with
     * an effect that does not trade reach for parking capacity.
     *
     * The one-family-per-upgrade property is what actually matters here and it is
     * unchanged: two upgrades in one family would stack multipliers on the same
     * bottleneck, which is what `combineDiminishing` exists to prevent.
     */
    const families = UPGRADES.map((item) => item.family);
    expect(new Set(families).size, 'two upgrades share a family').toBe(families.length);
    expect(UPGRADES).toHaveLength(5);
  });

  it('anchors every card somewhere inside the lot', () => {
    // The card opens beside the thing it upgrades. An anchor outside the world
    // is a card that opens off screen, which reads as a broken button.
    for (const item of UPGRADES) {
      expect(item.anchor.x, `${item.id} x`).toBeGreaterThan(STAGE1_LAYOUT.lot.minX);
      expect(item.anchor.x, `${item.id} x`).toBeLessThan(STAGE1_LAYOUT.lot.maxX);
      expect(item.anchor.y, `${item.id} y`).toBeGreaterThan(STAGE1_LAYOUT.lot.minY);
      expect(item.anchor.y, `${item.id} y`).toBeLessThan(STAGE1_LAYOUT.lot.maxY);
    }
  });
});

describe('the validator actually validates', () => {
  /*
   * A schema only ever run on data known to be correct proves nothing: it would
   * pass just as happily with every refinement deleted. So it is given bad
   * input here — the two mistakes a balance pass is most likely to make.
   */
  const wellFormed = {
    id: 'test-upgrade',
    family: 'TEST',
    stage: 1 as const,
    baseCost: 10,
    maxLevel: 2,
    effects: [{ kind: 'visibility' as const, perLevel: [0.1, 0.1] }],
    worldChange: 'Something appears',
    consequence: 'Something happens',
    anchor: { x: 1, y: 1 },
    iconKey: 'test@2x',
    placeholder: 'ph-prop-tall' as const,
  };

  it('accepts a well-formed upgrade, so the rejections below mean something', () => {
    expect(() => parseUpgrades([wellFormed])).not.toThrow();
  });

  it('rejects two upgrades sharing an id', () => {
    // The id is a key in a map that is hashed into the world digest and written
    // into every save. A duplicate would make the second unreachable and the
    // first silently absorb its purchases.
    expect(() => parseUpgrades([wellFormed, { ...wellFormed }])).toThrow(/Duplicate upgrade id/);
  });

  it('rejects a level count that does not match the effect curve', () => {
    // The mistake a balance pass makes: raise `maxLevel` and forget to extend
    // `perLevel`. The extra level would then be free of any effect — the banned
    // upgrade, arriving as an off-by-one.
    expect(() => parseUpgrades([{ ...wellFormed, maxLevel: 4 }])).toThrow(/has 2 levels but maxLevel is 4/);
  });

  it('rejects an upgrade with no world change or no consequence', () => {
    expect(() => parseUpgrades([{ ...wellFormed, worldChange: '' }])).toThrow();
    expect(() => parseUpgrades([{ ...wellFormed, consequence: '' }])).toThrow();
  });

  it('rejects a free upgrade', () => {
    expect(() => parseUpgrades([{ ...wellFormed, baseCost: 0 }])).toThrow();
  });

  it('rejects an unknown effect kind', () => {
    expect(() =>
      parseUpgrades([{ ...wellFormed, effects: [{ kind: 'teleportation', perLevel: [1, 1] }] }]),
    ).toThrow();
  });
});

describe('minimum significance — ECONOMY_DESIGN §6.3', () => {
  it('makes the first level of every upgrade worth noticing', () => {
    /*
     * "An upgrade that does not produce an effect the player can notice within
     * sixty seconds does not enter the game." Checked per effect kind against
     * the documented thresholds, because "noticeable" means something different
     * for a duration than for a capacity.
     */
    for (const item of UPGRADES) {
      for (const effect of item.effects) {
        const first = effect.perLevel[0] ?? 0;
        const label = `${item.id}/${effect.kind}`;

        switch (effect.kind) {
          case 'visibility':
          case 'menuAppeal':
            expect(first, label).toBeGreaterThanOrEqual(MIN_SIGNIFICANCE.conversion);
            break;
          case 'orderSpeed':
            // A scale: 0.8 removes 20% of the duration.
            expect(1 - first, label).toBeGreaterThanOrEqual(MIN_SIGNIFICANCE.speed);
            break;
          case 'prepStations':
          case 'queueCapacity':
            expect(first, label).toBeGreaterThanOrEqual(MIN_SIGNIFICANCE.capacity);
            break;
          case 'decisionPointMetres':
            // Metres, and the threshold is that it must move at all by an
            // amount a driver has room to use — one car length.
            expect(first, label).toBeGreaterThanOrEqual(5);
            break;
          case 'holdToleranceMs':
            // Seconds of grace. Less than ten would be lost inside a single
            // walk from the pass to a table.
            expect(first, label).toBeGreaterThanOrEqual(10_000);
            break;
        }
      }
    }
  });

  it('makes every *later* level worth its price too', () => {
    // A level that changes nothing is the banned upgrade wearing a different
    // hat: the player pays 2.2x more and gets the same world.
    for (const item of UPGRADES) {
      for (const effect of item.effects) {
        for (let level = 0; level < item.maxLevel; level++) {
          const amount = effect.perLevel[level] ?? 0;
          const label = `${item.id}/${effect.kind} level ${String(level + 1)}`;
          if (effect.kind === 'orderSpeed') {
            expect(amount, label).toBeLessThan(1);
          } else {
            expect(amount, label).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('diminishes rather than growing, on every curve', () => {
    // ECONOMY_DESIGN §6.2's whole point: cost grows 2.2x per level while effect
    // shrinks. A curve that went the other way would make maxing one family
    // strictly correct and delete the decision.
    for (const item of UPGRADES) {
      for (const effect of item.effects) {
        if (effect.kind === 'orderSpeed') continue; // a constant scale, by design
        for (let level = 1; level < effect.perLevel.length; level++) {
          expect(
            effect.perLevel[level] ?? 0,
            `${item.id}/${effect.kind} level ${String(level + 1)}`,
          ).toBeLessThanOrEqual(effect.perLevel[level - 1] ?? 0);
        }
      }
    }
  });
});

describe('the upgrades fit the world they change', () => {
  it('never buys more queue capacity than there are places to stand', () => {
    /*
     * The reason `bigger-counter` is one level in Stage 1. Capacity past the
     * last authored slot would tell the spillover penalty the queue is fine
     * while there is physically nowhere for the next person — and ECONOMY_DESIGN
     * §7's only negative feedback loop would quietly stop working.
     */
    const counter = upgrade('bigger-counter');
    let total = STAGE1_LAYOUT.queueCapacity;
    for (const effect of counter.effects) {
      for (const amount of effect.perLevel) total += amount;
    }
    expect(total).toBeLessThanOrEqual(STAGE1_LAYOUT.queue.length);
  });

  it('never unlocks more prep stations than the kitchen authors', () => {
    const stations = upgrade('second-prep-station');
    const unlockable = stations.effects
      .flatMap((effect) => effect.perLevel)
      .reduce((sum, amount) => sum + amount, 0);
    const locked = STATIONS.filter((entry) => entry.requiresPrepStations > 0).length;
    expect(unlockable).toBeLessThanOrEqual(locked);
  });

  it('cannot make ordering instantaneous', () => {
    // Every level of the menu board scales the beat at the counter. Fully
    // upgraded it must still be a beat — a transaction the player never sees is
    // the Phase 8 defect this fixed, arriving again by the back door.
    const board = upgrade('menu-board');
    let scale = 1;
    for (const effect of board.effects) {
      if (effect.kind !== 'orderSpeed') continue;
      for (const amount of effect.perLevel) scale *= amount;
    }
    expect(ORDERING_MS * scale).toBeGreaterThan(200);
  });
});
