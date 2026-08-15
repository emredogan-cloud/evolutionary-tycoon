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
