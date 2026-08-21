import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ATLASES, TEXTURE_MEMORY_BUDGET_BYTES } from '@config/assets';
import { buildAtlases, atlasFor, groupByAtlas, packAtlas } from '../../../tools/asset-pipeline/atlas.ts';
import {
  AUDIO_TARGETS,
  MUSIC_LUFS,
  SFX_LUFS,
  convertAudio,
  ffmpegAvailable,
} from '../../../tools/asset-pipeline/audio.ts';
import { buildContactSheet, buildContactSheets } from '../../../tools/asset-pipeline/contactSheet.ts';
import { buildManifest, writeManifest } from '../../../tools/asset-pipeline/manifest.ts';
import { downscale, processAsset, processDirectory } from '../../../tools/asset-pipeline/process.ts';
import {
  buildReport,
  categoryBytes,
  countPlaceholders,
  formatReport,
  placeholderNames,
} from '../../../tools/asset-pipeline/report.ts';
import { writeFixture } from '../../../tools/asset-pipeline/testFixtures.ts';
import { metaPathFor } from '../../../tools/asset-pipeline/validate.ts';

/**
 * The build pipeline of ASSET_PIPELINE §8, exercised end to end on fixtures.
 *
 * The load-bearing assertion in this file is **determinism**: the roadmap makes
 * "same input produces the same hash" a Phase 4 requirement, because the
 * manifest hashes the output and the CDN caches on that hash. A pipeline that
 * emits different bytes for identical input invalidates every cached asset on
 * every build, and nothing about that failure is visible locally — it shows up
 * as a bandwidth bill and a slow first load. So it is measured, twice, rather
 * than assumed from pinned versions.
 */

const RAMPS = ['timber', 'steel', 'foliage', 'crimson', 'azure', 'amber', 'plum', 'meadow'] as const;

let root: string;
let source: string;
let processed: string;
let atlasDir: string;

