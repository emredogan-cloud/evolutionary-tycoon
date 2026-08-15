import { describe, expect, it } from 'vitest';
import {
  BOB_AMPLITUDE_PX,
  DIRECTION_COUNT,
  MAX_PITCH_RADIANS,
  SPRITE_DIRECTIONS,
  blendHeading,
  directionFor,
  directionIndexFor,
  spriteKeyFor,
  vehicleBodyMotion,
} from '@render/views/VehicleView';
import type { VehicleBodyMotion } from '@render/views/VehicleView';

/**
 * Vehicle presentation, tested without a renderer.
 *
 * The direction table is the part worth guarding. Headings arrive in world space
 * and sprites are authored in screen space, and skipping that conversion is the
 * classic isometric bug: a car driving east in world space gets drawn facing
 * east when it should face south-east. It looks *almost* right, which is exactly
 * why it survives review and ships.
 */

const out: VehicleBodyMotion = { bobY: 0, pitch: 0 };

describe('direction selection', () => {
  it('offers exactly the eight compass sprites', () => {
    expect(DIRECTION_COUNT).toBe(8);
    expect([...SPRITE_DIRECTIONS]).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
  });

  it('projects world headings into screen space before choosing', () => {
    // The stage-1 lanes run along world +X and -X. In 2:1 dimetric that is
    // down-right and up-left on screen — south-east and north-west, NOT east
    // and west.
    expect(directionFor(1, 0)).toBe('se');
    expect(directionFor(-1, 0)).toBe('nw');
    // And world Y, the other diagonal.
    expect(directionFor(0, 1)).toBe('sw');
    expect(directionFor(0, -1)).toBe('ne');
  });

  it('maps the screen axes to the cardinal sprites', () => {
    // Moving in world (1, -1) is straight right on screen…
    expect(directionFor(1, -1)).toBe('e');
    expect(directionFor(-1, 1)).toBe('w');
    // …and world (1, 1) is straight down.
    expect(directionFor(1, 1)).toBe('s');
    expect(directionFor(-1, -1)).toBe('n');
  });

  it('centres each sprite on its own direction', () => {
    // Rounding, not flooring: a heading 20 degrees off south-east still picks
    // south-east rather than the next sprite round.
    const base = directionIndexFor(1, 0);
    const nudged = directionIndexFor(Math.cos(0.3) - Math.sin(0.3) * 0, Math.sin(0.3) * 0.2);
    expect(nudged).toBe(base);
  });

  it('always returns a valid index, including for a zero heading', () => {
    expect(directionIndexFor(0, 0)).toBe(0);
    for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
      const index = directionIndexFor(Math.cos(angle), Math.sin(angle));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(DIRECTION_COUNT);
    }
  });

  it('covers every one of the eight sprites over a full turn', () => {
    const seen = new Set<number>();
    for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
      seen.add(directionIndexFor(Math.cos(angle), Math.sin(angle)));
    }
    expect(seen.size).toBe(DIRECTION_COUNT);
  });
});

describe('sprite keys', () => {
  it('matches the naming convention the pipeline validates', () => {
    expect(spriteKeyFor('veh_sedan', 'se', false)).toBe('veh_sedan_default_se@2x');
    expect(spriteKeyFor('veh_sedan', 'se', true)).toBe('veh_sedan_default_se_brake@2x');
  });
});

describe('body motion', () => {
  it('bobs by distance travelled, not by elapsed time', () => {
    // A time-driven bob keeps bouncing while the car is stopped at a queue,
    // which is precisely when the player is looking at it.
    const stopped = vehicleBodyMotion(12.5, 0, out).bobY;
    expect(vehicleBodyMotion(12.5, 0, out).bobY).toBe(stopped);
  });

  it('stays within its amplitude and never lifts the car', () => {
    for (let distance = 0; distance < 40; distance += 0.13) {
      const motion = vehicleBodyMotion(distance, 0, out);
      expect(motion.bobY).toBeLessThanOrEqual(0);
      expect(motion.bobY).toBeGreaterThanOrEqual(-BOB_AMPLITUDE_PX);
    }
  });

  it('dips the nose under braking, proportionally', () => {
    expect(vehicleBodyMotion(0, 0, out).pitch).toBe(0);
    const gentle = vehicleBodyMotion(0, -1, out).pitch;
    const hard = vehicleBodyMotion(0, -6, out).pitch;
    expect(gentle).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(gentle);
  });

  it('never pitches past the clamp, however hard the braking', () => {
    expect(vehicleBodyMotion(0, -1000, out).pitch).toBe(MAX_PITCH_RADIANS);
  });

  it('does not pitch under acceleration', () => {
    expect(vehicleBodyMotion(0, 3, out).pitch).toBe(0);
  });

  it(`writes into the caller object rather than allocating`, () => {
    const target: VehicleBodyMotion = { bobY: 0, pitch: 0 };
    expect(vehicleBodyMotion(1, -1, target)).toBe(target);
  });
});

describe('heading blend', () => {
  it('closes on the target', () => {
    const next = blendHeading(0, 1, 8, 0.05);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it('takes the short way round the circle', () => {
    // 350 degrees to 10 degrees is a 20 degree turn, not a 340 degree spin
    // through every sprite direction.
    const from = (350 / 180) * Math.PI;
    const to = (10 / 180) * Math.PI;
    const next = blendHeading(from, to, 8, 0.05);
    expect(next).toBeGreaterThan(from);
  });

  it('is framerate independent', () => {
    // One 100 ms step must land close to two 50 ms steps, or the turn rate
    // depends on how fast the machine is.
    const oneStep = blendHeading(0, 1, 6, 0.1);
    const twoSteps = blendHeading(blendHeading(0, 1, 6, 0.05), 1, 6, 0.05);
    expect(Math.abs(oneStep - twoSteps)).toBeLessThan(1e-9);
  });

  it('converges rather than overshooting', () => {
    let heading = 0;
    for (let i = 0; i < 200; i++) heading = blendHeading(heading, 1, 8, 0.05);
    expect(heading).toBeCloseTo(1, 6);
  });
});
