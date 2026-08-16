import { DRIVE_THRU_ADVANCE_MPS } from '@config/driveThru';
import { layoutForStage } from '@config/layouts';
import {
  CHANNEL_COUNTER,
  CHANNEL_DRIVE_THRU,
  STATE_DT_APPROACHING,
  STATE_DT_ORDERING,
} from '../ai/fsm/driveThruFsm';
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
import { maneuverTableFor } from '../nav/maneuverTables';
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

/**
 * Bumper clearance either side of a merging car, metres.
 *
 * Small: it is the difference between "merged" and "inside the car in front",
 * not a comfort margin. That one is `REJOIN_GAP_METRES` and it is negotiable.
 */
const MERGE_CLEARANCE_METRES = 1;

/** Longest vehicle in the game, used as the merging car's own footprint. */
const MERGING_CAR_LENGTH_METRES = 5.4;

export const VEHICLE_ON_ROAD = 0;
export const VEHICLE_ENTERING = 1;
export const VEHICLE_PARKED = 2;
export const VEHICLE_EXITING = 3;
/**
 * Creeping forward one drive-thru slot — Phase 11.
 *
 * Its own state because it is the one movement in the game that is neither on a
 * lane nor on an entry/exit curve: a short straight path between two lane slots,
 * run at a crawl. Reusing `VEHICLE_ENTERING` would have meant `positionOf`
 * sampling the entry curve, which starts at the road — so a car advancing one
 * metre would have snapped back to the kerb first.
 */
export const VEHICLE_DT_ADVANCING = 4;

export class VehicleManeuverSystem implements SimSystem {
  readonly name = 'VehicleManeuverSystem' as const;

