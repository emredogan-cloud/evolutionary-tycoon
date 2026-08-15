import { menuItem } from '@config/economy/menu';
import { PASS, station } from '@config/economy/stations';
import type { Sim } from '@sim/core/Sim';
import type { ReadonlySimEvent } from '@sim/core/events';
import { ORDER_COOKING, ORDER_ON_PASS, ORDER_PLACED } from '@sim/stores/OrderStore';
import { currentQuality } from '@sim/systems/KitchenSystem';
import {
  MARKER_COIN,
  MARKER_ORDER,
  MARKER_PASS,
  MARKER_PREP,
  type HudModel,
  type HudSource,
  type WorldMarker,
} from './hudModel';
import type { ScreenProjector } from './ScreenProjector';

/**
 * The one place the DOM overlay learns anything, and the rate it learns it at.
 *
 * ## Why a throttle at all
 *
 * The simulation ticks at 20 Hz and the display runs at 60 or more. Svelte
 * reactivity is cheap per update and ruinous per frame: every sample sets state
 * that invalidates components, and at 60 Hz that is a layout pass per frame
 * competing with the renderer for a 16.6 ms budget. Ten samples a second is
 * faster than a player can read a changing number and an order of magnitude less
 * work (TECHNICAL_ARCHITECTURE §7).
 *
 * Making it structural rather than advisory is the point. `src/ui` cannot import
 * `src/sim`, so there is no per-frame path available to it even by accident.
 *
 * ## Why sim time gates the content and wall time gates the rate
 *
 * Both, and for different reasons. Wall time bounds DOM work per real second —
 * at 4x speed the world moves four times as fast but the player's eyes do not.
 * Sim time drives everything *inside* a sample, including how far a coin popup
 * has floated, so a frozen world produces a byte-identical overlay however long
 * the screenshot takes. A popup fading on `Date.now()` would make the visual
 * golden flake, and it would flake at a different rate on CI than here.
 */

/** Ten samples a second. */
export const UI_SAMPLE_MS = 100;

/** How long `+₡` stays on screen, in simulation milliseconds. */
export const COIN_POPUP_MS = 1600;

/** Concurrent coin popups. Beyond this the oldest is dropped. */
export const MAX_COIN_POPUPS = 12;

/** How high the coin floats, in metres, over its life. */
const COIN_RISE_METRES = 0.9;

/** Plates on the pass are spread along it rather than stacked on one point. */
const PASS_PLATE_SPACING_METRES = 0.42;
const PASS_PLATE_HEIGHT_METRES = 1.15;

/** Bubbles and rings sit above the thing they describe. */
const ORDER_BUBBLE_HEIGHT_METRES = 1.95;
const PREP_RING_HEIGHT_METRES = 1.4;

interface CoinPopup {
  entityId: number;
  x: number;
  y: number;
  amount: number;
  bornAtMs: number;
}

/**
 * Mutable inside the bridge, readonly to everyone who receives it.
 *
 * Written out rather than intersected with `HudModel`, because an intersection
 * keeps the readonly modifier from the other side and the whole thing silently
 * becomes unwritable again.
 */
type MutableMarker = { -readonly [K in keyof WorldMarker]: WorldMarker[K] };
interface MutableHud {
  cash: number;
  reputation: number;
  customersServed: number;
  ordersActive: number;
  customersWaiting: number;
  gameDay: number;
  gameHour: number;
  paused: boolean;
  speedMultiplier: number;
  markers: MutableMarker[];
  markerCount: number;
}

export class UiBridge implements HudSource {
  private readonly sim: Sim;
  private readonly project: ScreenProjector;
  private readonly listeners = new Set<(model: HudModel) => void>();

  /**
   * Payments arrive on a tick and are drawn over the following second and a
   * half, so the popup outlives the event that made it. The bridge holds them
   * because they are presentation: nothing about the game's outcome depends on
   * whether a coin is still in the air, and putting them in the world would add
   * state that has to be hashed, saved and migrated for no reason.
   */
  private readonly coins: CoinPopup[] = [];
  private unsubscribeEvents: (() => void) | null = null;

