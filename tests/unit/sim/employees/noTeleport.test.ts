import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ROLES, walkSpeed } from '@config/employees';
import { TICK_MS } from '@config/simulation';
import { STATE_MOVING, STEP_TOLERANCE } from '@sim/ai/EmployeeBrain';
import { Sim } from '@sim/core/Sim';
import { hire } from '@sim/systems/StaffSystem';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const LONG_RUN_TIMEOUT_MS = 120_000;

/**
 * **NO TELEPORTING — a hard build requirement.**
 *
 * The roadmap, verbatim: _"Write a test that records every employee position
 * each tick and asserts the delta never exceeds speed * dt * tolerance.
 * Employees walking through walls or blinking between stations is the single
 * most immersion-breaking bug in this genre, and it is easy to introduce
 * accidentally when adding a shortcut later. Lock it now."_
 *
 * This is that test, and it is the reason `EmployeeBrain` has exactly one place
 * that writes a position. The bound is not a heuristic: an employee's speed is
 * `walkSpeed(role, skill)`, a tick is `TICK_MS`, and any step longer than their
 * product is movement that did not happen — a value assigned rather than
 * integrated.
 *
 * The tolerance is 1.001, and that number is deliberate. Floating-point
 * accumulation over tens of thousands of ticks makes an exact bound flake, and a
 * bound that flakes gets loosened until it means nothing. A thousandth of a
 * millimetre of slack catches a teleport — which is metres — while surviving the
 * last bits of a double.
 */
describe('employees never teleport', () => {
  it(
    'takes no step longer than speed x dt, over a full shift',
    () => {
      const sim = new Sim({ seed: 20260817 });
      sim.world.economy.cash = 1000;

      // One of every role, at different skills, so the bound is checked against
      // several different speeds rather than one.
      expect(hire(sim.world, 'cook', 0.2)).toBe('ok');
      expect(hire(sim.world, 'cook', 0.9)).toBe('ok');
      expect(hire(sim.world, 'waiter', 0.5)).toBe('ok');
      expect(hire(sim.world, 'cleaner', 1)).toBe('ok');

      const previous = new Map<number, { x: number; y: number }>();
      let steps = 0;
      let longest = 0;
      let worst = '';

      for (let tick = 0; tick < TICKS_PER_MINUTE * 30; tick++) {
        sim.tick();

        for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
          if (!sim.world.employees.isActive(slot)) continue;
          const employee = sim.world.employees.at(slot);
          const before = previous.get(employee.entityId);
          previous.set(employee.entityId, { x: employee.x, y: employee.y });
          if (before === undefined) continue;

          const moved = Math.hypot(employee.x - before.x, employee.y - before.y);
          const limit = walkSpeed(employee.role, employee.skill) * (TICK_MS / 1000) * STEP_TOLERANCE;
          steps++;
          if (moved > longest) {
            longest = moved;
            worst = `${moved.toFixed(6)} m against a limit of ${limit.toFixed(6)} m at tick ${String(tick)}`;
          }

          expect(moved, `teleport: ${worst}`).toBeLessThanOrEqual(limit);
        }
      }

      // The bound is worthless if nobody ever moved. Half an hour of service
      // with four employees produces thousands of steps.
      expect(steps, 'nobody moved, so the bound proves nothing').toBeGreaterThan(1000);
      expect(longest, `longest step ${longest.toFixed(4)} m`).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it('cannot cross the lot in one tick, however far the target is', () => {
    /*
     * The direct version of the same claim, in case a future change makes the
     * long run above stop producing long walks. The target is placed at the far
     * corner of the world and the employee is stepped once.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100;
    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');

    const employee = sim.world.employees.at(0);
    const startX = employee.x;
    const startY = employee.y;
    employee.state = STATE_MOVING;
    employee.targetX = 240;
    employee.targetY = 180;

    sim.tick();

    const moved = Math.hypot(employee.x - startX, employee.y - startY);
    const limit = walkSpeed(employee.role, employee.skill) * (TICK_MS / 1000) * STEP_TOLERANCE;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(limit);
  });

  it('arrives with a short step rather than a jump', () => {
    /*
     * The case a naive implementation gets wrong: a walk whose last leg is
     * shorter than one step. Snapping to the destination would be a teleport of
     * up to a full step, every single arrival — small enough to look like
     * nothing and to break the bound above.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100;
    expect(hire(sim.world, 'cook', 0)).toBe('ok');

    const employee = sim.world.employees.at(0);
    employee.state = STATE_MOVING;
    employee.targetX = employee.x + 0.02;
    employee.targetY = employee.y;
    const startX = employee.x;

    sim.tick();

    expect(Math.abs(employee.x - startX)).toBeLessThanOrEqual(0.02 + 1e-9);
  });

  it('gives every role a positive speed, so nobody is stuck by construction', () => {
    // A zero-speed role would pass the no-teleport bound trivially and never
    // reach a task — a "stuck" employee that looks like a scheduling bug.
    for (let index = 0; index < EMPLOYEE_ROLES.length; index++) {
      for (const skill of [0, 0.5, 1]) {
        expect(walkSpeed(index, skill), EMPLOYEE_ROLES[index]?.id ?? '?').toBeGreaterThan(0);
      }
    }
  });
});
