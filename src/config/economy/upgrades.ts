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
  // Conversion — how many of the cars that pass decide to stop.
  'visibility',
  'nightVisibility',
  'menuAppeal',
  'atmosphere',
  'decisionPointMetres',
  // Kitchen — how fast, and how good, the food is.
  'orderSpeed',
  'prepStations',
  'prepSpeed',
  'foodQuality',
  'holdToleranceMs',
  // Capacity — how many people the place can hold, and for how long.
  'queueCapacity',
  'patienceScale',
  // Drive-thru — Stage 4 only.
  'laneCapacity',
  'windowSpeed',
  'orderPostSpeed',
  // Staff — how quickly and how well the people work.
  'staffSpeed',
  'staffSkill',
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
  nightVisibility: 'multiplier',
  menuAppeal: 'multiplier',
  atmosphere: 'additive',
  decisionPointMetres: 'additive',
  orderSpeed: 'scale',
  prepStations: 'additive',
  prepSpeed: 'scale',
  foodQuality: 'additive',
  holdToleranceMs: 'additive',
  queueCapacity: 'additive',
  patienceScale: 'scale',
  laneCapacity: 'additive',
  windowSpeed: 'scale',
  orderPostSpeed: 'scale',
  staffSpeed: 'scale',
  staffSkill: 'additive',
};

/**
 * Per-category weight in `combineDiminishing` — ECONOMY_DESIGN §6.2.
 *
 * **Still all 1, and Phase 13 deliberately left them there.** With thirty
 * upgrades the temptation is to damp conversion harder — four of them now push
 * on `visibility` or `nightVisibility` — but §6.2 publishes the sign's exact
 * cumulative curve (1.30, 1.52, 1.68, 1.80) and that curve is computed at weight
 * 1. Lowering the weight to 0.75 reproduces 1.225 instead, which is a different
 * published number, and changing one of those is a change request rather than a
 * config edit (WORKING_DISCIPLINE §6).
 *
 * The stacking is damped anyway, by the mechanism that was always going to do
 * it: `combineDiminishing` runs over every upgrade contributing to the *kind*,
 * so a second sign is worth less than the first regardless of which family it
 * belongs to. The conversion ceiling in ECONOMY_DESIGN §3 is the hard stop
 * behind that, and the balance gate measures it.
 */
export const CATEGORY_WEIGHT: Readonly<Record<EffectKind, number>> = {
  visibility: 1,
  nightVisibility: 1,
  menuAppeal: 1,
  atmosphere: 1,
  decisionPointMetres: 1,
  orderSpeed: 1,
  prepStations: 1,
  prepSpeed: 1,
  foodQuality: 1,
  holdToleranceMs: 1,
  queueCapacity: 1,
  patienceScale: 1,
  laneCapacity: 1,
  windowSpeed: 1,
  orderPostSpeed: 1,
  staffSpeed: 1,
  staffSkill: 1,
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
  /**
   * Upgrades that must be owned first — GAME_EXECUTION_ROADMAP Phase 13.
   *
   * Ids, and only ids: a prerequisite expressed as a predicate would be code,
   * and the roadmap is explicit that an upgrade is data. The graph they form is
   * checked for cycles at module load, because a cycle is not a balance problem
   * — it is a branch of the tree nobody can ever reach, and it would look
   * exactly like an upgrade the player had not yet earned.
   */
  prereqs: z.array(z.string()).default([]),
  /**
   * One of the design's five families — GAME_DESIGN_DOCUMENT §13.2.
   *
   * A closed set rather than a string, since Phase 13. With six upgrades the
   * family was a label; with thirty it is the thing that makes the build menu
   * legible and the thing a player reasons in ("I have been putting everything
   * into the kitchen"). A typo would silently create a sixth family that appears
   * nowhere in the design.
   *
   * Note that a family is **not** what diminishing returns are computed over —
   * that is the effect *kind*, so two upgrades in different families pushing on
   * `visibility` still damp each other.
   */
  family: z.enum(['VISIBILITY_APPEAL', 'KITCHEN', 'CAPACITY', 'DRIVE_THRU', 'STAFF']),
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
   * Which world object appears at the anchor when this is owned — or nothing.
   *
   * Data rather than a lookup in the renderer, because "what does this upgrade
   * look like" is a property of the upgrade. It is also the field that makes
   * the visible-world-change rule checkable: an upgrade with no placeholder has
   * nothing to draw, and the roadmap says such an upgrade does not ship.
   */
  /*
   * Renamed in meaning, not in name: this held a placeholder texture key for
   * thirteen phases and now holds a **production world-object id** from
   * `src/config/sprites.ts` — or the empty string, for the upgrades that are a
   * process rather than a thing. Sharper knives do not stand in the forecourt;
   * their visible change is the purchase burst and the numbers moving. Mapping
   * every upgrade to *some* object was tried first and produced a wrong object
   * at half the anchors, which is the placeholder problem wearing a costume.
   */
  placeholder: z.string(),
});

