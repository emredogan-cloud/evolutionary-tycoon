import type { SpeedMultiplier } from '@config/simulation';

/**
 * Simulation events.
 *
 * The one-way outbound channel: the simulation announces what happened, and the
 * renderer, the UI, audio and analytics each subscribe independently. Nothing
 * downstream may write back — the only way into the simulation is a `Command`.
 *
 * The union grows one phase at a time. These three exist because they are the
 * only things a Phase 2 kernel can honestly announce: the clock rolled over, and
 * the player changed the rate or paused. The vehicle events below arrived with
 * Phase 5; `PAYMENT` and the rest follow the systems that emit them.
 */

export interface DayStartedEvent {
  readonly t: 'DAY_STARTED';
  day: number;
}

export interface SpeedChangedEvent {
  readonly t: 'SPEED_CHANGED';
  mult: SpeedMultiplier;
}

export interface PauseChangedEvent {
  readonly t: 'PAUSE_CHANGED';
  paused: boolean;
}

/**
 * A vehicle entered the road.
 *
 * Carries the archetype so Phase 17 can pick an engine sample without asking the
 * simulation again, and so the dev overlay can show the mix without a scan.
 */
export interface VehicleSpawnedEvent {
  readonly t: 'VEHICLE_SPAWNED';
  entityId: number;
  lane: number;
  archetype: number;
}

/** A vehicle began braking hard enough to be worth hearing or seeing. */
export interface VehicleBrakedEvent {
  readonly t: 'VEHICLE_BRAKED';
  entityId: number;
  /** Deceleration in m/s², positive. */
  decel: number;
}

/** A vehicle reached the end of its lane and returned to the pool. */
export interface VehicleDespawnedEvent {
  readonly t: 'VEHICLE_DESPAWNED';
  entityId: number;
  lane: number;
}

export type SimEvent =
  | DayStartedEvent
  | SpeedChangedEvent
  | PauseChangedEvent
  | VehicleSpawnedEvent
  | VehicleBrakedEvent
  | VehicleDespawnedEvent;

export type SimEventType = SimEvent['t'];

/**
 * Fixed iteration order for the per-type record pools.
 *
 * A plain array rather than `Object.keys` on a record: key enumeration order is
 * specified for string keys, but relying on it in the one module whose entire
 * job is determinism would be a poor precedent.
 */
export const SIM_EVENT_TYPES: readonly SimEventType[] = [
  'DAY_STARTED',
  'SPEED_CHANGED',
  'PAUSE_CHANGED',
  'VEHICLE_SPAWNED',
  'VEHICLE_BRAKED',
  'VEHICLE_DESPAWNED',
];

/**
 * A subscriber's view of an event.
 *
 * `readonly` all the way down, because the records are pooled: a subscriber that
 * mutated one would corrupt the next tick's event of the same type.
 */
export type ReadonlySimEvent = Readonly<SimEvent>;
