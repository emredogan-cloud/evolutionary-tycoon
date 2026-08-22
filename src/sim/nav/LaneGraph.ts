import type { StageLayout } from '@config/layouts/stage1';
import { Polyline } from './spline';
import type { LaneSample } from './spline';

/**
 * The lanes a vehicle can be on, built from the authored stage layout.
 *
 * The layout is the single source of truth for road geometry — gameplay code
 * never invents lane coordinates. That matters because the decision point, the
 * pull-in and the counter are all positioned relative to these same polylines,
 * and a second copy of the geometry would drift from the first exactly once and
 * then be very hard to find.
 *
 * Stage 1 has two straight lanes. Nothing here assumes that: `Polyline` handles
 * any number of points, so the Stage 4 curved road and its left turn need new
 * data rather than new code.
 */

export interface Lane {
  readonly index: number;
  readonly id: string;
  readonly heading: string;
  readonly path: Polyline;
  /** Total drivable length in metres. */
  readonly length: number;
  /**
   * Distance along this lane at which a driver decides whether to convert.
   *
   * Phase 6 reads it; Phase 5 only records where it is so the dev overlay can
   * draw it and the geometry can be tested before anything depends on it.
   */
  readonly decisionS: number;
  /**
   * Distance at which a committed vehicle leaves the lane for the car park.
   *
   * Always after `decisionS` — a driver decides, then turns — and the gap
   * between them is the braking distance the moment is built on.
   */
  readonly entryS: number;
  /** Distance at which a departing vehicle rejoins this lane. */
  readonly rejoinS: number;
  /**
   * True when this lane's pull-in crosses another lane — the far side of the
   * road, Phase 15. GDD §9.1 names the left turn as a genuine congestion
   * source; whether a lane *is* the far side is geometry, so it is computed
   * here once rather than guessed by a system.
   */
  readonly crossesOnEntry: boolean;
}

export class LaneGraph {
  readonly lanes: readonly Lane[];