  /** Reused by every sample; the manoeuvre path never allocates. */
  private readonly sample: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };

  constructor(
    private readonly lanes: LaneGraph,
    private maneuvers: ManeuverTable,
    private readonly layout: StageLayout,
  ) {}

  /**
   * The stage the current manoeuvre table was built for.
   *
   * Rebuilt on evolution, exactly like the flow-field cache — and for the same
   * reason, discovered the same way. A table built for Stage 1 answers "bay 9"
   * with a `RangeError` the moment Stage 4's drive-thru assigns a lane slot,
   * and `tests/unit/sim/traffic/limits.test.ts` — which sets the stage directly
   * — caught it within minutes of the drive-thru landing.
   */
  private tableStage = 1;

  run(world: World, deltaMs: number): void {
    this.syncStage(world);
    const seconds = deltaMs / 1000;
    if (seconds <= 0) return;

    const vehicles = world.vehicles;
    // See `ConversionSystem.run` for why the empty case is short-circuited.
    if (vehicles.activeCount === 0) return;

    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
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
        case VEHICLE_DT_ADVANCING:
          this.advanceLane(world, slot, seconds);
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
  /** Rebuild the manoeuvre table when the stage changes. */
  private syncStage(world: World): void {
    const stage = world.progression.stage;
    if (stage === this.tableStage) return;
    this.tableStage = stage;
    this.maneuvers = maneuverTableFor(stage);
  }

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

    /*
     * The drive-thru is chosen at conversion, so by the time a car turns in it
     * already knows which channel it wants. A lane slot is assigned exactly as a
     * parking bay is — same manoeuvre, same reservation, same "there was nowhere
     * to stop" fallback — because a lane slot *is* a bay as far as the
     * manoeuvre table is concerned (see `ManeuverTable.driveThruBay`).
     */
    if (customer.channel === CHANNEL_DRIVE_THRU) {
      const laneSlot = this.freeLaneSlot(world);
      if (laneSlot >= 0) {
        vehicles.state[slot] = VEHICLE_ENTERING;
        vehicles.maneuverS[slot] = 0;
        vehicles.parkingSlot[slot] = this.maneuvers.driveThruBay(laneSlot);
        customer.state = STATE_DT_APPROACHING;
        customer.laneSlot = laneSlot;
        customer.parkingSlot = -1;
        return;
      }
      /*
       * The lane is full. They fall through to the counter rather than being
       * turned away: a driver who finds the drive-thru backed up parks instead,
       * and modelling that as a lost customer would overstate the cost of a
       * busy lane. It is still a cost — they now have to find a bay.
       */
      customer.channel = CHANNEL_COUNTER;
    }

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
      /*
       * The reason is recorded, not announced. `CustomerFsmSystem` emits
       * `CUSTOMER_LEFT_ANGRY` once, when they actually drive off, with a real
       * dwell time — announcing it here as well produced two events for one
       * departure and a dwell time of zero for a car that had not moved yet.
       */
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
        const arrived = world.customers.at(customerSlot);
        /*
         * A drive-thru customer never gets out. They stop at the post and start
         * ordering through the window; `LEAVING_VEHICLE` would put them on foot
         * in a lane meant for cars.
         */
        arrived.state = arrived.channel === CHANNEL_DRIVE_THRU ? STATE_DT_ORDERING : STATE_LEAVING_VEHICLE;
        arrived.timerMs = 0;
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

  /**
   * Creep one lane slot forward.
   *
   * `maneuverS` runs along a straight two-point path, so the movement is
   * integrated exactly like every other movement in the game — no branch here
   * assigns a position. When it arrives the car is parked again, in its new
   * slot, and the manoeuvre index is updated so `positionOf` samples the right
   * curve from then on.
   */
  private advanceLane(world: World, slot: number, seconds: number): void {
    const vehicles = world.vehicles;
    const customerSlot = at(vehicles.customerSlot, slot);
    if (customerSlot < 0 || !world.customers.isActive(customerSlot)) {
      vehicles.state[slot] = VEHICLE_PARKED;
      return;
    }

    const customer = world.customers.at(customerSlot);
    const from = customer.laneSlot + 1;
    const path = this.maneuvers.advanceFrom(from);
    if (path === null) {
      vehicles.state[slot] = VEHICLE_PARKED;
      return;
    }

    const advanced = at(vehicles.maneuverS, slot) + DRIVE_THRU_ADVANCE_MPS * seconds;
    if (advanced >= path.length) {
      vehicles.speed[slot] = 0;
      vehicles.state[slot] = VEHICLE_PARKED;
      const bay = this.maneuvers.driveThruBay(customer.laneSlot);
      vehicles.parkingSlot[slot] = bay;
      /*
       * **Parked at the *end* of the new slot's entry curve, not at zero.**
       *
       * `positionOf` samples a parked car along its entry path, and a parked car
       * sits at the end of it. Leaving `maneuverS` at zero projected the car
       * back to the start of that curve — out on the road — an **8.5 m
       * teleport** every time a car crept forward one slot. Invisible in the
       * simulation, glaring on screen, and caught by the no-teleport test
       * measuring the *vehicle* rather than the customer record.
       */
      vehicles.maneuverS[slot] = this.maneuvers.setFor(at(vehicles.lane, slot), bay).entry.length;
      return;
    }

    vehicles.maneuverS[slot] = advanced;
    vehicles.speed[slot] = DRIVE_THRU_ADVANCE_MPS;
    path.sample(advanced, this.sample);
    customer.x = this.sample.x;
    customer.y = this.sample.y;
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
    /*
     * Two gaps, not one.
     *
     * A driver waits for a comfortable gap, and after long enough takes
     * whatever will physically fit. Waiting indefinitely for the comfortable one
     * is a deadlock at peak — cars accumulate at the mouth of the lot until
     * nothing can convert — but merging regardless is worse: it put a car two
     * metres inside the one it merged in front of, which the follower model then
     * resolved with a shock wave up the road.
     *
     * So the ceiling relaxes the requirement from "comfortable" to "does not
     * overlap", and never past it. The bay is already free by this point, so a
     * driver still waiting is not holding a space anyone else could use.
     */
    const lane = this.lanes.lane(laneIndex);
    const waited = at(vehicles.waitMs, slot);
    const patient = waited >= REJOIN_MAX_WAIT_SECONDS * 1000;
    const required = patient ? 0 : REJOIN_GAP_METRES;

    if (!this.rejoinClear(world, laneIndex, lane.rejoinS, required)) {
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
  /**
   * The furthest-back free lane slot, or -1.
   *
   * Furthest back rather than nearest the window, because a car joins the *end*
   * of a queue. Taking the first free slot would let a late arrival appear in
   * front of cars already waiting, which is the drive-thru equivalent of
   * teleporting.
   */
  private freeLaneSlot(world: World): number {
    const layout = layoutForStage(world.progression.stage);
    const driveThru = layout.driveThru;
    if (driveThru === null) return -1;

    for (let slot = driveThru.lane.length - 1; slot >= 0; slot--) {
      if (!this.laneSlotTaken(world, slot)) return slot;
    }
    return -1;
  }

  /** Is anybody sitting in this lane slot? */
  private laneSlotTaken(world: World, laneSlot: number): boolean {
    const customers = world.customers;
    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      if (customers.at(slot).laneSlot === laneSlot) return true;
    }
    return false;
  }

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
    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!vehicles.isActive(slot)) continue;
      const state = at(vehicles.state, slot);
      if (state === VEHICLE_ON_ROAD) continue;
      if (at(vehicles.parkingSlot, slot) !== bay) continue;

      /*
       * A car sitting at the end of its exit curve waiting for a gap is at the
       * lane edge, not in the bay — it still names the bay because that is how
       * it remembers which curve it is on. Counting it would let one driver
       * waiting for a gap hold a space nobody can use, which at peak is most of
       * the car park.
       */
      if (state === VEHICLE_EXITING && this.exitComplete(world, slot)) continue;
      return true;
    }
    return false;
  }

  /** True when this vehicle has driven the whole of its exit curve. */
  private exitComplete(world: World, slot: number): boolean {
    const vehicles = world.vehicles;
    const laneIndex = at(vehicles.lane, slot);
    if (laneIndex >= this.lanes.laneCount) return true;
    const exit = this.maneuvers.setFor(laneIndex, at(vehicles.parkingSlot, slot)).exit;
    return at(vehicles.maneuverS, slot) >= exit.length;
  }

  /**
   * Room to merge at `rejoinS`, with `comfort` metres of margin behind.
   *
   * The margin ahead is never negotiable — it is the leader's own length, and
   * below it the two cars are inside each other. `comfort` is what a patient
   * driver eventually gives up on.
   */
  private rejoinClear(world: World, laneIndex: number, rejoinS: number, comfort: number): boolean {
    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if (at(vehicles.state, slot) !== VEHICLE_ON_ROAD) continue;
      if (at(vehicles.lane, slot) !== laneIndex) continue;

      const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
      const length = spec?.lengthMetres ?? 4.5;
      const delta = at(vehicles.laneS, slot) - rejoinS;

      // Ahead of the merge point: the merging car must clear its back bumper.
      if (delta > 0 && delta < length + MERGE_CLEARANCE_METRES) return false;
      // Behind it: its front bumper, plus whatever comfort is being demanded.
      const behind = MERGING_CAR_LENGTH_METRES + MERGE_CLEARANCE_METRES + comfort;
      if (delta <= 0 && delta > -behind) return false;
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

    if (state === VEHICLE_DT_ADVANCING) {
      /*
       * Mid-creep between two lane slots. The path is the short straight one
       * from the slot behind, so it has to be looked up from the customer's
       * *current* slot plus one — the slot they are leaving.
       */
      const customerSlot = at(vehicles.customerSlot, slot);
      if (customerSlot >= 0 && world.customers.isActive(customerSlot)) {
        const path = this.maneuvers.advanceFrom(world.customers.at(customerSlot).laneSlot + 1);
        if (path !== null) return path.sample(at(vehicles.maneuverS, slot), out);
      }
    }

    const set = this.maneuvers.setFor(laneIndex, bay);
    const path = state === VEHICLE_EXITING ? set.exit.path : set.entry.path;
    return path.sample(at(vehicles.maneuverS, slot), out);
  }
}
