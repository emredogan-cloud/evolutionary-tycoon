import { z } from 'zod';

/**
 * The first six upgrades — ECONOMY_DESIGN §6, GAME_EXECUTION_ROADMAP Phase 9.
 *
 * ## Effects are data, not code
 *
 * Every upgrade declares *what kind* of effect it has and *how much per level*.
 * Nothing in `src/sim` switches on an upgrade id. That is not tidiness: Phase 13
 * grows this list to a full tree, and an `if` chain would mean the balance pass
 * edits gameplay code — which is the one edit that cannot be reviewed as a
 * balance change.
 *
 * ## The four-property rule
 *
 * The roadmap is explicit: an upgrade ships only with all four of a cost, a
 * measurable simulation effect, a visible world change, and a gameplay
 * consequence. `worldChange` and `consequence` are fields here rather than
 * comments so that a test can assert every upgrade has them, and so that adding
 * a seventh upgrade without one is a type error rather than an oversight.
 *
 * ## Two readings of ECONOMY_DESIGN §6.2 that had to be chosen between
 *
 * The effect-curve table indexes its rows inconsistently. The visibility row
 * reads `L1 = 1.30`, so `L` counts *purchases* — one purchase, +0.30, which is
 * exactly what the roadmap's "visibility 1.0 → 1.30" says. The speed row reads
 * `0.80^(L−1)` with `L1 = 1.00`, so under the same reading the first purchase of
 * a speed upgrade **does nothing** — which §6.3 forbids outright ("a speed
 * upgrade must cut at least 12% of the duration") and which would make the menu
 * board fail the four-property rule.
 *
 * Resolved as `0.80^level`, so one purchase is a 20% cut. Recorded as an open
 * discrepancy in PHASE_9_REPORT rather than treated as a silent fix: the two
 * rows cannot both be read literally, and which one moves is a design decision.
 */

/** Effect categories. Same category ⇒ combined with diminishing returns. */
const EFFECT_KINDS = [
  'visibility',
  'menuAppeal',
  'orderSpeed',
  'prepStations',
  'queueCapacity',
  'decisionPointMetres',
  'holdToleranceMs',
] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

/**
 * How an effect's per-level amounts turn into a number the simulation uses.
 *
 * - `multiplier` — amounts are fractions added to 1. Combined across families
 *   with `combineDiminishing`, so five different +20%s cannot become ×2.5.
 * - `scale` — amounts multiply directly and compound. Used for durations, where
 *   "20% faster" means 0.8× and two of them genuinely mean 0.64×.
 * - `additive` — amounts are added to a base. Capacities, distances, milliseconds.
 */
type EffectMode = 'multiplier' | 'scale' | 'additive';

/** Which mode each kind uses. One authority, so a system cannot disagree. */
export const EFFECT_MODE_OF: Readonly<Record<EffectKind, EffectMode>> = {
  visibility: 'multiplier',
  menuAppeal: 'multiplier',
  orderSpeed: 'scale',
  prepStations: 'additive',
  queueCapacity: 'additive',
  decisionPointMetres: 'additive',
  holdToleranceMs: 'additive',
};

/**
 * Per-category weight in `combineDiminishing` — ECONOMY_DESIGN §6.2.
 *
 * All 1 today, because no two of the six upgrades share a category and the
 * weight therefore cannot change any current number. It exists now so that the
 * Phase 13 tree has somewhere to express "conversion effects stack less
 * generously than capacity ones" without touching the combining function.
 */
export const CATEGORY_WEIGHT: Readonly<Record<EffectKind, number>> = {
  visibility: 1,
  menuAppeal: 1,
  orderSpeed: 1,
  prepStations: 1,
  queueCapacity: 1,
  decisionPointMetres: 1,
  holdToleranceMs: 1,
};

const effectSchema = z.object({
  kind: z.enum(EFFECT_KINDS),
  /**
   * What each level contributes, indexed from the first purchase.
   *
   * Length must equal `maxLevel`, so "what does level 3 do" is answerable by
   * reading rather than by extrapolating a formula that may not hold at the end
   * of the curve.
   */
  perLevel: z.array(z.number()).min(1),
});

