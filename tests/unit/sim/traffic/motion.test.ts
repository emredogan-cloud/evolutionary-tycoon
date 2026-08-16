import { describe, expect, it } from 'vitest';
import { ARCHETYPE_SPECS } from '@config/archetypes';
import { TICK_MS } from '@config/simulation';
import { MAX_SPEED_METRES_PER_SECOND } from '@config/traffic';
import { Sim } from '@sim/core/Sim';
import { stage1Lanes } from '@sim/systems/noop';
import { VEHICLE_ON_ROAD } from '@sim/systems/VehicleManeuverSystem';

/**
 * These tests simulate whole minutes of traffic and inspect every vehicle on
 * every tick, so they are genuinely slow — a second or two normally, and past
 * Vitest's 5 s default under v8 coverage instrumentation on a CI runner. The
 * simulated window is the point of each one, so the timeout moves rather than
 * the window.
 */
const LONG_RUN_TIMEOUT_MS = 60_000;

/**
 * The motion system in the real pipeline — spawn, follow, despawn, recycle.
 *
 * The IDM maths is covered in isolation in `idm.test.ts`; this is about the
 * bookkeeping around it, which is where the bugs that survive to production
 * live: a vehicle overlapping another because the lane ordering was stale, a
 * slot despawned twice, a pool that leaks.
 */

const TICKS_PER_MINUTE = 60_000 / TICK_MS;

interface LaneState {
  lane: number;
  s: number;
  speed: number;
  archetype: number;
  slot: number;
}

/**
 * Vehicles the traffic model is currently responsible for.
 *
 * Phase 6 filters on `VEHICLE_ON_ROAD`. A car mid-manoeuvre keeps the `laneS` it
 * held when it turned off — a real distance on a real lane, and no longer where
 * the car is — so including it reports overlaps between a parked car and the
 * traffic driving past the spot it used to occupy.
 */
function snapshotVehicles(sim: Sim): LaneState[] {
  const vehicles = sim.world.vehicles;
  const out: LaneState[] = [];
  for (let slot = 0; slot < vehicles.capacity; slot++) {
    if (!vehicles.isActive(slot)) continue;
    if ((vehicles.state[slot] ?? 0) !== VEHICLE_ON_ROAD) continue;
    out.push({
      slot,
      lane: vehicles.lane[slot] ?? 0,
      s: vehicles.laneS[slot] ?? 0,
      speed: vehicles.speed[slot] ?? 0,
      archetype: vehicles.archetype[slot] ?? 0,
    });
  }
  return out;
}

