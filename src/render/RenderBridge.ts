import type { SimView } from '@sim/core/types';
import { ActorViewPool } from './ActorView';
import type { ActorView } from './ActorView';
import { assignDepths, sortByDepth } from './iso/DepthSorter';
import { worldToScreen } from './iso/IsoProjection';
import type { Point2 } from './iso/IsoProjection';

/**
 * The one-way road from simulation to screen.
 *
 * The bridge **reads** a readonly view and writes nothing back. That is not a
 * convention: `SimView` is readonly all the way down, `dependency-cruiser`
 * forbids `src/render` from reaching into anything but the simulation's public
 * surface, and a test freezes the view object and runs a hundred ticks through
 * it. The only way into the simulation is a `Command`.
 *
 * ## Interpolation
 *
 * The simulation ticks at 20 Hz; the display runs at 60 Hz or more. Drawing the
 * last tick's positions verbatim produces visible stepping, so the bridge holds
 * each actor's previous position and blends toward the current one by the
 * loop's `alpha`.
 *
 * The previous positions live *here*, not in the simulation. They are a
 * presentation concern — nothing about the game's outcome depends on where a
 * customer appeared to be a fiftieth of a second ago — and putting them in the
 * world would add state that has to be hashed, saved and migrated for no reason.
 */

/**
 * Two snapshots per actor: where it was at the last tick, and where it is now.
 *
 * One snapshot is not enough, and getting that wrong is subtle. If "previous" is
 * refreshed on the first frame of a tick, every *later* frame in that tick
 * blends from the position it has already reached — the blend collapses to
 * nothing and movement goes back to stepping at 20 Hz, which reads as "the
 * interpolation does not work at high frame rates" rather than as a bug in the
 * bookkeeping.
 */
interface TrackedPosition {
  prevX: number;
  prevY: number;
  prevZ: number;
  curX: number;
  curY: number;
  curZ: number;
  /** The tick `cur` was observed at, so a departed actor can be dropped. */
  tick: number;
  /** Metres travelled since first seen. Drives the suspension bob. */
  travelled: number;
}

/** A never-moving world object, sorted alongside actors. */
export interface StaticItem {
  readonly entityId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly kind: number;
  /** Which one of this kind — for a static, an index into `WORLD_OBJECTS`. */
  readonly variant: number;
}

export class RenderBridge {
  readonly pool: ActorViewPool;

  /**
   * Static world objects.
   *
   * They go through the *same* sorted set as moving actors rather than sitting
   * in a layer of their own, because the whole question a player asks of a
   * counter or a sign post is whether a customer walks in front of it or behind
   * it. Splitting statics into their own layer answers that question once,
   * globally, and always wrongly for half the lot.
   */
  private statics: readonly StaticItem[] = [];

  /** entityId → the pair of positions to blend between. */
  private readonly tracked = new Map<number, TrackedPosition>();
  private lastSyncedTick = -1;

  /** Scratch, reused every projection. */
  private readonly screenScratch: Point2 = { x: 0, y: 0 };

  constructor(capacity: number) {
    this.pool = new ActorViewPool(capacity);
  }

  get visible(): readonly ActorView[] {
    return this.pool.visible;
  }

  setStatics(items: readonly StaticItem[]): void {
    this.statics = items;
  }

  /**
   * Rebuild the visible set for this frame.
   *
   * `alpha` is the fraction of a tick elapsed since the last simulation step,
   * from `GameLoop.interpolationAlpha`.
   */
  sync(view: SimView, alpha: number): void {
    const advanced = view.tick !== this.lastSyncedTick;
    const blend = Math.min(1, Math.max(0, alpha));

    // Advance the snapshots *before* reading them, so every frame within this
    // tick blends across the same pair.
    if (advanced) {
      this.advanceSnapshots(view);
      this.lastSyncedTick = view.tick;
    }

    this.pool.beginFrame();

    // Indexed rather than for-of: this runs every frame and `for-of` allocates
    // an array iterator each pass (WORKING_DISCIPLINE §2.3).
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.statics.length; i++) {
      const item = this.statics[i];
      if (item === undefined) continue;
      const target = this.pool.lease();
      if (target === null) break;
      target.entityId = item.entityId;
      target.kind = item.kind;
      target.variant = item.variant;
      target.headingX = 1;
      target.headingY = 0;
      target.braking = false;
      target.travelled = 0;
      target.patience = 0;
      target.moving = false;
      target.activity = 0;
      target.worldX = item.x;
      target.worldY = item.y;
      target.worldZ = item.z;
      const screen = worldToScreen(item.x, item.y, item.z, this.screenScratch);
      target.screenX = screen.x;
      target.screenY = screen.y;
    }

