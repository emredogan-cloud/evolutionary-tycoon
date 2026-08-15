import {
  ARCHETYPE_PATIENCE,
  ARRIVAL_EPSILON_METRES,
  DOOR_OPEN_SECONDS,
  PATIENCE_SECONDS,
  WALK_SPEED_METRES_PER_SECOND,
} from '@config/customer';
import { REASON_NO_PARKING, REASON_QUEUE_TOO_LONG } from '@config/conversion';
import type { StageLayout } from '@config/layouts/stage1';
import {
  abandonTargetFor,
  canTransition,
  customerStateName,
  STATE_ABANDONING,
  STATE_EXITING,
  STATE_GONE,
  STATE_LEAVING_ANGRY,
  STATE_REJOINING_ROAD,
  STATE_LEAVING_VEHICLE,
  STATE_QUEUEING_AT_COUNTER,
  STATE_SEEKING_PARKING,
  STATE_WALKING_TO_CAR,
  STATE_WALKING_TO_DOOR,
  customerStateSpec,
} from '../ai/fsm/customerFsm';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { CustomerRecord } from '../stores/customers';
import { atIn } from '../math/typedArray';
import type { VehicleManeuverSystem } from './VehicleManeuverSystem';

/**
 * The customer state machine, running.
 *
 * The graph itself lives in `src/sim/ai/fsm/customerFsm.ts` as data, and this
 * system is only the part that cannot be pure: timers, positions, and the
 * handoffs to the vehicle. Every move goes through `transition`, which refuses
 * an edge the graph does not declare — so the tested shape and the running
 * behaviour cannot drift apart, which is the usual way a state machine rots.
 *
 * ## Walking is a straight line, for now
 *
 * A customer moves directly towards `targetX/targetY` at walking pace. Phase 7
 * replaces the *direction* with a flow-field lookup and adds separation; the
 * speed, the arrival test and every state around it stay exactly as they are.
 * Stage 1's car park is an open rectangle with nothing to walk into, so the
 * straight line and the flow field agree on it today — which is why this is a
 * placeholder that looks right rather than one that has to look wrong.
 */
export class CustomerFsmSystem implements SimSystem {
  readonly name = 'CustomerFsmSystem' as const;

  constructor(
    private readonly layout: StageLayout,
    private readonly maneuvers: VehicleManeuverSystem,
  ) {}

  run(world: World, deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (seconds <= 0) return;

    const customers = world.customers;
    for (let slot = 0; slot < customers.capacity; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      // Authored scene actors are scenery in a gameplay pool — see `staged`.
      if (customer.staged === 1) continue;

      this.tickPatience(world, customer, deltaMs);
      this.advanceState(world, customer, slot, deltaMs);
      if (customer.visible === 1) this.walk(customer, seconds);
    }
  }

  /**
   * Patience runs only in states the graph marks as waiting.
   *
   * Not while walking: someone crossing a car park is making progress, and a
   * countdown there would strand them mid-stride for reasons the player cannot
   * see. The graph is what decides, so adding a waiting state in a later phase
   * gets a patience timer automatically and gets it tested automatically.
   */
  private tickPatience(world: World, customer: CustomerRecord, deltaMs: number): void {
    const spec = customerStateSpec(customer.state);
    if (!spec.waiting) return;

    customer.patienceMs -= deltaMs;
    if (customer.patienceMs > 0) return;

    customer.patienceMs = 0;
    world.stats.customersAbandoned++;
    /*
     * The reason is recorded here, where the state that ran out is still known.
     * By the time the customer actually drives off they are several states
     * away from whatever disappointed them.
     */
    customer.reason = customer.state === STATE_SEEKING_PARKING ? REASON_NO_PARKING : REASON_QUEUE_TOO_LONG;
    const target = abandonTargetFor(customer.state);
    this.transition(customer, STATE_ABANDONING);
    this.transition(customer, target);
    customer.queueIndex = -1;
    if (target === STATE_WALKING_TO_CAR) this.aimAtOwnCar(customer);
  }

  private advanceState(world: World, customer: CustomerRecord, slot: number, deltaMs: number): void {
    switch (customer.state) {
      case STATE_SEEKING_PARKING:
        // Held by the manoeuvre system until a bay is assigned; patience above
        // is what stops it being held forever.
        break;

      case STATE_LEAVING_VEHICLE:
        this.openDoor(customer, deltaMs);
        break;

      case STATE_WALKING_TO_DOOR:
        if (this.hasArrived(customer)) {
          this.transition(customer, STATE_QUEUEING_AT_COUNTER);
          this.beginPatience(customer, PATIENCE_SECONDS.queueingAtCounter);
        }
        break;

      case STATE_QUEUEING_AT_COUNTER:
        /*
         * Phase 6 stops here. Nothing serves food yet, so the only way out of
         * the queue is patience — which is the specified Phase 6 end state, not
         * an oversight. Phase 8 adds the ORDERING edge beside the abandon one.
         */
        break;

      case STATE_WALKING_TO_CAR:
        if (this.hasArrived(customer)) {
          this.transition(customer, STATE_LEAVING_ANGRY);
          customer.visible = 0;
        }
        break;

      case STATE_LEAVING_ANGRY:
        this.leave(world, customer, slot);
        break;

      case STATE_GONE:
        this.release(world, customer, slot);
        break;

      default:
        // ENTERING, PARKING, EXITING, REJOINING_ROAD, NO_SPACE, ABANDONING are
        // driven by the manoeuvre system or are transient.
        break;
    }
  }

