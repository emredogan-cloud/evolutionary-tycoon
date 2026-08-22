import { describe, expect, it } from 'vitest';
import { buildDurationMs } from '@config/economy/upgrades';
import { vehicleBrakeFrame, vehicleFacingFix, vehicleFixFrame, vehicleFrame } from '@config/sprites';
import { ARCHETYPE_SPECS } from '@config/archetypes';

/**
 * The correction pass's config surfaces, branch by branch: the build-time
 * clamp and the facing-fix resolution the renderer trusts.
 */
describe('buildDurationMs', () => {
  it('holds the floor for free decor', () => {
    expect(buildDurationMs(0)).toBe(3_000);
  });

  it('scales with cost between the clamps', () => {
    // 1000 + 6*400 — the hand-painted sign's rung 1.
    expect(buildDurationMs(6)).toBe(3_400);
    expect(buildDurationMs(12)).toBe(5_800);
  });

  it('caps below the cheapest stage evolution', () => {
    expect(buildDurationMs(1_000)).toBe(12_000);
    // Stage 2's constructionMs is 12_000: an upgrade never outbuilds a stage.
    expect(buildDurationMs(1_000)).toBeLessThanOrEqual(12_000);
  });
});

describe('vehicleFacingFix', () => {
  const pickup = ARCHETYPE_SPECS.findIndex((spec) => spec.id === 'PICKUP_WORKER');
  const sedan = ARCHETYPE_SPECS.findIndex((spec) => spec.id === 'SEDAN_COMMUTER');
  const sports = ARCHETYPE_SPECS.findIndex((spec) => spec.id === 'SPORTS_CAR');

  it('redirects every disproven facing and leaves the truthful ones alone', () => {
    // The pickup has no unlit rear at all: every receding slot uses brake art.
    expect(vehicleFacingFix(pickup, 'n')).toEqual({ direction: 'n', brake: true });
    expect(vehicleFacingFix(pickup, 'ne')).toEqual({ direction: 'ne', brake: true });
    expect(vehicleFacingFix(pickup, 'nw')).toEqual({ direction: 'ne', brake: true, flip: true });
    // The sedan's nw is a genuine rear three-quarter — untouched.
    expect(vehicleFacingFix(sedan, 'nw')).toBeUndefined();
    expect(vehicleFacingFix(sedan, 'se')).toBeUndefined();
    // The sports car's se ships the checkerboard; s and its mirror serve it.
    expect(vehicleFacingFix(sports, 'se')).toEqual({ direction: 's', flip: true });
    expect(vehicleFacingFix(sports, 'sw')).toEqual({ direction: 's' });
  });

  it('falls back to the sedan stem for an out-of-range archetype', () => {
    // The sedan's own table applies, so the fallback is observable.
    expect(vehicleFacingFix(9999, 'n')).toEqual({ direction: 'nw' });
    expect(vehicleFrame(9999, 'se')).toContain('veh_sedan');
  });

  it('resolves fix frames through the brake and default stems', () => {
    expect(vehicleFixFrame(pickup, { direction: 'ne', brake: true, flip: true })).toBe(
      'veh_pickup_brake_ne@2x.png',
    );
    expect(vehicleFixFrame(sedan, { direction: 'nw' })).toBe('veh_sedan_default_nw@2x.png');
    expect(vehicleFixFrame(9999, { direction: 'n', brake: true })).toBe('veh_sedan_brake_n@2x.png');
  });

  it('keeps brake frames rear-facing only', () => {
    expect(vehicleBrakeFrame(sedan, 'se')).toBeNull();
    expect(vehicleBrakeFrame(sedan, 'ne')).toBe('veh_sedan_brake_ne@2x.png');
    expect(vehicleBrakeFrame(9999, 'n')).toBe('veh_sedan_brake_n@2x.png');
  });
});
