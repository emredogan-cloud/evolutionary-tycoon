/**
 * The 2026-08-21 audit's prompt entries — generated, like every other card.
 *
 * `docs/assets/assetRequirements.json` is the machine matrix the audit
 * produced: every MISSING and NEEDS-REGEN row carries a prompt id (P173+),
 * and this module turns those rows into `PromptedAsset` entries so the
 * catalog page keeps its single renderer. Hand-appending cards to the HTML
 * was the first draft and it broke the page's own render-match test — which
 * is exactly what that test is for.
 *
 * Every prompt embeds the hash-locked immutable block verbatim; only the
 * SUBJECT / SIZE HINT / NOTE / DO-NOT lines vary, the same contract the
 * delivered 172 follow.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readPromptBlock } from './promptBlock.ts';
import { PATHS } from './paths.ts';
import type { PromptedAsset } from './prompts.ts';

export interface RequirementRow {
  readonly id: string;
  readonly category: string;
  readonly subject: string;
  readonly stage: string;
  readonly role: string;
  readonly consumer: string;
  readonly status: string;
  readonly prompt: string | null;
  readonly priority: string;
  readonly requiredBefore: string | null;
  readonly note: string;
}

export interface AuditPrompt extends PromptedAsset {
  readonly audit: {
    readonly status: string;
    readonly role: string;
    readonly priority: string;
    readonly stage: string;
    readonly before: string | null;
  };
}

const ARCH_SUBJECT: Readonly<Record<string, string>> = {
  sedan: 'the delivered veh_sedan vehicle — SAME body, paint and wheel design as the existing set',
  pickup: 'the delivered veh_pickup vehicle — SAME body, paint and wheel design as the existing set',
  van: 'the delivered veh_van vehicle — SAME body, paint and wheel design as the existing set',
  motorcycle: 'the delivered veh_motorcycle vehicle — SAME body, paint and wheel design as the existing set',
  sports: 'low-slung two-seat sports car, muted neutral paint (runtime tint)',
  truck: 'box-body long-haul delivery truck, muted neutral paint',
  bus: 'single-deck tour bus, muted neutral paint',
  ev: 'modern compact electric hatchback, muted neutral paint',
  limo: 'stretched black VIP limousine',
  emergency: 'ambulance with roof light bar, white body',
};

const ARCH_LENGTH_METRES: Readonly<Record<string, number>> = {
  sedan: 4.5,
  pickup: 5.2,
  van: 5.0,
  motorcycle: 2.2,
  sports: 4.4,
  truck: 9.0,
  bus: 12.0,
  ev: 4.2,
  limo: 6.5,
  emergency: 5.8,
};

const DIRECTION_TEXT: Readonly<Record<string, string>> = {
  s: 'facing south (front view, toward camera-left-down)',
  se: 'facing south-east',
  e: 'facing east (profile)',
  ne: 'facing north-east (rear three-quarter)',
  n: 'facing north (rear elevation, tail lights toward camera)',
  nw: 'facing north-west (rear three-quarter)',
  sw: 'facing south-west',
  w: 'facing west (profile)',
};

const OFF_FAMILY_ICONS = new Set([
  'ui_icon_angry',
  'ui_icon_hire',
  'ui_icon_neutral',
  'ui_icon_pause',
  'ui_icon_speed-2',
  'ui_icon_speed-4',
  'ui_icon_star',
]);

/**
 * Icons the delivery drew as a *scene* where the brief asked for a glyph.
 *
 * A different failure from `OFF_FAMILY_ICONS`, which is about colour. These
 * three are each a ~120 px composition of four to six objects — a toque over a
 * chopping board and a pan; a cloche, clipboard, waistcoat and napkin; a mop,
 * trolley and wet-floor sign — and their own prompt asked for "single-glyph,
 * instantly readable at 20 px".
 *
 * Measured by cropping the frames out of `ui.webp` and rendering them at the
 * 38 px the staff panel draws: only the cook survives, on the toque's
 * silhouette. The other two collapse into a grey-white blob and a
 * blue-yellow blob. The panel currently distinguishes them with a role-tinted
 * tile, which is a workaround for this, not a substitute.
 */
const UNREADABLE_AT_SIZE_ICONS = new Set([
  'ui_icon_role-cook',
  'ui_icon_role-waiter',
  'ui_icon_role-cleaner',
]);

