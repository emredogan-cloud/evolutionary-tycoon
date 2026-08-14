import { describe, expect, it } from 'vitest';
import { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import { World } from '@sim/core/World';

describe('snapshotWorld', () => {
  it('serialises maps as key-sorted entry arrays regardless of insertion order', () => {
    // JSON has no map type, and sorting makes the serialised bytes — and so the
    // checksum — depend on content rather than on how the player got there.
    const ascending = new World({ seed: 1 });
    ascending.economy.prices.set('apple', 1);
    ascending.economy.prices.set('mango', 2);
    ascending.economy.prices.set('zucchini', 3);

    const descending = new World({ seed: 1 });
    descending.economy.prices.set('zucchini', 3);
    descending.economy.prices.set('mango', 2);
    descending.economy.prices.set('apple', 1);

    const expected = [
      ['apple', 1],
      ['mango', 2],
      ['zucchini', 3],
    ];
    expect(snapshotWorld(ascending).economy.prices).toEqual(expected);
    expect(snapshotWorld(descending).economy.prices).toEqual(expected);
  });

  it('sorts upgrades the same way', () => {
    const world = new World({ seed: 1 });
    world.layout.upgrades.set('signage', 1);
    world.layout.upgrades.set('fryer', 3);
    world.layout.upgrades.set('grill', 2);

    expect(snapshotWorld(world).layout.upgrades).toEqual([
      ['fryer', 3],
      ['grill', 2],
      ['signage', 1],
    ]);
  });

  it('excludes transient entities entirely', () => {
    const world = new World({ seed: 1 });
    world.vehicles.spawn(1);
    world.customers.acquire();
    world.employees.acquire();
    world.orders.acquire();

    const snapshot = snapshotWorld(world);
    expect(Object.keys(snapshot)).not.toContain('vehicles');
    expect(Object.keys(snapshot)).not.toContain('customers');
    expect(Object.keys(snapshot)).not.toContain('orders');
  });

  it('is JSON-serialisable and survives the round trip', () => {
    const sim = new Sim({ seed: 88 });
    sim.advance(120);
    sim.world.economy.prices.set('burger', 4.5);
    sim.world.layout.placed.push({ objectId: 'counter', x: 1.25, y: -2.5, z: 0 });

    const snapshot = snapshotWorld(sim.world);
    const reparsed: unknown = JSON.parse(JSON.stringify(snapshot));
    expect(reparsed).toEqual(snapshot);
  });

  it('carries all six RNG stream states, including cosmetic', () => {
    // Cosmetic is excluded from the *hash*, not from the *save* — visual
    // variation should stay stable across a reload even though it cannot
    // affect a simulation outcome.
    const sim = new Sim({ seed: 5 });
    for (let i = 0; i < 25; i++) sim.world.rng.cosmetic.next();
    const expected = sim.world.rng.cosmetic.saveState();

    const restored = new Sim({ seed: 5 });
    restoreWorld(restored.world, snapshotWorld(sim.world));

    expect(restored.world.rng.cosmetic.saveState()).toEqual(expected);
  });
});

describe('restoreWorld speed normalisation', () => {
  it('accepts each supported multiplier', () => {
    for (const mult of [1, 2, 4] as const) {
      const source = new World({ seed: 1 });
      source.control.speedMultiplier = mult;
      const target = new World({ seed: 1 });
      restoreWorld(target, snapshotWorld(source));
      expect(target.control.speedMultiplier).toBe(mult);
    }
  });

  it('falls back to 1x for a multiplier this build does not support', () => {
    const source = new World({ seed: 1 });
    const snapshot = snapshotWorld(source);
    const tampered = {
      ...snapshot,
      control: { speedMultiplier: 3 as unknown as 1, paused: false },
    };

    const target = new World({ seed: 1 });
    restoreWorld(target, tampered);
    expect(target.control.speedMultiplier).toBe(1);
  });
});
