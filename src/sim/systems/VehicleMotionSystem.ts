import { ARCHETYPE_SPECS } from '@config/archetypes';
import { ENTRY_APPROACH_SPEED } from '@config/customer';
import { IDM, MAX_SPEED_METRES_PER_SECOND, STOP_SPEED_EPSILON } from '@config/traffic';
import { idmAcceleration } from '../math/idm';
import { at } from '../math/typedArray';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { LaneGraph } from '../nav/LaneGraph';
import { DECISION_YES } from './ConversionSystem';
import { VEHICLE_ON_ROAD } from './VehicleManeuverSystem';

/**
 * Car following, integration and despawn.
 *
 * Three things happen per tick, in this order, and the order matters:
 *
 *  1. Order the vehicles along each lane, leader first.
 *  2. Compute every vehicle's acceleration against the vehicle ahead of it.
 *  3. Integrate all of them, then despawn whatever has run off the end.
 *
 * Accelerations are computed for the whole lane **before** any position is
 * integrated. Doing it in one pass would mean a follower reacts to where its
 * leader has already moved to this tick, which quietly damps the accordion wave
 * the model exists to produce — vehicles would each see a slightly larger gap
 * than really exists and the jam would dissolve upstream instead of propagating.
 *
 * Allocation-free in steady state: the ordering buffers are sized to the store's
 * capacity once, and nothing else is created per tick.
 */

/*
 * Braking is **not** a stored state. `VehicleStore.state` carries the lifecycle
 * (on the road, entering, parked, exiting) and braking is read from `accel`,
 * which is recomputed every tick anyway. Phase 5 stored both in the same field
 * and Phase 6 needed the field for the lifecycle; keeping a separate braking
 * enum would have meant two sources of truth for one derived fact, and the
 * renderer already reads the derived one through `ActorSnapshot.braking`.
 */

/** The physical floor on deceleration, shared with the follower model. */
const MAX_BRAKE_METRES_PER_SECOND_SQUARED = IDM.maxBrake;

export class VehicleMotionSystem implements SimSystem {
  readonly name = 'VehicleMotionSystem' as const;

  /** Slots per lane, ordered by descending `laneS` — the leader is first. */
  private readonly ordered: Int32Array;
  private readonly laneCounts: Int32Array;
  private readonly laneOffsets: Int32Array;
  /** Write cursor for the bucketing pass. Separate from `laneCounts`, which
   *  `accelerate` still needs afterwards. */
  private readonly laneCursor: Int32Array;
  private readonly capacity: number;

  constructor(
    private readonly lanes: LaneGraph,
    capacity: number,
  ) {
    this.capacity = capacity;
    this.ordered = new Int32Array(capacity);
    this.laneCounts = new Int32Array(lanes.laneCount);
    this.laneOffsets = new Int32Array(lanes.laneCount);
    this.laneCursor = new Int32Array(lanes.laneCount);
  }

  run(world: World, deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (seconds <= 0) return;

    this.orderByLane(world);
    this.accelerate(world);
    this.integrate(world, seconds);
  }

  /**
   * Bucket the active slots by lane, each bucket sorted leader-first.
   *
   * Counting sort into fixed offsets, then insertion sort within each bucket.
   * Insertion sort looks like the wrong choice until you notice that vehicles
   * cannot overtake in Phase 5, so the order is almost always already correct
   * and the sort is O(n) with a tiny constant. It is also stable and
   * deterministic, which a library sort on a shared array would not guarantee
   * across engines.
   */
  private orderByLane(world: World): void {
    const vehicles = world.vehicles;
    const laneCount = this.lanes.laneCount;
    this.laneCounts.fill(0);

    for (let slot = 0; slot < this.capacity; slot++) {
      if (!this.onRoad(vehicles, slot)) continue;
      const lane = at(vehicles.lane, slot);
      if (lane < laneCount) this.laneCounts[lane] = at(this.laneCounts, lane) + 1;
    }

    let offset = 0;
    for (let lane = 0; lane < laneCount; lane++) {
      this.laneOffsets[lane] = offset;
      offset += at(this.laneCounts, lane);
    }

    // Second pass fills each bucket; `cursor` walks the offsets as it goes.
    const cursor = this.laneCursor;
    const starts = this.laneOffsets;
    cursor.fill(0);
    for (let slot = 0; slot < this.capacity; slot++) {
      if (!this.onRoad(vehicles, slot)) continue;
      const lane = at(vehicles.lane, slot);
      if (lane >= laneCount) continue;
      const index = at(starts, lane) + at(cursor, lane);
      this.ordered[index] = slot;
      cursor[lane] = at(cursor, lane) + 1;
    }

    for (let lane = 0; lane < laneCount; lane++) {
      const start = at(starts, lane);
      const count = at(this.laneCounts, lane);
      insertionSortDescending(this.ordered, start, count, vehicles.laneS);
    }
  }

