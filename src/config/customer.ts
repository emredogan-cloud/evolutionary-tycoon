/**
 * Customer behaviour constants — GAME_DESIGN_DOCUMENT §8.1.
 *
 * Patience is the whole of the Phase 6 pressure model. Every waiting state
 * counts down; reaching zero routes to `ABANDONING` and out through
 * `LEAVING_ANGRY`, which is what stops the state machine deadlocking when the
 * thing being waited for never arrives — and in Phase 6 it never does, because
 * nothing serves food yet.
 */

/** Human walking pace, m/s. GAME_EXECUTION_ROADMAP Phase 7. */
export const WALK_SPEED_METRES_PER_SECOND = 1.35;

/**
 * How close counts as arrived, in metres.
 *
 * Larger than it looks necessary because arrival is tested against a footprint
 * centre: a customer whose centre is 0.25 m from a queue slot centre is
 * standing on it.
 */
export const ARRIVAL_EPSILON_METRES = 0.25;

/**
 * Seconds of patience per waiting state, before archetype modulation.
 *
 * Queueing at a counter you have already parked and walked to is a bigger sunk
 * cost than sitting in a car, so it buys more patience than the drive-thru
 * figure Phase 11 will introduce. The numbers are deliberately short for
 * Stage 1: the player needs to see impatience inside a single session, and a
 * realistic ten minutes would read as "nothing is happening".
 */
export const PATIENCE_SECONDS = {
  seekingParking: 20,
  queueingAtCounter: 45,
  waitingForFood: 90,
} as const;

/**
 * Per-archetype patience multiplier, indexed like `ARCHETYPE_SPECS`.
 *
 * A working driver on a schedule gives up sooner than a family that has already
 * unloaded the van. Same order as the archetype array, and load-bearing for the
 * same reason: the index is what the store holds.
 */
export const ARCHETYPE_PATIENCE: readonly number[] = [
  1.0, // SEDAN_COMMUTER
  0.75, // PICKUP_WORKER  — on the clock
  1.35, // FAMILY_VAN     — already committed, children unloaded
  0.85, // MOTORCYCLE     — exposed to the weather
];

/**
 * How long a parked customer takes to get out of the car, in seconds.
 *
 * Not decoration: without it the customer appears beside a car that is still
 * settling into its slot, and the eye reads that as a spawn rather than as
 * someone getting out. "Teleporting is forbidden" (GAME_DESIGN_DOCUMENT §8)
 * covers the moment of appearing as much as the moment of moving.
 */
export const DOOR_OPEN_SECONDS = 0.8;

/**
 * Speed along a parking manoeuvre, m/s.
 *
 * A car park crawl, not a road speed. The manoeuvre spline is arc-length
 * parameterised, so this is a real speed rather than a rate of change of a
 * curve parameter — the difference is visible as a car that would otherwise
 * accelerate through the tight part of the turn.
 */
export const MANEUVER_SPEED_METRES_PER_SECOND = 2.6;

/**
 * Target speed at the mouth of the entrance, m/s.
 *
 * The car-following model brakes towards this as if a slow vehicle sat at the
 * entry point, which produces a real deceleration curve, real brake lights, and
 * a real accordion wave in the traffic behind. Roughly walking pace x 2 — slow
 * enough to look like a car committing to a turn.
 */
export const ENTRY_APPROACH_SPEED = 2.8;

/**
 * Gap a departing vehicle needs before it will pull back onto the road, metres.
 *
 * Without it a car leaving the lot rejoins the lane on top of a passing vehicle
 * and the follower model resolves the overlap with a violent brake. Waiting for
 * a gap is both what a driver does and what stops that.
 */
export const REJOIN_GAP_METRES = 16;

/**
 * How long a departing driver will wait for that gap before taking one, seconds.
 *
 * Without a ceiling this is a deadlock, and a quiet one: at peak the road can
 * genuinely never offer a 16 m gap, so cars accumulate at the mouth of the car
 * park, hold their bays, and the lot silts up until nothing can convert. It
 * showed up as spawn counts collapsing from 300 to 89 over twenty minutes.
 *
 * Forcing the merge is also what a real driver does when the road never clears,
 * and the follower model absorbs it — the traffic behind brakes, which is the
 * correct and visible consequence.
 */
export const REJOIN_MAX_WAIT_SECONDS = 8;
