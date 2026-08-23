import { describe, expect, it } from 'vitest';
import { buyBuilt } from '../../../helpers/build';
import { layoutForStage } from '@config/layouts';
import { PROPERTIES, maxPropertyLevel, property, propertyCost } from '@config/properties';
import { Sim, replay } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import { advancePendingBuilds } from '@sim/systems/ProgressionSystem';
import {
  applyPropertyLevel,
  layoutOf,
  pendingPropertyLevel,
  propertyAnchor,
  propertyCapacity,
  propertyLevel,
  upgradeProperty,
} from '@sim/systems/properties';

/**
 * Property levels in the simulation — `docs/RESTAURANT_EVOLUTION_ROADMAP.md` §B.
 *
 * The system's load-bearing claim is that a level is **not a new number the
 * game keeps**. Four of the five properties read a ladder that already existed,
 * so their level cannot drift from what the player owns; the fifth stores one
 * level and pays for it through the construction queue every other purchase
 * uses. Everything below is that claim, made falsifiable.
 */

/** Every property, read off the table rather than typed out again here. */
const PROPERTY_IDS = PROPERTIES.map((spec) => spec.id);

/**
 * A world at `stage` with money, without going through five hours of play.
 *
 * The car park is written to level 1 rather than left unset, because unset
 * means *"whatever this stage always shipped with"* — the fallback that keeps a
 * `?stage=3` world on eight bays. These tests are about the ladder, so they
 * start at the bottom of it and say so.
 */
function stagedSim(stage: 1 | 2 | 3 | 4, cash = 10_000, parking = 1): Sim {
  const sim = new Sim({ seed: 7 });
  sim.world.progression.stage = stage;
  sim.world.economy.cash = cash;
  sim.world.progression.propertyLevels.set('parking', parking);
  return sim;
}

describe('a property reads a ladder that already exists', () => {
  it('follows the stage, the upgrades and the effects it names', () => {
    const sim = stagedSim(2);

    // main is the stage counter; there is one restaurant and evolution moves it.
    expect(propertyLevel(sim.world, 'main')).toBe(2);

    // frontage is the sign, rung for rung.
    expect(propertyLevel(sim.world, 'frontage')).toBe(1);
    expect(buyBuilt(sim.world, 'hand-painted-sign')).toBe('ok');
    expect(propertyLevel(sim.world, 'frontage')).toBe(2);

    // service is queue capacity, two places per rung.
    const serviceBefore = propertyLevel(sim.world, 'service');
    expect(buyBuilt(sim.world, 'bigger-counter')).toBe('ok');
    expect(propertyLevel(sim.world, 'service')).toBe(serviceBefore + 1);

    // An unknown id is level 0, not a crash and not a phantom level 1.
    expect(propertyLevel(sim.world, 'helipad')).toBe(0);
  });

  it('never reports a level past its own ceiling', () => {
    /*
     * The sign sells four rungs; frontage's ladder is four levels. Buying every
     * rung must not produce a fifth level — a number with no card, no art and
     * no meaning, which is exactly what an unclamped `1 + level` would give.
     */
    const sim = stagedSim(4, 100_000);
    for (let i = 0; i < 6; i++) buyBuilt(sim.world, 'hand-painted-sign');
    expect(propertyLevel(sim.world, 'frontage')).toBe(property('frontage')?.maxLevel);
  });

  it('reports capacity and usage the world can actually be asked for', () => {
    /*
     * §39: a card showing a statistic must be showing the simulation's answer.
     * These run the world first, then compare the readout against a direct
     * count — the same figure by two routes, or the card is decoration.
     */
    const sim = stagedSim(2);
    sim.advance(600);

    const parking = propertyCapacity(sim.world, 'parking');
    expect(parking.capacity).toBe(layoutOf(sim.world).parking.length);
    expect(parking.used).toBeLessThanOrEqual(parking.capacity);
    expect(parking.unit).toBe('araç');

    let parked = 0;
    for (let slot = 0; slot < sim.world.customers.scanLimit; slot++) {
      if (!sim.world.customers.isActive(slot)) continue;
      if (sim.world.customers.at(slot).parkingSlot >= 0) parked++;
    }
    expect(parking.used).toBe(parked);

    // Frontage multiplies a probability; it has nothing to count, and says so
    // rather than reporting a zero the card would render as "0 / 0".
    expect(propertyCapacity(sim.world, 'frontage').capacity).toBe(-1);
  });
});

