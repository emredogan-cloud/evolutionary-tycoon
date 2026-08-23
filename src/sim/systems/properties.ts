import { layoutFor } from '@config/layouts';
import type { StageLayout } from '@config/layouts/stage1';
import { maxPropertyLevel, property, propertyBuildMs, propertyCost, propertyVia } from '@config/properties';
import type { World } from '../core/World';
import { queueCapacityOf } from './capacity';
import { effectValue, upgradeLevel } from './UpgradeSystem';

/**
 * Property levels — the restaurant evolution system's simulation half.
 *
 * A leaf, deliberately: it imports config, the world type, and the two
 * derivations it reads levels out of. Nothing imports it back, so the
 * dependency graph stays a tree and the architecture gate stays quiet.
 *
 * The design is in `docs/RESTAURANT_EVOLUTION_ROADMAP.md` §B. In one line: a
 * property's level is **derived from ladders that already exist**, except
 * parking, which owns the one ladder the audit found missing.
 */

/** The world's layout at its current stage *and* its current parking level. */
export function layoutOf(world: World): StageLayout {
  return layoutFor(world.progression.stage, parkingLevelOf(world));
}

/** Parking's own level, defaulting to 1 on a world that never bought one. */
function parkingLevelOf(world: World): number {
  const stage = world.progression.stage;
  const stored = world.progression.propertyLevels.get('parking');
  /*
   * **No stored level means "whatever this stage always shipped with".**
   *
   * A played world always has one: reaching Stage 2 requires buying parking
   * Lv2, and the purchase writes it. The default is for the worlds that did
   * *not* play there — a save written before v15, a `?stage=3` debug URL, a
   * balance run that jumps a world forward, a visual golden.
   *
   * It is the same rule the v14→v15 migration applies, deliberately: one rule
   * rather than two, so a stage-3 world has the eight bays every stage-3
   * balance number was measured against whether it arrived by playing or by
   * being placed there. A bare `?? 1` instead would have quietly given the
   * whole game's later stages a four-car lot they were never tuned for.
   */
  const level = stored ?? Math.max(1, Math.trunc(stage));
  // Bounded by both the stage's ceiling and the ladder's own end, so this can
  // never report a level `propertyLevel` would clamp away — two answers to
  // "what level is the car park" is exactly the drift this system avoids.
  const ceiling = Math.min(maxPropertyLevel(stage), property('parking')?.maxLevel ?? 1);
  return Math.max(1, Math.min(ceiling, Math.trunc(level)));
}

/**
 * What level a property is at right now.
 *
 * Three ladders, three derivations, and every one of them reads a number the
 * simulation was already keeping:
 *
 * - **main** is the stage. There is one counter and evolution moves it.
 * - **parking** is its own stored level — the one new ladder.
 * - **kitchen** is `1 + prepStations`, the effect `KitchenSystem` already
 *   consults to decide which benches exist.
 * - **service** is `1 + queueCapacity/2`, the effect `QueueSystem` already
 *   consults; every rung that moves it is worth exactly two places.
 * - **frontage** is `1 + hand-painted-sign`, the rung whose whole job is being
 *   seen from the road.
 *
 * Clamped to the property's own ceiling, so a fully-upgraded sign cannot report
 * a fifth level that has no art, no card and no meaning.
 */
export function propertyLevel(world: World, id: string): number {
  const spec = property(id);
  if (spec === undefined) return 0;

  const raw =
    spec.ladder === 'stage'
      ? world.progression.stage
      : spec.ladder === 'own'
        ? parkingLevelOf(world)
        : derivedLevel(world, id);

  return Math.max(1, Math.min(spec.maxLevel, Math.trunc(raw)));
}

function derivedLevel(world: World, id: string): number {
  if (id === 'kitchen') return 1 + effectValue(world, 'prepStations');
  if (id === 'service') {
    // Two places per rung, floor-divided: a half-rung does not exist, and
    // rounding up would let a property claim a level nothing paid for.
    return 1 + Math.floor(effectValue(world, 'queueCapacity') / 2);
  }
  if (id === 'frontage') return 1 + upgradeLevel(world, 'hand-painted-sign');
  return 1;
}

