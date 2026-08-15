import { describe, expect, it } from 'vitest';
import { UPGRADES } from '@config/economy/upgrades';
import { ORDERING_MS } from '@config/satisfaction';
import { TICK_MS } from '@config/simulation';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { menuIndexOf, menuItem } from '@config/economy/menu';
import { Sim } from '@sim/core/Sim';
import { buyUpgrade, effectValue } from '@sim/systems/UpgradeSystem';
import { currentQuality, startPrep } from '@sim/systems/KitchenSystem';
import { queueCapacityOf } from '@sim/systems/QueueSystem';
import { ORDER_COOKING, ORDER_ON_PASS, ORDER_PLACED } from '@sim/stores/OrderStore';

const TICKS_PER_MINUTE = 60_000 / TICK_MS;
const LONG_RUN_TIMEOUT_MS = 120_000;

/**
 * **The four-property rule's fourth property** — GAME_EXECUTION_ROADMAP Phase 9.
 *
 * "Every upgrade must have all four of: cost, measurable simulation effect,
 * visible world change, and a gameplay consequence." The config test asserts
 * three of those by reading the table. This one buys each upgrade and *measures*
 * the world before and after, because "measurable" is the only one of the four
 * that a data structure cannot promise.
 *
 * Each test names the number it moves and the reason a player would notice.
 * Where an effect is real but currently unreachable in play, that is stated
 * rather than papered over — the cooler is one such, and §6 of the phase report
 * explains why.
 */
function fund(sim: Sim, amount = 100_000): void {
  sim.world.economy.cash = amount;
}

/** Play with an attentive cook, which is what Stage 1's player is. */
function playFor(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
    sim.tick();
  }
}

describe('every upgrade changes a number the simulation reads', () => {
  it('has a measurable effect for all six, with none silently inert', () => {
    /*
     * The sweep. Every upgrade, every level, asserting the value the simulation
     * would read actually moved. A future upgrade added with a well-formed
     * config but a `kind` nothing consumes fails here rather than shipping as an
     * expensive no-op.
     */
    for (const item of UPGRADES) {
      const sim = new Sim({ seed: 1 });
      fund(sim);

      for (let level = 1; level <= item.maxLevel; level++) {
        const before = item.effects.map((effect) => effectValue(sim.world, effect.kind));
        expect(buyUpgrade(sim.world, item.id), `${item.id} level ${String(level)}`).toBe('ok');
        const after = item.effects.map((effect) => effectValue(sim.world, effect.kind));

        for (let i = 0; i < before.length; i++) {
          expect(
            after[i],
            `${item.id} level ${String(level)} did not move ${item.effects[i]?.kind ?? '?'}`,
          ).not.toBe(before[i]);
        }
      }
    }
  });

  it('leaves every effect at its neutral value on a fresh world', () => {
    // Neutral means the caller can apply the result unconditionally. A kind
    // that started at anything else would silently rebalance the game the day
    // it was added.
    const sim = new Sim({ seed: 1 });
    expect(effectValue(sim.world, 'visibility')).toBe(1);
    expect(effectValue(sim.world, 'menuAppeal')).toBe(1);
    expect(effectValue(sim.world, 'orderSpeed')).toBe(1);
    expect(effectValue(sim.world, 'prepStations')).toBe(0);
    expect(effectValue(sim.world, 'queueCapacity')).toBe(0);
    expect(effectValue(sim.world, 'decisionPointMetres')).toBe(0);
    expect(effectValue(sim.world, 'holdToleranceMs')).toBe(0);
  });
});

