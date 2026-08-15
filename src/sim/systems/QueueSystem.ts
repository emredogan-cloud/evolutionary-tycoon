import type { StageLayout } from '@config/layouts/stage1';
import { STATE_QUEUEING_AT_COUNTER, STATE_WALKING_TO_DOOR } from '../ai/fsm/customerFsm';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { CustomerRecord } from '../stores/customers';

/**
 * The queue at the counter — the basic half.
 *
 * Phase 6 owns who stands where and how the line closes up. Phase 8 owns
 * capacity, service and what happens at the front, which is why the slot's own
 * comment in `SYSTEM_ORDER` names Phase 8: the system arrives in two pieces and
 * this is the first.
 *
 * ## Named slots, not a crowd model
 *
 * The queue is a list of authored positions and an index per customer.
 * GAME_DESIGN_DOCUMENT §10 is explicit that this beats a collision-avoidance
 * model here, and the reason is legibility rather than cost: agents pushing
 * against each other produce a plausible-looking scrum, and a queue is not a
 * scrum. A player has to be able to count the line at a glance to understand
 * why conversion dropped.
 *
 * ## Closing up is what makes it read as a queue
 *
 * When someone leaves, everyone behind moves down one index and therefore
 * *walks* to their new position — nobody is repositioned. That shuffle is the
 * only visual evidence a player gets that the queue is being served rather than
 * merely existing, and it costs one compaction pass over at most twenty
 * records.
 */
export class QueueSystem implements SimSystem {
  readonly name = 'QueueSystem' as const;

  /** Occupant slot per queue index, or -1. Sized once from the layout. */
  private readonly occupants: Int32Array;

  constructor(private readonly layout: StageLayout) {
    this.occupants = new Int32Array(layout.queue.length).fill(-1);
  }

  run(world: World): void {
    this.occupants.fill(-1);

    const customers = world.customers;

    /*
     * Existing places are honoured before new ones are handed out. Rebuilding
     * the whole queue from scratch each tick would be simpler and would also
     * mean the order depended on slot indices rather than on who arrived first
     * — so a customer could overtake someone who had been waiting longer,
     * purely because a pool slot was recycled.
     */
    for (let slot = 0; slot < customers.capacity; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (!this.wantsQueue(customer)) {
        customer.queueIndex = -1;
        continue;
      }
      const index = customer.queueIndex;
      if (index >= 0 && index < this.occupants.length && this.occupants[index] === -1) {
        this.occupants[index] = slot;
      }
    }

    for (let slot = 0; slot < customers.capacity; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (!this.wantsQueue(customer)) continue;
      if (customer.queueIndex >= 0 && this.occupants[customer.queueIndex] === slot) continue;

      const free = this.firstFreeIndex();
      if (free < 0) {
        /*
         * Every authored slot is taken, including the ones that count as spilled
         * onto the road. The customer keeps walking towards the counter and
         * stands wherever they got to; the conversion penalty from the visible
         * queue is already doing the work of discouraging more arrivals.
         */
        customer.queueIndex = -1;
        continue;
      }
      this.occupants[free] = slot;
      customer.queueIndex = free;
    }

    this.compact(world);
    this.aim(world);
  }

  /**
   * Close the gaps, preserving order.
   *
   * A single forward pass: the first occupied index moves to 0, the next to 1,
   * and so on. Order is preserved because the scan runs in index order, and
   * index order is arrival order by construction.
   */
  private compact(world: World): void {
    let write = 0;
    for (let read = 0; read < this.occupants.length; read++) {
      const slot = this.occupants[read];
      if (slot === undefined || slot < 0) continue;
      if (read !== write) {
        this.occupants[write] = slot;
        this.occupants[read] = -1;
        if (world.customers.isActive(slot)) world.customers.at(slot).queueIndex = write;
      }
      write++;
    }
  }

  /** Point every queued customer at the position their index owns. */
  private aim(world: World): void {
    for (let index = 0; index < this.occupants.length; index++) {
      const slot = this.occupants[index];
      if (slot === undefined || slot < 0) continue;
      if (!world.customers.isActive(slot)) continue;

      const position = this.layout.queue[index];
      if (position === undefined) continue;

      const customer = world.customers.at(slot);
      customer.targetX = position.x;
      customer.targetY = position.y;
    }
  }

  private firstFreeIndex(): number {
    for (let i = 0; i < this.occupants.length; i++) {
      if (this.occupants[i] === -1) return i;
    }
    return -1;
  }

  private wantsQueue(customer: CustomerRecord): boolean {
    return (
      customer.staged !== 1 &&
      customer.visible === 1 &&
      (customer.state === STATE_WALKING_TO_DOOR || customer.state === STATE_QUEUEING_AT_COUNTER)
    );
  }

  /** How many customers are standing past the authored capacity. */
  static overflowOf(world: World, layout: StageLayout): number {
    let queued = 0;
    for (let slot = 0; slot < world.customers.capacity; slot++) {
      if (!world.customers.isActive(slot)) continue;
      if (world.customers.at(slot).queueIndex >= 0) queued++;
    }
    return Math.max(0, queued - layout.queueCapacity);
  }
}
