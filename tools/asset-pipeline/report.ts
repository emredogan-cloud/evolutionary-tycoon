import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  ASSET_CATEGORIES,
  ATLAS_MIN_FILL,
  BOOT_BUDGET_BYTES,
  CRITICAL_PATH_BUDGET_BYTES,
  SHARED_BUDGETS,
  TOTAL_BUDGET_BYTES,
} from '../../src/config/assets.ts';
import type { PackedAtlas } from './atlas.ts';
import type { AssetManifest } from './manifest.ts';
import { parseAssetName } from './naming.ts';
import { PATHS } from './paths.ts';

/**
 * Budget enforcement — ASSET_PIPELINE §13.
 *
 * "CI'da zorlanir. Asim = kirmizi build." Over budget is a failed build, not a
 * warning, and the reason is not tidiness: Vercel bills bandwidth, and a mobile
 * player on a slow connection experiences the byte count directly. A budget that
 * only prints a number is a budget nobody keeps.
 *
 * This module only measures and compares. It never adjusts a limit to fit what
 * was built — that direction of causation is how budgets die.
 */

export interface BudgetLine {
  readonly label: string;
  readonly bytes: number;
  readonly budget: number;
  readonly ok: boolean;
  readonly detail: string;
}

export interface AssetReport {
  readonly categories: readonly BudgetLine[];
  readonly totals: readonly BudgetLine[];
  readonly atlases: readonly BudgetLine[];
  readonly ok: boolean;
  readonly placeholders: number;
}

function kb(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function line(label: string, bytes: number, budget: number): BudgetLine {
  const ok = bytes <= budget;
  const share = budget === 0 ? 0 : (bytes / budget) * 100;
  return {
    label,
    bytes,
    budget,
    ok,
    detail: `${kb(bytes)} / ${kb(budget)} (${share.toFixed(1)}%)`,
  };
}

/**
 * Category bytes measured on the *processed* files, not the atlas pages.
 *
 * The §13 table budgets categories, but a page mixes several of them, so an
 * atlas cannot be attributed back. Processed PNGs are the closest honest
 * measure of what a category costs, and they are what the atlas is built from.
 * The atlas totals are checked separately against the critical-path budget,
 * which is the number that actually reaches a player's connection.
 */
export function categoryBytes(processedDir: string = PATHS.processed): Map<string, number> {
  const totals = new Map<string, number>();
  if (!existsSync(processedDir)) return totals;

  for (const entry of readdirSync(processedDir).sort()) {
    if (entry.endsWith('.meta.json')) continue;
    const parsed = parseAssetName(entry);
    if (!parsed.ok) continue;
    const id = parsed.name.category.id;
    const target = SHARED_BUDGETS[id] ?? id;
    totals.set(target, (totals.get(target) ?? 0) + statSync(join(processedDir, entry)).size);
  }
  return totals;
}

export function countPlaceholders(dir: string = PATHS.placeholders): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((entry) => entry.includes('__PLACEHOLDER__')).length;
}

export interface ReportInput {
  readonly manifest: AssetManifest;
  readonly atlases: readonly PackedAtlas[];
  readonly processedDir?: string;
  readonly placeholderDir?: string;
}

export function buildReport(input: ReportInput): AssetReport {
  const bytes = categoryBytes(input.processedDir);

  const categories = ASSET_CATEGORIES.filter((category) => category.budgetBytes > 0)
    .map((category) => {
      const shared = Object.entries(SHARED_BUDGETS)
        .filter(([, target]) => target === category.id)
        .map(([id]) => id);
      const label = shared.length > 0 ? `${category.id} (+${shared.join(', ')})` : category.id;
      return line(label, bytes.get(category.id) ?? 0, category.budgetBytes);
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const totals = [
    line('total', input.manifest.totals.bytes, TOTAL_BUDGET_BYTES),
    line('critical path', input.manifest.totals.criticalBytes, CRITICAL_PATH_BUDGET_BYTES),
    line('boot', input.manifest.totals.bootBytes, BOOT_BUDGET_BYTES),
  ];

  const atlases = input.atlases.map((atlas) => ({
    label: `${atlas.id} fill`,
    bytes: Math.round(atlas.fill * 100),
    budget: Math.round(ATLAS_MIN_FILL * 100),
    // Fill is a *floor*, the only line in this file where more is better.
    ok: atlas.fill >= ATLAS_MIN_FILL,
    detail: `${(atlas.fill * 100).toFixed(1)}% of ${atlas.pages} page(s), ${atlas.frames} frames — need >= ${(ATLAS_MIN_FILL * 100).toFixed(0)}%`,
  }));

  return {
    categories,
    totals,
    atlases,
    placeholders: countPlaceholders(input.placeholderDir),
    ok: [...categories, ...totals, ...atlases].every((entry) => entry.ok),
  };
}

export function formatReport(report: AssetReport): string {
  const out: string[] = [];
  const section = (title: string, lines: readonly BudgetLine[]): void => {
    out.push(`\n${title}`);
    if (lines.length === 0) {
      out.push('  (nothing built)');
      return;
    }
    for (const entry of lines) {
      out.push(`  ${entry.ok ? 'ok  ' : 'FAIL'} ${entry.label.padEnd(22)} ${entry.detail}`);
    }
  };

  section('Categories (processed bytes vs ASSET_PIPELINE §13)', report.categories);
  section('Totals (manifest bytes)', report.totals);
  section('Atlas fill (§7, floor not ceiling)', report.atlases);
  out.push(`\nPlaceholders in the tree: ${report.placeholders}`);
  out.push(report.ok ? '\nAll budgets within limits.' : '\nBUDGET EXCEEDED — build must fail.');
  return out.join('\n');
}

/** Placeholder filenames, for the register cross-check. */
export function placeholderNames(dir: string = PATHS.placeholders): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.includes('__PLACEHOLDER__'))
    .map((entry) => basename(entry))
    .sort();
}
