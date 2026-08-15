import { directionFor } from './VehicleView';
import type { SpriteDirection } from './VehicleView';

/**
 * How a customer is drawn: which sprite, and how impatient they look.
 *
 * Pure arithmetic on numbers the simulation already computed, for the same
 * reason `VehicleView` is — the direction table and the patience ring can be
 * unit-tested in Node without a WebGL context.
 *
 * **No production character art exists yet.** The pipeline and its prompts are
 * built (PHASE_4_REPORT §11) but nothing has been generated, so `spriteKeyFor`
 * returns the key the real art *will* have and the caller falls back to the
 * registered placeholder when that texture is absent.
 *
 * Phase 6 draws a customer standing still and facing a direction. The walk cycle
 * arrives in Phase 7 with navigation, which is why nothing here takes a time or
 * a distance — adding an animation frame index now would be a parameter with
 * one possible value.
 */

/** Pose names, in the order ASSET_PIPELINE §3 fixes for filenames. */
export const CUSTOMER_POSES = ['idle', 'walk', 'wait', 'angry'] as const;
export type CustomerPose = (typeof CUSTOMER_POSES)[number];

/**
 * The texture key the production art will use — ASSET_PIPELINE §3.
 *
 *   chr_customer_<pose>_<direction>@2x
 */
export function spriteKeyFor(pose: CustomerPose, direction: SpriteDirection): string {
  return `chr_customer_${pose}_${direction}@2x`;
}

/**
 * Which pose to draw, from the customer's own state.
 *
 * A deliberately small vocabulary. Four poses times eight directions is already
 * 32 sprites per character, and ASSET_PIPELINE §13 budgets the whole character
 * batch at 40 — so a fifth pose is a change request against the batch, not a
 * detail to add here.
 */
export function poseFor(walking: boolean, patienceFraction: number): CustomerPose {
  if (walking) return 'walk';
  // Angry once patience is nearly out, so the player sees it coming rather than
  // discovering it from a customer who has already gone.
  if (patienceFraction > 0 && patienceFraction < ANGRY_THRESHOLD) return 'angry';
  if (patienceFraction > 0) return 'wait';
  return 'idle';
}

/**
 * The fraction of patience below which someone visibly gives up hope.
 *
 * A quarter, so the warning lasts roughly ten seconds at Stage 1's forty-five —
 * long enough to be read as a state rather than a flicker, short enough that
 * most of a wait still looks like patient waiting.
 */
export const ANGRY_THRESHOLD = 0.25;

export function directionForCustomer(headingX: number, headingY: number): SpriteDirection {
  return directionFor(headingX, headingY);
}

/**
 * The patience ring — GAME_EXECUTION_ROADMAP Phase 6, "sabır halkası (basit)".
 *
 * Returned as a sweep fraction and a colour band rather than as geometry, so the
 * shape stays in the render layer and the *meaning* stays testable. The ring
 * empties clockwise, because a filling ring reads as progress towards something
 * good and this is the opposite.
 */
export interface PatienceRing {
  /** 0 to 1, how much of the ring is drawn. */
  readonly sweep: number;
  /** Which of the three bands the remaining patience falls into. */
  readonly band: 'calm' | 'restless' | 'angry';
  /** False when there is nothing to draw at all. */
  readonly visible: boolean;
}

export function patienceRing(patienceMs: number, patienceMaxMs: number): PatienceRing {
  if (patienceMaxMs <= 0 || patienceMs <= 0) {
    return { sweep: 0, band: 'calm', visible: false };
  }

  const fraction = Math.min(1, patienceMs / patienceMaxMs);
  /*
   * Hidden while patience is nearly full. A ring over every customer from the
   * moment they arrive is noise — the player learns to stop seeing it, which is
   * the opposite of what a warning is for. It appears as the wait starts to
   * matter.
   */
  if (fraction >= RING_APPEARS_BELOW) return { sweep: fraction, band: 'calm', visible: false };

  const band = fraction < ANGRY_THRESHOLD ? 'angry' : 'restless';
  return { sweep: fraction, band, visible: true };
}

/** Patience fraction at which the ring starts being drawn. */
export const RING_APPEARS_BELOW = 0.7;
