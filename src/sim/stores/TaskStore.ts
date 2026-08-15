import type { Hasher } from '../math/hash';
import { SlotPool } from './pool';

/**
 * The task board's storage — Phase 10.
 *
 * Pooled, like orders and for the same reasons: tasks are created and finished
 * constantly, and a board that allocated per task would put the allocator on a
 * per-tick path.
 *
 * ## Why the claim is stored on both sides
 *
 * `TaskRecord.claimedBy` and `EmployeeRecord.taskSlot` are redundant, and that
 * is deliberate. Cancellation has to work from either end — an employee is
 * fired, or the thing a task targets disappears — and a single-sided link makes
 * one of those directions a scan. Worse, a half-completed cancellation is
 * *invisible* with one field and detectable with two, which is what
 * `assertBoardConsistent` in the tests relies on.
 */

/** Nobody has claimed this task. */
export const UNCLAIMED = -1;

export interface TaskRecord {
  entityId: number;
  /** Index into `TASK_KINDS`. */
  kind: number;
  /** Employee slot that claimed it, or `UNCLAIMED`. */
  claimedBy: number;
  /**
   * What the task is about — an order slot, a table index, whatever the kind
   * means. -1 when the kind has no subject.
   */
  subject: number;
  /** Where the work happens, in metres. */
  x: number;
  y: number;
  /** When it was posted, so urgency can grow with age. */
  postedAtMs: number;
  /** Base duration before skill, in milliseconds. */
  durationMs: number;
}

function createTask(): TaskRecord {
  return {
    entityId: 0,
    kind: 0,
    claimedBy: UNCLAIMED,
    subject: -1,
    x: 0,
    y: 0,
    postedAtMs: 0,
    durationMs: 0,
  };
}

function resetTask(record: TaskRecord): void {
  record.entityId = 0;
  record.kind = 0;
  record.claimedBy = UNCLAIMED;
  record.subject = -1;
  record.x = 0;
  record.y = 0;
  record.postedAtMs = 0;
  record.durationMs = 0;
}

export function writeTask(hasher: Hasher, record: TaskRecord): void {
  hasher.writeI32(record.entityId);
  hasher.writeU8(record.kind);
  hasher.writeI32(record.claimedBy);
  hasher.writeI32(record.subject);
  hasher.writeF64(record.x);
  hasher.writeF64(record.y);
  hasher.writeF64(record.postedAtMs);
  hasher.writeF64(record.durationMs);
}

export function createTaskPool(capacity: number): SlotPool<TaskRecord> {
  return new SlotPool<TaskRecord>(capacity, createTask, resetTask);
}
