import { describe, expect, it } from 'vitest';
import { LEFT_TURN } from '@config/traffic';
import { TICK_MS } from '@config/simulation';
import { Sim } from '@sim/core/Sim';
import { VEHICLE_ON_ROAD } from '@sim/systems/VehicleManeuverSystem';
import { LANE_CHANGE, shouldChangeLane, wouldOscillate } from '@sim/systems/laneChange';
import type { LaneChangeContext } from '@sim/systems/laneChange';
import { EMPLOYEE_ROLES } from '@config/employees';
import { requirementFor } from '@config/progression';
import { hire } from '@sim/systems/StaffSystem';
import { reserveFor } from '@sim/systems/ProgressionSystem';
import { forceClearDay } from '../../../helpers/environment';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import type { StageLayout } from '@config/layouts/stage1';
import { World } from '@sim/core/World';
import { LaneGraph } from '@sim/nav/LaneGraph';
import { VehicleMotionSystem } from '@sim/systems/VehicleMotionSystem';

/**
 * The left turn — Phase 15, GDD §9.1: the far lane's pull-in crosses opposing
 * traffic, forms real congestion, and always clears. Stage-gated to 4 like the
 * events it belongs beside; the measurement that decided that is in the
 * config's own comment.
 */

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
// Coverage instrumentation slows a long advance ~5x; same convention as motion.test.ts.
const LONG_RUN_TIMEOUT_MS = 120_000;

function stage4Sim(seed: number): Sim {
  const sim = new Sim({ seed });
  forceClearDay(sim.world);
  sim.world.progression.stage = 4;
  /*
   * Seeded like a legal arrival, the same way the composition root stages a
   * jump (ADR-014): required roles hired and the reserve in the till. The
   * first draft skipped this and manufactured a world no player can reach —
   * an unstaffed drive-thru never serves, its on-road spill never clears, and
   * the spill squats in the left-turn conflict box forever. The 18-minute
   * "deadlock" that surfaced was that illegal world, not the turn logic.
   */
  for (let stage = 1; stage < 4; stage++) {
    const requirement = requirementFor(stage);
    for (const roleId of requirement?.requiredRoles ?? []) {
      const spec = EMPLOYEE_ROLES.find((role) => role.id === roleId);
      if (spec === undefined) continue;
      sim.world.economy.cash += spec.hireCost;
      hire(sim.world, roleId, 0.5);
    }
    if (requirement !== null) sim.world.economy.cash += reserveFor(sim.world, requirement);
  }
  return sim;
}

