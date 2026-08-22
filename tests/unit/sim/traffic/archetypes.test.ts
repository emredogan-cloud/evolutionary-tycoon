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
  it('declares all ten, in append-only order — the last six waiting on art', () => {
    // The order is hashed (VehicleStore.archetype indexes this array), so this
    // is the append-only guarantee in test form. The Phase 15 six carry zero
    // share until their art exists; the shares are asserted below.
    expect(ARCHETYPE_SPECS.map((spec) => spec.id)).toEqual([
      'SEDAN_COMMUTER',
      'PICKUP_WORKER',
      'FAMILY_VAN',
      'MOTORCYCLE',
      'SPORTS_CAR',
      'TRUCK_LONGHAUL',
      'BUS_TOUR',
      'EV_MODERN',
      'VIP_LIMO',
      'EMERGENCY',
    ]);
  });

  it('puts the whole fleet on the road, now that its art exists', () => {
    /*
     * The predecessor of this test held the six at zero share until their
     * sprites landed, and named its own deletion moment: "when the art lands,
     * flipping a share makes this fail". The 2026-08-21 delivery landed all
     * six (validated, 0 failing), the shares flipped 2026-08-22, and this is
     * the deliberate replacement: every archetype carries weight, and the
     * original four keep over ninety percent of the mix — the fleet is
     * variety, not a re-balance (the balance gate ran green in this commit).
     */
    for (const spec of ARCHETYPE_SPECS) {
      expect(spec.baseShare, spec.id + ' share').toBeGreaterThan(0);
    }
    const originals = ARCHETYPE_SPECS.slice(0, 4).reduce((sum, spec) => sum + spec.baseShare, 0);
    expect(originals).toBeGreaterThan(0.9);
  });

  it('uses real dimensions, matching the render catalogue', () => {
    // The traffic model works in metres, so a fudge here is a spacing bug on
    // screen and a physics bug in Phase 6's maneuvers.
    const sedan = ARCHETYPE_SPECS[0];
    expect(sedan?.lengthMetres).toBeCloseTo(4.5, 5);
    for (const spec of ARCHETYPE_SPECS) {
      // The bus and the long-haul rig are legitimately longer than any car;
      // the ceiling is the design's own longest subject, not the sedan's.
      expect(spec.lengthMetres, spec.id).toBeGreaterThan(1.5);
      expect(spec.lengthMetres, spec.id).toBeLessThan(12);
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
