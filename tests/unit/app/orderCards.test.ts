import { describe, expect, it } from 'vitest';
import { MENU } from '@config/economy/menu';
import type { HudModel } from '@app/bridge/hudModel';
import { UiBridge } from '@app/bridge/UiBridge';
import { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import {
  ORDER_COOKING,
  ORDER_DELIVERED,
  ORDER_ON_PASS,
  ORDER_PAID,
  ORDER_PLACED,
} from '@sim/stores/OrderStore';

/**
 * The order-card feed — the consolidation pass's manual-loop surface.
 *
 * Orders are staged directly in the store (the bridge reads the world; these
 * tests are about the read, not about service mechanics, which have their own
 * suites) and every card field is checked against the state that produced it.
 */
function bridge(): { sim: Sim; latest: () => HudModel } {
  const sim = new Sim({ seed: 1 });
  const ui = new UiBridge(sim, (x, y, _z, out) => {
    out.x = x;
    out.y = y;
    return true;
  });
  ui.start();
  let model: HudModel | null = null;
  ui.subscribe((published) => {
    model = published;
  });
  return {
    sim,
    latest: () => {
      ui.refresh();
      if (model === null) throw new Error('nothing published');
      return model;
    },
  };
}

/**
 * Timestamps are stamped from the world clock, exactly as the simulation does.
 *
 * `orderedAtMs` and `startedAtMs` are offsets *relative to now* — the clock does
 * not start at zero (a fresh world opens at 08:00, 240 000 ms in), and staging
 * an order at a bare `0` describes a world state that can never occur. This
 * fixture used to do precisely that, and passed the whole time the bridge was
 * subtracting a tick count from a clock reading.
 */
function stageOrder(
  sim: Sim,
  state: number,
  options: {
    orderedAgoMs?: number;
    customerSlot?: number;
    item?: number;
    station?: number;
    startedAgoMs?: number;
  } = {},
): number {
  const nowMs = sim.world.clock.simTimeMs;
  const slot = sim.world.orders.acquire();
  const order = sim.world.orders.at(slot);
  order.entityId = sim.world.allocateEntityId();
  order.state = state;
  order.item = options.item ?? 0;
  order.orderedAtMs = nowMs - (options.orderedAgoMs ?? 0);
  order.customerSlot = options.customerSlot ?? -1;
  order.station = options.station ?? -1;
  order.startedAtMs = nowMs - (options.startedAgoMs ?? 0);
  order.price = 4.5;
  return slot;
}

describe('the order-card feed', () => {
  it('lists live orders oldest first and never a paid one', () => {
    const { sim, latest } = bridge();
    stageOrder(sim, ORDER_ON_PASS, { orderedAgoMs: 1000 });
    stageOrder(sim, ORDER_PLACED, { orderedAgoMs: 3000 });
    stageOrder(sim, ORDER_PAID, { orderedAgoMs: 3500 });
    stageOrder(sim, ORDER_DELIVERED, { orderedAgoMs: 2000 });

    const model = latest();
    expect(model.orderCount).toBe(3);
    const states = model.orders.slice(0, model.orderCount).map((order) => order.state);
    expect(states).toEqual(['PLACED', 'DELIVERED', 'ON_PASS']);
  });

  it('marks exactly the kitchen-startable order, and prices every card', () => {
    const { sim, latest } = bridge();
    stageOrder(sim, ORDER_PLACED, { orderedAgoMs: 200 });
    stageOrder(sim, ORDER_PLACED, { orderedAgoMs: 100 });

    const model = latest();
    const startable = model.orders.slice(0, model.orderCount).filter((order) => order.startable);
    expect(startable).toHaveLength(1);
    // The real age, not a clock difference: 200 ms ago is 200 ms old.
    expect(startable[0]?.ageMs).toBe(200);
    expect(startable[0]?.price).toBeCloseTo(4.5, 5);
  });

  it('reports cook progress from the kitchen derivation while COOKING', () => {
    const { sim, latest } = bridge();
    // Started half a second ago, so the read shows mid-cook without running the
    // kitchen (which would finish it).
    stageOrder(sim, ORDER_COOKING, { orderedAgoMs: 600, station: 0, startedAgoMs: 500 });

    const card = latest().orders[0];
    expect(card?.state).toBe('COOKING');
    expect(card?.cook01).toBeGreaterThan(0);
    expect(card?.cook01).toBeLessThanOrEqual(1);
  });

  /**
   * The 2026-08-23 regression, pinned at both ends.
   *
   * The bridge read `world.tick * TICK_MS` while every order timestamp comes
   * from `world.clock.simTimeMs`, and the clock opens 240 000 ms into the day.
   * A five-second lemonade therefore reported 245 000 ms remaining and 0
   * progress — "243 sn" over an empty bar in the user's capture. Both
   * assertions below fail on that code, and neither can be satisfied by any
   * constant divisor: they are stated in terms of the item's own prep time.
   */
  it('counts the preparation down in the product’s own seconds, from the first tick', () => {
    const { sim, latest } = bridge();
    const item = MENU[0];
    if (item === undefined) throw new Error('the menu is empty');
    const index = MENU.indexOf(item);

    // Just started: the whole prep time is still to run, and nothing more.
    stageOrder(sim, ORDER_COOKING, { item: index, station: 0, startedAgoMs: 0 });
    const fresh = latest().orders[0];
    expect(fresh?.cookRemainingMs).toBeLessThanOrEqual(item.prepTimeMs);
    expect(fresh?.cookRemainingMs).toBeGreaterThan(item.prepTimeMs * 0.9);
    expect(fresh?.cook01).toBe(0);

    // Half-way through: half the time left, and the bar agrees with the number.
    sim.world.orders.at(0).startedAtMs = sim.world.clock.simTimeMs - item.prepTimeMs / 2;
    const half = latest().orders[0];
    expect(half?.cookRemainingMs).toBeCloseTo(item.prepTimeMs / 2, 0);
    expect(half?.cook01).toBeCloseTo(0.5, 2);
  });

  it('never reports more time left than the item takes, at any world clock', () => {
    const { sim, latest } = bridge();
    const index = MENU.findIndex((entry) => entry.id === 'lemonade');
    const item = MENU[index];
    if (item === undefined) throw new Error('lemonade left the menu');

    // Three simulated minutes further into the day, on top of the 240 s the
    // clock already carries: the epoch is now two orders of magnitude larger
    // than the prep time, which is the condition the bug needed.
    sim.advance(3600);
    const slot = stageOrder(sim, ORDER_COOKING, { item: index, station: 0, startedAgoMs: 0 });

    const model = latest();
    const card = model.orders.slice(0, model.orderCount).find((entry) => entry.slot === slot);
    expect(card).toBeDefined();
    expect(card?.cookRemainingMs).toBeLessThanOrEqual(item.prepTimeMs);
  });

  it('survives a save and resume without inventing a duration', () => {
    /*
     * The directive's other timer question: does a reload produce an absurd
     * countdown? It cannot any more, and the reason is structural rather than
     * lucky — the card and the order now read the *same* clock, and a snapshot
     * restores that clock and those timestamps together. The old code had two
     * clocks with different epochs, so any restore that moved one without the
     * other was a second way to be wrong.
     *
     * Asserted through a real snapshot round trip rather than by argument.
     */
    const { sim, latest } = bridge();
    const index = MENU.findIndex((entry) => entry.id === 'lemonade');
    const item = MENU[index];
    if (item === undefined) throw new Error('lemonade left the menu');

    sim.advance(600);
    const slot = stageOrder(sim, ORDER_COOKING, {
      item: index,
      station: 0,
      startedAgoMs: item.prepTimeMs / 2,
    });
    const before = latest().orders.find((entry) => entry.slot === slot)?.cookRemainingMs;

    const snapshot = snapshotWorld(sim.world);
    restoreWorld(sim.world, snapshot);

    const after = latest().orders.find((entry) => entry.slot === slot)?.cookRemainingMs;
    expect(after).toBeCloseTo(before ?? -1, 5);
    expect(after).toBeLessThanOrEqual(item.prepTimeMs);
  });

  it('reads patience only while the customer is really there', () => {
    const { sim, latest } = bridge();
    const customerSlot = sim.world.customers.acquire();
    const customer = sim.world.customers.at(customerSlot);
    customer.entityId = sim.world.allocateEntityId();
    customer.patienceMs = 30_000;
    customer.patienceMaxMs = 60_000;
    stageOrder(sim, ORDER_PLACED, { customerSlot });
    stageOrder(sim, ORDER_PLACED, { customerSlot: -1, orderedAgoMs: 5 });

    const model = latest();
    const cards = model.orders.slice(0, model.orderCount);
    const withCustomer = cards.find((order) => order.patience01 >= 0);
    const without = cards.find((order) => order.patience01 < 0);
    expect(withCustomer?.patience01).toBeCloseTo(0.5, 5);
    expect(without?.patience01).toBe(-1);
  });

  it('caps the feed at five cards, oldest kept', () => {
    const { sim, latest } = bridge();
    // Oldest first, so the earliest-staged order is the one furthest in the past.
    for (let i = 0; i < 8; i++) stageOrder(sim, ORDER_PLACED, { orderedAgoMs: (8 - i) * 100 });
    const model = latest();
    expect(model.orderCount).toBe(5);
    expect(model.orders[0]?.ageMs).toBeGreaterThanOrEqual(model.orders[4]?.ageMs ?? 0);
  });

  it('publishes the derived level beside the orders', () => {
    const { sim, latest } = bridge();
    sim.world.stats.customersServed = 40; // 160 XP -> level 3
    const model = latest();
    expect(model.level.level).toBe(3);
    expect(model.level.xp).toBe(160);
    expect(model.level.nextLevelXp).toBe(280);
  });
});
