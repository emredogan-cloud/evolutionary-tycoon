import { ARCHETYPE_SPECS } from '@config/archetypes';
import {
  BASE_SPAWN_PER_REAL_MINUTE,
  DECORATIVE_TRAFFIC_MULTIPLIER,
  DECORATIVE_MIN_HEADWAY_METRES,
  SPAWN_MIN_HEADWAY_METRES,
  SPAWN_SPEED_FRACTION,
  STAGE_TRAFFIC_MULTIPLIER,
} from '@config/traffic';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import { at, atIn } from '../math/typedArray';
import type { LaneGraph } from '../nav/LaneGraph';
import { DAY_CURVE_PEAK, dayCurveAt } from './TimeSystem';

/**
 * Deterministic inhomogeneous Poisson spawning, in two populations.
 *
 * **The arrival process.** The rate varies continuously through the day, which
 * rules out the obvious implementations. A per-tick Bernoulli trial only
 * approximates a Poisson process and its error grows with the rate — enough to
 * fail a distribution test at 10 000 samples. Sampling one exponential gap
 * against the *current* rate silently assumes the rate holds until the next
 * arrival, which it does not across a peak.
 *
 * So: **thinning** (Lewis-Shedler). Candidates are generated at the day's peak
 * rate and each is accepted with probability `rate(now) / peakRate`. That is
 * exact for a time-varying rate, and — the part that matters here — consumes a
 * number of random draws that depends only on simulation state. Same seed, same
 * tick count, same arrivals.
 *
 * **Two populations, two processes.** Convertible traffic is the 24 vehicles per
 * real minute ECONOMY_DESIGN §3 calibrates the whole economy on. Decorative
 * traffic exists so the road looks like a road: at 24/min over a 36 m lane the
 * measured occupancy was 1.05 vehicles and the road was empty 41% of the time,
 * so there was never a follower and the IDM accordion wave never ran
 * (PHASE_5_REPORT §4, resolved by executive decision as option B).
 *
 * They are deliberately **not** one process with marked arrivals, even though
 * marking is mathematically exact and would need only one cursor. Refusals are
 * why: a shared process shares its refusals, and congestion — which is the whole
 * point of the decorative layer — starved convertible arrivals from 24/min down
 * to a measured **7.3/min**. Two cursors, with convertible arrivals processed
 * first and therefore claiming road space first, keep the economy's figure
 * intact and let the decorative layer absorb every refusal.
 */

/** Convertible vehicles per real second at the day's peak, before thinning. */
function convertiblePeakPerSecond(stage: number): number {
  const stageMultiplier = atIn(STAGE_TRAFFIC_MULTIPLIER, stage, 1);
  return (BASE_SPAWN_PER_REAL_MINUTE / 60) * DAY_CURVE_PEAK * stageMultiplier;
}

/** Decorative vehicles per real second at the day's peak, before thinning. */
function decorativePeakPerSecond(stage: number): number {
  return convertiblePeakPerSecond(stage) * DECORATIVE_TRAFFIC_MULTIPLIER;
}

export class TrafficSpawnSystem implements SimSystem {
  readonly name = 'TrafficSpawnSystem' as const;

  constructor(private readonly lanes: LaneGraph) {}

  run(world: World, deltaMs: number): void {
    const until = world.clock.simTimeMs + deltaMs;

    /*
     * Convertible first, unconditionally. This ordering is the mechanism that
     * holds the economy's 24-per-minute figure steady under congestion: a
     * convertible arrival takes the lane space, and the decorative layer gets
     * whatever is left.
     */
    this.runProcess(world, until, convertiblePeakPerSecond(world.progression.stage), false);
    this.runProcess(world, until, decorativePeakPerSecond(world.progression.stage), true);
  }

  private runProcess(world: World, until: number, peak: number, decorative: boolean): void {
    /*
     * Defence in depth against a configuration mistake, not a reachable state:
     * `Stage` is typed 1-4 and every multiplier is positive. If one were ever set
     * to zero the exponential gap draw would be `-ln(1-u) / 0` = Infinity, the
     * cursor would never advance, and the loop below would spin forever.
     */
    if (!(peak > 0)) return;

    const traffic = world.traffic;
    const now = world.clock.simTimeMs;

    /*
     * A cursor in the past would make the loop walk forward from it in
     * exponential steps — for a save migrated from an older schema, an entire day
     * of backlog inside one tick, which presents as a hang rather than as a wrong
     * number. Snapping is also the correct behaviour: arrivals that "should" have
     * happened while the game was closed did not happen.
     */
    let cursor = decorative ? traffic.nextDecorativeMs : traffic.nextCandidateMs;
    if (cursor < now) cursor = now;

    /*
     * A while loop rather than one spawn per tick: at 4x speed with a peak-hour
     * rate the expected arrivals in a single 50 ms tick can exceed one, and
     * capping at one per tick would silently flatten the peaks — the exact thing
     * the day curve exists to produce.
     */
    while (cursor <= until) {
      const candidateMs = cursor;

      // Every draw happens unconditionally and in a fixed order. Short-circuiting
      // on the acceptance test would make the number of draws depend on the
      // outcome, and every later arrival would shift.
      const acceptRoll = world.rng.traffic.next();
      const gapRoll = world.rng.traffic.next();
      const laneRoll = world.rng.traffic.next();
      const archetypeRoll = world.rng.traffic.next();
      const speedRoll = world.rng.traffic.next();

      const hour = hourAt(world, candidateMs);
      if (acceptRoll < dayCurveAt(hour) / DAY_CURVE_PEAK) {
        this.trySpawn(world, laneRoll, archetypeRoll, speedRoll, hour, decorative);
      }

      // -ln(1-u)/rate is the inverse CDF of the exponential distribution.
      // `1 - u` rather than `u` because `next()` can return exactly 0, and
      // ln(0) is -Infinity.
      cursor = candidateMs + (-Math.log(1 - gapRoll) / peak) * 1000;
    }

    if (decorative) traffic.nextDecorativeMs = cursor;
    else traffic.nextCandidateMs = cursor;
  }

