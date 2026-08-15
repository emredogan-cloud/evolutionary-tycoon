import { describe, expect, it } from 'vitest';
import { ENTRY_APPROACH_SPEED } from '@config/customer';
import { BRAKE_LIGHT_DECEL } from '@config/traffic';
import { TICK_MS } from '@config/simulation';
import { Sim } from '@sim/core/Sim';
import { DECISION_YES } from '@sim/systems/ConversionSystem';
import { VEHICLE_ON_ROAD } from '@sim/systems/VehicleManeuverSystem';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const LONG_RUN_TIMEOUT_MS = 60_000;

/**
 * "The single most important moment in the game is a car braking and turning in
 * because of something the player built. Give it weight."
 * — GAME_EXECUTION_ROADMAP Phase 6.
 *
 * Whether it *lands* is a judgement that needs real art and motion, and Phase 4
 * generated none (PHASE_4_REPORT §11), so this suite does not pretend to make
 * it. What it does instead is measure the things the judgement would rest on: a
 * deceleration long enough to read as a decision, brake lights that come on for
 * long enough to see, and traffic behind that reacts. Those are the mechanics of
 * weight, and they are checkable now.
 */
describe('the conversion moment', () => {
  it(
    'slows a committed driver over a real distance, not in one tick',
    () => {
      const sim = new Sim({ seed: 4242 });
      /** entityId -> speeds observed from the decision to leaving the road. */
      const traces = new Map<number, number[]>();

      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.tick();
        const vehicles = sim.world.vehicles;
        for (let slot = 0; slot < vehicles.scanLimit; slot++) {
          if (!vehicles.isActive(slot)) continue;
          if ((vehicles.decision[slot] ?? 0) !== DECISION_YES) continue;
          if ((vehicles.state[slot] ?? 0) !== VEHICLE_ON_ROAD) continue;
          const id = vehicles.entityId[slot] ?? 0;
          const trace = traces.get(id) ?? [];
          trace.push(vehicles.speed[slot] ?? 0);
          traces.set(id, trace);
        }
      }

      const usable = [...traces.values()].filter((trace) => trace.length > 2);
      expect(usable.length, 'no vehicle was observed approaching the entrance').toBeGreaterThan(3);

      let sloweddown = 0;
      let ticksBraking = 0;
      for (const trace of usable) {
        const first = trace[0] ?? 0;
        const last = trace[trace.length - 1] ?? 0;
        if (last < first) sloweddown++;
        ticksBraking += trace.length;
      }

      // Every one of them arrives at the turn slower than it was going.
      expect(sloweddown).toBe(usable.length);

      /*
       * And it takes time. Half a second is twelve ticks at 20 Hz — enough for
       * a player to see brake lights, register them, and look at what the car is
       * doing. A deceleration compressed into one or two ticks would be a
       * teleport with extra steps.
       */
      const meanTicks = ticksBraking / usable.length;
      expect(meanTicks, `mean ${meanTicks.toFixed(1)} ticks between decision and turn`).toBeGreaterThan(10);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'arrives at the entrance slowly enough to turn, and never stops short',
    () => {
      /*
       * The failure this replaces was silent and total: modelling the entrance
       * as a slow vehicle made IDM keep its standstill gap, so a committed car
       * came to rest 2.4 m short of the turn and sat there braking at zero speed
       * forever. Both lanes backed up behind it.
       */
      const sim = new Sim({ seed: 4242 });
      const arrivals: number[] = [];
      const previousSpeed = new Map<number, number>();

      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        const before = new Map<number, number>();
        const vehicles = sim.world.vehicles;
        for (let slot = 0; slot < vehicles.scanLimit; slot++) {
          if (!vehicles.isActive(slot)) continue;
          before.set(vehicles.entityId[slot] ?? 0, vehicles.state[slot] ?? 0);
          previousSpeed.set(vehicles.entityId[slot] ?? 0, vehicles.speed[slot] ?? 0);
        }

        sim.tick();

        for (let slot = 0; slot < vehicles.scanLimit; slot++) {
          if (!vehicles.isActive(slot)) continue;
          const id = vehicles.entityId[slot] ?? 0;
          const wasOnRoad = before.get(id) === VEHICLE_ON_ROAD;
          const nowTurning = (vehicles.state[slot] ?? 0) !== VEHICLE_ON_ROAD;
          if (wasOnRoad && nowTurning) arrivals.push(previousSpeed.get(id) ?? 0);
        }
      }

      expect(arrivals.length).toBeGreaterThan(3);
      for (const speed of arrivals) {
        // Still rolling — nobody stopped dead at the entrance.
        expect(speed, 'a car reached the turn at a standstill').toBeGreaterThan(0);
        // And slowly enough that the turn is plausible. The approach target is
        // 2.8 m/s; the margin allows for a car that was already slow behind a
        // leader and never needed to brake for the entrance at all.
        expect(speed).toBeLessThan(ENTRY_APPROACH_SPEED * 2.5);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'lights the brakes for long enough to be seen',
    () => {
      // Through the actor snapshot, because that is the value the renderer reads.
      const sim = new Sim({ seed: 909 });
      let brakingFrames = 0;
      let frames = 0;

      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.tick();
        const view = sim.readView();
        for (let i = 0; i < view.actorCount; i++) {
          const actor = view.actors[i];
          if (actor === undefined) continue;
          frames++;
          if (actor.braking) brakingFrames++;
        }
      }

      expect(frames).toBeGreaterThan(0);
      const share = brakingFrames / frames;
      /*
       * Braking is meant to be an event, not a state. Somewhere between rare
       * and constant: too little and the road is a conveyor belt, too much and
       * the brake lights stop meaning anything.
       */
      expect(share, `${(share * 100).toFixed(1)}% of actor-frames were braking`).toBeGreaterThan(0.01);
      expect(share, `${(share * 100).toFixed(1)}% of actor-frames were braking`).toBeLessThan(0.6);
      expect(BRAKE_LIGHT_DECEL).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'makes the traffic behind react — the wave is the visible consequence',
    () => {
      /*
       * The reason the approach deceleration goes through `accel` and the
       * ordinary follower model rather than being scripted in the manoeuvre
       * system. A car slowing to turn in sends a braking wave back up the road,
       * and that wave is what tells a player, without any UI, that their stand
       * is affecting the world.
       */
      const sim = new Sim({ seed: 4242 });
      let wavesObserved = 0;

      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.tick();
        const vehicles = sim.world.vehicles;

        for (let slot = 0; slot < vehicles.scanLimit; slot++) {
          if (!vehicles.isActive(slot)) continue;
          if ((vehicles.decision[slot] ?? 0) !== DECISION_YES) continue;
          if ((vehicles.state[slot] ?? 0) !== VEHICLE_ON_ROAD) continue;

          const lane = vehicles.lane[slot] ?? 0;
          const s = vehicles.laneS[slot] ?? 0;

          // Anyone on the same lane, behind, and within a few car lengths.
          for (let other = 0; other < vehicles.scanLimit; other++) {
            if (other === slot || !vehicles.isActive(other)) continue;
            if ((vehicles.state[other] ?? 0) !== VEHICLE_ON_ROAD) continue;
            if ((vehicles.lane[other] ?? 0) !== lane) continue;
            const gap = s - (vehicles.laneS[other] ?? 0);
            if (gap <= 0 || gap > 25) continue;
            if ((vehicles.accel[other] ?? 0) < -BRAKE_LIGHT_DECEL) wavesObserved++;
          }
        }
      }

      expect(wavesObserved, 'no vehicle ever braked behind one that was turning in').toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