export type Upgrade = z.infer<typeof upgradeSchema>;

/**
 * The same thing as it is written below, before Zod fills in the defaults.
 *
 * `prereqs` defaults to `[]`, so the parsed type requires it and the authored
 * literal does not. Annotating the array with the *input* type is what lets a
 * root upgrade simply omit the field instead of carrying an empty list.
 */
type UpgradeInput = z.input<typeof upgradeSchema>;

/**
 * The full upgrade tree — GAME_EXECUTION_ROADMAP Phase 13, GAME_DESIGN_DOCUMENT §13.2.
 *
 * Thirty upgrades across the design's five families, spread over the four
 * stages. Every one carries the four properties §13.1 demands — a cost, a
 * measurable simulation effect, a visible change in the world, and a
 * consequence for how the game is played — and a test fails the build if any
 * of the four is missing, because that rule is what stops a tree filling with
 * "+3% efficiency".
 *
 * ## Data, not code
 *
 * There is no `switch` on an upgrade id anywhere in `src/sim`, and there must
 * never be. An upgrade is `{ id, family, stage, cost, prereqs, effects, visual }`
 * and `effects` are typed references to simulation parameters. Adding an upgrade
 * is editing this array; adding a *kind* of upgrade is the only thing that
 * touches a system, and each kind is read in exactly one place.
 *
 * ## Prerequisites make it a tree rather than a menu
 *
 * `illuminated-sign` needs the hand-painted one; `neon-facade` needs that; the
 * pylon needs the neon. Each family therefore reads as a story about the same
 * object growing up, and the stage a rung sits at decides when the story can
 * continue. The graph is checked for cycles at module load.
 *
 * ## Why the anchors matter
 *
 * The card opens beside the thing it changes (GAME_DESIGN_DOCUMENT §14.3), so
 * every anchor is a real place on the lot: the sign anchors at the sign, the
 * drive-thru upgrades anchor along the lane. An anchor that pointed at empty
 * tarmac would open a card about nothing.
 */
