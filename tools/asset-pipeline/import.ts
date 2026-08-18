import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { PRODUCTION_SCALE } from '../../src/config/assets.ts';
import { isoSpriteMetrics } from '../shared/spriteMetrics.ts';
import { DIRECTIONS, parseAssetName } from './naming.ts';
import type { ParsedName } from './naming.ts';
import { PATHS } from './paths.ts';
import { loadSubjectDimensions, resolveExpectation, spriteFor } from './subjectDimensions.ts';
import type { SubjectDimensions } from './subjectDimensions.ts';

/**
 * The staging drop, conditioned into `assets/source`.
 *
 * A generator produces an *illustration*: a big square canvas, the subject
 * somewhere inside it, a filename with whatever prefix the batch UI assigned.
 * The pipeline downstream expects a *sprite*: the contract filename of
 * ASSET_PIPELINE §3, drawn at the size `spriteMetrics` projects for the
 * subject's world box, with a footprint anchor beside it. This stage is the
 * bridge, and it exists because the alternative is 172 manual edits that nobody
 * can reproduce or check.
 *
 * Nothing here relaxes a validation threshold. Every step makes the delivered
 * pixels *satisfy* a check that the raw drop does not:
 *
 *  - **Name.** The drop is numbered (`112- struct_sign_large_lower@2x.png`) and
 *    occasionally double-suffixed. The mapping is recorded, never applied
 *    silently — `importPlan()` returns it and the report prints it.
 *  - **Alpha.** The generator wrote the subject's interior at alpha **253**, not
 *    255, over its whole area. Two of the nine checks — palette compliance and
 *    light direction — only look at fully opaque pixels, so on the raw drop they
 *    sample 0.05% of the subject and report noise. Snapping the near-opaque
 *    plateau to 255 is not a cosmetic fix: it is what makes those two checks
 *    measure the asset at all.
 *  - **Size.** The subject is fitted to the box `isoSpriteMetrics` derives from
 *    the subject's world dimensions, so check 4 compares a sprite against the
 *    projection the renderer actually uses.
 *  - **Anchor.** Written from the same derivation, so the sidecar check 8 needs
 *    cannot drift from the depth sort.
 *
 * Deterministic by construction: fixed encoder settings, fixed kernel, integer
 * arithmetic, sorted traversal. Running it twice produces identical bytes, which
 * `tests/unit/tools/import.test.ts` asserts rather than assumes.
 */

/** Alpha at or above this is the generator's opaque plateau, and becomes 255. */
export const OPAQUE_PLATEAU = 250;

/**
 * Alpha at or below this is export haze, and becomes 0.
 *
 * Deliberately tiny. A real antialiased edge reaches down to alpha 1, so a
 * generous floor here would eat the outline the style contract asks for; six is
 * under 2.5% and only catches the flat wash the exporter leaves outside the
 * subject.
 */
export const TRANSPARENT_FLOOR = 6;

/**
 * Transparent margin added around a fitted sprite, in pixels.
 *
 * Check 1 reads the four corner pixels, and a sprite trimmed exactly to its
 * alpha bounds can legitimately have an opaque corner — a square sign does. Two
 * pixels of margin makes the corner test meaningful again without moving the
 * alpha bounding box that check 4 measures. Coverage (check 2) is unaffected in
 * practice: two pixels on a 300px sprite is 99% of the dominant axis.
 */
export const MARGIN_PX = 2;

/**
 * Part heights for the doll rig, in metres.
 *
 * The generator drew each rig part alone on its own canvas, so the *relative*
 * scale between a head and a leg is not in the pixels — every part fills its
 * frame. Scaling each part to the assembled envelope would give a person a head
 * as tall as their legs.
 *
 * These are the spans each delivered part actually covers on a 1.75 m adult, and
 * they sum to the adult `subjectDimensions.json` already declares. Anatomy, not
 * art direction — the same standard `src/config/actors.ts` applies to a person
 * being 1.75 m tall.
 *
 * Duplicated from `src/config/sprites.ts` rather than imported, for the reason
 * `tools/shared/spriteMetrics.ts` gives: this module runs under plain Node from
 * the pipeline CLI, which cannot resolve `src/**`'s extensionless imports.
 * `tests/unit/config/sprites.test.ts` asserts the two tables are identical, so
 * the duplication cannot drift.
 */
