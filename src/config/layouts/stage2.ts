import { SHARED_ROAD, STAGE1_LAYOUT } from './stage1';
import type { StageLayout } from './stage1';

/**
 * Stage 2 — **FOOD TRUCK** (GAME_DESIGN_DOCUMENT §7).
 *
 * A truck with a serving window, a gravel car park, and a lit sign. The lesson
 * of this stage is that the bottleneck moves from *your clicking* to *your
 * staffing*: a cook removes the manual prep, and the number of stations becomes
 * the new limit.
 *
 * ## Same plot, same road, same camera
 *
 * The lot, the road and the counter position are unchanged from Stage 1. That is
 * the design constraint the whole evolution system is built around: the player's
 * first lemonade stand survives in a corner as a decorative object, and the
 * building grows around it rather than replacing it. A layout that moved the
 * counter would make the evolution a scene change wearing a costume.
 *
 * What actually changes: one more parking bay, two more queue positions, a
 * bigger waiting area, and the truck itself in the statics.
 */
export const STAGE2_LAYOUT: StageLayout = {
  ...STAGE1_LAYOUT,
  id: 'stage2',
  road: SHARED_ROAD,

  /*
   * Five bays, up from four. ECONOMY_DESIGN §3 puts Stage 2 at 12 customers a
   * minute against Stage 1's 5.3, and parking is one of the three capacity
   * ceilings (§7, Fren 3) — so it has to grow, but not to twelve. The queue is
   * meant to become visible before the car park does.
   */
  parking: [
    ...STAGE1_LAYOUT.parking,
    /*
     * A second row, south of the first. The obvious place — beside the road at
     * y ≈ 6 — is **on the carriageway**: the road is blocked from y 1.5 to 8.5
     * (`NavGrid.blockRoad`, centred on the lanes and widened to the authored
     * width), so a door there is unreachable and the customer never gets out.
     * Caught by `navigationIntact` before any of these layouts shipped.
     */
    /*
     * At y 12.9, not 12.4 — the layby row's cars now end at y 10.5, and a
     * second row at 12.4 left no free navigation row for its own door. 12.9
     * opens the 11.0-11.5 band as the walkway both rows' doors stand in.
     */
    { id: 'p5', x: 3.5, y: 12.9, heading: { x: 1, y: 0 }, door: { x: 4.0, y: 11.3 } },
  ],

  /*
   * Twelve places, six of them past `queueCapacity` — Phase 13.
   *
   * The last positions are the **spill**: they sit at the road edge and on the
   * carriageway, and standing in them is what triggers ECONOMY_DESIGN §7's only
   * negative feedback loop. Capacity upgrades eat into them, so a stage has to
   * author enough that a fully-upgraded queue still has somewhere to overflow —
   * otherwise buying the last barrier silently switches the loop off.
   */
  queue: [
    { x: 12.0, y: 10.2 },
    { x: 12.0, y: 9.4 },
    { x: 12.0, y: 8.6 },
    { x: 12.4, y: 7.9 },
    { x: 12.9, y: 7.3 },
    { x: 13.4, y: 6.7 },
    { x: 14.0, y: 6.2 },
    { x: 14.6, y: 5.8 },
    { x: 15.3, y: 5.5 },
    { x: 16.0, y: 5.2 },
    { x: 16.8, y: 5.0 },
    { x: 17.6, y: 4.9 },
  ],
  queueCapacity: 6,

  waitingArea: [
    ...STAGE1_LAYOUT.waitingArea,
    // East of the inherited rows, clear of the layby cars (which end at
    // y 10.5) and of bay p4's door at (20.5, 11.05).
    { x: 19.8, y: 11.6 },
    { x: 19.8, y: 13.2 },
    { x: 20.7, y: 11.6 },
    { x: 20.7, y: 13.2 },
  ],

  statics: [
    // The truck, where the counter used to be — the counter point itself is
    // unchanged, so every system that aims at it still works.
    { objectId: 'counter-lv1', x: 12, y: 11, z: 0 },
    /*
     * At y 12.5, not 11.6 — the correction pass. The truck's 2.4 m body used
     * to reach y 10.4, which walled off the 10.5..11.0 walkway every parking
     * door now stands in (flood-probe evidence, stages 2-4). South of the
     * counter line the body reads as the kitchen behind the window.
     */
    { objectId: 'truck', x: 10.6, y: 12.5, z: 0 },
    { objectId: 'sign', x: 9.5, y: 11.5, z: 0 }, // the lit sign
    { objectId: 'grill-lv1', x: 13.2, y: 11.9, z: 0 }, // the kitchen, now visible
    { objectId: 'fryer', x: 14.1, y: 11.9, z: 0 },
    /*
     * The original hand-painted stand, kept. GAME_DESIGN_DOCUMENT §7: "oyuncu,
     * ilk günkü limonata tezgâhının hâlâ bir köşede durduğunu görebilmelidir".
     * It is decorative from here on and it is the single clearest signal that
     * this is the same place rather than a new level.
     */
    { objectId: 'counter-lv1', x: 22.2, y: 15.6, z: 0 },

    // The roadside, unchanged from Stage 1. Same trees, same corner, same lamp:
    // this is the continuity the evolution is measured against.
    { objectId: 'tree-broadleaf-01', x: 20, y: 14, z: 0 },
    { objectId: 'tree-broadleaf-02', x: 4, y: 15, z: 0 },
    { objectId: 'bush-round-01', x: 18.2, y: 15.2, z: 0 },
    { objectId: 'bush-flowering-01', x: 6.4, y: 16.4, z: 0 },
    { objectId: 'lamp', x: 2.5, y: 8.2, z: 0 },
    // Both repositioned by the correction pass: the bin's old cell is now a
    // waiting spot, and the barrier's old verge is inside the marked layby.
    { objectId: 'bin', x: 21.2, y: 12.6, z: 0 },
    { objectId: 'barrier', x: 23.2, y: 11.6, z: 0 },
  ],

  tables: [],
  driveThru: null,
  registers: 1,
};
