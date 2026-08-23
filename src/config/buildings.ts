import { z } from 'zod';
import type { EffectKind } from './economy/upgrades';

/**
 * Functional buildings — equipment the player buys, places, and upgrades.
 *
 * ## Why only two of the four the directive names
 *
 * Decision B authorised Cola Machine, Burger Machine, Prep Counter and Small
 * Storage for Stage 1, and forbade shipping any of them with an effect that
 * does nothing. Measured against the current simulation, two of the four are
 * already answered elsewhere or answer nothing:
 *
 * - **Prep Counter** would add a concurrent preparation stream, which is real
 *   and consumed — by `prepStations`, which the `second-prep-station` upgrade
 *   already sells at Stage 1 for ₡10 (and which even uses the same `pass`
 *   bench art). A second door to one effect is not a second mechanic; it is
 *   two prices for the same thing, and the two would compound into a stat
 *   nobody designed. It stays an upgrade.
 * - **Small Storage** maps to GAME_DESIGN_DOCUMENT §13's "Depo / stok →
 *   malzeme kesintisi riski ↓". There is no ingredient system to interrupt,
 *   so there is nothing for the effect to reduce. The nearest real consumer
 *   is the pass's six-plate ceiling (`PASS_CAPACITY`) — and the balance
 *   matrix measures the kitchen at 2–10% occupancy across every stage and
 *   policy, so a bigger pass would change no number at Stage 1. Deferred to
 *   the first stage where the pass actually backs up, with the measurement as
 *   the reason rather than a guess.
 *
 * What is left is the pair that does bind: preparation *time* per station
 * type. Both have delivered art, both have a consumer in `KitchenSystem`, and
 * both get more valuable exactly as the menu's preparation times rise toward
 * the directive's UX targets — which is the point of shipping them together.
 *
 * ## Levels are stage-gated
 *
 * Stage 1 → Level 1, Stage 2 → Level 2, Stage 3 → Level 3, as Decision B's
 * default rule asks. `stageForLevel` is the single place that rule lives.
 */

const BUILDING_CATEGORIES = ['KITCHEN'] as const;

const effectSchema = z.object({
  kind: z.string().min(1),
  /** The value at this level. Scale kinds multiply; 1 is "no change". */
  value: z.number(),
});

const buildingSchema = z.object({
  /**
   * Stable id. It is what `PlacedObject.itemId` carries, so it is hashed
   * through the command log and written into every save: never renumber.
   */
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(BUILDING_CATEGORIES),
  /** First restaurant stage that may build it at all. */
  stageRequired: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  maxLevel: z.number().int().min(1).max(3),
  /** Cost of reaching each level, index 0 = level 1. */
  costByLevel: z.array(z.number().positive()).nonempty(),
  /** Construction time for each level, in simulation milliseconds. */
  buildMsByLevel: z.array(z.number().int().positive()).nonempty(),
  /** Upgrade ids that must be owned first. Empty today; the graph is honoured. */
  prerequisites: z.array(z.string()).default([]),
  /** Effects at each level — cumulative, not additive on top of the last. */
  effectsByLevel: z.array(z.array(effectSchema)).nonempty(),
  /**
   * A `WORLD_OBJECTS` id per level.
   *
   * Where a level has no distinct art yet the previous frame repeats, and the
   * gap is a prompt rather than a placeholder — the level badge on the site
   * still shows the true level, so the interface never claims art it lacks.
   */
  assetByLevel: z.array(z.string().min(1)).nonempty(),
  footprintX: z.number().positive(),
  footprintY: z.number().positive(),
  /** Kitchen equipment belongs on the lot, not on the verge. */
  zone: z.literal('lot'),
});

/**
 * Every ladder is exactly `maxLevel` long.
 *
 * Checked at load rather than guarded at every read: a definition whose price
 * list is shorter than its level count would otherwise fail silently at
 * whatever level ran off the end — an upgrade the player pays for and does
 * not receive. Rejecting it here turns four possible runtime surprises into
 * one loud parse error.
 */
const buildingLadders = buildingSchema.superRefine((item, ctx) => {
  const ladders: [string, number][] = [
    ['costByLevel', item.costByLevel.length],
    ['buildMsByLevel', item.buildMsByLevel.length],
    ['effectsByLevel', item.effectsByLevel.length],
    ['assetByLevel', item.assetByLevel.length],
  ];
  for (const [field, length] of ladders) {
    if (length === item.maxLevel) continue;
    ctx.addIssue({
      code: 'custom',
      path: [field],
      message: `${item.id}: ${field} has ${String(length)} entries for maxLevel ${String(item.maxLevel)}`,
    });
  }
});

