/**
 * The shape of everything the DOM overlay is allowed to know.
 *
 * This module imports nothing. That is the point: `src/ui` may not import
 * `src/sim` (dependency-cruiser `ui-no-sim`), and if the view model were
 * declared next to the code that fills it, a Svelte component would have to
 * reach into `src/app` — which transitively reaches the simulation — merely to
 * name a type. Here the type is data, the filling is elsewhere, and the boundary
 * survives contact with `import type`.
 *
 * Everything is plain numbers and strings. No functions, no getters, nothing
 * that could let the overlay write back: the only way into the simulation is a
 * `Command`, and a view model with a method on it is an invitation to forget
 * that.
 */

/** What the player wants, floating over their head. */
export const MARKER_ORDER = 'order';
/** How far through preparation a station is. */
export const MARKER_PREP = 'prep';
/** A finished plate sitting on the pass, and how hot it still is. */
export const MARKER_PASS = 'pass';
/** Money, briefly, at the moment it is earned. */
export const MARKER_COIN = 'coin';

type MarkerKind = typeof MARKER_ORDER | typeof MARKER_PREP | typeof MARKER_PASS | typeof MARKER_COIN;

/**
 * One piece of feedback anchored to a place in the world.
 *
 * Screen coordinates are in CSS pixels relative to the canvas, already through
 * the isometric projection and the camera. The overlay positions a `div` and
 * does no maths of its own — a second implementation of the projection living in
 * a `.svelte` file is how a bubble ends up half a metre from its customer after
 * somebody adjusts the tile height.
 *
 * `visible` is false when the anchor is off-screen or the camera is not up yet.
 * Kept in the list rather than filtered out so the keyed `{#each}` does not tear
 * down and rebuild a node every time somebody walks past the edge of the view.
 */
export interface WorldMarker {
  /** Stable across samples for one anchor, so Svelte can key on it. */
  readonly key: number;
  readonly kind: MarkerKind;
  readonly screenX: number;
  readonly screenY: number;
  readonly visible: boolean;
  /** Menu item id, for `MARKER_ORDER`. Empty otherwise. */
  readonly itemId: string;
  /**
   * For `MARKER_PREP`, 0..1 through preparation. For `MARKER_PASS`, how much of
   * the food's quality survives — 1 is straight off the grill, and it falls as
   * the plate sits.
   */
  readonly progress: number;
  /** Money earned, for `MARKER_COIN`. */
  readonly amount: number;
  /** 0..1 through its lifetime, for `MARKER_COIN`. Drives the float and fade. */
  readonly age: number;
}

/** One effect of an upgrade, before and after the next level. */
export interface UpgradeEffectView {
  readonly kind: string;
  readonly before: number;
  readonly after: number;
}

/**
 * An upgrade as the player sees it — one card's worth.
 *
 * Screen coordinates are the card's anchor, already projected, so the overlay
 * positions a `div` and does no maths. `cost` is -1 when the upgrade is maxed,
 * which is the same convention the simulation uses.
 */
export interface UpgradeView {
  readonly id: string;
  readonly level: number;
  readonly maxLevel: number;
  readonly cost: number;
  readonly affordable: boolean;
  readonly worldChange: string;
  readonly consequence: string;
  readonly effects: readonly UpgradeEffectView[];
  readonly screenX: number;
  readonly screenY: number;
  readonly visible: boolean;
}

/** One menu item's price, with the band the player may move it inside. */
export interface PriceView {
  readonly itemId: string;
  readonly price: number;
  readonly base: number;
  readonly min: number;
  readonly max: number;
}

/** One employee, as the staff panel and the world icon see them. */
export interface StaffView {
  readonly entityId: number;
  readonly roleId: string;
  readonly skill: number;
  readonly wagePerMinute: number;
  /** `IDLE`, `MOVING`, `PERFORMING` or `BLOCKED`. */
  readonly state: string;
  /** What they are doing, for the icon over their head. Empty when idle. */
  readonly taskKind: string;
  readonly screenX: number;
  readonly screenY: number;
  readonly visible: boolean;
}

/** A role the player could hire into. */
export interface RoleView {
  readonly id: string;
  readonly hireCost: number;
  readonly affordable: boolean;
}

