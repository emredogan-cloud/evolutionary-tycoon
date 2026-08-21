import { readFileSync } from 'node:fs';
import { PATHS } from './paths.ts';

/**
 * The locked palette, and the distance test the validator runs against it.
 *
 * ASSET_PIPELINE §1.1 makes the palette part of the style contract rather than a
 * suggestion: an asset outside it is rejected. §4.3 step 4 gave the original
 * threshold — at least 92% of pixels within a distance of 8 of some palette
 * entry. Every number lives in `palette.json` so the contract is one file, not a
 * file plus constants buried in code.
 *
 * **That conformance rule was written for flat-shaded art and the delivered set
 * is not flat-shaded** (ADR-013). `tolerance` and `coverage` are kept because
 * they still describe the palette's own geometry — no two entries are closer to
 * each other than `tolerance`, which is what makes each one a distinct target —
 * but the check the validator runs is now `palette-affinity`, against
 * `affinityBaseline`. Both live here for the same reason the first pair did.
 */

export interface PaletteColor {
  readonly id: string;
  readonly hex: string;
  readonly use: string;
}

export interface PaletteRamp {
  readonly id: string;
  readonly role: string;
  readonly colors: readonly PaletteColor[];
}

export interface Palette {
  readonly version: number;
  readonly name: string;
  readonly size: number;
  /** Maximum RGB distance a pixel may sit from its nearest entry. */
  readonly tolerance: number;
  /** Fraction of opaque pixels that must be within `tolerance`. */
  readonly coverage: number;
  /**
   * Mean nearest-palette distance of uniformly random RGB — the no-information
   * point. Measured, not chosen: see `palette.json`'s note and ADR-013.
   */
  readonly affinityBaseline: number;
  /** Fraction of the baseline above which an asset is reported off-family. */
  readonly affinityWarn: number;
  readonly ramps: readonly PaletteRamp[];
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX = /^#[0-9A-F]{6}$/;

export function parseHex(hex: string): Rgb {
  if (!HEX.test(hex)) {
    throw new Error(`palette: "${hex}" is not an uppercase #RRGGBB colour`);
  }
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

let cached: LoadedPalette | undefined;

export interface LoadedPalette {
  readonly spec: Palette;
  readonly colors: readonly PaletteColor[];
  readonly rgb: readonly Rgb[];
}

export function loadPalette(path: string = PATHS.palette): LoadedPalette {
  if (path === PATHS.palette && cached !== undefined) return cached;

  const spec = JSON.parse(readFileSync(path, 'utf8')) as Palette;
  const colors = spec.ramps.flatMap((ramp) => ramp.colors);

  // The palette declares its own size. If the two disagree the contract is
  // ambiguous, and a validator running against an ambiguous contract is worse
  // than no validator — it produces confident wrong answers.
  if (colors.length !== spec.size) {
    throw new Error(`palette: declares size ${spec.size} but contains ${colors.length} colours`);
  }
  const ids = new Set(colors.map((color) => color.id));
  if (ids.size !== colors.length) {
    throw new Error('palette: duplicate colour id');
  }

  const loaded: LoadedPalette = { spec, colors, rgb: colors.map((color) => parseHex(color.hex)) };
  if (path === PATHS.palette) cached = loaded;
  return loaded;
}

/**
 * Squared Euclidean distance in RGB.
 *
 * Squared, because the validator compares against a threshold and every square
 * root would be wasted work — this runs once per pixel over a 2048-square image,
 * which is four million calls per asset. Callers compare against
 * `tolerance * tolerance`.
 *
 * Plain RGB rather than a perceptual space (CIEDE2000, OKLab) is deliberate: the
 * threshold is not "can a human tell these apart", it is "did the generator stay
 * on the palette". A generator that lands 6 units away in RGB has reproduced the
 * swatch; one that lands 40 away has invented a colour. Perceptual weighting
 * would make that judgement fuzzier, not sharper, and would make the number in
 * `palette.json` mean something no artist can check with a colour picker.
 */
export function distanceSq(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Index of the nearest palette entry, and how far away it is (squared). */
export function nearest(palette: LoadedPalette, color: Rgb): { index: number; distanceSq: number } {
  let bestIndex = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.rgb.length; i++) {
    const entry = palette.rgb[i];
    if (entry === undefined) continue;
    const d = distanceSq(entry, color);
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distanceSq: best };
}
