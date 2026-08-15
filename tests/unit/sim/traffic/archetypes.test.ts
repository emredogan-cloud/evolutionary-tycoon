import { describe, expect, it } from 'vitest';
import { ARCHETYPE_SPECS } from '@config/archetypes';

/**
 * The archetype table.
 *
 * Order is load-bearing: `VehicleStore.archetype` stores an index into this
 * array and that index is hashed into the world digest, so inserting one in the
 * middle silently changes every existing replay and save. Append only.
 */
describe('archetypes', () => {
  it('declares the four the roadmap puts in Phase 5, in order', () => {
    expect(ARCHETYPE_SPECS.map((spec) => spec.id)).toEqual([
      'SEDAN_COMMUTER',
      'PICKUP_WORKER',
      'FAMILY_VAN',
      'MOTORCYCLE',
    ]);
  });

  it('uses real dimensions, matching the render catalogue', () => {
    // The traffic model works in metres, so a fudge here is a spacing bug on
    // screen and a physics bug in Phase 6's maneuvers.
    const sedan = ARCHETYPE_SPECS[0];
    expect(sedan?.lengthMetres).toBeCloseTo(4.5, 5);
    for (const spec of ARCHETYPE_SPECS) {
      expect(spec.lengthMetres, spec.id).toBeGreaterThan(1.5);
      expect(spec.lengthMetres, spec.id).toBeLessThan(7);
      expect(spec.desiredSpeed, spec.id).toBeGreaterThan(5);
      expect(spec.desiredSpeed, spec.id).toBeLessThan(25);
    }
  });

  it('gives every archetype a speed spread', () => {
    // Zero variance is what turns a road into a conveyor belt: every vehicle
    // converges to the same speed and the spacing becomes uniform.
    for (const spec of ARCHETYPE_SPECS) {
      expect(spec.speedVariance, spec.id).toBeGreaterThan(0);
      expect(spec.speedVariance, spec.id).toBeLessThan(0.4);
    }
  });

  it('gives every archetype a 24-entry hourly bias', () => {
    for (const spec of ARCHETYPE_SPECS) {
      expect(spec.hourBias, spec.id).toHaveLength(24);
      for (const value of spec.hourBias) expect(value, spec.id).toBeGreaterThan(0);
    }
  });

  it('has base shares that sum to one', () => {
    const total = ARCHETYPE_SPECS.reduce((sum, spec) => sum + spec.baseShare, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('names a texture stem that matches the asset naming convention', () => {
    for (const spec of ARCHETYPE_SPECS) {
      expect(spec.textureStem, spec.id).toMatch(/^veh_[a-z]+$/);
    }
  });
});