describe('vehicle motion in the pipeline', () => {
  it(
    'never overlaps two vehicles on the same lane',
    () => {
      /*
       * Bumper to bumper, over a full simulated hour. The gap is measured against
       * the *leader's* length, which is the same quantity the model uses — a test
       * that used a constant length would pass while motorcycles clipped vans.
       */
      const sim = new Sim({ seed: 13579 });
      let worst = Infinity;

      for (let tick = 0; tick < TICKS_PER_MINUTE * 30; tick++) {
        sim.tick();
        const byLane = new Map<number, LaneState[]>();
        for (const vehicle of snapshotVehicles(sim)) {
          const list = byLane.get(vehicle.lane) ?? [];
          list.push(vehicle);
          byLane.set(vehicle.lane, list);
        }
        for (const list of byLane.values()) {
          list.sort((a, b) => a.s - b.s);
          for (let i = 1; i < list.length; i++) {
            const behind = list[i - 1];
            const ahead = list[i];
            if (behind === undefined || ahead === undefined) continue;
            const leaderLength = ARCHETYPE_SPECS[ahead.archetype]?.lengthMetres ?? 0;
            worst = Math.min(worst, ahead.s - behind.s - leaderLength);
          }
        }
      }

      expect(worst).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'never produces a negative speed or position',
    () => {
      const sim = new Sim({ seed: 24680 });
      for (let tick = 0; tick < TICKS_PER_MINUTE * 20; tick++) {
        sim.tick();
        for (const vehicle of snapshotVehicles(sim)) {
          expect(vehicle.speed).toBeGreaterThanOrEqual(0);
          expect(vehicle.speed).toBeLessThanOrEqual(MAX_SPEED_METRES_PER_SECOND);
          expect(vehicle.s).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(vehicle.s)).toBe(true);
        }
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'only ever moves a vehicle forwards',
    () => {
      // A vehicle thrown backwards by a large negative acceleration would pass
      // through the one behind it and corrupt the lane order permanently.
      const sim = new Sim({ seed: 111213 });
      const previous = new Map<number, number>();

      for (let tick = 0; tick < TICKS_PER_MINUTE * 15; tick++) {
        sim.tick();
        const live = new Set<number>();
        for (const vehicle of snapshotVehicles(sim)) {
          live.add(vehicle.slot);
          const before = previous.get(vehicle.slot);
          if (before !== undefined) expect(vehicle.s).toBeGreaterThanOrEqual(before);
          previous.set(vehicle.slot, vehicle.s);
        }
        for (const slot of [...previous.keys()]) if (!live.has(slot)) previous.delete(slot);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'despawns at the end of the lane and returns the slot to the pool',
    () => {
      const sim = new Sim({ seed: 31415 });
      const lanes = stage1Lanes();
      let despawned = 0;
      sim.events.subscribe((event) => {
        if (event.t === 'VEHICLE_DESPAWNED') despawned++;
      });

      sim.advance(TICKS_PER_MINUTE * 20);

      expect(despawned).toBeGreaterThan(50);
      // Nothing lingers past the end of its lane.
      for (const vehicle of snapshotVehicles(sim)) {
        expect(vehicle.s).toBeLessThan(lanes.lane(vehicle.lane).length);
      }
      // And the pool balances: spawned = despawned + still on the road.
      expect(sim.world.stats.vehiclesSpawned).toBe(despawned + sim.world.vehicles.activeCount);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'reuses slots without leaking them',
    () => {
      // 20 minutes is far more vehicles than the store has slots, so if despawn
      // failed to free them the store would saturate and spawning would stop.
      const sim = new Sim({ seed: 51413 });
      sim.advance(TICKS_PER_MINUTE * 20);
      expect(sim.world.stats.vehiclesSpawned).toBeGreaterThan(sim.world.vehicles.capacity * 2);
      expect(sim.world.vehicles.activeCount).toBeLessThan(sim.world.vehicles.capacity);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'gives every vehicle a distinct entity id',
    () => {
      // Slots are recycled; identities are not. A renderer holding an id must
      // never find it pointing at a different vehicle.
      const sim = new Sim({ seed: 6789 });
      const seen = new Set<number>();
      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.tick();
        for (const vehicle of snapshotVehicles(sim)) {
          seen.add(sim.world.vehicles.entityId[vehicle.slot] ?? -1);
        }
      }
      expect(seen.has(-1)).toBe(false);
      expect(seen.size).toBe(sim.world.stats.vehiclesSpawned);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'marks braking vehicles so the renderer can light them',
    () => {
      /*
       * Asserted on the actor snapshot rather than on a stored enum, because
       * that is the value the renderer actually lights the brake lights from.
       * Phase 5 kept a braking flag in `VehicleStore.state`; Phase 6 needed that
       * field for the lifecycle and braking became derived from `accel`, so this
       * now tests the whole path from the model to the render bridge.
       */
      const sim = new Sim({ seed: 909 });
      const braking = new Set<boolean>();
      for (let tick = 0; tick < TICKS_PER_MINUTE * 20; tick++) {
        sim.tick();
        const view = sim.readView();
        for (let i = 0; i < view.actorCount; i++) {
          const actor = view.actors[i];
          if (actor !== undefined) braking.add(actor.braking);
        }
      }
      // Both occur in a normal run: vehicles accelerate away from the entrance
      // and ease off as they approach the desired speed or a slower leader.
      expect(braking.has(false)).toBe(true);
      expect(braking.has(true)).toBe(true);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  /*
   * Two 30-minute runs, so 72 000 ticks with live traffic on both. About a
   * second normally and past the 5 s default under v8 coverage instrumentation
   * on a CI runner, which is where it first timed out. The window is the point
   * of the test, so the timeout moves rather than the window.
   */
  it('is deterministic over a long run', () => {
    const run = (): string => {
      const sim = new Sim({ seed: 20260815 });
      sim.advance(TICKS_PER_MINUTE * 30);
      return sim.world.hash();
    };
    expect(run()).toBe(run());
  }, 60_000);

  it(
    'keeps vehicles moving at a plausible speed rather than crawling',
    () => {
      /*
       * Averaged over a window, not sampled at one instant. The first version of
       * this test read the road at a single tick and found it **empty** — which is
       * not a fault in the motion model but a real property of stage 1: at 24
       * vehicles per real minute over a 36 m lane, the expected occupancy is about
       * one vehicle, and zero is common. That measurement is reported in
       * PHASE_5_REPORT rather than tuned away here.
       */
      const sim = new Sim({ seed: 2718 });
      let total = 0;
      let samples = 0;
      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.tick();
        for (const vehicle of snapshotVehicles(sim)) {
          total += vehicle.speed;
          samples++;
        }
      }
      expect(samples).toBeGreaterThan(0);
      expect(total / samples).toBeGreaterThan(8);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'measures how full the road actually is',
    () => {
      /*
       * Not a pass/fail on aesthetics — a recorded measurement, because "does the
       * road look alive" is a Phase 5 definition-of-done item and a number is a
       * better basis for that judgement than an impression.
       *
       * Occupancy follows from three approved values that were set independently:
       * the lane is 36 m (stage-1 layout), vehicles travel at ~13.9 m/s (real
       * dimensions), and stage 1 sees 24 arrivals per real minute
       * (ECONOMY_DESIGN §3). Transit takes ~2.6 s, so the expected count on the
       * road is 0.4 x 2.6 = about one.
       */
      const sim = new Sim({ seed: 4242 });
      let occupied = 0;
      let empty = 0;
      let peak = 0;
      const ticks = TICKS_PER_MINUTE * 12;
      for (let tick = 0; tick < ticks; tick++) {
        sim.tick();
        const count = sim.world.vehicles.activeCount;
        if (count === 0) empty++;
        else occupied++;
        peak = Math.max(peak, count);
      }

      /*
       * Asserted loosely and deliberately: this pins the order of magnitude so a
       * future change to the rate, the speed or the lane length has to come here
       * and update the number consciously.
       *
       * **Updated consciously in Phase 12.** The bound was 12 and the arrival
       * rate was 24 attempted per real minute, of which the road delivered 19.
       * Phase 12 raised the attempted rate to 28 so the *delivered* rate is the
       * 24 the economy is calibrated on (ECONOMY_DESIGN §3), and halved the
       * decorative multiplier so the extra arrivals are demand rather than
       * scenery. Measured after that change: peak 12, mean 5.2 on the road.
       */
      expect(peak).toBeGreaterThan(0);
      expect(peak).toBeLessThan(16);
      expect(empty + occupied).toBe(ticks);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
