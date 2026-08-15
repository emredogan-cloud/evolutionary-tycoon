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
}

/**
 * The subscription contract, deliberately the same shape Svelte stores use.
 *
 * A component can write `$hud` against this without the bridge importing Svelte,
 * and without `src/app` growing a framework dependency it would then have to
 * keep in step with the one `src/ui` uses.
 */
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
  setPrice(itemId: string, price: number): void;
}
