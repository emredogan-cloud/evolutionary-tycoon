import { z } from 'zod';
import { MENU, menuForStage } from './menu';
import type { MenuItem } from './menu';

/**
 * What a customer orders — ADR-016, closing ECONOMY_DESIGN change request §8.1.
 *
 * §3's stage envelopes assume average tickets of ₡4.5 / ₡9 / ₡18 / ₡30 and the
 * order mechanic was one uniformly-chosen item, whose achievable average is the
 * stage menu's mean price: ₡4.5 / ₡5.85 / ₡9.57 / ₡15.58. Two of the eleven
 * balance assertions were NOT EVALUABLE because of the gap, and the gap is
 * arithmetic — no tuning of a one-item order reaches a ₡30 ticket on a ₡15.58
 * menu without abandoning the menu.
 *
 * The resolution is the fantasy the genre already has: **a customer orders a
 * basket** — the item they came for, plus maybe a side, plus maybe a drink, and
 * a Stage 4 family orders more of both. The base item stays uniformly chosen
 * from the stage menu (every item keeps its identity and its sales), and the
 * extras are drawn from the two pools below with per-stage probabilities.
 *
 * ## The numbers are solved, not tuned
 *
 * The expected ticket is a closed formula:
 *
 *   E[ticket] = mean(stage menu) + draws × (sideChance × mean(sides∩stage)
 *                                        +  drinkChance × mean(drinks∩stage))
 *
 * and the chances below are that formula solved against §3's designed tickets
 * with the real menu prices. `expectedTicket()` recomputes it from config at
 * runtime, `tools/balance-sim` asserts against the same function, and
 * `tests/unit/config/basket.test.ts` pins the solution to the design — so a
 * price change that silently moves the ticket becomes a red test, not a drift.
 *
 * Stage 1 is deliberately all zeros: its measured ticket already sits on the
 * design (P12 scaled its prices for exactly that), and a lemonade stand selling
 * combo meals would move an envelope that is currently correct.
 */

/**
 * Extras pools, by menu id.
 *
 * Declared as id lists rather than derived from tags, because "is a hotdog a
 * side" is a menu-design judgement, not a fact tags can settle — HEARTY+FAST
 * reads either way. An id listed here must exist in the menu; the schema check
 * at the bottom enforces it. An item may be in a pool and still be a base item:
 * fries bought as the main thing and fries added to a burger are both real.
 */
export const SIDE_POOL = ['chips', 'fries', 'dessert'] as const;
export const DRINK_POOL = ['lemonade', 'cola', 'coffee'] as const;

const stageBasketSchema = z.object({
  /** Chance each draw adds a side, 0..1. */
  sideChance: z.number().min(0).max(1),
  /** Chance each draw adds a drink, 0..1. */
  drinkChance: z.number().min(0).max(1),
  /**
   * How many independent side/drink attempts a customer makes.
   *
   * 1 everywhere except Stage 4, where the family-van archetype dominates the
   * curve and a family orders in twos — which is also what lets the ₡30 ticket
   * exist without any chance exceeding 1.
   */
  draws: z.number().int().min(0).max(3),
});

export type StageBasket = z.infer<typeof stageBasketSchema>;

/**
 * Solved against ECONOMY_DESIGN §3 with the shipped menu prices — see the
 * module note. The pinning test recomputes the solution; these literals are the
 * decision record.
 */
export const STAGE_BASKETS: Readonly<Record<1 | 2 | 3 | 4, StageBasket>> = {
  1: stageBasketSchema.parse({ sideChance: 0, drinkChance: 0, draws: 0 }),
  2: stageBasketSchema.parse({ sideChance: 0.39, drinkChance: 0.39, draws: 1 }),
  3: stageBasketSchema.parse({ sideChance: 0.75, drinkChance: 0.75, draws: 1 }),
  4: stageBasketSchema.parse({ sideChance: 0.64, drinkChance: 0.64, draws: 2 }),
};

function meanPrice(items: readonly MenuItem[]): number {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + item.basePrice, 0) / items.length;
}

/** The extras pools as they exist at a stage — a Stage 2 stand has no coffee. */
export function sidePoolFor(stage: number): readonly MenuItem[] {
  const available = menuForStage(stage);
  return available.filter((item) => (SIDE_POOL as readonly string[]).includes(item.id));
}

export function drinkPoolFor(stage: number): readonly MenuItem[] {
  const available = menuForStage(stage);
  return available.filter((item) => (DRINK_POOL as readonly string[]).includes(item.id));
}

/**
 * The average ticket this mechanic produces at a stage — the closed formula.
 *
 * This is the number `tools/balance-sim` compares against §3's designed ticket,
 * replacing the "mean menu price" computation that used to mark two assertions
 * NOT EVALUABLE. One function, used by the simulation's expectations and the
 * gate's arithmetic, so they cannot disagree.
 */
export function expectedTicket(stage: number): number {
  const basket = STAGE_BASKETS[(stage < 1 ? 1 : stage > 4 ? 4 : stage) as 1 | 2 | 3 | 4];
  const base = meanPrice(menuForStage(stage));
  const sides = meanPrice(sidePoolFor(stage));
  const drinks = meanPrice(drinkPoolFor(stage));
  return base + basket.draws * (basket.sideChance * sides + basket.drinkChance * drinks);
}

/* Every pooled id must be a real menu item — a typo here would silently shrink
 * a pool and move every ticket above it. Checked at module load, like the menu
 * itself. */
for (const id of [...SIDE_POOL, ...DRINK_POOL]) {
  if (!MENU.some((item) => item.id === id)) {
    throw new Error(`basket: "${id}" is not a menu item`);
  }
}
