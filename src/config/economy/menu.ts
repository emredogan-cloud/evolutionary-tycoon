import { z } from 'zod';

/**
 * The menu — ECONOMY_DESIGN §4.
 *
 * Three items in Stage 1, and every number here is authored rather than derived.
 * The margins in the design table are a *consequence* of cost and price, not an
 * input: writing them down as a third field would let them drift out of step
 * with the two numbers that produce them, and the drift would be invisible.
 *
 * ## Why this is validated rather than merely typed
 *
 * TypeScript checks the shape at compile time and nothing at all at run time. A
 * menu is data the balance pass will edit constantly, often by hand, and the
 * failure mode of a bad edit is a game that runs and quietly earns the wrong
 * amount of money. Zod turns that into a loud error at module load, which is the
 * only moment it can still be cheap to fix.
 *
 * ASSET_PIPELINE names the icons; this file names the economics. They meet at
 * `iconKey`.
 */

/** Where an item is prepared. ECONOMY_DESIGN §4; Stage 1 uses three of them. */
export const STATION_TYPES = ['DRINK', 'GRILL', 'PREP', 'FRYER', 'COFFEE', 'DESSERT'] as const;

/** Appeal tags — GAME_DESIGN_DOCUMENT §11.1. Read by `menuAppeal` in Phase 9+. */
const APPEAL_TAGS = ['FAST', 'HEARTY', 'PREMIUM', 'BREAKFAST', 'SWEET', 'VEGGIE'] as const;

const menuItemSchema = z.object({
  id: z.string().min(1),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  station: z.enum(STATION_TYPES),
  /** Ingredient cost in credits. */
  baseCost: z.number().positive(),
  /** Default sale price. The player may move it ±50% — ECONOMY_DESIGN §4. */
  basePrice: z.number().positive(),
  prepTimeMs: z.number().int().positive(),
  /**
   * How long it stays good on the pass, in milliseconds.
   *
   * Past this, `holdTemperature` starts eating the quality. It is the number
   * that will later punish "many cooks, too few waiters", which is why it is
   * per item rather than global: chips keep for five minutes and a hot dog does
   * not.
   */
  holdToleranceMs: z.number().int().positive(),
  /** Recipe quality before station, skill and freshness modify it. 0..1. */
  qualityBase: z.number().min(0).max(1),
  appealTags: z.array(z.enum(APPEAL_TAGS)).min(1),
  /** Texture key for the food icon — ASSET_PIPELINE §3. */
  iconKey: z.string().min(1),
});

export type MenuItem = z.infer<typeof menuItemSchema>;

/**
 * A price the player is allowed to set, as a fraction of `basePrice`.
 *
 * ECONOMY_DESIGN §4: ±50%. The band exists because an unbounded price is the
 * whole of exploit E2 — set it to zero, convert everybody, and the margin
 * penalty never bites hard enough to matter.
 */
export const PRICE_BAND = { min: 0.5, max: 1.5 } as const;

/**
 * **Prices and ingredient costs scaled by 1.35 in Phase 12** — and the scale
 * factor is not arbitrary.
 *
 * ECONOMY_DESIGN §3 builds the whole Stage 1 envelope on an **average ticket of
 * ₡4.50**. §4 publishes three Stage 1 prices — ₡3, ₡5 and ₡2 — and the
 * simulation picks between them uniformly, which averages **₡3.33**. The two
 * published numbers cannot both be true: §3's ₡4.50 assumes the fourteen-item
 * menu and the archetype-weighted choice its own `appealTags` imply, and neither
 * exists yet.
 *
 * The balance simulator measured the consequence exactly. At the designed
 * traffic and conversion, Stage 1 income topped out at **₡10.6/min against a
 * designed ₡15**, and the whole of that gap is the ticket: ₡10.6 × (4.50/3.85
 * including tips) = ₡12.4, inside the ±25% band. The dead-end rule missed for
 * the same reason and by the same factor.
 *
 * So the three prices *and* the three ingredient costs are scaled together by
 * 4.50 / 3.33, which lands the uniform average on ₡4.50 exactly and **leaves
 * every published margin unchanged** (73%, 64%, 75% — ECONOMY_DESIGN §4). It is
 * a deliberate departure from §4's price column, recorded as a change request in
 * `docs/BALANCE_REPORT.md`: when the menu is complete and item choice is
 * weighted, these three should go back to ₡3 / ₡5 / ₡2 and the average will
 * arrive from the mix instead.
 */
