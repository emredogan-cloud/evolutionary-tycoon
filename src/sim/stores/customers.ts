import { ACTOR_KIND_CUSTOMER } from '@config/actors';
import type { Hasher } from '../math/hash';
import { SlotPool } from './pool';

/**
 * Customers — a pooled record per ADR-010.
 *
 * Not a structure-of-arrays like `VehicleStore`, and deliberately so: there are
 * twenty of these against a hundred and twenty vehicles, several fields are
 * naturally sparse (`queueIndex` is -1 for most of a customer's life), and the
 * state machine reads a whole customer at once rather than sweeping one field
 * across all of them. SoA earns its complexity on the traffic scan; here it
 * would cost readability and buy nothing measurable.
 *
 * ## The customer exists before it is visible
 *
 * A customer record is created at the moment of conversion, while its driver is
 * still on the road, and `visible` stays 0 until they get out of the car. That
 * is what makes the funnel in GAME_DESIGN_DOCUMENT §8.1 real: `SEEKING_PARKING`
 * and `NO_SPACE` are states a customer is genuinely in, not fictions invented
 * for the diagram, and the Phase 18 analysis panel can count someone who
 * decided to stop and then found the car park full — which is a different
 * failure from never having stopped.
 */

export interface CustomerRecord {
  entityId: number;
  x: number;
  y: number;
  z: number;
  kind: number;
  /** Index into `CUSTOMER_STATES`. */
  state: number;
  /** Vehicle archetype of the car they arrived in — drives patience. */
  archetype: number;
  /** Slot of their vehicle, or -1 once it has gone. */
  vehicleSlot: number;
  /** Parking bay they used, or -1. */
  parkingSlot: number;
  /** Position in the counter queue, or -1 when not queueing. */
  queueIndex: number;
  /**
   * Which channel they chose — `CHANNEL_COUNTER` or `CHANNEL_DRIVE_THRU`.
   *
   * Decided once, at conversion, and never revisited. A customer who could
   * switch channels after seeing the queue would be modelling a driver who can
   * reverse out of a drive-thru lane, which is both rare and a much bigger
   * simulation than this one.
   */
  channel: number;
  /**
   * Place in the drive-thru lane, or -1. Index 0 is at the window.
   *
   * Separate from `queueIndex` because they are different queues with different
   * capacities and different patience, and a single field would make "which
   * queue is this person in" a question about their state rather than a fact.
   */
  laneSlot: number;
  /**
   * The table they are sitting at, or -1 — Stage 3 onward.
   *
   * A seated customer is the reason delivery stops being instantaneous: their
   * food is made at the pass and has to be *carried* to them. Three features
   * built in Phases 8, 9 and 10 have been waiting for this one field to become
   * meaningful — the pass plate indicator, the cooler, and the waiter role.
   */
  tableSlot: number;
  /**
   * Spot in the waiting area, or -1.
   *
   * Held once assigned, and that is the whole point of storing it. Choosing the
   * nearest free spot afresh each tick sounds equivalent and is not: a customer
   * walking towards one spot passes closer to another, changes their mind, and
   * two of them end up weaving around each other — measured at 15 cm closest
   * approach, worse than the first-free rule it replaced.
   */
  waitSpot: number;
  /** Milliseconds of patience left in the current waiting state. */
  patienceMs: number;
  /** What that patience started at, so the ring can show a fraction. */
  patienceMaxMs: number;
  /** Generic countdown for states that take a fixed time, in milliseconds. */
  timerMs: number;
  /** Where they are walking to, in world metres. */
  targetX: number;
  targetY: number;
  /** Unit facing. Held rather than derived, so a standing customer still faces. */
  headingX: number;
  headingY: number;
  /** 0 while inside a vehicle — the renderer skips them entirely. */
  visible: number;
  /**
   * Why they are leaving unhappy, as a `REASON_*` index.
   *
   * Recorded at the moment patience runs out rather than at the moment they
   * drive off, because by then they are several states away from whatever
   * disappointed them and the state that ran out is gone.
   */
  reason: number;
  /** Sim time they converted, so dwell time can be reported when they leave. */
  arrivedAtMs: number;
  /**
   * 1 for an actor placed by an authored scene rather than by conversion.
   *
   * The state machine and the queue both skip these. Authored scenes predate the
   * customer system — a depth test card is something you construct on purpose,
   * not something you wait for a simulation to produce — and they place actors
   * straight into this pool with no car, no bay and no intent to walk anywhere.
   * Before this flag existed the state machine found them in `ENTERING` with no
   * target and walked them to the world origin, which is a real bug and not only
   * a test one: the same thing would happen to any actor a future editor placed.
   *
   * Hashed, because it genuinely changes what a tick does to that record.
   */
  staged: number;
}

