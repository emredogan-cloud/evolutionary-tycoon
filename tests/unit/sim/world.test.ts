import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_START_HOUR, HOURS_PER_GAME_DAY, MS_PER_GAME_DAY } from '@config/simulation';

const START_MS = (DEFAULT_GAME_START_HOUR / HOURS_PER_GAME_DAY) * MS_PER_GAME_DAY;
import { DEFAULT_SPEED_MULTIPLIER, ENTITY_CAPACITY } from '@config/simulation';
import { World } from '@sim/core/World';

function freshWorld(seed = 42): World {
  return new World({ seed });
}

describe('World', () => {
  it('starts from documented defaults', () => {
    const world = freshWorld();
    expect(world.tick).toBe(0);
    expect(world.clock.simTimeMs).toBe(START_MS);
    expect(world.nextEntityId).toBe(1);
    expect(world.control.speedMultiplier).toBe(DEFAULT_SPEED_MULTIPLIER);
    expect(world.control.paused).toBe(false);
    expect(world.progression.stage).toBe(1);
    expect(world.economy.cash).toBe(0);
    expect(world.stats.commandsApplied).toBe(0);
  });

  it('sizes its stores from the configured capacities by default', () => {
    const world = freshWorld();
    expect(world.vehicles.capacity).toBe(ENTITY_CAPACITY.vehicles);
    expect(world.customers.capacity).toBe(ENTITY_CAPACITY.customers);
    expect(world.employees.capacity).toBe(ENTITY_CAPACITY.employees);
    expect(world.orders.capacity).toBe(ENTITY_CAPACITY.orders);
  });

  it('accepts capacity overrides', () => {
    const world = new World({ seed: 1, capacities: { vehicles: 3, customers: 4 } });
    expect(world.vehicles.capacity).toBe(3);
    expect(world.customers.capacity).toBe(4);
    expect(world.employees.capacity).toBe(ENTITY_CAPACITY.employees);
  });

  it('allocates entity ids monotonically and never reuses one', () => {
    const world = freshWorld();
    const ids = Array.from({ length: 1000 }, () => world.allocateEntityId());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(1);
    expect(ids[999]).toBe(1000);
    expect(world.nextEntityId).toBe(1001);
  });

  describe('hash', () => {
    it('is identical for two worlds constructed from the same seed', () => {
      expect(freshWorld(7).hash()).toBe(freshWorld(7).hash());
    });

    it('differs for different seeds', () => {
      expect(freshWorld(1).hash()).not.toBe(freshWorld(2).hash());
    });

    it('is stable across repeated calls', () => {
      const world = freshWorld();
      const first = world.hash();
      expect(world.hash()).toBe(first);
      expect(world.hash()).toBe(first);
    });

    it('moves when any persistent field changes', () => {
      const baseline = freshWorld().hash();

      const mutations: ((world: World) => void)[] = [
        (w) => {
          w.tick = 1;
        },
        (w) => {
          w.clock.advance(50);
        },
        (w) => {
          w.allocateEntityId();
        },
        (w) => {
          w.rng.traffic.next();
        },
        (w) => {
          w.vehicles.spawn(1);
        },
        (w) => {
          w.customers.acquire();
        },
        (w) => {
          w.employees.acquire();
        },
        (w) => {
          w.orders.acquire();
        },
        (w) => {
          w.progression.stage = 2;
        },
        (w) => {
          w.progression.unlocks.push('grill');
        },
        (w) => {
          w.progression.milestones.push('first-customer');
        },
        (w) => {
          w.economy.cash = 1;
        },
        (w) => {
          w.economy.reputation = 1;
        },
        (w) => {
          w.economy.lifetimeRevenue = 1;
        },
        (w) => {
          w.economy.prices.set('burger', 5);
        },
        (w) => {
          w.layout.placed.push({ objectId: 'counter', x: 1, y: 2, z: 0 });
        },
        (w) => {
          w.layout.upgrades.set('grill', 1);
        },
        (w) => {
          w.staff.hired.push({ entityId: 1, roleId: 'cook' });
        },
        (w) => {
          w.stats.customersServed = 1;
        },
        (w) => {
          w.stats.vehiclesSpawned = 1;
        },
        (w) => {
          w.stats.commandsApplied = 1;
        },
        (w) => {
          w.settings.audio.master = 0.5;
        },
        (w) => {
          w.settings.audio.music = 0.5;
        },
        (w) => {
          w.settings.audio.sfx = 0.5;
        },
        (w) => {
          w.settings.audio.muted = true;
        },
        (w) => {
          w.settings.a11y.reducedMotion = true;
        },
        (w) => {
          w.settings.a11y.highContrast = true;
        },
      ];

      for (const mutate of mutations) {
        const world = freshWorld();
        mutate(world);
        expect(world.hash(), `mutation ${mutations.indexOf(mutate)} did not move the hash`).not.toBe(
          baseline,
        );
      }
    });

    it('ignores the cosmetic RNG stream', () => {
      // The contract that lets visual variety be added without invalidating a
      // single balance test or golden image.
      const world = freshWorld();
      const before = world.hash();
      for (let i = 0; i < 10_000; i++) world.rng.cosmetic.next();
      expect(world.hash()).toBe(before);
    });

    it('ignores speed and pause', () => {
      // Rate controls change when ticks happen, not what a tick does. Excluding
      // them is what makes the 1x/2x/4x equivalence test meaningful.
      const world = freshWorld();
      const before = world.hash();
      world.control.speedMultiplier = 4;
      world.control.paused = true;
      expect(world.hash()).toBe(before);
    });

    it('ignores the per-tick event queue', () => {
      const world = freshWorld();
      const before = world.hash();
      world.eventQueue.emitDayStarted(3);
      expect(world.hash()).toBe(before);
    });

    it('depends on price content, not on insertion order', () => {
      const a = freshWorld();
      const b = freshWorld();
      a.economy.prices.set('burger', 5);
      a.economy.prices.set('fries', 3);
      b.economy.prices.set('fries', 3);
      b.economy.prices.set('burger', 5);
      expect(a.hash()).toBe(b.hash());
    });

    it('depends on upgrade content, not on insertion order', () => {
      const a = freshWorld();
      const b = freshWorld();
      a.layout.upgrades.set('grill', 2);
      a.layout.upgrades.set('fryer', 1);
      b.layout.upgrades.set('fryer', 1);
      b.layout.upgrades.set('grill', 2);
      expect(a.hash()).toBe(b.hash());
    });
  });

  it('reset returns a mutated world to its freshly seeded digest', () => {
    const world = freshWorld(2026);
    const pristine = world.hash();

    world.tick = 500;
    world.clock.advance(25_000);
    world.allocateEntityId();
    world.rng.traffic.next();
    world.rng.cosmetic.next();
    world.vehicles.spawn(1);
    world.customers.acquire();
    world.employees.acquire();
    world.orders.acquire();
    world.control.speedMultiplier = 4;
    world.control.paused = true;
    world.progression.stage = 3;
    world.progression.unlocks.push('a');
    world.progression.milestones.push('b');
    world.economy.cash = 100;
    world.economy.reputation = 50;
    world.economy.lifetimeRevenue = 999;
    world.economy.prices.set('burger', 5);
    world.layout.placed.push({ objectId: 'x', x: 1, y: 1, z: 0 });
    world.layout.upgrades.set('grill', 1);
    world.staff.hired.push({ entityId: 1, roleId: 'cook' });
    world.stats.customersServed = 9;
    world.stats.vehiclesSpawned = 8;
    world.stats.commandsApplied = 7;
    world.settings.audio.muted = true;
    world.settings.a11y.reducedMotion = true;
    world.eventQueue.emitDayStarted(1);

    world.reset();

    expect(world.hash()).toBe(pristine);
    expect(world.control.speedMultiplier).toBe(DEFAULT_SPEED_MULTIPLIER);
    expect(world.control.paused).toBe(false);
    expect(world.settings.audio.muted).toBe(false);
    expect(world.settings.a11y.reducedMotion).toBe(false);
    expect(world.eventQueue.size).toBe(0);
    // The cosmetic stream is not hashed, so reseeding it has to be asserted directly.
    expect(world.rng.cosmetic.next()).toBe(new World({ seed: 2026 }).rng.cosmetic.next());
  });

  it('setNextEntityId is honoured by the next allocation', () => {
    const world = freshWorld();
    world.setNextEntityId(500);
    expect(world.allocateEntityId()).toBe(500);
    expect(world.nextEntityId).toBe(501);
  });
});
