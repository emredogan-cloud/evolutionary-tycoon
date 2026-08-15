import type { SpeedMultiplier } from '@config/simulation';
import { SPEED_MULTIPLIERS } from '@config/simulation';
import type { RngStates } from './Rng';
import type { ClockState } from './Clock';
import type { HiredEmployee, PlacedObject, Stage } from './types';
import type { World } from './World';

/**
 * The save-state boundary.
 *
 * `src/sim` produces and consumes a plain data snapshot; `src/persistence` wraps
 * it in an envelope (schema version, checksum, timestamps) and puts it on a
 * storage medium. Keeping the split here is what lets the simulation stay free
 * of I/O while the storage layer stays free of game knowledge.
 *
 * **Transient state is not in here** — vehicles on the road, walking customers,
 * half-finished orders. TECHNICAL_ARCHITECTURE §8.1: they are rebuilt clean on
 * load, which holds a save near 15 KB and keeps migrations to persistent fields
 * only. `restoreWorld` therefore clears the entity stores rather than filling them.
 *
 * Maps become sorted entry arrays: JSON has no map type, and sorting makes the
 * serialised bytes depend on content rather than on insertion history.
 */

export interface WorldSnapshot {
  readonly tick: number;
  readonly nextEntityId: number;
  readonly clock: ClockState;
  readonly rng: RngStates;
  readonly control: { readonly speedMultiplier: SpeedMultiplier; readonly paused: boolean };
  readonly progression: {
    readonly stage: Stage;
    readonly unlocks: readonly string[];
    readonly milestones: readonly string[];
  };
  readonly economy: {
    readonly cash: number;
    readonly reputation: number;
    readonly lifetimeRevenue: number;
    readonly lifetimeSpend: number;
    readonly prices: readonly (readonly [string, number])[];
    /**
     * The sixty-second income window — Phase 9.
     *
     * Saved rather than recomputed, because it cannot be recomputed: it is a
     * window over the last minute of *play*, and a resumed session has no
     * record of the payments inside it. Dropping it would make the rate on the
     * HUD read zero for a minute after every load, which looks exactly like a
     * stand that has stopped earning.
     */
    readonly revenueWindow: readonly number[];
    readonly expenseWindow: readonly number[];
    readonly bucketIndex: number;
    readonly bucketElapsedMs: number;
  };
  readonly layout: {
    readonly placed: readonly PlacedObject[];
    readonly upgrades: readonly (readonly [string, number])[];
  };
  readonly staff: {
    readonly hired: readonly HiredEmployee[];
    /**
     * The wage-settlement cursor — Phase 10.
     *
     * Persisted because it decides *when* money moves. A resumed session that
     * restarted it would hand the player a few free seconds of labour on every
     * load, which is small, silent and exploitable by saving in a loop.
     */
    readonly settleElapsedMs: number;
    /**
     * The payroll itself.
     *
     * Employees are **not** transient state, unlike the customers and vehicles
     * TECHNICAL_ARCHITECTURE §8.1 deliberately drops: a player who hired three
     * cooks and reloaded to find them gone would have lost money. What is *not*
     * saved is what they were doing — the task board is rebuilt from the world
     * on the first tick, and an employee resumes idle beside the pass.
     */
    readonly employees: readonly {
      readonly entityId: number;
      readonly role: number;
      readonly skill: number;
      readonly wagePerMinute: number;
      readonly accruedWages: number;
      readonly unpaidMs: number;
      readonly x: number;
      readonly y: number;
    }[];
  };
  readonly traffic: {
    readonly nextCandidateMs: number;
    readonly nextDecorativeMs: number;
  };
  readonly stats: {
    readonly customersServed: number;
    readonly conversionsSucceeded: number;
    readonly conversionsFailed: number;
    readonly turnedAwayNoParking: number;
    readonly customersAbandoned: number;
    readonly vehiclesSpawned: number;
    readonly convertibleSpawned: number;
    readonly commandsApplied: number;
  };
  readonly settings: {
    readonly audio: {
      readonly master: number;
      readonly music: number;
      readonly sfx: number;
      readonly muted: boolean;
    };
    readonly a11y: { readonly reducedMotion: boolean; readonly highContrast: boolean };
  };
}

