import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { packAsync } from 'free-tex-packer-core';
import sharp from 'sharp';
import { ATLASES, ATLAS_MIN_FILL } from '../../src/config/assets.ts';
import type { AtlasSpec } from '../../src/config/assets.ts';
import { parseAssetName } from './naming.ts';
import { PATHS } from './paths.ts';
import { metaPathFor } from './validate.ts';
import type { AnchorMeta } from './validate.ts';

/**
 * Atlas packing, with the settings ASSET_PIPELINE §7 fixes.
 *
 *   MaxRects best-short-side-fit · 2px padding · 2px extrude ·
 *   power-of-two pages · trim on · **rotation off**
 *
 * Rotation is off deliberately. It buys a few percent of packing efficiency and
 * costs every future debugging session, because a rotated isometric sprite in an
 * atlas viewer is unreadable — and isometric art is exactly the case where "is
 * this facing south-east or south-west" is the question you are trying to answer.
 *
 * Padding *and* extrude both matter and are not the same thing: padding stops
 * neighbouring frames bleeding into each other under bilinear filtering, extrude
 * repeats the edge pixel outward so a frame's own edge does not sample
 * transparency and get a dark halo. Sprites on a coloured ground show that halo
 * immediately.
 *
 * Layout is deterministic because the packer is deterministic given a fixed
 * input order, and the input is sorted by filename here. Encoding is done by
 * sharp with explicit options rather than by the packer's defaults, so the bytes
 * are ours to pin.
 */

const PACK_OPTIONS = {
  packer: 'MaxRectsBin',
  packerMethod: 'BestShortSideFit',
  padding: 2,
  extrude: 2,
  powerOfTwo: true,
  allowRotation: false,
  allowTrim: true,
  trimMode: 'trim',
  detectIdentical: true,
  removeFileExtension: false,
  prependFolderName: false,
  textureFormat: 'png',
  exporter: 'Phaser3',
  // The exporter writes these into `meta`. Fixed strings, never a timestamp —
  // a build stamp in the JSON would change the content hash on every build and
  // silently defeat CDN caching.
  appInfo: { url: 'evolutionary-tycoon', version: '1' },
} as const;

/**
 * The packer's own typings put its enums *outside* its `declare module` block,
 * so they type-check but do not exist at run time — `Object.keys()` on the
 * package returns `['packAsync']` and nothing else. Importing `TrimMode` would
 * be `undefined` in the built config. The enum members are plain strings, so the
 * literals above are the real values and this cast is the honest way to say so.
 */
type PackConfig = Parameters<typeof packAsync>[1];

/** Lossless: a 2px outline and a hard alpha edge do not survive lossy WebP. */
const WEBP_OPTIONS = { lossless: true, effort: 6, quality: 100 } as const;
const PNG_OPTIONS = { compressionLevel: 9, effort: 10 } as const;

export interface AtlasFrame {
  readonly filename: string;
  readonly frame: { x: number; y: number; w: number; h: number };
  readonly spriteSourceSize: { x: number; y: number; w: number; h: number };
  readonly sourceSize: { w: number; h: number };
  readonly rotated: boolean;
  readonly trimmed: boolean;
}

export interface AtlasTexture {
  readonly image: string;
  readonly format: string;
  readonly size: { w: number; h: number };
  readonly scale: number;
  readonly frames: readonly AtlasFrame[];
}

export interface AtlasSheet {
  readonly textures: AtlasTexture[];
  readonly meta: Record<string, unknown>;
  /** Footprint anchors, keyed by frame name. Not part of the Phaser format. */
  anchors: Record<string, { x: number; y: number }>;
}

export interface PackedAtlas {
  readonly id: string;
  readonly pages: number;
  readonly files: readonly string[];
  /** Used frame area over page area, 0-1. ASSET_PIPELINE §7 requires >= 0.7. */
  readonly fill: number;
  readonly frames: number;
  readonly bytes: number;
}

/** Which atlas a processed file belongs in, or null if it ships on its own. */
export function atlasFor(filename: string): AtlasSpec | null {
  const parsed = parseAssetName(filename);
  if (!parsed.ok || parsed.name.category.atlas === null) return null;
  return ATLASES.find((atlas) => atlas.id === parsed.name.category.atlas) ?? null;
}

export function groupByAtlas(files: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const file of [...files].sort()) {
    const atlas = atlasFor(basename(file));
    if (atlas === null) continue;
    const existing = groups.get(atlas.id);
    if (existing !== undefined) existing.push(file);
    else groups.set(atlas.id, [file]);
  }
  return groups;
}

