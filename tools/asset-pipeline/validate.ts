import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { SPLIT_HEIGHT_LIMIT_PX } from '../../src/config/assets.ts';
import { alphaBounds, luminance, readRaw } from './image.ts';
import type { RawImage } from './image.ts';
import { parseAssetName } from './naming.ts';
import type { ParsedName } from './naming.ts';
import { loadPalette, nearest } from './palette.ts';
import type { LoadedPalette } from './palette.ts';
import { PATHS } from './paths.ts';
import { loadSubjectDimensions, resolveExpectation, spriteFor } from './subjectDimensions.ts';
import type { SubjectDimensions } from './subjectDimensions.ts';

/**
 * The nine asset checks of ASSET_PIPELINE §4.3 step 4.
 *
 * A failing asset is not accepted. That sentence is the whole design: the
 * validator exists so that "does this belong in our world" is answered by a
 * command rather than by whoever is looking at the screen at the time, and so
 * that the answer is the same in three months. **No threshold here may be
 * lowered to make a batch pass** (WORKING_DISCIPLINE, roadmap Phase 4 execution
 * prompt: "Never lower a threshold to pass"). If real art cannot meet a
 * threshold, that is a change request against ASSET_PIPELINE, not an edit here.
 *
 * Two constants are chosen by this module rather than quoted from the document,
 * and both are called out below so they can be argued with: `COVERAGE_AXIS` and
 * `PER_FILE_BUDGET_MULTIPLIER`.
 */

/** The nine checks, in the document's order. Ids are stable; messages are not. */
export const CHECKS = [
  'transparent-background',
  'alpha-coverage',
  'palette-compliance',
  'reference-height',
  'light-direction',
  'split-rule',
  'naming',
  'anchor',
  'file-budget',
] as const;

export type CheckId = (typeof CHECKS)[number];

export interface Finding {
  readonly check: CheckId;
  readonly ok: boolean;
  readonly detail: string;
}

export interface AssetValidation {
  readonly file: string;
  readonly name: ParsedName | null;
  readonly findings: readonly Finding[];
  readonly ok: boolean;
  /** Trimmed size, carried forward so `process` does not re-decode the image. */
  readonly bounds: { width: number; height: number } | null;
}

/**
 * §4.3 says the alpha bounding box must cover ">= 60% of the canvas".
 *
 * Read as *area*, the check is unsatisfiable for anything that is not roughly
 * square: a sedan is 288 x 90 px (§1.2), so on a square canvas its bounding box
 * can cover at most 288*90 / 288^2 = 31% no matter how well it is framed. A
 * check that no correct asset can pass is not a check.
 *
 * So it is read along the **dominant axis**: the subject must span at least 60%
 * of the canvas in whichever direction it is longest. That preserves the stated
 * intent — "asiri bosluk yok", no excessive empty space, catching a small
 * subject floating in a large canvas — and is satisfiable at any aspect ratio.
 * The 0.6 threshold itself is unchanged. Recorded in PHASE_4_REPORT §5.
 */
const COVERAGE_AXIS = 0.6;

/**
 * A single file may be this many times the category average before it is flagged.
 *
 * §13 budgets a category total and an expected file count, which gives an
 * average but not a per-file cap — some sprites are legitimately larger than
 * others. The average alone would fail correct assets; the category total alone
 * catches nothing until the whole batch exists. Three times the average is a
 * chosen middle: large enough not to fire on normal variation, small enough that
 * a 2 MB "sprite" cannot hide inside a 6 MB category. The real total is enforced
 * by `report.ts`. Not from the documents — chosen here, and named so.
 */
export const PER_FILE_BUDGET_MULTIPLIER = 3;

/** A flat fill has no light in it, so a tie fails. Under 1% of the range. */
const MIN_LIGHT_SEPARATION = 2;

export interface AnchorMeta {
  readonly anchor: { readonly x: number; readonly y: number };
}

/** Sidecar path for an asset, per ASSET_PIPELINE §1.3. */
export function metaPathFor(file: string): string {
  return join(
    file.slice(0, file.length - basename(file).length),
    `${basename(file, extname(file))}.meta.json`,
  );
}

function ok(check: CheckId, detail: string): Finding {
  return { check, ok: true, detail };
}
function fail(check: CheckId, detail: string): Finding {
  return { check, ok: false, detail };
}

