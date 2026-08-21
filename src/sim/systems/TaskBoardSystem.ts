import { euclidean } from '../math/length';
import { PASS, station } from '@config/economy/stations';
import { layoutForStage } from '@config/layouts';
import { TASK_BASE_MS, TASK_KINDS, TASK_SCORING, role } from '@config/employees';
import type { TaskKind } from '@config/employees';
import { assignTask, releaseToIdle, STATE_BLOCKED, STATE_IDLE } from '../ai/EmployeeBrain';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { EmployeeRecord } from '../stores/employees';
import { UNCLAIMED } from '../stores/TaskStore';
import { ORDER_ON_PASS, ORDER_PLACED } from '../stores/OrderStore';
import { nextStartable } from './KitchenSystem';
import { basketReady, firstOrderOf } from './orderBasket';

/**
 * The one place work is decided — GAME_EXECUTION_ROADMAP Phase 10.
 *
 * ## Why central, rather than each employee choosing
 *
 * The classic bug in this genre is two waiters sprinting to the same table. It
 * is not a bug in either waiter: both looked, both saw the best target, both
 * went. It is a bug in *letting them look*. Here a task is claimed by exactly
 * one employee, the claim is recorded on both sides, and an employee who is
 * already claimed is not a candidate — so the failure is unrepresentable rather
 * than unlikely.
 *
 * ## Scoring
 *
 * ```
 *   score = urgency x reward − distance x cost
 *   urgency = 1 + min(maxUrgency, ageSeconds x urgencyPerSecond)
 * ```
 *
 * Urgency grows with age so a task in an awkward corner is eventually worth the
 * walk, which is what stops a distant table being ignored forever by a purely
 * distance-based rule. The weights are config (`TASK_SCORING`), because the
 * roadmap names "the TaskBoard making bad decisions" as a Phase 10 risk and
 * says the mitigation is that the function is tunable.
 *
 * ## Determinism
 *
 * Every scan is in ascending slot order and every tie breaks on entity id.
 * There is no `Math.random`, no `Date.now`, and no iteration over a `Set` of
 * references. Two machines given the same world assign the same employee to the
 * same task, which is what makes an employee-heavy session replayable at all.
 */
export class TaskBoardSystem implements SimSystem {
  readonly name = 'TaskBoardSystem' as const;

  run(world: World, deltaMs: number): void {
    if (deltaMs <= 0) return;

    /*
     * Nobody to work and nothing outstanding: there is no board.
     *
     * Not an optimisation of the common case — it *is* the common case. Every
     * Stage 1 world before the player hires anyone is this one, and posting
     * tasks nobody can claim is pure cost: measured at **57% of a populated
     * tick**, spent entirely on scanning the order pool to describe work that
     * would be thrown away.
     *
     * `tasks.activeCount` is in the condition so a payroll that has just been
     * fired still gets its outstanding claims retired.
     */
    if (world.employees.activeCount === 0 && world.tasks.activeCount === 0) return;

    this.retire(world);
    this.post(world);
    this.assign(world);
  }

  /**
   * Drop tasks whose subject has gone.
   *
   * Before posting and before assigning, so an employee is never sent to a
   * table that vanished on the same tick. The employee holding it is released
   * to IDLE by the same call, which is the "safe cancellation" the roadmap asks
   * for, arriving from the *task's* side.
   */
  private retire(world: World): void {
    for (let slot = 0; slot < world.tasks.scanLimit; slot++) {
      if (!world.tasks.isActive(slot)) continue;
      const task = world.tasks.at(slot);
      if (this.subjectAlive(world, task.kind, task.subject)) continue;
      releaseTask(world, slot);
    }
  }

  /** Is the thing this task is about still there? */
  private subjectAlive(world: World, kind: number, subject: number): boolean {
    const name = TASK_KINDS[kind];
    if (name === 'CLEAN_TABLE') return true; // Phase 11 gives tables; nothing to lose yet.
    if (subject < 0) return false;
    if (!world.orders.isActive(subject)) return false;

    const order = world.orders.at(subject);
    if (name === 'PREP_ORDER') return order.state === ORDER_PLACED;
    if (name === 'DELIVER_ORDER') return order.state === ORDER_ON_PASS;
    return false;
  }

