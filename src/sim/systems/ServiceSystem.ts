import { PRICE_BAND, menuItem } from '@config/economy/menu';
import { basketReady, firstOrderOf, rollBasket } from './orderBasket';
import { EATING_MS, ORDERING_MS, REPUTATION } from '@config/satisfaction';
import {
  STATE_EATING,
  STATE_ORDERING,
  STATE_PAYING,
  STATE_QUEUEING_AT_COUNTER,
  STATE_WAITING_FOR_FOOD,
  STATE_WALKING_TO_CAR,
} from '../ai/fsm/customerFsm';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { CustomerRecord } from '../stores/customers';
import { ORDER_COOKING, ORDER_DELIVERED, ORDER_ON_PASS, ORDER_PAID } from '../stores/OrderStore';
import { layoutForStage } from '@config/layouts';
import { stepDriveThruCustomer } from './DriveThruSystem';
import { recordExpense, recordRevenue } from './EconomySystem';
import { recordOfflineSale } from './offlineMeter';
import { currentQuality } from './KitchenSystem';
import { evaluateSatisfaction, reputationDelta, tipFraction } from './SatisfactionSystem';
import { effectValue } from './UpgradeSystem';

/**
 * Ordering, delivery, eating, payment — the half of the loop that earns money.
 *
 * The customer at the front of the queue orders; the kitchen cooks; whatever is
 * on the pass goes to whoever ordered it; they eat and pay. In Stage 1 delivery
 * is automatic because there are no waiters — Phase 10 replaces that one step
 * and nothing else here changes, which is why it is a single method.
 *
 * ## Only the front of the queue orders
 *
 * Queue index 0. Anyone else standing in the line is standing in a line, and
 * that is the point: a long queue is a *visible* cost, and it stops being one
 * the moment everybody in it can order simultaneously.
 *
 * ## Payment is where the model resolves
 *
 * Satisfaction, tip, reputation and cash all happen on the same tick, from the
 * same numbers, and are announced in one event. Spreading them across systems
 * would mean four places that each need the order's history and three chances
 * for them to disagree about what it was.
 */
export class ServiceSystem implements SimSystem {
  readonly name = 'ServiceSystem' as const;

  /** Reused by every basket roll — WORKING_DISCIPLINE §2.3, zero steady-state allocation. */
  private readonly basketScratch: number[] = [];

