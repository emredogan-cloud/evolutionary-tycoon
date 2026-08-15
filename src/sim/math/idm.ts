import { IDM } from '@config/traffic';

/**
 * IDM-lite car following — GAME_DESIGN_DOCUMENT §9.2.
 *
 *   a      = a_max * (1 - (v/v0)^4 - (s_star/gap)^2)
 *   s_star = s_min + max(0, v*T + v*dv / (2*sqrt(a_max*b)))
 *
 * Two terms, and the whole character of the road comes from their interaction.
 * The free-road term accelerates towards the desired speed; the interaction term
 * pushes back based on how much closer the vehicle is than it wants to be. The
 * square on `s_star/gap` is what makes it react mildly at distance and hard up
 * close.
 *
 * **The emergent behaviour is the point.** A single vehicle braking makes the one
 * behind brake slightly harder, and that amplifies backwards into a visible
 * accordion wave — real traffic does this, and it is most of why the road will
 * look alive rather than scripted. `tests/unit/sim/traffic/idm.test.ts` asserts
 * the wave actually propagates upstream, because it is a property that would
 * otherwise be quietly tuned away.
 *
 * There is no collision physics and none is needed. The model keeps a positive
 * gap because closing it drives acceleration sharply negative; the tests assert
 * that rather than trusting it.
 */

const SQRT_2AB = 2 * Math.sqrt(IDM.maxAccel * IDM.comfortBrake);

/**
 * Desired dynamic gap, metres.
 *
 * `closingSpeed` is positive when catching the leader up. The term is clamped at
 * zero so that pulling away from a leader never *reduces* the desired gap below
 * the standstill minimum plus the time headway.
 */
export function desiredGap(speed: number, closingSpeed: number): number {
  const dynamic = speed * IDM.timeHeadway + (speed * closingSpeed) / SQRT_2AB;
  return IDM.minGap + Math.max(0, dynamic);
}

/**
 * Acceleration in m/s².
 *
 * `gap` is bumper-to-bumper distance to the leader; pass `Infinity` for a clear
 * road. A non-positive gap means the model has already been violated — it
 * returns maximum braking rather than a NaN or a wild number, so one bad frame
 * cannot poison the simulation.
 */
export function idmAcceleration(
  speed: number,
  desiredSpeed: number,
  gap: number,
  leaderSpeed: number,
  accelFactor = 1,
): number {
  const maxAccel = IDM.maxAccel * accelFactor;
  const freeRoad = 1 - (speed / desiredSpeed) ** 4;

  if (!Number.isFinite(gap)) {
    return clampAccel(maxAccel * freeRoad);
  }
  if (gap <= 0) return -IDM.maxBrake;

  const closing = speed - leaderSpeed;
  const target = desiredGap(speed, closing);
  const interaction = (target / gap) ** 2;

  return clampAccel(maxAccel * (freeRoad - interaction));
}

/**
 * Bounds acceleration to what a vehicle can physically do.
 *
 * Without the lower bound the interaction term is unbounded as the gap tends to
 * zero, which produces a single enormous negative acceleration, a vehicle thrown
 * backwards past its leader, and a permanently broken lane order.
 */
function clampAccel(value: number): number {
  if (value < -IDM.maxBrake) return -IDM.maxBrake;
  if (value > IDM.maxAccel * 2) return IDM.maxAccel * 2;
  return value;
}
