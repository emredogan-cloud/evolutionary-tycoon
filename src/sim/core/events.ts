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

/**
 * A vehicle decided to stop. The most important event in the game.
 *
 * Phase 17 hangs the indicator sound on it, Phase 18 counts it, and the dev
 * overlay divides it by `VEHICLE_SPAWNED` to show a live conversion rate.
 */
export interface ConversionSucceededEvent {
  readonly t: 'CONVERSION_SUCCEEDED';
  entityId: number;
  archetype: number;
  /** The probability that was rolled against, for the analysis panel. */
  probability: number;
}

/**
 * A vehicle drove past, and **why**.
 *
 * The reason code is the whole point. GAME_DESIGN_DOCUMENT §14.4 makes "why
 * didn't they stop?" the game's main UX differentiator, and that panel is built
 * entirely from this stream — so it is collected from the first tick the system
 * exists, when it costs nothing, rather than retrofitted in Phase 18 when it
 * would mean re-deriving history that was never recorded.
 */
export interface ConversionFailedEvent {
  readonly t: 'CONVERSION_FAILED';
  entityId: number;
  archetype: number;
  /** A `REASON_*` index from `@config/conversion`. */
  reason: number;
  probability: number;
}

/** A converted vehicle came to rest in a bay. */
export interface VehicleParkedEvent {
  readonly t: 'VEHICLE_PARKED';
  entityId: number;
  parkingSlot: number;
}

/** A customer record was created — one per converted vehicle. */
export interface CustomerSpawnedEvent {
  readonly t: 'CUSTOMER_SPAWNED';
  entityId: number;
  archetype: number;
}

/**
 * A customer gave up and left, and why.
 *
 * Separate from `CONVERSION_FAILED` because it is a different failure with a
 * different fix: the first says the stand was not attractive enough to stop
 * for, this one says it was, and then let them down. Conflating them would tell
 * the player to buy a bigger sign when what they need is another bay.
 */
export interface CustomerLeftAngryEvent {
  readonly t: 'CUSTOMER_LEFT_ANGRY';
  entityId: number;
  /** A `REASON_*` index from `@config/conversion`. */
  reason: number;
  /** How long they were on site, in milliseconds. */
  dwellMs: number;
}

/** A customer said what they want. */
export interface OrderPlacedEvent {
  readonly t: 'ORDER_PLACED';
  entityId: number;
  customerId: number;
  /** Index into `MENU`. */
  item: number;
}

/** Preparation began at a station. Carries the duration so the ring can fill. */
export interface PrepStartedEvent {
  readonly t: 'PREP_STARTED';
  entityId: number;
  station: number;
  durationMs: number;
}

/** A plate reached the pass, and started going cold. */
export interface OrderReadyEvent {
  readonly t: 'ORDER_READY';
  entityId: number;
  item: number;
}

/** A plate reached the customer who ordered it. */
export interface OrderDeliveredEvent {
  readonly t: 'ORDER_DELIVERED';
  entityId: number;
  customerId: number;
}

/**
 * Money changed hands — the event the whole loop exists to produce.
 *
 * Amount, tip and satisfaction together, because they are computed from the same
 * numbers on the same tick and separating them would give three consumers three
 * chances to disagree about what happened. Phase 9's economy reads it, Phase 17
 * plays a sound on it, Phase 18 charts it.
 */
export interface PaymentEvent {
  readonly t: 'PAYMENT';
  customerId: number;
  amount: number;
  tip: number;
  satisfaction: number;
}

/**
 * A purchase that went through — Phase 9.
 *
 * Carries the level *bought* rather than the new total, and the price actually
 * paid rather than the list price, because both are what the renderer's
 * construction burst and the analysis panel need and neither can be recovered
 * afterwards: the level advances and the next cost is different.
 */
export interface UpgradeAppliedEvent {
  readonly t: 'UPGRADE_APPLIED';
  upgradeId: string;
  level: number;
  cost: number;
}

/** The player moved a price. Emitted only when it actually changed. */
export interface PriceChangedEvent {
  readonly t: 'PRICE_CHANGED';
  itemId: string;
  price: number;
}

/** Somebody was hired. */
export interface EmployeeHiredEvent {
  readonly t: 'EMPLOYEE_HIRED';
  entityId: number;
  roleId: string;
  cost: number;
}

/**
 * Somebody left — fired, or unpaid for too long.
 *
 * `reason` separates the two, because they mean opposite things to a player:
 * one is a decision they made and one is a consequence they need to notice.
 */
export interface EmployeeLeftEvent {
  readonly t: 'EMPLOYEE_LEFT';
  entityId: number;
  roleId: string;
  reason: 'fired' | 'unpaid';
}

export type SimEvent =
  | DayStartedEvent
  | SpeedChangedEvent
  | PauseChangedEvent
  | VehicleSpawnedEvent
  | VehicleBrakedEvent
  | VehicleDespawnedEvent
  | ConversionSucceededEvent
  | ConversionFailedEvent
  | VehicleParkedEvent
  | CustomerSpawnedEvent
  | CustomerLeftAngryEvent
  | OrderPlacedEvent
  | PrepStartedEvent
  | OrderReadyEvent
  | OrderDeliveredEvent
  | PaymentEvent
  | UpgradeAppliedEvent
  | PriceChangedEvent
  | EmployeeHiredEvent
  | EmployeeLeftEvent;

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
  'CONVERSION_SUCCEEDED',
  'CONVERSION_FAILED',
  'VEHICLE_PARKED',
  'CUSTOMER_SPAWNED',
  'CUSTOMER_LEFT_ANGRY',
  'ORDER_PLACED',
  'PREP_STARTED',
  'ORDER_READY',
  'ORDER_DELIVERED',
  'PAYMENT',
  'UPGRADE_APPLIED',
  'PRICE_CHANGED',
  'EMPLOYEE_HIRED',
  'EMPLOYEE_LEFT',
];

/**
 * A subscriber's view of an event.
 *
 * `readonly` all the way down, because the records are pooled: a subscriber that
 * mutated one would corrupt the next tick's event of the same type.
 */
export type ReadonlySimEvent = Readonly<SimEvent>;
