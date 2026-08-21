import { describe, expect, it } from 'vitest';
import { ARCHETYPE_PATIENCE, PATIENCE_SECONDS } from '@config/customer';
import { REASON_NO_PARKING, REASON_QUEUE_TOO_LONG } from '@config/conversion';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { TICK_MS } from '@config/simulation';
import { CUSTOMER_STATE_SPECS, STATE_QUEUEING_AT_COUNTER, customerStateName } from '@sim/ai/fsm/customerFsm';
import { Sim } from '@sim/core/Sim';
import { QueueSystem } from '@sim/systems/QueueSystem';
import { VEHICLE_PARKED } from '@sim/systems/VehicleManeuverSystem';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const LONG_RUN_TIMEOUT_MS = 60_000;

/** A customer standing in the queue with a full clock, without a car. */
function seatInQueue(sim: Sim, archetype: number): number {
  const slot = sim.world.customers.acquire();
  const customer = sim.world.customers.at(slot);
  customer.entityId = sim.world.allocateEntityId();
  customer.state = STATE_QUEUEING_AT_COUNTER;
  customer.visible = 1;
  customer.archetype = archetype;
  customer.vehicleSlot = -1;
  customer.parkingSlot = -1;
  const first = STAGE1_LAYOUT.queue[0];
  customer.x = first?.x ?? 0;
  customer.y = first?.y ?? 0;
  customer.targetX = customer.x;
  customer.targetY = customer.y;
  return slot;
}

