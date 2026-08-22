import {
  CATEGORY_WEIGHT,
  EFFECT_MODE_OF,
  UPGRADES,
  buildDurationMs,
  upgrade,
  upgradeCost,
} from '@config/economy/upgrades';
import type { EffectKind, Upgrade } from '@config/economy/upgrades';
import { combineDiminishing } from '../math/combineDiminishing';
import type { World } from '../core/World';
import { playerLevel, upgradeLevelRequirement } from './playerLevel';

/**
 * What the player has bought, turned into numbers the simulation uses.
 *
 * ## Free functions, not a pipeline system
 *
 * There is no `UpgradeSystem` slot in `SYSTEM_ORDER` and none is being added —
 * the eighteen slots and their order are architecture (WORKING_DISCIPLINE §6),
 * and this needs no per-tick work anyway. An upgrade changes what a *question*
 * answers, not what happens on a tick: `ConversionSystem` asks how visible the
 * stand is, `KitchenSystem` asks how many stations exist, and both get an answer
 * computed from `world.layout.upgrades` at the moment they ask.
 *
 * The alternative — writing effects into mutable copies of the config at
 * purchase time — was rejected. It puts the same number in two places, needs a
 * migration every time an effect is added, and makes "what is my visibility?"
 * answerable only by trusting that every past purchase was applied correctly.
 *
 * ## Nothing here switches on an upgrade id
 *
 * The roadmap's hard rule. Every effect is `{kind, perLevel}` data in
 * `src/config/economy/upgrades.ts`; this file knows about *kinds*. Phase 13
 * grows the list to a full tree and this file does not change.
 */

/** How many levels of an upgrade the player owns. Zero if never bought. */
export function upgradeLevel(world: World, id: string): number {
  return world.layout.upgrades.get(id) ?? 0;
}

/**
 * Every level the player owns, across every family.
 *
 * The "upgrades bought" milestone in `src/config/progression.ts` counts levels
 * rather than distinct upgrades, so buying the sign four times is four — which
 * is the honest reading of "has this player engaged with upgrades at all".
 */
export function totalUpgradeLevels(world: World): number {
  let total = 0;
  for (const item of UPGRADES) total += upgradeLevel(world, item.id);
  return total;
}

/** What the next level of an upgrade would cost, or -1 if it is maxed. */
export function nextUpgradeCost(world: World, id: string): number {
  const item = upgrade(id);
  const level = upgradeLevel(world, id);
  if (level >= item.maxLevel) return -1;
  return upgradeCost(item, level + 1, world.progression.stage);
}

/**
 * One upgrade's total contribution to a kind, at its current level.
 *
 * Levels *within* a family add up, and the per-level amounts already shrink —
 * that is ECONOMY_DESIGN §6.2's damped-additive column, and it is what makes the
 * visibility family read 1.30, 1.52, 1.68, 1.80 rather than compounding.
 * `combineDiminishing` is for the other axis: two *different* families both
 * pushing on the same category.
 */
function contribution(item: Upgrade, level: number, kind: EffectKind): number {
  let total = 0;
  for (const effect of item.effects) {
    if (effect.kind !== kind) continue;
    for (let i = 0; i < level && i < effect.perLevel.length; i++) {
      total += effect.perLevel[i] ?? 0;
    }
  }
  return total;
}

/** A `scale` kind compounds instead of adding: two 20% cuts really are 0.64x. */
function scaleContribution(item: Upgrade, level: number, kind: EffectKind): number {
  let total = 1;
  for (const effect of item.effects) {
    if (effect.kind !== kind) continue;
    for (let i = 0; i < level && i < effect.perLevel.length; i++) {
      total *= effect.perLevel[i] ?? 1;
    }
  }
  return total;
}

/**
 * The value the simulation should use for a kind, right now.
 *
 * Returns the *neutral* value when nothing has been bought — 1 for a multiplier
 * or a scale, 0 for an additive bonus — so a caller can always apply the result
 * unconditionally. A caller that had to check "did they buy anything?" first is
 * a caller that will eventually forget.
 */
export function effectValue(world: World, kind: EffectKind): number {
  const mode = EFFECT_MODE_OF[kind];

  if (mode === 'additive') {
    let total = 0;
    for (const item of UPGRADES) {
      total += contribution(item, upgradeLevel(world, item.id), kind);
    }
    return total;
  }

  if (mode === 'scale') {
    let total = 1;
    for (const item of UPGRADES) {
      total *= scaleContribution(item, upgradeLevel(world, item.id), kind);
    }
    return total;
  }

  /*
   * Multiplier kinds. Each family's damped-additive total is one term, and the
   * terms are combined with diminishing returns across families — exploit E4.
   * The scratch array is built per call rather than reused because this runs
   * once per conversion roll, not once per entity per tick, and a module-level
   * buffer shared between two callers is a far worse bug than an allocation
   * measured in the tens per minute.
   */
  const terms: number[] = [];
  for (const item of UPGRADES) {
    const value = contribution(item, upgradeLevel(world, item.id), kind);
    if (value !== 0) terms.push(value);
  }
  if (terms.length === 0) return 1;
  return 1 + combineDiminishing(terms, CATEGORY_WEIGHT[kind]);
}

/** One effect of an upgrade, as it is now and as it would be one level on. */
export interface EffectPreview {
  readonly kind: EffectKind;
  readonly before: number;
  readonly after: number;
}

