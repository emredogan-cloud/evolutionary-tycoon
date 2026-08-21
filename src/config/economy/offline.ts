/**
 * Offline progression — GAME_DESIGN_DOCUMENT §17, ECONOMY_DESIGN §10,
 * GAME_EXECUTION_ROADMAP Phase 14.
 *
 * The model is deliberately not a simulation. Hours of gameplay simulated on
 * load would be slow, and worse, it would let the player "discover" outcomes
 * they never played. Instead the last minutes of *actual* play are measured
 * (`OfflineMeterState`), and the reward is that measurement, degraded and
 * capped. The constants below are the approved design values; the roadmap's
 * execution prompt says in as many words not to "improve" them without
 * approval.
 */

/** One night of sleep. Staying away a week pays no more than staying away one. */
export const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;

/** Offline is never better than playing. */
export const OFFLINE_EFFICIENCY = 0.4;

/**
 * Clock drift the local clock is forgiven — GDD §17.3.
 *
 * Below this, the local clock is used as-is; above it, the server's answer
 * wins. Five minutes is generous for real skew and useless for cheating: no
 * meaningful offline reward accrues in five minutes.
 */
export const OFFLINE_DRIFT_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * The cap when the server could not be asked — GDD §17.3: "kazanç CAP'in
 * yarısıyla sınırlanır". Applied to the *window*, which caps the earnings with
 * it: an unverifiable clock is trusted for four hours, not eight.
 */
export const OFFLINE_UNSYNCED_CAP_FACTOR = 0.5;

/**
 * The measurement window: five minutes of active play, in sixty five-second
 * buckets. Five seconds matches the economy window's bucket so the two cursors
 * advance on the same cadence; sixty of them is the "son 5 dakikanın ölçülen
 * müşteri/dk değeri" ECONOMY_DESIGN §10 names.
 */
export const OFFLINE_METER_BUCKET_MS = 5000;
export const OFFLINE_METER_BUCKET_COUNT = 60;
export const OFFLINE_METER_WINDOW_MS = OFFLINE_METER_BUCKET_MS * OFFLINE_METER_BUCKET_COUNT;

/**
 * Below this, no report is shown. A ninety-second tab switch is not "being
 * away", and a report for ₡3 teaches the player to ignore the report.
 */
export const OFFLINE_MIN_REPORT_MS = 5 * 60 * 1000;

/**
 * The resources the limiting-factor analysis ranks, in a fixed order.
 *
 * Order is load-bearing twice over: `argmax` breaks ties toward the earlier
 * entry, and the meter's utilisation integrals are indexed by position. It is
 * the ECONOMY_DESIGN §10 list — "park, mutfak, masa, personel, kuyruk".
 */
export const OFFLINE_LIMITERS = ['parking', 'kitchen', 'tables', 'staff', 'queue'] as const;
type OfflineLimiter = (typeof OFFLINE_LIMITERS)[number];

/**
 * Below this, no capacity was the limiter — *demand* was.
 *
 * Found by looking at the screen, not the code: an early stand's busiest
 * resource measured 9% and the report said "park alanı seni sınırladı", which
 * is nonsense a player can see through. The argmax names the busiest
 * resource; whether the busiest resource was actually *binding* is this
 * threshold. Under it the report says the honest thing — capacity sat idle,
 * what limited earnings was how many customers came and converted.
 */
export const OFFLINE_LIMITER_SIGNIFICANCE = 0.5;

/** The report's limiter, including the no-capacity-was-binding case. */
export type OfflineReportLimiter = OfflineLimiter | 'demand';
