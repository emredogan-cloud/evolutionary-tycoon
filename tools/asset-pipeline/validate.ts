import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { SPLIT_HEIGHT_LIMIT_PX } from '../../src/config/assets.ts';
import { alphaBounds, luminance, readRaw } from './image.ts';
import type { RawImage } from './image.ts';
import { DIRECTIONS, parseAssetName } from './naming.ts';
import type { ParsedName } from './naming.ts';
import { loadPalette, nearest } from './palette.ts';
import type { LoadedPalette } from './palette.ts';
import { PATHS } from './paths.ts';
import { loadSubjectDimensions, resolveExpectation } from './subjectDimensions.ts';
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
  'palette-affinity',
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
  /**
   * True when the check failed but `ACCEPTED_EXCEPTIONS.json` waives it.
   *
   * The distinction is the point: a waived finding still ran, still measured,
   * and is still printed — as `warn`, never as `ok` — so the report can count it
   * and PROJECT_MEMORY can carry the number. Silence would be the lie.
   */
  readonly accepted?: boolean;
  /** The waiver's recorded reason, when one applies. */
  readonly acceptedReason?: string;
}

export interface AssetValidation {
  readonly file: string;
  readonly name: ParsedName | null;
  readonly findings: readonly Finding[];
  readonly ok: boolean;
  /** Trimmed size, carried forward so `process` does not re-decode the image. */
  readonly bounds: { width: number; height: number } | null;
}

export interface AcceptedException {
  readonly file: string;
  readonly check: CheckId;
  readonly measured: string;
  readonly accepted: string;
  readonly reason: string;
}

interface ExceptionFile {
  readonly version: number;
  readonly note: string;
  readonly exceptions: readonly AcceptedException[];
}

let cachedExceptions: readonly AcceptedException[] | undefined;

/**
 * The per-asset waivers of `docs/assets/ACCEPTED_EXCEPTIONS.json`.
 *
 * An empty or missing file means no waivers, which is the state every phase
 * before this one was in and the state the project should return to. Entries
 * are matched on (filename, check) exactly — a waiver for one asset never
 * silently covers another.
 */
export function loadAcceptedExceptions(
  path: string = PATHS.acceptedExceptions,
): readonly AcceptedException[] {
  if (path === PATHS.acceptedExceptions && cachedExceptions !== undefined) return cachedExceptions;
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ExceptionFile;
  const list = parsed.exceptions;
  if (path === PATHS.acceptedExceptions) cachedExceptions = list;
  return list;
}

/** Mark a failed finding as waived, if a waiver names exactly it. */
function applyExceptions(
  filename: string,
  findings: readonly Finding[],
  exceptions: readonly AcceptedException[],
): Finding[] {
  return findings.map((finding) => {
    if (finding.ok) return finding;
    const waiver = exceptions.find((entry) => entry.file === filename && entry.check === finding.check);
    return waiver === undefined ? finding : { ...finding, accepted: true, acceptedReason: waiver.reason };
  });
}

