/**
 * The conversion model — GAME_DESIGN_DOCUMENT §9.5, ECONOMY_DESIGN §7.
 *
 * Ten multipliers decide whether a passing vehicle becomes a customer, and the
 * design rule behind them is stricter than it looks: **every factor corresponds
 * to something the player can see and can change.** There is no hidden
 * difficulty knob. That is what makes the Phase 18 "why didn't they stop?"
 * panel possible at all — it reads this same list back to the player.
 *
 * Several factors are literal 1.0 here because the systems they measure do not
 * exist yet. They are named constants with the phase that fills them in, not
 * absent terms, so the formula in code matches the formula in the design
 * document line for line and the diff that implements one is one line long.
 *
 * ## A discrepancy, recorded rather than resolved
 *
 * GAME_DESIGN_DOCUMENT §9.5 writes `clamp01(product) × globalDifficultyCurve`.
 * GAME_EXECUTION_ROADMAP Phase 6 and ECONOMY_DESIGN §7 (Fren 2) both write
 * `clamp(product, 0, MAX_CONVERSION[stage])` and do not mention the curve.
 *
 * `evaluateConversion` applies the ceiling, then the curve, then the ceiling
 * again. While `GLOBAL_DIFFICULTY_CURVE` is 1.0 — which it is in this phase and
 * every phase until balance tuning — the three formulations are numerically
 * identical, so nothing here depends on which reading is intended. The
 * difference becomes real the first time the curve moves off 1.0, and the
 * decision belongs to that phase, not this one. Recorded in PROJECT_MEMORY.
 */

/**
 * Hard ceiling on P(convert) per stage — ECONOMY_DESIGN §3.
 *
 * Even fully upgraded at Stage 4 the ceiling is 0.45, so most passing traffic
 * never stops. That is deliberate on two counts: it is what roadside trade
 * actually looks like, and it is the brake that keeps the economy from running
 * away once several multipliers are upgraded at once.
 *
 * Indexed by stage, so index 0 is unused — the same shape as
 * `STAGE_TRAFFIC_MULTIPLIER`. A `Record<Stage, number>` would read better but
 * `Stage` lives in `src/sim`, and `src/config` may not import from it.
 */
export const MAX_CONVERSION: readonly number[] = [0.22, 0.22, 0.3, 0.38, 0.45];

/**
 * Global difficulty scalar — GAME_DESIGN_DOCUMENT §9.5.
 *
 * 1.0 until the balance pass measures the real curve in Phase 12. Present so the
 * formula is complete; see the discrepancy note above for why it sits outside
 * the first clamp.
 */
export const GLOBAL_DIFFICULTY_CURVE = 1;

/** Does the menu carry what this archetype wants? Phase 8 introduces the menu. */
export const MENU_APPEAL_PLACEHOLDER = 1;

/** Price against the archetype's tolerance. Phase 9 introduces pricing. */
export const PRICE_FIT_PLACEHOLDER = 1;

/** Rain suppresses passing trade and lifts sit-down demand. Phase 15. */
export const WEATHER_FACTOR_PLACEHOLDER = 1;

/**
 * Visibility of the stand from the road.
 *
 * Stage 1 has one unlit sign and no lighting upgrade, so this is a constant
 * pair rather than a computed value — but it is already split day/night,
 * because that split is the thing the first visibility upgrade will move and
 * because a stand that is equally visible at midnight reads as wrong long
 * before anyone checks the number.
 *
 * 0.55 by day is calibrated against ECONOMY_DESIGN §3's zero-upgrade conversion
 * rate of 0.09 at Stage 1: mean `baseAffinity` 0.292 x 0.55 x a reputation
 * factor of 0.60 at zero reputation = 0.096.
 */
export const VISIBILITY = {
  day: 0.55,
  night: 0.3,
  /** Hours outside [dawn, dusk) use the night figure. */
  dawnHour: 6,
  duskHour: 20,
} as const;

/**
 * Visible queue length to a multiplier — GAME_DESIGN_DOCUMENT §9.5.
 *
 * A short queue is social proof and costs nothing; a long one is a reason to
 * drive on. The floor is 0.15 rather than 0 so that a busy stand still converts
 * occasionally, which keeps the recovery from a queue spike smooth instead of
 * a cliff.
 */
