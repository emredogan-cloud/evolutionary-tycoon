import { describe, expect, it } from 'vitest';
import type { HudModel } from '@app/bridge/hudModel';
import { UiBridge } from '@app/bridge/UiBridge';
import { Sim } from '@sim/core/Sim';
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

function stageOrder(
  sim: Sim,
  state: number,
  options: {
    orderedAtMs?: number;
    customerSlot?: number;
    item?: number;
    station?: number;
    startedAtMs?: number;
  } = {},
): number {
  const slot = sim.world.orders.acquire();
  const order = sim.world.orders.at(slot);
  order.entityId = sim.world.allocateEntityId();
  order.state = state;
  order.item = options.item ?? 0;
  order.orderedAtMs = options.orderedAtMs ?? 0;
  order.customerSlot = options.customerSlot ?? -1;
  order.station = options.station ?? -1;
  order.startedAtMs = options.startedAtMs ?? 0;
  order.price = 4.5;
  return slot;
}

describe('the order-card feed', () => {
  it('lists live orders oldest first and never a paid one', () => {
    const { sim, latest } = bridge();
    stageOrder(sim, ORDER_ON_PASS, { orderedAtMs: 3000 });
    stageOrder(sim, ORDER_PLACED, { orderedAtMs: 1000 });
    stageOrder(sim, ORDER_PAID, { orderedAtMs: 500 });
    stageOrder(sim, ORDER_DELIVERED, { orderedAtMs: 2000 });

    const model = latest();
    expect(model.orderCount).toBe(3);
    const states = model.orders.slice(0, model.orderCount).map((order) => order.state);
    expect(states).toEqual(['PLACED', 'DELIVERED', 'ON_PASS']);
  });

  it('marks exactly the kitchen-startable order, and prices every card', () => {
    const { sim, latest } = bridge();
    stageOrder(sim, ORDER_PLACED, { orderedAtMs: 100 });
    stageOrder(sim, ORDER_PLACED, { orderedAtMs: 200 });

    const model = latest();
    const startable = model.orders.slice(0, model.orderCount).filter((order) => order.startable);
    expect(startable).toHaveLength(1);
    expect(startable[0]?.ageMs).toBeGreaterThanOrEqual(0);
    expect(startable[0]?.price).toBeCloseTo(4.5, 5);
  });

  it('reports cook progress from the kitchen derivation while COOKING', () => {
    const { sim, latest } = bridge();
    // Started half a second "ago" relative to the world clock, so the read
    // shows mid-cook without running the kitchen (which would finish it).
    stageOrder(sim, ORDER_COOKING, { orderedAtMs: -500, station: 0, startedAtMs: -500 });

    const card = latest().orders[0];
    expect(card?.state).toBe('COOKING');
    expect(card?.cook01).toBeGreaterThan(0);
    expect(card?.cook01).toBeLessThanOrEqual(1);
  });

  it('reads patience only while the customer is really there', () => {
    const { sim, latest } = bridge();
    const customerSlot = sim.world.customers.acquire();
    const customer = sim.world.customers.at(customerSlot);
    customer.entityId = sim.world.allocateEntityId();
    customer.patienceMs = 30_000;
    customer.patienceMaxMs = 60_000;
    stageOrder(sim, ORDER_PLACED, { customerSlot });
    stageOrder(sim, ORDER_PLACED, { customerSlot: -1, orderedAtMs: 5 });

    const model = latest();
    const cards = model.orders.slice(0, model.orderCount);
    const withCustomer = cards.find((order) => order.patience01 >= 0);
    const without = cards.find((order) => order.patience01 < 0);
    expect(withCustomer?.patience01).toBeCloseTo(0.5, 5);
    expect(without?.patience01).toBe(-1);
  });

  it('caps the feed at five cards, oldest kept', () => {
    const { sim, latest } = bridge();
    for (let i = 0; i < 8; i++) stageOrder(sim, ORDER_PLACED, { orderedAtMs: i * 100 });
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