    for (let i = 0; i < view.actorCount; i++) {
      const actor = view.actors[i];
      if (actor === undefined) break;

      const target = this.pool.lease();
      if (target === null) break;

      const tracked = this.tracked.get(actor.entityId);

      // A newly spawned actor has no earlier position. Blending from a default
      // would slide it in from the origin; it simply appears where it is.
      if (tracked === undefined) {
        target.worldX = actor.x;
        target.worldY = actor.y;
        target.worldZ = actor.z;
      } else {
        target.worldX = tracked.prevX + (tracked.curX - tracked.prevX) * blend;
        target.worldY = tracked.prevY + (tracked.curY - tracked.prevY) * blend;
        target.worldZ = tracked.prevZ + (tracked.curZ - tracked.prevZ) * blend;
      }

      target.entityId = actor.entityId;
      target.kind = actor.kind;
      target.variant = actor.variant;
      target.headingX = actor.headingX;
      target.headingY = actor.headingY;
      target.braking = actor.braking;
      target.patience = actor.patience;
      target.moving = actor.moving;
      target.activity = actor.activity;
      // Accumulated from the interpolated position, so the bob advances smoothly
      // between ticks instead of stepping 20 times a second.
      target.travelled = tracked?.travelled ?? 0;

      const screen = worldToScreen(target.worldX, target.worldY, target.worldZ, this.screenScratch);
      target.screenX = screen.x;
      target.screenY = screen.y;
    }

    assignDepths(this.pool.visible, this.pool.visible.length);
    sortByDepth(this.pool.visible);
  }

  /** Shift current to previous, then record the new current. Once per tick. */
  private advanceSnapshots(view: SimView): void {
    for (let i = 0; i < view.actorCount; i++) {
      const actor = view.actors[i];
      if (actor === undefined) break;
      const existing = this.tracked.get(actor.entityId);
      if (existing === undefined) {
        this.tracked.set(actor.entityId, {
          travelled: 0,
          prevX: actor.x,
          prevY: actor.y,
          prevZ: actor.z,
          curX: actor.x,
          curY: actor.y,
          curZ: actor.z,
          tick: view.tick,
        });
      } else {
        existing.prevX = existing.curX;
        existing.prevY = existing.curY;
        existing.prevZ = existing.curZ;
        existing.curX = actor.x;
        existing.curY = actor.y;
        existing.curZ = actor.z;
        existing.tick = view.tick;
        existing.travelled += Math.hypot(existing.curX - existing.prevX, existing.curY - existing.prevY);
      }
    }
    this.forgetDeparted(view.tick);
  }

  /**
   * Drop entries for actors that no longer exist.
   *
   * Entity ids are never reused, so a stale entry can never be mistaken for a
   * live one — but without this the map grows for the whole session, which over
   * a long game is a leak rather than a bug that ever announces itself.
   */
  private forgetDeparted(currentTick: number): void {
    for (const [entityId, position] of this.tracked) {
      if (position.tick !== currentTick) this.tracked.delete(entityId);
    }
  }

  /** Diagnostic: how many actors the bridge is remembering positions for. */
  get trackedCount(): number {
    return this.tracked.size;
  }

  reset(): void {
    this.tracked.clear();
    this.lastSyncedTick = -1;
    this.pool.beginFrame();
  }
}
