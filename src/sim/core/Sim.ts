import { euclidean } from '../math/length';
import { TICK_MS } from '@config/simulation';
import { UPGRADES } from '@config/economy/upgrades';
import { createDefaultSystems } from '../systems/noop';
import { CommandLog } from './CommandLog';
import type { Command, CommandInput } from './commands';
import { apply, stampCommand } from './commands';
import { EventBus } from './EventBus';
import type { SimSystem } from './SystemPipeline';
import { SystemPipeline } from './SystemPipeline';
import { activeEventSlot, currentWeather } from '../systems/EventSystem';
import { ACTOR_KIND_VEHICLE } from '@config/actors';
import {
  ACTIVITY_ANGRY,
  ACTIVITY_CLEAN,
  ACTIVITY_COOK,
  ACTIVITY_EAT,
  ACTIVITY_IDLE,
  ACTIVITY_PAY,
  ACTIVITY_SERVE,
  ACTIVITY_TAKE_ORDER,
  ACTIVITY_WAIT_IMPATIENT,
  ACTIVITY_WALK,
  ACTIVITY_WALK_CARRY,
  IMPATIENT_PATIENCE_FRACTION,
} from '@config/animation';
import { TASK_KINDS } from '@config/employees';
import type { EmployeeRecord } from '../stores/employees';
import {
  STATE_ABANDONING,
  STATE_EATING,
  STATE_LEAVING_ANGRY,
  STATE_ORDERING,
  STATE_PAYING,
  STATE_QUEUEING_AT_COUNTER,
  STATE_WAITING_FOR_FOOD,
} from '../ai/fsm/customerFsm';

/** Brain state 2 — `BRAIN_STATES` in the employee store. */
const EMPLOYEE_STATE_PERFORMING = 2;
const TASK_KIND_PREP = TASK_KINDS.indexOf('PREP_ORDER');
const TASK_KIND_DELIVER = TASK_KINDS.indexOf('DELIVER_ORDER');
const TASK_KIND_CLEAN = TASK_KINDS.indexOf('CLEAN_TABLE');
import { ARRIVAL_EPSILON_METRES } from '@config/customer';
import { BRAKE_LIGHT_DECEL } from '@config/traffic';
import { stageManeuverSystem } from '../systems/noop';
import type { VehicleManeuverSystem } from '../systems/VehicleManeuverSystem';
import type { CustomerRecord } from '../stores/customers';
import type { LaneSample } from '../nav/spline';
import type { ActorSnapshot, SimView } from './types';
import { World } from './World';
import type { WorldOptions } from './World';

type MutableActorSnapshot = { -readonly [K in keyof ActorSnapshot]: ActorSnapshot[K] };

export interface SimOptions extends WorldOptions {
  /** Overridden only by tests that need to observe or stub a slot. */
  readonly systems?: readonly SimSystem[];
  readonly commandLogCapacity?: number;
  /**
   * Start paused, before any tick has run.
   *
   * Initial state rather than a command: it must take effect at tick 0, and a
   * command cannot — commands land at the *start of a tick*, so dispatching one
   * would already have advanced the world. This is what lets a test observe a
   * pristine tick-0 world, and it is the foundation the Phase 3 visual
   * determinism mode (`?freezeAt=`) builds on.
   */
  readonly startPaused?: boolean;
}

/**
 * The simulation kernel.
 *
 * One tick is, in order:
 *
 *   1. drain pending commands — stamped with this tick, applied, logged
 *   2. advance the clock by exactly TICK_MS, emit a day rollover if one happened
 *   3. run the eighteen systems in their fixed order
 *   4. publish the tick's events, then release them
 *
 * Commands land at the *start* of a tick rather than whenever they arrive. A
 * command applied mid-tick would be observed by the systems that run after it
 * and not by those that ran before, which makes the outcome depend on wall-clock
 * arrival time — the one thing a deterministic kernel cannot tolerate.
 */
/** The pipeline's manoeuvre system, if it has one. */
function findManeuverSystem(pipeline: SystemPipeline): VehicleManeuverSystem | null {
  for (const system of pipeline.systems) {
    if (system.name === 'VehicleManeuverSystem') return system as VehicleManeuverSystem;
  }
  return null;
}

