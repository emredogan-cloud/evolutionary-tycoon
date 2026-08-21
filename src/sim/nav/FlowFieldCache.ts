import type { StageLayout } from '@config/layouts/stage1';
import type { PlacedObject } from '../core/types';
import { FlowField } from './FlowField';
import { NavGrid } from './NavGrid';

/**
 * One flow field per named goal, rebuilt only when the layout changes.
 *
 * **Only when the layout changes.** That is the entire performance argument: a
 * recompute is a Dijkstra over every cell for every goal, and doing it in the
 * game loop would be absurd — but the layout changes when the player builds
 * something, which is a handful of times a session. RESEARCH_NOTES §8 sizes the
 * memory at about 650 KB for 64×64 cells and 20 goals; Stage 1's grid is
 * smaller than that and its goal list is shorter.
 *
 * ## Goals are named, not positional
 *
 * `counter`, `exit`, `parking_0`… An agent asks for a destination by name, so
 * moving the counter moves every customer's target without touching a single
 * agent. The names come from GAME_EXECUTION_ROADMAP Phase 7; the ones that
 * belong to systems this phase has not built (`kitchen_pass`, `table_<n>`,
 * `dt_window`, `bin_<n>`) are deliberately absent rather than pointed at a
 * placeholder position — a goal that exists and is wrong is worse than one that
 * is missing, because the missing one fails loudly.
 *
 * ## Invalidation
 *
 * `rebuild` is the only way in, and it always rebuilds the grid and queues
 * **every** field. Phase 7's risk table names a missed invalidation as a
 * medium-likelihood failure; the mitigation is that a partial invalidation does
 * not exist to be got wrong.
 *
 * ## Chunked across frames, per goal
 *
 * GAME_EXECUTION_ROADMAP Phase 7: the recompute "must not block a frame — chunk
 * it per goal if necessary", with 12 ms for all twenty goals as the threshold at
 * which it becomes necessary. Measured at that scale it is 9.8 ms on a developer
 * machine and **19.7 ms on a CI runner**, so by the roadmap's own rule it is
 * necessary.
 *
 * `rebuild` therefore queues the work and `step` does one goal at a time. Until a
 * goal's turn comes, agents keep using its previous field: that field routes
 * around every obstacle that existed a moment ago and knows nothing about the
 * one just placed, which for the fraction of a second before it is rebuilt is a
 * bounded and much smaller error than a frame hitch. The first build, at
 * construction, is eager — there is no frame to protect yet and no previous
 * field to fall back on.
 */

export const GOAL_COUNTER = 'counter';
export const GOAL_EXIT = 'exit';

/**
 * The per-bay goal names, built once.
 *
 * `parking_0`, `parking_1`, … — and they are **cached rather than formatted**,
 * because `NavigationSystem.goalFor` asks for one on every tick for every
 * customer walking back to their car. Formatting it there allocated a string per
 * customer per tick: measured at Phase 12, the simulation allocated **48.8 bytes
 * a tick against a 32-byte budget** in a busy world, and roughly half of that
 * was this line. A lazily-grown array of interned strings costs nothing after
 * the first lap of the car park.
 */
const PARKING_GOAL_NAMES: string[] = [];

/** Prefix for the per-bay goals: `parking_0`, `parking_1`, … */
export function parkingGoal(bay: number): string {
  const cached = PARKING_GOAL_NAMES[bay];
  if (cached !== undefined) return cached;

  const name = `parking_${String(bay)}`;
  PARKING_GOAL_NAMES[bay] = name;
  return name;
}

export class FlowFieldCache {
  grid: NavGrid;
  private readonly fields = new Map<string, FlowField>();
  /**
   * Mutable from Phase 11: evolution replaces it.
   *
   * A cache that kept Stage 1's layout after the building grew would route every
   * agent around a world that no longer exists — to bays that were removed and
   * past a counter that moved. `rebuild` takes the new one.
   */
  private layout: StageLayout;
  /** Bumped on every rebuild, so a caller can tell whether its lookup is stale. */
  private generation = 0;
  /** Goals queued for rebuild, oldest first. Drained one per `step`. */
  private readonly pending: { goal: string; x: number; y: number }[] = [];

  constructor(layout: StageLayout) {
    this.layout = layout;
    this.grid = new NavGrid(layout);
    this.rebuild([]);
    // Eagerly at construction: no frame to protect, and no stale field to serve
    // from while the queue drains.
    this.finish();
  }

  get version(): number {
    return this.generation;
  }

  get goalNames(): readonly string[] {
    return [...this.fields.keys()];
  }

