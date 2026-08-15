import { ARCHETYPE_SPECS } from '@config/archetypes';
import {
  GLOBAL_DIFFICULTY_CURVE,
  MAX_CONVERSION,
  MENU_APPEAL_PLACEHOLDER,
  NOVELTY_DECAY,
  PRICE_FIT_PLACEHOLDER,
  QUEUE_PENALTY,
  REASON_JUST_PASSING,
  REASON_NOT_VISIBLE,
  REASON_NO_DESIRED_ITEM,
  REASON_PRICE_TOO_HIGH,
  REASON_QUEUE_TOO_LONG,
  REASON_REPUTATION_LOW,
  REASON_WEATHER,
  REASON_WRONG_TIME,
  REPUTATION_FACTOR,
  SPILLOVER_PENALTY,
  TIME_OF_DAY_FIT,
  VISIBILITY,
  WEATHER_FACTOR_PLACEHOLDER,
} from '@config/conversion';
import type { StageLayout } from '@config/layouts/stage1';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import { at, atIn } from '../math/typedArray';
import type { LaneGraph } from '../nav/LaneGraph';
import { STATE_ENTERING } from '../ai/fsm/customerFsm';

/**
 * Does a passing driver stop? — GAME_DESIGN_DOCUMENT §9.5.
 *
 * **One roll per vehicle, ever.** The single most important rule in this file,
 * and it is not only about determinism. A vehicle that re-tested each tick as it
 * crawled past would convert with probability approaching 1, so the effective
 * conversion rate would depend on how slowly it happened to be moving — traffic
 * jams would silently become the best marketing in the game. Re-rolling would
 * also be unfair in the way players notice: the same car, the same stand, a
 * different answer.
 *
 * `VehicleStore.decision` records that the roll happened, which is why it is a
 * three-valued field rather than a boolean. "Not asked" and "asked, said no"
 * have to be distinguishable or the rule cannot be enforced.
 *
 * ## Where the probability goes when it fails
 *
 * A failed roll emits a reason code, chosen as the factor that hurt the most.
 * That is the entire input to the Phase 18 "why didn't they stop?" panel, which
 * GAME_DESIGN_DOCUMENT §14.4 calls the game's main UX differentiator. Collecting
 * it now costs one comparison per failure; reconstructing it later would be
 * impossible, because the factors that produced any given decision are gone the
 * moment the tick ends.
 */

/** Values of `VehicleStore.decision`. */
export const DECISION_PENDING = 0;
export const DECISION_NO = 1;
export const DECISION_YES = 2;

/** One factor of the product, kept alongside the reason it maps to. */
interface FactorReport {
  value: number;
  reason: number;
}

export class ConversionSystem implements SimSystem {
  readonly name = 'ConversionSystem' as const;

  /**
   * Scratch for the factor scan, reused every evaluation.
   *
   * Ten small objects allocated once at construction rather than per decision.
   * At peak this system evaluates a few vehicles a second, so this is not a hot
   * path — but "0 B/tick in steady state" is a budget the whole simulation is
   * held to, and a system that allocates only *sometimes* is exactly the kind
   * that makes the allocation gate flaky rather than failing outright.
   */
  private readonly factors: FactorReport[] = [];

  constructor(
    private readonly lanes: LaneGraph,
    private readonly layout: StageLayout,
  ) {
    for (let i = 0; i < 10; i++) this.factors.push({ value: 1, reason: REASON_JUST_PASSING });
  }

