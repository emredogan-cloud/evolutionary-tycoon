import { menuItem } from '@config/economy/menu';
import type { World } from '../core/World';
import { effectValue } from './UpgradeSystem';
import {
  EXPECTATION_PENALTY_SLOPE,
  EXPECTED_WAIT_MS,
  MAX_WAIT_MS,
  NEUTRAL_SCORE,
  REPUTATION,
  TIP_CURVE,
  WEIGHTS,
} from '@config/satisfaction';
import type { SimSystem } from '../core/SystemPipeline';
import type { OrderRecord } from '../stores/OrderStore';

/**
 * Satisfaction — GAME_DESIGN_DOCUMENT §12, ECONOMY_DESIGN §9.
 *
 * Seven weighted inputs; three of them are live in Phase 8 and the rest read a
 * neutral constant with the phase that fills them in. The same discipline as the
 * conversion model, and for the same reason: the formula in code matches the
 * formula in the design document term for term, so implementing one later is a
 * one-line diff rather than an argument about what the model was meant to be.
 *
 * ## This system computes; it does not tick
 *
 * `run` does nothing. Satisfaction is evaluated once per order, at payment, by
 * `ServiceSystem` calling `evaluate` — a per-tick sweep would recompute a number
 * nothing reads yet and would make the world hash depend on it. The slot in
 * `SYSTEM_ORDER` is kept because the *order* of the eighteen slots is
 * architecture (WORKING_DISCIPLINE §6) and because Phase 11's cleanliness and
 * atmosphere inputs are continuous and will need it.
 */
export class SatisfactionSystem implements SimSystem {
  readonly name = 'SatisfactionSystem' as const;

  run(): void {
    // Deliberately empty — see the class comment. Satisfaction is computed at
    // payment, not accumulated per tick.
  }
}

/**
 * How the wait felt, 0..1.
 *
 * From joining the queue to food in hand, against what a customer expects.
 * Waiting exactly the expected time still scores 1.0: the expectation is what
 * they came for, not a target to beat. It decays linearly to zero at
 * `MAX_WAIT_MS` rather than continuing negative, because one slow order should
 * not be able to drag the whole sum below anything the other inputs could
 * recover.
 */
export function waitScore(waitedMs: number): number {
  if (waitedMs <= EXPECTED_WAIT_MS) return 1;
  const over = waitedMs - EXPECTED_WAIT_MS;
  const span = MAX_WAIT_MS - EXPECTED_WAIT_MS;
  return Math.max(0, 1 - over / span);
}

/**
 * How the price felt, 0..1.
 *
 * `expectationPenalty = 1 + 0.35 × (price / basePrice − 1)` from
 * ECONOMY_DESIGN §4, inverted into a score. Charging the base price scores 1.0;
 * charging the +50% cap scores about 0.85.
 *
 * This is one half of the two-sided penalty that stops "raise every price" being
 * the answer. The other half is `priceFit` in the conversion model: one costs
 * you customers before they arrive, this one costs you the satisfaction of the
 * ones who came anyway.
 */
export function priceScore(price: number, basePrice: number): number {
  if (basePrice <= 0) return NEUTRAL_SCORE;
  const penalty = 1 + EXPECTATION_PENALTY_SLOPE * (price / basePrice - 1);
  return Math.min(1, Math.max(0, 1 / Math.max(1e-6, penalty)));
}

/**
 * The whole model, for one completed order.
 *
 * `quality` arrives already decayed by hold temperature — `KitchenSystem`
 * computes that, because it is the kitchen's business how long a plate sat.
 */
export function evaluateSatisfaction(
  order: OrderRecord,
  quality: number,
  nowMs: number,
  world?: World,
): number {
  const item = menuItem(order.item);
  const waited = Math.max(0, (order.deliveredAtMs > 0 ? order.deliveredAtMs : nowMs) - order.orderedAtMs);

  const score =
    WEIGHTS.wait * waitScore(waited) +
    /*
     * Quality, plus whatever the kitchen upgrades add — Phase 13's
     * `foodQuality`. Clamped after the addition rather than before, so an
     * upgrade lifts a mediocre plate and cannot push a perfect one past 1.
     */
    WEIGHTS.quality *
      Math.min(1, Math.max(0, quality + (world === undefined ? 0 : effectValue(world, 'foodQuality')))) +
    WEIGHTS.price * priceScore(order.price, item.basePrice) +
    // Dormant inputs, each named with the phase that makes it live. They score
    // 1.0 because there is nothing yet to be dissatisfied about — no tables to
    // be dirty, no decor to be drab, no waiter to be slow. See the note in
    // `@config/satisfaction` for what that costs later.
    WEIGHTS.service * NEUTRAL_SCORE +
    WEIGHTS.cleanliness * NEUTRAL_SCORE +
    /*
     * Atmosphere is **live** since Phase 13: the planters, the neon and the
     * covered terrace all push on it. It is the first of the four dormant
     * inputs to be fed by anything, and it is fed by upgrades rather than by a
     * system — which is exactly what GAME_DESIGN_DOCUMENT §13.2 describes
     * ("peyzaj / cephe → atmosphere ↑").
     */
    WEIGHTS.atmosphere *
      Math.min(1, NEUTRAL_SCORE + (world === undefined ? 0 : effectValue(world, 'atmosphere'))) +
    WEIGHTS.accessibility * NEUTRAL_SCORE;

  return Math.min(1, Math.max(0, score));
}

/**
 * Tip as a fraction of the price — ECONOMY_DESIGN §9, reproduced exactly.
 *
 * Nothing below 0.6, a gentle slope to 0.85, then a steep one. The shape is the
 * design statement: being adequate earns nothing, and the reward for being
 * excellent is visible rather than marginal.
 */
export function tipFraction(satisfaction: number): number {
  if (satisfaction < TIP_CURVE.floor) return 0;
  if (satisfaction < TIP_CURVE.knee) return (satisfaction - TIP_CURVE.floor) * TIP_CURVE.kneeSlope;
  return TIP_CURVE.upperBase + (satisfaction - TIP_CURVE.knee) * TIP_CURVE.upperSlope;
}

/**
 * How much this customer moved the stand's reputation.
 *
 * ±0.004 around a 0.6 baseline. Deliberately tiny: ECONOMY_DESIGN §9 wants
 * reputation to be a long-term asset that cannot be manipulated quickly, and at
 * this rate moving it from 50 to 80 takes about 7 500 satisfied customers.
 */
export function reputationDelta(satisfaction: number): number {
  return (satisfaction - REPUTATION.neutral) * REPUTATION.sensitivity;
}