/** The one object of each of those icons, once the scene is stripped away. */
const ROLE_GLYPH: Readonly<Record<string, string>> = {
  'ui_icon_role-cook': "a chef's toque, alone",
  'ui_icon_role-waiter': 'a serving tray held flat, alone',
  'ui_icon_role-cleaner': 'a mop head, alone',
};

/**
 * A split pair the delivery painted as two independent pictures.
 *
 * `_lower` is a complete small tree, crown and all, and `_upper` is a second,
 * larger loose canopy — proven by cropping both out of `nature.webp` and
 * stacking them at their own anchors, which produces a tree wearing a second
 * canopy. `sprites.ts` draws the lower alone until this pair lands.
 *
 * The two sibling pairs (`broadleaf-02`, `conifer-01`) were reconstructed the
 * same way and read as correct — **by eye, on the whole sprite, and that was
 * the wrong instrument.** The 2026-08-23 pass measured the *join row* instead
 * and found broadleaf-02 at 0.40 coverage (four branch ends with nothing above
 * them) and the stage-2 food truck at 0.00 (each half is a complete truck).
 * So it is not one bad pair; it is a delivery that painted halves separately,
 * and `tests/unit/config/splitComposition.test.ts` is the instrument that says
 * so per pair rather than per impression.
 */
const MISMATCHED_SPLIT = new Set([
  'nature_tree_broadleaf-01_lower',
  'nature_tree_broadleaf-01_upper',
  'nature_tree_broadleaf-02_lower',
  'nature_tree_broadleaf-02_upper',
]);

/** The join-row measurement behind each regenerated split pair. */
const SPLIT_EVIDENCE: Readonly<Record<string, string>> = {
  'nature_tree_broadleaf-01':
    'The delivered pair were never halves of one painting — verified by cropping both out of nature.webp and stacking them at their own anchors, which produces a tree wearing a second canopy. Join-row coverage 0.00.',
  'nature_tree_broadleaf-02':
    'Join-row coverage 0.40: the lower half’s top row carries five opaque runs — the trunk and four branch ends — and the upper half’s bottom row carries one. Three fifths of that row is branches cut off in mid-air. The runtime sinks the crown 1.25 m to hide the stumps meanwhile, which shortens the tree.',
  struct_truck_lv1:
    'Join-row coverage 0.00, and the reason is not a misaligned cut: each delivered half is a COMPLETE food truck. Confirmed in Chromium at ?stage=2, where the venue rendered as two trucks stacked in mid-air. The runtime draws the lower half alone meanwhile.',
};

/** The stage-2 food truck, whose halves are two whole trucks rather than two halves. */
const MISMATCHED_TRUCK = new Set(['struct_truck_lv1_lower', 'struct_truck_lv1_upper']);

/**
 * Which prompt each half must be cut against.
 *
 * Written out rather than derived, because the numbering is positional and the
 * pairs were filed in three different passes — a partner computed from "the id
 * next door" would be right today and wrong the moment anything is appended.
 */
const PARTNER_PROMPT: Readonly<Record<string, string>> = {
  'nature_tree_broadleaf-01_lower': 'P310',
  'nature_tree_broadleaf-01_upper': 'P309',
  'nature_tree_broadleaf-02_lower': 'P312',
  'nature_tree_broadleaf-02_upper': 'P311',
  struct_truck_lv1_lower: 'P314',
  struct_truck_lv1_upper: 'P313',
};

const FOOD_SUBJECT: Readonly<Record<string, string>> = {
  breakfast: 'breakfast set — plate with eggs, toast and a small coffee',
  chicken: 'fried chicken meal — drumsticks in a small basket',
  dessert: 'dessert slice on a small plate',
  salad: 'fresh salad bowl',
  family: 'family meal bundle — large shared box with fries',
};

const ILLUSTRATION_SUBJECT: Readonly<Record<string, string>> = {
  ui_illust_offline:
    'small warm illustration of the stand at dusk with a closed sign — the away-report header',
  ui_illust_empty: 'empty shelf / open notebook illustration for empty states',
  ui_illust_error: 'unplugged cable illustration for recoverable errors',
};

