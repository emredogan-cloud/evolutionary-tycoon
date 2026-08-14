import { TILE_H, TILE_W, TILE_Z } from '@config/world';

/**
 * 2:1 dimetric projection — world metres to screen pixels and back.
 *
 * ```
 * screenX = (worldX - worldY) * TILE_W / 2
 * screenY = (worldX + worldY) * TILE_H / 2 - worldZ * TILE_Z
 * ```
 *
 * Both directions are exact linear algebra, not an approximation: the inverse
 * recovers the input to within floating-point noise (the round-trip test uses
 * 1e-9 across 10 000 random points). That matters because a click has to land on
 * the tile the player aimed at, and a half-tile drift at the edge of a zoomed-out
 * lot is the kind of bug that gets diagnosed as "the hit boxes feel wrong".
 *
 * The inverse needs an assumed height. Screen space has two dimensions and the
 * world has three, so a single screen point corresponds to a *line* through the
 * world; picking `assumedZ` chooses where along it to land. Ground picking passes 0.
 */

const HALF_W = TILE_W / 2;
const HALF_H = TILE_H / 2;

export interface Point2 {
  x: number;
  y: number;
}

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Every function writes into a caller-supplied target.
 *
 * The render bridge calls these once per visible actor per frame; returning a
 * fresh object each time would put the render path on the allocator, which is
 * the one thing the frame budget cannot absorb.
 */
export function worldToScreen(worldX: number, worldY: number, worldZ: number, out: Point2): Point2 {
  out.x = (worldX - worldY) * HALF_W;
  out.y = (worldX + worldY) * HALF_H - worldZ * TILE_Z;
  return out;
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  assumedZ: number,
  out: WorldPoint,
): WorldPoint {
  // Undo the height offset first, then invert the 2x2 system.
  const flattenedY = screenY + assumedZ * TILE_Z;
  const dx = screenX / HALF_W; // worldX - worldY
  const sy = flattenedY / HALF_H; // worldX + worldY

  out.x = (sy + dx) / 2;
  out.y = (sy - dx) / 2;
  out.z = assumedZ;
  return out;
}

/**
 * Screen height of one world unit of elevation.
 *
 * Used by the asset validator's split rule and by anything that needs to know
 * how tall "one metre" is on screen.
 */
export function screenHeightOfWorldZ(worldZ: number): number {
  return worldZ * TILE_Z;
}

/**
 * The screen-space bounding box of an axis-aligned world rectangle at z = 0.
 *
 * The camera uses this to clamp its bounds to the lot: the four corners of a
 * world rectangle project to a diamond, and the diamond's extent is what the
 * player may actually pan over.
 */
export function worldRectToScreenBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  out: { left: number; top: number; right: number; bottom: number },
): { left: number; top: number; right: number; bottom: number } {
  // Extremes of (x - y) and (x + y) over the rectangle, which is all the
  // projection depends on. Cheaper and exact compared to projecting corners.
  const minDiff = minX - maxY;
  const maxDiff = maxX - minY;
  const minSum = minX + minY;
  const maxSum = maxX + maxY;

  out.left = minDiff * HALF_W;
  out.right = maxDiff * HALF_W;
  out.top = minSum * HALF_H;
  out.bottom = maxSum * HALF_H;
  return out;
}
