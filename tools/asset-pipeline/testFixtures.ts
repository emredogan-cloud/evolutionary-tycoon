import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { loadPalette, parseHex } from './palette.ts';
import type { LoadedPalette, Rgb } from './palette.ts';
import { metaPathFor } from './validate.ts';

/**
 * Synthetic sprites for exercising the pipeline.
 *
 * **These are not assets and never ship.** They exist so that every check in
 * `validate.ts`, every stage of `process.ts` and the atlas packer can be proven
 * to work — and proven to *fail* on the right input — without any production
 * art. A validator that has only ever been run on things it accepts is not
 * evidence of anything.
 *
 * They are generated rather than committed because the palette is the contract:
 * change a swatch in `palette.json` and the fixtures follow, so a test cannot
 * quietly start asserting against a stale palette.
 *
 * Deliberately crude — flat bands, no craft. Anything that looked like art here
 * would eventually be mistaken for art (WORKING_DISCIPLINE §7).
 */

export interface FixtureOptions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** Ramp id from palette.json, e.g. `timber`. */
  readonly ramp: string;
  /** Margin in pixels on every side; the subject fills what is left. */
  readonly margin?: number;
  /** Flatten the shading, which makes the light-direction check fail. */
  readonly flat?: boolean;
  /** Reverse the shading, which puts the key light in the lower right. */
  readonly reverseLight?: boolean;
  /** Paint an opaque background, which fails the transparency check. */
  readonly opaqueBackground?: boolean;
  /** Use a colour that is nowhere near the palette. */
  readonly offPalette?: boolean;
}

function rampColors(palette: LoadedPalette, id: string): readonly Rgb[] {
  const ramp = palette.spec.ramps.find((entry) => entry.id === id);
  if (ramp === undefined) throw new Error(`fixture: no ramp "${id}" in the palette`);
  return ramp.colors.map((color) => parseHex(color.hex));
}

/** Raw RGBA for a fixture sprite. */
export function fixturePixels(options: FixtureOptions, palette: LoadedPalette = loadPalette()): Buffer {
  const { canvasWidth: w, canvasHeight: h, margin = 2 } = options;
  const ramp = rampColors(palette, options.ramp);
  const [shadow, base, mid, lit] = ramp as [Rgb, Rgb, Rgb, Rgb];
  const off: Rgb = { r: 255, g: 0, b: 255 };

  const left = margin;
  const top = margin;
  const right = w - margin - 1;
  const bottom = h - margin - 1;

  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x >= left && x <= right && y >= top && y <= bottom;

      if (!inside) {
        if (options.opaqueBackground === true) {
          data[i] = base.r;
          data[i + 1] = base.g;
          data[i + 2] = base.b;
          data[i + 3] = 255;
        }
        continue;
      }

      const edge = x === left || x === right || y === top || y === bottom;
      const nx = (x - left) / Math.max(1, right - left);
      const ny = (y - top) / Math.max(1, bottom - top);
      const diagonal = options.reverseLight === true ? 2 - (nx + ny) : nx + ny;

      let color: Rgb;
      if (options.offPalette === true) color = off;
      else if (edge) color = shadow;
      else if (options.flat === true) color = mid;
      else if (diagonal < 0.66) color = lit;
      else if (diagonal < 1.34) color = mid;
      else color = base;

      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Write a fixture PNG and its anchor sidecar.
 *
 * `anchor` defaults to the bottom-centre of the subject — the footprint centre
 * for anything standing on the ground (§1.3).
 */
export async function writeFixture(
  dir: string,
  filename: string,
  options: FixtureOptions,
  anchor?: { x: number; y: number } | null,
): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  const data = fixturePixels(options);

  await sharp(data, {
    raw: { width: options.canvasWidth, height: options.canvasHeight, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(path);

  if (anchor !== null) {
    const margin = options.margin ?? 2;
    const resolved = anchor ?? {
      x: Math.round(options.canvasWidth / 2),
      y: options.canvasHeight - margin - 1,
    };
    writeFileSync(metaPathFor(path), `${JSON.stringify({ anchor: resolved }, null, 2)}\n`);
  }
  return path;
}
