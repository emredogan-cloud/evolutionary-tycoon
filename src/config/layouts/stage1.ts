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
