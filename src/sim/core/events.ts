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
 * the player changed the rate or paused. Gameplay events (`VEHICLE_SPAWNED`,
 * `PAYMENT`, …) arrive with the systems that emit them.
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

export type SimEvent = DayStartedEvent | SpeedChangedEvent | PauseChangedEvent;

export type SimEventType = SimEvent['t'];

/**
 * Fixed iteration order for the per-type record pools.
 *
 * A plain array rather than `Object.keys` on a record: key enumeration order is
 * specified for string keys, but relying on it in the one module whose entire
 * job is determinism would be a poor precedent.
 */
export const SIM_EVENT_TYPES: readonly SimEventType[] = ['DAY_STARTED', 'SPEED_CHANGED', 'PAUSE_CHANGED'];

/**
 * A subscriber's view of an event.
 *
 * `readonly` all the way down, because the records are pooled: a subscriber that
 * mutated one would corrupt the next tick's event of the same type.
 */
export type ReadonlySimEvent = Readonly<SimEvent>;
