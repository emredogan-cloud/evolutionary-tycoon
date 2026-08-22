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
   * Where somebody stands after ordering, while their food is made.
   *
   * A separate list from the queue, because they are a separate thing: the queue
   * is people waiting for *attention* and this is people waiting for *food*, and
   * they must not be in each other's way. Without it, a customer who ordered
   * simply stopped where they stood — on the queue — and the next person walked
   * into them. Measured before it existed: closest approach 7.9 cm.
   */
  readonly waitingArea: readonly QueueSlot[];
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

  /**
   * Seating — Stage 3 onward. Empty until a building exists to put it in.
   *
   * A table is where a customer *eats*, which is what turns delivery from an
   * instantaneous handover into a walk somebody has to make. Three features
   * built in Phases 8, 9 and 10 have been dormant waiting for exactly this:
   * the pass plate indicator, the cooler upgrade and the waiter role.
   */
  readonly tables: readonly TableSlot[];

  /**
   * The drive-thru channel — Stage 4 only, `null` before it exists.
   *
   * Order post, lane and window, in the order a car meets them. Patience here is
   * far lower than seated (GAME_EXECUTION_ROADMAP Phase 11: "the customer is in a
   * car with an engine running"), and that asymmetry is the source of the game's
   * central strategic tension.
   */
  readonly driveThru: DriveThruLayout | null;

  /**
   * How many customers can be served at the counter simultaneously.
   *
   * One until Stage 4's second register. It is the counter's parallelism, not
   * the kitchen's: two registers means two people ordering at once, which is a
   * different bottleneck from two stations cooking at once.
   */
  readonly registers: number;
}

/** A place to sit and eat. */
interface TableSlot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** How many customers it seats. Groups arrive from vans; see ARCHETYPE_SPECS. */
  readonly seats: number;
}

