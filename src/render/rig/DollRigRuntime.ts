/**
 * The full rig runtime — Phase 17.
 *
 * Composes three layers into one pose, in order:
 *
 *   1. the procedural base — `poseWalk` for movers (distance-driven stride,
 *      Phase 7's maths untouched), `poseIdle` plus a breathing bob for
 *      standers;
 *   2. the keyframe clip the actor's activity selects, cross-faded over
 *      `CLIP_BLEND_MS` so a state change never snaps a limb;
 *   3. the carry lock — `walk_carry` freezes both arms level, because the
 *      tray is the point of the trip.
 *
 * Pure maths over a caller-owned pose, zero allocation per frame: per-actor
 * state lives in a pooled map keyed by entity id, recycled when an actor is
 * gone. `nowMs` comes from the render clock, not the wall — visual
 * determinism runs this at a frozen time and gets a frozen pose.
 */
import { ACTIVITY_WALK_CARRY } from '@config/animation';
import { poseIdle, poseWalk, type RigPose } from './DollRig';
import { applyClip } from './clips';
import { CLIP_FOR_ACTIVITY, CLIP_LIBRARY } from './library';

/** Cross-fade length between two clips, ms. */
export const CLIP_BLEND_MS = 120;

/** Breathing: a slow, small rise of the torso and head while standing. */
const BREATH_PERIOD_MS = 3200;
const BREATH_HEIGHT_METRES = 0.012;

/** The carried tray holds both arms at this fixed forward angle. */
const CARRY_ARM_ROTATION = -0.55;

interface ActorAnimState {
  activity: number;
  clipStartMs: number;
  previousClip: string | null;
  previousElapsedMs: number;
  blendStartMs: number;
  lastSeenMs: number;
}

/** Recycle an actor's state after this long unseen. */
const STATE_TTL_MS = 5_000;

export class DollRigRuntime {
  private readonly states = new Map<number, ActorAnimState>();

  /** How many actors currently hold animation state — the budget test's probe. */
  get trackedCount(): number {
    return this.states.size;
  }

  /**
   * Fill `pose` for one actor. `travelled`/`speed` feed the stride;
   * `activity` picks the clip; `mirror` follows the sprite facing.
   */
  pose(
    entityId: number,
    activity: number,
    moving: boolean,
    travelled: number,
    speed: number,
    mirror: boolean,
    nowMs: number,
    pose: RigPose,
  ): RigPose {
    let state = this.states.get(entityId);
    if (state === undefined) {
      state = {
        activity,
        clipStartMs: nowMs,
        previousClip: null,
        previousElapsedMs: 0,
        blendStartMs: -CLIP_BLEND_MS,
        lastSeenMs: nowMs,
      };
      this.states.set(entityId, state);
    }
    state.lastSeenMs = nowMs;

    if (state.activity !== activity) {
      const previousName = CLIP_FOR_ACTIVITY[state.activity] ?? null;
      state.previousClip = previousName;
      state.previousElapsedMs = nowMs - state.clipStartMs;
      state.blendStartMs = nowMs;
      state.activity = activity;
      state.clipStartMs = nowMs;
    }

    // 1 — procedural base.
    if (moving) poseWalk(travelled, speed, pose);
    else {
      poseIdle(pose);
      const breath = Math.sin((nowMs / BREATH_PERIOD_MS) * Math.PI * 2) * BREATH_HEIGHT_METRES;
      pose.torso.offsetY += breath;
      pose.head.offsetY += breath * 0.6;
    }

    // 2 — the clip layer, cross-faded.
    const blendAlpha = Math.min(1, (nowMs - state.blendStartMs) / CLIP_BLEND_MS);
    const currentName = CLIP_FOR_ACTIVITY[activity] ?? null;
    if (state.previousClip !== null && blendAlpha < 1) {
      const previous = CLIP_LIBRARY[state.previousClip];
      if (previous !== undefined) {
        applyClip(
          previous,
          state.previousElapsedMs + (nowMs - state.blendStartMs),
          1 - blendAlpha,
          mirror,
          pose,
        );
      }
    }
    if (currentName !== null) {
      const clip = CLIP_LIBRARY[currentName];
      if (clip !== undefined) applyClip(clip, nowMs - state.clipStartMs, blendAlpha, mirror, pose);
    }

    // 3 — the carry lock wins over whatever the stride did to the arms.
    if (activity === ACTIVITY_WALK_CARRY) {
      pose.armLeft.rotation = CARRY_ARM_ROTATION * (mirror ? -1 : 1);
      pose.armRight.rotation = CARRY_ARM_ROTATION * (mirror ? -1 : 1);
    }

    return pose;
  }

  /** Drop states nobody has asked about lately. Called once per frame. */
  prune(nowMs: number): void {
    for (const [id, state] of this.states) {
      if (nowMs - state.lastSeenMs > STATE_TTL_MS) this.states.delete(id);
    }
  }
}
