import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

/**
 * PWA icons, rasterised from the real favicon — Phase 14.
 *
 * The manifest needs raster icons (192 and 512, plus a maskable pair with the
 * safe-zone padding the spec demands). Deriving them from `favicon.svg` keeps
 * one source of identity; regenerating is `node tools/pwa/generateIcons.ts`,
 * and the outputs are committed like the placeholder set is — reproducible
 * artefacts, not hand-made ones.
 */

const root = resolve(import.meta.dirname, '../..');
const svg = readFileSync(resolve(root, 'public/favicon.svg'));

/** The app's background, from the theme tokens (--c-bg). */
const BACKGROUND = '#12161d';

async function plain(size: number, file: string): Promise<void> {
  const png = await sharp(svg, { density: (72 * size) / 32 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  writeFileSync(resolve(root, 'public', file), png);
  console.log(`${file}: ${String(png.length)} bytes`);
}

/** Maskable: the glyph inside the 80% safe zone, on the app background. */
async function maskable(size: number, file: string): Promise<void> {
  const inner = Math.round(size * 0.66);
  const glyph = await sharp(svg, { density: (72 * inner) / 32 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const png = await sharp({
    create: { width: size, height: size, channels: 4, background: BACKGROUND },
  })
    .composite([{ input: glyph, gravity: 'centre' }])
    .png()
    .toBuffer();
  writeFileSync(resolve(root, 'public', file), png);
  console.log(`${file}: ${String(png.length)} bytes`);
}

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await maskable(512, 'icon-512-maskable.png');
