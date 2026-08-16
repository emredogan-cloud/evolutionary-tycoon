import { layoutForStage } from '@config/layouts';
import { ARRIVAL_EPSILON_METRES, WALK_SPEED_METRES_PER_SECOND } from '@config/customer';
import { STATE_WALKING_TO_CAR, STATE_WALKING_TO_DOOR } from '../ai/fsm/customerFsm';
import type { SimSystem } from '../core/SystemPipeline';
import type { World } from '../core/World';
import type { FlowFieldCache } from '../nav/FlowFieldCache';
import { GOAL_COUNTER, parkingGoal } from '../nav/FlowFieldCache';
import { arrivalSpeed, blendSteering, MIN_PERSONAL_SPACE_METRES, separationFrom } from '../nav/steering';
import type { SteerOutput } from '../nav/steering';
import type { CustomerRecord } from '../stores/customers';

/**
 * Pedestrian movement — GAME_DESIGN_DOCUMENT §10, layer 3.
 *
 * Phase 6 walked customers in a straight line at their target, which was correct
 * for an empty rectangle and would have started walking people through the
 * counter the moment anything was placed. This replaces the *direction source*
 * with a flow-field lookup and adds separation; the speed, the arrival test and
 * every state around them are untouched, exactly as PHASE_6_REPORT §12 said.
 *
 * ## Which goal, and the fallback
 *
 * A customer's destination follows from their state: the counter while heading
 * in, their own bay's door on the way out. When a flow field has no answer —
 * the goal belongs to a phase that has not landed, or the agent is standing
 * somewhere the field cannot route from — it falls back to walking straight at
 * the target. That is a worse route, not a broken one, and it is strictly better
 * than standing still: an agent that stops because the navigation could not help
 * is a deadlock, and deadlocks are what this phase's risk table is most afraid
 * of.
 *
 * ## Separation is O(n²) and that is fine
 *
 * Sixty pedestrians is 3 600 pair checks per tick, over a store whose scan bound
 * keeps the loop tight. A spatial hash would be faster asymptotically and slower
 * here, and it would be a second structure to keep in step with the positions.
 * `tests/perf` measures the real number rather than assuming either way.
 */
export class NavigationSystem implements SimSystem {
  readonly name = 'NavigationSystem' as const;

  private readonly flow: SteerOutput = { x: 0, y: 0 };
  private readonly push: SteerOutput = { x: 0, y: 0 };
  private readonly step: SteerOutput = { x: 0, y: 0 };
  /** Separate from `step`, so a neighbour's push cannot land in the output. */
  private readonly scratch: SteerOutput = { x: 0, y: 0 };
  /** Layout version the grid was last built against; -1 forces a first build. */
  private builtFor = -1;
  /**
   * Per-agent overlap corrections, accumulated before any is applied.
   *
   * Sized to the customer pool once. Applying each pair's correction as it is
   * found means an agent in a cluster is moved once per neighbour, and the
   * limit that keeps a correction gentler than a walking step stops holding.
   */
  private readonly correctionX: Float64Array;
  private readonly correctionY: Float64Array;

  constructor(
    private readonly fields: FlowFieldCache,
    capacity: number,
  ) {
    this.correctionX = new Float64Array(capacity);
    this.correctionY = new Float64Array(capacity);
  }

  run(world: World, deltaMs: number): void {
    const seconds = deltaMs / 1000;
    if (seconds <= 0) return;

    this.syncLayout(world);

    const customers = world.customers;
    if (customers.activeCount === 0) return;

    for (let slot = 0; slot < customers.scanLimit; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (customer.visible !== 1 || customer.staged === 1) continue;

      this.move(world, customer, slot, seconds);
    }

    this.resolveOverlaps(world);
  }

