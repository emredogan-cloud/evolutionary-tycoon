import { ARCHETYPE_SPECS } from '@config/archetypes';
import {
  BASE_SPAWN_PER_REAL_MINUTE,
  SPAWN_MIN_HEADWAY_METRES,
  SPAWN_SPEED_FRACTION,
  STAGE_TRAFFIC_MULTIPLIER,
} from '@config/traffic';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { LaneGraph } from '../nav/LaneGraph';
import { DAY_CURVE_PEAK, dayCurveAt } from './TimeSystem';

/**
 * Deterministic inhomogeneous Poisson spawning.
 *
 * The rate varies continuously through the day, which rules out the obvious
 * implementations. Drawing "did a car arrive this tick?" as a Bernoulli trial is
 * only an approximation of a Poisson process and its error grows with the rate —
 * enough to fail an archetype-distribution test at 10 000 samples. Sampling one
 * exponential gap against the *current* rate is wrong in a subtler way: it
 * silently assumes the rate stays put until the next arrival, which it does not
 * across a peak.
 *
 * So: **thinning** (Lewis-Shedler). Candidates are generated at the day's peak
 * rate, and each is accepted with probability `rate(now) / peakRate`. That is
 * exact for a time-varying rate, needs exactly two draws per candidate, and —
 * the part that matters here — consumes a number of random draws that depends
 * only on simulation state. Same seed, same tick count, same arrivals.
 *
 * `nextCandidateMs` lives on the world because it is part of the simulation's
 * state: a save taken mid-day and resumed must not re-roll the traffic.
 */

/** Vehicles per real second, before thinning. */
function peakRatePerSecond(stage: number): number {
  const stageMultiplier = STAGE_TRAFFIC_MULTIPLIER[stage] ?? 1;
  return (BASE_SPAWN_PER_REAL_MINUTE / 60) * DAY_CURVE_PEAK * stageMultiplier;
}

export class TrafficSpawnSystem implements SimSystem {
  readonly name = 'TrafficSpawnSystem' as const;

  constructor(private readonly lanes: LaneGraph) {}

  run(world: World, deltaMs: number): void {
    const traffic = world.traffic;
    const now = world.clock.simTimeMs;
    const until = now + deltaMs;
    const peak = peakRatePerSecond(world.progression.stage);
    if (peak <= 0) return;

    /*
     * A cursor in the past would make the loop below walk forward from it in
     * exponential steps — for a save migrated from v2, that is an entire day of
     * backlog replayed inside one tick, which presents as a hang rather than as
     * a wrong number. Snapping is also the correct behaviour: arrivals that
     * "should" have happened while the game was closed did not happen.
     */
    if (traffic.nextCandidateMs < now) traffic.nextCandidateMs = now;

    /*
     * A while loop rather than one spawn per tick: at 4x speed with a peak-hour
     * rate the expected arrivals in a single 50 ms tick can exceed one, and
     * capping at one per tick would silently flatten the peaks — the exact thing
     * the day curve exists to produce.
     */
    while (traffic.nextCandidateMs <= until) {
      const candidateMs = traffic.nextCandidateMs;

      // Draw both values unconditionally and in a fixed order. Short-circuiting
      // on the acceptance test would make the number of draws depend on the
      // outcome, and every later spawn would shift.
      const acceptRoll = world.rng.traffic.next();
      const gapRoll = world.rng.traffic.next();
      const laneRoll = world.rng.traffic.next();
      const archetypeRoll = world.rng.traffic.next();
      const speedRoll = world.rng.traffic.next();

      const hour = hourAt(world, candidateMs);
      const acceptance = dayCurveAt(hour) / DAY_CURVE_PEAK;
      if (acceptRoll < acceptance) {
        this.trySpawn(world, laneRoll, archetypeRoll, speedRoll, hour);
      }

      // -ln(1-u)/rate is the inverse CDF of the exponential distribution.
      // `1 - u` rather than `u` because `next()` can return exactly 0, and
      // ln(0) is -Infinity.
      const gapSeconds = -Math.log(1 - gapRoll) / peak;
      traffic.nextCandidateMs = candidateMs + gapSeconds * 1000;
    }
  }

  private trySpawn(
    world: World,
    laneRoll: number,
    archetypeRoll: number,
    speedRoll: number,
    hour: number,
  ): void {
    const drawn = Math.min(this.lanes.laneCount - 1, Math.floor(laneRoll * this.lanes.laneCount));

    /*
     * Try the drawn lane, then the others in order. Dropping an arrival because
     * one lane happened to be busy loses real demand — measured at **23% of all
     * spawns** on the first run, which the economy would silently never see —
     * and a driver on a two-lane road does not go home because the inside lane
     * is occupied.
     *
     * The scan is deterministic and consumes no extra randomness: the draw
     * decides the preference, not the outcome. Only when every lane head is
     * occupied is the arrival refused, and at that point the road genuinely is
     * saturated, which is what makes a jam self-limiting.
     */
    let laneIndex = -1;
    for (let offset = 0; offset < this.lanes.laneCount; offset++) {
      const candidate = (drawn + offset) % this.lanes.laneCount;
      if (this.laneHeadClear(world, candidate)) {
        laneIndex = candidate;
        break;
      }
    }
    if (laneIndex < 0) {
      world.traffic.droppedSpawns++;
      return;
    }

    const slot = world.vehicles.spawn(world.allocateEntityId());
    if (slot < 0) {
      // The store is full: 160 concurrent vehicles. Also a dropped spawn, and
      // also self-limiting.
      world.traffic.droppedSpawns++;
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
    world.vehicles.accel[slot] = 0;
    world.stats.vehiclesSpawned++;

    world.eventQueue.emitVehicleSpawned(world.vehicles.entityId[slot] ?? 0, laneIndex, archetype);
  }

  /** True when nothing sits within the minimum headway of the lane entrance. */
  private laneHeadClear(world: World, laneIndex: number): boolean {
    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if (vehicles.lane[slot] !== laneIndex) continue;
      if ((vehicles.laneS[slot] ?? 0) < SPAWN_MIN_HEADWAY_METRES) return false;
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
 * logic a cache would need, and this runs about twenty times a real minute.
 */
export function pickArchetype(roll: number, hour: number): number {
  const bucket = Math.floor(((hour % 24) + 24) % 24);
  let total = 0;
  for (const spec of ARCHETYPE_SPECS) {
    total += spec.baseShare * (spec.hourBias[bucket] ?? 1);
  }

  let cursor = roll * total;
  for (let i = 0; i < ARCHETYPE_SPECS.length; i++) {
    const spec = ARCHETYPE_SPECS[i];
    if (spec === undefined) continue;
    cursor -= spec.baseShare * (spec.hourBias[bucket] ?? 1);
    if (cursor <= 0) return i;
  }
  // Floating-point drift can leave a sliver at the top of the range.
  return ARCHETYPE_SPECS.length - 1;
}
