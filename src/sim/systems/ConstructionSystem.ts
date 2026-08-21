import type { World } from '../core/World';

/**
 * The building growing, as a number between 0 and 1 — Phase 11.
 *
 * Free functions rather than a pipeline system, for the reason the kitchen's and
 * the upgrades' are: there is no nineteenth slot in `SYSTEM_ORDER` and adding
 * one is architecture (WORKING_DISCIPLINE §6). The *time* is advanced by
 * `ProgressionSystem`, which owns evolution; what lives here is the question
 * everything else asks — "how far along is it?"
 *
 * The renderer reads `constructionProgress` to drive the stencil mask, the
 * overlay reads it to draw a bar, and both get the same number from the same
 * place. A renderer that interpolated its own progress from a start timestamp
 * would drift from the simulation the first time the game was paused.
 */

/** True while the building is physically growing. */
export function isConstructing(world: World): boolean {
  return world.construction.targetStage !== 0;
}

/**
 * How far along, 0..1. Zero when nothing is being built.
 *
 * Clamped at both ends: `elapsedMs` can exceed `totalMs` by up to one tick
 * before `ProgressionSystem` finishes the job, and a mask that briefly scaled
 * past 1 would pop.
 */
export function constructionProgress(world: World): number {
  const construction = world.construction;
  if (construction.targetStage === 0 || construction.totalMs <= 0) return 0;
  return Math.min(1, Math.max(0, construction.elapsedMs / construction.totalMs));
}

/**
 * Seconds left, for the overlay.
 *
 * Simulation seconds, not wall-clock: at 4x speed the building genuinely goes up
 * four times faster, and a countdown that ignored that would be lying about
 * something the player can watch.
 */
export function constructionRemainingMs(world: World): number {
  const construction = world.construction;
  if (construction.targetStage === 0) return 0;
  return Math.max(0, construction.totalMs - construction.elapsedMs);
}
