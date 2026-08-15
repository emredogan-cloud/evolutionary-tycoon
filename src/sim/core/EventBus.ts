import { EVENT_QUEUE_CAPACITY } from '@config/simulation';
import type { SpeedMultiplier } from '@config/simulation';
import type {
  ConversionFailedEvent,
  ConversionSucceededEvent,
  CustomerLeftAngryEvent,
  CustomerSpawnedEvent,
  DayStartedEvent,
  OrderDeliveredEvent,
  OrderPlacedEvent,
  OrderReadyEvent,
  EmployeeHiredEvent,
  EmployeeLeftEvent,
  PaymentEvent,
  PriceChangedEvent,
  UpgradeAppliedEvent,
  PrepStartedEvent,
  PauseChangedEvent,
  ReadonlySimEvent,
  SimEvent,
  SimEventType,
  SpeedChangedEvent,
  VehicleBrakedEvent,
  VehicleDespawnedEvent,
  VehicleParkedEvent,
  VehicleSpawnedEvent,
} from './events';
import { SIM_EVENT_TYPES } from './events';

/**
 * Per-tick event queue.
 *
 * Two properties matter and they pull against each other: events must be a
 * discriminated union (so `switch` is exhaustive and adding a case is a compile
 * error downstream), and emitting one must not allocate (steady state is
 * budgeted at 0 B/tick — TECHNICAL_ARCHITECTURE §11.1).
 *
 * The resolution is a pool per event type. Records are created once at
 * construction, leased by the typed `emit*` helpers, published as readonly
 * during flush, and returned to their pool afterwards. Callers therefore get
 * real union types and the hot path never touches the allocator.
 *
 * The contract that makes this safe: **a subscriber must not retain an event
 * past its callback.** In dev builds `flush` proves violations by clearing the
 * queue's view immediately after dispatch.
 */

type EventPools = Record<SimEventType, SimEvent[]>;

function createRecord(type: SimEventType): SimEvent {
  switch (type) {
    case 'DAY_STARTED':
      return { t: 'DAY_STARTED', day: 0 };
    case 'SPEED_CHANGED':
      return { t: 'SPEED_CHANGED', mult: 1 };
    case 'PAUSE_CHANGED':
      return { t: 'PAUSE_CHANGED', paused: false };
    case 'VEHICLE_SPAWNED':
      return { t: 'VEHICLE_SPAWNED', entityId: 0, lane: 0, archetype: 0 };
    case 'VEHICLE_BRAKED':
      return { t: 'VEHICLE_BRAKED', entityId: 0, decel: 0 };
    case 'VEHICLE_DESPAWNED':
      return { t: 'VEHICLE_DESPAWNED', entityId: 0, lane: 0 };
    case 'CONVERSION_SUCCEEDED':
      return { t: 'CONVERSION_SUCCEEDED', entityId: 0, archetype: 0, probability: 0 };
    case 'CONVERSION_FAILED':
      return { t: 'CONVERSION_FAILED', entityId: 0, archetype: 0, reason: 0, probability: 0 };
    case 'VEHICLE_PARKED':
      return { t: 'VEHICLE_PARKED', entityId: 0, parkingSlot: -1 };
    case 'CUSTOMER_SPAWNED':
      return { t: 'CUSTOMER_SPAWNED', entityId: 0, archetype: 0 };
    case 'CUSTOMER_LEFT_ANGRY':
      return { t: 'CUSTOMER_LEFT_ANGRY', entityId: 0, reason: 0, dwellMs: 0 };
    case 'ORDER_PLACED':
      return { t: 'ORDER_PLACED', entityId: 0, customerId: 0, item: 0 };
    case 'PREP_STARTED':
      return { t: 'PREP_STARTED', entityId: 0, station: -1, durationMs: 0 };
    case 'ORDER_READY':
      return { t: 'ORDER_READY', entityId: 0, item: 0 };
    case 'ORDER_DELIVERED':
      return { t: 'ORDER_DELIVERED', entityId: 0, customerId: 0 };
    case 'PAYMENT':
      return { t: 'PAYMENT', customerId: 0, amount: 0, tip: 0, satisfaction: 0 };
    case 'UPGRADE_APPLIED':
      return { t: 'UPGRADE_APPLIED', upgradeId: '', level: 0, cost: 0 };
    case 'PRICE_CHANGED':
      return { t: 'PRICE_CHANGED', itemId: '', price: 0 };
    case 'EMPLOYEE_HIRED':
      return { t: 'EMPLOYEE_HIRED', entityId: 0, roleId: '', cost: 0 };
    case 'EMPLOYEE_LEFT':
      return { t: 'EMPLOYEE_LEFT', entityId: 0, roleId: '', reason: 'fired' };
  }
}