/** Check 1 — the four corners must be fully transparent. */
function checkTransparentBackground(image: RawImage): Finding {
  const corner = (x: number, y: number): number => image.data[(y * image.width + x) * 4 + 3] ?? 0;
  const corners = [
    corner(0, 0),
    corner(image.width - 1, 0),
    corner(0, image.height - 1),
    corner(image.width - 1, image.height - 1),
  ];
  const opaque = corners.filter((alpha) => alpha !== 0);
  return opaque.length === 0
    ? ok('transparent-background', 'all four corners have alpha 0')
    : fail(
        'transparent-background',
        `${opaque.length} of 4 corners are not transparent (alphas ${corners.join(', ')}) — ` +
          'the background was baked in',
      );
}

/** Check 2 — the subject must fill the canvas along its dominant axis. */
function checkCoverage(image: RawImage, bounds: { width: number; height: number }): Finding {
  const across = bounds.width / image.width;
  const down = bounds.height / image.height;
  const dominant = Math.max(across, down);
  const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

  return dominant >= COVERAGE_AXIS
    ? ok('alpha-coverage', `spans ${percent(dominant)} of the canvas on its dominant axis`)
    : fail(
        'alpha-coverage',
        `spans only ${percent(across)} x ${percent(down)} of a ${image.width}x${image.height} ` +
          `canvas, below ${percent(COVERAGE_AXIS)} — the subject is lost in empty space`,
      );
}

/** Check 3 — at least `coverage` of opaque pixels within `tolerance` of the palette. */
function checkPalette(image: RawImage, palette: LoadedPalette): Finding {
  const limit = palette.spec.tolerance * palette.spec.tolerance;
  let opaque = 0;
  let inside = 0;
  let worst = 0;

  for (let i = 0; i < image.data.length; i += 4) {
    // Semi-transparent pixels are antialiased edges: they blend the subject with
    // nothing, so their colour is a fraction of a palette colour and testing
    // them would fail every correctly outlined sprite.
    if ((image.data[i + 3] ?? 0) < 255) continue;
    opaque++;
    const { distanceSq } = nearest(palette, {
      r: image.data[i] ?? 0,
      g: image.data[i + 1] ?? 0,
      b: image.data[i + 2] ?? 0,
    });
    if (distanceSq <= limit) inside++;
    else if (distanceSq > worst) worst = distanceSq;
  }

  if (opaque === 0) {
    return fail('palette-compliance', 'no fully opaque pixels — the asset is empty or all edge');
  }
  const ratio = inside / opaque;
  const detail =
    `${(ratio * 100).toFixed(2)}% of ${opaque} opaque pixels within ${palette.spec.tolerance} ` +
    `of the palette (need ${(palette.spec.coverage * 100).toFixed(0)}%)`;
  return ratio >= palette.spec.coverage
    ? ok('palette-compliance', detail)
    : fail('palette-compliance', `${detail}; furthest pixel is ${Math.sqrt(worst).toFixed(1)} away`);
}

/**
 * Check 4 — drawn size against what the subject's world dimensions project to.
 *
 * Compared against a **derived** sprite height, not against the pixel numbers in
 * ASSET_PIPELINE §1.2. Those are world heights (`metres x TILE_Z x ART_SCALE`)
 * and a drawn isometric sprite is taller, because it also carries the projected
 * ground diamond. A 4.5 x 1.9 m car is 90 px by §1.2 and 301 px on screen; the
 * first version of this check compared the second number against the first and
 * would have rejected every correct vehicle. `tools/shared/spriteMetrics.ts`
 * owns the derivation and the placeholder generator uses the same one.
 */
