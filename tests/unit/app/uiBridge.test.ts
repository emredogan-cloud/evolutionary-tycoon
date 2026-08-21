import { describe, expect, it } from 'vitest';
import { menuIndexOf, menuItem } from '@config/economy/menu';
import { station } from '@config/economy/stations';
import { TICK_MS } from '@config/simulation';
import { COIN_POPUP_MS, MAX_COIN_POPUPS, UI_SAMPLE_MS, UiBridge } from '@app/bridge/UiBridge';
import type { ScreenProjector } from '@app/bridge/ScreenProjector';
import { NULL_PROJECTOR } from '@app/bridge/ScreenProjector';
import { MARKER_COIN, MARKER_ORDER, MARKER_PASS, MARKER_PREP, type HudModel } from '@app/bridge/hudModel';
import { HOLD_DECAY_MS } from '@config/economy/menu';
import { PASS } from '@config/economy/stations';
import { Sim } from '@sim/core/Sim';
import { ORDER_COOKING, ORDER_ON_PASS, ORDER_PLACED } from '@sim/stores/OrderStore';
import { STATE_WAITING_FOR_FOOD } from '@sim/ai/fsm/customerFsm';

/**
 * The bridge — GAME_EXECUTION_ROADMAP Phase 8, task 7: "the first Svelte↔sim
 * connection".
 *
 * Two things are being tested and they pull in opposite directions. The rate
 * limit is about *wall* time, because its job is to bound how much DOM work
 * happens per real second. Everything inside a sample is about *simulation*
 * time, because a frozen world has to produce a frozen overlay — otherwise the
 * visual golden photographs a coin popup mid-float and flakes at a different
 * rate on CI than on this machine.
 *
 * A projector that reports everything on screen at world coordinates, so the
 * assertions are about *which* markers exist rather than about the isometric
 * transform (which `IsoProjection` already tests).
 */
const IDENTITY_PROJECTOR: ScreenProjector = (x, y, _z, out) => {
  out.x = x;
  out.y = y;
  return true;
};

function capture(bridge: UiBridge): { latest: () => HudModel; count: () => number } {
  let latest: HudModel | null = null;
  let count = 0;
  bridge.subscribe((model) => {
    latest = model;
    count++;
  });
  return {
    latest: () => {
      if (latest === null) throw new Error('the bridge published nothing');
      return latest;
    },
    count: () => count,
  };
}

/** A customer standing at the counter with an order in the given state. */
function stageOrder(sim: Sim, itemId: string, state: number): { order: number; customer: number } {
  const customerSlot = sim.world.customers.acquire();
  const customer = sim.world.customers.at(customerSlot);
  customer.entityId = sim.world.allocateEntityId();
  customer.x = 15;
  customer.y = 11;
  customer.z = 0;
  customer.visible = 1;
  customer.staged = 1;
  customer.state = STATE_WAITING_FOR_FOOD;

  const orderSlot = sim.world.orders.acquire();
  const order = sim.world.orders.at(orderSlot);
  order.entityId = sim.world.allocateEntityId();
  order.customerSlot = customerSlot;
  order.item = menuIndexOf(itemId);
  order.state = state;
  order.price = menuItem(order.item).basePrice;

  return { order: orderSlot, customer: customerSlot };
}

describe('the sample rate', () => {
  it('publishes at most ten times a second of wall clock', () => {
    const sim = new Sim({ seed: 1 });
    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const seen = capture(bridge);

    const atSubscribe = seen.count();

    // A thousand frames across one simulated second — roughly what a 1000 Hz
    // display would deliver, and far more than any real one.
    for (let frame = 0; frame < 1000; frame++) {
      bridge.sample(frame);
    }

    const published = seen.count() - atSubscribe;
    expect(published, `${published} publishes for 1000 ms of frames`).toBe(1000 / UI_SAMPLE_MS);
  });

  it('publishes once immediately so the HUD is never blank', () => {
    /*
     * Subscribing hands over the current model rather than waiting for the next
     * sample. A hundred milliseconds of an empty cash panel at boot is visible,
     * and on a frozen scene — which never produces a frame — it would be
     * permanent.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 42;
    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);

    const seen = capture(bridge);
    expect(seen.count()).toBe(1);
    expect(seen.latest().cash).toBe(42);
  });

  it('refresh ignores the throttle, for frozen scenes', () => {
    const sim = new Sim({ seed: 1 });
    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const seen = capture(bridge);
    const before = seen.count();

    bridge.refresh();
    bridge.refresh();
    expect(seen.count() - before).toBe(2);
  });

  it('reuses one model object and one marker array', () => {
    /*
     * Ten samples a second for a session is a lot of garbage if each one
     * allocates. The renderer's view has the same property for the same reason;
     * this is the overlay's half of it.
     */
    const sim = new Sim({ seed: 1 });
    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);

    const models: HudModel[] = [];
    bridge.subscribe((model) => {
      models.push(model);
    });
    for (let i = 0; i < 10; i++) bridge.refresh();

    expect(models.length).toBe(11);
    for (const model of models) {
      expect(model).toBe(models[0]);
      expect(model.markers).toBe(models[0]?.markers);
    }
  });
});

