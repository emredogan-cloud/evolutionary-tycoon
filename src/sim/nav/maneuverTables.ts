import { layoutForStage } from '@config/layouts';
import { LaneGraph } from './LaneGraph';
import { ManeuverTable } from './maneuvers';

/**
 * One manoeuvre table per stage, shared by every simulation — Phase 11.
 *
 * ## Why shared, and why only the tables
 *
 * A `ManeuverTable` is a pure function of the layout: a few hundred flattened
 * polylines, no mutable state, identical for every world at that stage. The
 * benchmark builds thousands of simulations, so re-flattening them per `Sim`
 * would be tens of thousands of identical curves.
 *
 * The **system** that uses them is *not* shared, and that distinction is new.
 * Until Phase 11 a single `VehicleManeuverSystem` was shared too, which was safe
 * only because it held nothing mutable. Phase 11 made it remember which stage
 * its table was built for, and a shared instance would then have two
 * simulations at different stages fighting over one — breaking the property the
 * whole architecture rests on.
 *
 * ## Why its own module
 *
 * It lived in `systems/noop.ts` for an hour and created a cycle:
 * `VehicleManeuverSystem → noop → ConversionSystem → …`. `dependency-cruiser`
 * rejected it, correctly — the system registry is the *top* of the dependency
 * graph and nothing underneath it may reach back up.
 */
const tables = new Map<number, ManeuverTable>();
let lanes: LaneGraph | undefined;

/** The lane graph, shared for the same reason and equally immutable. */
function sharedLanes(): LaneGraph {
  lanes ??= new LaneGraph(layoutForStage(1));
  return lanes;
}

export function maneuverTableFor(stage: number): ManeuverTable {
  const existing = tables.get(stage);
  if (existing !== undefined) return existing;

  const built = new ManeuverTable(layoutForStage(stage), sharedLanes());
  tables.set(stage, built);
  return built;
}
