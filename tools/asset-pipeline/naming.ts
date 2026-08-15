import { ASSET_CATEGORIES, PRODUCTION_SCALE } from '../../src/config/assets.ts';
import type { CategorySpec } from '../../src/config/assets.ts';

/**
 * The filename contract of ASSET_PIPELINE §3, as a parser.
 *
 *   <category>_<subject>_<variant>[_<direction>][_<state>]@<scale>x.<ext>
 *
 *   char_body_male-01_se@2x.png
 *   veh_sedan_red_ne_brake@2x.png
 *   struct_sign_large_lower@2x.png
 *   ui_icon_cash@2x.png
 *   sfx_car_brake_01.ogg              <- audio carries no scale suffix
 *
 * A filename is not decoration here. The atlas frame key, the loader's lookup,
 * the manifest row and the rig's part lookup are all this string, so a name that
 * parses ambiguously becomes a missing sprite three phases later. Parsing it
 * once, strictly, in one place is the cheapest way to make that impossible.
 */

/** ASSET_PIPELINE §3. Mirrored variants do not exist as files. */
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Lowercase alphanumeric words joined by `-`. §3: no uppercase, no Turkish characters. */
const TOKEN = '[a-z0-9]+(?:-[a-z0-9]+)*';

/**
 * The parts of a long object, ASSET_PIPELINE §1.4. These are states, not
 * variants, and the validator pairs them by everything else in the name.
 */
export const SPLIT_PARTS = ['lower', 'upper'] as const;
export type SplitPart = (typeof SPLIT_PARTS)[number];

export const IMAGE_NAME_PATTERN = new RegExp(
  `^(${TOKEN})_(${TOKEN})_(${TOKEN})(?:_(${TOKEN}))?(?:_(${TOKEN}))?@(\\d+)x\\.(png|webp)$`,
);

export const AUDIO_NAME_PATTERN = new RegExp(
  `^(${TOKEN})_(${TOKEN})_(${TOKEN})(?:_(${TOKEN}))?\\.(wav|ogg|m4a)$`,
);

export interface ParsedName {
  readonly filename: string;
  readonly category: CategorySpec;
  readonly subject: string;
  readonly variant: string;
  readonly direction: Direction | null;
  readonly state: string | null;
  readonly splitPart: SplitPart | null;
  readonly scale: number;
  readonly extension: string;
  /** `category/subject`, the key used to look up a reference height. */
  readonly subjectKey: string;
  /** Everything except the split part — two halves of one object share this. */
  readonly splitGroup: string;
}

export type ParseResult = { ok: true; name: ParsedName } | { ok: false; reason: string };

function isDirection(value: string | undefined): value is Direction {
  return value !== undefined && (DIRECTIONS as readonly string[]).includes(value);
}

function isSplitPart(value: string | null): value is SplitPart {
  return value !== null && (SPLIT_PARTS as readonly string[]).includes(value);
}

export function parseAssetName(filename: string): ParseResult {
  const image = IMAGE_NAME_PATTERN.exec(filename);
  const audio = image !== null ? null : AUDIO_NAME_PATTERN.exec(filename);
  const match = image ?? audio;

  if (match === null) {
    return {
      ok: false,
      reason:
        'does not match <category>_<subject>_<variant>[_<direction>][_<state>]@<scale>x.<png|webp> ' +
        'or <category>_<subject>_<variant>[_<state>].<wav|ogg|m4a> (ASSET_PIPELINE §3)',
    };
  }

  const [, categoryId = '', subject = '', variant = '', fourth, fifth] = match;
  const scale = image !== null ? Number(match[6]) : 1;
  const extension = image !== null ? (match[7] ?? '') : (match[5] ?? '');

  const category = ASSET_CATEGORIES.find((entry) => entry.id === categoryId);
  if (category === undefined) {
    const known = ASSET_CATEGORIES.map((entry) => entry.id).join(', ');
    return { ok: false, reason: `unknown category "${categoryId}" (known: ${known})` };
  }

  if (category.kind === 'audio' && image !== null) {
    return {
      ok: false,
      reason: `"${categoryId}" is an audio category but the name carries an @Nx scale suffix`,
    };
  }
  if (category.kind !== 'audio' && audio !== null) {
    return { ok: false, reason: `"${categoryId}" is an image category and requires an @Nx scale suffix` };
  }

  // Audio has no direction slot at all — a brake sound does not face north-east —
  // so its optional fourth field is always the state. `sfx_car_brake_01` is
  // variant `brake`, state `01`.
  //
  // For images the direction slot is a closed set, which makes the fourth field
  // unambiguous: it is a direction if it is one of the eight compass tokens, and
  // a state otherwise. `prop_table_round_4seat` has no direction;
  // `veh_sedan_red_ne` does. No filename can be read both ways.
  const direction = image !== null && isDirection(fourth) ? fourth : null;
  const state = image !== null && direction !== null ? (fifth ?? null) : (fourth ?? null);

  if (image !== null && direction === null && fifth !== undefined) {
    return {
      ok: false,
      reason: `"${fourth}" is in the direction slot but is not one of ${DIRECTIONS.join(' ')}`,
    };
  }

  if (image !== null && scale !== PRODUCTION_SCALE && scale !== 1) {
    return { ok: false, reason: `scale @${scale}x — only @1x and @${PRODUCTION_SCALE}x exist` };
  }

  const splitPart = isSplitPart(state) ? state : null;
  const splitGroup = [categoryId, subject, variant, direction].filter(Boolean).join('_');

  return {
    ok: true,
    name: {
      filename,
      category,
      subject,
      variant,
      direction,
      state,
      splitPart,
      scale,
      extension,
      subjectKey: `${categoryId}/${subject}`,
      splitGroup,
    },
  };
}
