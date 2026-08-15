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
    readonly prices: readonly (readonly [string, number])[];
  };
  readonly layout: {
    readonly placed: readonly PlacedObject[];
    readonly upgrades: readonly (readonly [string, number])[];
  };
  readonly staff: { readonly hired: readonly HiredEmployee[] };
  readonly traffic: {
    readonly nextCandidateMs: number;
  };
  readonly stats: {
    readonly customersServed: number;
    readonly vehiclesSpawned: number;
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
      prices: sortedEntries(world.economy.prices),
    },
    layout: {
      placed: world.layout.placed.map((object) => ({ ...object })),
      upgrades: sortedEntries(world.layout.upgrades),
    },
    staff: { hired: world.staff.hired.map((employee) => ({ ...employee })) },
    traffic: { nextCandidateMs: world.traffic.nextCandidateMs },
    stats: {
      customersServed: world.stats.customersServed,
      vehiclesSpawned: world.stats.vehiclesSpawned,
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
  for (const [key, value] of snapshot.economy.prices) world.economy.prices.set(key, value);

  for (const object of snapshot.layout.placed) world.layout.placed.push({ ...object });
  for (const [key, value] of snapshot.layout.upgrades) world.layout.upgrades.set(key, value);

  for (const employee of snapshot.staff.hired) world.staff.hired.push({ ...employee });

  world.traffic.nextCandidateMs = snapshot.traffic.nextCandidateMs;
  // Diagnostics only, never persisted: a resumed session counts its own drops.
  world.traffic.droppedSpawns = 0;

  world.stats.customersServed = snapshot.stats.customersServed;
  world.stats.vehiclesSpawned = snapshot.stats.vehiclesSpawned;
  world.stats.commandsApplied = snapshot.stats.commandsApplied;

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
