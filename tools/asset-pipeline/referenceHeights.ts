import { readFileSync } from 'node:fs';
import { PATHS } from './paths.ts';

/**
 * The declared height of each subject, and the rule for checking against it.
 *
 * Deliberately incomplete. ASSET_PIPELINE §1.2 states seven heights and no more,
 * so seven are recorded and everything else is listed as pending. A missing
 * entry **fails** validation rather than passing: "nobody has decided how tall
 * this is" is an open art decision, and a validator that waves it through turns
 * an open decision into a silent one.
 */

export type ReferenceMode = 'reference' | 'envelope';

export interface ReferenceEntry {
  /** `category/subject`, with `*` allowed for the subject. */
  readonly match: string;
  readonly mode: ReferenceMode;
  readonly height: number;
  readonly tolerance?: number;
  readonly source: string;
  readonly reason?: string;
}

export interface ReferenceHeights {
  readonly version: number;
  readonly scale: number;
  readonly entries: readonly ReferenceEntry[];
  readonly pending: { readonly note: string; readonly subjects: readonly string[] };
}

let cached: ReferenceHeights | undefined;

export function loadReferenceHeights(path: string = PATHS.referenceHeights): ReferenceHeights {
  if (path === PATHS.referenceHeights && cached !== undefined) return cached;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as ReferenceHeights;
  if (path === PATHS.referenceHeights) cached = parsed;
  return parsed;
}

/**
 * Resolve `category/subject` to its entry.
 *
 * An exact match beats a wildcard, so `veh/sedan` can be given a precise height
 * even when `veh/*` has an envelope. Only one level of wildcard exists — the
 * table is a contract to be read by a person, not a routing language.
 */
export function resolveReference(
  subjectKey: string,
  table: ReferenceHeights = loadReferenceHeights(),
): ReferenceEntry | null {
  const exact = table.entries.find((entry) => entry.match === subjectKey);
  if (exact !== undefined) return exact;

  const category = subjectKey.split('/')[0];
  return table.entries.find((entry) => entry.match === `${category}/*`) ?? null;
}
