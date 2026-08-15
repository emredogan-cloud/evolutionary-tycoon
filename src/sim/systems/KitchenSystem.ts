import { holdTemperature, menuItem } from '@config/economy/menu';
import { PASS_CAPACITY, station, STATIONS } from '@config/economy/stations';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { OrderRecord } from '../stores/OrderStore';
import { ORDER_COOKING, ORDER_ON_PASS, ORDER_PLACED } from '../stores/OrderStore';

/**
 * The kitchen — station reservation, preparation, and the pass.
 *
 * Three rules, and each is a capacity ceiling rather than a preference:
 *
 * 1. **One order per station at a time.** ECONOMY_DESIGN §7 (Fren 3) lists
 *    stations alongside parking and tables as the finite things that let
 *    capacity cut demand. It is also what makes a second prep station a
 *    meaningful purchase in Phase 9 instead of a cosmetic one.
 *
 * 2. **FIFO within the station's queue.** The oldest waiting order for a free
 *    station goes next. Anything cleverer — shortest job first, highest margin
 *    first — optimises throughput and makes the player's experience worse: they
 *    would watch a customer be skipped and have no way to see why.
 *
 * 3. **The pass is finite.** A full pass blocks the kitchen. Without that,
 *    cooking everything the instant it is ordered would be free and hold
 *    temperature would never bite, which is the entire mechanic that punishes
 *    "many cooks, too few waiters".
 *
 * ## Preparation does not start on its own
 *
 * In Stage 1 the player is the cook. An order sits in `PLACED` until a
 * `MANUAL_PREP` command starts it, and `startPrep` below is what that command
 * calls. Phase 10's cooks call the same function — which is why it is a method
 * on the system rather than logic inside the command handler.
 */
export class KitchenSystem implements SimSystem {
  readonly name = 'KitchenSystem' as const;

  run(world: World, deltaMs: number): void {
    if (deltaMs <= 0) return;
    const orders = world.orders;
    if (orders.activeCount === 0) return;

    for (let slot = 0; slot < orders.scanLimit; slot++) {
      if (!orders.isActive(slot)) continue;
      const order = orders.at(slot);
      if (order.state !== ORDER_COOKING) continue;

      this.advanceCooking(world, order);
    }
  }

  /**
   * Move a cooking order onto the pass when its time is up.
   *
   * The finish time is derived from `startedAtMs` and the station's speed rather
   * than counted down on the record. A countdown would have to be decremented by
   * `deltaMs` every tick, which makes the result depend on how the tick was
   * subdivided — and at 4x speed the simulation takes larger steps.
   */
  private advanceCooking(world: World, order: OrderRecord): void {
    const item = menuItem(order.item);
    const kitchen = station(order.station);
    const finishesAt = order.startedAtMs + item.prepTimeMs / kitchen.speed;
    if (world.clock.simTimeMs < finishesAt) return;

    /*
     * A full pass holds the order at the station rather than dropping it. The
     * station stays occupied, which is exactly the back-pressure that makes the
     * pass a real constraint: block the pass and the kitchen stops, not the
     * other way round.
     */
    if (passLoad(world) >= PASS_CAPACITY) return;

    order.state = ORDER_ON_PASS;
    order.readyAtMs = finishesAt;
    order.station = -1;
    world.eventQueue.emitOrderReady(order.entityId, order.item);
  }
}

/*
 * The next four are free functions rather than methods, and that is a layering
 * decision. `MANUAL_PREP` has to start a preparation, and a command handler
 * cannot reach a system instance without `World` holding one — which would be a
 * cycle (`World` -> system -> `World`) that dependency-cruiser rejects, and
 * rightly: state should not own behaviour. Phase 10's cooks call the same
 * functions, which is the other half of why they are not private.
 */

/**
 * Begin preparing an order at a free station of the right type.
 *
 * Returns false when there is nowhere to start it — no free station, or the
 * order is not waiting. The caller decides what that means: the `MANUAL_PREP`
 * command reports it back to the player, and Phase 10's cook simply tries again
 * next tick.
 */