describe('patience', () => {
  it('starts itself from the state that is being waited in', () => {
    /*
     * Patience used to be started at each site that entered a waiting state,
     * and `SEEKING_PARKING` was missed — so its clock began at zero and every
     * customer abandoned on the tick they arrived. Seventeen conversions over
     * ten simulated minutes and not one car ever parked. Now the duration is
     * declared on the state, and the system reads it.
     */
    const sim = new Sim({ seed: 1 });
    const slot = seatInQueue(sim, 0);
    sim.tick();

    const customer = sim.world.customers.at(slot);
    expect(customer.patienceMaxMs).toBeGreaterThan(0);
    expect(customer.patienceMs).toBeGreaterThan(0);
    expect(customer.patienceMs).toBeLessThanOrEqual(customer.patienceMaxMs);
  });

  it('scales with the archetype, so a working driver gives up sooner', () => {
    const patienceFor = (archetype: number): number => {
      const sim = new Sim({ seed: 1 });
      const slot = seatInQueue(sim, archetype);
      sim.tick();
      return sim.world.customers.at(slot).patienceMaxMs;
    };

    // PICKUP_WORKER is on the clock; FAMILY_VAN has already unloaded.
    expect(patienceFor(1)).toBeLessThan(patienceFor(0));
    expect(patienceFor(2)).toBeGreaterThan(patienceFor(0));
    expect(patienceFor(0)).toBeCloseTo(
      PATIENCE_SECONDS.queueingAtCounter * 1000 * (ARCHETYPE_PATIENCE[0] ?? 1),
      6,
    );
  });

  it('counts down in real time and ends in abandonment', () => {
    /*
     * Two customers, and the *second* is the one watched. Phase 8 gave the front
     * of the queue somewhere to go — index 0 orders and steps aside — so a lone
     * seeded customer leaves `QUEUEING_AT_COUNTER` on its first tick and its
     * patience clock stops with it. The one behind is the one still queueing,
     * which is what this test is about.
     */
    const sim = new Sim({ seed: 2 });
    seatInQueue(sim, 1);
    const slot = seatInQueue(sim, 1); // the least patient archetype
    sim.tick();
    expect(sim.world.customers.at(slot).queueIndex, 'not the one queueing').toBeGreaterThan(0);
    const started = sim.world.customers.at(slot).patienceMs;

    sim.advance(20);
    const after = sim.world.customers.at(slot).patienceMs;
    expect(started - after).toBeCloseTo(20 * TICK_MS, 6);

    const abandonedBefore = sim.world.stats.customersAbandoned;
    sim.advance(Math.ceil(started / TICK_MS) + 5);
    expect(sim.world.stats.customersAbandoned).toBeGreaterThan(abandonedBefore);
  });

  it('does not run while a customer is walking', () => {
    /*
     * Someone crossing a car park is making progress. A countdown there would
     * strand them mid-stride for a reason the player cannot see, and it is the
     * graph rather than the system that decides which states count.
     */
    for (const spec of CUSTOMER_STATE_SPECS) {
      if (!spec.name.startsWith('WALKING')) continue;
      expect(spec.patienceSeconds, spec.name).toBeNull();
    }
  });

  it(
    'reports the reason it ran out, and it is not the same one as never stopping',
    () => {
      const sim = new Sim({ seed: 4242 });
      const reasons: number[] = [];
      const unsubscribe = sim.events.subscribe((event) => {
        if (event.t === 'CUSTOMER_LEFT_ANGRY') reasons.push(event.reason);
      });
      sim.advance(TICKS_PER_MINUTE * 15);
      unsubscribe();

      expect(reasons.length).toBeGreaterThan(0);
      // Nothing serves food in Phase 6, so every departure is the queue timing
      // out — a different failure from a driver who never stopped at all, and
      // one with a different fix.
      expect(reasons).toContain(REASON_QUEUE_TOO_LONG);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'reports a dwell time that matches how long they were actually there',
    () => {
      /*
       * Split by reason, because the two departures have very different shapes
       * and that difference is the point of recording either. Someone who
       * queued and gave up was on site for the whole patience window plus the
       * parking and the walk; someone turned away for having nowhere to park
       * was there for a few seconds. Averaging them would hide both.
       */
      const sim = new Sim({ seed: 5150 });
      const vehicles = sim.world.vehicles;
      for (let bay = 0; bay < STAGE1_LAYOUT.parking.length; bay++) {
        const slot = vehicles.spawn(sim.world.allocateEntityId());
        vehicles.state[slot] = VEHICLE_PARKED;
        vehicles.parkingSlot[slot] = bay;
      }

      const turnedAway: number[] = [];
      const unsubscribe = sim.events.subscribe((event) => {
        if (event.t !== 'CUSTOMER_LEFT_ANGRY') return;
        if (event.reason === REASON_NO_PARKING) turnedAway.push(event.dwellMs);
      });
      sim.advance(TICKS_PER_MINUTE * 15);
      unsubscribe();

      expect(turnedAway.length).toBeGreaterThan(0);
      for (const dwell of turnedAway) {
        // Long enough to have crossed the apron, short enough that nobody could
        // mistake it for having waited.
        expect(dwell).toBeGreaterThan(0);
        expect(dwell).toBeLessThan(PATIENCE_SECONDS.queueingAtCounter * 1000 * 0.5);
      }

      const queued: number[] = [];
      const quiet = new Sim({ seed: 606 });
      const stop = quiet.events.subscribe((event) => {
        if (event.t !== 'CUSTOMER_LEFT_ANGRY') return;
        if (event.reason === REASON_QUEUE_TOO_LONG) queued.push(event.dwellMs);
      });
      quiet.advance(TICKS_PER_MINUTE * 15);
      stop();

      expect(queued.length).toBeGreaterThan(0);
      for (const dwell of queued) {
        // The whole patience window, plus the parking and the walk before it.
        expect(dwell).toBeGreaterThan(PATIENCE_SECONDS.queueingAtCounter * 1000 * 0.5);
        expect(dwell).toBeLessThan(180_000);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('the queue at the counter', () => {
  it('fills from the front', () => {
    const sim = new Sim({ seed: 3 });
    const slots = [seatInQueue(sim, 0), seatInQueue(sim, 0), seatInQueue(sim, 0)];
    sim.tick();

    const indices = slots.map((slot) => sim.world.customers.at(slot).queueIndex);
    expect([...indices].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('closes up when someone leaves, rather than leaving a hole', () => {
    /*
     * The shuffle is the only visual evidence a player gets that a queue is
     * being served rather than merely existing — and in Phase 6, that it is
     * emptying because people are giving up.
     */
    const sim = new Sim({ seed: 4 });
    const first = seatInQueue(sim, 0);
    const second = seatInQueue(sim, 0);
    const third = seatInQueue(sim, 0);
    sim.tick();
    expect(sim.world.customers.at(third).queueIndex).toBe(2);

    sim.world.customers.release(first);
    sim.tick();

    expect(sim.world.customers.at(second).queueIndex).toBe(0);
    expect(sim.world.customers.at(third).queueIndex).toBe(1);
  });

  it('walks people to their new place instead of moving them there', () => {
    // GAME_DESIGN_DOCUMENT §8: no teleporting. A customer whose index changes
    // gets a new target, and covers the distance at walking pace.
    const sim = new Sim({ seed: 5 });
    const first = seatInQueue(sim, 0);
    const second = seatInQueue(sim, 0);
    sim.tick();

    const behind = sim.world.customers.at(second);
    const wasY = behind.y;
    sim.world.customers.release(first);
    sim.tick();

    expect(behind.queueIndex).toBe(0);
    // Aimed at the front, but not standing there yet.
    const front = STAGE1_LAYOUT.queue[0];
    expect(behind.targetY).toBeCloseTo(front?.y ?? 0, 6);
    expect(Math.abs(behind.y - wasY)).toBeLessThan(0.2);
  });

  it('gives everyone a distinct place', () => {
    const sim = new Sim({ seed: 6 });
    for (const _slot of STAGE1_LAYOUT.queue) seatInQueue(sim, 0);
    sim.tick();

    const taken: number[] = [];
    for (let slot = 0; slot < sim.world.customers.capacity; slot++) {
      if (!sim.world.customers.isActive(slot)) continue;
      const index = sim.world.customers.at(slot).queueIndex;
      if (index >= 0) taken.push(index);
    }
    expect(new Set(taken).size).toBe(taken.length);
  });

  it('reports the overflow past the authored capacity', () => {
    // The input to the spillover penalty, which is the economy's only negative
    // feedback loop — so it is worth being able to read on its own.
    const sim = new Sim({ seed: 7 });
    expect(QueueSystem.overflowOf(sim.world, STAGE1_LAYOUT)).toBe(0);

    for (const _slot of STAGE1_LAYOUT.queue) seatInQueue(sim, 0);
    sim.tick();

    expect(QueueSystem.overflowOf(sim.world, STAGE1_LAYOUT)).toBe(
      STAGE1_LAYOUT.queue.length - STAGE1_LAYOUT.queueCapacity,
    );
  });

  it('puts the overflow slots where a passing driver can see them', () => {
    /*
     * The mechanic depends on the geometry: a queue running along the counter
     * would have been tidier and would have made spillover invisible. The slots
     * past capacity have to be closer to the road than the ones before it.
     */
    const inside = STAGE1_LAYOUT.queue[STAGE1_LAYOUT.queueCapacity - 1];
    const spilled = STAGE1_LAYOUT.queue[STAGE1_LAYOUT.queue.length - 1];
    if (inside === undefined || spilled === undefined) throw new Error('layout');
    // The road is at low y; the counter is at high y.
    expect(spilled.y).toBeLessThan(inside.y);
  });

  it('never seats a staged scene actor', () => {
    // Authored scenery is not a customer. It has no car, no bay and nowhere to
    // be, and the queue is not a place to put it.
    const sim = new Sim({ seed: 8 });
    const slot = seatInQueue(sim, 0);
    sim.world.customers.at(slot).staged = 1;
    sim.tick();
    expect(sim.world.customers.at(slot).queueIndex).toBe(-1);
  });

  it(
    'never seats more people than it has places',
    () => {
      const sim = new Sim({ seed: 9 });
      for (let tick = 0; tick < TICKS_PER_MINUTE * 15; tick++) {
        sim.tick();
        let queued = 0;
        for (let slot = 0; slot < sim.world.customers.capacity; slot++) {
          if (!sim.world.customers.isActive(slot)) continue;
          if (sim.world.customers.at(slot).queueIndex >= 0) queued++;
        }
        expect(queued, `tick ${tick}`).toBeLessThanOrEqual(STAGE1_LAYOUT.queue.length);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'only ever queues someone who is out of their car',
    () => {
      const sim = new Sim({ seed: 10 });
      for (let tick = 0; tick < TICKS_PER_MINUTE * 15; tick++) {
        sim.tick();
        for (let slot = 0; slot < sim.world.customers.capacity; slot++) {
          if (!sim.world.customers.isActive(slot)) continue;
          const customer = sim.world.customers.at(slot);
          if (customer.queueIndex < 0) continue;
          expect(customer.visible, customerStateName(customer.state)).toBe(1);
        }
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
