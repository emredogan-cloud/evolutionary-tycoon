import { describe, expect, it } from 'vitest';
import type { Command } from '@sim/core/commands';
import { Sim, replay } from '@sim/core/Sim';

/**
 * Determinism, part 1 — the same input produces the same world.
 *
 * This is the property the whole project is built on. Without it there is no
 * headless testing of gameplay, no CI economy validation, no pixel-exact visual
 * regression, no bug report that reproduces from a seed, and no Day Replay
 * feature. If this file goes red, nothing else in the test suite means what it
 * claims to mean.
 */

const LONG_RUN_TICKS = 10_000;

function scriptedCommands(): Command[] {
  return [
    { t: 'SET_SPEED', tick: 100, mult: 2 },
    { t: 'SET_PAUSED', tick: 2500, paused: true },
    { t: 'SET_PAUSED', tick: 2500, paused: false },
    { t: 'SET_SPEED', tick: 6000, mult: 4 },
    { t: 'SET_SPEED', tick: 9999, mult: 1 },
  ];
}

describe('determinism — replay', () => {
  it('the same seed produces the same world after 10 000 ticks', () => {
    const a = new Sim({ seed: 20260814 });
    const b = new Sim({ seed: 20260814 });
    a.advance(LONG_RUN_TICKS);
    b.advance(LONG_RUN_TICKS);

    expect(a.world.tick).toBe(LONG_RUN_TICKS);
    expect(a.world.hash()).toBe(b.world.hash());
  });

  it('the same seed and the same command log produce the same world', () => {
    const commands = scriptedCommands();

    const a = new Sim({ seed: 777 });
    const b = new Sim({ seed: 777 });
    replay(a, commands, LONG_RUN_TICKS);
    replay(b, commands, LONG_RUN_TICKS);

    expect(a.world.hash()).toBe(b.world.hash());
    expect(a.world.stats.commandsApplied).toBe(commands.length);
    expect(b.world.stats.commandsApplied).toBe(commands.length);
  });

  it('a recorded session replays to the same world it produced', () => {
    const live = new Sim({ seed: 31337 });
    live.advance(1000);
    live.dispatch({ t: 'SET_SPEED', mult: 4 });
    live.advance(1000);
    live.dispatch({ t: 'SET_PAUSED', paused: true });
    live.advance(500);
    live.dispatch({ t: 'SET_PAUSED', paused: false });
    live.advance(2500);

    const recorded = live.log.toArray();
    expect(live.log.overflowed).toBe(false);

    const replayed = new Sim({ seed: 31337 });
    replay(replayed, recorded, live.world.tick);

    expect(replayed.world.hash()).toBe(live.world.hash());
  });

  it('a different seed produces a different world', () => {
    const a = new Sim({ seed: 1 });
    const b = new Sim({ seed: 2 });
    a.advance(1000);
    b.advance(1000);
    expect(a.world.hash()).not.toBe(b.world.hash());
  });

  it('a different command log produces a different world', () => {
    const withCommands = new Sim({ seed: 55 });
    const without = new Sim({ seed: 55 });
    replay(withCommands, [{ t: 'SET_SPEED', tick: 10, mult: 4 }], 100);
    replay(without, [], 100);

    // Speed itself is excluded from the digest; `stats.commandsApplied` is the
    // hashed, monotonic evidence that the command actually landed.
    expect(withCommands.world.stats.commandsApplied).toBe(1);
    expect(without.world.stats.commandsApplied).toBe(0);
    expect(withCommands.world.hash()).not.toBe(without.world.hash());
  });

  it('the world hash advances at every tick and never revisits a value', () => {
    // A digest that repeated would silently weaken every other assertion here.
    const sim = new Sim({ seed: 4 });
    const seen = new Set<string>([sim.world.hash()]);
    for (let i = 0; i < 2000; i++) {
      sim.tick();
      const hash = sim.world.hash();
      expect(seen.has(hash)).toBe(false);
      seen.add(hash);
    }
    expect(seen.size).toBe(2001);
  });

  it('runs the same regardless of how the ticks are batched', () => {
    const oneAtATime = new Sim({ seed: 8888 });
    for (let i = 0; i < 3000; i++) oneAtATime.tick();

    const inBatches = new Sim({ seed: 8888 });
    inBatches.advance(1000);
    inBatches.advance(1);
    inBatches.advance(999);
    inBatches.advance(1000);

    expect(inBatches.world.hash()).toBe(oneAtATime.world.hash());
  });

  it('is unaffected by an observer subscribing to events', () => {
    const observed = new Sim({ seed: 606 });
    observed.events.subscribe(() => {
      /* a renderer would draw here */
    });
    observed.advance(5000);

    const unobserved = new Sim({ seed: 606 });
    unobserved.advance(5000);

    expect(observed.world.hash()).toBe(unobserved.world.hash());
  });
});
