import { describe, expect, it } from 'vitest';
import { CommandLog } from '@sim/core/CommandLog';
import type { Command } from '@sim/core/commands';
import { apply, stampCommand } from '@sim/core/commands';
import { World } from '@sim/core/World';

function speedCommand(tick: number, mult: 1 | 2 | 4): Command {
  return { t: 'SET_SPEED', tick, mult };
}

describe('CommandLog', () => {
  it('rejects a non-positive capacity', () => {
    expect(() => new CommandLog(0)).toThrow(RangeError);
  });

  it('returns commands in chronological order', () => {
    const log = new CommandLog(10);
    log.append(speedCommand(0, 1));
    log.append(speedCommand(5, 2));
    log.append(speedCommand(9, 4));

    expect(log.size).toBe(3);
    expect(log.totalAppended).toBe(3);
    expect(log.overflowed).toBe(false);
    expect(log.toArray().map((command) => command.tick)).toEqual([0, 5, 9]);
  });

  it('rejects reads outside the retained window', () => {
    const log = new CommandLog(4);
    log.append(speedCommand(0, 1));
    expect(() => log.at(1)).toThrow(RangeError);
    expect(() => log.at(-1)).toThrow(RangeError);
  });

  it('drops the oldest entries once the ring wraps, and says so', () => {
    const log = new CommandLog(3);
    for (let tick = 0; tick < 7; tick++) log.append(speedCommand(tick, 1));

    expect(log.size).toBe(3);
    expect(log.totalAppended).toBe(7);
    expect(log.overflowed).toBe(true);
    // Overflow is surfaced because a replay of a truncated log does not
    // reproduce the world; pretending it does would be the worst bug here.
    expect(log.toArray().map((command) => command.tick)).toEqual([4, 5, 6]);
  });

  it('stays correct across many wraps', () => {
    const log = new CommandLog(5);
    for (let tick = 0; tick < 5000; tick++) log.append(speedCommand(tick, 1));
    expect(log.toArray().map((command) => command.tick)).toEqual([4995, 4996, 4997, 4998, 4999]);
  });

  it('clear empties the ring and resets the counters', () => {
    const log = new CommandLog(3);
    for (let tick = 0; tick < 5; tick++) log.append(speedCommand(tick, 1));
    log.clear();

    expect(log.size).toBe(0);
    expect(log.totalAppended).toBe(0);
    expect(log.overflowed).toBe(false);
    expect(log.toArray()).toEqual([]);

    log.append(speedCommand(99, 2));
    expect(log.at(0).tick).toBe(99);
  });
});

describe('command application', () => {
  it('stamps an input with the tick it lands on', () => {
    expect(stampCommand({ t: 'SET_SPEED', mult: 4 }, 17)).toEqual({
      t: 'SET_SPEED',
      tick: 17,
      mult: 4,
    });
    expect(stampCommand({ t: 'SET_PAUSED', paused: true }, 3)).toEqual({
      t: 'SET_PAUSED',
      tick: 3,
      paused: true,
    });
  });

  it('applies SET_SPEED and announces the change', () => {
    const world = new World({ seed: 1 });
    apply(world, { t: 'SET_SPEED', tick: 0, mult: 4 });

    expect(world.control.speedMultiplier).toBe(4);
    expect(world.stats.commandsApplied).toBe(1);
    expect(world.eventQueue.size).toBe(1);
    expect(world.eventQueue.at(0)).toEqual({ t: 'SPEED_CHANGED', mult: 4 });
  });

  it('applies SET_PAUSED and announces the change', () => {
    const world = new World({ seed: 1 });
    apply(world, { t: 'SET_PAUSED', tick: 0, paused: true });

    expect(world.control.paused).toBe(true);
    expect(world.eventQueue.at(0)).toEqual({ t: 'PAUSE_CHANGED', paused: true });
  });

  it('does not announce a no-op change, but still counts the command', () => {
    // A UI that re-sends the current speed every frame would otherwise flood the
    // bus with events that mean nothing happened.
    const world = new World({ seed: 1 });
    apply(world, { t: 'SET_SPEED', tick: 0, mult: 1 });

    expect(world.eventQueue.size).toBe(0);
    expect(world.stats.commandsApplied).toBe(1);
  });

  it('touches nothing outside the world', () => {
    const world = new World({ seed: 1 });
    const other = new World({ seed: 1 });
    apply(world, { t: 'SET_SPEED', tick: 0, mult: 2 });
    expect(other.control.speedMultiplier).toBe(1);
    expect(other.stats.commandsApplied).toBe(0);
  });

  it('gives the same result for the same (world, command) pair', () => {
    const a = new World({ seed: 5 });
    const b = new World({ seed: 5 });
    const command: Command = { t: 'SET_PAUSED', tick: 0, paused: true };
    apply(a, command);
    apply(b, command);
    expect(a.hash()).toBe(b.hash());
    expect(a.control.paused).toBe(b.control.paused);
  });
});