const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'et-pipeline-'));
  source = join(root, 'source');
  processed = join(root, 'processed');
  atlasDir = join(root, 'atlas');

  for (let i = 0; i < 8; i++) {
    await writeFixture(source, `prop_table_v${String(i).padStart(2, '0')}_default@2x.png`, {
      canvasWidth: 70,
      canvasHeight: 54,
      ramp: RAMPS[i] ?? 'timber',
    });
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('process', () => {
  it('trims to the alpha bounding box', async () => {
    const out = join(root, 'trim');
    const result = await processAsset(join(source, 'prop_table_v00_default@2x.png'), out);
    // 70x54 canvas with a 2px transparent margin -> 66x50 of subject.
    expect(result).toMatchObject({ width: 66, height: 50, trimmed: { left: 2, top: 2 } });
  });

  it('moves the anchor with the trim', async () => {
    const out = join(root, 'anchor');
    const result = await processAsset(join(source, 'prop_table_v00_default@2x.png'), out);
    // The fixture anchors at (35, 51) in source coordinates; trimming by (2, 2)
    // must carry it to (33, 49) or every sprite sorts against the wrong depth.
    expect(result.anchor).toEqual({ x: 33, y: 49 });
    const sidecar = JSON.parse(readFileSync(metaPathFor(result.output), 'utf8')) as { anchor: unknown };
    expect(sidecar.anchor).toEqual({ x: 33, y: 49 });
  });

  it('halves the image and the anchor together for the 1x variant', async () => {
    const out = join(root, 'half');
    const full = await processAsset(join(source, 'prop_table_v00_default@2x.png'), out);
    const half = await downscale(full, out);
    expect(half).toMatchObject({ width: 33, height: 25, anchor: { x: 17, y: 25 } });
    expect(half.output.endsWith('@1x.png')).toBe(true);
  });

  it('refuses to downscale something that is not 2x', async () => {
    const out = join(root, 'half');
    const full = await processAsset(join(source, 'prop_table_v00_default@2x.png'), out);
    const half = await downscale(full, out);
    await expect(downscale(half, out)).rejects.toThrow(/not a @2x asset/);
  });

  it('refuses to process an asset with no anchor sidecar', async () => {
    const bare = join(root, 'bare');
    const path = await writeFixture(bare, 'prop_table_solo_default@2x.png', {
      canvasWidth: 70,
      canvasHeight: 54,
      ramp: 'timber',
    });
    rmSync(metaPathFor(path));
    await expect(processAsset(path, join(root, 'bare-out'))).rejects.toThrow(/run assets:validate first/);
  });

  it('rejects a file whose name it cannot parse', async () => {
    const odd = join(root, 'odd');
    const path = await writeFixture(odd, 'NotAnAsset.png', {
      canvasWidth: 40,
      canvasHeight: 40,
      ramp: 'steel',
    });
    await expect(processAsset(path, join(root, 'odd-out'))).rejects.toThrow(/does not match/);
  });

  it('produces byte-identical output on a second run', async () => {
    const first = await processDirectory(source, join(root, 'det-a'));
    const second = await processDirectory(source, join(root, 'det-b'));
    expect(first).toHaveLength(8);
    expect(second).toHaveLength(8);
    for (let i = 0; i < first.length; i++) {
      expect(sha(first[i]?.output ?? ''), first[i]?.output).toBe(sha(second[i]?.output ?? ''));
    }
  });

  it('returns nothing for a directory that does not exist', async () => {
    expect(await processDirectory(join(root, 'nope'), join(root, 'nope-out'))).toEqual([]);
  });
});

describe('atlas', () => {
  beforeAll(async () => {
    await processDirectory(source, processed);
  });

  it('routes each category to the atlas §7 assigns it', () => {
    expect(atlasFor('prop_table_round_default@2x.png')?.id).toBe('props');
    expect(atlasFor('char_body_male-01_se@2x.png')?.id).toBe('chars');
    expect(atlasFor('food_burger_default@2x.png')?.id).toBe('ui');
    // Ground bakes are too large to atlas and are meant to be.
    expect(atlasFor('ground_stage1_tile-a@2x.png')).toBeNull();
    expect(atlasFor('nonsense.png')).toBeNull();
  });

  it('groups files by atlas in a fixed order', () => {
    const groups = groupByAtlas(['b/prop_table_b_default@2x.png', 'a/prop_table_a_default@2x.png']);
    expect(groups.get('props')).toEqual(['a/prop_table_a_default@2x.png', 'b/prop_table_b_default@2x.png']);
  });

  it('packs a single power-of-two page with anchors alongside', async () => {
    const built = await buildAtlases(processed, atlasDir);
    expect(built.atlases).toHaveLength(1);
    const atlas = built.atlases[0];
    expect(atlas?.id).toBe('props');
    expect(atlas?.frames).toBe(8);
    expect(atlas?.pages).toBe(1);

    const sheet = JSON.parse(readFileSync(join(atlasDir, 'props.json'), 'utf8')) as {
      textures: {
        image: string;
        size: { w: number; h: number };
        frames: { filename: string; rotated: boolean }[];
      }[];
      anchors: Record<string, { x: number; y: number }>;
    };
    const texture = sheet.textures[0];
    expect(texture?.image).toBe('props.webp');
    // Rotation is off (§7): a rotated isometric sprite is unreadable in an
    // atlas viewer, which is where facing bugs get diagnosed.
    expect(texture?.frames.every((frame) => !frame.rotated)).toBe(true);
    const powerOfTwo = (value: number): boolean => (value & (value - 1)) === 0;
    expect(powerOfTwo(texture?.size.w ?? 0)).toBe(true);
    expect(powerOfTwo(texture?.size.h ?? 0)).toBe(true);
    // Anchors travel with the sheet; Phaser's format has nowhere to put them.
    expect(Object.keys(sheet.anchors)).toHaveLength(8);
    expect(sheet.anchors['prop_table_v00_default@2x.png']).toEqual({ x: 33, y: 49 });
  });

  it('writes a PNG fallback only for the boot atlas', async () => {
    expect(existsSync(join(atlasDir, 'props.png'))).toBe(false);

    const bootSource = join(root, 'boot-src');
    const bootProcessed = join(root, 'boot-proc');
    const bootAtlas = join(root, 'boot-atlas');
    await writeFixture(bootSource, 'ui_icon_cash@2x.png', {
      canvasWidth: 68,
      canvasHeight: 68,
      ramp: 'amber',
    });
    await processDirectory(bootSource, bootProcessed);

    const spec = ATLASES.find((entry) => entry.id === 'boot');
    if (spec === undefined) throw new Error('no boot atlas');
    const packed = await packAtlas(spec, [join(bootProcessed, 'ui_icon_cash@2x.png')], bootAtlas);
    expect(packed.files.some((file) => file.endsWith('boot.png'))).toBe(true);
    expect(packed.files.some((file) => file.endsWith('boot.webp'))).toBe(true);
    const sheet = JSON.parse(readFileSync(join(bootAtlas, 'boot.json'), 'utf8')) as {
      textures: { image: string }[];
    };
    // The fallback is what the sheet points at, because it is the one guaranteed
    // to decode.
    expect(sheet.textures[0]?.image).toBe('boot.png');
  });

  it('measures fill from distinct rects, not frames', async () => {
    // `detectIdentical` makes duplicate art share one rect. Counting per frame
    // reports a fill above 100% and hides a genuinely wasteful atlas.
    const dupeSource = join(root, 'dupe-src');
    const dupeProcessed = join(root, 'dupe-proc');
    for (let i = 0; i < 6; i++) {
      await writeFixture(dupeSource, `prop_table_d${i}_default@2x.png`, {
        canvasWidth: 70,
        canvasHeight: 54,
        ramp: 'timber',
      });
    }
    await processDirectory(dupeSource, dupeProcessed);
    const built = await buildAtlases(dupeProcessed, join(root, 'dupe-atlas'));
    const atlas = built.atlases[0];
    expect(atlas?.frames).toBe(6);
    expect(atlas?.fill).toBeLessThanOrEqual(1);
  });

  it('flags an underfilled atlas rather than quietly wasting the page', async () => {
    const built = await buildAtlases(processed, join(root, 'atlas-fill'));
    const atlas = built.atlases[0];
    if (atlas === undefined) throw new Error('nothing packed');
    // The gate is a floor. Whether these fixtures clear it is beside the point;
    // what matters is that the classification follows the measurement.
    expect(built.underfilled.includes(atlas)).toBe(atlas.fill < 0.7);
  });

  it('packs to identical bytes on a second run', async () => {
    const a = await buildAtlases(processed, join(root, 'atlas-a'));
    const b = await buildAtlases(processed, join(root, 'atlas-b'));
    expect(a.atlases[0]?.files.length).toBeGreaterThan(0);
    for (const [i, file] of (a.atlases[0]?.files ?? []).entries()) {
      const other = b.atlases[0]?.files[i];
      expect(sha(file), file).toBe(sha(other ?? ''));
    }
  });

  it('refuses to pack nothing', async () => {
    const spec = ATLASES.find((entry) => entry.id === 'props');
    if (spec === undefined) throw new Error('no props atlas');
    await expect(packAtlas(spec, [], atlasDir)).rejects.toThrow(/nothing to pack/);
  });

  it('returns nothing when there is nothing processed', async () => {
    expect((await buildAtlases(join(root, 'missing'), join(root, 'missing-out'))).atlases).toEqual([]);
  });
});

describe('manifest', () => {
  it('records every atlas file with its own content hash', () => {
    const manifest = buildManifest({ atlasDir });
    expect(manifest.atlases).toHaveLength(1);
    const atlas = manifest.atlases[0];
    expect(atlas?.id).toBe('props');
    expect(atlas?.frames).toBe(8);
    expect(atlas?.files.map((file) => file.url)).toEqual(['/atlas/props.json', '/atlas/props.webp']);
    for (const file of atlas?.files ?? []) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.bytes).toBeGreaterThan(0);
    }
  });

  it('stamps the contract the art was made under', () => {
    // The question this answers three months from now is "why does this sprite
    // not match the others" — answerable by comparing two numbers rather than
    // two memories.
    const manifest = buildManifest({ atlasDir });
    expect(manifest.promptBlockHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.paletteVersion).toBe(1);
    expect(manifest.schemaVersion).toBe(1);
  });

  it('separates the critical path from the total', () => {
    const manifest = buildManifest({ atlasDir });
    // `props` is lazy, so it is in the total and not in the critical path.
    expect(manifest.totals.bytes).toBeGreaterThan(0);
    expect(manifest.totals.criticalBytes).toBe(0);
    expect(manifest.totals.bootBytes).toBe(0);
  });

  it('counts singles into the total', () => {
    const single = join(root, 'ground_stage1_tile-a@2x.png');
    writeFileSync(single, Buffer.alloc(2048));
    const manifest = buildManifest({ atlasDir, singles: [single], publicDir: root });
    expect(manifest.singles).toHaveLength(1);
    expect(manifest.singles[0]).toMatchObject({ url: '/ground_stage1_tile-a@2x.png', bytes: 2048 });
  });

  it('refuses a file the server could never reach', () => {
    // A manifest row the browser 404s on is worse than a missing row: the
    // loading screen waits for it, retries it three times, and then reports a
    // network problem that is really a build mistake.
    expect(() =>
      buildManifest({ atlasDir, singles: [join(root, 'x.png')], publicDir: join(root, 'inner') }),
    ).toThrow(/outside the served root/);
  });

  it('writes deterministically and returns its own hash', () => {
    const manifest = buildManifest({ atlasDir });
    const path = join(root, 'asset-manifest.json');
    const first = writeManifest(manifest, path);
    const second = writeManifest(buildManifest({ atlasDir }), path);
    expect(first).toBe(second);
    expect(sha(path)).toBe(first);
  });

  it('reports an empty manifest for an empty atlas directory', () => {
    const manifest = buildManifest({ atlasDir: join(root, 'no-atlas') });
    expect(manifest.atlases).toEqual([]);
    expect(manifest.totals.bytes).toBe(0);
  });
});

