import { PATIENCE_SECONDS } from '@config/customer';

/**
 * The customer state machine — GAME_DESIGN_DOCUMENT §8.1, dine-in branch.
 *
 * A declared graph rather than a `switch` buried in a system, for one reason:
 * the properties that matter about a state machine are properties of its
 * *shape*, and a shape you can only discover by executing it can only be tested
 * by executing it. Written down, `tests/unit/sim/customer/fsm.test.ts` walks it
 * and proves there is no unreachable state, no state without an exit, no
 * terminal state with an outgoing edge, and no waiting state that cannot
 * abandon. Those four together are what "no deadlock" means here, and a
 * deadlocked customer is not a crash — it is one entity standing still forever
 * while the game keeps running, which is exactly the kind of bug that ships.
 *
 * ## Scope
 *
 * Phase 6 covers arrival through to waiting at the counter. `ORDERING` onward
 * belongs to Phase 8 and the drive-thru branch to Phase 11, so both are absent
 * rather than stubbed — a state with no implementation behind it would satisfy
 * the reachability test while doing nothing, which is worse than not having it.
 *
 * The consequence is that in Phase 6 **every customer eventually abandons**:
 * nothing serves food, so the counter queue drains only through patience. That
 * is the specified Phase 6 end state (GAME_EXECUTION_ROADMAP: "vehicles stop,
 * park, wait, get bored and leave"), not an accident, and the abandonment path
 * is a real path that Phase 8 will simply stop being the only one.
 */

export const CUSTOMER_STATES = [
  /** In the car, running the entry manoeuvre off the road. */
  'ENTERING',
  /** In the car, on the apron, looking for a free bay. */
  'SEEKING_PARKING',
  /** In the car, running the manoeuvre into an assigned bay. */
  'PARKING',
  /** Parked; the door is opening. A pause, so nobody appears out of thin air. */
  'LEAVING_VEHICLE',
  /** On foot, walking to the counter queue. */
  'WALKING_TO_DOOR',
  /** On foot, standing in the queue. Patience runs here. */
  'QUEUEING_AT_COUNTER',
  /** No bay was free. Still in the car, and about to leave unhappy. */
  'NO_SPACE',
  /** Patience ran out. Distinguished from NO_SPACE so the reasons stay separate. */
  'ABANDONING',
  /** On foot, walking back to the car. */
  'WALKING_TO_CAR',
  /** Visibly unhappy. The state the player is meant to notice. */
  'LEAVING_ANGRY',
  /** In the car, running the exit manoeuvre back towards the road. */
  'EXITING',
  /** In the car, waiting for a gap, then merging. */
  'REJOINING_ROAD',
  /** Terminal. The record is released on the tick it reaches this. */
  'GONE',
] as const;

export type CustomerStateName = (typeof CUSTOMER_STATES)[number];

export const STATE_ENTERING = 0;
export const STATE_SEEKING_PARKING = 1;
export const STATE_PARKING = 2;
export const STATE_LEAVING_VEHICLE = 3;
export const STATE_WALKING_TO_DOOR = 4;
export const STATE_QUEUEING_AT_COUNTER = 5;
export const STATE_NO_SPACE = 6;
export const STATE_ABANDONING = 7;
export const STATE_WALKING_TO_CAR = 8;
export const STATE_LEAVING_ANGRY = 9;
export const STATE_EXITING = 10;
export const STATE_REJOINING_ROAD = 11;
export const STATE_GONE = 12;

export interface CustomerStateSpec {
  readonly name: CustomerStateName;
  /** Every state this one may move to. Empty means terminal. */
  readonly to: readonly number[];
  /**
   * Seconds of patience this state grants, or null when it is not a wait.
   *
   * A number rather than a `waiting: true` flag, because the flag alone was a
   * bug waiting to happen and then was one: `SEEKING_PARKING` was marked as
   * waiting while only the queue's patience was ever initialised, so every
   * customer's clock started at zero and they abandoned on the tick they
   * arrived — seventeen conversions in ten minutes and not one car ever parked.
   *
   * Carrying the duration here makes "a waiting state without patience"
   * unrepresentable rather than merely tested for. Walking is not waiting:
   * someone crossing a car park is making progress, and a countdown there would
   * strand them mid-stride.
   */
  readonly patienceSeconds: number | null;
  /**
   * True only where the customer is *certainly* inside a vehicle.
   *
   * Deliberately not "is the customer in a car right now": `ABANDONING` is
   * reached both from a queue on foot and from a car that never found a bay, so
   * no static answer is correct there. Visibility is therefore driven by the
   * record, and this flag is the invariant the FSM test checks against it — a
   * state marked here must never be observed with a visible customer.
   */
  readonly alwaysInVehicle: boolean;
}