interface DriveThruLayout {
  /** Where a car stops to order. */
  readonly orderPost: Point;
  /** Where it collects, after the post. */
  readonly window: Point;
  /**
   * Stopping places along the lane, from the entrance to the post.
   *
   * Index 0 is at the post. A car joins at the highest free index, exactly like
   * the counter queue — so the lane backing up onto the road is visible, and
   * ECONOMY_DESIGN §7's spillover penalty applies to it too.
   */
  readonly lane: readonly Point[];
  /** Cars beyond this are spilling onto the road. */
  readonly laneCapacity: number;
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
    /*
     * The lanes overshoot the lot by ten metres each side, not six. The extra
     * four exist for the decision point below: it sits 20 m up-lane of the
     * counter, and a lane that starts 18 m out would clamp it to the spawn edge
     * — a car "deciding" the instant it exists. Off-lot road costs nothing
     * visible (the camera is bounded to the lot plus margin) and moves the
     * spawn pop-in further off screen at minimum zoom.
     */
    lanes: [
      {
        id: 'east',
        heading: 'east',
        points: [
          { x: -10, y: LANE_EAST_Y },
          { x: 34, y: LANE_EAST_Y },
        ],
      },
      {
        id: 'west',
        heading: 'west',
        points: [
          { x: 34, y: LANE_WEST_Y },
          { x: -10, y: LANE_WEST_Y },
        ],
      },
    ],
    widthMetres: 7,
    /*
     * Far enough out that a driver has time to decide and brake, which is what
     * makes the conversion feel like a choice rather than a teleport.
     *
     * Twenty metres, not the 14 first authored, and the number is arithmetic
     * rather than taste. The entry is at 4 m, so the braking window is
     * `decision - entry`; the fastest car on this road is a sedan at
     * 13.9 x 1.12 = 15.6 m/s, and `v² = u² + 2as` at the model's 8 m/s² maximum
     * braking over a 10 m window leaves it doing **9.1 m/s at the turn** — the
     * approach speed is unreachable, not merely missed. A 16 m window brings the
     * required deceleration to 7.4 m/s², inside the model's own limit. The cost
     * this trades against is the one the roadside-marker removal documented —
     * deciding earlier reserves a parking bay earlier — and six metres at road
     * speed holds a bay for ~0.5 s more per conversion, which the balance gate
     * confirms is noise.
     */
    decisionPointMetres: 20,
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
  /*
   * The doors stand 1.5 m out from the bay centre, not 1.2.
   *
   * A car is 1.9 m wide, so 1.2 m clears the bodywork by 25 cm — and then the
   * 0.5 m navigation grid rounds the two into the same cell, so the spot a
   * customer steps out onto was marked solid by their own car. They could not
   * be routed from it and could not be routed to it. 1.5 m puts the door in the
   * next cell out, which is the number that has to be true rather than the one
   * that looks tidy.
   */
  /*
   * At y = 9.55, not the 8.6 first authored — the UI/world correction pass.
   *
   * The carriageway runs to y = 8.5, and a 1.9 m car centred at 8.6 spans
   * y 7.65..9.55: most of a metre of every parked car sat **on the road**,
   * which is exactly what the 2026-08-22 captures show — cars that read as
   * abandoned in the slow lane, because no painted bay existed and the metal
   * was genuinely on the asphalt. 9.55 puts the whole body (8.6..10.5) inside
   * the marked layby the renderer now paints along the frontage, with a coat
   * of clearance to the through lane.
   */
  /*
   * Two pairs flanking the stand, with the pedestrian mouth between them
   * centred on the counter. The x positions are navigation geometry, not
   * taste: a parked car blocks the grid to y 10.5 and the counter blocks
   * 10.8-11.2, so the only walkable route from the doors to the queue runs
   * through the mouth — which therefore has to be wider than the counter's
   * own footprint (10.5..13.5), or the flood fill dead-ends into the
   * counter's back and every placement in the game reads "blocks-navigation".
   */
  /*
   * Bay centres at y 9.4 so the parked body (8.45..10.35) leaves the whole
   * 10.5..11.0 navigation row free: that row is the doors' walkway, and it is
   * what keeps every stage's venue objects (truck, diner) able to sit south
   * of it without sealing the car park off — measured with the flood-fill
   * probe across all four stages, not assumed.
   */
  parking: [
    { id: 'p1', x: 2.5, y: 9.4, heading: { x: 1, y: 0 }, door: { x: 2.5, y: 10.75 } },
    { id: 'p2', x: 7.5, y: 9.4, heading: { x: 1, y: 0 }, door: { x: 7.5, y: 10.75 } },
    { id: 'p3', x: 16.5, y: 9.4, heading: { x: 1, y: 0 }, door: { x: 16.5, y: 10.75 } },
    { id: 'p4', x: 21.5, y: 9.4, heading: { x: 1, y: 0 }, door: { x: 21.5, y: 10.75 } },
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

  /*
   * All on **one** side of the counter, and that is the point rather than a
   * shortcut. Spots on both sides were tried first: two people assigned to
   * opposite sides walk straight across the front of the counter, meet in the
   * middle, and the non-overlap correction cannot separate them because the only
   * way apart is into the counter itself. Measured at 5.4 cm closest approach.
   *
   * Two rows, 1.8 m apart, with the gap between them used as the approach. The
   * rows started 0.9 m apart and that was too close: somebody assigned a spot at
   * the far end had to walk *along* an occupied row to reach it, passing every
   * standing person at half the spacing — 15 cm closest approach. The aisle
   * keeps a passer-by 0.9 m from both rows, which is the same distance the rows
   * themselves are spaced at.
   *
   * Eight spots so a busy stand has somewhere to put everyone. Clear of the
   * queue, which runs down the x = 12 corridor towards the road.
   *
   * The rows start at x = 15.5, and that number was moved once, by measurement.
   * They were authored at 14.6 against the placeholder counter, whose blocked
   * edge sat at x = 12.6 — two metres of approach corridor. The real counter is
   * 3 m wide and its end is at x = 13.5, which quietly cut the corridor to
   * 1.1 m: anyone heading for a far spot passed the first standing person at
   * 8 cm, the exact "walk along an occupied row" failure the paragraph above
   * records fixing the first time. Shifting the rows 0.9 m east restores the
   * corridor the rows were designed around.
   */
  /*
   * Shifted south of the parking line by the UI/world correction pass. The
   * rows used to start at y = 10.0, which was fine while parked cars ended at
   * y 9.55 — and became the inside of a parked car when the bays moved into
   * the layby (cars now end at y 10.5). The rows keep their 0.9 m spacing and
   * their two-row + aisle shape; only the ground they stand on moved.
   */
  waitingArea: [
    { x: 16.2, y: 11.6 },
    { x: 17.1, y: 11.6 },
    { x: 18.0, y: 11.6 },
    { x: 18.9, y: 11.6 },
    { x: 16.2, y: 13.2 },
    { x: 17.1, y: 13.2 },
    { x: 18.0, y: 13.2 },
    { x: 18.9, y: 13.2 },
  ],

  /*
   * The stand, and just enough roadside to say where it is.
   *
   * Stage 1 is a lemonade stand on a verge and it has to read as one — sparse on
   * purpose, because everything added here is something Stage 2 cannot add to
   * make the place feel like it grew. The scale-reference figure is gone: it was
   * a ruler for judging placeholder sizes and it has no business on a production
   * screen (PLACEHOLDER_REGISTER).
   */
  statics: [
    { objectId: 'counter-lv1', x: 12, y: 11, z: 0 }, // the stand itself
    /*
     * The canopy, mounted OVER the counter — the correction pass. It used to
     * sit at (12, 10.2, z 0): eighty centimetres in front of the counter at
     * ground level, which drew the whole striped canopy lying on the road
     * apron like a fallen tarp (the 2026-08-22 captures). The art is a
     * wall-mount awning whose bar is its high edge; z lifts the bar to
     * head height above the counter top, and the slight north offset lets the
     * canopy slope forward over the serving side, where the queue stands.
     */
    { objectId: 'awning', x: 12, y: 10.85, z: 1.75 },
    { objectId: 'sign', x: 9.5, y: 11.5, z: 0 }, // the hand-painted sign by the road
    // East of the waiting rows since the correction pass — its old spot at
    // (16, 13) is now a standing position.
    { objectId: 'bin', x: 21.2, y: 12.6, z: 0 },
    { objectId: 'tree-broadleaf-01', x: 20, y: 14, z: 0 },
    { objectId: 'tree-broadleaf-02', x: 4, y: 15, z: 0 },
    { objectId: 'bush-round-01', x: 18.2, y: 15.2, z: 0 },
    { objectId: 'bush-flowering-01', x: 6.4, y: 16.4, z: 0 },
    { objectId: 'lamp', x: 2.5, y: 8.2, z: 0 }, // roadside, north-west corner
  ],

  cameraMarginMetres: 4,

  // Nobody sits down at a roadside stand; they eat standing in the waiting area.
  tables: [],
  driveThru: null,
  registers: 1,
};

/**
 * The road, shared by every stage.
 *
 * Evolution happens **on the same plot** (GAME_DESIGN_DOCUMENT §7) — the camera
 * does not move and the road does not change. Exporting it rather than copying
 * it into three more files is what keeps that true: a lane edited in Stage 4
 * that was not edited in Stage 1 would silently teleport every car mid-evolution.
 */
export const SHARED_ROAD = STAGE1_LAYOUT.road;