const UPGRADE_TREE: UpgradeInput[] = [
  {
    id: 'hand-painted-sign',
    family: 'VISIBILITY_APPEAL',
    stage: 1,
    baseCost: 6,
    maxLevel: 4,
    effects: [{ kind: 'visibility', perLevel: [0.5, 0.28, 0.16, 0.12] }],
    worldChange: 'A painted sign appears on the stand, and grows with every level',
    consequence: 'More of the traffic notices you at all',
    anchor: { x: 16.4, y: 12.6 },
    iconKey: 'ui_upgrade_sign-painted@2x',
    placeholder: 'sign',
  },
  {
    id: 'menu-board',
    family: 'VISIBILITY_APPEAL',
    stage: 1,
    baseCost: 8,
    maxLevel: 3,
    effects: [
      { kind: 'menuAppeal', perLevel: [0.25, 0.15, 0.09] },
      { kind: 'orderSpeed', perLevel: [0.8, 0.8, 0.8] },
    ],
    worldChange: 'A menu board appears beside the counter',
    consequence: 'People know what they want before they reach the front',
    anchor: { x: 14.2, y: 12.4 },
    iconKey: 'ui_upgrade_menuboard@2x',
    placeholder: '',
  },
  {
    id: 'planter-boxes',
    family: 'VISIBILITY_APPEAL',
    stage: 2,
    baseCost: 3,
    maxLevel: 2,
    effects: [{ kind: 'atmosphere', perLevel: [0.12, 0.08] }],
    worldChange: 'Planters and a painted frontage replace bare tarmac',
    consequence: 'The place looks cared for, and people linger instead of leaving',
    anchor: { x: 11.5, y: 13.2 },
    iconKey: 'ui_upgrade_planter@2x',
    placeholder: 'bush-flowering-01',
  },
  {
    id: 'illuminated-sign',
    family: 'VISIBILITY_APPEAL',
    stage: 2,
    baseCost: 5.5,
    maxLevel: 2,
    prereqs: ['hand-painted-sign'],
    effects: [{ kind: 'nightVisibility', perLevel: [0.45, 0.35] }],
    worldChange: 'The sign lights up, and the night scene changes completely',
    consequence: 'The empty hours after dark start earning',
    anchor: { x: 16.4, y: 13.4 },
    iconKey: 'ui_upgrade_sign-lit@2x',
    placeholder: 'sign',
  },
  {
    id: 'neon-facade',
    family: 'VISIBILITY_APPEAL',
    stage: 3,
    baseCost: 6,
    maxLevel: 2,
    prereqs: ['illuminated-sign'],
    effects: [
      { kind: 'nightVisibility', perLevel: [0.35, 0.25] },
      { kind: 'atmosphere', perLevel: [0.1, 0.07] },
    ],
    worldChange: 'Neon runs the length of the building',
    consequence: 'The restaurant is a landmark after dark rather than a silhouette',
    anchor: { x: 18.6, y: 12.6 },
    iconKey: 'ui_upgrade_neon@2x',
    placeholder: '',
  },
  {
    id: 'roadside-pylon',
    family: 'VISIBILITY_APPEAL',
    stage: 4,
    baseCost: 4,
    maxLevel: 2,
    prereqs: ['neon-facade'],
    effects: [{ kind: 'visibility', perLevel: [0.18, 0.12] }],
    worldChange: 'A tall pylon sign rises above the roofline',
    consequence: 'Drivers see you from the next junction, not the next car length',
    anchor: { x: 21.4, y: 11.0 },
    iconKey: 'ui_upgrade_pylon@2x',
    placeholder: 'sign',
  },
  {
    id: 'second-prep-station',
    family: 'KITCHEN',
    stage: 1,
    baseCost: 10,
    maxLevel: 2,
    effects: [{ kind: 'prepStations', perLevel: [1, 1] }],
    worldChange: 'A second prep bench appears in the kitchen',
    consequence: 'Two orders can be made at once instead of one',
    anchor: { x: 13.0, y: 13.6 },
    iconKey: 'ui_upgrade_prep-station@2x',
    placeholder: 'pass',
  },
  {
    id: 'cooler',
    family: 'KITCHEN',
    stage: 1,
    baseCost: 12,
    maxLevel: 3,
    effects: [{ kind: 'holdToleranceMs', perLevel: [30000, 22000, 16000] }],
    worldChange: 'A cooler appears behind the counter',
    consequence: 'Food waits longer on the pass without going cold',
    anchor: { x: 12.2, y: 14.2 },
    iconKey: 'ui_upgrade_cooler@2x',
    placeholder: 'drink',
  },
  {
    id: 'sharper-knives',
    family: 'KITCHEN',
    stage: 2,
    baseCost: 5,
    maxLevel: 2,
    effects: [{ kind: 'prepSpeed', perLevel: [0.85, 0.88] }],
    worldChange: 'The prep bench gains proper boards and a knife rack',
    consequence: 'Every order leaves the kitchen sooner',
    anchor: { x: 13.6, y: 14.2 },
    iconKey: 'ui_upgrade_knives@2x',
    placeholder: '',
  },
  {
    id: 'pass-heat-lamp',
    family: 'KITCHEN',
    stage: 2,
    baseCost: 5,
    maxLevel: 2,
    prereqs: ['cooler'],
    effects: [{ kind: 'holdToleranceMs', perLevel: [40000, 30000] }],
    worldChange: 'A heat lamp glows over the pass',
    consequence: 'A busy pass stops being a race against the food going cold',
    anchor: { x: 12.6, y: 13.8 },
    iconKey: 'ui_upgrade_heatlamp@2x',
    placeholder: 'pass',
  },
  {
    id: 'better-ingredients',
    family: 'KITCHEN',
    stage: 3,
    baseCost: 5,
    maxLevel: 3,
    prereqs: ['sharper-knives'],
    effects: [{ kind: 'foodQuality', perLevel: [0.06, 0.05, 0.04] }],
    worldChange: 'Crates of fresh produce stack up in the back',
    consequence: 'People rate the food higher, tip more, and come back',
    anchor: { x: 11.0, y: 14.6 },
    iconKey: 'ui_upgrade_crates@2x',
    placeholder: '',
  },
  {
    id: 'drink-dispenser',
    family: 'KITCHEN',
    stage: 3,
    baseCost: 7,
    maxLevel: 2,
    prereqs: ['second-prep-station'],
    effects: [
      { kind: 'prepStations', perLevel: [1, 1] },
      { kind: 'prepSpeed', perLevel: [0.88, 0.9] },
    ],
    worldChange: 'A drinks dispenser appears at the end of the counter',
    consequence: 'Drinks stop queueing behind hot food',
    anchor: { x: 14.8, y: 13.0 },
    iconKey: 'ui_upgrade_dispenser@2x',
    placeholder: 'drink',
  },
  {
    id: 'prep-automation',
    family: 'KITCHEN',
    stage: 4,
    baseCost: 21.0,
    maxLevel: 2,
    prereqs: ['drink-dispenser'],
    effects: [{ kind: 'prepSpeed', perLevel: [0.88, 0.9] }],
    worldChange: 'Timers and automatic baskets appear on the fryers',
    consequence: 'The kitchen keeps pace without anyone watching the clock',
    anchor: { x: 13.2, y: 15.0 },
    iconKey: 'ui_upgrade_automation@2x',
    placeholder: '',
  },
  {
    id: 'pastry-oven',
    family: 'KITCHEN',
    stage: 4,
    baseCost: 21.0,
    maxLevel: 2,
    prereqs: ['better-ingredients'],
    effects: [
      { kind: 'foodQuality', perLevel: [0.05, 0.04] },
      { kind: 'prepStations', perLevel: [1, 1] },
    ],
    worldChange: 'A pastry oven appears along the back wall',
    consequence: 'A whole extra line of food, made to a higher standard',
    anchor: { x: 10.2, y: 15.0 },
    iconKey: 'ui_upgrade_oven@2x',
    placeholder: '',
  },
  {
    id: 'bigger-counter',
    family: 'CAPACITY',
    stage: 1,
    baseCost: 11,
    /*
     * One level, and that is a layout fact rather than a balance choice. Stage 1
     * authors six queue places and a capacity of four; a second level would take
     * capacity to eight and leave the queue with nowhere to spill, which is the
     * one thing that tells an overwhelmed stand to stop attracting customers.
     */
    maxLevel: 1,
    effects: [{ kind: 'queueCapacity', perLevel: [2] }],
    worldChange: 'The counter widens and a second till position appears',
    consequence: 'The queue holds more people before it spills toward the road',
    anchor: { x: 15.6, y: 12.0 },
    iconKey: 'ui_upgrade_counter-wide@2x',
    placeholder: 'counter-lv2',
  },
  {
    id: 'queue-barriers',
    family: 'CAPACITY',
    stage: 2,
    baseCost: 5.5,
    maxLevel: 2,
    prereqs: ['bigger-counter'],
    effects: [{ kind: 'queueCapacity', perLevel: [2, 2] }],
    worldChange: 'Rope barriers mark out the queue',
    consequence: 'A long queue folds instead of reaching the carriageway',
    anchor: { x: 15.0, y: 11.4 },
    iconKey: 'ui_upgrade_barrier@2x',
    placeholder: 'barrier',
  },
  {
    id: 'shade-canopy',
    family: 'CAPACITY',
    stage: 2,
    baseCost: 5.5,
    maxLevel: 2,
    effects: [{ kind: 'patienceScale', perLevel: [1.15, 1.1] }],
    worldChange: 'A canopy stretches over the queue',
    consequence: 'People stay in the queue in weather that would have moved them on',
    anchor: { x: 15.4, y: 11.8 },
    iconKey: 'ui_upgrade_canopy@2x',
    placeholder: 'awning',
  },
  {
    id: 'padded-benches',
    family: 'CAPACITY',
    stage: 3,
    baseCost: 4,
    maxLevel: 2,
    prereqs: ['shade-canopy'],
    effects: [{ kind: 'patienceScale', perLevel: [1.12, 1.08] }],
    worldChange: 'Benches and padded seating fill the waiting area',
    consequence: 'Waiting stops being the worst part of the visit',
    anchor: { x: 16.8, y: 14.4 },
    iconKey: 'ui_upgrade_bench@2x',
    placeholder: 'chair-wooden',
  },
  {
    id: 'widened-forecourt',
    family: 'CAPACITY',
    stage: 3,
    baseCost: 7,
    maxLevel: 1,
    prereqs: ['queue-barriers'],
    effects: [{ kind: 'queueCapacity', perLevel: [2] }],
    worldChange: 'The forecourt is resurfaced and marked out wider',
    consequence: 'The queue and the car park stop fighting each other for room',
    anchor: { x: 9.0, y: 11.6 },
    iconKey: 'ui_upgrade_forecourt@2x',
    placeholder: '',
  },
  {
    id: 'covered-terrace',
    family: 'CAPACITY',
    stage: 4,
    baseCost: 21.0,
    maxLevel: 2,
    prereqs: ['padded-benches'],
    effects: [
      { kind: 'patienceScale', perLevel: [1.1, 1.08] },
      { kind: 'atmosphere', perLevel: [0.08, 0.06] },
    ],
    worldChange: 'A covered terrace extends the dining room outdoors',
    consequence: 'The restaurant holds a lunch rush without anyone standing outside',
    anchor: { x: 19.0, y: 15.4 },
    iconKey: 'ui_upgrade_terrace@2x',
    placeholder: 'awning',
  },
  {
    id: 'second-register',
    family: 'CAPACITY',
    stage: 4,
    baseCost: 24.5,
    maxLevel: 1,
    prereqs: ['widened-forecourt'],
    effects: [
      { kind: 'queueCapacity', perLevel: [2] },
      { kind: 'orderSpeed', perLevel: [0.85] },
    ],
    worldChange: 'A second till opens at the far end of the counter',
    consequence: 'Two people are served at once, and the queue halves',
    anchor: { x: 17.2, y: 12.0 },
    iconKey: 'ui_upgrade_register@2x',
    placeholder: 'counter-lv1',
  },
  {
    id: 'lane-extension',
    family: 'DRIVE_THRU',
    stage: 4,
    baseCost: 17.5,
    maxLevel: 2,
    effects: [{ kind: 'laneCapacity', perLevel: [1, 1] }],
    worldChange: 'The drive-thru lane is repainted further back up the lot',
    consequence: 'More cars can wait in the lane instead of driving past',
    anchor: { x: 22.6, y: 7.0 },
    iconKey: 'ui_upgrade_lane@2x',
    placeholder: '',
  },
  {
    id: 'second-order-post',
    family: 'DRIVE_THRU',
    stage: 4,
    baseCost: 21.0,
    maxLevel: 1,
    prereqs: ['lane-extension'],
    effects: [{ kind: 'orderPostSpeed', perLevel: [0.7] }],
    worldChange: 'A second order post appears halfway down the lane',
    consequence: 'Two cars order at once, so the lane keeps moving',
    anchor: { x: 22.8, y: 8.6 },
    iconKey: 'ui_upgrade_orderpost@2x',
    placeholder: 'sign',
  },
  {
    id: 'express-window',
    family: 'DRIVE_THRU',
    stage: 4,
    baseCost: 14.0,
    maxLevel: 3,
    effects: [{ kind: 'windowSpeed', perLevel: [0.85, 0.88, 0.9] }],
    worldChange: 'The service window is rebuilt with a wider sill and a chute',
    consequence: 'A car is handed its order and gone before the next one stops',
    anchor: { x: 23.0, y: 11.4 },
    iconKey: 'ui_upgrade_window@2x',
    placeholder: 'window',
  },
  {
    id: 'tap-to-pay',
    family: 'DRIVE_THRU',
    stage: 4,
    baseCost: 4,
    maxLevel: 2,
    prereqs: ['express-window'],
    effects: [{ kind: 'windowSpeed', perLevel: [0.88, 0.9] }],
    worldChange: 'A card reader appears on the window frame',
    consequence: 'Nobody counts out change with three cars waiting',
    anchor: { x: 23.2, y: 11.0 },
    iconKey: 'ui_upgrade_reader@2x',
    placeholder: '',
  },
  {
    id: 'non-slip-shoes',
    family: 'STAFF',
    stage: 2,
    baseCost: 4,
    maxLevel: 2,
    effects: [{ kind: 'staffSpeed', perLevel: [0.88, 0.92] }],
    worldChange: 'The staff get proper footwear, visible on every uniform',
    consequence: 'Everyone crosses the floor faster, all shift',
    anchor: { x: 12.8, y: 12.2 },
    iconKey: 'ui_upgrade_shoes@2x',
    placeholder: '',
  },
  {
    id: 'training-programme',
    family: 'STAFF',
    stage: 2,
    baseCost: 5.5,
    maxLevel: 2,
    effects: [{ kind: 'staffSkill', perLevel: [0.12, 0.1] }],
    worldChange: 'Training badges appear on the uniforms',
    consequence: 'The same staff do the same jobs better and drop fewer orders',
    anchor: { x: 11.8, y: 12.6 },
    iconKey: 'ui_upgrade_badge@2x',
    placeholder: '',
  },
  {
    id: 'headsets',
    family: 'STAFF',
    stage: 3,
    baseCost: 5,
    maxLevel: 2,
    prereqs: ['non-slip-shoes'],
    effects: [{ kind: 'staffSpeed', perLevel: [0.88, 0.91] }],
    worldChange: 'Headsets appear on the kitchen and counter staff',
    consequence: 'Nobody walks the length of the room to ask a question',
    anchor: { x: 12.4, y: 13.0 },
    iconKey: 'ui_upgrade_headset@2x',
    placeholder: '',
  },
  {
    id: 'staff-room',
    family: 'STAFF',
    stage: 3,
    baseCost: 8,
    maxLevel: 2,
    prereqs: ['training-programme'],
    effects: [{ kind: 'staffSkill', perLevel: [0.08, 0.06] }],
    worldChange: 'A staff room appears behind the kitchen',
    consequence: 'People come back from a break working like they did at open',
    anchor: { x: 9.6, y: 15.4 },
    iconKey: 'ui_upgrade_staffroom@2x',
    placeholder: '',
  },
  {
    id: 'shift-supervisor',
    family: 'STAFF',
    stage: 4,
    baseCost: 24.5,
    maxLevel: 2,
    prereqs: ['staff-room'],
    effects: [
      { kind: 'staffSkill', perLevel: [0.08, 0.06] },
      { kind: 'staffSpeed', perLevel: [0.94, 0.95] },
    ],
    worldChange: 'A supervisor walks the floor in a different uniform',
    consequence: 'The room organises itself instead of waiting to be told',
    anchor: { x: 14.6, y: 12.8 },
    iconKey: 'ui_upgrade_supervisor@2x',
    placeholder: '',
  },
];

