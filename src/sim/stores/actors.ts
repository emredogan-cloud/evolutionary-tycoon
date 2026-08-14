import type { Hasher } from '../math/hash';
import { SlotPool } from './pool';

/**
 * Pooled records for the non-vehicle entity kinds.
 *
 * Phase 2 delivers the skeleton and the pooling mechanics only. The behavioural
 * fields (patience, order contents, task assignment, FSM state) belong to the
 * phases that introduce those systems — Phase 6 for customers, Phase 8 for
 * orders, Phase 10 for employees. Adding them now would be implementing a later
 * phase's data model without its tests.
 *
 * What is here is what the kernel genuinely needs: stable identity and a world
 * position, so the store can be spawned, despawned, hashed, saved and iterated
 * deterministically — which is the property Phase 2 exists to prove.
 */

export interface ActorRecord {
  /** Stable across slot reuse; 0 means "never assigned". */
  entityId: number;
  /** World position in metres. World unit = 1 metre (TECHNICAL_ARCHITECTURE §6.1). */
  x: number;
  y: number;
}

export interface OrderRecord {
  entityId: number;
  /** Slot of the owning customer, or -1 when unowned. */
  customerSlot: number;
}

function createActor(): ActorRecord {
  return { entityId: 0, x: 0, y: 0 };
}

function resetActor(record: ActorRecord): void {
  record.entityId = 0;
  record.x = 0;
  record.y = 0;
}

function createOrder(): OrderRecord {
  return { entityId: 0, customerSlot: -1 };
}

function resetOrder(record: OrderRecord): void {
  record.entityId = 0;
  record.customerSlot = -1;
}

export function writeActor(hasher: Hasher, record: ActorRecord): void {
  hasher.writeI32(record.entityId);
  hasher.writeF64(record.x);
  hasher.writeF64(record.y);
}

export function writeOrder(hasher: Hasher, record: OrderRecord): void {
  hasher.writeI32(record.entityId);
  hasher.writeI32(record.customerSlot);
}

export function createActorPool(capacity: number): SlotPool<ActorRecord> {
  return new SlotPool<ActorRecord>(capacity, createActor, resetActor);
}

export function createOrderPool(capacity: number): SlotPool<OrderRecord> {
  return new SlotPool<OrderRecord>(capacity, createOrder, resetOrder);
}
