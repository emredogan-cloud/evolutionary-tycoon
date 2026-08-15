import { describe, expect, it } from 'vitest';
import {
  HOLD_DECAY_MAX_LOSS,
  HOLD_DECAY_MS,
  holdTemperature,
  MENU,
  menuIndexOf,
  menuItem,
} from '@config/economy/menu';
import { Sim } from '@sim/core/Sim';
import { currentQuality } from '@sim/systems/KitchenSystem';
import { ORDER_ON_PASS } from '@sim/stores/OrderStore';

/**
 * Hold temperature — GAME_EXECUTION_ROADMAP Phase 8, reproduced exactly:
 *
 *   quality = qualityBase * (1 - max(0, (heldMs - holdTolerance) / holdDecayMs) * 0.6)
 *
 * "This is what will later punish 'many cooks, too few waiters'. Get it right
 * now." So the formula is asserted term by term against the document rather than
 * against whatever the code happens to produce, and the exact numbers matter:
 * the 0.6 ceiling in particular is why food left far too long is *bad* rather
 * than worthless, and the player has to be able to tell those apart because only
 * one of them is worth fixing.
 */
describe('the formula', () => {
  it('loses nothing inside the tolerance', () => {
    for (const item of MENU) {
      expect(holdTemperature(item, 0), item.id).toBeCloseTo(item.qualityBase, 12);
      expect(holdTemperature(item, item.holdToleranceMs), item.id).toBeCloseTo(item.qualityBase, 12);
    }
  });

  it('decays linearly once past it', () => {
    const item = menuItem(menuIndexOf('hotdog'));
    const half = item.holdToleranceMs + HOLD_DECAY_MS / 2;
    expect(holdTemperature(item, half)).toBeCloseTo(item.qualityBase * (1 - 0.5 * HOLD_DECAY_MAX_LOSS), 12);
  });

  it('bottoms out at the documented ceiling rather than at zero', () => {
    /*
     * A floor of zero would make a very late delivery indistinguishable from no
     * delivery at all. They are different failures with different fixes — one is
     * a slow waiter, the other is a lost customer — and the player has to be
     * able to see which they have.
     */
    const item = menuItem(menuIndexOf('hotdog'));
    const forever = item.holdToleranceMs + HOLD_DECAY_MS * 100;
    expect(holdTemperature(item, forever)).toBeCloseTo(item.qualityBase * (1 - HOLD_DECAY_MAX_LOSS), 12);
    expect(holdTemperature(item, forever)).toBeGreaterThan(0);
  });

  it('is monotonic — waiting longer never improves the food', () => {
    const item = menuItem(menuIndexOf('lemonade'));
    let previous = holdTemperature(item, 0);
    for (let held = 0; held < item.holdToleranceMs + HOLD_DECAY_MS * 2; held += 1000) {
      const quality = holdTemperature(item, held);
      expect(quality).toBeLessThanOrEqual(previous + 1e-12);
      previous = quality;
    }
  });

  it('gives each item its own tolerance', () => {
    /*
     * Chips keep for five minutes and a hot dog does not. A single global
     * tolerance would make the drinks station and the grill equally urgent,
     * which removes the only reason to prioritise one order over another.
     */
    const chips = menuItem(menuIndexOf('chips'));
    const hotdog = menuItem(menuIndexOf('hotdog'));
    expect(chips.holdToleranceMs).toBeGreaterThan(hotdog.holdToleranceMs);

    const minutes = 120_000;
    expect(holdTemperature(chips, minutes)).toBeCloseTo(chips.qualityBase, 12);
    expect(holdTemperature(hotdog, minutes)).toBeLessThan(hotdog.qualityBase);
  });
});

describe('an order on the pass', () => {
  it('reports its quality falling as it sits', () => {
    const sim = new Sim({ seed: 1 });
    const slot = sim.world.orders.acquire();
    const order = sim.world.orders.at(slot);
    order.entityId = sim.world.allocateEntityId();
    order.item = menuIndexOf('hotdog');
    order.state = ORDER_ON_PASS;
    order.quality = menuItem(order.item).qualityBase;
    order.readyAtMs = 0;

    const fresh = currentQuality(order, 0);
    const stale = currentQuality(order, menuItem(order.item).holdToleranceMs + HOLD_DECAY_MS);
    expect(fresh).toBeCloseTo(menuItem(order.item).qualityBase, 12);
    expect(stale).toBeLessThan(fresh);
  });

  it('stops decaying the moment it is delivered', () => {
    /*
     * The clock that matters is time on the *pass*, not time since it was made.
     * Without this, a customer who eats slowly would be served worse food the
     * longer they take, which is nobody's fault and unfixable by the player.
     */
    const sim = new Sim({ seed: 1 });
    const slot = sim.world.orders.acquire();
    const order = sim.world.orders.at(slot);
    order.entityId = sim.world.allocateEntityId();
    order.item = menuIndexOf('hotdog');
    order.quality = menuItem(order.item).qualityBase;
    order.readyAtMs = 0;
    order.deliveredAtMs = 1000;

    const atDelivery = currentQuality(order, 1000);
    const muchLater = currentQuality(order, 600_000);
    expect(muchLater).toBeCloseTo(atDelivery, 12);
  });

  it("carries the station's own quality through the decay", () => {
    /*
     * A better grill still produces better food after a wait than a worse one.
     * Applying the decay to the recipe base alone would erase the difference an
     * upgraded station makes the moment anything sat for a minute, which would
     * make the Phase 9 upgrade feel worthless exactly when it matters most.
     */
    const sim = new Sim({ seed: 1 });
    const item = menuIndexOf('hotdog');

    const good = sim.world.orders.acquire();
    const goodOrder = sim.world.orders.at(good);
    goodOrder.item = item;
    goodOrder.quality = menuItem(item).qualityBase * 1.2;
    goodOrder.readyAtMs = 0;
    goodOrder.state = ORDER_ON_PASS;

    const plain = sim.world.orders.acquire();
    const plainOrder = sim.world.orders.at(plain);
    plainOrder.item = item;
    plainOrder.quality = menuItem(item).qualityBase;
    plainOrder.readyAtMs = 0;
    plainOrder.state = ORDER_ON_PASS;

    const late = menuItem(item).holdToleranceMs + HOLD_DECAY_MS;
    expect(currentQuality(goodOrder, late)).toBeGreaterThan(currentQuality(plainOrder, late));
  });
});