/**
 * Indexed by the `STATE_*` constants; the order is load-bearing because the
 * index is what `CustomerRecord.state` holds and what the world hash digests.
 */
export const CUSTOMER_STATE_SPECS: readonly CustomerStateSpec[] = [
  { name: 'ENTERING', to: [STATE_SEEKING_PARKING], patienceSeconds: null, alwaysInVehicle: true },
  {
    name: 'SEEKING_PARKING',
    to: [STATE_PARKING, STATE_NO_SPACE, STATE_ABANDONING],
    patienceSeconds: PATIENCE_SECONDS.seekingParking,
    alwaysInVehicle: true,
  },
  { name: 'PARKING', to: [STATE_LEAVING_VEHICLE], patienceSeconds: null, alwaysInVehicle: true },
  { name: 'LEAVING_VEHICLE', to: [STATE_WALKING_TO_DOOR], patienceSeconds: null, alwaysInVehicle: true },
  { name: 'WALKING_TO_DOOR', to: [STATE_QUEUEING_AT_COUNTER], patienceSeconds: null, alwaysInVehicle: false },
  {
    name: 'QUEUEING_AT_COUNTER',
    to: [STATE_ABANDONING],
    patienceSeconds: PATIENCE_SECONDS.queueingAtCounter,
    alwaysInVehicle: false,
  },
  { name: 'NO_SPACE', to: [STATE_LEAVING_ANGRY], patienceSeconds: null, alwaysInVehicle: true },
  {
    /*
     * ABANDONING splits on where the customer is standing. Someone who gave up
     * in the queue has to walk back to their car; someone who never got out of
     * it is already there. Both end at LEAVING_ANGRY, which is the state the
     * player is supposed to see.
     */
    name: 'ABANDONING',
    to: [STATE_WALKING_TO_CAR, STATE_LEAVING_ANGRY],
    patienceSeconds: null,
    alwaysInVehicle: false,
  },
  { name: 'WALKING_TO_CAR', to: [STATE_LEAVING_ANGRY], patienceSeconds: null, alwaysInVehicle: false },
  { name: 'LEAVING_ANGRY', to: [STATE_EXITING], patienceSeconds: null, alwaysInVehicle: true },
  { name: 'EXITING', to: [STATE_REJOINING_ROAD], patienceSeconds: null, alwaysInVehicle: true },
  /*
   * Waiting for a gap in the traffic, but **not** a `waiting` state, and the
   * distinction is the point. `waiting` means "patience is running and this can
   * end in ABANDONING"; someone already leaving angrily cannot abandon harder.
   * Progress is guaranteed instead by a forced merge once the driver has waited
   * long enough — which is also what a real driver does when the road never
   * clears, and it keeps the car park from silting up with cars that can never
   * leave.
   */
  { name: 'REJOINING_ROAD', to: [STATE_GONE], patienceSeconds: null, alwaysInVehicle: true },
  { name: 'GONE', to: [], patienceSeconds: null, alwaysInVehicle: true },
];

export function customerStateSpec(state: number): CustomerStateSpec {
  const spec = CUSTOMER_STATE_SPECS[state];
  if (spec === undefined) throw new RangeError(`Unknown customer state ${state}`);
  return spec;
}

export function customerStateName(state: number): CustomerStateName {
  return customerStateSpec(state).name;
}

/** True when patience runs in this state and it can end in `ABANDONING`. */
export function isWaiting(state: number): boolean {
  return customerStateSpec(state).patienceSeconds !== null;
}

/**
 * Whether `to` is a declared transition out of `from`.
 *
 * The system asks before every move, so an edge that is not in the table above
 * cannot be taken by accident — which is what keeps the graph and the behaviour
 * from drifting apart as later phases add states.
 */
export function canTransition(from: number, to: number): boolean {
  return customerStateSpec(from).to.includes(to);
}

/**
 * Where a customer goes after `ABANDONING`, given the state patience ran out in.
 *
 * Takes the *previous* state rather than `ABANDONING` itself, because that is
 * the only place the information exists: someone who gave up in the queue has a
 * walk back to the car ahead of them, and someone who gave up looking for a bay
 * is already sitting in it.
 */
export function abandonTargetFor(previousState: number): number {
  return customerStateSpec(previousState).alwaysInVehicle ? STATE_LEAVING_ANGRY : STATE_WALKING_TO_CAR;
}
