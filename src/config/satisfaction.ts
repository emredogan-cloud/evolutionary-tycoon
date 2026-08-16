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
 * ## What a dormant input scores, and why it is 1.0
 *
 * A dormant input scores 1.0 and its weight still counts, so a perfect wait and
 * perfect food at a fair price does reach 1.0 today. That is not an oversight
 * and it is not neutral in the arithmetic sense — it is the claim that **there
 * is nothing yet to be dissatisfied about**. A Stage 1 roadside stand has no
 * tables to be dirty, no decor to be drab and no waiter to be slow, so scoring
 * those as anything less than perfect would be inventing a complaint the player
 * cannot act on and cannot see.
 *
 * The consequence, stated plainly: satisfaction will *fall* when Phase 11 makes
 * cleanliness and atmosphere real, because a stand that has floors to mop can
 * fail to mop them. Scoring them 0.0 instead would make it rise, which is the
 * same shift wearing a different sign. Either way the number moves when the
 * world gains a way to be worse — and 1.0 is the one that describes the world
 * as it actually is right now.
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
export const REPUTATION = { neutral: 0.9, sensitivity: 0.004, min: 0, max: 100 } as const;

/**
 * What a brand-new stand's reputation is — **Phase 12, and it was zero**.
 *
 * ## Why this was the single biggest thing wrong with the economy
 *
 * `reputationFactor` maps reputation 0..100 onto a **0.60..1.40** multiplier on
 * conversion (ECONOMY_DESIGN §9). A band written that way has a neutral point,
 * and the neutral point is the middle: reputation 50 gives a factor of exactly
 * 1.0, meaning "your reputation is neither helping nor hurting you".
 *
 * Starting at **zero** therefore did not mean "unknown", it meant **the worst
 * reputation in the game**. Every new stand converted at 60% of what its own
 * factors said, and climbed out of it at 0.13 reputation points per customer
 * served — so it took roughly **390 customers** to reach neutral, which the
 * balance simulator measured as never happening inside Stage 1 at all.
 *
 * The knock-on was worse than the conversion loss. Stage 3 requires reputation
 * 40; a fully-upgraded Stage 1 stand measured **38.7 after a hundred simulated
 * minutes**. Stage 3 was not slow to reach, it was unreachable.
 *
 * Fifty is not a buff. It is where the published band says a stand with no
 * history stands, and the 0.60 floor is now what it was written to be: where you
 * end up after disappointing people, rather than where you begin.
 */
export const STARTING_REPUTATION = 50;

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
export const EATING_MS = 5_000;
