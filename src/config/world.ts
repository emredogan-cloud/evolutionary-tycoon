/**
 * World geometry and camera constants.
 *
 * Data only. These numbers bind every later phase: the traffic model works in
 * metres per second, the asset pipeline authors sprites against this tile size,
 * and every golden screenshot is taken through this camera. Changing one of them
 * later is a visual and behavioural change at once, not a tweak.
 */

/**
 * 2:1 dimetric — "classic isometric".
 *
 * A tile is twice as wide as it is tall, so the projection is exact in integers
 * and a 45-degree line advances one pixel down per two across. That is what
 * keeps pixel art crisp instead of shimmering along diagonals.
 *
 * These are 1x values. **Art is authored at 2x** and downscaled, so a diagonal
 * edge has real pixels to resolve into rather than being reconstructed from
 * nothing (ASSET_PIPELINE).
 */
export const TILE_W = 64;
export const TILE_H = 32;

/** Screen pixels per world unit of height. */
export const TILE_Z = 32;

/** Sprites are drawn at half their authored size. */
export const ART_SCALE = 2;

/*
 * One world unit is one metre — assumed by every dimension in this file and by
 * `src/config/actors.ts`.
 *
 * Not an aesthetic choice: the IDM car-following model in Phase 5 is defined in
 * metres and seconds, so a vehicle is 4.5 x 1.9 world units and no unit
 * conversion exists anywhere to get wrong. A person is 0.5 units across, a
 * table 1.2. Pedestrian navigation will resolve at half a unit (Phase 7).
 */

export const CAMERA = {
  /** TECHNICAL_ARCHITECTURE §6 / GAME_DESIGN_DOCUMENT §14.7. */
  minZoom: 0.6,
  maxZoom: 1.8,
  defaultZoom: 1,
  /** World units per second at zoom 1 for keyboard panning. */
  keyboardPanSpeed: 18,
  /** Screen pixels from the edge that trigger edge-push panning. */
  edgePushMargin: 24,
  edgePushSpeed: 12,
  /** Multiplicative zoom per wheel notch. */
  wheelZoomStep: 1.12,
} as const;

/**
 * The nine render layers, in draw order — TECHNICAL_ARCHITECTURE §6.3.
 *
 * Only `actors` is depth-sorted per frame. Everything below it is behind the
 * actor plane by construction, and everything above it is drawn on top by
 * construction, which is what keeps the per-frame sort down to the objects that
 * genuinely need one.
 */
export const RENDER_LAYERS = [
  'sky', //        parallax backdrop            — SpriteGPULayer is safe here
  'ground', //     baked lot sprites            — 2-6 large statics, never a tilemap
  'road', //       road surface and markings
  'scatter', //    static decorative scatter    — behind the actor plane
  'actors', //     ★ the only depth-sorted layer
  'overheadFx', // steam, smoke, dust
  'lighting', //   cone lights + tint quad
  'worldUi', //    speech bubbles, coins, patience rings
  'domOverlay', // Svelte, outside the canvas entirely
] as const;

export type RenderLayerName = (typeof RENDER_LAYERS)[number];

/** The one layer that is sorted every frame. */
export const DEPTH_SORTED_LAYER: RenderLayerName = 'actors';