const upgradeSchema = z.object({
  id: z.string().min(1),
  /** ECONOMY_DESIGN §6: one family per bottleneck, levels within a family. */
  family: z.string().min(1),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  /** Level-1 cost before the stage multiplier and level growth. */
  baseCost: z.number().positive(),
  maxLevel: z.number().int().min(1).max(5),
  effects: z.array(effectSchema).min(1),
  /** The visible world change. Empty is not allowed — see the four-property rule. */
  worldChange: z.string().min(1),
  /** What it changes about *playing*, in words a player would recognise. */
  consequence: z.string().min(1),
  /** Where in the world the upgrade card opens, in metres. */
  anchor: z.object({ x: z.number(), y: z.number() }),
  /** Texture key for the object that appears — ASSET_PIPELINE §3. */
  iconKey: z.string().min(1),
  /**
   * Which registered placeholder stands in for it until the art exists.
   *
   * Data rather than a lookup in the renderer, because "what does this upgrade
   * look like" is a property of the upgrade. It is also the field that makes
   * the visible-world-change rule checkable: an upgrade with no placeholder has
   * nothing to draw, and the roadmap says such an upgrade does not ship.
   */
  placeholder: z.enum(['ph-prop-tall', 'ph-prop-short']),
});

export type Upgrade = z.infer<typeof upgradeSchema>;

const STAGE1_UPGRADES: Upgrade[] = [
  {
    id: 'hand-painted-sign',
    family: 'VISIBILITY',
    stage: 1,
    baseCost: 6,
    maxLevel: 4,
    // ECONOMY_DESIGN §6.2, visibility row: +0.30, +0.22, +0.16, +0.12
    // → 1.30, 1.52, 1.68, 1.80 cumulative.
    effects: [{ kind: 'visibility', perLevel: [0.3, 0.22, 0.16, 0.12] }],
    worldChange: 'A painted sign appears on the stand',
    consequence: 'More of the traffic notices you at all',
    anchor: { x: 16.4, y: 12.6 },
    iconKey: 'struct_sign_painted@2x',
    placeholder: 'ph-prop-tall',
  },
  {
    id: 'menu-board',
    family: 'APPEAL',
    stage: 1,
    baseCost: 8,
    maxLevel: 3,
    effects: [
      { kind: 'menuAppeal', perLevel: [0.18, 0.13, 0.09] },
      // 0.8x per level: one purchase cuts ordering by 20%, clearing §6.3's 12%.
      { kind: 'orderSpeed', perLevel: [0.8, 0.8, 0.8] },
    ],
    worldChange: 'A menu board appears beside the counter',
    consequence: 'People know what they want before they reach the front',
    anchor: { x: 14.2, y: 12.4 },
    iconKey: 'struct_menuboard@2x',
    placeholder: 'ph-prop-tall',
  },
  {
    id: 'second-prep-station',
    family: 'THROUGHPUT',
    stage: 1,
    baseCost: 10,
    maxLevel: 2,
    effects: [{ kind: 'prepStations', perLevel: [1, 1] }],
    worldChange: 'A second prep bench appears in the kitchen',
    consequence: 'Two orders can be prepared at once',
    anchor: { x: 11.4, y: 12.2 },
    iconKey: 'prop_prep_station@2x',
    placeholder: 'ph-prop-short',
  },
  {
    id: 'bigger-counter',
    family: 'CAPACITY',
    stage: 1,
    baseCost: 11,
    /*
     * One level, and that is a limit of the *world* rather than of the design.
     * `stage1.ts` authors six queue positions and starts with a capacity of
     * four, so +2 uses the last of them. A second level would cost ₡88 and
     * change nothing, which is exactly the "+3% efficiency" upgrade the roadmap
     * bans. More levels arrive when the layout authors somewhere to stand.
     */
    maxLevel: 1,
    effects: [{ kind: 'queueCapacity', perLevel: [2] }],
    worldChange: 'The counter grows wider',
    consequence: 'A longer queue before people start giving up and driving past',
    anchor: { x: 15.0, y: 12.2 },
    iconKey: 'struct_counter_wide@2x',
    placeholder: 'ph-prop-short',
  },
  /*
   * **`roadside-marker` was removed here in Phase 12, and it was measured out
   * rather than argued out.**
   *
   * Its effect was `decisionPointMetres`: drivers decide about the stand further
   * back up the road. The paired experiment, averaged over three seeds, measured
   * every level of it as **costing ₡8.6 of revenue over twenty-four minutes** —
   * the only upgrade in the game that made things worse, and consistently so.
   *
   * The mechanism is worth writing down because it will catch the next person
   * too. A converted driver **reserves a parking bay at the moment they decide**,
   * not when they arrive. Deciding thirty metres earlier therefore holds one of
   * Stage 1's four bays for the whole drive down the lane, and parking is what
   * limits Stage 1 throughput at peak. The upgrade bought reach and paid for it
   * in capacity.
   *
   * ECONOMY_DESIGN §6.3 says an upgrade ships only with an effect the player can
   * notice inside sixty seconds; one whose effect is negative does not ship at
   * all. Phase 13 rebuilds the tree and owns the REACH family — the constraint it
   * inherits is that reach must not reserve capacity early.
   */
  {
    id: 'cooler',
    family: 'PRESERVATION',
    stage: 1,
    baseCost: 12,
    maxLevel: 3,
    effects: [{ kind: 'holdToleranceMs', perLevel: [30_000, 22_000, 16_000] }],
    worldChange: 'A cooler appears behind the counter',
    consequence: 'Food keeps longer on the pass before its quality starts falling',
    anchor: { x: 17.2, y: 12.2 },
    iconKey: 'prop_cooler@2x',
    placeholder: 'ph-prop-short',
  },
];

