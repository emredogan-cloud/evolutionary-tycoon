/**
 * Which production frame draws which thing.
 *
 * Data only, like everything else under `src/config`. The names here are atlas
 * frame keys — the filenames `assets/source` holds and `public/atlas/*.json`
 * indexes — so this file is the one place where "a customer's torso" becomes
 * `char_body_male-01_se@2x.png`, and `tests/unit/config/sprites.test.ts` checks
 * every name in it against the built manifest rather than trusting the strings.
 *
 * `src/config/actors.ts` stays what it was: the *physical* catalogue, footprints
 * and heights that the simulation and the depth sorter work in. This is the
 * *visual* one. They are separate because an entity's world box does not change
 * when its art does, and Phase 4's comment promised exactly this split — "the
 * same entity kind will map to different art per evolution stage".
 */

import { ARCHETYPE_SPECS } from './archetypes';

/** Every image frame carries the authoring scale in its name. */
const SUFFIX = '@2x.png';

/**
 * Compass order, matching `src/render/views/VehicleView.ts` and the pipeline's
 * `DIRECTIONS`. Index 0 is north and the sequence runs clockwise.
 */
export const SPRITE_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type SpriteDirectionName = (typeof SPRITE_DIRECTIONS)[number];

/**
 * The four directions the character art was drawn in.
 *
 * `docs/assets/productionBatches.json` budgets rig parts at four facings, not
 * eight — 96 files at eight would be most of the character budget on angles
 * nobody can tell apart at sixty pixels.
 */
export const RIG_DIRECTIONS = ['ne', 'se', 'sw', 'nw'] as const;
export type RigDirection = (typeof RIG_DIRECTIONS)[number];

/**
 * Eight screen headings onto the four the art has.
 *
 * The four cardinals are equidistant between two diagonals, so each one picks
 * the **viewer-facing** neighbour: a person walking screen-east is drawn facing
 * south-east rather than north-east, because a figure that turns its back to
 * the camera at the halfway point reads as changing its mind. North is the one
 * heading with no viewer-facing option and takes north-east, matching the
 * clockwise order everything else in the project uses.
 */
export const RIG_DIRECTION_FOR: Readonly<Record<SpriteDirectionName, RigDirection>> = {
  n: 'ne',
  ne: 'ne',
  e: 'se',
  se: 'se',
  s: 'se',
  sw: 'sw',
  w: 'sw',
  nw: 'nw',
};

/**
 * The rig parts that are drawn, in the order they stack.
 *
 * **Five, not seven, and that is a finding about the art rather than a design
 * choice.** `docs/assets/productionBatches.json` asks for a doll rig of body,
 * head, hair, two arms and two legs. What was delivered is:
 *
 *  - `char_body_*` — a **complete headless, armless figure**: torso, hips, legs
 *    and boots, from the neck down. Not a torso.
 *  - `char_leg-l` / `char_leg-r` — **a second pair of arms**. Not legs. Compare
 *    `char_leg-l_default_ne@2x.png` against `char_arm-l_default_ne@2x.png`: same
 *    forearm, same hand, same shading.
 *
 * So the figure assembles as body + head + hair + two arms, and the eight `leg`
 * files are redundant. Drawing them as legs is what the first browser capture
 * showed: figures with four arms, two of them hanging off the hips. They are
 * still imported and still validated — they are delivered production assets and
 * pretending otherwise would hide the gap — but nothing draws them, and
 * `docs/ASSET_INTEGRATION_REPORT.md` lists them as art to regenerate.
 *
 * The consequence for animation is that a stride cannot swing a leg, because the
 * legs are painted onto the body. `poseWalk`'s bob and arm counter-swing survive
 * and are what reads at fifty-six pixels anyway.
 */
export const RIG_DRAW_ORDER = ['armBack', 'torso', 'armFront', 'head', 'hair'] as const;
export type RigPartName = (typeof RIG_DRAW_ORDER)[number];

/** Delivered rig files that nothing draws, and why. Asserted by the sprites test. */
export const UNUSED_RIG_SUBJECTS = ['leg-l', 'leg-r'] as const;

/** Which `char_<subject>` each drawn part comes from. */
const RIG_PART_SUBJECT: Readonly<Record<RigPartName, string>> = {
  armBack: 'arm-l',
  torso: 'body',
  armFront: 'arm-r',
  head: 'head',
  hair: 'hair',
};

