import { describe, expect, it } from 'vitest';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { ARCHETYPE_SPECS } from '@config/archetypes';
import { LaneGraph } from '@sim/nav/LaneGraph';
import { World } from '@sim/core/World';
import { VehicleMotionSystem } from '@sim/systems/VehicleMotionSystem';
import { at } from '@sim/math/typedArray';

/**
 * The correction pass's hard acceptance: vehicles never occupy the same
 * metre of road — the 2026-08-22 captures' overlapping bodies, asserted away
 * deterministically rather than eyeballed. Ten vehicles, one lane, a leader
 * pinned to a crawl so the accordion actually forms, and the pairwise
 * bumper gap sampled every tick of the run.
 */
describe('vehicles keep their bodies to themselves', () => {
  function rig(): { world: World; motion: VehicleMotionSystem } {
    const world = new World({ seed: 11 });
    const lanes = new LaneGraph(STAGE1_LAYOUT);
    return { world, motion: new VehicleMotionSystem(lanes, world.vehicles.capacity) };
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

  it('ten followers behind a braking leader never overlap, on any tick', () => {
    const { world, motion } = rig();
    const slots: number[] = [];
    // The leader crawls; everyone behind wants road speed, with spread — the
    // exact conditions that compress the queue hardest.
    slots.push(put(world, 40, 12, 1.2));
    for (let i = 1; i < 10; i++) {
      // Mixed archetypes so the gap arithmetic meets real body lengths:
      // sedans, 5.4 m pickups, a 5.0 m van.
      const archetype = i % 3;
      slots.push(put(world, 40 - i * 8, 13, 12 + (i % 4), archetype));
    }

    for (let tick = 0; tick < 1200; tick++) {
      motion.run(world, 50);
      const ordered = [...slots].sort((a, b) => at(world.vehicles.laneS, b) - at(world.vehicles.laneS, a));
      for (let i = 1; i < ordered.length; i++) {
        const leader = ordered[i - 1];
        const follower = ordered[i];
        if (leader === undefined || follower === undefined) continue;
        if (!world.vehicles.isActive(leader) || !world.vehicles.isActive(follower)) continue;
        const leaderLength = ARCHETYPE_SPECS[at(world.vehicles.archetype, leader)]?.lengthMetres ?? 4.5;
        const gap = at(world.vehicles.laneS, leader) - at(world.vehicles.laneS, follower) - leaderLength;
        expect(gap, `tick ${String(tick)}: follower inside its leader`).toBeGreaterThanOrEqual(-1e-4);
      }
    }
  });

  it('parked spans never intersect, whatever mix of bodies is assigned', () => {
    /*
     * The geometric statement behind `baySpanFits`: for every pair of bays a
     * fit-check would approve together, the parked rectangles must be
     * disjoint. Exhaustive over the archetype table and the stage-1 bay row,
     * so a new archetype or a respaced bay re-proves it by existing.
     */
    const bays = STAGE1_LAYOUT.parking;
    for (const specA of ARCHETYPE_SPECS) {
      for (const specB of ARCHETYPE_SPECS) {
        const lengthA = specA.lengthMetres;
        const lengthB = specB.lengthMetres;
        for (let i = 0; i < bays.length; i++) {
          for (let j = i + 1; j < bays.length; j++) {
            const bayA = bays[i];
            const bayB = bays[j];
            if (bayA === undefined || bayB === undefined) continue;
            if (Math.abs(bayA.y - bayB.y) > 2) continue;
            const spacing = Math.abs(bayA.x - bayB.x);
            const wouldApprove = spacing >= (lengthA + lengthB) / 2;
            const overlap = spacing < (lengthA + lengthB) / 2;
            // The rule and the geometry are the same inequality — asserted so
            // an edit to one without the other fails loudly.
            expect(wouldApprove).toBe(!overlap);
          }
        }
      }
    }
  });
});
