import { STAGE_BASKETS, drinkPoolFor, sidePoolFor } from '@config/economy/basket';
import { menuForStage, menuIndexOf } from '@config/economy/menu';
import type { World } from '../core/World';
import { ORDER_DELIVERED, ORDER_ON_PASS, ORDER_PAID } from '../stores/OrderStore';

/**
 * The basket, as the sim rolls and reads it — ADR-016.
 *
 * Its own module because three systems need it — the counter, the drive-thru
 * and the task board — and two of those already import each other's neighbours:
 * `ServiceSystem` steps drive-thru customers, so the drive-thru importing
 * `ServiceSystem` back for these helpers closed the exact cycle
 * `dependency-cruiser` exists to forbid. Shared vocabulary lives below both.
 */

/**
 * Roll one customer's basket — ADR-016.
 *
 * The base item is uniformly chosen from the stage menu, exactly as before, so
 * every item keeps its identity and its sales. Extras are then drawn from the
 * side and drink pools with the per-stage chances `@config/economy/basket`
 * solved against ECONOMY_DESIGN §3's designed tickets.
 *
 * All rolls come from the `customer` stream in a fixed order (base, then per
 * draw: side roll, side pick, drink roll, drink pick), so the sequence is
 * deterministic and adding a draw at one stage cannot shift another stage's
 * choices. Writes into a caller-supplied array to keep the tick allocation-free.
 */
export function rollBasket(world: World, stage: number, out: number[]): number {
  out.length = 0;
  const available = menuForStage(stage);
  const baseRoll = world.rng.customer.next();
  const base = available[Math.min(available.length - 1, Math.floor(baseRoll * available.length))];
  if (base !== undefined) out.push(menuIndexOf(base.id));

  const basket = STAGE_BASKETS[(stage < 1 ? 1 : stage > 4 ? 4 : stage) as 1 | 2 | 3 | 4];
  const sides = sidePoolFor(stage);
  const drinks = drinkPoolFor(stage);
  for (let draw = 0; draw < basket.draws; draw++) {
    if (sides.length > 0 && world.rng.customer.next() < basket.sideChance) {
      const pick = sides[Math.min(sides.length - 1, Math.floor(world.rng.customer.next() * sides.length))];
      if (pick !== undefined) out.push(menuIndexOf(pick.id));
    }
    if (drinks.length > 0 && world.rng.customer.next() < basket.drinkChance) {
      const pick = drinks[Math.min(drinks.length - 1, Math.floor(world.rng.customer.next() * drinks.length))];
      if (pick !== undefined) out.push(menuIndexOf(pick.id));
    }
  }
  return out.length;
}

/**
 * Whether every order on a customer's basket is assembled on the pass.
 *
 * The tray rule: a basket is handed over complete, never one plate at a time —
 * which is both what a counter does and what makes multi-item hold temperature
 * *mean* something, because the first-cooked item waits for the last. False
 * when any order is still placed or cooking, and false when there is nothing
 * at all.
 */
export function basketReady(world: World, customerSlot: number): boolean {
  let any = false;
  for (let slot = 0; slot < world.orders.scanLimit; slot++) {
    if (!world.orders.isActive(slot)) continue;
    const order = world.orders.at(slot);
    if (order.customerSlot !== customerSlot) continue;
    if (order.state === ORDER_PAID || order.state === ORDER_DELIVERED) continue;
    if (order.state !== ORDER_ON_PASS) return false;
    any = true;
  }
  return any;
}

/**
 * The customer's lowest active order slot, or -1.
 *
 * The basket's *handle*: systems that need one representative order — the task
 * board posting a single delivery, the payment loop starting somewhere — use
 * the lowest slot so every scan of the same basket lands on the same order.
 */
export function firstOrderOf(world: World, customerSlot: number): number {
  for (let slot = 0; slot < world.orders.scanLimit; slot++) {
    if (!world.orders.isActive(slot)) continue;
    if (world.orders.at(slot).customerSlot === customerSlot) return slot;
  }
  return -1;
}