  private lastSampleMs = Number.NEGATIVE_INFINITY;
  private readonly model: MutableHud;
  private readonly scratch = { x: 0, y: 0 };

  constructor(sim: Sim, project: ScreenProjector) {
    this.sim = sim;
    this.project = project;

    // One marker per live order can want a bubble and a ring, and coins are
    // capped, so this bound is reached rather than guessed. Allocated once: a
    // sampler that grew an array would allocate during play, ten times a second.
    const capacity = sim.world.orders.capacity * 2 + MAX_COIN_POPUPS;
    const markers: MutableMarker[] = new Array<MutableMarker>(capacity);
    for (let i = 0; i < capacity; i++) {
      markers[i] = {
        key: 0,
        kind: MARKER_ORDER,
        screenX: 0,
        screenY: 0,
        visible: false,
        itemId: '',
        progress: 0,
        amount: 0,
        age: 0,
      };
    }

    this.model = {
      cash: 0,
      reputation: 0,
      customersServed: 0,
      ordersActive: 0,
      customersWaiting: 0,
      gameDay: 0,
      gameHour: 0,
      paused: false,
      speedMultiplier: 1,
      markers,
      markerCount: 0,
    };
  }

  /** Begin watching payments. Idempotent. */
  start(): void {
    if (this.unsubscribeEvents !== null) return;
    this.unsubscribeEvents = this.sim.events.subscribe((event) => {
      this.onEvent(event);
    });
  }

  stop(): void {
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = null;
  }

  /**
   * Offer the bridge a chance to publish. Called every frame; publishes rarely.
   *
   * Takes wall-clock milliseconds rather than reading them, because `src/app`
   * owns the clock and a bridge that called `Date.now()` itself could not be
   * tested without faking a global.
   */
  sample(wallClockMs: number): void {
    if (wallClockMs - this.lastSampleMs < UI_SAMPLE_MS) return;
    this.lastSampleMs = wallClockMs;
    this.publish();
  }

  /**
   * Publish immediately, whatever the throttle says.
   *
   * Two callers need it: boot, so the HUD is not blank for a tenth of a second,
   * and the frozen scenes used by visual regression, which never advance and so
   * would otherwise never produce a first sample.
   */
  refresh(): void {
    this.publish();
  }

  subscribe(run: (model: HudModel) => void): () => void {
    // Filled, then handed over. A subscriber that received the model *before*
    // anything wrote to it would render a stand with no cash and no customers
    // for a tenth of a second at boot — and forever on a frozen scene.
    this.refill();
    this.listeners.add(run);
    run(this.model);
    return () => {
      this.listeners.delete(run);
    };
  }

