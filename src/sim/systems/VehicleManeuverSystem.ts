import { ARCHETYPE_SPECS } from '@config/archetypes';
import {
  MANEUVER_SPEED_METRES_PER_SECOND,
  REJOIN_GAP_METRES,
  REJOIN_MAX_WAIT_SECONDS,
} from '@config/customer';
import { REASON_NO_PARKING } from '@config/conversion';
import type { StageLayout } from '@config/layouts/stage1';
import {
  STATE_EXITING,
  STATE_GONE,
  STATE_LEAVING_ANGRY,
  STATE_LEAVING_VEHICLE,
  STATE_NO_SPACE,
  STATE_PARKING,
  STATE_REJOINING_ROAD,
  STATE_SEEKING_PARKING,
} from '../ai/fsm/customerFsm';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import { at } from '../math/typedArray';
import type { LaneGraph } from '../nav/LaneGraph';
import type { ManeuverTable } from '../nav/maneuvers';
import type { LaneSample } from '../nav/spline';

/**
 * Moving a converted vehicle off the road, into a bay, and back out again.
 *
 * The vehicle's position stops being "distance along a lane" and becomes
 * "distance along a manoeuvre spline" for the duration. Both are arc-length
 * parameterised, so the handover is a change of curve and not a change of
 * model — and constant speed stays constant through the turn, which is the
 * thing that separates a car parking from a car being dragged.
 *
 * ## Vehicle lifecycle states
 *
 * `VehicleStore.state` carries the lifecycle; braking is *not* in it, because
 * braking is derived from `accel` every tick and a vehicle can be braking in
 * any of these.
 *
 * The customer's state machine is the authority on what happens next, and this
 * system is its hands: it reads the customer's state, moves the metal, and
 * reports arrival back. Splitting it the other way — the vehicle deciding and
 * the customer following — would put the same decision in two places the moment
 * Phase 11 adds a drive-thru, where the customer never leaves the car at all.
 */

export const VEHICLE_ON_ROAD = 0;
export const VEHICLE_ENTERING = 1;
export const VEHICLE_PARKED = 2;
export const VEHICLE_EXITING = 3;

export class VehicleManeuverSystem implements SimSystem {
  readonly name = 'VehicleManeuverSystem' as const;

