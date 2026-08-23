import { describe, expect, it } from 'vitest';
import { COUNTER_HANDOVER_MS, TASK_KINDS } from '@config/employees';
import { layoutForStage } from '@config/layouts';
import { TICK_MS } from '@config/simulation';
import { brainStateName } from '@sim/ai/EmployeeBrain';
import { Sim } from '@sim/core/Sim';
import { ORDER_ON_PASS } from '@sim/stores/OrderStore';
import { UNCLAIMED } from '@sim/stores/TaskStore';
import { buyPlace } from '@sim/systems/StoreSystem';
import { nextServable } from '@sim/systems/ServiceSystem';
import { hire } from '@sim/systems/StaffSystem';
import { mayClaimTask } from '@sim/systems/TaskBoardSystem';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const RUN_MINUTES = 30;
const LONG_RUN_TIMEOUT_MS = 240_000;

/**
 * What automation is actually worth — the continuation directive's §14.
 *
 * The question the directive asks is not "does a cook exist" but *"what does
 * hiring one buy you"*, in the five terms it names: utilisation, orders
 * processed, player clicks, revenue with the player absent versus present, and
 * what the machines add on top. Each of those is a number, so each is measured
 * here rather than asserted from the design document.
 *
 * ## Why utilisation is counted per tick and not read from the interface
 *
 * `StaffView.busy01` is sampled once per *publish*, and publishing is throttled
 * to wall-clock (`UI_SAMPLE_MS`). In real play that is honest — a cook's
 * ~670 ms of `PERFORMING` spans six or seven publishes. In a harness that
 * batches thousands of ticks into one frame it is not: the whole burst falls
 * between two samples and the panel reports `0.000` for a cook that worked all
 * shift. A browser probe against the preview build showed exactly that —
 * `busy=0.000` and `iş yok` across twenty-one simulated minutes while the
 * served count climbed 45 → 74, which is the cook's own work being counted
 * everywhere except in the number named after it.
 *
 * So the measurement below walks `world.employees` every tick. Nothing here
 * goes through the bridge.
 *
 * ## Why there was no guard before
 *
 * The suite had tests that a cook *earns* (`employeeLifecycle`) and that the
 * board assigns exactly one claimant (`taskboard`), but none that a cook's
 * utilisation is above zero — `expect(share).toBeGreaterThan(0)` reports the
 * distribution and `expect(working).toBeLessThanOrEqual(1)` passes at nothing.
 * A change that stopped posting `PREP_ORDER` altogether would have left the
 * served count intact in every player-cooking harness and been caught by none
 * of them.
 */

interface Run {
  served: number;
  revenue: number;
  cash: number;
  /** `MANUAL_PREP` commands the scenario issued — the player's clicks. */
  clicks: number;
  /** Share of employee-ticks spent MOVING or PERFORMING, 0..1. */
  utilisation: number;
  employeeTicks: number;
  /** Customers who ran out of patience — what a shorter wait buys back. */
  abandoned: number;
  /** Food cooked for somebody who had already left. */
  wasted: number;
}

interface Options {
  /** Hire a cook at this skill before the run, or don't hire at all. */
  cook?: number;
  /** Click the station every tick, as an attentive human does. */
  playerCooks?: boolean;
  /**
   * Hand finished trays over every tick — the player's half of the loop.
   *
   * Separate from `playerCooks` because the two are now different jobs, and
   * telling them apart is the whole subject of the second describe block below.
   */
  playerServes?: boolean;
  /** Buy and finish these buildings before the run starts. */
  buildings?: readonly string[];
  minutes?: number;
  /** The restaurant stage to measure at. Stage 1 unless said otherwise. */
  stage?: 1 | 2 | 3 | 4;
}