describe('the one owned ladder is bought like everything else', () => {
  it('charges on purchase and applies on completion, never before', () => {
    /*
     * The correction pass's rule, which this system inherits rather than
     * reimplements: money moves at the click, the effect lands when the site
     * does. A level that appeared immediately would be a second construction
     * mechanism with its own pause and speed behaviour.
     */
    const sim = stagedSim(2);
    const spec = property('parking');
    expect(spec).toBeDefined();
    if (spec === undefined) return;

    const cost = propertyCost(spec, 2) ?? 0;
    const cash = sim.world.economy.cash;
    const bays = layoutOf(sim.world).parking.length;

    expect(upgradeProperty(sim.world, 'parking')).toBe('ok');
    expect(sim.world.economy.cash).toBeCloseTo(cash - cost, 9);
    expect(sim.world.economy.lifetimeSpend).toBeCloseTo(cost, 9);

    // Paid for, under construction, and not yet delivering a single bay.
    expect(pendingPropertyLevel(sim.world, 'parking')).toBe(2);
    expect(propertyLevel(sim.world, 'parking')).toBe(1);
    expect(layoutOf(sim.world).parking).toHaveLength(bays);

    // A second order while the first is up is refused — one site per property.
    expect(upgradeProperty(sim.world, 'parking')).toBe('building');

    advancePendingBuilds(sim.world, Number.MAX_SAFE_INTEGER);
    expect(propertyLevel(sim.world, 'parking')).toBe(2);
    expect(layoutOf(sim.world).parking.length).toBeGreaterThan(bays);
  });

  it('names every refusal instead of failing quietly', () => {
    expect(upgradeProperty(stagedSim(2).world, 'helipad')).toBe('unknown');

    // Derived properties are bought through their upgrade rung. Routing them
    // here would be the second sales channel the design exists to avoid.
    expect(upgradeProperty(stagedSim(2).world, 'frontage')).toBe('not-own-ladder');

    // Stage 1's ceiling is level 2, so level 3 is stage-locked even when rich.
    const early = stagedSim(1, 100_000);
    expect(upgradeProperty(early.world, 'parking')).toBe('ok');
    advancePendingBuilds(early.world, Number.MAX_SAFE_INTEGER);
    expect(upgradeProperty(early.world, 'parking')).toBe('stage-locked');

    // Broke, at a stage that would otherwise allow it.
    const poor = stagedSim(3, 0);
    expect(upgradeProperty(poor.world, 'parking')).toBe('unaffordable');

    // And the top of the ladder, reached legitimately.
    const rich = stagedSim(4, 100_000);
    for (let i = 0; i < 6; i++) {
      if (upgradeProperty(rich.world, 'parking') !== 'ok') break;
      advancePendingBuilds(rich.world, Number.MAX_SAFE_INTEGER);
    }
    expect(propertyLevel(rich.world, 'parking')).toBe(property('parking')?.maxLevel);
    expect(upgradeProperty(rich.world, 'parking')).toBe('maxed');
  });

  it('refuses a level written past the ladder, wherever it came from', () => {
    // `applyPropertyLevel` is reached by completed sites — including sites in a
    // save written by a build this one has never seen.
    const sim = stagedSim(4);
    applyPropertyLevel(sim.world, 'parking', 99);
    expect(propertyLevel(sim.world, 'parking')).toBe(property('parking')?.maxLevel);

    // A derived property has no stored level to write, and writing one would
    // give it two sources of truth that disagree the moment an upgrade lands.
    applyPropertyLevel(sim.world, 'frontage', 4);
    expect(sim.world.progression.propertyLevels.has('frontage')).toBe(false);
  });
});

