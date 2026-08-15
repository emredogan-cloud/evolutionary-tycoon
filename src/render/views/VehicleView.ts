/**
 * How a vehicle is drawn: which of eight sprites, and what the body is doing.
 *
 * Deliberately pure. Everything here is arithmetic on numbers the simulation
 * already computed, which means the direction table and the suspension model can
 * be unit-tested in Node without a WebGL context — the same reasoning that keeps
 * the projection and the depth sorter testable.
 *
 * **No production vehicle art exists yet.** The asset pipeline is built and its
 * 172 prompts are written, but nothing has been generated (PHASE_4_REPORT §11),
 * so `spriteKeyFor` returns the key the real art *will* have and the caller falls
 * back to the registered placeholder when that texture is absent. The selection
 * logic is correct now and will not need revisiting when the art lands.
 */

/**
 * Compass names in the order ASSET_PIPELINE §3 fixes for filenames.
 *
 * Index 0 is north and the sequence runs clockwise, which is the order the
 * screen-space angle below maps onto.
 */
export const SPRITE_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type SpriteDirection = (typeof SPRITE_DIRECTIONS)[number];

/** Eight sprites, so 45 degrees each. ASSET_PIPELINE §3. */
export const DIRECTION_COUNT = SPRITE_DIRECTIONS.length;

/**
 * Pick one of eight sprites for a world-space heading.
 *
 * The heading arrives in **world** space and the sprites are authored in
 * **screen** space, so the projection has to be applied before the angle means
 * anything. In 2:1 dimetric the world X axis runs down-right on screen and world
 * Y runs down-left, which is exactly what `worldToScreen` encodes — so the
 * screen-space direction of a world vector (dx, dy) is (dx - dy, (dx + dy) / 2).
 *
 * Skipping that conversion is the classic isometric bug: a car driving east in
 * world space would be drawn facing east on screen, when it should face
 * south-east. It looks almost right, which is why it survives review.
 */
export function directionIndexFor(headingX: number, headingY: number): number {
  if (headingX === 0 && headingY === 0) return 0;

  const screenX = headingX - headingY;
  // Halved, because one world unit of Y is half a unit of screen height.
  const screenY = (headingX + headingY) / 2;

  // atan2(x, -y) rather than atan2(y, x): measuring clockwise from north is what
  // makes index 0 north and the sequence run n, ne, e, ...
  let angle = Math.atan2(screenX, -screenY);
  if (angle < 0) angle += Math.PI * 2;

  const sector = (Math.PI * 2) / DIRECTION_COUNT;
  // Round rather than floor, so each sprite covers the 45 degrees *centred* on
  // its own direction instead of the 45 degrees after it.
  return Math.round(angle / sector) % DIRECTION_COUNT;
}

export function directionFor(headingX: number, headingY: number): SpriteDirection {
  return SPRITE_DIRECTIONS[directionIndexFor(headingX, headingY)] ?? 'n';
}

/**
 * The texture key the production art will use — ASSET_PIPELINE §3.
 *
 *   veh_<archetype>_<variant>_<direction>[_brake]@2x
 *
 * Paint colour is a runtime tint rather than a sprite variant, so `variant` is
 * always `default` (see `docs/assets/productionBatches.json`).
 */
export function spriteKeyFor(textureStem: string, direction: SpriteDirection, braking: boolean): string {
  return `${textureStem}_default_${direction}${braking ? '_brake' : ''}@2x`;
}

/**
 * Vertical bob and pitch, in screen pixels and radians.
 *
 * Two effects, both procedural, both cheap, and both there for the same reason:
 * a vehicle whose sprite never moves relative to its own position reads as a
 * decal sliding across the ground rather than as a car.
 *
 * The bob is a sine driven by **distance travelled**, not by elapsed time. A
 * time-driven bob keeps bouncing when the car is stopped at a queue, which is
 * exactly when a player is looking at it.
 *
 * The nose dip is proportional to deceleration and clamped, so hard braking
 * pitches the body forward and easing off does almost nothing.
 */
export interface VehicleBodyMotion {
  /** Screen-space vertical offset, pixels. Negative is up. */
  bobY: number;
  /** Body pitch in radians; positive dips the nose. */
  pitch: number;
}

export const BOB_AMPLITUDE_PX = 0.9;
/** One full bob per this many metres travelled. */
const BOB_WAVELENGTH_METRES = 3.2;
export const MAX_PITCH_RADIANS = 0.045;

export function vehicleBodyMotion(
  distanceTravelled: number,
  accel: number,
  out: VehicleBodyMotion,
): VehicleBodyMotion {
  const phase = (distanceTravelled / BOB_WAVELENGTH_METRES) * Math.PI * 2;
  out.bobY = -Math.abs(Math.sin(phase)) * BOB_AMPLITUDE_PX;

  // Only deceleration pitches the nose down; acceleration would squat the rear,
  // which is a different effect and not worth the extra state at this size.
  const braking = accel < 0 ? -accel : 0;
  const pitch = (braking / 8) * MAX_PITCH_RADIANS;
  out.pitch = pitch > MAX_PITCH_RADIANS ? MAX_PITCH_RADIANS : pitch;
  return out;
}

/**
 * Smooth a heading towards a target, framerate-independently.
 *
 * Vehicles on a straight lane never turn, so this does nothing in Stage 1 — it
 * exists because the Stage 4 left turn will swing a heading through 90 degrees
 * in under a second, and snapping between sprite directions mid-turn is the kind
 * of thing that is much easier to build in now than to retrofit.
 *
 * `rate` is the fraction of the remaining angle closed per second.
 */
export function blendHeading(current: number, target: number, rate: number, deltaSeconds: number): number {
  let difference = target - current;
  // Take the short way round the circle, or a turn from 350° to 10° spins the
  // long way and the sprite flips through every direction.
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;

  const t = 1 - Math.exp(-rate * deltaSeconds);
  return current + difference * t;
}
