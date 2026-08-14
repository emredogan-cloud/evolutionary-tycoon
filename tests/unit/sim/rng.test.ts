import { describe, expect, it } from 'vitest';
import { Rng, RNG_STREAM_NAMES, RngStreams } from '@sim/core/Rng';

describe('Rng — sfc32', () => {
  it('produces the same sequence from the same seed and stream name', () => {
    const a = Rng.fromSeed(42, 'traffic');
    const b = Rng.fromSeed(42, 'traffic');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('produces a different sequence for a different seed', () => {
    const a = Rng.fromSeed(1, 'traffic');
    const b = Rng.fromSeed(2, 'traffic');
    const differs = Array.from({ length: 50 }, () => a.next() !== b.next());
    expect(differs.some(Boolean)).toBe(true);
  });

  it('produces a different sequence for a different stream name', () => {
    const a = Rng.fromSeed(42, 'traffic');
    const b = Rng.fromSeed(42, 'customer');
    const differs = Array.from({ length: 50 }, () => a.next() !== b.next());
    expect(differs.some(Boolean)).toBe(true);
  });

  it('stays within [0, 1)', () => {
    const rng = Rng.fromSeed(7, 'events');
    for (let i = 0; i < 100_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is roughly uniform across ten buckets', () => {
    // Not a proof of randomness — a smoke test that a broken shift or a lost
    // sign bit would fail loudly.
    const rng = Rng.fromSeed(99, 'conversion');
    const buckets = new Array<number>(10).fill(0);
    const samples = 200_000;
    for (let i = 0; i < samples; i++) {
      const bucket = Math.min(9, Math.floor(rng.next() * 10));
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    const expected = samples / 10;
    for (const count of buckets) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.05);
    }
  });

  it('int stays inside the requested range', () => {
    const rng = Rng.fromSeed(3, 'tips');
    for (let i = 0; i < 50_000; i++) {
      const value = rng.int(7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it('int of a non-positive bound yields zero rather than NaN', () => {
    const rng = Rng.fromSeed(3, 'tips');
    expect(rng.int(0)).toBe(0);
    expect(rng.int(-5)).toBe(0);
  });

  it('range stays inside [min, max)', () => {
    const rng = Rng.fromSeed(11, 'customer');
    for (let i = 0; i < 20_000; i++) {
      const value = rng.range(-3.5, 8.25);
      expect(value).toBeGreaterThanOrEqual(-3.5);
      expect(value).toBeLessThan(8.25);
    }
  });

  it('pick returns members of the array and eventually every member', () => {
    const rng = Rng.fromSeed(5, 'cosmetic');
    const items = ['a', 'b', 'c', 'd'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const picked = rng.pick(items);
      expect(items).toContain(picked);
      seen.add(picked);
    }
    expect(seen.size).toBe(items.length);
  });

  it('pick rejects an empty array instead of returning undefined', () => {
    const rng = Rng.fromSeed(5, 'cosmetic');
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('round-trips its state exactly', () => {
    // This is what makes "save at tick 5000, reload, continue" reproduce the
    // uninterrupted run: the generator resumes mid-sequence, not from the seed.
    const rng = Rng.fromSeed(2024, 'traffic');
    for (let i = 0; i < 137; i++) rng.next();

    const saved = rng.saveState();
    const expected = Array.from({ length: 100 }, () => rng.next());

    const restored = new Rng(saved);
    const actual = Array.from({ length: 100 }, () => restored.next());

    expect(actual).toEqual(expected);
  });

  it('nextUint32 covers the full unsigned 32-bit range', () => {
    const rng = Rng.fromSeed(17, 'events');
    let sawHighBit = false;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 10_000; i++) {
      const value = rng.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
      if (value > 0x7fffffff) sawHighBit = true;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    expect(sawHighBit).toBe(true);
    expect(max - min).toBeGreaterThan(0xf0000000);
  });
});

describe('RngStreams', () => {
  it('exposes exactly the six documented streams', () => {
    expect([...RNG_STREAM_NAMES]).toEqual([
      'traffic',
      'conversion',
      'customer',
      'tips',
      'events',
      'cosmetic',
    ]);
  });

  it('resolves every stream by name and by accessor to the same instance', () => {
    const streams = new RngStreams(1234);
    expect(streams.get('traffic')).toBe(streams.traffic);
    expect(streams.get('conversion')).toBe(streams.conversion);
    expect(streams.get('customer')).toBe(streams.customer);
    expect(streams.get('tips')).toBe(streams.tips);
    expect(streams.get('events')).toBe(streams.events);
    expect(streams.get('cosmetic')).toBe(streams.cosmetic);
  });

  it('rejects an unknown stream name', () => {
    const streams = new RngStreams(1);
    // Cast: the point is what happens when a name arrives from a save file,
    // where the type system cannot help.
    expect(() => streams.get('nonexistent' as 'traffic')).toThrow(RangeError);
  });

  it('starts every stream at a different point', () => {
    const streams = new RngStreams(2026);
    const firstDraws = RNG_STREAM_NAMES.map((name) => streams.get(name).next());
    expect(new Set(firstDraws).size).toBe(RNG_STREAM_NAMES.length);
  });

  it('round-trips all six stream states together', () => {
    const streams = new RngStreams(31337);
    for (const name of RNG_STREAM_NAMES) {
      for (let i = 0; i < 50; i++) streams.get(name).next();
    }

    const saved = streams.saveStates();
    const expected = RNG_STREAM_NAMES.map((name) => streams.get(name).next());

    const restored = new RngStreams(31337);
    restored.loadStates(saved);
    const actual = RNG_STREAM_NAMES.map((name) => restored.get(name).next());

    expect(actual).toEqual(expected);
  });
});
