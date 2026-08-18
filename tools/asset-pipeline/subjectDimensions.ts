import { readFileSync } from 'node:fs';
import { isoSpriteMetrics, isoSpriteMetricsFacing } from '../shared/spriteMetrics.ts';
import type { WorldBox } from '../shared/spriteMetrics.ts';
import { SPLIT_HEIGHT_LIMIT_PX } from '../../src/config/assets.ts';
import { PATHS } from './paths.ts';

/**
 * What each subject is, in metres, and the sprite size that follows.
 *
 * v1 of this file held pixel heights copied from ASSET_PIPELINE §1.2 and refused
 * to guess the ones §1.2 does not state. Both halves of that were wrong:
 *
 *  - The §1.2 numbers are **world** heights (`metres x TILE_Z x ART_SCALE`),
 *    while the validator measures a **drawn sprite**, which also carries the
 *    projected ground diamond. For a 4.5 x 1.9 m car those are 90 px and 301 px.
 *    Comparing one against the other would have rejected every correct vehicle.
 *  - Refusing to guess was right about *pixels* and wrong about *metres*. A
 *    wheelie bin being 0.6 x 0.6 x 1.1 m is a fact about bins, checkable against
 *    the world; "96 px tall" would have been an art decision. `src/config/actors.ts`
 *    already holds real dimensions for exactly this reason.
 *
 * So subjects are declared in metres and the pixel expectation is derived, which
 * means it cannot drift from the projection the renderer actually uses.
 */

export interface WorldSubject extends WorldBox {
  readonly source: string;
}

export interface FixedCanvasSubject {
  readonly width: number;
  readonly height: number;
  readonly source: string;
}

export interface SubjectDimensions {
  readonly version: number;
  readonly scale: number;
  readonly tolerance: number;
  readonly worldObjects: { readonly subjects: Readonly<Record<string, WorldSubject>> };
  readonly characterEnvelope: WorldBox & { readonly source: string };
  readonly fixedCanvas: { readonly subjects: Readonly<Record<string, FixedCanvasSubject>> };
}

let cached: SubjectDimensions | undefined;

export function loadSubjectDimensions(path: string = PATHS.subjectDimensions): SubjectDimensions {
  if (path === PATHS.subjectDimensions && cached !== undefined) return cached;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as SubjectDimensions;
  if (path === PATHS.subjectDimensions) cached = parsed;
  return parsed;
}

/**
 * What the validator should expect for a subject.
 *
 * `reference` — a derived sprite height, checked within `tolerance`.
 * `envelope`  — an upper bound only, for doll-rig parts that have no box.
 * `canvas`    — a fixed canvas size, for icons and slices with no footprint.
 * `null`      — nothing declared; the caller must fail rather than pass.
 */
export type Expectation =
  | {
      readonly mode: 'reference';
      /** Full projected sprite height, footprint diamond included. */
      readonly height: number;
      /** The body alone — the quantity ASSET_PIPELINE §1.4's 160 px measures. */
      readonly bodyHeight: number;
      readonly tolerance: number;
      readonly source: string;
      readonly splitExpected: boolean;
    }
  | { readonly mode: 'envelope'; readonly height: number; readonly source: string }
  | { readonly mode: 'canvas'; readonly width: number; readonly height: number; readonly source: string };

export function resolveExpectation(
  subjectKey: string,
  table: SubjectDimensions = loadSubjectDimensions(),
  /**
   * Which of the eight facings, for a directional sprite.
   *
   * A car seen side-on is 407 x 182 px and the same car seen corner-on is
   * 336 x 317 — one subject, two correct heights. Checking every facing against
   * the axis-aligned projection rejects the six that are not axis-aligned, which
   * is the same failure mode PHASE_4_REPORT §12 records for world-versus-sprite
   * heights, one level down. `null` keeps the axis-aligned box, which is right
   * for everything that has no facing.
   */
  directionIndex: number | null = null,
): Expectation | null {
  const category = subjectKey.split('/')[0] ?? '';

  const world = table.worldObjects.subjects[subjectKey];
  if (world !== undefined) {
    const metrics =
      directionIndex === null
        ? isoSpriteMetrics(world, table.scale)
        : isoSpriteMetricsFacing(world, directionIndex, table.scale);
    return {
      mode: 'reference',
      height: metrics.height,
      tolerance: table.tolerance,
      source: world.source,
      bodyHeight: metrics.bodyHeight,
      splitExpected: metrics.bodyHeight > SPLIT_HEIGHT_LIMIT_PX,
    };
  }

  if (category === 'char') {
    const metrics = isoSpriteMetrics(table.characterEnvelope, table.scale);
    return { mode: 'envelope', height: metrics.height, source: table.characterEnvelope.source };
  }

  const fixed = table.fixedCanvas.subjects[`${category}/*`];
  if (fixed !== undefined) {
    return { mode: 'canvas', width: fixed.width, height: fixed.height, source: fixed.source };
  }

  return null;
}

export interface SubjectSprite {
  readonly box: WorldSubject;
  readonly metrics: ReturnType<typeof isoSpriteMetrics>;
}

/** Sprite geometry for a declared world subject — used by the prompt emitter. */
export function spriteFor(
  subjectKey: string,
  table: SubjectDimensions = loadSubjectDimensions(),
  directionIndex: number | null = null,
): SubjectSprite | null {
  const world = table.worldObjects.subjects[subjectKey];
  if (world === undefined) return null;
  return {
    box: world,
    metrics:
      directionIndex === null
        ? isoSpriteMetrics(world, table.scale)
        : isoSpriteMetricsFacing(world, directionIndex, table.scale),
  };
}
