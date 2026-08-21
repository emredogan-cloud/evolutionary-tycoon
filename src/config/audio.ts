/**
 * The audio vocabulary — Phase 17.
 *
 * Seven categories (GAME_DESIGN_DOCUMENT §16), each with its own gain lane in
 * the director. Every sound the game can play is declared here with the file
 * it expects under `public/audio/` — and **no files ship yet**: audio
 * production is external work, recorded in docs/AUDIO_ASSET_REQUIREMENTS.md.
 * The director loads what exists and stays silent about what does not, which
 * is the same honest-fallback posture the vehicle facings use. Nothing may
 * exist only in sound (the a11y contract), so silence is a quality loss and
 * never an information loss.
 */

export type AudioCategory = 'ambience' | 'world' | 'kitchen' | 'customer' | 'ui' | 'progression' | 'music';

export interface SoundSpec {
  readonly key: string;
  readonly category: AudioCategory;
  /** File under public/audio/, ogg preferred with m4a beside it. */
  readonly file: string;
  readonly loop: boolean;
  /** Base volume inside its category lane, 0..1. */
  readonly volume: number;
}

export const SOUNDS: readonly SoundSpec[] = [
  { key: 'amb_day', category: 'ambience', file: 'amb_day', loop: true, volume: 0.6 },
  { key: 'amb_night', category: 'ambience', file: 'amb_night', loop: true, volume: 0.5 },
  { key: 'traffic_bed', category: 'ambience', file: 'traffic_bed', loop: true, volume: 0.5 },
  { key: 'engine_pass', category: 'world', file: 'engine_pass', loop: false, volume: 0.5 },
  { key: 'brake', category: 'world', file: 'brake', loop: false, volume: 0.4 },
  { key: 'door', category: 'world', file: 'door', loop: false, volume: 0.5 },
  { key: 'footstep', category: 'world', file: 'footstep', loop: false, volume: 0.25 },
  { key: 'sizzle', category: 'kitchen', file: 'sizzle', loop: true, volume: 0.5 },
  { key: 'fryer', category: 'kitchen', file: 'fryer', loop: true, volume: 0.45 },
  { key: 'bell_ready', category: 'kitchen', file: 'bell_ready', loop: false, volume: 0.7 },
  { key: 'plate', category: 'kitchen', file: 'plate', loop: false, volume: 0.5 },
  { key: 'chatter_happy', category: 'customer', file: 'chatter_happy', loop: false, volume: 0.5 },
  { key: 'chatter_upset', category: 'customer', file: 'chatter_upset', loop: false, volume: 0.5 },
  { key: 'ui_click', category: 'ui', file: 'ui_click', loop: false, volume: 0.4 },
  { key: 'ui_confirm', category: 'ui', file: 'ui_confirm', loop: false, volume: 0.45 },
  { key: 'ui_error', category: 'ui', file: 'ui_error', loop: false, volume: 0.45 },
  { key: 'coin', category: 'ui', file: 'coin', loop: false, volume: 0.5 },
  { key: 'upgrade_bought', category: 'progression', file: 'upgrade_bought', loop: false, volume: 0.8 },
  { key: 'stage_evolved', category: 'progression', file: 'stage_evolved', loop: false, volume: 0.9 },
  { key: 'milestone', category: 'progression', file: 'milestone', loop: false, volume: 0.8 },
  { key: 'music_day', category: 'music', file: 'music_day', loop: true, volume: 0.35 },
  { key: 'music_evening', category: 'music', file: 'music_evening', loop: true, volume: 0.35 },
  { key: 'music_night', category: 'music', file: 'music_night', loop: true, volume: 0.3 },
] as const;

/** GDD §16: the same SFX may not retrigger inside this window. */
export const SFX_THROTTLE_MS = 400;

/** ±6% pitch variation, the fatigue guard. */
export const PITCH_VARIATION = 0.06;

/** Hard ceiling on simultaneously playing sources. */
export const MAX_CONCURRENT_SOURCES = 24;

/** Ducking: while a progression sound plays, these lanes drop to the factor. */
export const DUCKING = {
  trigger: 'progression' as AudioCategory,
  ducked: ['ambience', 'music'] as readonly AudioCategory[],
  factor: 0.35,
  attackMs: 120,
  releaseMs: 600,
  holdMs: 900,
} as const;

/** Distance fade for world sounds, metres from the camera focus. */
export const DISTANCE = { fullVolumeWithinMetres: 8, silentBeyondMetres: 34 } as const;
