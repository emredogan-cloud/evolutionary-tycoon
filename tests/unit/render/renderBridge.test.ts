import { describe, expect, it } from 'vitest';
import { ACTOR_KIND_CUSTOMER, ACTOR_KIND_PROP_TALL } from '@config/actors';
import { ActorViewPool } from '@render/ActorView';
import { worldToScreen } from '@render/iso/IsoProjection';
import { RenderBridge } from '@render/RenderBridge';
import { Sim } from '@sim/core/Sim';
import type { SimView } from '@sim/core/types';

function simWithCustomers(positions: readonly (readonly [number, number, number])[]): Sim {
  const sim = new Sim({ seed: 1 });
  for (const [x, y, z] of positions) {
    const slot = sim.world.customers.acquire();
    const record = sim.world.customers.at(slot);
    record.entityId = sim.world.allocateEntityId();
    record.x = x;
    record.y = y;
    record.z = z;
    /*
     * Standing in the world (`visible`) and placed by hand rather than by
     * conversion (`staged`), which is what `stageScene` does for an authored
     * scene. Without `staged` the customer state machine takes ownership of
     * them and walks them off to their default target, which is a fine thing
     * for it to do to a real customer and useless here.
     */
    record.visible = 1;
    record.staged = 1;
  }
  return sim;
}

describe('ActorViewPool', () => {
  it('rejects a non-positive capacity', () => {
    expect(() => new ActorViewPool(0)).toThrow(RangeError);
  });

  it('leases up to capacity and then reports exhaustion', () => {
    const pool = new ActorViewPool(2);
    pool.beginFrame();
    expect(pool.lease()).not.toBeNull();
    expect(pool.lease()).not.toBeNull();
    // Dropping the extra actor is a visible, budgetable outcome; growing the
    // pool mid-frame would be a hidden allocation.
    expect(pool.lease()).toBeNull();
    expect(pool.leasedCount).toBe(2);
  });

  it('reuses the same view objects every frame', () => {
    const pool = new ActorViewPool(2);
    pool.beginFrame();
    const first = pool.lease();
    pool.beginFrame();
    expect(pool.lease()).toBe(first);
    expect(pool.leasedCount).toBe(1);
  });
});