function checkReferenceHeight(
  name: ParsedName,
  bounds: { width: number; height: number },
  table: SubjectDimensions,
): Finding {
  const expectation = resolveExpectation(name.subjectKey, table);
  if (expectation === null) {
    return fail(
      'reference-height',
      `nothing declared for "${name.subjectKey}" — add its world dimensions in metres to ` +
        'docs/assets/subjectDimensions.json, with a source, before this asset can be accepted',
    );
  }

  if (expectation.mode === 'envelope') {
    return bounds.height <= expectation.height
      ? ok('reference-height', `${bounds.height}px within the ${expectation.height}px assembled envelope`)
      : fail(
          'reference-height',
          `${bounds.height}px exceeds the ${expectation.height}px assembled-adult envelope (${expectation.source})`,
        );
  }

  if (expectation.mode === 'canvas') {
    const matches = bounds.width === expectation.width && bounds.height === expectation.height;
    return matches
      ? ok('reference-height', `${bounds.width}x${bounds.height} matches the declared canvas`)
      : fail(
          'reference-height',
          `${bounds.width}x${bounds.height}, declared canvas is ` +
            `${expectation.width}x${expectation.height} (${expectation.source})`,
        );
  }

  // A split object is only the right height as a pair, so a half is checked at
  // the set level in `validateDirectory` and passed over here.
  if (name.splitPart !== null) {
    return ok('reference-height', `split half — the pair is checked against ${expectation.height}px`);
  }

  const low = expectation.height * (1 - expectation.tolerance);
  const high = expectation.height * (1 + expectation.tolerance);
  if (bounds.height >= low && bounds.height <= high) {
    return ok('reference-height', `${bounds.height}px within ${low.toFixed(0)}-${high.toFixed(0)}px`);
  }
  // A subject declared as split that arrives whole is a different mistake from
  // one that is simply the wrong size, and saying so saves the reader a guess.
  const hint = expectation.splitExpected
    ? ' — this subject is declared `split`, so it should arrive as _lower/_upper halves'
    : '';
  return fail(
    'reference-height',
    `${bounds.height}px is outside ${low.toFixed(0)}-${high.toFixed(0)}px ` +
      `(${expectation.height}px projected +/-${(expectation.tolerance * 100).toFixed(0)}%, ` +
      `${expectation.source})${hint}`,
  );
}

/**
 * Check 5 — the key light comes from the upper left.
 *
 * Opaque pixels are split by the anti-diagonal: everything above-left of the
 * line from bottom-left to top-right is the lit side, everything below-right is
 * the shadow side. Comparing the two means is a direct test of the LIGHT clause
 * of the style contract, and it is the check that catches the single most common
 * AI failure — a batch that silently relights halfway through.
 */
function checkLightDirection(
  image: RawImage,
  bounds: { left: number; top: number; width: number; height: number },
): Finding {
  let litSum = 0;
  let litCount = 0;
  let shadowSum = 0;
  let shadowCount = 0;

  for (let y = bounds.top; y < bounds.top + bounds.height; y++) {
    const row = y * image.width * 4;
    // Normalised inside the *bounding box*, not the canvas: padding must not
    // shift where the diagonal falls.
    const ny = (y - bounds.top) / Math.max(1, bounds.height - 1);
    for (let x = bounds.left; x < bounds.left + bounds.width; x++) {
      const i = row + x * 4;
      if ((image.data[i + 3] ?? 0) < 255) continue;
      const nx = (x - bounds.left) / Math.max(1, bounds.width - 1);
      const l = luminance(image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0);
      if (nx + ny < 1) {
        litSum += l;
        litCount++;
      } else {
        shadowSum += l;
        shadowCount++;
      }
    }
  }

  if (litCount === 0 || shadowCount === 0) {
    return fail('light-direction', 'one side of the diagonal is empty — cannot read a light direction');
  }
  const lit = litSum / litCount;
  const shadow = shadowSum / shadowCount;
  const delta = lit - shadow;
  const detail = `upper-left mean ${lit.toFixed(1)} vs lower-right ${shadow.toFixed(1)} (delta ${delta.toFixed(1)})`;

  return delta >= MIN_LIGHT_SEPARATION
    ? ok('light-direction', detail)
    : fail(
        'light-direction',
        `${detail} — the key light is not coming from the upper left ` +
          '(ASSET_PIPELINE §1.1 LIGHT: single key from the north-west, 35 degrees)',
      );
}

/**
 * Check 6 — the mandatory split rule of §1.4.
 *
 * The 160 px limit measures the object's **body**, not its sprite. The project
 * states its own reading in `src/config/actors.ts`: "At TILE_Z = 32 and 2x art,
 * 160 px is 2.5 metres" — true of `heightMetres x TILE_Z x ART_SCALE` and of
 * nothing else. Measured against the sprite instead, the rule splits a sedan
 * (301 px tall, of which only 96 is body) and leaves a 5 m tree and a sedan in
 * the same category. The rule exists to stop *tall* objects producing depth-sort
 * cycles; a car is long, not tall.
 *
 * When the subject has no declared dimensions the body cannot be derived, so
 * this falls back to the sprite box and says which quantity it used — check 4
 * has already failed the asset by then anyway.
 */