/**
 * What the next level would actually change — GAME_DESIGN_DOCUMENT §14.3.
 *
 * The upgrade card shows "the exact before/after numbers", and this is where
 * they come from. Computed by asking `effectValue` twice, once with the level
 * temporarily raised, rather than by re-deriving the combining rules in the UI:
 * a second implementation of `combineDiminishing` living in a Svelte component
 * would quote the player a number the simulation disagrees with, and it would
 * disagree silently.
 *
 * The world is mutated and restored inside one synchronous call. Nothing ticks
 * in between, nothing else reads it, and the alternative — a parallel
 * "hypothetical world" — would need the whole upgrade map copied per frame.
 */
export function previewNextLevel(world: World, id: string): readonly EffectPreview[] {
  const item = UPGRADES.find((candidate) => candidate.id === id);
  if (item === undefined) return [];

  const level = upgradeLevel(world, id);
  if (level >= item.maxLevel) return [];

  const previews: EffectPreview[] = [];
  for (const effect of item.effects) {
    const before = effectValue(world, effect.kind);
    world.layout.upgrades.set(id, level + 1);
    const after = effectValue(world, effect.kind);
    if (level === 0) world.layout.upgrades.delete(id);
    else world.layout.upgrades.set(id, level);
    previews.push({ kind: effect.kind, before, after });
  }
  return previews;
}

/** Why a purchase was refused. `ok` means it happened. */
export type PurchaseOutcome = 'ok' | 'unknown' | 'maxed' | 'unaffordable' | 'locked';

/**
 * Buy one level of an upgrade — the whole of `BUY_UPGRADE`'s meaning.
 *
 * **Validated here, in the simulation, and nowhere else that counts.** The UI
 * greys out a card the player cannot afford, and that is a courtesy, not a
 * control: the only path into the world is a command, commands are replayed from
 * logs and loaded from saves, and a save written by a modified build must not be
 * able to smuggle a free upgrade through. `tests/unit/sim/economy/purchase.test.ts`
 * dispatches an unaffordable purchase directly to prove it is refused.
 *
 * Cash is deducted before the level is written, and both happen or neither does.
 */
export function buyUpgrade(world: World, id: string): PurchaseOutcome {
  const item = UPGRADES.find((candidate) => candidate.id === id);
  if (item === undefined) return 'unknown';

  const level = upgradeLevel(world, id);
  if (level >= item.maxLevel) return 'maxed';

  /*
   * Locked before unaffordable, and both before any money moves — Phase 13.
   *
   * Two gates, and the order is deliberate: a player looking at an upgrade they
   * cannot buy needs to know *which* problem to solve, and "you have not
   * unlocked this yet" is the one they can act on. Reported to the interface as
   * a single `locked`, because from the player's side a stage they have not
   * reached and a prerequisite they have not bought are the same sentence.
   *
   * Enforced here rather than only in the interface for the reason every
   * validation in this file exists: the only path into the world is a command,
   * commands are replayed from logs and loaded from saves, and a save written by
   * a modified build must not be able to smuggle a Stage 4 window into a
   * lemonade stand.
   */
  if (item.stage > world.progression.stage) return 'locked';
  for (const prereq of item.prereqs) {
    if (upgradeLevel(world, prereq) <= 0) return 'locked';
  }
  /*
   * The player-level gate, last of the locked family — consolidation pass,
   * 2026-08-21. Derived from hashed counters (`playerLevel`), so a replayed
   * log meets exactly the gate it met live. Set below the calibrated pace on
   * purpose; the balance suite's asserted rows prove it does not bind.
   */
  if (playerLevel(world).level < upgradeLevelRequirement(id)) return 'locked';

  /*
   * Levels already on the construction queue count toward `maxed` and price
   * the next rung, or a player could queue five copies of a two-level ladder
   * at the first rung's price while the scaffolding was still up.
   */
  const queued = pendingUpgradeLevels(world, id);
  if (level + queued >= item.maxLevel) return 'maxed';

  const cost = upgradeCost(item, level + queued + 1, world.progression.stage);
  if (world.economy.cash < cost) return 'unaffordable';

  /*
   * The correction pass: money moves now, the level applies when the build
   * finishes. `ProgressionSystem` counts the site down in simulation time and
   * calls `applyUpgradeLevel` at zero — so the effect, the world object and
   * the completion burst all arrive together, and none of them arrive on the
   * click. The revision bump tells the renderer a site appeared.
   */
  world.economy.cash -= cost;
  world.economy.lifetimeSpend += cost;
  const totalMs = buildDurationMs(cost);
  world.layout.pendingBuilds.push({
    upgradeId: id,
    objectId: item.placeholder,
    x: item.anchor.x,
    y: item.anchor.y,
    remainingMs: totalMs,
    totalMs,
  });
  world.layout.revision++;
  return 'ok';
}

/** Levels of `id` currently under construction. */
function pendingUpgradeLevels(world: World, id: string): number {
  let count = 0;
  for (const build of world.layout.pendingBuilds) {
    if (build.upgradeId === id) count++;
  }
  return count;
}

/**
 * A finished site's level lands — called by `ProgressionSystem` at zero.
 *
 * This is the old instant-purchase tail: the level, the event the bursts and
 * notices listen for, and the revision bump that makes the renderer rebuild
 * its statics so the object is standing when the scaffold clears.
 */
export function applyUpgradeLevel(world: World, id: string): void {
  const item = UPGRADES.find((candidate) => candidate.id === id);
  if (item === undefined) return;
  const level = upgradeLevel(world, id) + 1;
  world.layout.upgrades.set(id, level);
  world.layout.revision++;
  world.eventQueue.emitUpgradeApplied(id, level, upgradeCost(item, level, world.progression.stage));
}
