/**
 * Asset categories, atlases and budgets.
 *
 * Data only. This is the single source of truth shared by the build pipeline
 * under `tools/asset-pipeline/` and by the runtime loader in `src/render/`. A
 * category's budget is checked at build time and its atlas is fetched at run
 * time from the same row, so the two cannot drift.
 *
 * Every number here comes from ASSET_PIPELINE §7 (atlases) and §13 (budgets).
 * They are not targets — CI fails a build that exceeds one.
 */

/** Art is authored at 2x. ASSET_PIPELINE §1.2. */
export const PRODUCTION_SCALE = 2;

/**
 * Nothing taller than this may exist as a single sprite (ASSET_PIPELINE §1.4).
 *
 * This is a *depth sorting* rule wearing an art hat. A tall sprite overlaps
 * objects both in front of and behind its own footprint, which produces a cycle
 * that painter's algorithm cannot resolve — A occludes B while B occludes A.
 * Solving that at run time costs an O(n^2) topological sort every frame.
 * Splitting the art into `_lower` and `_upper` gives each half its own footprint
 * and its own depth, and the cycle never forms. Enforced by the validator.
 */
export const SPLIT_HEIGHT_LIMIT_PX = 160;

/** Atlas packing must not waste more than this. ASSET_PIPELINE §7. */
export const ATLAS_MIN_FILL = 0.7;

/**
 * When an atlas is fetched.
 *
 * `boot` is everything needed to draw the loading screen itself, so it must be
 * tiny. `critical` is everything the first playable frame needs. `lazy` arrives
 * when the stage that needs it is entered. ASSET_PIPELINE §14.
 */
export type LoadPriority = 'boot' | 'critical' | 'lazy';

export interface AtlasSpec {
  readonly id: string;
  /** Maximum page dimensions in pixels. Power of two, from ASSET_PIPELINE §7. */
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly priority: LoadPriority;
  /** `boot` also ships a PNG, because the loading screen must render even if
   *  WebP decoding is unavailable for any reason. Everything else is WebP only. */
  readonly pngFallback: boolean;
}

export const ATLASES = [
  { id: 'boot', maxWidth: 1024, maxHeight: 1024, priority: 'boot', pngFallback: true },
  { id: 'ui', maxWidth: 2048, maxHeight: 2048, priority: 'critical', pngFallback: false },
  { id: 'chars', maxWidth: 2048, maxHeight: 2048, priority: 'critical', pngFallback: false },
  { id: 'vehicles', maxWidth: 4096, maxHeight: 4096, priority: 'critical', pngFallback: false },
  { id: 'structures', maxWidth: 4096, maxHeight: 4096, priority: 'lazy', pngFallback: false },
  { id: 'props', maxWidth: 2048, maxHeight: 2048, priority: 'lazy', pngFallback: false },
  { id: 'nature', maxWidth: 2048, maxHeight: 2048, priority: 'lazy', pngFallback: false },
  { id: 'fx', maxWidth: 1024, maxHeight: 1024, priority: 'critical', pngFallback: false },
  { id: 'bg', maxWidth: 4096, maxHeight: 1024, priority: 'critical', pngFallback: false },
] as const satisfies readonly AtlasSpec[];

type AtlasId = (typeof ATLASES)[number]['id'];

export interface CategorySpec {
  /** The filename prefix. ASSET_PIPELINE §3. */
  readonly id: string;
  /** `null` means the category is too large to atlas and ships as single files. */
  readonly atlas: AtlasId | null;
  /** Compressed budget in bytes, ASSET_PIPELINE §13. */
  readonly budgetBytes: number;
  /** Expected file count from §13 — a sanity bound, not a hard gate. */
  readonly expectedFiles: number;
  readonly priority: LoadPriority;
  /** Images carry an `@<n>x` scale suffix; audio does not. */
  readonly kind: 'image' | 'audio' | 'font';
}

const MB = 1024 * 1024;

/**
 * Total decoded texture memory, in bytes — the budget the fill floor stands in for.
 *
 * ASSET_PIPELINE §17 and TECHNICAL_ARCHITECTURE §11 both state it: **192 MB
 * desktop, 96 MB mobile**. The mobile figure is the binding one, because a build
 * that fits only the desktop budget is a build that fails on half its audience.
 *
 * This is enforced; `ATLAS_MIN_FILL` is reported. That is a deliberate swap of
 * which quantity fails a build, made by ADR-013 on measurement: pages are
 * power-of-two, so a set whose content needs 862 kpx cannot have a 1.05 Mpx page
 * (MaxRects will not reach 82% occupancy) and lands on 2.1 Mpx — 41% fill, with
 * no packing that does better. An exhaustive search over every power-of-two page
 * confirmed those sizes are already minimal. A floor no correct build can reach
 * is not a floor, while the memory total is the number the documents actually
 * budget and the number a device actually runs out of.
 */
