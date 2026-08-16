import { layoutForStage } from '@config/layouts';
import { CELL_SIZE_METRES } from '../nav/NavGrid';
import type { World } from '../core/World';

/**
 * Placing things in the world — GAME_EXECUTION_ROADMAP Phase 11.
 *
 * ## The rule that matters
 *
 * _"A placement that would block navigation must be rejected with clear visual
 * feedback, not silently accepted and then break pathfinding."_
 *
 * Rejection is checked by actually asking the navigation grid, not by comparing
 * rectangles: the grid is the thing that decides where people can walk, and a
 * second implementation of "is this walkable" would disagree with it on exactly
 * the cases that matter — the diagonal squeeze between two objects.
 *
 * ## Grid-snapped, and why — GAME_DESIGN_DOCUMENT §25, S4
 *
 * **Decided in Phase 11: grid-snapped.** Both were built and measured; the
 * reasoning is in §25 and PHASE_11_REPORT §5. The short version is that the
 * navigation grid has 0.5 m cells, so a freely-placed object either rounds to
 * the same cells anyway — in which case the freedom is a lie the preview tells —
 * or straddles a cell boundary and blocks a cell the player can see they did not
 * cover. Snapping makes "what will this block" answerable *before* the click.
 */

/** Objects snap to this, and it is the navigation cell size on purpose. */
export const PLACEMENT_GRID_METRES = CELL_SIZE_METRES;

/** Why a placement was refused. `ok` means it happened. */
export type PlacementOutcome = 'ok' | 'outside-lot' | 'blocks-navigation' | 'occupied' | 'full';

/** How many objects a player may place. Beyond this the world stops accepting. */
export const MAX_PLACED_OBJECTS = 64;

/** Snap a world coordinate to the placement grid. */
export function snapToGrid(value: number): number {
  return Math.round(value / PLACEMENT_GRID_METRES) * PLACEMENT_GRID_METRES;
}

/**
 * Try to place an object, and say why not if it fails.
 *
 * The validity check is a *trial rebuild*: the object is added, the navigation
 * grid is asked whether the counter is still reachable from the car park, and
 * the object is removed again if it is not. That is more expensive than a
 * bounding-box test and it is the only version that cannot be wrong — a
 * cheaper check that approves a placement the grid then rejects produces a lot
 * with no route to the counter and no error anywhere.
 */
export function placeObject(
  world: World,
  objectId: string,
  x: number,
  y: number,
  reachable: (world: World) => boolean,
): PlacementOutcome {
  if (world.layout.placed.length >= MAX_PLACED_OBJECTS) return 'full';

  const layout = layoutForStage(world.progression.stage);
  const snappedX = snapToGrid(x);
  const snappedY = snapToGrid(y);

  if (
    snappedX < layout.lot.minX ||
    snappedX > layout.lot.maxX ||
    snappedY < layout.lot.minY ||
    snappedY > layout.lot.maxY
  ) {
    return 'outside-lot';
  }

  // Two objects in one cell is not a navigation failure — it is a stacking
  // mistake, and it deserves its own answer so the UI can say something useful.
  for (const existing of world.layout.placed) {
    if (existing.x === snappedX && existing.y === snappedY) return 'occupied';
  }

  world.layout.placed.push({ objectId, x: snappedX, y: snappedY, z: 0 });
  world.layout.revision++;

  if (!reachable(world)) {
    world.layout.placed.pop();
    world.layout.revision++;
    return 'blocks-navigation';
  }

  world.eventQueue.emitObjectPlaced(objectId, snappedX, snappedY);
  return 'ok';
}

/**
 * The verdict a placement *would* get, without making it.
 *
 * What build mode's ghost is coloured by. The roadmap's rule for Phase 11 is
 * that a placement which would block navigation is _"rejected with clear visual
 * feedback, not silently accepted"_ — and the clearest possible feedback is
 * given before the click rather than after it, which needs the answer without
 * the side effect.
 *
 * ## It really does place the object, and really does take it back
 *
 * There is no cheaper check that is also correct. A bounding-box approximation
 * that approves a placement the grid then rejects hands the player a green ghost
 * and a red result, which is worse than no ghost at all.
 *
 * So the object is pushed, judged and popped — and **the revision is restored,
 * not bumped twice**. The revision is the navigation cache's invalidation
 * signature; leaving it changed would rebuild every flow field in the world on
 * every frame the player moved the mouse.
 */
export function previewPlacement(
  world: World,
  objectId: string,
  x: number,
  y: number,
  reachable: (world: World) => boolean,
): PlacementOutcome {
  if (world.layout.placed.length >= MAX_PLACED_OBJECTS) return 'full';

  const layout = layoutForStage(world.progression.stage);
  const snappedX = snapToGrid(x);
  const snappedY = snapToGrid(y);

  if (
    snappedX < layout.lot.minX ||
    snappedX > layout.lot.maxX ||
    snappedY < layout.lot.minY ||
    snappedY > layout.lot.maxY
  ) {
    return 'outside-lot';
  }

  for (const existing of world.layout.placed) {
    if (existing.x === snappedX && existing.y === snappedY) return 'occupied';
  }

  const revision = world.layout.revision;
  world.layout.placed.push({ objectId, x: snappedX, y: snappedY, z: 0 });
  const intact = reachable(world);
  world.layout.placed.pop();
  world.layout.revision = revision;

  return intact ? 'ok' : 'blocks-navigation';
}

/**
 * Remove a placed object by index.
 *
 * Bumps the revision like a placement does. That is the fix for the invalidation
 * defect Phase 7 recorded and Phase 11 owes: the old signature was
 * `placed.length`, which is unchanged by a *move* — place then remove leaves the
 * count identical and the navigation grid describing a world that no longer
 * exists.
 */
export function removeObject(world: World, index: number): boolean {
  if (index < 0 || index >= world.layout.placed.length) return false;
  const removed = world.layout.placed.splice(index, 1)[0];
  world.layout.revision++;
  if (removed !== undefined) world.eventQueue.emitObjectRemoved(removed.objectId, removed.x, removed.y);
  return true;
}

/**
 * Move an object — the operation the old invalidation signature could not see.
 *
 * Implemented as remove-then-place so it inherits the same validity check, and
 * so a move that would block navigation is refused with the object left where it
 * was rather than deleted.
 */
export function moveObject(
  world: World,
  index: number,
  x: number,
  y: number,
  reachable: (world: World) => boolean,
): PlacementOutcome {
  const object = world.layout.placed[index];
  if (object === undefined) return 'outside-lot';

  const previous = { ...object };
  world.layout.placed.splice(index, 1);
  world.layout.revision++;

  const outcome = placeObject(world, previous.objectId, x, y, reachable);
  if (outcome !== 'ok') {
    // Put it back exactly where it was. A refused move must not cost the player
    // the object.
    world.layout.placed.push(previous);
    world.layout.revision++;
  }
  return outcome;
}
