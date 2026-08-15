import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { SURFACE_COLORS } from '../../src/config/surfaces.ts';
import { parseAssetName } from './naming.ts';
import { PATHS } from './paths.ts';

/**
 * Contact sheets — the instrument the four consistency gates are judged on.
 *
 * ASSET_PIPELINE §4.3 step 5 is blunt about why this exists: approval is given
 * "toplu ve karsilastirmali", as a group and side by side, because **consistency
 * is only visible side by side**. One sprite alone always looks fine. Twenty
 * together show which one was generated in a different session.
 *
 * Each sheet answers three of the four gates at once (§4.4):
 *
 *   - the 100% block   -> contact sheet review, and the side-by-side test
 *   - the 50% block    -> "is it still readable at half size"
 *   - the grey variant -> "are the silhouettes distinguishable"
 *
 * The fourth gate — all characters together in one real scene — is a running
 * game, not an image, and belongs to the visual regression suite.
 *
 * The ground is painted with the same constants the renderer uses
 * (`src/config/surfaces.ts`), because an asset judged against a white page and
 * an asset judged against the actual lot are two different judgements, and only
 * one of them is the game.
 */

const CELL_PADDING = 12;
const BLOCK_GAP = 28;
const COLUMNS = 6;

export interface ContactSheetOptions {
  readonly columns?: number;
  /** Draw the sheet in greyscale for the silhouette gate. */
  readonly greyscale?: boolean;
}

export interface ContactSheet {
  readonly category: string;
  readonly path: string;
  readonly assets: number;
  readonly width: number;
  readonly height: number;
}

function rgb(color: number): { r: number; g: number; b: number; alpha: number } {
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff, alpha: 1 };
}

interface Placed {
  readonly input: Buffer;
  readonly left: number;
  readonly top: number;
}

/**
 * One sheet for one category.
 *
 * Laid out as two blocks: every asset at 100%, then every asset again at 50%.
 * Same order in both, so the eye can travel straight down from a sprite to its
 * half-size self.
 */
export async function buildContactSheet(
  category: string,
  files: readonly string[],
  outputDir: string,
  options: ContactSheetOptions = {},
): Promise<ContactSheet> {
  if (files.length === 0) throw new Error(`contact sheet: no assets for "${category}"`);
  mkdirSync(outputDir, { recursive: true });

  const columns = options.columns ?? COLUMNS;
  const sorted = [...files].sort();

  const sprites = await Promise.all(
    sorted.map(async (file) => {
      const image = sharp(file);
      const meta = await image.metadata();
      return { file, buffer: await image.png().toBuffer(), width: meta.width, height: meta.height };
    }),
  );

  const cellWidth = Math.max(...sprites.map((sprite) => sprite.width)) + CELL_PADDING * 2;
  const cellHeight = Math.max(...sprites.map((sprite) => sprite.height)) + CELL_PADDING * 2;
  const rows = Math.ceil(sprites.length / columns);

  const fullBlockHeight = rows * cellHeight;
  const halfCellWidth = Math.ceil(cellWidth / 2) + CELL_PADDING;
  const halfCellHeight = Math.ceil(cellHeight / 2) + CELL_PADDING;
  const halfBlockHeight = rows * halfCellHeight;

  const width = Math.max(columns * cellWidth, columns * halfCellWidth);
  const height = fullBlockHeight + BLOCK_GAP + halfBlockHeight;

  const composites: Placed[] = [];

  sprites.forEach((sprite, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    composites.push({
      input: sprite.buffer,
      left: column * cellWidth + Math.round((cellWidth - sprite.width) / 2),
      // Bottom-aligned inside the cell: sprites stand on a common ground line,
      // which is the only way a height inconsistency is visible at a glance.
      top: row * cellHeight + (cellHeight - CELL_PADDING - sprite.height),
    });
  });

  const halves = await Promise.all(
    sprites.map(async (sprite) => ({
      buffer: await sharp(sprite.buffer)
        .resize(Math.max(1, Math.round(sprite.width / 2)), Math.max(1, Math.round(sprite.height / 2)), {
          kernel: 'lanczos3',
        })
        .png()
        .toBuffer(),
      width: Math.max(1, Math.round(sprite.width / 2)),
      height: Math.max(1, Math.round(sprite.height / 2)),
    })),
  );

  halves.forEach((half, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    composites.push({
      input: half.buffer,
      left: column * halfCellWidth + Math.round((halfCellWidth - half.width) / 2),
      top: fullBlockHeight + BLOCK_GAP + row * halfCellHeight + (halfCellHeight - CELL_PADDING - half.height),
    });
  });

  let sheet = sharp({
    create: { width, height, channels: 4, background: rgb(SURFACE_COLORS.ground) },
  }).composite(composites.map((placed) => ({ input: placed.input, left: placed.left, top: placed.top })));

  if (options.greyscale === true) sheet = sharp(await sheet.png().toBuffer()).greyscale();

  const suffix = options.greyscale === true ? '-silhouette' : '';
  const path = join(outputDir, `${category}${suffix}.png`);
  await sheet.png({ compressionLevel: 9 }).toFile(path);

  return { category, path, assets: sprites.length, width, height };
}

/** One colour sheet and one silhouette sheet per category present. */
export async function buildContactSheets(
  processedDir: string = PATHS.processed,
  outputDir: string = PATHS.contactSheets,
): Promise<ContactSheet[]> {
  if (!existsSync(processedDir)) return [];

  const byCategory = new Map<string, string[]>();
  for (const entry of readdirSync(processedDir).sort()) {
    if (!entry.endsWith('.png')) continue;
    const parsed = parseAssetName(basename(entry));
    if (!parsed.ok || parsed.name.category.kind !== 'image') continue;
    const id = parsed.name.category.id;
    const existing = byCategory.get(id);
    if (existing !== undefined) existing.push(join(processedDir, entry));
    else byCategory.set(id, [join(processedDir, entry)]);
  }

  const sheets: ContactSheet[] = [];
  for (const [category, files] of [...byCategory].sort(([a], [b]) => a.localeCompare(b))) {
    sheets.push(await buildContactSheet(category, files, outputDir));
    sheets.push(await buildContactSheet(category, files, outputDir, { greyscale: true }));
  }
  return sheets;
}
