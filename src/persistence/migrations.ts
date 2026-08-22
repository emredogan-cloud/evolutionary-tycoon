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

/**
 * v6 to v7 — the Phase 10 payroll.
 *
 * An empty staff list, a zeroed settlement cursor, and a zeroed walkout
 * counter. Empty is the honest value and not merely the easy one: a v6 save was
 * written by a build where employees could not be hired, so the player genuinely
 * had none, and inventing one would spend their money for them.
 *
 * `hired` is left alone. It has been in the schema since Phase 2 as an empty
 * array and Phase 10 did not start using it — the payroll lives in
 * `staff.employees`, next to it, because `hired` carries a `roleId` string where
 * the simulation indexes roles by position. Reconciling the two is a change
 * request, not a migration.
 */
const v6ToV7: Migration = {
  from: 6,
  to: 7,
  up: (save) => {
    const staff = save['staff'];
    const stats = save['stats'];
    return {
      ...save,
      schemaVersion: 7,
      staff: {
        ...(typeof staff === 'object' && staff !== null ? staff : { hired: [] }),
        settleElapsedMs: 0,
        employees: [],
      },
      stats: {
        ...(typeof stats === 'object' && stats !== null ? stats : {}),
        employeesLeftUnpaid: 0,
      },
    };
  },
};

/**
 * v7 to v8 — the Phase 11 evolution.
 *
 * A v7 save was written by a build with one stage, so: nothing pending, nothing
 * under construction, and a layout revision of zero. Zero is the honest value
 * for the revision in particular — it is an invalidation counter, and starting a
 * resumed session at zero simply means the navigation cache rebuilds once on the
 * first tick, which it would have done anyway.
 *
 * `stage` itself is untouched. It has been in the schema since Phase 2 and a v7
 * save legitimately holds whichever stage it was on; inventing a transition here
 * would evolve somebody's restaurant while they were not looking.
 */
const v7ToV8: Migration = {
  from: 7,
  to: 8,
  up: (save) => {
    const progression = save['progression'];
    const layout = save['layout'];
    const stats = save['stats'];
    return {
      ...save,
      schemaVersion: 8,
      progression: {
        ...(typeof progression === 'object' && progression !== null
          ? progression
          : { stage: 1, unlocks: [], milestones: [] }),
        pendingStage: 0,
      },
      construction: { targetStage: 0, elapsedMs: 0, totalMs: 0 },
      layout: {
        ...(typeof layout === 'object' && layout !== null ? layout : { placed: [], upgrades: [] }),
        revision: 0,
      },
      stats: {
        ...(typeof stats === 'object' && stats !== null ? stats : {}),
        driveThruServed: 0,
      },
    };
  },
};

/**
 * v9 — Phase 14, offline progression.
 *
 * `meter: null` rather than a zeroed summary, and the distinction is the
 * honest one: a v8 save measured nothing, and a zeroed summary would read as
 * "measured zero throughput", which prices the away window as pure wage loss.
 * A migrated player's first return simply has no offline report; measurement
 * starts with their next session.
 */
const v8ToV9: Migration = {
  from: 8,
  to: 9,
  up: (save) => ({
    ...save,
    schemaVersion: 9,
    offline: { meter: null, pending: null },
  }),
};

/**
 * v10 — Phase 15, the environment calendar.
 *
 * `plannedDay: -1` means "never planned": the first tick after load plans the
 * *current* day from the events stream exactly as a fresh world would. That
 * consumes stream draws a v9 session never made — acceptable and honest,
 * because a v9 session never had a calendar to preserve in the first place.
 */
const v9ToV10: Migration = {
  from: 9,
  to: 10,
  up: (save) => ({
    ...save,
    schemaVersion: 10,
    environment: {
      plannedDay: -1,
      weatherSegments: [0, 0, 0, 0],
      eventTypes: [-1, -1, -1, -1, -1, -1],
      eventStartMs: [0, 0, 0, 0, 0, 0],
      eventEndMs: [0, 0, 0, 0, 0, 0],
      lastWeather: -1,
      lastActiveEvent: -1,
    },
  }),
};

/**
 * v11 — Phase 17, the audio director's fourth slider.
 *
 * Ambience arrives at full volume, the same default a fresh world gets: a v10
 * player has been hearing nothing (no audio system existed), so "as loud as
 * the master allows" is the default they would have chosen by never touching
 * a slider that did not exist.
 */
const v10ToV11: Migration = {
  from: 10,
  to: 11,
  up: (save) => {
    /*
     * Defensive against the minimal hand-built chain fixtures, like every
     * migration before it: a v1 object may not carry `settings` at all, and
     * this step's only job is the one field it introduces.
     */
    const previous = (save as { settings?: { audio?: Record<string, unknown> } }).settings;
    return {
      ...save,
      schemaVersion: 11,
      settings: {
        ...(previous ?? {}),
        audio: { ...(previous?.audio ?? {}), ambience: 1 },
      },
    };
  },
};

/**
 * v12 — the UI/world correction pass: construction sites, and real ids for
 * placed decor.
 *
 * Two things at once, because they are one change seen from two sides. The
 * build panel's decor used to store the placeholder stems (`ph-prop-short`,
 * `ph-prop-tall`) — ids that name programmatic textures no production build
 * draws, which is half of why a purchase was invisible. Old records map onto
 * the closest production object: the short stem served both the planter and
 * the bin and the two cannot be told apart in an old save, so both become
 * the planter bush — a neutral piece of decor either intent reads as. The
 * tall stem was only ever the lamp.
 *
 * `pendingBuilds` starts empty: a v11 purchase was applied the instant it was
 * paid for, so there is nothing mid-construction to carry over.
 */
const v11ToV12: Migration = {
  from: 11,
  to: 12,
  up: (save) => {
    const layout = (save as { layout?: { placed?: { objectId?: unknown }[] } }).layout;
    const LEGACY_IDS: Record<string, string> = {
      'ph-prop-short': 'bush-flowering-01',
      'ph-prop-tall': 'lamp',
    };
    // Defensive against the minimal hand-built chain fixtures, like every
    // migration before it: a v1 object may carry no layout at all.
    const rows: unknown[] = Array.isArray(layout?.placed) ? layout.placed : [];
    const placed = rows.map((row) => {
      // Non-object rows survive as they are; the schema validation after the
      // chain is the authority on rejecting them, not the migration.
      if (row === null || typeof row !== 'object') return row;
      const object = row as { objectId?: unknown };
      const key = typeof object.objectId === 'string' ? object.objectId : '';
      return { ...object, objectId: LEGACY_IDS[key] ?? object.objectId };
    });
    return {
      ...save,
      schemaVersion: 12,
      layout: { ...(layout ?? {}), placed, pendingBuilds: [] },
    };
  },
};

export const migrations: readonly Migration[] = [
  v1ToV2,
  v2ToV3,
  v3ToV4,
  v4ToV5,
  v5ToV6,
  v6ToV7,
  v7ToV8,
  v8ToV9,
  v9ToV10,
  v10ToV11,
  v11ToV12,
];

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
