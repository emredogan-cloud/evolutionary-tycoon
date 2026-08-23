import { DEMOLISH_REFUND_FRACTION, storeItem } from '@config/store';
import { building, buildingAsset, buildingBuildMs, buildingCost, stageForLevel } from '@config/buildings';
import { navigationIntact } from '../nav/reachability';
import { moveObject, placeObject, removeObject, zoneAllows } from './LayoutSystem';
import type { PlacementOutcome } from './LayoutSystem';
import type { World } from '../core/World';

/**
 * Buying, moving and selling back the things the player puts on the lot.
 *
 * The priced layer over `LayoutSystem`, which stays what it always was: pure
 * geometry and navigation, with no opinion about money. Everything that can
 * refuse a purchase lives here, and it lives here *in the simulation* for the
 * reason every other validation does — the only path into the world is a
 * command, commands are replayed from logs and loaded from saves, and a save
 * written by a modified build must not be able to smuggle a free tree onto
 * the lot. The interface greys out what the player cannot afford; that is a
 * courtesy, not a control.
 *
 * ## The identity chain
 *
 * `itemId` is carried, never re-derived. It goes card → `BUY_PLACE` →
 * `placeObject` → the saved row, and every later question — what does this
 * refund, may it stand here, what did the player actually buy — is answered
 * from that one field. Nothing anywhere maps a list position, a card index or
 * an `objectId` back to a catalogue entry, because two entries may legitimately
 * draw the same object and the moment such a mapping exists a sign can become
 * a flower again.
 */

export type StoreOutcome = PlacementOutcome | 'unknown' | 'locked' | 'unaffordable';

/**
 * Buy a catalogue item and put it down, or say why not.
 *
 * One command, one transaction: the money moves only if the object lands.
 * Splitting it into a purchase and a later placement was the shape that
 * produced the reported bug — an owned thing with no placement channel, and a
 * placement channel with no owner — so the two are inseparable here by
 * construction. A refused placement costs nothing.
 */
export function buyPlace(world: World, itemId: string, x: number, y: number): StoreOutcome {
  // A functional building is bought and placed through the same door, with the
  // same identity: the catalogue decides which catalogue it is in.
  const asBuilding = building(itemId);
  if (asBuilding !== undefined) return buyBuilding(world, itemId, x, y);

  const item = storeItem(itemId);
  if (item === undefined) return 'unknown';
  if (item.stage > world.progression.stage) return 'locked';
  if (world.economy.cash < item.cost) return 'unaffordable';
  if (!zoneAllows(world, item.zone, x, y)) return 'wrong-zone';

  /*
   * Placed first, paid second. `placeObject` is the only thing that knows
   * whether the spot is legal, and it answers by trying — so asking it first
   * is what keeps a refusal free. Nothing observable happens in between: no
   * event is emitted on a refusal and the trial placement is popped.
   */
  const outcome = placeObject(world, item.objectId, x, y, navigationIntact, { itemId: item.id });
  if (outcome !== 'ok') return outcome;

  world.economy.cash -= item.cost;
  world.economy.lifetimeSpend += item.cost;
  return 'ok';
}

/**
 * Sell a placed object back and take it off the lot.
 *
 * ECONOMY_DESIGN §8 E5: demolition returns thirty percent, and no purchase is
 * ever refunded in full — that clause exists to close the buy-place-remove
 * arbitrage, so the fraction is the rule rather than a generosity dial.
 *
 * Only what the player bought pays out. A layout static or a pre-store decor
 * row has no `itemId`, so there is no price to take a fraction of; removing
 * one is free and returns nothing, which is the honest answer rather than a
 * guess derived from whatever it happens to be drawn as.
 */
export function sellPlaced(world: World, index: number): boolean {
  const object = world.layout.placed[index];
  if (object === undefined) return false;

  const item = object.itemId === undefined ? undefined : storeItem(object.itemId);
  if (!removeObject(world, index)) return false;

  if (item !== undefined) {
    world.economy.cash += item.cost * DEMOLISH_REFUND_FRACTION;
  }
  return true;
}

/** What selling this row back would pay, for the interface to show first. */
export function refundFor(world: World, index: number): number {
  const object = world.layout.placed[index];
  const item = object?.itemId === undefined ? undefined : storeItem(object.itemId);
  return item === undefined ? 0 : item.cost * DEMOLISH_REFUND_FRACTION;
}