describe('what the HUD is told', () => {
  it('carries the numbers the player is watching', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 12.5;
    sim.world.economy.reputation = 61;
    sim.world.stats.customersServed = 7;

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const model = capture(bridge).latest();

    expect(model.cash).toBe(12.5);
    expect(model.reputation).toBe(61);
    expect(model.customersServed).toBe(7);
  });

  it('counts everyone waiting on food, whatever stage it is at', () => {
    const sim = new Sim({ seed: 1 });
    stageOrder(sim, 'lemonade', ORDER_PLACED);
    stageOrder(sim, 'hotdog', ORDER_COOKING);
    stageOrder(sim, 'chips', ORDER_ON_PASS);

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    expect(capture(bridge).latest().customersWaiting).toBe(3);
  });
});

describe('world markers', () => {
  it('puts a bubble over the customer showing what they asked for', () => {
    const sim = new Sim({ seed: 1 });
    stageOrder(sim, 'hotdog', ORDER_PLACED);

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const model = capture(bridge).latest();

    const bubbles = model.markers.slice(0, model.markerCount).filter((m) => m.kind === MARKER_ORDER);
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]?.itemId).toBe('hotdog');
    expect(bubbles[0]?.visible).toBe(true);
    // The customer's own position, not the counter's.
    expect(bubbles[0]?.screenX).toBe(15);
  });

  it('shows preparation progress as a fraction of the real prep time', () => {
    const sim = new Sim({ seed: 1 });
    const { order } = stageOrder(sim, 'hotdog', ORDER_COOKING);
    const record = sim.world.orders.at(order);
    record.station = 1;
    record.startedAtMs = sim.world.clock.simTimeMs; // "just started" — the clock opens at 08:00, not 0

    const item = menuItem(record.item);
    const duration = item.prepTimeMs / station(1).speed;
    sim.advance(Math.round(duration / 2 / TICK_MS));

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const model = capture(bridge).latest();

    const rings = model.markers.slice(0, model.markerCount).filter((m) => m.kind === MARKER_PREP);
    expect(rings).toHaveLength(1);
    expect(rings[0]?.progress).toBeCloseTo(0.5, 2);
    // Anchored to the station, which is where the work is happening.
    expect(rings[0]?.screenX).toBe(station(1).x);
  });

  it('never reports progress outside 0..1', () => {
    // An order left cooking long past its time still has a full ring, not a
    // ring that has wrapped around twice.
    const sim = new Sim({ seed: 1 });
    const { order } = stageOrder(sim, 'chips', ORDER_COOKING);
    sim.world.orders.at(order).station = 2;
    sim.world.orders.at(order).startedAtMs = 0;
    sim.advance(20 * 60);

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const model = capture(bridge).latest();
    for (const marker of model.markers.slice(0, model.markerCount)) {
      expect(marker.progress).toBeGreaterThanOrEqual(0);
      expect(marker.progress).toBeLessThanOrEqual(1);
    }
  });

  it('drops the bubble when the customer has gone', () => {
    /*
     * The order pool and the customer pool are released at different moments,
     * and a bubble anchored to a released slot would sit over whoever is
     * recycled into it next — which reads as a customer ordering something they
     * did not.
     */
    const sim = new Sim({ seed: 1 });
    const { customer } = stageOrder(sim, 'chips', ORDER_PLACED);

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const seen = capture(bridge);
    expect(seen.latest().markerCount).toBe(1);

    sim.world.customers.release(customer);
    bridge.refresh();
    expect(seen.latest().markerCount).toBe(0);
  });

  it('marks off-screen anchors invisible instead of dropping them', () => {
    const sim = new Sim({ seed: 1 });
    stageOrder(sim, 'chips', ORDER_PLACED);

    const bridge = new UiBridge(sim, NULL_PROJECTOR);
    const model = capture(bridge).latest();

    expect(model.markerCount).toBe(1);
    expect(model.markers[0]?.visible).toBe(false);
  });
});

