import { ARCHETYPE_SPECS } from '@config/archetypes';
import { ENTRY_APPROACH_SPEED } from '@config/customer';
import {
  IDM,
  LANE_SHADOW_BAND_METRES,
  LANE_SHADOW_ENABLED,
  LEFT_TURN,
  MAX_SPEED_METRES_PER_SECOND,
  STOP_SPEED_EPSILON,
} from '@config/traffic';
import { idmAcceleration } from '../math/idm';
import { at } from '../math/typedArray';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { LaneGraph, LaneProjection } from '../nav/LaneGraph';
import { DECISION_YES } from './ConversionSystem';
import { environmentSpeedCap } from './EventSystem';
import { LANE_CHANGE, shouldChangeLane, wouldOscillate } from './laneChange';
import { VEHICLE_ENTERING, VEHICLE_EXITING, VEHICLE_ON_ROAD } from './VehicleManeuverSystem';
import { maneuverTableFor } from '../nav/maneuverTables';
import type { LaneSample } from '../nav/spline';

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

/**
 * How much daylight the gap clamp leaves between two cars, in metres.
 *
 * Five centimetres. Clamping to exactly the leader's rear bumper is enough to
 * stop an overlap and leaves them touching, which is both wrong on screen and
 * makes "the gap is always positive" a claim nobody can assert. This is the
 * smallest number that keeps it true.
 */
const BUMPER_GAP_METRES = 0.05;

/**
 * The floor on half a lane shadow's projected footprint, in metres.
 *
 * A body crossing the lane at a right angle projects almost none of its length
 * onto it — but it is still a metre and a half of car standing in the way, and
 * a claim that shrank to nothing there would let a follower drive through the
 * broadside of a turning bus. Half a car's width is the honest minimum: what
 * the lane loses is the vehicle's *width* once its length no longer projects.
 */
const MIN_SHADOW_HALF_EXTENT_METRES = 0.95;

export class VehicleMotionSystem implements SimSystem {
  readonly name = 'VehicleMotionSystem' as const;

  /** Slots per lane, ordered by descending `laneS` — the leader is first. */
  private readonly ordered: Int32Array;
  private readonly laneCounts: Int32Array;
  private readonly laneOffsets: Int32Array;
  /** Write cursor for the bucketing pass. Separate from `laneCounts`, which
   *  `accelerate` still needs afterwards. */
  private readonly laneCursor: Int32Array;

  constructor(
    private readonly lanes: LaneGraph,
    capacity: number,
    /**
     * Whether manoeuvring bodies hold the lane behind them. Defaults to the
     * config decision (`LANE_SHADOW_ENABLED`, currently dark pending the
     * road/lot decision); the lane-shadow suite passes `true` so the
     * mechanism stays proven while it waits.
     */
    private readonly laneShadowEnabled: boolean = LANE_SHADOW_ENABLED,
  ) {
    // Sized to the store's full capacity, but only ever filled up to its scan
    // limit — the buffer has to survive a moment when every slot is live.
    this.ordered = new Int32Array(capacity);
    this.laneCounts = new Int32Array(lanes.laneCount);
    this.laneOffsets = new Int32Array(lanes.laneCount);
    this.laneCursor = new Int32Array(lanes.laneCount);

    /*
     * Discretionary lane changes — Phase 15's decision layer, wired to the
     * road as it actually is. The partner table answers "is there another
     * lane going my way": on the authored two-lane road every entry is -1,
     * so the overtaking branch below is idle by *geometry*, not by flag, and
     * the day a multi-lane road is authored it comes alive with no further
     * wiring. That entanglement (road width ↔ traffic density) is the open
     * user decision PROJECT_MEMORY carries.
     */
    this.laneShadow = new Uint8Array(capacity);
    this.shadowRear = new Float64Array(capacity);

    this.sameHeadingPartner = new Int32Array(lanes.laneCount).fill(-1);
    for (let a = 0; a < lanes.laneCount; a++) {
      for (let b = 0; b < lanes.laneCount; b++) {
        if (a === b) continue;
        if (lanes.lane(a).heading === lanes.lane(b).heading) {
          this.sameHeadingPartner[a] = b;
          break;
        }
      }
    }
  }

  /** Same-direction alternative per lane, or -1. See the constructor note. */
  private readonly sameHeadingPartner: Int32Array;