  constructor(layout: StageLayout) {
    /*
     * An authoring error, checked once against the authored metres rather than
     * per lane against the resolved distances. A lane whose closest approach to
     * the counter is nearer than either figure clamps both to zero, and that is
     * a legitimate short lane — not a reason to refuse the layout.
     */
    if (layout.entryPointMetres >= layout.road.decisionPointMetres) {
      throw new RangeError(
        `entryPointMetres (${layout.entryPointMetres}) must be smaller than ` +
          `decisionPointMetres (${layout.road.decisionPointMetres}): a driver decides, then turns`,
      );
    }

    this.lanes = layout.road.lanes.map((lane, index) => {
      const path = new Polyline(lane.points);
      /*
       * The decision point is authored as "metres before the counter", so it is
       * resolved against the lane's own arc length rather than stored as a
       * coordinate. Measuring back from the closest approach keeps it correct
       * for both directions of travel without a second authored value.
       */
      const nearest = closestS(path, layout.counter.x, layout.counter.y);
      const decisionS = Math.max(0, nearest - layout.road.decisionPointMetres);
      /*
       * Never before the decision point. The authored metres already guarantee
       * it, and `Math.max` preserves it through the clamp at zero — a lane that
       * starts level with the restaurant has a driver deciding and turning on
       * the same tick, which is geometrically honest rather than an error.
       */
      const entryS = Math.max(decisionS, Math.max(0, nearest - layout.entryPointMetres));
      const rejoinS = Math.min(path.length, nearest + layout.rejoinPointMetres);

      return {
        index,
        id: lane.id,
        heading: lane.heading,
        path,
        length: path.length,
        decisionS,
        entryS,
        rejoinS,
        crossesOnEntry: false,
      };
    });

    if (this.lanes.length === 0) {
      throw new RangeError('LaneGraph requires at least one lane');
    }

    /*
     * The near lane is the one whose entry point sits closest to the pull-in;
     * every other lane's turn passes through road it does not own. With the
     * authored two-lane road that is exactly one crossing lane, but nothing
     * here assumes two.
     */
    const sample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const lane of this.lanes) {
      lane.path.sample(lane.entryS, sample);
      const distance = (sample.x - layout.pullIn.x) ** 2 + (sample.y - layout.pullIn.y) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = lane.index;
      }
    }
    for (const lane of this.lanes) {
      // The array was built just above from plain literals; the readonly view
      // is for everyone after construction.
      (lane as { crossesOnEntry: boolean }).crossesOnEntry = lane.index !== nearest;
    }
    this.nearEntryLane = nearest;

    const frames: LaneFrame[] = [];
    for (const lane of this.lanes) {
      lane.path.sample(0, sample);
      frames.push({ ox: sample.x, oy: sample.y, dx: sample.tangentX, dy: sample.tangentY });
    }
    this.frames = frames;
  }

  /** Index of the lane whose entry does not cross traffic. */
  readonly nearEntryLane: number = 0;

  get laneCount(): number {
    return this.lanes.length;
  }

  lane(index: number): Lane {
    const lane = this.lanes[index];
    if (lane === undefined) throw new RangeError(`Unknown lane ${index}`);
    return lane;
  }

  /** Position and heading of a vehicle at `s` metres along `laneIndex`. */
  sample(laneIndex: number, s: number, out: LaneSample): LaneSample {
    return this.lane(laneIndex).path.sample(s, out);
  }

  /**
   * A world point in a lane's own frame: how far along it lies, and how far
   * off to the side.
   *
   * The straight-line frame, taken once at construction — every lane in the
   * game is a straight run, and a manoeuvring body's relationship to the lane
   * it is leaving or joining is exactly this pair of numbers. Two callers
   * need it and must agree: the motion system decides from `lateral` whether
   * a turning body still stands in the lane, and the manoeuvre system decides
   * from `along` which stretch of road a departing car is about to claim.
   * Two copies of this projection would be two chances to disagree about
   * where a car is.
   */
  project(laneIndex: number, x: number, y: number, out: LaneProjection): LaneProjection {
    const frame = this.frames[laneIndex];
    if (frame === undefined) throw new RangeError(`Unknown lane ${laneIndex}`);
    const relX = x - frame.ox;
    const relY = y - frame.oy;
    out.along = relX * frame.dx + relY * frame.dy;
    out.lateral = Math.abs(relX * -frame.dy + relY * frame.dx);
    return out;
  }

  /**
   * How much of a unit direction points along a lane, signed.
   *
   * The companion to `project`: that answers where a body is, this answers
   * how squarely it is facing. A body crossing the lane broadside projects
   * almost none of its length onto it, and the difference decides how much
   * road it actually takes up.
   */
  projectDirection(laneIndex: number, dx: number, dy: number): number {
    const frame = this.frames[laneIndex];
    if (frame === undefined) throw new RangeError(`Unknown lane ${laneIndex}`);
    return dx * frame.dx + dy * frame.dy;
  }

  /** Straight-line origin and direction per lane — see `project`. */
  private readonly frames: readonly LaneFrame[];
}

/** A point expressed in a lane's frame — see `LaneGraph.project`. */
export interface LaneProjection {
  /** Metres along the lane from its start. */
  along: number;
  /** Metres off the lane's centre line, unsigned. */
  lateral: number;
}

interface LaneFrame {
  readonly ox: number;
  readonly oy: number;
  readonly dx: number;
  readonly dy: number;
}

/**
 * Arc-length position on `path` closest to a world point.
 *
 * Coarse scan then a local refinement — exactness is not needed and would cost
 * more than it is worth. This runs once per lane at construction, never per
 * tick.
 */
function closestS(path: Polyline, x: number, y: number): number {
  const sample: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };
  const coarseSteps = 128;
  let bestS = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i <= coarseSteps; i++) {
    const s = (path.length * i) / coarseSteps;
    path.sample(s, sample);
    const distance = (sample.x - x) ** 2 + (sample.y - y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestS = s;
    }
  }

  let step = path.length / coarseSteps;
  for (let refinement = 0; refinement < 12; refinement++) {
    step /= 2;
    for (const candidate of [bestS - step, bestS + step]) {
      if (candidate < 0 || candidate > path.length) continue;
      path.sample(candidate, sample);
      const distance = (sample.x - x) ** 2 + (sample.y - y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestS = candidate;
      }
    }
  }
  return bestS;
}