describe('the level is simulation state', () => {
  it('goes through the command path and lands at the start of a tick', () => {
    const sim = stagedSim(2);
    const cash = sim.world.economy.cash;

    sim.dispatch({ t: 'UPGRADE_PROPERTY', propertyId: 'parking' });
    expect(sim.world.economy.cash).toBe(cash); // queued, not applied
    sim.tick();
    expect(sim.world.economy.cash).toBeLessThan(cash);
    expect(pendingPropertyLevel(sim.world, 'parking')).toBe(2);
  });

  it('changes the world hash, and survives a save', () => {
    /*
     * Both halves matter. A level outside the digest would let two worlds with
     * different car parks call themselves identical; a level that does not
     * survive `snapshot`/`restore` would quietly reset on reload, and the bays
     * would vanish from a lot the player paid for.
     */
    const a = stagedSim(3);
    const b = stagedSim(3);
    expect(a.world.hash()).toBe(b.world.hash());

    expect(upgradeProperty(a.world, 'parking')).toBe('ok');
    advancePendingBuilds(a.world, Number.MAX_SAFE_INTEGER);
    expect(a.world.hash()).not.toBe(b.world.hash());

    const restored = new Sim({ seed: 7 });
    restoreWorld(restored.world, snapshotWorld(a.world));
    expect(restored.world.hash()).toBe(a.world.hash());
    expect(propertyLevel(restored.world, 'parking')).toBe(2);
  });

  it('replays to the same world through the command log', () => {
    // The determinism contract applied to the new command: same seed, same log,
    // same hash — including the tick the purchase landed on.
    const live = stagedSim(2);
    live.dispatch({ t: 'UPGRADE_PROPERTY', propertyId: 'parking' });
    live.advance(200);

    const replayed = stagedSim(2);
    replay(replayed, live.log.toArray(), live.world.tick);

    expect(replayed.world.hash()).toBe(live.world.hash());
    expect(propertyLevel(replayed.world, 'parking')).toBe(propertyLevel(live.world, 'parking'));
  });

  it('gives a stage-forced world the lot that stage was measured with', () => {
    /*
     * A world can arrive at a stage without playing there: a save from before
     * v15, a `?stage=3` debug URL, a balance run that jumps forward, a visual
     * golden. With no stored level the car park is the stage's own — the same
     * rule the v14→v15 migration applies, so there is one rule and not two.
     *
     * The alternative, defaulting to level 1, would have quietly given every
     * later stage a four-car lot that none of its balance numbers were
     * measured against, and the Stage-3 golden would have stopped depicting
     * Stage 3.
     */
    for (const stage of [1, 2, 3, 4] as const) {
      const sim = new Sim({ seed: 7 });
      sim.world.progression.stage = stage;
      expect(sim.world.progression.propertyLevels.size).toBe(0);
      expect(layoutOf(sim.world).parking, `stage ${String(stage)}`).toEqual(layoutForStage(stage).parking);
    }

    // And it is only a *fallback*: a stored level always wins, which is what
    // stops a Stage-1 player being handed the car park they have not bought.
    const fresh = new Sim({ seed: 7 });
    fresh.world.progression.stage = 3;
    applyPropertyLevel(fresh.world, 'parking', 1);
    expect(layoutOf(fresh.world).parking).toHaveLength(4);
  });

  it('clears on reset', () => {
    const sim = stagedSim(4);
    applyPropertyLevel(sim.world, 'parking', 3);
    sim.world.reset();
    expect(sim.world.progression.propertyLevels.size).toBe(0);
    expect(propertyLevel(sim.world, 'parking')).toBe(1);
  });
});

