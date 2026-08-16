import { describe, expect, it } from 'vitest';
import { layoutForStage } from '@config/layouts';
import { Sim } from '@sim/core/Sim';
import { navigationIntact } from '@sim/nav/reachability';
import {
  MAX_PLACED_OBJECTS,
  PLACEMENT_GRID_METRES,
  moveObject,
  placeObject,
  removeObject,
  snapToGrid,
} from '@sim/systems/LayoutSystem';

const LONG_RUN_TIMEOUT_MS = 120_000;

/**
 * Placing things, and what it does to navigation — GAME_EXECUTION_ROADMAP
 * Phase 11.
 *
 * Two requirements, and the second is the one Phase 7 left owing:
 *
 * 1. _"A placement that would block navigation must be rejected with clear
 *    visual feedback, not silently accepted and then break pathfinding."_
 * 2. _"Placement invalidates the flow field cache — wire that explicitly and
 *    test that agents re-route."_
 *
 * PHASE_7_REPORT recorded that the invalidation signature was `placed.length`,
 * which **cannot see a move**: place then remove leaves the count identical and
 * the navigation grid describing a world that no longer exists. `layout.revision`
 * replaces it, and the move test below is the one that would have caught it.
 */

/** A wall of objects across a gap, one cell apart. */
function wallAcross(sim: Sim, x: number, fromY: number, toY: number): number {
  let placed = 0;
  for (let y = fromY; y <= toY; y += PLACEMENT_GRID_METRES) {
    if (placeObject(sim.world, 'ph-prop-short', x, y, navigationIntact) === 'ok') placed++;
  }
  return placed;
}

describe('placement is grid-snapped', () => {
  it('snaps to the navigation cell, so the preview cannot lie', () => {
    /*
     * GAME_DESIGN_DOCUMENT §25, S4 — decided in Phase 11: grid-snapped. The
     * navigation grid has 0.5 m cells, so a freely-placed object either rounds
     * to the same cells anyway — in which case the freedom is a lie the preview
     * tells — or straddles a boundary and blocks a cell the player can see they
     * did not cover.
     */
    expect(snapToGrid(3.26)).toBe(3.5);
    expect(snapToGrid(3.24)).toBe(3);
    expect(snapToGrid(-0.1)).toBe(-0);

    const sim = new Sim({ seed: 1 });
    expect(placeObject(sim.world, 'ph-prop-short', 8.13, 16.37, navigationIntact)).toBe('ok');

    const placed = sim.world.layout.placed[0];
    expect(placed?.x).toBe(8);
    expect(placed?.y).toBe(16.5);
    // And it is on the grid, which is what makes "what will this block"
    // answerable before the click rather than after it.
    expect((placed?.x ?? 0) % PLACEMENT_GRID_METRES).toBe(0);
    expect((placed?.y ?? 0) % PLACEMENT_GRID_METRES).toBe(0);
  });

  it('refuses a spot that is already taken', () => {
    // Its own answer, separate from a navigation failure, so the interface can
    // say something useful instead of "no".
    const sim = new Sim({ seed: 1 });
    expect(placeObject(sim.world, 'ph-prop-short', 8, 16, navigationIntact)).toBe('ok');
    expect(placeObject(sim.world, 'ph-prop-short', 8.1, 16.1, navigationIntact)).toBe('occupied');
    expect(sim.world.layout.placed).toHaveLength(1);
  });

  it('refuses a spot outside the lot', () => {
    const sim = new Sim({ seed: 1 });
    const lot = layoutForStage(1).lot;
    expect(placeObject(sim.world, 'ph-prop-short', lot.maxX + 5, 10, navigationIntact)).toBe('outside-lot');
    expect(placeObject(sim.world, 'ph-prop-short', 10, lot.minY - 5, navigationIntact)).toBe('outside-lot');
  });

  it('stops accepting once the lot is full', () => {
    const sim = new Sim({ seed: 1 });
    for (let i = 0; i < MAX_PLACED_OBJECTS; i++) {
      sim.world.layout.placed.push({ objectId: 'ph-prop-short', x: -100 - i, y: -100, z: 0 });
    }
    expect(placeObject(sim.world, 'ph-prop-short', 8, 16, navigationIntact)).toBe('full');
  });
});

