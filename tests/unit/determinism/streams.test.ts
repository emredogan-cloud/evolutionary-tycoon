import { describe, expect, it } from 'vitest';
import { RNG_STREAM_NAMES, RngStreams } from '@sim/core/Rng';
import type { RngStreamName } from '@sim/core/Rng';
import { Sim } from '@sim/core/Sim';

/**
 * Determinism, part 3 — the six RNG streams are independent.
 *
 * Why this matters more than it looks: with one shared generator, adding a
 * single `rng.next()` call to a new system shifts every subsequent draw in every
 * other system. Every economy expectation, every recorded fixture and every
 * golden screenshot would break, and the diff would blame the new system for
 * changing behaviour it never touched.
 *
 * Stream separation makes systems independently changeable. This test is what
 * keeps that true.
 */

const DRAWS = 200;
const EXHAUST = 10_000;

function sequences(streams: RngStreams, drawsPerStream: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const name of RNG_STREAM_NAMES) {
    out[name] = Array.from({ length: drawsPerStream }, () => streams.get(name).next());
  }
  return out;
}

describe('determinism — RNG stream isolation', () => {
  it('draining one stream 10 000 times leaves every other stream untouched', () => {
    for (const drained of RNG_STREAM_NAMES) {
      const control = sequences(new RngStreams(2026), DRAWS);

      const streams = new RngStreams(2026);
      for (let i = 0; i < EXHAUST; i++) streams.get(drained).next();

      for (const name of RNG_STREAM_NAMES) {
        if (name === drained) continue;
        const actual = Array.from({ length: DRAWS }, () => streams.get(name).next());
        expect(actual, `draining ${drained} shifted ${name}`).toEqual(control[name]);
      }
    }
  });

  it('every stream starts from a different point', () => {
    const streams = new RngStreams(1);
    const firstTen = RNG_STREAM_NAMES.map((name) =>
      Array.from({ length: 10 }, () => streams.get(name).next()).join(','),
    );
    expect(new Set(firstTen).size).toBe(RNG_STREAM_NAMES.length);
  });

  it('two streams do not converge onto the same sequence', () => {
    // sfc32 has a single cycle per state; two streams seeded onto the same
    // point would silently produce correlated traffic and conversion rolls.
    const streams = new RngStreams(4242);
    const traffic = Array.from({ length: 5_000 }, () => streams.traffic.nextUint32());
    const conversion = new Set(Array.from({ length: 5_000 }, () => streams.conversion.nextUint32()));
    const overlap = traffic.filter((value) => conversion.has(value)).length;
    // A handful of coincidental 32-bit collisions across 5 000 draws is expected;
    // an aligned sequence would overlap almost entirely.
    expect(overlap).toBeLessThan(20);
  });

  it('the cosmetic stream cannot influence a simulation outcome', () => {
    // Character part swaps and vehicle colours draw from `cosmetic`. Excluding
    // it from the digest is what lets visual variety be added later without
    // invalidating a single balance test or golden image.
    const plain = new Sim({ seed: 606 });
    const cosmeticHeavy = new Sim({ seed: 606 });

    for (let tick = 0; tick < 2_000; tick++) {
      plain.tick();
      cosmeticHeavy.tick();
      for (let i = 0; i < 5; i++) cosmeticHeavy.world.rng.cosmetic.next();
    }

    expect(cosmeticHeavy.world.hash()).toBe(plain.world.hash());
    // ...and the stream really did advance, so the test is not vacuous.
    expect(cosmeticHeavy.world.rng.cosmetic.saveState()).not.toEqual(plain.world.rng.cosmetic.saveState());
  });

  it('every non-cosmetic stream does influence the digest', () => {
    const simulationStreams = RNG_STREAM_NAMES.filter((name): name is RngStreamName => name !== 'cosmetic');

    for (const name of simulationStreams) {
      const baseline = new Sim({ seed: 51 });
      const advanced = new Sim({ seed: 51 });
      advanced.world.rng.get(name).next();
      expect(advanced.world.hash(), `${name} is missing from the world hash`).not.toBe(baseline.world.hash());
    }
  });
});
