import { ACTOR_KIND_EMPLOYEE } from '@config/actors';
import { CONVERSION_REASONS } from '@config/conversion';
import { ECONOMY_BUCKET_COUNT } from '@config/economy/tuning';
import { DEFAULT_SPEED_MULTIPLIER, ENTITY_CAPACITY } from '@config/simulation';
import { Hasher } from '../math/hash';
import type { ActorRecord } from '../stores/actors';
import { createActorPool, writeActor } from '../stores/actors';
import type { OrderRecord } from '../stores/OrderStore';
import { createOrderPool, writeOrder } from '../stores/OrderStore';
import type { CustomerRecord } from '../stores/customers';
import { createCustomerPool, writeCustomer } from '../stores/customers';
import type { SlotPool } from '../stores/pool';
import { VehicleStore } from '../stores/VehicleStore';
import { Clock } from './Clock';
import { EventQueue } from './EventBus';
import { COSMETIC_STREAM, RNG_STREAM_NAMES, RngStreams } from './Rng';
import type {
  ControlState,
  EconomyState,
  EntityId,
  LayoutState,
  ProgressionState,
  SettingsState,
  StaffState,
  StatsState,
  TrafficState,
} from './types';

export interface WorldOptions {
  readonly seed: number;
  readonly capacities?: {
    readonly vehicles?: number;
    readonly customers?: number;
    readonly employees?: number;
    readonly orders?: number;
  };
}

/**
 * The entire mutable simulation state.
 *
 * A container, not a controller: `Sim` drives it, systems mutate it, and nothing
 * outside `src/sim` may write to it. Its defining feature is `hash()` — a stable
 * digest of everything that can affect a simulation outcome, and of nothing else.
 */
export class World {
  readonly seed: number;
  readonly clock: Clock;
  readonly rng: RngStreams;

  readonly vehicles: VehicleStore;
  readonly customers: SlotPool<CustomerRecord>;
  readonly employees: SlotPool<ActorRecord>;
  readonly orders: SlotPool<OrderRecord>;

  /** Per-tick event queue. Empty at every tick boundary, so it is not hashed. */
  readonly eventQueue = new EventQueue();

  readonly control: ControlState = {
    speedMultiplier: DEFAULT_SPEED_MULTIPLIER,
    paused: false,
  };

  readonly progression: ProgressionState = { stage: 1, unlocks: [], milestones: [] };
  readonly economy: EconomyState = {
    cash: 0,
    reputation: 0,
    lifetimeRevenue: 0,
    lifetimeSpend: 0,
    prices: new Map<string, number>(),
    revenueWindow: new Float64Array(ECONOMY_BUCKET_COUNT),
    expenseWindow: new Float64Array(ECONOMY_BUCKET_COUNT),
    bucketIndex: 0,
    bucketElapsedMs: 0,
  };
  readonly layout: LayoutState = { placed: [], upgrades: new Map<string, number>() };
  /**
   * Traffic process state — Phase 5.
   *
   * Only `nextCandidateMs` affects an outcome, and it must survive a save: a
   * game resumed mid-day that re-rolled its next arrival would produce different
   * traffic from the same seed, which breaks Day Replay.
   */
  readonly traffic: TrafficState = {
    nextCandidateMs: 0,
    nextDecorativeMs: 0,
    droppedSpawns: 0,
    droppedDecorative: 0,
  };
  readonly staff: StaffState = { hired: [] };
  readonly stats: StatsState = {
    customersServed: 0,
    conversionsSucceeded: 0,
    conversionsFailed: 0,
    turnedAwayNoParking: 0,
    customersAbandoned: 0,
    ordersWasted: 0,
    vehiclesSpawned: 0,
    convertibleSpawned: 0,
    commandsApplied: 0,
    failureReasons: new Uint32Array(CONVERSION_REASONS.length),
  };
  readonly settings: SettingsState = {
    audio: { master: 1, music: 1, sfx: 1, muted: false },
    a11y: { reducedMotion: false, highContrast: false },
  };