  /**
   * Slots casting a lane shadow this tick — the correction the 20:34 review
   * captures asked for in as many words ("if one vehicle is parking, vehicles
   * behind it wait, then continue"). A car that has committed to the layby
   * stops being a lane member the tick it starts its curve, but its body is
   * still physically on the carriageway for the first metres of the turn —
   * and followers used to accelerate straight through its rear. A shadowed
   * slot is bucketed into its origin lane at its projected arc position, so
   * the ordinary follower model brakes the queue behind it, and the shadow
   * lifts by itself the moment the body swings clear. Exits cast the same
   * shadow while swinging back in, which protects the merge from the other
   * side. Derived per tick from the manoeuvre sample — no new state, nothing
   * hashed, nothing saved.
   */
  private readonly laneShadow: Uint8Array;
  /**
   * Where each shadow's claim ends upstream, in lane arc length.
   *
   * A shadow's `laneS` is its claim's NOSE, and this is its REAR — and the
   * distance between them is the body's *projected* footprint on the lane,
   * `length·|cos θ|` of the curve tangent against the lane direction (floored
   * at a car's width of presence), not the spec length. An eleven-metre bus
   * crossing the lane at sixty degrees occupies five and a half metres of it;
   * claiming eleven froze cars that were legitimately alongside, and a frozen
   * car inside the claim deadlocked the merge behind it permanently. The
   * projection converges to the full length exactly as the body aligns to
   * merge, which is the moment the claim becomes a real car.
   */
  private readonly shadowRear: Float64Array;
  private readonly shadowSample: LaneSample = { x: 0, y: 0, tangentX: 0, tangentY: 0 };
  private readonly shadowProjection: LaneProjection = { along: 0, lateral: 0 };

  run(world: World, deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (seconds <= 0) return;

    this.orderByLane(world);
    this.accelerate(world, environmentSpeedCap(world), seconds);
    this.considerLaneChanges(world);
    this.integrate(world, seconds);
  }

  /**
   * One gap-acceptance decision per frustrated follower, per tick.
   *
   * The scan re-uses the ordering pass's buckets, so finding the target
   * lane's neighbouring pair is a walk over already-sorted slots. A change
   * moves the vehicle sideways at its own arc position — partner lanes are
   * parallel by construction, so `laneS` carries over.
   */
  private considerLaneChanges(world: World): void {
    const vehicles = world.vehicles;
    for (let lane = 0; lane < this.lanes.laneCount; lane++) {
      const target = at(this.sameHeadingPartner, lane);
      if (target < 0) continue; // today's road, every time

      const start = at(this.laneOffsets, lane);
      const count = at(this.laneCounts, lane);
      for (let i = 1; i < count; i++) {
        const slot = at(this.ordered, start + i);
        // A shadow neither changes lanes nor follows anyone.
        if (at(this.laneShadow, slot) === 1) continue;
        const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
        if (spec === undefined) continue;
        const leader = at(this.ordered, start + i - 1);

        const s = at(vehicles.laneS, slot);
        const currentLeadGap = this.rearOf(vehicles, leader) - s;

        const context = {
          speed: at(vehicles.speed, slot),
          desiredSpeed: at(vehicles.desiredSpeed, slot),
          currentLeadGap,
          ...this.targetGaps(world, target, s, spec.lengthMetres),
        };
        if (!shouldChangeLane(context)) continue;

        // The mirror question, so a symmetric pair cannot ping-pong.
        const reverse = {
          speed: at(vehicles.speed, slot),
          desiredSpeed: at(vehicles.desiredSpeed, slot),
          currentLeadGap: context.targetLeadGap,
          targetLeadGap: currentLeadGap,
          targetLagGap: LANE_CHANGE.minLagGapMetres + 1,
          targetLeadSpeed: at(vehicles.speed, leader),
          targetLagSpeed: 0,
        };
        if (wouldOscillate(context, reverse)) continue;

        vehicles.lane[slot] = target;
      }
    }
  }

