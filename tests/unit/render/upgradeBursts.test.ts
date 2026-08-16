import { describe, expect, it } from 'vitest';
import { UPGRADES } from '@config/economy/upgrades';
import palette from '../../../docs/assets/palette.json' with { type: 'json' };
import { BURST_BY_FAMILY, burstFor, burstOffset } from '@render/fx/upgradeBursts';

/**
 * The per-family purchase burst — Phase 13.
 *
 * The roadmap asks for a burst that differs by family, so a player who buys
 * something while looking elsewhere still knows what kind of thing happened.
 * Three things have to hold for that to be true, and none of them is about
 * whether it looks nice.
 */

describe('every family has a burst, and no family is left with the fallback', () => {
  it('covers all five', () => {
    /*
     * `burstFor` falls back rather than throwing, because it runs from a
     * purchase event on a render frame and a missing row should cost a slightly
     * wrong sparkle rather than a black screen. That makes *this* the place an
     * unmapped family has to fail — otherwise the fallback would quietly become
     * the design.
     */
    const families = new Set(UPGRADES.map((item) => item.family));
    for (const family of families) {
      expect(BURST_BY_FAMILY[family], `${family} has no burst of its own`).toBeDefined();
    }
    expect(families.size).toBe(5);
  });

  it('gives each one a shape of its own, not only a colour', () => {
    /*
     * Colour alone fails for anyone who cannot separate two of them, and fails
     * again on a scene where every object is placeholder magenta. Shape and
     * direction survive both — which is why the five differ in motion.
     */
    const shapes = new Set(Object.values(BURST_BY_FAMILY).map((spec) => spec.shape));
    expect(shapes.size, 'two families share a shape').toBe(5);
  });

  it('draws only in palette colours', () => {
    // Same rule as the surface colours: a renderer painting outside the locked
    // palette makes the palette a document rather than a contract.
    const table = palette as { ramps: { colors: { hex: string }[] }[] };
    const allowed = new Set(
      table.ramps.flatMap((ramp) => ramp.colors.map((entry) => Number.parseInt(entry.hex.slice(1), 16))),
    );

    for (const [family, spec] of Object.entries(BURST_BY_FAMILY)) {
      expect(allowed.has(spec.colour), `${family} uses a colour off the palette`).toBe(true);
    }
  });
});

describe('the burst is a pure function of its inputs', () => {
  it('returns the same offset for the same particle at the same moment', () => {
    /*
     * Which is what lets a frozen scene photograph identically — the visual
     * goldens depend on it directly — and what keeps the effect out of the
     * simulation's way: nothing here reads a clock or a random number.
     */
    const spec = burstFor('KITCHEN');
    const first = { x: 0, y: 0 };
    const second = { x: 0, y: 0 };

    burstOffset(spec, 3, 0.42, first);
    burstOffset(spec, 3, 0.42, second);
    expect(second).toEqual(first);
  });

  it('starts at the anchor and travels away from it', () => {
    for (const [family, spec] of Object.entries(BURST_BY_FAMILY)) {
      const start = { x: 0, y: 0 };
      const end = { x: 0, y: 0 };
      burstOffset(spec, 2, 0, start);
      burstOffset(spec, 2, 1, end);

      expect(Math.hypot(start.x, start.y), `${family} does not start at the anchor`).toBeLessThan(0.001);
      expect(Math.hypot(end.x, end.y), `${family} never leaves the anchor`).toBeGreaterThan(0.3);
    }
  });

  it('keeps every particle inside a couple of metres', () => {
    // A burst that flew across the lot would read as a bug rather than as
    // feedback, and would sort against actors it has nothing to do with.
    for (const [family, spec] of Object.entries(BURST_BY_FAMILY)) {
      for (let index = 0; index < spec.particles; index++) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const out = { x: 0, y: 0 };
          burstOffset(spec, index, t, out);
          expect(
            Math.hypot(out.x, out.y),
            `${family} particle ${String(index)} at t=${String(t)}`,
          ).toBeLessThan(6);
        }
      }
    }
  });

  it('gives an unknown family something to draw rather than throwing', () => {
    const fallback = burstFor('NOT_A_FAMILY');
    expect(fallback.particles).toBeGreaterThan(0);
    expect(fallback.lifetimeMs).toBeGreaterThan(0);
  });
});