describe('plates on the pass', () => {
  it('shows a finished plate at the pass, not at the customer', () => {
    /*
     * The whole point of the hold-temperature mechanic is that the food and the
     * person it belongs to are in *different places*. A plate drawn over the
     * customer would say the opposite, and the gap this marker makes visible is
     * exactly what Phase 10's waiters exist to close.
     */
    const sim = new Sim({ seed: 1 });
    const { order } = stageOrder(sim, 'hotdog', ORDER_ON_PASS);
    const record = sim.world.orders.at(order);
    record.quality = menuItem(record.item).qualityBase;
    record.readyAtMs = sim.world.clock.simTimeMs; // "just plated" — ditto

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const model = capture(bridge).latest();
    const plates = model.markers.slice(0, model.markerCount).filter((m) => m.kind === MARKER_PASS);

    expect(plates).toHaveLength(1);
    expect(plates[0]?.itemId).toBe('hotdog');
    expect(plates[0]?.screenX).toBeCloseTo(PASS.x, 6);
    expect(plates[0]?.progress, 'straight off the grill').toBeCloseTo(1, 6);
  });

  it('shows the freshness falling as it sits', () => {
    const sim = new Sim({ seed: 1 });
    const { order } = stageOrder(sim, 'hotdog', ORDER_ON_PASS);
    const record = sim.world.orders.at(order);
    const item = menuItem(record.item);
    record.quality = item.qualityBase;
    record.readyAtMs = sim.world.clock.simTimeMs; // "just plated" — ditto

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const seen = capture(bridge);
    const fresh = seen.latest().markers[1]?.progress ?? 0;

    sim.advance(Math.ceil((item.holdToleranceMs + HOLD_DECAY_MS) / TICK_MS));
    bridge.refresh();
    const stale = seen.latest().markers[1]?.progress ?? 0;

    expect(fresh).toBeCloseTo(1, 6);
    expect(stale).toBeLessThan(fresh);
    // It bottoms out at the documented ceiling rather than at nothing, so a very
    // late plate still looks like food and not like an empty tray.
    expect(stale).toBeGreaterThan(0.3);
  });

  it('spreads several plates along the pass instead of stacking them', () => {
    // Three plates on one point is one plate as far as the player can tell, and
    // "the pass is backing up" is precisely the thing they need to see.
    const sim = new Sim({ seed: 1 });
    for (const id of ['hotdog', 'chips', 'lemonade']) {
      const { order } = stageOrder(sim, id, ORDER_ON_PASS);
      sim.world.orders.at(order).quality = menuItem(sim.world.orders.at(order).item).qualityBase;
    }

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    const model = capture(bridge).latest();
    const xs = model.markers
      .slice(0, model.markerCount)
      .filter((m) => m.kind === MARKER_PASS)
      .map((m) => m.screenX);

    expect(xs).toHaveLength(3);
    expect(new Set(xs).size, 'plates share a position').toBe(3);
  });
});

describe('coin popups', () => {
  /** Fire a payment for a staged customer and return the bridge watching it. */
  function payingWorld(): { sim: Sim; bridge: UiBridge; entityId: number } {
    const sim = new Sim({ seed: 1 });
    const slot = sim.world.customers.acquire();
    const customer = sim.world.customers.at(slot);
    customer.entityId = sim.world.allocateEntityId();
    customer.x = 15;
    customer.y = 11;
    customer.visible = 1;
    customer.staged = 1;

    const bridge = new UiBridge(sim, IDENTITY_PROJECTOR);
    bridge.start();
    return { sim, bridge, entityId: customer.entityId };
  }

  it('appears where the customer paid, showing what they paid', () => {
    const { sim, bridge, entityId } = payingWorld();
    sim.world.eventQueue.emitPayment(entityId, 5, 1.25, 0.9);
    sim.tick();

    const model = capture(bridge).latest();
    const coins = model.markers.slice(0, model.markerCount).filter((m) => m.kind === MARKER_COIN);
    expect(coins).toHaveLength(1);
    expect(coins[0]?.amount).toBeCloseTo(6.25, 6);
    expect(coins[0]?.screenX).toBe(15);
  });

  it('ages on simulation time, so a frozen world produces a frozen overlay', () => {
    /*
     * The property the visual golden depends on. A popup driven by `Date.now()`
     * would keep floating while the screenshot was being taken, and the golden
     * would diff by however long the browser took that day.
     */
    const { sim, bridge, entityId } = payingWorld();
    sim.world.eventQueue.emitPayment(entityId, 3, 0, 0.8);
    sim.tick();

    const seen = capture(bridge);
    const first = seen.latest().markers[0]?.age;

    // Many wall-clock samples, no simulated time.
    for (let i = 0; i < 50; i++) bridge.sample(i * UI_SAMPLE_MS * 2);
    expect(seen.latest().markers[0]?.age).toBe(first);

    // One tick of simulated time, and it has moved.
    sim.tick();
    bridge.refresh();
    expect(seen.latest().markers[0]?.age).toBeGreaterThan(first ?? 0);
  });

  it('expires after its documented lifetime and frees the slot', () => {
    const { sim, bridge, entityId } = payingWorld();
    sim.world.eventQueue.emitPayment(entityId, 3, 0, 0.8);
    sim.tick();

    const seen = capture(bridge);
    expect(seen.latest().markerCount).toBe(1);

    sim.advance(Math.ceil(COIN_POPUP_MS / TICK_MS) + 1);
    bridge.refresh();
    expect(seen.latest().markerCount).toBe(0);
  });

  it('caps how many can be in the air at once', () => {
    const { sim, bridge, entityId } = payingWorld();
    for (let i = 0; i < MAX_COIN_POPUPS * 3; i++) {
      sim.world.eventQueue.emitPayment(entityId, 1, 0, 0.5);
    }
    sim.tick();

    const model = capture(bridge).latest();
    expect(model.markerCount).toBe(MAX_COIN_POPUPS);
  });

  it('ignores payments once stopped', () => {
    const { sim, bridge, entityId } = payingWorld();
    bridge.stop();
    sim.world.eventQueue.emitPayment(entityId, 3, 0, 0.8);
    sim.tick();

    expect(capture(bridge).latest().markerCount).toBe(0);
  });
});
