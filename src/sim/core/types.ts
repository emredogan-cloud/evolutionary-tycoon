import type { SpeedMultiplier } from '@config/simulation';

/**
 * The persistent shape of the world.
 *
 * These containers are the save schema (TECHNICAL_ARCHITECTURE §8.1) expressed
 * as live state. Phase 2 owns the shape, the defaults, the hashing order and the
 * migration harness; the phases that introduce each system fill in the values.
 *
 * Transient state is deliberately absent — vehicles in motion, half-finished
 * orders, walking customers. They are rebuilt clean on load, which keeps a save
 * around 15 KB and keeps migrations tractable.
 */

/** Stable, monotonically increasing identity. Never reused, unlike a slot index. */
export type EntityId = number;

export type Stage = 1 | 2 | 3 | 4;

export interface PlacedObject {
  objectId: string;
  /** Footprint centre in world metres, plus height above ground. */
  x: number;
  y: number;
  z: number;
}

export interface HiredEmployee {
  entityId: EntityId;
  roleId: string;
}

/**
 * Rate controls.
 *
 * Held in the world so a save restores them and the command log replays them —
 * but deliberately excluded from `World.hash()`. Speed and pause change *when*
 * ticks happen, never *what* a tick does, and excluding them is what makes
 * "1x, 2x and 4x produce the same world" a testable statement rather than a
 * tautology. Same reasoning as the cosmetic RNG stream.
 */
export interface ControlState {
  speedMultiplier: SpeedMultiplier;
  paused: boolean;
}

export interface ProgressionState {
  stage: Stage;
  unlocks: string[];
  milestones: string[];
  /**
   * A stage whose requirements are met and which is waiting for the player —
   * Phase 11, GAME_DESIGN_DOCUMENT §25 S5.
   *
   * Zero when nothing is pending. The transition is player-confirmed rather than
   * automatic because construction disrupts the stand for twelve to thirty
   * seconds, and firing that automatically fires it at the moment the player is
   * busiest.
   */
  pendingStage: number;
}

/**
 * The building, growing — Phase 11.
 *
 * Simulation state rather than a render animation, because it *takes time in
 * the world*: the stand is disrupted while it happens, and a construction that
 * lived only in the renderer would be skippable by looking away.
 */
export interface ConstructionState {
  /** The stage being built toward, or 0 when nothing is under construction. */
  targetStage: number;
  elapsedMs: number;
  totalMs: number;
}

export interface EconomyState {
  cash: number;
  reputation: number;
  lifetimeRevenue: number;
  /** Everything ever spent on upgrades. Lifetime, so it never goes down. */
  lifetimeSpend: number;
  /** itemId → price. Balance values arrive in Phase 9; the container is Phase 2. */
  prices: Map<string, number>;
  /**
   * A sixty-second sliding window of takings and costs — Phase 9.
   *
   * Twelve five-second buckets each, written by `EconomySystem`. Simulation
   * state rather than a display statistic, because ECONOMY_DESIGN §8's
   * dead-end rule is merge-blocking and phrased in terms of net income per
   * minute — a number computed in the UI could not be asserted headlessly and
   * would read differently at 1x and 4x.
   */
  revenueWindow: Float64Array;
  expenseWindow: Float64Array;
  /** Which bucket is currently being written to. */
  bucketIndex: number;
  /** Simulation milliseconds accumulated into the current bucket. */
  bucketElapsedMs: number;
}

export interface LayoutState {
  placed: PlacedObject[];
  /**
   * Bumped on every change to `placed`, and on every stage change.
   *
   * The navigation cache watches this to decide whether to rebuild. It replaces
   * `placed.length`, which was the Phase 7 invalidation signature and which
   * **cannot see a move**: place then remove leaves the count identical and the
   * grid describing a world that no longer exists. Recorded as an open item in
   * PHASE_7_REPORT and owed to Phase 11.
   */
  revision: number;
  /** upgradeId → level. */
  upgrades: Map<string, number>;
}

export interface StaffState {
  hired: HiredEmployee[];
  /**
   * Milliseconds since wages were last settled — Phase 10.
   *
   * Accrual is per tick and exact; payment is batched, and this is the batch
   * cursor. Simulation state because it decides *when* money moves, and a
   * resumed session that restarted the cursor would give the player a few free
   * seconds of labour on every load.
   */
  settleElapsedMs: number;
}

