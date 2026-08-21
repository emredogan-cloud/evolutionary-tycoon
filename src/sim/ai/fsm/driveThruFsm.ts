/**
 * The drive-thru branch of the customer state machine — Phase 11.
 *
 * A separate file, and **not** a separate state machine. These are additional
 * states in the same `customerFsm` numbering, appended in the same append-only
 * way every other state was, because a drive-thru customer is a customer: they
 * convert with the same roll, burn the same patience clock, place an order into
 * the same pool, and pay through the same `ServiceSystem`. What differs is the
 * route and how quickly they give up.
 *
 * ```
 *   ENTERING ──► DT_APPROACHING ──► DT_ORDERING ──► DT_QUEUEING ──► DT_COLLECTING
 *                     │                                                  │
 *                     └──────────────── gave up ─────────────────────────┴──► LEAVING_ANGRY
 * ```
 *
 * `DT_QUEUEING` is where the lane compacts: a car creeps forward one slot at a
 * time as the car ahead leaves. It is the only state in the game where a
 * *vehicle* moves without being on a lane or a manoeuvre curve, and it is why
 * `VEHICLE_DT_ADVANCING` exists.
 */

/** Driving from the road to the back of the lane. */
export const STATE_DT_APPROACHING = 17;
/** Stopped at the post, placing an order. */
export const STATE_DT_ORDERING = 18;
/** In the lane, creeping toward the window, waiting for food. */
export const STATE_DT_QUEUEING = 19;
/** At the window, collecting and paying. */
export const STATE_DT_COLLECTING = 20;

/*
 * The four are contiguous on purpose: "is this customer in the lane" is then a
 * range test rather than a membership list, and there is no second place the
 * set of drive-thru states is written down waiting to drift from this one.
 */

/** Which channel a customer chose. Stored on the record and hashed. */
export const CHANNEL_COUNTER = 0;
export const CHANNEL_DRIVE_THRU = 1;
