import { MENU, PRICE_BAND, menuItem } from '@config/economy/menu';
import { CONVERSION_REASONS } from '@config/conversion';
import { EVENT_SPECS } from '@config/events';
import { WEATHER_STATES } from '@config/weather';
import { activeEventSlot, currentWeather } from '@sim/systems/EventSystem';
import { UPGRADES } from '@config/economy/upgrades';
import { EMPLOYEE_ROLES, MAX_EMPLOYEES, TASK_KINDS, role } from '@config/employees';
import { requirementFor } from '@config/progression';
import type { StageRequirement } from '@config/progression';
import { buildDurationMs } from '@config/economy/upgrades';
import { PASS, station } from '@config/economy/stations';
import type { Sim } from '@sim/core/Sim';
import { ORDER_PAID, orderStateName } from '@sim/stores/OrderStore';
import { nextStartable } from '@sim/systems/KitchenSystem';
import { isServable } from '@sim/systems/ServiceSystem';
import { playerLevel, upgradeLevelRequirement } from '@sim/systems/playerLevel';
import { effectValue } from '@sim/systems/UpgradeSystem';
import type { World } from '@sim/core/World';
import { PROPERTIES, propertyLevelArt } from '@config/properties';
import type { LevelArtKind } from '@config/properties';
import {
  maxPropertyLevel,
  pendingPropertyLevel,
  propertyBuildMs,
  propertyCapacity,
  propertyCost,
  propertyAnchor,
  propertyLevel,
  propertyVia,
} from '@sim/systems/properties';
import type { ReadonlySimEvent } from '@sim/core/events';
import { ORDER_COOKING, ORDER_ON_PASS, ORDER_PLACED } from '@sim/stores/OrderStore';
import { brainStateName } from '@sim/ai/EmployeeBrain';
import { netIncomePerMinute } from '@sim/systems/EconomySystem';
import { missingProperties, reserveFor } from '@sim/systems/ProgressionSystem';
import {
  constructionProgress,
  constructionRemainingMs,
  isConstructing,
} from '@sim/systems/ConstructionSystem';
import { MAX_PLACED_OBJECTS } from '@sim/systems/LayoutSystem';
import { payrollPerMinute } from '@sim/systems/StaffSystem';
import { totalUpgradeLevels } from '@sim/systems/UpgradeSystem';
import { currentQuality } from '@sim/systems/KitchenSystem';
import { nextUpgradeCost, previewNextLevel, upgradeLevel } from '@sim/systems/UpgradeSystem';
import {
  MARKER_COIN,
  MARKER_ORDER,
  MARKER_PASS,
  MARKER_PREP,
  type HudModel,
  type HudSource,
  type PriceView,
  type RoleView,
  type StaffView,
  type UpgradeEffectView,
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

/** GDD §14.4 — the panel reads the last hundred decisions. */
export const CONVERSION_RING_SIZE = 100;
/** Strip depth; older lines yield. */
const MAX_NOTICES = 5;
/** A strip line dismisses itself after this long on screen. */
const NOTICE_TTL_MS = 6_000;

/** How high the coin floats, in metres, over its life. */
const COIN_RISE_METRES = 0.9;

/** Plates on the pass are spread along it rather than stacked on one point. */
const PASS_PLATE_SPACING_METRES = 0.42;
const PASS_PLATE_HEIGHT_METRES = 1.15;

/** Bubbles and rings sit above the thing they describe. */
const ORDER_BUBBLE_HEIGHT_METRES = 1.95;
const PREP_RING_HEIGHT_METRES = 1.4;
/** The card's hotspot sits at head height on the object it upgrades. */
const UPGRADE_CARD_HEIGHT_METRES = 1.7;

/**
 * How high above its anchor a property's hotspot floats, in metres.
 *
 * Head height, so the dot sits above whatever it labels rather than inside it —
 * a hotspot buried in the counter's own pixels is a hotspot that reads as part
 * of the counter.
 */
const PROPERTY_CARD_HEIGHT_METRES = 2.1;
/** The task icon sits over an employee's head, like a customer's bubble. */
const STAFF_ICON_HEIGHT_METRES = 1.95;

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
type MutableEffect = { -readonly [K in keyof UpgradeEffectView]: UpgradeEffectView[K] };
/** Reused like every other row here; `placedCount` says how much of it is live. */
interface MutablePlaced {
  objectId: string;
  worldX: number;
  worldY: number;
  /** `''` for anything the player did not buy — see `PlacedView.itemId`. */
  itemId: string;
  /** A functional building's level, or 0. */
  level: number;
}

interface MutableUpgrade {
  id: string;
  level: number;
  maxLevel: number;
  cost: number;
  affordable: boolean;
  worldChange: string;
  consequence: string;
  effects: MutableEffect[];
  screenX: number;
  screenY: number;
  visible: boolean;
  family: string;
  stage: number;
  unlocked: boolean;
  missingPrereqs: string[];
  requiredLevel: number;
  levelLocked: boolean;
  shortBy: number;
  /** True while a bought rung is still scaffolding — the correction pass. */
  building: boolean;
  /** Sim-ms until the site completes; 0 when nothing is building. */
  buildRemainingMs: number;
}
type MutablePrice = { -readonly [K in keyof PriceView]: PriceView[K] };
/** Samples behind the busy figure: one per publish (~100 ms), so about a minute. */
const BUSY_WINDOW_SAMPLES = 600;

type MutableStaff = { -readonly [K in keyof StaffView]: StaffView[K] };
type MutableRole = { -readonly [K in keyof RoleView]: RoleView[K] };
interface MutableHud {
  analytics: { sampleSize: number; converted: number; reasonCounts: number[] };
  orders: MutableOrderCard[];
  properties: MutableProperty[];
  orderCount: number;
  level: { level: number; xp: number; levelFloor: number; nextLevelXp: number };
  notices: { id: number; kind: string; text: string }[];
  showPauseVeil: boolean;
  audio: { master: number; music: number; sfx: number; ambience: number; muted: boolean };
  reducedMotion: boolean;
  highContrast: boolean;
  cash: number;
  reputation: number;
  customersServed: number;
  ordersActive: number;
  customersWaiting: number;
  gameDay: number;
  gameHour: number;
  weatherId: string;
  weatherLabel: string;
  eventId: string;
  eventLabel: string;
  eventRemainingMs: number;
  paused: boolean;
  speedMultiplier: number;
  markers: MutableMarker[];
  markerCount: number;
  placed: MutablePlaced[];
  placedCount: number;
  incomePerMinute: number;
  upgrades: MutableUpgrade[];
  prices: MutablePrice[];
  objective: string;
  objectiveProgress: number;
  staff: MutableStaff[];
  staffCount: number;
  roles: MutableRole[];
  payrollPerMinute: number;
  payrollFull: boolean;
  progression: MutableProgression;
}

interface MutableRequirement {
  label: string;
  have: number;
  need: number;
  met: boolean;
}

interface MutableProgression {
  stage: number;
  pendingStage: number;
  constructionProgress: number;
  constructionRemainingMs: number;
  constructing: boolean;
  requirements: MutableRequirement[];
}

interface MutableProperty {
  id: string;
  label: string;
  description: string;
  level: number;
  maxLevel: number;
  building: boolean;
  buildProgress: number;
  buildRemainingMs: number;
  capacity: number;
  used: number;
  unit: string;
  levelLabel: string;
  nextLabel: string;
  nextCost: number;
  nextBuildMs: number;
  nextStage: number;
  lockReason: string;
  nextArt: LevelArtKind;
  nextCells: number;
  cells: number;
  levelAsset: string;
  nextAsset: string;
  screenX: number;
  screenY: number;
  visible: boolean;
}

interface MutableOrderCard {
  slot: number;
  itemId: string;
  state: 'PLACED' | 'COOKING' | 'ON_PASS' | 'DELIVERED' | 'PAID';
  ageMs: number;
  patience01: number;
  startable: boolean;
  servable: boolean;
  price: number;
  cook01: number;
  cookRemainingMs: number;
}

/** Order cards shown at once; deeper queues summarise as a count. */
const MAX_ORDER_CARDS = 5;

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
  /**
   * The last hundred conversion decisions — the Analytics panel's whole feed
   * (GDD §14.4). App-side ring over the event stream: replay-safe, never
   * hashed, no sim change. Index 0 is oldest.
   */
  private readonly conversionRing: { readonly converted: boolean; readonly reason: number }[] = [];
  /** Self-dismissing notification strip entries — GDD §14.2, never modal. */
  private readonly notices: { id: number; kind: string; text: string; bornAt: number }[] = [];
  private nextNoticeId = 1;

  private lastSampleMs = Number.NEGATIVE_INFINITY;
  private readonly model: MutableHud;
  private readonly scratch = { x: 0, y: 0 };

  constructor(
    sim: Sim,
    project: ScreenProjector,
    /**
     * True when the HARNESS booted the world paused (`?paused=1`, freezeAt).
     * The pause veil is player UX; a fixture that pins the clock is not a
     * player taking a break, and a veil over an instrumented boot would block
     * every pointer the suite owns.
     */
    private readonly harnessPaused = false,
  ) {
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

    /*
     * Six upgrades and three menu items, allocated once with their effect rows
     * already in place. The card list is rebuilt ten times a second and every
     * one of these objects would otherwise be garbage.
     */
    const upgrades: MutableUpgrade[] = UPGRADES.map((item) => ({
      id: item.id,
      level: 0,
      maxLevel: item.maxLevel,
      cost: 0,
      affordable: false,
      worldChange: item.worldChange,
      consequence: item.consequence,
      effects: item.effects.map((effect) => ({ kind: effect.kind, before: 0, after: 0 })),
      screenX: 0,
      screenY: 0,
      visible: false,
      family: item.family,
      stage: item.stage,
      requiredLevel: 1,
      levelLocked: false,
      unlocked: false,
      // Sized once from the config, refilled in place — like every other row
      // here, so a sample never allocates.
      missingPrereqs: [],
      shortBy: 0,
      building: false,
      buildRemainingMs: 0,
    }));
    const prices: MutablePrice[] = MENU.map((item) => ({
      itemId: item.id,
      price: item.basePrice,
      base: item.basePrice,
      min: item.basePrice * PRICE_BAND.min,
      max: item.basePrice * PRICE_BAND.max,
    }));

    const staff: MutableStaff[] = Array.from({ length: MAX_EMPLOYEES }, () => ({
      entityId: 0,
      roleId: '',
      skill: 0,
      wagePerMinute: 0,
      state: 'IDLE',
      taskKind: '',
      busy01: 0,
      screenX: 0,
      screenY: 0,
      visible: false,
    }));
    const roles: MutableRole[] = EMPLOYEE_ROLES.map((spec) => ({
      id: spec.id,
      hireCost: spec.hireCost,
      affordable: false,
    }));

    this.model = {
      cash: 0,
      reputation: 0,
      customersServed: 0,
      ordersActive: 0,
      customersWaiting: 0,
      gameDay: 0,
      gameHour: 0,
      weatherId: 'CLEAR',
      weatherLabel: 'Açık',
      eventId: '',
      eventLabel: '',
      eventRemainingMs: 0,
      paused: false,
      speedMultiplier: 1,
      markers,
      placed: Array.from({ length: MAX_PLACED_OBJECTS }, () => ({
        objectId: '',
        worldX: 0,
        worldY: 0,
        itemId: '',
        level: 0,
      })),
      placedCount: 0,
      // One row per property, allocated once: the set is fixed in shape even
      // though every number on it changes on each sample.
      properties: PROPERTIES.map((spec) => ({
        id: spec.id,
        label: spec.label,
        description: spec.description,
        level: 1,
        maxLevel: spec.maxLevel,
        building: false,
        buildProgress: 0,
        buildRemainingMs: 0,
        capacity: -1,
        used: 0,
        unit: '',
        levelLabel: '',
        nextLabel: '',
        nextCost: -1,
        nextBuildMs: 0,
        nextStage: 1,
        lockReason: '',
        nextArt: 'prompted',
        nextCells: 0,
        cells: 0,
        levelAsset: '',
        nextAsset: '',
        screenX: 0,
        screenY: 0,
        visible: false,
      })),
      markerCount: 0,
      incomePerMinute: 0,
      orders: Array.from({ length: MAX_ORDER_CARDS }, () => ({
        slot: -1,
        itemId: '',
        state: 'PLACED' as const,
        ageMs: 0,
        patience01: -1,
        startable: false,
        servable: false,
        price: 0,
        cook01: 0,
        cookRemainingMs: 0,
      })),
      orderCount: 0,
      level: { level: 1, xp: 0, levelFloor: 0, nextLevelXp: 60 },
      audio: { master: 1, music: 1, sfx: 1, ambience: 1, muted: false },
      reducedMotion: false,
      highContrast: false,
      analytics: {
        sampleSize: 0,
        converted: 0,
        reasonCounts: new Array<number>(CONVERSION_REASONS.length).fill(0),
      },
      notices: [],
      showPauseVeil: false,
      upgrades,
      prices,
      objective: '',
      objectiveProgress: 0,
      staff,
      staffCount: 0,
      roles,
      payrollPerMinute: 0,
      payrollFull: false,
      progression: {
        stage: 1,
        pendingStage: 0,
        constructionProgress: 0,
        constructionRemainingMs: 0,
        constructing: false,
        /*
         * Allocated once — the requirement list is fixed in shape even though
         * its numbers change every sample. Five counters, then one row per
         * property: the panel drops any row whose `need` is 0, so a stage that
         * asks nothing of the car park simply does not mention it.
         */
        requirements: [
          { label: 'cash', have: 0, need: 0, met: false },
          { label: 'served', have: 0, need: 0, met: false },
          { label: 'upgrades', have: 0, need: 0, met: false },
          { label: 'staff', have: 0, need: 0, met: false },
          { label: 'reputation', have: 0, need: 0, met: false },
          ...PROPERTIES.map((spec) => ({ label: `property:${spec.id}`, have: 0, need: 0, met: false })),
        ],
      },
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

  private pushConversion(converted: boolean, reason: number): void {
    if (this.conversionRing.length >= CONVERSION_RING_SIZE) this.conversionRing.shift();
    this.conversionRing.push({ converted, reason });
  }

  /** Which world moments earn a strip line. Quiet by default — a strip that
   *  narrates everything is a log, not a notification. */
  private noticeFor(event: ReadonlySimEvent): void {
    let kind: string | null = null;
    let text: string | null = null;
    switch (event.t) {
      case 'STAGE_UNLOCKED':
        kind = 'progress';
        text = 'Yeni aşama açıldı — evrim hazır';
        break;
      case 'EMPLOYEE_LEFT':
        kind = 'warning';
        text = event.reason === 'unpaid' ? 'Bir çalışan maaş alamadığı için ayrıldı' : 'Bir çalışan ayrıldı';
        break;
      case 'ROAD_EVENT_STARTED': {
        const spec = EVENT_SPECS[event.kind];
        kind = 'info';
        text = spec === undefined ? 'Yolda bir şeyler oluyor' : `${spec.label} başladı`;
        break;
      }
      case 'ROAD_EVENT_ENDED': {
        const spec = EVENT_SPECS[event.kind];
        kind = 'info';
        text = spec === undefined ? null : `${spec.label} sona erdi`;
        break;
      }
      case 'WEATHER_CHANGED': {
        const state = WEATHER_STATES[event.state];
        kind = 'info';
        text = state === undefined ? null : `Hava değişti: ${state.label}`;
        break;
      }
      case 'STAGE_CHANGED': {
        // The reward said out loud — §20's unlock feedback. What each stage
        // opens comes from the design (GDD §7/§13), not from a live scan: the
        // strip is a headline, and the build panel is the inventory.
        kind = 'progress';
        const unlocked: Record<number, string> = {
          2: 'Yemek kamyonu açıldı — yeni menü, yeni yükseltmeler',
          3: 'Küçük lokanta açıldı — masalar ve garsonlar',
          4: 'Büyük restoran açıldı — drive-thru ve gece vardiyası',
        };
        text = unlocked[event.to] ?? 'Mekân evrildi';
        break;
      }
      case 'DAY_STARTED':
      case 'SPEED_CHANGED':
      case 'PAUSE_CHANGED':
      case 'VEHICLE_SPAWNED':
      case 'VEHICLE_BRAKED':
      case 'VEHICLE_DESPAWNED':
      case 'CONVERSION_SUCCEEDED':
      case 'CONVERSION_FAILED':
      case 'VEHICLE_PARKED':
      case 'CUSTOMER_SPAWNED':
      case 'CUSTOMER_LEFT_ANGRY':
      case 'ORDER_PLACED':
      case 'PREP_STARTED':
      case 'ORDER_READY':
      case 'ORDER_DELIVERED':
      case 'PAYMENT':
      case 'UPGRADE_APPLIED':
      case 'PRICE_CHANGED':
      case 'EMPLOYEE_HIRED':
      case 'CONSTRUCTION_STARTED':
      case 'OBJECT_PLACED':
      case 'OBJECT_REMOVED':
        // Quiet moments by decision — a strip narrating everything is a log.
        return;
    }
    if (text === null) return;
    if (this.notices.length >= MAX_NOTICES) this.notices.shift();
    this.notices.push({ id: this.nextNoticeId++, kind, text, bornAt: this.sim.world.clock.simTimeMs });
  }

  private onEvent(event: ReadonlySimEvent): void {
    if (event.t === 'CONVERSION_SUCCEEDED') {
      this.pushConversion(true, -1);
    } else if (event.t === 'CONVERSION_FAILED') {
      this.pushConversion(false, event.reason);
    }
    this.noticeFor(event);
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
    model.audio.master = world.settings.audio.master;
    model.audio.music = world.settings.audio.music;
    model.audio.sfx = world.settings.audio.sfx;
    model.audio.ambience = world.settings.audio.ambience;
    model.audio.muted = world.settings.audio.muted;
    model.reducedMotion = world.settings.a11y.reducedMotion;
    model.highContrast = world.settings.a11y.highContrast;
    {
      // GDD §14.4 — the ranked reason histogram over the last hundred.
      const totals = model.analytics.reasonCounts;
      totals.fill(0);
      let converted = 0;
      for (const entry of this.conversionRing) {
        if (entry.converted) converted++;
        else if (entry.reason >= 0 && entry.reason < totals.length)
          totals[entry.reason] = (totals[entry.reason] ?? 0) + 1;
      }
      model.analytics.sampleSize = this.conversionRing.length;
      model.analytics.converted = converted;
    }
    {
      // Self-dismissal: age out, then copy what remains.
      // Sim-time ageing: deterministic, and a paused world holds its lines —
      // a notice that expires while nobody could read it served nobody.
      const alive = this.notices.filter((notice) => world.clock.simTimeMs - notice.bornAt < NOTICE_TTL_MS);
      this.notices.length = 0;
      this.notices.push(...alive);
      model.notices = alive.map((notice) => ({ id: notice.id, kind: notice.kind, text: notice.text }));
    }
    model.reputation = world.economy.reputation;
    model.customersServed = world.stats.customersServed;
    model.ordersActive = world.orders.activeCount;
    model.gameDay = world.clock.gameDay;
    model.gameHour = world.clock.gameHour;
    {
      // Phase 15 — the sky and the calendar, derived exactly as the sim does.
      const weather = WEATHER_STATES[currentWeather(world)];
      model.weatherId = weather?.id ?? 'CLEAR';
      model.weatherLabel = weather?.label ?? 'Açık';
      const activeSlot = activeEventSlot(world);
      const kind = activeSlot >= 0 ? (world.environment.eventTypes[activeSlot] ?? -1) : -1;
      const event = kind >= 0 ? EVENT_SPECS[kind] : undefined;
      model.eventId = event?.id ?? '';
      model.eventLabel = event?.label ?? '';
      model.eventRemainingMs =
        activeSlot < 0 ? 0 : Math.max(0, (world.environment.eventEndMs[activeSlot] ?? 0) - nowMs);
    }
    model.paused = world.control.paused;
    model.showPauseVeil = world.control.paused && !this.harnessPaused;
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
    this.refillPlaced(world);

    model.incomePerMinute = netIncomePerMinute(world);
    this.refillOrders(world);
    const lvl = playerLevel(world);
    model.level.level = lvl.level;
    model.level.xp = lvl.xp;
    model.level.levelFloor = lvl.levelFloor;
    model.level.nextLevelXp = lvl.nextLevelXp;
    this.refillUpgrades(world);
    this.refillPrices(world);
    this.refillObjective(world);
    this.refillStaff(world);
    this.refillProgression(world);
    this.refillProperties(world);
  }

  /**
   * How close the player is, requirement by requirement.
   *
   * Each one separately rather than a single percentage, because "you need
   * ₡140" and "you need to serve twenty-five people" are different instructions
   * and a player who is short on one should not have to work out which.
   */
  private refillProgression(world: World): void {
    const view = this.model.progression;
    view.stage = world.progression.stage;
    view.pendingStage = world.progression.pendingStage;
    view.constructing = isConstructing(world);
    view.constructionProgress = constructionProgress(world);
    view.constructionRemainingMs = constructionRemainingMs(world);

    const requirement = requirementFor(world.progression.stage);
    const rows = view.requirements;
    const have = [
      world.economy.cash,
      world.stats.customersServed,
      totalUpgradeLevels(world),
      world.employees.activeCount,
      world.economy.reputation,
    ];
    const need =
      requirement === null
        ? [0, 0, 0, 0, 0]
        : [
            // Threshold plus the ADR-014 operating reserve — the same sum the
            // gate enforces, so the bar the player watches is the truth.
            requirement.cashRequired + reserveFor(world, requirement),
            requirement.customersServed,
            requirement.upgradesBought,
            requirement.employeesHired,
            requirement.reputation,
          ];

    /*
     * Then the property floor, one row per property, appended in the order the
     * table declares them (`property:<id>`).
     *
     * It belongs on this checklist and not only on the inspect card, and the
     * reason is what the panel is *for*: "what am I trying to accomplish next",
     * answerable at a glance. Without these rows a player who has met the cash
     * and the customer count sees two ticks, no third row, and no offer — with
     * the explanation hidden behind clicking the right thing in the world. The
     * checklist has to name every clause the gate enforces or it is not a
     * checklist.
     */
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row === undefined) continue;

      if (i < have.length) {
        row.have = have[i] ?? 0;
        row.need = need[i] ?? 0;
      } else {
        const id = PROPERTIES[i - have.length]?.id ?? '';
        row.have = propertyLevel(world, id);
        row.need = requirement?.requiredProperties[id] ?? 0;
      }
      row.met = row.have >= row.need;
    }
  }

  /**
   * Every property, as the inspect card reads it.
   *
   * The whole card is derived here rather than in the component, and that is
   * the same boundary every other panel keeps: the overlay may not import
   * `src/sim`, so "how many bays are live", "what does the next one cost" and
   * "why is it locked" are answered once, by the simulation, and copied into a
   * reused row. A component that worked any of those out itself would be a
   * second implementation of a rule the purchase then enforces differently.
   */
  private refillProperties(world: World): void {
    const requirement = requirementFor(world.progression.stage);
    const ceiling = maxPropertyLevel(world.progression.stage);

    for (let i = 0; i < PROPERTIES.length; i++) {
      const spec = PROPERTIES[i];
      const view = this.model.properties[i];
      if (spec === undefined || view === undefined) continue;

      const level = propertyLevel(world, spec.id);
      const capacity = propertyCapacity(world, spec.id);
      const art = propertyLevelArt(spec.id, level);
      const nextArt = propertyLevelArt(spec.id, level + 1);

      view.level = level;
      view.capacity = capacity.capacity;
      view.used = capacity.used;
      view.unit = capacity.unit;
      // The count when there is one to give, the level's own name otherwise.
      // "5 araç" is a fact; "Genişletilmiş otopark" is a word somebody chose.
      view.levelLabel = capacity.capacity >= 0 ? `${String(capacity.capacity)} ${capacity.unit}` : art.name;
      view.levelAsset = art.asset;
      view.cells = art.cells;

      const anchor = propertyAnchor(world, spec.id);
      view.visible = this.projectInto(anchor.x, anchor.y, PROPERTY_CARD_HEIGHT_METRES, view);

      const site = pendingPropertyLevel(world, spec.id);
      view.building = site > 0;
      view.buildProgress = 0;
      view.buildRemainingMs = 0;
      if (site > 0) {
        for (const build of world.layout.pendingBuilds) {
          if (build.propertyId !== spec.id) continue;
          view.buildRemainingMs = Math.max(0, build.remainingMs);
          view.buildProgress = build.totalMs > 0 ? Math.min(1, 1 - build.remainingMs / build.totalMs) : 0;
        }
      }

      const next = level + 1;
      const maxed = next > spec.maxLevel;
      view.nextLabel = maxed ? '' : nextArt.name;
      view.nextAsset = maxed ? '' : nextArt.asset;
      view.nextArt = maxed ? 'prompted' : nextArt.kind;
      view.nextCells = maxed ? 0 : nextArt.cells;
      view.nextStage = maxed ? 0 : Math.max(1, next - 1);
      view.nextCost = -1;
      view.nextBuildMs = 0;
      view.lockReason = '';

      if (maxed) {
        view.lockReason = 'Azami seviye';
        continue;
      }

      /*
       * The main building's "next level" is the next stage, and its price and
       * its lock are the stage's — including the property floor it is itself
       * the top of. Routing it through the same card is what makes evolving
       * feel like upgrading the restaurant rather than pressing a separate
       * button somewhere else.
       */
      if (spec.ladder === 'stage') {
        view.nextCost = requirement?.cashRequired ?? -1;
        view.nextBuildMs = requirement?.constructionMs ?? 0;
        view.lockReason = this.stageLockReason(world, requirement);
        continue;
      }

      if (next > ceiling) {
        view.lockReason = `Aşama ${String(next - 1)} gerekli`;
        continue;
      }

      if (spec.ladder === 'own') {
        view.nextCost = propertyCost(spec, next) ?? -1;
        view.nextBuildMs = propertyBuildMs(spec, next) ?? 0;
        if (view.building) view.lockReason = 'İnşa ediliyor';
        else if (view.nextCost > world.economy.cash) {
          view.lockReason = `₡${(view.nextCost - world.economy.cash).toFixed(2)} eksik`;
        }
        continue;
      }

      // Derived: the price and the lock are the underlying rung's, asked of the
      // same code the purchase runs, so the card cannot quote a gate that the
      // click then applies differently.
      const via = propertyVia(spec, next);
      if (via === undefined) {
        view.lockReason = 'Azami seviye';
        continue;
      }
      const rung = UPGRADES.find((item) => item.id === via);
      view.nextCost = nextUpgradeCost(world, via);
      view.nextBuildMs = view.nextCost >= 0 ? buildDurationMs(view.nextCost) : 0;
      if (rung !== undefined && rung.stage > world.progression.stage) {
        view.lockReason = `Aşama ${String(rung.stage)} gerekli`;
      } else if (upgradeLevelRequirement(via) > playerLevel(world).level) {
        view.lockReason = `Oyuncu sv. ${String(upgradeLevelRequirement(via))} gerekli`;
      } else if (view.nextCost > world.economy.cash) {
        view.lockReason = `₡${(view.nextCost - world.economy.cash).toFixed(2)} eksik`;
      }
    }
  }

  /** Why the stage cannot be taken yet, in the player's own terms. */
  private stageLockReason(world: World, requirement: StageRequirement | null): string {
    if (requirement === null) return 'Azami seviye';
    if (isConstructing(world)) return 'İnşa ediliyor';

    const short = missingProperties(world, requirement);
    const first = short[0];
    if (first !== undefined) {
      const spec = PROPERTIES.find((item) => item.id === first.id);
      return `${spec?.label ?? first.id} Sv. ${String(first.need)} gerekli`;
    }
    const price = requirement.cashRequired + reserveFor(world, requirement);
    if (world.economy.cash < price) return `₡${(price - world.economy.cash).toFixed(2)} eksik`;
    if (world.stats.customersServed < requirement.customersServed) {
      return `${String(requirement.customersServed - world.stats.customersServed)} müşteri daha`;
    }
    if (world.employees.activeCount < requirement.employeesHired) return 'Personel gerekli';
    if (world.economy.reputation < requirement.reputation) return 'İtibar yetersiz';
    return '';
  }

  /**
   * The placed objects, for build mode's list.
   *
   * Copied into the reused buffer rather than handed over, like everything else
   * here: `world.layout.placed` is the simulation's own array and an overlay
   * holding a reference to it would be reading the world directly, one splice
   * away from a component rendering an object that no longer exists.
   */
  private refillPlaced(world: World): void {
    const model = this.model;
    const source = world.layout.placed;
    const count = Math.min(source.length, model.placed.length);
    for (let i = 0; i < count; i++) {
      const row = model.placed[i];
      const object = source[i];
      if (row === undefined || object === undefined) continue;
      row.objectId = object.objectId;
      row.worldX = object.x;
      row.worldY = object.y;
      row.itemId = object.itemId ?? '';
      row.level = object.level ?? 0;
    }
    model.placedCount = count;
  }

  /**
   * How much of the recent past each employee spent actually working.
   *
   * An *observation*, kept here and not in the world: it changes nothing, it
   * is not hashed, and a counter in the simulation would need a save-schema
   * version to display a percentage. Keyed by entity id rather than slot,
   * because slots are recycled and a new hire would otherwise inherit the
   * previous occupant's record.
   *
   * It exists because the honest answer to "why is my cook standing there"
   * is a number. Measured at Stage 1, a cook is idle 97.7% of a session and,
   * while the player is also cooking, adds exactly nothing to throughput —
   * so the panel that offers the hire should be able to say so rather than
   * leaving the player to infer it from a wage bill.
   */
  private readonly busyHistory = new Map<number, { samples: Uint8Array; cursor: number; filled: number }>();

  private sampleBusy(entityId: number, working: boolean): number {
    let record = this.busyHistory.get(entityId);
    if (record === undefined) {
      record = { samples: new Uint8Array(BUSY_WINDOW_SAMPLES), cursor: 0, filled: 0 };
      this.busyHistory.set(entityId, record);
    }
    record.samples[record.cursor] = working ? 1 : 0;
    record.cursor = (record.cursor + 1) % BUSY_WINDOW_SAMPLES;
    record.filled = Math.min(BUSY_WINDOW_SAMPLES, record.filled + 1);

    let sum = 0;
    for (let i = 0; i < record.filled; i++) sum += record.samples[i] ?? 0;
    return record.filled === 0 ? 0 : sum / record.filled;
  }

  private refillStaff(world: World): void {
    let count = 0;
    const seen = new Set<number>();
    for (let slot = 0; slot < world.employees.scanLimit; slot++) {
      if (!world.employees.isActive(slot)) continue;
      const view = this.model.staff[count];
      if (view === undefined) break;

      const employee = world.employees.at(slot);
      view.entityId = employee.entityId;
      view.roleId = role(employee.role).id;
      view.skill = employee.skill;
      view.wagePerMinute = employee.wagePerMinute;
      view.state = brainStateName(employee.state);
      view.taskKind =
        employee.taskSlot >= 0 && world.tasks.isActive(employee.taskSlot)
          ? (TASK_KINDS[world.tasks.at(employee.taskSlot).kind] ?? '')
          : '';
      // `view.state` is the brain state's *name*, resolved a few lines above;
      // the record itself carries an index.
      view.busy01 = this.sampleBusy(
        employee.entityId,
        view.state === 'MOVING' || view.state === 'PERFORMING',
      );
      seen.add(employee.entityId);
      // The icon sits over their head, like the customer's order bubble.
      view.visible = this.projectInto(employee.x, employee.y, STAFF_ICON_HEIGHT_METRES, view);
      count++;
    }
    this.model.staffCount = count;

    // A fired employee's history goes with them; the map must not grow for
    // the life of the session.
    for (const entityId of this.busyHistory.keys()) {
      if (!seen.has(entityId)) this.busyHistory.delete(entityId);
    }

    for (let i = 0; i < EMPLOYEE_ROLES.length; i++) {
      const spec = EMPLOYEE_ROLES[i];
      const view = this.model.roles[i];
      if (spec === undefined || view === undefined) continue;
      view.affordable = world.economy.cash >= spec.hireCost;
    }

    this.model.payrollPerMinute = payrollPerMinute(world);
    this.model.payrollFull = count >= MAX_EMPLOYEES;
  }

  /**
   * The live order list, oldest first — the order cards' whole feed.
   *
   * Cap and order are deliberate: the cards sit at a screen edge, and a queue
   * deeper than the cap is summarised by the count rather than scrolled — the
   * player acts on the oldest anyway (so does `nextStartable`).
   */
  private refillOrders(world: World): void {
    const model = this.model;
    /*
     * The simulation clock, not the tick count.
     *
     * Every timestamp on an order — `orderedAtMs`, `startedAtMs`, `readyAtMs` —
     * is stamped from `world.clock.simTimeMs`, and that clock does **not** start
     * at zero: a fresh world opens at `DEFAULT_GAME_START_HOUR` (08:00), which is
     * `8/24 x MS_PER_GAME_DAY` = **240 000 ms** before the first tick runs. This
     * line used to read `world.tick * TICK_MS`, which starts at zero, so every
     * difference computed here was wrong by that whole epoch:
     *
     *   cookRemainingMs = duration - (0 - 240000)  ->  a 3.0 s chips read 243 sn
     *   cook01          = (0 - 240000) / duration  ->  clamped to 0, bar never moved
     *   ageMs           = max(0, 0 - 240000)       ->  every order aged 0 forever
     *
     * The user's 2026-08-23 capture is that arithmetic on screen: "Limonata ·
     * Hazırlanıyor · 243 sn" over an empty progress bar, for a five-second drink.
     * Two clocks, one epoch apart, subtracted from each other.
     */
    const nowMs = world.clock.simTimeMs;
    const startableSlot = nextStartable(world);
    let count = 0;
    // Oldest first: collect live slots, then sort by orderedAtMs.
    const live: number[] = [];
    for (let slot = 0; slot < world.orders.scanLimit; slot++) {
      if (!world.orders.isActive(slot)) continue;
      const order = world.orders.at(slot);
      if (order.state === ORDER_PAID) continue;
      live.push(slot);
    }
    live.sort((a, b) => {
      const oa = world.orders.at(a).orderedAtMs;
      const ob = world.orders.at(b).orderedAtMs;
      return oa === ob ? a - b : oa - ob;
    });
    for (const slot of live) {
      if (count >= MAX_ORDER_CARDS) break;
      const order = world.orders.at(slot);
      const view = model.orders[count];
      if (view === undefined) break;
      view.slot = slot;
      view.itemId = menuItem(order.item).id;
      view.state = orderStateName(order.state);
      view.ageMs = Math.max(0, nowMs - order.orderedAtMs);
      view.price = order.price;
      view.startable = slot === startableSlot;
      view.servable = isServable(world, slot);
      view.cook01 = 0;
      view.cookRemainingMs = 0;
      if (order.state === ORDER_COOKING && order.station >= 0) {
        // The kitchen's own finish-time derivation, mirrored exactly.
        const durationMs =
          (menuItem(order.item).prepTimeMs * effectValue(world, 'prepSpeed')) / station(order.station).speed;
        view.cook01 = durationMs > 0 ? Math.min(1, Math.max(0, (nowMs - order.startedAtMs) / durationMs)) : 0;
        /*
         * Simulation milliseconds, not wall-clock — so at 4x the countdown
         * genuinely runs four times faster and a paused world holds it still.
         * Derived from the same duration the bar is, so the number and the bar
         * can never disagree about the same order.
         */
        view.cookRemainingMs = Math.max(0, durationMs - (nowMs - order.startedAtMs));
      }
      view.patience01 = -1;
      if (order.customerSlot >= 0 && world.customers.isActive(order.customerSlot)) {
        const customer = world.customers.at(order.customerSlot);
        view.patience01 =
          customer.patienceMaxMs > 0
            ? Math.min(1, Math.max(0, customer.patienceMs / customer.patienceMaxMs))
            : -1;
      }
      count++;
    }
    model.orderCount = count;
  }

  private refillUpgrades(world: World): void {
    for (let i = 0; i < UPGRADES.length; i++) {
      const item = UPGRADES[i];
      const view = this.model.upgrades[i];
      if (item === undefined || view === undefined) continue;

      view.level = upgradeLevel(world, item.id);
      view.cost = nextUpgradeCost(world, item.id);
      view.affordable = view.cost >= 0 && world.economy.cash >= view.cost;

      /*
       * The construction state — the correction pass. A rung on the queue
       * shows its countdown and cannot be bought again meanwhile; the card is
       * how the player watches the same clock the world's scaffold runs on.
       */
      view.building = false;
      view.buildRemainingMs = 0;
      for (const build of world.layout.pendingBuilds) {
        if (build.upgradeId !== item.id) continue;
        view.building = true;
        view.buildRemainingMs = Math.max(view.buildRemainingMs, Math.max(0, build.remainingMs));
      }
      if (view.building) view.affordable = false;

      /*
       * Locked and unaffordable are different problems with different answers —
       * one is solved by doing something else first, the other by waiting — so
       * the card is given both rather than a single "no".
       */
      view.missingPrereqs.length = 0;
      for (const prereq of item.prereqs) {
        if (upgradeLevel(world, prereq) <= 0) view.missingPrereqs.push(prereq);
      }
      view.requiredLevel = upgradeLevelRequirement(item.id);
      const levelOk = playerLevel(world).level >= view.requiredLevel;
      view.levelLocked =
        !levelOk && item.stage <= world.progression.stage && view.missingPrereqs.length === 0;
      view.unlocked = item.stage <= world.progression.stage && view.missingPrereqs.length === 0 && levelOk;
      view.shortBy = view.affordable ? 0 : Math.max(0, view.cost - world.economy.cash);
      view.visible = this.projectInto(item.anchor.x, item.anchor.y, UPGRADE_CARD_HEIGHT_METRES, view);

      const preview = previewNextLevel(world, item.id);
      for (let e = 0; e < view.effects.length; e++) {
        const row = view.effects[e];
        const source = preview[e];
        if (row === undefined) continue;
        // A maxed upgrade previews nothing; the card shows the level instead.
        row.before = source?.before ?? 0;
        row.after = source?.after ?? 0;
      }
    }
  }

  private refillPrices(world: World): void {
    for (let i = 0; i < MENU.length; i++) {
      const item = MENU[i];
      const view = this.model.prices[i];
      if (item === undefined || view === undefined) continue;
      view.price = world.economy.prices.get(item.id) ?? item.basePrice;
    }
  }

  /**
   * One target, in words — GAME_EXECUTION_ROADMAP Phase 9.
   *
   * The cheapest upgrade the player does not yet own, and how close they are to
   * affording it. Deliberately derived rather than stored: real objectives are
   * `ProgressionSystem`'s job in Phase 11, and inventing a persistent objective
   * here would be state that has to be hashed, saved and migrated for something
   * Phase 11 is going to replace.
   */
  private refillObjective(world: World): void {
    /*
     * **Among the upgrades the player can actually buy** — Phase 13.
     *
     * With six upgrades, all of them Stage 1, "the cheapest one you do not own"
     * was unambiguous. With thirty across four stages it is not: `STAGE_MULTIPLIER`
     * makes a Stage 4 base of ₡4 cost ₡220 there and nothing at all here, so the
     * raw base cost picked `roadside-pylon` — an upgrade a lemonade stand cannot
     * see, let alone buy — and offered it as the thing to aim at next.
     *
     * An objective the player cannot act on is worse than no objective.
     */
    let target: { id: string; cost: number } | null = null;
    for (const item of UPGRADES) {
      if (item.stage > world.progression.stage) continue;
      if (item.prereqs.some((prereq) => upgradeLevel(world, prereq) <= 0)) continue;

      const cost = nextUpgradeCost(world, item.id);
      if (cost < 0) continue;
      if (target === null || cost < target.cost) target = { id: item.id, cost };
    }

    if (target === null) {
      this.model.objective = '';
      this.model.objectiveProgress = 1;
      return;
    }

    this.model.objective = target.id;
    this.model.objectiveProgress =
      target.cost > 0 ? Math.min(1, Math.max(0, world.economy.cash / target.cost)) : 1;
  }

  private projectInto(
    x: number,
    y: number,
    z: number,
    marker: { screenX: number; screenY: number },
  ): boolean {
    const visible = this.project(x, y, z, this.scratch);
    marker.screenX = this.scratch.x;
    marker.screenY = this.scratch.y;
    return visible;
  }
}
