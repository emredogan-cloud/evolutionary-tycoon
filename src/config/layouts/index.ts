import { parkingBays } from '../properties';
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

/**
 * Every parking bay the game has coordinates for — the longest authored list.
 *
 * The four `parking` arrays are literally nested: Stage 2 spreads Stage 1's and
 * appends one bay, Stage 3 spreads Stage 2's and appends three, Stage 4 reuses
 * Stage 3's (it grows a drive-thru instead of more tarmac). So the longest of
 * them *contains* the other three as prefixes, and a prefix of it is always a
 * real, authored, geometry-checked set rather than a new arrangement.
 *
 * The nesting is not an assumption — `tests/unit/config/properties.test.ts`
 * proves it, and `tests/unit/sim/layout/stageLayouts.test.ts` proves every
 * resolvable prefix keeps its cars off each other, off the tables and inside
 * the lot.
 */
const ALL_BAYS: readonly StageLayout['parking'][number][] = [
  STAGE1_LAYOUT,
  STAGE2_LAYOUT,
  STAGE3_LAYOUT,
  STAGE4_LAYOUT,
].reduce<readonly StageLayout['parking'][number][]>(
  (longest, layout) => (layout.parking.length > longest.length ? layout.parking : longest),
  [],
);

/**
 * The layout a stage runs at a given parking level — the property system.
 *
 * The stage decides the building; the **parking level** decides the car park,
 * and it decides it on its own. That separation is the point: `maxPropertyLevel`
 * lets a Stage-1 player buy the level-2 car park, which is how they meet Stage
 * 2's property floor before Stage 2 exists — so the fifth bay has to appear
 * while they are still in Stage 1, or they have paid for nothing.
 *
 * **Measured, because it was wrong first.** Sliced against the *stage's* own
 * list, `layoutFor(1, 2)` returned four bays: the purchase completed, the level
 * went up, the card said "5 araç", and the lot was unchanged. The browser test
 * `the site counts down before the level arrives, not after` caught it as a
 * capacity readout that never moved.
 *
 * **Cached per (stage, bay count).** Systems call this once per agent per tick;
 * building a fresh object each time would put the hot path on the allocator,
 * which is the one thing the frame budget cannot absorb
 * (WORKING_DISCIPLINE §2.3). There are at most twelve distinct results.
 */
const RESOLVED = new Map<number, StageLayout>();

export function layoutFor(stage: number, parkingLevel: number): StageLayout {
  const base = layoutForStage(stage);
  const bays = Math.max(1, Math.min(ALL_BAYS.length, parkingBays(parkingLevel)));
  if (bays === base.parking.length) return base;

  const key = Math.trunc(stage) * 16 + bays;
  const cached = RESOLVED.get(key);
  if (cached !== undefined) return cached;

  const resolved: StageLayout = { ...base, parking: ALL_BAYS.slice(0, bays) };
  RESOLVED.set(key, resolved);
  return resolved;
}

/** Every layout, for tests that need to check a property across all of them. */
export const ALL_LAYOUTS: readonly StageLayout[] = [
  STAGE1_LAYOUT,
  STAGE2_LAYOUT,
  STAGE3_LAYOUT,
  STAGE4_LAYOUT,
];
