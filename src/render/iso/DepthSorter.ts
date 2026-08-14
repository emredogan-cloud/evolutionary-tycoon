import { DEPTH_SCALE, stableTieBreak, Z_WEIGHT } from './depthConstants';

/**
 * Painter's algorithm over a single blended depth key.
 *
 * **Topological sorting is deliberately not used.** It is the textbook answer
 * for isometric occlusion and it is the wrong one here: worst case O(n²), it
 * needs cycle detection, and cycles must then be resolved by splitting sprites
 * at runtime. We get the same correctness for free from an *authoring* rule —
 * anything taller than 160 px at 2x is split into `_lower`/`_upper` parts, and
 * the asset validator fails the build otherwise (ASSET_PIPELINE, RESEARCH_NOTES
 * §11). Real cycles therefore cannot form, and an O(n log n) sort is exact.
 *
 * Objects anchor at their **footprint centre**, not their visual centre. A tree
 * is tall and its sprite's middle is somewhere in the canopy; what decides
 * whether a person walks in front of it or behind it is where its trunk meets
 * the ground.
 */

export interface DepthSortable {
  readonly entityId: number;
  /** Footprint centre, in world units. */
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  /** Written by `assignDepths`; read by the renderer. */
  depth: number;
}

export function computeDepth(worldX: number, worldY: number, worldZ: number, entityId: number): number {
  return (worldX + worldY) * DEPTH_SCALE + worldZ * Z_WEIGHT + stableTieBreak(entityId);
}

/** Refresh every entry's depth from its current footprint. */
export function assignDepths(items: readonly DepthSortable[], count: number): void {
  for (let i = 0; i < count; i++) {
    const item = items[i];
    if (item === undefined) continue;
    item.depth = computeDepth(item.worldX, item.worldY, item.worldZ, item.entityId);
  }
}

function byDepth(a: DepthSortable, b: DepthSortable): number {
  return a.depth - b.depth;
}

/**
 * Sort back-to-front, in place.
 *
 * In place because the array is the renderer's own reusable buffer: allocating a
 * sorted copy every frame is exactly the per-frame allocation the budget
 * forbids. The comparator is a module-level function rather than a closure for
 * the same reason.
 */
export function sortByDepth(items: DepthSortable[]): void {
  items.sort(byDepth);
}

/**
 * Assign and sort in one pass, for the common case.
 *
 * Returns the number of items sorted, so a caller working out of a larger pooled
 * array knows how much of it is live.
 */
export function assignAndSort(items: DepthSortable[]): number {
  assignDepths(items, items.length);
  sortByDepth(items);
  return items.length;
}