/**
 * Move a placed object, keeping everything about it except where it stands.
 *
 * The zone rule follows the object rather than the ground it came from: a
 * roadside sign that could be dragged into the back field would make the zone
 * a purchase-time formality instead of a placement rule.
 */
export function movePlaced(world: World, index: number, x: number, y: number): StoreOutcome {
  const object = world.layout.placed[index];
  if (object === undefined) return 'outside-lot';

  const item = object.itemId === undefined ? undefined : storeItem(object.itemId);
  if (item !== undefined && !zoneAllows(world, item.zone, x, y)) return 'wrong-zone';

  return moveObject(world, index, x, y, navigationIntact);
}

/**
 * Buy a functional building at level 1 and raise its site.
 *
 * Unlike a decor item the object is real from the click — it holds its cell
 * and blocks navigation exactly as a placed prop does — but its **level is
 * zero until the site completes**, so it contributes no effect and draws no
 * upgraded art in the meantime. That is what makes "no build success without
 * a visible object" and "no effect without the thing that produces it" the
 * same statement rather than two hopeful ones.
 */
function buyBuilding(world: World, id: string, x: number, y: number): StoreOutcome {
  const item = building(id);
  if (item === undefined) return 'unknown';
  if (item.stageRequired > world.progression.stage) return 'locked';
  for (const prereq of item.prerequisites) {
    if ((world.layout.upgrades.get(prereq) ?? 0) <= 0) return 'locked';
  }

  const cost = buildingCost(item, 1);
  const buildMs = buildingBuildMs(item, 1);
  if (cost === undefined || buildMs === undefined) return 'unknown';
  if (world.economy.cash < cost) return 'unaffordable';
  if (!zoneAllows(world, item.zone, x, y)) return 'wrong-zone';

  const outcome = placeObject(world, buildingAsset(item, 1), x, y, navigationIntact, {
    itemId: item.id,
    site: false,
  });
  if (outcome !== 'ok') return outcome;

  const row = world.layout.placed.at(-1);
  if (row !== undefined) row.level = 0;

  world.economy.cash -= cost;
  world.economy.lifetimeSpend += cost;
  world.layout.pendingBuilds.push({
    upgradeId: '',
    objectId: buildingAsset(item, 1),
    x: row?.x ?? x,
    y: row?.y ?? y,
    remainingMs: buildMs,
    totalMs: buildMs,
    targetLevel: 1,
  });
  world.layout.revision++;
  return 'ok';
}

export type UpgradeBuildingOutcome = 'ok' | 'unknown' | 'maxed' | 'locked' | 'unaffordable' | 'building';

/**
 * Raise a placed building one level, in place.
 *
 * The object keeps its identity, its position and its cell; only its level
 * moves, and only when the new site completes. A level already on the queue
 * counts as owned for the purpose of refusing a second purchase, exactly as
 * the upgrade tree's `pendingUpgradeLevels` does — otherwise a player could
 * buy level 3 three times at level 1's price while the scaffolding was up.
 */
export function upgradeBuilding(world: World, index: number): UpgradeBuildingOutcome {
  const row = world.layout.placed[index];
  if (row?.itemId === undefined) return 'unknown';
  const item = building(row.itemId);
  if (item === undefined) return 'unknown';

  if (pendingLevelFor(world, row.x, row.y) > 0) return 'building';

  const next = (row.level ?? 0) + 1;
  if (next > item.maxLevel) return 'maxed';
  if (world.progression.stage < stageForLevel(next)) return 'locked';

  const cost = buildingCost(item, next);
  const buildMs = buildingBuildMs(item, next);
  if (cost === undefined || buildMs === undefined) return 'maxed';
  if (world.economy.cash < cost) return 'unaffordable';

  world.economy.cash -= cost;
  world.economy.lifetimeSpend += cost;
  world.layout.pendingBuilds.push({
    upgradeId: '',
    objectId: buildingAsset(item, next),
    x: row.x,
    y: row.y,
    remainingMs: buildMs,
    totalMs: buildMs,
    targetLevel: next,
  });
  world.layout.revision++;
  return 'ok';
}

/** The level a site standing on this cell is building toward, or 0. */
function pendingLevelFor(world: World, x: number, y: number): number {
  for (const build of world.layout.pendingBuilds) {
    if (build.x === x && build.y === y) return build.targetLevel ?? 0;
  }
  return 0;
}