  /** Lead/lag gaps and speeds around arc position `s` on `lane`. */
  private targetGaps(
    world: World,
    lane: number,
    s: number,
    ownLength: number,
  ): {
    targetLeadGap: number;
    targetLagGap: number;
    targetLeadSpeed: number;
    targetLagSpeed: number;
  } {
    const vehicles = world.vehicles;
    const start = at(this.laneOffsets, lane);
    const count = at(this.laneCounts, lane);
    let leadGap = Number.POSITIVE_INFINITY;
    let lagGap = Number.POSITIVE_INFINITY;
    let leadSpeed = MAX_SPEED_METRES_PER_SECOND;
    let lagSpeed = 0;
    for (let i = 0; i < count; i++) {
      const slot = at(this.ordered, start + i);
      const other = at(vehicles.laneS, slot);
      if (other >= s) {
        const gap = this.rearOf(vehicles, slot) - s;
        if (gap < leadGap) {
          leadGap = gap;
          leadSpeed = at(vehicles.speed, slot);
        }
      } else {
        const gap = s - other - ownLength;
        if (gap < lagGap) {
          lagGap = gap;
          lagSpeed = at(vehicles.speed, slot);
        }
      }
    }
    return {
      targetLeadGap: leadGap,
      targetLagGap: lagGap,
      targetLeadSpeed: leadSpeed,
      targetLagSpeed: lagSpeed,
    };
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
    this.markLaneShadows(world);

    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!this.onRoad(vehicles, slot) && at(this.laneShadow, slot) === 0) continue;
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
    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!this.onRoad(vehicles, slot) && at(this.laneShadow, slot) === 0) continue;
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

  /**
   * Mark manoeuvring vehicles whose bodies still occupy their lane's airspace,
   * and pin their `laneS` to the body's projected arc position so the
   * ordering pass buckets them like any other leader. Writing `laneS` is safe
   * precisely because a manoeuvring vehicle's own movement never reads it —
   * `maneuverS` along the curve is its position — and the handover back to
   * the road overwrites it (entry never returns to this lane; exit sets
   * `rejoinS` explicitly).
   */
  private markLaneShadows(world: World): void {
    const vehicles = world.vehicles;
    this.laneShadow.fill(0);
    if (!this.laneShadowEnabled) return;
    const table = maneuverTableFor(world.progression.stage);

    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!vehicles.isActive(slot)) continue;
      const state = at(vehicles.state, slot);
      if (state !== VEHICLE_ENTERING && state !== VEHICLE_EXITING) continue;
      const lane = at(vehicles.lane, slot);
      if (lane >= this.lanes.laneCount) continue;

      const set = table.setFor(lane, at(vehicles.parkingSlot, slot));
      const maneuver = state === VEHICLE_ENTERING ? set.entry : set.exit;
      maneuver.path.sample(at(vehicles.maneuverS, slot), this.shadowSample);

      /*
       * Perpendicular distance to the lane line. Within the band, the body is
       * in a follower's path; beyond it, the turn has carried the metal clear.
       * The same constant draws the exit hold line (`ManeuverSet.exitHoldS`),
       * so a car waiting for its merge gap stands exactly one setback outside
       * the region that would shadow the lane.
       */
      this.lanes.project(lane, this.shadowSample.x, this.shadowSample.y, this.shadowProjection);
      const center = this.shadowProjection.along;
      const lateral = this.shadowProjection.lateral;
      if (lateral > LANE_SHADOW_BAND_METRES) continue;

      /*
       * The claim: the body's projected footprint, nose ratcheted.
       *
       * Footprint first — `length·|cos θ|`, floored at a car's width of
       * presence. Then the ratchet: the entry is a parallel-parking sweep,
       * past the mouth and back across the bay line, so the raw projection
       * RECEDES up to eight metres mid-turn, and a claim following it would
       * march a "leader" backwards through the queue standing behind it
       * (instant negative gaps — 175 spawns where 300 are expected, first
       * full-suite run of this pass). A driver holds at the mouth of a turn
       * someone is making across their nose; they do not reverse to follow
       * the swinging tail. So the nose starts at the body's departure point
       * (the slot's stale `laneS`), may only creep forward, and the claim
       * lifts when the body clears the band. The rear tracks the live
       * footprint, so the claim releases road as the body genuinely leaves
       * it, and a car that ends up alongside the metal escapes forwards —
       * the follower passes read `shadowRear`, never the spec length.
       */
      const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
      const cos = Math.abs(
        this.lanes.projectDirection(lane, this.shadowSample.tangentX, this.shadowSample.tangentY),
      );
      const halfExtent = Math.max(MIN_SHADOW_HALF_EXTENT_METRES, ((spec?.lengthMetres ?? 4.5) / 2) * cos);
      const nose = Math.max(at(vehicles.laneS, slot), center + halfExtent);

      this.laneShadow[slot] = 1;
      vehicles.laneS[slot] = nose;
      this.shadowRear[slot] = nose - 2 * halfExtent;
    }
  }

  /**
   * Where a leader's body ends, honestly: the projected claim for a shadow,
   * the spec length behind the nose for a real car.
   */
  private rearOf(vehicles: World['vehicles'], slot: number): number {
    if (at(this.laneShadow, slot) === 1) return at(this.shadowRear, slot);
    const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
    return at(vehicles.laneS, slot) - (spec?.lengthMetres ?? 4.5);
  }

  private accelerate(world: World, speedCap: number, seconds: number): void {
    const vehicles = world.vehicles;
    const laneCount = this.lanes.laneCount;

    for (let lane = 0; lane < laneCount; lane++) {
      const start = at(this.laneOffsets, lane);
      const count = at(this.laneCounts, lane);

      for (let i = 0; i < count; i++) {
        const slot = at(this.ordered, start + i);
        // Shadows are obstacles here, not drivers: they lead, they are
        // followed, and nothing this pass computes may steer them.
        if (at(this.laneShadow, slot) === 1) continue;
        const spec = ARCHETYPE_SPECS[at(vehicles.archetype, slot)];
        if (spec === undefined) continue;

        const speed = at(vehicles.speed, slot);
        let gap = Number.POSITIVE_INFINITY;
        let leaderSpeed = 0;

        // Index 0 is the leader and has clear road ahead; everyone else follows
        // the vehicle one position closer to the lane exit.
        if (i > 0) {
          const leader = at(this.ordered, start + i - 1);
          gap = this.rearOf(vehicles, leader) - at(vehicles.laneS, slot);
          leaderSpeed = at(vehicles.speed, leader);
        }

        /*
         * Phase 15: road work and accidents cap everyone's *desired* speed —
         * §9.6's congestion is the follower model slowing down, not a script.
         * Scaling desire keeps the IDM smooth; clamping actual speed would
         * read as every car hitting a wall at the cordon.
         */
        let accel = idmAcceleration(
          speed,
          at(vehicles.desiredSpeed, slot) * speedCap,
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
        /*
         * `stillTurningIn`, not `decision` alone — the pin must not outlive
         * the handover it exists for.
         *
         * Slowing for the entrance, and above all the crossing standstill,
         * are both preparation for one act: handing a customer over to the
         * car park. `VehicleManeuverSystem.considerHandover` performs that act
         * and gives up immediately when the customer is gone — so a car that
         * has lost its customer but still carries DECISION_YES was being
         * braked to a halt at a mouth it would never turn into, by a system
         * that could not know the turn was off. At Stage 4 that car sat at
         * the head of its lane at exactly zero for the rest of the run, and
         * everything behind it queued forever: measured, a departing car
         * eighteen minutes into its wait, against a patience window of eight
         * seconds. The two systems now read the same precondition, which is
         * the only way they cannot disagree about whether a turn is still
         * happening.
         */
        const customerSlot = at(vehicles.customerSlot, slot);
        const stillTurningIn =
          at(vehicles.decision, slot) === DECISION_YES &&
          customerSlot >= 0 &&
          world.customers.isActive(customerSlot);

        if (stillTurningIn) {
          const laneRecord = this.lanes.lane(lane);
          /*
           * Phase 15: a far-lane driver stops AT the mouth and waits for their
           * gap (the manoeuvre system holds them until it opens); a near-lane
           * driver only slows to the approach speed and turns straight in, as
           * before. Same kinematics, different target speed.
           */
          const crossingHold =
            laneRecord.crossesOnEntry && world.progression.stage >= LEFT_TURN.earlyMinStage;
          const targetSpeed = crossingHold ? 0 : ENTRY_APPROACH_SPEED;
          const toEntry = laneRecord.entryS - at(vehicles.laneS, slot);
          if (toEntry > 0 && speed > targetSpeed) {
            const required = (targetSpeed ** 2 - speed ** 2) / (2 * toEntry);
            const clamped = Math.max(required, -MAX_BRAKE_METRES_PER_SECOND_SQUARED);
            if (clamped < accel) accel = clamped;
          } else if (toEntry <= 0 && crossingHold) {
            // At or past the mouth and still on the road: held for a gap.
            // Pinned to a standstill so the queue forms behind, which is the
            // congestion the design wants — and which clears when they turn.
            accel = Math.max(-MAX_BRAKE_METRES_PER_SECOND_SQUARED, -speed / seconds);
          }
        }

        vehicles.accel[slot] = accel;
      }
    }
  }

  /**
   * Stop a follower ending the tick inside its leader.
   *
   * The follower model keeps a positive gap by making the acceleration sharply
   * negative as the gap closes, and that is *almost* enough: over a simulated
   * hour a follower closing on a car braking for the entrance overshot by 4 cm,
   * because a tick is a finite step and the braking it computed was applied over
   * the whole of it.
   *
   * Four centimetres on a 4.5 m car is invisible, and "vehicles never overlap"
   * being *almost* true is the wrong kind of almost — it is a property the
   * renderer, the spawn headway and every future overtaking rule all assume. So
   * it is enforced rather than approximated: a follower is clamped to its
   * leader's rear bumper, and its speed drops to the leader's, which is what
   * physically happened.
   *
   * The pass walks each lane leader-first, so a clamp propagates backwards
   * through a queue in the same tick rather than one car per tick.
   */
  private enforceGaps(world: World, seconds: number): void {
    const vehicles = world.vehicles;
    const laneCount = this.lanes.laneCount;

    for (let lane = 0; lane < laneCount; lane++) {
      const start = at(this.laneOffsets, lane);
      const count = at(this.laneCounts, lane);

      for (let i = 1; i < count; i++) {
        const leader = at(this.ordered, start + i - 1);
        const slot = at(this.ordered, start + i);
        // A shadow can lead (followers clamp behind the turning body) but is
        // never itself clamped — the curve owns its position.
        if (!this.onRoad(vehicles, slot) && at(this.laneShadow, slot) === 0) continue;
        if (at(this.laneShadow, slot) === 1) continue;
        if (!this.onRoad(vehicles, leader) && at(this.laneShadow, leader) === 0) continue;

        const limit = this.rearOf(vehicles, leader) - BUMPER_GAP_METRES;
        if (at(vehicles.laneS, slot) <= limit) continue;

        /*
         * The clamp may cancel this tick's advance, never more. It exists to
         * take back a forward overshoot; writing anything earlier than where
         * the car already stood teleports it backwards — measured with a lane
         * shadow materialising over a car that had legitimately passed the
         * merge point: the raw clamp threw it 1.67 m back through the queue.
         * A car that finds a turning body over its nose simply stops where it
         * is; the body sweeps on and the ordering resolves next tick.
         */
        const preTick = at(vehicles.laneS, slot) - at(vehicles.speed, slot) * seconds;
        if (limit <= preTick) {
          vehicles.laneS[slot] = preTick;
          vehicles.speed[slot] = 0;
          continue;
        }

        vehicles.laneS[slot] = limit;
        const leaderSpeed = at(vehicles.speed, leader);
        if (at(vehicles.speed, slot) > leaderSpeed) vehicles.speed[slot] = leaderSpeed;
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

    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
      if (!this.onRoad(vehicles, slot)) continue;

      const accel = at(vehicles.accel, slot);
      let speed = at(vehicles.speed, slot) + accel * seconds;

      /*
       * A vehicle never reverses. IDM can return a large negative acceleration
       * in a tight gap, and without this clamp a slow vehicle would be pushed
       * backwards through the vehicle behind it.
       *
       * `accel <= 0` guards the epsilon, and it is not a refinement — without
       * it a stopped car can never start. IDM's free-road acceleration is
       * about 0.9 m/s² and a tick is 50 ms, so the first tick out of a
       * standstill produces 0.045 m/s, which is *under* the epsilon and gets
       * rounded straight back to zero — every tick, forever. The road was
       * dying outright: a single car alone on an empty lane, accelerating at
       * +0.9, frozen at s = 6.2 for the rest of the run, with the spawn
       * headway behind it keeping the lane empty for good (measured: 1 158
       * arrivals where 10 000 are expected, from tick 39 904 on). It stayed
       * latent while nothing ever came to a complete stop on an open road;
       * holding traffic for a manoeuvre made full stops ordinary. The
       * epsilon's job is to stop a car that is slowing down, not to veto one
       * that is pulling away.
       */
      if (speed < STOP_SPEED_EPSILON && accel <= 0) speed = 0;
      else if (speed > MAX_SPEED_METRES_PER_SECOND) speed = MAX_SPEED_METRES_PER_SECOND;

      vehicles.speed[slot] = speed;
      vehicles.laneS[slot] = at(vehicles.laneS, slot) + speed * seconds;
    }

    this.enforceGaps(world, seconds);

    // Despawn in a separate pass. Freeing a slot mid-scan would let the store
    // hand it straight back out and the loop would process the same index twice.
    for (let slot = 0; slot < vehicles.scanLimit; slot++) {
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
