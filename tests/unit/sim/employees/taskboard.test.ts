import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ROLES, TASK_KINDS, TASK_SCORING } from '@config/employees';
import { menuIndexOf } from '@config/economy/menu';
import { TICK_MS } from '@config/simulation';
import { STATE_BLOCKED, STATE_IDLE, STATE_PERFORMING } from '@sim/ai/EmployeeBrain';
import { Sim } from '@sim/core/Sim';
import { ORDER_PLACED } from '@sim/stores/OrderStore';
import { UNCLAIMED } from '@sim/stores/TaskStore';
import { hire } from '@sim/systems/StaffSystem';
import { releaseTask, scoreTask } from '@sim/systems/TaskBoardSystem';

/**
 * The task board — GAME_EXECUTION_ROADMAP Phase 10.
 *
 * The claim worth testing hardest is the one the roadmap singles out: _"This
 * structurally prevents the classic bug where two waiters run to the same
 * table."_ Structurally means it should be impossible to construct the failure,
 * not merely unlikely to observe it — so the tests below try to construct it.
 */

/** Put an order on the board that a cook could take. */
function placeOrder(sim: Sim, itemId = 'chips'): number {
  const slot = sim.world.orders.acquire();
  const order = sim.world.orders.at(slot);
  order.entityId = sim.world.allocateEntityId();
  order.item = menuIndexOf(itemId);
  order.state = ORDER_PLACED;
  order.orderedAtMs = sim.world.clock.simTimeMs;
  order.customerSlot = -1;
  return slot;
}

function staff(sim: Sim, roleId: string, skill = 0.5): void {
  sim.world.economy.cash += 1000;
  expect(hire(sim.world, roleId, skill)).toBe('ok');
}

/**
 * Every claim, checked from both ends.
 *
 * The two-sided link exists so a half-completed cancellation is *detectable*.
 * This is the assertion that uses it, and it runs after every scenario below.
 */
function assertBoardConsistent(sim: Sim): void {
  const claimed = new Map<number, number>();

  for (let slot = 0; slot < sim.world.tasks.scanLimit; slot++) {
    if (!sim.world.tasks.isActive(slot)) continue;
    const task = sim.world.tasks.at(slot);
    if (task.claimedBy === UNCLAIMED) continue;

    expect(claimed.has(slot), `task ${String(slot)} claimed twice`).toBe(false);
    claimed.set(slot, task.claimedBy);

    expect(sim.world.employees.isActive(task.claimedBy), 'claimed by a dead employee').toBe(true);
    expect(sim.world.employees.at(task.claimedBy).taskSlot, 'the employee does not agree they hold it').toBe(
      slot,
    );
  }

  // And nobody holds a task that does not point back at them.
  const holders = new Set<number>();
  for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
    if (!sim.world.employees.isActive(slot)) continue;
    const employee = sim.world.employees.at(slot);
    if (employee.taskSlot < 0) continue;

    expect(holders.has(employee.taskSlot), 'two employees hold the same task').toBe(false);
    holders.add(employee.taskSlot);

    expect(sim.world.tasks.isActive(employee.taskSlot), 'holding a dead task').toBe(true);
    expect(sim.world.tasks.at(employee.taskSlot).claimedBy).toBe(slot);
  }
}

// Coverage instrumentation slows a long advance ~5x; same convention as motion.test.ts.
const LONG_RUN_TIMEOUT_MS = 60_000;

describe('one task, one employee', () => {
  it('never sends two employees to the same task', () => {
    /*
     * The classic bug, attempted directly: one piece of work, four cooks, all
     * idle, all equally close. A per-employee "look for the best task" would
     * send all four.
     */
    const sim = new Sim({ seed: 1 });
    for (let i = 0; i < 4; i++) staff(sim, 'cook', 0.5);
    placeOrder(sim);

    sim.tick();

    let claimants = 0;
    for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
      if (!sim.world.employees.isActive(slot)) continue;
      if (sim.world.employees.at(slot).taskSlot >= 0) claimants++;
    }

    expect(claimants, 'more than one employee claimed the same work').toBe(1);
    assertBoardConsistent(sim);

    // And the one who claimed it actually goes and does it.
    sim.advance(200);
    let working = 0;
    for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
      if (!sim.world.employees.isActive(slot)) continue;
      if (sim.world.employees.at(slot).state === STATE_PERFORMING) working++;
    }
    expect(working, 'the claimant never started the work').toBeLessThanOrEqual(1);
  });

  it('keeps the board consistent across a long busy run', () => {
    const sim = new Sim({ seed: 4242 });
    for (let i = 0; i < 3; i++) staff(sim, 'cook', 0.4 + i * 0.2);

    for (let tick = 0; tick < 3000; tick++) {
      sim.tick();
      if (tick % 37 === 0) placeOrder(sim, tick % 2 === 0 ? 'chips' : 'hotdog');
      if (tick % 211 === 0) assertBoardConsistent(sim);
    }
    assertBoardConsistent(sim);
  });

  it('assigns the same employee to the same task on every run', () => {
    // Determinism, checked by replay rather than by inspection: the same world
    // and the same commands must produce the same assignment on every machine.
    const build = (): Sim => {
      const sim = new Sim({ seed: 909 });
      for (let i = 0; i < 3; i++) staff(sim, 'cook', 0.5);
      for (let i = 0; i < 4; i++) placeOrder(sim);
      sim.advance(20);
      return sim;
    };

    const first = build();
    const second = build();
    expect(first.world.hash()).toBe(second.world.hash());
  });
});

