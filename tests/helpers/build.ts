import type { StageRequirement } from '@config/progression';
import { property, propertyVia } from '@config/properties';
import type { World } from '@sim/core/World';
import { advancePendingBuilds } from '@sim/systems/ProgressionSystem';
import { propertyLevel, upgradeProperty } from '@sim/systems/properties';
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

/**
 * Raise every property a stage requires to the level it requires — the way a
 * player would, through the real purchase paths.
 *
 * The evolution system's property floor (`docs/RESTAURANT_EVOLUTION_ROADMAP.md`
 * §B.4) means "meet the requirements" is no longer four counters a harness can
 * write. Each property is raised through the door the interface uses: a
 * **derived** one by buying the upgrade rung it reads its level from, an
 * **own** one by `upgradeProperty` and letting the site complete.
 *
 * Writing `propertyLevels` directly would be the shortcut this refuses: it
 * would prove a world can be *put* into a state, not that a player can *reach*
 * it, and reachability is the entire claim a stage requirement makes.
 *
 * The caller is expected to have funded the world; a refused purchase leaves
 * the level short and the requirement unmet, which is the honest outcome.
 */
export function raiseProperties(world: World, requirement: StageRequirement): void {
  for (const [id, need] of Object.entries(requirement.requiredProperties)) {
    const spec = property(id);
    if (spec === undefined) continue;

    // Bounded by the ladder length rather than by `while`: a refused purchase
    // must not spin forever, and it is a real outcome (no cash, wrong stage).
    for (let attempt = 0; attempt < spec.maxLevel * 2; attempt++) {
      const level = propertyLevel(world, id);
      if (level >= need) break;

      if (spec.ladder === 'own') {
        if (upgradeProperty(world, id) !== 'ok') break;
        advancePendingBuilds(world, Number.MAX_SAFE_INTEGER);
        continue;
      }

      const via = propertyVia(spec, level + 1);
      if (via === undefined) break;
      if (buyBuilt(world, via) !== 'ok') break;
    }
  }
}