  run(world: World, deltaMs: number): void {
    if (deltaMs <= 0) return;
    const customers = world.customers;
    if (customers.activeCount === 0) return;

    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (customer.staged === 1) continue;

      // The drive-thru runs its own three states and returns true when it took
      // the customer, so the counter's switch below never sees them.
      if (stepDriveThruCustomer(world, slot, deltaMs)) continue;

      switch (customer.state) {
        case STATE_QUEUEING_AT_COUNTER:
          this.takeOrder(world, customer, slot);
          break;
        case STATE_ORDERING:
          this.placeOrder(world, customer, slot, deltaMs);
          break;
        case STATE_WAITING_FOR_FOOD:
          this.deliver(world, customer, slot);
          break;
        case STATE_EATING:
          this.eat(world, customer, deltaMs);
          break;
        case STATE_PAYING:
          this.pay(world, customer, slot);
          break;
        default:
          break;
      }
    }
  }

  /** The front of the queue steps up. */
  private takeOrder(world: World, customer: CustomerRecord, slot: number): void {
    if (customer.queueIndex !== 0) return;
    if (firstOrderOf(world, slot) >= 0) return;
    customer.state = STATE_ORDERING;
    customer.timerMs = 0;
  }

  /**
   * Decide what they want and put it in the pool.
   *
   * The choice comes from the `customer` RNG stream, which exists for exactly
   * this — a per-customer decision that must be reproducible from the seed and
   * must not consume the conversion or traffic streams.
   */
  private placeOrder(world: World, customer: CustomerRecord, slot: number, deltaMs: number): void {
    // A beat at the counter. Without it the transaction takes zero ticks and the
    // player never sees the moment they built the whole stand for.
    customer.timerMs += deltaMs;
    // A menu board means people know what they want before they reach the
    // front — the upgrade's effect is a straight scale on this beat.
    if (customer.timerMs < ORDERING_MS * effectValue(world, 'orderSpeed')) return;
    customer.timerMs = 0;

    /*
     * The whole basket at once — ADR-016. The base item is chosen from **this
     * stage's menu** exactly as Phase 13 fixed it; the extras are the mechanic
     * ECONOMY_DESIGN §3's rising ticket always assumed and change request §8.1
     * carried until this batch resolved it.
     */
    const count = rollBasket(world, world.progression.stage, this.basketScratch);
    if (count === 0) {
      customer.state = STATE_QUEUEING_AT_COUNTER;
      return;
    }

    let placed = 0;
    for (let index = 0; index < count; index++) {
      const item = this.basketScratch[index] ?? 0;
      const orderSlot = world.orders.acquire();
      if (orderSlot < 0) {
        /*
         * The pool filled mid-basket. The base item matters more than the
         * extras: with nothing placed they go back to the queue (a customer who
         * reached the counter and was silently discarded shows up later as an
         * unexplained revenue shortfall); with the base placed the basket is
         * simply smaller, which is what a till running out of fries does.
         */
        break;
      }
      const order = world.orders.at(orderSlot);
      order.entityId = world.allocateEntityId();
      order.customerSlot = slot;
      order.item = item;
      order.orderedAtMs = world.clock.simTimeMs;
      /*
       * The price is captured now, not looked up at payment. The player can
       * change prices mid-service, and charging somebody more than they agreed
       * to is both unfair and an exploit — raise the price the instant before
       * every payment and the ±50% band means nothing.
       */
      order.price = priceOf(world, item);
      world.eventQueue.emitOrderPlaced(order.entityId, customer.entityId, item);
      placed++;
    }

    if (placed === 0) {
      customer.state = STATE_QUEUEING_AT_COUNTER;
      return;
    }
    customer.state = STATE_WAITING_FOR_FOOD;
  }

  /**
   * Hand over whatever is on the pass for this customer.
   *
   * Automatic in Stage 1: the player is the waiter, and making them click twice
   * per customer would be busywork rather than a decision. Phase 10's waiters
   * replace this method and nothing around it.
   */
  private deliver(world: World, customer: CustomerRecord, slot: number): void {
    /*
     * The whole tray or nothing — ADR-016. A basket is handed over complete, so
     * the first-cooked item genuinely waits on the pass for the last, which is
     * what finally makes multi-item hold temperature a real cost.
     */
    if (!basketReady(world, slot)) return;

    /*
     * **Somebody has to carry it — Stage 3 onward.**
     *
     * Until there were tables, delivery happened on the same tick the food
     * reached the pass: the customer was standing at the counter and the
     * handover was instantaneous. PHASE_8_REPORT §6 measured the consequence —
     * food sat on the pass for **zero ticks out of 24 000** — and Phases 9 and
     * 10 each inherited it, leaving the pass plate indicator, the cooler and the
     * waiter role built and dormant.
     *
     * A seated customer is across the room. The order stays on the pass until a
     * waiter's `DELIVER_ORDER` task completes, which is what finally makes hold
     * temperature bite.
     */
    if (layoutForStage(world.progression.stage).tables.length > 0) return;

    for (let each = 0; each < world.orders.scanLimit; each++) {
      if (!world.orders.isActive(each)) continue;
      const plate = world.orders.at(each);
      if (plate.customerSlot !== slot || plate.state !== ORDER_ON_PASS) continue;
      plate.state = ORDER_DELIVERED;
      plate.deliveredAtMs = world.clock.simTimeMs;
      world.eventQueue.emitOrderDelivered(plate.entityId, customer.entityId);
    }
    customer.state = STATE_EATING;
    customer.timerMs = 0;
  }

  private eat(world: World, customer: CustomerRecord, deltaMs: number): void {
    customer.timerMs += deltaMs;
    if (customer.timerMs < EATING_MS) return;
    customer.timerMs = 0;
    customer.state = STATE_PAYING;
    void world;
  }

  /**
   * Money, tip, reputation and satisfaction, all at once.
   *
   * Cash is credited net of the ingredient cost so the figure on the HUD is the
   * one the player can spend. Booking revenue and subtracting cost in two places
   * would make the number briefly wrong every time somebody paid, and a HUD that
   * flickers upward before settling is worse than one that simply moves.
   */
  private pay(world: World, customer: CustomerRecord, slot: number): void {
    /*
     * One payment for the whole basket — ADR-016.
     *
     * The sums are per plate (each item's price was captured at ordering and
     * each plate's quality decayed on its own clock), but everything that is
     * *about the person* happens once: satisfaction is the mean over their
     * plates, the tip rides on the whole bill, reputation moves once, and
     * `customersServed` counts people. Counting per plate would have doubled
     * reputation gain at Stage 2 and tripled it at Stage 4 purely because the
     * baskets grew — a recalibration nobody asked for, hidden inside a payment
     * loop.
     */
    let bill = 0;
    let costs = 0;
    let satisfactionSum = 0;
    let plates = 0;

    for (let each = 0; each < world.orders.scanLimit; each++) {
      if (!world.orders.isActive(each)) continue;
      const order = world.orders.at(each);
      if (order.customerSlot !== slot) continue;

      const item = menuItem(order.item);
      const quality = currentQuality(order, world.clock.simTimeMs, effectValue(world, 'holdToleranceMs'));
      satisfactionSum += evaluateSatisfaction(order, quality, world.clock.simTimeMs, world);
      bill += order.price;
      costs += item.baseCost;
      plates++;

      order.state = ORDER_PAID;
      // The order's work is done; the record goes back to the pool immediately
      // so a busy service does not exhaust it while paid orders linger.
      world.orders.release(each);
    }

    if (plates === 0) {
      // Nothing to pay for. Reachable if the pool recycled it; they leave.
      customer.state = STATE_WALKING_TO_CAR;
      return;
    }

    const satisfaction = satisfactionSum / plates;
    const tip = bill * tipFraction(satisfaction);

    world.economy.cash += bill + tip - costs;
    world.economy.lifetimeRevenue += bill + tip;
    // Both sides of the transaction go into the sixty-second window, so the
    // rate on the HUD is net of what the food cost to make.
    recordRevenue(world, bill + tip);
    recordExpense(world, costs);
    recordOfflineSale(world, bill + tip, costs);
    world.economy.reputation = Math.min(
      REPUTATION.max,
      Math.max(REPUTATION.min, world.economy.reputation + reputationDelta(satisfaction) * 100),
    );
    world.stats.customersServed++;

    world.eventQueue.emitPayment(customer.entityId, bill, tip, satisfaction);

    customer.state = STATE_WALKING_TO_CAR;
    customer.queueIndex = -1;
  }
}

