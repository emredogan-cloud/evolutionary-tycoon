import { describe, expect, it } from 'vitest';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { ARRIVAL_EPSILON_METRES } from '@config/customer';
import { STATE_QUEUEING_AT_COUNTER, STATE_WALKING_TO_DOOR } from '@sim/ai/fsm/customerFsm';
import { Sim } from '@sim/core/Sim';
import { Rng } from '@sim/core/Rng';

/**
 * The deadlock harness — GAME_EXECUTION_ROADMAP Phase 7, deliverable 7.
 *
 * "The nastiest failure mode in agent systems is a state where nobody can move."
 * It does not crash, it does not throw, and it does not show up in a unit test
 * of any individual piece: separation pushes two agents apart, each push moves
 * the other off its route, and both stand there negotiating forever. What makes
 * it dangerous is that every component is behaving exactly as designed.
 *
 * So: 500 randomised starting configurations, 2 000 ticks each, and in every one
 * of them at least one agent must reach its goal. This is permanent — the
 * roadmap asks for it in the integration suite rather than as a one-off
 * investigation, because the failure returns whenever the steering weights move.
 *
 * ## Why a seeded generator rather than the world's own RNG
 *
 * The scenarios are test input, not simulation state. Drawing them from
 * `world.rng` would consume the streams the simulation is being observed on and
 * make every scenario perturb the thing it is measuring.
 */

const SCENARIOS = 500;
const TICKS_PER_SCENARIO = 2000;
/** Enough agents to crowd Stage 1's entrance; the lot is 24 x 18 m. */
const AGENTS_PER_SCENARIO = 12;

interface Scenario {
  readonly seed: number;
  readonly placed: readonly { x: number; y: number }[];
}

/** Positions drawn on the walkable side of the road, where people can be. */
function buildScenario(seed: number): Scenario {
  const rng = Rng.fromSeed(seed, 'deadlock-scenarios');
  const placed: { x: number; y: number }[] = [];
  for (let i = 0; i < AGENTS_PER_SCENARIO; i++) {
    placed.push({
      x: 1 + rng.next() * (STAGE1_LAYOUT.lot.maxX - 2),
      // Above the road, which is not walkable — see NavGrid.
      y: 9.5 + rng.next() * (STAGE1_LAYOUT.lot.maxY - 11),
    });
  }
  return { seed, placed };
}

/**
 * Drop the agents in, run, and report whether anybody got where they were going.
 *
 * Returns the number that arrived. Zero is the failure the whole harness exists
 * for.
 */
function runScenario(scenario: Scenario): { arrived: number; moved: number } {
  const sim = new Sim({ seed: scenario.seed });
  const slots: number[] = [];

  for (const spot of scenario.placed) {
    const slot = sim.world.customers.acquire();
    if (slot < 0) break;
    const customer = sim.world.customers.at(slot);
    customer.entityId = sim.world.allocateEntityId();
    customer.state = STATE_WALKING_TO_DOOR;
    customer.visible = 1;
    customer.vehicleSlot = -1;
    customer.parkingSlot = -1;
    customer.x = spot.x;
    customer.y = spot.y;
    // Everyone heads for the same place, which is what makes it a crowd.
    customer.targetX = STAGE1_LAYOUT.counter.x;
    customer.targetY = STAGE1_LAYOUT.counter.y - 1;
    slots.push(slot);
  }

  const startX = slots.map((slot) => sim.world.customers.at(slot).x);
  const startY = slots.map((slot) => sim.world.customers.at(slot).y);

  let arrived = 0;
  const reached = new Set<number>();

  /*
   * The full 2 000 ticks every time, with no early exit once somebody arrives.
   * An early exit was tried and removed: it makes the harness answer "did anyone
   * get going" rather than "does this configuration still work after two
   * thousand ticks", and a jam that forms late is exactly the kind this is for.
   */
  for (let tick = 0; tick < TICKS_PER_SCENARIO; tick++) {
    sim.tick();
    for (const slot of slots) {
      if (reached.has(slot)) continue;
      if (!sim.world.customers.isActive(slot)) {
        // Released after abandoning — they got somewhere, which is progress.
        reached.add(slot);
        arrived++;
        continue;
      }
      const customer = sim.world.customers.at(slot);
      /*
       * Queueing counts as arrival. The goal of this crowd is the counter, and
       * a customer who has taken a place in the queue has reached it — the
       * queue slots are *in front of* the counter by construction.
       */
      if (customer.state === STATE_QUEUEING_AT_COUNTER) {
        reached.add(slot);
        arrived++;
      }
    }
  }

  let moved = 0;
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i] ?? -1;
    if (!sim.world.customers.isActive(slot)) {
      moved++;
      continue;
    }
    const customer = sim.world.customers.at(slot);
    const distance = Math.hypot(customer.x - (startX[i] ?? 0), customer.y - (startY[i] ?? 0));
    if (distance > ARRIVAL_EPSILON_METRES) moved++;
  }

  return { arrived, moved };
}

