/**
 * Simulation timing, capacity and identity constants.
 *
 * Data only — this module imports nothing and is imported by `src/sim`.
 * WORKING_DISCIPLINE §2.4 forbids timing and balancing literals inside gameplay
 * code, so every number the simulation kernel needs lives here.
 */

/** 20 Hz. Fixed forever: changing it changes every command log and every save. */
export const TICK_MS = 50;

/**
 * Spiral-of-death guard. If a frame is late, the loop catches up by running
 * extra ticks — but never more than this, or a slow frame causes a slower frame.
 */
export const MAX_CATCHUP_TICKS = 8;

/** A frame delta larger than this (tab was backgrounded) is clamped, not replayed. */
export const MAX_FRAME_DELTA_MS = 250;

export const SPEED_MULTIPLIERS = [1, 2, 4] as const;
export type SpeedMultiplier = (typeof SPEED_MULTIPLIERS)[number];

export const DEFAULT_SPEED_MULTIPLIER: SpeedMultiplier = 1;

/**
 * Length of one in-game day in simulation milliseconds.
 *
 * PROVISIONAL. `docs/PROJECT_MEMORY.md` §10 open decision S1 ("1 game day = how
 * many real minutes?") is scheduled for Phase 5, where it can be answered by
 * playing. 12 real minutes is the candidate recorded there; the Clock needs a
 * concrete value to compute gameDay/gameHour at all, so the candidate is used
 * and flagged rather than invented silently.
 */
export const MS_PER_GAME_DAY = 720_000;

export const HOURS_PER_GAME_DAY = 24;

/**
 * Entity store capacities.
 *
 * Preallocated at construction and never grown: growth in a hot loop is an
 * allocation, and TECHNICAL_ARCHITECTURE §11.2 caps concurrent entities at
 * 120 vehicles / 60 pedestrians on desktop. These sit above that ceiling so the
 * store never becomes the binding constraint before the budget does.
 */
export const ENTITY_CAPACITY = {
  vehicles: 160,
  customers: 96,
  employees: 24,
  orders: 128,
} as const;

/** Ring buffer size. Older commands are dropped; the full log is a dev-only export. */
export const COMMAND_LOG_CAPACITY = 5000;

/**
 * Per-tick event queue capacity. Events are pooled and reused, so this is a
 * ceiling on events emitted within a single tick, not a total.
 */
export const EVENT_QUEUE_CAPACITY = 512;

/** Save schema version this build writes. Bumped alongside a migration. */
export const SAVE_SCHEMA_VERSION = 1;