/** Exported so a test can prove the ladder check actually fires. */
export const parseBuildings = (input: unknown): Building[] => z.array(buildingLadders).parse(input);

export type Building = z.infer<typeof buildingSchema>;

export const BUILDINGS: readonly Building[] = parseBuildings([
  {
    id: 'cola-machine',
    label: 'İçecek Makinesi',
    description: 'İçecekleri kendi hazırlar; içecek istasyonu hızlanır.',
    category: 'KITCHEN',
    stageRequired: 1,
    maxLevel: 3,
    costByLevel: [24, 72, 210],
    // Six, twelve and twenty game-minutes — the same shape as an upgrade of
    // the same price, so a building does not feel like a different clock.
    buildMsByLevel: [6_000, 12_000, 20_000],
    prerequisites: [],
    effectsByLevel: [
      [{ kind: 'drinkStationSpeed', value: 1.5 }],
      [{ kind: 'drinkStationSpeed', value: 2.0 }],
      [{ kind: 'drinkStationSpeed', value: 2.6 }],
    ],
    assetByLevel: ['drink', 'drink', 'drink'],
    footprintX: 0.9,
    footprintY: 0.8,
    zone: 'lot',
  },
  {
    id: 'burger-machine',
    label: 'Burger Istasyonu',
    description: 'Izgarayı besler; burger ve sıcak hazırlığı hızlanır.',
    category: 'KITCHEN',
    stageRequired: 1,
    maxLevel: 3,
    costByLevel: [36, 105, 300],
    buildMsByLevel: [8_000, 15_000, 24_000],
    prerequisites: [],
    effectsByLevel: [
      [{ kind: 'grillStationSpeed', value: 1.4 }],
      [{ kind: 'grillStationSpeed', value: 1.9 }],
      [{ kind: 'grillStationSpeed', value: 2.5 }],
    ],
    // Level 2 has its own delivered frame; level 3 repeats it and is prompted.
    assetByLevel: ['grill-lv1', 'grill-lv2', 'grill-lv2'],
    footprintX: 1.2,
    footprintY: 0.8,
    zone: 'lot',
  },
]);

/**
 * The restaurant stage a building level needs — Decision B's default rule,
 * in one place so no definition can quietly disagree with it.
 */
export function stageForLevel(level: number): number {
  return Math.max(1, Math.min(4, level));
}

const BY_ID = new Map(BUILDINGS.map((item) => [item.id, item]));

export function building(id: string): Building | undefined {
  return BY_ID.get(id);
}

/** What reaching `level` costs, or `undefined` past the ladder. */
export function buildingCost(item: Building, level: number): number | undefined {
  return item.costByLevel[level - 1];
}

/** How long reaching `level` takes, in simulation milliseconds. */
export function buildingBuildMs(item: Building, level: number): number | undefined {
  return item.buildMsByLevel[level - 1];
}

/** The world object drawn for `level`, falling back to the highest real frame. */
export function buildingAsset(item: Building, level: number): string {
  /*
   * Walked rather than indexed. The ladders are non-empty and exactly
   * `maxLevel` long, so a dynamic index is always in range — but the type
   * cannot know that, and a `??` for a case the parser has already made
   * impossible is a branch nothing can ever exercise. Walking gives the same
   * answer with no unreachable arm: the last frame at or below the level,
   * starting from the first.
   */
  let frame = '';
  for (const [index, candidate] of item.assetByLevel.entries()) {
    // The first frame always applies; later ones only up to the level asked
    // for, so a level past the ladder keeps the top rung's art.
    if (index === 0 || index + 1 <= level) frame = candidate;
  }
  return frame;
}

/**
 * Every effect term a set of owned buildings contributes for one kind.
 *
 * Pure, and takes the ownership list rather than the world, so this file stays
 * data + arithmetic and the simulation keeps its own boundary
 * (`src/config` may not import `src/sim`). `UpgradeSystem` collects the pairs
 * and folds these terms in beside the upgrade tree's.
 */
export function buildingEffectTerms(
  kind: EffectKind,
  owned: readonly { readonly id: string; readonly level: number }[],
): number[] {
  const terms: number[] = [];
  for (const entry of owned) {
    const item = BY_ID.get(entry.id);
    if (item === undefined) continue;
    const level = Math.max(0, Math.min(item.maxLevel, entry.level));
    if (level <= 0) continue;
    // Walked for the same reason as `buildingAsset`.
    for (const [index, effects] of item.effectsByLevel.entries()) {
      if (index + 1 !== level) continue;
      for (const effect of effects) {
        if (effect.kind === kind) terms.push(effect.value);
      }
    }
  }
  return terms;
}