const GROUND_SURFACE: Readonly<Record<string, string>> = {
  '2': 'compacted gravel with tyre ruts and oil spots',
  '3': 'worn asphalt with faded bay markings',
  '4': 'fresh asphalt with crisp bay markings and a painted drive-thru guide line',
};

const FX_SUBJECT: Readonly<Record<string, string>> = {
  fire: 'single soft fire lick — warm orange-yellow core, soft edges, no smoke',
  coin: 'single small gold coin, slight tilt, soft rim light',
};

/**
 * The restaurant evolution system's level art — `LEVEL_ASSET_EVOLUTION_LIBRARY`.
 *
 * Every property level whose classification is **EXTERNAL PROMPT REQUIRED**
 * appears here, and nowhere else: the library document is generated from the
 * same rows, so the copy-ready text a person pastes into a generator and the
 * text this catalog prints are one string, not two that drift.
 *
 * All six are **frame swaps into an existing world box**. That is deliberate:
 * a level that changed an object's footprint would move its anchor, its
 * navigation blocker and every depth comparison it takes part in, so the level
 * would be a layout change wearing a sprite's clothes. Same box, new picture,
 * and the game's geometry never learns about it.
 */
const LEVEL_ART: Readonly<
  Record<
    string,
    {
      readonly subject: string;
      readonly size: string;
      readonly notes: readonly string[];
      readonly doNots: readonly string[];
    }
  >
> = {
  struct_counter_lv3: {
    subject:
      'the STAGE-4 restaurant frontage that struct_counter_lv2 grows into — same 3.0 x 0.8 m counter block and the same serving face, now a finished building front: rendered wall panel above the counter, a proper fascia band, a wide glazed section to one side and a tiled sill course, reading as a permanent premises rather than a converted stall',
    size: 'exactly the struct_counter_lv2 canvas at 2x (243 x 192 px), same anchor',
    notes: [
      'Stage 4 is the same plot, the same camera and the same counter point as Stage 3 — the player must recognise the place they built. This is the Stage-3 diner having its frontage finished, not a new restaurant.',
      'The counter surface must stay at the same height and the same y as struct_counter_lv2: the queue stands 0.8 m from the counter point and the serve animation targets that surface.',
    ],
    doNots: [
      'DO NOT widen the footprint — the block is 3.0 x 0.8 m at every stage and the drive-thru is a separate asset',
      'DO NOT render legible signage text; the sign is its own object',
    ],
  },
  struct_grill_lv3: {
    subject:
      'the THIRD kitchen bench in the struct_grill_lv1 / struct_grill_lv2 family — same 1.2 x 0.7 m box and the same stainless language, now clearly the top of the line: a double burner section, a raised salamander shelf over the back edge, and a small utensil rail',
    size: 'exactly the struct_grill_lv2 canvas at 2x, same anchor',
    notes: [
      'The three benches are read side by side in the kitchen, so the progression must be legible at a glance: lv1 plain, lv2 with the extended top, lv3 with the shelf above it.',
      'Silhouette carries the difference — the shelf is what a player sees from the isometric camera.',
    ],
    doNots: ['DO NOT add food, flames or steam — the renderer emits those as FX'],
  },
  struct_counter_wide_lv1: {
    subject:
      'the WIDENED service counter the bigger-counter rung installs — the struct_counter_lv1 cabinet extended along its long axis with a second serving position: two till stations on the surface, a longer sneeze-guard rail, one continuous cabinet front',
    size: 'exactly the struct_counter_lv1 canvas at 2x, same anchor',
    notes: [
      'Drawn at the same counter point as struct_counter_lv1; the extra width is what tells the player their queue got shorter.',
      'The overhang stays over the same 0.4 m blocked band — customers walk under the lip, and moving it changes where the queue can stand.',
    ],
    doNots: ['DO NOT draw staff or customers; DO NOT bake a ground shadow'],
  },
  struct_forecourt_lv1: {
    subject:
      'front-of-house dressing for a tidied forecourt: a low planter run, two rope-and-post stanchions and a small paved apron, as ONE cluster on transparent ground, arranged along the isometric x axis so it reads as an edge rather than a blob',
    size: '320 x 200 px at 2x, footprint 3.0 x 1.0 m',
    notes: [
      'Sits in front of the counter where the queue forms; it must not read as an obstacle in the walking lane, because it is not one — nothing blocks here.',
      'Joins struct_barrier and struct_planter in language: same stone, same rope, same value range.',
    ],
    doNots: ['DO NOT enclose the space — an open front is what makes it a forecourt and not a fence'],
  },
  struct_sign_large_lit_upper: {
    subject:
      'the UPPER HALF ONLY of the delivered struct_sign_large signboard, now ILLUMINATED: same board, same posts, same twin lamps, with the lamps LIT — warm pool of light across the board face, the painted menu illustration clearly visible inside it, and a soft glow falloff at the board edges',
    size: 'same canvas as struct_sign_large_upper at 2x',
    notes: [
      'Anchor, proportions and palette identical to struct_sign_large_upper and to struct_sign_large_painted_upper (P307) — the runtime swaps the frame as the sign rung is bought, and the three must line up to the pixel.',
      'This is the painted board with its lamps on. Draw the painted board first, then light it.',
      'The lower half is unchanged and is NOT regenerated; only the board above the cut is lit.',
    ],
    doNots: [
      'DO NOT render legible text — squiggles that read as writing, never actual letters',
      'DO NOT let the glow cross the bottom edge of the canvas; the join row must stay identical to the unlit upper half',
    ],
  },
  struct_frontage_lights: {
    subject:
      'a run of warm festoon lights for the building frontage — a gentle catenary of small bulbs on a dark cable, lit, with a short bracket at each end, on transparent ground',
    size: '384 x 96 px at 2x, footprint 3.0 x 0.2 m',
    notes: [
      'Drawn across the front of the building at Stage-4 frontage level; the cable sags below the fascia and the bulbs are the only light source in the sprite.',
      'Must read at dusk and at noon — the bulbs carry a lit core plus a small warm halo rather than a full-sprite bloom.',
    ],
    doNots: [
      'DO NOT bake the wall behind it — this composites over whatever building it hangs on',
      'DO NOT animate; the renderer handles any flicker',
    ],
  },
};

