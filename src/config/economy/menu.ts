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

const STAGE1_ITEMS: MenuItem[] = [
  {
    id: 'lemonade',
    stage: 1,
    station: 'DRINK',
    baseCost: 0.8,
    basePrice: 3,
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
    baseCost: 1.8,
    basePrice: 5,
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
    baseCost: 0.5,
    basePrice: 2,
    prepTimeMs: 1000,
    holdToleranceMs: 300_000,
    qualityBase: 0.65,
    appealTags: ['FAST'],
    iconKey: 'icon_food_chips@2x',
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
export const MENU: readonly MenuItem[] = z.array(menuItemSchema).parse(STAGE1_ITEMS);

export function menuItem(index: number): MenuItem {
  const item = MENU[index];
  if (item === undefined) throw new RangeError(`Unknown menu item ${index}`);
  return item;
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
