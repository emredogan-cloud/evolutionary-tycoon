import type { World } from '@sim/core/World';
import { advancePendingBuilds } from '@sim/systems/ProgressionSystem';
import { buyUpgrade } from '@sim/systems/UpgradeSystem';
import type { PurchaseOutcome } from '@sim/systems/UpgradeSystem';

/**
 * Buy an upgrade and let its construction finish — the correction pass.
 *
 * Purchases stopped applying on the click: the money moves immediately, the
 * level lands when the site's timer does (`ProgressionSystem`). Tests that
 * are about the *effect* of owning an upgrade — not about the construction
 * flow itself — use this to buy the old way: same outcome string, and the
 * level is applied through the exact code the live tick runs.
 */
export function buyBuilt(world: World, id: string): PurchaseOutcome {
  const outcome = buyUpgrade(world, id);
  if (outcome === 'ok') advancePendingBuilds(world, Number.MAX_SAFE_INTEGER);
  return outcome;
}
