import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { ATLASES } from '../../src/config/assets.ts';
import type { LoadPriority } from '../../src/config/assets.ts';
import { loadPalette } from './palette.ts';
import { PATHS, REPO_ROOT } from './paths.ts';
import { readPromptBlock } from './promptBlock.ts';

/**
 * The content-hashed manifest the runtime loads before anything else.
 *
 * Two jobs. At run time it tells the loader what exists, how big it is and in
 * what order to fetch it, so the loading screen can show real progress rather
 * than an animation pretending to be progress (ASSET_PIPELINE §14).
 *
 * At build time it is the cache key. Every file carries the SHA-256 of its own
 * bytes, so a changed sprite changes exactly one hash and a rebuilt-but-identical
 * atlas changes none. That is only worth anything if the pipeline is
 * deterministic, which is why `atlas.ts` pins its encoder options and
 * `tests/unit/tools/assetPipeline.test.ts` packs twice and compares.
 *
 * It also records **what contract the art was made under** — the prompt block
 * hash and the palette version. Three months from now, "why does this sprite not
 * match" is answerable by comparing two numbers instead of two memories.
 */

export const MANIFEST_SCHEMA_VERSION = 1;

export interface ManifestFile {
  /** Path as the browser will request it, e.g. `/atlas/chars.webp`. */
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ManifestAtlas {
  readonly id: string;
  readonly priority: LoadPriority;
  readonly frames: number;
  readonly files: readonly ManifestFile[];
}

export interface AssetManifest {
  readonly schemaVersion: number;
  readonly promptBlockHash: string;
  readonly paletteVersion: number;
  readonly atlases: readonly ManifestAtlas[];
  /** Files served on their own — ground bakes, audio, fonts. */
  readonly singles: readonly ManifestFile[];
  readonly totals: {
    readonly bytes: number;
    readonly bootBytes: number;
    readonly criticalBytes: number;
  };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * The URL a browser will actually request.
 *
 * Atlases are always served from `/atlas/`, whatever directory the build wrote
 * them to — the deployment layout is a fact about the site, not about the build
 * machine. Everything else is resolved against the served root and **rejected**
 * if it falls outside: a file the server cannot reach has no URL, and emitting
 * `/../../tmp/...` would put a 404 in the manifest that looks like a path.
 */
function atlasUrl(path: string): string {
  return `/atlas/${basename(path)}`;
}

function servedUrl(path: string, publicDir: string): string {
  const rel = relative(publicDir, path);
  if (rel.startsWith('..')) {
    throw new Error(`manifest: ${path} is outside the served root ${publicDir}, so it has no URL`);
  }
  return `/${rel.split('\\').join('/')}`;
}

function describe(path: string, url: string): ManifestFile {
  return { url, bytes: statSync(path).size, sha256: sha256(path) };
}

export interface BuildManifestOptions {
  readonly atlasDir?: string;
  /** Extra files that ship outside an atlas. Sorted before recording. */
  readonly singles?: readonly string[];
  readonly promptBlockPath?: string;
  readonly palettePath?: string;
  /** The served root. Files outside it cannot be fetched and are rejected. */
  readonly publicDir?: string;
}

export function buildManifest(options: BuildManifestOptions = {}): AssetManifest {
  const atlasDir = options.atlasDir ?? PATHS.atlas;
  const publicDir = options.publicDir ?? join(REPO_ROOT, 'public');
  const palette = loadPalette(options.palettePath ?? PATHS.palette);
  const prompt = readPromptBlock(options.promptBlockPath ?? PATHS.promptBlock);

  const present = existsSync(atlasDir) ? readdirSync(atlasDir).sort() : [];

  const atlases: ManifestAtlas[] = [];
  for (const spec of ATLASES) {
    const sheets = present.filter(
      (entry) => entry.endsWith('.json') && (entry === `${spec.id}.json` || entry.startsWith(`${spec.id}-`)),
    );
    if (sheets.length === 0) continue;

    let frames = 0;
    const files: ManifestFile[] = [];
    for (const sheet of sheets) {
      const stem = sheet.slice(0, -'.json'.length);
      const parsed = JSON.parse(readFileSync(join(atlasDir, sheet), 'utf8')) as {
        textures?: { frames?: unknown[] }[];
      };
      frames += parsed.textures?.[0]?.frames?.length ?? 0;

      for (const entry of present) {
        if (entry === sheet || entry === `${stem}.webp` || entry === `${stem}.png`) {
          files.push(describe(join(atlasDir, entry), atlasUrl(entry)));
        }
      }
    }
    atlases.push({ id: spec.id, priority: spec.priority, frames, files: files.sort(byUrl) });
  }

  const singles = [...(options.singles ?? [])]
    .sort()
    .map((file) => describe(file, servedUrl(file, publicDir)));

  const atlasBytes = (priority: LoadPriority | 'any'): number =>
    atlases
      .filter((atlas) => priority === 'any' || atlas.priority === priority)
      .reduce((sum, atlas) => sum + atlas.files.reduce((n, file) => n + file.bytes, 0), 0);

  const singleBytes = singles.reduce((sum, file) => sum + file.bytes, 0);

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    promptBlockHash: prompt.hash,
    paletteVersion: palette.spec.version,
    atlases,
    singles,
    totals: {
      bytes: atlasBytes('any') + singleBytes,
      bootBytes: atlasBytes('boot'),
      // The first playable frame needs the boot atlas *and* everything critical.
      criticalBytes: atlasBytes('boot') + atlasBytes('critical'),
    },
  };
}

function byUrl(a: ManifestFile, b: ManifestFile): number {
  return a.url.localeCompare(b.url);
}

/** Write the manifest and return its own content hash. */
export function writeManifest(manifest: AssetManifest, path: string = PATHS.manifest): string {
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(path, json);
  return createHash('sha256').update(json).digest('hex');
}
