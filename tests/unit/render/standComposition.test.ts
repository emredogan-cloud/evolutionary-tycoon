import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { worldObject } from '@config/sprites';
import { ART_SCALE, TILE_H, TILE_W, TILE_Z } from '@config/world';
import { computeDepth } from '@render/iso/DepthSorter';

/**
 * The canopy has to be over the counter, not on it.
 *
 * Every earlier attempt at this object was judged by eye and every one was
 * wrong in a different way — flat on the road apron, then lying across the
 * merchandise. Both times the geometry was available and nobody did the
 * arithmetic, so this test does it, in pixels, from the delivered art and the
 * layout's own z:
 *
 *   composite the two sprites where the renderer would draw them, then count
 *   how much of the counter the canopy paints over.
 *
 * Measured from the art rather than from `isoSpriteMetrics`, because what hides
 * a till is where the alpha actually is. The awning overflows its projected box
 * by about 12%, and that overflow is exactly the part that was doing the
 * hiding.
 */

const SOURCE_DIR = join(process.cwd(), 'assets', 'source');

const ALPHA_FLOOR = 16;

/**
 * The upper 45% of the counter sprite.
 *
 * Where the till, the display case, the drinks and the plant are drawn — the
 * part that says this is a place that sells food. A canopy is allowed to clip
 * the far corner of the cabinet; it is not allowed to sit on the goods.
 */
const TOP_BAND = 0.45;

/** One item's worth at the far edge. Above this the stand stops reading. */
const MAX_TOP_BAND_HIDDEN = 0.1;

interface Placed {
  readonly alpha: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** Screen position of the sprite's top-left corner. */
  readonly left: number;
  readonly top: number;
  readonly depth: number;
}

async function place(objectId: string, entityId: number): Promise<Placed> {
  const at = STAGE1_LAYOUT.statics.find((entry) => entry.objectId === objectId);
  if (at === undefined) throw new Error(`stage 1 does not place ${objectId}`);
  const spec = worldObject(objectId);
  if (spec === undefined) throw new Error(`no world object ${objectId}`);

  const file = join(SOURCE_DIR, spec.frame);
  // `assets/source` keeps a transparent margin that `assets:process` trims, so
  // the frame the renderer sees is this image's alpha bounding box.
  const trimmed = await sharp(file)
    .ensureAlpha()
    .trim({ threshold: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const full = await sharp(file).metadata();

  const { width, height, channels } = trimmed.info;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = trimmed.data[i * channels + (channels - 1)] ?? 0;
  }

  const raw = readFileSync(file.replace(/\.png$/, '.meta.json'), 'utf8');
  const anchor = (JSON.parse(raw) as { anchor: { x: number; y: number } }).anchor;
  // The trim takes the same margin off every side, and the sidecar anchor is in
  // padded coordinates.
  const padX = (full.width - width) / 2;
  const padY = (full.height - height) / 2;
  const anchorX = anchor.x - padX;
  const anchorY = anchor.y - padY;

  const screenX = (at.x - at.y) * (TILE_W / 2);
  const screenY = (at.x + at.y) * (TILE_H / 2) - at.z * TILE_Z;

  return {
    alpha,
    width,
    height,
    /*
     * Positions in **frame** pixels, not screen pixels. Sprites draw at
     * 1 / ART_SCALE, so one screen pixel is two frame pixels; comparing two
     * sprites pixel for pixel means scaling the screen positions up rather
     * than scaling the frames down, which would resample the alpha.
     */
    left: screenX * ART_SCALE - anchorX,
    top: screenY * ART_SCALE - anchorY,
    depth: computeDepth(at.x, at.y, at.z, entityId),
  };
}

function opaque(sprite: Placed, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return false;
  return (sprite.alpha[y * sprite.width + x] ?? 0) > ALPHA_FLOOR;
}

/** Fraction of `under`'s opaque pixels that `over` paints on top of. */
function hiddenFraction(under: Placed, over: Placed, rows: number): number {
  let total = 0;
  let hidden = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < under.width; x++) {
      if (!opaque(under, x, y)) continue;
      total++;
      // Both are drawn at the same scale, so screen offsets are frame offsets.
      const ox = Math.round(under.left - over.left) + x;
      const oy = Math.round(under.top - over.top) + y;
      if (opaque(over, ox, oy)) hidden++;
    }
  }
  return total === 0 ? 0 : hidden / total;
}

describe('the stage-1 stand reads as a counter under a canopy', () => {
  it('leaves the goods on the counter visible', async () => {
    const [counter, awning] = await Promise.all([place('counter-lv1', 1), place('awning', 2)]);

    const band = Math.round(counter.height * TOP_BAND);
    const hidden = hiddenFraction(counter, awning, band);

    expect(
      hidden,
      `the canopy covers ${(hidden * 100).toFixed(0)}% of the counter's top band. ` +
        `At the 2026-08-22 placement (z 1.75) it covered 87% — the till, the display case ` +
        `and the drinks were all under the fabric.`,
    ).toBeLessThanOrEqual(MAX_TOP_BAND_HIDDEN);
  });

  it('puts the canopy over the counter rather than beside it', () => {
    const counter = STAGE1_LAYOUT.statics.find((entry) => entry.objectId === 'counter-lv1');
    const awning = STAGE1_LAYOUT.statics.find((entry) => entry.objectId === 'awning');
    expect(counter).toBeDefined();
    expect(awning).toBeDefined();
    if (counter === undefined || awning === undefined) return;

    // One plan centre. A canopy offset in x or y reads as a separate object
    // floating next to the stand, which is what the up-left drift looked like.
    expect(awning.x).toBeCloseTo(counter.x, 5);
    expect(awning.y).toBeCloseTo(counter.y, 5);

    // And genuinely overhead: clear of a 1.75 m person standing at the counter.
    expect(awning.z).toBeGreaterThan(1.75);
  });

  it('draws the canopy in front of the counter, never behind it', async () => {
    const [counter, awning] = await Promise.all([place('counter-lv1', 1), place('awning', 2)]);
    // Same footprint centre, so elevation is the only thing separating them —
    // which is the case `Z_WEIGHT` exists for.
    expect(awning.depth).toBeGreaterThan(counter.depth);
  });
});
