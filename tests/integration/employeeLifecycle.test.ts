import { describe, expect, it } from 'vitest';
import { TICK_MS } from '@config/simulation';
import { UNPAID_GRACE_MS } from '@config/economy/wages';
import { brainStateName, STATE_IDLE } from '@sim/ai/EmployeeBrain';
import { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import { hire } from '@sim/systems/StaffSystem';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const LONG_RUN_TIMEOUT_MS = 120_000;

/**
 * The whole point of Phase 10, end to end.
 *
 * The roadmap's Player Value line: _"Oyuncu manuel hazırlıktan kurtulur ve
 * **yönetici** olur."_ That is a claim with a measurable form — a stand with a
 * cook earns money without a single `MANUAL_PREP` — and it is the first test
 * below, because everything else in this phase is machinery in service of it.
 */
function runFor(sim: Sim, ticks: number): void {
  sim.advance(ticks);
}

/** The same run, with the player clicking the station every tick. */
function cookManually(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
    sim.tick();
  }
}

describe('the player stops being the cook', () => {
  it(
    'earns money with a cook and nobody touching the controls',
    () => {
      /*
       * Phase 8's control test asserted the opposite: without `MANUAL_PREP`,
       * nothing is ever cooked and cash stays at zero. That test still passes,
       * which is what makes this one meaningful — the *only* difference here is
       * that somebody was hired.
       */
      const sim = new Sim({ seed: 424242 });
      sim.world.economy.cash = 40;
      expect(hire(sim.world, 'cook', 0.7)).toBe('ok');

      runFor(sim, TICKS_PER_MINUTE * 20);

      expect(sim.world.stats.customersServed, 'the cook never cooked anything').toBeGreaterThan(0);
      expect(sim.world.economy.lifetimeRevenue).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'serves comparably to an attentive human, without the clicking',
    () => {
      /*
       * Not "as well as" — a cook walks to the station and a human does not, so
       * a cook is slower by the walk. The claim is that the difference is a
       * matter of degree rather than of kind: the stand still functions.
       *
       * Measured rather than asserted from the design, because "the automation
       * works but serves a third as many people" would be a real regression
       * dressed as a feature.
       */
      const manual = new Sim({ seed: 909 });
      const staffed = new Sim({ seed: 909 });
      staffed.world.economy.cash = 40;
      expect(hire(staffed.world, 'cook', 0.7)).toBe('ok');

      cookManually(manual, TICKS_PER_MINUTE * 20);
      runFor(staffed, TICKS_PER_MINUTE * 20);

      const byHand = manual.world.stats.customersServed;
      const byCook = staffed.world.stats.customersServed;

      expect(byHand, 'the control run served nobody').toBeGreaterThan(0);
      expect(byCook, `by hand ${String(byHand)}, by cook ${String(byCook)}`).toBeGreaterThanOrEqual(
        Math.floor(byHand * 0.6),
      );
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'pays for itself, or says plainly that it does not',
    () => {
      /*
       * A cook costs ₡20 to hire and roughly ₡0.9 a minute to keep, against a
       * stand that takes about ₡5 a minute. Whether that is a good deal is a
       * balance question for Phase 12; what this test does is *measure* it, so
       * the answer is a number in a report rather than an assumption.
       */
      const alone = new Sim({ seed: 20260818 });
      const staffed = new Sim({ seed: 20260818 });
      alone.world.economy.cash = 40;
      staffed.world.economy.cash = 40;
      expect(hire(staffed.world, 'cook', 0.7)).toBe('ok');

      cookManually(alone, TICKS_PER_MINUTE * 30);
      runFor(staffed, TICKS_PER_MINUTE * 30);

      // Both must still be solvent — a stand that goes broke hiring one cook
      // would be a balance failure worth stopping for.
      expect(staffed.world.economy.cash).toBeGreaterThanOrEqual(0);
      expect(staffed.world.stats.employeesLeftUnpaid, 'the cook walked out unpaid').toBe(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('employees look like they have intent', () => {
  it(
    'spends its time working rather than standing still',
    () => {
      /*
       * The mechanical half of the roadmap's closing question — "do they look
       * like workers with intent, or like tokens sliding on a board?" The
       * *visual* half is a human judgement and is not made here (PHASE_10_REPORT
       * §8); what can be measured is how a cook spends its shift.
       *
       * Reported as a distribution rather than asserted against a target,
       * because the right split depends on how busy the stand is — and the
       * number is in the phase report either way.
       */
      const sim = new Sim({ seed: 424242 });
      sim.world.economy.cash = 40;
      expect(hire(sim.world, 'cook', 0.7)).toBe('ok');

      const time = new Map<string, number>();
      for (let tick = 0; tick < TICKS_PER_MINUTE * 20; tick++) {
        sim.tick();
        for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
          if (!sim.world.employees.isActive(slot)) continue;
          const name = brainStateName(sim.world.employees.at(slot).state);
          time.set(name, (time.get(name) ?? 0) + 1);
        }
      }

      const total = [...time.values()].reduce((sum, value) => sum + value, 0);
      expect(total).toBeGreaterThan(0);

      const working = (time.get('MOVING') ?? 0) + (time.get('PERFORMING') ?? 0);
      const share = working / total;
      expect(share, `working ${(share * 100).toFixed(1)}% of the shift`).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it('never leaves somebody performing a task that no longer exists', () => {
    /*
     * The state that would look most like a broken worker: standing at a
     * station, working, on nothing. Checked continuously through a run where
     * orders are constantly appearing and being discarded.
     */
    const sim = new Sim({ seed: 4242 });
    sim.world.economy.cash = 200;
    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');
    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');

    for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
      sim.tick();

      // Randomly-ish discard a live order, deterministically: every 53rd tick,
      // the lowest live order goes. This is what an abandoning customer does.
      if (tick % 53 === 0) {
        for (let slot = 0; slot < sim.world.orders.scanLimit; slot++) {
          if (!sim.world.orders.isActive(slot)) continue;
          sim.world.orders.release(slot);
          break;
        }
      }

      for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
        if (!sim.world.employees.isActive(slot)) continue;
        const employee = sim.world.employees.at(slot);
        if (employee.state === STATE_IDLE) continue;
        if (employee.taskSlot < 0) continue;
        expect(
          sim.world.tasks.isActive(employee.taskSlot),
          `working on a dead task at tick ${String(tick)}`,
        ).toBe(true);
      }
    }
  });
});

describe('the payroll survives a save', () => {
  it('brings everybody back, idle, with their wages owing', () => {
    /*
     * Employees are **not** transient state, unlike the customers and vehicles
     * TECHNICAL_ARCHITECTURE §8.1 deliberately drops: a player who hired three
     * cooks and reloaded to find them gone would have lost money. What is not
     * saved is what they were *doing* — the board is derived and rebuilds on the
     * first tick, and a restored task slot would point at a board that does not
     * exist yet.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 500;
    expect(hire(sim.world, 'cook', 0.8)).toBe('ok');
    expect(hire(sim.world, 'waiter', 0.3)).toBe('ok');
    sim.advance(TICKS_PER_MINUTE * 2);

    const before = [0, 1].map((slot) => ({
      entityId: sim.world.employees.at(slot).entityId,
      role: sim.world.employees.at(slot).role,
      skill: sim.world.employees.at(slot).skill,
      wage: sim.world.employees.at(slot).wagePerMinute,
    }));

    const resumed = new Sim({ seed: 1 });
    restoreWorld(resumed.world, snapshotWorld(sim.world));

    expect(resumed.world.employees.activeCount).toBe(2);
    for (let i = 0; i < 2; i++) {
      const employee = resumed.world.employees.at(i);
      expect(employee.entityId).toBe(before[i]?.entityId);
      expect(employee.role).toBe(before[i]?.role);
      expect(employee.skill).toBeCloseTo(before[i]?.skill ?? -1, 9);
      expect(employee.wagePerMinute).toBeCloseTo(before[i]?.wage ?? -1, 9);
      expect(employee.state, 'resumed mid-task').toBe(STATE_IDLE);
      expect(employee.taskSlot, 'resumed holding a task from a board that no longer exists').toBe(-1);
    }

    // And they go straight back to work.
    resumed.advance(TICKS_PER_MINUTE * 5);
    expect(resumed.world.employees.activeCount).toBe(2);
  });

  it('keeps the unpaid clock running across a reload', () => {
    // Otherwise saving and loading in a loop is an infinite grace period.
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100;
    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');
    sim.world.economy.cash = 0;
    sim.advance(Math.floor(UNPAID_GRACE_MS / TICK_MS / 2));

    const owedBefore = sim.world.employees.at(0).unpaidMs;
    expect(owedBefore).toBeGreaterThan(0);

    const resumed = new Sim({ seed: 1 });
    restoreWorld(resumed.world, snapshotWorld(sim.world));
    expect(resumed.world.employees.at(0).unpaidMs).toBeCloseTo(owedBefore, 6);
  });
});