/** One scenario, measured tick by tick. */
function measure(options: Options): Run {
  const sim = new Sim({ seed: 424242 });
  sim.world.progression.stage = options.stage ?? 1;
  sim.world.economy.cash = 10_000;

  for (const [index, id] of (options.buildings ?? []).entries()) {
    // Spread along a legal, out-of-the-way line so two machines never contest
    // one cell — a refused placement would silently measure the wrong world.
    expect(buyPlace(sim.world, id, 4 + index * 2, 16.5), `place ${id}`).toBe('ok');
  }

  /*
   * The same warm-up in every scenario, whether or not anything was bought.
   *
   * It exists to let a construction site finish before the clock that counts
   * starts — but running it *only* in the scenarios with buildings put those
   * runs two game-minutes further into the day than their own control, so the
   * two were sampling different traffic. Measured: equipped 61 served against
   * bare 63, which reads as the equipment costing throughput and is really the
   * harness comparing two different mornings. Everything advances alike now.
   */
  sim.advance(TICKS_PER_MINUTE * 2);
  expect(sim.world.layout.pendingBuilds.length, 'a site was still up').toBe(0);

  if (options.cook !== undefined) {
    expect(hire(sim.world, 'cook', options.cook)).toBe('ok');
  }

  /*
   * Spending is what the scenarios are being compared on, so the till is reset
   * to zero after the setup: otherwise the run that bought two machines starts
   * ₡60 behind and "revenue" would be measuring the purchase.
   */
  sim.world.economy.cash = 0;
  const revenueFloor = sim.world.economy.lifetimeRevenue;
  const servedFloor = sim.world.stats.customersServed;
  const abandonedFloor = sim.world.stats.customersAbandoned;
  const wastedFloor = sim.world.stats.ordersWasted;

  let clicks = 0;
  let working = 0;
  let employeeTicks = 0;

  for (let tick = 0; tick < TICKS_PER_MINUTE * (options.minutes ?? RUN_MINUTES); tick++) {
    if (options.playerCooks === true) {
      sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      clicks++;
    }
    if (options.playerServes === true) {
      sim.dispatch({ t: 'SERVE_ORDER', orderSlot: -1 });
      clicks++;
    }
    sim.tick();
    for (let slot = 0; slot < sim.world.employees.scanLimit; slot++) {
      if (!sim.world.employees.isActive(slot)) continue;
      employeeTicks++;
      const name = brainStateName(sim.world.employees.at(slot).state);
      if (name === 'MOVING' || name === 'PERFORMING') working++;
    }
  }

  return {
    served: sim.world.stats.customersServed - servedFloor,
    revenue: sim.world.economy.lifetimeRevenue - revenueFloor,
    cash: sim.world.economy.cash,
    clicks,
    utilisation: employeeTicks === 0 ? 0 : working / employeeTicks,
    employeeTicks,
    abandoned: sim.world.stats.customersAbandoned - abandonedFloor,
    wasted: sim.world.stats.ordersWasted - wastedFloor,
  };
}

