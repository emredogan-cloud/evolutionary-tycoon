import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Every path the asset pipeline touches, in one place.
 *
 * Resolved from this file's own location rather than `process.cwd()`, so the
 * pipeline behaves identically whether it is run by pnpm from the repo root, by
 * Vitest from a temp directory, or by CI.
 */

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, '..', '..');

export const PATHS = {
  /** Raw AI output. Checked in — it cannot be regenerated. ASSET_PIPELINE §9. */
  source: resolve(REPO_ROOT, 'assets', 'source'),
  /**
   * Where the generator's drop lands before it is conditioned.
   *
   * Gitignored: it is 153 MB of 1500px illustrations, and every byte of it that
   * matters survives into `assets/source` as a sprite. `assets:import` is the
   * only thing that reads it, and `docs/ASSET_INTEGRATION_REPORT.md` records the
   * filename mapping so the provenance survives the directory not being.
   */
  staging: resolve(REPO_ROOT, 'docs', 'assets', 'sources'),
  /** Trimmed, anchored, sRGB-normalised. Generated; not checked in. */
  processed: resolve(REPO_ROOT, 'assets', 'processed'),
  /** Packed atlases, served directly. Generated; not checked in. */
  atlas: resolve(REPO_ROOT, 'public', 'atlas'),
  /** Contact sheets for the human consistency review. Generated. */
  contactSheets: resolve(REPO_ROOT, 'assets', 'contact-sheets'),
  manifest: resolve(REPO_ROOT, 'public', 'asset-manifest.json'),
  palette: resolve(REPO_ROOT, 'docs', 'assets', 'palette.json'),
  subjectDimensions: resolve(REPO_ROOT, 'docs', 'assets', 'subjectDimensions.json'),
  productionBatches: resolve(REPO_ROOT, 'docs', 'assets', 'productionBatches.json'),
  /** The offline copy-and-paste page for whoever runs the generator. */
  promptHtml: resolve(REPO_ROOT, 'docs', 'ASSET_GENERATION_PROMPTS.html'),
  promptBlock: resolve(REPO_ROOT, 'docs', 'assets', 'PROMPT_BLOCK.md'),
  placeholders: resolve(REPO_ROOT, 'assets', '_placeholder'),
  /** Per-asset check waivers, each with a measured value and a date. ADR-013. */
  acceptedExceptions: resolve(REPO_ROOT, 'docs', 'assets', 'ACCEPTED_EXCEPTIONS.json'),
  /** Which delivered file actually shows which facing. See the file's own note. */
  directionAudit: resolve(REPO_ROOT, 'docs', 'assets', 'DIRECTION_AUDIT.json'),
} as const;
