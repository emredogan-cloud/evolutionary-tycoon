import { describe, expect, it } from 'vitest';
import { menuIndexOf, menuItem, PRICE_BAND } from '@config/economy/menu';
import {
  EXPECTED_WAIT_MS,
  MAX_WAIT_MS,
  NEUTRAL_SCORE,
  REPUTATION,
  TIP_CURVE,
  WEIGHTS,
} from '@config/satisfaction';
import {
  evaluateSatisfaction,
  priceScore,
  reputationDelta,
  tipFraction,
  waitScore,
} from '@sim/systems/SatisfactionSystem';
import type { OrderRecord } from '@sim/stores/OrderStore';

/** A completed order, for feeding the model one input at a time. */
function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  const item = menuIndexOf('hotdog');
  return {
    entityId: 1,
    customerSlot: 0,
    item,
    state: 3,
    station: -1,
    orderedAtMs: 0,
    startedAtMs: 0,
    readyAtMs: 0,
    deliveredAtMs: EXPECTED_WAIT_MS,
    price: menuItem(item).basePrice,
    quality: menuItem(item).qualityBase,
    ...overrides,
  };
}

/**
 * Each input isolated — GAME_EXECUTION_ROADMAP Phase 8 asks for exactly this.
 *
 * They are summed, so a bug in one is a constant offset on the result, which is
 * precisely the kind of thing that hides behind "the satisfaction numbers look
 * about right" and surfaces two phases later as an economy nobody can balance.
 */
