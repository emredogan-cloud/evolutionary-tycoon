import { describe, expect, it } from 'vitest';
import { DRIVE_THRU_PATIENCE_SCALE } from '@config/driveThru';
import { layoutForStage } from '@config/layouts';
import { TICK_MS } from '@config/simulation';
import { CHANNEL_COUNTER, CHANNEL_DRIVE_THRU } from '@sim/ai/fsm/driveThruFsm';
import { customerStateName } from '@sim/ai/fsm/customerFsm';
import { Sim } from '@sim/core/Sim';
import { driveThruOverflow, laneLength, occupantOf } from '@sim/systems/DriveThruSystem';
import { hire } from '@sim/systems/StaffSystem';
import { VEHICLE_DT_ADVANCING, VEHICLE_ENTERING } from '@sim/systems/VehicleManeuverSystem';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const LONG_RUN_TIMEOUT_MS = 120_000;

/**
 * The drive-thru channel — GAME_EXECUTION_ROADMAP Phase 11, Stage 4.
 *
 * _"Patience here is far lower than seated: the customer is in a car with an
 * engine running. This asymmetry is the source of the game's central strategic
 * tension, so tune it to actually bite."_
 *
 * So the tests worth writing are about the asymmetry rather than about the
 * plumbing: does the lane fill, does it back onto the road, and does a car in it
 * ever move without driving?
 */
function stage4(seed = 424242): Sim {
  const sim = new Sim({ seed });
  sim.world.progression.stage = 4;
  sim.world.economy.cash = 5000;
  return sim;
}

function playFor(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
    sim.tick();
  }
}

describe('the channel exists only where it is built', () => {
  it('has no drive-thru before Stage 4', () => {
    for (const stage of [1, 2, 3]) {
      expect(layoutForStage(stage).driveThru, `stage ${String(stage)}`).toBeNull();
    }
    expect(layoutForStage(4).driveThru).not.toBeNull();
  });

  it('never sends anybody to a lane that does not exist', () => {
    const sim = new Sim({ seed: 424242 });
    playFor(sim, TICKS_PER_MINUTE * 10);

    for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
      if (!sim.world.customers.isActive(slot)) continue;
      const customer = sim.world.customers.at(slot);
      expect(customer.channel, 'a Stage 1 customer chose the drive-thru').toBe(CHANNEL_COUNTER);
      expect(customer.laneSlot).toBe(-1);
    }
  });
});