  /**
   * Rebuild the grid and every field.
   *
   * The fields are recreated rather than mutated in place: a `FlowField` sizes
   * its buffers from the grid, and a grid that changed shape would leave them
   * inconsistent in a way that shows up as an agent walking off the map.
   */
  rebuild(placed: readonly PlacedObject[], layout?: StageLayout): void {
    if (layout !== undefined && layout !== this.layout) {
      /*
       * A new stage means a new grid, not a rebuilt one: the lot can change
       * size, and `NavGrid` sizes its buffers at construction. Reusing the old
       * one would leave every index pointing at the wrong cell.
       */
      this.layout = layout;
      this.grid = new NavGrid(layout);
    }
    this.grid.rebuild(placed);
    /*
     * The fields are *not* cleared. They are stale, not wrong — each routes
     * around every obstacle that existed before this call — and serving a stale
     * field for a few ticks is a far smaller error than leaving every agent with
     * no route at all while the queue drains.
     */
    this.pending.length = 0;

    const counter = this.layout.counter;
    this.add(GOAL_COUNTER, counter.x, counter.y);

    /*
     * The exit is the mouth of the car park rather than a point on the road:
     * the road is not walkable, so a goal in the middle of it is unreachable
     * from everywhere and the field would be uniformly empty.
     */
    this.add(GOAL_EXIT, this.layout.pullIn.x, this.layout.pullIn.y);

    for (let bay = 0; bay < this.layout.parking.length; bay++) {
      const slot = this.layout.parking[bay];
      if (slot === undefined) continue;
      this.add(parkingGoal(bay), slot.door.x, slot.door.y);
    }

    this.generation++;
  }

  /** True while any goal is still waiting to be rebuilt. */
  get rebuilding(): boolean {
    return this.pending.length > 0;
  }

  /**
   * Rebuild up to `count` queued goals.
   *
   * One per tick is what `NavigationSystem` asks for, which spreads a full
   * recompute over as many ticks as there are goals — one second at twenty
   * goals and 20 Hz. Returns the number actually rebuilt, so a caller can tell
   * a finished queue from an idle one.
   */
  step(count = 1): number {
    let done = 0;
    while (done < count) {
      const next = this.pending.shift();
      if (next === undefined) break;
      this.fields.set(next.goal, new FlowField(this.grid, next.x, next.y));
      done++;
    }
    return done;
  }

  /** Drain the whole queue now. Construction, tests, and the benchmark. */
  finish(): void {
    while (this.pending.length > 0) this.step(this.pending.length);
  }

  /**
   * The field for a goal, or null.
   *
   * Null rather than a throw, because a goal name that a later phase introduces
   * will legitimately be missing until that phase lands — and a steering system
   * that falls back to walking straight at its target is a better failure than
   * one that takes the tick loop down.
   */
  field(goal: string): FlowField | null {
    return this.fields.get(goal) ?? null;
  }

  /**
   * Which way to walk from a world position, towards a goal.
   *
   * Writes into a caller-supplied object; the steering system calls this for
   * every pedestrian every tick and must not allocate. Returns false when there
   * is no route, which is the caller's cue to fall back.
   */
  directionAt(goal: string, worldX: number, worldY: number, out: { x: number; y: number }): boolean {
    const field = this.fields.get(goal);
    if (field === undefined) return false;

    const cx = this.grid.cellXAt(worldX);
    const cy = this.grid.cellYAt(worldY);
    if (!field.reachable(cx, cy)) return false;

    const index = this.grid.index(cx, cy);
    out.x = field.dirX[index] ?? 0;
    out.y = field.dirY[index] ?? 0;
    return out.x !== 0 || out.y !== 0;
  }

  /**
   * Place a goal on the nearest cell an agent can actually stand in.
   *
   * A goal is authored as a world position — the counter, a bay's door — and
   * those positions are frequently *inside* something solid: the counter's own
   * footprint blocks the cell at its centre. Snapping outwards is what makes
   * "walk to the counter" mean "walk to where you can stand and be served"
   * rather than "walk into the counter", which is unreachable and produces an
   * empty field.
   */
  private add(goal: string, worldX: number, worldY: number): void {
    const cx = this.grid.cellXAt(worldX);
    const cy = this.grid.cellYAt(worldY);
    const free = this.nearestFree(cx, cy);
    if (free === null) return;
    // Queued, not built. `step` does the Dijkstra.
    this.pending.push({ goal, x: free.cx, y: free.cy });
  }

  /**
   * Nearest free cell, searched in rings.
   *
   * Ring by ring outwards, and within a ring in a fixed scan order, so the
   * answer depends only on the grid — the same requirement as every other
   * tie-break in the simulation.
   */
  private nearestFree(cx: number, cy: number): { cx: number; cy: number } | null {
    if (!this.grid.isBlocked(cx, cy)) return { cx, cy };

    const limit = Math.max(this.grid.width, this.grid.height);
    for (let radius = 1; radius <= limit; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          // Only the ring itself; the inside was covered by a smaller radius.
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.grid.inBounds(nx, ny)) continue;
          if (this.grid.isBlocked(nx, ny)) continue;
          return { cx: nx, cy: ny };
        }
      }
    }
    return null;
  }
}
