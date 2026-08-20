import { z } from 'zod';
import { SAVE_SCHEMA_VERSION } from '@config/simulation';

/**
 * Tell Zod not to probe for its JIT fast path.
 *
 * By default Zod tests whether it may compile validators with the `Function`
 * constructor. Our Content-Security-Policy is `script-src 'self'` with no
 * `unsafe-eval`, so that probe is refused. Zod catches the refusal and falls
 * back to the interpreted path — correct behaviour — but the browser logs the
 * CSP violation to the console first, and Firefox reports it as an error.
 *
 * Found by the preview E2E gate against a real deployment, which is exactly the
 * class of problem a local build cannot show.
 *
 * Declaring `jitless` up front skips the probe entirely: no violation, no
 * console error, and the CSP stays as strict as it should be. `unsafe-eval` is
 * the single most valuable thing that policy forbids, and it is not being
 * loosened for a validator fast path that runs once per save load.
 */
z.config({ jitless: true });

/**
 * The save file — schema version 10.
 *
 * v2 added `z` to placed objects. Phase 3 sorts the world by height, so an
 * object on a counter has to draw in front of the counter, and a stored layout
 * without a height cannot express that.
 *
 * The envelope fields and the world snapshot sit side by side at the top level
 * (TECHNICAL_ARCHITECTURE §8.1). Validation is Zod rather than a hand-written
 * type guard because a save is the one piece of *untrusted input* this game
 * accepts: it may have been written by an older build, hand-edited, truncated by
 * a storage quota, or produced by a different game entirely if a key collides.
 * A wrong shape must be rejected cleanly, never half-applied.
 */

const rngStateSchema = z.object({
  a: z.number().int(),
  b: z.number().int(),
  c: z.number().int(),
  d: z.number().int(),
});

const rngStatesSchema = z.object({
  traffic: rngStateSchema,
  conversion: rngStateSchema,
  customer: rngStateSchema,
  tips: rngStateSchema,
  events: rngStateSchema,
  cosmetic: rngStateSchema,
});

const stringNumberEntries = z.array(z.tuple([z.string(), z.number()]));

