import { MAX_CATCHUP_TICKS, MAX_FRAME_DELTA_MS, TICK_MS } from '@config/simulation';
import type { Sim } from '@sim/core/Sim';

/**
 * Fixed-timestep accumulator loop.
 *
 * The simulation runs at exactly 20 Hz; the renderer runs at whatever the
 * display does. That separation is why a 144 Hz monitor, a 30 Hz laptop on
 * battery and a backgrounded tab all produce the *same* simulation — and it is
 * what makes `interpolationAlpha` necessary, so the renderer can draw the
 * fraction of a tick between two simulation states instead of stuttering.
 *
 * Wall-clock time enters the program here and stops here. `src/sim` never sees a
 * timestamp; it only ever receives `tick()`.
 */

export interface FrameScheduler {
  request(callback: (timestampMs: number) => void): number;
  cancel(handle: number): void;
}

/** requestAnimationFrame, injected rather than referenced, so the loop is testable in Node. */
export function browserScheduler(target: Window): FrameScheduler {
  return {
    request: (callback) => target.requestAnimationFrame(callback),
    cancel: (handle) => {
      target.cancelAnimationFrame(handle);
    },
  };
}

export interface GameLoopStats {
  readonly frames: number;
  readonly ticks: number;
  /**
   * Ticks the loop refused to run because the frame was too far behind.
   *
   * Non-zero means the machine cannot keep up in real time. It is surfaced
   * rather than hidden: dropping simulation time is the correct response to a
   * stall, but silently dropping it makes "the game ran slow" indistinguishable
   * from "the game skipped an hour".
   */
  readonly droppedTicks: number;
}

export class GameLoop {
  private readonly sim: Sim;
  private readonly scheduler: FrameScheduler;

  private accumulator = 0;
  private lastFrameMs: number | null = null;
  private handle: number | null = null;
  private wantRunning = false;
  private alpha = 0;

  private frameCount = 0;
  private tickCount = 0;
  private dropped = 0;

  /** Optional observer for the manual performance pass (`?bench=1`). */
  private frameObserver: ((deltaMs: number) => void) | null = null;

  constructor(sim: Sim, scheduler: FrameScheduler) {
    this.sim = sim;
    this.scheduler = scheduler;
  }

  /**
   * Watch raw frame deltas.
   *
   * Fed from here rather than from a second `requestAnimationFrame` loop: two
   * loops would interleave unpredictably and the meter would be measuring its
   * own scheduling as much as the renderer's.
   */
  observeFrames(observer: ((deltaMs: number) => void) | null): void {
    this.frameObserver = observer;
  }

  get running(): boolean {
    return this.wantRunning;
  }

  /** Position between the last two simulation states, in [0, 1). */
  get interpolationAlpha(): number {
    return this.alpha;
  }

  get stats(): GameLoopStats {
    return { frames: this.frameCount, ticks: this.tickCount, droppedTicks: this.dropped };
  }

  start(): void {
    if (this.wantRunning) return;
    this.wantRunning = true;
    this.scheduleNext();
  }

  stop(): void {
    this.wantRunning = false;
    if (this.handle !== null) {
      this.scheduler.cancel(this.handle);
      this.handle = null;
    }
    // Forget the timestamp: on resume, the gap since the last frame is not
    // simulation time the player experienced.
    this.lastFrameMs = null;
    this.accumulator = 0;
  }

  /**
   * Advance the simulation to match one frame of elapsed wall-clock time.
   *
   * Public and pure with respect to the clock — it takes the timestamp rather
   * than reading one — so the determinism suite can drive it with any frame
   * pattern and compare the results.
   *
   * Returns the number of ticks executed.
   */
  frame(timestampMs: number): number {
    this.frameCount++;

    const previous = this.lastFrameMs;
    this.lastFrameMs = timestampMs;
    if (previous === null) return 0;

    // The unclamped delta: the meter wants what actually happened, including
    // the stalls the simulation deliberately refuses to replay.
    this.frameObserver?.(timestampMs - previous);

    // A backgrounded tab reports a huge delta. Clamping it means returning to
    // the tab does not replay the missed hour at 20 Hz; offline progression
    // handles absence, and it does so with a server time reference (Phase 14).
    const delta = Math.min(Math.max(timestampMs - previous, 0), MAX_FRAME_DELTA_MS);

    if (this.sim.world.control.paused) {
      this.accumulator = 0;
      this.alpha = 0;
      return 0;
    }

    this.accumulator += delta;

    const mult = this.sim.world.control.speedMultiplier;
    let executed = 0;

    // `MAX_CATCHUP_TICKS` bounds ticks, not accumulator steps, so the multiplier
    // is inside the ceiling rather than outside it. At normal frame rates the
    // ceiling never binds; it binds exactly when the machine is behind *and*
    // fast-forwarding, which is the case where an unbounded frame would cost
    // 4x as much as the frame that was already too slow.
    while (this.accumulator >= TICK_MS && executed < MAX_CATCHUP_TICKS) {
      const batch = Math.min(mult, MAX_CATCHUP_TICKS - executed);
      for (let i = 0; i < batch; i++) {
        this.sim.tick();
        executed++;
      }
      // The ticks this step owed but the ceiling refused.
      this.dropped += mult - batch;
      this.accumulator -= TICK_MS;
    }

    // Still behind after hitting the ceiling: discard the backlog instead of
    // carrying it into the next frame, which is what turns a slow frame into a
    // slower one and then into a locked tab (the spiral of death).
    if (this.accumulator >= TICK_MS) {
      this.dropped += Math.floor(this.accumulator / TICK_MS) * mult;
      this.accumulator %= TICK_MS;
    }

    this.tickCount += executed;
    this.alpha = this.accumulator / TICK_MS;
    return executed;
  }

  private scheduleNext(): void {
    this.handle = this.scheduler.request((timestampMs) => {
      this.handle = null;
      if (!this.wantRunning) return;
      this.frame(timestampMs);
      // Re-check through the getter: an event listener woken by this frame may
      // have called stop(), which the narrowing above cannot know about.
      if (this.running) this.scheduleNext();
    });
  }
}
