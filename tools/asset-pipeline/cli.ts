import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildAtlases } from './atlas.ts';
import { buildContactSheets } from './contactSheet.ts';
import { convertAudioDirectory } from './audio.ts';
import { importStaging } from './import.ts';
import { buildManifest, publishSingles, writeManifest } from './manifest.ts';
import { emitPrompts } from './prompts.ts';
import { exportPromptHtml } from './promptExport.ts';
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

type Stage =
  | 'import'
  | 'validate'
  | 'process'
  | 'atlas'
  | 'audio'
  | 'manifest'
  | 'report'
  | 'contact-sheet'
  | 'prompts'
  | 'prompts:html'
  | 'build';

const STAGES: readonly Stage[] = [
  'import',
  'validate',
  'process',
  'atlas',
  'audio',
  'manifest',
  'report',
  'contact-sheet',
  'prompts',
  'prompts:html',
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

/**
 * Condition the generator's drop into `assets/source`.
 *
 * Kept out of `build` deliberately. `build` runs in CI, where the staging
 * directory does not exist; import is a one-off human-initiated step whose
 * output — the sprites and their anchors — is what gets committed and checked.
 */
async function runImport(): Promise<boolean> {
  const imported = await importStaging({ stagingDir: PATHS.staging, outputDir: PATHS.source });
  if (imported.length === 0) {
    console.log(`assets:import — nothing in ${PATHS.staging}.`);
    return true;
  }
  let renamed = 0;
  for (const asset of imported) {
    if (asset.renamed) renamed++;
    console.log(
      `${basename(asset.output).padEnd(38)} ${String(asset.width).padStart(4)}x${String(asset.height).padEnd(4)} ` +
        `anchor ${asset.anchor.x},${asset.anchor.y}  ${asset.reason}`,
    );
  }
  console.log(`\n${imported.length} assets imported into ${PATHS.source}; ${renamed} renamed from the drop.`);
  return true;
}

async function runValidate(): Promise<boolean> {
  const result = await validateDirectory();
  if (result.checked === 0) {
    empty('validate');
    return true;
  }

  let failures = 0;
  let waived = 0;
  let offFamily = 0;
  for (const asset of result.assets) {
    const label = asset.file.split('/').pop() ?? asset.file;
    const accepted = asset.findings.filter((entry) => entry.accepted === true);
    const family = asset.findings.filter((entry) => entry.ok && entry.detail.includes('OFF-FAMILY'));
    offFamily += family.length;
    if (asset.ok && accepted.length === 0) {
      if (family.length === 0) console.log(`ok   ${label}`);
      else {
        console.log(`warn ${label}`);
        for (const finding of family) console.log(`       ${finding.check}: ${finding.detail}`);
      }
      continue;
    }
    if (asset.ok) {
      // Waived, never silent: the measurement is printed exactly as it was taken.
      waived += accepted.length;
      console.log(`warn ${label}  (${accepted.length} accepted exception(s))`);
      for (const finding of accepted) console.log(`       ${finding.check}: ${finding.detail}`);
      for (const finding of family) console.log(`       ${finding.check}: ${finding.detail}`);
      continue;
    }
    failures++;
    console.log(`FAIL ${label}`);
    for (const finding of asset.findings.filter((entry) => !entry.ok && entry.accepted !== true)) {
      console.log(`       ${finding.check}: ${finding.detail}`);
    }
  }
  for (const finding of result.setFindings.filter((entry) => !entry.ok && entry.accepted !== true)) {
    failures++;
    console.log(`FAIL (set) ${finding.check}: ${finding.detail}`);
  }

  console.log(
    `\n${result.checked} assets, ${failures} failing, ${waived} accepted exception(s), ` +
      `${offFamily} off-family warning(s).`,
  );
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
  // Non-atlased categories are copied into the served root first: a file the
  // browser cannot reach has no URL, and until this ran the ground bake was
  // built, budgeted and invisible.
  const singles = publishSingles();
  const manifest = buildManifest({ singles });
  const hash = writeManifest(manifest);
  console.log(
    `${PATHS.manifest}\n  schema ${manifest.schemaVersion}, ${manifest.atlases.length} atlases, ` +
      `${manifest.singles.length} single(s), ` +
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

/**
 * Print every generation prompt, grouped by batch.
 *
 * The output is meant to be worked through in order: golden references first
 * and settled before anything else, then one category at a time in a single
 * session each (ASSET_PIPELINE §4.3 step 3).
 */
function runPrompts(): boolean {
  const assets = emitPrompts();
  let current = '';
  for (const asset of assets) {
    if (asset.batch !== current) {
      current = asset.batch;
      const count = assets.filter((entry) => entry.batch === current).length;
      console.log(
        `\n\n${'='.repeat(78)}\nBATCH: ${current}  (${count} assets — generate in ONE session)\n${'='.repeat(78)}`,
      );
    }
    console.log(`\n--- ${asset.file}${asset.split ? '   [SPLIT: also produce the _upper half]' : ''}\n`);
    console.log(asset.prompt);
  }
  console.log(`\n\n${assets.length} assets across ${new Set(assets.map((a) => a.batch)).size} batches.`);
  return true;
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
    case 'import':
      return runImport();
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
    case 'prompts':
      return runPrompts();
    case 'prompts:html': {
      const result = exportPromptHtml();
      console.log(
        `${result.path}\n  ${result.count} prompts · ${result.batches} batches · ` +
          `categories: ${result.categories.join(', ')}`,
      );
      return true;
    }
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