const saveFileV10Schema = z.object({
  /*
   * From the constant, never a literal. It was written out by hand until Phase 6
   * bumped the version and the composer started emitting saves its own schema
   * rejected — the same duplication that left the production smoke test
   * asserting `schemaVersion !== 1` three phases after v1.
   */
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  buildSha: z.string(),
  createdAt: z.number(),
  lastSeenAt: z.number(),
  lastSeenServerAt: z.number().nullable(),
  playtimeMs: z.number().nonnegative(),

  tick: z.number().int().nonnegative(),
  nextEntityId: z.number().int().positive(),
  clock: z.object({ simTimeMs: z.number().nonnegative() }),
  rng: rngStatesSchema,
  control: z.object({
    speedMultiplier: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    paused: z.boolean(),
  }),
  progression: z.object({
    stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    unlocks: z.array(z.string()),
    milestones: z.array(z.string()),
    // Phase 11 — evolution.
    pendingStage: z.number().int().min(0).max(4),
  }),
  construction: z.object({
    targetStage: z.number().int().min(0).max(4),
    elapsedMs: z.number().nonnegative(),
    totalMs: z.number().nonnegative(),
  }),
  economy: z.object({
    cash: z.number(),
    reputation: z.number(),
    lifetimeRevenue: z.number(),
    // Phase 9 — spend and the sixty-second income window.
    lifetimeSpend: z.number(),
    prices: stringNumberEntries,
    revenueWindow: z.array(z.number()),
    expenseWindow: z.array(z.number()),
    bucketIndex: z.number().int().nonnegative(),
    bucketElapsedMs: z.number().nonnegative(),
  }),
  layout: z.object({
    placed: z.array(z.object({ objectId: z.string(), x: z.number(), y: z.number(), z: z.number() })),
    revision: z.number().int().nonnegative(),
    upgrades: stringNumberEntries,
  }),
  staff: z.object({
    hired: z.array(z.object({ entityId: z.number().int(), roleId: z.string() })),
    // Phase 10 — the payroll and the wage-settlement cursor.
    settleElapsedMs: z.number().nonnegative(),
    employees: z.array(
      z.object({
        entityId: z.number().int(),
        role: z.number().int().nonnegative(),
        skill: z.number().min(0).max(1),
        wagePerMinute: z.number().nonnegative(),
        accruedWages: z.number().nonnegative(),
        unpaidMs: z.number().nonnegative(),
        x: z.number(),
        y: z.number(),
      }),
    ),
  }),
  stats: z.object({
    customersServed: z.number().int().nonnegative(),
    // Phase 6 — the conversion funnel.
    conversionsSucceeded: z.number().int().nonnegative(),
    conversionsFailed: z.number().int().nonnegative(),
    turnedAwayNoParking: z.number().int().nonnegative(),
    customersAbandoned: z.number().int().nonnegative(),
    vehiclesSpawned: z.number().int().nonnegative(),
    convertibleSpawned: z.number().int().nonnegative(),
    commandsApplied: z.number().int().nonnegative(),
  }),
  /*
   * The arrival process, added in Phase 5.
   *
   * Vehicles themselves are transient and deliberately not saved, but the
   * Poisson cursor is not a vehicle — it decides every future arrival. A save
   * that dropped it would resume with a different traffic stream from the same
   * seed, which is precisely what Day Replay depends on not happening.
   */
  traffic: z.object({
    nextCandidateMs: z.number().nonnegative(),
    nextDecorativeMs: z.number().nonnegative(),
  }),
  /*
   * The day's calendar — Phase 15, schema v10. Plan, not derivation: a reload
   * that replanned would draw from a stream that has moved and hand the
   * afternoon different weather from the one that was saved.
   */
  environment: z.object({
    plannedDay: z.number().int().min(-1),
    weatherSegments: z.array(z.number().int().min(0).max(3)).length(4),
    eventTypes: z.array(z.number().int().min(-1)).length(6),
    eventStartMs: z.array(z.number()).length(6),
    eventEndMs: z.array(z.number()).length(6),
    lastWeather: z.number().int().min(-1),
    lastActiveEvent: z.number().int().min(-1),
  }),
  settings: z.object({
    audio: z.object({
      master: z.number().min(0).max(1),
      music: z.number().min(0).max(1),
      sfx: z.number().min(0).max(1),
      muted: z.boolean(),
    }),
    a11y: z.object({ reducedMotion: z.boolean(), highContrast: z.boolean() }),
  }),

  /*
   * Offline progression — Phase 14, schema v9.
   *
   * Envelope fields, not world state: the meter summary is a *measurement*
   * taken at save time, and the pending report is an unclaimed IOU. Neither
   * enters `World.hash()` — their only route into the simulation is the
   * COLLECT_OFFLINE command, which carries explicit amounts and is logged.
   *
   * `meter: null` means "this save never measured" — the v8→v9 migration
   * writes that, so a pre-P14 save's first return computes no reward instead
   * of a fabricated one. `pending: null` means nothing is owed.
   */
  offline: z.object({
    meter: z
      .object({
        throughputPerMin: z.number().nonnegative(),
        avgTicket: z.number().nonnegative(),
        avgCogs: z.number().nonnegative(),
        turnedAwayPerMin: z.number().nonnegative(),
        utilization: z.array(z.number().min(0).max(1)).length(5),
      })
      .nullable(),
    pending: z
      .object({
        /** Local wall clock when the window was consumed and priced. */
        computedAtMs: z.number(),
        awayMs: z.number().nonnegative(),
        creditedMs: z.number().nonnegative(),
        customersServed: z.number().int().nonnegative(),
        gross: z.number().nonnegative(),
        expenses: z.number().nonnegative(),
        net: z.number(),
        limiter: z.enum(['parking', 'kitchen', 'tables', 'staff', 'queue', 'demand']),
        limiterUtilization: z.number().min(0).max(1),
        turnedAway: z.number().int().nonnegative(),
        capHalved: z.boolean(),
      })
      .nullable(),
  }),

  checksum: z.string(),
});

/**
 * The version this build reads and writes.
 *
 * Call sites use the version-neutral names, so bumping the schema is an edit
 * here rather than a sweep across the codebase. The versioned schema stays
 * private: nothing outside this module should be able to pin itself to v10.
 */
export const currentSaveSchema = saveFileV10Schema;
export type CurrentSaveFile = z.infer<typeof saveFileV10Schema>;

/** The version this build writes. Any stored save at a lower version is migrated first. */
export const CURRENT_SCHEMA_VERSION = SAVE_SCHEMA_VERSION;

/**
 * Enough of an unknown save to route it: version first, everything else after.
 *
 * A save from a *newer* build must be refused politely rather than parsed
 * against today's schema — the player has simply opened an older tab, and
 * silently downgrading their progress would be data loss.
 */
export const saveHeaderSchema = z.object({ schemaVersion: z.number().int().positive() });