/**
 * Traffic process state — Phase 5.
 *
 * Lives here rather than in `TrafficSpawnSystem` because `World` owns it, and a
 * system importing `World` while `World` imports the system is a cycle that
 * `dependency-cruiser` rejects. State shapes belong to the core; the systems
 * that advance them do not.
 */
/**
 * The offline meter — Phase 14.
 *
 * A five-minute sliding window over *active play*, in the image of
 * `EconomyState`'s sixty-second one: sixty five-second buckets, the bucket
 * under the cursor always the oldest, cleared as the cursor arrives. It is
 * what "son 5 dakikanın ölçülen müşteri/dk değeri" (ECONOMY_DESIGN §10)
 * concretely is — the offline reward derives from this measurement, never
 * from simulating the absence.
 *
 * **Deliberately excluded from `World.hash()`, and never persisted as a
 * window.** Nothing in a tick reads it back: it is a pure observer, and its
 * only route into an outcome is the `COLLECT_OFFLINE` command, which carries
 * explicit amounts and is logged like any other input. Hashing it would add
 * nothing to replay safety; the exclusion is proven by test the same way the
 * cosmetic stream's is.
 */
export interface OfflineMeterState {
  /** Customers who paid, per bucket — counter and drive-thru both. */
  servedWindow: Float64Array;
  /** Gross takings from those sales, per bucket. Tips included. */
  salesRevenueWindow: Float64Array;
  /** Ingredient cost of those sales, per bucket. */
  salesCogsWindow: Float64Array;
  /** Customers turned away by a full resource, per bucket. */
  turnedAwayWindow: Float64Array;
  /**
   * Occupancy fractions, per limiter, sampled once per bucket boundary.
   *
   * One flat array of `OFFLINE_LIMITERS.length × bucketCount`, indexed
   * `limiter * bucketCount + bucket`, so the whole meter stays five typed
   * arrays rather than a nest of them. A sample, not an integral — the
   * per-tick integral cost the empty-world benchmark 57% (offlineMeter.ts).
   */
  utilizationWindow: Float64Array;
  /** Which bucket is being written. Advances every OFFLINE_METER_BUCKET_MS. */
  bucketIndex: number;
  /** Simulation ms accumulated into the current bucket. */
  bucketElapsedMs: number;
}

/**
 * The day's environment — Phase 15.
 *
 * A deterministic calendar, planned once per game day from `rng.events` in a
 * **fixed number of draws** (four weather segments + three per event type),
 * which is the entire determinism argument: (seed, day) → one calendar,
 * regardless of when anybody looks. What is *currently* true — which weather,
 * which event — is derived from this plan and the clock rather than stored,
 * so it cannot drift; the two `last*` fields exist only so transitions can be
 * detected and announced once.
 *
 * Hashed and saved: an event that multiplies traffic is simulation outcome by
 * definition.
 */
/**
 * Per-tick derivation of the calendar — a cache, not state.
 *
 * Same standing as the offline meter: lives on the world for locality, never
 * hashed, never snapshotted, cannot change an outcome (every field is a pure
 * function of hashed state; the tick key makes staleness structural). It
 * exists because deriving per consumer priced at +47% on the empty-world
 * bench, and a WeakMap variant still cost a lookup per call.
 */
export interface EnvironmentDerived {
  tick: number;
  activeSlot: number;
  weather: number;
  trafficFactor: number;
  conversionFactor: number;
  speedCap: number;
  seatedBias: number;
  truckShareFactor: number;
}

export interface EnvironmentState {
  /** Game day the plan below belongs to. -1 = never planned. */
  plannedDay: number;
  /** One weather index per six-hour segment. */
  weatherSegments: Int32Array;
  /** Scheduled event type per slot, or -1 when the day skipped that type. */
  eventTypes: Int32Array;
  /** Absolute sim ms bounds per slot; meaningless where type is -1. */
  eventStartMs: Float64Array;
  eventEndMs: Float64Array;
  /** For transition detection only — see above. */
  lastWeather: number;
  lastActiveEvent: number;
}