export class Sim {
  readonly world: World;
  readonly events = new EventBus();
  readonly log: CommandLog;

  private readonly pipeline: SystemPipeline;
  private readonly pending: CommandInput[] = [];

  /** Reused across ticks so the readonly view costs nothing per frame. */
  private readonly view: {
    -readonly [K in Exclude<keyof SimView, 'actors' | 'audioSettings'>]: SimView[K];
  } & {
    actors: MutableActorSnapshot[];
    audioSettings: { master: number; music: number; sfx: number; ambience: number; muted: boolean };
  };

  /**
   * Preallocated actor records, sized to the stores.
   *
   * Filled in place by `readView`. The renderer reads `actorCount` entries and
   * ignores the rest, so no array is ever resized or rebuilt during play.
   */
  private readonly actorBuffer: MutableActorSnapshot[];
  /**
   * Asked where each vehicle is, because a vehicle mid-manoeuvre is not on a
   * lane at all. One authority for the projection, shared with the pipeline.
   */
  /**
   * The **pipeline's** manoeuvre system, not a second one.
   *
   * `readView` has to project a car mid-manoeuvre, which needs the same
   * manoeuvre table the pipeline is driving. Until Phase 11 that was guaranteed
   * by `stage1ManeuverSystem()` returning a module-level singleton; Phase 11
   * made the system stateful — it rebuilds its table on evolution — so the
   * singleton had to go, and with it the accident that kept these two in step.
   *
   * Holding a second instance produced `RangeError: No manoeuvre for lane 1,
   * bay 17` the first time a Stage 4 drive-thru car was projected: the
   * pipeline's copy had rebuilt for Stage 4 and this one was still on Stage 1.
   */
  private readonly maneuvers: VehicleManeuverSystem;
  /** Reused by `readView`, aligned to `UPGRADES`. */
  private readonly upgradeLevelBuffer: number[] = new Array<number>(UPGRADES.length).fill(0);
  /** Reused by `copyVehicles`; sampling allocates nothing. */
  private readonly laneSample: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };

  constructor(options: SimOptions) {
    this.world = new World(options);
    this.pipeline = new SystemPipeline(options.systems ?? createDefaultSystems(this.world));
    /*
     * Found in the pipeline rather than constructed, so there is exactly one.
     * A custom system list — which tests use — may not contain one, and a fresh
     * instance is the right fallback there: nothing is driving it, so nothing
     * can be out of step with it.
     */
    this.maneuvers = findManeuverSystem(this.pipeline) ?? stageManeuverSystem();
    this.log = new CommandLog(options.commandLogCapacity);

    if (options.startPaused === true) this.world.control.paused = true;

    const actorCapacity =
      this.world.vehicles.capacity + this.world.customers.capacity + this.world.employees.capacity;
    this.actorBuffer = new Array<MutableActorSnapshot>(actorCapacity);
    for (let i = 0; i < actorCapacity; i++) {
      this.actorBuffer[i] = {
        entityId: 0,
        x: 0,
        y: 0,
        z: 0,
        kind: 0,
        variant: 0,
        activity: 0,
        headingX: 1,
        headingY: 0,
        braking: false,
        patience: 0,
        moving: false,
      };
    }

    this.view = {
      tick: 0,
      simTimeMs: 0,
      gameDay: 0,
      gameHour: 0,
      weather: 0,
      activeEventKind: -1,
      activeEventEndsAtMs: 0,
      speedMultiplier: this.world.control.speedMultiplier,
      paused: false,
      vehicleCount: 0,
      customerCount: 0,
      employeeCount: 0,
      orderCount: 0,
      actors: this.actorBuffer,
      actorCount: 0,
      upgradeLevels: this.upgradeLevelBuffer,
      upgradeRevision: 0,
      audioSettings: { master: 1, music: 1, sfx: 1, ambience: 1, muted: false },
      stage: 1,
    };
  }

  /**
   * Queue a command for the start of the next tick.
   *
   * Queued rather than applied immediately so that "when the player clicked"
   * cannot leak into the result: two sessions that issue the same commands on
   * the same ticks produce the same world regardless of frame timing.
   */
  dispatch(command: CommandInput): void {
    this.pending.push(command);
  }

  tick(): void {
    const currentTick = this.world.tick;

    // Indexed rather than for-of: this is the per-tick hot path and `for-of`
    // allocates an array iterator each pass (WORKING_DISCIPLINE §2.3).
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.pending.length; i++) {
      const input = this.pending[i];
      if (input === undefined) continue;
      const command = stampCommand(input, currentTick);
      apply(this.world, command);
      this.log.append(command);
    }
    this.pending.length = 0;

    const dayRolled = this.world.clock.advance(TICK_MS);
    if (dayRolled) {
      this.world.eventQueue.emitDayStarted(this.world.clock.gameDay);
    }

    this.pipeline.run(this.world, TICK_MS);

    this.world.tick = currentTick + 1;
    this.events.flush(this.world.eventQueue);
  }

  /** Run `count` ticks. The only thing that advances simulation time. */
  advance(count: number): void {
    for (let i = 0; i < count; i++) this.tick();
  }

  /**
   * Apply a command that is already stamped, without queueing.
   *
   * Replay only: it trusts the caller to invoke it at the tick recorded on the
   * command, which is exactly what `replay` below does.
   */
  applyStamped(command: Command): void {
    apply(this.world, command);
    this.log.append(command);
  }

  /**
   * Where a vehicle actually is, in world metres.
   *
   * Exposed for tests that assert on *rendered* movement rather than on a
   * record's stored position — the two differ for a customer riding in a car,
   * and what a player would see teleport is the car.
   */
  positionOfVehicle(slot: number, out: LaneSample): LaneSample {
    return this.maneuvers.positionOf(this.world, slot, out);
  }

  /**
   * Read-only projection for the renderer and the UI bridge.
   *
   * The same object every call, refreshed in place: allocating a snapshot per
   * frame would put the render path on the allocator, and the bridge is expected
   * to read this at 60 Hz.
   */
  readView(): SimView {
    const v = this.view;
    v.tick = this.world.tick;
    v.simTimeMs = this.world.clock.simTimeMs;
    v.gameDay = this.world.clock.gameDay;
    v.gameHour = this.world.clock.gameHour;
    v.speedMultiplier = this.world.control.speedMultiplier;
    v.weather = currentWeather(this.world);
    const activeSlot = activeEventSlot(this.world);
    v.activeEventKind = activeSlot >= 0 ? (this.world.environment.eventTypes[activeSlot] ?? -1) : -1;
    v.activeEventEndsAtMs = activeSlot >= 0 ? (this.world.environment.eventEndMs[activeSlot] ?? 0) : 0;
    v.paused = this.world.control.paused;
    v.vehicleCount = this.world.vehicles.activeCount;
    v.customerCount = this.world.customers.activeCount;
    v.employeeCount = this.world.employees.activeCount;
    v.orderCount = this.world.orders.activeCount;
    v.actorCount = this.fillActors();
    v.stage = this.world.progression.stage;

    /*
     * Levels and a revision. Summing six numbers per call is cheaper than the
     * alternative — a dirty flag on the world, which would be state that has to
     * be hashed, saved and migrated to describe something already derivable.
     */
    let revision = 0;
    for (let i = 0; i < UPGRADES.length; i++) {
      const level = this.world.layout.upgrades.get(UPGRADES[i]?.id ?? '') ?? 0;
      this.upgradeLevelBuffer[i] = level;
      // Weighted by position so two different purchases cannot cancel out.
      revision += level * (i + 1) * 31;
    }
    v.upgradeRevision = revision;
    const mix = this.world.settings.audio;
    v.audioSettings.master = mix.master;
    v.audioSettings.music = mix.music;
    v.audioSettings.sfx = mix.sfx;
    v.audioSettings.ambience = mix.ambience;
    v.audioSettings.muted = mix.muted;

    return v;
  }

  /**
   * Copy live actors into the reusable buffer, customers first then employees.
   *
   * Ascending slot order within each pool, which is defined on every engine —
   * unlike iterating a Set of references. The renderer depends on this order
   * being stable so its own view pool does not thrash.
   */
  private fillActors(): number {
    let count = 0;
    // Vehicles first, then customers, then employees. The order only has to be
    // *stable* — the depth sorter decides what draws in front of what — but a
    // stable order keeps the renderer's view pool from thrashing its leases.
    count = this.copyVehicles(count);
    count = this.copyCustomers(count);
    count = this.copyEmployees(count);
    return count;
  }

  /**
   * Employees, straight through — they carry their own world position.
   *
   * Separate from `copyPool` because the pools no longer share a record type:
   * Phase 10 gave employees a role, a state and a task, none of which a prop
   * has any business owning.
   */
  private copyEmployees(start: number): number {
    let count = start;
    const employees = this.world.employees;
    for (let slot = 0; slot < employees.scanLimit; slot++) {
      if (!employees.isActive(slot)) continue;
      const record = employees.at(slot);
      const out = this.actorBuffer[count];
      if (out === undefined) break;
      out.entityId = record.entityId;
      out.x = record.x;
      out.y = record.y;
      out.z = record.z;
      out.kind = record.kind;
      out.variant = record.appearance;
      /*
       * Facing, from where they are going.
       *
       * Employees used to be hardwired to `(1, 0)`, which was invisible while
       * every actor drew as the same untextured quad and is a staff member
       * moonwalking to the grill the moment they have a front and a back. A
       * standing employee keeps the last heading the store holds, because a
       * zero vector would snap them north mid-shift.
       */
      const towardX = record.targetX - record.x;
      const towardY = record.targetY - record.y;
      const distance = euclidean(towardX, towardY);
      if (distance > ARRIVAL_EPSILON_METRES) {
        out.headingX = towardX / distance;
        out.headingY = towardY / distance;
      }
      out.braking = false;
      out.patience = 0;
      out.moving = record.state === 1;
      out.activity = employeeActivity(this.world, record, out.moving);
      count++;
    }
    return count;
  }

  /**
   * Project each vehicle from lane-space into world space for the renderer.
   *
   * The simulation stores a vehicle as a distance along a lane, which is all the
   * traffic model needs. The renderer needs a position and a facing, and this is
   * the one place that conversion happens — doing it in the render layer would
   * put lane geometry on the wrong side of the boundary and would mean the
   * renderer could disagree with the simulation about where a car is.
   */
  private copyVehicles(startIndex: number): number {
    const vehicles = this.world.vehicles;
    let index = startIndex;

    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      const target = this.actorBuffer[index];
      if (target === undefined) break;

      this.maneuvers.positionOf(this.world, slot, this.laneSample);

      target.entityId = vehicles.entityId[slot] ?? 0;
      target.x = this.laneSample.x;
      target.y = this.laneSample.y;
      target.z = 0;
      target.kind = ACTOR_KIND_VEHICLE;
      // Which car, so the renderer can draw a van as a van.
      target.variant = vehicles.archetype[slot] ?? 0;
      target.activity = 0;
      target.headingX = this.laneSample.tangentX;
      target.headingY = this.laneSample.tangentY;
      target.braking = (vehicles.accel[slot] ?? 0) <= -BRAKE_LIGHT_DECEL;
      target.patience = 0;
      target.moving = (vehicles.speed[slot] ?? 0) > 0;
      index++;
    }
    return index;
  }

  /**
   * Copy the customers who are actually outside a car.
   *
   * Someone still in their vehicle has a record and a position — they are
   * genuinely `SEEKING_PARKING` — but drawing them would put a person standing
   * on the roof of a moving car. The filter lives here rather than in the
   * renderer because "is this actor in the world" is simulation state, and the
   * render layer is not allowed to reach in and ask.
   */
  private copyCustomers(startIndex: number): number {
    const pool = this.world.customers;
    let index = startIndex;
    for (let slot = 0; slot < pool.capacity; slot++) {
      if (!pool.isActive(slot)) continue;
      const record: CustomerRecord = pool.at(slot);
      if (record.visible !== 1) continue;

      const target = this.actorBuffer[index];
      if (target === undefined) break;
      target.entityId = record.entityId;
      target.x = record.x;
      target.y = record.y;
      target.z = record.z;
      target.kind = record.kind;
      // Who this is, visually. Rolled once from the cosmetic stream at spawn.
      target.variant = record.appearance;
      target.headingX = record.headingX;
      target.headingY = record.headingY;
      target.braking = false;
      target.patience = record.patienceMaxMs > 0 ? record.patienceMs / record.patienceMaxMs : 0;
      /*
       * Against the same epsilon navigation arrives on, not exact equality. A
       * customer standing in a queue is nudged by their neighbours every tick,
       * so they never land on the target coordinate exactly — and the walk cycle
       * would have played forever on someone standing perfectly still.
       */
      target.moving =
        euclidean(record.targetX - record.x, record.targetY - record.y) > ARRIVAL_EPSILON_METRES;
      target.activity = customerActivity(record.state, target.moving, target.patience);
      index++;
    }
    return index;
  }

  get systemOrder(): readonly string[] {
    return this.pipeline.order;
  }
}

