import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import type { SimSystem, SystemName } from '../core/SystemPipeline';
import { SYSTEM_ORDER } from '../core/SystemPipeline';
import type { World } from '../core/World';
import { LaneGraph } from '../nav/LaneGraph';
import { FlowFieldCache } from '../nav/FlowFieldCache';
import { ManeuverTable } from '../nav/maneuvers';
import { ConversionSystem } from './ConversionSystem';
import { CustomerFsmSystem } from './CustomerFsmSystem';
import { EconomySystem } from './EconomySystem';
import { EmployeeFsmSystem } from './EmployeeFsmSystem';
import { TaskBoardSystem } from './TaskBoardSystem';
import { KitchenSystem } from './KitchenSystem';
import { NavigationSystem } from './NavigationSystem';
import { QueueSystem } from './QueueSystem';
import { SatisfactionSystem } from './SatisfactionSystem';
import { ServiceSystem } from './ServiceSystem';
import { TimeSystem } from './TimeSystem';
import { VehicleManeuverSystem } from './VehicleManeuverSystem';
import { TrafficSpawnSystem } from './TrafficSpawnSystem';
import { VehicleMotionSystem } from './VehicleMotionSystem';

/**
 * The eighteen reserved slots, filled in as their phases land.
 *
 * Phase 2 built the machine and left every slot a no-op; Phase 5 filled the
 * traffic slots, Phase 6 the customer ones, Phase 7 navigation, and Phase 8 the
 * kitchen and service. The rest still do nothing, and each is replaced in the
 * phase noted beside it in `SYSTEM_ORDER`.
 *
 * Clock advancement deliberately does *not* live in `TimeSystem`. Advancing
 * simulation time is the definition of a tick rather than the behaviour of one
 * system, so `Sim.tick()` owns it; `TimeSystem` carries the gameplay
 * consequences of the hour changing.
 */

/**
 * A single shared instance per empty slot.
 *
 * One frozen object each rather than a fresh closure per construction: the
 * pipeline is rebuilt whenever a `Sim` is constructed, and the benchmark builds
 * thousands of them.
 */
function createNoopSystem(name: SystemName): SimSystem {
  return Object.freeze({
    name,
    run(): void {
      // Reserved slot — see SYSTEM_ORDER for the phase that fills it.
    },
  });
}

const NOOP_SYSTEMS: Readonly<Record<SystemName, SimSystem>> = Object.freeze(
  Object.fromEntries(SYSTEM_ORDER.map((name) => [name, createNoopSystem(name)])),
) as Readonly<Record<SystemName, SimSystem>>;

/**
 * The lane graph is derived from static authored layout, so one instance is
 * shared by every simulation. It holds no mutable state — only geometry and the
 * arc-length tables — and rebuilding it per `Sim` would cost the benchmark
 * thousands of polyline constructions for identical results.
 */
let sharedLanes: LaneGraph | undefined;

export function stage1Lanes(): LaneGraph {
  sharedLanes ??= new LaneGraph(STAGE1_LAYOUT);
  return sharedLanes;
}

export function createDefaultSystems(world: World): readonly SimSystem[] {
  const lanes = stage1Lanes();
  const maneuverSystem = stage1ManeuverSystem();

  const filled: Partial<Record<SystemName, SimSystem>> = {
    TimeSystem: new TimeSystem(),
    TrafficSpawnSystem: new TrafficSpawnSystem(lanes),
    VehicleMotionSystem: new VehicleMotionSystem(lanes, world.vehicles.capacity),
    ConversionSystem: new ConversionSystem(lanes, STAGE1_LAYOUT),
    VehicleManeuverSystem: maneuverSystem,
    /*
     * The state machine holds the manoeuvre system rather than the other way
     * round. A customer who gives up has to tell their car to leave, and that
     * is the only direction the dependency runs — the car never decides
     * anything on its own.
     */
    /*
     * Navigation runs one slot *before* the state machine, so a customer who
     * arrives this tick is seen to have arrived on the same tick rather than the
     * next. The reverse order costs a tick of latency at every transition, which
     * at 20 Hz is 50 ms of a customer standing on their queue slot before
     * noticing they are on it.
     */
    NavigationSystem: new NavigationSystem(stage1Fields(), world.customers.capacity),
    CustomerFsmSystem: new CustomerFsmSystem(STAGE1_LAYOUT, maneuverSystem),
    QueueSystem: new QueueSystem(STAGE1_LAYOUT),
    /*
     * The board posts and assigns *before* the brains run, so an employee
     * assigned this tick starts walking this tick. The reverse order costs 50 ms
     * of standing still at every transition — the same reasoning that puts
     * navigation before the customer FSM and the kitchen before the service.
     */
    TaskBoardSystem: new TaskBoardSystem(),
    EmployeeFsmSystem: new EmployeeFsmSystem(),
    /*
     * The kitchen runs before the service, so a plate that finishes this tick is
     * handed over on the same tick rather than the next. The reverse order costs
     * 50 ms of a customer standing beside their finished food, which is small
     * and is exactly the kind of thing the fixed slot order exists to make a
     * deliberate choice rather than an accident.
     */
    KitchenSystem: new KitchenSystem(),
    ServiceSystem: new ServiceSystem(),
    SatisfactionSystem: new SatisfactionSystem(),
    /*
     * The economy runs *after* satisfaction and payment, in its declared slot.
     * It advances the sixty-second income window, and doing that before the
     * tick's payments were booked would put each payment in the bucket after
     * the one it happened in — invisible in a total, and a systematic one-bucket
     * lag in the rate the player is watching.
     */
    EconomySystem: new EconomySystem(),
  };
  return SYSTEM_ORDER.map((name) => filled[name] ?? NOOP_SYSTEMS[name]);
}

/**
 * The manoeuvre system doubles as the authority on where a vehicle is.
 *
 * `Sim.readView` needs it to project a car that has left its lane, and building
 * a second copy would mean two answers to "where is this car" — the exact class
 * of bug the lane graph's own comment warns about.
 */
/**
 * One flow-field cache, shared like the lane graph and for the same reason: it
 * is a pure function of authored layout until the player builds something, and
 * the benchmark constructs thousands of simulations.
 *
 * Rebuilt from `world.layout.placed` by `NavigationSystem` when that changes,
 * so a shared instance is correct as long as one simulation is being stepped at
 * a time — which is what the whole engine already assumes.
 */
let sharedFields: FlowFieldCache | undefined;

function stage1Fields(): FlowFieldCache {
  sharedFields ??= new FlowFieldCache(STAGE1_LAYOUT);
  return sharedFields;
}

export function stage1ManeuverSystem(): VehicleManeuverSystem {
  /*
   * The manoeuvre curves are built here, once, for the same reason the lane
   * graph is: they are a pure function of authored layout, hold no mutable
   * state, and the benchmark constructs thousands of simulations — flattening
   * them per `Sim` would be tens of thousands of identical polylines.
   */
  sharedManeuverSystem ??= new VehicleManeuverSystem(
    stage1Lanes(),
    new ManeuverTable(STAGE1_LAYOUT, stage1Lanes()),
    STAGE1_LAYOUT,
  );
  return sharedManeuverSystem;
}

let sharedManeuverSystem: VehicleManeuverSystem | undefined;