/**
 * Parsed at module load, and **append-only** for the same reason the menu is:
 * an upgrade's id is a key in a map that is hashed into the world digest and
 * written into every save.
 */
/**
 * The validator, exported so it can be given bad input.
 *
 * A schema that is only ever run on data known to be correct proves nothing —
 * it would pass just as happily if every refinement were deleted.
 * `tests/unit/sim/economy/upgradeCost.test.ts` feeds it a duplicate id and a
 * mismatched level count, which is the only way to know the guards fire.
 */
export function parseUpgrades(list: unknown): readonly Upgrade[] {
  return upgradesSchema.parse(list);
}

const upgradesSchema = z.array(upgradeSchema).superRefine((list, ctx) => {
  const ids = new Set<string>();
  for (const upgrade of list) {
    if (ids.has(upgrade.id)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate upgrade id "${upgrade.id}"` });
    }
    ids.add(upgrade.id);

    for (const effect of upgrade.effects) {
      if (effect.perLevel.length !== upgrade.maxLevel) {
        ctx.addIssue({
          code: 'custom',
          message: `${upgrade.id}: ${effect.kind} has ${String(effect.perLevel.length)} levels but maxLevel is ${String(upgrade.maxLevel)}`,
        });
      }
    }
  }
});

export const UPGRADES: readonly Upgrade[] = upgradesSchema.parse(STAGE1_UPGRADES);

export function upgrade(id: string): Upgrade {
  const found = UPGRADES.find((item) => item.id === id);
  if (found === undefined) throw new RangeError(`Unknown upgrade "${id}"`);
  return found;
}

/**
 * What the design expects a player to spend on upgrades *within* a stage —
 * ECONOMY_DESIGN §3, the "aşama içi yükseltme toplamı" row.
 *
 * Not a limit the game enforces; a statement of what the stage was costed for.
 * It matters because the stage-duration targets in the same table were computed
 * against it: Stage 1 is meant to take 12 to 18 minutes while spending ₡55 on
 * upgrades and saving ₡140 for the next stage, and a player who spends ₡80
 * instead is simply playing a longer Stage 1.
 *
 * The balance simulator reads it so its policies spend what the design assumed
 * they would. Measured before it did: policies bought ₡80 of Stage 1 upgrades
 * and reached Stage 2 at **30.5 minutes**; the same policies inside the designed
 * budget reach it inside the window.
 */
export const STAGE_UPGRADE_BUDGET: readonly number[] = [0, 55, 500, 8_000, 150_000];

/** ECONOMY_DESIGN §6.1. */
export const LEVEL_GROWTH = 2.2;
export const STAGE_MULTIPLIER: readonly number[] = [1, 4, 14, 55];

/**
 * What the *next* level costs — ECONOMY_DESIGN §6.1.
 *
 * `level` is the level being bought, counting from 1. Rounded, because a price
 * with a fraction of a credit in it is noise the player has to read past every
 * time they open a card.
 */
export function upgradeCost(item: Upgrade, level: number, stage = 1): number {
  const stageMultiplier = STAGE_MULTIPLIER[stage - 1] ?? 1;
  return Math.round(item.baseCost * stageMultiplier * LEVEL_GROWTH ** (level - 1));
}

/**
 * Minimum significance — ECONOMY_DESIGN §6.3.
 *
 * "An upgrade that does not produce an effect the player can notice within sixty
 * seconds does not enter the game. `+3% efficiency` upgrades are banned."
 * Asserted against every upgrade's first level by test, so the ban is enforced
 * rather than merely stated.
 */
export const MIN_SIGNIFICANCE = {
  /** Fraction of a duration a speed upgrade must remove. */
  speed: 0.12,
  /** Whole units a capacity upgrade must add. */
  capacity: 1,
  /** Points of conversion probability a visibility/appeal upgrade must add. */
  conversion: 0.02,
} as const;