describe('navigation deadlock', () => {
  it('never produces a configuration where nobody can move', () => {
    const failures: string[] = [];
    let totalArrived = 0;
    let totalMoved = 0;

    for (let scenario = 0; scenario < SCENARIOS; scenario++) {
      const result = runScenario(buildScenario(20260815 + scenario * 7919));
      totalArrived += result.arrived;
      totalMoved += result.moved;
      if (result.arrived === 0) {
        failures.push(`seed ${String(20260815 + scenario * 7919)}: nobody reached the counter`);
      }
    }

    expect(
      failures.slice(0, 5),
      `${String(failures.length)} of ${String(SCENARIOS)} scenarios deadlocked`,
    ).toEqual([]);
    // Reported so a run that technically passes but has gone quiet is visible.
    expect(totalArrived).toBeGreaterThan(SCENARIOS);
    expect(totalMoved).toBeGreaterThan(SCENARIOS * 5);
  }, 600_000);

  it('gets a crowd out of a corner rather than jamming in it', () => {
    /*
     * The specific arrangement separation is worst at: everyone in one place,
     * all wanting the same destination. Randomised scenarios rarely produce it
     * and it is exactly where two agents can end up orbiting each other.
     */
    const sim = new Sim({ seed: 4242 });
    const slots: number[] = [];
    for (let i = 0; i < 10; i++) {
      const slot = sim.world.customers.acquire();
      if (slot < 0) break;
      const customer = sim.world.customers.at(slot);
      customer.entityId = sim.world.allocateEntityId();
      customer.state = STATE_WALKING_TO_DOOR;
      customer.visible = 1;
      customer.vehicleSlot = -1;
      customer.parkingSlot = -1;
      // Stacked on one another, to within a centimetre.
      customer.x = 3.5 + i * 0.01;
      customer.y = 15 + i * 0.01;
      customer.targetX = STAGE1_LAYOUT.counter.x;
      customer.targetY = STAGE1_LAYOUT.counter.y - 1;
      slots.push(slot);
    }

    sim.advance(1200);

    let queued = 0;
    for (const slot of slots) {
      if (!sim.world.customers.isActive(slot)) continue;
      if (sim.world.customers.at(slot).queueIndex >= 0) queued++;
    }
    expect(queued, 'a stacked crowd never formed a queue').toBeGreaterThan(0);
  }, 120_000);

  it('separates two agents standing on exactly the same point', () => {
    /*
     * No direction to push along, so without a tie-break they stay stacked
     * forever — a two-agent deadlock the randomised scenarios would almost
     * never generate, because exact float equality is rare by chance and
     * common by construction.
     */
    const sim = new Sim({ seed: 7 });
    const slots = [sim.world.customers.acquire(), sim.world.customers.acquire()];
    for (const slot of slots) {
      const customer = sim.world.customers.at(slot);
      customer.entityId = sim.world.allocateEntityId();
      customer.state = STATE_WALKING_TO_DOOR;
      customer.visible = 1;
      customer.vehicleSlot = -1;
      customer.parkingSlot = -1;
      customer.x = 6;
      customer.y = 14;
      customer.targetX = 6;
      customer.targetY = 14;
    }

    sim.advance(40);

    const first = sim.world.customers.at(slots[0] ?? 0);
    const second = sim.world.customers.at(slots[1] ?? 0);
    const apart = Math.hypot(first.x - second.x, first.y - second.y);
    expect(apart, 'two co-located agents never separated').toBeGreaterThan(0);
  }, 60_000);
});