describe('report', () => {
  it('sums bytes per category and folds shared budgets into their owner', () => {
    const bytes = categoryBytes(processed);
    expect(bytes.get('prop')).toBeGreaterThan(0);
    expect(bytes.has('food')).toBe(false);
  });

  it('passes when everything is inside its limits', async () => {
    const built = await buildAtlases(processed, join(root, 'report-atlas'));
    const report = buildReport({
      manifest: buildManifest({ atlasDir: join(root, 'report-atlas') }),
      processedDir: processed,
      atlases: built.atlases,
    });
    expect(report.categories.every((line) => line.ok)).toBe(true);
    expect(report.totals.every((line) => line.ok)).toBe(true);
  });

  it('fails the build when a total is exceeded', async () => {
    const built = await buildAtlases(processed, join(root, 'report-atlas'));
    const manifest = buildManifest({ atlasDir: join(root, 'report-atlas') });
    const over = {
      ...manifest,
      totals: { bytes: 999 * 1024 * 1024, bootBytes: 0, criticalBytes: 0 },
    };
    const report = buildReport({ manifest: over, processedDir: processed, atlases: built.atlases });
    expect(report.ok).toBe(false);
    expect(formatReport(report)).toContain('BUDGET EXCEEDED');
  });

  /*
   * Reported, not enforced — ADR-013 §7. Power-of-two pages make the 70% ratio
   * unreachable for a small set no matter how well it is packed, so the line
   * that fails a build is the texture-memory total, which is the budget
   * ASSET_PIPELINE §17 states. The percentage still prints.
   */
  it('reports atlas fill without failing a build over it', async () => {
    const built = await buildAtlases(processed, join(root, 'report-atlas'));
    const report = buildReport({
      manifest: buildManifest({ atlasDir: join(root, 'report-atlas') }),
      processedDir: processed,
      atlases: built.atlases,
    });
    const fill = report.atlases[0];
    expect(fill?.label).toBe('props fill');
    expect(fill?.ok).toBe(true);
    expect(fill?.detail).toMatch(/decoded/);
  });

  it('enforces decoded texture memory, which is the budget the documents state', async () => {
    const built = await buildAtlases(processed, join(root, 'report-atlas'));
    const report = buildReport({
      manifest: buildManifest({ atlasDir: join(root, 'report-atlas') }),
      processedDir: processed,
      atlases: built.atlases,
    });
    const memory = report.totals.find((entry) => entry.label === 'texture memory');
    expect(memory).toBeDefined();
    expect(memory?.budget).toBe(TEXTURE_MEMORY_BUDGET_BYTES);
    expect(memory?.bytes).toBe(built.atlases.reduce((sum, atlas) => sum + atlas.textureBytes, 0));
  });

  it('counts the placeholders still in the tree', () => {
    // Phase 22 turns a non-zero count into a failed production build; until then
    // it is reported so it cannot be forgotten.
    expect(countPlaceholders()).toBe(placeholderNames().length);
    expect(placeholderNames().every((name) => name.includes('__PLACEHOLDER__'))).toBe(true);
  });

  it('reports zero for directories that do not exist', () => {
    expect(countPlaceholders(join(root, 'nope'))).toBe(0);
    expect(placeholderNames(join(root, 'nope'))).toEqual([]);
    expect(categoryBytes(join(root, 'nope')).size).toBe(0);
  });

  it('says so when nothing was built', () => {
    const report = buildReport({
      manifest: buildManifest({ atlasDir: join(root, 'no-atlas') }),
      processedDir: join(root, 'nope'),
      atlases: [],
    });
    expect(formatReport(report)).toContain('(nothing built)');
  });
});

