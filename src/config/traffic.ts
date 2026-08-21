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
export const BASE_SPAWN_PER_REAL_MINUTE = 28;

/**
 * Decorative traffic, as a multiple of the converting-eligible rate.
 *
 * **Approved by executive decision, 2026-08-15 (option B of PHASE_5_REPORT §4.3).**
 *
 * The problem it solves, measured: at 24 arrivals per real minute over a 36 m
 * lane at 13.9 m/s, the expected occupancy is 1.04 vehicles and the road is
 * completely empty 41% of the time. There is never a follower, so the IDM
 * accordion wave — the reason that model was chosen — never runs in normal play.
 *
 * The economy is calibrated on 24/min, so that number does not move. Instead the
 * road carries additional vehicles that behave identically in every way except
 * one: their conversion probability is permanently zero. They queue, brake,
 * propagate waves and occupy road space, and Phase 6 never offers them the
 * restaurant.
 *
 * The two populations are one Poisson process with each arrival independently
 * *marked*, which is exact: marking a Poisson process of rate R with probability
 * p yields an exact Poisson process of rate pR. So converting-eligible arrivals
 * remain exactly Poisson(24/min) while the road sees Poisson(24 x (1 + this)).
 */
export const DECORATIVE_TRAFFIC_MULTIPLIER = 2;

/*
 * Tuned by measurement, not by taste. A full game day at each setting, seed
 * 424242, reading mean occupancy / share of ticks with a follower / delivered
 * convertible rate:
 *
 *   no decorative traffic   1.05  ·   ~0%  ·  21.2/min
 *   x3, headway 34          1.76  ·  26.6% ·  20.3/min
 *   x4, headway 28          2.05  ·  36.6% ·  19.5/min   <- chosen
 *   x4, headway 22          2.26  ·  47.5% ·  18.3/min
 *   x6, headway 24          2.34  ·  50.1% ·  18.0/min
 *
 * The trade is a hard physical ceiling rather than a tuning preference: a 36 m
 * lane at ~13.9 m/s carries about 45 vehicles per real minute in total, so every
 * decorative vehicle admitted is one fewer convertible vehicle the road can
 * deliver. x4 / 28 m is the point that roughly doubles occupancy and gives
 * followers a third of the time while costing the least convertible throughput.
 */

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

/**
 * The same, for decorative traffic — deliberately much larger.
 *
 * Decorative vehicles yield road space to convertible ones. Processing order
 * within a tick is not enough on its own: a decorative vehicle that entered two
 * seconds ago is already sitting on the lane head, and the convertible arrival
 * behind it is refused regardless of who was considered first.
 *
 * Measured without this: at a 3x decorative multiplier the convertible rate fell
 * from 24/min to **12.7/min**, because the road's throughput capacity (~45/min
 * over a 36 m lane) is barely twice the economy's demand and decorative traffic
 * was consuming the difference.
 *
 * A larger headway makes decorative traffic *polite* — it only joins when there
 * is plenty of room, so the gap between 12 m and this value is reserved for the
 * traffic the economy actually depends on.
 */
export const DECORATIVE_MIN_HEADWAY_METRES = 28;

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
 * Left-turn gap acceptance — Phase 15, GDD §9.1: the far lane's pull-in
 * crosses opposing traffic and is a *designed* congestion source.
 *
 * The comfort gap shrinks with waiting time toward the minimum, exactly the
 * shape the exit-merge already uses: a driver waits for a comfortable gap,
 * and after long enough takes a small one. The floor guarantees the turn
 * always eventually happens — a jam must form AND clear, and "clear" cannot
 * depend on oncoming traffic ever pausing entirely.
 */
export const LEFT_TURN = {
  /**
   * First stage the discipline applies — GDD §9.1 scopes the left turn to
   * Stage 4 in as many words ("Aşama 4'te: sola dönüş…"). Before it, far-lane
   * cars cross as they have since Phase 5. Measured before this gate existed:
   * with the decorative layer's opposing flow, holding for gaps at Stage 1
   * starved delivered demand from 23.7 to **14.7/min** — a recalibration of
   * the entire economy hiding inside a realism feature. Stage 4's income is
   * explicitly uncalibrated (`CALIBRATED_STAGES=[1]`), which is exactly where
   * the design put this cost.
   */
  minStage: 4,
  /** Oncoming clearance a fresh waiter wants, metres upstream of the box. */
  comfortGapMetres: 16,
  /** The floor the gap shrinks to. */
  minGapMetres: 5,
  /** How long the shrink takes, ms of waiting. */
  patienceMs: 8_000,
  /** Metres past the conflict point still counted as occupying it. */
  conflictBoxMetres: 5,
} as const;
