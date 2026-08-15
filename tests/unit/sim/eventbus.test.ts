import { describe, expect, it, vi } from 'vitest';
import { EventBus, EventQueue } from '@sim/core/EventBus';
import type { ReadonlySimEvent, SimEvent } from '@sim/core/events';
import { SIM_EVENT_TYPES } from '@sim/core/events';

function collect(queue: EventQueue): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < queue.size; i++) out.push({ ...queue.at(i) });
  return out;
}

describe('EventQueue', () => {
  it('declares every member of the union in its type list', () => {
    // Guards against adding an event type and forgetting the pool entry, which
    // would show up much later as a silently dropped event.
    expect([...SIM_EVENT_TYPES].sort()).toEqual(
      [
        'DAY_STARTED',
        'PAUSE_CHANGED',
        'SPEED_CHANGED',
        // Phase 5 — traffic.
        'VEHICLE_SPAWNED',
        'VEHICLE_BRAKED',
        'VEHICLE_DESPAWNED',
      ].sort(),
    );
  });

  it('collects events in emission order', () => {
    const queue = new EventQueue();
    queue.emitDayStarted(1);
    queue.emitSpeedChanged(2);
    queue.emitPauseChanged(true);

    expect(collect(queue)).toEqual([
      { t: 'DAY_STARTED', day: 1 },
      { t: 'SPEED_CHANGED', mult: 2 },
      { t: 'PAUSE_CHANGED', paused: true },
    ]);
  });

  it('rejects reads outside the current tick', () => {
    const queue = new EventQueue();
    queue.emitDayStarted(1);
    expect(() => queue.at(1)).toThrow(RangeError);
    expect(() => queue.at(-1)).toThrow(RangeError);
  });

  it('clear empties the queue and returns records to their pools', () => {
    const queue = new EventQueue();
    for (let tick = 0; tick < 200; tick++) {
      queue.emitDayStarted(tick);
      expect(queue.size).toBe(1);
      queue.clear();
      expect(queue.size).toBe(0);
    }
    // 200 emissions through a 64-record pool: without recycling this would have
    // exhausted the pool and started dropping events.
    expect(queue.dropped).toBe(0);
  });

  it('reuses the same record objects rather than allocating per emit', () => {
    const queue = new EventQueue();
    queue.emitDayStarted(1);
    const first = queue.at(0);
    queue.clear();
    queue.emitDayStarted(2);
    expect(queue.at(0)).toBe(first);
    expect(queue.at(0).t).toBe('DAY_STARTED');
  });

  it('counts drops rather than growing when a pool is exhausted within one tick', () => {
    const queue = new EventQueue();
    for (let i = 0; i < 100; i++) queue.emitDayStarted(i);
    expect(queue.size).toBe(64);
    expect(queue.dropped).toBe(36);
  });

  it('counts drops when the queue itself is full', () => {
    // A tiny queue with three event types: the pools (64 each) outlast a
    // 2-slot queue, so this exercises the queue bound specifically.
    const queue = new EventQueue(2);
    queue.emitDayStarted(1);
    queue.emitSpeedChanged(2);
    queue.emitPauseChanged(true);
    expect(queue.size).toBe(2);
    expect(queue.dropped).toBe(1);
  });

  it('reset clears the drop counter as well as the queue', () => {
    const queue = new EventQueue(1);
    queue.emitDayStarted(1);
    queue.emitDayStarted(2);
    expect(queue.dropped).toBe(1);
    queue.reset();
    expect(queue.size).toBe(0);
    expect(queue.dropped).toBe(0);
  });
});

describe('EventBus', () => {
  it('delivers every event to every subscriber, in order', () => {
    const bus = new EventBus();
    const queue = new EventQueue();
    const seenA: string[] = [];
    const seenB: string[] = [];

    bus.subscribe((event) => seenA.push(event.t));
    bus.subscribe((event) => seenB.push(event.t));

    queue.emitDayStarted(1);
    queue.emitSpeedChanged(4);
    bus.flush(queue);

    expect(seenA).toEqual(['DAY_STARTED', 'SPEED_CHANGED']);
    expect(seenB).toEqual(seenA);
  });

  it('empties the queue after flushing', () => {
    const bus = new EventBus();
    const queue = new EventQueue();
    queue.emitDayStarted(1);
    bus.flush(queue);
    expect(queue.size).toBe(0);

    const listener = vi.fn();
    bus.subscribe(listener);
    bus.flush(queue);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribes exactly the listener that asked to be removed', () => {
    const bus = new EventBus();
    const queue = new EventQueue();
    const kept = vi.fn();
    const dropped = vi.fn();

    bus.subscribe(kept);
    const unsubscribe = bus.subscribe(dropped);
    expect(bus.listenerCount).toBe(2);

    unsubscribe();
    expect(bus.listenerCount).toBe(1);

    queue.emitDayStarted(1);
    bus.flush(queue);

    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('tolerates a double unsubscribe', () => {
    const bus = new EventBus();
    const unsubscribe = bus.subscribe(vi.fn());
    unsubscribe();
    unsubscribe();
    expect(bus.listenerCount).toBe(0);
  });

  it('hands subscribers the live pooled record, which they must copy to keep', () => {
    // Documents the pooling contract explicitly, because a subscriber that
    // retains the reference sees the next tick's data appear in "its" event.
    const bus = new EventBus();
    const queue = new EventQueue();
    let retained: ReadonlySimEvent | null = null;
    bus.subscribe((event) => {
      retained = event;
    });

    queue.emitDayStarted(1);
    bus.flush(queue);
    queue.emitDayStarted(2);
    bus.flush(queue);

    expect(retained).not.toBeNull();
    expect((retained as unknown as { day: number }).day).toBe(2);
  });
});
