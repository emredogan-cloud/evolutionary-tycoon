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
    { id: 'p6', x: 8.5, y: 12.4, heading: { x: 1, y: 0 }, door: { x: 8.5, y: 10.9 } },
    { id: 'p7', x: 3.5, y: 16.2, heading: { x: 1, y: 0 }, door: { x: 3.5, y: 14.7 } },
    { id: 'p8', x: 8.5, y: 16.2, heading: { x: 1, y: 0 }, door: { x: 8.5, y: 14.7 } },
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
  tables: [
    { id: 't1', x: 15.2, y: 13.4, seats: 2 },
    { id: 't2', x: 17.4, y: 13.4, seats: 2 },
    { id: 't3', x: 19.6, y: 13.4, seats: 4 },
    { id: 't4', x: 15.2, y: 15.6, seats: 4 },
    { id: 't5', x: 17.4, y: 15.6, seats: 4 },
    { id: 't6', x: 19.6, y: 15.6, seats: 6 },
  ],

  statics: [
    { objectId: 'ph-prop-short', x: 12, y: 11, z: 0 }, // the counter
    { objectId: 'ph-prop-tall', x: 10.6, y: 11.6, z: 0 },
    { objectId: 'ph-prop-tall', x: 9.5, y: 11.5, z: 0 }, // the sign
    { objectId: 'ph-prop-tall', x: 13.4, y: 12.6, z: 0 }, // building corner
    { objectId: 'ph-prop-tall', x: 21.4, y: 12.6, z: 0 }, // building corner
    // The original stand, still there.
    { objectId: 'ph-prop-short', x: 22.2, y: 15.6, z: 0 },
    // Moved from (4, 15): it stood on p8's door and `navigationIntact` said so.
    { objectId: 'ph-prop-tall', x: 1.5, y: 9.6, z: 0 },
    // And moved from (6, 13), which was inside the respaced p6.
    { objectId: 'ph-prop-short', x: 11.8, y: 17.2, z: 0 },
  ],

  driveThru: null,
  registers: 1,
};
