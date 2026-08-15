/**
 * Wages — GAME_EXECUTION_ROADMAP Phase 10, ECONOMY_DESIGN §7 (Fren 5).
 *
 * The fifth structural brake on exponential growth: "maaş ve bakım gelirle
 * birlikte büyür". A continuous drain rather than a periodic charge, because a
 * charge that lands once a game-day makes hiring free for most of the day and
 * ruinous for one tick of it — and a player cannot plan against a cliff.
 */

/**
 * How often accrued wages are actually taken out of the till, in game ms.
 *
 * Accrual is per tick and exact, including partial minutes; *payment* is
 * batched because cash is a number the player is watching, and one that moved
 * twenty times a second would be unreadable. The distinction matters: the
 * simulation always knows the exact debt, the HUD sees it settle in steps.
 */
export const WAGE_SETTLE_MS = 5000;

/**
 * How long the stand may fail to cover wages before somebody leaves.
 *
 * Three real minutes, from the roadmap. Real minutes rather than game minutes
 * so that the grace period is a promise about the player's experience — three
 * minutes to notice and fix it — rather than something that shrinks when they
 * speed the game up.
 */
export const UNPAID_GRACE_MS = 180_000;

/**
 * Cash never goes below zero, and there is no debt.
 *
 * The roadmap states it as a hard requirement, and it is a design position, not
 * a safety check: a tycoon game that can put the player in a hole they cannot
 * dig out of has replaced a decision with a punishment. Unpayable wages cost
 * the player an *employee*, which is recoverable, rather than a balance they
 * can never clear.
 */
export const MINIMUM_CASH = 0;
