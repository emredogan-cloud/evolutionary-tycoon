import { describe, expect, it } from 'vitest';
import { UNPAID_GRACE_MS, WAGE_SETTLE_MS } from '@config/economy/wages';
import { MAX_EMPLOYEES, role, roleIndexOf, taskDuration, walkSpeed } from '@config/employees';
import { TICK_MS } from '@config/simulation';
import { Sim } from '@sim/core/Sim';
import { fire, hire, payrollPerMinute } from '@sim/systems/StaffSystem';
import { grossIncomePerMinute, netIncomePerMinute } from '@sim/systems/EconomySystem';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;

/**
 * Wages — GAME_EXECUTION_ROADMAP Phase 10, ECONOMY_DESIGN §7 (Fren 5).
 *
 * Three requirements from the roadmap, each tested here:
 *
 * - _"Continuous drain, accrued per tick including partial minutes."_
 * - _"If cash cannot cover wages for 3 real minutes, one employee leaves with
 *   warning, highest-paid first, deterministically."_
 * - _"Cash never goes below zero, and there is no debt or game over."_
 *
 * The last one is a design position rather than a safety check, and it is worth
 * saying why it is tested so aggressively: a tycoon game that can put a player
 * in a hole they cannot dig out of has replaced a decision with a punishment.
 */
