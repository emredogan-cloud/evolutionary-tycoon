import { ACTOR_KIND_SPECS, ACTOR_KIND_VEHICLE, actorKindSpec } from '@config/actors';
import type { StageLayout } from '@config/layouts/stage1';
import type { PlacedObject } from '../core/types';

/**
 * The walkable grid — GAME_DESIGN_DOCUMENT §10, layer 3.
 *
 * 0.5 m cells over the lot, derived from the layout and from whatever the player
 * has placed. Pedestrians navigate this; vehicles never touch it, because a car
 * on a lane spline is solving a completely different problem (RESEARCH_NOTES §8).
 *
 * ## Why a uniform grid and not a navmesh
 *
 * The map is one small lot and it never grows. A navmesh would be a mesh
 * generator, a mesh format, and a second thing to keep in step with the layout,
 * in exchange for an efficiency that matters when a map is large — and this one
 * is 48 by 36 cells. RESEARCH_NOTES §8 rejects it on exactly those grounds.
 *
 * ## Blocked, and the road
 *
 * The road is **not** walkable. That is a design decision rather than a physical
 * one: pedestrians crossing traffic would be the most interesting thing on
 * screen and it is not a mechanic this game has, so the grid simply refuses it
 * and the flow field routes around. The one exception is the queue, which is
 * authored to spill towards the road on purpose — those cells are forced
 * walkable so an overflowing queue can stand where the player can see it.
 */

/** Cell size in metres — RESEARCH_NOTES §8. */
export const CELL_SIZE_METRES = 0.5;

/** Cell states. Kept as a Uint8Array, so these are the only two values. */
export const CELL_FREE = 0;
export const CELL_BLOCKED = 1;

export class NavGrid {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  /** Row-major, `width * height` entries. */
  readonly cells: Uint8Array;

  private readonly layout: StageLayout;

  constructor(layout: StageLayout) {
    this.layout = layout;
    const lot = layout.lot;

    this.originX = lot.minX;
    this.originY = lot.minY;
    this.width = Math.ceil((lot.maxX - lot.minX) / CELL_SIZE_METRES);
    this.height = Math.ceil((lot.maxY - lot.minY) / CELL_SIZE_METRES);
    this.cells = new Uint8Array(this.width * this.height);

    this.rebuild([]);
  }

  get cellCount(): number {
    return this.width * this.height;
  }

  index(cx: number, cy: number): number {
    return cy * this.width + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  isBlocked(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    return this.cells[this.index(cx, cy)] === CELL_BLOCKED;
  }

  /** Cell containing a world point. Clamped, so a stray position still resolves. */
  cellXAt(worldX: number): number {
    const cx = Math.floor((worldX - this.originX) / CELL_SIZE_METRES);
    return Math.min(this.width - 1, Math.max(0, cx));
  }

  cellYAt(worldY: number): number {
    const cy = Math.floor((worldY - this.originY) / CELL_SIZE_METRES);
    return Math.min(this.height - 1, Math.max(0, cy));
  }

  /** Centre of a cell in world metres — where an agent standing in it stands. */
  centreX(cx: number): number {
    return this.originX + (cx + 0.5) * CELL_SIZE_METRES;
  }

  centreY(cy: number): number {
    return this.originY + (cy + 0.5) * CELL_SIZE_METRES;
  }

  /**
   * Recompute every cell from the layout and the placed objects.
   *
   * **The one entry point.** Phase 7's risk table names a missed invalidation as
   * a medium-likelihood failure, and the mitigation is that there is nowhere
   * else to write to `cells` from — a caller cannot forget to rebuild a part of
   * the grid, because partial rebuilds do not exist.
   */
  rebuild(placed: readonly PlacedObject[]): void {
    this.cells.fill(CELL_FREE);

    this.blockRoad();
    for (const object of this.layout.statics) {
      this.blockFootprint(object.objectId, object.x, object.y);
    }
    for (const object of placed) {
      this.blockFootprint(object.objectId, object.x, object.y);
    }
    this.blockParking();
    this.openQueue();
  }

  /**
   * The road, plus a margin either side.
   *
   * The margin is half a cell short of the lane geometry on purpose: a
   * pedestrian standing exactly on the kerb is standing where a wing mirror is.
   */
  private blockRoad(): void {
    const { lanes, widthMetres } = this.layout.road;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const lane of lanes) {
      for (const point of lane.points) {
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
    if (!Number.isFinite(minY)) return;

    // Centred on the lanes and widened to the authored carriageway.
    const centre = (minY + maxY) / 2;
    const half = widthMetres / 2;
    this.blockRect(this.layout.lot.minX, centre - half, this.layout.lot.maxX, centre + half);
  }

  /** Bays are blocked: a parked car is an obstacle to walk around. */
  private blockParking(): void {
    for (const bay of this.layout.parking) {
      const spec = actorKindSpec(ACTOR_KIND_VEHICLE);
      this.blockRect(
        bay.x - spec.footprintX / 2,
        bay.y - spec.footprintY / 2,
        bay.x + spec.footprintX / 2,
        bay.y + spec.footprintY / 2,
      );
    }
  }

  /**
   * Force every authored queue position walkable.
   *
   * The last queue slots are deliberately on the road — that is the whole
   * spillover mechanic (ECONOMY_DESIGN §7, Fren 4). Without this they would be
   * blocked by `blockRoad` and nobody could ever stand in them, which would
   * remove the economy's only negative feedback loop by way of a grid detail.
   */
  private openQueue(): void {
    for (const slot of this.layout.queue) {
      const cx = this.cellXAt(slot.x);
      const cy = this.cellYAt(slot.y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!this.inBounds(cx + dx, cy + dy)) continue;
          this.cells[this.index(cx + dx, cy + dy)] = CELL_FREE;
        }
      }
    }
  }

  private blockFootprint(objectId: string, x: number, y: number): void {
    const spec = specForObject(objectId);
    if (spec === null) return;
    this.blockRect(
      x - spec.footprintX / 2,
      y - spec.footprintY / 2,
      x + spec.footprintX / 2,
      y + spec.footprintY / 2,
    );
  }

  /** Every cell whose centre falls inside the rectangle. */
  private blockRect(minX: number, minY: number, maxX: number, maxY: number): void {
    const fromX = this.cellXAt(minX);
    const toX = this.cellXAt(maxX);
    const fromY = this.cellYAt(minY);
    const toY = this.cellYAt(maxY);

    for (let cy = fromY; cy <= toY; cy++) {
      for (let cx = fromX; cx <= toX; cx++) {
        if (!this.inBounds(cx, cy)) continue;
        this.cells[this.index(cx, cy)] = CELL_BLOCKED;
      }
    }
  }
}

/**
 * Footprint for a placed object, by its render-catalogue texture key.
 *
 * Returns null for a key the catalogue does not know, rather than throwing: a
 * save written by a build with an object this one has dropped must load, and it
 * should load as a gap in the scenery rather than as a crash.
 */
function specForObject(objectId: string): { footprintX: number; footprintY: number } | null {
  for (const spec of ACTOR_KIND_SPECS) {
    if (spec.textureKey === objectId) {
      return { footprintX: spec.footprintX, footprintY: spec.footprintY };
    }
  }
  return null;
}