describe('contact sheets', () => {
  it('lays a category out at 100% and 50% on the game ground', async () => {
    const sheets = await buildContactSheets(processed, join(root, 'sheets'));
    // One colour sheet and one silhouette sheet for the single category present.
    expect(sheets).toHaveLength(2);
    const [colour, silhouette] = sheets;
    expect(colour?.assets).toBe(8);
    expect(colour?.path.endsWith('prop.png')).toBe(true);
    expect(silhouette?.path.endsWith('prop-silhouette.png')).toBe(true);
    expect(statSync(colour?.path ?? '').size).toBeGreaterThan(0);
    // Two blocks stacked: eight 66x50 sprites across six columns is two rows at
    // 100% plus two at 50%, so the sheet is taller than the 100% block alone.
    expect(colour?.height).toBeGreaterThan(2 * 50);
    expect(colour?.width).toBeGreaterThan(6 * 50);
  });

  it('refuses to build a sheet with nothing on it', async () => {
    await expect(buildContactSheet('prop', [], join(root, 'sheets'))).rejects.toThrow(/no assets/);
  });

  it('returns nothing when there is nothing processed', async () => {
    expect(await buildContactSheets(join(root, 'nope'), join(root, 'sheets'))).toEqual([]);
  });
});

describe('audio', () => {
  it('targets both formats Safari makes necessary', () => {
    // ASSET_PIPELINE §2: Safari's OGG/Vorbis support has historically been
    // unreliable, and the failure is silence rather than an error.
    expect(AUDIO_TARGETS.map((target) => target.extension)).toEqual(['ogg', 'm4a']);
    expect(SFX_LUFS).toBe(-16);
    expect(MUSIC_LUFS).toBe(-20);
  });

  it('rejects a file that is not in an audio category', () => {
    const path = join(root, 'prop_table_round_default@2x.png');
    writeFileSync(path, Buffer.alloc(16));
    expect(() => convertAudio(path, join(root, 'audio'))).toThrow(
      ffmpegAvailable() ? /not in an audio category/ : /needs ffmpeg on PATH/,
    );
  });

  it.runIf(ffmpegAvailable())('converts a WAV to both formats', () => {
    // Only runs where ffmpeg exists. Audio production is Phase 17; this proves
    // the stage works rather than that a sound is good.
    const wav = join(root, 'sfx_ui_click.wav');
    writeFileSync(wav, toneWav());
    const result = convertAudio(wav, join(root, 'audio'));
    expect(result.outputs.map((file) => file.split('.').pop())).toEqual(['ogg', 'm4a']);
    for (const output of result.outputs) expect(statSync(output).size).toBeGreaterThan(0);
  });
});

/**
 * A quarter second of quiet 1 kHz tone, 48 kHz mono 16-bit.
 *
 * A tone rather than silence: `loudnorm` cannot normalise a signal with no
 * loudness and emits NaN, which ffmpeg then refuses to encode. Found by running
 * this test against silence.
 */
function toneWav(): Buffer {
  const samples = 12_000;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((i / 48_000) * 2 * Math.PI * 1000) * 6000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48_000, 24);
  header.writeUInt32LE(96_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe('the pipeline as a whole', () => {
  it('leaves no file behind that a later stage cannot read', () => {
    // Every processed image has a sidecar; every sidecar names an image.
    const files = readdirSync(processed);
    const images = files.filter((entry) => entry.endsWith('.png'));
    const metas = files.filter((entry) => entry.endsWith('.meta.json'));
    expect(images).toHaveLength(8);
    expect(metas).toHaveLength(8);
    for (const image of images) {
      expect(existsSync(metaPathFor(join(processed, image))), image).toBe(true);
    }
  });
});