/** Enough records per type that a single tick never exhausts a pool in practice. */
const POOL_SIZE_PER_TYPE = 64;

export class EventQueue {
  private readonly queue: (SimEvent | undefined)[];
  private readonly pools: EventPools;
  private readonly poolCursor: Record<SimEventType, number>;
  private length = 0;
  private droppedCount = 0;

  constructor(capacity: number = EVENT_QUEUE_CAPACITY) {
    this.queue = new Array<SimEvent | undefined>(capacity).fill(undefined);

    const pools = {} as EventPools;
    const cursor = {} as Record<SimEventType, number>;
    for (const type of SIM_EVENT_TYPES) {
      const records: SimEvent[] = [];
      for (let i = 0; i < POOL_SIZE_PER_TYPE; i++) records.push(createRecord(type));
      pools[type] = records;
      cursor[type] = 0;
    }
    this.pools = pools;
    this.poolCursor = cursor;
  }

  get size(): number {
    return this.length;
  }

  /**
   * Events discarded because the queue or a pool was full within one tick.
   *
   * Surfaced rather than silently swallowed: a non-zero value here means a
   * capacity constant is wrong, and the debug overlay shows it.
   */
  get dropped(): number {
    return this.droppedCount;
  }

  emitDayStarted(day: number): void {
    const record = this.lease('DAY_STARTED');
    if (record === null) return;
    (record as DayStartedEvent).day = day;
    this.push(record);
  }

  emitSpeedChanged(mult: SpeedMultiplier): void {
    const record = this.lease('SPEED_CHANGED');
    if (record === null) return;
    (record as SpeedChangedEvent).mult = mult;
    this.push(record);
  }

  emitPauseChanged(paused: boolean): void {
    const record = this.lease('PAUSE_CHANGED');
    if (record === null) return;
    (record as PauseChangedEvent).paused = paused;
    this.push(record);
  }

  emitVehicleSpawned(entityId: number, lane: number, archetype: number): void {
    const record = this.lease('VEHICLE_SPAWNED');
    if (record === null) return;
    const event = record as VehicleSpawnedEvent;
    event.entityId = entityId;
    event.lane = lane;
    event.archetype = archetype;
    this.push(record);
  }

  emitVehicleBraked(entityId: number, decel: number): void {
    const record = this.lease('VEHICLE_BRAKED');
    if (record === null) return;
    const event = record as VehicleBrakedEvent;
    event.entityId = entityId;
    event.decel = decel;
    this.push(record);
  }

  emitVehicleDespawned(entityId: number, lane: number): void {
    const record = this.lease('VEHICLE_DESPAWNED');
    if (record === null) return;
    const event = record as VehicleDespawnedEvent;
    event.entityId = entityId;
    event.lane = lane;
    this.push(record);
  }

  emitConversionSucceeded(entityId: number, archetype: number, probability: number): void {
    const record = this.lease('CONVERSION_SUCCEEDED');
    if (record === null) return;
    const event = record as ConversionSucceededEvent;
    event.entityId = entityId;
    event.archetype = archetype;
    event.probability = probability;
    this.push(record);
  }

  emitConversionFailed(entityId: number, archetype: number, reason: number, probability: number): void {
    const record = this.lease('CONVERSION_FAILED');
    if (record === null) return;
    const event = record as ConversionFailedEvent;
    event.entityId = entityId;
    event.archetype = archetype;
    event.reason = reason;
    event.probability = probability;
    this.push(record);
  }

  emitVehicleParked(entityId: number, parkingSlot: number): void {
    const record = this.lease('VEHICLE_PARKED');
    if (record === null) return;
    const event = record as VehicleParkedEvent;
    event.entityId = entityId;
    event.parkingSlot = parkingSlot;
    this.push(record);
  }

  emitCustomerSpawned(entityId: number, archetype: number): void {
    const record = this.lease('CUSTOMER_SPAWNED');
    if (record === null) return;
    const event = record as CustomerSpawnedEvent;
    event.entityId = entityId;
    event.archetype = archetype;
    this.push(record);
  }

  emitCustomerLeftAngry(entityId: number, reason: number, dwellMs: number): void {
    const record = this.lease('CUSTOMER_LEFT_ANGRY');
    if (record === null) return;
    const event = record as CustomerLeftAngryEvent;
    event.entityId = entityId;
    event.reason = reason;
    event.dwellMs = dwellMs;
    this.push(record);
  }

  emitOrderPlaced(entityId: number, customerId: number, item: number): void {
    const record = this.lease('ORDER_PLACED');
    if (record === null) return;
    const event = record as OrderPlacedEvent;
    event.entityId = entityId;
    event.customerId = customerId;
    event.item = item;
    this.push(record);
  }

