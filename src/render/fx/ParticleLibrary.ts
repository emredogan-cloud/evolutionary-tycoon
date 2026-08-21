/**
 * The particle library — Phase 17's twelve effects.
 *
 * Phaser particle emitters over the fx atlas textures, one definition per
 * effect, all event-driven: nothing here decides *when* — the scene's event
 * subscription does — this file only knows *what* each effect looks like.
 *
 * The budget is enforced, not aspired to: `aliveCount` sums every emitter's
 * live particles and `spawn()` refuses past `MAX_ALIVE_PARTICLES`. Reduced
 * motion quarters the budget and every effect's counts; `noParticles` mode
 * never constructs this class at all, which is what keeps the goldens frozen
 * (the roadmap's own instruction: a golden that moves under particles is a
 * leak, not a diff to accept).
 *
 * Two effects want textures the audit filed prompts for (fire → P246,
 * coin → P245); until that art lands they draw the nearest truthful
 * neighbour — warm-tinted smoke, sparkle — the same recorded-fallback idiom
 * as the vehicle facings. Nothing is fabricated; the mapping is this table.
 */
import type Phaser from 'phaser';
import { FX_FRAMES } from '@config/sprites';

export const MAX_ALIVE_PARTICLES = 400;

export interface EffectSpec {
  readonly id: string;
  readonly frame: string;
  readonly count: number;
  readonly speed: { readonly min: number; readonly max: number };
  readonly lifespanMs: number;
  readonly scale: { readonly start: number; readonly end: number };
  readonly alpha: { readonly start: number; readonly end: number };
  readonly gravityY: number;
  readonly tint?: number;
  readonly blendAdd?: boolean;
}

/** The twelve. Ids are the vocabulary the scene wiring uses. */
export const EFFECTS: readonly EffectSpec[] = [
  {
    id: 'steam_puff',
    frame: FX_FRAMES.steam,
    count: 4,
    speed: { min: 4, max: 10 },
    lifespanMs: 1400,
    scale: { start: 0.35, end: 0.7 },
    alpha: { start: 0.5, end: 0 },
    gravityY: -14,
  },
  {
    id: 'grill_smoke',
    frame: FX_FRAMES.smoke,
    count: 3,
    speed: { min: 3, max: 8 },
    lifespanMs: 1900,
    scale: { start: 0.3, end: 0.9 },
    alpha: { start: 0.45, end: 0 },
    gravityY: -10,
  },
  {
    id: 'grill_flare',
    frame: FX_FRAMES.smoke,
    count: 5,
    speed: { min: 8, max: 18 },
    lifespanMs: 500,
    scale: { start: 0.3, end: 0.05 },
    alpha: { start: 0.9, end: 0 },
    gravityY: -30,
    tint: 0xff9a3d,
    blendAdd: true,
  },
  {
    id: 'construction_dust',
    frame: FX_FRAMES.dust,
    count: 8,
    speed: { min: 6, max: 16 },
    lifespanMs: 1100,
    scale: { start: 0.4, end: 0.8 },
    alpha: { start: 0.55, end: 0 },
    gravityY: 6,
  },
  {
    id: 'arrival_dust',
    frame: FX_FRAMES.dust,
    count: 3,
    speed: { min: 5, max: 10 },
    lifespanMs: 700,
    scale: { start: 0.25, end: 0.5 },
    alpha: { start: 0.4, end: 0 },
    gravityY: 4,
  },
  {
    id: 'coin_burst',
    frame: FX_FRAMES.sparkle,
    count: 6,
    speed: { min: 18, max: 34 },
    lifespanMs: 650,
    scale: { start: 0.3, end: 0.1 },
    alpha: { start: 1, end: 0 },
    gravityY: 60,
    tint: 0xf2c14e,
    blendAdd: true,
  },
  {
    id: 'tip_sparkle',
    frame: FX_FRAMES.sparkle,
    count: 4,
    speed: { min: 10, max: 20 },
    lifespanMs: 800,
    scale: { start: 0.25, end: 0.05 },
    alpha: { start: 1, end: 0 },
    gravityY: -8,
    blendAdd: true,
  },
  {
    id: 'upgrade_burst',
    frame: FX_FRAMES.sparkle,
    count: 10,
    speed: { min: 16, max: 40 },
    lifespanMs: 900,
    scale: { start: 0.35, end: 0.08 },
    alpha: { start: 1, end: 0 },
    gravityY: 0,
    blendAdd: true,
  },
  {
    id: 'evolution_celebration',
    frame: FX_FRAMES.sparkle,
    count: 24,
    speed: { min: 24, max: 60 },
    lifespanMs: 1500,
    scale: { start: 0.45, end: 0.1 },
    alpha: { start: 1, end: 0 },
    gravityY: 20,
    blendAdd: true,
  },
  {
    id: 'angry_puff',
    frame: FX_FRAMES.smoke,
    count: 2,
    speed: { min: 6, max: 12 },
    lifespanMs: 600,
    scale: { start: 0.2, end: 0.45 },
    alpha: { start: 0.5, end: 0 },
    gravityY: -20,
    tint: 0xd96a6a,
  },
  {
    id: 'hire_poof',
    frame: FX_FRAMES.dust,
    count: 5,
    speed: { min: 8, max: 18 },
    lifespanMs: 800,
    scale: { start: 0.3, end: 0.6 },
    alpha: { start: 0.5, end: 0 },
    gravityY: -6,
  },
  {
    id: 'door_puff',
    frame: FX_FRAMES.steam,
    count: 2,
    speed: { min: 4, max: 8 },
    lifespanMs: 500,
    scale: { start: 0.2, end: 0.4 },
    alpha: { start: 0.35, end: 0 },
    gravityY: -8,
  },
] as const;

