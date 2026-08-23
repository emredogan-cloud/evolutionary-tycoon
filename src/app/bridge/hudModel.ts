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
  /**
   * A bought rung still going up — the correction pass. The card shows the
   * countdown and refuses a second purchase until the site completes.
   */
  readonly building: boolean;
  readonly buildRemainingMs: number;
  readonly worldChange: string;
  readonly consequence: string;
  readonly effects: readonly UpgradeEffectView[];
  readonly screenX: number;
  readonly screenY: number;
  readonly visible: boolean;

  // ── Phase 13's tree ──────────────────────────────────────────────────────
  /** One of the design's five families — GAME_DESIGN_DOCUMENT §13.2. */
  readonly family: string;
  /** The stage it becomes available at. */
  readonly stage: number;
  /**
   * Whether the player can buy it at all yet, ignoring money.
   *
   * Separate from `affordable` because they are different problems with
   * different answers: one is solved by waiting and one by doing something else
   * first, and a card that says only "you cannot buy this" tells the player
   * neither.
   */
  readonly unlocked: boolean;
  /** Prerequisites still missing, by id. Empty when `unlocked`. */
  readonly missingPrereqs: readonly string[];
  /** The player level this rung asks for (1 = never asked). */
  readonly requiredLevel: number;
  /** True when only the player level still blocks it. */
  readonly levelLocked: boolean;
  /**
   * How much more money is needed, or 0.
   *
   * The roadmap asks the card to answer "ne kadar eksik" — how much short. A
   * player looking at a price they cannot meet is doing this subtraction in
   * their head anyway.
   */
  readonly shortBy: number;
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
  /**
   * Share of the last minute or so spent moving or working, 0..1.
   *
   * An observation made in the bridge, not simulation state — nothing reads
   * it back and it is not hashed. It exists because "why is my cook standing
   * there" deserves a number: measured at Stage 1 a cook is idle 97.7% of a
   * session, and while the player is also cooking it adds nothing at all to
   * throughput. A panel that offers the hire should say so.
   */
  readonly busy01: number;
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
/**
 * One live order, for the order cards — the manual loop's whole surface.
 *
 * `state` is the simulation's own five-state machine verbatim; the card never
 * invents a sixth. `startable` is the kitchen's current answer ("a station of
 * the right type is free"), so the button and the command agree by
 * construction.
 */
export interface OrderCardView {
  slot: number;
  itemId: string;
  state: 'PLACED' | 'COOKING' | 'ON_PASS' | 'DELIVERED' | 'PAID';
  /** Sim ms since it was placed. */
  ageMs: number;
  /** Remaining patience of its customer, 0..1 — or -1 once they are seated/gone. */
  patience01: number;
  startable: boolean;
  /**
   * Whether the player may hand this tray over themselves.
   *
   * True for the tray at the head of the pass queue at a **counter** stage.
   * A dining room is carried rather than handed over, so from Stage 3 this is
   * false for everything and the card shows what the order is worth instead of
   * a button that would refuse.
   */
  servable: boolean;
  price: number;
  /** 0..1 cook progress while COOKING, else 0. */
  cook01: number;
  /**
   * Simulation milliseconds left on the preparation, or 0.
   *
   * The directive asks the card to say "18 sn", and a countdown is only worth
   * showing if it is the *simulation's* countdown: at 4x it has to run four
   * times faster and a paused world has to hold it, which a wall-clock timer
   * in the overlay could not do.
   */
  cookRemainingMs: number;
}

