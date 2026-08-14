import type { SimSystem, SystemName } from '../core/SystemPipeline';
import { SYSTEM_ORDER } from '../core/SystemPipeline';

/**
 * The eighteen reserved slots, all currently no-ops.
 *
 * Phase 2 builds the machine that will run the game's systems and proves it is
 * deterministic; it does not build the systems. Every slot therefore does
 * nothing yet, and each is replaced in the phase noted beside it in
 * `SYSTEM_ORDER`.
 *
 * Clock advancement deliberately does *not* live in `TimeSystem`. Advancing
 * simulation time is the definition of a tick rather than the behaviour of one
 * system, so `Sim.tick()` owns it; `TimeSystem` is reserved for the gameplay
 * consequences of the hour changing (opening times, the day curve), which arrive
 * with traffic in Phase 5.
 */

/**
 * A single shared instance per slot.
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

const NOOP_SYSTEMS: readonly SimSystem[] = Object.freeze(SYSTEM_ORDER.map(createNoopSystem));

export function createDefaultSystems(): readonly SimSystem[] {
  return NOOP_SYSTEMS;
}
