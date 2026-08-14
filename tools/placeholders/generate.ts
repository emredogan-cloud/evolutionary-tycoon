import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACTOR_KIND_SPECS } from '../../src/config/actors';
import { ART_SCALE, TILE_H, TILE_W, TILE_Z } from '../../src/config/world';
import { drawText, measureText } from './font';
import { PixelCanvas } from './png';
import type { Rgba } from './png';

/**
 * Generate the placeholder sprite set.
 *
 * **Placeholders are supposed to look wrong.** WORKING_DISCIPLINE §7: using one
 * is fine, hiding one is not. A placeholder that looks passable is the dangerous
 * kind, because it survives into a build nobody re-examines. These are magenta
 * and black checkers with the asset's name written across them, at the exact
 * dimensions the real art will occupy — so replacing one is a swap, not a
 * re-layout, and forgetting to replace one is impossible to miss.
 *
 * Generated rather than drawn so the size follows from the world dimensions in
 * `src/config`. A person is 1.75 m tall because the traffic model says so; the
 * sprite is 112 px tall because of the projection. Neither number is typed here.
 *
 * Run: `pnpm placeholders:build`
 */

const MAGENTA: Rgba = { r: 255, g: 0, b: 255, a: 255 };
const BLACK: Rgba = { r: 16, g: 16, b: 20, a: 255 };
const LABEL: Rgba = { r: 255, g: 255, b: 255, a: 255 };
const LABEL_SHADOW: Rgba = { r: 0, g: 0, b: 0, a: 255 };
const ANCHOR: Rgba = { r: 0, g: 255, b: 128, a: 255 };

const CHECKER_SIZE = 8;

export interface PlaceholderSpec {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  /** Footprint centre within the sprite, in pixels from the top-left. */
  readonly anchorX: number;
  readonly anchorY: number;
  readonly label: string;
}

/**
 * Sprite dimensions for a world-space box.
 *
 * The footprint of an axis-aligned world box projects to a diamond
 * `(fx + fy) * TILE_W/2` across and `(fx + fy) * TILE_H/2` tall; the body adds
 * `height * TILE_Z` above it. Everything is then multiplied by ART_SCALE,
 * because art is authored at 2x and downscaled.
 */
export function placeholderSpecs(): PlaceholderSpec[] {
  return ACTOR_KIND_SPECS.map((kind) => {
    const footprintSpan = kind.footprintX + kind.footprintY;
    const diamondWidth = footprintSpan * (TILE_W / 2);
    const diamondHeight = footprintSpan * (TILE_H / 2);
    const bodyHeight = kind.heightMetres * TILE_Z;

    const width = Math.max(4, Math.round(diamondWidth * ART_SCALE));
    const height = Math.max(4, Math.round((diamondHeight + bodyHeight) * ART_SCALE));

    return {
      key: kind.textureKey,
      width,
      height,
      // The anchor is the footprint centre: horizontally the middle, vertically
      // the centre of the ground diamond at the bottom. Depth sorting anchors
      // here, so a wrong value here is a wrong sort everywhere.
      anchorX: Math.round(width / 2),
      anchorY: Math.round(height - (diamondHeight * ART_SCALE) / 2),
      label: kind.name,
    };
  });
}

export function renderPlaceholder(spec: PlaceholderSpec): Buffer {
  const canvas = new PixelCanvas(spec.width, spec.height);

  for (let y = 0; y < spec.height; y += CHECKER_SIZE) {
    for (let x = 0; x < spec.width; x += CHECKER_SIZE) {
      const dark = (Math.floor(x / CHECKER_SIZE) + Math.floor(y / CHECKER_SIZE)) % 2 === 0;
      canvas.fillRect(x, y, CHECKER_SIZE, CHECKER_SIZE, dark ? BLACK : MAGENTA);
    }
  }

  // A one-pixel border, so a sprite drawn at the wrong scale or clipped by an
  // atlas packing bug is obvious rather than subtle.
  canvas.fillRect(0, 0, spec.width, 1, LABEL);
  canvas.fillRect(0, spec.height - 1, spec.width, 1, LABEL);
  canvas.fillRect(0, 0, 1, spec.height, LABEL);
  canvas.fillRect(spec.width - 1, 0, 1, spec.height, LABEL);

  const scale = spec.width >= 96 ? 2 : 1;
  const text = spec.label.toUpperCase();
  const measured = measureText(text, scale);
  const textX = Math.max(1, Math.round((spec.width - measured.width) / 2));
  const textY = Math.max(1, Math.round((spec.height - measured.height) / 2));
  drawText(canvas, text, textX + 1, textY + 1, scale, LABEL_SHADOW);
  drawText(canvas, text, textX, textY, scale, LABEL);

  // A visible anchor cross. When depth sorting looks wrong, the first question
  // is always "is the anchor where the code thinks it is".
  canvas.fillRect(spec.anchorX - 3, spec.anchorY, 7, 1, ANCHOR);
  canvas.fillRect(spec.anchorX, spec.anchorY - 3, 1, 7, ANCHOR);

  return canvas.encode();
}

export function generatePlaceholders(outputDir: string): PlaceholderSpec[] {
  mkdirSync(outputDir, { recursive: true });
  const specs = placeholderSpecs();
  for (const spec of specs) {
    writeFileSync(resolve(outputDir, `${spec.key}__PLACEHOLDER__.png`), renderPlaceholder(spec));
  }
  return specs;
}