function createCustomer(): CustomerRecord {
  return {
    entityId: 0,
    x: 0,
    y: 0,
    z: 0,
    kind: ACTOR_KIND_CUSTOMER,
    state: 0,
    archetype: 0,
    vehicleSlot: -1,
    parkingSlot: -1,
    queueIndex: -1,
    channel: 0,
    laneSlot: -1,
    tableSlot: -1,
    waitSpot: -1,
    patienceMs: 0,
    patienceMaxMs: 0,
    timerMs: 0,
    targetX: 0,
    targetY: 0,
    headingX: 1,
    headingY: 0,
    visible: 0,
    reason: 0,
    arrivedAtMs: 0,
    staged: 0,
  };
}

function resetCustomer(record: CustomerRecord): void {
  record.entityId = 0;
  record.x = 0;
  record.y = 0;
  record.z = 0;
  record.kind = ACTOR_KIND_CUSTOMER;
  record.state = 0;
  record.archetype = 0;
  record.vehicleSlot = -1;
  record.parkingSlot = -1;
  record.queueIndex = -1;
  record.channel = 0;
  record.laneSlot = -1;
  record.tableSlot = -1;
  record.waitSpot = -1;
  record.patienceMs = 0;
  record.patienceMaxMs = 0;
  record.timerMs = 0;
  record.targetX = 0;
  record.targetY = 0;
  record.headingX = 1;
  record.headingY = 0;
  record.visible = 0;
  record.reason = 0;
  record.arrivedAtMs = 0;
  record.staged = 0;
}

/**
 * Everything that can change an outcome, in a fixed order.
 *
 * `patienceMaxMs` and the heading are in here even though they look cosmetic:
 * the first is what a future upgrade will move, and the second decides which
 * way someone walks out of a queue. `visible` is included because it is state,
 * not presentation — it says whether this customer is in a car.
 */
export function writeCustomer(hasher: Hasher, record: CustomerRecord): void {
  hasher.writeI32(record.entityId);
  hasher.writeF64(record.x);
  hasher.writeF64(record.y);
  hasher.writeF64(record.z);
  hasher.writeU8(record.kind);
  hasher.writeU8(record.state);
  hasher.writeU8(record.archetype);
  hasher.writeI32(record.vehicleSlot);
  hasher.writeI32(record.parkingSlot);
  hasher.writeI32(record.queueIndex);
  hasher.writeU8(record.channel);
  hasher.writeI32(record.laneSlot);
  hasher.writeI32(record.tableSlot);
  hasher.writeI32(record.waitSpot);
  hasher.writeF64(record.patienceMs);
  hasher.writeF64(record.patienceMaxMs);
  hasher.writeF64(record.timerMs);
  hasher.writeF64(record.targetX);
  hasher.writeF64(record.targetY);
  hasher.writeF64(record.headingX);
  hasher.writeF64(record.headingY);
  hasher.writeU8(record.visible);
  hasher.writeU8(record.reason);
  hasher.writeF64(record.arrivedAtMs);
  hasher.writeU8(record.staged);
}

export function createCustomerPool(capacity: number): SlotPool<CustomerRecord> {
  return new SlotPool<CustomerRecord>(capacity, createCustomer, resetCustomer);
}
