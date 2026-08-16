import { DRIVE_THRU_ORDER_MS, DRIVE_THRU_WINDOW_MS } from '@config/driveThru';
import { layoutForStage } from '@config/layouts';
import { menuItem, MENU } from '@config/economy/menu';
import { REPUTATION } from '@config/satisfaction';
import {
  CHANNEL_DRIVE_THRU,
  STATE_DT_COLLECTING,
  STATE_DT_ORDERING,
  STATE_DT_QUEUEING,
} from '../ai/fsm/driveThruFsm';
import { STATE_EXITING } from '../ai/fsm/customerFsm';
import type { World } from '../core/World';
import { ORDER_DELIVERED, ORDER_ON_PASS, ORDER_PAID } from '../stores/OrderStore';
import { recordExpense, recordRevenue } from './EconomySystem';
import { currentQuality } from './KitchenSystem';
import { evaluateSatisfaction, reputationDelta, tipFraction } from './SatisfactionSystem';
import { effectValue } from './UpgradeSystem';
import { VEHICLE_DT_ADVANCING, VEHICLE_PARKED } from './VehicleManeuverSystem';

/**
 * The drive-thru channel — Phase 11, Stage 4.
 *
 * Free functions rather than a pipeline system, for the reason the kitchen's
 * and the upgrades' are: there is no nineteenth slot in `SYSTEM_ORDER`. These
 * are called from `QueueSystem` (which owns queues and their spillover) and
 * `ServiceSystem` (which owns ordering, service and payment), because a
 * drive-thru queue *is* a queue and a drive-thru sale *is* a sale.
 *
 * ## What makes it a different channel rather than a second counter
 *
 * Three things, and all three are asymmetries rather than parameters:
 *
 * - **Patience is scaled down hard.** The engine is running.
 * - **Nobody gets out.** The car occupies the lane for the whole transaction,
 *   so slow service costs a *place in the queue*, not just a customer.
 * - **The lane backs onto the road.** Cars past `laneCapacity` are visible to
 *   drivers who have not decided yet, so a jam suppresses conversion — the same
 *   negative feedback loop the counter queue has, on a queue the player built
 *   deliberately.
 */

/**
 * Move the lane up.
 *
 * Called every tick from `QueueSystem`. A car whose slot in front has emptied
 * starts creeping; the movement itself is `VehicleManeuverSystem`'s job, and
 * this only decides *that* it should happen. Splitting it that way keeps the
 * one rule that matters — nothing sets a position directly — in one place.
 */
export function compactDriveThruLane(world: World): void {
  const layout = layoutForStage(world.progression.stage);
  if (layout.driveThru === null) return;

  const customers = world.customers;
  /*
   * Front to back, so a car that moves up frees its slot before the car behind
   * is considered. Back to front would move the whole queue one slot per tick
   * only in the best case and would stall behind any car that had not yet
   * finished creeping.
   */
  for (let target = 0; target < layout.driveThru.lane.length; target++) {
    if (occupantOf(world, target) >= 0) continue;

    const behind = occupantOf(world, target + 1);
    if (behind < 0) continue;

    const customer = customers.at(behind);
    const vehicleSlot = customer.vehicleSlot;
    if (vehicleSlot < 0 || !world.vehicles.isActive(vehicleSlot)) continue;

    /*
     * **Only a car that has actually stopped in its slot may creep.**
     *
     * `VEHICLE_PARKED` is the whole condition, and getting it wrong was a real
     * defect: without it, a car still running its entry manoeuvre — state
     * `DT_APPROACHING`, `VEHICLE_ENTERING` — was switched to `DT_ADVANCING`
     * with `maneuverS` reset to zero, which threw away the arrival it was
     * halfway through. The lane then held cars that were permanently arriving
     * and never ordered. It cost every drive-thru sale in the run and produced
     * no error at all.
     */
    if (world.vehicles.state[vehicleSlot] !== VEHICLE_PARKED) continue;

    customer.laneSlot = target;
    world.vehicles.state[vehicleSlot] = VEHICLE_DT_ADVANCING;
    world.vehicles.maneuverS[vehicleSlot] = 0;
  }
}

