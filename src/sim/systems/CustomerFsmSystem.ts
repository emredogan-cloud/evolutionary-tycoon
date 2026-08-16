import { ARCHETYPE_PATIENCE, ARRIVAL_EPSILON_METRES, DOOR_OPEN_SECONDS } from '@config/customer';
import { REASON_NO_PARKING, REASON_QUEUE_TOO_LONG } from '@config/conversion';
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
import { DRIVE_THRU_PATIENCE_SCALE } from '@config/driveThru';
import { layoutForStage } from '@config/layouts';
import { CHANNEL_DRIVE_THRU } from '../ai/fsm/driveThruFsm';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { CustomerRecord } from '../stores/customers';
import { atIn } from '../math/typedArray';
import { discardOrdersFor } from './ServiceSystem';
import { VEHICLE_EXITING } from './VehicleManeuverSystem';
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
 * ## Movement is not here
 *
 * Phase 6 walked customers towards their target from inside this system. Phase 7
 * moved that to `NavigationSystem`, which runs one pipeline slot earlier and
 * steers by flow field. What is left here decides *where* a customer is going
 * and *when* they have arrived; how they get there is somebody else's problem,
 * and the split is what let the direction source change without touching a
 * single state.
 */
export class CustomerFsmSystem implements SimSystem {
  readonly name = 'CustomerFsmSystem' as const;

  /** No captured layout — see `ConversionSystem`'s constructor for why. */
  constructor(private readonly maneuvers: VehicleManeuverSystem) {}

  run(world: World, deltaMs: number): void {
    if (deltaMs <= 0) return;

    const customers = world.customers;
    // See `ConversionSystem.run` for why the empty case is short-circuited.
    if (customers.activeCount === 0) return;

    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      // Authored scene actors are scenery in a gameplay pool — see `staged`.
      if (customer.staged === 1) continue;

      this.tickPatience(world, customer, deltaMs);
      this.advanceState(world, customer, slot, deltaMs);
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
    if (spec.patienceSeconds === null) return;

    /*
     * Started here, from the state's own declaration, rather than at each site
     * that enters a waiting state. Doing it per site is how `SEEKING_PARKING`
     * ended up with a patience of zero and every customer abandoned on arrival;
     * this way a waiting state added in a later phase gets its clock without
     * anybody remembering to wire one up.
     */
    if (customer.patienceMaxMs <= 0) this.beginPatience(customer, spec.patienceSeconds);

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
    if (target === STATE_WALKING_TO_CAR) this.aimAtOwnCar(world, customer);
  }

  private advanceState(world: World, customer: CustomerRecord, slot: number, deltaMs: number): void {
    switch (customer.state) {
      case STATE_SEEKING_PARKING:
        // Held by the manoeuvre system until a bay is assigned; patience above
        // is what stops it being held forever.
        break;

      case STATE_LEAVING_VEHICLE:
        this.openDoor(world, customer, deltaMs);
        break;

      case STATE_WALKING_TO_DOOR:
        if (this.hasArrived(customer)) this.transition(customer, STATE_QUEUEING_AT_COUNTER);
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
  private openDoor(world: World, customer: CustomerRecord, deltaMs: number): void {
    customer.timerMs += deltaMs;
    if (customer.timerMs < DOOR_OPEN_SECONDS * 1000) return;

    customer.timerMs = 0;
    const bay = layoutForStage(world.progression.stage).parking[customer.parkingSlot];
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
    const layout = layoutForStage(world.progression.stage);
    customer.targetX = layout.counter.x;
    customer.targetY = layout.counter.y - 1;
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

    /*
     * The bay is passed through as it is, including -1.
     *
     * It used to be clamped with `Math.max(0, ...)`, which handed bay 0 to every
     * driver who had been turned away for having no bay at all — so bay 0 was
     * double-booked with a car that was only driving through it, and the car
     * park quietly lost a space. -1 already means "the pass-through route", and
     * `ManeuverTable.setFor` is the one place that decides what that means.
     *
     * And only if the exit has not already started: a turned-away car is put on
     * the exit curve by the manoeuvre system the moment it finishes crossing the
     * apron, and beginning it a second time would snap it back to the start.
     */
    if (world.vehicles.state[vehicleSlot] !== VEHICLE_EXITING) {
      this.maneuvers.beginExit(world, vehicleSlot, customer.parkingSlot);
    }
  }

  private release(world: World, customer: CustomerRecord, slot: number): void {
    const vehicleSlot = customer.vehicleSlot;
    if (vehicleSlot >= 0 && world.vehicles.isActive(vehicleSlot)) {
      world.vehicles.customerSlot[vehicleSlot] = -1;
    }
    /*
     * Their order goes with them. An order left behind holds its station and its
     * pool slot forever, and the pool fills — measured at thirty live orders
     * against four live customers, after which nobody could order at all and the
     * stand quietly stopped taking money.
     */
    discardOrdersFor(world, slot);
    world.customers.release(slot);
  }

  private aimAtOwnCar(world: World, customer: CustomerRecord): void {
    const bay = layoutForStage(world.progression.stage).parking[customer.parkingSlot];
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
    /*
     * **The drive-thru asymmetry, applied here and only here** — Phase 11.
     *
     * GAME_EXECUTION_ROADMAP: "Patience here is far lower than seated: the
     * customer is in a car with an engine running." Scaling in `beginPatience`
     * rather than authoring a second set of `patienceSeconds` means every
     * waiting state a drive-thru customer can ever enter inherits it, including
     * ones added later — the same reasoning that put the patience clock on the
     * state declaration in Phase 6 rather than at each call site.
     */
    const channelScale = customer.channel === CHANNEL_DRIVE_THRU ? DRIVE_THRU_PATIENCE_SCALE : 1;
    customer.patienceMaxMs = baseSeconds * 1000 * multiplier * channelScale;
    customer.patienceMs = customer.patienceMaxMs;
  }

  private hasArrived(customer: CustomerRecord): boolean {
    const dx = customer.targetX - customer.x;
    const dy = customer.targetY - customer.y;
    return dx * dx + dy * dy <= ARRIVAL_EPSILON_METRES * ARRIVAL_EPSILON_METRES;
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
    /*
     * Leaving a state clears its clock, so the next waiting state starts a fresh
     * one rather than inheriting whatever was left of the last.
     */
    customer.patienceMs = 0;
    customer.patienceMaxMs = 0;
    customer.state = to;
  }
}