export const RIG_PART_HEIGHT_METRES: Readonly<Record<string, number>> = {
  // The delivered `body` is the whole figure from the neck to the boots — torso,
  // hips, legs and shoes — not a torso. Sizing it as a 0.7 m torso gave a person
  // whose legs ended at their own knees, which is what the first browser capture
  // showed. See `src/config/sprites.ts` RIG_DRAW_ORDER for the full finding.
  body: 1.45, //  ground 0 to neck 1.45
  head: 0.3, //   neck 1.45 to crown 1.75
  hair: 0.18, //  the crown cap, drawn over the head
  'arm-l': 0.6, // shoulder 1.35 down to hand 0.75
  'arm-r': 0.6,
  // Delivered as a second pair of arms rather than as legs. Nothing draws them;
  // they are sized as what they are so they import and validate honestly.
  'leg-l': 0.6,
  'leg-r': 0.6,
};

/** ASSET_PIPELINE §1.2: world height in art pixels is `metres x TILE_Z x ART_SCALE`. */
const TILE_Z = 32;

interface DirectionAssignment {
  readonly from: string;
  readonly mirror: boolean;
  readonly gap?: boolean;
  readonly note: string;
}

interface DirectionAuditFile {
  readonly archetypes: Readonly<
    Record<
      string,
      {
        /** What each delivered file actually shows, by the filename it arrived under. */
        readonly trueFacings: Readonly<Record<string, string>>;
        readonly assign: Readonly<Record<string, DirectionAssignment>>;
      }
    >
  >;
}

let cachedAudit: DirectionAuditFile | undefined;

/**
 * Which delivered file actually shows which facing.
 *
 * The drop's eight vehicle files per archetype are not eight facings — see
 * `docs/assets/DIRECTION_AUDIT.json`. Import reads the audit and assigns each
 * output slot the file that genuinely shows it, mirroring where a mirror is
 * truthful. Without this, westbound traffic — half the road — drew a car facing
 * the wrong way.
 */
export function loadDirectionAudit(path: string = PATHS.directionAudit): DirectionAuditFile {
  if (path === PATHS.directionAudit && cachedAudit !== undefined) return cachedAudit;
  if (!existsSync(path)) return { archetypes: {} };
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as DirectionAuditFile;
  if (path === PATHS.directionAudit) cachedAudit = parsed;
  return parsed;
}

/** The source facing and mirror flag for an output slot, or null if unaudited. */
export function directionSourceFor(
  name: ParsedName,
  audit: DirectionAuditFile = loadDirectionAudit(),
): DirectionAssignment | null {
  if (name.category.id !== 'veh' || name.direction === null) return null;
  return audit.archetypes[name.subject]?.assign[name.direction] ?? null;
}

export interface ImportTarget {
  /** Fitted box the subject is scaled into, before the margin is added. */
  readonly width: number;
  readonly height: number;
  /** Anchor in the *output* image, margin included. */
  readonly anchor: { readonly x: number; readonly y: number };
  /** Padded to an exact canvas (icons) rather than trimmed and margined. */
  readonly canvas: { readonly width: number; readonly height: number } | null;
  readonly reason: string;
}

export interface ImportEntry {
  readonly staged: string;
  readonly filename: string;
  readonly renamed: boolean;
}

/** The staging filename, as the contract name. Recorded, never silent. */
export function canonicalName(raw: string): string {
  return raw
    .replace(/\.png\.png$/i, '.png')
    .replace(/^\s*\d+\s*-?\s*/, '')
    .replace(/\s+/g, '');
}

export function importPlan(dir: string): ImportEntry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => !entry.endsWith('.meta.json'))
    .filter((entry) => statSync(join(dir, entry)).isFile())
    .sort()
    .map((staged) => {
      const filename = canonicalName(staged);
      return { staged, filename, renamed: filename !== staged };
    });
}

/**
 * Where a subject's pixels have to land.
 *
 * Three shapes, one per expectation mode, and the split pair is the interesting
 * one: each half is drawn complete on its own ground diamond, so the pair's
 * height is `lower + upper - footprint`. Fitting each half independently would
 * satisfy neither the pair total nor the shared cut line, so the caller passes
 * the partner's bounds and both halves take the same scale.
 */
