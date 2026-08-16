import { STAGE1_LAYOUT } from './stage1';
import type { StageLayout } from './stage1';
import { STAGE2_LAYOUT } from './stage2';
import { STAGE3_LAYOUT } from './stage3';
import { STAGE4_LAYOUT } from './stage4';

/**
 * Which layout a stage uses — Phase 11.
 *
 * Indexed by stage number rather than looked up by id, because the stage is a
 * number in the world, in the save and in the digest. A map keyed by string
 * would put a second spelling of the same fact in the codebase.
 *
 * ## Why systems call this instead of holding a layout
 *
 * Until Phase 11 every system was constructed with `STAGE1_LAYOUT` and kept it.
 * That was correct while there was one stage and would have been a silent bug
 * the moment there were four: a system holding Stage 1's parking after the
 * player evolved would route cars to bays that no longer exist, and nothing
 * would throw.
 *
 * So the layout is *asked for* with the world's current stage, on demand, in
 * the same way upgrade effects are (Phase 9). One authority, no cached copy to
 * go stale.
 */
const BY_STAGE: readonly StageLayout[] = [
  STAGE1_LAYOUT,
  STAGE1_LAYOUT,
  STAGE2_LAYOUT,
  STAGE3_LAYOUT,
  STAGE4_LAYOUT,
];

/**
 * The layout for a stage, clamped.
 *
 * Clamped rather than throwing: this is called from the middle of a tick, for
 * every agent, and a save with a stage this build does not know about should
 * degrade to the nearest one it does rather than take the simulation down.
 */
export function layoutForStage(stage: number): StageLayout {
  const index = Math.min(BY_STAGE.length - 1, Math.max(1, Math.trunc(stage)));
  return BY_STAGE[index] ?? STAGE1_LAYOUT;
}

/** Every layout, for tests that need to check a property across all of them. */
export const ALL_LAYOUTS: readonly StageLayout[] = [
  STAGE1_LAYOUT,
  STAGE2_LAYOUT,
  STAGE3_LAYOUT,
  STAGE4_LAYOUT,
];
