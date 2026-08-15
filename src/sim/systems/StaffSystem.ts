import { PASS } from '@config/economy/stations';
import { EMPLOYEE_ROLES, MAX_EMPLOYEES, role } from '@config/employees';
import { STATE_IDLE } from '../ai/EmployeeBrain';
import type { World } from '../core/World';
import { releaseEmployeeTask } from './TaskBoardSystem';

/**
 * Hiring and firing — the simulation's half of `HIRE` and `FIRE`.
 *
 * Free functions rather than a pipeline system, for the reason the kitchen's
 * are: a command handler cannot reach a system instance without `World` owning
 * one, which is a cycle. There is no per-tick work here either — an employee
 * exists or does not, and everything that happens to them afterwards belongs to
 * `EmployeeFsmSystem`.
 *
 * ## Why the outcome is an enum rather than a throw
 *
 * Refusing is normal. The player clicks hire with ₡3, or the payroll is full,
 * or a save written by a build with a role this one does not have is replayed.
 * None of those is exceptional, and a command handler that threw on any of them
 * would take the tick down with it.
 */

export type HireOutcome = 'ok' | 'unknown-role' | 'unaffordable' | 'full';
export type FireOutcome = 'ok' | 'not-found';

/**
 * Take somebody on.
 *
 * They start beside the pass, idle. Not at the origin — an employee who
 * materialises at (0, 0) and walks in has to cross the road, which looks like a
 * bug even though the walk itself is honest.
 */
export function hire(world: World, roleId: string, skill: number): HireOutcome {
  let roleIndex = -1;
  for (let i = 0; i < EMPLOYEE_ROLES.length; i++) {
    if (EMPLOYEE_ROLES[i]?.id === roleId) roleIndex = i;
  }
  if (roleIndex < 0) return 'unknown-role';

  if (world.employees.activeCount >= MAX_EMPLOYEES) return 'full';

  const spec = role(roleIndex);
  if (world.economy.cash < spec.hireCost) return 'unaffordable';

  const slot = world.employees.acquire();
  if (slot < 0) return 'full';

  world.economy.cash -= spec.hireCost;
  world.economy.lifetimeSpend += spec.hireCost;

  const employee = world.employees.at(slot);
  employee.entityId = world.allocateEntityId();
  employee.role = roleIndex;
  employee.state = STATE_IDLE;
  employee.taskSlot = -1;
  // Clamped rather than trusted: `skill` arrives on a command, and a command
  // arrives from a log this build did not write.
  employee.skill = Math.min(1, Math.max(0, skill));
  employee.wagePerMinute = spec.baseWagePerMinute * (1 + employee.skill * 0.6);
  employee.accruedWages = 0;
  employee.unpaidMs = 0;
  employee.x = PASS.x;
  employee.y = PASS.y - 0.8;
  employee.z = 0;

  world.eventQueue.emitEmployeeHired(employee.entityId, spec.id, spec.hireCost);
  return 'ok';
}

/**
 * Let somebody go, mid-task or not.
 *
 * The task goes back on the board unclaimed rather than being deleted — the work
 * still needs doing, and the next idle employee should pick it up rather than
 * wait for it to be reposted. That is the "safe cancellation" the roadmap asks
 * for, arriving from the *employee's* side; `releaseTask` is the same protocol
 * arriving from the task's.
 *
 * Accrued wages are **not** paid out. A player who fires someone the instant
 * before payday to avoid the bill is doing something the game should not
 * reward, and forgiving the debt is simpler than modelling severance.
 */
export function fire(world: World, entityId: number): FireOutcome {
  const employees = world.employees;
  for (let slot = 0; slot < employees.scanLimit; slot++) {
    if (!employees.isActive(slot)) continue;
    const employee = employees.at(slot);
    if (employee.entityId !== entityId) continue;

    const roleId = role(employee.role).id;
    releaseEmployeeTask(world, slot);
    employees.release(slot);
    world.eventQueue.emitEmployeeLeft(entityId, roleId, 'fired');
    return 'ok';
  }
  return 'not-found';
}

/** Total wage bill per game minute, for the staff panel and the HUD. */
export function payrollPerMinute(world: World): number {
  let total = 0;
  const employees = world.employees;
  for (let slot = 0; slot < employees.scanLimit; slot++) {
    if (!employees.isActive(slot)) continue;
    total += employees.at(slot).wagePerMinute;
  }
  return total;
}
