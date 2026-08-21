import { LEVEL_XP, MAX_LEVEL, UPGRADE_LEVEL_REQUIREMENTS, XP_WEIGHTS } from '@config/playerLevel';
import type { World } from '../core/World';

/**
 * The player's level, derived — never stored, never hashed on its own.
 *
 * Every input is already part of the world digest, so two replays that agree
 * on the world agree on the level, on any machine. Integer arithmetic only:
 * `lifetimeRevenue` is floored before it becomes XP, because a float sum's
 * last bits must never decide a level boundary.
 */
export interface PlayerLevel {
  readonly level: number;
  readonly xp: number;
  /** Cumulative XP where the current level began. */
  readonly levelFloor: number;
  /** Cumulative XP where the next level begins; equals `levelFloor` at cap. */
  readonly nextLevelXp: number;
}

/**
 * Sum of owned upgrade levels — inlined rather than imported from
 * UpgradeSystem, because that module imports this one for the gate and a
 * cycle here would be an architecture violation, not a style problem.
 */
function ownedUpgradeLevels(world: World): number {
  let total = 0;
  for (const level of world.layout.upgrades.values()) total += level;
  return total;
}

export function playerXp(world: World): number {
  return (
    world.stats.customersServed * XP_WEIGHTS.served +
    Math.floor(world.economy.lifetimeRevenue) * XP_WEIGHTS.revenuePerCredit +
    ownedUpgradeLevels(world) * XP_WEIGHTS.upgradeLevel +
    (world.progression.stage - 1) * XP_WEIGHTS.stageReached
  );
}

export function playerLevel(world: World): PlayerLevel {
  const xp = playerXp(world);
  let level = 1;
  for (let i = LEVEL_XP.length - 1; i >= 0; i--) {
    const threshold = LEVEL_XP[i] ?? 0;
    if (xp >= threshold) {
      level = i + 1;
      break;
    }
  }
  const levelFloor = LEVEL_XP[level - 1] ?? 0;
  const nextLevelXp = level >= MAX_LEVEL ? levelFloor : (LEVEL_XP[level] ?? levelFloor);
  return { level, xp, levelFloor, nextLevelXp };
}

/** The level an upgrade asks for — 1 when it never asked. */
export function upgradeLevelRequirement(id: string): number {
  return UPGRADE_LEVEL_REQUIREMENTS[id] ?? 1;
}
