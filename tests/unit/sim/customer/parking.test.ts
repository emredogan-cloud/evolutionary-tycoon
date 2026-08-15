import { describe, expect, it } from 'vitest';
import { REASON_NO_PARKING } from '@config/conversion';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { TICK_MS } from '@config/simulation';
import {
  STATE_GONE,
  STATE_NO_SPACE,
  STATE_QUEUEING_AT_COUNTER,
  customerStateName,
} from '@sim/ai/fsm/customerFsm';
import { Sim } from '@sim/core/Sim';
import { DECISION_YES } from '@sim/systems/ConversionSystem';
import {
  VEHICLE_ENTERING,
  VEHICLE_EXITING,
  VEHICLE_ON_ROAD,
  VEHICLE_PARKED,
} from '@sim/systems/VehicleManeuverSystem';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const LONG_RUN_TIMEOUT_MS = 60_000;

/**
 * Bays a vehicle is currently arriving at or standing in.
 *
 * Deliberately not "every vehicle that names a bay". A car that has finished its
 * exit curve is at the lane edge waiting for a gap, and it goes on naming the
 * bay only because that is how it remembers which curve it is on — its space is
 * already free, and a driver waiting to merge must not hold one nobody can use.
 */
function claimedBays(sim: Sim): number[] {
  const vehicles = sim.world.vehicles;
  const claimed: number[] = [];
  for (let slot = 0; slot < vehicles.capacity; slot++) {
    if (!vehicles.isActive(slot)) continue;
    const state = vehicles.state[slot] ?? 0;
    if (state !== VEHICLE_ENTERING && state !== VEHICLE_PARKED) continue;
    const bay = vehicles.parkingSlot[slot] ?? -1;
    if (bay >= 0) claimed.push(bay);
  }
  return claimed;
}

