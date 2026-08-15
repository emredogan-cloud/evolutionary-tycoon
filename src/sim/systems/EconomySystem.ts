import { ECONOMY_BUCKET_COUNT, ECONOMY_BUCKET_MS, ECONOMY_WINDOW_MS } from '@config/economy/tuning';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';

/**
 * Cash, and the rate it is moving at — GAME_EXECUTION_ROADMAP Phase 9.
 *
 * ## Why income per minute lives in the simulation
 *
 * It could be computed in the UI bridge from `PAYMENT` events over a wall-clock
 * window, and that would be less work. It would also be untestable headlessly,
 * would read differently at 1x and 4x speed, and would be unavailable to the
 * Phase 12 balance simulator and to ECONOMY_DESIGN §8's dead-end rule — which is
 * merge-blocking and phrased directly in terms of `currentNetIncomePerMin`.
 *
 * So it is a real economic quantity: deterministic, hashed, saved, and the same
 * number on every machine.
 *
 * ## Why buckets rather than a running average
 *
 * An exponential moving average has no window — it never forgets, so a good
 * minute an hour ago still lifts the figure, and "income per minute" stops
 * meaning income per minute. Twelve buckets of five seconds is a real sixty
 * second window that a player can reason about: stop serving, and it visibly
 * falls to zero over a minute rather than decaying toward it forever.
 *
 * The oldest bucket is cleared as the cursor reaches it, so the array is both
 * the window and the storage. No shifting, no allocation.
 */

export class EconomySystem implements SimSystem {
  readonly name = 'EconomySystem' as const;

  run(world: World, deltaMs: number): void {
    if (deltaMs <= 0) return;
    const economy = world.economy;

    economy.bucketElapsedMs += deltaMs;
    /*
     * A `while`, not an `if`. At 4x speed a tick is 200 ms and a bucket is
     * 5 000, so one step never crosses two buckets today — but a future speed
     * multiplier or a longer tick would, and the failure mode is a window that
     * silently stops advancing and reports a stale rate forever.
     */
    while (economy.bucketElapsedMs >= ECONOMY_BUCKET_MS) {
      economy.bucketElapsedMs -= ECONOMY_BUCKET_MS;
      economy.bucketIndex = (economy.bucketIndex + 1) % ECONOMY_BUCKET_COUNT;
      // Clearing on arrival is what makes the array a window rather than a
      // total: the bucket being written to is always the oldest one.
      economy.revenueWindow[economy.bucketIndex] = 0;
      economy.expenseWindow[economy.bucketIndex] = 0;
    }
  }
}

/**
 * Book money coming in, into the current bucket.
 *
 * Called by `ServiceSystem` at the moment of payment rather than inferred from
 * an event, because the event queue is flushed at the end of a tick and a
 * window that lagged a tick behind the cash figure would make the HUD's two
 * numbers disagree at exactly the moment the player is watching them.
 */
export function recordRevenue(world: World, amount: number): void {
  const economy = world.economy;
  economy.revenueWindow[economy.bucketIndex] = (economy.revenueWindow[economy.bucketIndex] ?? 0) + amount;
}

/** Book money going out. Ingredients today; wages and upkeep from Phase 10. */
export function recordExpense(world: World, amount: number): void {
  const economy = world.economy;
  economy.expenseWindow[economy.bucketIndex] = (economy.expenseWindow[economy.bucketIndex] ?? 0) + amount;
}

function windowTotal(buckets: Float64Array): number {
  let total = 0;
  for (const value of buckets) total += value;
  return total;
}

/** Gross takings over the last sixty seconds, per minute. */
export function grossIncomePerMinute(world: World): number {
  return windowTotal(world.economy.revenueWindow) * (60_000 / ECONOMY_WINDOW_MS);
}

/**
 * Takings less costs over the last sixty seconds, per minute.
 *
 * This is the figure ECONOMY_DESIGN §8's dead-end rule is written against:
 * `cheapestMeaningfulUpgrade.cost <= netIncomePerMin * 1.5`. It can go negative
 * once Phase 10 adds wages, and it is not clamped — a stand losing money should
 * say so, and hiding it behind a floor of zero would hide the exact situation
 * the rule exists to catch.
 */
export function netIncomePerMinute(world: World): number {
  const net = windowTotal(world.economy.revenueWindow) - windowTotal(world.economy.expenseWindow);
  return net * (60_000 / ECONOMY_WINDOW_MS);
}