/** Who is sitting in this lane slot, or -1. */
export function occupantOf(world: World, laneSlot: number): number {
  const customers = world.customers;
  for (let slot = 0; slot < customers.scanLimit; slot++) {
    if (!customers.isActive(slot)) continue;
    if (customers.at(slot).laneSlot === laneSlot) return slot;
  }
  return -1;
}

/** How many cars are in the lane, including any spilled onto the approach. */
export function laneLength(world: World): number {
  const customers = world.customers;
  let count = 0;
  for (let slot = 0; slot < customers.scanLimit; slot++) {
    if (!customers.isActive(slot)) continue;
    if (customers.at(slot).laneSlot >= 0) count++;
  }
  return count;
}

/**
 * Cars queued past the lane's capacity — the ones spilling onto the road.
 *
 * Feeds the same `spilloverPenalty` the counter queue does. A drive-thru that
 * backs up is visible to every driver who has not decided yet, which is what
 * stops "build a lane and capture everything" from being the only strategy.
 */
export function driveThruOverflow(world: World): number {
  const layout = layoutForStage(world.progression.stage);
  if (layout.driveThru === null) return 0;
  return Math.max(0, laneLength(world) - driveThruCapacity(world, layout.driveThru.laneCapacity));
}

/**
 * How many cars the lane holds, after upgrades — Phase 13's `laneCapacity`.
 *
 * Stage 4 authors **six** lane points and a capacity of four, so `lane-extension`
 * has somewhere real to extend to: the two spare points were always there,
 * waiting for the upgrade that repaints the lane further back up the lot.
 * Clamped to the authored points, because capacity past the last one would tell
 * the overflow penalty the lane is fine while there is nowhere for the next car.
 */
function driveThruCapacity(world: World, authored: number): number {
  const layout = layoutForStage(world.progression.stage);
  const points = layout.driveThru?.lane.length ?? authored;
  return Math.min(points, authored + effectValue(world, 'laneCapacity'));
}

/**
 * One drive-thru customer's turn — called from `ServiceSystem`.
 *
 * Returns true when it handled the customer, so the caller's switch can fall
 * through to the counter states for everybody else.
 */
export function stepDriveThruCustomer(world: World, customerSlot: number, deltaMs: number): boolean {
  const customer = world.customers.at(customerSlot);
  if (customer.channel !== CHANNEL_DRIVE_THRU) return false;

  switch (customer.state) {
    case STATE_DT_ORDERING:
      order(world, customerSlot, deltaMs);
      return true;
    case STATE_DT_QUEUEING:
      checkWindow(world, customerSlot);
      return true;
    case STATE_DT_COLLECTING:
      collect(world, customerSlot, deltaMs);
      return true;
    default:
      return false;
  }
}

/** Place the order at the post, after a beat. */
function order(world: World, customerSlot: number, deltaMs: number): void {
  const customer = world.customers.at(customerSlot);
  customer.timerMs += deltaMs;
  /*
   * Ordering at the post. `orderSpeed` is the counter's own upgrade — a menu
   * board helps a driver decide too — and `orderPostSpeed` is the drive-thru's
   * second post, which halves the wait by taking two cars at once.
   */
  const orderMs =
    DRIVE_THRU_ORDER_MS * effectValue(world, 'orderSpeed') * effectValue(world, 'orderPostSpeed');
  if (customer.timerMs < orderMs) return;
  customer.timerMs = 0;

  const orderSlot = world.orders.acquire();
  if (orderSlot < 0) {
    // The pool is full. They wait in the lane rather than being dropped — the
    // car is physically there and cannot be made to vanish.
    return;
  }

  const roll = world.rng.customer.next();
  const item = Math.min(MENU.length - 1, Math.floor(roll * MENU.length));

  const record = world.orders.at(orderSlot);
  record.entityId = world.allocateEntityId();
  record.customerSlot = customerSlot;
  record.item = item;
  record.orderedAtMs = world.clock.simTimeMs;
  record.price = priceOfItem(world, item);

  customer.state = STATE_DT_QUEUEING;
  world.eventQueue.emitOrderPlaced(record.entityId, customer.entityId, item);
}

