import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_COOK,
  ACTIVITY_HAPPY,
  ACTIVITY_IDLE,
  ACTIVITY_WALK,
  ACTIVITY_WALK_CARRY,
} from '@config/animation';
import { createPose } from '@render/rig/DollRig';
import { applyClip, clipTime, sampleChannel } from '@render/rig/clips';
import { CLIP_BLEND_MS, DollRigRuntime } from '@render/rig/DollRigRuntime';
import { CLIP_FOR_ACTIVITY, CLIP_LIBRARY } from '@render/rig/library';

describe('channel sampling', () => {
  const frames = [
    [0, 0],
    [100, 1],
    [300, -1],
  ] as const;

  it('interpolates linearly between keyframes, to the digit', () => {
    expect(sampleChannel(frames, 50)).toBeCloseTo(0.5, 12);
    expect(sampleChannel(frames, 100)).toBe(1);
    expect(sampleChannel(frames, 200)).toBeCloseTo(0, 12);
    expect(sampleChannel(frames, 250)).toBeCloseTo(-0.5, 12);
  });

  it('clamps before the first and after the last keyframe', () => {
    expect(sampleChannel(frames, -50)).toBe(0);
    expect(sampleChannel(frames, 900)).toBe(-1);
  });
});

describe('clip time', () => {
  it('wraps looping clips and clamps one-shots', () => {
    const cook = CLIP_LIBRARY['cook'];
    const happy = CLIP_LIBRARY['happy'];
    if (cook === undefined || happy === undefined) throw new Error('library incomplete');
    expect(clipTime(cook, cook.durationMs + 10)).toBeCloseTo(10, 9);
    expect(clipTime(happy, happy.durationMs + 500)).toBe(happy.durationMs);
  });
});

describe('clip application', () => {
  it('given clip and t, the transform is exact', () => {
    const clip = CLIP_LIBRARY['serve'];
    if (clip === undefined) throw new Error('no serve');
    const pose = createPose();
    applyClip(clip, 300, 1, false, pose);
    // serve keys armRight rotation to -0.7 at t=300 exactly.
    expect(pose.armRight.rotation).toBeCloseTo(-0.7, 12);
    expect(pose.torso.rotation).toBeCloseTo(0.08, 12);
  });

  it('mirroring flips rotation and X, never Y', () => {
    const clip = CLIP_LIBRARY['serve'];
    if (clip === undefined) throw new Error('no serve');
    const plain = createPose();
    const mirrored = createPose();
    applyClip(clip, 300, 1, false, plain);
    applyClip(clip, 300, 1, true, mirrored);
    expect(mirrored.armRight.rotation).toBeCloseTo(-plain.armRight.rotation, 12);
    expect(mirrored.torso.offsetY).toBeCloseTo(plain.torso.offsetY, 12);
  });

  it('every activity with a clip resolves to a real library entry', () => {
    for (const name of Object.values(CLIP_FOR_ACTIVITY)) {
      if (name !== null) expect(CLIP_LIBRARY[name], name).toBeDefined();
    }
  });
});

describe('the runtime', () => {
  it('cross-fades a state change with no discontinuity', () => {
    const runtime = new DollRigRuntime();
    const pose = createPose();
    runtime.pose(7, ACTIVITY_IDLE, false, 0, 0, false, 1_000, pose);
    const before = runtime.pose(7, ACTIVITY_IDLE, false, 0, 0, false, 2_000, createPose()).armRight.rotation;
    // Switch to cook: at the very first frame the clip contributes ~0 weight,
    // so the arm cannot jump.
    const atSwitch = runtime.pose(7, ACTIVITY_COOK, false, 0, 0, false, 2_001, createPose()).armRight
      .rotation;
    expect(Math.abs(atSwitch - before)).toBeLessThan(0.02);
    // And by the end of the blend the clip is fully in charge.
    const after = runtime.pose(7, ACTIVITY_COOK, false, 0, 0, false, 2_001 + CLIP_BLEND_MS + 1, createPose());
    expect(after.armRight.rotation).not.toBeCloseTo(before, 2);
  });

  it('a frozen clock yields a frozen pose — visual determinism', () => {
    const runtime = new DollRigRuntime();
    const a = runtime.pose(9, ACTIVITY_HAPPY, false, 0, 0, false, 5_000, createPose());
    const b = runtime.pose(9, ACTIVITY_HAPPY, false, 0, 0, false, 5_000, createPose());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the carry lock holds both arms regardless of stride phase', () => {
    const runtime = new DollRigRuntime();
    const pose = runtime.pose(3, ACTIVITY_WALK_CARRY, true, 3.7, 1.2, false, 100, createPose());
    expect(pose.armLeft.rotation).toBeCloseTo(-0.55, 12);
    expect(pose.armRight.rotation).toBeCloseTo(-0.55, 12);
    const walking = runtime.pose(4, ACTIVITY_WALK, true, 3.7, 1.2, false, 100, createPose());
    expect(Math.abs(walking.armLeft.rotation)).toBeGreaterThan(0);
  });

  it('prunes unseen actors and never grows past the population', () => {
    const runtime = new DollRigRuntime();
    for (let i = 0; i < 200; i++) runtime.pose(i, ACTIVITY_IDLE, false, 0, 0, false, 0, createPose());
    expect(runtime.trackedCount).toBe(200);
    runtime.pose(0, ACTIVITY_IDLE, false, 0, 0, false, 10_000, createPose());
    runtime.prune(10_000);
    expect(runtime.trackedCount).toBe(1);
  });
});

describe('library validation', () => {
  it('sampling edge cases: empty channel, duplicate-time keys, zero weight', () => {
    expect(sampleChannel([], 100)).toBe(0);
    // Duplicate-time keys: the earlier one wins at the exact boundary —
    // deterministic either way, and this pins which way.
    expect(
      sampleChannel(
        [
          [100, 2],
          [100, 5],
        ] as const,
        100,
      ),
    ).toBe(2);
    const pose = createPose();
    const clip = CLIP_LIBRARY['cook'];
    if (clip === undefined) throw new Error('no cook');
    applyClip(clip, 100, 0, false, pose);
    expect(pose.armRight.rotation).toBe(0);
  });

  it('a zero-duration clip clamps its time to zero', () => {
    expect(clipTime({ name: 'x', durationMs: 0, loop: true, channels: {} }, 500)).toBe(0);
  });

  it('a runtime state whose previous clip was procedural blends from nothing', () => {
    const runtime = new DollRigRuntime();
    runtime.pose(21, ACTIVITY_WALK, true, 1, 1.2, false, 0, createPose());
    // walk → cook: previousClip is null (procedural), so only the fade-in runs.
    const mid = runtime.pose(21, ACTIVITY_COOK, false, 1, 0, false, 60, createPose());
    expect(Number.isFinite(mid.armRight.rotation)).toBe(true);
  });
});
