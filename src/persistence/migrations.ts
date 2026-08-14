import { CURRENT_SCHEMA_VERSION } from './schema';

/**
 * The migration chain.
 *
 * Empty today — version 1 is the current version — and that is exactly why it
 * exists now. Retrofitting migrations after players have saves means the first
 * schema change either breaks their progress or ships with an untested one-off
 * upgrade path. WORKING_DISCIPLINE rule 13 (backward compatibility) is enforced
 * mechanically instead: every version ships a committed fixture, and CI replays
 * the whole `v1 → current` chain on every push, forever.
 *
 * The chain *algorithm* is tested against synthetic migrations rather than
 * against the (currently empty) real list, so the machinery is already proven on
 * the day the first real migration is written.
 */

export interface Migration {
  readonly from: number;
  readonly to: number;
  /** Pure transform. It must not read the clock, the network or storage. */
  readonly up: (save: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Ordered, contiguous, one version per step.
 *
 * A gap would make a save silently unmigratable at exactly the moment a player
 * opens it, so the shape is asserted rather than trusted.
 */
export function assertContiguous(steps: readonly Migration[]): void {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step === undefined) continue;
    const expectedFrom = i + 1;
    if (step.from !== expectedFrom || step.to !== expectedFrom + 1) {
      throw new RangeError(
        `Migration ${i} must go from ${expectedFrom} to ${expectedFrom + 1}, declares ${step.from}→${step.to}`,
      );
    }
  }
}

export const migrations: readonly Migration[] = [];

assertContiguous(migrations);

export type MigrationOutcome =
  | { readonly ok: true; readonly save: Record<string, unknown>; readonly steps: number }
  | { readonly ok: false; readonly reason: 'future-version' | 'no-path'; readonly detail: string };

/**
 * Bring a save up to the target schema version.
 *
 * A save from a newer build is refused rather than coerced: the player has an
 * older tab open somewhere, and rewriting their newer progress into an older
 * shape is data loss dressed up as compatibility.
 *
 * `steps` and `targetVersion` are injectable so the chain can be exercised with
 * synthetic migrations while the real list is still empty.
 */
export function migrateToCurrent(
  save: Record<string, unknown>,
  fromVersion: number,
  steps: readonly Migration[] = migrations,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): MigrationOutcome {
  if (fromVersion > targetVersion) {
    return {
      ok: false,
      reason: 'future-version',
      detail: `save schema v${fromVersion} is newer than this build's v${targetVersion}`,
    };
  }

  let current = save;
  let version = fromVersion;
  let applied = 0;

  while (version < targetVersion) {
    const step = steps.find((candidate) => candidate.from === version);
    if (step === undefined) {
      return {
        ok: false,
        reason: 'no-path',
        detail: `no migration registered from schema v${version}`,
      };
    }
    current = step.up(current);
    version = step.to;
    applied++;
  }

  return { ok: true, save: current, steps: applied };
}
