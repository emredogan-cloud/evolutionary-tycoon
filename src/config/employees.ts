import { z } from 'zod';

/**
 * Employees — GAME_DESIGN_DOCUMENT §8.2–8.7, GAME_EXECUTION_ROADMAP Phase 10.
 *
 * ## One brain, many task tables
 *
 * The roadmap is emphatic: _"Do not write four state machines. Write one
 * EmployeeBrain with states IDLE / MOVING / PERFORMING / BLOCKED, and express
 * each role as a data-driven task table."_
 *
 * So a role is a list of task kinds it can take, plus three numbers that scale
 * how it does them. Adding a barista in Phase 13 is an entry in this file.
 *
 * ## Why skill is one number
 *
 * §8.5 lists speed, error rate and multitasking. They are *derived* here from a
 * single `skill` in 0..1 through per-role curves, rather than stored as three
 * independent fields — three fields let an employee be simultaneously fast and
 * clumsy, which no amount of balancing makes legible to a player looking at a
 * staff list.
 */

/** Every task kind the board can hold. Index is hashed — **append only**. */
export const TASK_KINDS = [
  /** Start a placed order at a free station. The cook's whole job in Stage 2. */
  'PREP_ORDER',
  /** Carry a finished plate from the pass to the customer waiting for it. */
  'DELIVER_ORDER',
  /** Clear a table. Inert until Phase 11 gives the world tables. */
  'CLEAN_TABLE',
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

const roleSchema = z.object({
  id: z.string().min(1),
  /** Which tasks this role is eligible for, in preference order. */
  tasks: z.array(z.enum(TASK_KINDS)).min(1),
  /** Metres per second at skill 0. Skill scales it — see `walkSpeed`. */
  baseSpeedMps: z.number().positive(),
  /** Credits per game minute at skill 0. */
  baseWagePerMinute: z.number().positive(),
  /** One-off cost to hire, in credits. */
  hireCost: z.number().nonnegative(),
  /**
   * How much skill accelerates work: duration is divided by
   * `1 + skill * skillSpeedGain`. At 0.6 skill and a gain of 0.5 a task takes
   * 77% as long.
   */
  skillSpeedGain: z.number().nonnegative(),
  /**
   * How many tasks this role may hold at once at full skill.
   *
   * One today for every role, and the field exists rather than the number
   * because §8.5 names multitasking as a skill axis and Phase 13's roles use
   * it. A role that could hold two tasks with a brain that assumes one is the
   * bug this makes visible instead of latent.
   */
  maxConcurrentTasks: z.number().int().min(1),
});

export type EmployeeRole = z.infer<typeof roleSchema>;

const ROLES: EmployeeRole[] = [
  {
    id: 'cook',
    tasks: ['PREP_ORDER'],
    baseSpeedMps: 1.25,
    baseWagePerMinute: 0.55,
    hireCost: 20,
    skillSpeedGain: 0.5,
    maxConcurrentTasks: 1,
  },
  {
    /*
     * Implemented and tested now, active from Phase 11. The roadmap's scope
     * line: "Waiter and Cleaner are implemented and tested but only become
     * active in Phase 11 when Stage 3 exists." A waiter has real work in
     * Stage 1 — carrying plates off the pass — but Stage 1 delivery is
     * automatic, so there is nothing to carry. See PHASE_10_REPORT.
     */
    id: 'waiter',
    tasks: ['DELIVER_ORDER', 'CLEAN_TABLE'],
    baseSpeedMps: 1.4,
    baseWagePerMinute: 0.5,
    hireCost: 18,
    skillSpeedGain: 0.45,
    maxConcurrentTasks: 1,
  },
  {
    id: 'cleaner',
    tasks: ['CLEAN_TABLE'],
    baseSpeedMps: 1.2,
    baseWagePerMinute: 0.4,
    hireCost: 14,
    skillSpeedGain: 0.4,
    maxConcurrentTasks: 1,
  },
];

/**
 * The validator, exported so it can be given bad input.
 *
 * Same reasoning as `parseUpgrades`: a schema only ever run on data known to be
 * correct would pass just as happily with every refinement deleted. The two
 * refinements here guard the two mistakes that would be silent — a duplicate
 * role id, and a task kind nobody can perform.
 */
export function parseRoles(list: unknown): readonly EmployeeRole[] {
  return rolesSchema.parse(list);
}

const rolesSchema = z.array(roleSchema).superRefine((list, ctx) => {
  const ids = new Set<string>();
  for (const role of list) {
    if (ids.has(role.id)) ctx.addIssue({ code: 'custom', message: `Duplicate role "${role.id}"` });
    ids.add(role.id);
  }

  /*
   * Every task kind must be reachable by *some* role. A task the board can
   * create and nobody can claim sits open forever, scoring higher every tick
   * as its urgency climbs, starving every other task — a livelock that looks
   * like "the employees stopped working".
   */
  const covered = new Set(list.flatMap((role) => role.tasks));
  for (const kind of TASK_KINDS) {
    if (!covered.has(kind)) {
      ctx.addIssue({ code: 'custom', message: `No role can perform ${kind}` });
    }
  }
});

export const EMPLOYEE_ROLES: readonly EmployeeRole[] = rolesSchema.parse(ROLES);

export function roleIndexOf(id: string): number {
  const index = EMPLOYEE_ROLES.findIndex((role) => role.id === id);
  if (index < 0) throw new RangeError(`Unknown role "${id}"`);
  return index;
}

export function role(index: number): EmployeeRole {
  const found = EMPLOYEE_ROLES[index];
  if (found === undefined) throw new RangeError(`Unknown role ${index}`);
  return found;
}

/** Metres per second for an employee of this role and skill. */
export function walkSpeed(roleIndex: number, skill: number): number {
  const spec = role(roleIndex);
  return spec.baseSpeedMps * (1 + skill * 0.3);
}

/** How long a task of `durationMs` takes this employee. */
export function taskDuration(roleIndex: number, skill: number, durationMs: number): number {
  const spec = role(roleIndex);
  return durationMs / (1 + skill * spec.skillSpeedGain);
}

/**
 * Base duration per task kind, before skill.
 *
 * Separate from the role table because a task takes as long as it takes: a
 * cleaner and a waiter clearing the same table are doing the same work, and
 * only their skill should separate them.
 */
export const TASK_BASE_MS: Readonly<Record<TaskKind, number>> = {
  PREP_ORDER: 900,
  DELIVER_ORDER: 700,
  CLEAN_TABLE: 3500,
};

/**
 * Scoring weights — `urgency x reward − distance x cost`.
 *
 * Config rather than constants in the system, because the roadmap's own risk
 * table names "TaskBoard making bad decisions" as a Phase 10 risk and says the
 * mitigation is that the scoring function is tunable.
 */
export const TASK_SCORING = {
  /** Reward per task kind — how much doing it is worth to the stand. */
  reward: { PREP_ORDER: 10, DELIVER_ORDER: 12, CLEAN_TABLE: 4 } as Readonly<Record<TaskKind, number>>,
  /** Urgency grows with how long a task has waited, capped. */
  urgencyPerSecond: 0.05,
  maxUrgency: 3,
  /** Credits of score lost per metre the employee has to walk. */
  distanceCost: 0.35,
} as const;

/** How close counts as arrived, in metres. */
export const ARRIVAL_EPSILON_METRES = 0.15;

/** Employees on the payroll at once. */
export const MAX_EMPLOYEES = 8;
