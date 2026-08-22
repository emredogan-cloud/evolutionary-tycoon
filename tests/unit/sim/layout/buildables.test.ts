import { describe, expect, it } from 'vitest';
import { BUILDABLES } from '@config/buildables';
import { worldObjectIndexOf } from '@config/sprites';
import { Sim } from '@sim/core/Sim';
import { navigationIntact } from '@sim/nav/reachability';
import { placeObject, previewPlacement } from '@sim/systems/LayoutSystem';

/**
 * The build-mode catalogue — Phase 11.
 *
 * Small enough to read in one screen and therefore easy to get subtly wrong: an
 * entry naming a texture nobody loaded throws a `RangeError` from inside a
 * pointer handler, which is the worst possible place for it, and an entry with a
 * duplicate id makes the palette's selection ambiguous.
 */

describe('everything in the palette can actually be built', () => {
  it('names a production world object', () => {
    /*
     * The correction pass moved these off the placeholder stems: a buildable
     * now names an entry of `WORLD_OBJECTS`, so a placement draws real art
     * and blocks the navigation grid with that object's real footprint. An
     * id neither catalogue knows would draw the counted placeholder box and
     * fail the production-placeholder-zero assertion — this catches it at
     * unit speed instead.
     */
    for (const item of BUILDABLES) {
      expect(
        worldObjectIndexOf(item.objectId),
        `${item.id} names no production world object`,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it('has unique ids and non-empty labels', () => {
    const ids = new Set(BUILDABLES.map((item) => item.id));
    expect(ids.size, 'two buildables share an id').toBe(BUILDABLES.length);
    for (const item of BUILDABLES) expect(item.label.trim().length).toBeGreaterThan(0);
  });

  it('can be previewed and placed, every one of them', () => {
    /*
     * End to end through the same two functions build mode uses, because the
     * catalogue is only meaningful if the simulation accepts what it offers.
     * Placed at 0.5 m intervals along a clear strip of the lot.
     */
    const sim = new Sim({ seed: 1 });
    let x = 4;
    for (const item of BUILDABLES) {
      expect(previewPlacement(sim.world, item.objectId, x, 16.5, navigationIntact)).toBe('ok');
      expect(placeObject(sim.world, item.objectId, x, 16.5, navigationIntact)).toBe('ok');
      x += 1.5;
    }
    expect(sim.world.layout.placed).toHaveLength(BUILDABLES.length);
    expect(navigationIntact(sim.world)).toBe(true);
  });
});

describe('the preview and the placement always agree', () => {
  it('never says yes to something that is then refused, or the reverse', () => {
    /*
     * **The property build mode's ghost is worth nothing without.** A green
     * ghost followed by a refusal is worse than no ghost at all, because the
     * player has already decided.
     *
     * Swept over a lattice that covers the lot, the road, the queue and the
     * grass outside — so it includes every outcome the pair can produce.
     */
    const outcomes = new Set<string>();

    for (let x = -2; x <= 26; x += 1.5) {
      for (let y = -2; y <= 20; y += 1.5) {
        // A fresh world each time: `placeObject` mutates, and a shared one would
        // have the previous placement's object in it.
        const sim = new Sim({ seed: 1 });
        const predicted = previewPlacement(sim.world, 'ph-prop-short', x, y, navigationIntact);
        const actual = placeObject(sim.world, 'ph-prop-short', x, y, navigationIntact);
        expect(actual, `preview and placement disagreed at ${String(x)}, ${String(y)}`).toBe(predicted);
        outcomes.add(predicted);
      }
    }

    // The sweep has to have produced more than one answer, or it proves nothing.
    expect(outcomes.has('ok')).toBe(true);
    expect(outcomes.has('outside-lot')).toBe(true);
  });

  it('leaves the world exactly as it found it', () => {
    /*
     * The preview pushes the object, judges it and pops it — including the
     * layout revision, which is the navigation cache's invalidation signature.
     * Leaving that bumped would rebuild every flow field in the world on every
     * frame the player moved the mouse.
     */
    const sim = new Sim({ seed: 1 });
    sim.advance(200);
    const hash = sim.world.hash();
    const revision = sim.world.layout.revision;

    for (let x = 2; x <= 22; x += 0.5) {
      previewPlacement(sim.world, 'ph-prop-tall', x, 16, navigationIntact);
    }

    expect(sim.world.layout.placed).toHaveLength(0);
    expect(sim.world.layout.revision, 'a preview invalidated the navigation cache').toBe(revision);
    expect(sim.world.hash(), 'a preview changed the world').toBe(hash);
  });

  it('reports a full lot without touching it', () => {
    const sim = new Sim({ seed: 1 });
    for (let i = 0; i < 64; i++) {
      sim.world.layout.placed.push({ objectId: 'ph-prop-short', x: -100 - i, y: -100, z: 0 });
    }
    expect(previewPlacement(sim.world, 'ph-prop-short', 8, 16, navigationIntact)).toBe('full');
    expect(sim.world.layout.placed).toHaveLength(64);
  });
});