/**
 * Re-run a recorded command log from the simulation's current tick.
 *
 * The core of the determinism suite and of the Day Replay feature: given the
 * same seed and the same log, this must reach a world whose hash matches the
 * original bit for bit.
 *
 * Commands must be ordered by tick. A command whose tick has already passed is
 * a corrupted or truncated log, and is reported rather than quietly skipped —
 * replaying a truncated log does not reproduce the world.
 */
export function replay(sim: Sim, commands: readonly Command[], untilTick: number): void {
  const startTick = sim.world.tick;
  let previousTick = -1;
  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    if (command === undefined) continue;
    if (command.tick < startTick) {
      throw new RangeError(
        `replay: command ${i} targets tick ${command.tick}, already past (simulation is at ${startTick})`,
      );
    }
    if (command.tick < previousTick) {
      throw new RangeError(
        `replay: command ${i} targets tick ${command.tick} after a command at tick ${previousTick}; the log must be ordered`,
      );
    }
    previousTick = command.tick;
  }

  let cursor = 0;
  while (sim.world.tick < untilTick) {
    const target = sim.world.tick;
    while (cursor < commands.length) {
      const command = commands[cursor];
      if (command?.tick !== target) break;
      sim.applyStamped(command);
      cursor++;
    }
    sim.tick();
  }
}

