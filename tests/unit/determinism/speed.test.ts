import { describe, expect, it } from 'vitest';
import { MAX_CATCHUP_TICKS, MAX_FRAME_DELTA_MS, TICK_MS } from '@config/simulation';
import type { FrameScheduler } from '@app/GameLoop';
import { GameLoop } from '@app/GameLoop';
import { Sim } from '@sim/core/Sim';

/**
 * Determinism, part 2 — the rate at which ticks are delivered cannot change what
 * a tick does.
 *
 * This is what makes a 144 Hz desktop, a 30 Hz laptop on battery, a throttled
 * background tab and a 4x fast-forward all produce the same simulation. It is
 * also why `speedMultiplier` multiplies the tick *count* and never `TICK_MS`:
 * a variable timestep would make the physics depend on the frame rate.
 */

type FrameCallback = (timestampMs: number) => void;

/** A scheduler that never fires; these tests drive `frame()` explicitly. */
const inertScheduler: FrameScheduler = {
  request: () => 0,
  cancel: () => undefined,
};

function runFrames(sim: Sim, frameDeltaMs: number, frames: number): GameLoop {
  const loop = new GameLoop(sim, inertScheduler);
  let now = 0;
  // The first frame only establishes a reference timestamp.
  loop.frame(now);
  for (let i = 0; i < frames; i++) {
    now += frameDeltaMs;
    loop.frame(now);
  }
  return loop;
}

describe('determinism — tick delivery rate', () => {
  it('4000 ticks are 4000 ticks at 20, 5 or 4 frames per simulated second', () => {
    // Frame deltas stay at or below MAX_FRAME_DELTA_MS: past that the loop
    // deliberately discards time rather than replaying it, which is a different
    // property (tested separately below).
    const oneTickPerFrame = new Sim({ seed: 123 });
    runFrames(oneTickPerFrame, TICK_MS, 4000);

    const fourTicksPerFrame = new Sim({ seed: 123 });
    runFrames(fourTicksPerFrame, TICK_MS * 4, 1000);

    const fiveTicksPerFrame = new Sim({ seed: 123 });
    runFrames(fiveTicksPerFrame, MAX_FRAME_DELTA_MS, 800);

    expect(oneTickPerFrame.world.tick).toBe(4000);
    expect(fourTicksPerFrame.world.tick).toBe(4000);
    expect(fiveTicksPerFrame.world.tick).toBe(4000);

    const expected = oneTickPerFrame.world.hash();
    expect(fourTicksPerFrame.world.hash()).toBe(expected);
    expect(fiveTicksPerFrame.world.hash()).toBe(expected);
  });

  it('1x, 2x and 4x reach the same world after the same number of ticks', () => {
    const atSpeed = (mult: 1 | 2 | 4, frames: number): Sim => {
      const sim = new Sim({ seed: 4242 });
      sim.dispatch({ t: 'SET_SPEED', mult });
      sim.tick(); // the command lands here
      runFrames(sim, TICK_MS, frames);
      return sim;
    };

    // Each frame is one TICK_MS of real time, so `mult` ticks run per frame.
    const single = atSpeed(1, 3999);
    const double = atSpeed(2, 1999);
    const quad = atSpeed(4, 999);

    expect(single.world.tick).toBe(4000);
    expect(double.world.tick).toBe(3999);
    expect(quad.world.tick).toBe(3997);

    // Equalise the tick counts, then compare. The multiplier itself is excluded
    // from the digest precisely so this comparison is possible.
    double.advance(1);
    quad.advance(3);

    expect(double.world.hash()).toBe(single.world.hash());
    expect(quad.world.hash()).toBe(single.world.hash());
  });

  it('an irregular, jittery frame pattern reaches the same world', () => {
    // Real frame deltas are never uniform. This is the shape of an actual
    // session: mostly 16.7 ms, with occasional stalls.
    const jittery = new Sim({ seed: 606 });
    const loop = new GameLoop(jittery, inertScheduler);
    let now = 0;
    loop.frame(now);
    const pattern = [16.7, 16.6, 16.7, 33.4, 16.7, 8.3, 50.1, 16.7, 16.6, 120.0];
    while (jittery.world.tick < 2000) {
      for (const delta of pattern) {
        now += delta;
        loop.frame(now);
        if (jittery.world.tick >= 2000) break;
      }
    }

    const reference = new Sim({ seed: 606 });
    reference.advance(jittery.world.tick);

    expect(jittery.world.hash()).toBe(reference.world.hash());
  });

  it('pausing suspends time entirely and resuming continues from the same state', () => {
    const paused = new Sim({ seed: 99 });
    const loop = new GameLoop(paused, inertScheduler);
    let now = 0;
    loop.frame(now);

    for (let i = 0; i < 100; i++) {
      now += TICK_MS;
      loop.frame(now);
    }
    expect(paused.world.tick).toBe(100);

    paused.dispatch({ t: 'SET_PAUSED', paused: true });
    paused.tick(); // 101
    const atPause = paused.world.hash();

    for (let i = 0; i < 500; i++) {
      now += TICK_MS;
      loop.frame(now);
    }
    expect(paused.world.tick).toBe(101);
    expect(paused.world.hash()).toBe(atPause);

    paused.dispatch({ t: 'SET_PAUSED', paused: false });
    paused.tick(); // 102
    now += TICK_MS;
    loop.frame(now);
    expect(paused.world.tick).toBe(103);
  });
});

