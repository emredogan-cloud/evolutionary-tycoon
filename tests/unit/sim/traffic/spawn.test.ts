import { describe, expect, it } from 'vitest';
import { ARCHETYPE_SPECS } from '@config/archetypes';
import { MS_PER_GAME_DAY, TICK_MS } from '@config/simulation';
import { BASE_SPAWN_PER_REAL_MINUTE, DAY_CURVE, HOURS_IN_CURVE } from '@config/traffic';
import { Sim } from '@sim/core/Sim';
import { DAY_CURVE_PEAK, dayCurveAt } from '@sim/systems/TimeSystem';
import { pickArchetype } from '@sim/systems/TrafficSpawnSystem';

/**
 * Spawning — deterministic, Poisson, and shaped by the day.
 *
 * "Same seed, same day, same traffic" is the foundation of Day Replay and of
 * every reproducible bug report, so it is asserted at 10 000 samples rather than
 * spot-checked.
 */

const TICKS_PER_MINUTE = 60_000 / TICK_MS;

/** Sim time of every spawn over `ticks`, captured from the event stream. */
function spawnTimeline(seed: number, ticks: number): { at: number[]; archetypes: number[]; lanes: number[] } {
  const sim = new Sim({ seed });
  const at: number[] = [];
  const archetypes: number[] = [];
  const lanes: number[] = [];
  sim.events.subscribe((event) => {
    if (event.t !== 'VEHICLE_SPAWNED') return;
    at.push(sim.world.clock.simTimeMs);
    archetypes.push(event.archetype);
    lanes.push(event.lane);
  });
  sim.advance(ticks);
  return { at, archetypes, lanes };
}

describe('Poisson determinism', () => {
  it('produces byte-identical spawn timestamps for the same seed', () => {
    const first = spawnTimeline(20260815, TICKS_PER_MINUTE * 20);
    const second = spawnTimeline(20260815, TICKS_PER_MINUTE * 20);
    expect(first.at.length).toBeGreaterThan(300);
    expect(second.at).toEqual(first.at);
    expect(second.archetypes).toEqual(first.archetypes);
    expect(second.lanes).toEqual(first.lanes);
  });

  it('produces a different stream for a different seed', () => {
    // Otherwise the determinism above would be trivially satisfied by a
    // constant, which is a real failure mode for a seeded system.
    const a = spawnTimeline(1, TICKS_PER_MINUTE * 5);
    const b = spawnTimeline(2, TICKS_PER_MINUTE * 5);
    expect(a.at).not.toEqual(b.at);
  });

  it('holds over 10 000 spawns', () => {
    // The roadmap asks for 10 000 samples explicitly.
    // 420 real minutes yields ~9 100 spawns once refusals are accounted for, so
    // the window is sized from the measured rate rather than the nominal one.
    const ticks = TICKS_PER_MINUTE * 480;
    const first = spawnTimeline(777, ticks);
    expect(first.at.length).toBeGreaterThanOrEqual(10_000);
    const second = spawnTimeline(777, ticks);
    expect(second.at).toEqual(first.at);
  });

  it('advances the same way in one call or many', () => {
    // `advance(n)` must be exactly n `tick()`s — a spawn system that batched by
    // delta would break here.
    const bulk = new Sim({ seed: 4242 });
    bulk.advance(TICKS_PER_MINUTE * 4);

    const stepped = new Sim({ seed: 4242 });
    for (let i = 0; i < TICKS_PER_MINUTE * 4; i++) stepped.tick();

    expect(stepped.world.hash()).toBe(bulk.world.hash());
  });

  it('does not re-roll traffic when the speed multiplier changes', () => {
    // Speed is a presentation control: 4x must run the same day faster, not a
    // different day. (`World.hash` excludes the multiplier for the same reason.)
    const normal = new Sim({ seed: 99 });
    normal.advance(TICKS_PER_MINUTE * 3);

    const fast = new Sim({ seed: 99 });
    fast.dispatch({ t: 'SET_SPEED', mult: 4 });
    fast.advance(TICKS_PER_MINUTE * 3);

    expect(fast.world.stats.vehiclesSpawned).toBe(normal.world.stats.vehiclesSpawned);
  });
});

