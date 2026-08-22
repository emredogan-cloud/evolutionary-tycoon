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