  /**
   * Post whatever work the world currently needs.
   *
   * Derived from world state every tick rather than pushed by the systems that
   * create the need. A push would mean `ServiceSystem` knowing that employees
   * exist; deriving means the board is correct even after a load, where nothing
   * was ever pushed because the session did not run.
   */
  private post(world: World): void {
    /*
     * Both of these are hoisted out of the order loop, and that is not
     * micro-optimisation. `nextStartable` is itself a scan of the order pool,
     * so calling it per order made posting O(orders²) — with a full pool that
     * turned one unit test from milliseconds into **153 seconds**. The
     * already-posted check had the same shape against the task pool.
     */
    const startable = nextStartable(world);
    const capacity = world.orders.capacity;
    this.stamps ??= new Int32Array(TASK_KINDS.length * capacity);
    const stamps = this.stamps;
    // Wraps at 2^31; a collision would need the same key to have been posted
    // exactly two billion ticks ago, which is 3.4 years of play.
    this.stampCounter = (this.stampCounter + 1) | 0;
    const stamp = this.stampCounter;

    for (let slot = 0; slot < world.tasks.scanLimit; slot++) {
      if (!world.tasks.isActive(slot)) continue;
      const task = world.tasks.at(slot);
      if (task.subject < 0 || task.subject >= capacity) continue;
      stamps[task.kind * capacity + task.subject] = stamp;
    }

    for (let slot = 0; slot < world.orders.scanLimit; slot++) {
      if (!world.orders.isActive(slot)) continue;
      const order = world.orders.at(slot);

      if (order.state === ORDER_PLACED) {
        // Only if a station could actually take it. Posting work nobody can do
        // fills the board with tasks that score higher every tick and starves
        // the ones that can be done.
        if (startable >= 0) this.ensureTask(world, 'PREP_ORDER', slot, startable, stamps, stamp);
      } else if (order.state === ORDER_ON_PASS) {
        /*
         * One delivery per **tray**, not per plate — ADR-016. A basket is
         * carried complete (`deliverOrder` refuses a partial one), so posting a
         * task per plate would send a second waiter to a table whose food the
         * first is already carrying. The task is posted on the basket's handle
         * — the customer's lowest order slot — and only once the whole tray is
         * assembled, which is also what stops a waiter walking to a pass that
         * cannot be served from yet.
         */
        if (basketReady(world, order.customerSlot) && firstOrderOf(world, order.customerSlot) === slot) {
          this.ensureTask(world, 'DELIVER_ORDER', slot, startable, stamps, stamp);
        }
      }
    }
  }

  /**
   * Which (kind, subject) pairs already have a task, stamped by tick.
   *
   * A flat `Int32Array` indexed by `kind * capacity + subject`, holding the
   * stamp of the tick it was last seen on. "Already posted" is
   * `stamps[key] === currentStamp`, so nothing is ever cleared.
   *
   * This was a `Set` first, and that cost **123 B/tick against a 32 B budget** —
   * `clear()` and `add()` on a `Set` allocate as the backing table grows and
   * shrinks, every tick, forever. The allocation gate caught it, which is the
   * entire reason the gate exists: nothing was slower in a way anyone would
   * have noticed, and the garbage would have shown up as frame stutter in
   * Phase 12 with no obvious cause.
   *
   * Allocated once, on the first tick that has a world to size it against.
   */
  private stamps: Int32Array | null = null;
  private stampCounter = 0;

  /** Post a task for this subject unless one already exists. */
  private ensureTask(
    world: World,
    kind: TaskKind,
    subject: number,
    startable: number,
    stamps: Int32Array,
    stamp: number,
  ): void {
    const kindIndex = TASK_KINDS.indexOf(kind);
    const key = kindIndex * world.orders.capacity + subject;
    if (stamps[key] === stamp) return;

    const slot = world.tasks.acquire();
    if (slot < 0) return; // Board full. It drains; the work is still there next tick.

    const task = world.tasks.at(slot);
    task.entityId = world.allocateEntityId();
    task.kind = kindIndex;
    task.subject = subject;
    task.claimedBy = UNCLAIMED;
    task.postedAtMs = world.clock.simTimeMs;
    task.durationMs = TASK_BASE_MS[kind];

    const where = this.placeOf(world, kind, startable, subject);
    task.x = where.x;
    task.y = where.y;
    stamps[key] = stamp;
  }

  /** Where the work happens. */
  private placeOf(
    world: World,
    kind: TaskKind,
    startable: number,
    subject: number,
  ): { x: number; y: number } {
    if (kind === 'PREP_ORDER') {
      const free = startable;
      if (free >= 0 && world.orders.isActive(free)) {
        // The station the kitchen would pick. Walking to the pass and then
        // discovering the work is elsewhere is how an employee looks aimless.
        const target = world.orders.at(free);
        if (target.station >= 0) return station(target.station);
      }
      return PASS;
    }
    if (kind === 'DELIVER_ORDER') {
      /*
       * The *table*, not the pass. A waiter walks from wherever they are to the
       * person waiting; routing them to the pass and calling it delivered would
       * make the walk that gives this task its cost disappear.
       */
      const table = tableOfOrder(world, subject);
      if (table !== null) return table;
      return PASS;
    }
    return PASS;
  }

