import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_SLOWING_METRES,
  arrivalSpeed,
  blendSteering,
  SEPARATION_RADIUS_METRES,
  SEPARATION_WEIGHT,
  separationFrom,
} from '@sim/nav/steering';

const out = { x: 0, y: 0 };

/**
 * The three forces, in isolation.
 *
 * Steering is where an agent stops being a pathfinding result and starts being
 * something a player watches, so the failures here are aesthetic before they are
 * functional — and the aesthetic ones are the reason the roadmap says not to
 * implement RVO. A crowd that negotiates produces a plausible scrum, and a scrum
 * is not a queue.
 */
describe('separation', () => {
  it('pushes away from a neighbour, harder the closer they are', () => {
    separationFrom(0, 0, 0.6, 0, out);
    const gentle = Math.hypot(out.x, out.y);
    expect(out.x).toBeLessThan(0); // away from the neighbour
    expect(out.y).toBeCloseTo(0, 9);

    separationFrom(0, 0, 0.1, 0, out);
    expect(Math.hypot(out.x, out.y)).toBeGreaterThan(gentle);
  });

  it('falls to nothing exactly at the radius, not a step short of it', () => {
    /*
     * A discontinuity here is visible: an agent crossing the boundary would get
     * a sudden shove rather than a growing one, which reads as a flinch.
     */
    expect(separationFrom(0, 0, SEPARATION_RADIUS_METRES - 0.001, 0, out)).toBe(true);
    expect(Math.hypot(out.x, out.y)).toBeLessThan(0.01);

    expect(separationFrom(0, 0, SEPARATION_RADIUS_METRES, 0, out)).toBe(false);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('ignores a neighbour standing on exactly the same point', () => {
    /*
     * There is no direction to push along, and inventing one here would need an
     * ordering this function has no business knowing. The caller breaks that tie
     * on slot index; this reports honestly that it cannot help.
     */
    expect(separationFrom(3, 4, 3, 4, out)).toBe(false);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('is symmetric — two agents push each other apart equally', () => {
    separationFrom(0, 0, 0.3, 0.4, out);
    const first = { x: out.x, y: out.y };
    separationFrom(0.3, 0.4, 0, 0, out);
    expect(out.x).toBeCloseTo(-first.x, 9);
    expect(out.y).toBeCloseTo(-first.y, 9);
  });
});

describe('blending', () => {
  it('returns a unit vector, because the caller multiplies it by a speed', () => {
    expect(blendSteering(1, 0, 0, 1, out)).toBe(true);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 9);
  });

  it('lets the flow win over a sideways push', () => {
    /*
     * Separation that overpowers the flow produces two agents orbiting each
     * other in a doorway forever, each knocked off course by the other and
     * neither making progress — a deadlock that looks like politeness.
     */
    blendSteering(1, 0, 0, 1, out);
    expect(Math.abs(out.x), 'separation overpowered the flow').toBeGreaterThan(Math.abs(out.y));
    expect(SEPARATION_WEIGHT).toBeLessThan(1);
  });

  it('bends the path rather than ignoring the neighbour', () => {
    // The other half of the same balance: a push that changed nothing would let
    // agents walk through each other.
    blendSteering(1, 0, 0, 1, out);
    expect(Math.abs(out.y), 'separation did nothing at all').toBeGreaterThan(0.1);
  });

  it('refuses to move when the two cancel exactly', () => {
    /*
     * Rare, and not an error: the agent is being pushed precisely against where
     * it wants to go. "Do not move this tick" is the honest answer; a direction
     * picked to break the tie would send it somewhere neither force asked for.
     */
    expect(blendSteering(1, 0, -1 / SEPARATION_WEIGHT, 0, out)).toBe(false);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe('arrival', () => {
  it('runs at full speed until the target is close', () => {
    expect(arrivalSpeed(1.35, 10)).toBe(1.35);
    expect(arrivalSpeed(1.35, ARRIVAL_SLOWING_METRES)).toBe(1.35);
  });

  it('eases down inside the slowing distance', () => {
    // Without it an agent walks at full pace into a queue slot and stops dead,
    // which reads as a puppet being switched off.
    const half = arrivalSpeed(1.35, ARRIVAL_SLOWING_METRES / 2);
    expect(half).toBeLessThan(1.35);
    expect(half).toBeGreaterThan(0);
    expect(arrivalSpeed(1.35, 0.05)).toBeLessThan(half);
  });

  it('never eases down to nothing', () => {
    /*
     * A floor of 15%. Scaling linearly all the way to zero means an agent a
     * millimetre from its slot approaches it asymptotically and never arrives,
     * so the state machine never sees them get there.
     */
    expect(arrivalSpeed(1.35, 0)).toBeGreaterThan(0);
    expect(arrivalSpeed(1.35, 0.0001)).toBeGreaterThan(0.15);
  });

  it('is monotonic — closer is never faster', () => {
    let previous = arrivalSpeed(1.35, 0);
    for (let d = 0.05; d <= 3; d += 0.05) {
      const speed = arrivalSpeed(1.35, d);
      expect(speed).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = speed;
    }
  });
});
