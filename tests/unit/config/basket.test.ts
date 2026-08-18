import { describe, expect, it } from 'vitest';
import {
  DRINK_POOL,
  SIDE_POOL,
  STAGE_BASKETS,
  drinkPoolFor,
  expectedTicket,
  sidePoolFor,
} from '@config/economy/basket';
import { MENU, menuForStage } from '@config/economy/menu';
import { Sim } from '@sim/core/Sim';
import { rollBasket } from '@sim/systems/orderBasket';

/**
 * The basket config against the design it was solved for — ADR-016.
 *
 * ECONOMY_DESIGN §3's tickets are the contract; the chances in the config are a
 * solution to them, not a preference. This pins the solution: a menu price
 * change or a pool edit that silently moves a stage's expected ticket off its
 * designed value fails here with the two numbers side by side, which is how a
 * balance regression becomes a diff rather than a mystery.
 */

/** §3, the designed average tickets. Duplicated deliberately: this IS the pin. */
const DESIGNED: Readonly<Record<number, number>> = { 1: 4.5, 2: 9, 3: 18, 4: 30 };

describe('the basket arithmetic', () => {
  for (const stage of [1, 2, 3, 4]) {
    it(`lands stage ${String(stage)} on its designed ticket`, () => {
      // Within 2% — the chances are two-decimal solutions to a continuous
      // equation, so exactness would be asserting rounding noise.
      const designed = DESIGNED[stage] ?? 0;
      expect(Math.abs(expectedTicket(stage) - designed) / designed).toBeLessThan(0.02);
    });
  }

  it('adds nothing at Stage 1, whose single-item ticket is already on design', () => {
    const basket = STAGE_BASKETS[1];
    expect(basket.draws * (basket.sideChance + basket.drinkChance)).toBe(0);
  });

  it('pools name real menu items, and every pooled item exists at some stage', () => {
    for (const id of [...SIDE_POOL, ...DRINK_POOL]) {
      expect(
        MENU.some((item) => item.id === id),
        id,
      ).toBe(true);
    }
    // A pooled item nothing sells yet would silently shrink the pool at the
    // stages before it unlocks — that is priced in, but it must never be empty.
    for (const stage of [2, 3, 4]) {
      expect(sidePoolFor(stage).length, `stage ${String(stage)} sides`).toBeGreaterThan(0);
      expect(drinkPoolFor(stage).length, `stage ${String(stage)} drinks`).toBeGreaterThan(0);
    }
  });

  it('pools contain only items the stage actually sells', () => {
    for (const stage of [1, 2, 3, 4]) {
      const available = new Set(menuForStage(stage).map((item) => item.id));
      for (const item of [...sidePoolFor(stage), ...drinkPoolFor(stage)]) {
        expect(available.has(item.id), `${item.id} at stage ${String(stage)}`).toBe(true);
      }
    }
  });
});

describe('the roll the simulation actually makes', () => {
  it('matches the closed formula it is priced by, at every stage', () => {
    /*
     * The formula and the roll are two implementations of one design, so they
     * are compared: ten thousand simulated baskets per stage, and the sample
     * mean must sit on `expectedTicket` within sampling error. If someone edits
     * the roll without the formula — or vice versa — this is the test that
     * knows first.
     */
    for (const stage of [1, 2, 3, 4]) {
      const sim = new Sim({ seed: 424_242 });
      const scratch: number[] = [];
      let total = 0;
      const samples = 10_000;
      for (let i = 0; i < samples; i++) {
        rollBasket(sim.world, stage, scratch);
        for (const index of scratch) total += MENU[index]?.basePrice ?? 0;
      }
      const mean = total / samples;
      const expected = expectedTicket(stage);
      // Three sigma on a bounded variable at n=10 000 is comfortably inside 4%.
      expect(Math.abs(mean - expected) / expected, `stage ${String(stage)}`).toBeLessThan(0.04);
    }
  });

  it('always contains a base item, whatever the extras roll', () => {
    const sim = new Sim({ seed: 7 });
    const scratch: number[] = [];
    for (let i = 0; i < 1_000; i++) {
      const count = rollBasket(sim.world, 4, scratch);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(1 + STAGE_BASKETS[4].draws * 2);
    }
  });

  it('is deterministic: same seed, same ten thousand baskets', () => {
    const roll = (seed: number): string => {
      const sim = new Sim({ seed });
      const scratch: number[] = [];
      const all: number[] = [];
      for (let i = 0; i < 10_000; i++) {
        rollBasket(sim.world, 3, scratch);
        all.push(...scratch, -1);
      }
      return all.join(',');
    };
    expect(roll(31_337)).toBe(roll(31_337));
  });
});
