/**
 * The doll rig — a person as six parts and the transforms that move them.
 *
 * Pure maths, in `src/render` rather than `src/sim`: how a character's leg swings
 * cannot change a simulation outcome, and putting it in the simulation would
 * make the world hash sensitive to an animation curve. The simulation supplies
 * a position, a heading and a speed; everything here is derived from those.
 *
 * Six parts and no more. A skeletal animation system would be the general
 * answer and is the wrong one here: the characters are 1.75 m tall and drawn at
 * roughly 60 pixels, so a knee joint is a subpixel detail, and the art pipeline
 * produces flat sprites rather than a rigged mesh (ASSET_PIPELINE §3). What
 * reads at this size is the gross motion — legs alternating, arms
 * counter-swinging, the body rising and falling.
 *
 * ## Why procedural rather than sprite frames
 *
 * A walk cycle drawn as frames costs eight directions times however many frames,
 * and the character batch is budgeted at 40 files (ASSET_PIPELINE §13). Driving
 * the parts from a phase costs nothing per direction and stays smooth at any
 * speed — which matters, because pedestrians here slow down as they arrive
 * rather than switching between walking and standing.
 */

export const RIG_PARTS = ['torso', 'head', 'armLeft', 'armRight', 'legLeft', 'legRight'] as const;
type RigPart = (typeof RIG_PARTS)[number];

/**
 * One part's offset from the actor's anchor, in metres, plus a rotation.
 *
 * Metres rather than pixels, so the projection and the art scale are applied
 * once by the renderer instead of being baked in here at one particular zoom.
 */
interface PartTransform {
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export type RigPose = Record<RigPart, PartTransform>;

export function createPose(): RigPose {
  const pose = {} as RigPose;
  for (const part of RIG_PARTS) {
    pose[part] = { offsetX: 0, offsetY: 0, rotation: 0 };
  }
  return pose;
}

/** Rest positions, in metres from the anchor at the feet. */
const REST: Readonly<Record<RigPart, { x: number; y: number }>> = {
  torso: { x: 0, y: 0.95 },
  head: { x: 0, y: 1.55 },
  armLeft: { x: -0.22, y: 1.0 },
  armRight: { x: 0.22, y: 1.0 },
  legLeft: { x: -0.1, y: 0.45 },
  legRight: { x: 0.1, y: 0.45 },
};

/**
 * How far a limb swings at full walking pace, in radians.
 *
 * Arms swing less than legs, which is what makes a walk read as a walk rather
 * than a march.
 */
const LEG_SWING = 0.55;
const ARM_SWING = 0.35;

/** How far the body rises and falls over a stride, in metres. */
const BOB_HEIGHT = 0.035;

/**
 * Strides per metre travelled.
 *
 * Phase driven by **distance**, not by time. A time-driven cycle keeps walking
 * on the spot when an agent stops, and skates when it slows down — the legs and
 * the ground disagree, which the eye catches immediately even at sixty pixels.
 * The same reasoning as the vehicle suspension bob in `VehicleView`.
 */
export const STRIDES_PER_METRE = 0.75;

/** The speed a full-amplitude stride corresponds to, m/s. */
const REFERENCE_SPEED = 1.35;

/**
 * Pose the rig for an actor that has walked `travelled` metres at `speed`.
 *
 * Written into a caller-supplied pose, because the renderer calls this for every
 * visible pedestrian every frame and must not allocate.
 *
 * `speed` scales the amplitude rather than the frequency. Frequency comes from
 * distance, so a slowing agent takes shorter strides at the same strides-per-
 * metre — which is what slowing down looks like. Scaling frequency instead would
 * have them take the same size steps more slowly, which reads as wading.
 */
export function poseWalk(travelled: number, speed: number, pose: RigPose): RigPose {
  const phase = travelled * STRIDES_PER_METRE * Math.PI * 2;
  // Clamped, so a speed above the reference does not swing the limbs past the
  // point where they read as legs.
  const amplitude = Math.min(1, Math.max(0, speed / REFERENCE_SPEED));

  const swing = Math.sin(phase);
  // Twice the stride frequency: the body rises once per step, not once per
  // stride, and a stride is two steps.
  const bob = Math.cos(phase * 2) * BOB_HEIGHT * amplitude;

  for (const part of RIG_PARTS) {
    const rest = REST[part];
    const transform = pose[part];
    transform.offsetX = rest.x;
    transform.offsetY = rest.y + bob;
    transform.rotation = 0;
  }

  pose.legLeft.rotation = swing * LEG_SWING * amplitude;
  pose.legRight.rotation = -swing * LEG_SWING * amplitude;
  // Arms counter-swing against the legs. Without it the figure walks like a
  // toy soldier, which is the single most obvious thing a bad walk cycle does.
  pose.armLeft.rotation = -swing * ARM_SWING * amplitude;
  pose.armRight.rotation = swing * ARM_SWING * amplitude;

  // The head stays level. A head that bobbed with the body reads as a limp.
  pose.head.offsetY = REST.head.y + bob * 0.3;

  return pose;
}

/**
 * The standing pose — everything at rest, no bob.
 *
 * Not `poseWalk(x, 0, pose)`: at zero speed that leaves the limbs at rest but
 * keeps whatever phase they were at, so a figure stopping mid-stride would snap
 * its legs together. This is what an agent that has arrived looks like.
 */
export function poseIdle(pose: RigPose): RigPose {
  for (const part of RIG_PARTS) {
    const rest = REST[part];
    const transform = pose[part];
    transform.offsetX = rest.x;
    transform.offsetY = rest.y;
    transform.rotation = 0;
  }
  return pose;
}