  /**
   * Push apart anyone who ended the tick inside somebody else.
   *
   * Separation is a *force* and forces can be outvoted. When many agents
   * converge on one point — everyone heading for the counter while the queue is
   * full — the pull towards the target overwhelms it and they stack up. Measured
   * before this pass existed: thirty agents at a crowded entrance closed to
   * **2.2 cm** apart, and 5.5% of all pair-ticks were under 30 cm. A person is
   * 50 cm across, so that is people standing inside each other.
   *
   * A constraint rather than a stronger force, deliberately. Raising the
   * separation weight would have produced the other failure this phase is afraid
   * of — two agents orbiting one another in a doorway, each knocked off course
   * by the other, neither making progress.
   *
   * One pass, not to convergence. A tick moves an agent 6.75 cm, so a single
   * correction is far more than enough to keep up, and iterating to a fixed
   * point would trade a guaranteed cost for a rare one.
   */
  private resolveOverlaps(world: World): void {
    const customers = world.customers;
    const limit = customers.scanLimit;
    if (limit > this.correctionX.length) return;

    this.correctionX.fill(0, 0, limit);
    this.correctionY.fill(0, 0, limit);

    for (let slot = 0; slot < limit; slot++) {
      if (!customers.isActive(slot)) continue;
      const customer = customers.at(slot);
      if (customer.visible !== 1 || customer.staged === 1) continue;

      for (let other = slot + 1; other < limit; other++) {
        if (!customers.isActive(other)) continue;
        const neighbour = customers.at(other);
        if (neighbour.visible !== 1 || neighbour.staged === 1) continue;

        const dx = neighbour.x - customer.x;
        const dy = neighbour.y - customer.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= MIN_PERSONAL_SPACE_METRES) continue;

        /*
         * Exactly co-located: no direction to separate along, so the higher slot
         * steps aside along +x. Arbitrary, fixed, and the same on every engine —
         * an unbroken tie leaves them stacked forever.
         */
        if (distance < 1e-6) {
          this.correctionX[other] = (this.correctionX[other] ?? 0) + MIN_PERSONAL_SPACE_METRES;
          continue;
        }

        const overlap = (MIN_PERSONAL_SPACE_METRES - distance) / 2;
        const nx = dx / distance;
        const ny = dy / distance;
        this.correctionX[slot] = (this.correctionX[slot] ?? 0) - nx * overlap;
        this.correctionY[slot] = (this.correctionY[slot] ?? 0) - ny * overlap;
        this.correctionX[other] = (this.correctionX[other] ?? 0) + nx * overlap;
        this.correctionY[other] = (this.correctionY[other] ?? 0) + ny * overlap;
      }
    }

    /*
     * Accumulated first, applied once per agent.
     *
     * Applying each pair's correction as it is found is not equivalent: an agent
     * in a cluster is corrected against several neighbours in the same tick, so
     * the corrections compound in whatever order the scan happened to visit them
     * and the resulting move is neither bounded nor symmetric.
     *
     * A per-tick cap on the magnitude was tried and removed. It bounded the move
     * and made the separation strictly worse — closest approach fell from 29 cm
     * to 6 cm and the share of too-close pair-ticks more than doubled — while
     * buying no measurable smoothness. The correction is a constraint; capping a
     * constraint just means it is not satisfied.
     */
    for (let slot = 0; slot < limit; slot++) {
      if (!customers.isActive(slot)) continue;
      const dx = this.correctionX[slot] ?? 0;
      const dy = this.correctionY[slot] ?? 0;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude < 1e-9) continue;