  run(world: World): void {
    const vehicles = world.vehicles;

    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if (at(vehicles.decision, slot) !== DECISION_PENDING) continue;

      /*
       * Decorative traffic is skipped entirely — no roll, no event, no draw
       * from the conversion stream. Not "rolled and always failed": that would
       * flood the analysis panel with four fifths of all traffic reporting
       * JUST_PASSING, and it would couple the conversion RNG to how much
       * scenery happens to be on the road, so adding a decorative vehicle would
       * change which real vehicles convert.
       */
      if (at(vehicles.decorative, slot) === 1) {
        vehicles.decision[slot] = DECISION_NO;
        continue;
      }

      const laneIndex = at(vehicles.lane, slot);
      if (laneIndex >= this.lanes.laneCount) continue;
      const lane = this.lanes.lane(laneIndex);
      if (at(vehicles.laneS, slot) < lane.decisionS) continue;

      this.decide(world, slot);
    }
  }

  private decide(world: World, slot: number): void {
    const vehicles = world.vehicles;
    const archetype = at(vehicles.archetype, slot);
    const entityId = at(vehicles.entityId, slot);
    const probability = this.evaluate(world, archetype);

    const roll = world.rng.conversion.next();
    if (roll < probability) {
      vehicles.decision[slot] = DECISION_YES;
      world.stats.conversionsSucceeded++;
      world.eventQueue.emitConversionSucceeded(entityId, archetype, probability);
      this.spawnCustomer(world, slot, archetype);
      return;
    }

    vehicles.decision[slot] = DECISION_NO;
    world.stats.conversionsFailed++;
    const reason = this.dominantReason();
    world.stats.failureReasons[reason] = atIn(world.stats.failureReasons, reason, 0) + 1;
    world.eventQueue.emitConversionFailed(entityId, archetype, reason, probability);
  }

  /**
   * Create the driver as a customer, still inside the car.
   *
   * At conversion rather than at parking, so that "decided to stop but found
   * nowhere to park" is a state a real entity passes through and can be counted
   * in. That distinction is the whole reason `NO_SPACE` exists in the state
   * machine, and it is the difference between telling a player to buy a bigger
   * sign and telling them to build another bay.
   */
  private spawnCustomer(world: World, vehicleSlot: number, archetype: number): void {
    const customerSlot = world.customers.acquire();
    if (customerSlot < 0) {
      /*
       * The customer pool is full while the vehicle pool is not. Rare, and it
       * must not produce a car that drives into the lot with nobody in it: the
       * decision is downgraded to a refusal so the vehicle simply drives on.
       */
      world.vehicles.decision[vehicleSlot] = DECISION_NO;
      world.stats.conversionsSucceeded--;
      world.stats.conversionsFailed++;
      return;
    }

    const customer = world.customers.at(customerSlot);
    customer.entityId = world.allocateEntityId();
    customer.state = STATE_ENTERING;
    customer.archetype = archetype;
    customer.vehicleSlot = vehicleSlot;
    customer.parkingSlot = -1;
    customer.queueIndex = -1;
    customer.visible = 0;
    customer.timerMs = 0;
    customer.patienceMs = 0;
    customer.patienceMaxMs = 0;
    customer.reason = REASON_JUST_PASSING;
    customer.arrivedAtMs = world.clock.simTimeMs;
    customer.x = this.layout.pullIn.x;
    customer.y = this.layout.pullIn.y;
    customer.z = 0;

    world.vehicles.customerSlot[vehicleSlot] = customerSlot;
    world.eventQueue.emitCustomerSpawned(customer.entityId, archetype);
  }

  /**
   * The ten-factor product, clamped — GAME_DESIGN_DOCUMENT §9.5.
   *
   * Every factor is recorded as it is computed, so the failure reason falls out
   * of the same pass rather than needing a second guess at what went wrong.
   */
  evaluate(world: World, archetype: number): number {
    const spec = ARCHETYPE_SPECS[archetype];
    if (spec === undefined) return 0;

    const hour = world.clock.gameHour;
    const queueLength = this.visibleQueueLength(world);

    this.set(0, spec.baseAffinity, REASON_JUST_PASSING);
    this.set(1, visibilityAt(hour), REASON_NOT_VISIBLE);
    this.set(2, MENU_APPEAL_PLACEHOLDER, REASON_NO_DESIRED_ITEM);
    this.set(3, PRICE_FIT_PLACEHOLDER, REASON_PRICE_TOO_HIGH);
    this.set(4, queuePenalty(queueLength), REASON_QUEUE_TOO_LONG);
    this.set(5, spilloverPenalty(queueLength, this.layout.queueCapacity), REASON_QUEUE_TOO_LONG);
    this.set(6, reputationFactor(world.economy.reputation), REASON_REPUTATION_LOW);
    this.set(7, timeOfDayFit(hour), REASON_WRONG_TIME);
    this.set(8, WEATHER_FACTOR_PLACEHOLDER, REASON_WEATHER);
    this.set(9, noveltyDecay(world, archetype), REASON_JUST_PASSING);

    let product = 1;
    // Indexed rather than for-of, for the reason the scratch array exists at
    // all: `for-of` allocates an iterator, and this file is explicitly trying
    // not to be a system that allocates only sometimes (WORKING_DISCIPLINE §2.3).
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.factors.length; i++) {
      product *= this.factors[i]?.value ?? 1;
    }

    /*
     * Ceiling, then curve, then ceiling again. The two source documents differ
     * on where `globalDifficultyCurve` sits relative to the clamp — see the note
     * at the top of `@config/conversion`. While the curve is 1.0 the readings
     * are numerically identical, and this ordering is the one that keeps the
     * hard ceiling hard under either.
     */
    const ceiling = atIn(MAX_CONVERSION, world.progression.stage, MAX_CONVERSION[1] ?? 0.22);
    const clamped = Math.min(Math.max(product, 0), ceiling);
    return Math.min(clamped * GLOBAL_DIFFICULTY_CURVE, ceiling);
  }

  private set(index: number, value: number, reason: number): void {
    const factor = this.factors[index];
    if (factor === undefined) return;
    factor.value = value;
    factor.reason = reason;
  }

  /**
   * The factor that cost the most, as a reason code.
   *
   * The smallest multiplier, because these are multiplied: halving one factor
   * halves the result regardless of the others. A factor at or above 1.0 helped
   * rather than hurt, so if nothing is below 1.0 the honest answer is that the
   * driver simply was not stopping today — which is what `JUST_PASSING` means,
   * and it should be the most common entry in the panel by a wide margin.
   */
  private dominantReason(): number {
    let worst = 1;
    let reason = REASON_JUST_PASSING;
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.factors.length; i++) {
      const factor = this.factors[i];
      if (factor === undefined) continue;
      if (factor.value < worst) {
        worst = factor.value;
        reason = factor.reason;
      }
    }
    return reason;
  }

  /** Customers a passing driver can see waiting. */
  private visibleQueueLength(world: World): number {
    let count = 0;
    const customers = world.customers;
    for (let slot = 0; slot < customers.capacity; slot++) {
      if (!customers.isActive(slot)) continue;
      if (customers.at(slot).queueIndex >= 0) count++;
    }
    return count;
  }
}