const STAGE1_ITEMS: MenuItem[] = [
  {
    id: 'lemonade',
    stage: 1,
    station: 'DRINK',
    baseCost: 1.08,
    basePrice: 4.05,
    prepTimeMs: 2500,
    holdToleranceMs: 90_000,
    qualityBase: 0.72,
    appealTags: ['FAST', 'SWEET'],
    iconKey: 'icon_food_lemonade@2x',
  },
  {
    id: 'hotdog',
    stage: 1,
    station: 'GRILL',
    baseCost: 2.43,
    basePrice: 6.75,
    prepTimeMs: 5000,
    holdToleranceMs: 60_000,
    qualityBase: 0.78,
    appealTags: ['FAST', 'HEARTY'],
    iconKey: 'icon_food_hotdog@2x',
  },
  {
    id: 'chips',
    stage: 1,
    station: 'PREP',
    baseCost: 0.68,
    basePrice: 2.7,
    prepTimeMs: 1000,
    holdToleranceMs: 300_000,
    qualityBase: 0.65,
    appealTags: ['FAST'],
    iconKey: 'icon_food_chips@2x',
  },
];

/**
 * Stages 2 to 4 — ECONOMY_DESIGN §4, the rest of the published table.
 *
 * **Added in Phase 13, and it is the reason the later stages can earn at all.**
 * Only the three Stage 1 items existed, so a Stage 3 diner sold lemonade and hot
 * dogs at Stage 1 prices; §3's envelope puts its average ticket at ₡18 and the
 * balance simulator measured ₡4.50. Every stage-timing and income assertion past
 * the first failed for that one reason, and no upgrade could have fixed it.
 *
 * Prices carry the same ×1.35 scaling as the Stage 1 rows and for the same
 * reason (see the note above them): the ticket §3 builds the envelope on assumes
 * a mix the simulation does not yet weight, and scaling prices and ingredient
 * costs together closes it while leaving every published margin exactly where §4
 * put it.
 */
const LATER_ITEMS: MenuItem[] = [
  {
    id: 'hamburger',
    stage: 2,
    station: 'GRILL',
    baseCost: 4.32,
    basePrice: 12.15,
    prepTimeMs: 9000,
    holdToleranceMs: 70000,
    qualityBase: 0.79,
    appealTags: ['HEARTY'],
    iconKey: 'icon_food_burger@2x',
  },
  {
    id: 'fries',
    stage: 2,
    station: 'FRYER',
    baseCost: 1.49,
    basePrice: 5.4,
    prepTimeMs: 6000,
    holdToleranceMs: 45000,
    qualityBase: 0.74,
    appealTags: ['FAST', 'HEARTY'],
    iconKey: 'icon_food_fries@2x',
  },
  {
    id: 'cola',
    stage: 2,
    station: 'DRINK',
    baseCost: 0.81,
    basePrice: 4.05,
    prepTimeMs: 1500,
    holdToleranceMs: 240000,
    qualityBase: 0.7,
    appealTags: ['FAST'],
    iconKey: 'icon_food_cola@2x',
  },
  {
    id: 'breakfast-set',
    stage: 3,
    station: 'GRILL',
    baseCost: 7.43,
    basePrice: 18.9,
    prepTimeMs: 14000,
    holdToleranceMs: 60000,
    qualityBase: 0.8,
    appealTags: ['BREAKFAST', 'HEARTY'],
    iconKey: 'icon_food_breakfast@2x',
  },
  {
    id: 'chicken-meal',
    stage: 3,
    station: 'FRYER',
    baseCost: 8.1,
    basePrice: 21.6,
    prepTimeMs: 12000,
    holdToleranceMs: 65000,
    qualityBase: 0.8,
    appealTags: ['HEARTY'],
    iconKey: 'icon_food_chicken@2x',
  },
  {
    id: 'coffee',
    stage: 3,
    station: 'COFFEE',
    baseCost: 1.22,
    basePrice: 6.75,
    prepTimeMs: 4000,
    holdToleranceMs: 120000,
    qualityBase: 0.76,
    appealTags: ['FAST', 'BREAKFAST'],
    iconKey: 'icon_food_coffee@2x',
  },
  {
    id: 'dessert',
    stage: 3,
    station: 'DESSERT',
    baseCost: 3.24,
    basePrice: 10.8,
    prepTimeMs: 5000,
    holdToleranceMs: 200000,
    qualityBase: 0.82,
    appealTags: ['SWEET', 'PREMIUM'],
    iconKey: 'icon_food_dessert@2x',
  },
  {
    id: 'salad',
    stage: 3,
    station: 'PREP',
    baseCost: 4.05,
    basePrice: 12.15,
    prepTimeMs: 7000,
    holdToleranceMs: 150000,
    qualityBase: 0.75,
    appealTags: ['VEGGIE'],
    iconKey: 'icon_food_salad@2x',
  },
  {
    id: 'premium-burger',
    stage: 4,
    station: 'GRILL',
    baseCost: 11.48,
    basePrice: 32.4,
    prepTimeMs: 16000,
    holdToleranceMs: 70000,
    qualityBase: 0.86,
    appealTags: ['PREMIUM', 'HEARTY'],
    iconKey: 'icon_food_premium@2x',
  },
  {
    id: 'family-meal',
    stage: 4,
    station: 'GRILL',
    baseCost: 24.3,
    basePrice: 64.8,
    prepTimeMs: 26000,
    holdToleranceMs: 60000,
    qualityBase: 0.84,
    appealTags: ['HEARTY', 'PREMIUM'],
    iconKey: 'icon_food_family@2x',
  },
];