  private accelerate(world: World): void {
    const vehicles = world.vehicles;
    const laneCount = this.lanes.laneCount;

    for (let lane = 0; lane < laneCount; lane++) {
      const start = at(this.laneOffsets, lane);
      const count = at(this.laneCounts, lane);

      for (let i = 0; i < count; i++) {
        const slot = at(this.ordered, start + i);
        const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
        if (spec === undefined) continue;

        const speed = at(vehicles.speed, slot);
        let gap = Number.POSITIVE_INFINITY;
        let leaderSpeed = 0;

        // Index 0 is the leader and has clear road ahead; everyone else follows
        // the vehicle one position closer to the lane exit.
        if (i > 0) {
          const leader = at(this.ordered, start + i - 1);
          const leaderSpec = ARCHETYPE_SPECS[at(vehicles.archetype, leader)];
          gap =
            at(vehicles.laneS, leader) -
            at(vehicles.laneS, slot) -
            (leaderSpec?.lengthMetres ?? spec.lengthMetres);
          leaderSpeed = at(vehicles.speed, leader);
        }

        let accel = idmAcceleration(
          speed,
          at(vehicles.desiredSpeed, slot),
          gap,
          leaderSpeed,
          spec.accelFactor,
        );

        /*
         * A driver who has decided to stop slows for the entrance.
         *
         * Kinematics rather than the follower model, and the difference is not
         * cosmetic. Treating the entrance as a slow *vehicle* was tried first
         * and deadlocked the whole road: IDM keeps a standstill gap, so the car
         * came to rest 2.4 m short of the turn it wanted to take, sat there
         * braking at zero speed forever, and every lane backed up behind it —
         * visible as spawns collapsing from 2 400 to 108 over twenty minutes.
         * An entrance is a point to arrive *at*, not an obstacle to stay clear
         * of, and only one of those two things has a minimum gap.
         *
         * `v² = u² + 2as` solved for the acceleration that turns the current
         * speed into the approach speed over the remaining distance. It is the
         * gentlest braking that still works, so it starts early and eases off —
         * which is what a driver committing to a turn looks like.
         *
         * The traffic behind reacts through the ordinary follower model, which
         * is the reason this lives here rather than in the manoeuvre system: a
         * car slowing to turn in sends an accordion wave back up the queue, and
         * that wave is the visible consequence of the player's stand existing.
         */
        if (at(vehicles.decision, slot) === DECISION_YES && speed > ENTRY_APPROACH_SPEED) {
          const toEntry = this.lanes.lane(lane).entryS - at(vehicles.laneS, slot);
          if (toEntry > 0) {
            const required = (ENTRY_APPROACH_SPEED ** 2 - speed ** 2) / (2 * toEntry);
            const clamped = Math.max(required, -MAX_BRAKE_METRES_PER_SECOND_SQUARED);
            if (clamped < accel) accel = clamped;
          }
        }

        vehicles.accel[slot] = accel;
      }
    }
  }

  /**
   * Live, and still under the traffic model's control.
   *
   * A vehicle mid-manoeuvre is on a Bézier rather than a lane, so it must not be
   * bucketed, followed, integrated or despawned here — including it would have
   * it braking for a leader on a road it has already left.
   */
  private onRoad(vehicles: World['vehicles'], slot: number): boolean {
    return vehicles.isActive(slot) && at(vehicles.state, slot) === VEHICLE_ON_ROAD;
  }

  private integrate(world: World, seconds: number): void {
    const vehicles = world.vehicles;

    for (let slot = 0; slot < this.capacity; slot++) {
      if (!this.onRoad(vehicles, slot)) continue;

      const accel = at(vehicles.accel, slot);
      let speed = at(vehicles.speed, slot) + accel * seconds;

      // A vehicle never reverses. IDM can return a large negative acceleration
      // in a tight gap, and without this clamp a slow vehicle would be pushed
      // backwards through the vehicle behind it.
      if (speed < STOP_SPEED_EPSILON) speed = 0;
      else if (speed > MAX_SPEED_METRES_PER_SECOND) speed = MAX_SPEED_METRES_PER_SECOND;

      vehicles.speed[slot] = speed;
      vehicles.laneS[slot] = at(vehicles.laneS, slot) + speed * seconds;
    }

    // Despawn in a separate pass. Freeing a slot mid-scan would let the store
    // hand it straight back out and the loop would process the same index twice.
    for (let slot = 0; slot < this.capacity; slot++) {
      if (!this.onRoad(vehicles, slot)) continue;

      /*
       * A vehicle on a lane that no longer exists is removed rather than
       * indexed. The ordering pass already skips it, so it would otherwise sit
       * frozen and un-despawnable forever, holding a slot — and `lane()` throws,
       * which took the whole tick loop down with it. Reachable from a save
       * written before a lane was removed, or from a corrupted one.
       */
      const laneIndex = at(vehicles.lane, slot);
      if (laneIndex >= this.lanes.laneCount) {
        world.eventQueue.emitVehicleDespawned(at(vehicles.entityId, slot), laneIndex);
        vehicles.despawn(slot);
        continue;
      }

      const lane = this.lanes.lane(laneIndex);
      if (at(vehicles.laneS, slot) < lane.length) continue;

      world.eventQueue.emitVehicleDespawned(at(vehicles.entityId, slot), lane.index);
      vehicles.despawn(slot);
    }
  }
}

/**
 * Sort `count` slots starting at `start` by descending key.
 *
 * Hand-written rather than `Array.prototype.sort` for two reasons: it works on a
 * shared `Int32Array` window without allocating a subarray, and its comparison
 * order is fixed rather than engine-defined. The determinism suite compares
 * world hashes across V8 and SpiderMonkey, and an unstable sort of equal keys
 * would diverge there and nowhere else.
 */
function insertionSortDescending(order: Int32Array, start: number, count: number, keys: Float32Array): void {
  for (let i = 1; i < count; i++) {
    const slot = at(order, start + i);
    const key = at(keys, slot);
    let j = i - 1;
    while (j >= 0) {
      const other = at(order, start + j);
      const otherKey = at(keys, other);
      // Ties break on slot index so the order is total, not merely consistent.
      if (otherKey > key || (otherKey === key && other < slot)) break;
      order[start + j + 1] = other;
      j--;
    }
    order[start + j + 1] = slot;
  }
}
