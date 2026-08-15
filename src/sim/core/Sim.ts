import { TICK_MS } from '@config/simulation';
import type { ActorRecord } from '../stores/actors';
import type { SlotPool } from '../stores/pool';
import { createDefaultSystems } from '../systems/noop';
import { CommandLog } from './CommandLog';
import type { Command, CommandInput } from './commands';
import { apply, stampCommand } from './commands';
import { EventBus } from './EventBus';
import type { SimSystem } from './SystemPipeline';
import { SystemPipeline } from './SystemPipeline';
import { ACTOR_KIND_VEHICLE } from '@config/actors';
import { BRAKE_LIGHT_DECEL } from '@config/traffic';
import { stage1Lanes } from '../systems/noop';
import type { LaneGraph } from '../nav/LaneGraph';
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
export class Sim {
  readonly world: World;
  readonly events = new EventBus();
  readonly log: CommandLog;

  private readonly pipeline: SystemPipeline;
  private readonly pending: CommandInput[] = [];

  /** Reused across ticks so the readonly view costs nothing per frame. */
  private readonly view: {
    -readonly [K in Exclude<keyof SimView, 'actors'>]: SimView[K];
  } & { actors: MutableActorSnapshot[] };

  /**
   * Preallocated actor records, sized to the stores.
   *
   * Filled in place by `readView`. The renderer reads `actorCount` entries and
   * ignores the rest, so no array is ever resized or rebuilt during play.
   */
  private readonly actorBuffer: MutableActorSnapshot[];
  private readonly lanes: LaneGraph = stage1Lanes();
  /** Reused by `copyVehicles`; sampling allocates nothing. */
  private readonly laneSample: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };

  constructor(options: SimOptions) {
    this.world = new World(options);
    this.pipeline = new SystemPipeline(options.systems ?? createDefaultSystems(this.world));
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
        headingX: 1,
        headingY: 0,
        braking: false,
      };
    }

    this.view = {
      tick: 0,
      simTimeMs: 0,
      gameDay: 0,
      gameHour: 0,
      speedMultiplier: this.world.control.speedMultiplier,
      paused: false,
      vehicleCount: 0,
      customerCount: 0,
      employeeCount: 0,
      orderCount: 0,
      actors: this.actorBuffer,
      actorCount: 0,
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
    v.paused = this.world.control.paused;
    v.vehicleCount = this.world.vehicles.activeCount;
    v.customerCount = this.world.customers.activeCount;
    v.employeeCount = this.world.employees.activeCount;
    v.orderCount = this.world.orders.activeCount;
    v.actorCount = this.fillActors();
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
    count = this.copyPool(this.world.customers, count);
    count = this.copyPool(this.world.employees, count);
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

      const laneIndex = vehicles.lane[slot] ?? 0;
      this.lanes.sample(laneIndex, vehicles.laneS[slot] ?? 0, this.laneSample);

      target.entityId = vehicles.entityId[slot] ?? 0;
      target.x = this.laneSample.x;
      target.y = this.laneSample.y;
      target.z = 0;
      target.kind = ACTOR_KIND_VEHICLE;
      target.headingX = this.laneSample.tangentX;
      target.headingY = this.laneSample.tangentY;
      target.braking = (vehicles.accel[slot] ?? 0) <= -BRAKE_LIGHT_DECEL;
      index++;
    }
    return index;
  }

  private copyPool(pool: SlotPool<ActorRecord>, startIndex: number): number {
    let index = startIndex;
    for (let slot = 0; slot < pool.capacity; slot++) {
      if (!pool.isActive(slot)) continue;
      const target = this.actorBuffer[index];
      if (target === undefined) break;
      const record = pool.at(slot);
      target.entityId = record.entityId;
      target.x = record.x;
      target.y = record.y;
      target.z = record.z;
      target.kind = record.kind;
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