      this.nudge(customers.at(slot), dx, dy);
    }
  }

  /**
   * Rebuild the fields when the player has built something.
   *
   * Compared against the layout's own length rather than a dirty flag, because a
   * flag has to be set by whoever mutates the layout and Phase 7's risk table
   * names a missed invalidation as a real failure mode. A length is not a
   * perfect signature — a move that keeps the count would slip past — but Phase
   * 11 is what introduces moving, and it can bring a proper version counter with
   * it. Recorded here rather than assumed away.
   */
  private syncLayout(world: World): void {
    /*
     * `layout.revision`, not `placed.length` — Phase 11.
     *
     * The old signature could not see a **move**: place then remove leaves the
     * count identical and the navigation grid describing a world that no longer
     * exists. PHASE_7_REPORT recorded it as a known weakness owed to this phase.
     * The revision is bumped by every placement, every removal, every move, and
     * by evolution.
     */
    const signature = world.layout.revision;
    if (signature !== this.builtFor) {
      this.fields.rebuild(world.layout.placed, layoutForStage(world.progression.stage));
      this.builtFor = signature;
    }

    /*
     * One goal per tick. A full recompute is 9.8 ms on a developer machine and
     * 19.7 ms on a CI runner at the scale the budget is written for, and the
     * roadmap's rule is that it must not block a frame — so it does not happen
     * in one. Agents keep using the previous field until their goal's turn
     * comes, which routes around everything that existed a moment ago.
     */
    this.fields.step(1);
  }

  /**
   * Move an agent, unless that would put them somewhere they cannot stand.
   *
   * A correction that pushed somebody into the counter or onto the road would
   * fix an overlap by creating a worse problem, and the flow field cannot route
   * them out of a solid cell. Refusing it leaves the overlap for one more tick,
   * which is the lesser failure by a wide margin.
   */
  private nudge(customer: CustomerRecord, dx: number, dy: number): void {
    const grid = this.fields.grid;
    const x = customer.x + dx;
    const y = customer.y + dy;
    if (grid.isBlocked(grid.cellXAt(x), grid.cellYAt(y))) return;
    customer.x = x;
    customer.y = y;
  }

  private move(world: World, customer: CustomerRecord, slot: number, seconds: number): void {
    const dx = customer.targetX - customer.x;
    const dy = customer.targetY - customer.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= ARRIVAL_EPSILON_METRES) return;

    if (!this.flowDirection(customer, distance, dx, dy)) return;
    this.accumulateSeparation(world, customer, slot);

    if (!blendSteering(this.flow.x, this.flow.y, this.push.x, this.push.y, this.step)) return;

    const speed = arrivalSpeed(WALK_SPEED_METRES_PER_SECOND, distance);
    // Never overshoot the target: at 20 Hz a step is 6.75 cm, smaller than the
    // arrival epsilon, but that stops being true at a lower tick rate.
    const travel = Math.min(distance, speed * seconds);

    customer.x += this.step.x * travel;
    customer.y += this.step.y * travel;
    customer.headingX = this.step.x;
    customer.headingY = this.step.y;
  }

  /**
   * The flow field's answer, or a straight line at the target.
   *
   * Close to the target the straight line wins outright, and deliberately: a
   * flow field is quantised to half-metre cells, so within one cell of the goal
   * its direction is the direction of the *cell*, which is not accurate enough
   * to stand on a queue slot. The field gets an agent across the lot; the last
   * metre is a straight line.
   */
  private flowDirection(customer: CustomerRecord, distance: number, dx: number, dy: number): boolean {
    const goal = this.goalFor(customer);
    const straight = distance > 1e-6;

    if (goal !== null && distance > 1.5) {
      if (this.fields.directionAt(goal, customer.x, customer.y, this.flow)) return true;
    }

    if (!straight) return false;
    this.flow.x = dx / distance;
    this.flow.y = dy / distance;
    return true;
  }

  /** Which named goal this customer's state is heading for. */
  private goalFor(customer: CustomerRecord): string | null {
    if (customer.state === STATE_WALKING_TO_DOOR) return GOAL_COUNTER;
    if (customer.state === STATE_WALKING_TO_CAR && customer.parkingSlot >= 0) {
      return parkingGoal(customer.parkingSlot);
    }
    return null;
  }

  /**
   * Sum the push from every neighbour close enough to matter.
   *
   * Two agents at exactly the same point produce no direction to push along, so
   * the tie is broken on slot index — the lower one steps aside. Arbitrary but
   * fixed, which is the requirement: an unbroken tie leaves them stacked
   * forever, and a tie broken differently on two engines diverges the world.
   */
  private accumulateSeparation(world: World, customer: CustomerRecord, slot: number): void {
    this.push.x = 0;
    this.push.y = 0;

    const customers = world.customers;
    const scratch = this.scratch;

    for (let other = 0; other < customers.scanLimit; other++) {
      if (other === slot || !customers.isActive(other)) continue;
      const neighbour = customers.at(other);
      if (neighbour.visible !== 1) continue;

      if (separationFrom(customer.x, customer.y, neighbour.x, neighbour.y, scratch)) {
        this.push.x += scratch.x;
        this.push.y += scratch.y;
        continue;
      }

      // Exactly co-located. The lower slot moves; the higher one holds still,
      // so they separate instead of both stepping the same way.
      if (slot < other && customer.x === neighbour.x && customer.y === neighbour.y) {
        this.push.x += SEPARATION_NUDGE;
      }
    }
  }
}

/** How far apart co-located agents are pushed. Small — it only breaks a tie. */
const SEPARATION_NUDGE = 0.5;
