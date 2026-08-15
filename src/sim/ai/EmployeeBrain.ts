import { ARRIVAL_EPSILON_METRES, taskDuration, walkSpeed } from '@config/employees';
import type { World } from '../core/World';
import type { EmployeeRecord } from '../stores/employees';
import { UNCLAIMED } from '../stores/TaskStore';

/**
 * **One** state machine, for every role — GAME_EXECUTION_ROADMAP Phase 10.
 *
 * The roadmap's instruction is unusually direct: _"Do not write four state
 * machines."_ The reason is not tidiness. Four machines means the no-teleport
 * guarantee, the cancellation protocol and the blocked-forever check each hold
 * in four places, and the fourth one is written last, in a hurry, by someone who
 * has stopped reading the first three.
 *
 * So there are four states and they are the same four for a cook, a waiter and a
 * cleaner:
 *
 * ```
 *   IDLE ──claims a task──> MOVING ──arrives──> PERFORMING ──finishes──> IDLE
 *     ▲                        │                     │
 *     └────────────────────────┴─── task cancelled ──┘
 *   BLOCKED: wanted work, could not take any. Timed, so "briefly idle" and
 *            "stuck forever" are different observable states.
 * ```
 *
 * What differs per role is the *task table* in `@config/employees` — which kinds
 * they may claim and how fast they work. Adding a barista is a config entry.
 *
 * ## Movement is integrated, never assigned
 *
 * `step` advances a position by at most `speed * dt` toward the target. There is
 * no branch anywhere in this file that writes a position directly, and that is
 * the whole of the no-teleport guarantee: it is structural rather than
 * asserted. `tests/unit/sim/employees/noTeleport.test.ts` records every position
 * every tick for the length of a shift and fails the build on a single
 * over-long step, because the easy way to break this is a shortcut added later
 * by someone who did not read this comment.
 */

const BRAIN_STATES = ['IDLE', 'MOVING', 'PERFORMING', 'BLOCKED'] as const;
export type BrainStateName = (typeof BRAIN_STATES)[number];

export const STATE_IDLE = 0;
export const STATE_MOVING = 1;
export const STATE_PERFORMING = 2;
export const STATE_BLOCKED = 3;

export function brainStateName(state: number): BrainStateName {
  return BRAIN_STATES[state] ?? 'IDLE';
}

/**
 * Tolerance on a single step, for the no-teleport assertion.
 *
 * A hair over 1: floating-point accumulation over thousands of ticks makes an
 * exact bound flake, and a bound that flakes gets loosened until it means
 * nothing. 1.001 catches a teleport — which is metres — while surviving the
 * last bits of a double.
 */
export const STEP_TOLERANCE = 1.001;

/**
 * Advance one employee by one tick.
 *
 * Returns nothing and mutates in place: this runs for every employee every
 * tick, and a result object per call is an allocation on the hottest path the
 * phase adds.
 */
export function stepEmployee(world: World, employee: EmployeeRecord, deltaMs: number): void {
  switch (employee.state) {
    case STATE_MOVING:
      moveToward(employee, deltaMs);
      break;
    case STATE_PERFORMING:
      perform(world, employee, deltaMs);
      break;
    case STATE_BLOCKED:
      employee.blockedMs += deltaMs;
      break;
    default:
      // IDLE. The task board assigns; the brain does not go looking, because
      // two systems choosing tasks is two systems that can choose the same one.
      break;
  }
}

/**
 * Walk toward the target, at most `speed * dt`.
 *
 * The clamp is the point. `remaining` is compared against the step and the
 * *smaller* is taken, so arriving is a short step rather than a jump to the
 * destination — which is what "no teleporting" means at the last tick of a walk,
 * and the case a naive implementation gets wrong.
 */
function moveToward(employee: EmployeeRecord, deltaMs: number): void {
  const dx = employee.targetX - employee.x;
  const dy = employee.targetY - employee.y;
  const remaining = Math.hypot(dx, dy);

  if (remaining <= ARRIVAL_EPSILON_METRES) {
    employee.state = STATE_PERFORMING;
    employee.progressMs = 0;
    return;
  }

  const step = walkSpeed(employee.role, employee.skill) * (deltaMs / 1000);
  const travel = Math.min(step, remaining);
  employee.x += (dx / remaining) * travel;
  employee.y += (dy / remaining) * travel;

  // Arrival is checked again *after* the step, so a walk that finishes inside
  // this tick starts its work on this tick rather than idling for one more.
  if (Math.hypot(employee.targetX - employee.x, employee.targetY - employee.y) <= ARRIVAL_EPSILON_METRES) {
    employee.state = STATE_PERFORMING;
    employee.progressMs = 0;
  }
}

/**
 * Do the work.
 *
 * The task's completion is not applied here — `TaskBoardSystem` owns what a
 * finished task *means*, because that differs per kind and this file is the
 * part that must not. What happens here is time passing.
 */
function perform(world: World, employee: EmployeeRecord, deltaMs: number): void {
  if (employee.taskSlot < 0 || !world.tasks.isActive(employee.taskSlot)) {
    // The task vanished under them — cancelled, or its subject disappeared.
    // Returning to IDLE is the whole recovery, and it needs no cleanup because
    // `releaseTask` already cleared the other side of the link.
    releaseToIdle(employee);
    return;
  }

  employee.progressMs += deltaMs;
}

/** True when the current task's work is finished. */
export function taskComplete(world: World, employee: EmployeeRecord): boolean {
  if (employee.state !== STATE_PERFORMING) return false;
  if (employee.taskSlot < 0 || !world.tasks.isActive(employee.taskSlot)) return false;

  const task = world.tasks.at(employee.taskSlot);
  return employee.progressMs >= taskDuration(employee.role, employee.skill, task.durationMs);
}

/** Send an employee to a place to do a task. */
export function assignTask(employee: EmployeeRecord, taskSlot: number, x: number, y: number): void {
  employee.taskSlot = taskSlot;
  employee.targetX = x;
  employee.targetY = y;
  employee.state = STATE_MOVING;
  employee.progressMs = 0;
  employee.blockedMs = 0;
}

/**
 * Drop whatever they were doing and go idle.
 *
 * Idempotent and safe from any state, which is what makes cancellation safe:
 * `FIRE` mid-task, a subject that disappears, and a task released because it
 * became impossible all take this same path, so there is one recovery to get
 * right rather than three.
 */
export function releaseToIdle(employee: EmployeeRecord): void {
  employee.taskSlot = UNCLAIMED;
  employee.state = STATE_IDLE;
  employee.progressMs = 0;
  employee.blockedMs = 0;
}
