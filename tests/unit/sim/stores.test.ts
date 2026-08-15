import { describe, expect, it } from 'vitest';
import { Hasher } from '@sim/math/hash';
import { ACTOR_KIND_CUSTOMER } from '@config/actors';
import type { ActorRecord } from '@sim/stores/actors';
import { createActorPool, writeActor } from '@sim/stores/actors';
import { createOrderPool, writeOrder } from '@sim/stores/OrderStore';
import type { SlotPool } from '@sim/stores/pool';
import { VehicleStore } from '@sim/stores/VehicleStore';

describe('SlotPool', () => {
  it('rejects a non-positive capacity', () => {
    expect(() => createActorPool(0, ACTOR_KIND_CUSTOMER)).toThrow(RangeError);
    expect(() => createActorPool(-1, ACTOR_KIND_CUSTOMER)).toThrow(RangeError);
  });

  it('hands out ascending slots from empty', () => {
    const pool = createActorPool(4, ACTOR_KIND_CUSTOMER);
    expect([pool.acquire(), pool.acquire(), pool.acquire()]).toEqual([0, 1, 2]);
    expect(pool.activeCount).toBe(3);
  });

  it('returns -1 rather than growing when exhausted', () => {
    // Growth in a pool is an allocation on a hot path. A dropped spawn is a
    // visible, budgetable outcome; a hidden allocation is not.
    const pool = createActorPool(2, ACTOR_KIND_CUSTOMER);
    expect(pool.acquire()).toBe(0);
    expect(pool.acquire()).toBe(1);
    expect(pool.acquire()).toBe(-1);
    expect(pool.activeCount).toBe(2);
  });

  it('reuses released slots and wipes the record', () => {
    const pool = createActorPool(3, ACTOR_KIND_CUSTOMER);
    const slot = pool.acquire();
    pool.at(slot).entityId = 99;
    pool.at(slot).x = 4.5;

    pool.release(slot);
    expect(pool.isActive(slot)).toBe(false);
    expect(pool.activeCount).toBe(0);

    const reused = pool.acquire();
    expect(reused).toBe(slot);
    expect(pool.at(reused).entityId).toBe(0);
    expect(pool.at(reused).x).toBe(0);
  });

  it('ignores a release of a slot that is not active', () => {
    const pool = createActorPool(2, ACTOR_KIND_CUSTOMER);
    pool.release(0);
    pool.release(-1);
    pool.release(99);
    expect(pool.activeCount).toBe(0);
    expect(pool.acquire()).toBe(0);
  });

  it('reuses slots deterministically for the same acquire/release sequence', () => {
    const run = (): number[] => {
      const pool = createActorPool(5, ACTOR_KIND_CUSTOMER);
      const order: number[] = [];
      const held = [pool.acquire(), pool.acquire(), pool.acquire()];
      pool.release(held[1] ?? -1);
      pool.release(held[0] ?? -1);
      order.push(pool.acquire(), pool.acquire(), pool.acquire());
      return order;
    };
    expect(run()).toEqual(run());
  });

  it('rejects an out-of-range slot rather than returning undefined', () => {
    const pool = createActorPool(2, ACTOR_KIND_CUSTOMER);
    expect(() => pool.at(5)).toThrow(RangeError);
  });

  it('reset frees every slot and restores allocation order', () => {
    const pool = createActorPool(3, ACTOR_KIND_CUSTOMER);
    pool.acquire();
    pool.acquire();
    pool.at(0).entityId = 7;

    pool.reset();

    expect(pool.activeCount).toBe(0);
    expect(pool.acquire()).toBe(0);
    expect(pool.at(0).entityId).toBe(0);
  });

  it('hashes live slots only, and independently of the free-list history', () => {
    const direct = createActorPool(4, ACTOR_KIND_CUSTOMER);
    const churned = createActorPool(4, ACTOR_KIND_CUSTOMER);

    for (const pool of [direct, churned]) {
      const a = pool.acquire();
      pool.at(a).entityId = 1;
      pool.at(a).x = 2;
    }
    // Same live set, different history: churned reached it via an extra
    // acquire/release cycle. Two identical worlds must not hash differently.
    const scratch = churned.acquire();
    churned.at(scratch).entityId = 42;
    churned.release(scratch);

    const hashOf = (pool: SlotPool<ActorRecord>): string => {
      const hasher = new Hasher();
      pool.hashInto(hasher, writeActor);
      return hasher.digest();
    };

    expect(hashOf(churned)).toBe(hashOf(direct));
  });

  it('hashes differently when a live record differs', () => {
    const a = createActorPool(2, ACTOR_KIND_CUSTOMER);
    const b = createActorPool(2, ACTOR_KIND_CUSTOMER);
    a.acquire();
    b.acquire();
    a.at(0).x = 1;
    b.at(0).x = 1.0000001;

    const hashOf = (pool: SlotPool<ActorRecord>): string => {
      const hasher = new Hasher();
      pool.hashInto(hasher, writeActor);
      return hasher.digest();
    };

    expect(hashOf(a)).not.toBe(hashOf(b));
  });

  it('order pool records carry an unowned marker until assigned', () => {
    const orders = createOrderPool(2);
    const slot = orders.acquire();
    expect(orders.at(slot).customerSlot).toBe(-1);

    orders.at(slot).customerSlot = 3;
    orders.release(slot);
    expect(orders.at(slot).customerSlot).toBe(-1);

    const hasher = new Hasher();
    orders.hashInto(hasher, writeOrder);
    expect(hasher.digest()).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('VehicleStore', () => {
  it('rejects a non-positive capacity', () => {
    expect(() => new VehicleStore(0)).toThrow(RangeError);
  });

  it('spawns into ascending slots and tracks the live count', () => {
    const store = new VehicleStore(4);
    expect(store.spawn(1)).toBe(0);
    expect(store.spawn(2)).toBe(1);
    expect(store.activeCount).toBe(2);
    expect(store.entityId[0]).toBe(1);
    expect(store.entityId[1]).toBe(2);
  });

  it('returns -1 when full instead of growing the typed arrays', () => {
    const store = new VehicleStore(2);
    store.spawn(1);
    store.spawn(2);
    expect(store.spawn(3)).toBe(-1);
    expect(store.activeCount).toBe(2);
  });

  it('zeroes every column on despawn so a reused slot cannot inherit state', () => {
    const store = new VehicleStore(2);
    const slot = store.spawn(7);
    store.laneS[slot] = 12.5;
    store.speed[slot] = 18;
    store.state[slot] = 3;
    store.archetype[slot] = 2;

    store.despawn(slot);
    expect(store.isActive(slot)).toBe(false);

    const reused = store.spawn(8);
    expect(reused).toBe(slot);
    expect(store.laneS[reused]).toBe(0);
    expect(store.speed[reused]).toBe(0);
    expect(store.state[reused]).toBe(0);
    expect(store.archetype[reused]).toBe(0);
    expect(store.entityId[reused]).toBe(8);
  });

  it('ignores despawn of an inactive or out-of-range slot', () => {
    const store = new VehicleStore(2);
    store.despawn(0);
    store.despawn(-1);
    store.despawn(99);
    expect(store.activeCount).toBe(0);
  });

  it('reset clears the arrays and restores allocation order', () => {
    const store = new VehicleStore(3);
    store.spawn(1);
    store.spawn(2);
    store.laneS[0] = 9;

    store.reset();

    expect(store.activeCount).toBe(0);
    expect(store.laneS[0]).toBe(0);
    expect(store.spawn(5)).toBe(0);
  });

  it('hashes live slots only', () => {
    const hashOf = (store: VehicleStore): string => {
      const hasher = new Hasher();
      store.hashInto(hasher);
      return hasher.digest();
    };

    const a = new VehicleStore(4);
    const b = new VehicleStore(4);
    a.spawn(1);
    b.spawn(1);
    expect(hashOf(a)).toBe(hashOf(b));

    // Write into a dead slot: it is not state, so the digest must not move.
    b.laneS[3] = 1234;
    expect(hashOf(b)).toBe(hashOf(a));

    // Write into a live slot: it is state, so the digest must move.
    b.laneS[0] = 1234;
    expect(hashOf(b)).not.toBe(hashOf(a));
  });
});

/**
 * The scan bound — one past the highest live slot.
 *
 * Every per-tick system sweeps a store looking for live entities. With a
 * capacity of 160 and a dozen cars on the road, an unbounded sweep spends 90% of
 * its work finding nothing, which is where a third of the empty-tick budget went
 * once Phase 6 added two more sweeps.
 *
 * The property that makes it safe is one-sided: it may lag high after a burst of
 * despawns, costing a few wasted iterations, but it must never be too low — a
 * bound below a live slot hides an entity from every system at once, and the
 * symptom is a car that stops moving rather than an error.
 */
describe('scan bounds', () => {
  it('starts at zero and follows the highest live slot up', () => {
    const store = new VehicleStore(8);
    expect(store.scanLimit).toBe(0);

    const first = store.spawn(1);
    expect(store.scanLimit).toBe(first + 1);

    const slots = [store.spawn(2), store.spawn(3), store.spawn(4)];
    expect(store.scanLimit).toBe(Math.max(first, ...slots) + 1);
  });

  it('pulls back down as the top empties', () => {
    const store = new VehicleStore(8);
    const slots = [store.spawn(1), store.spawn(2), store.spawn(3)];
    const highest = Math.max(...slots);

    store.despawn(highest);
    expect(store.scanLimit).toBeLessThan(highest + 1);

    for (const slot of slots) store.despawn(slot);
    expect(store.scanLimit).toBe(0);
  });

  it('never excludes a live slot, whatever order things are despawned in', () => {
    /*
     * The invariant, exhaustively. A bound that is merely usually right is worse
     * than none: it fails only under a despawn order nobody reproduces.
     */
    const store = new VehicleStore(12);
    const live = new Set<number>();
    for (let i = 0; i < 12; i++) live.add(store.spawn(i + 1));

    // Despawn in an awkward order — middle out, then the ends.
    for (const slot of [5, 4, 6, 3, 7, 0, 11, 1, 10, 2, 9, 8]) {
      store.despawn(slot);
      live.delete(slot);
      for (const remaining of live) {
        expect(remaining, `slot ${remaining} is live but outside the scan bound`).toBeLessThan(
          store.scanLimit,
        );
      }
    }
    expect(store.scanLimit).toBe(0);
  });

  it('survives a reset', () => {
    const store = new VehicleStore(4);
    store.spawn(1);
    store.spawn(2);
    store.reset();
    expect(store.scanLimit).toBe(0);
    expect(store.spawn(3)).toBeGreaterThanOrEqual(0);
    expect(store.scanLimit).toBeGreaterThan(0);
  });

  it('holds for the pooled stores too', () => {
    const pool = createActorPool(6, 0);
    expect(pool.scanLimit).toBe(0);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.scanLimit).toBe(Math.max(a, b) + 1);
    pool.release(a);
    pool.release(b);
    expect(pool.scanLimit).toBe(0);
  });

  it('leaves the world hash unchanged, because dead slots were never in it', () => {
    // The bound narrows what is *iterated*, not what is digested. If it changed
    // a hash, it would have changed an outcome.
    const digest = (store: VehicleStore): string => {
      const hasher = new Hasher().reset();
      store.hashInto(hasher);
      return hasher.digest();
    };

    const store = new VehicleStore(16);
    const slots = [store.spawn(1), store.spawn(2), store.spawn(3)];
    store.laneS[slots[1] ?? 0] = 12.5;
    const before = digest(store);

    const spare = store.spawn(9);
    store.despawn(spare);

    expect(digest(store)).toBe(before);
  });
});
