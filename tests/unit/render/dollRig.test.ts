import { describe, expect, it } from 'vitest';
import { createPose, poseIdle, poseWalk, RIG_PARTS, STRIDES_PER_METRE } from '@render/rig/DollRig';

const pose = createPose();

/**
 * The procedural walk — GAME_EXECUTION_ROADMAP Phase 7, deliverable 6.
 *
 * "Pure maths, unit tested (given clip + t, expected transform)." Which is why
 * it lives in `src/render` and takes numbers rather than a world: how a leg
 * swings cannot change a simulation outcome, and putting it in `src/sim` would
 * make the world hash sensitive to an animation curve.
 */
describe('the rig', () => {
  it('has a transform for every part it declares', () => {
    const fresh = createPose();
    for (const part of RIG_PARTS) {
      expect(fresh[part], part).toEqual({ offsetX: 0, offsetY: 0, rotation: 0 });
    }
  });

  it('writes into the pose it is given rather than allocating one', () => {
    // The renderer calls this for every visible pedestrian every frame.
    const target = createPose();
    expect(poseWalk(1, 1.35, target)).toBe(target);
    expect(poseIdle(target)).toBe(target);
  });

  it('stands everything upright when idle', () => {
    poseIdle(pose);
    for (const part of RIG_PARTS) {
      expect(pose[part].rotation, part).toBe(0);
    }
    expect(pose.head.offsetY).toBeGreaterThan(pose.torso.offsetY);
    expect(pose.torso.offsetY).toBeGreaterThan(pose.legLeft.offsetY);
  });
});

describe('the walk cycle', () => {
  it('is driven by distance, not by time', () => {
    /*
     * A time-driven cycle keeps walking on the spot when an agent stops, and
     * skates when it slows — the legs and the ground disagree, which the eye
     * catches immediately even at sixty pixels. Same reasoning as the vehicle
     * suspension bob.
     */
    poseWalk(0.4, 1.35, pose);
    const atDistance = pose.legLeft.rotation;

    // Same distance, half the speed: the phase is identical, the amplitude is not.
    poseWalk(0.4, 0.675, pose);
    expect(Math.sign(pose.legLeft.rotation)).toBe(Math.sign(atDistance));
    expect(Math.abs(pose.legLeft.rotation)).toBeLessThan(Math.abs(atDistance));
  });

  it('repeats exactly once per stride', () => {
    const strideMetres = 1 / STRIDES_PER_METRE;
    poseWalk(0.3, 1.35, pose);
    const first = pose.legLeft.rotation;
    poseWalk(0.3 + strideMetres, 1.35, pose);
    expect(pose.legLeft.rotation).toBeCloseTo(first, 9);
  });

  it('swings the legs in opposition', () => {
    // Both legs forward at once is the classic broken walk.
    poseWalk(0.3, 1.35, pose);
    expect(pose.legLeft.rotation).toBeCloseTo(-pose.legRight.rotation, 9);
    expect(Math.abs(pose.legLeft.rotation)).toBeGreaterThan(0.01);
  });

  it('counter-swings the arms against the legs', () => {
    // Without it the figure marches like a toy soldier, which is the single most
    // obvious thing a bad walk cycle does.
    poseWalk(0.3, 1.35, pose);
    expect(Math.sign(pose.armLeft.rotation)).toBe(-Math.sign(pose.legLeft.rotation));
    expect(Math.sign(pose.armRight.rotation)).toBe(-Math.sign(pose.legRight.rotation));
  });

  it('swings the arms less than the legs', () => {
    poseWalk(0.3, 1.35, pose);
    expect(Math.abs(pose.armLeft.rotation)).toBeLessThan(Math.abs(pose.legLeft.rotation));
  });

  it('bobs the body twice per stride, because a stride is two steps', () => {
    const strideMetres = 1 / STRIDES_PER_METRE;
    poseWalk(0, 1.35, pose);
    const start = pose.torso.offsetY;
    poseWalk(strideMetres / 2, 1.35, pose);
    expect(pose.torso.offsetY).toBeCloseTo(start, 9);
  });

  it('keeps the head steadier than the body', () => {
    // A head that bobbed with the torso reads as a limp.
    poseWalk(0, 1.35, pose);
    const headHigh = pose.head.offsetY;
    const torsoHigh = pose.torso.offsetY;
    poseWalk(1 / STRIDES_PER_METRE / 4, 1.35, pose);
    const headSwing = Math.abs(pose.head.offsetY - headHigh);
    const torsoSwing = Math.abs(pose.torso.offsetY - torsoHigh);
    expect(headSwing).toBeLessThan(torsoSwing);
  });

  it('scales down to nothing as the agent slows to a stop', () => {
    /*
     * Amplitude, not frequency. Scaling frequency would have an arriving
     * pedestrian take the same size steps more slowly, which reads as wading.
     */
    poseWalk(0.3, 1.35, pose);
    const full = Math.abs(pose.legLeft.rotation);
    poseWalk(0.3, 0.2, pose);
    const slow = Math.abs(pose.legLeft.rotation);
    poseWalk(0.3, 0, pose);

    expect(slow).toBeLessThan(full);
    expect(pose.legLeft.rotation).toBe(0);
    expect(pose.torso.offsetY).toBeCloseTo(pose.legLeft.offsetY + 0.5, 1);
  });

  it('clamps a speed above the reference rather than over-swinging', () => {
    poseWalk(0.3, 1.35, pose);
    const reference = pose.legLeft.rotation;
    poseWalk(0.3, 20, pose);
    expect(pose.legLeft.rotation).toBeCloseTo(reference, 9);
  });

  it('produces the same pose for the same input, every time', () => {
    const a = createPose();
    const b = createPose();
    poseWalk(3.75, 1.1, a);
    poseWalk(3.75, 1.1, b);
    for (const part of RIG_PARTS) {
      expect(a[part], part).toEqual(b[part]);
    }
  });

  it('never produces a rotation a limb could not reach', () => {
    // A quarter-turn at the hip would be a cartwheel, not a walk.
    for (let travelled = 0; travelled < 6; travelled += 0.05) {
      poseWalk(travelled, 1.35, pose);
      for (const part of RIG_PARTS) {
        expect(Math.abs(pose[part].rotation), `${part} at ${travelled.toFixed(2)} m`).toBeLessThan(
          Math.PI / 4,
        );
      }
    }
  });
});