export async function packAtlas(
  spec: AtlasSpec,
  files: readonly string[],
  outputDir: string,
): Promise<PackedAtlas> {
  if (files.length === 0) {
    throw new Error(`atlas ${spec.id}: nothing to pack`);
  }
  mkdirSync(outputDir, { recursive: true });

  const input = [...files].sort().map((file) => ({ path: basename(file), contents: readFileSync(file) }));

  const result = await packAsync(input, {
    ...PACK_OPTIONS,
    textureName: spec.id,
    width: spec.maxWidth,
    height: spec.maxHeight,
  } as unknown as PackConfig);

  const sheets = result.filter((entry) => entry.name.endsWith('.json'));
  const images = result.filter((entry) => entry.name.endsWith('.png'));
  if (sheets.length === 0 || images.length === 0) {
    throw new Error(`atlas ${spec.id}: packer produced ${result.length} files, none usable`);
  }

  const anchors = readAnchors(files);
  const written: string[] = [];
  let usedArea = 0;
  let pageArea = 0;
  let frames = 0;
  let bytes = 0;

  for (let page = 0; page < images.length; page++) {
    const image = images[page];
    const sheetEntry = sheets[page];
    if (image === undefined || sheetEntry === undefined) continue;

    const stem = images.length === 1 ? spec.id : `${spec.id}-${page}`;
    const sheet = JSON.parse(sheetEntry.buffer.toString('utf8')) as AtlasSheet;
    const texture = sheet.textures[0];
    if (texture === undefined) throw new Error(`atlas ${spec.id}: page ${page} has no texture block`);

    const webpPath = join(outputDir, `${stem}.webp`);
    await sharp(image.buffer).webp(WEBP_OPTIONS).toFile(webpPath);
    written.push(webpPath);
    bytes += statSync(webpPath).size;

    // §7: only `boot` gets a PNG fallback. The loading screen has to render even
    // if WebP decoding is unavailable; nothing after it does.
    let imageName = `${stem}.webp`;
    if (spec.pngFallback) {
      const pngPath = join(outputDir, `${stem}.png`);
      await sharp(image.buffer).png(PNG_OPTIONS).toFile(pngPath);
      written.push(pngPath);
      bytes += statSync(pngPath).size;
      imageName = `${stem}.png`;
    }

    const rewritten: AtlasSheet = {
      textures: [{ ...texture, image: imageName }],
      meta: sheet.meta,
      anchors: Object.fromEntries(
        texture.frames.map((frame) => [frame.filename, anchors[frame.filename] ?? { x: 0, y: 0 }]),
      ),
    };
    const jsonPath = join(outputDir, `${stem}.json`);
    writeFileSync(jsonPath, `${JSON.stringify(rewritten, null, 2)}\n`);
    written.push(jsonPath);
    bytes += statSync(jsonPath).size;

    // `detectIdentical` makes several frames share one rect, so summing every
    // frame's area counts the shared pixels once per frame and can report a fill
    // above 100%. Only distinct rects occupy the page.
    const rects = new Set<string>();
    for (const frame of texture.frames) {
      const key = `${frame.frame.x},${frame.frame.y},${frame.frame.w},${frame.frame.h}`;
      if (!rects.has(key)) {
        rects.add(key);
        usedArea += frame.frame.w * frame.frame.h;
      }
      frames++;
    }
    pageArea += texture.size.w * texture.size.h;
  }

  return {
    id: spec.id,
    pages: images.length,
    files: written,
    fill: pageArea === 0 ? 0 : usedArea / pageArea,
    frames,
    bytes,
  };
}

/**
 * Anchors travel alongside the frames, not inside them.
 *
 * Phaser's atlas format has no field for a footprint anchor, and inventing one
 * inside `frames` would make the file no longer a Phaser atlas. A sibling
 * `anchors` object keyed by frame name keeps the file loadable by Phaser as-is
 * while the renderer reads the anchors from the same fetch.
 */
function readAnchors(files: readonly string[]): Record<string, { x: number; y: number }> {
  const anchors: Record<string, { x: number; y: number }> = {};
  for (const file of files) {
    const metaPath = metaPathFor(file);
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as AnchorMeta;
    anchors[basename(file)] = { x: meta.anchor.x, y: meta.anchor.y };
  }
  return anchors;
}

export interface AtlasBuild {
  readonly atlases: readonly PackedAtlas[];
  readonly underfilled: readonly PackedAtlas[];
}

export async function buildAtlases(
  processedDir: string = PATHS.processed,
  outputDir: string = PATHS.atlas,
): Promise<AtlasBuild> {
  const files = existsSync(processedDir)
    ? readdirSync(processedDir)
        .filter((entry) => entry.endsWith('.png'))
        .map((entry) => join(processedDir, entry))
    : [];

  const atlases: PackedAtlas[] = [];
  for (const [id, group] of [...groupByAtlas(files)].sort(([a], [b]) => a.localeCompare(b))) {
    const spec = ATLASES.find((atlas) => atlas.id === id);
    if (spec === undefined) continue;
    atlases.push(await packAtlas(spec, group, outputDir));
  }

  return {
    atlases,
    underfilled: atlases.filter((atlas) => atlas.fill < ATLAS_MIN_FILL),
  };
}