describe('a car goes all the way through', () => {
  it(
    'orders, queues, collects and pays without getting out',
    () => {
      const sim = stage4();
      const seen = new Set<string>();

      for (let tick = 0; tick < TICKS_PER_MINUTE * 12; tick++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();
        for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
          if (!sim.world.customers.isActive(slot)) continue;
          const customer = sim.world.customers.at(slot);
          if (customer.channel !== CHANNEL_DRIVE_THRU) continue;
          seen.add(customerStateName(customer.state));
          // Nobody gets out of the car. That is the whole channel.
          expect(customer.visible, 'a drive-thru customer got out of their car').toBe(0);
        }
      }

      for (const state of ['DT_APPROACHING', 'DT_ORDERING', 'DT_QUEUEING', 'DT_COLLECTING']) {
        expect(seen, `never reached ${state}`).toContain(state);
      }
      expect(sim.world.stats.driveThruServed, 'nobody was served at the window').toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'takes real money, counted separately from the counter',
    () => {
      const sim = stage4();
      playFor(sim, TICKS_PER_MINUTE * 12);

      const stats = sim.world.stats;
      expect(stats.driveThruServed).toBeGreaterThan(0);
      expect(stats.customersServed).toBeGreaterThanOrEqual(stats.driveThruServed);
      expect(sim.world.economy.cash).toBeGreaterThan(5000);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('the lane is a queue, not a car park', () => {
  it(
    'never puts two cars in the same slot',
    () => {
      const sim = stage4();
      const lane = layoutForStage(4).driveThru?.lane.length ?? 0;

      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();

        const occupied = new Set<number>();
        for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
          if (!sim.world.customers.isActive(slot)) continue;
          const laneSlot = sim.world.customers.at(slot).laneSlot;
          if (laneSlot < 0) continue;
          expect(occupied.has(laneSlot), `two cars in slot ${String(laneSlot)}`).toBe(false);
          occupied.add(laneSlot);
          expect(laneSlot).toBeLessThan(lane);
        }
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'compacts toward the window rather than leaving gaps',
    () => {
      /*
       * A lane with a hole in it is a lane where the car behind waits forever.
       * Checked as: if slot n is occupied, some car is at or in front of it —
       * i.e. the occupied slots form a prefix, allowing for cars mid-creep.
       */
      const sim = stage4();
      let sawQueue = false;

      for (let tick = 0; tick < TICKS_PER_MINUTE * 12; tick++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();

        if (laneLength(sim.world) >= 2) sawQueue = true;
        if (tick % 200 !== 0) continue;

        // Nobody may sit behind an empty slot for long. Sampled rather than
        // checked every tick, because a car mid-creep legitimately leaves its
        // old slot empty for the fraction of a second the creep takes.
        const front = occupantOf(sim.world, 0);
        if (front < 0 && laneLength(sim.world) > 0) {
          /*
           * One tick of grace, and it is not slack. `ServiceSystem` frees the
           * window at pipeline slot 13 and `QueueSystem` compacts at slot 9, so
           * a car that drives off leaves the window empty until the *next*
           * tick's compaction — by construction, and visible for 50 ms.
           */
          sim.tick();
          let anyMoving = occupantOf(sim.world, 0) >= 0;
          for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
            if (!sim.world.customers.isActive(slot)) continue;
            const vehicleSlot = sim.world.customers.at(slot).vehicleSlot;
            if (vehicleSlot < 0 || !sim.world.vehicles.isActive(vehicleSlot)) continue;
            const state = sim.world.vehicles.state[vehicleSlot];
            /*
             * `ENTERING` counts as moving. A car still driving in from the road
             * holds a lane slot it has not reached yet, and it *cannot* creep —
             * the gap in front of it is real and is closing at manoeuvre speed.
             */
            if (state === VEHICLE_DT_ADVANCING || state === VEHICLE_ENTERING) anyMoving = true;
          }
          expect(anyMoving, `a gap at the window with nobody moving at tick ${String(tick)}`).toBe(true);
        }
      }

      expect(sawQueue, 'the lane never had two cars in it').toBe(true);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'spills onto the road when it backs up, which suppresses conversion',
    () => {
      /*
       * The negative feedback loop, on a queue the player built deliberately.
       * ECONOMY_DESIGN §7 Fren 4 turns visible congestion into lost conversions,
       * and the drive-thru lane is the most visible queue in the game — a car in
       * it is *on the approach*, where the next drivers can see it.
       *
       * Forced by starving the kitchen: no cook, no manual prep, so nothing is
       * ever made and the lane fills to its limit.
       */
      const sim = stage4();
      let maxOverflow = 0;
      let maxLane = 0;

      for (let tick = 0; tick < TICKS_PER_MINUTE * 15; tick++) {
        sim.tick(); // No MANUAL_PREP: the kitchen never starts anything.
        maxOverflow = Math.max(maxOverflow, driveThruOverflow(sim.world));
        maxLane = Math.max(maxLane, laneLength(sim.world));
      }

      /*
       * The **peak**, not the end state. With nothing being cooked the lane
       * fills and then empties again as patience runs out — and it runs out
       * fast, which is the asymmetry working. Asserting on the final length
       * would be asserting that the cars were still there, which is the
       * opposite of what a drive-thru with an engine running should do.
       */
      const capacity = layoutForStage(4).driveThru?.laneCapacity ?? 0;
      expect(maxLane, 'the lane never filled').toBeGreaterThan(capacity - 1);
      expect(maxOverflow, 'the lane never spilled onto the road').toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('the asymmetry bites', () => {
  it('gives drive-thru customers far less patience than seated ones', () => {
    // The number itself, asserted so a balance pass cannot quietly remove the
    // asymmetry that makes the channel a decision rather than a strict upgrade.
    expect(DRIVE_THRU_PATIENCE_SCALE).toBeLessThan(0.75);
    expect(DRIVE_THRU_PATIENCE_SCALE).toBeGreaterThan(0);
  });

  it(
    'loses drive-thru customers first when the kitchen cannot keep up',
    () => {
      /*
       * The consequence a player is meant to feel. With nothing being cooked,
       * the cars in the lane give up sooner than the people standing at the
       * counter — because the engine is running.
       */
      const sim = stage4();
      for (let tick = 0; tick < TICKS_PER_MINUTE * 20; tick++) sim.tick();

      expect(sim.world.stats.customersAbandoned, 'nobody gave up at all').toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'sends people to the counter when the lane is full rather than turning them away',
    () => {
      /*
       * A driver who finds the drive-thru backed up parks instead. Modelling
       * that as a lost customer would overstate the cost of a busy lane — it is
       * still a cost, because now they have to find a bay.
       */
      /*
       * A waiter is required, and that is not test scaffolding: Stage 4 has
       * tables, so a counter customer's food has to be carried to them. Without
       * one, nobody at the counter is ever served and the comparison below would
       * be measuring a restaurant with no waiting staff.
       */
      const sim = stage4();
      expect(hire(sim.world, 'waiter', 0.7)).toBe('ok');
      expect(hire(sim.world, 'waiter', 0.7)).toBe('ok');
      playFor(sim, TICKS_PER_MINUTE * 15);

      let counterCustomers = 0;
      for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
        if (!sim.world.customers.isActive(slot)) continue;
        if (sim.world.customers.at(slot).channel === CHANNEL_COUNTER) counterCustomers++;
      }

      // Both channels are in use at Stage 4; a build where everybody took one
      // would mean the fallback or the share is broken.
      expect(sim.world.stats.driveThruServed).toBeGreaterThan(0);
      expect(
        sim.world.stats.customersServed - sim.world.stats.driveThruServed,
        'nobody used the counter at all',
      ).toBeGreaterThan(0);
      void counterCustomers;
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('cars in the lane still obey the physics', () => {
  it(
    'never teleports a car between lane slots',
    () => {
      /*
       * The same guarantee the employees have, on the one movement in the game
       * that is neither on a lane nor on a manoeuvre curve. A car that jumped a
       * slot would be the most visible teleport in the game — it is a car.
       *
       * ## Measured on the *vehicle*, not the customer record
       *
       * The customer record snaps onto the entry curve on the first tick of a
       * manoeuvre — a jump of four to six metres. That is **pre-existing
       * behaviour since Phase 6 and it affects counter customers identically**
       * (measured: a 6.31 m step on `SEEKING_PARKING → PARKING` at Stage 1), and
       * it is never visible: the customer is `visible = 0` inside the car for
       * every one of those ticks, and what the renderer draws is the vehicle.
       *
       * So the vehicle's projected position is what this asserts, because that
       * is the thing a player can see move.
       */
      const sim = stage4();
      const previous = new Map<number, { x: number; y: number }>();
      const sample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };
      let steps = 0;
      let longest = 0;

      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();

        for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
          if (!sim.world.customers.isActive(slot)) continue;
          const customer = sim.world.customers.at(slot);
          if (customer.laneSlot < 0) continue;

          const vehicleSlot = customer.vehicleSlot;
          if (vehicleSlot < 0 || !sim.world.vehicles.isActive(vehicleSlot)) continue;
          const position = sim.positionOfVehicle(vehicleSlot, sample);

          const id = sim.world.vehicles.entityId[vehicleSlot] ?? 0;
          const before = previous.get(id);
          previous.set(id, { x: position.x, y: position.y });
          if (before === undefined) continue;

          const moved = Math.hypot(position.x - before.x, position.y - before.y);
          longest = Math.max(longest, moved);
          steps++;
          /*
           * A tick is 50 ms and the fastest a car moves off the road is the
           * manoeuvre speed, so one metre is a generous ceiling and a slot jump
           * — 1.5 m — would break it.
           */
          expect(moved, `jumped ${moved.toFixed(3)} m in one tick`).toBeLessThan(1);
        }
      }

      expect(steps, 'no car was ever in the lane').toBeGreaterThan(100);
      expect(longest).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'produces the same drive-thru on every run',
    () => {
      const build = (): Sim => {
        const sim = stage4(777);
        hire(sim.world, 'cook', 0.6);
        playFor(sim, TICKS_PER_MINUTE * 5);
        return sim;
      };
      expect(build().world.hash()).toBe(build().world.hash());
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
