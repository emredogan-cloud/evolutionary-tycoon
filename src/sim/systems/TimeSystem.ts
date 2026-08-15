import { DAY_CURVE, HOURS_IN_CURVE } from '@config/traffic';
import { atIn } from '../math/typedArray';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';

/**
 * The gameplay consequences of the hour changing.
 *
 * Not clock advancement — `Sim.tick()` owns that, because advancing time is what
 * a tick *is* rather than something one system does. This slot turns "it is
 * 18:20" into "traffic is at 1.42x its daily average", which is the only thing
 * Phase 5 needs from the hour. Opening times, night tint and events attach here
 * later.
 *
 * The system writes nothing to the world: the curve is a pure function of the
 * clock, and recomputing it costs two array reads. Storing it would add a field
 * that has to be hashed, saved and migrated for no benefit.
 */

/**
 * Mean of the raw curve, computed once.
 *
 * The curve is normalised by this so its average is exactly 1, which is what
 * lets `BASE_SPAWN_PER_REAL_MINUTE` be the honest daily average rather than a
 * number back-solved from the shape of the curve. Change the curve's shape and
 * the average traffic stays put — only its distribution across the day moves.
 */
const CURVE_MEAN = DAY_CURVE.reduce((sum, value) => sum + value, 0) / DAY_CURVE.length;

/**
 * Traffic density multiplier at a given hour, linearly interpolated.
 *
 * Wraps at midnight so 23:30 blends into 00:00 rather than stepping. The
 * continuity is tested explicitly at every hour boundary — a discontinuity there
 * would show up as traffic visibly popping once a game day, which is the kind of
 * thing that gets misdiagnosed as a spawn bug for a week.
 */
export function dayCurveAt(hour: number): number {
  const wrapped = ((hour % HOURS_IN_CURVE) + HOURS_IN_CURVE) % HOURS_IN_CURVE;
  const lowIndex = Math.floor(wrapped);
  const highIndex = (lowIndex + 1) % HOURS_IN_CURVE;
  const t = wrapped - lowIndex;

  const low = atIn(DAY_CURVE, lowIndex);
  const high = atIn(DAY_CURVE, highIndex);
  return (low + (high - low) * t) / CURVE_MEAN;
}

/** The normalised curve's peak — used by the spawn process for thinning. */
export const DAY_CURVE_PEAK = Math.max(...DAY_CURVE) / CURVE_MEAN;

export class TimeSystem implements SimSystem {
  readonly name = 'TimeSystem' as const;

  run(_world: World, _deltaMs: number): void {
    // Phase 5 reads the curve directly through `dayCurveAt`; there is no state
    // to advance here yet. The slot exists so the order in SYSTEM_ORDER is real
    // and so opening hours and night effects have somewhere to land.
  }
}