/** A finding that blocks: failed, and not waived. */
export function isBlocking(finding: Finding): boolean {
  return !finding.ok && finding.accepted !== true;
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

/**
 * Categories that are opaque by construction, so check 1 does not apply.
 *
 * A ground bake, a road slice and a parallax backdrop are *surfaces*: they are
 * drawn edge to edge on their own layer beneath everything, and a seamless tile
 * with transparent corners would show the void through the floor. The check
 * exists to catch a subject whose background got baked in behind it; these have
 * no subject and no behind. ADR-013.
 */
const OPAQUE_SURFACE_CATEGORIES: ReadonlySet<string> = new Set(['ground', 'road', 'bg']);

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

/**
 * Alpha at or above which a pixel is treated as the subject's interior.
 *
 * Not 255. A soft particle and a baked ground slice never reach full opacity
 * anywhere, and reading them at `=== 255` samples nothing at all — which is how
 * `fx_steam_soft` and `ground_stage1_tile-a` produced "no fully opaque pixels"
 * on art that is visibly full of colour. The two checks that read colour fall
 * back through this ladder and say which rung they used.
 */
const INTERIOR_ALPHA = [255, 250, 128] as const;

/** Every pixel of the subject's interior, at the strictest rung that finds any. */
function interiorPixels(image: RawImage): { threshold: number; indices: Int32Array } | null {
  for (const threshold of INTERIOR_ALPHA) {
    let count = 0;
    for (let i = 3; i < image.data.length; i += 4) {
      if ((image.data[i] ?? 0) >= threshold) count++;
    }
    if (count === 0) continue;
    const indices = new Int32Array(count);
    let at = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if ((image.data[i + 3] ?? 0) >= threshold) indices[at++] = i;
    }
    return { threshold, indices };
  }
  return null;
}

/**
 * Check 3 — does this asset's colour belong to this project's palette?
 *
 * **This replaces the 92%-within-8 conformance rule, by ADR-013.** That rule
 * asks whether every pixel *is* a palette swatch, which is answerable only for
 * flat-shaded art. The delivered set is continuous-tone illustration: it shades
 * between swatches rather than snapping to them, and measured 3.5–20% against a
 * 92% bar — all 172 assets, including the golden references the style was
 * defined from. Quantising the art to the palette made the number pass and
 * visibly damaged the art. Neither outcome tells you what the check was for.
 *
 * What it was for is *identity*: is this asset from the same world as the rest,
 * or did the generator invent a colour scheme. That survives the change of art
 * direction, and it is measurable as the mean distance from the asset's own
 * pixels to the nearest palette entry.
 *
 * The threshold is not chosen. Uniformly random RGB sits `affinityBaseline`
 * (measured: 51.48) from this palette — the no-information point, where an image
 * shares nothing with it. An asset at or above that has no demonstrable
 * relationship to the palette and fails. Between `affinityWarn` of the baseline
 * and the baseline it is reported as off-family without failing.
 *
 * It is not a formality: the world art measures 12–30 and the UI icon batch
 * measures 40–61, seven of them at or past the random baseline. The check found
 * a real inconsistency in the delivered set on its first run.
 */
