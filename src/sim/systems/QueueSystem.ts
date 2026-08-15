import type { StageLayout } from '@config/layouts/stage1';
import {
  STATE_ORDERING,
  STATE_QUEUEING_AT_COUNTER,
  STATE_WAITING_FOR_FOOD,
  STATE_WALKING_TO_DOOR,
} from '../ai/fsm/customerFsm';
import type { SimSystem } from '../core/SystemPipeline';
import { effectValue } from './UpgradeSystem';
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
  /** The same, for the waiting area — people who have ordered. */
  private readonly waiting: Int32Array;

  constructor(private readonly layout: StageLayout) {
    this.occupants = new Int32Array(layout.queue.length).fill(-1);
    this.waiting = new Int32Array(layout.waitingArea.length).fill(-1);
  }

  run(world: World): void {
    this.occupants.fill(-1);
    this.waiting.fill(-1);

    const customers = world.customers;
    /*
     * After the clear, not before it: an empty queue still has to *become*
     * empty, or a place held by a customer who has since left stays held.
     * See `ConversionSystem.run` for the rest of the reasoning.
     */
    if (customers.activeCount === 0) return;

    /*
     * Existing places are honoured before new ones are handed out. Rebuilding
     * the whole queue from scratch each tick would be simpler and would also
     * mean the order depended on slot indices rather than on who arrived first
     * — so a customer could overtake someone who had been waiting longer,
     * purely because a pool slot was recycled.
     */
    for (let slot = 0; slot < customers.scanLimit; slot++) {
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

    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (!this.wantsQueue(customer)) continue;
      if (customer.queueIndex >= 0 && this.occupants[customer.queueIndex] === slot) continue;

      const free = this.firstFreeIndex();
      if (free < 0) {
        /*
         * Every authored slot is taken. They hold position rather than
         * continuing towards the counter — you see the queue is full and you
         * hang back.
         *
         * Two alternatives were measured and rejected, both worse:
         *
         * Sending them on had every unplaced customer walk at the *same point*.
         * With thirty pedestrians at the entrance — this phase's own naturalness
         * scenario — fifteen converged on one spot: closest approach 2.2 cm and
         * 5.5% of pair-ticks inside 30 cm, which is people standing inside each
         * other. No amount of steering fixes a crowd told to stand in one place.
         *
         * **Extending the line** past the last slot, at the same spacing and on
         * the same heading, is what a real queue does and is wrong *here*: Stage
         * 1's queue is authored pointing at the road, because an overflowing
         * queue spilling towards the traffic is the whole spillover mechanic
         * (ECONOMY_DESIGN §7, Fren 4). Extending it walks people into the
         * carriageway, the grid refuses them, and they pile up against the kerb
         * instead — closest approach 0.9 cm and 11% of pair-ticks too close,
         * forty times worse than holding.
         *
         * Holding is not the prettiest of the three; it is the one that measures
         * best on this layout. A layout whose queue ran along the counter rather
         * than towards the road could extend, and this is the note that will say
         * so when one does.
         */
        customer.queueIndex = -1;
        customer.targetX = customer.x;
        customer.targetY = customer.y;
        continue;
      }
      this.occupants[free] = slot;
      customer.queueIndex = free;
    }

    this.compact(world);
    this.aim(world);
    this.placeWaiting(world);
  }

  /**
   * Send everyone who has ordered to a spot beside the counter.
   *
   * They are out of the queue but still on the forecourt, and before this they
   * simply stopped wherever the last state left them — which was on the queue,
   * in the way of everybody behind them. The next customer walked into them and
   * the personal-space constraint spent the rest of the service pushing the two
   * apart: closest approach 7.9 cm, measured.
   *
   * First free spot, scanned in slot order, so the assignment is deterministic
   * and somebody who has been waiting keeps their place rather than shuffling
   * every time a neighbour leaves.
   */
  private placeWaiting(world: World): void {
    const customers = world.customers;

    /*
     * Existing spots are honoured before new ones are handed out, exactly as the
     * queue does. An assignment recomputed from scratch each tick is not
     * equivalent: a customer walking towards one spot passes closer to another,
     * the "nearest free" answer changes underneath them, and two of them end up
     * weaving — measured at 15 cm closest approach against 23 cm for the naive
     * first-free rule it was meant to improve on.
     */
    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (!this.wantsWaitingSpot(customer)) {
        customer.waitSpot = -1;
        continue;
      }
      const spot = customer.waitSpot;
      if (spot >= 0 && spot < this.waiting.length && this.waiting[spot] === -1) {
        this.waiting[spot] = slot;
      }
    }

    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (!this.wantsWaitingSpot(customer)) continue;
      if (customer.waitSpot >= 0 && this.waiting[customer.waitSpot] === slot) continue;

      // Nearest free spot, ties on the lower index, chosen **once**.
      let spot = -1;
      let best = Number.POSITIVE_INFINITY;
      for (let index = 0; index < this.waiting.length; index++) {
        if (this.waiting[index] !== -1) continue;
        const position = this.layout.waitingArea[index];
        if (position === undefined) continue;
        const distance = (position.x - customer.x) ** 2 + (position.y - customer.y) ** 2;
        if (distance < best) {
          best = distance;
          spot = index;
        }
      }

      // Nowhere to stand: hold position rather than piling onto somebody else's
      // spot. The same reasoning as a full queue.
      if (spot < 0) {
        customer.waitSpot = -1;
        customer.targetX = customer.x;
        customer.targetY = customer.y;
        continue;
      }
      this.waiting[spot] = slot;
      customer.waitSpot = spot;
    }

    for (let index = 0; index < this.waiting.length; index++) {
      const slot = this.waiting[index];
      if (slot === undefined || slot < 0) continue;
      if (!customers.isActive(slot)) continue;
      const position = this.layout.waitingArea[index];
      if (position === undefined) continue;
      const customer = customers.at(slot);
      customer.targetX = position.x;
      customer.targetY = position.y;
    }
  }

  private wantsWaitingSpot(customer: CustomerRecord): boolean {
    return customer.staged !== 1 && customer.visible === 1 && customer.state === STATE_WAITING_FOR_FOOD;
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

  /**
   * Whether this customer belongs in the line.
   *
   * `ORDERING` counts, and that is load-bearing. Someone being served is still
   * standing at the counter, and dropping them from the queue the moment they
   * step up lets the next person compact into position 0 and start ordering too
   * — measured: everybody in the queue ordered within a tick of each other, and
   * the "only the front orders" rule that makes a long queue a visible cost
   * quietly stopped applying.
   */
  private wantsQueue(customer: CustomerRecord): boolean {
    return (
      customer.staged !== 1 &&
      customer.visible === 1 &&
      (customer.state === STATE_WALKING_TO_DOOR ||
        customer.state === STATE_QUEUEING_AT_COUNTER ||
        customer.state === STATE_ORDERING)
    );
  }

  /** How many customers are standing past the current capacity. */
  static overflowOf(world: World, layout: StageLayout): number {
    let queued = 0;
    for (let slot = 0; slot < world.customers.scanLimit; slot++) {
      if (!world.customers.isActive(slot)) continue;
      if (world.customers.at(slot).queueIndex >= 0) queued++;
    }
    return Math.max(0, queued - queueCapacityOf(world, layout));
  }
}

/**
 * How many people can queue before the stand starts turning traffic away.
 *
 * The authored capacity plus whatever a bigger counter has bought, **clamped to
 * the number of queue positions the layout actually authors**. That clamp is not
 * defensive tidiness: capacity beyond the last authored slot would tell
 * `spilloverPenalty` the queue is fine while there is physically nowhere for the
 * fifth person to stand, and the negative feedback loop that ECONOMY_DESIGN §7
 * calls the economy's only self-correction would quietly stop working.
 *
 * It is also why `bigger-counter` is a single level in Stage 1: six authored
 * slots minus a capacity of four is exactly one +2, and a second level would be
 * an upgrade that costs money and does nothing.
 */
export function queueCapacityOf(world: World, layout: StageLayout): number {
  return Math.min(layout.queue.length, layout.queueCapacity + effectValue(world, 'queueCapacity'));
}