function checkSplitRule(name: ParsedName, spriteHeight: number, table: SubjectDimensions): Finding {
  const expectation = resolveExpectation(name.subjectKey, table);
  const bodyHeight = expectation?.mode === 'reference' ? expectation.bodyHeight : null;
  const measured = bodyHeight ?? spriteHeight;
  const measuredAs = bodyHeight === null ? 'sprite height, subject undeclared' : 'body height';

  if (measured <= SPLIT_HEIGHT_LIMIT_PX) {
    return name.splitPart === null
      ? ok('split-rule', `${measured}px ${measuredAs}, within the ${SPLIT_HEIGHT_LIMIT_PX}px limit`)
      : fail(
          'split-rule',
          `named _${name.splitPart} but ${measured}px ${measuredAs} is within the ` +
            `${SPLIT_HEIGHT_LIMIT_PX}px limit — splitting an object that does not need it gives it ` +
            'two depths and two anchors for no benefit',
        );
  }

  return name.splitPart !== null
    ? ok('split-rule', `${measured}px ${measuredAs}, correctly named _${name.splitPart}`)
    : fail(
        'split-rule',
        `${measured}px ${measuredAs} exceeds ${SPLIT_HEIGHT_LIMIT_PX}px and is not named ` +
          '_lower/_upper — an object this tall creates depth-sort cycles (ASSET_PIPELINE §1.4)',
      );
}

/** Check 8 — anchor sidecar present, parseable, and inside the image. */
function checkAnchor(file: string, image: RawImage): Finding {
  const metaPath = metaPathFor(file);
  if (!existsSync(metaPath)) {
    return fail('anchor', `no ${basename(metaPath)} — the footprint anchor is required (§1.3)`);
  }

  let meta: AnchorMeta;
  try {
    meta = JSON.parse(readFileSync(metaPath, 'utf8')) as AnchorMeta;
  } catch (error) {
    return fail('anchor', `${basename(metaPath)} is not valid JSON: ${String(error)}`);
  }

  const anchor = meta.anchor as { x?: unknown; y?: unknown } | undefined;
  if (anchor === undefined || typeof anchor.x !== 'number' || typeof anchor.y !== 'number') {
    return fail('anchor', `${basename(metaPath)} has no numeric { anchor: { x, y } }`);
  }
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return fail('anchor', `${basename(metaPath)} anchor is not finite`);
  }
  if (anchor.x < 0 || anchor.y < 0 || anchor.x > image.width || anchor.y > image.height) {
    return fail(
      'anchor',
      `anchor (${anchor.x}, ${anchor.y}) is outside the ${image.width}x${image.height} image — ` +
        'a wrong anchor is a wrong depth sort everywhere the sprite appears',
    );
  }
  return ok('anchor', `anchor (${anchor.x}, ${anchor.y})`);
}

/** Check 9 — per-file size against the category allowance. */
function checkFileBudget(name: ParsedName, bytes: number): Finding {
  const average = name.category.budgetBytes / name.category.expectedFiles;
  if (average === 0) {
    return ok(
      'file-budget',
      `"${name.category.id}" shares another category's budget; total checked by assets:report`,
    );
  }
  const cap = average * PER_FILE_BUDGET_MULTIPLIER;
  const kb = (value: number): string => `${(value / 1024).toFixed(1)} kB`;
  return bytes <= cap
    ? ok('file-budget', `${kb(bytes)} within ${kb(cap)}`)
    : fail(
        'file-budget',
        `${kb(bytes)} exceeds ${PER_FILE_BUDGET_MULTIPLIER}x the ${kb(average)} category average`,
      );
}

export interface ValidateOptions {
  readonly palette?: LoadedPalette;
  readonly subjectDimensions?: SubjectDimensions;
}

