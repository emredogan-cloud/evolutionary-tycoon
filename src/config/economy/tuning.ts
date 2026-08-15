/**
 * Economy tuning constants — the numbers that are not menu items or upgrades.
 *
 * Separate from `menu.ts` and `upgrades.ts` because they answer a different
 * question: those two say *what exists*, this says *how the machinery around it
 * behaves*. The roadmap's hard rule is that no economic number appears as a
 * literal in gameplay code, and "sixty seconds" is as much an economic number as
 * "₡12" — it decides what "income per minute" means to a player watching it.
 */

/**
 * The income window — twelve five-second buckets, so sixty seconds exactly.
 *
 * Buckets rather than an exponential average because an EMA has no window: it
 * never forgets, so a good minute an hour ago still lifts the figure and the
 * number stops meaning what its label says. With a real window, a stand that
 * stops serving visibly falls to zero over a minute instead of decaying toward
 * it forever.
 */
export const ECONOMY_BUCKET_COUNT = 12;
export const ECONOMY_BUCKET_MS = 5000;
export const ECONOMY_WINDOW_MS = ECONOMY_BUCKET_COUNT * ECONOMY_BUCKET_MS;

/**
 * ECONOMY_DESIGN §8, the dead-end rule, and it is merge-blocking:
 *
 *   cheapestMeaningfulUpgrade.cost <= netIncomePerMin * DEAD_END_INCOME_MULTIPLE
 *
 * 1.5 minutes of income — **ninety seconds** — is the single canonical value.
 * The roadmap, TESTING_STRATEGY and the balance simulator all quote it, and the
 * balance gate fails CI above it. Expressed as a multiple rather than as a
 * duration because that is the form the rule is written in; the ninety seconds
 * is what 1.5 minutes *means*, not a second constant to keep in step.
 */
export const DEAD_END_INCOME_MULTIPLE = 1.5;
