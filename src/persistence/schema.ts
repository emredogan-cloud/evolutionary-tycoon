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
 * The save file — schema version 3.
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

const saveFileV3Schema = z.object({
  schemaVersion: z.literal(3),
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
  }),
  economy: z.object({
    cash: z.number(),
    reputation: z.number(),
    lifetimeRevenue: z.number(),
    prices: stringNumberEntries,
  }),
  layout: z.object({
    placed: z.array(z.object({ objectId: z.string(), x: z.number(), y: z.number(), z: z.number() })),
    upgrades: stringNumberEntries,
  }),
  staff: z.object({
    hired: z.array(z.object({ entityId: z.number().int(), roleId: z.string() })),
  }),
  stats: z.object({
    customersServed: z.number().int().nonnegative(),
    vehiclesSpawned: z.number().int().nonnegative(),
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

  checksum: z.string(),
});

/**
 * The version this build reads and writes.
 *
 * Call sites use the version-neutral names, so bumping the schema is an edit
 * here rather than a sweep across the codebase. The versioned schema stays
 * private: nothing outside this module should be able to pin itself to v3.
 */
export const currentSaveSchema = saveFileV3Schema;
export type CurrentSaveFile = z.infer<typeof saveFileV3Schema>;

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
