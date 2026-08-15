import { describe, expect, it } from 'vitest';
import { menuIndexOf, menuItem, MENU } from '@config/economy/menu';
import { PASS_CAPACITY } from '@config/economy/stations';
import { TICK_MS } from '@config/simulation';
import { customerStateName } from '@sim/ai/fsm/customerFsm';
import { Sim } from '@sim/core/Sim';
import { passLoad, stationsAllBusy } from '@sim/systems/KitchenSystem';
import { ORDER_ON_PASS, ORDER_PLACED } from '@sim/stores/OrderStore';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const LONG_RUN_TIMEOUT_MS = 120_000;

/**
 * The loop, end to end — GAME_EXECUTION_ROADMAP Phase 8, deliverable 9.
 *
 * "Spawn to despawn, asserting each stage transition and that cash increased by
 * the expected amount." Every previous phase tested its own half; this is the
 * first test that can fail because two halves disagree, which is the only kind
 * of failure an integration test is for.
 *
 * The player is the cook in Stage 1, so these runs dispatch `MANUAL_PREP` every
 * tick — the equivalent of somebody attentively clicking the station. That is
 * the *best case*, deliberately: if the loop cannot close with a perfect cook it
 * cannot close at all, and everything below is measured against that ceiling.
 */
function playFor(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
    sim.tick();
  }
}