describe('GameLoop frame accounting', () => {
  it('the first frame only establishes a reference timestamp', () => {
    const sim = new Sim({ seed: 1 });
    const loop = new GameLoop(sim, inertScheduler);
    expect(loop.frame(1000)).toBe(0);
    expect(sim.world.tick).toBe(0);
    expect(loop.stats.frames).toBe(1);
  });

  it('exposes the interpolation alpha for the renderer', () => {
    const sim = new Sim({ seed: 1 });
    const loop = new GameLoop(sim, inertScheduler);
    loop.frame(0);
    loop.frame(TICK_MS * 1.5);
    expect(sim.world.tick).toBe(1);
    expect(loop.interpolationAlpha).toBeCloseTo(0.5, 10);
  });

  it('clamps a huge delta instead of replaying the missing time', () => {
    // A backgrounded tab reports minutes. Replaying them at 20 Hz would freeze
    // the page on return; offline progression handles absence instead (Phase 14).
    const sim = new Sim({ seed: 1 });
    const loop = new GameLoop(sim, inertScheduler);
    loop.frame(0);
    const ticks = loop.frame(10 * 60 * 1000);
    expect(ticks).toBe(MAX_FRAME_DELTA_MS / TICK_MS);
    expect(sim.world.tick).toBe(MAX_FRAME_DELTA_MS / TICK_MS);
  });

  it('ignores a timestamp that moves backwards', () => {
    const sim = new Sim({ seed: 1 });
    const loop = new GameLoop(sim, inertScheduler);
    loop.frame(1000);
    expect(loop.frame(500)).toBe(0);
    expect(sim.world.tick).toBe(0);
  });

  it('at 1x the frame clamp binds before the catch-up ceiling', () => {
    // MAX_FRAME_DELTA_MS / TICK_MS = 5, below the 8-tick ceiling, so a single
    // stalled frame at normal speed is limited by the clamp. Both guards exist;
    // this records which one actually fires, so neither is mistaken for dead code.
    const sim = new Sim({ seed: 1 });
    const loop = new GameLoop(sim, inertScheduler);
    loop.frame(0);
    loop.frame(TICK_MS * 40);

    expect(MAX_FRAME_DELTA_MS / TICK_MS).toBeLessThan(MAX_CATCHUP_TICKS);
    expect(sim.world.tick).toBe(MAX_FRAME_DELTA_MS / TICK_MS);
    expect(loop.stats.droppedTicks).toBe(0);
  });

  it('drops the backlog rather than spiralling when fast-forwarding behind', () => {
    // Behind *and* at 4x is the case the ceiling exists for: five accumulator
    // steps owe twenty ticks, and running all of them would make the frame that
    // was already late four times more expensive.
    const sim = new Sim({ seed: 1 });
    sim.dispatch({ t: 'SET_SPEED', mult: 4 });
    sim.tick();

    const loop = new GameLoop(sim, inertScheduler);
    loop.frame(0);
    loop.frame(TICK_MS * 40);

    expect(sim.world.tick).toBe(1 + MAX_CATCHUP_TICKS);
    expect(loop.stats.droppedTicks).toBe((MAX_FRAME_DELTA_MS / TICK_MS) * 4 - MAX_CATCHUP_TICKS);

    // The next frame starts clean instead of inheriting the backlog.
    const before = sim.world.tick;
    loop.frame(TICK_MS * 40 + TICK_MS);
    expect(sim.world.tick).toBe(before + 4);
  });

  it('start and stop are idempotent and drive the scheduler', () => {
    const sim = new Sim({ seed: 1 });
    let pending: ((timestampMs: number) => void) | null = null;
    let cancels = 0;
    const scheduler: FrameScheduler = {
      request: (callback) => {
        pending = callback;
        return 1;
      },
      cancel: () => {
        cancels++;
      },
    };

    const loop = new GameLoop(sim, scheduler);
    expect(loop.running).toBe(false);
    loop.start();
    loop.start();
    expect(loop.running).toBe(true);

    const fire = (timestampMs: number): void => {
      const callback = pending;
      pending = null;
      if (callback === null) throw new Error('no frame was scheduled');
      callback(timestampMs);
    };

    fire(0);
    fire(TICK_MS);
    expect(sim.world.tick).toBe(1);

    loop.stop();
    loop.stop();
    expect(loop.running).toBe(false);
    expect(cancels).toBe(1);
  });

  it('a frame that arrives after stop does nothing', () => {
    const sim = new Sim({ seed: 1 });
    let pending: ((timestampMs: number) => void) | null = null;
    const scheduler: FrameScheduler = {
      request: (callback) => {
        pending = callback;
        return 1;
      },
      cancel: () => undefined,
    };

    const loop = new GameLoop(sim, scheduler);
    loop.start();
    // Captured before stop(): the scheduler handed us the callback, and a real
    // rAF callback already queued for this frame still fires after cancel().
    const inFlight = pending as FrameCallback | null;
    loop.stop();

    if (inFlight === null) throw new Error('no frame was scheduled');
    inFlight(1000);
    expect(sim.world.tick).toBe(0);
  });
});