describe('left-turn gap acceptance', () => {
  it(
    'below Stage 4, far-lane converts cross as they always have',
    () => {
      const sim = new Sim({ seed: 41 });
      forceClearDay(sim.world);
      sim.advance(TICKS_PER_MINUTE * 8);
      // Nobody is ever held at the mouth: no on-road vehicle sits stopped with
      // a YES decision for long. Sample a window and require motion.
      let heldTicks = 0;
      for (let i = 0; i < TICKS_PER_MINUTE; i++) {
        sim.tick();
        const vehicles = sim.world.vehicles;
        for (let slot = 0; slot < vehicles.scanLimit; slot++) {
          if (!vehicles.isActive(slot)) continue;
          if (vehicles.state[slot] !== VEHICLE_ON_ROAD) continue;
          if (vehicles.decision[slot] === 2 && (vehicles.speed[slot] ?? 1) < 0.05) heldTicks++;
        }
      }
      expect(heldTicks).toBe(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'at Stage 4 the wait happens, the queue forms, and everybody still turns',
    () => {
      const sim = stage4Sim(41);
      let sawWaiter = false;
      let maxWaitMs = 0;
      for (let i = 0; i < TICKS_PER_MINUTE * 12; i++) {
        sim.tick();
        const vehicles = sim.world.vehicles;
        for (let slot = 0; slot < vehicles.scanLimit; slot++) {
          if (!vehicles.isActive(slot)) continue;
          if (vehicles.state[slot] !== VEHICLE_ON_ROAD) continue;
          const wait = vehicles.waitMs[slot] ?? 0;
          if (vehicles.decision[slot] === 2 && wait > 0) {
            sawWaiter = true;
            if (wait > maxWaitMs) maxWaitMs = wait;
          }
        }
      }
      // The phenomenon exists…
      expect(sawWaiter).toBe(true);
      // …and it resolves: nobody waits materially past the patience window, at
      // which point the shrunken gap is small enough that a crossing always
      // opens. A wait far beyond it would be the deadlock this test exists for.
      expect(maxWaitMs).toBeLessThan(LEFT_TURN.patienceMs * 2.5);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'the jam clears: a long Stage 4 run ends with a moving road, not a plug',
    () => {
      const sim = stage4Sim(77);
      sim.advance(TICKS_PER_MINUTE * 20);
      // After twenty minutes, the road still delivers: vehicles keep spawning
      // (a plugged lane head starves spawns) and no waiter is ancient.
      const spawnedAt20 = sim.world.stats.vehiclesSpawned;
      sim.advance(TICKS_PER_MINUTE * 2);
      expect(sim.world.stats.vehiclesSpawned).toBeGreaterThan(spawnedAt20);

      const vehicles = sim.world.vehicles;
      for (let slot = 0; slot < vehicles.scanLimit; slot++) {
        if (!vehicles.isActive(slot)) continue;
        expect(vehicles.waitMs[slot] ?? 0).toBeLessThan(LEFT_TURN.patienceMs * 4);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'vehicles never overlap while the discipline is in force',
    () => {
      const sim = stage4Sim(90210);
      for (let i = 0; i < TICKS_PER_MINUTE * 6; i++) {
        sim.tick();
        const vehicles = sim.world.vehicles;
        // Same invariant the motion suite pins, re-asserted under held turners:
        // per lane, ordered by position, gaps stay positive.
        for (let lane = 0; lane < 2; lane++) {
          const rows: { s: number; len: number }[] = [];
          for (let slot = 0; slot < vehicles.scanLimit; slot++) {
            if (!vehicles.isActive(slot)) continue;
            if (vehicles.state[slot] !== VEHICLE_ON_ROAD) continue;
            if (vehicles.lane[slot] !== lane) continue;
            rows.push({ s: vehicles.laneS[slot] ?? 0, len: 4.5 });
          }
          rows.sort((a, b) => a.s - b.s);
          for (let r = 1; r < rows.length; r++) {
            const gap = (rows[r]?.s ?? 0) - (rows[r - 1]?.s ?? 0);
            expect(gap).toBeGreaterThan(0);
          }
        }
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('lane-change decision layer (inert until a same-direction pair exists)', () => {
  const base: LaneChangeContext = {
    speed: 6,
    desiredSpeed: 13.9,
    currentLeadGap: 12,
    targetLeadGap: 40,
    targetLagGap: 25,
    targetLeadSpeed: 13,
    targetLagSpeed: 10,
  };

  it('changes when frustrated behind a slow leader and the target is safe', () => {
    expect(shouldChangeLane(base)).toBe(true);
  });

  it('stays put when running near its desired speed', () => {
    expect(shouldChangeLane({ ...base, speed: 12 })).toBe(false);
  });

  it('refuses a lead gap that does not physically exist', () => {
    expect(shouldChangeLane({ ...base, targetLeadGap: LANE_CHANGE.minLeadGapMetres - 1 })).toBe(false);
  });

  it('refuses to cut in when the lag driver would have to slam on', () => {
    expect(shouldChangeLane({ ...base, targetLagGap: 7, targetLagSpeed: 15 })).toBe(false);
  });

  it('refuses a lane that is no faster than the one it is leaving', () => {
    expect(shouldChangeLane({ ...base, targetLeadSpeed: 6, targetLeadGap: 20 })).toBe(false);
  });

  it('a symmetric ping-pong is named an oscillation and neither move happens', () => {
    const mirrored: LaneChangeContext = { ...base };
    expect(wouldOscillate(base, mirrored)).toBe(true);
    expect(wouldOscillate(base, { ...base, speed: 12 })).toBe(false);
  });
});

describe('the authored road', () => {
  it(
    'offers no same-direction pair, so no discretionary change can ever fire',
    () => {
      /*
       * The wiring is live and the geometry answers "no" — this is the fact the
       * lane-change layer idles on. The day a multi-lane road is authored, this
       * fails, which is the deliberate reminder to build its goldens and its
       * collision suite before flipping anything else.
       */
      const sim = new Sim({ seed: 1 });
      forceClearDay(sim.world);
      sim.advance(1200 * 10);
      // Ten minutes of live traffic: every vehicle is still on the lane whose
      // heading it spawned with — nobody has crossed into opposing flow.
      const vehicles = sim.world.vehicles;
      for (let slot = 0; slot < vehicles.scanLimit; slot++) {
        if (!vehicles.isActive(slot)) continue;
        expect(vehicles.lane[slot]).toBeLessThan(2);
      }
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('discretionary changes on a synthetic same-direction pair', () => {
  /*
   * The authored road has no such pair (proven above), so the live wiring is
   * exercised here against a synthetic two-lane eastbound layout: the same
   * `VehicleMotionSystem`, a real `World`, and a frustrated follower who has
   * somewhere better to be.
   */
  function twinEastLayout(): StageLayout {
    return {
      ...STAGE1_LAYOUT,
      road: {
        ...STAGE1_LAYOUT.road,
        lanes: [
          {
            id: 'east-inner',
            heading: 'east',
            points: [
              { x: -10, y: 6 },
              { x: 34, y: 6 },
            ],
          },
          {
            id: 'east-outer',
            heading: 'east',
            points: [
              { x: -10, y: 8.5 },
              { x: 34, y: 8.5 },
            ],
          },
        ],
      },
    };
  }

  function motionRig(): { world: World; motion: VehicleMotionSystem } {
    const world = new World({ seed: 5 });
    const lanes = new LaneGraph(twinEastLayout());
    const motion = new VehicleMotionSystem(lanes, world.vehicles.capacity);
    return { world, motion };
  }

  function put(world: World, lane: number, s: number, speed: number, desired = 13.9): number {
    const slot = world.vehicles.spawn(world.allocateEntityId());
    world.vehicles.lane[slot] = lane;
    world.vehicles.laneS[slot] = s;
    world.vehicles.speed[slot] = speed;
    world.vehicles.desiredSpeed[slot] = desired;
    world.vehicles.archetype[slot] = 0;
    return slot;
  }

  it('a held-up follower moves to the empty parallel lane', () => {
    const { world, motion } = motionRig();
    put(world, 0, 20, 1.5, 2); // crawling leader
    const follower = put(world, 0, 10, 3, 13.9); // frustrated behind it

    for (let i = 0; i < 40; i++) motion.run(world, 50);
    expect(world.vehicles.lane[follower]).toBe(1);
  });

  it('refuses the change when it would cut off a fast car in the target lane', () => {
    const { world, motion } = motionRig();
    put(world, 0, 20, 1.5, 2);
    const follower = put(world, 0, 10, 3, 13.9);
    // A fast car bearing down just behind the merge point on the outer lane.
    put(world, 1, 6, 14, 15);

    motion.run(world, 50);
    expect(world.vehicles.lane[follower]).toBe(0);
  });

  it('a satisfied driver stays put even beside an empty lane', () => {
    const { world, motion } = motionRig();
    const cruiser = put(world, 0, 10, 13.5, 13.9);
    for (let i = 0; i < 20; i++) motion.run(world, 50);
    expect(world.vehicles.lane[cruiser]).toBe(0);
  });
});