interface EmitterLike {
  emitParticleAt(x: number, y: number, count: number): unknown;
  getAliveParticleCount(): number;
  setConfig?(config: object): void;
}

export class ParticleLibrary {
  private readonly emitters = new Map<string, EmitterLike>();
  private readonly specById = new Map<string, EffectSpec>();

  constructor(
    private readonly reducedMotion: boolean,
    emitterFactory?: (spec: EffectSpec) => EmitterLike,
  ) {
    for (const spec of EFFECTS) {
      this.specById.set(spec.id, spec);
      if (emitterFactory !== undefined) this.emitters.set(spec.id, emitterFactory(spec));
    }
  }

  /** Build the real Phaser emitters into a scene. */
  static forScene(scene: Phaser.Scene, atlasKey: string, reducedMotion: boolean): ParticleLibrary {
    return new ParticleLibrary(reducedMotion, (spec) => {
      const emitter = scene.add.particles(0, 0, atlasKey, {
        frame: spec.frame,
        emitting: false,
        speed: { min: spec.speed.min, max: spec.speed.max },
        lifespan: spec.lifespanMs,
        scale: { start: spec.scale.start, end: spec.scale.end },
        alpha: { start: spec.alpha.start, end: spec.alpha.end },
        gravityY: spec.gravityY,
        ...(spec.tint === undefined ? {} : { tint: spec.tint }),
        ...(spec.blendAdd === true ? { blendMode: 1 } : {}),
      });
      emitter.setDepth(1_000_000); // over the world, under the DOM UI
      return emitter;
    });
  }

  get aliveCount(): number {
    let alive = 0;
    for (const emitter of this.emitters.values()) alive += emitter.getAliveParticleCount();
    return alive;
  }

  /**
   * Fire one effect at a screen position. Returns particles actually spawned
   * — 0 when the budget is exhausted, which is the enforcement.
   */
  spawn(effectId: string, x: number, y: number): number {
    const spec = this.specById.get(effectId);
    const emitter = this.emitters.get(effectId);
    if (spec === undefined || emitter === undefined) return 0;
    const scale = this.reducedMotion ? 0.25 : 1;
    const want = Math.max(1, Math.round(spec.count * scale));
    const headroom = MAX_ALIVE_PARTICLES - this.aliveCount;
    if (headroom <= 0) return 0;
    const count = Math.min(want, headroom);
    emitter.emitParticleAt(x, y, count);
    return count;
  }
}