export async function validateAsset(file: string, options: ValidateOptions = {}): Promise<AssetValidation> {
  const palette = options.palette ?? loadPalette();
  const table = options.subjectDimensions ?? loadSubjectDimensions();
  const filename = basename(file);

  // Check 7 first: nothing else can be checked against a name we cannot read.
  const parsed = parseAssetName(filename);
  if (!parsed.ok) {
    return {
      file,
      name: null,
      bounds: null,
      ok: false,
      findings: [fail('naming', parsed.reason)],
    };
  }
  const name = parsed.name;
  const findings: Finding[] = [ok('naming', `${name.category.id}/${name.subject} @${name.scale}x`)];

  if (name.category.kind !== 'image') {
    // Audio and fonts have names and budgets but no pixels. Reporting the seven
    // image checks as "passed" on a WAV file would be a lie in a report someone
    // is going to trust.
    findings.push(checkFileBudget(name, statSync(file).size));
    return { file, name, bounds: null, ok: findings.every((f) => f.ok), findings };
  }

  const image = await readRaw(file);
  const bounds = alphaBounds(image);
  if (bounds === null) {
    findings.push(fail('alpha-coverage', 'the image is fully transparent'));
    return { file, name, bounds: null, ok: false, findings };
  }

  findings.push(
    checkTransparentBackground(image),
    checkCoverage(image, bounds),
    checkPalette(image, palette),
    checkReferenceHeight(name, bounds, table),
    checkLightDirection(image, bounds),
    checkSplitRule(name, bounds.height, table),
    checkAnchor(file, image),
    checkFileBudget(name, statSync(file).size),
  );

  return {
    file,
    name,
    bounds: { width: bounds.width, height: bounds.height },
    ok: findings.every((finding) => finding.ok),
    findings,
  };
}

export interface DirectoryValidation {
  readonly assets: readonly AssetValidation[];
  readonly setFindings: readonly Finding[];
  readonly ok: boolean;
  readonly checked: number;
}

/**
 * Validate every asset in a directory, then the checks that only exist across
 * files: a split object must have both halves, and the halves must add up.
 */
export async function validateDirectory(
  dir: string = PATHS.source,
  options: ValidateOptions = {},
): Promise<DirectoryValidation> {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((entry) => !entry.endsWith('.meta.json'))
        .filter((entry) => statSync(join(dir, entry)).isFile())
        .sort()
    : [];

  const assets: AssetValidation[] = [];
  for (const file of files) {
    assets.push(await validateAsset(join(dir, file), options));
  }

  const table = options.subjectDimensions ?? loadSubjectDimensions();
  const setFindings = checkSplitPairs(assets, table);

  return {
    assets,
    setFindings,
    checked: assets.length,
    ok: assets.every((asset) => asset.ok) && setFindings.every((finding) => finding.ok),
  };
}

/**
 * Split halves are only correct as a pair.
 *
 * A `_lower` with no `_upper` is a truncated object that will render as a
 * floating stump, and neither half can be checked against the subject's
 * reference height on its own. Both are set-level facts, so they live here
 * rather than in `validateAsset`.
 */
function checkSplitPairs(assets: readonly AssetValidation[], table: SubjectDimensions): Finding[] {
  const groups = new Map<string, AssetValidation[]>();
  for (const asset of assets) {
    if (asset.name?.splitPart === undefined || asset.name.splitPart === null) continue;
    const existing = groups.get(asset.name.splitGroup);
    if (existing !== undefined) existing.push(asset);
    else groups.set(asset.name.splitGroup, [asset]);
  }

  const findings: Finding[] = [];
  for (const [group, halves] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const parts = new Set(halves.map((half) => half.name?.splitPart));
    if (!parts.has('lower') || !parts.has('upper')) {
      findings.push(
        fail('split-rule', `${group}: has ${[...parts].join(' + ')} but a split object needs both halves`),
      );
      continue;
    }

    const first = halves[0]?.name ?? null;
    const entry = first === null ? null : resolveExpectation(first.subjectKey, table);
    if (first === null || entry?.mode !== 'reference') {
      findings.push(ok('split-rule', `${group}: both halves present`));
      continue;
    }

    /*
     * The halves overlap: each is drawn complete on its own ground diamond, so
     * summing their sprite heights double-counts one diamond. The object's
     * projected height is the sum minus the shared footprint — which is exactly
     * the diamond the derivation already computes.
     */
    const summed = halves.reduce((sum, half) => sum + (half.bounds?.height ?? 0), 0);
    const sprite = spriteFor(first.subjectKey, table);
    const total = summed - (sprite?.metrics.footprintHeight ?? 0);
    const low = entry.height * (1 - entry.tolerance);
    const high = entry.height * (1 + entry.tolerance);
    findings.push(
      total >= low && total <= high
        ? ok(
            'reference-height',
            `${group}: halves total ${total}px (${summed} less one shared footprint), ` +
              `within ${low.toFixed(0)}-${high.toFixed(0)}px`,
          )
        : fail(
            'reference-height',
            `${group}: halves total ${total}px, outside ${low.toFixed(0)}-${high.toFixed(0)}px (${entry.source})`,
          ),
    );
  }
  return findings;
}
