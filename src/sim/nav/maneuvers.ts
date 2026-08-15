import type { StageLayout } from '@config/layouts/stage1';
import type { LaneGraph } from './LaneGraph';
import { Polyline } from './spline';
import type { LaneSample } from './spline';

/**
 * Parking manoeuvres — GAME_DESIGN_DOCUMENT §10, layer 2.
 *
 * **Parking is an animation problem, not a search problem.** A car leaving a
 * lane for a bay has exactly one sensible path, and it is a path a person can
 * author. Running a planner over it would produce a worse-looking result, cost
 * far more, and — the part that matters here — make the outcome depend on a
 * search whose tie-breaks would have to be pinned down for determinism.
 *
 * So each manoeuvre is a cubic Bézier, and the control points come from
 * geometry that is already authored: where the lane is, which way it runs, where
 * the bay is, which way the bay faces. The only free number is how far the
 * handles extend, and that is one authored constant.
 *
 * ## Why they are flattened into polylines
 *
 * A Bézier's parameter `t` is not arc length. Advancing `t` at a constant rate
 * moves a car quickly through the straight part of a turn and slowly through
 * the tight part — the opposite of how anyone drives, and obvious on screen.
 * Rather than solve for arc length analytically, each curve is flattened into a
 * `Polyline` at construction, which already carries the cumulative-length table,
 * the binary search and the allocation-free `sample`. One mechanism, one set of
 * tests, and constant speed comes out for free.
 */

/** Flattening resolution. 24 segments over a ~10 m curve is ~0.4 m per chord. */
const FLATTEN_SEGMENTS = 24;

/**
 * How far the Bézier handles reach, as a fraction of the straight-line distance
 * between the endpoints.
 *
 * 0.55 is the value that makes the turn read as a car turning rather than as a
 * car sliding sideways: shorter and the path kinks at both ends, longer and it
 * bulges past the bay before coming back. Tuned by looking at it.
 */
const HANDLE_FRACTION = 0.55;

export interface Maneuver {
  readonly path: Polyline;
  readonly length: number;
}

/**
 * Both manoeuvres for one (lane, bay) pair.
 *
 * Precomputed for every pair at construction — Stage 1 has 2 lanes and 4 bays,
 * so 16 curves in total, built once and shared by every simulation. A car
 * chooses one by index and never builds geometry at runtime.
 */
export interface ManeuverSet {
  readonly entry: Maneuver;
  readonly exit: Maneuver;
}

function cubicPoint(
  p0x: number,
  p0y: number,
  c0x: number,
  c0y: number,
  c1x: number,
  c1y: number,
  p1x: number,
  p1y: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0x + b * c0x + c * c1x + d * p1x,
    y: a * p0y + b * c0y + c * c1y + d * p1y,
  };
}

/**
 * A cubic Bézier from a start pose to an end pose, flattened for arc length.
 *
 * "Pose" rather than "point": the tangents are what make the car leave the lane
 * pointing along it and arrive in the bay pointing along the bay, instead of
 * cutting the corner and snapping round at the end.
 */
export function buildManeuver(
  startX: number,
  startY: number,
  startTangentX: number,
  startTangentY: number,
  endX: number,
  endY: number,
  endTangentX: number,
  endTangentY: number,
): Maneuver {
  const span = Math.hypot(endX - startX, endY - startY);
  const handle = Math.max(1, span * HANDLE_FRACTION);

  const c0x = startX + startTangentX * handle;
  const c0y = startY + startTangentY * handle;
  // Pulled *backwards* along the end tangent: the handle points the way the car
  // arrives from, not the way it will face afterwards.
  const c1x = endX - endTangentX * handle;
  const c1y = endY - endTangentY * handle;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= FLATTEN_SEGMENTS; i++) {
    const point = cubicPoint(startX, startY, c0x, c0y, c1x, c1y, endX, endY, i / FLATTEN_SEGMENTS);
    /*
     * `Polyline` rejects zero-length segments, and a Bézier whose endpoints and
     * handles coincide produces them. Dropping the duplicate is correct rather
     * than defensive: two identical successive samples describe no motion.
     */
    const previous = points[points.length - 1];
    if (previous !== undefined && Math.hypot(point.x - previous.x, point.y - previous.y) < 1e-6) {
      continue;
    }
    points.push(point);
  }

  const path = new Polyline(points);
  return { path, length: path.length };
}

/**
 * Every (lane, bay) manoeuvre pair for a stage.
 *
 * Indexed `laneIndex * bayCount + bayIndex`, which is the flat layout the
 * simulation stores as a single number on the vehicle.
 */