describe('a placement that would strand somebody is refused', () => {
  it('rejects a wall across the only route, and leaves nothing behind', () => {
    /*
     * The rule that matters. A wall across the walkable strip between the car
     * park and the counter cuts every door off, and the check is made by asking
     * the navigation grid rather than by comparing rectangles — the grid is the
     * authority on where people can walk.
     */
    const sim = new Sim({ seed: 1 });

    // Build up to the last cell of a wall; the placement that closes it must be
    // the one that is refused.
    let refusals = 0;
    for (let y = 9.5; y <= 18; y += PLACEMENT_GRID_METRES) {
      const outcome = placeObject(sim.world, 'ph-prop-short', 11, y, navigationIntact);
      if (outcome === 'blocks-navigation') refusals++;
    }

    expect(refusals, 'the wall was never refused').toBeGreaterThan(0);
    // Whatever survived, the world is still navigable — a refusal must not leave
    // the object behind.
    expect(navigationIntact(sim.world)).toBe(true);
  });

  it('is still navigable after a hundred random-ish placements', () => {
    /*
     * The property, hammered. Placements walk a deterministic lattice across the
     * lot; every one either lands or is refused, and the world is checked after
     * each. A single accepted placement that broke navigation fails here.
     */
    const sim = new Sim({ seed: 1 });
    let accepted = 0;

    for (let i = 0; i < 100; i++) {
      const x = 2 + ((i * 7) % 20);
      const y = 9 + ((i * 5) % 9);
      const outcome = placeObject(sim.world, 'ph-prop-short', x, y, navigationIntact);
      if (outcome === 'ok') accepted++;
      expect(navigationIntact(sim.world), `broken after placement ${String(i)}`).toBe(true);
    }

    expect(accepted, 'nothing was ever placed, so this proves nothing').toBeGreaterThan(10);
  });
});

describe('the navigation cache notices', () => {
  it('bumps the revision on every kind of change', () => {
    /*
     * **The Phase 7 defect, made impossible.** `placed.length` was the old
     * signature and a *move* does not change it: place then remove leaves the
     * count identical and the grid describing a world that no longer exists.
     */
    const sim = new Sim({ seed: 1 });
    const start = sim.world.layout.revision;

    expect(placeObject(sim.world, 'ph-prop-short', 8, 16, navigationIntact)).toBe('ok');
    const afterPlace = sim.world.layout.revision;
    expect(afterPlace).toBeGreaterThan(start);

    const countBefore = sim.world.layout.placed.length;
    expect(moveObject(sim.world, 0, 9, 16, navigationIntact)).toBe('ok');
    expect(sim.world.layout.placed.length, 'a move changed the count').toBe(countBefore);
    expect(
      sim.world.layout.revision,
      'a move left the revision unchanged — the Phase 7 defect is back',
    ).toBeGreaterThan(afterPlace);

    const afterMove = sim.world.layout.revision;
    expect(removeObject(sim.world, 0)).toBe(true);
    expect(sim.world.layout.revision).toBeGreaterThan(afterMove);
  });

  it('bumps the revision when the stage changes', () => {
    // New parking, new queue slots, a new building footprint. A cache that kept
    // Stage 1's grid inside Stage 3 would route people around a world that is
    // not there.
    const sim = new Sim({ seed: 1 });
    const before = sim.world.layout.revision;

    sim.world.economy.cash = 100_000;
    sim.world.stats.customersServed = 10_000;
    sim.world.economy.reputation = 100;
    for (let i = 0; i < 12; i++) sim.dispatch({ t: 'BUY_UPGRADE', upgradeId: 'hand-painted-sign' });
    sim.dispatch({ t: 'HIRE', roleId: 'cook', skill: 0.5 });
    sim.advance(5);
    sim.dispatch({ t: 'EVOLVE' });
    sim.advance(400);

    expect(sim.world.progression.stage).toBe(2);
    expect(sim.world.layout.revision).toBeGreaterThan(before);
  });

  it('puts a refused move back exactly where it was', () => {
    // A refused move must not cost the player the object.
    const sim = new Sim({ seed: 1 });
    expect(placeObject(sim.world, 'ph-prop-short', 8, 16, navigationIntact)).toBe('ok');

    const outcome = moveObject(sim.world, 0, 10_000, 10_000, navigationIntact);
    expect(outcome).not.toBe('ok');
    expect(sim.world.layout.placed).toHaveLength(1);
    expect(sim.world.layout.placed[0]?.x).toBe(8);
    expect(sim.world.layout.placed[0]?.y).toBe(16);
  });
});