/**
 * Parsed at module load, so a bad edit fails immediately and by name.
 *
 * `MENU` is indexed by position throughout the simulation — an order stores an
 * item index, and that index is hashed into the world digest — so **this array
 * is append-only**. Inserting an item in the middle changes every existing
 * replay and every save, exactly like the archetype array.
 */
export const MENU: readonly MenuItem[] = z.array(menuItemSchema).parse([...STAGE1_ITEMS, ...LATER_ITEMS]);

export function menuItem(index: number): MenuItem {
  const item = MENU[index];
  if (item === undefined) throw new RangeError(`Unknown menu item ${index}`);
  return item;
}

/**
 * What a stage sells, cached per stage.
 *
 * Cached because `ServiceSystem` asks on every order and a filtered array per
 * order is an allocation on a hot path — the same reasoning that interned the
 * parking-goal names in Phase 12. There are four stages, so the cache is four
 * entries and never grows.
 *
 * Cumulative: a Stage 3 diner still sells lemonade. That is the design's own
 * shape (§4 lists a stage per item, not a stage *range*) and it is what makes
 * the average ticket rise gradually rather than jumping at every transition.
 */
const MENU_BY_STAGE = new Map<number, readonly MenuItem[]>();

export function menuForStage(stage: number): readonly MenuItem[] {
  const cached = MENU_BY_STAGE.get(stage);
  if (cached !== undefined) return cached;

  const items = MENU.filter((item) => item.stage <= stage);
  // A stage that somehow sells nothing would deadlock the counter; falling back
  // to the opening menu keeps a malformed stage playable rather than frozen.
  const resolved = items.length > 0 ? items : MENU.filter((item) => item.stage === 1);
  MENU_BY_STAGE.set(stage, resolved);
  return resolved;
}

export function menuIndexOf(id: string): number {
  const index = MENU.findIndex((item) => item.id === id);
  if (index < 0) throw new RangeError(`Unknown menu item "${id}"`);
  return index;
}

/**
 * Quality lost to sitting on the pass — GAME_EXECUTION_ROADMAP Phase 8.
 *
 *   quality = qualityBase * (1 - max(0, (heldMs - holdTolerance) / holdDecayMs) * 0.6)
 *
 * Reproduced exactly, including the 0.6 ceiling: food left far too long is bad,
 * not worthless, and a floor of zero would make a late delivery indistinguishable
 * from no delivery at all. The player has to be able to tell those apart, because
 * only one of them is worth fixing.
 */
export const HOLD_DECAY_MS = 60_000;
export const HOLD_DECAY_MAX_LOSS = 0.6;

/**
 * `toleranceBonusMs` is what a cooler buys — Phase 9.
 *
 * Added to the item's own tolerance rather than multiplying it, so the upgrade
 * is worth the same number of seconds on chips as on a hot dog. A multiplier
 * would give five minutes to the thing that already kept for five and thirty
 * seconds to the thing that did not, which is backwards: the upgrade exists to
 * rescue the item that goes cold fastest.
 */
export function holdTemperature(item: MenuItem, heldMs: number, toleranceBonusMs = 0): number {
  const over = Math.max(0, heldMs - (item.holdToleranceMs + toleranceBonusMs));
  const decay = Math.min(1, over / HOLD_DECAY_MS) * HOLD_DECAY_MAX_LOSS;
  return item.qualityBase * (1 - decay);
}