  /**
   * Give the best free task to the best idle employee.
   *
   * One assignment per employee per tick, scanning employees in slot order.
   * Greedy rather than globally optimal, and deliberately: a Hungarian-algorithm
   * assignment would be *better* by a few metres of walking and would make "why
   * did that cook go there" unanswerable to a player watching.
   */
  private assign(world: World): void {
    const employees = world.employees;
    if (employees.activeCount === 0) return;

    for (let slot = 0; slot < employees.scanLimit; slot++) {
      if (!employees.isActive(slot)) continue;
      const employee = employees.at(slot);
      if (employee.state !== STATE_IDLE && employee.state !== STATE_BLOCKED) continue;
      if (employee.taskSlot !== UNCLAIMED) continue;

      const best = this.bestTaskFor(world, employee, slot);
      if (best < 0) {
        // Wanted work, found none. Blocked rather than idle, and timed, so a
        // stand where nobody can do anything is distinguishable from a quiet one.
        employee.state = STATE_BLOCKED;
        continue;
      }

      const task = world.tasks.at(best);
      task.claimedBy = slot;
      assignTask(employee, best, task.x, task.y);
    }
  }

  /** The highest-scoring unclaimed task this employee may take, or -1. */
  private bestTaskFor(world: World, employee: EmployeeRecord, employeeSlot: number): number {
    const accepted = role(employee.role).tasks;
    let bestSlot = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestId = Number.POSITIVE_INFINITY;

    for (let slot = 0; slot < world.tasks.scanLimit; slot++) {
      if (!world.tasks.isActive(slot)) continue;
      const task = world.tasks.at(slot);
      if (task.claimedBy !== UNCLAIMED) continue;

      const kind = TASK_KINDS[task.kind];
      if (kind === undefined || !accepted.includes(kind)) continue;

      const score = scoreTask(world, task.kind, task.postedAtMs, task.x, task.y, employee);
      /*
       * Ties break on the task's entity id, ascending — not on slot, which is a
       * pool detail that depends on allocation history. Two identical tasks
       * posted on the same tick therefore resolve the same way on every machine
       * and after every reload.
       */
      if (score > bestScore || (score === bestScore && task.entityId < bestId)) {
        bestScore = score;
        bestId = task.entityId;
        bestSlot = slot;
      }
    }

    void employeeSlot;
    return bestSlot;
  }
}

/** Where the customer for this order is sitting, or null. */
function tableOfOrder(world: World, orderSlot: number): { x: number; y: number } | null {
  if (!world.orders.isActive(orderSlot)) return null;
  const customerSlot = world.orders.at(orderSlot).customerSlot;
  if (customerSlot < 0 || !world.customers.isActive(customerSlot)) return null;

  const table = world.customers.at(customerSlot).tableSlot;
  if (table < 0) return null;
  return layoutForStage(world.progression.stage).tables[table] ?? null;
}

/**
 * `urgency x reward − distance x cost`, exactly as the roadmap specifies.
 *
 * Exported so the scoring can be tested directly rather than inferred from
 * which employee happened to move.
 */
export function scoreTask(
  world: World,
  kindIndex: number,
  postedAtMs: number,
  x: number,
  y: number,
  employee: EmployeeRecord,
): number {
  const kind = TASK_KINDS[kindIndex];
  if (kind === undefined) return Number.NEGATIVE_INFINITY;

  const ageSeconds = Math.max(0, world.clock.simTimeMs - postedAtMs) / 1000;
  const urgency = 1 + Math.min(TASK_SCORING.maxUrgency, ageSeconds * TASK_SCORING.urgencyPerSecond);
  const reward = TASK_SCORING.reward[kind];
  const distance = euclidean(x - employee.x, y - employee.y);

  return urgency * reward - distance * TASK_SCORING.distanceCost;
}

/**
 * Cancel a task and free whoever held it — the cancellation protocol.
 *
 * Both sides, in one place, callable from either direction. `FIRE` calls it via
 * the employee's `taskSlot`; `retire` calls it when a subject disappears. There
 * is exactly one implementation, so "safe cancellation" is a property of one
 * function rather than a convention three call sites are expected to follow.
 */
export function releaseTask(world: World, taskSlot: number): void {
  if (!world.tasks.isActive(taskSlot)) return;

  const task = world.tasks.at(taskSlot);
  const holder = task.claimedBy;
  if (holder >= 0 && world.employees.isActive(holder)) {
    const employee = world.employees.at(holder);
    if (employee.taskSlot === taskSlot) releaseToIdle(employee);
  }

  task.claimedBy = UNCLAIMED;
  world.tasks.release(taskSlot);
}

/** Free an employee from whatever they hold. Used by `FIRE`. */
export function releaseEmployeeTask(world: World, employeeSlot: number): void {
  if (!world.employees.isActive(employeeSlot)) return;
  const employee = world.employees.at(employeeSlot);
  const taskSlot = employee.taskSlot;
  releaseToIdle(employee);
  if (taskSlot >= 0 && world.tasks.isActive(taskSlot)) {
    const task = world.tasks.at(taskSlot);
    // Unclaimed rather than deleted: the work still needs doing, and the next
    // idle employee should pick it up rather than wait for it to be reposted.
    if (task.claimedBy === employeeSlot) task.claimedBy = UNCLAIMED;
  }
}