describe('a hotspot follows the thing it labels', () => {
  it('moves the car park dot when the car park changes shape', () => {
    /*
     * Anchors are derived from the layout rather than tabled per stage. The
     * 2026-08-22 pass is the record of what a second copy of a position costs:
     * the stand and its canopy were written down twice and drifted apart.
     *
     * Level 2 adds one bay to the roadside line and the dot stays where it is —
     * correctly, because the middle of the car park has not moved. Level 3
     * opens the southern block and the dot follows it there.
     */
    const sim = stagedSim(3, 100_000);
    const start = propertyAnchor(sim.world, 'parking');

    for (let i = 0; i < 2; i++) {
      expect(upgradeProperty(sim.world, 'parking')).toBe('ok');
      advancePendingBuilds(sim.world, Number.MAX_SAFE_INTEGER);
    }
    expect(propertyLevel(sim.world, 'parking')).toBe(3);

    const end = propertyAnchor(sim.world, 'parking');
    expect(end.x === start.x && end.y === start.y).toBe(false);
  });

  it('puts every anchor inside the lot at every stage', () => {
    // A dot outside the world is a click target the player can never reach,
    // and it would look identical to one that is simply somewhere unexpected.
    for (const stage of [1, 2, 3, 4] as const) {
      const sim = stagedSim(stage);
      const layout = layoutOf(sim.world);
      for (const id of PROPERTY_IDS) {
        const anchor = propertyAnchor(sim.world, id);
        const where = `${id} at stage ${String(stage)}`;
        expect(Number.isFinite(anchor.x), where).toBe(true);
        expect(Number.isFinite(anchor.y), where).toBe(true);
        expect(anchor.x, where).toBeGreaterThanOrEqual(layout.lot.minX);
        expect(anchor.y, where).toBeGreaterThanOrEqual(layout.lot.minY);
        expect(anchor.x, where).toBeLessThanOrEqual(layout.lot.maxX);
        expect(anchor.y, where).toBeLessThanOrEqual(layout.lot.maxY);
      }
    }
  });

  it('puts the car park dot on an actual bay, never between them', () => {
    /*
     * **The defect this exists for.** The anchor was the *mean* of the built
     * bays. Stage 1 authors them in two pairs at x 2.5/7.5 and 16.5/21.5, so
     * the mean is x 12 — the gap in the middle, which is the walkway to the
     * counter and, on screen, the carriageway. Found by looking at it in
     * Chromium; invisible to every assertion that existed at the time, because
     * the arithmetic was right.
     */
    for (const stage of [1, 2, 3, 4] as const) {
      for (let level = 1; level <= maxPropertyLevel(stage); level++) {
        const sim = stagedSim(stage);
        applyPropertyLevel(sim.world, 'parking', level);
        const anchor = propertyAnchor(sim.world, 'parking');
        const bays = layoutOf(sim.world).parking;
        expect(
          bays.some((bay) => bay.x === anchor.x && bay.y === anchor.y),
          `stage ${String(stage)} level ${String(level)}: (${String(anchor.x)}, ${String(anchor.y)}) is not a bay`,
        ).toBe(true);
      }
    }
  });

  it('keeps two hotspots from fighting over the same click', () => {
    /*
     * Each dot is a 44 px touch target. Two anchors a few centimetres apart
     * produce two targets stacked on one another, and the player gets whichever
     * one the DOM happens to put on top — which is the kind of thing that reads
     * as "the button does nothing sometimes".
     *
     * One metre is the bound: below TILE_W/2 in screen terms it stops being two
     * separate things to point at.
     */
    const MIN_SEPARATION_METRES = 1;
    for (const stage of [1, 2, 3, 4] as const) {
      const sim = stagedSim(stage);
      const anchors = PROPERTY_IDS.map((id) => ({ id, ...propertyAnchor(sim.world, id) }));
      for (let i = 0; i < anchors.length; i++) {
        for (let j = i + 1; j < anchors.length; j++) {
          const a = anchors[i];
          const b = anchors[j];
          if (a === undefined || b === undefined) continue;
          const gap = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
          expect(
            gap,
            `stage ${String(stage)}: ${a.id} and ${b.id} are ${gap.toFixed(2)} m apart`,
          ).toBeGreaterThanOrEqual(MIN_SEPARATION_METRES);
        }
      }
    }
  });
});
