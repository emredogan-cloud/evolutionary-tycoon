import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import type { SimSystem, SystemName } from '../core/SystemPipeline';
import { SYSTEM_ORDER } from '../core/SystemPipeline';
import type { World } from '../core/World';
import { LaneGraph } from '../nav/LaneGraph';
import { TimeSystem } from './TimeSystem';
import { TrafficSpawnSystem } from './TrafficSpawnSystem';
import { VehicleMotionSystem } from './VehicleMotionSystem';

/**
 * The eighteen reserved slots, filled in as their phases land.
 *
 * Phase 2 built the machine and left every slot a no-op; Phase 5 fills the four
 * traffic slots. The rest still do nothing, and each is replaced in the phase
 * noted beside it in `SYSTEM_ORDER`.
 *
 * Clock advancement deliberately does *not* live in `TimeSystem`. Advancing
 * simulation time is the definition of a tick rather than the behaviour of one
 * system, so `Sim.tick()` owns it; `TimeSystem` carries the gameplay
 * consequences of the hour changing.
 */

/**
 * A single shared instance per empty slot.
 *
 * One frozen object each rather than a fresh closure per construction: the
 * pipeline is rebuilt whenever a `Sim` is constructed, and the benchmark builds
 * thousands of them.
 */
function createNoopSystem(name: SystemName): SimSystem {
  return Object.freeze({
    name,
    run(): void {
      // Reserved slot — see SYSTEM_ORDER for the phase that fills it.
    },
  });
}

const NOOP_SYSTEMS: Readonly<Record<SystemName, SimSystem>> = Object.freeze(
  Object.fromEntries(SYSTEM_ORDER.map((name) => [name, createNoopSystem(name)])),
) as Readonly<Record<SystemName, SimSystem>>;

/**
 * The lane graph is derived from static authored layout, so one instance is
 * shared by every simulation. It holds no mutable state — only geometry and the
 * arc-length tables — and rebuilding it per `Sim` would cost the benchmark
 * thousands of polyline constructions for identical results.
 */
let sharedLanes: LaneGraph | undefined;

export function stage1Lanes(): LaneGraph {
  sharedLanes ??= new LaneGraph(STAGE1_LAYOUT);
  return sharedLanes;
}

export function createDefaultSystems(world: World): readonly SimSystem[] {
  const lanes = stage1Lanes();
  const filled: Partial<Record<SystemName, SimSystem>> = {
    TimeSystem: new TimeSystem(),
    TrafficSpawnSystem: new TrafficSpawnSystem(lanes),
    VehicleMotionSystem: new VehicleMotionSystem(lanes, world.vehicles.capacity),
  };
  return SYSTEM_ORDER.map((name) => filled[name] ?? NOOP_SYSTEMS[name]);
}
