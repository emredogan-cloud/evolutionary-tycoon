import { describe, expect, it } from 'vitest';
import { combineDiminishing } from '@sim/math/combineDiminishing';

/**
 * Exploit E4 — ECONOMY_DESIGN §6.2, §14.
 *
 * Written **before the exploit is reachable**, which is the roadmap's explicit
 * instruction: "add its test now, before there are enough upgrades for the
 * exploit to exist". Today no two of the six upgrades share a category, so every
 * production call has a single term and returns its input unchanged. The Phase
 * 13 tree adds the second contributor, and by then this has been green for four
 * phases and nobody has to remember why it is there.
 *
 * The property under test is not "the number is smaller". It is that **no
 * quantity of positive effects can reach 1**, so a category multiplier can never
 * double, whatever a future balance pass does to the individual numbers.
 */
describe('combining same-category effects', () => {
  it('returns a single effect unchanged', () => {
    // The case every current caller hits. If this were not true, adding the
    // function would have silently rebalanced the whole game.
    expect(combineDiminishing([0.3])).toBeCloseTo(0.3, 12);
    expect(combineDiminishing([0])).toBeCloseTo(0, 12);
  });

  it('is nothing at all when there are no effects', () => {
    expect(combineDiminishing([])).toBe(0);
  });

  it('gives less than the sum for two effects', () => {
    // 0.2 + 0.2 = 0.4 naive; 1 − 0.8 × 0.8 = 0.36 combined.
    expect(combineDiminishing([0.2, 0.2])).toBeCloseTo(0.36, 12);
    expect(combineDiminishing([0.2, 0.2])).toBeLessThan(0.4);
  });

  it('kills the stacking exploit outright', () => {
    /*
     * The number from ECONOMY_DESIGN §14: five separate +20% conversion effects.
     * Multiplied, they are ×2.49 — enough to convert half the road and break the
     * demand ceiling three of §7's five structural brakes depend on.
     */
    const naive = 1.2 ** 5;
    const combined = 1 + combineDiminishing([0.2, 0.2, 0.2, 0.2, 0.2]);

    expect(naive, 'the exploit, for comparison').toBeGreaterThan(2.4);
    expect(combined).toBeCloseTo(1.67232, 5);
    expect(combined).toBeLessThan(2);
  });

  it('never reaches double, however many effects are stacked', () => {
    // The structural claim, and the reason this is a combining rule rather than
    // a clamp: fifty +20%s still cannot double anything.
    const many = Array.from({ length: 50 }, () => 0.2);
    expect(1 + combineDiminishing(many)).toBeLessThan(2);

    /*
     * At the extreme the product underflows to zero and the result is exactly
     * 2 — the asymptote, reached by floating point rather than by mathematics.
     * The claim being made is a *bound*, and it holds: five hundred +50%s give
     * 2, where multiplying them gives 1.5^500, a number with 88 digits.
     */
    const enormous = Array.from({ length: 500 }, () => 0.5);
    expect(1 + combineDiminishing(enormous)).toBeLessThanOrEqual(2);
  });

  it('leaves every purchase worth something, which a clamp would not', () => {
    /*
     * The difference between this and `Math.min(sum, 1)`. Under a clamp the
     * sixth upgrade in a saturated category does nothing at all, and the player
     * has bought a thing that changed no number. Here each one closes a fraction
     * of the remaining gap, so the return diminishes without ever reaching zero.
     */
    let previous = 0;
    for (let count = 1; count <= 8; count++) {
      const combined = combineDiminishing(Array.from({ length: count }, () => 0.2));
      expect(combined, `${String(count)} effects`).toBeGreaterThan(previous);
      previous = combined;
    }
  });

  it('shrinks the marginal gain with every additional effect', () => {
    const gains: number[] = [];
    for (let count = 1; count <= 6; count++) {
      const here = combineDiminishing(Array.from({ length: count }, () => 0.2));
      const before = combineDiminishing(Array.from({ length: count - 1 }, () => 0.2));
      gains.push(here - before);
    }
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i], `gain ${String(i)} vs ${String(i - 1)}`).toBeLessThan(gains[i - 1] ?? 0);
    }
  });

  it('scales every term by the category weight', () => {
    // Half weight on two +0.2s: 1 − 0.9 × 0.9 = 0.19.
    expect(combineDiminishing([0.2, 0.2], 0.5)).toBeCloseTo(0.19, 12);
    expect(combineDiminishing([0.2, 0.2], 0)).toBeCloseTo(0, 12);
  });

  it('treats a penalty as a penalty rather than clamping it away', () => {
    /*
     * A negative effect makes the combined total negative, and that is correct:
     * the caller knows whether "worse" is meaningful for its category. Clamping
     * here would silently discard a debuff, which is a far worse failure than
     * an odd-looking number — a dirty restaurant that stopped mattering.
     */
    expect(combineDiminishing([-0.2])).toBeCloseTo(-0.2, 12);
    expect(combineDiminishing([0.5, -0.5])).toBeCloseTo(0.25, 12);
  });

  it('is order-independent, so upgrade purchase order cannot matter', () => {
    // Two players who bought the same upgrades in a different order must have
    // the same world. A product is commutative; this asserts nobody has since
    // replaced it with something that is not.
    const a = combineDiminishing([0.3, 0.15, 0.05]);
    const b = combineDiminishing([0.05, 0.3, 0.15]);
    expect(a).toBeCloseTo(b, 12);
  });
});