/**
 * The capacity a property currently provides, and how much of it is in use.
 *
 * Both numbers come out of the world; neither is stored. That is the whole
 * point of the Bilgi card — "Kapasite: 4 araç · Kullanım: 3 / 4" has to be the
 * simulation's own answer or it is decoration, and §39 forbids decoration that
 * looks like a statistic.
 *
 * `capacity` of -1 means the property has no countable capacity (frontage is a
 * multiplier, not a number of things), and the card shows its effect instead.
 */
export interface PropertyCapacity {
  readonly capacity: number;
  readonly used: number;
  /** Turkish unit for the readout — "araç", "sipariş", "kişi". */
  readonly unit: string;
}

export function propertyCapacity(world: World, id: string): PropertyCapacity {
  const layout = layoutOf(world);

  if (id === 'parking') {
    let used = 0;
    for (let slot = 0; slot < world.customers.scanLimit; slot++) {
      if (!world.customers.isActive(slot)) continue;
      if (world.customers.at(slot).parkingSlot >= 0) used++;
    }
    return { capacity: layout.parking.length, used, unit: 'araç' };
  }

  if (id === 'kitchen') {
    // Benches that exist at this level, and how many are cooking right now.
    const capacity = 3 + effectValue(world, 'prepStations');
    let used = 0;
    for (let slot = 0; slot < world.orders.scanLimit; slot++) {
      if (!world.orders.isActive(slot)) continue;
      if (world.orders.at(slot).station >= 0) used++;
    }
    return { capacity, used, unit: 'istasyon' };
  }

  if (id === 'service') {
    let used = 0;
    for (let slot = 0; slot < world.customers.scanLimit; slot++) {
      if (!world.customers.isActive(slot)) continue;
      if (world.customers.at(slot).queueIndex >= 0) used++;
    }
    return { capacity: queueCapacityOf(world, layout), used, unit: 'kişi' };
  }

  if (id === 'main') {
    return { capacity: layout.registers, used: layout.registers, unit: 'kasa' };
  }

  // Frontage multiplies a probability; there is nothing to count.
  return { capacity: -1, used: 0, unit: '' };
}

export type PropertyUpgradeOutcome =
  'ok' | 'unknown' | 'maxed' | 'stage-locked' | 'unaffordable' | 'building' | 'not-own-ladder';

/**
 * Raise a property one level — what `UPGRADE_PROPERTY` means.
 *
 * Own ladders only. A derived property is raised by buying the rung
 * `propertyVia` names, through the ordinary `BUY_UPGRADE` path, so every gate
 * that path already enforces — stage, prerequisite, player level, cash —
 * applies untouched and none of it is reimplemented here. The interface routes
 * the click; the simulation never learns a second way to sell the same thing.
 *
 * Validated here rather than trusted from the command, for the reason every
 * other command is: this path is reached by replayed logs and by saves written
 * by builds this one has never seen.
 */
export function upgradeProperty(world: World, id: string): PropertyUpgradeOutcome {
  const spec = property(id);
  if (spec === undefined) return 'unknown';
  if (spec.ladder !== 'own') return 'not-own-ladder';

  if (pendingPropertyLevel(world, id) > 0) return 'building';

  const next = propertyLevel(world, id) + 1;
  if (next > spec.maxLevel) return 'maxed';
  if (next > maxPropertyLevel(world.progression.stage)) return 'stage-locked';

  const cost = propertyCost(spec, next);
  const buildMs = propertyBuildMs(spec, next);
  if (cost === undefined || buildMs === undefined) return 'maxed';
  if (world.economy.cash < cost) return 'unaffordable';

  world.economy.cash -= cost;
  world.economy.lifetimeSpend += cost;
  /*
   * The same construction record a machine uses, and deliberately so: there is
   * one construction mechanism in this game and a second one would be a second
   * set of pause, speed-multiplier and reload behaviours to keep in step. The
   * level lands in `advancePendingBuilds` when the site completes, which is
   * what makes "no effect before the thing that produces it" structural.
   */
  world.layout.pendingBuilds.push({
    upgradeId: '',
    objectId: '',
    propertyId: spec.id,
    x: 0,
    y: 0,
    remainingMs: buildMs,
    totalMs: buildMs,
    targetLevel: next,
  });
  world.layout.revision++;
  return 'ok';
}

/** The level a site is building this property toward, or 0. */
export function pendingPropertyLevel(world: World, id: string): number {
  for (const build of world.layout.pendingBuilds) {
    if (build.propertyId === id) return build.targetLevel ?? 0;
  }
  return 0;
}