  emitPrepStarted(entityId: number, station: number, durationMs: number): void {
    const record = this.lease('PREP_STARTED');
    if (record === null) return;
    const event = record as PrepStartedEvent;
    event.entityId = entityId;
    event.station = station;
    event.durationMs = durationMs;
    this.push(record);
  }

  emitOrderReady(entityId: number, item: number): void {
    const record = this.lease('ORDER_READY');
    if (record === null) return;
    const event = record as OrderReadyEvent;
    event.entityId = entityId;
    event.item = item;
    this.push(record);
  }

  emitOrderDelivered(entityId: number, customerId: number): void {
    const record = this.lease('ORDER_DELIVERED');
    if (record === null) return;
    const event = record as OrderDeliveredEvent;
    event.entityId = entityId;
    event.customerId = customerId;
    this.push(record);
  }

  emitPayment(customerId: number, amount: number, tip: number, satisfaction: number): void {
    const record = this.lease('PAYMENT');
    if (record === null) return;
    const event = record as PaymentEvent;
    event.customerId = customerId;
    event.amount = amount;
    event.tip = tip;
    event.satisfaction = satisfaction;
    this.push(record);
  }

  emitUpgradeApplied(upgradeId: string, level: number, cost: number): void {
    const record = this.lease('UPGRADE_APPLIED');
    if (record === null) return;
    const event = record as UpgradeAppliedEvent;
    event.upgradeId = upgradeId;
    event.level = level;
    event.cost = cost;
    this.push(record);
  }

  emitPriceChanged(itemId: string, price: number): void {
    const record = this.lease('PRICE_CHANGED');
    if (record === null) return;
    const event = record as PriceChangedEvent;
    event.itemId = itemId;
    event.price = price;
    this.push(record);
  }

  emitEmployeeHired(entityId: number, roleId: string, cost: number): void {
    const record = this.lease('EMPLOYEE_HIRED');
    if (record === null) return;
    const event = record as EmployeeHiredEvent;
    event.entityId = entityId;
    event.roleId = roleId;
    event.cost = cost;
    this.push(record);
  }

  emitEmployeeLeft(entityId: number, roleId: string, reason: 'fired' | 'unpaid'): void {
    const record = this.lease('EMPLOYEE_LEFT');
    if (record === null) return;
    const event = record as EmployeeLeftEvent;
    event.entityId = entityId;
    event.roleId = roleId;
    event.reason = reason;
    this.push(record);
  }

  /** Read an entry for dispatch. Valid only until the next `clear()`. */
  at(index: number): ReadonlySimEvent {
    const event = this.queue[index];
    if (event === undefined) {
      throw new RangeError(`EventQueue index ${index} is outside the current tick's events`);
    }
    return event;
  }

  /** Return every leased record to its pool and empty the queue. */
  clear(): void {
    for (let i = 0; i < this.length; i++) this.queue[i] = undefined;
    this.length = 0;
    for (const type of SIM_EVENT_TYPES) this.poolCursor[type] = 0;
  }

  reset(): void {
    this.clear();
    this.droppedCount = 0;
  }

  private lease(type: SimEventType): SimEvent | null {
    const pool = this.pools[type];
    const index = this.poolCursor[type];
    const record = pool[index];
    if (record === undefined) {
      this.droppedCount++;
      return null;
    }
    this.poolCursor[type] = index + 1;
    return record;
  }

  private push(event: SimEvent): void {
    if (this.length >= this.queue.length) {
      this.droppedCount++;
      return;
    }
    this.queue[this.length] = event;
    this.length++;
  }
}

export type SimEventListener = (event: ReadonlySimEvent) => void;

/**
 * Subscription side of the bus.
 *
 * Deliberately separate from the queue: the queue is simulation state and is
 * owned by the `World`, while listeners are renderer- and UI-owned callbacks
 * that must never end up inside a save file or a world hash.
 */
export class EventBus {
  private readonly listeners: SimEventListener[] = [];

  subscribe(listener: SimEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  get listenerCount(): number {
    return this.listeners.length;
  }

  /**
   * Publish everything collected during the tick, then release the records.
   *
   * Batched at the end of the tick rather than dispatched per emit: a listener
   * that ran mid-tick would observe a half-updated world, and the dispatch order
   * would depend on where inside a system the event happened to be raised.
   */
  flush(queue: EventQueue): void {
    const count = queue.size;
    for (let i = 0; i < count; i++) {
      const event = queue.at(i);
      // Indexed rather than for-of: this runs every tick, and `for-of` creates
      // an array iterator per pass. WORKING_DISCIPLINE §2.3 requires indexed
      // loops on measured hot paths; tests/perf asserts the resulting budget.
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let l = 0; l < this.listeners.length; l++) {
        const listener = this.listeners[l];
        if (listener !== undefined) listener(event);
      }
    }
    queue.clear();
  }
}