/**
 * At the window with food ready? Then collect.
 *
 * Both conditions, and the order matters: a car at the window with no food
 * waits there and blocks the lane, which is exactly the failure a player is
 * meant to feel when the kitchen cannot keep up.
 */
function checkWindow(world: World, customerSlot: number): void {
  const customer = world.customers.at(customerSlot);
  if (customer.laneSlot !== 0) return;

  const orderSlot = orderOf(world, customerSlot);
  if (orderSlot < 0) return;
  const order = world.orders.at(orderSlot);
  if (order.state !== ORDER_ON_PASS) return;

  order.state = ORDER_DELIVERED;
  order.deliveredAtMs = world.clock.simTimeMs;
  customer.state = STATE_DT_COLLECTING;
  customer.timerMs = 0;
  world.eventQueue.emitOrderDelivered(order.entityId, customer.entityId);
}

/**
 * Hand it over, take the money, and let them drive off.
 *
 * The same satisfaction, tip and reputation model the counter uses — a
 * drive-thru sale is a sale. What differs is that the customer never ate here,
 * so they go straight from the window to the exit manoeuvre.
 */
function collect(world: World, customerSlot: number, deltaMs: number): void {
  const customer = world.customers.at(customerSlot);
  customer.timerMs += deltaMs;
  // The window, and whatever makes it faster — a wider sill, a card reader.
  if (customer.timerMs < DRIVE_THRU_WINDOW_MS * effectValue(world, 'windowSpeed')) return;
  customer.timerMs = 0;

  const orderSlot = orderOf(world, customerSlot);
  if (orderSlot < 0) {
    customer.laneSlot = -1;
    customer.state = STATE_EXITING;
    return;
  }

  const order = world.orders.at(orderSlot);
  const item = menuItem(order.item);
  const quality = currentQuality(order, world.clock.simTimeMs, effectValue(world, 'holdToleranceMs'));
  const satisfaction = evaluateSatisfaction(order, quality, world.clock.simTimeMs, world);
  const tip = order.price * tipFraction(satisfaction);

  world.economy.cash += order.price + tip - item.baseCost;
  world.economy.lifetimeRevenue += order.price + tip;
  recordRevenue(world, order.price + tip);
  recordExpense(world, item.baseCost);
  world.economy.reputation = Math.min(
    REPUTATION.max,
    Math.max(REPUTATION.min, world.economy.reputation + reputationDelta(satisfaction) * 100),
  );
  world.stats.customersServed++;
  world.stats.driveThruServed++;

  order.state = ORDER_PAID;
  world.eventQueue.emitPayment(customer.entityId, order.price, tip, satisfaction);
  world.orders.release(orderSlot);

  /*
   * Out of the lane before the exit manoeuvre starts, so the car behind can
   * begin creeping on the same tick. Holding the slot until the car has
   * physically left would add a full exit manoeuvre of dead time to every
   * transaction — which at Stage 4 volumes is most of the lane's capacity.
   */
  customer.laneSlot = -1;
  customer.state = STATE_EXITING;
}

function orderOf(world: World, customerSlot: number): number {
  for (let slot = 0; slot < world.orders.scanLimit; slot++) {
    if (!world.orders.isActive(slot)) continue;
    if (world.orders.at(slot).customerSlot === customerSlot) return slot;
  }
  return -1;
}

function priceOfItem(world: World, itemIndex: number): number {
  const item = menuItem(itemIndex);
  return world.economy.prices.get(item.id) ?? item.basePrice;
}