function sortedEntries(map: ReadonlyMap<string, number>): (readonly [string, number])[] {
  // Map keys are unique, so a two-way comparison is a total order here.
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** A plain array from a typed one, without the iterator protocol. */
function copyOut(source: Float64Array): number[] {
  const out = new Array<number>(source.length);
  for (let i = 0; i < source.length; i++) out[i] = source[i] ?? 0;
  return out;
}

/** The payroll, in slot order so a save is stable across runs. */
function snapshotEmployees(world: World): WorldSnapshot['staff']['employees'] {
  const out: {
    entityId: number;
    role: number;
    skill: number;
    wagePerMinute: number;
    accruedWages: number;
    unpaidMs: number;
    x: number;
    y: number;
  }[] = [];

  for (let slot = 0; slot < world.employees.scanLimit; slot++) {
    if (!world.employees.isActive(slot)) continue;
    const employee = world.employees.at(slot);
    out.push({
      entityId: employee.entityId,
      role: employee.role,
      skill: employee.skill,
      wagePerMinute: employee.wagePerMinute,
      accruedWages: employee.accruedWages,
      unpaidMs: employee.unpaidMs,
      x: employee.x,
      y: employee.y,
    });
  }
  return out;
}

/**
 * Put the payroll back, idle.
 *
 * Deliberately *not* mid-task. The task board is derived from world state and is
 * rebuilt on the first tick after a load, so a restored task slot would point at
 * a board that does not exist yet — the exact class of dangling reference the
 * two-sided claim protocol exists to make impossible.
 */
function restoreEmployees(world: World, saved: WorldSnapshot['staff']['employees']): void {
  for (const record of saved) {
    const slot = world.employees.acquire();
    if (slot < 0) break;
    const employee = world.employees.at(slot);
    employee.entityId = record.entityId;
    employee.role = record.role;
    employee.skill = record.skill;
    employee.wagePerMinute = record.wagePerMinute;
    employee.accruedWages = record.accruedWages;
    employee.unpaidMs = record.unpaidMs;
    employee.x = record.x;
    employee.y = record.y;
    employee.z = 0;
    employee.state = 0;
    employee.taskSlot = -1;
    employee.progressMs = 0;
    employee.blockedMs = 0;
  }
}

export function snapshotWorld(world: World): WorldSnapshot {
  return {
    tick: world.tick,
    nextEntityId: world.nextEntityId,
    clock: world.clock.saveState(),
    rng: world.rng.saveStates(),
    control: {
      speedMultiplier: world.control.speedMultiplier,
      paused: world.control.paused,
    },
    progression: {
      stage: world.progression.stage,
      unlocks: [...world.progression.unlocks],
      milestones: [...world.progression.milestones],
    },
    economy: {
      cash: world.economy.cash,
      reputation: world.economy.reputation,
      lifetimeRevenue: world.economy.lifetimeRevenue,
      lifetimeSpend: world.economy.lifetimeSpend,
      prices: sortedEntries(world.economy.prices),
      /*
       * Copied with a loop rather than spread. `[...typedArray]` goes through
       * the iterator protocol and it is not free: spreading the two twelve-entry
       * windows made the save benchmark 36% slower than the whole rest of the
       * snapshot cost put together, which for twenty-four numbers is absurd.
       */
      revenueWindow: copyOut(world.economy.revenueWindow),
      expenseWindow: copyOut(world.economy.expenseWindow),
      bucketIndex: world.economy.bucketIndex,
      bucketElapsedMs: world.economy.bucketElapsedMs,
    },
    layout: {
      placed: world.layout.placed.map((object) => ({ ...object })),
      upgrades: sortedEntries(world.layout.upgrades),
    },
    staff: {
      hired: world.staff.hired.map((employee) => ({ ...employee })),
      settleElapsedMs: world.staff.settleElapsedMs,
      employees: snapshotEmployees(world),
    },
    traffic: {
      nextCandidateMs: world.traffic.nextCandidateMs,
      nextDecorativeMs: world.traffic.nextDecorativeMs,
    },
    stats: {
      customersServed: world.stats.customersServed,
      conversionsSucceeded: world.stats.conversionsSucceeded,
      conversionsFailed: world.stats.conversionsFailed,
      turnedAwayNoParking: world.stats.turnedAwayNoParking,
      customersAbandoned: world.stats.customersAbandoned,
      vehiclesSpawned: world.stats.vehiclesSpawned,
      convertibleSpawned: world.stats.convertibleSpawned,
      commandsApplied: world.stats.commandsApplied,
    },
    settings: {
      audio: { ...world.settings.audio },
      a11y: { ...world.settings.a11y },
    },
  };
}

/**
 * Overwrite a world with a snapshot.
 *
 * Resets first, so a load never leaves a residue of the previous session behind
 * — the failure mode where an old save "mostly" loads and the difference only
 * shows up as an unreproducible economy drift twenty minutes later.
 */
export function restoreWorld(world: World, snapshot: WorldSnapshot): void {
  world.reset();

  world.tick = snapshot.tick;
  world.setNextEntityId(snapshot.nextEntityId);
  world.clock.setState(snapshot.clock);
  world.rng.loadStates(snapshot.rng);

  world.control.speedMultiplier = normaliseSpeed(snapshot.control.speedMultiplier);
  world.control.paused = snapshot.control.paused;

  world.progression.stage = snapshot.progression.stage;
  world.progression.unlocks.push(...snapshot.progression.unlocks);
  world.progression.milestones.push(...snapshot.progression.milestones);

  world.economy.cash = snapshot.economy.cash;
  world.economy.reputation = snapshot.economy.reputation;
  world.economy.lifetimeRevenue = snapshot.economy.lifetimeRevenue;
  world.economy.lifetimeSpend = snapshot.economy.lifetimeSpend;
  for (const [key, value] of snapshot.economy.prices) world.economy.prices.set(key, value);

  /*
   * Copied by index rather than by `set`, and only as far as the current window
   * length. A save written by a build with a different bucket count must not
   * resize the array — the world's shape comes from this build's config, and a
   * short save leaves the remaining buckets at the zero `reset` put there.
   */
  for (let i = 0; i < world.economy.revenueWindow.length; i++) {
    world.economy.revenueWindow[i] = snapshot.economy.revenueWindow[i] ?? 0;
    world.economy.expenseWindow[i] = snapshot.economy.expenseWindow[i] ?? 0;
  }
  world.economy.bucketIndex = snapshot.economy.bucketIndex % world.economy.revenueWindow.length;
  world.economy.bucketElapsedMs = snapshot.economy.bucketElapsedMs;

  for (const object of snapshot.layout.placed) world.layout.placed.push({ ...object });
  for (const [key, value] of snapshot.layout.upgrades) world.layout.upgrades.set(key, value);

  for (const employee of snapshot.staff.hired) world.staff.hired.push({ ...employee });
  world.staff.settleElapsedMs = snapshot.staff.settleElapsedMs;
  restoreEmployees(world, snapshot.staff.employees);

  world.traffic.nextCandidateMs = snapshot.traffic.nextCandidateMs;
  world.traffic.nextDecorativeMs = snapshot.traffic.nextDecorativeMs;
  // Diagnostics only, never persisted: a resumed session counts its own drops.
  world.traffic.droppedSpawns = 0;
  world.traffic.droppedDecorative = 0;

  world.stats.customersServed = snapshot.stats.customersServed;
  world.stats.conversionsSucceeded = snapshot.stats.conversionsSucceeded;
  world.stats.conversionsFailed = snapshot.stats.conversionsFailed;
  world.stats.turnedAwayNoParking = snapshot.stats.turnedAwayNoParking;
  world.stats.customersAbandoned = snapshot.stats.customersAbandoned;
  world.stats.vehiclesSpawned = snapshot.stats.vehiclesSpawned;
  world.stats.convertibleSpawned = snapshot.stats.convertibleSpawned;
  world.stats.commandsApplied = snapshot.stats.commandsApplied;
  /*
   * `failureReasons` is diagnostics and is deliberately not persisted, for the
   * same reason `droppedSpawns` is not: nothing reads it back, so it cannot
   * change an outcome, and the Phase 18 panel reports a rolling window of recent
   * traffic rather than a lifetime total.
   */
  world.stats.failureReasons.fill(0);

  world.settings.audio.master = snapshot.settings.audio.master;
  world.settings.audio.music = snapshot.settings.audio.music;
  world.settings.audio.sfx = snapshot.settings.audio.sfx;
  world.settings.audio.muted = snapshot.settings.audio.muted;
  world.settings.a11y.reducedMotion = snapshot.settings.a11y.reducedMotion;
  world.settings.a11y.highContrast = snapshot.settings.a11y.highContrast;
}

/**
 * A save carrying a speed the build no longer supports loads at 1x instead of
 * poisoning the world with an out-of-range multiplier.
 */
function normaliseSpeed(value: number): SpeedMultiplier {
  for (const allowed of SPEED_MULTIPLIERS) {
    if (value === allowed) return allowed;
  }
  return SPEED_MULTIPLIERS[0];
}
