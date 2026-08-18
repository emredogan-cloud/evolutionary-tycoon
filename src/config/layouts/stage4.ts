import { SHARED_ROAD } from './stage1';
import type { StageLayout } from './stage1';
import { STAGE3_LAYOUT } from './stage3';

/**
 * Stage 4 — **LARGE RESTAURANT** (GAME_DESIGN_DOCUMENT §7).
 *
 * The expanded building, a second register, wide parking, and the thing this
 * stage exists for: a **drive-thru lane**.
 *
 * ## The drive-thru is an asymmetry, not a second queue
 *
 * GAME_EXECUTION_ROADMAP Phase 11: _"Patience here is far lower than seated: the
 * customer is in a car with an engine running. This asymmetry is the source of
 * the game's central strategic tension, so tune it to actually bite."_
 *
 * So a drive-thru customer is not a dine-in customer who took a different route.
 * They are impatient by construction (see `DRIVE_THRU_PATIENCE_SCALE` in
 * `src/config/conversion.ts`), they never sit down, and they occupy a lane that
 * backs onto the road — which means a slow window does not merely lose the car
 * at the window, it loses every car that can see the queue.
 *
 * The lane runs along the eastern edge of the lot, entering from the road side
 * and turning back out — so a car in it is visible from the road, which is what
 * makes the spillover penalty a thing the player can *see* rather than only
 * read about.
 */
export const STAGE4_LAYOUT: StageLayout = {
  ...STAGE3_LAYOUT,
  id: 'stage4',
  road: SHARED_ROAD,

  /*
   * Twelve bays — the bottom of GAME_DESIGN_DOCUMENT §7's 12–20 range. The top
   * of that range is a Stage 4 *upgrade*, not the starting state: a stage that
   * opens with its capacity already maxed has no decisions left in it.
   */
  /*
   * **The same eight bays as Stage 3 — the extra capacity is the lane.**
   *
   * Four more bays were authored here at three-metre centres, which parks
   * 4.5 m cars through each other (see STAGE3_LAYOUT.parking). Respacing them
   * to five metres has nowhere to go: the west block holds two columns and
   * three rows, and the east half of the lot is the restaurant — bays there
   * would sit in the dining room.
   *
   * That is not a shortfall, it is the point of the stage. Stage 4's answer to
   * "more cars than the car park holds" is the drive-thru: four cars in the
   * lane, none of them occupying a bay, none of their occupants crossing the
   * car park on foot. A stage that solved it with more tarmac would make the
   * lane decorative.
   */
  parking: STAGE3_LAYOUT.parking,

  /* Twenty, for the same reason as Stage 3: capacity ten, upgrades add ten. */
  queue: [
    ...STAGE3_LAYOUT.queue,
    { x: 21.6, y: 5.4 },
    { x: 22.3, y: 5.8 },
    { x: 22.9, y: 6.3 },
    { x: 23.4, y: 6.9 },
  ],

  queueCapacity: 10,

  /*
   * Ten tables, seating thirty-six. Up from six because the dining room grew,
   * and still short of what the car park could deliver — seating stays the
   * constraint it became in Stage 3 rather than being solved by scale.
   */
  tables: [
    ...STAGE3_LAYOUT.tables,
    { id: 't7', x: 15.2, y: 17.4, seats: 4 },
    { id: 't8', x: 17.4, y: 17.4, seats: 4 },
    { id: 't9', x: 19.6, y: 17.4, seats: 6 },
    { id: 't10', x: 21.8, y: 15.6, seats: 4 },
  ],

  driveThru: {
    /*
     * A real drive-thru in the order a car meets it: you enter at the post,
     * order there, then **drive forward** to the window and collect. So the
     * lane is indexed from the *window* — `lane[0]` is at the window, and the
     * last entry is beside the post where a car joins.
     *
     * That ordering matters because it is what makes the queue compact toward a
     * single service point. Indexing from the post instead would need a second
     * service position or a car that never moves, and a drive-thru whose cars
     * do not advance is a car park with a menu.
     */
    orderPost: { x: 22.6, y: 5.2 },
    window: { x: 23.0, y: 11.4 },
    /*
     * Six places, of which four are "in the lane" — the last two are on the
     * approach and count as spilled, exactly like the counter queue's last two
     * slots. That is what makes a backed-up drive-thru cost conversions on the
     * road: a driver can see the tail.
     */
    lane: [
      { x: 23.0, y: 11.4 },
      { x: 23.0, y: 9.9 },
      { x: 23.0, y: 8.4 },
      { x: 22.8, y: 6.9 },
      { x: 22.6, y: 5.2 },
      { x: 22.2, y: 3.6 },
    ],
    laneCapacity: 4,
  },

  /** Two registers — GAME_DESIGN_DOCUMENT §7, "2 kasa". */
  registers: 2,

  /*
   * The restaurant, plus the lane down the east side.
   *
   * Everything Stage 3 has, and the drive-thru's two ends: an order post where
   * the lane starts and a serving window where it meets the building. The
   * roadside is still Stage 1's roadside — same two trees, same lamp, same bush
   * — which is what makes this legible as the same corner rather than a fourth map.
   */
  statics: [
    { objectId: 'counter-lv2', x: 12, y: 11, z: 0 }, // the counter
    { objectId: 'door', x: 10.6, y: 11.6, z: 0 },
    { objectId: 'sign', x: 9.5, y: 11.5, z: 0 },
    { objectId: 'window', x: 13.4, y: 12.6, z: 0 },
    { objectId: 'window', x: 21.4, y: 12.6, z: 0 },

    // The kitchen, now two of everything the menu leans on.
    { objectId: 'grill-lv2', x: 13.2, y: 10.1, z: 0 },
    { objectId: 'grill-lv2', x: 14.1, y: 10.1, z: 0 },
    { objectId: 'fryer', x: 15.0, y: 10.1, z: 0 },
    { objectId: 'drink', x: 15.9, y: 10.1, z: 0 },
    { objectId: 'pass', x: 12.9, y: 11.6, z: 0 },

    // The drive-thru: where a car orders, and where it collects.
    { objectId: 'sign', x: 22.6, y: 5.2, z: 0 }, // the order post
    { objectId: 'window', x: 23.0, y: 11.4, z: 0 }, // the serving window
    { objectId: 'barrier', x: 24.6, y: 8.4, z: 0 }, // the lane's outer edge

    // Still there, four stages later.
    { objectId: 'counter-lv1', x: 22.2, y: 15.6, z: 0 },
    { objectId: 'bin', x: 6, y: 13, z: 0 },

    // Stage 1's roadside, unmoved.
    { objectId: 'tree-broadleaf-01', x: 20, y: 14, z: 0 },
    { objectId: 'tree-broadleaf-02', x: 1.5, y: 9.6, z: 0 },
    { objectId: 'bush-round-01', x: 18.2, y: 15.2, z: 0 },
    { objectId: 'bush-flowering-01', x: 6.4, y: 16.4, z: 0 },
    { objectId: 'lamp', x: 2.5, y: 8.2, z: 0 },
  ],
};
