import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { WORLD_OBJECTS } from '@config/sprites';
import { ART_SCALE, TILE_Z } from '@config/world';

/**
 * A split object has to compose back into one object.
 *
 * ASSET_PIPELINE §1.4 splits anything over 160 px so the painter's algorithm
 * cannot form a cycle. It says nothing about the two halves *meeting*, because
 * a scanline cut of one painting meets by construction — and the delivered set
 * is not that. Each half was generated on its own, so the two cut edges are two
 * different drawings and the pair can stack into a tree whose crown floats
 * above four amputated branches. That is what the user photographed on
 * 2026-08-23, and reconstructing the pair by eye had already passed it once:
 * whole-sprite composites look plausible while the *join row* does not match.
 *
 * So the measurement is on the join row alone, and it is the one the renderer
 * actually produces:
 *
 *   `WorldScene.drawStatic` puts the upper half's bottom edge one screen pixel
 *   below the lower half's top edge, plus `upperOverlapMetres x TILE_Z`. The
 *   upper row that lands on the lower's top row therefore sits `join` art
 *   pixels up from the upper's bottom.
 *
 * `coverage` is the fraction of the lower half's top-row opaque columns that
 * have upper-half material at that row. A stump with nothing above it is a
 * branch cut off in mid-air; below 0.9 the join is visible at gameplay zoom.
 *
 * The reverse quantity — upper material with no lower material under it — is
 * deliberately **not** asserted: foliage overhangs a trunk and a lamp head
 * overhangs its pole, and both are correct.
 */

const SOURCE_DIR = join(process.cwd(), 'assets', 'source');

/** Below this, the join reads as two objects rather than one. */
const MIN_JOIN_COVERAGE = 0.9;

interface Half {
  readonly width: number;
  readonly height: number;
  /** Opaque columns of one row, relative to the trimmed image's centre. */
  columnsAt: (row: number) => ReadonlySet<number>;
}

const ALPHA_FLOOR = 16;

async function loadHalf(frame: string): Promise<Half> {
  const file = join(SOURCE_DIR, frame);
  const image = sharp(file).ensureAlpha();
  // `assets/source` keeps a transparent margin that `assets:process` trims, so
  // the frame the renderer sees is this image's alpha bounding box.
  const { data, info } = await image.trim({ threshold: 1 }).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const centre = width / 2;
  return {
    width,
    height,
    columnsAt: (row: number): ReadonlySet<number> => {
      const columns = new Set<number>();
      if (row < 0 || row >= height) return columns;
      const base = row * width * channels;
      for (let x = 0; x < width; x++) {
        const alpha = data[base + x * channels + (channels - 1)] ?? 0;
        if (alpha > ALPHA_FLOOR) columns.add(Math.round(x - centre));
      }
      return columns;
    },
  };
}

interface Pair {
  readonly id: string;
  readonly lower: string;
  readonly upper: string;
  readonly overlapMetres: number;
}

const PAIRS: readonly Pair[] = WORLD_OBJECTS.filter(
  (spec): spec is (typeof WORLD_OBJECTS)[number] & { upperFrame: string } =>
    typeof (spec as { upperFrame?: string }).upperFrame === 'string',
).map((spec) => ({
  id: spec.id,
  lower: spec.frame,
  upper: spec.upperFrame,
  overlapMetres: (spec as { upperOverlapMetres?: number }).upperOverlapMetres ?? 0,
}));

/** The renderer's own arithmetic, in art pixels. */
function joinArtPixels(overlapMetres: number): number {
  return (1 + Math.round(overlapMetres * TILE_Z)) * ART_SCALE;
}

describe('split halves compose into one object', () => {
  beforeAll(() => {
    // The delivered art is checked in; a missing directory is a broken checkout
    // rather than a reason to skip the only test that looks at pixels.
    expect(existsSync(SOURCE_DIR), `${SOURCE_DIR} is missing`).toBe(true);
  });

  it('has at least one split pair to check', () => {
    expect(PAIRS.length).toBeGreaterThan(0);
  });

  for (const pair of PAIRS) {
    it(`${pair.id}: the crown meets the trunk`, async () => {
      const [lower, upper] = await Promise.all([loadHalf(pair.lower), loadHalf(pair.upper)]);

      const join = joinArtPixels(pair.overlapMetres);
      expect(join, `${pair.id}: overlap larger than the upper half`).toBeLessThan(upper.height);

      const lowerTop = lower.columnsAt(0);
      expect(lowerTop.size, `${pair.id}: the lower half's top row is empty`).toBeGreaterThan(0);

      const upperJoin = upper.columnsAt(upper.height - join);
      let covered = 0;
      for (const column of lowerTop) if (upperJoin.has(column)) covered++;
      const coverage = covered / lowerTop.size;

      expect(
        coverage,
        `${pair.id}: ${(coverage * 100).toFixed(0)}% of the lower half's top row has upper-half ` +
          `material above it at the declared ${pair.overlapMetres} m overlap (${join} art px). ` +
          `Below ${(MIN_JOIN_COVERAGE * 100).toFixed(0)}% the object renders as two pieces.`,
      ).toBeGreaterThanOrEqual(MIN_JOIN_COVERAGE);
    });
  }
});