export function startPrep(world: World, orderSlot: number): boolean {
  if (!world.orders.isActive(orderSlot)) return false;
  const order = world.orders.at(orderSlot);
  if (order.state !== ORDER_PLACED) return false;

  const item = menuItem(order.item);
  const free = freeStationOfType(world, item.station);
  if (free < 0) return false;

  order.state = ORDER_COOKING;
  order.station = free;
  order.startedAtMs = world.clock.simTimeMs;
  /*
   * Quality is fixed when preparation starts, from the recipe and the station
   * that made it. Hold decay is applied later and separately, so the two are
   * never confused: one is how well it was made, the other is how long it sat.
   */
  order.quality = Math.min(1, item.qualityBase * station(free).quality);

  world.eventQueue.emitPrepStarted(order.entityId, free, item.prepTimeMs / station(free).speed);
  return true;
}

/**
 * The oldest order waiting for a station that is free right now.
 *
 * FIFO by `orderedAtMs`, with the slot index as the tie-break so two orders
 * placed on the same tick resolve the same way on every engine. Used by
 * `MANUAL_PREP` when the player clicks a station rather than naming an order.
 */
export function nextStartable(world: World): number {
  let best = -1;
  let bestTime = Number.POSITIVE_INFINITY;

  for (let slot = 0; slot < world.orders.scanLimit; slot++) {
    if (!world.orders.isActive(slot)) continue;
    const order = world.orders.at(slot);
    if (order.state !== ORDER_PLACED) continue;
    if (freeStationOfType(world, menuItem(order.item).station) < 0) continue;

    if (order.orderedAtMs < bestTime || (order.orderedAtMs === bestTime && slot < best)) {
      bestTime = order.orderedAtMs;
      best = slot;
    }
  }
  return best;
}

/** Plates currently on the pass. */
export function passLoad(world: World): number {
  let count = 0;
  for (let slot = 0; slot < world.orders.scanLimit; slot++) {
    if (!world.orders.isActive(slot)) continue;
    if (world.orders.at(slot).state === ORDER_ON_PASS) count++;
  }
  return count;
}

/** True when every station of every type is busy. */
export function stationsAllBusy(world: World): boolean {
  for (let index = 0; index < STATIONS.length; index++) {
    if (!stationBusy(world, index)) return false;
  }
  return true;
}

function freeStationOfType(world: World, type: string): number {
  for (let index = 0; index < STATIONS.length; index++) {
    if (station(index).type !== type) continue;
    if (!stationBusy(world, index)) return index;
  }
  return -1;
}

function stationBusy(world: World, index: number): boolean {
  for (let slot = 0; slot < world.orders.scanLimit; slot++) {
    if (!world.orders.isActive(slot)) continue;
    const order = world.orders.at(slot);
    if (order.state === ORDER_COOKING && order.station === index) return true;
  }
  return false;
}

/**
 * Quality of a plate right now, including what sitting on the pass has cost it.
 *
 * Exported as a function of the order rather than stored on it, because it
 * changes every tick and a stored value would need writing every tick for
 * something only read at delivery — and the world hash would then depend on a
 * number nothing acts on.
 */
export function currentQuality(order: OrderRecord, nowMs: number): number {
  if (order.state !== ORDER_ON_PASS && order.deliveredAtMs === 0) return order.quality;
  const until = order.deliveredAtMs > 0 ? order.deliveredAtMs : nowMs;
  const heldMs = Math.max(0, until - order.readyAtMs);
  const item = menuItem(order.item);
  // `holdTemperature` works from the recipe's own base; scale by however the
  // station modified it, so a better grill still produces better food after a
  // wait than a worse one does.
  const stationFactor = item.qualityBase > 0 ? order.quality / item.qualityBase : 1;
  return holdTemperature(item, heldMs) * stationFactor;
}
