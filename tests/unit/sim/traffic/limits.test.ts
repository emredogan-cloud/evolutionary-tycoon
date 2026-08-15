import { describe, expect, it } from 'vitest';
import { TICK_MS } from '@config/simulation';
import { EventQueue } from '@sim/core/EventBus';
import { Sim } from '@sim/core/Sim';
import { at, atIn } from '@sim/math/typedArray';
import { LaneGraph } from '@sim/nav/LaneGraph';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { VehicleMotionSystem } from '@sim/systems/VehicleMotionSystem';
import { TrafficSpawnSystem } from '@sim/systems/TrafficSpawnSystem';

/**
 * What traffic does at its limits.
 *
 * Every path here is one the system takes when something has run out — the
 * vehicle store, an event pool, the road itself. They are the paths that only
 * execute under load, which is exactly when nobody is watching a debugger, so
 * they are exercised deliberately rather than left to a busy afternoon in
 * production.
 */

const TICKS_PER_MINUTE = 60_000 / TICK_MS;

describe('when the vehicle store is full', () => {
  it('refuses new arrivals instead of overwriting a live vehicle', () => {
    // A tiny store reaches capacity in seconds, which is the same condition a
    // full-size store hits during a stage-4 jam.
    const sim = new Sim({ seed: 4242, capacities: { vehicles: 3 } });
    sim.world.progression.stage = 4;
    sim.advance(TICKS_PER_MINUTE * 5);

    expect(sim.world.vehicles.activeCount).toBeLessThanOrEqual(3);
    expect(sim.world.traffic.droppedSpawns).toBeGreaterThan(0);
    // And it stays consistent: nothing was written into a slot it did not own.
    const ids = new Set<number>();
    for (let slot = 0; slot < sim.world.vehicles.capacity; slot++) {
      if (!sim.world.vehicles.isActive(slot)) continue;
      ids.add(at(sim.world.vehicles.entityId, slot));
    }
    expect(ids.size).toBe(sim.world.vehicles.activeCount);
  });

  it('keeps running rather than throwing', () => {
    const sim = new Sim({ seed: 1, capacities: { vehicles: 1 } });
    sim.world.progression.stage = 4;
    expect(() => {
      sim.advance(TICKS_PER_MINUTE * 3);
    }).not.toThrow();
  });
});

describe('when both lane heads are blocked', () => {
  it('refuses the arrival and records it', () => {
    const sim = new Sim({ seed: 909, capacities: { vehicles: 40 } });
    sim.world.progression.stage = 4;
    sim.advance(TICKS_PER_MINUTE * 8);
    // Stage 4 runs 3.5x the stage-1 rate down the same two lanes, so refusals
    // are guaranteed — this is the self-limiting behaviour, observed.
    expect(sim.world.traffic.droppedSpawns).toBeGreaterThan(0);
  });
});

describe('the motion system with nothing to do', () => {
  const lanes = new LaneGraph(STAGE1_LAYOUT);

  it('does nothing for a zero-length tick', () => {
    const sim = new Sim({ seed: 7 });
    sim.advance(TICKS_PER_MINUTE);
    const before = sim.world.hash();

    new VehicleMotionSystem(lanes, sim.world.vehicles.capacity).run(sim.world, 0);
    expect(sim.world.hash()).toBe(before);
  });

  it('removes a vehicle parked on a lane that does not exist', () => {
    /*
     * `lane` is a Uint8Array and nothing today writes an out-of-range value, but
     * a save written before a lane was removed would. The first version of the
     * despawn pass indexed straight into the lane graph and threw a RangeError,
     * taking the whole tick loop down; the ordering pass had always skipped such
     * a vehicle, so it would also have sat frozen forever holding a slot.
     */
    const sim = new Sim({ seed: 8 });
    const slot = sim.world.vehicles.spawn(sim.world.allocateEntityId());
    sim.world.vehicles.lane[slot] = 200;
    sim.world.vehicles.desiredSpeed[slot] = 10;

    const system = new VehicleMotionSystem(lanes, sim.world.vehicles.capacity);
    expect(() => {
      system.run(sim.world, TICK_MS);
    }).not.toThrow();
    expect(sim.world.vehicles.isActive(slot)).toBe(false);
  });
});