/**
 * Write a completed property level. Called only from `advancePendingBuilds`.
 *
 * The bay count changes, so every navigation field built against the old car
 * park is stale — the same reason a stage transition bumps the revision.
 */
export function applyPropertyLevel(world: World, id: string, level: number): void {
  const spec = property(id);
  if (spec?.ladder !== 'own') return;
  world.progression.propertyLevels.set(id, Math.max(1, Math.min(spec.maxLevel, level)));
  world.layout.revision++;
}

export { maxPropertyLevel, propertyBuildMs, propertyCost, propertyVia };

/**
 * Where a property's hotspot sits in the world.
 *
 * **Derived from the layout, never a table.** A per-stage anchor list would be
 * twenty coordinates that have to be re-checked every time a layout moves, and
 * the 2026-08-22 pass is a record of what happens when a position is written
 * down twice. These follow the thing they label, so they move when it does.
 *
 * ## Every anchor is a real position, never an average of real positions
 *
 * The first version put the car park's dot at the **mean** of its bays. In
 * Chromium that dot rendered on the carriageway: the four Stage-1 bays sit in
 * two pairs at x 2.5/7.5 and 16.5/21.5, so their mean is x 12 — the gap between
 * them, which is the walkway to the counter. A mean of a split distribution
 * lands where nothing is, and the arithmetic looks correct the whole time.
 *
 * So a hotspot is now always *a thing*: the bay nearest the middle, the queue
 * slot in the middle, the grill if one is drawn. `propertyLevels.test.ts` holds
 * the two properties that were violated — parking's anchor is one of the live
 * bays, and no two anchors are close enough to fight for the same click.
 */
export function propertyAnchor(world: World, id: string): { x: number; y: number } {
  const layout = layoutOf(world);

  if (id === 'parking') {
    /*
     * The bay closest to the middle of the ones that are built — an actual bay,
     * so the dot is always on tarmac, and it still moves when a level opens
     * bays in a new part of the lot.
     */
    let midX = 0;
    let midY = 0;
    for (const bay of layout.parking) {
      midX += bay.x;
      midY += bay.y;
    }
    const count = Math.max(1, layout.parking.length);
    midX /= count;
    midY /= count;

    let best = layout.parking[0] ?? { x: layout.counter.x, y: layout.counter.y };
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const bay of layout.parking) {
      // Squared distance; the ordering is the same and there is no sqrt to
      // round differently on another engine (ADR-018's rule about math
      // built-ins applies to anything a hash can reach, and this can).
      const dx = bay.x - midX;
      const dy = bay.y - midY;
      const distance = dx * dx + dy * dy;
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      best = bay;
    }
    return { x: best.x, y: best.y };
  }

  if (id === 'kitchen') {
    // The bench a player watches, when one is drawn. Stage 1 has no kitchen on
    // the lot at all (LEVEL1_WORLD_INVENTORY §A.5), so it falls back to the
    // space behind the counter — which is where the cooking actually happens.
    for (const object of layout.statics) {
      if (object.objectId === 'grill-lv1' || object.objectId === 'grill-lv2') {
        return { x: object.x, y: object.y };
      }
    }
    return { x: layout.counter.x, y: layout.counter.y + 1.2 };
  }

  if (id === 'service') {
    /*
     * The middle of the queue as it stands *now*, not its end. The end is
     * nearly at the kerb — the Stage-1 queue runs from the counter toward the
     * road — so an end anchor put the service dot on the carriageway beside the
     * car park's. The middle is unambiguously the waiting area, and it still
     * moves outward as capacity grows.
     */
    const capacity = Math.max(1, Math.min(layout.queue.length, queueCapacityOf(world, layout)));
    const slot = layout.queue[Math.floor((capacity - 1) / 2)];
    return slot === undefined ? { x: layout.counter.x, y: layout.counter.y - 1 } : { x: slot.x, y: slot.y };
  }

  if (id === 'frontage') {
    for (const object of layout.statics) {
      if (object.objectId === 'sign') return { x: object.x, y: object.y };
    }
    return { x: layout.counter.x - 2.5, y: layout.counter.y + 0.5 };
  }

  // The main building is the counter, at every stage, by design: the counter
  // point is the one thing evolution never moves.
  return { x: layout.counter.x, y: layout.counter.y };
}
