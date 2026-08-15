import { describe, expect, it } from 'vitest';
import {
  EMPLOYEE_ROLES,
  MAX_EMPLOYEES,
  TASK_BASE_MS,
  TASK_KINDS,
  parseRoles,
  role,
  roleIndexOf,
  taskDuration,
  walkSpeed,
} from '@config/employees';

/**
 * The role table as *data* — GAME_EXECUTION_ROADMAP Phase 10.
 *
 * The roadmap's architecture instruction is that a role is data and the state
 * machine is code: _"Adding a role later is data, not code."_ These are the
 * tests that make that claim checkable — if a role could be added that the brain
 * cannot run, the separation is decorative.
 */
describe('looking roles up', () => {
  it('round-trips every role between its id and its index', () => {
    for (let index = 0; index < EMPLOYEE_ROLES.length; index++) {
      expect(roleIndexOf(role(index).id)).toBe(index);
    }
  });

  it('refuses an id or an index that does not exist', () => {
    // A silent `undefined` here becomes an employee with no speed and no wage,
    // standing still forever — which reads as a scheduling bug three systems
    // away from the cause.
    expect(() => roleIndexOf('astronaut')).toThrow(/Unknown role/);
    expect(() => role(EMPLOYEE_ROLES.length)).toThrow(RangeError);
    expect(() => role(-1)).toThrow(/Unknown role/);
  });
});

describe('the validator actually validates', () => {
  const wellFormed = {
    id: 'tester',
    tasks: ['CLEAN_TABLE' as const],
    baseSpeedMps: 1,
    baseWagePerMinute: 0.5,
    hireCost: 10,
    skillSpeedGain: 0.5,
    maxConcurrentTasks: 1,
  };

  it('accepts a well-formed role, so the rejections below mean something', () => {
    // Every task kind has to be covered, so the fixture lists all of them.
    expect(() => parseRoles([{ ...wellFormed, tasks: [...TASK_KINDS] }])).not.toThrow();
  });

  it('rejects two roles sharing an id', () => {
    const both = { ...wellFormed, tasks: [...TASK_KINDS] };
    expect(() => parseRoles([both, { ...both }])).toThrow(/Duplicate role/);
  });

  it('rejects a table where some task kind has nobody to do it', () => {
    /*
     * The livelock this prevents: a task nobody can claim sits open forever,
     * scoring higher every tick as its urgency climbs, starving every other
     * task. It looks exactly like "the employees stopped working".
     */
    expect(() => parseRoles([wellFormed])).toThrow(/No role can perform/);
  });

  it('rejects a role that cannot move or that works for free', () => {
    expect(() => parseRoles([{ ...wellFormed, tasks: [...TASK_KINDS], baseSpeedMps: 0 }])).toThrow();
    expect(() => parseRoles([{ ...wellFormed, tasks: [...TASK_KINDS], baseWagePerMinute: 0 }])).toThrow();
  });

  it('rejects a role with no tasks at all', () => {
    expect(() => parseRoles([{ ...wellFormed, tasks: [] }])).toThrow();
  });
});

describe('skill does what the design says it does', () => {
  it('makes every role faster on foot and at work', () => {
    for (let index = 0; index < EMPLOYEE_ROLES.length; index++) {
      expect(walkSpeed(index, 1)).toBeGreaterThan(walkSpeed(index, 0));
      expect(taskDuration(index, 1, 1000)).toBeLessThan(taskDuration(index, 0, 1000));
    }
  });

  it('never makes work instantaneous, however skilled', () => {
    // A zero-duration task completes on the tick it starts, which means an
    // employee who never appears to be working — the token-on-a-board failure.
    for (let index = 0; index < EMPLOYEE_ROLES.length; index++) {
      for (const kind of TASK_KINDS) {
        expect(taskDuration(index, 1, TASK_BASE_MS[kind]), kind).toBeGreaterThan(100);
      }
    }
  });

  it('caps the payroll at something a player can read', () => {
    // Eight rows is a list; eighty is a spreadsheet, and the staff panel has a
    // viewport budget (TECHNICAL_ARCHITECTURE §7).
    expect(MAX_EMPLOYEES).toBeGreaterThan(1);
    expect(MAX_EMPLOYEES).toBeLessThanOrEqual(12);
  });
});
