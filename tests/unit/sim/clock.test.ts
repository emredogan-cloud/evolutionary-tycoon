import { describe, expect, it } from 'vitest';
import { HOURS_PER_GAME_DAY, MS_PER_GAME_DAY, TICK_MS } from '@config/simulation';
import { Clock } from '@sim/core/Clock';

describe('Clock', () => {
  it('starts at zero', () => {
    const clock = new Clock();
    expect(clock.simTimeMs).toBe(0);
    expect(clock.gameDay).toBe(0);
    expect(clock.gameHour).toBe(0);
  });

  it('accumulates only what it is given', () => {
    const clock = new Clock();
    for (let i = 0; i < 1000; i++) clock.advance(TICK_MS);
    expect(clock.simTimeMs).toBe(1000 * TICK_MS);
  });

  it('reports a day rollover exactly once, on the tick that crosses midnight', () => {
    const clock = new Clock();
    const ticksPerDay = MS_PER_GAME_DAY / TICK_MS;
    expect(Number.isInteger(ticksPerDay)).toBe(true);

    let rollovers = 0;
    let rolloverTick = -1;
    for (let tick = 0; tick < ticksPerDay * 2; tick++) {
      if (clock.advance(TICK_MS)) {
        rollovers++;
        if (rolloverTick < 0) rolloverTick = tick;
      }
    }

    expect(rollovers).toBe(2);
    expect(rolloverTick).toBe(ticksPerDay - 1);
    expect(clock.gameDay).toBe(2);
  });

  it('maps time within a day onto [0, 24)', () => {
    const clock = new Clock();
    clock.advance(MS_PER_GAME_DAY / 4);
    expect(clock.gameHour).toBeCloseTo(HOURS_PER_GAME_DAY / 4, 10);
    expect(clock.gameDay).toBe(0);

    clock.advance(MS_PER_GAME_DAY / 2);
    expect(clock.gameHour).toBeCloseTo((HOURS_PER_GAME_DAY * 3) / 4, 10);
  });

  it('wraps the hour rather than letting it exceed 24', () => {
    const clock = new Clock();
    for (let day = 0; day < 3; day++) {
      clock.advance(MS_PER_GAME_DAY);
      expect(clock.gameHour).toBeCloseTo(0, 10);
      expect(clock.gameDay).toBe(day + 1);
    }
  });

  it('round-trips its state', () => {
    const clock = new Clock();
    clock.advance(123_456);

    const restored = new Clock(clock.saveState());
    expect(restored.simTimeMs).toBe(clock.simTimeMs);
    expect(restored.gameDay).toBe(clock.gameDay);
    expect(restored.gameHour).toBe(clock.gameHour);
  });

  it('setState overwrites, and reset returns to zero', () => {
    const clock = new Clock();
    clock.advance(999);
    clock.setState({ simTimeMs: 5_000 });
    expect(clock.simTimeMs).toBe(5_000);
    clock.reset();
    expect(clock.simTimeMs).toBe(0);
  });

  it('never consults a wall clock', async () => {
    // Structural rather than behavioural: ESLint bans the wall-clock APIs under
    // src/sim, and tests/unit/determinism/forbiddenGlobals proves it for the
    // whole tree. Here we simply confirm two clocks advanced identically agree,
    // which no wall-clock-reading implementation could guarantee.
    const a = new Clock();
    const b = new Clock();
    a.advance(TICK_MS);
    await new Promise((resolve) => setTimeout(resolve, 20));
    b.advance(TICK_MS);
    expect(a.simTimeMs).toBe(b.simTimeMs);
  });
});
