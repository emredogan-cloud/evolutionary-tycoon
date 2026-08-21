import { describe, expect, it } from 'vitest';
import { EVENT_DRAWS_PER_TYPE, EVENT_SPECS, MAX_EVENT_TRAFFIC_FACTOR } from '@config/events';
import { MS_PER_GAME_DAY, TICK_MS } from '@config/simulation';
import { WEATHER_SEGMENTS_PER_DAY } from '@config/weather';
import { WEATHER_STATES } from '@config/weather';
import { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import {
  activeEventSlot,
  currentWeather,
  environmentConversionFactor,
  environmentSpeedCap,
  environmentTrafficFactor,
  invalidateEnvironmentCache,
  planDay,
} from '@sim/systems/EventSystem';

/**
 * These fixtures edit the schedule and the clock *between* helper reads on
 * one un-ticked world, which the per-tick derivation cache (its own comment)
 * legitimately memoises past. Re-reading after a mutation therefore starts
 * with an invalidate — the game never mutates mid-tick, tests do.
 */
function reread(world: Sim['world']): void {
  invalidateEnvironmentCache(world);
}

/**
 * The deterministic calendar — Phase 15's central promise: same seed, same
 * day, same events, same weather. Everything else (what the multipliers do)
 * stands on this.
 */

const TICKS_PER_DAY = MS_PER_GAME_DAY / TICK_MS;

function calendarOf(sim: Sim): string {
  const env = sim.world.environment;
  return JSON.stringify({
    day: env.plannedDay,
    weather: [...env.weatherSegments],
    types: [...env.eventTypes],
    starts: [...env.eventStartMs],
    ends: [...env.eventEndMs],
  });
}

describe('the calendar', () => {
  it('same seed, same day → the same calendar, however it is reached', () => {
    const straight = new Sim({ seed: 909 });
    straight.advance(TICKS_PER_DAY + 10);

    const stepped = new Sim({ seed: 909 });
    for (let i = 0; i < TICKS_PER_DAY + 10; i++) stepped.tick();

    expect(calendarOf(stepped)).toBe(calendarOf(straight));
    expect(stepped.world.environment.plannedDay).toBe(1);
  });

  it('different seeds give different days', () => {
    const a = new Sim({ seed: 1 });
    const b = new Sim({ seed: 2 });
    a.tick();
    b.tick();
    expect(calendarOf(a)).not.toBe(calendarOf(b));
  });

  it('planning consumes a fixed number of draws, occur or not', () => {
    /*
     * The whole determinism argument in one assertion: after planning, the
     * events stream has advanced by exactly 2×segments + 3×types draws,
     * regardless of what was drawn. If a skipped event ever stops consuming
     * its three, every later day shifts.
     */
    const a = new Sim({ seed: 31 });
    const b = new Sim({ seed: 31 });
    planDay(a.world, 0);
    // The same total, spent by hand: two per weather segment, then each event
    // type's fixed three — this is EVENT_DRAWS_PER_TYPE being load-bearing.
    for (let i = 0; i < WEATHER_SEGMENTS_PER_DAY * 2; i++) b.world.rng.events.next();
    for (let i = 0; i < EVENT_SPECS.length * EVENT_DRAWS_PER_TYPE; i++) b.world.rng.events.next();
    expect(a.world.rng.events.next()).toBe(b.world.rng.events.next());
  });

  it('an event window opens, reigns and closes on schedule', () => {
    const sim = new Sim({ seed: 5 });
    planDay(sim.world, 0);
    const env = sim.world.environment;
    // Author a deterministic schedule directly — the drawing is proven above;
    // this test is about the derivation.
    env.eventTypes.fill(-1);
    env.eventTypes[0] = 0; // ROAD_WORK
    env.eventStartMs[0] = 100_000;
    env.eventEndMs[0] = 200_000;
    sim.world.progression.stage = 4;

    sim.world.clock.setState({ simTimeMs: 50_000 });
    reread(sim.world);
    expect(activeEventSlot(sim.world)).toBe(-1);
    sim.world.clock.setState({ simTimeMs: 150_000 });
    reread(sim.world);
    expect(activeEventSlot(sim.world)).toBe(0);
    expect(environmentSpeedCap(sim.world)).toBe(EVENT_SPECS[0]?.speedCapFactor);
    expect(environmentTrafficFactor(sim.world)).toBeLessThan(1);
    sim.world.clock.setState({ simTimeMs: 200_000 });
    reread(sim.world);
    expect(activeEventSlot(sim.world)).toBe(-1);
  });

  it('events respect the stage gate — GDD §9.6 scopes them to Stage 4', () => {
    const sim = new Sim({ seed: 5 });
    planDay(sim.world, 0);
    const env = sim.world.environment;
    env.eventTypes.fill(-1);
    env.eventTypes[2] = 2; // FESTIVAL
    env.eventStartMs[2] = 0;
    env.eventEndMs[2] = MS_PER_GAME_DAY;
    sim.world.clock.setState({ simTimeMs: 1000 });

    sim.world.progression.stage = 1;
    reread(sim.world);
    expect(activeEventSlot(sim.world)).toBe(-1);
    sim.world.progression.stage = 4;
    reread(sim.world);
    expect(activeEventSlot(sim.world)).toBe(2);
    expect(environmentTrafficFactor(sim.world)).toBeGreaterThan(1);
  });

  it('overlapping windows resolve to the earliest start, deterministically', () => {
    const sim = new Sim({ seed: 5 });
    planDay(sim.world, 0);
    const env = sim.world.environment;
    env.eventTypes.fill(-1);
    env.eventTypes[0] = 0;
    env.eventStartMs[0] = 100_000;
    env.eventEndMs[0] = 400_000;
    env.eventTypes[1] = 1;
    env.eventStartMs[1] = 50_000;
    env.eventEndMs[1] = 300_000;
    sim.world.progression.stage = 4;
    sim.world.clock.setState({ simTimeMs: 200_000 });
    reread(sim.world);
    expect(activeEventSlot(sim.world)).toBe(1);
  });

  it('no event spec can outrun the spawn envelope', () => {
    // Thinning stays a probability only while the widened candidate rate
    // covers every boost an event can apply. Asserted against config, so a
    // bigger festival arrives with the envelope it needs.
    for (const spec of EVENT_SPECS) {
      expect(spec.trafficFactor, spec.id).toBeLessThanOrEqual(MAX_EVENT_TRAFFIC_FACTOR);
    }
  });

  it('a weather front forces its weather while it reigns', () => {
    const sim = new Sim({ seed: 5 });
    planDay(sim.world, 0);
    const env = sim.world.environment;
    env.weatherSegments.fill(0); // clear all day by plan
    env.eventTypes.fill(-1);
    const front = EVENT_SPECS.findIndex((spec) => spec.forcesWeather >= 0);
    expect(front).toBeGreaterThanOrEqual(0);
    env.eventTypes[front] = front;
    env.eventStartMs[front] = 100_000;
    env.eventEndMs[front] = 200_000;
    sim.world.progression.stage = 4;

    sim.world.clock.setState({ simTimeMs: 50_000 });
    reread(sim.world);
    expect(currentWeather(sim.world)).toBe(0);
    sim.world.clock.setState({ simTimeMs: 150_000 });
    reread(sim.world);
    expect(currentWeather(sim.world)).toBe(EVENT_SPECS[front]?.forcesWeather);
  });

  it('announces starts, ends and weather changes exactly once each', () => {
    const sim = new Sim({ seed: 5 });
    const seen: string[] = [];
    sim.events.subscribe((event) => {
      if (
        event.t === 'ROAD_EVENT_STARTED' ||
        event.t === 'ROAD_EVENT_ENDED' ||
        event.t === 'WEATHER_CHANGED'
      ) {
        seen.push(event.t);
      }
    });
    sim.tick(); // plans the day, announces the opening weather
    const env = sim.world.environment;
    env.eventTypes.fill(-1);
    env.eventTypes[0] = 0;
    env.eventStartMs[0] = sim.world.clock.simTimeMs + TICK_MS;
    env.eventEndMs[0] = sim.world.clock.simTimeMs + TICK_MS * 4;
    sim.world.progression.stage = 4;
    sim.advance(8);

    expect(seen.filter((t) => t === 'WEATHER_CHANGED').length).toBe(1);
    expect(seen.filter((t) => t === 'ROAD_EVENT_STARTED').length).toBe(1);
    expect(seen.filter((t) => t === 'ROAD_EVENT_ENDED').length).toBe(1);
  });
});

describe('weather', () => {
  it('below Stage 4 the sky is scenery: factors read 1, bias reads 0', () => {
    const sim = new Sim({ seed: 12 });
    planDay(sim.world, 0);
    sim.world.environment.weatherSegments.fill(3); // snow all day
    sim.world.progression.stage = 1;
    reread(sim.world);
    expect(environmentTrafficFactor(sim.world)).toBe(1);
    expect(environmentConversionFactor(sim.world)).toBe(1);
  });

  it('at Stage 4 snow thins the road and the appetite by its config', () => {
    const sim = new Sim({ seed: 12 });
    planDay(sim.world, 0);
    sim.world.environment.weatherSegments.fill(3);
    sim.world.environment.eventTypes.fill(-1);
    sim.world.progression.stage = 4;
    reread(sim.world);
    expect(environmentTrafficFactor(sim.world)).toBe(WEATHER_STATES[3]?.trafficFactor);
    expect(environmentConversionFactor(sim.world)).toBe(WEATHER_STATES[3]?.conversionFactor);
  });

  it('weather states are complete and ordered: the four the roadmap names', () => {
    expect(WEATHER_STATES.map((state) => state.id)).toEqual(['CLEAR', 'OVERCAST', 'RAIN', 'SNOW']);
  });
});

describe('the calendar travels', () => {
  it('survives a snapshot round-trip exactly', () => {
    // The plan is state; a reload that replanned would draw fresh numbers
    // from a moved stream. Snapshot → restore → identical calendar and hash.
    const sim = new Sim({ seed: 606 });
    sim.advance(500);
    const snapshot = snapshotWorld(sim.world);
    const restored = new Sim({ seed: 606 });
    restoreWorld(restored.world, snapshot);

    expect([...restored.world.environment.weatherSegments]).toEqual([
      ...sim.world.environment.weatherSegments,
    ]);
    expect([...restored.world.environment.eventTypes]).toEqual([...sim.world.environment.eventTypes]);
    expect(restored.world.environment.plannedDay).toBe(sim.world.environment.plannedDay);

    /*
     * Two restores from one snapshot continue identically — transient state
     * (vehicles on the road) is deliberately dropped by restore, so comparing
     * a restored world against the live one it came from would be comparing
     * against traffic the save intentionally does not carry.
     */
    const twin = new Sim({ seed: 606 });
    restoreWorld(twin.world, snapshot);
    restored.advance(500);
    twin.advance(500);
    expect(restored.world.environment.plannedDay).toBe(twin.world.environment.plannedDay);
    expect(restored.world.hash()).toBe(twin.world.hash());
  });

  it('reaches the sampled view: weather and the active event are readable', () => {
    const sim = new Sim({ seed: 5 });
    sim.tick();
    const env = sim.world.environment;
    env.eventTypes.fill(-1);
    env.eventTypes[2] = 2;
    env.eventStartMs[2] = 0;
    env.eventEndMs[2] = MS_PER_GAME_DAY;
    sim.world.progression.stage = 4;
    sim.tick();

    const view = sim.readView();
    expect(view.weather).toBe(currentWeather(sim.world));
    expect(view.activeEventKind).toBe(2);
    expect(view.activeEventEndsAtMs).toBe(MS_PER_GAME_DAY);

    sim.world.progression.stage = 1;
    sim.tick();
    expect(sim.readView().activeEventKind).toBe(-1);
    expect(sim.readView().activeEventEndsAtMs).toBe(0);
  });

  it('the three announcements survive the pooled event bus', () => {
    const sim = new Sim({ seed: 5 });
    const seen: object[] = [];
    sim.events.subscribe((event) => {
      if (
        event.t === 'WEATHER_CHANGED' ||
        event.t === 'ROAD_EVENT_STARTED' ||
        event.t === 'ROAD_EVENT_ENDED'
      ) {
        seen.push({ ...event });
      }
    });
    sim.world.eventQueue.emitWeatherChanged(3);
    sim.world.eventQueue.emitRoadEventStarted(4, 9000);
    sim.world.eventQueue.emitRoadEventEnded(4);
    sim.tick();
    expect(seen).toContainEqual({ t: 'WEATHER_CHANGED', state: 3 });
    expect(seen).toContainEqual({ t: 'ROAD_EVENT_STARTED', kind: 4, endsAtMs: 9000 });
    expect(seen).toContainEqual({ t: 'ROAD_EVENT_ENDED', kind: 4 });
  });
});