export class ManeuverTable {
  readonly laneCount: number;
  readonly bayCount: number;
  private readonly sets: readonly ManeuverSet[];
  /**
   * One per lane: in off the road, across the apron, and back out — without
   * stopping.
   *
   * The route a driver takes when they have committed to the turn and then find
   * every bay full. It exists as its own curve rather than borrowing a bay's so
   * that such a car reserves nothing: routing it through bay 0 made bay 0 look
   * occupied to everyone behind it, and four bays became three the first time
   * anybody was turned away.
   */
  private readonly passThroughSets: readonly ManeuverSet[];

  constructor(layout: StageLayout, lanes: LaneGraph) {
    this.laneCount = lanes.laneCount;
    this.bayCount = layout.parking.length;

    const sample: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };
    const sets: ManeuverSet[] = [];
    const passThrough: ManeuverSet[] = [];

    for (let laneIndex = 0; laneIndex < this.laneCount; laneIndex++) {
      const lane = lanes.lane(laneIndex);

      lane.path.sample(lane.entryS, sample);
      const entryX = sample.x;
      const entryY = sample.y;
      const entryTangentX = sample.tangentX;
      const entryTangentY = sample.tangentY;

      lane.path.sample(lane.rejoinS, sample);
      const rejoinX = sample.x;
      const rejoinY = sample.y;
      const rejoinTangentX = sample.tangentX;
      const rejoinTangentY = sample.tangentY;

      /*
       * Through the apron, keeping the lane's own heading at both ends, so the
       * car sweeps in and straight back out in one continuous line.
       */
      passThrough.push({
        entry: buildManeuver(
          entryX,
          entryY,
          entryTangentX,
          entryTangentY,
          layout.pullIn.x,
          layout.pullIn.y,
          entryTangentX,
          entryTangentY,
        ),
        exit: buildManeuver(
          layout.pullIn.x,
          layout.pullIn.y,
          rejoinTangentX,
          rejoinTangentY,
          rejoinX,
          rejoinY,
          rejoinTangentX,
          rejoinTangentY,
        ),
      });

      for (let bayIndex = 0; bayIndex < this.bayCount; bayIndex++) {
        const bay = layout.parking[bayIndex];
        if (bay === undefined) continue;

        /*
         * A car parks facing the way it drove in. The bay's authored heading is
         * an axis, not a direction, so it is flipped when the approaching lane
         * runs the other way — otherwise every car arriving from the west would
         * have to swing through 180 degrees to sit in a bay pointing east.
         */
        const alignment = bay.heading.x * entryTangentX + bay.heading.y * entryTangentY;
        const sign = alignment < 0 ? -1 : 1;
        const bayTangentX = bay.heading.x * sign;
        const bayTangentY = bay.heading.y * sign;

        sets.push({
          entry: buildManeuver(
            entryX,
            entryY,
            entryTangentX,
            entryTangentY,
            bay.x,
            bay.y,
            bayTangentX,
            bayTangentY,
          ),
          exit: buildManeuver(
            bay.x,
            bay.y,
            bayTangentX,
            bayTangentY,
            rejoinX,
            rejoinY,
            rejoinTangentX,
            rejoinTangentY,
          ),
        });
      }
    }

    this.sets = sets;
    this.passThroughSets = passThrough;
  }

  /** The in-and-straight-back-out route for a lane, used when no bay is free. */
  passThroughFor(laneIndex: number): ManeuverSet {
    const set = this.passThroughSets[laneIndex];
    if (set === undefined) throw new RangeError(`No pass-through for lane ${laneIndex}`);
    return set;
  }

  /**
   * The manoeuvre pair a vehicle should be following.
   *
   * A negative bay means "committed, but nowhere to stop" — one place decides
   * what that means so the entry and the exit cannot disagree about which curve
   * the car is on, which would move it sideways across the lot mid-manoeuvre.
   */
  setFor(laneIndex: number, bayIndex: number): ManeuverSet {
    return bayIndex < 0 ? this.passThroughFor(laneIndex) : this.get(laneIndex, bayIndex);
  }

  index(laneIndex: number, bayIndex: number): number {
    return laneIndex * this.bayCount + bayIndex;
  }

  get(laneIndex: number, bayIndex: number): ManeuverSet {
    const set = this.sets[this.index(laneIndex, bayIndex)];
    if (set === undefined) {
      throw new RangeError(`No manoeuvre for lane ${laneIndex}, bay ${bayIndex}`);
    }
    return set;
  }
}