describe('spawn rate', () => {
  it('averages the rate ECONOMY_DESIGN §3 specifies over a whole day', () => {
    /*
     * The number that matters to the economy: 24 vehicles per real minute at
     * stage 1, as a *daily average*. The day curve redistributes them across the
     * hours without changing the total, which is why the curve is normalised to
     * a mean of 1 rather than used raw.
     */
    const minutes = MS_PER_GAME_DAY / 60_000;
    const { at } = spawnTimeline(31337, (MS_PER_GAME_DAY / TICK_MS) | 0);
    const perMinute = at.length / minutes;

    // Poisson noise over one day, plus arrivals genuinely refused when both lane
    // heads are occupied. Within 15% of the target.
    expect(perMinute).toBeGreaterThan(BASE_SPAWN_PER_REAL_MINUTE * 0.85);
    expect(perMinute).toBeLessThan(BASE_SPAWN_PER_REAL_MINUTE * 1.15);
  });

  it('spawns more at the evening peak than in the small hours', () => {
    // The day curve is the whole reason peaks exist; if this fails the curve is
    // being ignored somewhere.
    const { at } = spawnTimeline(555, (MS_PER_GAME_DAY / TICK_MS) | 0);
    const hourOf = (ms: number): number => ((ms % MS_PER_GAME_DAY) / MS_PER_GAME_DAY) * 24;
    const inWindow = (from: number, to: number): number =>
      at.filter((ms) => hourOf(ms) >= from && hourOf(ms) < to).length;

    const evening = inWindow(17, 20); // the largest peak
    const night = inWindow(2, 5); // the trough
    expect(evening).toBeGreaterThan(night * 3);
  });

  it('spreads across both lanes', () => {
    const { lanes } = spawnTimeline(8080, TICKS_PER_MINUTE * 30);
    const east = lanes.filter((lane) => lane === 0).length;
    const west = lanes.filter((lane) => lane === 1).length;
    expect(east).toBeGreaterThan(0);
    expect(west).toBeGreaterThan(0);
    // Roughly even. Not exactly: an arrival whose drawn lane is occupied spills
    // to the other rather than being lost.
    expect(Math.abs(east - west) / lanes.length).toBeLessThan(0.2);
  });

  it('refuses rather than overlapping when the road is saturated', () => {
    // Self-limiting by design: a jam stops accepting cars instead of stacking
    // them inside each other at the entrance.
    const sim = new Sim({ seed: 1234 });
    sim.world.progression.stage = 4; // the busiest approved stage
    sim.advance(TICKS_PER_MINUTE * 10);

    const vehicles = sim.world.vehicles;
    const byLane = new Map<number, number[]>();
    for (let slot = 0; slot < vehicles.capacity; slot++) {
      if (!vehicles.isActive(slot)) continue;
      const lane = vehicles.lane[slot] ?? 0;
      const list = byLane.get(lane) ?? [];
      list.push(vehicles.laneS[slot] ?? 0);
      byLane.set(lane, list);
    }
    for (const positions of byLane.values()) {
      positions.sort((a, b) => a - b);
      for (let i = 1; i < positions.length; i++) {
        expect((positions[i] ?? 0) - (positions[i - 1] ?? 0)).toBeGreaterThan(0);
      }
    }
  });
});

