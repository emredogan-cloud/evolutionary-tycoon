/**
 * The clip library — nine authored keyframe clips.
 *
 * Data lives in `./clips/library.data.ts` (typed tuples; the editor
 * round-trips JSON through its textarea, never a file). Still validated on
 * load: unknown part names or unsorted keyframes are authoring damage, and
 * the loud failure belongs to the build, not to a character silently not
 * moving.
 */
import { CLIP_DATA } from './clips/library.data';
import { ACTIVITIES } from '@config/animation';
import { RIG_PARTS } from './DollRig';
import type { Clip, Keyframe } from './clips';

const PART_NAMES = new Set<string>(RIG_PARTS);

function validateFrames(clipName: string, part: string, channel: string, frames: readonly Keyframe[]): void {
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (prev === undefined || next === undefined || next[0] < prev[0]) {
      throw new Error(`clip ${clipName}: ${part}.${channel} keyframes are not sorted by time`);
    }
  }
}

function loadLibrary(): Readonly<Record<string, Clip>> {
  const out: Record<string, Clip> = {};
  for (const [name, raw] of Object.entries(CLIP_DATA)) {
    for (const [part, channels] of Object.entries(raw.channels)) {
      if (!PART_NAMES.has(part)) throw new Error(`clip ${name}: unknown rig part "${part}"`);
      const c = channels;
      if (c.rotation !== undefined) validateFrames(name, part, 'rotation', c.rotation);
      if (c.offsetX !== undefined) validateFrames(name, part, 'offsetX', c.offsetX);
      if (c.offsetY !== undefined) validateFrames(name, part, 'offsetY', c.offsetY);
    }
    out[name] = { name, durationMs: raw.durationMs, loop: raw.loop, channels: raw.channels };
  }
  return out;
}

export const CLIP_LIBRARY: Readonly<Record<string, Clip>> = loadLibrary();

/** Which clip an activity plays, or null for the procedural-only activities. */
/* Every activity has an entry — checked at load, like the clips themselves. */
function assertCovers(map: Readonly<Record<number, string | null>>): Readonly<Record<number, string | null>> {
  for (let index = 0; index < ACTIVITIES.length; index++) {
    if (!(index in map))
      throw new Error(`no clip mapping for activity ${ACTIVITIES[index] ?? String(index)}`);
  }
  return map;
}

export const CLIP_FOR_ACTIVITY: Readonly<Record<number, string | null>> = assertCovers({
  0: null, // idle — procedural breathing
  1: null, // walk — procedural stride
  2: null, // walk_carry — procedural stride with the arm lock below
  3: 'take_order',
  4: 'cook',
  5: 'serve',
  6: 'clean',
  7: 'eat',
  8: 'pay',
  9: 'wait_impatient',
  10: 'happy',
  11: 'angry',
});