export interface TrafficState {
  /**
   * Sim time of the next **convertible** Poisson candidate, in ms.
   *
   * Convertible and decorative traffic run as two independent processes rather
   * than one marked process, and the reason is refusals. A single process shares
   * its refusals between both populations, so congestion — which is the point of
   * decorative traffic — silently starved convertible demand down to 7.3 of the
   * 24 per minute the economy is calibrated on. Two processes, with convertible
   * arrivals claiming road space first, keep that figure intact and let the
   * decorative layer absorb every refusal.
   */
  nextCandidateMs: number;
  /** Sim time of the next decorative candidate, in ms. */
  nextDecorativeMs: number;
  /** Spawns refused because the lane head was occupied. Diagnostics only. */
  droppedSpawns: number;
  /** Of those, how many were decorative. Diagnostics only. */
  droppedDecorative: number;
}

export interface StatsState {
  customersServed: number;
  /** Vehicles that rolled and passed. Hashed, like every other lifetime count. */
  conversionsSucceeded: number;
  /** Vehicles that rolled and failed. */
  conversionsFailed: number;
  /** Converted vehicles that found no free bay and left. */
  turnedAwayNoParking: number;
  /** Customers who ran out of patience and left. */
  customersAbandoned: number;
  /**
   * Food made for somebody who left before collecting it.
   *
   * The cost of abandonment, made countable. A stand losing money to waste looks
   * exactly like one that is simply slow, until this number separates them.
   */
  ordersWasted: number;
  /** Employees who walked out because they were not paid — Phase 10. */
  employeesLeftUnpaid: number;
  /**
   * Of `customersServed`, how many came through the drive-thru — Phase 11.
   *
   * Separable because the two channels have different economics and different
   * failure modes, and "the drive-thru is carrying the restaurant" is a thing
   * the balance simulator has to be able to see.
   */
  driveThruServed: number;
  vehiclesSpawned: number;
  /**
   * Of those, how many could ever become customers.
   *
   * Decorative traffic exists so the road looks busy without moving the demand
   * figure the economy is calibrated on, so the two counts must be separable —
   * otherwise "vehicles past the restaurant" silently becomes six times the
   * number ECONOMY_DESIGN §3 budgets for.
   */
  convertibleSpawned: number;
  /**
   * Every command the world has absorbed.
   *
   * A hashed, monotonic consequence of the command log, which is what lets the
   * replay test prove commands actually landed even while the individual command
   * effects (speed, pause) are excluded from the hash.
   */
  commandsApplied: number;
  /**
   * Conversion failures by `REASON_*` index — diagnostics, and **not hashed**.
   *
   * The same reasoning as `TrafficState.droppedSpawns`: nothing reads it back,
   * so no future tick can behave differently because of it, and hashing it
   * would make the world digest sensitive to something that cannot change an
   * outcome. The aggregate counters above *are* hashed, because they sit
   * alongside `vehiclesSpawned` and `customersServed`, which always have been.
   *
   * A fixed-length array rather than a Map, so its iteration order is its index
   * order and the dev overlay can read it without allocating.
   */
  failureReasons: Uint32Array;
}

interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  /** Ambience bed level — Phase 17's fourth slider (GDD §14.9). */
  ambience: number;
}

interface A11ySettings {
  reducedMotion: boolean;
  highContrast: boolean;
}

export interface SettingsState {
  audio: AudioSettings;
  a11y: A11ySettings;
}

/**
 * What the renderer and the UI bridge are allowed to see.
 *
 * `readonly` throughout: the only way into the simulation is a `Command`, and
 * Phase 3 adds a test that freezes this object and runs 100 ticks to prove the
 * render bridge cannot write through it.
 */
/**
 * One renderable entity, as the renderer sees it.
 *
 * Flat numbers rather than a reference into a store: the render bridge must not
 * be able to reach simulation state through the object it was handed, and a
 * flat record is also what the depth sorter wants as its input.
 */
