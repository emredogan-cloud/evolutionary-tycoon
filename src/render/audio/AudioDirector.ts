/**
 * The audio director — Phase 17.
 *
 * A thin discipline layer over Phaser's own WebAudio sound manager
 * (RESEARCH_NOTES §13: no second audio graph). Everything GDD §16 names
 * lives here: category gain lanes multiplied under the master, progression
 * ducking with real attack/release ramps, the 400 ms same-key throttle,
 * ±6% pitch variation, distance fade for world sounds, and the 24-source
 * ceiling.
 *
 * **No audio files ship yet.** The loader registers only what actually
 * exists under /audio; `play()` on an unloaded key is a silent no-op. The
 * game must remain fully playable at zero volume — the a11y contract — so
 * silence degrades polish, never information.
 */
import type Phaser from 'phaser';
import {
  DISTANCE,
  DUCKING,
  MAX_CONCURRENT_SOURCES,
  PITCH_VARIATION,
  SFX_THROTTLE_MS,
  SOUNDS,
  type AudioCategory,
  type SoundSpec,
} from '@config/audio';

interface AudioSettingsView {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
  readonly ambience: number;
  readonly muted: boolean;
}

/** Which settings slider governs each category lane. */
const SLIDER_FOR: Readonly<Record<AudioCategory, 'master' | 'music' | 'sfx' | 'ambience'>> = {
  ambience: 'ambience',
  world: 'sfx',
  kitchen: 'sfx',
  customer: 'sfx',
  ui: 'sfx',
  progression: 'sfx',
  music: 'music',
};

export class AudioDirector {
  private readonly specs = new Map<string, SoundSpec>();
  private readonly loaded = new Set<string>();
  private readonly lastPlayedMs = new Map<string, number>();
  private readonly active = new Set<Phaser.Sound.BaseSound>();
  private duckUntilMs = 0;
  private duckLevel = 1;

  constructor(
    private readonly sound: Phaser.Sound.BaseSoundManager | null,
    private readonly random: () => number = Math.random,
  ) {
    for (const spec of SOUNDS) this.specs.set(spec.key, spec);
  }

  /** Register the keys whose files the loader actually found. */
  markLoaded(keys: readonly string[]): void {
    for (const key of keys) this.loaded.add(key);
  }

  get concurrent(): number {
    return this.active.size;
  }

  /**
   * Play a key. Returns whether audio actually started — the tests' probe,
   * never a gameplay signal.
   */
  play(key: string, nowMs: number, settings: AudioSettingsView, worldDistanceMetres = 0, pan = 0): boolean {
    const spec = this.specs.get(key);
    if (spec === undefined || this.sound === null) return false;
    if (!this.loaded.has(key)) return false;
    if (settings.muted) return false;
    if (this.active.size >= MAX_CONCURRENT_SOURCES) return false;

    const last = this.lastPlayedMs.get(key);
    if (last !== undefined && nowMs - last < SFX_THROTTLE_MS && !spec.loop) return false;

    const distanceGain = this.distanceGain(spec, worldDistanceMetres);
    const volume = this.gainFor(spec.category, settings, nowMs) * spec.volume * distanceGain;
    if (volume <= 0) return false;

    const detuneCents = (this.random() * 2 - 1) * PITCH_VARIATION * 1200;
    const instance = this.sound.add(key, { loop: spec.loop });
    this.active.add(instance);
    instance.once('complete', () => this.active.delete(instance));
    instance.once('stop', () => this.active.delete(instance));
    instance.play({ volume, detune: spec.loop ? 0 : detuneCents, pan });

    this.lastPlayedMs.set(key, nowMs);
    if (spec.category === DUCKING.trigger) this.duckUntilMs = nowMs + DUCKING.holdMs;
    return true;
  }

  /** The category's effective gain at `nowMs`, ducking ramps included. */
  gainFor(category: AudioCategory, settings: AudioSettingsView, nowMs: number): number {
    const slider = settings[SLIDER_FOR[category]];
    const duck = DUCKING.ducked.includes(category) ? this.duckFactor(nowMs) : 1;
    return settings.master * slider * duck;
  }

  /** 1 → factor over attackMs while held; back to 1 over releaseMs after. */
  duckFactor(nowMs: number): number {
    if (this.duckUntilMs <= 0) return 1;
    const sinceTrigger = nowMs - (this.duckUntilMs - DUCKING.holdMs);
    if (sinceTrigger < 0) return 1;
    if (nowMs <= this.duckUntilMs) {
      const attack = Math.min(1, sinceTrigger / DUCKING.attackMs);
      this.duckLevel = 1 - (1 - DUCKING.factor) * attack;
      return this.duckLevel;
    }
    const sinceRelease = nowMs - this.duckUntilMs;
    if (sinceRelease >= DUCKING.releaseMs) return 1;
    return this.duckLevel + (1 - this.duckLevel) * (sinceRelease / DUCKING.releaseMs);
  }

  private distanceGain(spec: SoundSpec, metres: number): number {
    if (spec.category !== 'world' && spec.category !== 'kitchen' && spec.category !== 'customer') return 1;
    if (metres <= DISTANCE.fullVolumeWithinMetres) return 1;
    if (metres >= DISTANCE.silentBeyondMetres) return 0;
    return (
      1 -
      (metres - DISTANCE.fullVolumeWithinMetres) /
        (DISTANCE.silentBeyondMetres - DISTANCE.fullVolumeWithinMetres)
    );
  }

  stopAll(): void {
    for (const instance of this.active) instance.stop();
    this.active.clear();
  }
}
