import { describe, expect, it } from 'vitest';
import { EFFECTS, MAX_ALIVE_PARTICLES, ParticleLibrary } from '@render/fx/ParticleLibrary';

function fakeEmitters(): {
  factory: (spec: { id: string }) => {
    emitParticleAt(x: number, y: number, c: number): void;
    getAliveParticleCount(): number;
  };
  alive: Map<string, number>;
} {
  const alive = new Map<string, number>();
  return {
    alive,
    factory: (spec) => ({
      emitParticleAt: (_x, _y, count) => alive.set(spec.id, (alive.get(spec.id) ?? 0) + count),
      getAliveParticleCount: () => alive.get(spec.id) ?? 0,
    }),
  };
}

describe('ParticleLibrary', () => {
  it('defines exactly twelve effects, each on a real fx frame', () => {
    expect(EFFECTS).toHaveLength(12);
    for (const spec of EFFECTS) expect(spec.frame).toMatch(/^fx_/);
  });

  it('spawns an effect and reports the live total', () => {
    const { factory } = fakeEmitters();
    const lib = new ParticleLibrary(false, factory);
    const spawned = lib.spawn('coin_burst', 10, 10);
    expect(spawned).toBeGreaterThan(0);
    expect(lib.aliveCount).toBe(spawned);
  });

  it('the 400-particle budget is a wall, not a suggestion', () => {
    const { factory } = fakeEmitters();
    const lib = new ParticleLibrary(false, factory);
    let total = 0;
    for (let i = 0; i < 100; i++) total += lib.spawn('evolution_celebration', 0, 0);
    expect(total).toBeLessThanOrEqual(MAX_ALIVE_PARTICLES);
    expect(lib.aliveCount).toBeLessThanOrEqual(MAX_ALIVE_PARTICLES);
    expect(lib.spawn('coin_burst', 0, 0)).toBe(0);
  });

  it('reduced motion quarters every effect', () => {
    const { factory } = fakeEmitters();
    const lib = new ParticleLibrary(true, factory);
    const spawned = lib.spawn('evolution_celebration', 0, 0);
    expect(spawned).toBe(Math.max(1, Math.round(24 * 0.25)));
  });

  it('an unknown effect id spawns nothing', () => {
    const { factory } = fakeEmitters();
    const lib = new ParticleLibrary(false, factory);
    expect(lib.spawn('nope', 0, 0)).toBe(0);
  });
});

describe('the Phaser-facing factory', () => {
  it('builds one emitter per effect with the spec translated to Phaser config', () => {
    const configs: Record<string, unknown>[] = [];
    const scene = {
      add: {
        particles: (_x: number, _y: number, key: string, config: Record<string, unknown>) => {
          configs.push({ key, ...config });
          return {
            setDepth: () => undefined,
            emitParticleAt: () => undefined,
            getAliveParticleCount: () => 0,
          };
        },
      },
    };
    const lib = ParticleLibrary.forScene(scene as never, 'fx-atlas', false);
    expect(configs).toHaveLength(12);
    expect(configs.every((config) => config['key'] === 'fx-atlas')).toBe(true);
    const flare = configs.find((config) => config['tint'] !== undefined);
    expect(flare).toBeDefined();
    expect(lib.aliveCount).toBe(0);
  });
});
