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
}

export interface EconomyState {
  cash: number;
  reputation: number;
  lifetimeRevenue: number;
  /** itemId → price. Balance values arrive in Phase 9; the container is Phase 2. */
  prices: Map<string, number>;
}

export interface LayoutState {
  placed: PlacedObject[];
  /** upgradeId → level. */
  upgrades: Map<string, number>;
}

export interface StaffState {
  hired: HiredEmployee[];
}

export interface StatsState {
  customersServed: number;
  vehiclesSpawned: number;
  /**
   * Every command the world has absorbed.
   *
   * A hashed, monotonic consequence of the command log, which is what lets the
   * replay test prove commands actually landed even while the individual command
   * effects (speed, pause) are excluded from the hash.
   */
  commandsApplied: number;
}

interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
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
}

export interface SimView {
  readonly tick: number;
  readonly simTimeMs: number;
  readonly gameDay: number;
  readonly gameHour: number;
  readonly speedMultiplier: SpeedMultiplier;
  readonly paused: boolean;
  readonly vehicleCount: number;
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
}
