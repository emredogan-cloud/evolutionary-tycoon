import type { World } from './World';

/**
 * The fixed tick order — TECHNICAL_ARCHITECTURE §5.5.
 *
 * Eighteen slots, reserved from the start and filled in over the following
 * phases. Reserving them now is not ceremony: the order decides, for example,
 * whether a customer who arrives this tick can be served this tick or next, and
 * shuffling systems later silently changes throughput, which invalidates every
 * balance number measured before the change.
 *
 * **Changing this order is an architectural change and requires approval**
 * (WORKING_DISCIPLINE §6). A test asserts the running pipeline still matches
 * this list exactly.
 */
export const SYSTEM_ORDER = [
  'TimeSystem', //             day/hour effects                    → Phase 5
  'EventSystem', //            weather, events, traffic modifiers  → Phase 15
  'TrafficSpawnSystem', //     deterministic Poisson spawn         → Phase 5
  'VehicleMotionSystem', //    IDM car-following                   → Phase 5
  'ConversionSystem', //       P(convert) at the decision point    → Phase 6
  'VehicleManeuverSystem', //  entry/park/drive-thru/exit splines  → Phase 6
  'NavigationSystem', //       flow field + steering               → Phase 7
  'CustomerFsmSystem', //      customer state machines             → Phase 6
  'QueueSystem', //            queues, capacity, spillover         → Phase 8
  'TaskBoardSystem', //        task generation, scoring, assignment→ Phase 10
  'EmployeeFsmSystem', //      employee state machines             → Phase 10
  'KitchenSystem', //          station reservation, prep, pass     → Phase 8
  'ServiceSystem', //          delivery, eating, payment           → Phase 8
  'SatisfactionSystem', //     satisfaction, tips, reputation      → Phase 8
  'EconomySystem', //          income/expense, wage accrual        → Phase 9
  'CleanlinessSystem', //      dirt accumulation and decay         → Phase 11
  'ProgressionSystem', //      objectives, milestones, evolution   → Phase 11
  'EventFlushSystem', //       publish accumulated SimEvents       → Phase 5
] as const;

export type SystemName = (typeof SYSTEM_ORDER)[number];

export interface SimSystem {
  readonly name: SystemName;
  run(world: World, deltaMs: number): void;
}

/**
 * Runs the systems in the declared order, every tick, unconditionally.
 *
 * No conditional skipping and no dynamic reordering: "only run the kitchen when
 * there are orders" saves nothing measurable at these entity counts and makes
 * the tick's behaviour depend on state in a way that is far harder to reason
 * about when a replay diverges.
 */
export class SystemPipeline {
  private readonly systems: readonly SimSystem[];

  constructor(systems: readonly SimSystem[]) {
    if (systems.length !== SYSTEM_ORDER.length) {
      throw new RangeError(
        `SystemPipeline expects exactly ${SYSTEM_ORDER.length} systems, received ${systems.length}`,
      );
    }
    for (let i = 0; i < SYSTEM_ORDER.length; i++) {
      const expected = SYSTEM_ORDER[i];
      const actual = systems[i]?.name;
      if (actual !== expected) {
        throw new RangeError(
          `SystemPipeline slot ${i} must be ${String(expected)}, received ${String(actual)}`,
        );
      }
    }
    this.systems = systems;
  }

  /** Names in execution order — what the order test compares against. */
  get order(): readonly SystemName[] {
    return this.systems.map((system) => system.name);
  }

  run(world: World, deltaMs: number): void {
    // Indexed rather than for-of: this is the innermost per-tick loop and
    // `for-of` allocates an array iterator each pass (WORKING_DISCIPLINE §2.3).
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.systems.length; i++) {
      this.systems[i]?.run(world, deltaMs);
    }
  }
}