export function visibilityAt(hour: number): number {
  const isDay = hour >= VISIBILITY.dawnHour && hour < VISIBILITY.duskHour;
  return isDay ? VISIBILITY.day : VISIBILITY.night;
}

export function queuePenalty(queueLength: number): number {
  const excess = Math.max(0, queueLength - QUEUE_PENALTY.freeLength);
  return Math.max(QUEUE_PENALTY.floor, 1 - excess * QUEUE_PENALTY.perCustomer);
}

/** ECONOMY_DESIGN §7, Fren 4 — reproduced exactly. */
export function spilloverPenalty(queueLength: number, queueCapacity: number): number {
  if (queueLength <= queueCapacity) return 1;
  const overflow = queueLength - queueCapacity;
  return Math.max(SPILLOVER_PENALTY.floor, 1 - overflow * SPILLOVER_PENALTY.perOverflowCustomer);
}

/** ECONOMY_DESIGN §9 — reputation 0..100 to a 0.60..1.40 multiplier. */
export function reputationFactor(reputation: number): number {
  const clamped = Math.min(100, Math.max(0, reputation));
  return REPUTATION_FACTOR.base + clamped * REPUTATION_FACTOR.perPoint;
}

export function timeOfDayFit(hour: number): number {
  const bucket = Math.floor(((hour % 24) + 24) % 24);
  return atIn(TIME_OF_DAY_FIT, bucket, 1);
}

/**
 * Recent conversions of the same archetype make the stand slightly less novel.
 *
 * Read off the live customer population rather than a remembered history,
 * because the population *is* the recent history at these timescales and a
 * separate ring buffer would be one more thing to persist, hash and migrate for
 * a factor that moves the result by at most a quarter.
 */
export function noveltyDecay(world: World, archetype: number): number {
  let sameArchetype = 0;
  const customers = world.customers;
  for (let slot = 0; slot < customers.capacity; slot++) {
    if (!customers.isActive(slot)) continue;
    if (customers.at(slot).archetype === archetype) sameArchetype++;
  }
  const counted = Math.min(sameArchetype, NOVELTY_DECAY.window);
  return Math.max(NOVELTY_DECAY.floor, 1 - counted * NOVELTY_DECAY.perConversion);
}