describe('the day curve', () => {
  it('is continuous at every hour boundary', () => {
    /*
     * A discontinuity here shows up as traffic visibly popping once a game day,
     * and gets misdiagnosed as a spawn bug for a week. Checked on both sides of
     * every integer hour, including the midnight wrap.
     */
    for (let hour = 0; hour < HOURS_IN_CURVE; hour++) {
      const before = dayCurveAt(hour - 1e-6);
      const after = dayCurveAt(hour + 1e-6);
      expect(Math.abs(after - before), `discontinuity at ${hour}:00`).toBeLessThan(1e-4);
    }
  });

  it('wraps across midnight rather than stepping', () => {
    expect(dayCurveAt(24)).toBeCloseTo(dayCurveAt(0), 10);
    expect(dayCurveAt(23.5)).toBeCloseTo((dayCurveAt(23) + dayCurveAt(0)) / 2, 6);
    expect(dayCurveAt(-1)).toBeCloseTo(dayCurveAt(23), 10);
  });

  it('averages to exactly 1 across the day', () => {
    // What lets BASE_SPAWN_PER_REAL_MINUTE be the honest daily average rather
    // than a number back-solved from the shape of the curve.
    let total = 0;
    const steps = 24_000;
    for (let i = 0; i < steps; i++) total += dayCurveAt((i / steps) * 24);
    expect(total / steps).toBeCloseTo(1, 3);
  });

  it('peaks at the evening rush', () => {
    let best = -1;
    let bestHour = -1;
    for (let hour = 0; hour < 24; hour += 0.1) {
      const value = dayCurveAt(hour);
      if (value > best) {
        best = value;
        bestHour = hour;
      }
    }
    expect(bestHour).toBeGreaterThan(16);
    expect(bestHour).toBeLessThan(20);
    expect(DAY_CURVE_PEAK).toBeCloseTo(best, 6);
  });

  it('never drops to zero', () => {
    // An empty road at 03:00 reads as broken rather than quiet.
    for (const value of DAY_CURVE) expect(value).toBeGreaterThan(0);
  });
});

describe('archetype mix', () => {
  it('matches the configured shares within 2 percentage points', () => {
    /*
     * The roadmap's tolerance, at its sample size. Measured against the *hourly*
     * expectation rather than the flat base share, because the bias tables move
     * the mix through the day and comparing to the base alone would be
     * comparing against the wrong thing.
     */
    const samples = 10_000;
    const hour = 12;
    const counts = new Array<number>(ARCHETYPE_SPECS.length).fill(0);
    for (let i = 0; i < samples; i++) {
      // Deterministic sweep of the unit interval: this tests the *mapping*, and
      // the RNG's uniformity is already covered by the Rng suite.
      counts[pickArchetype((i + 0.5) / samples, hour)] =
        (counts[pickArchetype((i + 0.5) / samples, hour)] ?? 0) + 1;
    }

    const bucket = Math.floor(hour);
    let total = 0;
    for (const spec of ARCHETYPE_SPECS) total += spec.baseShare * (spec.hourBias[bucket] ?? 1);

    ARCHETYPE_SPECS.forEach((spec, index) => {
      const expected = (spec.baseShare * (spec.hourBias[bucket] ?? 1)) / total;
      const actual = (counts[index] ?? 0) / samples;
      expect(Math.abs(actual - expected), `${spec.id}: ${actual} vs ${expected}`).toBeLessThan(0.02);
    });
  });

  it('produces every archetype in a real run', () => {
    const { archetypes } = spawnTimeline(2468, TICKS_PER_MINUTE * 60);
    const seen = new Set(archetypes);
    expect(seen.size).toBe(ARCHETYPE_SPECS.length);
  });

  it('shifts the mix across the day', () => {
    // Pickups skew to the early morning; if the hour bias were ignored the two
    // windows would be statistically identical.
    const morning = new Array<number>(ARCHETYPE_SPECS.length).fill(0);
    const evening = new Array<number>(ARCHETYPE_SPECS.length).fill(0);
    for (let i = 0; i < 5000; i++) {
      const roll = (i + 0.5) / 5000;
      morning[pickArchetype(roll, 7)] = (morning[pickArchetype(roll, 7)] ?? 0) + 1;
      evening[pickArchetype(roll, 19)] = (evening[pickArchetype(roll, 19)] ?? 0) + 1;
    }
    const pickup = ARCHETYPE_SPECS.findIndex((spec) => spec.id === 'PICKUP_WORKER');
    expect(morning[pickup] ?? 0).toBeGreaterThan((evening[pickup] ?? 0) * 1.2);
  });

  it('always returns a valid archetype, including at the extremes of the roll', () => {
    for (const roll of [0, 1e-12, 0.5, 1 - 1e-12, 0.999999999]) {
      for (const hour of [0, 6, 12, 18, 23.99]) {
        const index = pickArchetype(roll, hour);
        expect(index, `${roll}@${hour}`).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(ARCHETYPE_SPECS.length);
      }
    }
  });
});
