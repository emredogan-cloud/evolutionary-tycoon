/**
 * Traffic constants — the day curve, spawn process and car-following model.
 *
 * Data only. Every number the traffic systems need lives here, because
 * WORKING_DISCIPLINE §2.4 forbids timing and balancing literals inside gameplay
 * code: a tuning value buried in a system is a value nobody finds when the road
 * feels wrong.
 */

/**
 * Relative traffic density by hour, hand-drawn — GAME_DESIGN_DOCUMENT §9.3.
 *
 * Three peaks: breakfast, a strong lunch, and the largest at evening rush. The
 * small hours are near-empty but never zero, because a road with literally no
 * cars at 03:00 reads as broken rather than quiet.
 *
 * These are **relative** weights. They are normalised at load so their mean is
 * exactly 1, which is what lets `BASE_SPAWN_PER_REAL_MINUTE` below be the honest
 * day average rather than a number that has to be back-solved from the curve.
 */
export const DAY_CURVE: readonly number[] = [
  0.1, // 00
  0.08, // 01
  0.06, // 02
  0.06, // 03
  0.08, // 04
  0.14, // 05
  0.3, // 06  first commuters
  0.62, // 07
  0.95, // 08  breakfast / commute peak
  0.7, // 09
  0.55, // 10
  0.78, // 11
  1.3, // 12  lunch peak
  1.28, // 13
  0.8, // 14
  0.58, // 15
  0.72, // 16
  1.05, // 17
  1.45, // 18  evening peak — the largest
  1.2, // 19
  0.85, // 20
  0.55, // 21
  0.32, // 22
  0.18, // 23
];

export const HOURS_IN_CURVE = 24;

/**
 * Stage 1 average, in vehicles per **real** minute — ECONOMY_DESIGN §3.
 *
 * Real minutes rather than game hours on purpose: the player experiences the
 * road in real time, and the whole point of the time-scale question is that game
 * hours are a presentation choice layered on top of this.
 */
export const BASE_SPAWN_PER_REAL_MINUTE = 24;

/** Multiplier per evolution stage. Stage 1 is the baseline. ECONOMY_DESIGN §3. */
export const STAGE_TRAFFIC_MULTIPLIER: readonly number[] = [1, 1, 40 / 24, 60 / 24, 84 / 24];

/**
 * Spawn is refused when the last vehicle on the lane is closer than this.
 *
 * Not a tuning knob so much as a physical fact: two cars cannot occupy the same
 * metre of road. When the road is saturated the spawn is **dropped**, which is
 * what makes a jam self-limiting instead of producing a pile-up at the entrance.
 */
export const SPAWN_MIN_HEADWAY_METRES = 12;

/** Speed a vehicle enters at, as a fraction of its desired speed. */
export const SPAWN_SPEED_FRACTION = 0.9;

/**
 * IDM-lite — GAME_DESIGN_DOCUMENT §9.2.
 *
 *   a      = a_max * (1 - (v/v0)^4 - (s_star/gap)^2)
 *   s_star = s_min + max(0, v*T + v*dv / (2*sqrt(a_max*b)))
 *
 * The exponent 4 on the free-road term is the standard IDM choice: it keeps
 * acceleration nearly constant until close to the desired speed, then drops off
 * sharply, which looks like a driver easing off rather than tapering the whole
 * way up.
 *
 * `timeHeadway` is the parameter that decides whether the road feels alive. Too
 * low and cars tailgate in a rigid line; too high and they string out evenly and
 * the accordion never forms. 1.4 s produces visible upstream waves at the
 * densities Stage 1 runs at.
 */
export const IDM = {
  /** Comfortable acceleration, m/s². */
  maxAccel: 1.6,
  /** Comfortable deceleration, m/s². Positive. */
  comfortBrake: 2.2,
  /** Hard ceiling on braking, m/s². Emergency only; keeps the model stable. */
  maxBrake: 8.0,
  /** Desired time gap to the leader, seconds. */
  timeHeadway: 1.4,
  /** Bumper-to-bumper spacing at a standstill, metres. */
  minGap: 2.4,
} as const;

/**
 * Below this speed a vehicle is treated as stopped.
 *
 * Without it, IDM asymptotically approaches zero and vehicles creep forever at
 * micrometres per tick, which never looks stationary and never frees the slot.
 */
export const STOP_SPEED_EPSILON = 0.05;

/**
 * Deceleration below which the brake lights come on, m/s².
 *
 * Deliberately not "any deceleration at all": IDM makes tiny corrections
 * constantly, and lights that flicker every tick read as a rendering fault
 * rather than as braking.
 */
export const BRAKE_LIGHT_DECEL = 0.6;

/** Sim clamps: a vehicle may never reverse, and never exceed this. */
export const MAX_SPEED_METRES_PER_SECOND = 30;

/**
 * The candidate time scales the Phase 5 open question weighs — GDD §25 S1.
 *
 * The decision is made by playing, not by picking from this list on paper.
 */
export const TIME_SCALE_CANDIDATE_MINUTES: readonly number[] = [8, 12, 18];
