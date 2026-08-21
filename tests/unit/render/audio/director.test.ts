import { describe, expect, it } from 'vitest';
import { AudioDirector } from '@render/audio/AudioDirector';
import { DUCKING, MAX_CONCURRENT_SOURCES, SFX_THROTTLE_MS } from '@config/audio';

/** A sound manager double that records instead of playing. */
interface FakeSound {
  played: { key: string; config: { volume: number; detune: number; pan: number } }[];
  manager: unknown;
}

function fakeSound(): FakeSound {
  const state: FakeSound = { played: [], manager: null };
  state.manager = {
    add(key: string, _opts: object) {
      const handlers = new Map<string, () => void>();
      return {
        once(event: string, handler: () => void) {
          handlers.set(event, handler);
        },
        play(config: { volume: number; detune: number; pan: number }) {
          state.played.push({ key, config });
        },
        stop() {
          handlers.get('stop')?.();
        },
      };
    },
  };
  return state;
}

const MIX = { master: 1, music: 1, sfx: 1, ambience: 1, muted: false } as const;

function director(state: FakeSound, random: () => number = () => 0.5): AudioDirector {
  const d = new AudioDirector(state.manager as never, random);
  d.markLoaded(['coin', 'bell_ready', 'upgrade_bought', 'music_day', 'sizzle']);
  return d;
}

describe('AudioDirector', () => {
  it('never plays a key whose file did not load — silence, not a crash', () => {
    const state = fakeSound();
    const d = director(state);
    expect(d.play('engine_pass', 0, MIX)).toBe(false);
    expect(state.played).toHaveLength(0);
  });

  it('throttles the same SFX inside 400 ms and allows it after', () => {
    const state = fakeSound();
    const d = director(state);
    expect(d.play('coin', 1_000, MIX)).toBe(true);
    expect(d.play('coin', 1_000 + SFX_THROTTLE_MS - 1, MIX)).toBe(false);
    expect(d.play('coin', 1_000 + SFX_THROTTLE_MS + 1, MIX)).toBe(true);
  });

  it('varies pitch within ±6% and never on loops', () => {
    const state = fakeSound();
    const d = director(state, () => 1);
    d.play('coin', 0, MIX);
    d.play('music_day', 1_000, MIX);
    expect(state.played[0]?.config.detune).toBeCloseTo(72, 6); // +6% of 1200 cents
    expect(state.played[1]?.config.detune).toBe(0);
  });

  it('refuses the 25th concurrent source', () => {
    const state = fakeSound();
    const d = director(state);
    for (let i = 0; i < MAX_CONCURRENT_SOURCES; i++) {
      expect(d.play('sizzle', i * 1000, MIX)).toBe(true);
    }
    expect(d.concurrent).toBe(MAX_CONCURRENT_SOURCES);
    expect(d.play('coin', 99_000, MIX)).toBe(false);
  });

  it('ducks ambience and music while progression plays, then releases', () => {
    const state = fakeSound();
    const d = director(state);
    expect(d.gainFor('music', MIX, 0)).toBe(1);
    d.play('upgrade_bought', 10_000, MIX);
    const duringDuck = d.gainFor('music', MIX, 10_000 + DUCKING.attackMs);
    expect(duringDuck).toBeCloseTo(DUCKING.factor, 6);
    // sfx lanes are not ducked.
    expect(d.gainFor('kitchen', MIX, 10_000 + DUCKING.attackMs)).toBe(1);
    const released = d.gainFor('music', MIX, 10_000 + DUCKING.holdMs + DUCKING.releaseMs + 1);
    expect(released).toBe(1);
  });

  it('muted means nothing plays, ever', () => {
    const state = fakeSound();
    const d = director(state);
    expect(d.play('coin', 0, { ...MIX, muted: true })).toBe(false);
    expect(state.played).toHaveLength(0);
  });

  it('world sounds fade with distance and vanish past the horizon', () => {
    const state = fakeSound();
    const d = new AudioDirector(state.manager as never, () => 0.5);
    d.markLoaded(['brake']);
    expect(d.play('brake', 0, MIX, 40)).toBe(false); // beyond silentBeyondMetres
    expect(d.play('brake', 1_000, MIX, 5)).toBe(true);
  });
});