/** The player level — derived in the sim from hashed counters, read here. */
export interface PlayerLevelView {
  level: number;
  xp: number;
  levelFloor: number;
  nextLevelXp: number;
}

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
  /** Every property, in the order the interface shows them. */
  readonly properties: readonly PropertyView[];
  /** How much of `placed` is live; entries past it are stale. */
  readonly placedCount: number;
  readonly markerCount: number;

  /** The audio mix and motion preference — Phase 17's settings panel reads these. */
  readonly audio: {
    readonly master: number;
    readonly music: number;
    readonly sfx: number;
    readonly ambience: number;
    readonly muted: boolean;
  };
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;

  /**
   * The Conversion Analytics feed — GDD §14.4's signature panel. Reason
   * indices follow `CONVERSION_REASONS`; it states what happened, never what
   * to do.
   */
  readonly analytics: {
    readonly sampleSize: number;
    readonly converted: number;
    readonly reasonCounts: number[];
  };
  /** Player-pause veil visibility — false for harness-paused boots. */
  readonly showPauseVeil: boolean;
  /** The right-edge strip — self-dismissing, stackable, never modal. */
  readonly notices: readonly { readonly id: number; readonly kind: string; readonly text: string }[];

  /** Takings less costs over the last sixty seconds, per minute — Phase 9. */
  readonly incomePerMinute: number;
  /**
   * Live orders, oldest first — reused array, `orderCount` says how much is
   * live. PAID orders leave the list the sample after they resolve.
   */
  readonly orders: readonly OrderCardView[];
  readonly orderCount: number;
  /** Player level and XP — distinct from the restaurant stage on purpose. */
  readonly level: PlayerLevelView;
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

  // ── The sky and the calendar — Phase 15 ─────────────────────────────────
  /** `CLEAR` | `OVERCAST` | `RAIN` | `SNOW`, plus its Türkçe label. */
  readonly weatherId: string;
  readonly weatherLabel: string;
  /** Active event's id and label, or empty strings when the road is ordinary. */
  readonly eventId: string;
  readonly eventLabel: string;
  /** Sim ms remaining on the event, for the strip's countdown. 0 when none. */
  readonly eventRemainingMs: number;
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
 * ways a placement fails need different sentences — "that is off the lot" and
 * "that would trap your customers" are not the same mistake, and since the
 * store arrived neither is "that has to go by the road".
 */
export interface PlacementPreview {
  readonly outcome: 'ok' | 'outside-lot' | 'blocks-navigation' | 'occupied' | 'full' | 'wrong-zone';
  /** The snapped world cell, in metres. */
  readonly worldX: number;
  readonly worldY: number;
  /** That cell, projected back to the overlay. */
  readonly screenX: number;
  readonly screenY: number;
}

/**
 * One property, as the inspect card sees it — the restaurant evolution system.
 *
 * Everything here is read out of the simulation on the sample that produced it:
 * the level from the ladder it derives from, the capacity and its usage from
 * the world, the price from config at the moment it is offered. The card shows
 * numbers, so the numbers have to be the simulation's own — a benefit invented
 * in a component is exactly what §39's "DO NOT SHOW FAKE BENEFITS" forbids.
 */
export interface PropertyView {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly level: number;
  readonly maxLevel: number;
  /** True while a site is raising this property. */
  readonly building: boolean;
  /** 0..1 through that site, and the simulation ms left on it. */
  readonly buildProgress: number;
  readonly buildRemainingMs: number;

  /** What it provides now, and how much is in use. -1 capacity = not countable. */
  readonly capacity: number;
  readonly used: number;
  readonly unit: string;

  /** What this level is called — "Yol kenarı tezgâhı", "5 araç". */
  readonly levelLabel: string;
  /** What the next level would be called, or '' at the ceiling. */
  readonly nextLabel: string;

  /** -1 when there is no next level to buy. */
  readonly nextCost: number;
  readonly nextBuildMs: number;
  /** The restaurant stage the next level needs. */
  readonly nextStage: number;
  /** Empty when the next level can be bought right now. */
  readonly lockReason: string;
  /**
   * How the next level's picture exists — `sprite`, `prompted` or `procedural`.
   *
   * The preview must never show the current asset as if it were the next one
   * (§17). `sprite` is the only value that licenses drawing `nextAsset`;
   * `prompted` says the art is still being made, and `procedural` says there
   * will never be a sprite because the thing is painted from the layout.
   */
  readonly nextArt: 'sprite' | 'prompted' | 'procedural';
  /** How many cells a `procedural` next level paints — its whole picture. */
  readonly nextCells: number;
  /** The same count at the level that is already built, so the preview can
   * shade the difference rather than just showing a bigger number. */
  readonly cells: number;
  /** The `WORLD_OBJECTS` id drawn for this level and for the next, or ''. */
  readonly levelAsset: string;
  readonly nextAsset: string;

