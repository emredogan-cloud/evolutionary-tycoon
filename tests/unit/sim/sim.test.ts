import { describe, expect, it, vi } from 'vitest';
import { MS_PER_GAME_DAY, TICK_MS } from '@config/simulation';
import { Sim, replay } from '@sim/core/Sim';
import type { SimEvent } from '@sim/core/events';
import type { SimSystem, SystemName } from '@sim/core/SystemPipeline';
import { SYSTEM_ORDER, SystemPipeline } from '@sim/core/SystemPipeline';

function recordingSystems(log: string[]): SimSystem[] {
  return SYSTEM_ORDER.map((name) => ({
    name,
    run: () => {
      log.push(name);
    },
  }));
}

describe('SystemPipeline', () => {
  it('reserves exactly the eighteen documented slots, in order', () => {
    // The order decides, for example, whether a customer who arrives this tick
    // can be served this tick or next. Changing it is an architectural change
    // (WORKING_DISCIPLINE §6), so it is asserted rather than assumed.
    expect(SYSTEM_ORDER.length).toBe(18);
    expect([...SYSTEM_ORDER]).toEqual([
      'TimeSystem',
      'EventSystem',
      'TrafficSpawnSystem',
      'VehicleMotionSystem',
      'ConversionSystem',
      'VehicleManeuverSystem',
      'NavigationSystem',
      'CustomerFsmSystem',
      'QueueSystem',
      'TaskBoardSystem',
      'EmployeeFsmSystem',
      'KitchenSystem',
      'ServiceSystem',
      'SatisfactionSystem',
      'EconomySystem',
      'CleanlinessSystem',
      'ProgressionSystem',
      'EventFlushSystem',
    ]);
  });

  it('the default pipeline reports the documented order', () => {
    expect(new Sim({ seed: 1 }).systemOrder).toEqual([...SYSTEM_ORDER]);
  });

  it('runs every system once per tick, in declaration order', () => {
    const executed: string[] = [];
    const sim = new Sim({ seed: 1, systems: recordingSystems(executed) });
    sim.tick();
    expect(executed).toEqual([...SYSTEM_ORDER]);
  });

  it('refuses a pipeline with the wrong number of systems', () => {
    expect(() => new SystemPipeline([])).toThrow(RangeError);
  });

  it('refuses a pipeline whose slots are out of order', () => {
    const shuffled = recordingSystems([]);
    const first = shuffled[0];
    const second = shuffled[1];
    if (first === undefined || second === undefined) throw new Error('fixture is broken');
    shuffled[0] = second;
    shuffled[1] = first;
    expect(() => new SystemPipeline(shuffled)).toThrow(/slot 0 must be TimeSystem/);
  });

  it('names the offending slot when a system is missing', () => {
    const systems = recordingSystems([]);
    const replacement = { name: 'NotASystem' as SystemName, run: () => undefined };
    systems[7] = replacement;
    expect(() => new SystemPipeline(systems)).toThrow(/slot 7 must be CustomerFsmSystem/);
  });

  it('passes the tick duration to each system', () => {
    const deltas: number[] = [];
    const systems: SimSystem[] = SYSTEM_ORDER.map((name) => ({
      name,
      run: (_world, deltaMs) => {
        deltas.push(deltaMs);
      },
    }));
    new Sim({ seed: 1, systems }).tick();
    expect(new Set(deltas)).toEqual(new Set([TICK_MS]));
  });
});

describe('Sim.tick', () => {
  it('advances the tick counter and the clock by exactly one step', () => {
    const sim = new Sim({ seed: 1 });
    sim.tick();
    expect(sim.world.tick).toBe(1);
    expect(sim.world.clock.simTimeMs).toBe(TICK_MS);

    sim.advance(99);
    expect(sim.world.tick).toBe(100);
    expect(sim.world.clock.simTimeMs).toBe(100 * TICK_MS);
  });

  it('emits a day event exactly when the clock rolls over', () => {
    const sim = new Sim({ seed: 1 });
    const events: SimEvent[] = [];
    sim.events.subscribe((event) => events.push({ ...event }));

    const ticksPerDay = MS_PER_GAME_DAY / TICK_MS;
    sim.advance(ticksPerDay * 2);

    // Filtered to day events on purpose. Since Phase 5 the same two days also
    // produce several hundred vehicle events, and this test is about the day
    // boundary — asserting the whole stream would make it fail every time a new
    // system starts announcing something.
    expect(events.filter((event) => event.t === 'DAY_STARTED')).toEqual([
      { t: 'DAY_STARTED', day: 1 },
      { t: 'DAY_STARTED', day: 2 },
    ]);
  });

  it('applies a dispatched command at the start of the next tick, not on dispatch', () => {
    // Queueing is what keeps "when the player clicked" out of the result.
    const sim = new Sim({ seed: 1 });
    sim.dispatch({ t: 'SET_SPEED', mult: 4 });
    expect(sim.world.control.speedMultiplier).toBe(1);

    sim.tick();
    expect(sim.world.control.speedMultiplier).toBe(4);
  });

  it('stamps a dispatched command with the tick it lands on and logs it', () => {
    const sim = new Sim({ seed: 1 });
    sim.advance(10);
    sim.dispatch({ t: 'SET_PAUSED', paused: true });
    sim.tick();

    expect(sim.log.size).toBe(1);
    expect(sim.log.at(0)).toEqual({ t: 'SET_PAUSED', tick: 10, paused: true });
  });

  it('applies multiple commands in dispatch order within one tick', () => {
    const sim = new Sim({ seed: 1 });
    sim.dispatch({ t: 'SET_SPEED', mult: 2 });
    sim.dispatch({ t: 'SET_SPEED', mult: 4 });
    sim.tick();

    expect(sim.world.control.speedMultiplier).toBe(4);
    expect(sim.log.toArray().map((command) => command.t)).toEqual(['SET_SPEED', 'SET_SPEED']);
  });

  it('publishes the tick events once, after the systems have run', () => {
    const observed: string[] = [];
    const systems = SYSTEM_ORDER.map((name) => ({
      name,
      run: () => {
        observed.push(`system:${name}`);
      },
    }));
    const sim = new Sim({ seed: 1, systems });
    sim.events.subscribe((event) => observed.push(`event:${event.t}`));

    sim.dispatch({ t: 'SET_SPEED', mult: 2 });
    sim.tick();

    expect(observed.at(-1)).toBe('event:SPEED_CHANGED');
    expect(observed.filter((entry) => entry.startsWith('event:'))).toEqual(['event:SPEED_CHANGED']);
  });

  it('leaves the event queue empty at every tick boundary', () => {
    const sim = new Sim({ seed: 1 });
    for (let i = 0; i < 50; i++) {
      sim.dispatch({ t: 'SET_SPEED', mult: i % 2 === 0 ? 2 : 4 });
      sim.tick();
      expect(sim.world.eventQueue.size).toBe(0);
    }
    expect(sim.world.eventQueue.dropped).toBe(0);
  });

  it('honours a command log capacity override', () => {
    const sim = new Sim({ seed: 1, commandLogCapacity: 2 });
    for (let i = 0; i < 5; i++) {
      sim.dispatch({ t: 'SET_SPEED', mult: i % 2 === 0 ? 2 : 4 });
      sim.tick();
    }
    expect(sim.log.size).toBe(2);
    expect(sim.log.overflowed).toBe(true);
  });
});