export interface ActorSnapshot {
  readonly entityId: EntityId;
  /** Footprint centre in world metres. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Which placeholder or sprite to draw — an index into the render catalogue. */
  readonly kind: number;
  /**
   * Unit facing vector in world space, added in Phase 5.
   *
   * The renderer turns it into one of eight sprite directions. Supplied by the
   * simulation rather than derived from successive positions, because a
   * difference between frames is zero whenever an actor is stopped — and a
   * stopped vehicle still faces somewhere.
   */
  readonly headingX: number;
  readonly headingY: number;
  /** Decelerating hard enough to light the brakes. Phase 5. */
  readonly braking: boolean;
  /**
   * Patience remaining as a fraction of what this actor started with, or 0.
   *
   * Phase 6. On the snapshot rather than looked up by the renderer for the same
   * reason `headingX` is: the render layer may not reach into a store, and
   * "how impatient does this person look" is a question only the simulation can
   * answer.
   */
  readonly patience: number;
  /**
   * Moving under their own power this tick.
   *
   * Supplied rather than derived from successive positions, because the
   * difference between frames is zero for an actor that is stopped *and* for one
   * the renderer has not seen before — and a walk cycle that starts a frame late
   * on every customer is exactly the kind of thing nobody can point at.
   */
  readonly moving: boolean;
  /**
   * What this actor is doing, as `@config/animation`'s ACTIVITIES index —
   * Phase 17. Derived per view from the state machines; the clip layer keys
   * off it. Always 0 for vehicles and props.
   */
  readonly activity: number;
  /**
   * Which one of this kind — a vehicle's archetype, a person's appearance.
   *
   * The renderer needs it to pick a frame, and it has nowhere else to get it:
   * `src/render` may not reach into a store, and a sedan and a van are the same
   * `kind` because they are the same *physical* thing to the simulation. Meaning
   * depends on `kind`, which is the same arrangement `kind` itself already has
   * with the render catalogue.
   *
   * For people this is a packed `Appearance` (`src/config/sprites.ts`) rolled
   * from the **cosmetic** RNG stream, which `World.hash()` deliberately excludes
   * — so two runs that differ only in who is wearing what still agree on the
   * world digest, which is the entire reason that stream exists.
   */
  readonly variant: number;
}

export interface SimView {
  readonly tick: number;
  readonly simTimeMs: number;
  readonly gameDay: number;
  readonly gameHour: number;
  readonly speedMultiplier: SpeedMultiplier;
  readonly paused: boolean;
  readonly vehicleCount: number;
  /** Current weather state index — Phase 15. Derived, never stale. */
  readonly weather: number;
  /** Active calendar event type index, or -1 — Phase 15. */
  readonly activeEventKind: number;
  /** When the active event ends, sim ms. 0 when none. */
  readonly activeEventEndsAtMs: number;
  readonly customerCount: number;
  readonly employeeCount: number;
  readonly orderCount: number;

  /**
   * Live renderable actors, in a stable order.
   *
   * The **same reusable array** every call, refreshed in place — copying it per
   * frame would put the render path on the allocator. `actorCount` says how much
   * of it is live; entries past that are stale and must not be read.
   */
  readonly actors: readonly ActorSnapshot[];
  readonly actorCount: number;

  /**
   * Upgrade levels, aligned to `UPGRADES` — Phase 9.
   *
   * The renderer needs them to draw the objects a purchase puts in the world,
   * and it cannot read `world.layout.upgrades` (it never touches the world). A
   * reused array, like `actors`.
   */
  readonly upgradeLevels: readonly number[];
  /**
   * Changes whenever any level does. The renderer rebuilds its statics on a
   * change rather than diffing the array every frame — a purchase happens a
   * handful of times a session and the comparison would run sixty times a second
   * forever.
   */
  readonly upgradeRevision: number;

  /**
   * The audio mix, for the director — Phase 17. A stable sub-object refreshed
   * in place like `actors`; the renderer multiplies these, never writes them
   * (SET_AUDIO is the only way in).
   */
  readonly audioSettings: {
    readonly master: number;
    readonly music: number;
    readonly sfx: number;
    readonly ambience: number;
    readonly muted: boolean;
  };

  /**
   * The evolution stage, 1..4 — Phase 11.
   *
   * The renderer needs it because the lot is not the same lot at every stage:
   * the building grows, the car park doubles, tables appear and Stage 4 adds a
   * drive-thru lane. It cannot read `world.progression` directly (it never
   * touches the world), and it cannot infer the stage from anything else in the
   * view.
   */
  readonly stage: number;
}
