import { ACTOR_KIND_EMPLOYEE } from '@config/actors';
import type { Hasher } from '../math/hash';
import { SlotPool } from './pool';

/**
 * Employees — Phase 10.
 *
 * Split out of the generic actor pool for the same reason customers were in
 * Phase 6: an employee now has state that only an employee has, and leaving it
 * on a shared record would give props and scenery a task assignment.
 *
 * ## One brain, four states
 *
 * `state` is an index into `BRAIN_STATES`, and there are exactly four of them
 * for every role. The difference between a cook and a cleaner is entirely in
 * which tasks they are eligible for and how long each takes — data, not control
 * flow. That is what makes "the state machine is correct" a thing you prove once.
 */

export interface EmployeeRecord {
  entityId: number;
  x: number;
  y: number;
  z: number;
  kind: number;

  /** Index into `EMPLOYEE_ROLES`. */
  role: number;
  /** Index into `BRAIN_STATES`. */
  state: number;

  /**
   * The task this employee has claimed, or -1.
   *
   * A slot index into the task board, not a task id. The board is pooled and
   * the slot is stable for the life of the task; the *claim* is stored on both
   * sides so a half-cancelled task is detectable rather than merely unlikely.
   */
  taskSlot: number;
  /** Where they are walking to, in metres. Meaningless unless MOVING. */
  targetX: number;
  targetY: number;
  /** Milliseconds spent in `PERFORMING`, against the task's duration. */
  progressMs: number;
  /**
   * How long they have been BLOCKED, in milliseconds.
   *
   * Blocked is a normal state — every station busy, nothing to carry — and it
   * is *timed* so that a permanent block is distinguishable from a momentary
   * one. The deadlock test asserts on this rather than on "did anything move".
   */
  blockedMs: number;

  /**
   * Skill, 0..1 — GAME_DESIGN_DOCUMENT §8.5.
   *
   * One number, not three. Speed, error rate and multitasking all derive from
   * it through the role's config, so a "skilled" employee cannot be fast and
   * clumsy at the same time unless a role says so deliberately.
   */
  skill: number;
  /** Wage in credits per game minute, fixed when hired. */
  wagePerMinute: number;
  /** Accrued but unpaid wages, in credits. Cleared as it is paid. */
  accruedWages: number;
  /** Milliseconds of unpaid wages, for the leave-if-unpaid rule. */
  unpaidMs: number;
}

function createEmployee(defaultKind: number): EmployeeRecord {
  return {
    entityId: 0,
    x: 0,
    y: 0,
    z: 0,
    kind: defaultKind,
    role: 0,
    state: 0,
    taskSlot: -1,
    targetX: 0,
    targetY: 0,
    progressMs: 0,
    blockedMs: 0,
    skill: 0,
    wagePerMinute: 0,
    accruedWages: 0,
    unpaidMs: 0,
  };
}

function resetEmployee(record: EmployeeRecord, defaultKind: number): void {
  record.entityId = 0;
  record.x = 0;
  record.y = 0;
  record.z = 0;
  record.kind = defaultKind;
  record.role = 0;
  record.state = 0;
  record.taskSlot = -1;
  record.targetX = 0;
  record.targetY = 0;
  record.progressMs = 0;
  record.blockedMs = 0;
  record.skill = 0;
  record.wagePerMinute = 0;
  record.accruedWages = 0;
  record.unpaidMs = 0;
}

export function writeEmployee(hasher: Hasher, record: EmployeeRecord): void {
  hasher.writeI32(record.entityId);
  hasher.writeF64(record.x);
  hasher.writeF64(record.y);
  hasher.writeF64(record.z);
  hasher.writeU8(record.kind);
  hasher.writeU8(record.role);
  hasher.writeU8(record.state);
  hasher.writeI32(record.taskSlot);
  hasher.writeF64(record.targetX);
  hasher.writeF64(record.targetY);
  hasher.writeF64(record.progressMs);
  hasher.writeF64(record.blockedMs);
  hasher.writeF64(record.skill);
  hasher.writeF64(record.wagePerMinute);
  hasher.writeF64(record.accruedWages);
  hasher.writeF64(record.unpaidMs);
}

export function createEmployeePool(capacity: number): SlotPool<EmployeeRecord> {
  return new SlotPool<EmployeeRecord>(
    capacity,
    () => createEmployee(ACTOR_KIND_EMPLOYEE),
    (record) => {
      resetEmployee(record, ACTOR_KIND_EMPLOYEE);
    },
  );
}
