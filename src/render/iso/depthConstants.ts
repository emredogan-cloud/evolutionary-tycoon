/**
 * Depth-sorting tuning — TECHNICAL_ARCHITECTURE §6.2, RESEARCH_NOTES §11.
 *
 * ```
 * depth = (worldX + worldY) * DEPTH_SCALE + worldZ * Z_WEIGHT + stableTieBreak(entityId)
 * ```
 *
 * The three terms are deliberately separated by orders of magnitude so that a
 * lower-priority term can never outvote a higher one:
 *
 * - one world unit further down the screen outranks any height difference;
 * - any height difference outranks the tie-break;
 * - the tie-break only ever decides between objects that are otherwise identical.
 *
 * A single blended value rather than a comparator chain because the sort key is
 * a number: `Array.prototype.sort` on numbers has no allocation and no branch
 * misprediction from calling back into user code per comparison.
 */

/** Screen-depth weight of a world unit along the isometric axis. */
export const DEPTH_SCALE = 1000;

/**
 * Height weight.
 *
 * Positive, so a raised object draws in front of one at the same footprint —
 * a plate on a table, a sign on a post. Two orders of magnitude below
 * DEPTH_SCALE, so a 1 m rise never jumps an object past something genuinely
 * closer to the camera.
 */
export const Z_WEIGHT = 10;

/**
 * Stable tie-break for objects at the same footprint and height.
 *
 * Without it, two identical objects at the same spot swap order between frames
 * as the sort's stability changes with unrelated insertions, and the result is
 * a visible flicker. Derived from the entity id, so the same pair always
 * resolves the same way — and, because entity ids are never reused, the same
 * way across a reload too.
 *
 * The period bounds the contribution to below one Z_WEIGHT step. Two entities
 * exactly TIE_BREAK_PERIOD ids apart collide, which needs 4096 spawns between
 * them while both stay alive; entity capacity is in the low hundreds, so it
 * cannot happen in practice, and if it did the order would still be
 * deterministic rather than flickering.
 */
export const TIE_BREAK_PERIOD = 4096;

/**
 * The smallest height difference that is allowed to mean something.
 *
 * The tie-break must stay below *this* scaled by Z_WEIGHT, not below one whole
 * Z_WEIGHT unit. Bounding it by a full unit looks right and is wrong: a 0.5 m
 * step contributes 5, while a tie-break bounded at 10 could reach 9.99 and
 * outrank it — putting a customer standing on the ground in front of one
 * standing on a counter, purely because of their entity ids.
 *
 * Five centimetres is well below any real placement in this game (a counter is
 * 0.9 m, a shelf 1.8 m) and still leaves the tie-break four thousand distinct
 * values to work with.
 */
export const MIN_MEANINGFUL_HEIGHT_METRES = 0.05;

const TIE_BREAK_STEP = (Z_WEIGHT * MIN_MEANINGFUL_HEIGHT_METRES) / TIE_BREAK_PERIOD;

export function stableTieBreak(entityId: number): number {
  // Wrapped into the positive range: static world objects carry negative ids so
  // they can never collide with a simulation entity, and a raw remainder would
  // give them a negative offset — nudging a counter behind an actor standing on
  // exactly the same spot.
  const wrapped = ((entityId % TIE_BREAK_PERIOD) + TIE_BREAK_PERIOD) % TIE_BREAK_PERIOD;
  return wrapped * TIE_BREAK_STEP;
}