  private onEvent(event: ReadonlySimEvent): void {
    if (event.t !== 'PAYMENT') return;

    const world = this.sim.world;
    const customers = world.customers;
    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (customer.entityId !== event.customerId) continue;

      // Oldest out first. A stand busy enough to overflow twelve popups has a
      // bigger story to tell than the twelfth coin.
      if (this.coins.length >= MAX_COIN_POPUPS) this.coins.shift();
      this.coins.push({
        entityId: customer.entityId,
        x: customer.x,
        y: customer.y,
        amount: event.amount + event.tip,
        bornAtMs: world.clock.simTimeMs,
      });
      return;
    }
  }

  private publish(): void {
    this.refill();
    for (const listener of this.listeners) listener(this.model);
  }

  /**
   * Bring the model up to date without telling anyone.
   *
   * Separate from `publish` so `subscribe` can fill it for one new listener
   * without notifying every existing one — a notify from inside `subscribe`
   * would re-enter component code that is still mounting.
   */
  private refill(): void {
    const world = this.sim.world;
    const nowMs = world.clock.simTimeMs;
    const model = this.model;

    model.cash = world.economy.cash;
    model.reputation = world.economy.reputation;
    model.customersServed = world.stats.customersServed;
    model.ordersActive = world.orders.activeCount;
    model.gameDay = world.clock.gameDay;
    model.gameHour = world.clock.gameHour;
    model.paused = world.control.paused;
    model.speedMultiplier = world.control.speedMultiplier;

    let count = 0;
    let waiting = 0;
    let plates = 0;

    const orders = world.orders;
    for (let slot = 0; slot < orders.scanLimit; slot++) {
      if (!orders.isActive(slot)) continue;
      const order = orders.at(slot);
      const item = menuItem(order.item);

      // What they asked for, over their head, until it is in their hands.
      if (order.state === ORDER_PLACED || order.state === ORDER_COOKING || order.state === ORDER_ON_PASS) {
        waiting++;
        const customerSlot = order.customerSlot;
        if (customerSlot >= 0 && world.customers.isActive(customerSlot)) {
          const customer = world.customers.at(customerSlot);
          const marker = model.markers[count];
          if (marker !== undefined) {
            marker.key = order.entityId;
            marker.kind = MARKER_ORDER;
            marker.itemId = item.id;
            marker.progress = 0;
            marker.amount = 0;
            marker.age = 0;
            marker.visible = this.projectInto(
              customer.x,
              customer.y,
              customer.z + ORDER_BUBBLE_HEIGHT_METRES,
              marker,
            );
            count++;
          }
        }
      }

      /*
       * A finished plate, on the pass, losing heat. Anchored to the pass rather
       * than to the customer because the whole point of the mechanic is that the
       * food and the person it belongs to are in *different places* — and the
       * gap between them is the thing Phase 10's waiters close.
       */
      if (order.state === ORDER_ON_PASS) {
        const marker = model.markers[count];
        if (marker !== undefined) {
          const quality = currentQuality(order, nowMs);
          marker.key = order.entityId * 8 + 5;
          marker.kind = MARKER_PASS;
          marker.itemId = item.id;
          marker.progress = item.qualityBase > 0 ? Math.min(1, quality / item.qualityBase) : 1;
          marker.amount = 0;
          marker.age = 0;
          marker.visible = this.projectInto(
            PASS.x + plates * PASS_PLATE_SPACING_METRES,
            PASS.y,
            PASS_PLATE_HEIGHT_METRES,
            marker,
          );
          count++;
          plates++;
        }
      }

      // And how the cooking is going, over the station doing it.
      if (order.state === ORDER_COOKING && order.station >= 0) {
        const kitchen = station(order.station);
        const duration = item.prepTimeMs / kitchen.speed;
        const marker = model.markers[count];
        if (marker !== undefined) {
          // Negative-key namespace so a ring and a bubble for the same order
          // never collide in the keyed `{#each}`.
          marker.key = -order.entityId;
          marker.kind = MARKER_PREP;
          marker.itemId = item.id;
          marker.progress =
            duration > 0 ? Math.min(1, Math.max(0, (nowMs - order.startedAtMs) / duration)) : 1;
          marker.amount = 0;
          marker.age = 0;
          marker.visible = this.projectInto(kitchen.x, kitchen.y, PREP_RING_HEIGHT_METRES, marker);
          count++;
        }
      }
    }

    // Coins, oldest first, dropping any whose time is up.
    let live = 0;
    for (const coin of this.coins) {
      const age = (nowMs - coin.bornAtMs) / COIN_POPUP_MS;
      if (age >= 1 || age < 0) continue;

      // Compaction in place: survivors are written back at or before the index
      // being read, so the iteration never sees an entry it has not yet passed.
      this.coins[live++] = coin;
      const marker = model.markers[count];
      if (marker !== undefined) {
        marker.key = coin.entityId * 8 + 3;
        marker.kind = MARKER_COIN;
        marker.itemId = '';
        marker.progress = 0;
        marker.amount = coin.amount;
        marker.age = age;
        marker.visible = this.projectInto(coin.x, coin.y, 1.2 + COIN_RISE_METRES * age, marker);
        count++;
      }
    }
    this.coins.length = live;

    model.customersWaiting = waiting;
    model.markerCount = count;
  }

  private projectInto(x: number, y: number, z: number, marker: MutableMarker): boolean {
    const visible = this.project(x, y, z, this.scratch);
    marker.screenX = this.scratch.x;
    marker.screenY = this.scratch.y;
    return visible;
  }
}