describe('what hiring a cook is worth', () => {
  it(
    'a cook works — utilisation is above zero, and that is now guarded',
    () => {
      const run = measure({ cook: 0.7 });

      expect(run.employeeTicks, 'nobody was employed').toBeGreaterThan(0);
      /*
       * The floor is deliberately far below the measured value (≈4%). A cook's
       * task is *starting* the prep — ~670 ms at skill 0.7 — and the station
       * then cooks for seconds with the cook already idle, so a healthy Stage-1
       * cook lives in the low single digits. What this guards is the
       * difference between "quiet" and "never assigned", and zero is the only
       * value that means the second.
       */
      expect(run.utilisation, `cook utilisation ${(run.utilisation * 100).toFixed(2)}%`).toBeGreaterThan(
        0.002,
      );
      expect(run.served, 'a cook alone served nobody').toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'the player absent still earns, and the click count is the point',
    () => {
      const manual = measure({ playerCooks: true, playerServes: true });
      const automated = measure({ cook: 0.7 });

      /*
       * The roadmap's Player Value line for Phase 10 — "the player stops being
       * the cook and becomes a manager" — has exactly this measurable form:
       * comparable service for none of the clicking.
       */
      expect(manual.clicks).toBe(TICKS_PER_MINUTE * RUN_MINUTES * 2);
      expect(automated.clicks).toBe(0);
      expect(
        automated.served / manual.served,
        `automated ${String(automated.served)} vs manual ${String(manual.served)} served`,
      ).toBeGreaterThan(0.6);
      expect(automated.revenue, 'an unattended stand earned nothing').toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'a cook hired beside a cooking player is honest about adding nothing',
    () => {
      /*
       * This is the measurement the staff panel's own pitch is written from,
       * re-run at the current preparation times so the sentence stays true.
       *
       * `MANUAL_PREP` is applied at the top of the tick and consumes every
       * startable order before `TaskBoardSystem` posts one, so a player who
       * clicks every tick leaves the board permanently empty. The cook is not
       * broken; there is nothing for them to take. What they cost is wages.
       */
      const alone = measure({ playerCooks: true, playerServes: true });
      const beside = measure({ playerCooks: true, playerServes: true, cook: 0.7 });

      expect(beside.served).toBeLessThanOrEqual(alone.served);
      expect(beside.revenue - beside.cash, 'wages were free').toBeGreaterThan(0);
      expect(
        beside.utilisation,
        `cook beside a cooking player: ${(beside.utilisation * 100).toFixed(2)}% busy`,
      ).toBeLessThan(0.02);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'the machines are worth their price to an unattended stand',
    () => {
      /*
       * Decision B's condition, measured where it matters rather than at the
       * station-speed multiplier: a stand nobody is playing, with and without
       * the equipment.
       *
       * ## Why this window is four hours and not thirty minutes
       *
       * At thirty minutes the equipped stand measured *two fewer* customers
       * served (61 against 63) — deterministically, and identically from four
       * different placements on the lot, so not obstruction and not noise in
       * the ordinary sense. It is the cut-off: faster preparation puts the
       * pipeline in a different phase at the last tick, and with `turnedAway`
       * at zero the whole difference is who happened to be mid-service when
       * the clock stopped. Over four hours the phase stops dominating and the
       * measurement is 490 served against 487.
       *
       * That thinness is itself the finding, and it is the same one the
       * balance matrix reports: **Stage 1 has no queue.** Nobody abandons, so
       * shortening preparation cannot convert into many more customers. What
       * it converts into at Stage 1 is the wait itself — a drink at 3.33 s
       * instead of 5.0 s — which `buildingEffect.test.ts` measures directly at
       * the kitchen.
       */
      const bare = measure({ cook: 0.7, minutes: 240 });
      const equipped = measure({ cook: 0.7, buildings: ['cola-machine', 'burger-machine'], minutes: 240 });

      expect(
        equipped.served,
        `equipped ${String(equipped.served)} vs bare ${String(bare.served)} served`,
      ).toBeGreaterThanOrEqual(bare.served);
      expect(equipped.revenue).toBeGreaterThan(bare.revenue);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'and at Stage 2 they buy back most of what an absent player costs',
    () => {
      /*
       * The other half of the same finding, and the one that answers Decision
       * B properly: a building's worth is not a constant, it is whatever the
       * constraint it relieves is currently costing.
       *
       * **What that constraint is has changed.** Until 2026-08-23 a Stage-2
       * stand lost customers to preparation time, and the equipment bought the
       * abandonment back — 4+10 lost bare against 2+5 equipped, 527 served
       * against 545. The counter handover moved the bottleneck: with the
       * player away, every tray now waits `COUNTER_HANDOVER_MS` for the cook,
       * and that wait throttles the whole pipeline. Losses fall on both sides
       * (7 bare, 8 equipped, indistinguishable), and the difference shows up
       * where the throttle is instead:
       *
       *   bare       370 served  ₡3864
       *   machines   524 served  ₡5526     (+42% served, +43% revenue)
       *
       * Which is a *larger* effect than the equipment ever had before, and for
       * a legible reason: faster preparation puts more trays through a fixed
       * handover. Asserted against the bare run rather than against those
       * literals, so the test measures the relationship and does not have to be
       * rewritten every time the economy is tuned.
       */
      const bare = measure({ cook: 0.7, stage: 2, minutes: 240 });
      const equipped = measure({
        cook: 0.7,
        stage: 2,
        buildings: ['cola-machine', 'burger-machine'],
        minutes: 240,
      });

      expect(
        equipped.served / bare.served,
        `equipped ${String(equipped.served)} vs bare ${String(bare.served)} served`,
      ).toBeGreaterThan(1.15);
      expect(equipped.revenue).toBeGreaterThan(bare.revenue);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

/**
 * The responsibility split — `docs/COOK_PLAYER_INTERACTION_DESIGN.md`.
 *
 * The complaint this answers, in the player's words: hire a cook and there is
 * nothing left to do. It was true. Preparation was the only action Stage 1 ever
 * asked for, delivery happened by itself, and a ₡20 hire therefore bought the
 * end of the game rather than the end of the clicking.
 *
 * These four tests pin the split so it cannot quietly close again:
 *
 *  1. the cook does not take the player's action away instantly,
 *  2. the cook does take it eventually, so an unattended stand still runs,
 *  3. the player's presence is worth a measurable amount, and
 *  4. table service is still the waiter's, not the cook's.
 */
describe('what the player still does after hiring a cook', () => {
  it(
    'leaves the handover to the player for the whole window, then covers it',
    () => {
      /*
       * The window itself, measured on the clock rather than assumed from the
       * constant. A tray reaches the pass; nobody clicks; the cook is idle and
       * has every reason to walk over. It must not, for `COUNTER_HANDOVER_MS`.
       */
      const sim = new Sim({ seed: 424242 });
      sim.world.economy.cash = 10_000;
      expect(hire(sim.world, 'cook', 0.7)).toBe('ok');
      sim.world.economy.cash = 0;

      let readyAtMs = -1;
      let deliveredAtMs = -1;
      for (let tick = 0; tick < TICKS_PER_MINUTE * 20 && deliveredAtMs < 0; tick++) {
        sim.tick();
        for (let slot = 0; slot < sim.world.orders.scanLimit; slot++) {
          if (!sim.world.orders.isActive(slot)) continue;
          const order = sim.world.orders.at(slot);
          if (order.state === ORDER_ON_PASS && readyAtMs < 0) readyAtMs = order.readyAtMs;
          if (readyAtMs >= 0 && order.readyAtMs === readyAtMs && order.deliveredAtMs > 0) {
            deliveredAtMs = order.deliveredAtMs;
          }
        }
      }

      expect(readyAtMs, 'nothing ever reached the pass').toBeGreaterThan(0);
      expect(deliveredAtMs, 'the cook never covered the handover at all').toBeGreaterThan(0);
      const heldMs = deliveredAtMs - readyAtMs;
      expect(
        heldMs,
        `the cook took the tray after ${String(heldMs)} ms — inside the player's ` +
          `${String(COUNTER_HANDOVER_MS)} ms window`,
      ).toBeGreaterThanOrEqual(COUNTER_HANDOVER_MS);
      // And not so late that the stand is really unattended: one walk to the
      // counter on top of the window, not a minute of cooling food.
      expect(heldMs).toBeLessThan(COUNTER_HANDOVER_MS * 4);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'is worth a measurable amount at the pass, and more as the stand grows',
    () => {
      /*
       * The whole design in two numbers per stage. A cook is hired in every arm
       * — this is not "automation versus no automation", it is *what is left
       * for the player to do* once the automation is bought.
       *
       *   Stage 1   absent 467 / ₡2426      serving 489 / ₡2548     +4.7%
       *   Stage 2   absent 370 / ₡3864      serving 542 / ₡5690     +46%
       *
       * Stage 1 barely moves and that is honest: it has no queue, so there is
       * little for attention to buy. The shape is the point — presence is worth
       * more the busier the stand gets, which is the opposite of an idle game
       * where the player matters less over time.
       */
      const absentS1 = measure({ cook: 0.7, minutes: 240 });
      const servingS1 = measure({ cook: 0.7, playerServes: true, minutes: 240 });
      const absentS2 = measure({ cook: 0.7, stage: 2, minutes: 240 });
      const servingS2 = measure({ cook: 0.7, stage: 2, playerServes: true, minutes: 240 });

      expect(absentS1.revenue, 'an unattended Stage-1 stand earned nothing').toBeGreaterThan(0);
      expect(absentS2.revenue, 'an unattended Stage-2 stand earned nothing').toBeGreaterThan(0);

      expect(
        servingS1.served,
        `S1 serving ${String(servingS1.served)} vs absent ${String(absentS1.served)}`,
      ).toBeGreaterThan(absentS1.served);
      expect(
        servingS2.served / absentS2.served,
        `S2 serving ${String(servingS2.served)} vs absent ${String(absentS2.served)}`,
      ).toBeGreaterThan(1.2);

      // The gain grows with the stand. If this ever inverts, presence has
      // started mattering *less* as the game goes on and the loop is dying.
      const gainS1 = servingS1.served / absentS1.served;
      const gainS2 = servingS2.served / absentS2.served;
      expect(gainS2, `S1 gain ${gainS1.toFixed(3)}, S2 gain ${gainS2.toFixed(3)}`).toBeGreaterThan(gainS1);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'rewards delegating the kitchen rather than clicking everything',
    () => {
      /*
       * The anti-busywork check, and the one that says the split is a *design*
       * rather than a tax. A player who clicks both buttons every tick issues
       * twice the commands of one who only serves — and gets no more for it,
       * because `MANUAL_PREP` lands at the top of the tick and empties the
       * board before the cook can take anything (`STAGE1_STAFF_SYSTEM.md` §2).
       *
       * Measured at Stage 2: serve-only 542 served with the cook 13.0% busy;
       * both 537 with the cook 2.1% busy. Delegating is not merely as good, it
       * is better, and the cook stops being a wage with nothing behind it.
       */
      const serveOnly = measure({ cook: 0.7, stage: 2, playerServes: true, minutes: 240 });
      const everything = measure({
        cook: 0.7,
        stage: 2,
        playerCooks: true,
        playerServes: true,
        minutes: 240,
      });

      expect(everything.clicks).toBe(serveOnly.clicks * 2);
      expect(
        everything.served,
        `clicking everything: ${String(everything.served)} served vs ${String(serveOnly.served)} for serving alone`,
      ).toBeLessThanOrEqual(serveOnly.served);
      expect(
        serveOnly.utilisation,
        `cook ${(serveOnly.utilisation * 100).toFixed(2)}% busy when the player only serves, ` +
          `${(everything.utilisation * 100).toFixed(2)}% when they also cook`,
      ).toBeGreaterThan(everything.utilisation);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it('gives the counter to the player and the dining room to the waiter', () => {
    /*
     * The boundary, asked directly rather than inferred from a run. Two rules
     * meet here and they are easy to conflate:
     *
     *   - **The counter** is the player's station, so *every* role waits
     *     `COUNTER_HANDOVER_MS` before covering it — including a waiter, whose
     *     own task table lists `DELIVER_ORDER`. Hiring a waiter at Stage 1 buys
     *     cover, not the loop.
     *   - **A table** is the waiter's own work, taken on sight. A cook may
     *     still cover it once it has gone begging, which is what stops a diner
     *     with a cook and no waiter from silently ceasing to serve anyone —
     *     but never before the window, so the waiter's ₡18 is always the
     *     better answer.
     *
     * Checked at every stage, both before and after the window, because "may
     * not yet" and "may never" are the two things this test exists to keep
     * apart.
     */
    for (const stage of [1, 2, 3, 4] as const) {
      const sim = new Sim({ seed: 7 });
      sim.world.progression.stage = stage;
      sim.world.economy.cash = 10_000;
      expect(hire(sim.world, 'cook', 0.7)).toBe('ok');
      expect(hire(sim.world, 'waiter', 0.7)).toBe('ok');

      const hasTables = layoutForStage(stage).tables.length > 0;
      const orderSlot = sim.world.orders.acquire();
      const order = sim.world.orders.at(orderSlot);
      order.entityId = sim.world.allocateEntityId();
      order.state = ORDER_ON_PASS;

      const taskSlot = sim.world.tasks.acquire();
      const task = sim.world.tasks.at(taskSlot);
      task.entityId = sim.world.allocateEntityId();
      task.kind = TASK_KINDS.indexOf('DELIVER_ORDER');
      task.subject = orderSlot;
      task.claimedBy = UNCLAIMED;

      const cook = sim.world.employees.at(0);
      const waiter = sim.world.employees.at(1);
      expect(cook.role, 'the fixture hired in a different order').not.toBe(waiter.role);

      // Just posted: inside the player's window everywhere except a table,
      // where it is simply the waiter's job.
      task.postedAtMs = sim.world.clock.simTimeMs;
      expect(mayClaimTask(sim.world, cook, taskSlot), `stage ${String(stage)}: cook, fresh task`).toBe(false);
      expect(mayClaimTask(sim.world, waiter, taskSlot), `stage ${String(stage)}: waiter, fresh task`).toBe(
        hasTables,
      );

      // Long past the window: covered by whoever is eligible.
      task.postedAtMs = sim.world.clock.simTimeMs - COUNTER_HANDOVER_MS * 10;
      expect(mayClaimTask(sim.world, cook, taskSlot), `stage ${String(stage)}: cook, stale task`).toBe(true);
      expect(mayClaimTask(sim.world, waiter, taskSlot), `stage ${String(stage)}: waiter, stale task`).toBe(
        true,
      );
    }
  });

  it('leaves the serve button off at a stage where food is carried', () => {
    /*
     * The other half of the same boundary, on the player's side. A dining room
     * is carried, so `SERVE_ORDER` has nothing to act on there — and the card
     * must not offer a button that would refuse. Measured through
     * `nextServable`, which is what both the command and the bridge ask.
     */
    for (const stage of [1, 2, 3, 4] as const) {
      const sim = new Sim({ seed: 11 });
      sim.world.progression.stage = stage;

      const customerSlot = sim.world.customers.acquire();
      const customer = sim.world.customers.at(customerSlot);
      customer.entityId = sim.world.allocateEntityId();

      const orderSlot = sim.world.orders.acquire();
      const order = sim.world.orders.at(orderSlot);
      order.entityId = sim.world.allocateEntityId();
      order.customerSlot = customerSlot;
      order.state = ORDER_ON_PASS;
      order.readyAtMs = sim.world.clock.simTimeMs;

      const hasTables = layoutForStage(stage).tables.length > 0;
      expect(
        nextServable(sim.world) >= 0,
        hasTables
          ? `stage ${String(stage)} has tables and still offered the player a handover`
          : `stage ${String(stage)} is a counter and offered the player nothing to serve`,
      ).toBe(!hasTables);
    }
  });
});
