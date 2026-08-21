import { describe, expect, it } from 'vitest';
import { Sim } from '@sim/core/Sim';

/**
 * The Phase 17 non-negotiable, written as a test exactly as the roadmap
 * demands: `prefers-reduced-motion` reduces animation and particles but MUST
 * NOT change simulation speed — or any simulation outcome at all.
 */
describe('reduced motion never touches the simulation', () => {
  it('same seed, same ticks, same outcomes, with and without the preference', () => {
    const plain = new Sim({ seed: 20260821 });
    const reduced = new Sim({ seed: 20260821 });
    reduced.dispatch({ t: 'SET_REDUCED_MOTION', on: true });
    reduced.tick();
    plain.tick();

    plain.advance(600);
    reduced.advance(600);

    expect(reduced.world.tick).toBe(plain.world.tick);
    expect(reduced.world.clock.simTimeMs).toBe(plain.world.clock.simTimeMs);
    // Outcomes, not the digest: the digest legitimately differs by the
    // settings byte itself. Everything the player can measure must not.
    expect(reduced.world.economy.cash).toBe(plain.world.economy.cash);
    expect(reduced.world.stats.customersServed).toBe(plain.world.stats.customersServed);
    expect(reduced.world.stats.vehiclesSpawned).toBe(plain.world.stats.vehiclesSpawned);
    expect(reduced.world.stats.conversionsSucceeded).toBe(plain.world.stats.conversionsSucceeded);
  });

  it('the audio mix has the same property — sliders move no outcome', () => {
    const plain = new Sim({ seed: 424242 });
    const mixed = new Sim({ seed: 424242 });
    mixed.dispatch({ t: 'SET_AUDIO', channel: 'master', value: 0.2 });
    mixed.dispatch({ t: 'SET_MUTED', muted: true });
    mixed.tick();
    plain.tick();
    plain.advance(400);
    mixed.advance(400);
    expect(mixed.world.economy.cash).toBe(plain.world.economy.cash);
    expect(mixed.world.stats.customersServed).toBe(plain.world.stats.customersServed);
  });
});