/**
 * A customer's activity, from their state machine — Phase 17.
 *
 * Presentation-only derivation: the FSM stays the authority on behaviour; this
 * is just which clip reads as that behaviour at sixty pixels.
 */
function customerActivity(state: number, moving: boolean, patience: number): number {
  if (state === STATE_EATING) return ACTIVITY_EAT;
  if (state === STATE_PAYING) return ACTIVITY_PAY;
  if (state === STATE_ORDERING) return ACTIVITY_TAKE_ORDER;
  if (state === STATE_ABANDONING || state === STATE_LEAVING_ANGRY) return ACTIVITY_ANGRY;
  if (moving) return ACTIVITY_WALK;
  if (
    (state === STATE_QUEUEING_AT_COUNTER || state === STATE_WAITING_FOR_FOOD) &&
    patience > 0 &&
    patience < IMPATIENT_PATIENCE_FRACTION
  ) {
    return ACTIVITY_WAIT_IMPATIENT;
  }
  return ACTIVITY_IDLE;
}

/**
 * An employee's activity: their claimed task, while they perform it.
 *
 * `PERFORMING` is brain state 2; the task board still holds the claimed
 * slot's kind. A moving employee with a delivery is a carry-walk — the plate
 * is the whole point of the trip.
 */
function employeeActivity(world: World, record: EmployeeRecord, moving: boolean): number {
  const kind = record.taskSlot >= 0 ? world.tasks.at(record.taskSlot).kind : -1;
  if (moving) return kind === TASK_KIND_DELIVER ? ACTIVITY_WALK_CARRY : ACTIVITY_WALK;
  if (record.state === EMPLOYEE_STATE_PERFORMING) {
    if (kind === TASK_KIND_PREP) return ACTIVITY_COOK;
    if (kind === TASK_KIND_DELIVER) return ACTIVITY_SERVE;
    if (kind === TASK_KIND_CLEAN) return ACTIVITY_CLEAN;
  }
  return ACTIVITY_IDLE;
}
