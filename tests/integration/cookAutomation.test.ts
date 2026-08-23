import { describe, expect, it } from 'vitest';
import { TICK_MS } from '@config/simulation';
import { brainStateName } from '@sim/ai/EmployeeBrain';
import { Sim } from '@sim/core/Sim';
import { buyPlace } from '@sim/systems/StoreSystem';
import { hire } from '@sim/systems/StaffSystem';

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
      const manual = measure({ playerCooks: true });
      const automated = measure({ cook: 0.7 });

      /*
       * The roadmap's Player Value line for Phase 10 — "the player stops being
       * the cook and becomes a manager" — has exactly this measurable form:
       * comparable service for none of the clicking.
       */
      expect(manual.clicks).toBe(TICKS_PER_MINUTE * RUN_MINUTES);
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
      const alone = measure({ playerCooks: true });
      const beside = measure({ playerCooks: true, cook: 0.7 });

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
    'and at Stage 2, where there is a queue, they remove the abandonment',
    () => {
      /*
       * The other half of the same finding, and the one that answers Decision
       * B properly. A building's worth is not a constant — it is whatever the
       * constraint it relieves is currently costing. At Stage 1 that is nearly
       * nothing; at Stage 2 the stand starts losing customers to the wait, and
       * that is exactly what the equipment buys back:
       *
       *   bare          527 served  ₡5511   4 abandoned  10 wasted
       *   machines L1   545 served  ₡5780   2 abandoned   5 wasted
       *   machines L2   554 served  ₡5890   0 abandoned   0 wasted
       *
       * Asserted against the bare run rather than against those literals, so
       * the test measures the *relationship* and does not have to be rewritten
       * every time the economy is tuned.
       */
      const bare = measure({ cook: 0.7, stage: 2, minutes: 240 });
      const equipped = measure({
        cook: 0.7,
        stage: 2,
        buildings: ['cola-machine', 'burger-machine'],
        minutes: 240,
      });

      expect(bare.abandoned + bare.wasted, 'Stage 2 had no queue pressure to relieve').toBeGreaterThan(0);
      expect(
        equipped.abandoned + equipped.wasted,
        `equipped lost ${String(equipped.abandoned)}+${String(equipped.wasted)}, bare lost ${String(bare.abandoned)}+${String(bare.wasted)}`,
      ).toBeLessThan(bare.abandoned + bare.wasted);
      expect(equipped.served).toBeGreaterThan(bare.served);
      expect(equipped.revenue).toBeGreaterThan(bare.revenue);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