function checkPaletteAffinity(image: RawImage, palette: LoadedPalette): Finding {
  const interior = interiorPixels(image);
  if (interior === null) {
    return fail('palette-affinity', 'no pixel reaches alpha 128 — the asset is empty or all edge');
  }

  let sum = 0;
  let worst = 0;
  for (const i of interior.indices) {
    const { distanceSq } = nearest(palette, {
      r: image.data[i] ?? 0,
      g: image.data[i + 1] ?? 0,
      b: image.data[i + 2] ?? 0,
    });
    const distance = Math.sqrt(distanceSq);
    sum += distance;
    if (distance > worst) worst = distance;
  }

  const mean = sum / interior.indices.length;
  const baseline = palette.spec.affinityBaseline;
  const sampled = interior.threshold === 255 ? '' : ` (sampled at alpha >= ${interior.threshold})`;
  const detail =
    `mean distance ${mean.toFixed(1)} over ${interior.indices.length} interior pixels${sampled}; ` +
    `random colour would be ${baseline.toFixed(1)}`;

  if (mean >= baseline) {
    return fail(
      'palette-affinity',
      `${detail} — this asset is no closer to the palette than an arbitrary image, ` +
        `so it carries none of the project's colour identity (furthest pixel ${worst.toFixed(0)})`,
    );
  }
  return mean >= baseline * palette.spec.affinityWarn
    ? {
        check: 'palette-affinity',
        ok: true,
        detail: `${detail} — OFF-FAMILY, above ${(palette.spec.affinityWarn * 100).toFixed(0)}% of the baseline`,
      }
    : ok('palette-affinity', detail);
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
/** The facing index of a parsed name, or null when the subject has no facing. */
export function directionIndexOf(name: ParsedName): number | null {
  if (name.direction === null) return null;
  const index = DIRECTIONS.indexOf(name.direction);
  return index < 0 ? null : index;
}

function checkReferenceHeight(
  name: ParsedName,
  image: RawImage,
  bounds: { width: number; height: number },
  table: SubjectDimensions,
): Finding {
  const expectation = resolveExpectation(name.subjectKey, table, directionIndexOf(name));
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
    /*
     * The *canvas*, not the alpha bounding box.
     *
     * §2 declares "UI ikon, 128²" — a canvas size. Measured against the bounding
     * box the check demands that every icon's ink reach all four edges, which no
     * glyph with a silhouette does: a close cross measured 128x58 and a coin
     * 128x127, and both are correctly drawn on a 128² canvas. It is the same
     * class of mistake PHASE_4_REPORT §12 already records against this check —
     * comparing the right threshold to the wrong quantity — and the fix is the
     * same one: measure what the document names. "Not lost in empty space" is
     * check 2's job and check 2 still does it.
     */
    const matches = image.width === expectation.width && image.height === expectation.height;
    return matches
      ? ok('reference-height', `${image.width}x${image.height} canvas matches the declared size`)
      : fail(
          'reference-height',
          `${image.width}x${image.height} canvas, declared is ` +
            `${expectation.width}x${expectation.height} (${expectation.source})`,
        );
  }

  // A split object is only the right height as a pair, so a half is checked at
  // the set level in `validateDirectory` and passed over here.
  if (name.splitPart !== null) {
    return ok('reference-height', `split half — the pair is checked against ${expectation.height}px`);
  }

  const high = expectation.height * (1 + expectation.tolerance);
  if (bounds.height <= high) {
    return ok(
      'reference-height',
      `${bounds.height}px within the ${expectation.height}px projected box (+${(expectation.tolerance * 100).toFixed(0)}%)`,
    );
  }
  /*
   * An upper bound, not a band.
   *
   * The band assumed the art is drawn in the world's own projection, so a
   * correct sprite would land on the projected height. The delivered set is
   * drawn at a **shallower camera** — a corner-on car is 336x217 where 2:1
   * dimetric projects 336x317 — and `assets:import` fits sprites to the
   * projected *width* because the footprint is what parks in a bay and what the
   * depth sorter anchors to. Under that rule a shorter sprite is a lower camera
   * angle and is fine; a taller one genuinely overflows its own footprint box
   * and will overlap its neighbours. So the check asserts the ceiling, which is
   * the half that can actually go wrong. ADR-013.
   */
  const hint = expectation.splitExpected
    ? ' — this subject is declared `split`, so it should arrive as _lower/_upper halves'
    : '';
  return fail(
    'reference-height',
    `${bounds.height}px exceeds the ${expectation.height}px projected box ` +
      `+${(expectation.tolerance * 100).toFixed(0)}% = ${high.toFixed(0)}px (${expectation.source})${hint}`,
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
  const expectation = resolveExpectation(name.subjectKey, table, directionIndexOf(name));

  /*
   * A fixed-canvas subject has no footprint, so it cannot produce a depth-sort
   * cycle and the rule has nothing to say about it. Without this the 2048x1024
   * ground bake failed at "1024px exceeds 160px and is not named _lower/_upper",
   * which would split a *floor* in half — the rule is about tall objects that
   * overlap their own neighbours, and a baked surface is drawn on the ground
   * layer beneath the sorted plane entirely (`RENDER_LAYERS`). ADR-013.
   */
  if (expectation?.mode === 'canvas') {
    return name.splitPart === null
      ? ok('split-rule', 'fixed-canvas subject — no footprint, so no depth cycle to split')
      : fail('split-rule', `named _${name.splitPart} but a fixed-canvas subject has no footprint to split`);
  }

  /*
   * Vehicles are exempt by scope, not by threshold. §1.4 exists because a tall
   * object standing in the walkable field creates depth cycles — a person can
   * be behind its trunk and in front of its canopy at once, so the object must
   * be two sprites with two depths. A vehicle is one kinematic unit on the
   * road plane: walkers never thread between its halves, the renderer draws
   * every archetype as a single frame per facing, and a delivered bus_lower /
   * bus_upper pair would be files nothing can consume. Change-recorded at the
   * 2026-08-21 consolidation checkpoint; ASSET_PIPELINE §1.4 carries the note.
   */
  if (name.category.id === 'veh') {
    return name.splitPart === null
      ? ok(
          'split-rule',
          'vehicle — one kinematic unit on the road plane; §1.4 scopes splitting to objects the walkable field passes through',
        )
      : fail(
          'split-rule',
          `named _${name.splitPart} but vehicles are drawn whole — halves would be unconsumable`,
        );
  }

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

/**
 * Check 9 — no single file may swallow its category.
 *
 * The stated purpose is "a 2 MB sprite cannot hide inside a 6 MB category", and
 * the original reading of it — three times `budgetBytes / expectedFiles` —
 * compared a **lossless source PNG** against a budget that §13 states for
 * *shipped* bytes. Those are different quantities by roughly a factor of two:
 * the vehicle set is 3.04 MB of source PNG and 1.38 MB of the WebP atlas that
 * actually reaches a player, and `assets:report` now measures the shipped one.
 * Comparing a file in one unit against a budget in the other failed 33 correctly
 * sized sprites.
 *
 * So the absolute rule here is the one that holds in any unit: a single file may
 * not exceed its whole category's budget. The *relative* half — is this file an
 * outlier among its own kind — is a set-level question and lives in
 * `checkCategoryOutliers`, where the other files are in scope. ADR-013.
 */
function checkFileBudget(name: ParsedName, bytes: number): Finding {
  if (name.category.budgetBytes === 0) {
    return ok(
      'file-budget',
      `"${name.category.id}" shares another category's budget; total checked by assets:report`,
    );
  }
  const kb = (value: number): string => `${(value / 1024).toFixed(1)} kB`;
  return bytes <= name.category.budgetBytes
    ? ok('file-budget', `${kb(bytes)} within the ${kb(name.category.budgetBytes)} category budget`)
    : fail(
        'file-budget',
        `${kb(bytes)} is larger than the entire ${kb(name.category.budgetBytes)} "${name.category.id}" budget`,
      );
}

/**
 * A file that costs far more *per pixel* than its peers.
 *
 * Bytes alone would fire on every large object: the `struct` category holds a
 * 1.2 m serving hatch and a 6.5 m food truck, and the truck is legitimately
 * eight times the window. What "hiding inside a category" actually looks like is
 * a sprite that encodes badly for its size — noise, a stray gradient, an alpha
 * channel full of near-zero values — and that shows up as bytes per pixel,
 * which is comparable across a category whatever the subjects are.
 *
 * Categories with fewer than four files are skipped: a median of two is not a
 * distribution.
 */
function checkCategoryOutliers(assets: readonly AssetValidation[]): Finding[] {
  const byCategory = new Map<string, { file: string; bytes: number; density: number }[]>();
  for (const asset of assets) {
    if (asset.name === null || asset.bounds === null) continue;
    const pixels = asset.bounds.width * asset.bounds.height;
    if (pixels === 0) continue;
    const bytes = statSync(asset.file).size;
    const id = asset.name.category.id;
    const list = byCategory.get(id) ?? [];
    list.push({ file: basename(asset.file), bytes, density: bytes / pixels });
    byCategory.set(id, list);
  }

  const findings: Finding[] = [];
  for (const [id, files] of [...byCategory].sort(([a], [b]) => a.localeCompare(b))) {
    if (files.length < 4) continue;
    const densities = files.map((entry) => entry.density).sort((a, b) => a - b);
    const median = densities[Math.floor(densities.length / 2)] ?? 0;
    if (median === 0) continue;
    const cap = median * PER_FILE_BUDGET_MULTIPLIER;
    for (const entry of files.filter((candidate) => candidate.density > cap)) {
      findings.push(
        fail(
          'file-budget',
          `${entry.file}: ${entry.density.toFixed(2)} bytes/px is over ` +
            `${PER_FILE_BUDGET_MULTIPLIER}x the ${median.toFixed(2)} median of "${id}" ` +
            `(${(entry.bytes / 1024).toFixed(1)} kB)`,
        ),
      );
    }
  }
  return findings;
}

export interface ValidateOptions {
  readonly palette?: LoadedPalette;
  readonly subjectDimensions?: SubjectDimensions;
  readonly exceptions?: readonly AcceptedException[];
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
    const waived = applyExceptions(filename, findings, options.exceptions ?? loadAcceptedExceptions());
    return { file, name, bounds: null, ok: !waived.some(isBlocking), findings: waived };
  }

  const image = await readRaw(file);
  const bounds = alphaBounds(image);
  if (bounds === null) {
    findings.push(fail('alpha-coverage', 'the image is fully transparent'));
    return { file, name, bounds: null, ok: false, findings };
  }

  findings.push(
    OPAQUE_SURFACE_CATEGORIES.has(name.category.id)
      ? ok('transparent-background', `"${name.category.id}" is a baked surface — opaque by construction`)
      : checkTransparentBackground(image),
    checkCoverage(image, bounds),
    checkPaletteAffinity(image, palette),
    checkReferenceHeight(name, image, bounds, table),
    checkLightDirection(image, bounds),
    checkSplitRule(name, bounds.height, table),
    checkAnchor(file, image),
    checkFileBudget(name, statSync(file).size),
  );

  const withWaivers = applyExceptions(filename, findings, options.exceptions ?? loadAcceptedExceptions());
  return {
    file,
    name,
    bounds: { width: bounds.width, height: bounds.height },
    ok: !withWaivers.some(isBlocking),
    findings: withWaivers,
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
  const exceptions = options.exceptions ?? loadAcceptedExceptions();
  const setFindings = applyExceptions(
    '(set)',
    [...checkSplitPairs(assets, table), ...checkCategoryOutliers(assets)],
    exceptions,
  );

  return {
    assets,
    setFindings,
    checked: assets.length,
    ok: assets.every((asset) => asset.ok) && !setFindings.some(isBlocking),
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
    const entry =
      first === null ? null : resolveExpectation(first.subjectKey, table, directionIndexOf(first));
    if (first === null || entry?.mode !== 'reference') {
      findings.push(ok('split-rule', `${group}: both halves present`));
      continue;
    }

    /*
     * The halves are complementary, so the pair's height is the plain sum.
     *
     * This used to subtract one ground diamond, on the reading that each half is
     * drawn complete on its own. The prompt asks for the opposite — "cut cleanly
     * at the split line so it stacks onto the lower half" — and the delivered art
     * does that: the lower half is a trunk, the upper half is a canopy, and
     * neither repeats the other's ground. Subtracting a diamond that is not
     * there let a 5 m tree through at 7 m, which is what it looked like next to
     * the stand.
     */
    const total = halves.reduce((sum, half) => sum + (half.bounds?.height ?? 0), 0);
    const high = entry.height * (1 + entry.tolerance);
    findings.push(
      total <= high
        ? ok(
            'reference-height',
            `${group}: halves total ${total}px, within the ${entry.height}px projected box`,
          )
        : fail(
            'reference-height',
            `${group}: halves total ${total}px, over ${high.toFixed(0)}px (${entry.source})`,
          ),
    );
  }
  return findings;
}