/** How close the player is to the next stage — Phase 11. */
export interface ProgressionView {
  readonly stage: number;
  /** A stage whose requirements are met and which is waiting, or 0. */
  readonly pendingStage: number;
  /** 0..1 while the building grows; 0 when nothing is under construction. */
  readonly constructionProgress: number;
  /**
   * Simulation milliseconds left on the build.
   *
   * Simulation, not wall-clock: at 4x the building genuinely goes up four times
   * faster, and a countdown that ignored the speed multiplier would be lying
   * about something the player can watch happening.
   */
  readonly constructionRemainingMs: number;
  readonly constructing: boolean;
  /** Each requirement, so the panel can say which one is missing. */
  readonly requirements: readonly {
    readonly label: string;
    readonly have: number;
    readonly need: number;
    readonly met: boolean;
  }[];
}

/** The HUD, once every hundred milliseconds. */
export interface HudModel {
  readonly cash: number;
  readonly reputation: number;
  readonly customersServed: number;
  readonly ordersActive: number;
  readonly customersWaiting: number;
  readonly gameDay: number;
  readonly gameHour: number;
  readonly paused: boolean;
  readonly speedMultiplier: number;
  /**
   * A reused array, refreshed in place — `markerCount` says how much is live.
   * Reading past it gives stale data from a previous sample.
   */
  readonly markers: readonly WorldMarker[];
  /** Objects the player has placed, in placement order. Reused, like `markers`. */
  readonly placed: readonly PlacedView[];
  /** How much of `placed` is live; entries past it are stale. */
  readonly placedCount: number;
  readonly markerCount: number;

  /** Takings less costs over the last sixty seconds, per minute — Phase 9. */
  readonly incomePerMinute: number;
  /** Every upgrade, in config order. Reused, like `markers`. */
  readonly upgrades: readonly UpgradeView[];
  readonly prices: readonly PriceView[];
  /**
   * The one thing to aim at next, in words — GAME_EXECUTION_ROADMAP Phase 9,
   * "tek aktif hedef göstergesi". A single target, deliberately: a list of six
   * is a list, and a list is not a goal.
   */
  readonly objective: string;
  /** 0..1 toward that objective, for the bar. */
  readonly objectiveProgress: number;

  /** The payroll — Phase 10. Reused, like `markers`. */
  readonly staff: readonly StaffView[];
  readonly staffCount: number;
  readonly roles: readonly RoleView[];
  /** Total wage bill per game minute. */
  readonly payrollPerMinute: number;
  /** True once the payroll is full, so the panel can say why it refuses. */
  readonly payrollFull: boolean;

  /** Evolution — Phase 11. */
  readonly progression: ProgressionView;
}

/**
 * The subscription contract, deliberately the same shape Svelte stores use.
 *
 * A component can write `$hud` against this without the bridge importing Svelte,
 * and without `src/app` growing a framework dependency it would then have to
 * keep in step with the one `src/ui` uses.
 */
/**
 * The answer build mode paints its ghost with.
 *
 * `outcome` is the simulation's own verdict string, not a boolean, because the
 * four ways a placement fails need four different sentences — "that is off the
 * lot" and "that would trap your customers" are not the same mistake.
 */
export interface PlacementPreview {
  readonly outcome: 'ok' | 'outside-lot' | 'blocks-navigation' | 'occupied' | 'full';
  /** The snapped world cell, in metres. */
  readonly worldX: number;
  readonly worldY: number;
  /** That cell, projected back to the overlay. */
  readonly screenX: number;
  readonly screenY: number;
}

/** A placed object, for build mode's list. */
export interface PlacedView {
  readonly objectId: string;
  readonly worldX: number;
  readonly worldY: number;
}

export interface HudSource {
  subscribe(run: (model: HudModel) => void): () => void;
}

/**
 * The other direction: what the overlay is allowed to ask for.
 *
 * Intents, not commands. `src/ui` names a thing the player did — "buy this",
 * "set that price" — and `src/app` turns it into a stamped `Command`. The
 * distinction is what keeps the command union out of the UI's reach: a
 * component cannot construct a command it was not given a verb for, and the
 * simulation validates every one of them again regardless.
 */
export interface UiCommands {
  buyUpgrade(id: string): void;
  /** Confirm the stage transition the player has been offered. */
  evolve(): void;
  place(objectId: string, x: number, y: number): void;
  /** Undo a placement, by its index in `HudModel.placed`. */
  removePlaced(index: number): void;
  /**
   * What a placement at this screen point *would* do — build mode's ghost.
   *
   * Screen coordinates in, because the caller is a pointer event; the snapped
   * world point comes back out so the overlay can draw the ghost where the
   * object would actually land rather than where the cursor is. Null when the
   * camera has not booted yet.
   */
  previewPlacement(objectId: string, screenX: number, screenY: number): PlacementPreview | null;
  setPrice(itemId: string, price: number): void;
  hire(roleId: string, skill: number): void;
  fire(entityId: number): void;
}