  /** Index of the tick about to run. Incremented at the end of each tick. */
  tick = 0;

  private nextId: EntityId = 1;

  /** Reused so `hash()` allocates nothing beyond the returned string. */
  private readonly hasher = new Hasher();

  constructor(options: WorldOptions) {
    this.seed = options.seed;
    this.clock = new Clock();
    this.rng = new RngStreams(options.seed);

    const caps = options.capacities ?? {};
    this.vehicles = new VehicleStore(caps.vehicles ?? ENTITY_CAPACITY.vehicles);
    this.customers = createCustomerPool(caps.customers ?? ENTITY_CAPACITY.customers);
    this.employees = createActorPool(caps.employees ?? ENTITY_CAPACITY.employees, ACTOR_KIND_EMPLOYEE);
    this.orders = createOrderPool(caps.orders ?? ENTITY_CAPACITY.orders);
  }

  /**
   * Allocate a fresh entity identity.
   *
   * Monotonic and never recycled, unlike slot indices. A renderer that holds an
   * id for an entity that has since despawned gets a miss rather than someone
   * else's data — the classic source of "the sprite jumped to another car".
   */
  allocateEntityId(): EntityId {
    const id = this.nextId;
    this.nextId++;
    return id;
  }

  get nextEntityId(): EntityId {
    return this.nextId;
  }

  setNextEntityId(value: EntityId): void {
    this.nextId = value;
  }

  /**
   * Stable digest of everything that can affect a simulation outcome.
   *
   * Three things are excluded, each for a reason that is itself under test:
   *
   * - the `cosmetic` RNG stream — visual variation must never move the economy;
   * - `control.speedMultiplier` / `control.paused` — they change when ticks
   *   happen, not what a tick does;
   * - the event queue — it is empty at every tick boundary by construction.
   *
   * Everything else is written in a fixed order with raw IEEE-754 bytes, so a
   * one-bit divergence after 10 000 ticks changes the digest.
   */
  hash(): string {
    const h = this.hasher.reset();

    h.writeU32(this.tick);
    h.writeF64(this.clock.simTimeMs);
    h.writeI32(this.nextId);

    for (const name of RNG_STREAM_NAMES) {
      if (name === COSMETIC_STREAM) continue;
      const state = this.rng.get(name).saveState();
      h.writeI32(state.a);
      h.writeI32(state.b);
      h.writeI32(state.c);
      h.writeI32(state.d);
    }

    this.vehicles.hashInto(h);

    /*
     * The Poisson cursor is hashed because it decides every future arrival: two
     * worlds identical in every other respect but differing here will diverge on
     * the next tick. `droppedSpawns` is NOT hashed — it is a diagnostic counter
     * that nothing reads back, and hashing it would make the digest sensitive to
     * something that cannot change an outcome.
     */
    h.writeF64(this.traffic.nextCandidateMs);
    h.writeF64(this.traffic.nextDecorativeMs);
    this.customers.hashInto(h, writeCustomer);
    this.employees.hashInto(h, writeActor);
    this.orders.hashInto(h, writeOrder);

    h.writeU8(this.progression.stage);
    hashStringList(h, this.progression.unlocks);
    hashStringList(h, this.progression.milestones);

    h.writeF64(this.economy.cash);
    h.writeF64(this.economy.reputation);
    h.writeF64(this.economy.lifetimeRevenue);
    h.writeF64(this.economy.lifetimeSpend);
    hashStringNumberMap(h, this.economy.prices);
    /*
     * The income window is hashed. It is derived from payments that are already
     * in the digest, so it cannot diverge on its own — but it is *read* by the
     * dead-end rule and will be read by objectives in Phase 11, so a divergence
     * in it would change an outcome, and anything that can change an outcome
     * belongs in the digest (the same test that justifies the three deliberate
     * exclusions applies here in reverse).
     */
    for (const value of this.economy.revenueWindow) h.writeF64(value);
    for (const value of this.economy.expenseWindow) h.writeF64(value);
    h.writeU32(this.economy.bucketIndex);
    h.writeF64(this.economy.bucketElapsedMs);

    h.writeU32(this.layout.placed.length);
    for (const object of this.layout.placed) {
      h.writeString(object.objectId);
      h.writeF64(object.x);
      h.writeF64(object.y);
      h.writeF64(object.z);
    }
    hashStringNumberMap(h, this.layout.upgrades);

    h.writeU32(this.staff.hired.length);
    for (const employee of this.staff.hired) {
      h.writeI32(employee.entityId);
      h.writeString(employee.roleId);
    }

    h.writeU32(this.stats.customersServed);
    h.writeU32(this.stats.conversionsSucceeded);
    h.writeU32(this.stats.conversionsFailed);
    h.writeU32(this.stats.turnedAwayNoParking);
    h.writeU32(this.stats.customersAbandoned);
    h.writeU32(this.stats.ordersWasted);
    h.writeU32(this.stats.vehiclesSpawned);
    h.writeU32(this.stats.convertibleSpawned);
    h.writeU32(this.stats.commandsApplied);

    h.writeF64(this.settings.audio.master);
    h.writeF64(this.settings.audio.music);
    h.writeF64(this.settings.audio.sfx);
    h.writeBool(this.settings.audio.muted);
    h.writeBool(this.settings.a11y.reducedMotion);
    h.writeBool(this.settings.a11y.highContrast);

    return h.digest();
  }

