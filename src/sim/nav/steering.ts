/**
 * Local steering — GAME_DESIGN_DOCUMENT §10, and deliberately not RVO.
 *
 * Three forces, in this order of authority: where the flow field says to go,
 * away from whoever is too close, and slower as the destination arrives. That
 * is the whole model, and the roadmap is explicit that it should stay that way:
 * agents must not walk through each other, but they must not shove each other
 * either — in a doorway they **queue**, and the queue is a list of named
 * positions rather than an emergent property of a collision solver.
 *
 * A full reciprocal-velocity model would be more correct and would look worse.
 * Crowds that negotiate produce a plausible scrum, and a scrum is not a queue; a
 * player has to be able to count the line at a glance to understand why their
 * conversion rate dropped.
 *
 * ## Everything here is pure
 *
 * Positions in, a direction out, written into a caller-supplied object. The
 * system that owns the agents applies it. That keeps the arithmetic testable
 * without a world, which is the same reason `idm.ts` is shaped this way.
 */

export interface SteerOutput {
  x: number;
  y: number;
}

/**
 * How close two people get before they push apart, in metres.
 *
 * A person is 0.5 m across, so 0.7 m leaves a little air. Larger and a queue
 * cannot form at the authored slot spacing; smaller and they visibly overlap.
 */
export const SEPARATION_RADIUS_METRES = 0.7;

/**
 * How hard the push is, relative to the flow direction.
 *
 * Below the flow's own weight on purpose. Separation that overpowers the flow
 * produces two agents orbiting each other in a doorway forever, each pushed off
 * course by the other and neither making progress — a deadlock that looks like
 * politeness.
 */
export const SEPARATION_WEIGHT = 0.6;

/** Distance over which an agent eases to a stop, in metres. */
export const ARRIVAL_SLOWING_METRES = 1.2;

/**
 * Blend the flow direction with a separation push.
 *
 * `separationX/Y` is the accumulated push from neighbours — see
 * `accumulateSeparation`. The result is normalised, because the caller
 * multiplies it by a speed and a tick duration.
 *
 * Returns false when the two cancel out exactly. That is rare and it is not an
 * error: it means an agent is being pushed precisely against where it wants to
 * go, and the honest answer is "do not move this tick" rather than a direction
 * picked to break the tie.
 */
export function blendSteering(
  flowX: number,
  flowY: number,
  separationX: number,
  separationY: number,
  out: SteerOutput,
): boolean {
  const x = flowX + separationX * SEPARATION_WEIGHT;
  const y = flowY + separationY * SEPARATION_WEIGHT;
  const length = Math.hypot(x, y);

  if (length < 1e-6) {
    out.x = 0;
    out.y = 0;
    return false;
  }

  out.x = x / length;
  out.y = y / length;
  return true;
}

/**
 * The push one neighbour contributes.
 *
 * Falls off linearly to nothing at `SEPARATION_RADIUS_METRES`, so a neighbour
 * just outside the radius contributes nothing at all rather than a small
 * discontinuous nudge. Accumulated by the caller across neighbours.
 *
 * Two agents at exactly the same point produce no push — there is no direction
 * to push along. The caller breaks that tie by entity id, because doing it here
 * would need an ordering this function has no business knowing about.
 */
export function separationFrom(
  agentX: number,
  agentY: number,
  otherX: number,
  otherY: number,
  out: SteerOutput,
): boolean {
  const dx = agentX - otherX;
  const dy = agentY - otherY;
  const distance = Math.hypot(dx, dy);

  if (distance >= SEPARATION_RADIUS_METRES || distance < 1e-6) {
    out.x = 0;
    out.y = 0;
    return false;
  }

  const strength = 1 - distance / SEPARATION_RADIUS_METRES;
  out.x = (dx / distance) * strength;
  out.y = (dy / distance) * strength;
  return true;
}

/**
 * Speed scaled down as the target arrives.
 *
 * Without it an agent walks at full pace into its queue slot and stops dead,
 * which reads as a puppet being switched off. The curve is linear because
 * anything cleverer is invisible over 1.2 m.
 */
export function arrivalSpeed(fullSpeed: number, distanceToTarget: number): number {
  if (distanceToTarget >= ARRIVAL_SLOWING_METRES) return fullSpeed;
  // A floor of 15%, so an agent a millimetre away still closes the gap rather
  // than asymptotically approaching it and never arriving.
  const scale = Math.max(0.15, distanceToTarget / ARRIVAL_SLOWING_METRES);
  return fullSpeed * scale;
}
