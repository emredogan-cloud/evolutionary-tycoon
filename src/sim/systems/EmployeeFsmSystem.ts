import { TASK_KINDS, role } from '@config/employees';
import { MINIMUM_CASH, UNPAID_GRACE_MS, WAGE_SETTLE_MS } from '@config/economy/wages';
import { releaseToIdle, stepEmployee, taskComplete } from '../ai/EmployeeBrain';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import { recordExpense } from './EconomySystem';
import { startPrep } from './KitchenSystem';
import { releaseEmployeeTask, releaseTask } from './TaskBoardSystem';

/**
 * Employees doing their jobs, and being paid for it — Phase 10.
 *
 * Runs after `TaskBoardSystem` in the declared slot order, so an employee
 * assigned this tick starts walking this tick rather than next. That is the same
 * reasoning as navigation-before-the-customer-FSM in Phase 7 and
 * kitchen-before-service in Phase 8: fifty milliseconds of standing still,
 * repeated at every transition, is what makes a simulation look sluggish
 * without anything being measurably wrong.
 *
 * ## What this system owns and what it does not
 *
 * It owns *time* — walking, working, wages accruing. It does not own what a task
 * means: completing a `PREP_ORDER` calls `startPrep`, which is the kitchen's
 * function, because two implementations of "start cooking" is how the manual and
 * the automatic paths drift apart.
 */
export class EmployeeFsmSystem implements SimSystem {
  readonly name = 'EmployeeFsmSystem' as const;

  run(world: World, deltaMs: number): void {
    if (deltaMs <= 0) return;

    const employees = world.employees;
    if (employees.activeCount > 0) {
      for (let slot = 0; slot < employees.scanLimit; slot++) {
        if (!employees.isActive(slot)) continue;
        const employee = employees.at(slot);

        stepEmployee(world, employee, deltaMs);

        if (taskComplete(world, employee)) {
          this.completeTask(world, slot);
        }
      }
    }

    this.accrueWages(world, deltaMs);
  }

  /**
   * Apply what a finished task means, then clear it.
   *
   * A task whose effect fails — the station filled up while the cook walked over
   * — releases the employee without consuming the task, so the work is retried
   * rather than silently dropped. That is the difference between a cook who
   * looks like they changed their mind and one who looks like they gave up.
   */
  private completeTask(world: World, employeeSlot: number): void {
    const employee = world.employees.at(employeeSlot);
    const taskSlot = employee.taskSlot;
    if (taskSlot < 0 || !world.tasks.isActive(taskSlot)) {
      releaseToIdle(employee);
      return;
    }

    const task = world.tasks.at(taskSlot);
    const kind = TASK_KINDS[task.kind];

    let applied: boolean;
    if (kind === 'PREP_ORDER') {
      applied = startPrep(world, task.subject);
    } else if (kind === 'DELIVER_ORDER') {
      /*
       * Nothing to do. Stage 1's `ServiceSystem` hands a plate over on the same
       * tick it reaches the pass, so a delivery task is completed by the world
       * before a waiter can walk to it. This branch exists, is reachable in
       * Phase 11, and is deliberately not faked into doing something now —
       * PHASE_10_REPORT §6.
       */
      applied = true;
    } else {
      // CLEAN_TABLE — Phase 11 gives the world tables.
      applied = true;
    }

    if (applied) {
      releaseTask(world, taskSlot);
      return;
    }

    // Could not be applied. Give the task back to the board and go idle.
    releaseEmployeeTask(world, employeeSlot);
  }

  /**
   * Wages, per tick, including partial minutes.
   *
   * Accrued exactly and *settled* in batches, because cash is a number the
   * player watches and one that moved twenty times a second would be
   * unreadable. The simulation always knows the exact debt; the HUD sees it
   * settle in steps.
   */
  private accrueWages(world: World, deltaMs: number): void {
    const employees = world.employees;
    if (employees.activeCount === 0) {
      world.staff.settleElapsedMs = 0;
      return;
    }

    const minutes = deltaMs / 60_000;
    for (let slot = 0; slot < employees.scanLimit; slot++) {
      if (!employees.isActive(slot)) continue;
      employees.at(slot).accruedWages += employees.at(slot).wagePerMinute * minutes;
    }

    world.staff.settleElapsedMs += deltaMs;
    if (world.staff.settleElapsedMs < WAGE_SETTLE_MS) return;
    world.staff.settleElapsedMs -= WAGE_SETTLE_MS;

    this.settle(world, deltaMs);
  }

  /** Pay what can be paid; remember what could not. */
  private settle(world: World, deltaMs: number): void {
    const employees = world.employees;

    for (let slot = 0; slot < employees.scanLimit; slot++) {
      if (!employees.isActive(slot)) continue;
      const employee = employees.at(slot);
      const owed = employee.accruedWages;
      if (owed <= 0) continue;

      if (world.economy.cash >= owed) {
        /*
         * Cash never goes below zero — a hard requirement, and a design
         * position rather than a safety check. A tycoon game that can put the
         * player in a hole they cannot dig out of has replaced a decision with
         * a punishment.
         */
        world.economy.cash = Math.max(MINIMUM_CASH, world.economy.cash - owed);
        recordExpense(world, owed);
        employee.accruedWages = 0;
        employee.unpaidMs = 0;
      } else {
        // Partial payment: take what there is, keep the rest owing.
        const paid = Math.max(0, world.economy.cash);
        world.economy.cash = MINIMUM_CASH;
        if (paid > 0) recordExpense(world, paid);
        employee.accruedWages = owed - paid;
        employee.unpaidMs += WAGE_SETTLE_MS + deltaMs;
      }
    }

    this.dismissUnpaid(world);
  }

  /**
   * One employee leaves, highest-paid first, when wages go unpaid too long.
   *
   * Highest-paid first because that is the one whose departure most improves the
   * situation, and because it is the choice a player would make. Ties break on
   * entity id, so the same world always loses the same person — which matters
   * for replay and would otherwise be the one nondeterministic decision in the
   * whole phase.
   *
   * **One** per grace period, not all of them. Losing the entire staff at once
   * to a brief cash dip is a punishment; losing one is a warning that fixes
   * itself if the player responds.
   */
  private dismissUnpaid(world: World): void {
    const employees = world.employees;
    let worstSlot = -1;
    let worstWage = -1;
    let worstId = Number.POSITIVE_INFINITY;

    for (let slot = 0; slot < employees.scanLimit; slot++) {
      if (!employees.isActive(slot)) continue;
      const employee = employees.at(slot);
      if (employee.unpaidMs < UNPAID_GRACE_MS) continue;

      if (
        employee.wagePerMinute > worstWage ||
        (employee.wagePerMinute === worstWage && employee.entityId < worstId)
      ) {
        worstWage = employee.wagePerMinute;
        worstId = employee.entityId;
        worstSlot = slot;
      }
    }

    if (worstSlot < 0) return;

    const leaving = employees.at(worstSlot);
    world.eventQueue.emitEmployeeLeft(leaving.entityId, role(leaving.role).id, 'unpaid');
    releaseEmployeeTask(world, worstSlot);
    employees.release(worstSlot);
    world.stats.employeesLeftUnpaid++;
  }
}
