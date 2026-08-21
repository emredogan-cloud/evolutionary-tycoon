/**
 * Polyline geometry, parameterised by distance rather than by segment index.
 *
 * "Advance the car by `v * dt` metres" has to mean the same thing everywhere on
 * the lane, including across a corner. Parameterising by segment index does not
 * give that: a short segment and a long one both span t in [0,1], so a vehicle
 * would visibly speed up and slow down as it crossed joints. Arc length is what
 * makes constant speed look constant.
 *
 * Pure and allocation-free by construction — this runs inside `src/sim`, once
 * per vehicle per tick.
 */

import { euclidean } from '../math/length';
import { at } from '../math/typedArray';

export interface Point2 {
  x: number;
  y: number;
}

export interface LaneSample {
  x: number;
  y: number;
  /** Unit tangent — the direction of travel at this point. */
  tangentX: number;
  tangentY: number;
}

/**
 * A polyline with a cumulative-length table.
 *
 * The table is built once at construction. Integrating length per frame instead
 * would be both slower and drift-prone, since floating-point error accumulates
 * differently depending on how many times a vehicle has been sampled.
 */
export class Polyline {
  readonly pointCount: number;
  /** Flattened xy pairs. */
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  /** `cumulative[i]` is the distance from the start to point i. */
  private readonly cumulative: Float64Array;
  /** Unit tangent of the segment starting at point i. */
  private readonly tangentXs: Float64Array;
  private readonly tangentYs: Float64Array;

  readonly length: number;

  constructor(points: readonly Point2[]) {
    if (points.length < 2) {
      throw new RangeError(`A lane polyline needs at least two points, received ${points.length}`);
    }
    this.pointCount = points.length;
    this.xs = new Float64Array(points.length);
    this.ys = new Float64Array(points.length);
    this.cumulative = new Float64Array(points.length);
    this.tangentXs = new Float64Array(points.length - 1);
    this.tangentYs = new Float64Array(points.length - 1);

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (point === undefined) throw new RangeError(`missing point ${i}`);
      this.xs[i] = point.x;
      this.ys[i] = point.y;
    }

    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = at(this.xs, i + 1) - at(this.xs, i);
      const dy = at(this.ys, i + 1) - at(this.ys, i);
      const segment = euclidean(dx, dy);
      if (segment === 0) {
        throw new RangeError(`lane polyline has a zero-length segment at index ${i}`);
      }
      this.tangentXs[i] = dx / segment;
      this.tangentYs[i] = dy / segment;
      total += segment;
      this.cumulative[i + 1] = total;
    }
    this.length = total;
  }

  /**
   * Position and heading at distance `s` along the lane.
   *
   * Writes into `out` rather than returning an object: this is called once per
   * vehicle per frame by the renderer and once per vehicle per tick by the
   * simulation, and an allocation there is a GC pause during traffic.
   *
   * `s` outside the lane clamps to the ends. A vehicle past the end is despawned
   * by the motion system on the same tick, so clamping is a formality — but an
   * unclamped read would return NaN, and NaN in a position propagates silently
   * into the render bridge and the world hash.
   */
  sample(s: number, out: LaneSample): LaneSample {
    const clamped = s <= 0 ? 0 : s >= this.length ? this.length : s;
    const segment = this.segmentAt(clamped);

    const start = at(this.cumulative, segment);
    const tx = at(this.tangentXs, segment);
    const ty = at(this.tangentYs, segment);
    const along = clamped - start;

    out.x = at(this.xs, segment) + tx * along;
    out.y = at(this.ys, segment) + ty * along;
    out.tangentX = tx;
    out.tangentY = ty;
    return out;
  }

  /**
   * Index of the segment containing distance `s`, by binary search.
   *
   * Linear scan would be fine at two points per lane today, and would quietly
   * become the hot loop when Stage 4 adds a curved road with dozens.
   */
  private segmentAt(s: number): number {
    const last = this.pointCount - 2;
    let low = 0;
    let high = last;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (at(this.cumulative, mid) <= s) low = mid;
      else high = mid - 1;
    }
    return low > last ? last : low;
  }
}
