import { ACTOR_KIND_EMPLOYEE } from '@config/actors';
import { sceneFixture } from '@config/scenes';
import type { Sim } from '@sim/core/Sim';

/**
 * Stage an authored scene by placing actors directly into the simulation's pools.
 *
 * **This is test scaffolding, and it is honest about that.** No system spawns
 * anything until Phase 5, so the arrangements a golden screenshot or a
 * performance measurement needs have to be placed by hand. It bypasses the
 * command log deliberately: a `SPAWN` command would be gameplay machinery built
 * three phases early, and this is initial state rather than a player action.
 *
 * Phase 5 replaces every caller of this with real traffic. When it does, the
 * authored scenes stay — a depth test card is something you construct on
 * purpose, not something you wait for a simulation to produce.
 *
 * Deterministic by construction: fixed data, applied before tick 0, in a fixed
 * order. Seeding the same scene twice produces the same world hash.
 */
export function stageScene(sim: Sim, sceneId: string): number {
  const fixture = sceneFixture(sceneId);
  if (fixture === null) return 0;

  let placed = 0;
  for (const actor of fixture.actors) {
    // Employees and customers are separate pools, so which one an actor lands in
    // follows from its kind rather than from the order it was written in.
    if (actor.kind === ACTOR_KIND_EMPLOYEE) {
      const slot = sim.world.employees.acquire();
      if (slot < 0) continue;
      const record = sim.world.employees.at(slot);
      record.entityId = sim.world.allocateEntityId();
      record.x = actor.x;
      record.y = actor.y;
      record.z = actor.z;
      record.kind = actor.kind;
      placed++;
      continue;
    }

    const slot = sim.world.customers.acquire();
    if (slot < 0) continue;
    const record = sim.world.customers.at(slot);
    record.entityId = sim.world.allocateEntityId();
    record.x = actor.x;
    record.y = actor.y;
    record.z = actor.z;
    record.kind = actor.kind;
    /*
     * Phase 6 made `visible` mean "out of a car and standing in the world", and
     * a staged actor is standing in the world by definition. Without this an
     * authored scene renders empty — which is exactly what happened, and the
     * golden screenshots caught it.
     */
    record.visible = 1;
    /*
     * And not driven by the state machine. A staged actor has no car, no bay
     * and nowhere to be; left unmarked, `CustomerFsmSystem` finds it in the
     * initial state with a target of (0, 0) and walks it to the world origin.
     */
    record.staged = 1;
    placed++;
  }
  return placed;
}
