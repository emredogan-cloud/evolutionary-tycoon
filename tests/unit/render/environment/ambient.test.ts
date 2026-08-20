import { describe, expect, it } from 'vitest';
import { ambientAt, nightIntensityAt } from '@render/environment/ambient';

/**
 * The ambient curve — the arithmetic half of the lighting pass, testable
 * without a canvas. The visual half is pinned by the environment goldens.
 */

describe('the day/night ambient', () => {
  it('is fully dark at deep night and fully clear at noon', () => {
    expect(nightIntensityAt(23)).toBe(1);
    expect(nightIntensityAt(2)).toBe(1);
    expect(nightIntensityAt(12)).toBe(0);
    expect(ambientAt(12).alpha).toBe(0);
    expect(ambientAt(0).alpha).toBeGreaterThan(0.4);
  });

  it('fades continuously through dawn and dusk — no popping', () => {
    // Sampled at 6-minute steps; adjacent alphas never jump. A discontinuity
    // here is a sky that visibly pops once a day and gets misread as a bug.
    let previous = ambientAt(0).alpha;
    for (let hour = 0.1; hour <= 24; hour += 0.1) {
      const next = ambientAt(hour).alpha;
      expect(Math.abs(next - previous)).toBeLessThan(0.05);
      previous = next;
    }
  });

  it('night ramps down across dawn and up across dusk', () => {
    expect(nightIntensityAt(5)).toBeGreaterThan(nightIntensityAt(7));
    expect(nightIntensityAt(18)).toBeGreaterThan(nightIntensityAt(17.2));
    expect(nightIntensityAt(20.5)).toBeGreaterThan(nightIntensityAt(18));
  });
});
