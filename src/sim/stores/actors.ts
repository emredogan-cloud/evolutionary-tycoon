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
  /**
   * Footprint centre in world metres, plus height above ground.
   *
   * World unit = 1 metre (TECHNICAL_ARCHITECTURE §6.1). `z` exists because the
   * renderer sorts on it: a customer on a step draws in front of one standing at
   * the same spot on the ground.
   */
  x: number;
  y: number;
  z: number;
  /**
   * Which sprite draws this actor — an index into the render catalogue.
   *
   * On the record rather than derived from which pool the actor lives in,
   * because the pools are storage classes (few-and-heterogeneous) and not
   * visual categories: an authored scene puts a prop and a customer in the same
   * pool, and they must not draw as the same thing.
   */
  kind: number;
}

export interface OrderRecord {
  entityId: number;
  /** Slot of the owning customer, or -1 when unowned. */
  customerSlot: number;
}

function createActor(defaultKind: number): ActorRecord {
  return { entityId: 0, x: 0, y: 0, z: 0, kind: defaultKind };
}

function resetActor(record: ActorRecord, defaultKind: number): void {
  record.entityId = 0;
  record.x = 0;
  record.y = 0;
  record.z = 0;
  record.kind = defaultKind;
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
  hasher.writeF64(record.z);
  hasher.writeU8(record.kind);
}

export function writeOrder(hasher: Hasher, record: OrderRecord): void {
  hasher.writeI32(record.entityId);
  hasher.writeI32(record.customerSlot);
}

export function createActorPool(capacity: number, defaultKind: number): SlotPool<ActorRecord> {
  return new SlotPool<ActorRecord>(
    capacity,
    () => createActor(defaultKind),
    (record) => {
      resetActor(record, defaultKind);
    },
  );
}

export function createOrderPool(capacity: number): SlotPool<OrderRecord> {
  return new SlotPool<OrderRecord>(capacity, createOrder, resetOrder);
}