  /** The world anchor, already projected. */
  readonly screenX: number;
  readonly screenY: number;
  readonly visible: boolean;
}

/** A placed object, for build mode's list. */
export interface PlacedView {
  readonly objectId: string;
  readonly worldX: number;
  readonly worldY: number;
  /**
   * The catalogue entry it was bought as, or `''` for anything the player did
   * not buy from the store — see `PlacedObject.itemId`. The store panel needs
   * it to name what it is offering to move or sell back, and an empty string
   * rather than an absent field keeps the reused row buffers a fixed shape.
   */
  readonly itemId: string;
  /** A functional building's level, or 0 — see `PlacedObject.level`. */
  readonly level: number;
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
  /** Start preparing an order — the manual loop. -1 means "the next startable". */
  prep(orderSlot: number): void;
  /**
   * Hand a finished tray to the person waiting for it. -1 means "the one that
   * has been ready longest".
   *
   * The player's half of the service loop since 2026-08-23. Before that a
   * counter stage delivered by itself, so hiring a cook left the player with no
   * action at all — see `docs/COOK_PLAYER_INTERACTION_DESIGN.md`.
   */
  serve(orderSlot: number): void;
  /**
   * Raise a property one level.
   *
   * The card calls this for every property; `src/app` decides which command it
   * becomes. A property with its own ladder gets `UPGRADE_PROPERTY`; a derived
   * one gets `BUY_UPGRADE` for the rung it reads its level from; the main
   * building gets `EVOLVE`. One verb in the interface, three doors behind it,
   * and none of them a second economy.
   */
  upgradeProperty(id: string): void;
  /** Simulation speed, through the same command door as everything else. */
  setSpeed(mult: 1 | 2 | 4): void;
  /** Confirm the stage transition the player has been offered. */
  evolve(): void;
  place(objectId: string, x: number, y: number): void;
  /**
   * Buy a store item and put it down, in one act — the stage-1 expansion pass.
   *
   * The catalogue id, never an object id: what the player bought is the thing
   * that travels, and the only place that maps an item to the object drawn for
   * it is the catalogue itself. A verb that took both would be two sources of
   * truth for one identity, which is the shape the sign-becomes-flower bug had.
   */
  buyPlace(itemId: string, x: number, y: number): void;
  /** Pick a placed object up and set it down elsewhere, identity intact. */
  movePlaced(index: number, x: number, y: number): void;
  /** Raise a placed functional building one level, in place. */
  upgradeBuilding(index: number): void;
  /** Sell a placement back, by its index in `HudModel.placed`. */
  removePlaced(index: number): void;
  /**
   * What placing this catalogue item at this screen point *would* do — the
   * ghost.
   *
   * Screen coordinates in, because the caller is a pointer event; the snapped
   * world point comes back out so the overlay can draw the ghost where the
   * object would actually land rather than where the cursor is. Null when the
   * camera has not booted yet.
   *
   * Takes the item rather than the object so the verdict includes the zone
   * rule — a roadside sign hovering over the back field has to read as refused
   * *before* the click, exactly like one that would block a doorway. Pass an
   * empty `itemId` to ask about bare geometry.
   */
  previewPlacement(itemId: string, screenX: number, screenY: number): PlacementPreview | null;
  setPrice(itemId: string, price: number): void;
  hire(roleId: string, skill: number): void;
  /** Move one audio slider — Phase 17. */
  setAudio(channel: 'master' | 'music' | 'sfx' | 'ambience', value: number): void;
  setMuted(muted: boolean): void;
  setReducedMotion(on: boolean): void;
  setPaused(paused: boolean): void;
  setHighContrast(on: boolean): void;
  fire(entityId: number): void;
}