interface Rendered {
  readonly subject: string;
  readonly sizeHint: string;
  readonly notes: readonly string[];
  readonly doNots: readonly string[];
  readonly batch: string;
  readonly subjectKey: string;
}

function renderRow(row: RequirementRow): Rendered {
  const id = row.id;
  const level = LEVEL_ART[id];
  if (level !== undefined) {
    return {
      subject: level.subject,
      sizeHint: level.size,
      notes: level.notes,
      doNots: level.doNots,
      batch: 'restaurant-evolution',
      subjectKey: `property/${row.subject}`,
    };
  }
  if (row.category === 'VEHICLES') {
    const [, arch, variant, direction] = id.split('_');
    const archKey = arch ?? '';
    const base = ARCH_SUBJECT[archKey] ?? archKey;
    const facing = DIRECTION_TEXT[direction ?? ''] ?? direction ?? '';
    const braking = variant === 'brake';
    const subject = `${base}, ${facing}, wheels visible, no driver${braking ? ', BRAKE LIGHTS LIT — bright red tail lamps, subtle red glow on the body only' : ''}`;
    const lengthMetres = ARCH_LENGTH_METRES[archKey] ?? 4.5;
    const original =
      archKey === 'sedan' || archKey === 'pickup' || archKey === 'van' || archKey === 'motorcycle';
    return {
      subject,
      sizeHint: `~${String(Math.round(lengthMetres * 91))} px long at 2x; height follows the vehicle`,
      notes: [
        `World length ${String(lengthMetres)} m; the pipeline derives sprite px from the world box.`,
        'sw/w/nw views are produced by mirroring — do NOT draw them.',
      ],
      doNots: [
        ...(braking
          ? ['DO NOT change anything except the lit tail lamps versus the matching default view']
          : []),
        'DO NOT bake a ground shadow, licence plate text, or driver',
      ],
      batch: original ? 'audit-vehicle-gaps' : 'audit-new-archetypes',
      subjectKey: `veh/${archKey}`,
    };
  }
  if (id.startsWith('char_leg')) {
    const side = id.includes('leg-l') ? 'left' : 'right';
    const direction = id.slice(id.lastIndexOf('_') + 1);
    return {
      subject: `adult ${side} leg for the doll rig, standing straight, plain dark trouser and simple shoe, ${DIRECTION_TEXT[direction] ?? direction}, hip pivot at the top edge, drawn to assemble under the existing char_body set`,
      sizeHint: 'no taller than 66 px at 2x — the leg segment of a 144 px assembled adult',
      notes: [
        "Replaces a leg painted into the body art; must match the delivered bodies' proportions and palette ramps exactly.",
      ],
      doNots: ['DO NOT include hips or torso — the body part owns them'],
      batch: 'audit-rig-legs',
      subjectKey: 'char/leg',
    };
  }
  if (row.category === 'FOOD') {
    const item = id.split('_')[1] ?? '';
    return {
      subject: `${FOOD_SUBJECT[item] ?? item}, single icon-style food illustration on the game's plate/tray language`,
      sizeHint: '96 x 96 px at 2x, generous transparent margin',
      notes: [
        "Joins the existing food_* icon set — match food_burger_default's scale, angle and rim shading.",
      ],
      doNots: ['DO NOT add steam, text or a background plate shadow'],
      batch: 'audit-food-icons',
      subjectKey: 'food/icon',
    };
  }
  if (row.category === 'UPGRADE_VISUALS') {
    const thing = id.replace('struct_', '').replace(/_/g, ' ');
    return {
      subject: `upgrade card icon — ${thing}, single readable object, slight isometric tilt matching the ui icon set`,
      sizeHint: '64 x 64 px at 2x, transparent margin',
      notes: ['Lives in the ui atlas next to ui_icon_*; follow their stroke weight and calm palette family.'],
      doNots: [
        'DO NOT use saturated primary colours — the seven off-family icons are being regenerated for exactly that',
      ],
      batch: 'audit-upgrade-icons',
      subjectKey: 'ui/upgrade-icon',
    };
  }
  if (id.startsWith('road_strip')) {
    return {
      subject:
        'straight two-lane rural carriageway STRIP for seamless end-to-end tiling: dark asphalt with subtle tone variation, solid amber edge lines both sides, dashed white centre line, light-grey kerbstones and a grass verge along BOTH long edges — and the two SHORT ends cut clean through the asphalt mid-surface so copies butt together invisibly',
      sizeHint: '2048 x 1024 px, the road/ground slice format, carriageway along the isometric diagonal',
      notes: [
        'Unlike road_segment_tile-a this is NOT a diorama: no end caps, no wrapped verge at the short ends, no dirt cliff sides — the left and right edges must be exact continuations of each other.',
        'The painted carriageway spans 7 m of the 16 m diamond, centred, matching the procedural band it replaces (WorldScene.drawRoad).',
      ],
      doNots: [
        'DO NOT wrap grass, kerb or dirt around the short ends — that is the seam staircase this asset exists to remove',
        'DO NOT draw vehicles, drains at the edges, or a painted junction',
      ],
      batch: 'ui-world-correction',
      subjectKey: 'ground/bake',
    };
  }
  if (id.startsWith('ground_stage1_tile-') && !id.endsWith('tile-a')) {
    return {
      subject:
        'sun-dried dirt lot VARIATION slice — same earth ramps, pebble scatter, sparse dry tufts and tyre-track language as ground_stage1_tile-a, different composition, so the two interleave without a visible repeat',
      sizeHint: '2048 x 1024 px, the road/ground slice format',
      notes: [
        'Must tile seamlessly against ground_stage1_tile-a on every edge (the runtime mixes slices per cell); keep edge pixels statistically identical to tile-a edges.',
        'No landmark features — a distinctive rock cluster becomes a repeat the eye finds instantly.',
      ],
      doNots: ['DO NOT change the palette ramps or overall value versus tile-a'],
      batch: 'ui-world-correction',
      subjectKey: 'ground/bake',
    };
  }
  if (id === 'struct_sign_large_painted_upper') {
    return {
      subject:
        'the delivered struct_sign_large_upper signboard, now HAND-PAINTED: same board, posts and twin lamps, with a warm painted menu illustration (lemonade cup and a price squiggle) filling the board — visibly amateur brushwork, charming not polished',
      sizeHint: 'same canvas as struct_sign_large_upper at 2x',
      notes: [
        'Anchor, proportions and palette identical to struct_sign_large_upper — the runtime swaps the frame when the hand-painted-sign rung is owned.',
      ],
      doNots: ['DO NOT render legible text — squiggles that read as writing, never actual letters'],
      batch: 'ui-world-correction',
      subjectKey: 'struct/sign',
    };
  }
  if (id === 'struct_scaffold_site') {
    return {
      subject:
        'small building-site dressing: two timber scaffold frames with a plank across, a paper plan pinned to one post, a small cement sack — one coherent cluster on a transparent ground, open in the middle so the growing object reads through it',
      sizeHint: '256 x 200 px at 2x, footprint 2 x 2 m',
      notes: [
        'Drawn over the construction silhouette the renderer already shows; must not hide the centre of the site.',
      ],
      doNots: ['DO NOT include characters or vehicles; DO NOT bake a ground shadow'],
      batch: 'ui-world-correction',
      subjectKey: 'struct/scaffold',
    };
  }
  if (row.category === 'GROUND') {
    const stage = id.replace('ground_stage', '').split('_')[0] ?? '';
    return {
      subject: `stage-${stage} lot surface bake — ${GROUND_SURFACE[stage] ?? ''}, one 16 m isometric ground slice matching ground_stage1_tile-a's format and horizon`,
      sizeHint: '2048 x 1024 px, the road/ground slice format',
      notes: [
        'Same diamond footprint, edge falloff and palette earth ramps as the delivered stage-1 slice; stages must read as eras of one place.',
      ],
      doNots: ['DO NOT draw props, vehicles or buildings into the surface'],
      batch: 'audit-ground-bakes',
      subjectKey: 'ground/bake',
    };
  }
  if (row.category === 'VFX_TEXTURES') {
    const kind = id.split('_')[1] ?? '';
    return {
      subject: FX_SUBJECT[kind] ?? kind,
      sizeHint: '64 x 64 px at 2x, transparent',
      notes: [
        'Joins fx_steam/smoke/dust/sparkle: soft-alpha single element, tinted and multiplied at runtime.',
      ],
      doNots: ['DO NOT add motion blur or multiple elements — the emitter composes them'],
      batch: 'audit-fx',
      subjectKey: 'fx/particle',
    };
  }
  if (MISMATCHED_SPLIT.has(id) || MISMATCHED_TRUCK.has(id)) {
    const half = id.endsWith('_lower') ? 'LOWER' : 'UPPER';
    const group = id.replace(/_(lower|upper)$/, '');
    const truck = MISMATCHED_TRUCK.has(id);
    const partner = PARTNER_PROMPT[id] ?? '';
    const body = truck
      ? half === 'LOWER'
        ? 'chassis, wheels, cab lower, the serving hatch counter and the ground contact, with NOTHING of the roof above the cut'
        : 'roof, awning, signage board, solar panel and speaker, with the body cross-section visible at the bottom edge'
      : half === 'LOWER'
        ? 'trunk, root flare, the stone kerb bed around it and the first branch stubs, with NO crown above the cut'
        : 'the crown and the branches that carry it, with the trunk cross-section visible at the bottom edge';
    const subject = truck
      ? `REGENERATION — the ${half} HALF ONLY of the stage-2 food truck: ${body}, cut cleanly at a single horizontal scanline`
      : `REGENERATION — the ${half} HALF ONLY of one broadleaf tree: ${body}, cut cleanly at a single horizontal scanline`;
    return {
      subject,
      sizeHint: 'same footprint as the delivered file it replaces',
      notes: [
        SPLIT_EVIDENCE[group] ?? 'The delivered pair are not halves of one painting.',
        `Generate the WHOLE ${truck ? 'truck' : 'tree'} first, then cut it into this file and its partner (${partner}). Do not paint the two halves separately.`,
        'This half must look unfinished on its own. That is correct; it is never shown without its partner.',
        'The renderer puts the upper half’s bottom-centre on the lower half’s top edge with one pixel of overlap, so anything that does not line up shows as a seam.',
      ],
      doNots: [
        'CRITICAL: the cut must be at the same y in both halves, and every shape crossing it — trunk, branch, body panel — must match in width, position and colour to the pixel. tests/unit/config/splitComposition.test.ts measures exactly that row and fails below 90%',
      ],
      batch: truck ? 'stage1-ui-final-correction' : 'audit-stage1-continuation',
      subjectKey: truck ? 'struct/truck' : 'nature/tree',
    };
  }
  if (row.category === 'UI_ICONS' && UNREADABLE_AT_SIZE_ICONS.has(id)) {
    const what = id.replace('ui_icon_role-', '');
    return {
      subject: `REGENERATION of ${id} — ONE object only: ${ROLE_GLYPH[id] ?? what}. No scene, no props around it, no second object of any kind`,
      sizeHint: '64 x 64 px at 2x',
      notes: [
        `The delivered file does not meet its own brief. It is a ~120 px scene of four to six objects; cropped from ui.webp and rendered at the 38 px the staff panel draws, the ${what} icon collapses into an unreadable blob.`,
        'ONE object. This icon is drawn at 38 px in a 48 px tile beside a name, not at 120 px in a panel.',
        'The silhouette alone must identify the role. Test it by filling the shape solid black.',
      ],
      doNots: ['DO NOT rely on colour alone to carry meaning — shape first (a11y contract)'],
      batch: 'audit-stage1-continuation',
      subjectKey: 'ui/icon',
    };
  }
  if (row.category === 'UI_ICONS' && OFF_FAMILY_ICONS.has(id)) {
    return {
      subject: `REGENERATION of ${id} — same glyph and meaning as the existing icon, redrawn INSIDE the locked 48-colour family (its current version measurably leaves the palette)`,
      sizeHint: '64 x 64 px at 2x',
      notes: ['ACCEPTED_EXCEPTIONS lists the measured palette-affinity miss; this redraw closes the waiver.'],
      doNots: ['DO NOT change the glyph shape — only bring the colours into the family'],
      batch: 'audit-ui-regen',
      subjectKey: 'ui/icon',
    };
  }
  if (row.category === 'UI_ICONS') {
    const what = id.replace('ui_icon_', '').replace(/-/g, ' ');
    return {
      subject: `UI strip icon — ${what}, single-glyph, instantly readable at 20 px`,
      sizeHint: '64 x 64 px at 2x',
      notes: ['Matches the delivered ui_icon_* set: stroke weight, corner softness, calm family colours.'],
      doNots: ['DO NOT rely on colour alone to carry meaning — shape first (a11y contract)'],
      batch: 'audit-ui-new',
      subjectKey: 'ui/icon',
    };
  }
  return {
    subject: ILLUSTRATION_SUBJECT[id] ?? row.subject,
    sizeHint: '480 x 240 px at 2x',
    notes: ["Illustration language: the world's own art style at UI scale, calm, no characters mid-action."],
    doNots: ['DO NOT include any text — copy is set by the UI layer'],
    batch: 'audit-ui-illustrations',
    subjectKey: 'ui/illustration',
  };
}