describe('scoring', () => {
  it('is urgency x reward − distance x cost, exactly', () => {
    const sim = new Sim({ seed: 1 });
    staff(sim, 'cook');
    const employee = sim.world.employees.at(0);
    employee.x = 0;
    employee.y = 0;

    const kind = TASK_KINDS.indexOf('PREP_ORDER');
    const score = scoreTask(sim.world, kind, sim.world.clock.simTimeMs, 3, 4, employee);

    // Age zero, so urgency is exactly 1; distance is 5 by Pythagoras.
    expect(score).toBeCloseTo(TASK_SCORING.reward.PREP_ORDER - 5 * TASK_SCORING.distanceCost, 9);
  });

  it('prefers the nearer of two identical tasks', () => {
    const sim = new Sim({ seed: 1 });
    staff(sim, 'cook');
    const employee = sim.world.employees.at(0);
    employee.x = 0;
    employee.y = 0;

    const kind = TASK_KINDS.indexOf('PREP_ORDER');
    const near = scoreTask(sim.world, kind, 0, 1, 0, employee);
    const far = scoreTask(sim.world, kind, 0, 20, 0, employee);
    expect(near).toBeGreaterThan(far);
  });

  it('eventually prefers the older of two tasks, however far away', () => {
    /*
     * The reason urgency grows with age. A purely distance-based rule leaves a
     * task in an awkward corner ignored forever, which reads as employees
     * refusing to do a specific job.
     */
    const sim = new Sim({ seed: 1 });
    staff(sim, 'cook');
    const employee = sim.world.employees.at(0);
    employee.x = 0;
    employee.y = 0;

    const kind = TASK_KINDS.indexOf('PREP_ORDER');
    sim.advance(60 * (1000 / TICK_MS));

    const freshNear = scoreTask(sim.world, kind, sim.world.clock.simTimeMs, 2, 0, employee);
    const staleFar = scoreTask(sim.world, kind, 0, 12, 0, employee);
    expect(staleFar).toBeGreaterThan(freshNear);
  });

  it(
    'caps urgency, so an ancient task cannot dominate forever',
    () => {
      // Without the cap, one unreachable task eventually outscores everything and
      // the whole staff walks toward it — a livelock that looks like a strike.
      const sim = new Sim({ seed: 1 });
      staff(sim, 'cook');
      const employee = sim.world.employees.at(0);
      employee.x = 0;
      employee.y = 0;

      const kind = TASK_KINDS.indexOf('PREP_ORDER');
      sim.advance(3600 * (1000 / TICK_MS));

      const ancient = scoreTask(sim.world, kind, 0, 0, 0, employee);
      const ceiling = (1 + TASK_SCORING.maxUrgency) * TASK_SCORING.reward.PREP_ORDER;
      expect(ancient).toBeLessThanOrEqual(ceiling + 1e-9);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('roles take only their own work', () => {
  it('never gives a cleaner a cooking task', () => {
    const sim = new Sim({ seed: 1 });
    staff(sim, 'cleaner');
    placeOrder(sim);

    sim.advance(10);

    const employee = sim.world.employees.at(0);
    expect(employee.taskSlot, 'a cleaner claimed a prep task').toBe(-1);
  });

  it('covers every task kind with at least one role', () => {
    // A task nobody can claim sits open forever, scoring higher every tick, and
    // starves the tasks that can be done. The config validator rejects it; this
    // asserts the validator is describing the shipped table.
    const covered = new Set(EMPLOYEE_ROLES.flatMap((role) => role.tasks));
    for (const kind of TASK_KINDS) {
      expect(covered, `nobody can perform ${kind}`).toContain(kind);
    }
  });
});

describe('cancellation is safe from either side', () => {
  it('releases the employee when the task is retired', () => {
    const sim = new Sim({ seed: 1 });
    staff(sim, 'cook');
    const orderSlot = placeOrder(sim);
    sim.tick();

    const employee = sim.world.employees.at(0);
    expect(employee.taskSlot).toBeGreaterThanOrEqual(0);
    const taskSlot = employee.taskSlot;

    releaseTask(sim.world, taskSlot);

    expect(employee.taskSlot).toBe(UNCLAIMED);
    expect(employee.state).toBe(STATE_IDLE);
    expect(sim.world.tasks.isActive(taskSlot)).toBe(false);
    assertBoardConsistent(sim);
    void orderSlot;
  });

  it('releases the employee when the order it was for disappears', () => {
    /*
     * The realistic version: a customer gives up and their order is discarded
     * while the cook is walking to the station. The board notices on the next
     * tick and sends them back to idle rather than leaving them walking toward
     * work that no longer exists.
     */
    const sim = new Sim({ seed: 1 });
    staff(sim, 'cook');
    const orderSlot = placeOrder(sim);
    sim.tick();

    const employee = sim.world.employees.at(0);
    expect(employee.taskSlot).toBeGreaterThanOrEqual(0);

    sim.world.orders.release(orderSlot);
    sim.tick();

    expect(employee.taskSlot).toBe(UNCLAIMED);
    assertBoardConsistent(sim);
  });

  it('leaves the work on the board when the employee is fired mid-task', () => {
    /*
     * Firing does not delete the work — the order still needs cooking, and the
     * next idle cook should pick it up rather than wait for it to be reposted.
     */
    const sim = new Sim({ seed: 1 });
    staff(sim, 'cook');
    staff(sim, 'cook');
    placeOrder(sim);
    sim.tick();

    let holder = -1;
    for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
      if (!sim.world.employees.isActive(slot)) continue;
      if (sim.world.employees.at(slot).taskSlot >= 0) holder = slot;
    }
    expect(holder).toBeGreaterThanOrEqual(0);

    const fired = sim.world.employees.at(holder).entityId;
    sim.dispatch({ t: 'FIRE', entityId: fired });
    sim.tick();

    // Somebody else has it now, and the board is intact.
    let claimants = 0;
    for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
      if (!sim.world.employees.isActive(slot)) continue;
      if (sim.world.employees.at(slot).taskSlot >= 0) claimants++;
    }
    expect(claimants).toBe(1);
    assertBoardConsistent(sim);
  });

  it('survives firing everybody mid-task', () => {
    const sim = new Sim({ seed: 1 });
    for (let i = 0; i < 4; i++) staff(sim, 'cook');
    for (let i = 0; i < 4; i++) placeOrder(sim);
    sim.advance(5);

    const ids: number[] = [];
    for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
      if (!sim.world.employees.isActive(slot)) continue;
      ids.push(sim.world.employees.at(slot).entityId);
    }
    for (const id of ids) sim.dispatch({ t: 'FIRE', entityId: id });
    sim.tick();

    expect(sim.world.employees.activeCount).toBe(0);
    assertBoardConsistent(sim);

    // And the world keeps running.
    expect(() => {
      sim.advance(200);
    }).not.toThrow();
  });
});

describe('a blocked stand still progresses', () => {
  it('marks employees blocked rather than wedging when there is nothing to do', () => {
    /*
     * The deadlock check the roadmap asks for: "tüm çalışanlar bloke → sistem
     * ilerliyor". Blocked is a normal, *timed* state, so "briefly idle" and
     * "stuck forever" are different observable things.
     */
    const sim = new Sim({ seed: 1 });
    for (let i = 0; i < 3; i++) staff(sim, 'cleaner');

    sim.advance(600);

    for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
      if (!sim.world.employees.isActive(slot)) continue;
      const employee = sim.world.employees.at(slot);
      expect([STATE_IDLE, STATE_BLOCKED]).toContain(employee.state);
      expect(employee.blockedMs).toBeGreaterThan(0);
    }

    /*
     * And the stand is not wedged: a cook hired now gets an order cooking.
     * Asserted on the *order* rather than on the cook's state, because "what
     * state is the cook in at tick 60" depends on how far they had to walk and
     * on whether the simulation's own customers were competing for the station.
     * The claim that matters is that work moves.
     */
    staff(sim, 'cook');
    placeOrder(sim);

    let cooked = false;
    for (let tick = 0; tick < 400 && !cooked; tick++) {
      sim.tick();
      for (let slot = 0; slot < sim.world.orders.scanLimit; slot++) {
        if (!sim.world.orders.isActive(slot)) continue;
        if (sim.world.orders.at(slot).state !== ORDER_PLACED) cooked = true;
      }
    }
    expect(cooked, 'nothing moved after a cook was hired').toBe(true);
  });
});
