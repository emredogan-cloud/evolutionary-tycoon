import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { PRODUCTION_SCALE } from '../../src/config/assets.ts';
import { alphaBounds, readRaw } from './image.ts';
import { parseAssetName } from './naming.ts';
import { PATHS } from './paths.ts';
import { metaPathFor } from './validate.ts';
import type { AnchorMeta } from './validate.ts';

/**
 * Source art to runtime art: trim, re-anchor, normalise, downscale.
 *
 * Four things happen here and each one exists for a reason that bites later if
 * skipped:
 *
 *  - **Trim** to the alpha bounding box. Transparent padding costs atlas area,
 *    and atlas area is the budget in ASSET_PIPELINE §13.
 *  - **Re-anchor**. The footprint anchor was authored in source coordinates; the
 *    trim moves the origin, so the anchor must move with it. Getting this wrong
 *    is not subtle — it is every sprite sorting against the wrong depth.
 *  - **sRGB**. A file tagged Display P3 and a file tagged sRGB with identical
 *    bytes are different colours on screen. Normalising once means the palette
 *    check and the renderer agree.
 *  - **1x variant**, for devices where the 2x atlas is not worth the memory.
 *
 * **Output must be deterministic** — the roadmap makes this a requirement, not a
 * nicety: the manifest hashes the output, the CDN caches on that hash, and a
 * pipeline that emits different bytes for identical input invalidates the whole
 * cache on every build. `tests/unit/tools/process.test.ts` runs the stage twice
 * and compares hashes rather than assuming it.
 */

export interface ProcessedAsset {
  readonly source: string;
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly anchor: { x: number; y: number };
  readonly trimmed: { left: number; top: number };
}

/**
 * PNG encoder settings, fixed so two runs cannot differ.
 *
 * `effort` and `compressionLevel` change the *bytes*, not just the time, so they
 * are pinned rather than left to a default that could move in a patch release.
 */
const PNG_OPTIONS = {
  compressionLevel: 9,
  effort: 10,
  palette: false,
  // libpng's adaptive filtering picks per row from image content alone, so it is
  // already deterministic; naming it here documents that it was considered.
  adaptiveFiltering: true,
} as const;

export async function processAsset(file: string, outputDir: string): Promise<ProcessedAsset> {
  const filename = basename(file);
  const parsed = parseAssetName(filename);
  if (!parsed.ok) {
    throw new Error(`process: ${filename} — ${parsed.reason}`);
  }

  const image = await readRaw(file);
  const bounds = alphaBounds(image);
  if (bounds === null) {
    throw new Error(`process: ${filename} is fully transparent`);
  }

  const metaPath = metaPathFor(file);
  if (!existsSync(metaPath)) {
    throw new Error(`process: ${filename} has no anchor sidecar — run assets:validate first`);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as AnchorMeta;

  mkdirSync(outputDir, { recursive: true });
  const output = join(outputDir, filename);

  await sharp(file)
    .toColorspace('srgb')
    .ensureAlpha()
    .extract({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height })
    .png(PNG_OPTIONS)
    .toFile(output);

  const anchor = { x: meta.anchor.x - bounds.left, y: meta.anchor.y - bounds.top };
  writeFileSync(metaPathFor(output), `${JSON.stringify({ anchor }, null, 2)}\n`);

  return {
    source: file,
    output,
    width: bounds.width,
    height: bounds.height,
    anchor,
    trimmed: { left: bounds.left, top: bounds.top },
  };
}

/**
 * The 1x companion of a 2x asset.
 *
 * Not produced for every asset — only where a 1x atlas is actually built. The
 * anchor halves with the image, and is rounded rather than floored so a sprite
 * does not drift half a pixel up the screen at 1x.
 */
export async function downscale(processed: ProcessedAsset, outputDir: string): Promise<ProcessedAsset> {
  const parsed = parseAssetName(basename(processed.output));
  if (!parsed.ok || parsed.name.scale !== PRODUCTION_SCALE) {
    throw new Error(`process: ${basename(processed.output)} is not a @${PRODUCTION_SCALE}x asset`);
  }

  mkdirSync(outputDir, { recursive: true });
  const filename = basename(processed.output).replace(`@${PRODUCTION_SCALE}x.`, '@1x.');
  const output = join(outputDir, filename);

  const width = Math.max(1, Math.round(processed.width / PRODUCTION_SCALE));
  const height = Math.max(1, Math.round(processed.height / PRODUCTION_SCALE));

  await sharp(processed.output)
    // Lanczos3 over the alpha channel as well, so the 2px outline survives the
    // halving instead of turning into a fringe.
    .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
    .png(PNG_OPTIONS)
    .toFile(output);

  const anchor = {
    x: Math.round(processed.anchor.x / PRODUCTION_SCALE),
    y: Math.round(processed.anchor.y / PRODUCTION_SCALE),
  };
  writeFileSync(metaPathFor(output), `${JSON.stringify({ anchor }, null, 2)}\n`);

  return { source: processed.output, output, width, height, anchor, trimmed: { left: 0, top: 0 } };
}

export async function processDirectory(
  sourceDir: string = PATHS.source,
  outputDir: string = PATHS.processed,
): Promise<ProcessedAsset[]> {
  if (!existsSync(sourceDir)) return [];

  const files = readdirSync(sourceDir)
    .filter((entry) => !entry.endsWith('.meta.json'))
    .filter((entry) => statSync(join(sourceDir, entry)).isFile())
    // Sorted so the processed directory is written in a fixed order. The atlas
    // packer's layout depends on input order, so this sort is load-bearing.
    .sort();

  const processed: ProcessedAsset[] = [];
  for (const file of files) {
    const parsed = parseAssetName(file);
    if (!parsed.ok || parsed.name.category.kind !== 'image') continue;
    processed.push(await processAsset(join(sourceDir, file), outputDir));
  }
  return processed;
}
