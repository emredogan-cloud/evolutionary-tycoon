import { SHARED_ROAD } from './stage1';
import type { StageLayout } from './stage1';
import { STAGE2_LAYOUT } from './stage2';

/**
 * Stage 3 — **SMALL DINER** (GAME_DESIGN_DOCUMENT §7).
 *
 * An enclosed building with a door, tables, a counter, a back kitchen and an
 * asphalt car park. The new primary constraint is **seats**, and that single
 * change is what finally makes three features built in earlier phases do
 * anything at all:
 *
 * - the **pass plate** indicator (Phase 8) — food now waits, because somebody
 *   has to carry it to a table;
 * - the **cooler** upgrade (Phase 9) — hold temperature can finally bite;
 * - the **waiter** role (Phase 10) — `DELIVER_ORDER` becomes real work.
 *
 * PHASE_8_REPORT §6 measured food sitting on the pass for **zero ticks out of
 * 24 000** and Phases 9 and 10 each inherited that. Tables are the fix, and the
 * test that asserted the absence is expected to fail here — which is the signal
 * it was written to give.
 */
export const STAGE3_LAYOUT: StageLayout = {
  ...STAGE2_LAYOUT,
  id: 'stage3',
  road: SHARED_ROAD,

  /*
   * Eight bays. ECONOMY_DESIGN §3 puts Stage 3 at 22.8 customers a minute, and
   * a customer who cannot park never becomes one — `turnedAwayNoParking` is
   * already counted, so the ceiling is visible rather than guessed at.
   */
  parking: [
    ...STAGE2_LAYOUT.parking,
    /*
     * **Five metres apart, not three.** A car is 4.5 m long and these bays are
     * parallel — the authored heading is (1, 0), so the length runs along x —
     * which means three-metre centres park two cars through each other. Nothing
     * in the simulation objected, because a parked car is placed by its
     * manoeuvre rather than pathfound into its bay; it surfaced the moment the
     * renderer started drawing bay markings from the layout (Phase 11).
     *
     * Five metres is the original row's own spacing and leaves 0.5 m between
     * bumpers.
     */
    { id: 'p6', x: 8.5, y: 12.9, heading: { x: 1, y: 0 }, door: { x: 8.6, y: 11.3 } }, // see p5; door west of the sign's cells
    { id: 'p7', x: 3.5, y: 16.2, heading: { x: 1, y: 0 }, door: { x: 3.5, y: 14.7 } },
    { id: 'p8', x: 8.5, y: 16.2, heading: { x: 1, y: 0 }, door: { x: 8.5, y: 14.7 } },
  ],

  /*
   * Sixteen places — four more than Stage 2 — because Stage 3 authors a
   * capacity of eight and the capacity upgrades add six more on top. A queue
   * whose authored places run out stops spilling, and spilling is the only
   * thing that tells an overwhelmed diner to stop attracting customers
   * (ECONOMY_DESIGN §7).
   */
  queue: [
    ...STAGE2_LAYOUT.queue,
    { x: 18.4, y: 4.8 },
    { x: 19.2, y: 4.8 },
    { x: 20.0, y: 4.9 },
    { x: 20.8, y: 5.1 },
  ],

  queueCapacity: 8,

  /*
   * Six tables, seating twenty-two. GAME_DESIGN_DOCUMENT §7 says 4–8, and six
   * is where the seating ceiling sits just below the parking one: a diner should
   * run out of *tables* before it runs out of car park, because the table is the
   * constraint the stage is about.
   *
   * Mixed sizes because vans arrive with groups (ARCHETYPE_SPECS), and a room of
   * identical two-tops would either waste seats or turn groups away.
   */
  /*
   * Twelve standing spots, same count Stage 2 carries — the count is queue
   * capacity and stays put — but repositioned by the correction pass: the
   * inherited rows sit at y 13.2, which is where this stage's own dining
   * tables go. Four keep the counter-side row; the rest line the west apron
   * between the parking rows, which stays open at every later stage too.
   */
  waitingArea: [
    { x: 16.2, y: 11.6 },
    { x: 17.1, y: 11.6 },
    { x: 18.0, y: 11.6 },
    { x: 18.9, y: 11.6 },
    { x: 4.0, y: 14.2 },
    { x: 4.9, y: 14.2 },
    { x: 5.8, y: 14.2 },
    { x: 6.7, y: 14.2 },
    { x: 7.6, y: 14.2 },
    { x: 8.5, y: 14.2 },
    { x: 9.4, y: 14.2 },
    { x: 4.0, y: 15.0 },
  ],

  tables: [
    { id: 't1', x: 15.2, y: 13.4, seats: 2 },
    { id: 't2', x: 17.4, y: 13.4, seats: 2 },
    { id: 't3', x: 19.6, y: 13.4, seats: 4 },
    { id: 't4', x: 15.2, y: 15.6, seats: 4 },
    { id: 't5', x: 17.4, y: 15.6, seats: 4 },
    { id: 't6', x: 19.6, y: 15.6, seats: 6 },
  ],

  /*
   * A diner: a room with a door, a counter you order at and tables you sit at.
   *
   * The kitchen line moves inside and gains the drinks cabinet the menu needs;
   * the truck is gone, because Stage 3 is where the building replaces it. Chairs
   * are placed around the table pads `tables` already declares rather than being
   * scattered, so the dining room reads as seating rather than as furniture.
   */
  statics: [
    { objectId: 'counter-lv2', x: 12, y: 11, z: 0 }, // the counter, now indoors
    { objectId: 'door', x: 10.6, y: 11.6, z: 0 },
    { objectId: 'sign', x: 9.5, y: 11.5, z: 0 },
    { objectId: 'window', x: 13.4, y: 12.6, z: 0 }, // building frontage
    { objectId: 'window', x: 21.4, y: 12.6, z: 0 },

    // The kitchen line, behind the counter.
    { objectId: 'grill-lv2', x: 13.2, y: 10.1, z: 0 },
    { objectId: 'fryer', x: 14.1, y: 10.1, z: 0 },
    { objectId: 'drink', x: 15.0, y: 10.1, z: 0 },
    { objectId: 'pass', x: 12.9, y: 11.6, z: 0 },

    // The original stand, still there.
    { objectId: 'counter-lv1', x: 22.2, y: 15.6, z: 0 },
    // Moved from (4, 15): it stood on p8's door and `navigationIntact` said so.
    { objectId: 'tree-broadleaf-02', x: 1.5, y: 9.6, z: 0 },
    // And moved from (6, 13), which was inside the respaced p6.
    { objectId: 'bin', x: 11.8, y: 17.2, z: 0 },

    // The roadside, carried through from Stage 1 unchanged.
    { objectId: 'tree-broadleaf-01', x: 20, y: 14, z: 0 },
    { objectId: 'bush-round-01', x: 18.2, y: 15.2, z: 0 },
    { objectId: 'bush-flowering-01', x: 6.4, y: 16.4, z: 0 },
    { objectId: 'lamp', x: 2.5, y: 8.2, z: 0 },
  ],

  driveThru: null,
  registers: 1,
};
