import { describe, expect, it } from 'vitest';
import { STAGE_UPGRADE_BUDGET, UPGRADES, upgradeCost } from '@config/economy/upgrades';
import { DEAD_END_INCOME_MULTIPLE } from '@config/economy/tuning';
import { DESIGNED_ENTRY_NET_PER_MINUTE } from '../../../../tools/balance-sim/assertions';

/**
 * The shape of the tree — GAME_EXECUTION_ROADMAP Phase 13.
 *
 * Not what any one upgrade does (that is `fourProperties`) or how they depend on
 * each other (`prereq`), but whether the thirty of them together make a set of
 * *decisions*. A tree can satisfy every per-item rule and still be a corridor:
 * one obvious purchase at every point, thirty times.
 */

describe('every stage has something to buy', () => {
  it('offers at least four upgrades at each of the four stages', () => {
    /*
     * Four is the floor at which "what should I buy" is a question. Below it the
     * stage is a checklist, and ECONOMY_DESIGN §13's "no single dominant
     * strategy" assertion has nothing to distinguish.
     */
    for (let stage = 1; stage <= 4; stage++) {
      const available = UPGRADES.filter((item) => item.stage <= stage);
      const introduced = UPGRADES.filter((item) => item.stage === stage);

      expect(introduced.length, `stage ${String(stage)} introduces nothing`).toBeGreaterThanOrEqual(4);
      expect(available.length, `stage ${String(stage)} has too little to choose from`).toBeGreaterThanOrEqual(
        4,
      );
    }
  });

  it('offers more than one family at every stage', () => {
    // A stage with one family is a stage with one strategy, whatever the
    // upgrade count says.
    for (let stage = 1; stage <= 4; stage++) {
      const families = new Set(UPGRADES.filter((item) => item.stage === stage).map((item) => item.family));
      expect(
        families.size,
        `stage ${String(stage)} introduces only ${[...families].join(', ')}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('the price ladder', () => {
  it('starts each stage inside the dead-end rule', () => {
    /*
     * ECONOMY_DESIGN §8: the cheapest meaningful upgrade may never cost more
     * than ninety seconds of income — `DEAD_END_INCOME_MULTIPLE` × the income
     * per minute. Checked here against the *entry* income of each stage, which
     * is the worst moment: the player has just spent everything on the
     * transition.
     *
     * The balance simulator checks the same rule continuously and over every
     * policy; this is the static version, and it fails at the point where the
     * mistake is actually made — in the config, not four hundred simulated
     * minutes later.
     */
    for (let stage = 1; stage <= 4; stage++) {
      const entryIncome = DESIGNED_ENTRY_NET_PER_MINUTE[stage] ?? 0;
      const affordable = entryIncome * DEAD_END_INCOME_MULTIPLE;

      const cheapest = Math.min(
        ...UPGRADES.filter((item) => item.stage === stage).map((item) => upgradeCost(item, 1, stage)),
      );
      expect(
        cheapest,
        `stage ${String(stage)}: cheapest new upgrade is ₡${String(cheapest)} against ₡${affordable.toFixed(0)} of income`,
      ).toBeLessThanOrEqual(affordable);
    }
  });

  it('fits a sensible first pass inside the stage budget the design costed', () => {
    /*
     * ECONOMY_DESIGN §3 gives every stage an in-stage upgrade total, and the
     * stage-duration targets in the same row were computed against it. A tree
     * whose three cheapest first levels already blow the budget makes the stage
     * longer than the table says, which is how Phase 12 found Stage 1 taking
     * thirty minutes instead of eighteen.
     */
    for (let stage = 1; stage <= 4; stage++) {
      const budget = STAGE_UPGRADE_BUDGET[stage] ?? 0;
      const cheapestThree = UPGRADES.filter((item) => item.stage === stage)
        .map((item) => upgradeCost(item, 1, stage))
        .sort((a, b) => a - b)
        .slice(0, 3)
        .reduce((total, cost) => total + cost, 0);

      expect(
        cheapestThree,
        `stage ${String(stage)} first pass vs budget ₡${String(budget)}`,
      ).toBeLessThanOrEqual(budget);
    }
  });

  it('never prices a later level below an earlier one', () => {
    for (const item of UPGRADES) {
      for (let level = 2; level <= item.maxLevel; level++) {
        expect(upgradeCost(item, level, item.stage), `${item.id} level ${String(level)}`).toBeGreaterThan(
          upgradeCost(item, level - 1, item.stage),
        );
      }
    }
  });
});

describe('the tree is not a corridor', () => {
  it('never makes one upgrade strictly better than another at the same price', () => {
    /*
     * Two upgrades in the same family, at the same stage, where one costs less
     * *and* contributes more of the same effect is not a choice — it is a wrong
     * answer left in the menu for the player to discover.
     */
    for (const a of UPGRADES) {
      for (const b of UPGRADES) {
        if (a.id === b.id || a.family !== b.family || a.stage !== b.stage) continue;
        /*
         * Skip a pair where one leads to the other. `tap-to-pay` needs
         * `express-window`, so it is the *next rung* rather than a rival — and a
         * later rung being a smaller improvement is diminishing returns working,
         * not a dominated choice.
         */
        if (a.prereqs.includes(b.id) || b.prereqs.includes(a.id)) continue;

        const cheaper = upgradeCost(a, 1, a.stage) <= upgradeCost(b, 1, b.stage);
        if (!cheaper) continue;

        for (const effect of a.effects) {
          const rival = b.effects.find((other) => other.kind === effect.kind);
          if (rival === undefined) continue;

          const mine = effect.perLevel[0] ?? 0;
          const theirs = rival.perLevel[0] ?? 0;
          const better = EFFECT_IS_LOWER_BETTER.has(effect.kind) ? mine < theirs : mine > theirs;
          expect(better && cheaper, `${a.id} strictly dominates ${b.id}`).toBe(false);
        }
      }
    }
  });

  it('gives each stage at least two families with a root the player can enter', () => {
    // Two entry points is the minimum for "at least two valid investment
    // strategies" (ECONOMY_DESIGN §15) to be even possible at that stage.
    for (let stage = 1; stage <= 4; stage++) {
      const owned = new Set(UPGRADES.filter((item) => item.stage < stage).map((item) => item.id));
      const enterable = UPGRADES.filter(
        (item) => item.stage === stage && item.prereqs.every((prereq) => owned.has(prereq)),
      );
      const families = new Set(enterable.map((item) => item.family));

      expect(
        families.size,
        `stage ${String(stage)} can only be entered through ${[...families].join(', ')}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

/** Kinds where a *smaller* number is the better one — durations, mostly. */
const EFFECT_IS_LOWER_BETTER = new Set([
  'orderSpeed',
  'prepSpeed',
  'windowSpeed',
  'orderPostSpeed',
  'staffSpeed',
]);
