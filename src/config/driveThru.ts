/**
 * The drive-thru channel — GAME_EXECUTION_ROADMAP Phase 11, Stage 4.
 *
 * ## The asymmetry is the mechanic
 *
 * The roadmap: _"Patience here is far lower than seated: the customer is in a
 * car with an engine running. This asymmetry is the source of the game's central
 * strategic tension, so tune it to actually bite."_
 *
 * So these numbers are not a difficulty setting. A drive-thru customer converts
 * more readily — they never have to park, never have to walk — and gives up far
 * sooner. Build the lane and you capture traffic that would never have stopped;
 * under-staff the window and you lose them faster than you ever lost anyone at a
 * counter, *and* the queue backs onto the road where the next drivers can see it.
 */

/**
 * How much of a drive-thru customer's patience survives, against a seated one.
 *
 * 0.4 — a car that would have waited two minutes inside waits under fifty
 * seconds with the engine running. Tuned in Phase 12 against the balance
 * simulator; the starting value comes from the design intent that the drive-thru
 * should be *lossy at scale*, which is what stops it being a strict upgrade over
 * the counter.
 */
export const DRIVE_THRU_PATIENCE_SCALE = 0.4;

/**
 * How much of the converted traffic prefers the drive-thru when one exists.
 *
 * Not a coin flip: the whole point of building it is that it captures people who
 * would otherwise have driven past, so more than half of the converted flow
 * takes it. The counter keeps the rest — and keeps mattering, because a stand
 * with only a drive-thru has no use for tables.
 */
export const DRIVE_THRU_SHARE = 0.6;

/**
 * Seconds a car spends at the window collecting and paying.
 *
 * Separate from the counter's `ORDERING_MS` because it is a different action:
 * ordering happens at the post on arrival, and this is the handover. It is the
 * number the "window service speed" upgrade moves in Phase 13.
 */
export const DRIVE_THRU_WINDOW_MS = 2200;

/** Seconds a car spends at the post, placing its order. */
export const DRIVE_THRU_ORDER_MS = 1800;

/** How fast a car creeps forward as the lane compacts, in metres per second. */
export const DRIVE_THRU_ADVANCE_MPS = 2.2;