  /** Reused by every sample; the manoeuvre path never allocates. */
  private readonly sample: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };

  constructor(
    private readonly lanes: LaneGraph,
    private readonly maneuvers: ManeuverTable,
    private readonly layout: StageLayout,
  ) {}

  run(world: World, deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (seconds <= 0) return;

    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;

      switch (at(vehicles.state, slot)) {
        case VEHICLE_ON_ROAD:
          this.considerHandover(world, slot);
          break;
        case VEHICLE_ENTERING:
          this.advanceEntry(world, slot, seconds);
          break;
        case VEHICLE_EXITING:
          this.advanceExit(world, slot, seconds);
          break;
        default:
          // Parked: nothing moves until the customer's machine says so.
          break;
      }
    }
  }

  /**
   * A committed vehicle reaching the mouth of the car park leaves the lane.
   *
   * Bay assignment happens here rather than at the decision point, and the
   * difference is visible: assigning 14 m out would hand a bay to a car that
   * has not turned in yet, holding it against everyone already on the apron.
   * Deciding at the entrance means the answer reflects the car park as it
   * actually is when the driver looks at it.
   */
  private considerHandover(world: World, slot: number): void {
    const vehicles = world.vehicles;
    const customerSlot = at(vehicles.customerSlot, slot);
    if (customerSlot < 0) return;
    if (!world.customers.isActive(customerSlot)) return;

    const laneIndex = at(vehicles.lane, slot);
    if (laneIndex >= this.lanes.laneCount) return;
    const lane = this.lanes.lane(laneIndex);
    if (at(vehicles.laneS, slot) < lane.entryS) return;

    const customer = world.customers.at(customerSlot);
    const bay = this.nearestFreeBay(world, at(vehicles.laneS, slot), laneIndex);

    vehicles.state[slot] = VEHICLE_ENTERING;
    vehicles.maneuverS[slot] = 0;
    vehicles.parkingSlot[slot] = bay;

    if (bay < 0) {
      /*
       * Committed, turned in, and there is nowhere to stop. The car still leaves
       * the road — it is already braking for the turn — and takes the
       * pass-through route across the apron and straight back out. That is the
       * designed moment: the player has to *see* the cost of under-building, and
       * a car that simply carried on down the road would be indistinguishable
       * from one that never wanted to stop.
       *
       * `parkingSlot` stays -1 so this car reserves nothing on its way through.
       */
      customer.state = STATE_NO_SPACE;
      customer.parkingSlot = -1;
      customer.reason = REASON_NO_PARKING;
      world.stats.turnedAwayNoParking++;
      world.stats.failureReasons[REASON_NO_PARKING] =
        (world.stats.failureReasons[REASON_NO_PARKING] ?? 0) + 1;
      return;
    }

    customer.state = STATE_SEEKING_PARKING;
    customer.parkingSlot = bay;
  }

  private advanceEntry(world: World, slot: number, seconds: number): void {
    const vehicles = world.vehicles;
    const laneIndex = at(vehicles.lane, slot);
    const bay = at(vehicles.parkingSlot, slot);
    if (laneIndex >= this.lanes.laneCount) return;

    const maneuver = this.maneuvers.setFor(laneIndex, bay).entry;
    const advanced = at(vehicles.maneuverS, slot) + MANEUVER_SPEED_METRES_PER_SECOND * seconds;
    const customerSlot = at(vehicles.customerSlot, slot);

    if (advanced >= maneuver.length && bay < 0) {
      // Drove the length of the apron and never stopped. Straight back out.
      vehicles.maneuverS[slot] = maneuver.length;
      this.carryCustomer(world, slot, maneuver.path);
      vehicles.state[slot] = VEHICLE_EXITING;
      vehicles.maneuverS[slot] = 0;
      if (customerSlot >= 0 && world.customers.isActive(customerSlot)) {
        world.customers.at(customerSlot).state = STATE_LEAVING_ANGRY;
      }
      return;
    }

    if (advanced >= maneuver.length) {
      vehicles.maneuverS[slot] = maneuver.length;
      vehicles.speed[slot] = 0;
      vehicles.state[slot] = VEHICLE_PARKED;
      world.eventQueue.emitVehicleParked(at(vehicles.entityId, slot), bay);
      if (customerSlot >= 0 && world.customers.isActive(customerSlot)) {
        world.customers.at(customerSlot).state = STATE_LEAVING_VEHICLE;
      }
    } else {
      vehicles.maneuverS[slot] = advanced;
      vehicles.speed[slot] = MANEUVER_SPEED_METRES_PER_SECOND;
      if (customerSlot >= 0 && world.customers.isActive(customerSlot)) {
        const customer = world.customers.at(customerSlot);
        if (customer.state === STATE_SEEKING_PARKING) customer.state = STATE_PARKING;
      }
    }

    /*
     * The customer rides along. Their position has to track the car rather than
     * being left where they converted, or the moment they become visible they
     * appear to jump from the road to the bay.
     */
    this.carryCustomer(world, slot, maneuver.path);
  }

  private advanceExit(world: World, slot: number, seconds: number): void {
    const vehicles = world.vehicles;
    const laneIndex = at(vehicles.lane, slot);
    const bay = at(vehicles.parkingSlot, slot);
    if (laneIndex >= this.lanes.laneCount) return;

    const maneuver = this.maneuvers.setFor(laneIndex, bay).exit;
    const advanced = at(vehicles.maneuverS, slot) + MANEUVER_SPEED_METRES_PER_SECOND * seconds;

    if (advanced < maneuver.length) {
      vehicles.maneuverS[slot] = advanced;
      vehicles.speed[slot] = MANEUVER_SPEED_METRES_PER_SECOND;
      this.carryCustomer(world, slot, maneuver.path);
      return;
    }

    vehicles.maneuverS[slot] = maneuver.length;
    this.carryCustomer(world, slot, maneuver.path);

    const customerSlot = at(vehicles.customerSlot, slot);
    const customer =
      customerSlot >= 0 && world.customers.isActive(customerSlot) ? world.customers.at(customerSlot) : null;
    if (customer !== null && customer.state === STATE_EXITING) {
      customer.state = STATE_REJOINING_ROAD;
    }

    /*
     * Wait for a gap before merging. Without this the car reappears on the lane
     * on top of whatever was passing, and the follower model resolves the
     * overlap with a brake hard enough to send a shock wave back up the road —
     * a vehicle that left the car park would look like an accident.
     */
    const lane = this.lanes.lane(laneIndex);
    const waited = at(vehicles.waitMs, slot);
    if (!this.rejoinClear(world, laneIndex, lane.rejoinS) && waited < REJOIN_MAX_WAIT_SECONDS * 1000) {
      vehicles.waitMs[slot] = waited + seconds * 1000;
      vehicles.speed[slot] = 0;
      return;
    }
    vehicles.waitMs[slot] = 0;

    vehicles.state[slot] = VEHICLE_ON_ROAD;
    vehicles.laneS[slot] = lane.rejoinS;
    vehicles.maneuverS[slot] = 0;
    vehicles.speed[slot] = MANEUVER_SPEED_METRES_PER_SECOND;
    vehicles.parkingSlot[slot] = -1;

    if (customer !== null) {
      customer.state = STATE_GONE;
      customer.visible = 0;
    }
  }

  /** Put the customer wherever their car currently is. */
  private carryCustomer(
    world: World,
    slot: number,
    path: { sample: (s: number, out: LaneSample) => LaneSample },
  ): void {
    const vehicles = world.vehicles;
    const customerSlot = at(vehicles.customerSlot, slot);
    if (customerSlot < 0 || !world.customers.isActive(customerSlot)) return;

    const customer = world.customers.at(customerSlot);
    if (customer.visible === 1) return;

    path.sample(at(vehicles.maneuverS, slot), this.sample);
    customer.x = this.sample.x;
    customer.y = this.sample.y;
    customer.headingX = this.sample.tangentX;
    customer.headingY = this.sample.tangentY;
  }

  /**
   * Start the exit manoeuvre from wherever the vehicle currently is.
   *
   * Used both by a customer who has given up and by one who was never let in.
   */
  beginExit(world: World, slot: number, bay: number): void {
    const vehicles = world.vehicles;
    vehicles.parkingSlot[slot] = bay;
    vehicles.state[slot] = VEHICLE_EXITING;
    vehicles.maneuverS[slot] = 0;
  }

  /**
   * Nearest free bay, with a deterministic tie-break on bay index.
   *
   * "Nearest" is measured from the bay to the point the car will enter from,
   * which is a fixed point per lane — so the answer depends on the car park and
   * the direction of approach, and on nothing that varies within a tick. Two
   * bays exactly equidistant resolve to the lower index, which is arbitrary but
   * *fixed*, and that is the whole requirement: a tie broken by iteration order
   * would be stable on one engine and not on another.
   */
  private nearestFreeBay(world: World, _laneS: number, laneIndex: number): number {
    const lane = this.lanes.lane(laneIndex);
    lane.path.sample(lane.entryS, this.sample);
    const fromX = this.sample.x;
    const fromY = this.sample.y;

    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let bay = 0; bay < this.layout.parking.length; bay++) {
      if (this.bayOccupied(world, bay)) continue;
      const slot = this.layout.parking[bay];
      if (slot === undefined) continue;
      const distance = (slot.x - fromX) ** 2 + (slot.y - fromY) ** 2;
      // Strictly less than, so an exact tie keeps the lower index.
      if (distance < bestDistance) {
        bestDistance = distance;
        best = bay;
      }
    }
    return best;
  }

  /**
   * Reserved from the moment a car turns in until it pulls out again.
   *
   * An exiting car still counts: it is physically in the bay for the first
   * metres of its manoeuvre, and handing the space to someone else that early
   * puts two cars in one bay for a second or two. A pass-through car never
   * counts — its `parkingSlot` is -1 precisely so that it cannot.
   */
  private bayOccupied(world: World, bay: number): boolean {
    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if (at(vehicles.state, slot) === VEHICLE_ON_ROAD) continue;
      if (at(vehicles.parkingSlot, slot) === bay) return true;
    }
    return false;
  }

  /** True when nothing on the lane is within a car's length of the merge point. */
  private rejoinClear(world: World, laneIndex: number, rejoinS: number): boolean {
    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if (at(vehicles.state, slot) !== VEHICLE_ON_ROAD) continue;
      if (at(vehicles.lane, slot) !== laneIndex) continue;

      const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
      const length = spec?.lengthMetres ?? 4.5;
      const delta = at(vehicles.laneS, slot) - rejoinS;
      // Behind by less than the gap, or ahead by less than its own length.
      if (delta <= 0 && delta > -REJOIN_GAP_METRES) return false;
      if (delta > 0 && delta < length) return false;
    }
    return true;
  }

  /** Where a vehicle is in world space, whichever curve it is currently on. */
  positionOf(world: World, slot: number, out: LaneSample): LaneSample {
    const vehicles = world.vehicles;
    const state = at(vehicles.state, slot);
    const laneIndex = at(vehicles.lane, slot);
    const bay = at(vehicles.parkingSlot, slot);

    if (state === VEHICLE_ON_ROAD || laneIndex >= this.lanes.laneCount) {
      return this.lanes.sample(laneIndex, at(vehicles.laneS, slot), out);
    }

    const set = this.maneuvers.setFor(laneIndex, bay);
    const path = state === VEHICLE_EXITING ? set.exit.path : set.entry.path;
    return path.sample(at(vehicles.maneuverS, slot), out);
  }
}
