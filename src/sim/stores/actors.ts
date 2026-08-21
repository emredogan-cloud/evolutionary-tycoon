import type { Hasher } from '../math/hash';
import { SlotPool } from './pool';

/**
 * Pooled records for the non-vehicle entity kinds.
 *
 * Phase 2 delivered the skeleton and the pooling mechanics. The behavioural
 * fields moved out as their systems arrived: customers to `customers.ts` in
 * Phase 6 and orders to `OrderStore.ts` in Phase 8. What is left here is the
 * employee pool, which is still a position and an identity until Phase 10.
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

export function writeActor(hasher: Hasher, record: ActorRecord): void {
  hasher.writeI32(record.entityId);
  hasher.writeF64(record.x);
  hasher.writeF64(record.y);
  hasher.writeF64(record.z);
  hasher.writeU8(record.kind);
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