export function targetFor(
  name: ParsedName,
  bounds: { width: number; height: number },
  table: SubjectDimensions,
  partnerBoundsHeight: number | null = null,
  /** The facing the source art actually shows, when it is not the slot's own. */
  sourceFacing: string | null = null,
): ImportTarget {
  /*
   * The box comes from the facing the *pixels* show, not the slot they fill.
   *
   * They differ only for the ten gap slots, where no truthful source exists and
   * the nearest available heading stands in. Sizing those to the slot's box
   * crushes them — a rear three-quarter fitted to an end-on car's 172px width
   * came out 176x105, a car squashed to a third of its height. A correctly
   * proportioned car pointing 45 degrees off is the better wrong answer, and it
   * is the one the direction audit's `gap` entries promise.
   */
  const shown = sourceFacing ?? name.direction;
  const facing = shown === null ? null : DIRECTIONS.indexOf(shown as (typeof DIRECTIONS)[number]);
  const directionIndex = facing === null || facing < 0 ? null : facing;
  const expectation = resolveExpectation(name.subjectKey, table, directionIndex);
  if (expectation === null) {
    throw new Error(`import: nothing declared for "${name.subjectKey}" in subjectDimensions.json`);
  }

  if (expectation.mode === 'canvas') {
    const scale = Math.min(expectation.width / bounds.width, expectation.height / bounds.height);
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    return {
      width,
      height,
      canvas: { width: expectation.width, height: expectation.height },
      // An icon has no footprint; the anchor is its centre so a caller that
      // positions by anchor gets the obvious behaviour.
      anchor: { x: Math.round(expectation.width / 2), y: Math.round(expectation.height / 2) },
      reason: `canvas ${expectation.width}x${expectation.height}, contained`,
    };
  }

  if (expectation.mode === 'envelope') {
    const part = RIG_PART_HEIGHT_METRES[name.subject];
    if (part === undefined) {
      throw new Error(
        `import: "${name.subject}" is a rig part with no declared height — add it to RIG_PART_HEIGHT_METRES`,
      );
    }
    const height = Math.max(1, Math.round(part * TILE_Z * PRODUCTION_SCALE));
    const width = Math.max(1, Math.round((bounds.width / bounds.height) * height));
    return {
      width,
      height,
      canvas: null,
      // A rig part is placed by its own centre; the assembled figure's footprint
      // anchor belongs to the actor, not to a forearm.
      anchor: { x: Math.round(width / 2) + MARGIN_PX, y: Math.round(height / 2) + MARGIN_PX },
      reason: `rig part ${part} m -> ${height}px (envelope ${expectation.height}px)`,
    };
  }

  const sprite = spriteFor(name.subjectKey, table, directionIndex);
  if (sprite === null) {
    throw new Error(`import: "${name.subjectKey}" resolved as reference with no world box`);
  }
  const metrics = sprite.metrics;

  if (name.splitPart !== null) {
    if (partnerBoundsHeight === null) {
      throw new Error(`import: ${name.filename} is a split half but no partner bounds were supplied`);
    }
    /*
     * The halves are **complementary**, not overlapping.
     *
     * The generation prompt asks for an object "cut cleanly at the split line so
     * it stacks onto the lower half", so the pair's height is the plain sum and
     * the scale is `expected / (lower + upper)`. Solving for a shared ground
     * diamond instead — `(expected + footprint) / (lower + upper)` — makes the
     * pair 37.5% too tall, which drew a roadside tree five times the height of
     * the stand beside it. Measured in the browser, not reasoned about.
     */
    const scale = metrics.height / (bounds.height + partnerBoundsHeight);
    const height = Math.max(1, Math.round(bounds.height * scale));
    const width = Math.max(1, Math.round(bounds.width * scale));
    const anchor =
      name.splitPart === 'lower'
        ? // The lower half owns the ground diamond, so it anchors where the
          // whole object would.
          {
            x: Math.round(width / 2) + MARGIN_PX,
            y: Math.round(height - metrics.footprintHeight / 2) + MARGIN_PX,
          }
        : // The upper half stacks onto the lower one's top edge, so its anchor is
          // its own bottom centre. Anything else would put the anchor outside the
          // image, which check 8 rejects for good reason.
          { x: Math.round(width / 2) + MARGIN_PX, y: height + MARGIN_PX };
    return {
      width,
      height,
      canvas: null,
      anchor,
      reason: `split ${name.splitPart}, pair scaled to ${metrics.height}px total`,
    };
  }

  /*
   * Fitted to the projected **width**, and allowed to be shorter than the
   * projected height.
   *
   * The footprint is the authoritative quantity: it is what parks in a bay, what
   * fits a lane, and what the depth sorter anchors to. A sprite wider than its
   * footprint overlaps its neighbours in the car park no matter how good it
   * looks alone — which is what fitting to height produced, a sedan 46% wider
   * than the bay it stands in.
   *
   * Height is not forced to match, because the delivered art is drawn at a
   * **shallower camera than 2:1 dimetric**: a corner-on car projects to 336x317
   * in this world and the illustration's own aspect is 336x217. Stretching it to
   * the projected height by 1.46x would turn every wheel into an ellipse. So the
   * elevation follows the art and the check below asserts only that the sprite
   * never exceeds its box. Recorded in ADR-013.
   */
  const scale = metrics.width / bounds.width;
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));

  return {
    width,
    height,
    canvas: null,
    anchor: {
      x: Math.round(width / 2) + MARGIN_PX,
      // The ground diamond is as tall as the projection says even when the art
      // is shallower, so the anchor is measured from the sprite's own base by
      // the same fraction of its height that the diamond occupies of the box.
      y: Math.round(height - (metrics.footprintHeight / 2) * (height / metrics.height)) + MARGIN_PX,
    },
    reason: `width-fitted to ${metrics.width}px (height ${height} of a projected ${metrics.height})`,
  };
}

