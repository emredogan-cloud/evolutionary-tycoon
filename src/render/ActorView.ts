import type { DepthSortable } from './iso/DepthSorter';

/**
 * One drawable actor, decoupled from the sprite that draws it.
 *
 * The pool hands out these records, the render bridge fills them from the
 * simulation, the depth sorter orders them, and only then does anything touch a
 * Phaser object. Keeping the ordering pass on plain data means it can be
 * unit-tested and benchmarked in Node — the depth-sort budget (260 objects in
 * ≤ 0.15 ms) is measured with no renderer present at all.
 */
export interface ActorView extends DepthSortable {
  entityId: number;
  /** Footprint centre, in world metres. Interpolated between simulation ticks. */
  worldX: number;
  worldY: number;
  worldZ: number;
  /** Index into the render catalogue (`src/config/actors.ts`). */
  kind: number;
  /** Written by the depth sorter. */
  depth: number;
  /** Projected position, refreshed each frame. */
  screenX: number;
  screenY: number;
  /** False for a leased-but-unused slot. */
  active: boolean;
}

function createActorView(): ActorView {
  return {
    entityId: 0,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    kind: 0,
    depth: 0,
    screenX: 0,
    screenY: 0,
    active: false,
  };
}

/**
 * Fixed-capacity pool of actor views.
 *
 * Sized once at construction from the simulation's entity capacity, and never
 * grown. `visible` is the array the sorter and renderer walk; it is truncated by
 * length rather than reallocated, so a busy frame and a quiet one allocate
 * exactly the same amount: nothing.
 */
export class ActorViewPool {
  readonly capacity: number;
  private readonly views: ActorView[];

  /** The live subset, in depth order after `sortByDepth`. */
  readonly visible: ActorView[] = [];

  constructor(capacity: number) {
    if (capacity <= 0) throw new RangeError('ActorViewPool capacity must be positive');
    this.capacity = capacity;
    this.views = new Array<ActorView>(capacity);
    for (let i = 0; i < capacity; i++) this.views[i] = createActorView();
  }

  /**
   * Start a frame: mark everything free and empty the visible list.
   *
   * `length = 0` rather than a new array — the same allocation argument as
   * everywhere else on this path.
   */
  beginFrame(): void {
    this.visible.length = 0;
  }

  /**
   * Take the next view for this frame, or null when the pool is exhausted.
   *
   * Exhaustion drops the actor rather than growing: a dropped sprite is a
   * visible, budgetable outcome, and the capacity is derived from the
   * simulation's own entity ceiling so it cannot happen without the simulation
   * having exceeded its budget first.
   */
  lease(): ActorView | null {
    const index = this.visible.length;
    if (index >= this.capacity) return null;
    const view = this.views[index];
    if (view === undefined) return null;
    view.active = true;
    this.visible.push(view);
    return view;
  }

  get leasedCount(): number {
    return this.visible.length;
  }
}