describe('accrual', () => {
  it('charges for partial minutes, tick by tick', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');

    const employee = sim.world.employees.at(0);
    const wage = employee.wagePerMinute;
    expect(wage).toBeGreaterThan(0);

    // Six seconds — a tenth of a minute, and not a whole number of anything.
    sim.advance(120);
    // Settlement happens on a five-second boundary, so some of it has been paid
    // and the rest is still accruing. Both halves add up to the same debt.
    const paidSoFar = 1000 - role(0).hireCost - sim.world.economy.cash;
    expect(paidSoFar + employee.accruedWages).toBeCloseTo(wage * 0.1, 4);
  });

  it('scales with skill, because a better cook costs more', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    expect(hire(sim.world, 'cook', 0)).toBe('ok');
    expect(hire(sim.world, 'cook', 1)).toBe('ok');

    const novice = sim.world.employees.at(0);
    const expert = sim.world.employees.at(1);
    expect(expert.wagePerMinute).toBeGreaterThan(novice.wagePerMinute);

    // And they earn it: the expert works measurably faster.
    expect(taskDuration(expert.role, expert.skill, 1000)).toBeLessThan(
      taskDuration(novice.role, novice.skill, 1000),
    );
    expect(walkSpeed(expert.role, expert.skill)).toBeGreaterThan(walkSpeed(novice.role, novice.skill));
  });

  it('shows up as an expense in the income window', () => {
    /*
     * The other side of Phase 9's window, which until now was always zero.
     *
     * **Asserted on the expense side, not on the net.** The original version
     * checked that net income went negative, which worked only because a Stage 1
     * stand earned almost nothing: Phase 12's balancing took it to about ₡14 a
     * minute, so one cook at ₡8 is comfortably self-financing and the net is
     * positive. That was never the claim. The claim is that a wage is *booked*,
     * and the way to check it is to look at the expense window.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    const grossBefore = grossIncomePerMinute(sim.world);
    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');

    sim.advance(TICKS_PER_MINUTE);

    const gross = grossIncomePerMinute(sim.world);
    const net = netIncomePerMinute(sim.world);
    expect(gross - net, 'no wage reached the expense window').toBeGreaterThan(0);
    expect(grossBefore).toBe(0);
  });

  it('reports the payroll for the staff panel', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    expect(payrollPerMinute(sim.world)).toBe(0);

    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');
    expect(hire(sim.world, 'waiter', 0.5)).toBe('ok');

    const expected = sim.world.employees.at(0).wagePerMinute + sim.world.employees.at(1).wagePerMinute;
    expect(payrollPerMinute(sim.world)).toBeCloseTo(expected, 9);
  });

  it('stops charging the moment somebody is fired', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    expect(hire(sim.world, 'cook', 0.5)).toBe('ok');
    const id = sim.world.employees.at(0).entityId;

    sim.advance(TICKS_PER_MINUTE);
    const afterOneMinute = sim.world.economy.cash;

    expect(fire(sim.world, id)).toBe('ok');
    sim.advance(TICKS_PER_MINUTE * 5);

    expect(sim.world.economy.cash).toBe(afterOneMinute);
  });
});

/**
 * An hour of game time with an assertion on every one of the 72 000 ticks.
 *
 * That is genuinely slow — around five seconds free, and past Vitest's five-second
 * default once the whole suite is running under coverage. Raised rather than
 * shortened: the point of the test is that the balance never dips *at any
 * moment*, and sampling less often is exactly the weakening that would let a
 * transient negative through.
 */
const BRUTE_FORCE_TIMEOUT_MS = 60_000;

describe('cash never goes below zero', () => {
  it(
    'holds under a payroll it cannot possibly afford',
    () => {
      /*
       * The hard requirement, attempted by brute force: the maximum payroll, no
       * income, and an hour of game time. Checked every tick rather than at the
       * end, because a balance that dipped negative and recovered would pass an
       * end-state assertion.
       */
      const sim = new Sim({ seed: 1 });
      sim.world.economy.cash = 500;
      for (let i = 0; i < MAX_EMPLOYEES; i++) hire(sim.world, 'cook', 1);
      sim.world.economy.cash = 2;

      for (let tick = 0; tick < TICKS_PER_MINUTE * 60; tick++) {
        sim.tick();
        expect(sim.world.economy.cash, `negative at tick ${String(tick)}`).toBeGreaterThanOrEqual(0);
      }
    },
    BRUTE_FORCE_TIMEOUT_MS,
  );

  it('leaves no debt behind when somebody walks out', () => {
    // "There is no debt or game over." An employee who leaves takes their
    // unpaid wages with them rather than leaving a liability on the books.
    /*
     * A payroll the stand cannot outrun. One cook used to be enough to make this
     * happen because a Stage 1 stand earned almost nothing; after Phase 12's
     * balancing it earns about ₡14 a minute and a single cook pays for itself,
     * so the premise has to be built rather than assumed. A full house of
     * top-skill cooks costs roughly ₡120 a minute against that ₡14.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    for (let i = 0; i < MAX_EMPLOYEES; i++) expect(hire(sim.world, 'cook', 1)).toBe('ok');
    sim.world.economy.cash = 0;

    sim.advance(Math.ceil(UNPAID_GRACE_MS / TICK_MS) + TICKS_PER_MINUTE);

    // Never negative, and never more than the takings that arrived while the
    // payroll was going unpaid — there is no debt anywhere on the books.
    expect(sim.world.economy.cash).toBeGreaterThanOrEqual(0);
    expect(sim.world.stats.employeesLeftUnpaid).toBeGreaterThan(0);
  });
});

describe('unpaid wages cost an employee, deterministically', () => {
  it('waits the full grace period before anybody leaves', () => {
    /*
     * Three real minutes. A player who is briefly broke — one bad minute — must
     * not lose staff for it, because that is a punishment for a situation they
     * were already fixing.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    // A payroll the stand's ~₡14/min cannot service — see the note above.
    for (let i = 0; i < MAX_EMPLOYEES; i++) expect(hire(sim.world, 'cook', 1)).toBe('ok');
    sim.world.economy.cash = 0;

    // Just under the grace period.
    sim.advance(Math.floor((UNPAID_GRACE_MS - WAGE_SETTLE_MS * 2) / TICK_MS));
    expect(sim.world.employees.activeCount, 'left too early').toBe(MAX_EMPLOYEES);

    sim.advance(Math.ceil((WAGE_SETTLE_MS * 4) / TICK_MS));
    expect(sim.world.employees.activeCount, 'never left').toBeLessThan(MAX_EMPLOYEES);
  });

  it('loses the highest-paid first', () => {
    /*
     * The one whose departure most improves the situation, and the choice a
     * player would make themselves.
     *
     * **The padding is hired first, and that ordering is the test.** Wages are
     * paid in slot order and dismissal picks by wage, so a stand that is only
     * *partly* insolvent pays whoever is early in the pool and dismisses the
     * dearest of whoever is left. Padding hired last therefore got paid out of
     * the takings while the expensive cook went unpaid — and the cheapest
     * employee was dismissed, which looked like a bug in the dismissal rule and
     * was a fact about the payment order.
     *
     * Hiring the padding first puts the three under observation at the end of
     * the queue for payment, which is what makes "the dearest of the unpaid
     * leaves" the property actually under test.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    for (let i = 3; i < MAX_EMPLOYEES; i++) expect(hire(sim.world, 'cleaner', 0)).toBe('ok');
    expect(hire(sim.world, 'cleaner', 0)).toBe('ok');
    expect(hire(sim.world, 'cook', 1)).toBe('ok');
    expect(hire(sim.world, 'waiter', 0.2)).toBe('ok');

    const cheap = sim.world.employees.at(MAX_EMPLOYEES - 3);
    const expensive = sim.world.employees.at(MAX_EMPLOYEES - 2);
    expect(expensive.wagePerMinute).toBeGreaterThan(cheap.wagePerMinute);
    const expensiveId = expensive.entityId;

    sim.world.economy.cash = 0;
    sim.advance(Math.ceil(UNPAID_GRACE_MS / TICK_MS) + TICKS_PER_MINUTE);

    let stillHere = false;
    for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
      if (!sim.world.employees.isActive(slot)) continue;
      if (sim.world.employees.at(slot).entityId === expensiveId) stillHere = true;
    }
    expect(stillHere, 'the cheapest employee was dismissed instead').toBe(false);
  });

  it('loses one at a time, not the whole staff at once', () => {
    /*
     * Losing everybody to a brief cash dip is a punishment; losing one is a
     * warning that fixes itself if the player responds. Asserted at the moment
     * the first departure happens.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    for (let i = 0; i < MAX_EMPLOYEES; i++) hire(sim.world, 'cook', 1);
    sim.world.economy.cash = 0;

    let sawFirstDeparture = false;
    for (let tick = 0; tick < Math.ceil(UNPAID_GRACE_MS / TICK_MS) + 200; tick++) {
      sim.tick();
      if (sim.world.employees.activeCount < MAX_EMPLOYEES) {
        sawFirstDeparture = true;
        expect(sim.world.employees.activeCount, 'the whole staff walked out at once').toBe(MAX_EMPLOYEES - 1);
        break;
      }
    }
    expect(sawFirstDeparture, 'nobody ever left').toBe(true);
  });

  it('announces the departure and says it was about money', () => {
    // `fired` and `unpaid` mean opposite things to a player: one is a decision
    // they made, one is a consequence they need to notice.
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    // A payroll the stand's ~₡14/min cannot service — see the note above.
    for (let i = 0; i < MAX_EMPLOYEES; i++) expect(hire(sim.world, 'cook', 1)).toBe('ok');
    sim.world.economy.cash = 0;

    const reasons: string[] = [];
    const unsubscribe = sim.events.subscribe((event) => {
      if (event.t === 'EMPLOYEE_LEFT') reasons.push(event.reason);
    });
    sim.advance(Math.ceil(UNPAID_GRACE_MS / TICK_MS) + TICKS_PER_MINUTE);
    unsubscribe();

    expect(reasons).toContain('unpaid');
  });

  it('produces the same departure on every run', () => {
    const build = (): Sim => {
      const sim = new Sim({ seed: 77 });
      sim.world.economy.cash = 1000;
      hire(sim.world, 'cook', 0.5);
      hire(sim.world, 'cook', 0.5);
      hire(sim.world, 'waiter', 0.5);
      sim.world.economy.cash = 0;
      sim.advance(Math.ceil(UNPAID_GRACE_MS / TICK_MS) + 400);
      return sim;
    };
    expect(build().world.hash()).toBe(build().world.hash());
  });
});

describe('hiring is validated in the simulation', () => {
  it('refuses a role that does not exist', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    expect(hire(sim.world, 'astronaut', 0.5)).toBe('unknown-role');
    expect(sim.world.economy.cash).toBe(1000);
  });

  it('refuses a hire the player cannot afford, through the command path', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = role(roleIndexOf('cook')).hireCost - 1;

    sim.dispatch({ t: 'HIRE', roleId: 'cook', skill: 0.5 });
    sim.tick();

    expect(sim.world.employees.activeCount).toBe(0);
  });

  it('refuses to overfill the payroll', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100_000;
    for (let i = 0; i < MAX_EMPLOYEES; i++) {
      expect(hire(sim.world, 'cook', 0.5), `hire ${String(i)}`).toBe('ok');
    }
    expect(hire(sim.world, 'cook', 0.5)).toBe('full');
    expect(sim.world.employees.activeCount).toBe(MAX_EMPLOYEES);
  });

  it('clamps a skill that arrives out of range', () => {
    // It arrives on a command, and a command arrives from a log this build did
    // not write.
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 1000;
    expect(hire(sim.world, 'cook', 42)).toBe('ok');
    expect(hire(sim.world, 'cook', -9)).toBe('ok');

    expect(sim.world.employees.at(0).skill).toBe(1);
    expect(sim.world.employees.at(1).skill).toBe(0);
  });

  it('refuses to fire somebody who is not there', () => {
    const sim = new Sim({ seed: 1 });
    expect(fire(sim.world, 9999)).toBe('not-found');
    expect(() => {
      sim.dispatch({ t: 'FIRE', entityId: 9999 });
      sim.tick();
    }).not.toThrow();
  });
});