export const QUEUE_PENALTY = {
  /** Queue lengths at or below this do not deter anyone. */
  freeLength: 2,
  /** Multiplier lost per waiting customer beyond `freeLength`. */
  perCustomer: 0.14,
  floor: 0.15,
} as const;

/**
 * Spillover — ECONOMY_DESIGN §7, Fren 4, reproduced exactly.
 *
 * When the queue runs past its slots and onto the road, passing drivers see a
 * mess and keep going. This is the negative feedback loop the economy design
 * calls its most elegant mechanic: excess demand suppresses demand, so the
 * system self-limits without a designer-imposed cap.
 */
export const SPILLOVER_PENALTY = {
  perOverflowCustomer: 0.18,
  floor: 0.15,
} as const;

/** ECONOMY_DESIGN §9: reputation 0..100 maps to a 0.60..1.40 multiplier. */
export const REPUTATION_FACTOR = { base: 0.6, perPoint: 0.008 } as const;

/**
 * Meal-time appetite by hour, 24 entries.
 *
 * Breakfast, lunch and dinner humps over a low overnight floor. It multiplies
 * the day curve in `TimeSystem`, which is a different thing: that one says how
 * many vehicles are on the road, this one says how hungry the people in them
 * are. Both peak in the evening, and the product is what produces the evening
 * rush the player feels.
 */
export const TIME_OF_DAY_FIT: readonly number[] = [
  0.35, 0.3, 0.3, 0.3, 0.35, 0.5, 0.8, 1.15, 1.2, 0.95, 0.85, 1.05, 1.35, 1.3, 0.95, 0.85, 0.9, 1.15, 1.4,
  1.35, 1.1, 0.85, 0.6, 0.45,
];

/**
 * Novelty decay — GAME_DESIGN_DOCUMENT §9.5.
 *
 * A stand that has just served six sedans in a row is slightly less interesting
 * to the seventh sedan. Small on purpose: it adds texture to the archetype mix
 * without ever being a strategy the player has to think about.
 */
const NOVELTY_WINDOW = 8;
const NOVELTY_PER_CONVERSION = 0.03;

export const NOVELTY_DECAY = {
  /** How many recent conversions of the same archetype are remembered. */
  window: NOVELTY_WINDOW,
  /** Multiplier lost per remembered conversion. */
  perConversion: NOVELTY_PER_CONVERSION,
  /**
   * Computed, not chosen. A hand-written floor of 0.75 sat below the value a
   * full window can actually reach (0.76), so the clamp was unreachable — a
   * limit that cannot fire is a claim the code does not keep, and the test
   * asserting it fires was what found it.
   */
  floor: 1 - NOVELTY_WINDOW * NOVELTY_PER_CONVERSION,
} as const;

/**
 * Why a vehicle did not stop.
 *
 * Numeric rather than string-valued because these travel on pooled events every
 * tick and a string field would be one more thing to keep out of the allocator.
 * The order is load-bearing in the same way archetype indices are: the failure
 * histogram is stored positionally.
 */
export const CONVERSION_REASONS = [
  'JUST_PASSING',
  'QUEUE_TOO_LONG',
  'NOT_VISIBLE',
  'NO_DESIRED_ITEM',
  'PRICE_TOO_HIGH',
  'REPUTATION_LOW',
  'WRONG_TIME',
  'WEATHER',
  'NO_PARKING',
] as const;

export type ConversionReasonName = (typeof CONVERSION_REASONS)[number];

export const REASON_JUST_PASSING = 0;
export const REASON_QUEUE_TOO_LONG = 1;
export const REASON_NOT_VISIBLE = 2;
export const REASON_NO_DESIRED_ITEM = 3;
export const REASON_PRICE_TOO_HIGH = 4;
export const REASON_REPUTATION_LOW = 5;
export const REASON_WRONG_TIME = 6;
export const REASON_WEATHER = 7;
/**
 * Not a conversion failure at all — the driver decided to stop and found the
 * car park full. It lives in the same histogram because the player asking "why
 * am I not getting customers?" needs it in the same list, and because it is the
 * one entry there that is entirely the player's own doing.
 */
export const REASON_NO_PARKING = 8;

export function conversionReasonName(reason: number): ConversionReasonName {
  const name = CONVERSION_REASONS[reason];
  if (name === undefined) throw new RangeError(`Unknown conversion reason ${reason}`);
  return name;
}
