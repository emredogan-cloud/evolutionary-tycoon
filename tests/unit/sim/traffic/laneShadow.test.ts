import { describe, expect, it } from 'vitest';
import { ARCHETYPE_SPECS } from '@config/archetypes';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { at } from '@sim/math/typedArray';
import { LaneGraph } from '@sim/nav/LaneGraph';
import { VEHICLE_ENTERING, VEHICLE_ON_ROAD } from '@sim/systems/VehicleManeuverSystem';
import { VehicleMotionSystem } from '@sim/systems/VehicleMotionSystem';
import { World } from '@sim/core/World';

/**
 * The 20:34 review's traffic demand, deterministic: a vehicle that commits
 * to the layby keeps its body on the carriageway for the first metres of the
 * turn, and everyone behind must brake for that body — never through it —
 * then continue when it swings clear.
 */
describe('the parking lane shadow', () => {
  function rig(): { world: World; motion: VehicleMotionSystem } {
    const world = new World({ seed: 5 });
    const lanes = new LaneGraph(STAGE1_LAYOUT);
    // Explicitly on: the mechanism is complete and proven here while the
    // config default keeps it dark pending the road/lot decision — see
    // `LANE_SHADOW_ENABLED`.
    return { world, motion: new VehicleMotionSystem(lanes, world.vehicles.capacity, true) };
  }

  function put(world: World, s: number, speed: number, desired: number, archetype = 0): number {
    const slot = world.vehicles.spawn(world.allocateEntityId());
    world.vehicles.lane[slot] = 0;
    world.vehicles.laneS[slot] = s;
    world.vehicles.speed[slot] = speed;
    world.vehicles.desiredSpeed[slot] = desired;
    world.vehicles.archetype[slot] = archetype;
    return slot;
  }

  /** Freeze a leader at the mouth of its entry curve, body still on the lane. */
  function enteringLeader(world: World, laneS: number, bay: number, archetype = 0): number {
    const slot = put(world, laneS, 5, 13.9, archetype);
    world.vehicles.state[slot] = VEHICLE_ENTERING;
    world.vehicles.parkingSlot[slot] = bay;
    world.vehicles.maneuverS[slot] = 0.5; // half a metre into the turn
    return slot;
  }

  for (const followers of [2, 5, 10]) {
    it(`${String(followers)} followers queue behind an entering vehicle and never touch it`, () => {
      const { world, motion } = rig();
      const lanes = new LaneGraph(STAGE1_LAYOUT);
      const entryS = lanes.lane(0).entryS;
      const leader = enteringLeader(world, entryS, 0);
      const slots: number[] = [];
      for (let i = 0; i < followers; i++) {
        // Mixed bodies, mixed appetites — the compressing queue.
        slots.push(put(world, entryS - 10 - i * 9, 13, 12 + (i % 4), i % 3));
      }

      for (let tick = 0; tick < 600; tick++) {
        motion.run(world, 50);
        const leaderRear =
          at(world.vehicles.laneS, leader) -
          (ARCHETYPE_SPECS[at(world.vehicles.archetype, leader)]?.lengthMetres ?? 4.5);
        for (const slot of slots) {
          expect(
            at(world.vehicles.laneS, slot),
            `tick ${String(tick)}: follower drove through the turning body`,
          ).toBeLessThanOrEqual(leaderRear + 1e-4);
        }
      }

      // The nearest follower genuinely queued (it reached the shadow's tail).
      const nearest = Math.max(...slots.map((slot) => at(world.vehicles.laneS, slot)));
      expect(nearest).toBeGreaterThan(entryS - 12);
    });
  }

  it('lifts the shadow once the body swings off the carriageway, and traffic resumes', () => {
    const { world, motion } = rig();
    const lanes = new LaneGraph(STAGE1_LAYOUT);
    const entryS = lanes.lane(0).entryS;
    const leader = enteringLeader(world, entryS, 0);
    const follower = put(world, entryS - 10, 13, 13.9);

    // Queue forms against the shadow.
    for (let tick = 0; tick < 200; tick++) motion.run(world, 50);
    const held = at(world.vehicles.laneS, follower);
    expect(held).toBeLessThan(entryS);
    expect(at(world.vehicles.speed, follower)).toBeLessThan(2);

    // The turn completes: the body leaves the carriageway. The follower must
    // pass the mouth at speed — sampled DURING the run, because a freed car
    // reaches the lane's far end inside these ten seconds and despawns, and a
    // despawned slot's arrays read zero.
    world.vehicles.maneuverS[leader] = 12;
    let passedTheMouth = false;
    let topSpeed = 0;
    for (let tick = 0; tick < 200; tick++) {
      motion.run(world, 50);
      if (!world.vehicles.isActive(follower)) {
        // Off the far end of the lane — 26 m beyond the mouth it was held at.
        passedTheMouth = true;
        break;
      }
      topSpeed = Math.max(topSpeed, at(world.vehicles.speed, follower));
      if (at(world.vehicles.laneS, follower) > entryS) passedTheMouth = true;
    }
    expect(passedTheMouth).toBe(true);
    expect(topSpeed).toBeGreaterThan(6);
  });

  it('never steers the shadow itself', () => {
    const { world, motion } = rig();
    const lanes = new LaneGraph(STAGE1_LAYOUT);
    const leader = enteringLeader(world, lanes.lane(0).entryS, 0);
    const before = at(world.vehicles.maneuverS, leader);
    put(world, lanes.lane(0).entryS - 8, 13, 13.9);
    for (let tick = 0; tick < 100; tick++) motion.run(world, 50);
    // The motion pass moved nothing of the manoeuvre; state stayed ENTERING.
    expect(at(world.vehicles.maneuverS, leader)).toBe(before);
    expect(at(world.vehicles.state, leader)).toBe(VEHICLE_ENTERING);
    expect(at(world.vehicles.state, leader)).not.toBe(VEHICLE_ON_ROAD);
  });
});