/**
 * Where each rig part hangs from, in metres above the actor's feet, and which
 * point of its own sprite that is.
 *
 * A limb rotates about its **joint**, not its middle. `DollRig` swings a leg by
 * up to 0.55 rad; pivoting that at the leg's centre swings the hip as far as the
 * foot and the figure shears sideways instead of walking. So arms and legs are
 * drawn from their top edge (`origin` 0) at the shoulder and hip heights, and
 * the parts that do not rotate are placed by their centre.
 *
 * The heights come from `src/render/rig/DollRig.ts`'s REST table, which places
 * the parts on a 1.75 m adult. They are the same numbers `assets:import` sized
 * the art with, which is what makes the pieces meet.
 */
export interface RigPivot {
  /** Lateral offset from the actor's centre line, in metres. */
  readonly x: number;
  /** Height of the pivot above the feet, in metres. */
  readonly y: number;
  /** 0 pivots at the sprite's top edge, 0.5 at its middle. */
  readonly originY: number;
  /**
   * Where across the sprite the joint sits, 0 at the left edge.
   *
   * Not always the middle. The delivered arm is drawn hanging down and to the
   * right with the shoulder ball in its top-left corner, so pivoting it at 0.5
   * hangs it half an arm's width out from the body — which is what the first
   * capture showed as a limb floating beside each customer.
   */
  readonly originX: number;
  /** Mirror the sprite. One arm of art has to serve both sides. */
  readonly flip?: boolean;
}

export const RIG_PIVOTS: Readonly<Record<RigPartName, RigPivot>> = {
  // Both arms are the same drawing; the front one is mirrored, which is what the
  // shoulder ball sitting in the top-left corner of both files forces.
  armBack: { x: -0.14, y: 1.36, originY: 0.08, originX: 0.3 },
  armFront: { x: 0.14, y: 1.36, originY: 0.08, originX: 0.7, flip: true },
  // The body stands on the ground, so it hangs from its own bottom edge.
  torso: { x: 0, y: 0, originY: 1, originX: 0.5 },
  head: { x: 0, y: 1.6, originY: 0.5, originX: 0.5 },
  hair: { x: 0, y: 1.66, originY: 0.5, originX: 0.5 }, // the crown, above the head's middle
};

/** Body and head variants that exist as art, paired so a head suits its body. */
export const BODY_VARIANTS = ['male-01', 'male-02', 'female-01', 'female-02'] as const;
export const HEAD_VARIANTS = ['male-01', 'male-02', 'female-01', 'female-02', 'neutral-01'] as const;
export const HAIR_VARIANTS = ['short-01', 'short-02', 'long-01', 'tied-01'] as const;

/**
 * One person's appearance, as indices into the variant lists.
 *
 * Packed into a single integer on the wire (`ActorSnapshot.variant`) because it
 * crosses the simulation boundary once per actor per frame and a struct there
 * would allocate. Four bodies x five heads x four hairs is 80 combinations,
 * which fits in seven bits with room to spare.
 */
export interface Appearance {
  readonly body: number;
  readonly head: number;
  readonly hair: number;
}

export const APPEARANCE_COUNT = BODY_VARIANTS.length * HEAD_VARIANTS.length * HAIR_VARIANTS.length;

export function packAppearance(appearance: Appearance): number {
  return (appearance.body * HEAD_VARIANTS.length + appearance.head) * HAIR_VARIANTS.length + appearance.hair;
}

export function unpackAppearance(packed: number): Appearance {
  const clamped = ((packed % APPEARANCE_COUNT) + APPEARANCE_COUNT) % APPEARANCE_COUNT;
  const hair = clamped % HAIR_VARIANTS.length;
  const rest = Math.floor(clamped / HAIR_VARIANTS.length);
  return { body: Math.floor(rest / HEAD_VARIANTS.length), head: rest % HEAD_VARIANTS.length, hair };
}

/** The frame for one rig part of one appearance, facing one way. */
export function rigFrame(part: RigPartName, appearance: Appearance, direction: RigDirection): string {
  const subject = RIG_PART_SUBJECT[part];
  const variant =
    part === 'torso'
      ? (BODY_VARIANTS[appearance.body] ?? BODY_VARIANTS[0])
      : part === 'head'
        ? (HEAD_VARIANTS[appearance.head] ?? HEAD_VARIANTS[0])
        : part === 'hair'
          ? (HAIR_VARIANTS[appearance.hair] ?? HAIR_VARIANTS[0])
          : 'default';
  return `char_${subject}_${variant}_${direction}${SUFFIX}`;
}