  /** Back to a freshly seeded state, without reallocating any store. */
  reset(): void {
    this.tick = 0;
    this.nextId = 1;
    this.clock.reset();
    this.rng.loadStates(new RngStreams(this.seed).saveStates());
    this.vehicles.reset();
    this.customers.reset();
    this.employees.reset();
    this.orders.reset();
    this.eventQueue.reset();

    this.control.speedMultiplier = DEFAULT_SPEED_MULTIPLIER;
    this.control.paused = false;

    this.progression.stage = 1;
    this.progression.unlocks.length = 0;
    this.progression.milestones.length = 0;

    this.economy.cash = 0;
    this.economy.reputation = 0;
    this.economy.lifetimeRevenue = 0;
    this.economy.lifetimeSpend = 0;
    this.economy.prices.clear();
    this.economy.revenueWindow.fill(0);
    this.economy.expenseWindow.fill(0);
    this.economy.bucketIndex = 0;
    this.economy.bucketElapsedMs = 0;

    this.layout.placed.length = 0;
    this.layout.upgrades.clear();

    this.traffic.nextCandidateMs = 0;
    this.traffic.nextDecorativeMs = 0;
    this.traffic.droppedSpawns = 0;
    this.traffic.droppedDecorative = 0;

    this.staff.hired.length = 0;

    this.stats.customersServed = 0;
    this.stats.conversionsSucceeded = 0;
    this.stats.conversionsFailed = 0;
    this.stats.turnedAwayNoParking = 0;
    this.stats.customersAbandoned = 0;
    this.stats.ordersWasted = 0;
    this.stats.failureReasons.fill(0);
    this.stats.vehiclesSpawned = 0;
    this.stats.convertibleSpawned = 0;
    this.stats.commandsApplied = 0;

    this.settings.audio.master = 1;
    this.settings.audio.music = 1;
    this.settings.audio.sfx = 1;
    this.settings.audio.muted = false;
    this.settings.a11y.reducedMotion = false;
    this.settings.a11y.highContrast = false;
  }
}

function hashStringList(h: Hasher, values: readonly string[]): void {
  h.writeU32(values.length);
  for (const value of values) h.writeString(value);
}

/**
 * Insertion order of a `Map` is well defined, but two worlds that reached the
 * same set of prices by different routes are the same world. Sorting the keys
 * makes the digest depend on content rather than on history.
 */
function hashStringNumberMap(h: Hasher, map: ReadonlyMap<string, number>): void {
  h.writeU32(map.size);
  if (map.size === 0) return;
  const keys = [...map.keys()].sort();
  for (const key of keys) {
    h.writeString(key);
    h.writeF64(map.get(key) ?? 0);
  }
}
