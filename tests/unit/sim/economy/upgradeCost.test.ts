import { describe, expect, it } from 'vitest';
import {
  EFFECT_MODE_OF,
  LEVEL_GROWTH,
  parseUpgrades,
  MIN_SIGNIFICANCE,
  STAGE_MULTIPLIER,
  UPGRADES,
  upgrade,
  upgradeCost,
} from '@config/economy/upgrades';
import { layoutForStage } from '@config/layouts';
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

  it("spreads thirty upgrades across the design's five families", () => {
    /*
     * GAME_DESIGN_DOCUMENT §13.2 names five families and Phase 13 builds all of
     * them. The old assertion — one upgrade per family, six upgrades — described
     * the placeholder tree, where "family" was a label on a single item.
     *
     * What replaces it is the property that actually matters at thirty: every
     * family is **populated**, so none of them is a heading with nothing under
     * it, and none of them is the whole tree. Diminishing returns are computed
     * over the effect *kind* rather than the family, so two upgrades sharing a
     * family is not a stacking risk — `combineDiminishing` sees them either way.
     */
    const families = new Map<string, number>();
    for (const item of UPGRADES) families.set(item.family, (families.get(item.family) ?? 0) + 1);

    expect([...families.keys()].sort()).toEqual([
      'CAPACITY',
      'DRIVE_THRU',
      'KITCHEN',
      'STAFF',
      'VISIBILITY_APPEAL',
    ]);
    for (const [family, count] of families) {
      expect(count, `${family} has too few upgrades to be a decision`).toBeGreaterThanOrEqual(4);
      expect(count, `${family} is most of the tree`).toBeLessThanOrEqual(12);
    }
    expect(UPGRADES.length).toBeGreaterThanOrEqual(28);
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
    family: 'KITCHEN' as const,
    stage: 1 as const,
    baseCost: 10,
    maxLevel: 2,
    // A family from the closed set the schema now enforces — Phase 13.
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
     *
     * The rule is about the **upgrade**, so a composite one — the drinks
     * dispenser adds a station *and* speeds prep a little — needs at least one
     * effect over its threshold rather than all of them. What no effect may be
     * is *nothing*: a zero contribution is filler whatever it is bundled with,
     * and that is asserted separately below.
     */
    for (const item of UPGRADES) {
      let anySignificant = false;
      const note = (passed: boolean): void => {
        anySignificant = anySignificant || passed;
      };

      for (const effect of item.effects) {
        const first = effect.perLevel[0] ?? 0;
        const label = `${item.id}/${effect.kind}`;
        expect(first, `${label} contributes nothing at all`).not.toBe(0);

        switch (effect.kind) {
          case 'visibility':
          case 'menuAppeal':
            note(first >= MIN_SIGNIFICANCE.conversion);
            break;
          case 'orderSpeed':
            // A scale: 0.8 removes 20% of the duration.
            note(1 - first >= MIN_SIGNIFICANCE.speed);
            break;
          case 'prepStations':
          case 'queueCapacity':
            note(first >= MIN_SIGNIFICANCE.capacity);
            break;
          case 'decisionPointMetres':
            // Metres, and the threshold is that it must move at all by an
            // amount a driver has room to use — one car length.
            note(first >= 5);
            break;
          case 'holdToleranceMs':
            // Seconds of grace. Less than ten would be lost inside a single
            // walk from the pass to a table.
            note(first >= 10_000);
            break;

          // ── Phase 13's kinds ──────────────────────────────────────────────
          case 'nightVisibility':
          case 'atmosphere':
          case 'foodQuality':
          case 'staffSkill':
            // All fractions of a 0..1 scale, judged by the same threshold as
            // conversion: two points is the smallest change a player can feel
            // inside a minute.
            note(first >= MIN_SIGNIFICANCE.conversion);
            break;
          case 'prepSpeed':
          case 'windowSpeed':
          case 'orderPostSpeed':
          case 'staffSpeed':
            // Scales below 1: the fraction of the duration removed.
            note(1 - first >= MIN_SIGNIFICANCE.speed);
            break;
          case 'patienceScale':
            // A scale *above* 1 — it buys time rather than removing it — so the
            // threshold is the fraction added.
            note(first - 1 >= MIN_SIGNIFICANCE.speed);
            break;
          case 'laneCapacity':
            note(first >= MIN_SIGNIFICANCE.capacity);
            break;
        }
      }

      expect(anySignificant, `${item.id} has no effect a player would notice`).toBe(true);
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
    /*
     * Measured as **distance from the neutral value**, which is 0 for an additive
     * or multiplier effect and 1 for a scale.
     *
     * The naive version compared the raw numbers, and that is wrong for scales:
     * `prepSpeed [0.85, 0.88, 0.9]` looks like it grows and in fact shrinks —
     * the first level cuts prep by 15% and the third by 10%. Phase 13 added
     * scales that sit *above* 1 as well (`patienceScale`), where diminishing
     * means falling toward 1 rather than rising toward it, and only a distance
     * describes both.
     */
    for (const item of UPGRADES) {
      for (const effect of item.effects) {
        const neutral = EFFECT_MODE_OF[effect.kind] === 'scale' ? 1 : 0;
        for (let level = 1; level < effect.perLevel.length; level++) {
          const previous = Math.abs((effect.perLevel[level - 1] ?? neutral) - neutral);
          const current = Math.abs((effect.perLevel[level] ?? neutral) - neutral);
          expect(current, `${item.id}/${effect.kind} level ${String(level + 1)}`).toBeLessThanOrEqual(
            previous + 1e-9,
          );
        }
      }
    }
  });
});

describe('the upgrades fit the world they change', () => {
  it('never buys more queue capacity than there are places to stand, at any stage', () => {
    /*
     * The reason `bigger-counter` is one level in Stage 1. Capacity past the
     * last authored slot would tell the spillover penalty the queue is fine
     * while there is physically nowhere for the next person — and ECONOMY_DESIGN
     * §7's only negative feedback loop would quietly stop working.
     *
     * Checked at **every stage** since Phase 13, and cumulatively: upgrades are
     * kept when a stage ends, so a Stage 3 restaurant is carrying whatever its
     * Stage 1 stand bought. Adding a capacity upgrade to a later stage without
     * lengthening that stage's queue is exactly the mistake this catches.
     */
    for (let stage = 1; stage <= 4; stage++) {
      const layout = layoutForStage(stage);
      let total = layout.queueCapacity;
      for (const item of UPGRADES) {
        if (item.stage > stage) continue;
        for (const effect of item.effects) {
          if (effect.kind !== 'queueCapacity') continue;
          for (const amount of effect.perLevel) total += amount;
        }
      }
      expect(total, `stage ${String(stage)} can be upgraded past its own queue`).toBeLessThanOrEqual(
        layout.queue.length,
      );
    }
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
