import type { Hasher } from '../math/hash';
import { SlotPool } from './pool';

/**
 * Orders — the thing the whole loop is about.
 *
 * A pooled record per ADR-010, like customers: there are twenty of them against
 * a hundred and twenty vehicles, the fields are heterogeneous, and every system
 * that touches an order reads most of it at once rather than sweeping one field
 * across all of them.
 *
 * ## One item per order, and why the field is still called `item`
 *
 * Stage 1's menu is three items and a customer buys one. `items[]` would be the
 * general shape and would be untestable — every test would exercise a
 * one-element array, and the group-order rules (satiety, splitting a bill) that
 * make a list worth having arrive in Phase 11 with tables. A single index is
 * honest about what exists.
 *
 * ## Timestamps, not durations
 *
 * `orderedAtMs`, `readyAtMs`, `deliveredAtMs`. Durations would be smaller and
 * would make every question that matters — how long did this sit on the pass,
 * how long did the customer wait in total — a subtraction the caller has to get
 * right. Recording the moments makes the wait derivable at any point and makes a
 * stalled order obvious: its next timestamp is simply still zero.
 */

/** Order lifecycle. The index is stored and hashed, so this is append-only. */
export const ORDER_STATES = ['PLACED', 'COOKING', 'ON_PASS', 'DELIVERED', 'PAID'] as const;
export type OrderStateName = (typeof ORDER_STATES)[number];

export const ORDER_PLACED = 0;
export const ORDER_COOKING = 1;
export const ORDER_ON_PASS = 2;
export const ORDER_DELIVERED = 3;
export const ORDER_PAID = 4;

export interface OrderRecord {
  entityId: number;
  /** Slot of the customer who placed it, or -1 once they have gone. */
  customerSlot: number;
  /** Index into `MENU`. */
  item: number;
  /** Index into `ORDER_STATES`. */
  state: number;
  /** Station currently working it, or -1. */
  station: number;
  /** Sim time the customer asked, in milliseconds. */
  orderedAtMs: number;
  /** Sim time preparation began, or 0. */
  startedAtMs: number;
  /** Sim time it reached the pass, or 0. */
  readyAtMs: number;
  /** Sim time it reached the customer, or 0. */
  deliveredAtMs: number;
  /**
   * Price agreed when the order was placed, in credits.
   *
   * Captured rather than looked up at payment: the player can change prices
   * mid-service, and charging somebody more than they agreed to is both unfair
   * and an exploit — raise the price the instant before every payment and the
   * price band means nothing.
   */
  price: number;
  /** Recipe quality after the station's multiplier, before hold decay. 0..1. */
  quality: number;
}

function createOrder(): OrderRecord {
  return {
    entityId: 0,
    customerSlot: -1,
    item: 0,
    state: ORDER_PLACED,
    station: -1,
    orderedAtMs: 0,
    startedAtMs: 0,
    readyAtMs: 0,
    deliveredAtMs: 0,
    price: 0,
    quality: 0,
  };
}

function resetOrder(record: OrderRecord): void {
  record.entityId = 0;
  record.customerSlot = -1;
  record.item = 0;
  record.state = ORDER_PLACED;
  record.station = -1;
  record.orderedAtMs = 0;
  record.startedAtMs = 0;
  record.readyAtMs = 0;
  record.deliveredAtMs = 0;
  record.price = 0;
  record.quality = 0;
}

/** Everything that can change an outcome, in a fixed order. */
export function writeOrder(hasher: Hasher, record: OrderRecord): void {
  hasher.writeI32(record.entityId);
  hasher.writeI32(record.customerSlot);
  hasher.writeU8(record.item);
  hasher.writeU8(record.state);
  hasher.writeI32(record.station);
  hasher.writeF64(record.orderedAtMs);
  hasher.writeF64(record.startedAtMs);
  hasher.writeF64(record.readyAtMs);
  hasher.writeF64(record.deliveredAtMs);
  hasher.writeF64(record.price);
  hasher.writeF64(record.quality);
}

export function createOrderPool(capacity: number): SlotPool<OrderRecord> {
  return new SlotPool<OrderRecord>(capacity, createOrder, resetOrder);
}

export function orderStateName(state: number): OrderStateName {
  const name = ORDER_STATES[state];
  if (name === undefined) throw new RangeError(`Unknown order state ${state}`);
  return name;
}