describe('the whole loop', () => {
  it(
    'takes a customer from the road to a paid meal',
    () => {
      const sim = new Sim({ seed: 20260815 });
      const seen = new Set<string>();
      const events: string[] = [];
      const unsubscribe = sim.events.subscribe((event) => {
        events.push(event.t);
      });

      for (let tick = 0; tick < TICKS_PER_MINUTE * 20; tick++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();
        for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
          if (!sim.world.customers.isActive(slot)) continue;
          seen.add(customerStateName(sim.world.customers.at(slot).state));
        }
      }
      unsubscribe();

      // Every stage of the journey, in one run.
      for (const state of [
        'ENTERING',
        'PARKING',
        'LEAVING_VEHICLE',
        'WALKING_TO_DOOR',
        'ORDERING',
        'WAITING_FOR_FOOD',
        'EATING',
        'PAYING',
        'WALKING_TO_CAR',
        'EXITING',
      ]) {
        expect(seen, `never reached ${state}`).toContain(state);
      }

      // And the events that go with them, in the order the loop produces them.
      for (const type of [
        'CONVERSION_SUCCEEDED',
        'CUSTOMER_SPAWNED',
        'VEHICLE_PARKED',
        'ORDER_PLACED',
        'PREP_STARTED',
        'ORDER_READY',
        'ORDER_DELIVERED',
        'PAYMENT',
      ]) {
        expect(events, `never emitted ${type}`).toContain(type);
      }

      expect(events.indexOf('ORDER_PLACED')).toBeLessThan(events.indexOf('PREP_STARTED'));
      expect(events.indexOf('PREP_STARTED')).toBeLessThan(events.indexOf('ORDER_READY'));
      expect(events.indexOf('ORDER_READY')).toBeLessThan(events.indexOf('ORDER_DELIVERED'));
      expect(events.indexOf('ORDER_DELIVERED')).toBeLessThan(events.indexOf('PAYMENT'));
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'increases cash by exactly what the payments were worth',
    () => {
      /*
       * The arithmetic, not just the direction. Cash is credited net of the
       * ingredient cost, so the figure on the HUD is the one the player can
       * spend — and a test that only asserted "cash went up" would pass while
       * the stand sold at a loss.
       */
      const sim = new Sim({ seed: 4242 });
      let expected = 0;
      let payments = 0;

      const unsubscribe = sim.events.subscribe((event) => {
        if (event.t !== 'PAYMENT') return;
        payments++;
        // The cost belongs to the item that was actually sold, which the payment
        // event does not carry — so it is recovered from the served count and
        // asserted loosely below rather than pretended to be exact here.
        expected += event.amount + event.tip;
      });

      playFor(sim, TICKS_PER_MINUTE * 20);
      unsubscribe();

      expect(payments, 'nobody paid in twenty minutes').toBeGreaterThan(0);
      expect(sim.world.stats.customersServed).toBe(payments);
      expect(sim.world.economy.lifetimeRevenue).toBeCloseTo(expected, 6);

      // Cash is revenue less ingredients, so it is lower than revenue but still
      // positive: Stage 1 margins are 64-75% (ECONOMY_DESIGN §4).
      expect(sim.world.economy.cash).toBeGreaterThan(0);
      expect(sim.world.economy.cash).toBeLessThan(sim.world.economy.lifetimeRevenue);
      const margin = sim.world.economy.cash / sim.world.economy.lifetimeRevenue;
      expect(margin, `margin ${(margin * 100).toFixed(1)}%`).toBeGreaterThan(0.5);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'serves everybody the road delivers, which is fewer than the roadmap expects',
    () => {
      /*
       * **A conflict between two approved documents, recorded rather than
       * resolved.** GAME_EXECUTION_ROADMAP Phase 8 gives "at least 3 customers
       * served in 60 seconds" as a success metric. ECONOMY_DESIGN §3 fixes the
       * Stage 1 conversion rate at 0.09 with no upgrades, and the road delivers
       * about 19.5 convertible vehicles a minute (PHASE_5_REPORT §4) — so the
       * ceiling is 19.5 x 0.09 = **1.8 customers a minute**, and no kitchen can
       * beat it.
       *
       * Measured over ten minutes on this seed: 195 convertible arrivals, 21
       * conversions, 2 turned away for parking, 18 served, **0 abandoned and 0
       * wasted**. The kitchen keeps up with everybody who comes. The constraint
       * is the road, not the stand.
       *
       * That is arguably the design working: Stage 1 with nothing bought is
       * meant to be starved of customers, and the first two upgrades in Phase 9
       * are a sign and a roadside marker — both of which raise conversion. But
       * it does mean the roadmap's number cannot be met at Stage 1, and the
       * decision about which document moves is not one to take quietly.
       *
       * So this asserts what the economy actually permits, and the conflict is
       * in PHASE_8_REPORT and PROJECT_MEMORY for the user.
       */
      const sim = new Sim({ seed: 909 });
      playFor(sim, TICKS_PER_MINUTE * 10);

      const stats = sim.world.stats;
      const perMinute = stats.customersServed / 10;
      expect(perMinute, `${perMinute.toFixed(1)} served per minute`).toBeGreaterThan(1.5);

      // The kitchen is not the bottleneck, and this is what says so: nearly
      // everybody who converted was served, and nobody gave up waiting.
      const reached = stats.conversionsSucceeded - stats.turnedAwayNoParking;
      expect(stats.customersServed).toBeGreaterThan(reached * 0.8);
      expect(stats.customersAbandoned, 'somebody gave up despite an attentive cook').toBe(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'earns nothing at all if the player never cooks',
    () => {
      /*
       * The control for the test above, and the thing that makes "the player is
       * the cook" a real statement rather than a description. If cash rose
       * without a single `MANUAL_PREP`, the kitchen would be starting orders on
       * its own and Stage 1 would have no gameplay in it.
       */
      const idle = new Sim({ seed: 909 });
      idle.advance(TICKS_PER_MINUTE * 10);

      expect(idle.world.stats.customersServed).toBe(0);
      expect(idle.world.economy.cash).toBe(0);
      // They did come, and they did give up. That is the cost of not playing.
      expect(idle.world.stats.conversionsSucceeded).toBeGreaterThan(0);
      expect(idle.world.stats.customersAbandoned).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'leaks nothing over a long service',
    () => {
      /*
       * Orders are pooled and the pool is small. An order left behind holds its
       * station and its slot forever — measured during development at thirty
       * live orders against four live customers, after which nobody could order
       * and the stand quietly stopped taking money.
       */
      const sim = new Sim({ seed: 31337 });
      playFor(sim, TICKS_PER_MINUTE * 30);

      // Thirty minutes at the conversion-limited rate; see the note above about
      // why that ceiling is the road rather than the kitchen.
      expect(sim.world.stats.customersServed).toBeGreaterThan(20);
      // Live orders should track live customers, not accumulate.
      expect(sim.world.orders.activeCount).toBeLessThanOrEqual(
        sim.world.customers.activeCount + PASS_CAPACITY,
      );
      expect(sim.world.orders.activeCount).toBeLessThan(sim.world.orders.capacity);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'charges the price agreed when the order was placed',
    () => {
      /*
       * Raising the price the instant before every payment would make the ±50%
       * band meaningless, and charging somebody more than they agreed to is the
       * kind of thing a player notices and resents.
       */
      const sim = new Sim({ seed: 606 });
      const charged: number[] = [];
      const unsubscribe = sim.events.subscribe((event) => {
        if (event.t === 'PAYMENT') charged.push(event.amount);
      });

      playFor(sim, TICKS_PER_MINUTE * 5);
      // Triple every price, then keep playing. Orders already placed must be
      // unaffected, and the band clamps the new ones.
      for (const item of MENU) sim.world.economy.prices.set(item.id, item.basePrice * 3);
      playFor(sim, TICKS_PER_MINUTE * 10);
      unsubscribe();

      expect(charged.length).toBeGreaterThan(3);
      const highest = Math.max(...charged);
      const dearest = Math.max(...MENU.map((item) => item.basePrice * 1.5));
      expect(highest, 'somebody was charged above the price band').toBeLessThanOrEqual(dearest);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('the kitchen under pressure', () => {
  it(
    'keeps making progress with every station busy, the pass full and the queue backed up',
    () => {
      /*
       * The deadlock test the roadmap asks for by name, in the permanent suite.
       *
       * Every station cooking, every pass slot occupied, a full queue outside.
       * Each of those is a legitimate blocking condition on its own; together
       * they are the state where a system that resolves them in the wrong order
       * stops dead. And a stalled kitchen does not crash — it looks exactly like
       * a slow one.
       */
      const sim = new Sim({ seed: 5150 });

      // Jam the pass by hand first, so the kitchen is blocked from the start.
      const chips = menuIndexOf('chips');
      for (let i = 0; i < PASS_CAPACITY; i++) {
        const slot = sim.world.orders.acquire();
        if (slot < 0) break;
        const order = sim.world.orders.at(slot);
        order.entityId = sim.world.allocateEntityId();
        order.item = chips;
        order.state = ORDER_ON_PASS;
        order.readyAtMs = sim.world.clock.simTimeMs;
      }
      expect(passLoad(sim.world)).toBe(PASS_CAPACITY);

      // Run with the jam in place. Nothing should throw, and nothing should
      // wedge: customers still arrive, queue, wait and eventually give up.
      playFor(sim, TICKS_PER_MINUTE * 5);
      const abandonedUnderJam = sim.world.stats.customersAbandoned;
      expect(abandonedUnderJam, 'the jam produced no observable consequence').toBeGreaterThan(0);

      // Clear the pass. The kitchen must recover on its own.
      for (let slot = 0; slot < sim.world.orders.scanLimit; slot++) {
        if (!sim.world.orders.isActive(slot)) continue;
        if (sim.world.orders.at(slot).state === ORDER_ON_PASS) sim.world.orders.release(slot);
      }

      const servedBefore = sim.world.stats.customersServed;
      playFor(sim, TICKS_PER_MINUTE * 10);
      expect(
        sim.world.stats.customersServed,
        'the kitchen never recovered after the jam cleared',
      ).toBeGreaterThan(servedBefore);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'never wedges over a long run at full stretch',
    () => {
      /*
       * The looser, longer version: play for half an hour and assert the stand
       * is still serving in its final minutes. A deadlock that takes twenty
       * minutes to form passes every short test in this file.
       */
      /*
       * The final *five* minutes, not the final one. At the conversion-limited
       * rate of roughly 1.8 customers a minute, a single quiet minute happens
       * about one run in six by chance alone — a test that failed on that would
       * be measuring the arrival process, not the kitchen.
       */
      const sim = new Sim({ seed: 777 });
      playFor(sim, TICKS_PER_MINUTE * 25);
      const before = sim.world.stats.customersServed;
      playFor(sim, TICKS_PER_MINUTE * 5);

      expect(before).toBeGreaterThan(25);
      expect(
        sim.world.stats.customersServed - before,
        'nobody was served in the final five minutes',
      ).toBeGreaterThan(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'reports what the jam cost, rather than hiding it',
    () => {
      // Food made for somebody who left. A stand losing money to waste looks
      // exactly like one that is simply slow, until this number separates them.
      const sim = new Sim({ seed: 8801 });
      playFor(sim, TICKS_PER_MINUTE * 20);

      expect(sim.world.stats.ordersWasted).toBeGreaterThanOrEqual(0);
      expect(sim.world.stats.ordersWasted).toBeLessThan(sim.world.stats.customersServed);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it(
    'never leaves an order pointing at a station that is not working on it',
    () => {
      // A stale reservation is a station that can never be used again, and it is
      // invisible: the kitchen simply gets slower and slower.
      const sim = new Sim({ seed: 1234 });
      for (let tick = 0; tick < TICKS_PER_MINUTE * 10; tick++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();

        const claimed = new Set<number>();
        for (let slot = 0; slot < sim.world.orders.scanLimit; slot++) {
          if (!sim.world.orders.isActive(slot)) continue;
          const order = sim.world.orders.at(slot);
          if (order.station < 0) continue;
          expect(claimed.has(order.station), `station ${order.station} double-booked`).toBe(false);
          claimed.add(order.station);
          expect(order.state, 'a station is held by an order that is not cooking').not.toBe(ORDER_PLACED);
        }
      }
      void stationsAllBusy;
      void menuItem;
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