  private trySpawn(
    world: World,
    laneRoll: number,
    archetypeRoll: number,
    speedRoll: number,
    hour: number,
    decorative: boolean,
  ): void {
    const drawn = Math.min(this.lanes.laneCount - 1, Math.floor(laneRoll * this.lanes.laneCount));

    /*
     * Try the drawn lane, then the others in order. Dropping an arrival because
     * one lane happened to be busy loses real demand — measured at 23% of all
     * spawns on the first run, which the economy would silently never have seen —
     * and a driver does not go home because the inside lane is occupied.
     *
     * The scan is deterministic and consumes no extra randomness: the draw
     * decides the preference, not the outcome.
     */
    let laneIndex = -1;
    for (let offset = 0; offset < this.lanes.laneCount; offset++) {
      const candidate = (drawn + offset) % this.lanes.laneCount;
      if (this.laneHeadClear(world, candidate, decorative)) {
        laneIndex = candidate;
        break;
      }
    }
    if (laneIndex < 0) {
      // Every lane head is occupied: the road genuinely is saturated, which is
      // what makes a jam self-limiting rather than a pile-up at the entrance.
      this.refuse(world, decorative);
      return;
    }

    const slot = world.vehicles.spawn(world.allocateEntityId());
    if (slot < 0) {
      this.refuse(world, decorative);
      return;
    }

    const archetype = pickArchetype(archetypeRoll, hour);
    const spec = ARCHETYPE_SPECS[archetype];
    if (spec === undefined) return;

    // Symmetric spread around the archetype's nominal speed. This single line is
    // most of what stops the road reading as a conveyor belt.
    const spread = 1 + (speedRoll * 2 - 1) * spec.speedVariance;
    const desired = spec.desiredSpeed * spread;

    world.vehicles.lane[slot] = laneIndex;
    world.vehicles.laneS[slot] = 0;
    world.vehicles.desiredSpeed[slot] = desired;
    world.vehicles.speed[slot] = desired * SPAWN_SPEED_FRACTION;
    world.vehicles.archetype[slot] = archetype;
    world.vehicles.decorative[slot] = decorative ? 1 : 0;
    world.vehicles.accel[slot] = 0;
    world.stats.vehiclesSpawned++;
    if (!decorative) world.stats.convertibleSpawned++;

    world.eventQueue.emitVehicleSpawned(at(world.vehicles.entityId, slot), laneIndex, archetype);
  }

  private refuse(world: World, decorative: boolean): void {
    world.traffic.droppedSpawns++;
    if (decorative) world.traffic.droppedDecorative++;
  }

  /**
   * True when nothing sits within the required headway of the lane entrance.
   *
   * Decorative traffic requires a much larger gap, which is what reserves entry
   * space for the convertible traffic the economy depends on.
   */
  private laneHeadClear(world: World, laneIndex: number, decorative: boolean): boolean {
    const required = decorative ? DECORATIVE_MIN_HEADWAY_METRES : SPAWN_MIN_HEADWAY_METRES;
    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if (at(vehicles.lane, slot) !== laneIndex) continue;
      if (at(vehicles.laneS, slot) < required) return false;
    }
    return true;
  }
}

/** Game hour at an arbitrary sim time, without mutating the clock. */
function hourAt(world: World, simTimeMs: number): number {
  const perDay = world.clock.msPerGameDay;
  const withinDay = simTimeMs - Math.floor(simTimeMs / perDay) * perDay;
  return (withinDay / perDay) * 24;
}

/**
 * Weighted pick over archetypes, biased by hour.
 *
 * The weights are recomputed per spawn rather than cached per hour: four
 * multiplications and a scan of four entries is cheaper than the invalidation
 * logic a cache would need.
 */
export function pickArchetype(roll: number, hour: number): number {
  const bucket = Math.floor(((hour % 24) + 24) % 24);
  let total = 0;
  for (const spec of ARCHETYPE_SPECS) {
    total += spec.baseShare * atIn(spec.hourBias, bucket, 1);
  }

  let cursor = roll * total;
  for (let i = 0; i < ARCHETYPE_SPECS.length; i++) {
    const spec = ARCHETYPE_SPECS[i];
    if (spec === undefined) continue;
    cursor -= spec.baseShare * atIn(spec.hourBias, bucket, 1);
    if (cursor <= 0) return i;
  }
  // Floating-point drift can leave a sliver at the top of the range.
  return ARCHETYPE_SPECS.length - 1;
}
