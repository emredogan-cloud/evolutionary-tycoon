import { describe, expect, it } from 'vitest';
import { UPGRADES, upgrade, upgradeCost } from '@config/economy/upgrades';
import { PRICE_BAND, menuIndexOf, menuItem } from '@config/economy/menu';
import { Sim } from '@sim/core/Sim';
import { buyUpgrade, nextUpgradeCost, upgradeLevel } from '@sim/systems/UpgradeSystem';

/**
 * `BUY_UPGRADE`, validated where it counts.
 *
 * The roadmap's rule, verbatim: "BUY_UPGRADE is validated in the simulation.
 * Never trust the UI: insufficient funds must be rejected in src/sim, and there
 * must be a test that dispatches an unaffordable purchase directly and asserts
 * it is refused."
 *
 * That test is `refuses a purchase the player cannot afford` below, and it goes
 * through `sim.dispatch` rather than through a helper, because the command path
 * is the one that a replayed log and a loaded save take. A UI that greys out a
 * button is a courtesy; this is the control.
 */
describe('buying an upgrade', () => {
  it('takes the money and grants the level, or does neither', () => {
    const sim = new Sim({ seed: 1 });
    const sign = upgrade('hand-painted-sign');
    const cost = upgradeCost(sign, 1, 1);
    sim.world.economy.cash = cost;

    expect(buyUpgrade(sim.world, sign.id)).toBe('ok');
    expect(sim.world.economy.cash).toBeCloseTo(0, 9);
    expect(upgradeLevel(sim.world, sign.id)).toBe(1);
    expect(sim.world.economy.lifetimeSpend).toBe(cost);
  });

  it('refuses a purchase the player cannot afford', () => {
    /*
     * Dispatched as a command, one credit short. Both halves are asserted: no
     * level was granted *and* no money moved — a partial application would be
     * worse than a refusal, because the player would have paid for nothing.
     */
    const sim = new Sim({ seed: 1 });
    const sign = upgrade('hand-painted-sign');
    sim.world.economy.cash = upgradeCost(sign, 1, 1) - 1;

    sim.dispatch({ t: 'BUY_UPGRADE', upgradeId: sign.id });
    sim.tick();

    expect(upgradeLevel(sim.world, sign.id)).toBe(0);
    expect(sim.world.economy.cash).toBe(upgradeCost(sign, 1, 1) - 1);
    expect(sim.world.economy.lifetimeSpend).toBe(0);
  });

  it('never lets cash go negative, however many purchases are attempted', () => {
    // The property the roadmap states as a hard requirement. Asserted by
    // brute force rather than by inspection: a thousand purchases of every
    // upgrade against an empty till.
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 30;

    for (let i = 0; i < 1000; i++) {
      for (const item of UPGRADES) {
        sim.dispatch({ t: 'BUY_UPGRADE', upgradeId: item.id });
      }
      sim.tick();
      expect(sim.world.economy.cash, `after round ${String(i)}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('refuses an upgrade that does not exist', () => {
    // Reachable from a replayed log written when an upgrade existed that this
    // build has since removed. A throw here would take the whole tick down.
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 10_000;

    expect(buyUpgrade(sim.world, 'jetpack')).toBe('unknown');
    expect(() => {
      sim.dispatch({ t: 'BUY_UPGRADE', upgradeId: 'jetpack' });
      sim.tick();
    }).not.toThrow();
    expect(sim.world.economy.cash).toBe(10_000);
  });

  it('refuses to sell a level past the maximum', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100_000;
    const counter = upgrade('bigger-counter');

    for (let level = 0; level < counter.maxLevel; level++) {
      expect(buyUpgrade(sim.world, counter.id)).toBe('ok');
    }
    expect(buyUpgrade(sim.world, counter.id)).toBe('maxed');
    expect(upgradeLevel(sim.world, counter.id)).toBe(counter.maxLevel);
    expect(nextUpgradeCost(sim.world, counter.id), 'a maxed upgrade has no price').toBe(-1);
  });

  it('charges the escalating price, level by level', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100_000;
    const sign = upgrade('hand-painted-sign');

    let spent = 0;
    for (let level = 1; level <= sign.maxLevel; level++) {
      const quoted = nextUpgradeCost(sim.world, sign.id);
      expect(quoted, `level ${String(level)}`).toBe(upgradeCost(sign, level, 1));
      const before = sim.world.economy.cash;
      expect(buyUpgrade(sim.world, sign.id)).toBe('ok');
      expect(before - sim.world.economy.cash).toBeCloseTo(quoted, 9);
      spent += quoted;
    }
    expect(sim.world.economy.lifetimeSpend).toBeCloseTo(spent, 9);
  });

  it('announces the purchase once, with the level and the price paid', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100;
    const seen: { id: string; level: number; cost: number }[] = [];
    const unsubscribe = sim.events.subscribe((event) => {
      if (event.t !== 'UPGRADE_APPLIED') return;
      seen.push({ id: event.upgradeId, level: event.level, cost: event.cost });
    });

    sim.dispatch({ t: 'BUY_UPGRADE', upgradeId: 'hand-painted-sign' });
    sim.tick();
    unsubscribe();

    expect(seen).toEqual([{ id: 'hand-painted-sign', level: 1, cost: 12 }]);
  });

  it('keeps the world hash sensitive to what was bought', () => {
    /*
     * The upgrade map is hashed, so two worlds that differ only in a purchase
     * must differ in their digest. Without this, a replay could diverge from
     * the session it recorded and the determinism suite would never notice.
     */
    const bought = new Sim({ seed: 7 });
    const untouched = new Sim({ seed: 7 });
    bought.world.economy.cash = 100;
    untouched.world.economy.cash = 100;

    expect(bought.world.hash()).toBe(untouched.world.hash());
    buyUpgrade(bought.world, 'hand-painted-sign');
    expect(bought.world.hash()).not.toBe(untouched.world.hash());
  });
});

describe('setting a price', () => {
  it('moves the price the player asked for', () => {
    const sim = new Sim({ seed: 1 });
    sim.dispatch({ t: 'SET_PRICE', itemId: 'hotdog', price: 6 });
    sim.tick();
    expect(sim.world.economy.prices.get('hotdog')).toBe(6);
  });

  it('clamps to the ±50% band rather than trusting the caller', () => {
    /*
     * Exploit E2. The band is its only defence, and this path is reached by
     * replayed logs and loaded saves as well as by the price panel — so it is
     * clamped here, in the simulation, and again at the point of sale.
     */
    const sim = new Sim({ seed: 1 });
    const hotdog = menuItem(menuIndexOf('hotdog'));

    sim.dispatch({ t: 'SET_PRICE', itemId: 'hotdog', price: 9999 });
    sim.tick();
    expect(sim.world.economy.prices.get('hotdog')).toBeCloseTo(hotdog.basePrice * PRICE_BAND.max, 9);

    sim.dispatch({ t: 'SET_PRICE', itemId: 'hotdog', price: 0 });
    sim.tick();
    expect(sim.world.economy.prices.get('hotdog')).toBeCloseTo(hotdog.basePrice * PRICE_BAND.min, 9);
  });

  it('ignores an item that is not on the menu', () => {
    const sim = new Sim({ seed: 1 });
    expect(() => {
      sim.dispatch({ t: 'SET_PRICE', itemId: 'caviar', price: 3 });
      sim.tick();
    }).not.toThrow();
    expect(sim.world.economy.prices.size).toBe(0);
  });

  it('announces a change only when something actually changed', () => {
    // A price panel emits on every drag. An event per pixel of slider travel
    // would flood the audio layer in Phase 17 with the same sound.
    const sim = new Sim({ seed: 1 });
    let events = 0;
    const unsubscribe = sim.events.subscribe((event) => {
      if (event.t === 'PRICE_CHANGED') events++;
    });

    for (let i = 0; i < 5; i++) {
      sim.dispatch({ t: 'SET_PRICE', itemId: 'hotdog', price: 6 });
      sim.tick();
    }
    unsubscribe();

    expect(events).toBe(1);
  });
});