/** The frame for a vehicle archetype facing one of eight ways. */
export function vehicleFrame(archetype: number, direction: SpriteDirectionName): string {
  const spec = ARCHETYPE_SPECS[archetype] ?? ARCHETYPE_SPECS[0];
  return `${spec?.textureStem ?? 'veh_sedan'}_default_${direction}${SUFFIX}`;
}

/**
 * The world objects a stage layout can place, by the id its `statics` use.
 *
 * The ids were `ph-prop-short` and `ph-prop-tall` with a comment saying what
 * each one was *meant* to be — "the counter itself", "sign post", "tree". Those
 * comments are now the id, and the frame is the art the comment described.
 *
 * `footprint` and `height` are the object's own world box in metres, so the
 * depth sorter anchors a bin at a bin's footprint rather than at a generic
 * prop's. They agree with `docs/assets/subjectDimensions.json`, and
 * `tests/unit/config/sprites.test.ts` asserts that rather than hoping.
 */
export interface WorldObjectSpec {
  readonly id: string;
  /** Atlas frame, or the lower half of a split pair. */
  readonly frame: string;
  /** The upper half of a split object, drawn stacked above `frame`. */
  readonly upperFrame?: string;
  readonly footprintX: number;
  readonly footprintY: number;
  readonly heightMetres: number;
  /**
   * Whether the navigation grid treats this as solid. Defaults to true.
   *
   * An awning is four metres of canopy two metres above the ground: it is drawn
   * over the service area and a pedestrian walks under it. Blocking on the
   * drawn extent rather than on what is actually in the way sealed the counter
   * off entirely the first time the real art was placed.
   */
  readonly blocks?: boolean;
  /**
   * What the object actually puts in a pedestrian's way, when that is smaller
   * than its own box. Defaults to the footprint.
   *
   * CLAUDE.md states the principle for depth — "a tree's sprite middle is in the
   * canopy; what decides whether someone walks in front of it is where its trunk
   * meets the ground" — and it applies twice over to navigation. A mid-size tree
   * is 3 m across at the canopy and about 0.9 m at the trunk and planter; giving
   * the grid the canopy walled off nine square metres of verge per tree, and the
   * economy gate measured it as **Stage 2 slipping from 21.2 to 22.0 minutes**
   * against a 10–22 window.
   */
  readonly blockFootprintX?: number;
  readonly blockFootprintY?: number;
}