/** All audit prompt entries, ordered exactly as the matrix numbered them. */
export function auditPrompts(requirementsPath?: string): AuditPrompt[] {
  const path = requirementsPath ?? resolve(PATHS.promptBlock, '..', 'assetRequirements.json');
  const rows = JSON.parse(readFileSync(path, 'utf8')) as RequirementRow[];
  const block = readPromptBlock().text;

  return rows
    .filter((row) => row.prompt !== null && /^P\d+$/.test(row.prompt) && Number(row.prompt.slice(1)) >= 173)
    .sort((a, b) => Number((a.prompt ?? 'P0').slice(1)) - Number((b.prompt ?? 'P0').slice(1)))
    .map((row) => {
      const rendered = renderRow(row);
      const prompt = [
        block,
        '',
        '[REFERENCE IMAGES: the delivered set this asset joins]',
        '---',
        `[SUBJECT: ${rendered.subject}]`,
        `[SIZE HINT: ${rendered.sizeHint}]`,
        ...rendered.notes.map((note) => `[NOTE: ${note}]`),
        ...rendered.doNots.map((line) => `[${line}]`),
      ].join('\n');
      return {
        file: `${row.id}@2x.png`,
        subjectKey: rendered.subjectKey,
        batch: rendered.batch,
        describe: rendered.subject,
        prompt,
        size: null,
        split: false,
        audit: {
          status: row.status,
          role: row.role,
          priority: row.priority,
          stage: row.stage,
          before: row.requiredBefore,
        },
      };
    });
}

/** Files whose original prompt a corrected audit prompt supersedes. */
export function supersededFiles(requirementsPath?: string): ReadonlySet<string> {
  return new Set(auditPrompts(requirementsPath).map((entry) => entry.file));
}