export const TEXTURE_MEMORY_BUDGET_BYTES = 96 * MB;

/**
 * The budget rows of ASSET_PIPELINE §13, expanded to one row per filename prefix.
 *
 * Two §13 rows cover more than one prefix, so their budget is shared and the
 * report sums the prefixes before comparing:
 *   - "UI + yemek ikonlari" covers `ui` and `food`
 *   - "Ses" covers `sfx` and `music`
 * `road` has no row of its own in §13; it is baked ground art by any other name
 * and shares the `ground` budget. That is recorded in `sharedBudget` rather than
 * silently double-counted.
 */
export const ASSET_CATEGORIES = [
  {
    id: 'char',
    atlas: 'chars',
    budgetBytes: 1.2 * MB,
    expectedFiles: 96,
    priority: 'critical',
    kind: 'image',
  },
  {
    id: 'veh',
    atlas: 'vehicles',
    budgetBytes: 2.4 * MB,
    expectedFiles: 90,
    priority: 'critical',
    kind: 'image',
  },
  {
    id: 'struct',
    atlas: 'structures',
    budgetBytes: 6.0 * MB,
    expectedFiles: 140,
    priority: 'lazy',
    kind: 'image',
  },
  { id: 'prop', atlas: 'props', budgetBytes: 1.5 * MB, expectedFiles: 70, priority: 'lazy', kind: 'image' },
  {
    id: 'nature',
    atlas: 'nature',
    budgetBytes: 1.0 * MB,
    expectedFiles: 35,
    priority: 'lazy',
    kind: 'image',
  },
  { id: 'ground', atlas: null, budgetBytes: 7.0 * MB, expectedFiles: 10, priority: 'lazy', kind: 'image' },
  { id: 'road', atlas: null, budgetBytes: 0, expectedFiles: 6, priority: 'lazy', kind: 'image' },
  { id: 'bg', atlas: 'bg', budgetBytes: 1.8 * MB, expectedFiles: 8, priority: 'critical', kind: 'image' },
  { id: 'ui', atlas: 'ui', budgetBytes: 0.8 * MB, expectedFiles: 60, priority: 'critical', kind: 'image' },
  { id: 'food', atlas: 'ui', budgetBytes: 0, expectedFiles: 30, priority: 'critical', kind: 'image' },
  { id: 'fx', atlas: 'fx', budgetBytes: 0.4 * MB, expectedFiles: 25, priority: 'critical', kind: 'image' },
  { id: 'sfx', atlas: null, budgetBytes: 5.0 * MB, expectedFiles: 55, priority: 'lazy', kind: 'audio' },
  { id: 'music', atlas: null, budgetBytes: 0, expectedFiles: 5, priority: 'lazy', kind: 'audio' },
  { id: 'font', atlas: null, budgetBytes: 0.15 * MB, expectedFiles: 2, priority: 'boot', kind: 'font' },
] as const satisfies readonly CategorySpec[];

export type CategoryId = (typeof ASSET_CATEGORIES)[number]['id'];

/**
 * Categories whose bytes count against another category's budget.
 *
 * A zero `budgetBytes` above always means "shares a budget"; this table says
 * whose. Any category with a zero budget and no entry here is a mistake, and
 * `tests/unit/tools/assetConfig.test.ts` fails on it.
 */
export const SHARED_BUDGETS: Readonly<Record<string, CategoryId>> = {
  road: 'ground',
  food: 'ui',
  music: 'sfx',
};

/** ASSET_PIPELINE §13. Both are enforced by `pnpm assets:report`. */
export const TOTAL_BUDGET_BYTES = 27.3 * MB;
export const CRITICAL_PATH_BUDGET_BYTES = 4 * MB;

/** ASSET_PIPELINE §14: the loading screen must be on screen inside 300 ms. */
export const BOOT_BUDGET_BYTES = 120 * 1024;

export function assetCategory(id: string): CategorySpec | undefined {
  return ASSET_CATEGORIES.find((category) => category.id === id);
}

export function atlasSpec(id: string): AtlasSpec | undefined {
  return ATLASES.find((atlas) => atlas.id === id);
}

/** Where the built manifest lands, relative to the served root. */
export const ASSET_MANIFEST_PATH = '/asset-manifest.json';