  /**
   * The pause between the car stopping and someone appearing beside it.
   *
   * Short, and load-bearing: without it the customer materialises next to a car
   * that is still settling, and the eye reads that as a spawn rather than as a
   * door opening. "No teleporting" (GAME_DESIGN_DOCUMENT §8) covers appearing
   * as much as it covers moving.
   */
  private openDoor(customer: CustomerRecord, deltaMs: number): void {
    customer.timerMs += deltaMs;
    if (customer.timerMs < DOOR_OPEN_SECONDS * 1000) return;

    customer.timerMs = 0;
    const bay = this.layout.parking[customer.parkingSlot];
    if (bay !== undefined) {
      customer.x = bay.door.x;
      customer.y = bay.door.y;
    }
    customer.visible = 1;
    this.transition(customer, STATE_WALKING_TO_DOOR);

    /*
     * Aimed at the counter until `QueueSystem` hands out a place — it runs one
     * slot later in the tick order, so for exactly one tick this is the only
     * target there is, and a customer with none would stand in the bay.
     */
    customer.targetX = this.layout.counter.x;
    customer.targetY = this.layout.counter.y - 1;
  }

  /** Hand the vehicle back to the manoeuvre system and drive out. */
  private leave(world: World, customer: CustomerRecord, slot: number): void {
    const vehicleSlot = customer.vehicleSlot;
    customer.queueIndex = -1;
    customer.visible = 0;

    const dwellMs = world.clock.simTimeMs - customer.arrivedAtMs;
    world.eventQueue.emitCustomerLeftAngry(customer.entityId, customer.reason, dwellMs);

    this.transition(customer, STATE_EXITING);

    if (vehicleSlot < 0 || !world.vehicles.isActive(vehicleSlot)) {
      /*
       * The car is already gone — reachable only if the vehicle pool recycled
       * the slot underneath them. Walked through the remaining edges rather
       * than assigned, so the graph stays the only description of what order
       * states happen in.
       */
      this.transition(customer, STATE_REJOINING_ROAD);
      this.transition(customer, STATE_GONE);
      this.release(world, customer, slot);
      return;
    }

    this.maneuvers.beginExit(world, vehicleSlot, Math.max(0, customer.parkingSlot));
  }

  private release(world: World, customer: CustomerRecord, slot: number): void {
    const vehicleSlot = customer.vehicleSlot;
    if (vehicleSlot >= 0 && world.vehicles.isActive(vehicleSlot)) {
      world.vehicles.customerSlot[vehicleSlot] = -1;
    }
    world.customers.release(slot);
  }

  private aimAtOwnCar(customer: CustomerRecord): void {
    const bay = this.layout.parking[customer.parkingSlot];
    if (bay === undefined) {
      customer.targetX = customer.x;
      customer.targetY = customer.y;
      return;
    }
    customer.targetX = bay.door.x;
    customer.targetY = bay.door.y;
  }

  private beginPatience(customer: CustomerRecord, baseSeconds: number): void {
    const multiplier = atIn(ARCHETYPE_PATIENCE, customer.archetype, 1);
    customer.patienceMaxMs = baseSeconds * 1000 * multiplier;
    customer.patienceMs = customer.patienceMaxMs;
  }

  private hasArrived(customer: CustomerRecord): boolean {
    const dx = customer.targetX - customer.x;
    const dy = customer.targetY - customer.y;
    return dx * dx + dy * dy <= ARRIVAL_EPSILON_METRES * ARRIVAL_EPSILON_METRES;
  }

  /**
   * One step towards the target.
   *
   * Clamped to the remaining distance so a customer never oscillates around a
   * target they can cross in a single tick — at 20 Hz a step is 6.75 cm, which
   * is smaller than the arrival epsilon, but that stops being true the moment
   * anything runs at a lower tick rate.
   */
  private walk(customer: CustomerRecord, seconds: number): void {
    const dx = customer.targetX - customer.x;
    const dy = customer.targetY - customer.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 1e-6) return;

    const step = Math.min(distance, WALK_SPEED_METRES_PER_SECOND * seconds);
    customer.x += (dx / distance) * step;
    customer.y += (dy / distance) * step;
    customer.headingX = dx / distance;
    customer.headingY = dy / distance;
  }

  /**
   * Move, or refuse loudly.
   *
   * An undeclared edge is a programming error, not a runtime condition, and it
   * is one that would otherwise show up as a customer quietly stuck in a state
   * nobody meant them to reach. Failing here names both states.
   */
  private transition(customer: CustomerRecord, to: number): void {
    if (!canTransition(customer.state, to)) {
      throw new RangeError(
        `Customer ${customer.entityId}: ${customerStateName(customer.state)} has no ` +
          `transition to ${customerStateName(to)}`,
      );
    }
    customer.state = to;
  }
}
