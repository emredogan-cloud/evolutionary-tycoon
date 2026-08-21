import { STARTING_REPUTATION } from '@config/satisfaction';
import { CONVERSION_REASONS } from '@config/conversion';
import { ECONOMY_BUCKET_COUNT } from '@config/economy/tuning';
import { OFFLINE_LIMITERS, OFFLINE_METER_BUCKET_COUNT } from '@config/economy/offline';
import { EVENT_SPECS } from '@config/events';
import { WEATHER_SEGMENTS_PER_DAY } from '@config/weather';
import {
  DEFAULT_SPEED_MULTIPLIER,
  ENTITY_CAPACITY,
  DEFAULT_GAME_START_HOUR,
  HOURS_PER_GAME_DAY,
  MS_PER_GAME_DAY,
} from '@config/simulation';
import { Hasher } from '../math/hash';
import type { OrderRecord } from '../stores/OrderStore';
import { createOrderPool, writeOrder } from '../stores/OrderStore';
import type { EmployeeRecord } from '../stores/employees';
import { createEmployeePool, writeEmployee } from '../stores/employees';
import type { TaskRecord } from '../stores/TaskStore';
import { createTaskPool, writeTask } from '../stores/TaskStore';
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
  EnvironmentDerived,
  EnvironmentState,
  ConstructionState,
  LayoutState,
  OfflineMeterState,
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
  readonly employees: SlotPool<EmployeeRecord>;
  /**
   * Open work — Phase 10.
   *
   * Sized generously against the employee cap: the board holds work that has
   * not been claimed as well as work in progress, and a board that filled would
   * silently stop posting, which reads as employees standing around.
   */
  readonly tasks: SlotPool<TaskRecord>;
  readonly orders: SlotPool<OrderRecord>;

  /** Per-tick event queue. Empty at every tick boundary, so it is not hashed. */
  readonly eventQueue = new EventQueue();

  readonly control: ControlState = {
    speedMultiplier: DEFAULT_SPEED_MULTIPLIER,
    paused: false,
  };

  readonly progression: ProgressionState = { stage: 1, unlocks: [], milestones: [], pendingStage: 0 };
  readonly economy: EconomyState = {
    cash: 0,
    reputation: STARTING_REPUTATION,
    lifetimeRevenue: 0,
    lifetimeSpend: 0,
    prices: new Map<string, number>(),
    revenueWindow: new Float64Array(ECONOMY_BUCKET_COUNT),
    expenseWindow: new Float64Array(ECONOMY_BUCKET_COUNT),
    bucketIndex: 0,
    bucketElapsedMs: 0,
  };
  /**
   * The offline measurement window — Phase 14. Not hashed, not snapshotted;
   * see the interface's own comment and the exclusion test beside the
   * cosmetic stream's.
   */
  readonly offline: OfflineMeterState = {
    servedWindow: new Float64Array(OFFLINE_METER_BUCKET_COUNT),
    salesRevenueWindow: new Float64Array(OFFLINE_METER_BUCKET_COUNT),
    salesCogsWindow: new Float64Array(OFFLINE_METER_BUCKET_COUNT),
    turnedAwayWindow: new Float64Array(OFFLINE_METER_BUCKET_COUNT),
    utilizationWindow: new Float64Array(OFFLINE_LIMITERS.length * OFFLINE_METER_BUCKET_COUNT),
    bucketIndex: 0,
    bucketElapsedMs: 0,
  };
  readonly layout: LayoutState = { placed: [], revision: 0, upgrades: new Map<string, number>() };
  readonly construction: ConstructionState = { targetStage: 0, elapsedMs: 0, totalMs: 0 };
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
  readonly staff: StaffState = { hired: [], settleElapsedMs: 0 };
  /** Calendar derivation cache — see EnvironmentDerived. Not hashed, not saved. */
  readonly environmentDerived: EnvironmentDerived = {
    tick: -1,
    activeSlot: -1,
    weather: 0,
    trafficFactor: 1,
    conversionFactor: 1,
    speedCap: 1,
    seatedBias: 0,
    truckShareFactor: 1,
  };
  /** The deterministic calendar — Phase 15. Hashed and saved. */
  readonly environment: EnvironmentState = {
    plannedDay: -1,
    weatherSegments: new Int32Array(WEATHER_SEGMENTS_PER_DAY),
    eventTypes: new Int32Array(EVENT_SPECS.length).fill(-1),
    eventStartMs: new Float64Array(EVENT_SPECS.length),
    eventEndMs: new Float64Array(EVENT_SPECS.length),
    lastWeather: -1,
    lastActiveEvent: -1,
  };
  readonly stats: StatsState = {
    customersServed: 0,
    conversionsSucceeded: 0,
    conversionsFailed: 0,
    turnedAwayNoParking: 0,
    customersAbandoned: 0,
    ordersWasted: 0,
    employeesLeftUnpaid: 0,
    driveThruServed: 0,
    vehiclesSpawned: 0,
    convertibleSpawned: 0,
    commandsApplied: 0,
    failureReasons: new Uint32Array(CONVERSION_REASONS.length),
  };
  readonly settings: SettingsState = {
    audio: { master: 1, music: 1, sfx: 1, muted: false, ambience: 1 },
    a11y: { reducedMotion: false, highContrast: false },
  };

  /** Index of the tick about to run. Incremented at the end of each tick. */
  tick = 0;

  private nextId: EntityId = 1;

  /** Reused so `hash()` allocates nothing beyond the returned string. */
  private readonly hasher = new Hasher();

  constructor(options: WorldOptions) {
    this.seed = options.seed;
    this.clock = new Clock({ simTimeMs: (DEFAULT_GAME_START_HOUR / HOURS_PER_GAME_DAY) * MS_PER_GAME_DAY });
    this.rng = new RngStreams(options.seed);

    const caps = options.capacities ?? {};
    this.vehicles = new VehicleStore(caps.vehicles ?? ENTITY_CAPACITY.vehicles);
    this.customers = createCustomerPool(caps.customers ?? ENTITY_CAPACITY.customers);
    this.employees = createEmployeePool(caps.employees ?? ENTITY_CAPACITY.employees);
    this.tasks = createTaskPool((caps.employees ?? ENTITY_CAPACITY.employees) * 8);
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
    this.employees.hashInto(h, writeEmployee);
    this.tasks.hashInto(h, writeTask);
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
    h.writeU32(this.layout.revision);
    hashStringNumberMap(h, this.layout.upgrades);

    h.writeU8(this.progression.pendingStage);
    h.writeU8(this.construction.targetStage);
    h.writeF64(this.construction.elapsedMs);
    h.writeF64(this.construction.totalMs);

    h.writeU32(this.staff.hired.length);
    for (const employee of this.staff.hired) {
      h.writeI32(employee.entityId);
      h.writeString(employee.roleId);
    }

    h.writeU32(this.environment.plannedDay >>> 0);
    for (const segment of this.environment.weatherSegments) h.writeU32(segment >>> 0);
    for (const type of this.environment.eventTypes) h.writeU32(type >>> 0);
    for (const start of this.environment.eventStartMs) h.writeF64(start);
    for (const end of this.environment.eventEndMs) h.writeF64(end);
    h.writeU32(this.environment.lastWeather >>> 0);
    h.writeU32(this.environment.lastActiveEvent >>> 0);

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
    h.writeF64(this.settings.audio.ambience);
    h.writeBool(this.settings.a11y.reducedMotion);
    h.writeBool(this.settings.a11y.highContrast);

    return h.digest();
  }

  /** Back to a freshly seeded state, without reallocating any store. */
  reset(): void {
    this.tick = 0;
    this.nextId = 1;
    // Back to the fresh-world opening hour, not to midnight — reset must
    // reproduce construction exactly or the pristine-digest test lies.
    this.clock.setState({ simTimeMs: (DEFAULT_GAME_START_HOUR / HOURS_PER_GAME_DAY) * MS_PER_GAME_DAY });
    this.rng.loadStates(new RngStreams(this.seed).saveStates());
    this.vehicles.reset();
    this.customers.reset();
    this.employees.reset();
    this.tasks.reset();
    this.orders.reset();
    this.eventQueue.reset();

    this.control.speedMultiplier = DEFAULT_SPEED_MULTIPLIER;
    this.control.paused = false;

    this.progression.stage = 1;
    this.progression.unlocks.length = 0;
    this.progression.milestones.length = 0;

    this.economy.cash = 0;
    this.economy.reputation = STARTING_REPUTATION;
    this.economy.lifetimeRevenue = 0;
    this.economy.lifetimeSpend = 0;
    this.economy.prices.clear();
    this.economy.revenueWindow.fill(0);
    this.economy.expenseWindow.fill(0);
    this.economy.bucketIndex = 0;
    this.economy.bucketElapsedMs = 0;

    this.offline.servedWindow.fill(0);
    this.offline.salesRevenueWindow.fill(0);
    this.offline.salesCogsWindow.fill(0);
    this.offline.turnedAwayWindow.fill(0);
    this.offline.utilizationWindow.fill(0);
    this.offline.bucketIndex = 0;
    this.offline.bucketElapsedMs = 0;

    this.layout.placed.length = 0;
    this.layout.revision = 0;
    this.layout.upgrades.clear();
    this.progression.pendingStage = 0;
    this.construction.targetStage = 0;
    this.construction.elapsedMs = 0;
    this.construction.totalMs = 0;

    this.traffic.nextCandidateMs = 0;
    this.traffic.nextDecorativeMs = 0;
    this.traffic.droppedSpawns = 0;
    this.traffic.droppedDecorative = 0;

    this.staff.hired.length = 0;
    this.staff.settleElapsedMs = 0;

    this.environment.plannedDay = -1;
    this.environment.weatherSegments.fill(0);
    this.environment.eventTypes.fill(-1);
    this.environment.eventStartMs.fill(0);
    this.environment.eventEndMs.fill(0);
    this.environment.lastWeather = -1;
    this.environment.lastActiveEvent = -1;
    this.environmentDerived.tick = -1;

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
    this.settings.audio.ambience = 1;
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