describe('RenderBridge', () => {
  it('projects each actor to its screen position', () => {
    const sim = simWithCustomers([[4, 6, 0]]);
    const bridge = new RenderBridge(16);
    bridge.sync(sim.readView(), 0);

    const expected = worldToScreen(4, 6, 0, { x: 0, y: 0 });
    expect(bridge.visible).toHaveLength(1);
    expect(bridge.visible[0]?.screenX).toBeCloseTo(expected.x, 9);
    expect(bridge.visible[0]?.screenY).toBeCloseTo(expected.y, 9);
  });

  it('returns the visible set in depth order', () => {
    const sim = simWithCustomers([
      [10, 10, 0],
      [2, 2, 0],
      [6, 6, 0],
    ]);
    const bridge = new RenderBridge(16);
    bridge.sync(sim.readView(), 0);

    const depths = bridge.visible.map((view) => view.depth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    expect(bridge.visible[0]?.worldX).toBe(2);
  });

  it('sorts statics alongside actors rather than in a layer of their own', () => {
    // The question a player asks of a counter is whether a customer walks in
    // front of it or behind it, and a separate layer answers that once, globally.
    const sim = simWithCustomers([[10, 10, 0]]);
    const bridge = new RenderBridge(16);
    bridge.setStatics([
      { entityId: -1, x: 4, y: 4, z: 0, kind: ACTOR_KIND_PROP_TALL, variant: 0 },
      { entityId: -2, x: 16, y: 16, z: 0, kind: ACTOR_KIND_PROP_TALL, variant: 0 },
    ]);

    bridge.sync(sim.readView(), 0);

    expect(bridge.visible.map((view) => view.entityId)).toEqual([-1, 1, -2]);
  });

  it('places a newly spawned actor where it is, rather than sliding it in', () => {
    const sim = simWithCustomers([[8, 8, 0]]);
    const bridge = new RenderBridge(16);
    // alpha 0.5 with no previous position must not blend from the origin.
    bridge.sync(sim.readView(), 0.5);
    expect(bridge.visible[0]?.worldX).toBe(8);
    expect(bridge.visible[0]?.worldY).toBe(8);
  });

  it('interpolates between ticks', () => {
    const sim = simWithCustomers([[0, 0, 0]]);
    const bridge = new RenderBridge(16);

    bridge.sync(sim.readView(), 0);
    sim.tick();
    const record = sim.world.customers.at(0);
    record.x = 10;
    record.y = 20;
    record.z = 2;

    bridge.sync(sim.readView(), 0.25);
    expect(bridge.visible[0]?.worldX).toBeCloseTo(2.5, 9);
    expect(bridge.visible[0]?.worldY).toBeCloseTo(5, 9);
    expect(bridge.visible[0]?.worldZ).toBeCloseTo(0.5, 9);
  });

  it('clamps alpha, so a late frame cannot overshoot the target', () => {
    const sim = simWithCustomers([[0, 0, 0]]);
    const bridge = new RenderBridge(16);
    bridge.sync(sim.readView(), 0);
    sim.tick();
    sim.world.customers.at(0).x = 10;

    bridge.sync(sim.readView(), 3);
    expect(bridge.visible[0]?.worldX).toBe(10);
  });

  it('records positions once per tick, not once per frame', () => {
    // Refreshing per frame would make "previous" mean "one frame ago" and the
    // interpolation would collapse to no interpolation at all.
    const sim = simWithCustomers([[0, 0, 0]]);
    const bridge = new RenderBridge(16);
    bridge.sync(sim.readView(), 0);

    sim.tick();
    sim.world.customers.at(0).x = 8;

    bridge.sync(sim.readView(), 0.5);
    expect(bridge.visible[0]?.worldX).toBeCloseTo(4, 9);
    // Same tick, later frame: still blending from the same origin.
    bridge.sync(sim.readView(), 0.75);
    expect(bridge.visible[0]?.worldX).toBeCloseTo(6, 9);
  });

  it('forgets actors that have left', () => {
    const sim = simWithCustomers([
      [1, 1, 0],
      [2, 2, 0],
    ]);
    const bridge = new RenderBridge(16);
    bridge.sync(sim.readView(), 0);
    expect(bridge.trackedCount).toBe(2);

    const releasedId = sim.world.customers.at(1).entityId;
    sim.world.customers.release(1);
    sim.tick();
    const view = sim.readView();
    bridge.sync(view, 0);

    // Entity ids are never reused, so a stale entry could not be mistaken for a
    // live one — but it would still grow the map for the whole session. The
    // 08:00 world may add morning traffic on that tick, so the counts are
    // anchored to the live view rather than to a literal.
    expect(bridge.trackedCount).toBe(view.actorCount);
    expect(bridge.visible.some((v) => v.entityId === releasedId)).toBe(false);
  });

  it('drops actors beyond the pool rather than growing', () => {
    const sim = simWithCustomers([
      [1, 1, 0],
      [2, 2, 0],
      [3, 3, 0],
    ]);
    const bridge = new RenderBridge(2);
    bridge.sync(sim.readView(), 0);
    expect(bridge.visible).toHaveLength(2);
  });

  it('drops statics beyond the pool rather than growing', () => {
    const sim = new Sim({ seed: 1 });
    const bridge = new RenderBridge(2);
    bridge.setStatics([
      { entityId: -1, x: 1, y: 1, z: 0, kind: ACTOR_KIND_PROP_TALL, variant: 0 },
      { entityId: -2, x: 2, y: 2, z: 0, kind: ACTOR_KIND_PROP_TALL, variant: 0 },
      { entityId: -3, x: 3, y: 3, z: 0, kind: ACTOR_KIND_PROP_TALL, variant: 0 },
    ]);
    bridge.sync(sim.readView(), 0);
    expect(bridge.visible).toHaveLength(2);
  });

  it('leaves room for nothing else once statics fill the pool', () => {
    // Statics are leased first, so an over-large static set starves the actors.
    // Surfacing it here means the capacity mistake is a test failure rather than
    // a scene that silently renders without its people.
    const sim = simWithCustomers([[5, 5, 0]]);
    const bridge = new RenderBridge(1);
    bridge.setStatics([{ entityId: -1, x: 1, y: 1, z: 0, kind: ACTOR_KIND_PROP_TALL, variant: 0 }]);
    bridge.sync(sim.readView(), 0);
    expect(bridge.visible).toHaveLength(1);
    expect(bridge.visible[0]?.entityId).toBe(-1);
  });

  it('carries the actor kind through to the view', () => {
    const sim = new Sim({ seed: 1 });
    const slot = sim.world.customers.acquire();
    const record = sim.world.customers.at(slot);
    record.entityId = sim.world.allocateEntityId();
    record.visible = 1;
    record.staged = 1;
    record.kind = ACTOR_KIND_PROP_TALL;

    const bridge = new RenderBridge(16);
    bridge.sync(sim.readView(), 0);
    expect(bridge.visible[0]?.kind).toBe(ACTOR_KIND_PROP_TALL);
  });

  it('defaults an untouched customer slot to the customer kind', () => {
    const sim = simWithCustomers([[1, 1, 0]]);
    const bridge = new RenderBridge(16);
    bridge.sync(sim.readView(), 0);
    expect(bridge.visible[0]?.kind).toBe(ACTOR_KIND_CUSTOMER);
  });

  it('reset clears both the tracking map and the visible set', () => {
    const sim = simWithCustomers([[1, 1, 0]]);
    const bridge = new RenderBridge(16);
    bridge.sync(sim.readView(), 0);
    bridge.reset();
    expect(bridge.trackedCount).toBe(0);
    expect(bridge.visible).toHaveLength(0);
  });
});

describe('RenderBridge cannot write back into the simulation', () => {
  it('runs 100 ticks against a deeply frozen view without mutating anything', () => {
    // The structural guarantee behind "the only way into the simulation is a
    // Command". Freezing catches a write that the readonly types would only
    // catch at compile time — and a cast is all it takes to lose that.
    //
    // A frozen *copy* rather than the live view: `readView` deliberately returns
    // the same reusable object every call, so freezing it in place would break
    // the simulation's own bookkeeping rather than test the bridge.
    const sim = simWithCustomers([
      [3, 4, 0],
      [7, 2, 1],
    ]);
    const bridge = new RenderBridge(16);
    const hashBefore = sim.world.hash();

    const freezeCopy = (view: SimView): SimView => {
      const actors = [];
      for (let i = 0; i < view.actorCount; i++) {
        const actor = view.actors[i];
        if (actor !== undefined) actors.push(Object.freeze({ ...actor }));
      }
      return Object.freeze({ ...view, actors: Object.freeze(actors) });
    };

    for (let tick = 0; tick < 100; tick++) {
      // Would throw in strict mode if the bridge wrote to any of it.
      expect(() => {
        bridge.sync(freezeCopy(sim.readView()), tick / 100);
      }).not.toThrow();

      sim.tick();
    }

    // The world advanced only because `sim.tick()` advanced it.
    expect(sim.world.tick).toBe(100);
    expect(sim.world.hash()).not.toBe(hashBefore);
    expect(sim.world.customers.at(0).x).toBe(3);
    expect(sim.world.customers.at(1).y).toBe(2);
  });
});