describe('the sign — visibility', () => {
  it('follows ECONOMY_DESIGN §6.2 exactly: 1.30, 1.52, 1.68, 1.80', () => {
    const sim = new Sim({ seed: 1 });
    fund(sim);
    const expected = [1.3, 1.52, 1.68, 1.8];

    for (let level = 0; level < expected.length; level++) {
      buyUpgrade(sim.world, 'hand-painted-sign');
      expect(effectValue(sim.world, 'visibility'), `level ${String(level + 1)}`).toBeCloseTo(
        expected[level] ?? 0,
        9,
      );
    }
  });

  it(
    'converts measurably more of the same traffic',
    () => {
      /*
       * The gameplay consequence, measured rather than asserted from the
       * multiplier. Two worlds, same seed, same commands — one with a sign.
       * If this ever fails while the multiplier test passes, the effect is
       * wired to nothing.
       */
      const plain = new Sim({ seed: 20260816 });
      const signed = new Sim({ seed: 20260816 });
      fund(signed, 12);
      expect(buyUpgrade(signed.world, 'hand-painted-sign')).toBe('ok');

      playFor(plain, TICKS_PER_MINUTE * 20);
      playFor(signed, TICKS_PER_MINUTE * 20);

      const before = plain.world.stats.conversionsSucceeded;
      const after = signed.world.stats.conversionsSucceeded;
      expect(after, `${String(before)} → ${String(after)} conversions`).toBeGreaterThan(before);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('the menu board — appeal and ordering speed', () => {
  it('cuts the beat at the counter by a fifth per level', () => {
    const sim = new Sim({ seed: 1 });
    fund(sim);

    buyUpgrade(sim.world, 'menu-board');
    expect(ORDERING_MS * effectValue(sim.world, 'orderSpeed')).toBeCloseTo(ORDERING_MS * 0.8, 6);

    buyUpgrade(sim.world, 'menu-board');
    expect(ORDERING_MS * effectValue(sim.world, 'orderSpeed')).toBeCloseTo(ORDERING_MS * 0.64, 6);
  });

  it('raises appeal with diminishing returns', () => {
    const sim = new Sim({ seed: 1 });
    fund(sim);

    buyUpgrade(sim.world, 'menu-board');
    const first = effectValue(sim.world, 'menuAppeal');
    buyUpgrade(sim.world, 'menu-board');
    const second = effectValue(sim.world, 'menuAppeal');
    buyUpgrade(sim.world, 'menu-board');
    const third = effectValue(sim.world, 'menuAppeal');

    expect(first).toBeCloseTo(1.18, 9);
    expect(second - first).toBeLessThan(first - 1);
    expect(third - second).toBeLessThan(second - first);
  });
});

describe('the second prep station — parallel preparation', () => {
  it('lets two chips orders cook at once, where one could before', () => {
    /*
     * The clearest test in this file, and the one that proves stations are a
     * real capacity ceiling rather than a label. Ten identical orders, one
     * `startPrep` each: the number that ends up cooking is exactly the number of
     * unlocked PREP benches.
     */
    const cooking = (sim: Sim): number => {
      let count = 0;
      for (let slot = 0; slot < sim.world.orders.scanLimit; slot++) {
        if (!sim.world.orders.isActive(slot)) continue;
        if (sim.world.orders.at(slot).state === ORDER_COOKING) count++;
      }
      return count;
    };

    const fill = (sim: Sim): void => {
      for (let i = 0; i < 10; i++) {
        const slot = sim.world.orders.acquire();
        const order = sim.world.orders.at(slot);
        order.entityId = sim.world.allocateEntityId();
        order.item = menuIndexOf('chips');
        order.state = ORDER_PLACED;
        order.orderedAtMs = i;
        startPrep(sim.world, slot);
      }
    };

    const one = new Sim({ seed: 1 });
    fill(one);
    expect(cooking(one)).toBe(1);

    const two = new Sim({ seed: 1 });
    fund(two);
    buyUpgrade(two.world, 'second-prep-station');
    fill(two);
    expect(cooking(two)).toBe(2);

    const three = new Sim({ seed: 1 });
    fund(three);
    buyUpgrade(three.world, 'second-prep-station');
    buyUpgrade(three.world, 'second-prep-station');
    fill(three);
    expect(cooking(three)).toBe(3);
  });
});

describe('the bigger counter — queue capacity', () => {
  it('raises the capacity the spillover penalty is measured against', () => {
    const sim = new Sim({ seed: 1 });
    fund(sim);
    const before = queueCapacityOf(sim.world, STAGE1_LAYOUT);

    buyUpgrade(sim.world, 'bigger-counter');
    const after = queueCapacityOf(sim.world, STAGE1_LAYOUT);

    expect(after - before).toBe(2);
    // And never past the authored positions, or the negative feedback loop that
    // ECONOMY_DESIGN §7 calls the economy's only self-correction stops working.
    expect(after).toBeLessThanOrEqual(STAGE1_LAYOUT.queue.length);
  });

  it('is capped by the world rather than by the config alone', () => {
    // Buying every level still cannot exceed the authored slots. Asserted
    // directly because the cap lives in `queueCapacityOf`, not in the table.
    const sim = new Sim({ seed: 1 });
    fund(sim);
    for (let i = 0; i < 10; i++) buyUpgrade(sim.world, 'bigger-counter');
    expect(queueCapacityOf(sim.world, STAGE1_LAYOUT)).toBeLessThanOrEqual(STAGE1_LAYOUT.queue.length);
  });
});

describe('the roadside marker — the decision point', () => {
  it('moves the decision earlier by the documented distance', () => {
    const sim = new Sim({ seed: 1 });
    fund(sim);

    buyUpgrade(sim.world, 'roadside-marker');
    expect(effectValue(sim.world, 'decisionPointMetres')).toBe(15);
    buyUpgrade(sim.world, 'roadside-marker');
    expect(effectValue(sim.world, 'decisionPointMetres')).toBe(25);
  });

  it(
    'changes which vehicles convert, because they decide somewhere else',
    () => {
      /*
       * A weaker claim than "more convert", and deliberately so. Deciding
       * earlier does not raise the probability — the same factors are evaluated
       * — it changes *where* on the road the roll happens, which changes which
       * vehicles are in the queue-length snapshot at the time and gives a
       * committed driver more room to brake. The measurable consequence is that
       * the outcome differs at all, on the same seed.
       */
      const plain = new Sim({ seed: 4242 });
      const marked = new Sim({ seed: 4242 });
      fund(marked, 60);
      buyUpgrade(marked.world, 'roadside-marker');

      playFor(plain, TICKS_PER_MINUTE * 10);
      playFor(marked, TICKS_PER_MINUTE * 10);

      expect(marked.world.hash()).not.toBe(plain.world.hash());
      expect(marked.world.stats.conversionsSucceeded + marked.world.stats.conversionsFailed).not.toBe(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('the cooler — hold tolerance', () => {
  it('keeps food at full quality for longer on the pass', () => {
    /*
     * The effect is real and measurable here: the same plate, sat for the same
     * time, is worth more with a cooler.
     */
    const item = menuIndexOf('hotdog');
    const held = menuItem(item).holdToleranceMs + 20_000;

    const plain = new Sim({ seed: 1 });
    const chilled = new Sim({ seed: 1 });
    fund(chilled);
    buyUpgrade(chilled.world, 'cooler');

    const makeOrder = (sim: Sim): number => {
      const slot = sim.world.orders.acquire();
      const order = sim.world.orders.at(slot);
      order.entityId = sim.world.allocateEntityId();
      order.item = item;
      order.state = ORDER_ON_PASS;
      order.quality = menuItem(item).qualityBase;
      order.readyAtMs = 0;
      return slot;
    };

    const plainQuality = currentQuality(
      plain.world.orders.at(makeOrder(plain)),
      held,
      effectValue(plain.world, 'holdToleranceMs'),
    );
    const chilledQuality = currentQuality(
      chilled.world.orders.at(makeOrder(chilled)),
      held,
      effectValue(chilled.world, 'holdToleranceMs'),
    );

    expect(chilledQuality).toBeGreaterThan(plainQuality);
    expect(chilledQuality).toBeCloseTo(menuItem(item).qualityBase, 9);
  });

  it(
    'has no consequence a Stage 1 player can feel, and this records that',
    () => {
      /*
       * **The cooler fails the four-property rule today, and not through any
       * fault of its own.** Stage 1 delivery is automatic: `KitchenSystem` moves
       * a plate onto the pass and `ServiceSystem` hands it over in the same
       * tick, so nothing is ever held. PHASE_8_REPORT §6 measured it — zero
       * ticks out of 24 000 with a plate on the pass.
       *
       * So this asserts the *absence*, deliberately. When Phase 10's waiters put
       * a delay between ready and delivered, plates will start waiting, this
       * test will fail, and the failure is the signal that the cooler has become
       * a real purchase. Deleting it then is the correct fix.
       */
      const sim = new Sim({ seed: 424242 });
      let ticksWithPlate = 0;
      for (let i = 0; i < TICKS_PER_MINUTE * 10; i++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();
        for (let slot = 0; slot < sim.world.orders.scanLimit; slot++) {
          if (!sim.world.orders.isActive(slot)) continue;
          if (sim.world.orders.at(slot).state === ORDER_ON_PASS) ticksWithPlate++;
        }
      }

      expect(sim.world.stats.customersServed, 'nobody was served, so this proves nothing').toBeGreaterThan(0);
      expect(
        ticksWithPlate,
        'food now waits on the pass — the cooler has become a real upgrade, delete this test',
      ).toBe(0);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});

describe('an upgrade is worth what it cost', () => {
  it(
    'earns more over twenty minutes with the sign than without it',
    () => {
      /*
       * The end-to-end claim the phase exists to make: the player spends ₡12 on
       * the cheapest upgrade and ends up with more money than if they had kept
       * it. Twenty minutes, same seed, same play.
       */
      const saver = new Sim({ seed: 909 });
      const spender = new Sim({ seed: 909 });
      saver.world.economy.cash = 12;
      spender.world.economy.cash = 12;
      expect(buyUpgrade(spender.world, 'hand-painted-sign')).toBe('ok');

      playFor(saver, TICKS_PER_MINUTE * 20);
      playFor(spender, TICKS_PER_MINUTE * 20);

      const saved = saver.world.economy.cash;
      const spent = spender.world.economy.cash;
      expect(spent, `kept ₡12: ${saved.toFixed(2)} · spent it: ${spent.toFixed(2)}`).toBeGreaterThan(saved);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