export const WORLD_OBJECTS = [
  // --- the stand and the building it becomes -------------------------------
  {
    id: 'counter-lv1',
    frame: `struct_counter_lv1${SUFFIX}`,
    footprintX: 3.0,
    footprintY: 0.8,
    heightMetres: 1.1,
    // The top overhangs its base. What is actually in a customer's way at knee
    // height is the cabinet, and the 0.8 m box is the counter *surface* — which
    // matters because the queue stands 0.8 m from the counter point and half a
    // metre of that was being spent on an overhang nobody walks into.
    blockFootprintY: 0.4,
  },
  {
    id: 'counter-lv2',
    frame: `struct_counter_lv2${SUFFIX}`,
    footprintX: 3.0,
    footprintY: 0.8,
    heightMetres: 1.1,
    // The top overhangs its base. What is actually in a customer's way at knee
    // height is the cabinet, and the 0.8 m box is the counter *surface* — which
    // matters because the queue stands 0.8 m from the counter point and half a
    // metre of that was being spent on an overhang nobody walks into.
    blockFootprintY: 0.4,
  },
  {
    id: 'awning',
    frame: `struct_awning_lv1${SUFFIX}`,
    footprintX: 4.0,
    footprintY: 2.5,
    heightMetres: 0.9,
    blocks: false, // a canopy overhead; people walk under it
  },
  {
    id: 'truck',
    frame: `struct_truck_lv1_lower${SUFFIX}`,
    upperFrame: `struct_truck_lv1_upper${SUFFIX}`,
    footprintX: 6.5,
    footprintY: 2.4,
    heightMetres: 2.9,
  },
  {
    id: 'window',
    frame: `struct_window_default${SUFFIX}`,
    footprintX: 1.2,
    footprintY: 0.2,
    heightMetres: 1.0,
  },
  { id: 'door', frame: `struct_door_default${SUFFIX}`, footprintX: 1.0, footprintY: 0.2, heightMetres: 2.1 },
  {
    id: 'sign',
    // A sign is a post with a board on top; the board is above head height.
    blockFootprintX: 0.4,
    blockFootprintY: 0.4,
    frame: `struct_sign_large_lower${SUFFIX}`,
    upperFrame: `struct_sign_large_upper${SUFFIX}`,
    footprintX: 0.6,
    footprintY: 0.6,
    heightMetres: 3.2,
  },

  // --- the kitchen ---------------------------------------------------------
  {
    id: 'grill-lv1',
    frame: `struct_grill_lv1${SUFFIX}`,
    footprintX: 1.2,
    footprintY: 0.7,
    heightMetres: 1.0,
  },
  {
    id: 'grill-lv2',
    frame: `struct_grill_lv2${SUFFIX}`,
    footprintX: 1.2,
    footprintY: 0.7,
    heightMetres: 1.0,
  },
  { id: 'fryer', frame: `struct_fryer_lv1${SUFFIX}`, footprintX: 0.8, footprintY: 0.7, heightMetres: 1.1 },
  { id: 'drink', frame: `struct_drink_lv1${SUFFIX}`, footprintX: 0.9, footprintY: 0.8, heightMetres: 1.9 },
  { id: 'pass', frame: `struct_pass_default${SUFFIX}`, footprintX: 1.4, footprintY: 0.5, heightMetres: 1.2 },

  // --- the dining room -----------------------------------------------------
  {
    id: 'table-round',
    frame: `prop_table_round_4seat${SUFFIX}`,
    footprintX: 1.2,
    footprintY: 1.2,
    heightMetres: 0.75,
  },
  {
    id: 'table-square',
    frame: `prop_table_square_2seat${SUFFIX}`,
    footprintX: 1.2,
    footprintY: 1.2,
    heightMetres: 0.75,
  },
  {
    id: 'chair-plastic',
    frame: `prop_chair_plastic${SUFFIX}`,
    footprintX: 0.5,
    footprintY: 0.5,
    heightMetres: 0.9,
  },
  {
    id: 'chair-wooden',
    frame: `prop_chair_wooden${SUFFIX}`,
    footprintX: 0.5,
    footprintY: 0.5,
    heightMetres: 0.9,
  },

  // --- the lot -------------------------------------------------------------
  { id: 'bin', frame: `prop_bin_default${SUFFIX}`, footprintX: 0.6, footprintY: 0.6, heightMetres: 1.1 },
  {
    id: 'barrier',
    frame: `prop_barrier_default${SUFFIX}`,
    footprintX: 2.0,
    footprintY: 0.4,
    heightMetres: 1.0,
  },

  // --- what grows out of the ground ---------------------------------------
  {
    id: 'tree-broadleaf-01',
    // The trunk and its planter, not the canopy — see `blockFootprintX`.
    blockFootprintX: 0.9,
    blockFootprintY: 0.9,
    frame: `nature_tree_broadleaf-01_lower${SUFFIX}`,
    upperFrame: `nature_tree_broadleaf-01_upper${SUFFIX}`,
    footprintX: 3.0,
    footprintY: 3.0,
    heightMetres: 5.0,
  },
  {
    id: 'tree-broadleaf-02',
    // The trunk and its planter, not the canopy — see `blockFootprintX`.
    blockFootprintX: 0.9,
    blockFootprintY: 0.9,
    frame: `nature_tree_broadleaf-02_lower${SUFFIX}`,
    upperFrame: `nature_tree_broadleaf-02_upper${SUFFIX}`,
    footprintX: 3.0,
    footprintY: 3.0,
    heightMetres: 5.0,
  },
  {
    id: 'tree-conifer-01',
    // The trunk and its planter, not the canopy — see `blockFootprintX`.
    blockFootprintX: 0.9,
    blockFootprintY: 0.9,
    frame: `nature_tree_conifer-01_lower${SUFFIX}`,
    upperFrame: `nature_tree_conifer-01_upper${SUFFIX}`,
    footprintX: 3.0,
    footprintY: 3.0,
    heightMetres: 5.0,
  },
  {
    id: 'bush-round-01',
    frame: `nature_bush_round-01${SUFFIX}`,
    footprintX: 1.2,
    footprintY: 1.2,
    heightMetres: 0.9,
  },
  {
    id: 'bush-round-02',
    frame: `nature_bush_round-02${SUFFIX}`,
    footprintX: 1.2,
    footprintY: 1.2,
    heightMetres: 0.9,
  },
  {
    id: 'bush-flowering-01',
    frame: `nature_bush_flowering-01${SUFFIX}`,
    footprintX: 1.2,
    footprintY: 1.2,
    heightMetres: 0.9,
  },
  {
    id: 'lamp',
    blockFootprintX: 0.3,
    blockFootprintY: 0.3,
    frame: `nature_pole_lamp_lower${SUFFIX}`,
    upperFrame: `nature_pole_lamp_upper${SUFFIX}`,
    footprintX: 0.3,
    footprintY: 0.3,
    heightMetres: 4.5,
  },
] as const satisfies readonly WorldObjectSpec[];

