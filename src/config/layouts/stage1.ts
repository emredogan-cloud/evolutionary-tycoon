/**
 * Stage 1 — the roadside stand.
 *
 * These metres bind everything downstream. The traffic model spawns vehicles on
 * these lane polylines, the conversion decision point is a distance along them,
 * pedestrians navigate a grid derived from the lot rectangle, and every golden
 * screenshot frames this geometry. Moving a number here is a gameplay change.
 *
 * World unit = 1 metre. The plot is deliberately small: Stage 1 exists to teach
 * the core loop in ten to fifteen minutes, and a large empty lot reads as
 * "unfinished" rather than "early".
 */

interface Point {
  readonly x: number;
  readonly y: number;
}

interface LanePath {
  readonly id: string;
  /** Direction of travel, for readability at the call site. */
  readonly heading: 'east' | 'west';
  /** Polyline in world metres. Phase 5 arc-length parametrises this into a spline. */
  readonly points: readonly Point[];
}

interface StaticObject {
  /** Render catalogue / placeholder key. */
  readonly objectId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A place a converted vehicle can stop.
 *
 * `heading` is the direction the parked car faces, and it is authored rather
 * than derived: the manoeuvre spline uses it as its end tangent, so it decides
 * whether the car noses in or reverses in — a visual choice, not a computation.
 */
interface ParkingSlot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly heading: Point;
  /** Where the driver steps out, and where the walk to the door begins. */
  readonly door: Point;
}

/**
 * A standing position in the queue at the counter.
 *
 * Named positions rather than a computed line, for the reason
 * GAME_DESIGN_DOCUMENT §10 gives: a list of queue points produces far more
 * readable crowd behaviour than any avoidance model, and it is authored art
 * direction — the queue bends around the counter because someone decided it
 * should.
 */
interface QueueSlot {
  readonly x: number;
  readonly y: number;
}

export interface StageLayout {
  readonly id: string;
  /** Lot extent in world metres, inclusive of the road. */
  readonly lot: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly road: {
    readonly lanes: readonly LanePath[];
    readonly widthMetres: number;
    /** Where a vehicle commits to stopping, as a distance along its lane. */
    readonly decisionPointMetres: number;
  };
  /** Where converted vehicles pull in, and where customers queue. */
  readonly pullIn: Point;
  readonly counter: Point;
  /**
   * Distance along a lane at which a committed vehicle leaves it.
   *
   * Authored as metres before the counter and resolved per lane, exactly like
   * `decisionPointMetres`, so both directions of travel work from one number.
   * It must be **less** than `decisionPointMetres` — the decision comes first,
   * then the turn.
   */
  readonly entryPointMetres: number;
  /** Where a departing vehicle rejoins its lane, as metres past the counter. */
  readonly rejoinPointMetres: number;
  readonly parking: readonly ParkingSlot[];
  /** Index 0 is at the counter; a customer joins at the highest free index. */
  readonly queue: readonly QueueSlot[];
  /**
   * Queue slots beyond this count as spilled onto the road.
   *
   * Below `queue.length` on purpose: the last authored slots exist so that an
   * overflowing queue has somewhere to stand and can be *seen* overflowing.
   * ECONOMY_DESIGN §7 Fren 4 turns that into a conversion penalty, which is the
   * economy's only negative feedback loop.
   */
  readonly queueCapacity: number;
  readonly statics: readonly StaticObject[];
  /** Extra world metres of margin the camera may show beyond the lot. */
  readonly cameraMarginMetres: number;
}

const LANE_EAST_Y = 3.5;
const LANE_WEST_Y = 6.5;

