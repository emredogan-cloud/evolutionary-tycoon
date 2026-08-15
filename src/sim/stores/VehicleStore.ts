import type { Hasher } from '../math/hash';
import { at } from '../math/typedArray';

/**
 * Vehicles — structure of arrays over typed arrays.
 *
 * This is the one entity kind that earns manual SoA. It is the hottest and the
 * most numerous (120 concurrent on desktop, TECHNICAL_ARCHITECTURE §11.2), every
 * field is a number, and the traffic model touches all of them every tick. Typed
 * arrays keep that scan contiguous and, more importantly, keep it allocation-free.
 *
 * Everything else stays a pooled plain object (`SlotPool`) — ADR-010: targeted
 * SoA where measurement demands it, not an ECS framework everywhere.
 *
 * Phase 2 owns the storage; the fields are populated by the traffic systems in
 * Phase 5. They exist now because the store's layout, capacity and free-list
 * behaviour are what the determinism and allocation tests need to pin down.
 */
export class VehicleStore {
  readonly capacity: number;

  /** Stable entity identity; survives slot reuse. */
  readonly entityId: Int32Array;
  /** Arc-length position along the current lane, in metres. */
  readonly laneS: Float32Array;
  /** Metres per second. */
  readonly speed: Float32Array;
  /** Motion/behaviour state enum. Populated in Phase 5. */
  readonly state: Uint8Array;
  /** Archetype index (`SEDAN_COMMUTER`, `PICKUP_WORKER`, …). Populated in Phase 5. */
  readonly archetype: Uint8Array;
  /** Which lane of the `LaneGraph` the vehicle is travelling on. */
  readonly lane: Uint8Array;
  /**
   * This vehicle's own free-road speed, m/s.
   *
   * Per vehicle rather than per archetype: the spread around the archetype's
   * nominal speed is what stops the road looking like a conveyor belt, and it
   * has to be drawn once at spawn and remembered, not re-rolled per tick.
   */
  readonly desiredSpeed: Float32Array;
  /**
   * Acceleration from the last tick, m/s². Negative is braking.
   *
   * Stored because the renderer needs it — brake lights and the nose dip are
   * driven by deceleration, and recomputing IDM in the render layer would both
   * duplicate the model and put simulation logic on the wrong side of the
   * boundary.
   */
  readonly accel: Float32Array;

  private readonly activeFlags: Uint8Array;
  private readonly freeStack: Int32Array;
  private freeTop: number;
  private live = 0;

  constructor(capacity: number) {
    if (capacity <= 0) throw new RangeError('VehicleStore capacity must be positive');

    this.capacity = capacity;
    this.entityId = new Int32Array(capacity);
    this.laneS = new Float32Array(capacity);
    this.speed = new Float32Array(capacity);
    this.state = new Uint8Array(capacity);
    this.archetype = new Uint8Array(capacity);
    this.lane = new Uint8Array(capacity);
    this.desiredSpeed = new Float32Array(capacity);
    this.accel = new Float32Array(capacity);

    this.activeFlags = new Uint8Array(capacity);
    this.freeStack = new Int32Array(capacity);
    this.freeTop = capacity;
    for (let i = 0; i < capacity; i++) this.freeStack[i] = capacity - 1 - i;
  }

  get activeCount(): number {
    return this.live;
  }

  /** Slot index, or -1 when full. A full store drops the spawn; it never grows. */
  spawn(entityId: number): number {
    if (this.freeTop === 0) return -1;
    this.freeTop--;
    const slot = at(this.freeStack, this.freeTop);

    this.activeFlags[slot] = 1;
    this.entityId[slot] = entityId;
    this.laneS[slot] = 0;
    this.speed[slot] = 0;
    this.state[slot] = 0;
    this.archetype[slot] = 0;
    this.lane[slot] = 0;
    this.desiredSpeed[slot] = 0;
    this.accel[slot] = 0;
    this.live++;
    return slot;
  }

  despawn(slot: number): void {
    if (!this.isActive(slot)) return;
    this.activeFlags[slot] = 0;
    this.entityId[slot] = 0;
    this.laneS[slot] = 0;
    this.speed[slot] = 0;
    this.state[slot] = 0;
    this.archetype[slot] = 0;
    this.lane[slot] = 0;
    this.desiredSpeed[slot] = 0;
    this.accel[slot] = 0;
    this.freeStack[this.freeTop] = slot;
    this.freeTop++;
    this.live--;
  }

  isActive(slot: number): boolean {
    return slot >= 0 && slot < this.capacity && this.activeFlags[slot] === 1;
  }

  reset(): void {
    this.entityId.fill(0);
    this.laneS.fill(0);
    this.speed.fill(0);
    this.state.fill(0);
    this.archetype.fill(0);
    this.activeFlags.fill(0);
    for (let i = 0; i < this.capacity; i++) this.freeStack[i] = this.capacity - 1 - i;
    this.freeTop = this.capacity;
    this.live = 0;
  }

  /** Live slots in ascending order; dead slots and the free list are not state. */
  hashInto(hasher: Hasher): void {
    hasher.writeU32(this.live);
    for (let slot = 0; slot < this.capacity; slot++) {
      if (this.activeFlags[slot] !== 1) continue;
      hasher.writeU32(slot);
      hasher.writeI32(at(this.entityId, slot));
      hasher.writeF64(at(this.laneS, slot));
      hasher.writeF64(at(this.speed, slot));
      hasher.writeU8(at(this.state, slot));
      hasher.writeU8(at(this.archetype, slot));
      hasher.writeU8(at(this.lane, slot));
      hasher.writeF64(at(this.desiredSpeed, slot));
      /*
       * `accel` is deliberately NOT hashed. It is derived state — recomputed
       * from scratch every tick from position and speed — and exists only so the
       * renderer can show brake lights without reimplementing IDM. Hashing a
       * value that no future tick reads would make the digest sensitive to
       * something that cannot change an outcome, which is exactly the property
       * World.hash() is documented to avoid.
       */
    }
  }
}