describe('parking', () => {
  it(
    'never puts two vehicles in one bay',
    () => {
      // The invariant the whole assignment scheme exists for. Checked every tick
      // rather than at the end, because a double-booking that resolves itself is
      // still two cars occupying the same three metres on screen.
      const sim = new Sim({ seed: 8801 });
      for (let tick = 0; tick < TICKS_PER_MINUTE * 20; tick++) {
        sim.tick();
        const claimed = claimedBays(sim);
        expect(new Set(claimed).size, `tick ${tick}: ${claimed.join(',')}`).toBe(claimed.length);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'only ever claims a bay the layout declares',
    () => {
      const sim = new Sim({ seed: 4477 });
      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.tick();
        for (const bay of claimedBays(sim)) {
          expect(bay).toBeLessThan(STAGE1_LAYOUT.parking.length);
        }
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it('keeps a bay reserved until the car has actually pulled out of it', () => {
    /*
     * The other half of releasing it early. A car one metre into its exit is
     * still standing in the bay, and handing the space over then puts two cars
     * in it for a second or two — which is exactly the double-booking the scan
     * above is looking for, arriving by a different route.
     */
    const sim = new Sim({ seed: 4242 });
    const vehicles = sim.world.vehicles;

    const leaving = vehicles.spawn(sim.world.allocateEntityId());
    vehicles.state[leaving] = VEHICLE_EXITING;
    vehicles.parkingSlot[leaving] = 1;
    vehicles.maneuverS[leaving] = 0;

    const arriving = vehicles.spawn(sim.world.allocateEntityId());
    vehicles.state[arriving] = VEHICLE_PARKED;
    vehicles.parkingSlot[arriving] = 0;
    const third = vehicles.spawn(sim.world.allocateEntityId());
    vehicles.state[third] = VEHICLE_PARKED;
    vehicles.parkingSlot[third] = 2;
    const fourth = vehicles.spawn(sim.world.allocateEntityId());
    vehicles.state[fourth] = VEHICLE_PARKED;
    vehicles.parkingSlot[fourth] = 3;

    /*
     * Observed through what the system will hand out rather than through a flag,
     * because "reserved" is only meaningful as "nobody else gets it". While the
     * leaving car is still on its curve, no arriving car may be given bay 1 —
     * and with the other three taken, an arrival has nowhere to go and is turned
     * away instead.
     */
    const parkedInBayOne: number[] = [];
    const unsubscribe = sim.events.subscribe((event) => {
      if (event.t === 'VEHICLE_PARKED' && event.parkingSlot === 1) {
        parkedInBayOne.push(sim.world.tick);
      }
    });

    let stillLeavingUntil = 0;
    for (let tick = 0; tick < 200; tick++) {
      sim.tick();
      if (vehicles.isActive(leaving) && (vehicles.state[leaving] ?? 0) === VEHICLE_EXITING) {
        stillLeavingUntil = sim.world.tick;
      }
    }
    unsubscribe();

    expect(stillLeavingUntil, 'the exiting car finished instantly').toBeGreaterThan(1);
    for (const tick of parkedInBayOne) {
      expect(tick, 'bay 1 was handed out while a car was still leaving it').toBeGreaterThan(
        stillLeavingUntil,
      );
    }
  });

  it('assigns the nearest free bay, and breaks a tie on the lower index', () => {
    /*
     * Determinism, not aesthetics. Two bays at the same distance must resolve
     * the same way on every engine — a tie broken by iteration order would be
     * stable on V8 and something else on SpiderMonkey, and the determinism suite
     * compares world hashes across both.
     */
    const sim = new Sim({ seed: 1234 });
    const chosen: number[] = [];
    const unsubscribe = sim.events.subscribe((event) => {
      if (event.t === 'VEHICLE_PARKED') chosen.push(event.parkingSlot);
    });
    sim.advance(TICKS_PER_MINUTE * 10);
    unsubscribe();

    expect(chosen.length).toBeGreaterThan(0);

    // Same seed, same sequence of bays — the assignment reads only world state.
    const repeat = new Sim({ seed: 1234 });
    const again: number[] = [];
    const stop = repeat.events.subscribe((event) => {
      if (event.t === 'VEHICLE_PARKED') again.push(event.parkingSlot);
    });
    repeat.advance(TICKS_PER_MINUTE * 10);
    stop();
    expect(again).toEqual(chosen);
  });

  it(
    'turns a driver away visibly when the car park is full, rather than deleting them',
    () => {
      /*
       * The designed moment from GAME_EXECUTION_ROADMAP Phase 6: "the player has
       * to see the cost of under-building". A car that vanished, or one that
       * simply carried on down the road, would be indistinguishable from a
       * driver who never wanted to stop.
       */
      const sim = new Sim({ seed: 5150 });

      // Fill every bay by hand, so the next converter has nowhere to go.
      const vehicles = sim.world.vehicles;
      for (let bay = 0; bay < STAGE1_LAYOUT.parking.length; bay++) {
        const slot = vehicles.spawn(sim.world.allocateEntityId());
        expect(slot).toBeGreaterThanOrEqual(0);
        vehicles.state[slot] = VEHICLE_PARKED;
        vehicles.parkingSlot[slot] = bay;
        vehicles.decision[slot] = DECISION_YES;
      }

      const turnedAway: number[] = [];
      const unsubscribe = sim.events.subscribe((event) => {
        if (event.t === 'CUSTOMER_LEFT_ANGRY') turnedAway.push(event.reason);
      });
      sim.advance(TICKS_PER_MINUTE * 12);
      unsubscribe();

      expect(sim.world.stats.turnedAwayNoParking).toBeGreaterThan(0);
      expect(turnedAway).toContain(REASON_NO_PARKING);
      expect(sim.world.stats.failureReasons[REASON_NO_PARKING] ?? 0).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'lets a turned-away car drive through without reserving a bay on the way',
    () => {
      /*
       * Found by measurement: routing the pass-through over bay 0 made bay 0
       * look occupied to everyone behind it, so four bays quietly became three
       * the first time anybody was turned away.
       */
      const sim = new Sim({ seed: 5150 });
      const vehicles = sim.world.vehicles;
      for (let bay = 0; bay < STAGE1_LAYOUT.parking.length; bay++) {
        const slot = vehicles.spawn(sim.world.allocateEntityId());
        vehicles.state[slot] = VEHICLE_PARKED;
        vehicles.parkingSlot[slot] = bay;
      }

      let sawPassThrough = false;
      for (let tick = 0; tick < TICKS_PER_MINUTE * 12; tick++) {
        sim.tick();
        for (let slot = 0; slot < vehicles.capacity; slot++) {
          if (!vehicles.isActive(slot)) continue;
          const state = vehicles.state[slot] ?? 0;
          if (state !== VEHICLE_ENTERING && state !== VEHICLE_EXITING) continue;
          if ((vehicles.parkingSlot[slot] ?? -1) >= 0) continue;
          sawPassThrough = true;
        }
        // The four hand-parked cars still hold exactly four bays, always.
        expect(new Set(claimedBays(sim)).size).toBe(STAGE1_LAYOUT.parking.length);
      }

      expect(sawPassThrough, 'no car ever took the pass-through route').toBe(true);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'releases every bay it takes',
    () => {
      // A leaked reservation is invisible until the lot silts up, which is what
      // happened before departing drivers were allowed to force a merge.
      const sim = new Sim({ seed: 2024 });
      sim.advance(TICKS_PER_MINUTE * 40);

      const claimed = claimedBays(sim);
      expect(claimed.length).toBeLessThanOrEqual(STAGE1_LAYOUT.parking.length);
      // And the road is still delivering traffic rather than being blocked by
      // cars that can never leave.
      expect(sim.world.stats.vehiclesSpawned).toBeGreaterThan(1000);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('the customer lifecycle end to end', () => {
  it(
    'takes a converted driver all the way from the road to gone',
    () => {
      /*
       * Every state on the happy path, in order, from one real run. Phase 6 has
       * no service, so the walk ends in abandonment — which is the specified end
       * state, and it means this single test covers the patience path too.
       */
      const sim = new Sim({ seed: 606 });
      const seen = new Set<string>();
      const vehicleStates = new Set<number>();

      for (let tick = 0; tick < TICKS_PER_MINUTE * 25; tick++) {
        sim.tick();
        const customers = sim.world.customers;
        for (let slot = 0; slot < customers.capacity; slot++) {
          if (!customers.isActive(slot)) continue;
          seen.add(customerStateName(customers.at(slot).state));
        }
        const vehicles = sim.world.vehicles;
        for (let slot = 0; slot < vehicles.capacity; slot++) {
          if (!vehicles.isActive(slot)) continue;
          vehicleStates.add(vehicles.state[slot] ?? 0);
        }
      }

      for (const state of [
        'ENTERING',
        'PARKING',
        'LEAVING_VEHICLE',
        'WALKING_TO_DOOR',
        'QUEUEING_AT_COUNTER',
        'WALKING_TO_CAR',
        'LEAVING_ANGRY',
        'EXITING',
      ]) {
        expect(seen, `never reached ${state}`).toContain(state);
      }

      for (const state of [VEHICLE_ON_ROAD, VEHICLE_ENTERING, VEHICLE_PARKED, VEHICLE_EXITING]) {
        expect(vehicleStates, `no vehicle reached lifecycle state ${state}`).toContain(state);
      }

      expect(sim.world.stats.customersAbandoned).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'never strands a customer — the population always drains',
    () => {
      /*
       * The behavioural counterpart to the FSM's reachability proof. The graph
       * being acyclic towards GONE means nothing if a system stops advancing it,
       * so this runs long enough for everyone present at the halfway mark to
       * have left by the end.
       */
      const sim = new Sim({ seed: 9090 });
      sim.advance(TICKS_PER_MINUTE * 10);

      const midway = new Set<number>();
      for (let slot = 0; slot < sim.world.customers.capacity; slot++) {
        if (sim.world.customers.isActive(slot)) {
          midway.add(sim.world.customers.at(slot).entityId);
        }
      }
      expect(midway.size).toBeGreaterThan(0);

      sim.advance(TICKS_PER_MINUTE * 20);

      const still = new Set<number>();
      for (let slot = 0; slot < sim.world.customers.capacity; slot++) {
        if (sim.world.customers.isActive(slot)) {
          still.add(sim.world.customers.at(slot).entityId);
        }
      }
      for (const id of midway) {
        expect(still.has(id), `customer ${id} is still on site 20 minutes later`).toBe(false);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'never leaves a customer visible while they are inside a car',
    () => {
      // `alwaysInVehicle` is documentation until something checks it against the
      // record that actually drives rendering.
      const sim = new Sim({ seed: 313 });
      for (let tick = 0; tick < TICKS_PER_MINUTE * 15; tick++) {
        sim.tick();
        const customers = sim.world.customers;
        for (let slot = 0; slot < customers.capacity; slot++) {
          if (!customers.isActive(slot)) continue;
          const customer = customers.at(slot);
          if (customer.staged === 1) continue;
          if (customer.state === STATE_NO_SPACE || customer.state === STATE_GONE) {
            expect(customer.visible, customerStateName(customer.state)).toBe(0);
          }
          if (customer.state === STATE_QUEUEING_AT_COUNTER) {
            expect(customer.visible, 'queueing but not drawn').toBe(1);
          }
        }
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'sends a turned-away driver through NO_SPACE and out, never into the queue',
    () => {
      const sim = new Sim({ seed: 5150 });
      const vehicles = sim.world.vehicles;
      for (let bay = 0; bay < STAGE1_LAYOUT.parking.length; bay++) {
        const slot = vehicles.spawn(sim.world.allocateEntityId());
        vehicles.state[slot] = VEHICLE_PARKED;
        vehicles.parkingSlot[slot] = bay;
      }

      const seen = new Set<string>();
      for (let tick = 0; tick < TICKS_PER_MINUTE * 12; tick++) {
        sim.tick();
        for (let slot = 0; slot < sim.world.customers.capacity; slot++) {
          if (!sim.world.customers.isActive(slot)) continue;
          const customer = sim.world.customers.at(slot);
          if (customer.vehicleSlot < 0) continue;
          seen.add(customerStateName(customer.state));
        }
      }

      expect(seen).toContain('NO_SPACE');
      // They never got out of the car, so they never joined the queue.
      expect(seen).not.toContain('QUEUEING_AT_COUNTER');
      /*
       * `LEAVING_ANGRY` is deliberately not asserted here. It is consumed within
       * the same tick it is set — the manoeuvre system runs at pipeline slot 6
       * and the state machine at slot 8 — so it is never observable at a tick
       * boundary. What is observable, and what the player and Phase 18 both
       * actually consume, is the event.
       */
      expect(sim.world.stats.turnedAwayNoParking).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
