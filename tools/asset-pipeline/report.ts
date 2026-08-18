import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  ASSET_CATEGORIES,
  ATLAS_MIN_FILL,
  TEXTURE_MEMORY_BUDGET_BYTES,
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
 * Which budget group an atlas ships bytes for, when it ships for exactly one.
 *
 * The §13 table budgets categories and a page could in principle mix several,
 * which is why this used to measure processed PNGs instead. In *this* atlas
 * layout no page mixes budget groups: every atlas takes one category, except
 * `ui`, which takes `ui` and `food` — and `SHARED_BUDGETS` already folds `food`
 * into `ui`. So the shipped bytes are attributable after all, and they are the
 * honest measure: a lossless intermediate PNG is not what reaches a player's
 * connection. Vehicles measured 3.04 MB of PNG against a 2.40 MB budget and
 * 1.42 MB of the WebP that actually ships.
 *
 * The map is computed rather than written down, so an atlas that later mixes two
 * budget groups falls back to processed bytes instead of silently under-counting.
 */
export function atlasBudgetGroups(): Map<string, string> {
  const groups = new Map<string, Set<string>>();
  for (const category of ASSET_CATEGORIES) {
    if (category.atlas === null) continue;
    const target = SHARED_BUDGETS[category.id] ?? category.id;
    const existing = groups.get(category.atlas);
    if (existing === undefined) groups.set(category.atlas, new Set([target]));
    else existing.add(target);
  }
  const single = new Map<string, string>();
  for (const [atlas, targets] of groups) {
    const only = [...targets];
    if (only.length === 1 && only[0] !== undefined) single.set(atlas, only[0]);
  }
  return single;
}

/**
 * Bytes per budget group: the shipped atlas where one is attributable, the
 * processed files where it is not.
 *
 * `ground`, `road`, `sfx`, `music` and `font` have no atlas — they ship as
 * individual files — so for them the processed size *is* the shipped size.
 */
export function categoryBytes(
  processedDir: string = PATHS.processed,
  atlases: readonly PackedAtlas[] = [],
): Map<string, number> {
  const totals = new Map<string, number>();
  const attributable = atlasBudgetGroups();
  const covered = new Set<string>();

  for (const atlas of atlases) {
    const target = attributable.get(atlas.id);
    if (target === undefined) continue;
    totals.set(target, (totals.get(target) ?? 0) + atlas.bytes);
    covered.add(target);
  }

  if (!existsSync(processedDir)) return totals;
  for (const entry of readdirSync(processedDir).sort()) {
    if (entry.endsWith('.meta.json')) continue;
    const parsed = parseAssetName(entry);
    if (!parsed.ok) continue;
    const id = parsed.name.category.id;
    const target = SHARED_BUDGETS[id] ?? id;
    if (covered.has(target)) continue;
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
  const bytes = categoryBytes(input.processedDir, input.atlases);

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
    // Decoded, not compressed: a GPU holds `w * h * 4` bytes per page whatever
    // the WebP on the wire weighed.
    line(
      'texture memory',
      input.atlases.reduce((sum, atlas) => sum + atlas.textureBytes, 0),
      TEXTURE_MEMORY_BUDGET_BYTES,
    ),
  ];

  /*
   * Reported, not enforced — ADR-013. Power-of-two pages make the ratio
   * unreachable for a small set no matter how well it is packed, so the line
   * that fails a build is the texture-memory total below, which is the budget
   * ASSET_PIPELINE §17 and TECHNICAL_ARCHITECTURE §11 actually state. A fill
   * under the floor still prints, because it is the first thing to look at when
   * the memory total starts climbing.
   */
  const atlases = input.atlases.map((atlas) => ({
    label: `${atlas.id} fill`,
    bytes: Math.round(atlas.fill * 100),
    budget: Math.round(ATLAS_MIN_FILL * 100),
    ok: true,
    detail:
      `${(atlas.fill * 100).toFixed(1)}% of ${atlas.pages} page(s), ${atlas.frames} frames, ` +
      `${kb(atlas.textureBytes)} decoded (${kb(atlas.wastedBytes)} empty)` +
      (atlas.fill < ATLAS_MIN_FILL ? `  [under the ${(ATLAS_MIN_FILL * 100).toFixed(0)}% guide]` : ''),
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

  section('Categories (shipped bytes vs ASSET_PIPELINE §13)', report.categories);
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
