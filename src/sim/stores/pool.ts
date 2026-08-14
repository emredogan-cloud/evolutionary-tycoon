import type { Hasher } from '../math/hash';
import { at } from '../math/typedArray';

/**
 * Slot pool for the small, heterogeneous entity kinds (customers, employees,
 * orders).
 *
 * Slot-indexed rather than reference-based on purpose:
 *
 * - records are created once and reused, so spawning during play allocates nothing;
 * - a slot index is a plain number, so it serialises, hashes and survives a save;
 * - iteration is ascending over slots, which is a defined order on every engine,
 *   unlike iterating a `Set` of references.
 *
 * `TECHNICAL_ARCHITECTURE §5.4` keeps typed-array SoA for the genuinely hot,
 * homogeneous case (vehicles) and plain pooled objects here, because 96 customers
 * with heterogeneous state do not justify manual struct-of-arrays bookkeeping.
 */
export class SlotPool<T> {
  readonly capacity: number;

  private readonly records: T[];
  private readonly activeFlags: Uint8Array;
  private readonly freeStack: Int32Array;
  private freeTop: number;
  private live = 0;

  private readonly resetRecord: (record: T) => void;

  constructor(capacity: number, create: (slot: number) => T, resetRecord: (record: T) => void) {
    if (capacity <= 0) throw new RangeError('SlotPool capacity must be positive');

    this.capacity = capacity;
    this.resetRecord = resetRecord;
    this.records = new Array<T>(capacity);
    for (let i = 0; i < capacity; i++) this.records[i] = create(i);

    this.activeFlags = new Uint8Array(capacity);
    this.freeStack = new Int32Array(capacity);
    this.freeTop = capacity;
    // Descending, so popping hands out slot 0 first: fresh allocation order is
    // then the same as iteration order, which makes test failures readable.
    for (let i = 0; i < capacity; i++) this.freeStack[i] = capacity - 1 - i;
  }

  get activeCount(): number {
    return this.live;
  }

  /** Slot index, or -1 when the pool is exhausted. Never grows: growth is an allocation. */
  acquire(): number {
    if (this.freeTop === 0) return -1;
    this.freeTop--;
    const slot = at(this.freeStack, this.freeTop);
    this.activeFlags[slot] = 1;
    this.live++;
    return slot;
  }

  release(slot: number): void {
    if (!this.isActive(slot)) return;
    this.activeFlags[slot] = 0;
    this.resetRecord(this.at(slot));
    this.freeStack[this.freeTop] = slot;
    this.freeTop++;
    this.live--;
  }

  isActive(slot: number): boolean {
    return slot >= 0 && slot < this.capacity && this.activeFlags[slot] === 1;
  }

  at(slot: number): T {
    const record = this.records[slot];
    if (record === undefined) {
      throw new RangeError(`SlotPool slot ${slot} is out of range (capacity ${this.capacity})`);
    }
    return record;
  }

  reset(): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.activeFlags[i] === 1) this.resetRecord(this.at(i));
      this.activeFlags[i] = 0;
      this.freeStack[i] = this.capacity - 1 - i;
    }
    this.freeTop = this.capacity;
    this.live = 0;
  }

  /**
   * Hash the *live* slots in ascending order.
   *
   * The free stack itself is deliberately not hashed: two runs that spawned and
   * despawned in the same order have the same live set, and the internal order
   * of the free list is an implementation detail that must not be able to make
   * two identical worlds look different.
   */
  hashInto(hasher: Hasher, writeRecord: (hasher: Hasher, record: T) => void): void {
    hasher.writeU32(this.live);
    for (let slot = 0; slot < this.capacity; slot++) {
      if (this.activeFlags[slot] !== 1) continue;
      hasher.writeU32(slot);
      writeRecord(hasher, this.at(slot));
    }
  }
}
