import { TICK_MS } from '@config/simulation';
import { UPGRADES } from '@config/economy/upgrades';
import { Sim } from '@sim/core/Sim';

/**
 * Does this upgrade actually help? — the paired experiment behind assertion 6.
 *
 * ## Why the obvious measurement was wrong
 *
 * The first version compared net income in the minute before a purchase with the
 * minute after it, and reported that **five of the first eleven purchases made
 * things worse**. They did not. Two things were happening, and neither was an
 * upgrade:
 *
 * - **Regression to the mean.** A policy buys when it has cash, and it has cash
 *   just after a good minute. The next minute is worse than the last one
 *   whatever you spend the money on.
 * - **The day curve.** Traffic swings by a factor of 2.2 to 2.5 across an
 *   in-game day (ECONOMY_DESIGN §3) and a day is twelve real minutes, so two
 *   readings two minutes apart are routinely two different economies.
 *
 * ## What this does instead
 *
 * Two runs from the same seed. Both play identically — the same arrivals, the
 * same archetypes, the same day curve, tick for tick — and one of them buys the
 * upgrade at a fixed moment. The difference in what they earn over the following
 * window **is** the upgrade's effect, with the noise cancelled rather than
 * averaged, because both runs saw the same noise.
 *
 * The cost is two short runs per upgrade level, which at 4.84 µs a tick is a
 * fraction of a second each.
 */

export interface UpgradeEffect {
  readonly upgradeId: string;
  readonly level: number;
  readonly cost: number;
  /** Gross revenue over the measured window without the purchase. */
  readonly revenueWithout: number;
  /** And with it. */
  readonly revenueWith: number;
  /** `with - without`, in credits over the window. */
  readonly delta: number;
}

export interface ExperimentOptions {
  /**
   * Several seeds, averaged.
   *
   * One seed is not enough, and finding out why was worth the time. The two arms
   * of a pair are identical only until the purchase changes a *decision* inside
   * the simulation — and `roadside-marker` changes exactly that, moving the point
   * at which a driver decides. From that tick on, the two arms draw from the
   * shared RNG streams in a different order: same distribution, different
   * sequence. On a single seed that showed up as a **−5.9% "regression"** for an
   * upgrade whose real effect is around zero.
   *
   * Averaging over three seeds pushes the divergence noise below the two per
   * cent tolerance while leaving every genuine effect — the sign's is +19% —
   * comfortably visible.
   */
  readonly seeds: readonly number[];
  /** Minutes of play before the purchase, so the economy is running. */
  readonly warmUpMinutes: number;
  /** Minutes measured afterwards. */
  readonly measureMinutes: number;
}

/**
 * Run `minutes` of attentive play, optionally buying `buy` at the warm-up mark.
 *
 * Cash is topped up before the purchase rather than earned, deliberately: the
 * question is what the *upgrade* does, and a run that had to save for it would
 * differ from its pair in when it could afford everything else too. The top-up
 * is applied to both runs so the pair stays identical apart from the one
 * variable.
 */
function play(
  options: ExperimentOptions,
  seed: number,
  buy: { readonly id: string; readonly repeats: number } | null,
): number {
  const sim = new Sim({ seed });
  const warmUpTicks = Math.round((options.warmUpMinutes * 60_000) / TICK_MS);
  const measureTicks = Math.round((options.measureMinutes * 60_000) / TICK_MS);

  for (let tick = 0; tick < warmUpTicks; tick++) {
    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
    sim.tick();
  }

  // Both arms get the money; only one arm spends it.
  sim.world.economy.cash += 100_000;
  if (buy !== null) {
    for (let i = 0; i < buy.repeats; i++) sim.dispatch({ t: 'BUY_UPGRADE', upgradeId: buy.id });
  }
  sim.advance(2);

  const before = sim.world.economy.lifetimeRevenue;
  for (let tick = 0; tick < measureTicks; tick++) {
    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
    sim.tick();
  }
  return sim.world.economy.lifetimeRevenue - before;
}

/** Every level of every upgrade, measured against a run that did not buy it. */
export function measureUpgradeEffects(options: ExperimentOptions): UpgradeEffect[] {
  const results: UpgradeEffect[] = [];
  const baselines = options.seeds.map((seed) => play(options, seed, null));
  const meanBaseline = baselines.reduce((total, value) => total + value, 0) / baselines.length;

  for (const item of UPGRADES) {
    for (let level = 1; level <= item.maxLevel; level++) {
      const withIt =
        options.seeds
          .map((seed) => play(options, seed, { id: item.id, repeats: level }))
          .reduce((total, value) => total + value, 0) / options.seeds.length;

      results.push({
        upgradeId: item.id,
        level,
        cost: Math.round(item.baseCost * 2.2 ** (level - 1)),
        revenueWithout: meanBaseline,
        revenueWith: withIt,
        delta: withIt - meanBaseline,
      });
    }
  }

  return results;
}