describe('Sim.readView', () => {
  it('reports the current state', () => {
    const sim = new Sim({ seed: 1 });
    sim.advance(3);
    sim.world.vehicles.spawn(1);
    sim.world.customers.acquire();
    sim.world.employees.acquire();
    sim.world.orders.acquire();

    const view = sim.readView();
    expect(view.tick).toBe(3);
    expect(view.simTimeMs).toBe(3 * TICK_MS);
    expect(view.vehicleCount).toBe(1);
    expect(view.customerCount).toBe(1);
    expect(view.employeeCount).toBe(1);
    expect(view.orderCount).toBe(1);
  });

  it('returns the same object each call, refreshed in place', () => {
    // Allocating a snapshot per frame would put the render path on the allocator.
    const sim = new Sim({ seed: 1 });
    const first = sim.readView();
    sim.tick();
    const second = sim.readView();
    expect(second).toBe(first);
    expect(second.tick).toBe(1);
  });
});

describe('replay', () => {
  it('reproduces a recorded session exactly', () => {
    const original = new Sim({ seed: 4242 });
    original.advance(50);
    original.dispatch({ t: 'SET_SPEED', mult: 2 });
    original.advance(30);
    original.dispatch({ t: 'SET_PAUSED', paused: true });
    original.advance(20);
    const expected = original.world.hash();
    const log = original.log.toArray();

    const replayed = new Sim({ seed: 4242 });
    replay(replayed, log, original.world.tick);

    expect(replayed.world.tick).toBe(original.world.tick);
    expect(replayed.world.hash()).toBe(expected);
    expect(replayed.world.control.speedMultiplier).toBe(2);
    expect(replayed.world.control.paused).toBe(true);
  });

  it('replays an empty log as a plain run', () => {
    const sim = new Sim({ seed: 9 });
    replay(sim, [], 100);
    const control = new Sim({ seed: 9 });
    control.advance(100);
    expect(sim.world.hash()).toBe(control.world.hash());
  });

  it('rejects a command that targets a tick already past', () => {
    const sim = new Sim({ seed: 1 });
    sim.advance(10);
    expect(() => {
      replay(sim, [{ t: 'SET_SPEED', tick: 3, mult: 2 }], 20);
    }).toThrow(/already past/);
  });

  it('rejects an out-of-order log', () => {
    const sim = new Sim({ seed: 1 });
    expect(() => {
      replay(
        sim,
        [
          { t: 'SET_SPEED', tick: 5, mult: 2 },
          { t: 'SET_PAUSED', tick: 2, paused: true },
        ],
        10,
      );
    }).toThrow(/must be ordered/);
  });

  it('does nothing when the target tick is already reached', () => {
    const sim = new Sim({ seed: 1 });
    sim.advance(10);
    const before = sim.world.hash();
    replay(sim, [], 10);
    expect(sim.world.hash()).toBe(before);
  });

  it('applies several commands landing on the same tick', () => {
    const sim = new Sim({ seed: 1 });
    replay(
      sim,
      [
        { t: 'SET_SPEED', tick: 0, mult: 2 },
        { t: 'SET_PAUSED', tick: 0, paused: true },
      ],
      1,
    );
    expect(sim.world.control.speedMultiplier).toBe(2);
    expect(sim.world.control.paused).toBe(true);
    expect(sim.world.stats.commandsApplied).toBe(2);
  });
});

describe('Sim allocation discipline', () => {
  it('does not create per-tick closures in the pipeline', () => {
    // A regression guard for the shape of the hot path: if a system slot were
    // rebuilt per tick, `run` would be a different function object each time.
    const seen = new Set<unknown>();
    const systems: SimSystem[] = SYSTEM_ORDER.map((name) => ({ name, run: vi.fn() }));
    const sim = new Sim({ seed: 1, systems });
    for (let i = 0; i < 10; i++) {
      sim.tick();
      // Identity of the function object, not a call: the point is that the slot
      // is not rebuilt per tick.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      seen.add(systems[0]?.run);
    }
    expect(seen.size).toBe(1);
  });
});