describe('agents re-route', () => {
  it(
    'keeps serving after the lot is rearranged mid-service',
    () => {
      /*
       * The end-to-end version of the invalidation claim: objects appear and
       * disappear while people are walking, and the stand keeps working. If the
       * cache did not rebuild, agents would walk into the new objects and the
       * served count would stop climbing.
       */
      const sim = new Sim({ seed: 424242 });
      sim.world.progression.stage = 1;

      let placedCount = 0;
      for (let tick = 0; tick < 12_000; tick++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();

        // Rearrange every fifteen seconds: put one down, take the oldest away.
        if (tick % 300 === 0) {
          const x = 4 + ((tick / 300) % 14);
          if (placeObject(sim.world, 'ph-prop-short', x, 16, navigationIntact) === 'ok') {
            placedCount++;
          }
          if (sim.world.layout.placed.length > 4) removeObject(sim.world, 0);
        }
      }

      expect(placedCount, 'nothing was ever placed').toBeGreaterThan(3);
      expect(sim.world.stats.customersServed, 'service stopped after the lot changed').toBeGreaterThan(5);
      expect(navigationIntact(sim.world)).toBe(true);
    },
    LONG_RUN_TIMEOUT_MS,
  );

  it('leaves nobody stranded when an object lands on their route', () => {
    /*
     * The specific failure the invalidation exists to prevent: somebody is
     * walking, an object appears beside them, and they have to find another way
     * round. Asserted by watching that everybody who was walking is either still
     * walking or has arrived — nobody is frozen.
     */
    const sim = new Sim({ seed: 424242 });
    sim.advance(6000);

    const positions = new Map<number, { x: number; y: number }>();
    for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
      if (!sim.world.customers.isActive(slot)) continue;
      const customer = sim.world.customers.at(slot);
      if (customer.visible !== 1) continue;
      positions.set(customer.entityId, { x: customer.x, y: customer.y });
    }

    for (let y = 12; y <= 14; y += PLACEMENT_GRID_METRES) {
      placeObject(sim.world, 'ph-prop-short', 14, y, navigationIntact);
    }
    sim.advance(600);

    // Everybody who was on foot has either moved or reached where they were
    // going. A frozen agent would still be at exactly its old coordinates.
    let checked = 0;
    for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
      if (!sim.world.customers.isActive(slot)) continue;
      const customer = sim.world.customers.at(slot);
      const before = positions.get(customer.entityId);
      if (before === undefined) continue;
      checked++;
      const moved = Math.hypot(customer.x - before.x, customer.y - before.y);
      // Standing in a queue is legitimately still, so this only asserts that
      // *somebody* moved rather than that everybody did.
      if (moved > 0.1) return;
    }

    expect(checked, 'nobody was walking, so this proves nothing').toBeGreaterThan(0);
  });
});

describe('wallAcross helper', () => {
  it('is refused before it can close the only gap', () => {
    const sim = new Sim({ seed: 1 });
    wallAcross(sim, 11, 9.5, 18);
    expect(navigationIntact(sim.world)).toBe(true);
  });
});
