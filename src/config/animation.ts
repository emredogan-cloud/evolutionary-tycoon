/**
 * The animation activity vocabulary — Phase 17.
 *
 * What a character is *doing*, as the renderer needs to know it. Derived by
 * `readView` from the state machines and never stored: an activity is a fact
 * about this instant, and storing it would be one more thing to hash, save and
 * migrate for no outcome the simulation cares about. Indices are stable —
 * they ride on `ActorSnapshot.activity` — but they are presentation data, so
 * renumbering costs a clip mapping, not a save format.
 */
export const ACTIVITIES = [
  'idle',
  'walk',
  'walk_carry',
  'take_order',
  'cook',
  'serve',
  'clean',
  'eat',
  'pay',
  'wait_impatient',
  'happy',
  'angry',
] as const;

export type ActivityName = (typeof ACTIVITIES)[number];

export const ACTIVITY_IDLE = 0;
export const ACTIVITY_WALK = 1;
export const ACTIVITY_WALK_CARRY = 2;
export const ACTIVITY_TAKE_ORDER = 3;
export const ACTIVITY_COOK = 4;
export const ACTIVITY_SERVE = 5;
export const ACTIVITY_CLEAN = 6;
export const ACTIVITY_EAT = 7;
export const ACTIVITY_PAY = 8;
export const ACTIVITY_WAIT_IMPATIENT = 9;
export const ACTIVITY_HAPPY = 10;
export const ACTIVITY_ANGRY = 11;

/**
 * Below this patience fraction, waiting reads as impatience.
 *
 * Matches the patience ring's own last band, so the body language and the ring
 * change together rather than at two different moments.
 */
export const IMPATIENT_PATIENCE_FRACTION = 0.35;
