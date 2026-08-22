import { describe, expect, it } from 'vitest';
import { ARCHETYPE_SPECS } from '@config/archetypes';
import { vehicleBrakeFrame, vehicleFrame } from '@config/sprites';

/**
 * The brake-frame resolver — consolidation pass. Brake lights exist only
 * where they can be seen (rear-facing headings); everywhere else the caller
 * keeps the default frame, and an out-of-range archetype falls back to the
 * sedan exactly as `vehicleFrame` always has.
 */
describe('vehicleBrakeFrame', () => {
  it('names a brake frame for every rear-facing heading, for every archetype', () => {
    for (let archetype = 0; archetype < ARCHETYPE_SPECS.length; archetype++) {
      for (const direction of ['n', 'ne', 'nw'] as const) {
        const frame = vehicleBrakeFrame(archetype, direction);
        expect(frame).toBe(`${ARCHETYPE_SPECS[archetype]?.textureStem ?? ''}_brake_${direction}@2x.png`);
      }
    }
  });

  it('returns null wherever the lights cannot be seen', () => {
    for (const direction of ['e', 'w', 's', 'se', 'sw'] as const) {
      expect(vehicleBrakeFrame(0, direction)).toBeNull();
    }
  });

  it('falls back to the sedan for an archetype index that does not exist', () => {
    expect(vehicleBrakeFrame(999, 'n')).toBe('veh_sedan_brake_n@2x.png');
    expect(vehicleFrame(999, 'n')).toBe('veh_sedan_default_n@2x.png');
  });
});