export const STAGE1_LAYOUT: StageLayout = {
  id: 'stage1',

  // 24 x 18 m — GAME_EXECUTION_ROADMAP Phase 3.
  lot: { minX: 0, minY: 0, maxX: 24, maxY: 18 },

  road: {
    // Straight in Stage 1. It reads as a diagonal on screen because the
    // projection turns the world X axis into a down-right diagonal — the road
    // does not need to be diagonal in world space to look like one.
    lanes: [
      {
        id: 'east',
        heading: 'east',
        points: [
          { x: -6, y: LANE_EAST_Y },
          { x: 30, y: LANE_EAST_Y },
        ],
      },
      {
        id: 'west',
        heading: 'west',
        points: [
          { x: 30, y: LANE_WEST_Y },
          { x: -6, y: LANE_WEST_Y },
        ],
      },
    ],
    widthMetres: 7,
    // Far enough out that a driver has time to decide and brake, which is what
    // makes the conversion feel like a choice rather than a teleport.
    decisionPointMetres: 14,
  },

  pullIn: { x: 12, y: 8.5 },
  counter: { x: 12, y: 11 },

  // Ten metres after the decision point, so a driver who commits has time to
  // slow down and be *seen* slowing down before the turn begins.
  entryPointMetres: 4,
  rejoinPointMetres: 8,

  /*
   * Four bays, parallel to the road along the apron at y = 8.6.
   *
   * Parallel rather than the nose-in bays a real forecourt would have, because
   * a 4.5 m car nosing in from an apron at y = 8.5 ends up on top of the
   * counter at y = 11 — the lot is 18 m deep and Stage 1 spends most of that on
   * the road. Parallel bays also keep the entry manoeuvre a single lane change
   * rather than a three-point turn, which is the difference between a car that
   * looks like it is parking and one that looks like it is glitching.
   *
   * The corridor between bays 2 and 3 (x = 10.75 to 13.25) is deliberately
   * empty: it is how customers walk from their cars to the counter, and how the
   * queue spills back towards the road when the stand is overwhelmed.
   */
  parking: [
    { id: 'p1', x: 3.5, y: 8.6, heading: { x: 1, y: 0 }, door: { x: 3.5, y: 9.8 } },
    { id: 'p2', x: 8.5, y: 8.6, heading: { x: 1, y: 0 }, door: { x: 8.5, y: 9.8 } },
    { id: 'p3', x: 15.5, y: 8.6, heading: { x: 1, y: 0 }, door: { x: 15.5, y: 9.8 } },
    { id: 'p4', x: 20.5, y: 8.6, heading: { x: 1, y: 0 }, door: { x: 20.5, y: 9.8 } },
  ],

  /*
   * The queue runs from the counter back towards the road, not along it.
   *
   * That direction is the mechanic: slots 4 and 5 are past `queueCapacity` and
   * sit at the road edge and on the road itself, so an overwhelmed stand is
   * visible to the drivers it is losing. ECONOMY_DESIGN §7 Fren 4 turns exactly
   * that into a conversion penalty, and it is the economy's only negative
   * feedback loop — a queue along the counter would have been tidier and would
   * have made the mechanic invisible.
   */
  queue: [
    { x: 12.0, y: 10.2 },
    { x: 12.0, y: 9.4 },
    { x: 12.0, y: 8.6 },
    { x: 12.4, y: 7.9 },
    { x: 12.9, y: 7.3 },
    { x: 13.4, y: 6.7 },
  ],
  queueCapacity: 4,

  statics: [
    { objectId: 'ph-prop-short', x: 12, y: 11, z: 0 }, // the counter itself
    { objectId: 'ph-prop-tall', x: 9.5, y: 11.5, z: 0 }, // sign post
    { objectId: 'ph-prop-tall', x: 20, y: 14, z: 0 }, // tree
    { objectId: 'ph-prop-tall', x: 4, y: 15, z: 0 }, // tree
    { objectId: 'ph-prop-short', x: 16, y: 13, z: 0 }, // bin
    { objectId: 'ph-scale-reference', x: 14, y: 11, z: 0 }, // 2 m scale figure
  ],

  cameraMarginMetres: 4,
};