const PNG_OPTIONS = {
  compressionLevel: 9,
  effort: 10,
  palette: false,
  adaptiveFiltering: true,
} as const;

interface Conditioned {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly bounds: { left: number; top: number; width: number; height: number };
}

/**
 * Decode, snap the alpha plateau, and find what is left.
 *
 * `mirror` flips horizontally *before* anything is measured, so the bounds and
 * the anchor belong to the image that will actually be written. A car is
 * laterally symmetric, which is what makes the mirror truthful rather than a
 * trick — ASSET_PIPELINE §3 already assumes it ("mirrored variants do not exist
 * as files").
 */
async function condition(file: string, mirror = false): Promise<Conditioned> {
  const pipeline = sharp(file).toColorspace('srgb').ensureAlpha();
  const { data, info } = await (mirror ? pipeline.flop() : pipeline)
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i] ?? 0;
    if (alpha >= OPAQUE_PLATEAU) data[i] = 255;
    else if (alpha <= TRANSPARENT_FLOOR) data[i] = 0;
  }

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    const row = y * info.width * 4;
    for (let x = 0; x < info.width; x++) {
      if ((data[row + x * 4 + 3] ?? 0) > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`import: ${basename(file)} is fully transparent`);

  return {
    data,
    width: info.width,
    height: info.height,
    bounds: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

export interface ImportedAsset {
  readonly staged: string;
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly reason: string;
  readonly renamed: boolean;
}

export interface ImportOptions {
  readonly stagingDir?: string;
  readonly outputDir?: string;
  readonly table?: SubjectDimensions;
}

/**
 * Condition every staged file into the pipeline's source directory.
 *
 * Two passes, because a split half cannot be scaled without its partner's
 * bounds: the first measures, the second writes.
 */
export async function importStaging(options: ImportOptions = {}): Promise<ImportedAsset[]> {
  const stagingDir = options.stagingDir ?? join(PATHS.source, '..', 'staging');
  const outputDir = options.outputDir ?? PATHS.source;
  const table = options.table ?? loadSubjectDimensions();

  const plan = importPlan(stagingDir);
  if (plan.length === 0) return [];

  const audit = loadDirectionAudit();

  /*
   * Resolve the direction audit before anything is measured.
   *
   * The audit reassigns which *staged file* fills an output slot, so it has to
   * happen before conditioning — otherwise the slot is measured against the
   * wrong picture and fitted to the wrong box.
   */
  const staged = new Map<string, ImportEntry>();
  for (const entry of plan) staged.set(entry.filename, entry);

  const measured = new Map<
    string,
    {
      entry: ImportEntry;
      name: ParsedName;
      conditioned: Conditioned;
      mirror: boolean;
      gap: boolean;
      /** Mirroring swaps east for west, so the shown facing swaps with it. */
      shownFacing: string | null;
    }
  >();
  for (const entry of plan) {
    const parsed = parseAssetName(entry.filename);
    if (!parsed.ok) throw new Error(`import: ${entry.staged} -> ${entry.filename}: ${parsed.reason}`);
    if (parsed.name.category.kind !== 'image') continue;

    const assignment = directionSourceFor(parsed.name, audit);
    let source = entry;
    if (assignment !== null) {
      const wanted = entry.filename.replace(`_${parsed.name.direction ?? ''}@`, `_${assignment.from}@`);
      const replacement = staged.get(wanted);
      if (replacement === undefined) {
        throw new Error(`import: ${entry.filename} needs ${wanted}, which is not in the drop`);
      }
      source = replacement;
    }

    const MIRRORED: Readonly<Record<string, string>> = {
      n: 'n',
      ne: 'nw',
      e: 'w',
      se: 'sw',
      s: 's',
      sw: 'se',
      w: 'e',
      nw: 'ne',
    };
    /*
     * `assign.from` names a *file*; the box has to come from what that file
     * shows. For the sedan they differ by a whole quadrant — the `n` file shows
     * a car heading south-west — so reading `from` as a facing would size the
     * south-west slot to an end-on car's 172px width and squash it.
     */
    const shows =
      assignment === null
        ? null
        : (audit.archetypes[parsed.name.subject]?.trueFacings[assignment.from] ?? assignment.from);
    const trueFacing =
      shows === null ? null : assignment?.mirror === true ? (MIRRORED[shows] ?? shows) : shows;

    measured.set(entry.filename, {
      entry: { ...source, filename: entry.filename, renamed: true },
      name: parsed.name,
      conditioned: await condition(join(stagingDir, source.staged), assignment?.mirror === true),
      mirror: assignment?.mirror === true,
      gap: assignment?.gap === true,
      shownFacing: trueFacing,
    });
  }

  /** The partner half's trimmed height, for a split group. */
  const partnerHeight = (name: ParsedName): number | null => {
    if (name.splitPart === null) return null;
    const other = name.splitPart === 'lower' ? 'upper' : 'lower';
    for (const candidate of measured.values()) {
      if (candidate.name.splitGroup === name.splitGroup && candidate.name.splitPart === other) {
        return candidate.conditioned.bounds.height;
      }
    }
    throw new Error(`import: ${name.filename} has no ${other} half`);
  };

  mkdirSync(outputDir, { recursive: true });
  const imported: ImportedAsset[] = [];

  for (const filename of [...measured.keys()].sort()) {
    const item = measured.get(filename);
    if (item === undefined) continue;
    const { entry, name, conditioned, mirror, gap, shownFacing } = item;
    const target = targetFor(name, conditioned.bounds, table, partnerHeight(name), shownFacing);

    const trimmed = sharp(conditioned.data, {
      raw: { width: conditioned.width, height: conditioned.height, channels: 4 },
    })
      .extract(conditioned.bounds)
      .resize(target.width, target.height, { kernel: 'lanczos3', fit: 'fill' });

    const margin = target.canvas === null ? MARGIN_PX : 0;
    const canvasWidth = target.canvas?.width ?? target.width + margin * 2;
    const canvasHeight = target.canvas?.height ?? target.height + margin * 2;

    const output = join(outputDir, filename);
    await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await trimmed.png(PNG_OPTIONS).toBuffer(),
          left: Math.round((canvasWidth - target.width) / 2),
          top:
            target.canvas === null
              ? margin
              : // An icon sits on the canvas centre; a world sprite keeps its
                // baseline, so only the fixed-canvas case centres vertically.
                Math.round((canvasHeight - target.height) / 2),
        },
      ])
      .png(PNG_OPTIONS)
      .toFile(output);

    writeFileSync(
      `${output.slice(0, output.length - 4)}.meta.json`,
      `${JSON.stringify({ anchor: target.anchor }, null, 2)}\n`,
    );

    imported.push({
      staged: entry.staged,
      output,
      width: canvasWidth,
      height: canvasHeight,
      anchor: target.anchor,
      reason: `${target.reason}${mirror ? ', mirrored' : ''}${gap ? ' [DIRECTION GAP]' : ''}`,
      renamed: entry.renamed,
    });
  }

  return imported;
}

/** Re-exported so the report can print what a subject was fitted to. */
export { isoSpriteMetrics };
