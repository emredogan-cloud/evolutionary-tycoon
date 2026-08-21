/**
 * Keyframe clips for the doll rig — Phase 17.
 *
 * A clip is a set of per-part channels, each a list of `[timeMs, value]`
 * keyframes sampled with linear interpolation. Values are **deltas from the
 * rest pose**, which is what lets a clip layer sit on top of the procedural
 * base (walk bob, breathing) without either knowing the other exists: the
 * base writes absolutes, the clip adds.
 *
 * Pure maths with no Phaser dependency, exactly like `DollRig` — given a clip
 * and a time, the transform is assertable to the digit in a unit test.
 */

import { RIG_PARTS, type RigPose } from './DollRig';

type RigPartName = (typeof RIG_PARTS)[number];

/** `[timeMs, value]`, sorted ascending by time. */
export type Keyframe = readonly [number, number];

interface PartChannels {
  readonly rotation?: readonly Keyframe[];
  readonly offsetX?: readonly Keyframe[];
  readonly offsetY?: readonly Keyframe[];
}

export interface Clip {
  readonly name: string;
  readonly durationMs: number;
  readonly loop: boolean;
  readonly channels: Readonly<Partial<Record<RigPartName, PartChannels>>>;
}

/** Linear sample of one channel at `tMs`. Clamped at the ends. */
export function sampleChannel(frames: readonly Keyframe[], tMs: number): number {
  const first = frames[0];
  if (first === undefined) return 0;
  if (tMs <= first[0]) return first[1];
  for (let i = 1; i < frames.length; i++) {
    const next = frames[i];
    if (next === undefined) break;
    if (tMs <= next[0]) {
      const prev = frames[i - 1];
      if (prev === undefined) return next[1];
      const span = next[0] - prev[0];
      if (span <= 0) return next[1];
      const alpha = (tMs - prev[0]) / span;
      return prev[1] + (next[1] - prev[1]) * alpha;
    }
  }
  const last = frames[frames.length - 1];
  return last === undefined ? 0 : last[1];
}

/** Where inside the clip `elapsedMs` lands — looped or clamped. */
export function clipTime(clip: Clip, elapsedMs: number): number {
  if (clip.durationMs <= 0) return 0;
  if (clip.loop) {
    const t = elapsedMs % clip.durationMs;
    return t < 0 ? t + clip.durationMs : t;
  }
  return Math.min(clip.durationMs, Math.max(0, elapsedMs));
}

/**
 * Add a clip's channels into `pose` at `elapsedMs`, scaled by `weight`.
 *
 * `mirror` flips the sign of rotations and X offsets — the same rule the art
 * pipeline uses for `sw/w/nw` sprites, so a clip authored facing south-east
 * plays truthfully on a mirrored facing.
 */
export function applyClip(
  clip: Clip,
  elapsedMs: number,
  weight: number,
  mirror: boolean,
  pose: RigPose,
): void {
  if (weight <= 0) return;
  const t = clipTime(clip, elapsedMs);
  const sign = mirror ? -1 : 1;
  for (const part of RIG_PARTS) {
    const channels = clip.channels[part];
    if (channels === undefined) continue;
    const target = pose[part];
    if (channels.rotation !== undefined)
      target.rotation += sampleChannel(channels.rotation, t) * weight * sign;
    if (channels.offsetX !== undefined) target.offsetX += sampleChannel(channels.offsetX, t) * weight * sign;
    if (channels.offsetY !== undefined) target.offsetY += sampleChannel(channels.offsetY, t) * weight;
  }
}
