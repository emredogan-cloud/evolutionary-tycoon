import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildAtlases } from './atlas.ts';
import { buildContactSheets } from './contactSheet.ts';
import { convertAudioDirectory } from './audio.ts';
import { buildManifest, writeManifest } from './manifest.ts';
import { PATHS } from './paths.ts';
import { processDirectory } from './process.ts';
import { buildReport, formatReport } from './report.ts';
import { validateDirectory } from './validate.ts';

/**
 * `pnpm assets:<stage>` — the build pipeline of ASSET_PIPELINE §8.
 *
 *   validate -> process -> atlas -> audio -> manifest -> report
 *
 * Each stage exits non-zero on failure so CI stops at the first one, which is
 * the point: a build that packs an atlas out of art that failed validation has
 * turned a caught problem into a shipped one.
 *
 * With no source art the stages report **"0 assets"** and exit 0. That is a
 * deliberate distinction — an empty pipeline is not a passing pipeline, and the
 * output says so in words rather than printing a row of ticks over nothing.
 */

type Stage = 'validate' | 'process' | 'atlas' | 'audio' | 'manifest' | 'report' | 'contact-sheet' | 'build';

const STAGES: readonly Stage[] = [
  'validate',
  'process',
  'atlas',
  'audio',
  'manifest',
  'report',
  'contact-sheet',
  'build',
];

function countSources(): number {
  if (!existsSync(PATHS.source)) return 0;
  return readdirSync(PATHS.source).filter(
    (entry) => !entry.endsWith('.meta.json') && statSync(join(PATHS.source, entry)).isFile(),
  ).length;
}

function empty(stage: string): void {
  console.log(`assets:${stage} — 0 assets in ${PATHS.source}. Nothing was validated or built.`);
}

async function runValidate(): Promise<boolean> {
  const result = await validateDirectory();
  if (result.checked === 0) {
    empty('validate');
    return true;
  }

  let failures = 0;
  for (const asset of result.assets) {
    const label = asset.file.split('/').pop() ?? asset.file;
    if (asset.ok) {
      console.log(`ok   ${label}`);
      continue;
    }
    failures++;
    console.log(`FAIL ${label}`);
    for (const finding of asset.findings.filter((entry) => !entry.ok)) {
      console.log(`       ${finding.check}: ${finding.detail}`);
    }
  }
  for (const finding of result.setFindings.filter((entry) => !entry.ok)) {
    failures++;
    console.log(`FAIL (set) ${finding.check}: ${finding.detail}`);
  }

  console.log(`\n${result.checked} assets, ${failures} failing.`);
  return result.ok;
}

async function runProcess(): Promise<boolean> {
  const processed = await processDirectory();
  if (processed.length === 0) {
    empty('process');
    return true;
  }
  for (const asset of processed) {
    console.log(
      `${asset.output.split('/').pop()}  ${asset.width}x${asset.height}  anchor ${asset.anchor.x},${asset.anchor.y}`,
    );
  }
  console.log(`\n${processed.length} assets processed into ${PATHS.processed}.`);
  return true;
}

async function runAtlas(): Promise<boolean> {
  const built = await buildAtlases();
  if (built.atlases.length === 0) {
    console.log(`assets:atlas — nothing in ${PATHS.processed}. No atlas was packed.`);
    return true;
  }
  for (const atlas of built.atlases) {
    console.log(
      `${atlas.id.padEnd(12)} ${atlas.frames} frames, ${atlas.pages} page(s), ` +
        `fill ${(atlas.fill * 100).toFixed(1)}%, ${(atlas.bytes / 1024).toFixed(1)} kB`,
    );
  }
  if (built.underfilled.length > 0) {
    console.log(
      `\nUnderfilled: ${built.underfilled.map((atlas) => atlas.id).join(', ')} — see assets:report.`,
    );
  }
  return true;
}

function runAudio(): boolean {
  const converted = convertAudioDirectory(PATHS.source, PATHS.processed);
  console.log(
    converted.length === 0
      ? `assets:audio — no .wav files in ${PATHS.source}. Audio production is Phase 17.`
      : `${converted.length} sounds converted to OGG + M4A.`,
  );
  return true;
}

function runManifest(): boolean {
  const manifest = buildManifest();
  const hash = writeManifest(manifest);
  console.log(
    `${PATHS.manifest}\n  schema ${manifest.schemaVersion}, ${manifest.atlases.length} atlases, ` +
      `prompt block ${manifest.promptBlockHash.slice(0, 12)}, palette v${manifest.paletteVersion}\n  manifest hash ${hash}`,
  );
  return true;
}

async function runReport(): Promise<boolean> {
  const built = await buildAtlases();
  const report = buildReport({ manifest: buildManifest(), atlases: built.atlases });
  console.log(formatReport(report));
  return report.ok;
}

async function runContactSheets(): Promise<boolean> {
  const sheets = await buildContactSheets();
  if (sheets.length === 0) {
    console.log(`assets:contact-sheet — nothing in ${PATHS.processed}.`);
    return true;
  }
  for (const sheet of sheets) {
    console.log(`${sheet.path.split('/').pop()}  ${sheet.assets} assets, ${sheet.width}x${sheet.height}`);
  }
  return true;
}

async function run(stage: Stage): Promise<boolean> {
  switch (stage) {
    case 'validate':
      return runValidate();
    case 'process':
      return runProcess();
    case 'atlas':
      return runAtlas();
    case 'audio':
      return runAudio();
    case 'manifest':
      return runManifest();
    case 'report':
      return runReport();
    case 'contact-sheet':
      return runContactSheets();
    case 'build': {
      for (const step of ['validate', 'process', 'atlas', 'audio', 'manifest', 'report'] as const) {
        console.log(`\n--- assets:${step} ---`);
        if (!(await run(step))) return false;
      }
      return true;
    }
  }
}

const requested = process.argv[2];
if (requested === undefined || !STAGES.includes(requested as Stage)) {
  console.error(`usage: assets <${STAGES.join('|')}>`);
  process.exit(2);
}

console.log(`assets:${requested} — ${countSources()} files in assets/source`);
const passed = await run(requested as Stage);
process.exit(passed ? 0 : 1);