export function worldObject(id: string): WorldObjectSpec | undefined {
  return WORLD_OBJECTS.find((entry) => entry.id === id);
}

/**
 * By index, widened to the interface.
 *
 * `as const` gives every entry its own literal type, which is what makes the id
 * union above possible and what makes `.upperFrame` unreachable on the entries
 * that do not have one. Widening here is the narrow place to do it.
 */
export function worldObjectAt(index: number): WorldObjectSpec | undefined {
  return (WORLD_OBJECTS as readonly WorldObjectSpec[])[index];
}

export function worldObjectIndexOf(id: string): number {
  return WORLD_OBJECTS.findIndex((entry) => entry.id === id);
}

/**
 * Menu item id to the food icon that truthfully stands for it.
 *
 * Six icons exist for thirteen menu items — `productionBatches.json` planned the
 * icon set before Phase 13 grew the menu — so this maps only where the icon
 * *is* the item at bubble size: both burgers read as the burger, both cold
 * drinks as the cup, chips as fries. The five unmapped items (breakfast set,
 * chicken meal, dessert, salad, family meal) keep their text bubbles, because a
 * wrong icon is a placeholder wearing a costume; the missing five are recorded
 * as an art gap in the integration report. The wrap icon ships unmapped for the
 * same reason from the other side — no menu item is a wrap.
 */
export const FOOD_ICONS: Readonly<Record<string, string>> = {
  lemonade: `food_soda_default${SUFFIX}`,
  cola: `food_soda_default${SUFFIX}`,
  chips: `food_fries_default${SUFFIX}`,
  fries: `food_fries_default${SUFFIX}`,
  hotdog: `food_hotdog_default${SUFFIX}`,
  hamburger: `food_burger_default${SUFFIX}`,
  'premium-burger': `food_burger_default${SUFFIX}`,
  coffee: `food_coffee_default${SUFFIX}`,
};

export const FOOD_ICON_FALLBACK = `food_burger_default${SUFFIX}`;

/** Particle frames, by what they are used for. */
export const FX_FRAMES = {
  steam: `fx_steam_soft${SUFFIX}`,
  smoke: `fx_smoke_soft${SUFFIX}`,
  dust: `fx_dust_soft${SUFFIX}`,
  sparkle: `fx_sparkle_soft${SUFFIX}`,
} as const;

/** The baked lot surface, one slice per stage where a stage has its own. */
export const GROUND_FRAMES: Readonly<Record<number, string>> = {
  1: `ground_stage1_tile-a${SUFFIX}`,
  2: `ground_stage1_tile-a${SUFFIX}`,
  3: `ground_stage1_tile-a${SUFFIX}`,
  4: `ground_stage1_tile-a${SUFFIX}`,
};

/**
 * The tint an employee's torso is drawn with.
 *
 * The character batch has no uniform variant — `productionBatches.json` budgets
 * four bodies and no staff set — so the only thing separating an employee from a
 * customer in the delivered art is nothing at all. A tint on the torso is the
 * cheapest honest answer: it reads as a work shirt at sixty pixels, costs no
 * files, and is removed the day a uniform is drawn. `amber-500` from the locked
 * palette, which is the ramp reserved for the player's own business.
 */
export const EMPLOYEE_TINT = 0xe0932f;
