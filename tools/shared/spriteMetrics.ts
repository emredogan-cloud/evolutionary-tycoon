import { ART_SCALE, TILE_H, TILE_W, TILE_Z } from '../../src/config/world.ts';

/**
 * How big a sprite for a world-space box has to be.
 *
 * One derivation, used by three things that must agree: the placeholder
 * generator's output sizes, the asset validator's size expectation, and the
 * `SIZE HINT` line of every generation prompt. While they were three separate
 * numbers they disagreed, and the disagreement was invisible because no real art
 * had arrived to expose it.
 *
 * **The trap this exists to close.** ASSET_PIPELINE §1.2 tabulates reference
 * heights — adult 128 px, sedan 90 px, table 50 px — and those are *world*
 * heights expressed in art pixels, i.e. `metres x TILE_Z x ART_SCALE`. A
 * sprite's actual drawn height is larger, because an isometric projection also
 * shows the object's ground footprint: the base projects to a diamond
 * `(fx + fy) * TILE_H/2` tall and the body sits on top of it.
 *
 * For a person the two are close — 112 against 144 — and the error hides inside
 * a 15% tolerance. For a 4.5 x 1.9 m car they are **90 and 301**. A validator
 * that compares a drawn sprite against the world height therefore rejects every
 * correctly drawn vehicle, and passes people by luck.
 *
 *     sprite height = ((fx + fy) * TILE_H/2  +  height * TILE_Z) * ART_SCALE
 *                      \_______footprint_______/  \____body____/
 *
 * Lives under `tools/` rather than `src/render/` because all three callers are
 * build-time tools, and because `src/**` uses path aliases that plain Node
 * cannot resolve when it runs the pipeline CLI directly.
 */

export interface WorldBox {
  /** Footprint along world X, in metres. */
  readonly footprintX: number;
  /** Footprint along world Y, in metres. */
  readonly footprintY: number;
  readonly heightMetres: number;
}

export interface SpriteMetrics {
  /** Full sprite width at production (2x) scale. */
  readonly width: number;
  /** Full sprite height at production scale, footprint diamond included. */
  readonly height: number;
  /** The ground diamond's own height — the part that is not the body. */
  readonly footprintHeight: number;
  /** The body alone. This is the quantity ASSET_PIPELINE §1.2 tabulates. */
  readonly bodyHeight: number;
  /** Footprint centre in sprite pixels from the top-left. §1.3. */
  readonly anchorX: number;
  readonly anchorY: number;
}

export function isoSpriteMetrics(box: WorldBox, scale: number = ART_SCALE): SpriteMetrics {
  const span = box.footprintX + box.footprintY;
  const footprintHeight = span * (TILE_H / 2) * scale;
  const bodyHeight = box.heightMetres * TILE_Z * scale;

  const width = Math.max(4, Math.round(span * (TILE_W / 2) * scale));
  const height = Math.max(4, Math.round(footprintHeight + bodyHeight));

  return {
    width,
    height,
    footprintHeight: Math.round(footprintHeight),
    bodyHeight: Math.round(bodyHeight),
    anchorX: Math.round(width / 2),
    // The footprint centre is the middle of the ground diamond, which sits at
    // the very bottom of the sprite. Depth sorting anchors here, so an error of
    // a few pixels is an error in every sort the sprite appears in.
    anchorY: Math.round(height - footprintHeight / 2),
  };
}

/** The §1.2 quantity for a subject: world height in art pixels, no footprint. */
export function worldHeightPx(heightMetres: number, scale: number = ART_SCALE): number {
  return Math.round(heightMetres * TILE_Z * scale);
}

/**
 * Compass order for the eight directional sprites — `src/render/views/VehicleView.ts`.
 *
 * Duplicated rather than imported for the reason the file header gives: this
 * module runs under plain Node from the pipeline CLI, which cannot resolve
 * `src/**`'s path aliases. `tests/unit/tools/spriteMetrics.test.ts` asserts the
 * two lists are identical, so the duplication cannot drift.
 */
export const SPRITE_DIRECTION_COUNT = 8;

/**
 * The sprite box for a **directional** subject, which is not the axis-aligned one.
 *
 * `isoSpriteMetrics` projects a box whose long side runs along world X. That is
 * one of eight cases, and using it for all eight is wrong by a factor of 1.7 at
 * the extremes: a 4.5 m car seen side-on is 407 x 182 px, and seen corner-on it
 * is 336 x 317. Sizing every direction to the axis-aligned 410 x 301 made the
 * side views 2.8x too many pixels — which showed up first as the vehicle atlas
 * landing at **216% of its ASSET_PIPELINE §13 budget**, and would have shown up
 * second as a car that changes size as it turns a corner.
 *
 * The derivation is the projection itself. A sprite direction is a *screen*
 * heading; `worldToScreen` maps world (x, y) to screen `(x - y, (x + y) / 2)`,
 * so inverting that map on the screen heading gives the world heading, and
 * rotating the footprint rectangle by it and projecting its corners gives the
 * box the art has to fit.
 *
 *     screen heading i  ->  world heading θ  ->  rotated footprint  ->  projected box
 *
 * The eight results are the eight sizes the validator expects and the importer
 * fits to, so a correctly drawn sprite passes at every facing rather than at the
 * two facings that happen to match the axis-aligned case.
 */
export function isoSpriteMetricsFacing(
  box: WorldBox,
  directionIndex: number,
  scale: number = ART_SCALE,
): SpriteMetrics {
  const phi = ((directionIndex % SPRITE_DIRECTION_COUNT) * Math.PI * 2) / SPRITE_DIRECTION_COUNT;
  // Screen heading, measured clockwise from north with y growing downward.
  const u = Math.sin(phi);
  const v = -Math.cos(phi);
  // Invert `(dx - dy, (dx + dy) / 2)`.
  const theta = Math.atan2(v - u / 2, u / 2 + v);

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const halfLength = box.footprintX / 2;
  const halfWidth = box.footprintY / 2;

  let minDiff = Infinity;
  let maxDiff = -Infinity;
  let minSum = Infinity;
  let maxSum = -Infinity;
  for (const alongSign of [-1, 1]) {
    for (const acrossSign of [-1, 1]) {
      const x = alongSign * halfLength * cos - acrossSign * halfWidth * sin;
      const y = alongSign * halfLength * sin + acrossSign * halfWidth * cos;
      const diff = x - y;
      const sum = x + y;
      if (diff < minDiff) minDiff = diff;
      if (diff > maxDiff) maxDiff = diff;
      if (sum < minSum) minSum = sum;
      if (sum > maxSum) maxSum = sum;
    }
  }

  const footprintHeight = (maxSum - minSum) * (TILE_H / 2) * scale;
  const bodyHeight = box.heightMetres * TILE_Z * scale;
  const width = Math.max(4, Math.round((maxDiff - minDiff) * (TILE_W / 2) * scale));
  const height = Math.max(4, Math.round(footprintHeight + bodyHeight));

  return {
    width,
    height,
    footprintHeight: Math.round(footprintHeight),
    bodyHeight: Math.round(bodyHeight),
    anchorX: Math.round(width / 2),
    anchorY: Math.round(height - footprintHeight / 2),
  };
}
