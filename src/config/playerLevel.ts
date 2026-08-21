import { z } from 'zod';

/**
 * Player level — the presentation layer of progress, derived, never stored.
 *
 * The level is a pure function of counters the world already hashes
 * (`customersServed`, `lifetimeRevenue`, upgrade levels, stage), computed by
 * `src/sim/systems/playerLevel.ts`. Nothing here adds world state: a replay
 * that agrees on the counters agrees on the level, and the save schema does
 * not move. Distinct from `@config/progression`, which owns the *restaurant
 * stage* — the two are different axes on purpose (a Level 7 player can run a
 * Stage 2 truck), and the interface labels them separately.
 *
 * Level requirements on upgrades are deliberately set BELOW the pace of
 * normal play (the 2026-08-21 calibration's stage windows are the contract —
 * STAGE_2_4_CALIBRATION_REPORT). They exist to make progress legible and to
 * price in anticipation, not to re-gate the calibrated economy: the balance
 * suite's asserted rows (`stage-2-timing` among them) are the proof that
 * these gates do not bind under the shipped policies.
 */
const weightsSchema = z.object({
  /** XP per customer served. */
  served: z.number().int().positive(),
  /** XP per whole credit of lifetime revenue. */
  revenuePerCredit: z.number().positive(),
  /** XP per upgrade level owned. */
  upgradeLevel: z.number().int().positive(),
  /** XP per stage transition completed. */
  stageReached: z.number().int().positive(),
});

export const XP_WEIGHTS = weightsSchema.parse({
  served: 4,
  revenuePerCredit: 1,
  upgradeLevel: 25,
  stageReached: 150,
});

/**
 * Cumulative XP required to BE each level; index 0 is level 1.
 * Monotonic — enforced at module load, like every config invariant.
 */
export const LEVEL_XP = z
  .array(z.number().int().nonnegative())
  .refine((xs) => xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? 0)), 'thresholds must rise')
  .parse([
    0, 60, 150, 280, 450, 660, 920, 1240, 1620, 2070, 2600, 3220, 3940, 4770, 5720, 6800, 8020, 9390, 10920,
    12620,
  ]);

export const MAX_LEVEL = LEVEL_XP.length;

/**
 * Showcase gates, by upgrade id. Absent means level 1.
 *
 * Chosen against the measured curve: by the time the calibrated economy can
 * afford each rung, normal play is already past its level (see
 * PROGRESSION_DESIGN.md for the arithmetic). The stage gate binds first on
 * every stage-2+ item; these numbers exist so the card can say what is
 * coming and when.
 */
export const UPGRADE_LEVEL_REQUIREMENTS: Readonly<Record<string, number>> = z
  .record(z.string(), z.number().int().min(2).max(MAX_LEVEL))
  .parse({
    'menu-board': 2,
    'planter-boxes': 2,
    cooler: 3,
    'sharper-knives': 3,
    'illuminated-sign': 4,
    'pass-heat-lamp': 4,
    'better-ingredients': 5,
    'second-prep-station': 5,
    'drink-dispenser': 6,
    'neon-facade': 7,
    'prep-automation': 8,
    'roadside-pylon': 9,
  });