describe('event pools under pressure', () => {
  it('drops rather than growing when a pool is exhausted', () => {
    /*
     * The pools are fixed size so a busy tick cannot allocate. Exhausting one is
     * survivable and must be *visible* — a silently swallowed event is a sound
     * that never plays or an analytic that never fires, and neither leaves a
     * trace.
     */
    const queue = new EventQueue();
    for (let i = 0; i < 200; i++) queue.emitVehicleSpawned(i, 0, 0);
    expect(queue.dropped).toBeGreaterThan(0);
  });

  it('drops braking and despawn events the same way', () => {
    const queue = new EventQueue();
    for (let i = 0; i < 200; i++) queue.emitVehicleBraked(i, 3);
    expect(queue.dropped).toBeGreaterThan(0);

    const other = new EventQueue();
    for (let i = 0; i < 200; i++) other.emitVehicleDespawned(i, 1);
    expect(other.dropped).toBeGreaterThan(0);
  });

  it('carries the values it was given', () => {
    const queue = new EventQueue();
    queue.emitVehicleSpawned(11, 1, 2);
    queue.emitVehicleBraked(11, 3.5);
    queue.emitVehicleDespawned(11, 1);
    expect([...Array(queue.size).keys()].map((i) => ({ ...queue.at(i) }))).toEqual([
      { t: 'VEHICLE_SPAWNED', entityId: 11, lane: 1, archetype: 2 },
      { t: 'VEHICLE_BRAKED', entityId: 11, decel: 3.5 },
      { t: 'VEHICLE_DESPAWNED', entityId: 11, lane: 1 },
    ]);
  });
});

describe('the render view under pressure', () => {
  it('stops at the buffer rather than writing past it', () => {
    // The actor buffer is sized for every entity kind at once. Filling the
    // vehicle store to capacity exercises the bound.
    const sim = new Sim({ seed: 31, capacities: { vehicles: 8, customers: 2, employees: 2 } });
    for (let i = 0; i < 8; i++) sim.world.vehicles.spawn(sim.world.allocateEntityId());
    const view = sim.readView();
    expect(view.actorCount).toBeLessThanOrEqual(12);
    expect(view.vehicleCount).toBe(8);
  });

  it('gives every vehicle a heading the renderer can use', () => {
    // Sampled across a window rather than at one tick: the stage-1 road is
    // genuinely empty about 40% of the time (PHASE_5_REPORT), so a single read
    // is a coin flip.
    const sim = new Sim({ seed: 606 });
    let checked = 0;
    for (let tick = 0; tick < TICKS_PER_MINUTE * 3; tick++) {
      sim.tick();
      const view = sim.readView();
      for (let i = 0; i < view.actorCount; i++) {
        const actor = view.actors[i];
        if (actor === undefined) continue;
        expect(Math.hypot(actor.headingX, actor.headingY)).toBeCloseTo(1, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('array helpers', () => {
  it('reads inside the range and falls back outside it', () => {
    const typed = new Float32Array([1, 2, 3]);
    expect(at(typed, 1)).toBe(2);
    expect(at(typed, 99)).toBe(0);

    expect(atIn([4, 5], 0)).toBe(4);
    expect(atIn([4, 5], 99)).toBe(0);
    expect(atIn([4, 5], 99, 1)).toBe(1);
  });
});

describe('lane geometry at the edges', () => {
  it('finds a decision point for a lane that passes far from the counter', () => {
    // The refinement loop rejects candidates that fall outside the lane; a lane
    // whose closest approach is at its very start exercises that branch.
    const graph = new LaneGraph({
      ...STAGE1_LAYOUT,
      counter: { x: -100, y: -100 },
    });
    for (const lane of graph.lanes) {
      expect(lane.decisionS).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(lane.decisionS)).toBe(true);
    }
  });

  it('refuses a layout with no lanes at all', () => {
    expect(() => new LaneGraph({ ...STAGE1_LAYOUT, road: { ...STAGE1_LAYOUT.road, lanes: [] } })).toThrow(
      /at least one lane/,
    );
  });
});

describe('the spawn system in isolation', () => {
  it('can be constructed against any lane graph', () => {
    const graph = new LaneGraph(STAGE1_LAYOUT);
    const system = new TrafficSpawnSystem(graph);
    expect(system.name).toBe('TrafficSpawnSystem');
  });
});
