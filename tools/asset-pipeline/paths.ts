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
  /** Trimmed, anchored, sRGB-normalised. Generated; not checked in. */
  processed: resolve(REPO_ROOT, 'assets', 'processed'),
  /** Packed atlases, served directly. Generated; not checked in. */
  atlas: resolve(REPO_ROOT, 'public', 'atlas'),
  /** Contact sheets for the human consistency review. Generated. */
  contactSheets: resolve(REPO_ROOT, 'assets', 'contact-sheets'),
  manifest: resolve(REPO_ROOT, 'public', 'asset-manifest.json'),
  palette: resolve(REPO_ROOT, 'docs', 'assets', 'palette.json'),
  referenceHeights: resolve(REPO_ROOT, 'docs', 'assets', 'referenceHeights.json'),
  promptBlock: resolve(REPO_ROOT, 'docs', 'assets', 'PROMPT_BLOCK.md'),
  placeholders: resolve(REPO_ROOT, 'assets', '_placeholder'),
} as const;
