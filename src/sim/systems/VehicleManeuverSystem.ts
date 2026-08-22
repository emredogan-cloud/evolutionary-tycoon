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
import { recordOfflineTurnaway } from './offlineMeter';
import { at } from '../math/typedArray';
import type { LaneGraph, LaneProjection } from '../nav/LaneGraph';
import { LEFT_TURN } from '@config/traffic';
import { DECISION_YES } from '../stores/VehicleStore';
import type { ManeuverSet, ManeuverTable } from '../nav/maneuvers';
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

/** How far upstream of the mouth a holder still reads as "at the mouth". */
const HELD_TURNER_SLACK_METRES = 1.5;
/** Below this, a holder counts as standing. Matches the motion pin's floor. */
const HELD_TURNER_SPEED_EPSILON = 0.5;

/**
 * Separates "clamped exactly onto the hold line" from "advanced past it".
 * The hold branch writes `exitHoldS` verbatim, so an uncommitted waiter
 * compares equal and a committed car is at least one tick's travel beyond.
 */
const EXIT_COMMIT_EPSILON = 1e-6;

export class VehicleManeuverSystem implements SimSystem {
  readonly name = 'VehicleManeuverSystem' as const;

  /** Reused by every sample; the manoeuvre path never allocates. */
  private readonly sample: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };
  /** A second scratch, so `nearestOnExit` cannot clobber the one it is comparing against. */
  private readonly exitScratch: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };
  /** Scratch for lane-frame projections — see `LaneGraph.project`. */
  private readonly projection: LaneProjection = { along: 0, lateral: 0 };

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
          this.considerHandover(world, slot, deltaMs);
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

  private considerHandover(world: World, slot: number, deltaMs: number): void {
    const vehicles = world.vehicles;
    const customerSlot = at(vehicles.customerSlot, slot);
    if (customerSlot < 0) return;
    if (!world.customers.isActive(customerSlot)) return;

    const laneIndex = at(vehicles.lane, slot);
    if (laneIndex >= this.lanes.laneCount) return;
    const lane = this.lanes.lane(laneIndex);
    if (at(vehicles.laneS, slot) < lane.entryS) return;

    /*
     * The left turn — Phase 15. A far-lane pull-in crosses the near lane, and
     * a driver does not cross through traffic: they hold at the mouth until a
     * gap is acceptable. The comfort gap shrinks with the wait toward a floor
     * (same shape as the exit-merge), so the turn always eventually happens —
     * the jam GDD §9.1 wants both forms and clears. `waitMs` is reused from
     * the exit-merge: a car is never waiting for both at once.
     */
    if (lane.crossesOnEntry && world.progression.stage >= LEFT_TURN.earlyMinStage) {
      if (!this.oncomingClear(world, at(vehicles.waitMs, slot))) {
        vehicles.waitMs[slot] = at(vehicles.waitMs, slot) + deltaMs;
        return;
      }
      vehicles.waitMs[slot] = 0;
    }

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

    const bay = this.nearestFreeBay(world, at(vehicles.laneS, slot), laneIndex, slot);

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
      recordOfflineTurnaway(world);
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

  /*
   * The exit, since the stage-1 expansion pass, is three phases with the gap
   * decision in the middle rather than at the end:
   *
   *   drive to the hold line → wait there for the gap → committed sweep
   *
   * The old shape drove to the curve's END — physically on the lane at the
   * rejoin point — and waited there. While manoeuvring bodies were invisible
   * to followers that was merely the pass-through artefact the 20:34 review
   * captures show; the moment those bodies started casting lane shadows it
   * became a car blocking the exact lane whose gap it was waiting for, and
   * the road plugged itself solid (measured on this suite: 385 spawns where
   * 10 000 are expected, three exiters stacked on one rejoin point, and a
   * merger thrown four metres backwards through the queue by the overlap
   * clamp). The hold line (`ManeuverSet.exitHoldS`) sits one setback outside
   * every lane's shadow band — for these bays, in the bay itself, which is
   * where a parallel-parked driver genuinely waits with the indicator on.
   */
  private advanceExit(world: World, slot: number, seconds: number): void {
    const vehicles = world.vehicles;
    const laneIndex = at(vehicles.lane, slot);
    const bay = at(vehicles.parkingSlot, slot);
    if (laneIndex >= this.lanes.laneCount) return;

    const set = this.maneuvers.setFor(laneIndex, bay);
    const maneuver = set.exit;
    const current = at(vehicles.maneuverS, slot);
    const advanced = current + MANEUVER_SPEED_METRES_PER_SECOND * seconds;

    // Short of the hold line: drive toward it.
    if (advanced < set.exitHoldS) {
      vehicles.maneuverS[slot] = advanced;
      vehicles.speed[slot] = MANEUVER_SPEED_METRES_PER_SECOND;
      this.carryCustomer(world, slot, maneuver.path);
      return;
    }

    /*
     * At or past the hold line, the customer is a road-rejoiner as far as
     * their own state machine is concerned. Idempotent, and deliberately not
     * confined to the waiting branch: a drive-thru car can join its exit
     * curve past the hold line and must not skip the transition.
     */
    const customerSlot = at(vehicles.customerSlot, slot);
    const customer =
      customerSlot >= 0 && world.customers.isActive(customerSlot) ? world.customers.at(customerSlot) : null;
    if (customer !== null && customer.state === STATE_EXITING) {
      customer.state = STATE_REJOINING_ROAD;
    }

    if (current <= set.exitHoldS + EXIT_COMMIT_EPSILON) {
      /*
       * On the hold line and not yet committed: the gap decision.
       *
       * Two gaps, not one. A driver waits for a comfortable gap, and after
       * long enough takes whatever will physically fit. Waiting indefinitely
       * for the comfortable one is a deadlock at peak; merging regardless put
       * a car two metres inside the one it merged in front of. The ceiling
       * relaxes "comfortable" to "does not overlap", never past it.
       *
       * Exits also serialise per lane: every bay shares one rejoin point, so
       * a second commitment to the same gap would materialise inside the
       * first one's shadow.
       */
      const waited = at(vehicles.waitMs, slot);
      const patient = waited >= REJOIN_MAX_WAIT_SECONDS * 1000;
      const required = patient ? 0 : REJOIN_GAP_METRES;

      if (
        this.committedExiterOn(world, laneIndex, slot) ||
        !this.exitClaimFree(world, laneIndex, slot, set, required)
      ) {
        vehicles.maneuverS[slot] = set.exitHoldS;
        vehicles.waitMs[slot] = waited + seconds * 1000;
        vehicles.speed[slot] = 0;
        this.carryCustomer(world, slot, maneuver.path);
        return;
      }
      vehicles.waitMs[slot] = 0;
      // Falling through past the hold line IS the commitment: from here the
      // sweep crosses the shadow band and the lane shadow protects the merge.
    }

    if (advanced < maneuver.length) {
      vehicles.maneuverS[slot] = advanced;
      vehicles.speed[slot] = MANEUVER_SPEED_METRES_PER_SECOND;
      this.carryCustomer(world, slot, maneuver.path);
      return;
    }

    vehicles.maneuverS[slot] = maneuver.length;
    this.carryCustomer(world, slot, maneuver.path);

    /*
     * The car takes over exactly the road its own shadow was already
     * claiming, and no more.
     *
     * `laneS` on a manoeuvring slot is not stale bookkeeping: the motion
     * system writes the shadow's projected nose there every tick, so at the
     * end of the sweep it already holds this body's honest along-lane
     * position — usually a little downstream of the lane's nominal merge
     * point, because the sweep runs out past it. Materialising at the nominal
     * point instead put the car's REAR behind where the claim's rear had
     * been, i.e. into road the follower behind had legitimately closed up
     * into, and the two then deadlocked: the merger waited for the follower
     * to clear a space the follower could not leave, because the merger's own
     * shadow was what had stopped it (measured: an 11 m bus and a sedan
     * frozen for thirty simulated minutes, taking every later exit on that
     * lane down with them — 571 spawns where 10 000 are expected).
     *
     * Taking the further-downstream of the two makes the handover a no-op in
     * road terms — the same metal, the same metres — so nothing behind has to
     * move for it, and the check below only has to rule out rear-ending
     * something ahead.
     */
    const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
    const mergeAt = Math.max(set.rejoinS, at(vehicles.laneS, slot));
    if (!this.rejoinNoseFree(world, laneIndex, mergeAt, spec?.lengthMetres ?? 4.5)) {
      vehicles.speed[slot] = 0;
      return;
    }

    vehicles.state[slot] = VEHICLE_ON_ROAD;
    vehicles.laneS[slot] = mergeAt;
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
   * Used both by a customer who has given up and by one who was never let in —
   * and, since Phase 11, by a car leaving the **drive-thru lane**, which is what
   * made the naive version wrong.
   *
   * ## Why it does not simply set `maneuverS` to zero
   *
   * The exit path starts at the *bay*. A car that is in a bay is therefore at
   * arc length zero and the old one-liner was right for it. A car in the
   * drive-thru window is nowhere near that bay, so starting it at zero moved it
   * across the lot between two frames: measured, an **eleven-metre jump in a
   * fifty-millisecond tick**, caught by `driveThru.test.ts`'s no-teleport check
   * once Phase 12's balancing put enough cars through the lane to hit it.
   *
   * So the car's current position is sampled first and the exit is joined at the
   * nearest point on it. That is continuous for every caller by construction,
   * rather than for the callers somebody remembered.
   */
  beginExit(world: World, slot: number, bay: number): void {
    const vehicles = world.vehicles;
    this.positionOf(world, slot, this.sample);
    const fromX = this.sample.x;
    const fromY = this.sample.y;

    /*
     * A car in the drive-thru keeps its own curve.
     *
     * The caller passes the *customer's* parking slot, which for a drive-thru
     * customer is -1 — they never parked. The **vehicle** knows better: it was
     * given the lane slot's bay index when it entered (`driveThruBay`), and that
     * index has a real exit path leading back to the road. Overwriting it with
     * the customer's -1 routed a car at the window onto the pass-through curve
     * that starts beside the road, eleven metres away.
     *
     * `DriveThruSystem.collect` clears `customer.laneSlot` before this runs, on
     * purpose — the slot is freed early so the car behind creeps forward on the
     * same tick — so the customer cannot be asked either. The vehicle can.
     */
    const current = at(vehicles.parkingSlot, slot);
    const resolved = this.maneuvers.laneSlotOf(current) >= 0 ? current : bay;

    vehicles.parkingSlot[slot] = resolved;
    vehicles.state[slot] = VEHICLE_EXITING;
    vehicles.maneuverS[slot] = this.nearestOnExit(at(vehicles.lane, slot), resolved, fromX, fromY);
  }

  /**
   * Arc length along a bay's exit path closest to a world point.
   *
   * Coarse scan, then bisection. The coarse pass alone left a **1.3 m step** on
   * the drive-thru's long exit curve — a scan of thirty-two samples over an
   * eighty-metre path can only ever land within a metre or so, and a metre in a
   * fifty-millisecond tick is exactly the teleport this is here to remove.
   *
   * Twelve refinement rounds take that under a centimetre, which is well inside
   * the 5 cm the depth sorter treats as indistinguishable. It runs when a car
   * departs, not per tick, so the cost is irrelevant next to being right.
   */
  private nearestOnExit(laneIndex: number, bay: number, x: number, y: number): number {
    if (laneIndex >= this.lanes.laneCount) return 0;
    const path = this.maneuvers.setFor(laneIndex, bay).exit.path;

    const distanceAt = (s: number): number => {
      path.sample(s, this.exitScratch);
      return (this.exitScratch.x - x) ** 2 + (this.exitScratch.y - y) ** 2;
    };

    const steps = 32;
    let bestS = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= steps; i++) {
      const s = (path.length * i) / steps;
      const distance = distanceAt(s);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestS = s;
      }
    }

    // Bisect the bracket the coarse pass left, which is one step either side.
    let low = Math.max(0, bestS - path.length / steps);
    let high = Math.min(path.length, bestS + path.length / steps);
    for (let round = 0; round < 12; round++) {
      const third = (high - low) / 3;
      const left = low + third;
      const right = high - third;
      if (distanceAt(left) < distanceAt(right)) high = right;
      else low = left;
    }
    return (low + high) / 2;
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

  private nearestFreeBay(world: World, _laneS: number, laneIndex: number, vehicleSlot: number): number {
    const lane = this.lanes.lane(laneIndex);
    lane.path.sample(lane.entryS, this.sample);
    const fromX = this.sample.x;
    const fromY = this.sample.y;

    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let bay = 0; bay < this.layout.parking.length; bay++) {
      if (this.bayOccupied(world, bay)) continue;
      if (!this.baySpanFits(world, bay, vehicleSlot)) continue;
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
   * Would this vehicle's body fit at `bay` beside everything already parked?
   *
   * Bays are 5 m apart and vehicles are their real lengths — an 11 m tour bus
   * in a 5 m bay physically occupies its neighbours' tarmac, and the
   * 2026-08-22 captures show exactly what assigning those neighbours anyway
   * produced: parked bodies through one another. So a bay is only offered
   * when the candidate's half-length plus each same-row neighbour's
   * half-length fits inside their centre spacing. A bus therefore takes the
   * middle of a pair and its neighbours read as blocked — which is what a
   * bus parked across two spaces is. Capacity cost is real and intended;
   * the balance gate measures it.
   */
  private baySpanFits(world: World, bay: number, vehicleSlot: number): boolean {
    const candidate = this.layout.parking[bay];
    if (candidate === undefined) return false;
    const vehicles = world.vehicles;
    const ownLength = ARCHETYPE_SPECS[at(vehicles.archetype, vehicleSlot)]?.lengthMetres ?? 4.5;

    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (slot === vehicleSlot || !vehicles.isActive(slot)) continue;
      if (at(vehicles.state, slot) === VEHICLE_ON_ROAD) continue;
      const otherBay = at(vehicles.parkingSlot, slot);
      if (otherBay < 0 || otherBay === bay) continue;
      // Drive-thru lane slots space themselves; only real bays share a row.
      if (this.maneuvers.laneSlotOf(otherBay) >= 0) continue;
      const other = this.layout.parking[otherBay];
      if (other === undefined) continue;
      // Different rows cannot touch bumpers.
      if (Math.abs(other.y - candidate.y) > 2) continue;
      const otherLength = ARCHETYPE_SPECS[at(vehicles.archetype, slot)]?.lengthMetres ?? 4.5;
      if (Math.abs(other.x - candidate.x) < (ownLength + otherLength) / 2) return false;
    }
    return true;
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
       * A departing car holds its bay until it COMMITS to the merge — the
       * stage-1 expansion pass. The hold line sits in the bay for these
       * bays, so a driver waiting for a gap is physically in the space; the
       * old rule (free once the exit curve completes) dated from when the
       * wait happened at the lane edge, and under the new hold it would
       * assign a bay whose occupant is still sitting in it. Once committed
       * the body is genuinely gone from the bay and the space frees while
       * the sweep finishes.
       */
      if (state === VEHICLE_EXITING && this.exitCommitted(world, slot)) continue;
      return true;
    }
    return false;
  }

  /** True when this vehicle has driven the whole of its exit curve. */
  /**
   * True once a departing car has advanced past its hold line — the gap was
   * taken, the sweep is under way, and the body no longer stands in the bay.
   */
  private exitCommitted(world: World, slot: number): boolean {
    const vehicles = world.vehicles;
    const laneIndex = at(vehicles.lane, slot);
    if (laneIndex >= this.lanes.laneCount) return true;
    const set = this.maneuvers.setFor(laneIndex, at(vehicles.parkingSlot, slot));
    return at(vehicles.maneuverS, slot) > set.exitHoldS + EXIT_COMMIT_EPSILON;
  }

  /**
   * Is the road this departure is about to stand in free?
   *
   * The pull-out decision. A driver leaving a layby cannot check a gap at the
   * merge point and then drive slowly to it: the sweep takes four seconds at
   * manoeuvring speed while through traffic covers fifty metres, which is
   * more than the whole lane. Waiting for a gap that big is waiting forever —
   * measured, exactly that: exits starved and the road ran at 391 spawns
   * where 10 000 are expected. What actually happens on a road is the other
   * way round: the car takes the lane and the traffic behind yields, which is
   * what the directive asks for in as many words and what the lane shadow
   * does from the moment of commitment.
   *
   * So the question is only whether the FIRST metres of that claim are free —
   * the body's own footprint where it stands, plus `comfort` behind for a
   * driver who is not yet desperate. Everything downstream takes care of
   * itself: the claim's nose creeps forward at 2.6 m/s and everything ahead
   * of it on the lane is doing 13.9, so a claim can never overtake a car it
   * did not start on top of. When `comfort` decays to zero with waiting, what
   * is left is the physical floor — no two bodies in the same metres — and
   * that part is never negotiable, because a claim that appeared over a car
   * would trap it: it cannot drive out of a claim, and the claim cannot
   * materialise over it.
   */
  /**
   * A car standing at the mouth of its own turn, waiting to cross.
   *
   * It is not traffic as far as a merging car is concerned — Phase 15. On a
   * crossing lane the entry mouth sits a few metres upstream of the merge
   * point, and a driver holding there is *leaving* the lane: they will never
   * reach the merger, and the road ahead of them is exactly the space the
   * merger is entering. Counting them starved the merge for a measured
   * eighteen minutes the first time Stage 4's continuous converts kept a
   * rolling holder at the mouth — and did so again the moment this pass
   * replaced the old merge check without carrying the exemption across.
   * Narrow on purpose: on the road, committed to the turn, at the mouth, and
   * essentially stopped.
   */
  private isHeldTurner(world: World, slot: number, laneIndex: number): boolean {
    const vehicles = world.vehicles;
    const lane = this.lanes.lane(laneIndex);
    return (
      lane.crossesOnEntry &&
      at(vehicles.decision, slot) === DECISION_YES &&
      at(vehicles.laneS, slot) >= lane.entryS - HELD_TURNER_SLACK_METRES &&
      at(vehicles.speed, slot) < HELD_TURNER_SPEED_EPSILON
    );
  }

  private exitClaimFree(
    world: World,
    laneIndex: number,
    slot: number,
    set: ManeuverSet,
    comfort: number,
  ): boolean {
    const vehicles = world.vehicles;
    const own = ARCHETYPE_SPECS[at(vehicles.archetype, slot)]?.lengthMetres ?? MERGING_CAR_LENGTH_METRES;

    set.exit.path.sample(set.exitBandS, this.exitScratch);
    this.lanes.project(laneIndex, this.exitScratch.x, this.exitScratch.y, this.projection);

    const from = this.projection.along - own - comfort;
    const to = this.projection.along + MERGE_CLEARANCE_METRES;

    for (let other = 0; other < vehicles.scanLimit; other++) {
      if (other === slot) continue;
      if (!vehicles.isActive(other)) continue;
      if (at(vehicles.state, other) !== VEHICLE_ON_ROAD) continue;
      if (at(vehicles.lane, other) !== laneIndex) continue;
      if (this.isHeldTurner(world, other, laneIndex)) continue;

      const nose = at(vehicles.laneS, other);
      const rear = nose - (ARCHETYPE_SPECS[at(vehicles.archetype, other)]?.lengthMetres ?? 4.5);
      if (rear < to && nose > from) return false;
    }
    return true;
  }

  /**
   * True while any other departing car on this lane is mid-sweep. Every bay
   * on a lane shares one rejoin point, so exits serialise: a second
   * commitment to the same gap materialises inside the first one's shadow,
   * and the overlap clamp resolves that by throwing the newcomer backwards
   * through the queue (measured: exactly minus one body length).
   */
  private committedExiterOn(world: World, laneIndex: number, except: number): boolean {
    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (slot === except) continue;
      if (!vehicles.isActive(slot)) continue;
      if (at(vehicles.state, slot) !== VEHICLE_EXITING) continue;
      if (at(vehicles.lane, slot) !== laneIndex) continue;
      if (this.exitCommitted(world, slot)) return true;
    }
    return false;
  }

  /**
   * The materialisation floor: no on-road body may overlap the space the
   * merger is about to occupy — `[rejoinS − length, rejoinS]`, plus front
   * clearance. Behind is judged exactly, no comfort: the shadow's follower
   * stands one jam gap short of this boundary by construction, and widening
   * it would deadlock completion against the very queue the shadow built.
   */
  private rejoinNoseFree(world: World, laneIndex: number, rejoinS: number, mergerLength: number): boolean {
    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if (at(vehicles.state, slot) !== VEHICLE_ON_ROAD) continue;
      if (at(vehicles.lane, slot) !== laneIndex) continue;
      if (this.isHeldTurner(world, slot, laneIndex)) continue;
      const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
      const length = spec?.lengthMetres ?? 4.5;
      const nose = at(vehicles.laneS, slot);
      if (nose > rejoinS - mergerLength && nose - length < rejoinS + MERGE_CLEARANCE_METRES) {
        return false;
      }
    }
    return true;
  }

  /**
   * Room to cross the near lane, judged at its own entry mouth.
   *
   * The conflict point is the near lane's `entryS`: both pull-ins converge on
   * the same apron, so the box a crossing car sweeps sits at the near lane's
   * turn. Oncoming means "upstream of the box within the current gap" —
   * distance-based like the merge check, because at these speeds a distance is a
   * time and one fewer moving part is one fewer way to disagree with the IDM.
   */
  private oncomingClear(world: World, waitedMs: number): boolean {
    const nearIndex = this.lanes.nearEntryLane;
    const near = this.lanes.lane(nearIndex);
    /*
     * Two tunes of one mechanism. Stage 4 runs the designed congestion source
     * (16 m comfort, 8 s patience); the early stages run the correction
     * pass's short fuse — just enough discipline that a crossing car never
     * drives through an oncoming body, decayed fast enough that the
     * calibrated Stage 1 throughput survives (balance-gate-measured).
     */
    const mature = world.progression.stage >= LEFT_TURN.minStage;
    const comfort = mature ? LEFT_TURN.comfortGapMetres : LEFT_TURN.earlyComfortGapMetres;
    const patience = mature ? LEFT_TURN.patienceMs : LEFT_TURN.earlyPatienceMs;
    const t = Math.min(1, Math.max(0, waitedMs / patience));
    const required = comfort + (LEFT_TURN.minGapMetres - comfort) * t;

    const vehicles = world.vehicles;
    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!vehicles.isActive(slot)) continue;
      if (at(vehicles.state, slot) !== VEHICLE_ON_ROAD) continue;
      if (at(vehicles.lane, slot) !== nearIndex) continue;
      const delta = near.entryS - at(vehicles.laneS, slot);
      // Approaching within the gap, or still inside the conflict box.
      if (delta > -LEFT_TURN.conflictBoxMetres && delta < required) return false;
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
