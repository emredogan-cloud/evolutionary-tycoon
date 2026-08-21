import { describe, expect, it } from 'vitest';
import { ACTIVITY_COOK, ACTIVITY_EAT, ACTIVITY_IDLE, ACTIVITY_WALK } from '@config/animation';
import { createPose } from '@render/rig/DollRig';
import { DollRigRuntime } from '@render/rig/DollRigRuntime';

/**
 * The roadmap's Phase 17 budget, measured where CI can measure it: the rig is
 * pure maths, so "60 characters per frame in ≤ 1.2 ms" is a node benchmark,
 * not a GPU claim. Median of 200 frames, generous warmup, one shared pose the
 * way the scene actually calls it.
 */
const CHARACTERS = 60;
const FRAMES = 200;
const BUDGET_MS = 1.2;

describe('rig runtime budget', () => {
  it(`poses ${String(CHARACTERS)} characters in under ${String(BUDGET_MS)} ms per frame`, () => {
    const runtime = new DollRigRuntime();
    const pose = createPose();
    const activities = [ACTIVITY_IDLE, ACTIVITY_WALK, ACTIVITY_COOK, ACTIVITY_EAT];

    // Warmup — states allocate on first sight, steady state is the claim.
    for (let frame = 0; frame < 50; frame++) {
      for (let actor = 0; actor < CHARACTERS; actor++) {
        runtime.pose(
          actor,
          activities[actor % 4] ?? 0,
          actor % 2 === 0,
          actor * 0.37,
          1.2,
          actor % 3 === 0,
          frame * 16,
          pose,
        );
      }
    }

    const samples: number[] = [];
    for (let frame = 0; frame < FRAMES; frame++) {
      const nowMs = 1_000 + frame * 16;
      const start = performance.now();
      for (let actor = 0; actor < CHARACTERS; actor++) {
        runtime.pose(
          actor,
          activities[actor % 4] ?? 0,
          actor % 2 === 0,
          actor * 0.37 + frame,
          1.2,
          actor % 3 === 0,
          nowMs,
          pose,
        );
      }
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length / 2)] ?? 0;
    expect(p50, `p50 ${p50.toFixed(4)} ms for ${String(CHARACTERS)} characters`).toBeLessThan(BUDGET_MS);
  });
});