describe('the weights', () => {
  it('sum to exactly one', () => {
    // Enforced by Zod at load; asserted here because the consequence is subtle.
    // A set summing to 1.05 makes a perfect score reachable only by clamping,
    // and every downstream curve — tips, reputation, repeat — compresses.
    const total = Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('give the most weight to waiting', () => {
    // A design statement about Stage 1: a roadside stand is judged on speed
    // before anything else.
    expect(WEIGHTS.wait).toBeGreaterThan(WEIGHTS.quality);
    expect(WEIGHTS.wait).toBeGreaterThan(WEIGHTS.price);
  });

  it('keep a real share for the inputs that are not live yet', () => {
    /*
     * The dormant weights are not zero, so the live inputs cannot dominate the
     * result — a quarter of the score is reserved for the things Phase 10 and
     * Phase 11 will make real. They score 1.0 today, because a stand with no
     * tables has no dirty tables; see `@config/satisfaction`.
     */
    const dormant = WEIGHTS.service + WEIGHTS.cleanliness + WEIGHTS.atmosphere + WEIGHTS.accessibility;
    expect(dormant).toBeGreaterThan(0.2);
  });
});

describe('the wait input', () => {
  it('is perfect up to the expectation, not only below it', () => {
    // The expected wait is what they came for, not a target to beat.
    expect(waitScore(0)).toBe(1);
    expect(waitScore(EXPECTED_WAIT_MS)).toBe(1);
  });

  it('falls off past it', () => {
    expect(waitScore(EXPECTED_WAIT_MS + 1000)).toBeLessThan(1);
    expect(waitScore((EXPECTED_WAIT_MS + MAX_WAIT_MS) / 2)).toBeCloseTo(0.5, 6);
  });

  it('floors at zero rather than going negative', () => {
    /*
     * A linear decay with no floor would let one slow order drag the sum below
     * anything the other inputs could recover, turning a single bad wait into a
     * permanently unhappy customer.
     */
    expect(waitScore(MAX_WAIT_MS)).toBe(0);
    expect(waitScore(MAX_WAIT_MS * 10)).toBe(0);
  });
});

describe('the price input', () => {
  it('is perfect at the base price', () => {
    expect(priceScore(5, 5)).toBeCloseTo(1, 12);
  });

  it('punishes charging more', () => {
    // ECONOMY_DESIGN §4: expensive means harder to please. The other half of the
    // two-sided penalty — `priceFit` in the conversion model costs you customers
    // before they arrive; this costs you the ones who came anyway.
    const dear = priceScore(5 * PRICE_BAND.max, 5);
    expect(dear).toBeLessThan(1);
    expect(dear).toBeGreaterThan(0.7);
  });

  it('does not reward charging less with more than a perfect score', () => {
    // Otherwise "price everything at half" would buy satisfaction as well as
    // conversion, and the price band would be a one-way lever.
    expect(priceScore(5 * PRICE_BAND.min, 5)).toBeLessThanOrEqual(1);
  });

  it('falls back to neutral for an item with no base price', () => {
    expect(priceScore(5, 0)).toBe(NEUTRAL_SCORE);
  });
});

describe('the whole model', () => {
  it('stays inside [0, 1] for every input combination', () => {
    for (const waited of [0, EXPECTED_WAIT_MS, MAX_WAIT_MS, MAX_WAIT_MS * 3]) {
      for (const quality of [0, 0.5, 1, 5, -2]) {
        for (const price of [1, 5, 50]) {
          const value = evaluateSatisfaction(order({ deliveredAtMs: waited, price }), quality, waited);
          expect(value, `wait ${waited} quality ${quality} price ${price}`).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('reaches a perfect score when nothing has gone wrong', () => {
    /*
     * And it should. The dormant inputs score 1.0 because there is nothing yet
     * to be dissatisfied about — no tables to be dirty, no waiter to be slow —
     * so a fast, good, fairly-priced meal at a Stage 1 stand genuinely is as
     * good as it gets.
     *
     * The consequence is recorded rather than hidden: this number will *fall*
     * in Phase 11, when a stand gains floors it can fail to mop.
     */
    const best = evaluateSatisfaction(order({ deliveredAtMs: 0 }), 1, 0);
    expect(best).toBeCloseTo(1, 9);
  });

  it('falls short of perfect the moment any live input does', () => {
    // The weights are what make that true: no single input can be compensated
    // for by the others being fine.
    const slow = evaluateSatisfaction(order({ deliveredAtMs: MAX_WAIT_MS }), 1, 0);
    const poor = evaluateSatisfaction(order({ deliveredAtMs: 0 }), 0, 0);
    expect(slow).toBeLessThan(1);
    expect(poor).toBeLessThan(1);
    // Wait is the heaviest input, so failing it costs more than failing quality.
    expect(slow).toBeLessThan(poor);
  });

  it('drops when the customer waits longer', () => {
    const quick = evaluateSatisfaction(order({ deliveredAtMs: EXPECTED_WAIT_MS }), 0.8, 0);
    const slow = evaluateSatisfaction(order({ deliveredAtMs: MAX_WAIT_MS }), 0.8, 0);
    expect(slow).toBeLessThan(quick);
  });

  it('drops when the food is worse', () => {
    const good = evaluateSatisfaction(order(), 0.9, 0);
    const bad = evaluateSatisfaction(order(), 0.2, 0);
    expect(bad).toBeLessThan(good);
  });

  it('drops when the price goes up', () => {
    const fair = evaluateSatisfaction(order({ price: 5 }), 0.8, 0);
    const dear = evaluateSatisfaction(order({ price: 7.5 }), 0.8, 0);
    expect(dear).toBeLessThan(fair);
  });
});

describe('tips', () => {
  it('pays nothing below the floor', () => {
    // Being adequate earns nothing. ECONOMY_DESIGN §9 is explicit about it.
    expect(tipFraction(0)).toBe(0);
    expect(tipFraction(TIP_CURVE.floor - 0.001)).toBe(0);
  });

  it('climbs gently, then steeply', () => {
    // The reward for being excellent is visible rather than marginal.
    const lowerSlope = tipFraction(TIP_CURVE.knee) - tipFraction(TIP_CURVE.knee - 0.05);
    const upperSlope = tipFraction(TIP_CURVE.knee + 0.05) - tipFraction(TIP_CURVE.knee);
    expect(upperSlope).toBeGreaterThan(lowerSlope * 2);
  });

  it('reaches about 28% at a perfect score, as documented', () => {
    expect(tipFraction(1)).toBeCloseTo(0.28, 2);
  });

  it('never goes backwards', () => {
    let previous = -1;
    for (let s = 0; s <= 1.0001; s += 0.01) {
      const tip = tipFraction(Math.min(1, s));
      expect(tip).toBeGreaterThanOrEqual(previous);
      previous = tip;
    }
  });
});

describe('reputation', () => {
  it('is neutral at the documented baseline', () => {
    expect(reputationDelta(REPUTATION.neutral)).toBeCloseTo(0, 12);
  });

  it('moves in the right direction, slowly', () => {
    expect(reputationDelta(1)).toBeGreaterThan(0);
    expect(reputationDelta(0)).toBeLessThan(0);
    // ECONOMY_DESIGN §9 wants reputation to be a long-term asset that cannot be
    // manipulated quickly: about 7 500 satisfied customers to go from 50 to 80.
    expect(Math.abs(reputationDelta(1))).toBeLessThan(0.01);
  });
});
