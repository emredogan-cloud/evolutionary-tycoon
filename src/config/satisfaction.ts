import { z } from 'zod';

/**
 * Customer satisfaction — GAME_DESIGN_DOCUMENT §12, ECONOMY_DESIGN §9.
 *
 *   satisfaction = clamp01(Σ wᵢ · scoreᵢ) × archetypeWeighting
 *
 * Seven weighted inputs. **Three are live in Phase 8** — wait, quality and price
 * — and the rest are neutral constants with the phase that fills them in. Same
 * discipline as the conversion model: the formula in code matches the formula in
 * the design document term for term, so implementing one later is a one-line
 * diff rather than an argument about what the model was supposed to be.
 *
 * A neutral input is 1.0 and its weight still counts. That matters: it means the
 * live inputs cannot reach 1.0 on their own, so a perfect wait and perfect food
 * at a fair price scores about 0.72 today and the remaining 0.28 arrives with
 * cleanliness, atmosphere and service. Zeroing the dormant weights instead would
 * have satisfaction quietly re-scale under everyone's feet in Phase 11.
 */

const weightsSchema = z
  .object({
    wait: z.number().min(0),
    quality: z.number().min(0),
    price: z.number().min(0),
    service: z.number().min(0),
    cleanliness: z.number().min(0),
    atmosphere: z.number().min(0),
    accessibility: z.number().min(0),
  })
  .refine((weights) => Math.abs(Object.values(weights).reduce((sum, w) => sum + w, 0) - 1) < 1e-9, {
    message: 'satisfaction weights must sum to exactly 1',
  });

export type SatisfactionWeights = z.infer<typeof weightsSchema>;

/**
 * Default weights, summing to 1.
 *
 * The sum is enforced rather than assumed, because a set that sums to 1.05 makes
 * satisfaction reachable only by clamping and every downstream curve — tips,
 * reputation, repeat probability — silently compresses.
 *
 * Wait carries the most weight in Stage 1 and that is a design statement: a
 * roadside stand is judged on speed before anything else.
 */
export const WEIGHTS: SatisfactionWeights = weightsSchema.parse({
  wait: 0.3,
  quality: 0.28,
  price: 0.14,
  // Dormant. Each is named with the phase that makes it live.
  service: 0.12, // Phase 10 — waiters
  cleanliness: 0.08, // Phase 11 — cleaners
  atmosphere: 0.05, // Phase 11 — decor
  accessibility: 0.03, // Phase 11 — parking and entrance quality
});

/** Neutral value for an input no system feeds yet. */
export const NEUTRAL_SCORE = 1;

/**
 * How long a customer expects to wait, in milliseconds.
 *
 * From joining the queue to food in hand. Waiting exactly this long scores 1.0
 * and it degrades from there, so it is the number that decides whether the
 * kitchen is fast enough — and in Phase 9 it is what a second prep station is
 * bought against.
 */
export const EXPECTED_WAIT_MS = 25_000;

/**
 * Wait beyond which the score is zero.
 *
 * Not infinite: a linear decay with no floor would make a two-minute wait score
 * negative and drag the sum below anything the other inputs could recover, which
 * turns one slow order into a permanently unhappy customer.
 */
export const MAX_WAIT_MS = 120_000;

/** ECONOMY_DESIGN §9 — tips, reproduced exactly. */
export const TIP_CURVE = {
  /** Below this, nothing. */
  floor: 0.6,
  /** Between floor and knee, a gentle slope. */
  knee: 0.85,
  kneeSlope: 0.4,
  /** Above the knee it climbs fast — the reward for excellence being visible. */
  upperSlope: 1.2,
  upperBase: 0.1,
} as const;

/** ECONOMY_DESIGN §9: reputation moves ±0.004 per customer around a 0.6 baseline. */
export const REPUTATION = { neutral: 0.6, sensitivity: 0.004, min: 0, max: 100 } as const;

/**
 * Expectation penalty — ECONOMY_DESIGN §4.
 *
 *   expectationPenalty = 1 + 0.35 × (price / basePrice − 1)
 *
 * Charging more makes people harder to please. Combined with the conversion
 * model's `priceFit`, that is the two-sided penalty which stops "raise every
 * price to the cap" being the answer: one costs you customers, the other costs
 * you the satisfaction of the ones who still come.
 */
export const EXPECTATION_PENALTY_SLOPE = 0.35;

/**
 * How long it takes to say what you want, in milliseconds.
 *
 * A beat, not a wait — there is no patience timer on `ORDERING` and nothing can
 * go wrong during it. It exists because without it the transaction takes zero
 * ticks: a customer reaches the counter and is already standing in the waiting
 * area, and the player never sees the moment they came for. It is also what
 * makes `ORDERING` observable at a tick boundary at all, which is the difference
 * between a state and a label.
 */
export const ORDERING_MS = 1200;

/**
 * How long a customer takes to eat, in milliseconds.
 *
 * They occupy nothing in Stage 1 — there are no tables — so this is a beat
 * rather than a constraint. It exists because payment on the tick food is handed
 * over reads as a vending machine, and because Phase 11's tables need somewhere
 * for the duration to already live.
 */
export const EATING_MS = 12_000;