/**
 * Hand a plate to the person it belongs to — what a waiter's task *does*.
 *
 * Exported for `EmployeeFsmSystem`, which owns when a task finishes but must
 * not own what it means. Returns false when the plate is not actually ready,
 * which puts the task back on the board rather than consuming it — a waiter who
 * arrives at an empty pass should try again, not give up.
 */
export function deliverOrder(world: World, orderSlot: number): boolean {
  if (orderSlot < 0 || !world.orders.isActive(orderSlot)) return false;

  const order = world.orders.at(orderSlot);
  if (order.state !== ORDER_ON_PASS) return false;

  const customerSlot = order.customerSlot;
  if (customerSlot < 0 || !world.customers.isActive(customerSlot)) return false;

  /*
   * The whole tray, one trip — ADR-016. A waiter sent per plate would cross the
   * room three times for one table, and the second trip would find a customer
   * already eating. The task board posts one delivery per *basket* (see
   * `TaskBoardSystem`), and completing it hands over everything that is ready —
   * which, by the tray rule, is everything.
   */
  if (!basketReady(world, customerSlot)) return false;

  const customer = world.customers.at(customerSlot);
  for (let each = 0; each < world.orders.scanLimit; each++) {
    if (!world.orders.isActive(each)) continue;
    const plate = world.orders.at(each);
    if (plate.customerSlot !== customerSlot || plate.state !== ORDER_ON_PASS) continue;
    plate.state = ORDER_DELIVERED;
    plate.deliveredAtMs = world.clock.simTimeMs;
    world.eventQueue.emitOrderDelivered(plate.entityId, customer.entityId);
  }
  customer.state = STATE_EATING;
  customer.timerMs = 0;
  return true;
}

/**
 * Throw away every order belonging to a customer who has gone.
 *
 * Called when a customer record is released, for any reason. Without it an
 * abandoned order sits in the pool forever holding its station, and the pool
 * fills: measured at thirty live orders against four live customers, after which
 * nobody could order at all and the loop simply stopped. The symptom is a stand
 * that quietly stops taking money, which is the worst kind — it looks like a
 * balance problem.
 *
 * The food is wasted, not sold. The ingredient cost has already been paid at
 * `startPrep` time in the sense that matters — the station was occupied — and
 * charging for a meal nobody collected would make abandonment profitable.
 */
export function discardOrdersFor(world: World, customerSlot: number): void {
  for (let slot = 0; slot < world.orders.scanLimit; slot++) {
    if (!world.orders.isActive(slot)) continue;
    const order = world.orders.at(slot);
    if (order.customerSlot !== customerSlot) continue;

    // Only announce food that actually existed. An order abandoned before
    // anyone started it cost nothing but the customer.
    if (order.state === ORDER_ON_PASS || order.state === ORDER_COOKING) {
      world.stats.ordersWasted++;
    }
    world.orders.release(slot);
  }
}

/**
 * What an item costs today, honouring the player's price and the ±50% band.
 *
 * The band is applied here rather than trusted at the point of sale, because a
 * price is set by a command and a command is replayed from a log — a save
 * written by a build with a wider band must not be able to smuggle a price
 * through this one.
 */
function priceOf(world: World, itemIndex: number): number {
  const item = menuItem(itemIndex);
  const set = world.economy.prices.get(item.id);
  if (set === undefined) return item.basePrice;
  const min = item.basePrice * PRICE_BAND.min;
  const max = item.basePrice * PRICE_BAND.max;
  return Math.min(max, Math.max(min, set));
}