/**
 * The validator, exported so it can be given bad input.
 *
 * A schema that is only ever run on data known to be correct proves nothing —
 * it would pass just as happily if every refinement were deleted.
 * `tests/unit/sim/economy/upgradeCost.test.ts` feeds it a duplicate id, a
 * mismatched level count, a prerequisite that does not exist and a cycle, which
 * is the only way to know the guards fire.
 */
export function parseUpgrades(list: unknown): readonly Upgrade[] {
  return upgradesSchema.parse(list);
}

const upgradesSchema = z.array(upgradeSchema).superRefine((list, ctx) => {
  const ids = new Set<string>();
  const byId = new Map<string, z.infer<typeof upgradeSchema>>();

  for (const upgrade of list) {
    if (ids.has(upgrade.id)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate upgrade id "${upgrade.id}"` });
    }
    ids.add(upgrade.id);
    byId.set(upgrade.id, upgrade);

    for (const effect of upgrade.effects) {
      if (effect.perLevel.length !== upgrade.maxLevel) {
        ctx.addIssue({
          code: 'custom',
          message: `${upgrade.id}: ${effect.kind} has ${String(effect.perLevel.length)} levels but maxLevel is ${String(upgrade.maxLevel)}`,
        });
      }
    }
  }

  for (const upgrade of list) {
    for (const prereq of upgrade.prereqs) {
      const target = byId.get(prereq);
      if (target === undefined) {
        ctx.addIssue({ code: 'custom', message: `${upgrade.id} requires "${prereq}", which does not exist` });
        continue;
      }
      /*
       * A prerequisite from a *later* stage is unreachable in a different way
       * from a cycle: the graph is fine, but the player can never satisfy it,
       * because they have already left the stage where the dependent upgrade was
       * offered. It reads to them as an upgrade that is permanently greyed out.
       */
      if (target.stage > upgrade.stage) {
        ctx.addIssue({
          code: 'custom',
          message: `${upgrade.id} (stage ${String(upgrade.stage)}) requires "${prereq}" from stage ${String(target.stage)}`,
        });
      }
    }
  }

  /*
   * **Cycles.** A cycle is not a balance problem — it is a branch of the tree
   * nobody can ever reach, and to the player it is indistinguishable from an
   * upgrade they have not yet earned. Depth-first with a colour per node: grey
   * while its subtree is being walked, black when finished, and an edge back
   * into a grey node is a cycle by definition.
   */
  const state = new Map<string, 'walking' | 'done'>();
  const walk = (id: string, trail: readonly string[]): void => {
    const mark = state.get(id);
    if (mark === 'done') return;
    if (mark === 'walking') {
      ctx.addIssue({ code: 'custom', message: `Prerequisite cycle: ${[...trail, id].join(' → ')}` });
      return;
    }

    state.set(id, 'walking');
    for (const prereq of byId.get(id)?.prereqs ?? []) walk(prereq, [...trail, id]);
    state.set(id, 'done');
  };
  for (const upgrade of list) walk(upgrade.id, []);
});

export const UPGRADES: readonly Upgrade[] = upgradesSchema.parse(UPGRADE_TREE);

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
