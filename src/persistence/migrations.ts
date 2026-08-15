import { ECONOMY_BUCKET_COUNT } from '@config/economy/tuning';
import { CURRENT_SCHEMA_VERSION } from './schema';

/**
 * The migration chain.
 *
 * Built empty in Phase 2 and used for real in Phase 3, which is the whole
 * argument for building it early: the first schema change arrived one phase
 * later, and it landed on machinery that already had tests rather than on a
 * one-off upgrade path written under pressure.
 *
 * WORKING_DISCIPLINE rule 13 (backward compatibility) is enforced mechanically:
 * every version ships a committed fixture, and CI replays the whole
 * `v1 → current` chain on every push, forever. Fixtures are historical records
 * and are never regenerated — one rebuilt from today's code would prove only
 * that today's code agrees with itself.
 *
 * The chain *algorithm* is additionally tested against synthetic migrations, so
 * multi-step paths are covered before a second real migration exists.
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

/**
 * v1 → v2: placed objects gain a height.
 *
 * The first real migration, written in Phase 3 when the renderer started sorting
 * by height. Existing layouts sat on the ground, so 0 is not a guess — it is
 * exactly what a v1 save meant.
 *
 * Note what it does *not* do: it leaves every other field alone and it does not
 * reach for the current schema's types. A migration that imports the current
 * shape stops being a historical transform and starts silently changing meaning
 * whenever that shape moves.
 */
const v1ToV2: Migration = {
  from: 1,
  to: 2,
  up: (save) => {
    const layout = save['layout'];
    const placed =
      layout !== null && typeof layout === 'object' ? (layout as { placed?: unknown }).placed : undefined;

    const upgraded = Array.isArray(placed)
      ? placed.map((entry: unknown) =>
          entry !== null && typeof entry === 'object' ? { z: 0, ...entry } : entry,
        )
      : placed;

    return {
      ...save,
      schemaVersion: 2,
      layout: { ...(typeof layout === 'object' && layout !== null ? layout : {}), placed: upgraded },
    };
  },
};

/**
 * v2 → v3: the traffic arrival cursor becomes part of the save.
 *
 * Phase 5 gave the world a Poisson process whose next-candidate time decides
 * every future arrival. A v2 save has no such field, and 0 is the correct value
 * rather than a placeholder: it means "the next candidate is due immediately",
 * which is exactly how a fresh world starts. The spawn system snaps a cursor
 * that lies in the past up to the current time, so an old save resumes with
 * traffic arriving normally instead of replaying an entire day of backlog.
 */
const v2ToV3: Migration = {
  from: 2,
  to: 3,
  up: (save) => ({
    ...save,
    schemaVersion: 3,
    traffic: { nextCandidateMs: 0 },
  }),
};

/**
 * v3 → v4: vehicles past the restaurant split into convertible and decorative.
 *
 * Phase 5's executive decision put decorative traffic on the road so it would
 * look busy without moving the 24-per-minute demand the economy is calibrated
 * on. That makes `vehiclesSpawned` ambiguous on its own, so a second counter
 * arrived beside it.
 *
 * A v3 save predates decorative traffic entirely: every vehicle it counted was
 * convertible. Copying the old total across is therefore exactly what the save
 * meant, not a default.
 */
const v3ToV4: Migration = {
  from: 3,
  to: 4,
  up: (save) => {
    const stats = save['stats'];
    const previous =
      stats !== null && typeof stats === 'object'
        ? (stats as { vehiclesSpawned?: unknown }).vehiclesSpawned
        : 0;

    return {
      ...save,
      schemaVersion: 4,
      stats: {
        ...(typeof stats === 'object' && stats !== null ? stats : {}),
        convertibleSpawned: typeof previous === 'number' ? previous : 0,
      },
      // A v3 save has one arrival cursor. Decorative traffic starts due
      // immediately, which is how a fresh world starts and what the spawn
      // system's past-due snap expects.
      traffic: {
        ...(typeof save['traffic'] === 'object' && save['traffic'] !== null ? save['traffic'] : {}),
        nextDecorativeMs: 0,
      },
    };
  },
};

/**
 * v4 to v5 — the Phase 6 conversion funnel.
 *
 * Four lifetime counters, all zero in a v4 save because nothing counted them.
 * Zero is the honest value rather than a default: a save written before the
 * conversion system existed genuinely had no conversions, and inventing a
 * plausible number from `vehiclesSpawned` would put a fabricated history in
 * front of the player the first time they open the analysis panel.
 */
const v4ToV5: Migration = {
  from: 4,
  to: 5,
  up: (save) => {
    const stats = save['stats'];
    return {
      ...save,
      schemaVersion: 5,
      stats: {
        ...(typeof stats === 'object' && stats !== null ? stats : {}),
        conversionsSucceeded: 0,
        conversionsFailed: 0,
        turnedAwayNoParking: 0,
        customersAbandoned: 0,
      },
    };
  },
};

/**
 * v5 to v6 — the Phase 9 economy.
 *
 * A v5 save has cash and a lifetime revenue total but no record of what was
 * spent and no income window, because neither existed. Both are filled with
 * zeroes, and zero is the honest value for the same reason it was in v4→v5: a
 * save written before the window existed genuinely has no last-sixty-seconds,
 * and reconstructing a plausible rate from `lifetimeRevenue` would put a
 * fabricated number on the HUD the moment the player resumed.
 *
 * The window is written at the length **this build** uses. A save is data; the
 * shape of the world is config, and a migration that guessed a length from the
 * save would hand `applySnapshot` an array of the wrong size.
 */
const v5ToV6: Migration = {
  from: 5,
  to: 6,
  up: (save) => {
    const economy = save['economy'];
    const buckets = new Array<number>(ECONOMY_BUCKET_COUNT).fill(0);
    return {
      ...save,
      schemaVersion: 6,
      economy: {
        ...(typeof economy === 'object' && economy !== null ? economy : {}),
        lifetimeSpend: 0,
        revenueWindow: buckets,
        expenseWindow: [...buckets],
        bucketIndex: 0,
        bucketElapsedMs: 0,
      },
    };
  },
};

export const migrations: readonly Migration[] = [v1ToV2, v2ToV3, v3ToV4, v4ToV5, v5ToV6];

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
