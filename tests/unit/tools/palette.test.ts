import { describe, expect, it } from 'vitest';
import { SURFACE_COLORS } from '@config/surfaces';
import { distanceSq, loadPalette, nearest, parseHex } from '../../../tools/asset-pipeline/palette.ts';

/**
 * The palette is the style contract, so its properties are asserted, not assumed.
 *
 * Everything downstream leans on this file: the validator rejects art that
 * strays from it, the renderer paints its provisional surfaces from it, and the
 * generation prompt attaches it. A palette with a duplicated slot or an
 * unreachable colour weakens all three quietly.
 */
describe('the locked palette', () => {
  const palette = loadPalette();

  it('holds exactly the 48 colours the contract calls for', () => {
    expect(palette.colors).toHaveLength(48);
    expect(palette.spec.size).toBe(48);
  });

  it('is twelve four-step ramps', () => {
    expect(palette.spec.ramps).toHaveLength(12);
    for (const ramp of palette.spec.ramps) {
      expect(ramp.colors, ramp.id).toHaveLength(4);
    }
  });

  it('carries the thresholds the validator uses', () => {
    // ASSET_PIPELINE §4.3 step 4: ">= 92% of pixels within delta 8".
    expect(palette.spec.tolerance).toBe(8);
    expect(palette.spec.coverage).toBe(0.92);
  });

  it('gives every colour a purpose', () => {
    for (const color of palette.colors) {
      expect(color.use.length, color.id).toBeGreaterThan(0);
    }
  });

  it('keeps every entry further apart than the validator tolerance', () => {
    // Two entries closer than `tolerance` would be one target wearing two names:
    // any pixel near one is near the other, so one of the 48 slots does nothing.
    let closest = Number.POSITIVE_INFINITY;
    let pair = '';
    for (let i = 0; i < palette.rgb.length; i++) {
      for (let j = i + 1; j < palette.rgb.length; j++) {
        const a = palette.rgb[i];
        const b = palette.rgb[j];
        if (a === undefined || b === undefined) continue;
        const d = Math.sqrt(distanceSq(a, b));
        if (d < closest) {
          closest = d;
          pair = `${palette.colors[i]?.id} / ${palette.colors[j]?.id}`;
        }
      }
    }
    expect(closest, `closest pair is ${pair}`).toBeGreaterThan(palette.spec.tolerance);
  });

  it('rejects a malformed hex loudly', () => {
    expect(() => parseHex('#fff')).toThrow(/not an uppercase/);
    expect(() => parseHex('#12345g')).toThrow();
    // Lowercase is rejected too: the file is compared by eye against a colour
    // picker, and two spellings of one colour is how a duplicate gets in.
    expect(() => parseHex('#aabbcc')).toThrow();
  });

  it('finds a colour as its own nearest entry', () => {
    const first = palette.rgb[0];
    if (first === undefined) throw new Error('empty palette');
    expect(nearest(palette, first)).toEqual({ index: 0, distanceSq: 0 });
  });
});

/**
 * Colour-blind safety, ASSET_PIPELINE §12.
 *
 * Not every pair of 48 colours can survive a dichromatic simulation — a palette
 * that did would be grey. What must survive is every pair the *game* uses to
 * mean different things, because §12's rule is that no state is signalled by
 * colour alone and the palette should not undermine what little colour does say.
 */
describe('colour-blind separation', () => {
  const palette = loadPalette();

  const byId = (id: string): { r: number; g: number; b: number } => {
    const index = palette.colors.findIndex((color) => color.id === id);
    const rgb = palette.rgb[index];
    if (rgb === undefined) throw new Error(`no palette colour ${id}`);
    return rgb;
  };

  /**
   * Brettel/Viénot-style dichromacy simulation, linearised sRGB.
   *
   * The matrices are the widely used Viénot-Brettel-Mollon approximations. They
   * are an approximation of a spectrum of real conditions, which is the point:
   * a pair that survives them is not thereby proven accessible, but a pair that
   * collapses under them is proven not to be.
   */
  const simulate = (
    color: { r: number; g: number; b: number },
    kind: 'protan' | 'deutan' | 'tritan',
  ): { r: number; g: number; b: number } => {
    const linear = (v: number): number => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const encode = (v: number): number => {
      const clamped = Math.min(1, Math.max(0, v));
      const s = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
      return s * 255;
    };
    const [r, g, b] = [linear(color.r), linear(color.g), linear(color.b)];
    const m = {
      protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
      deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04204, 0.969779],
      tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
    }[kind];
    return {
      r: encode((m[0] ?? 0) * r + (m[1] ?? 0) * g + (m[2] ?? 0) * b),
      g: encode((m[3] ?? 0) * r + (m[4] ?? 0) * g + (m[5] ?? 0) * b),
      b: encode((m[6] ?? 0) * r + (m[7] ?? 0) * g + (m[8] ?? 0) * b),
    };
  };

  // The pairs that carry meaning: success against danger, danger against
  // warning, and the two skin families, which must stay distinguishable or the
  // cast reads as one person.
  //
  // This test picked the palette's UI colours rather than merely approving them.
  // The first draft used foliage-500 for success, and foliage-500 against
  // crimson-500 separates by only 22.6 units under deuteranopia — success and
  // danger, the one pair that must never be confusable. foliage-300, the lit
  // step, clears it by 74. The palette moved; the threshold did not.
  const MEANINGFUL_PAIRS: readonly (readonly [string, string])[] = [
    ['foliage-300', 'crimson-500'],
    ['crimson-500', 'amber-500'],
    ['foliage-300', 'amber-500'],
    ['skinWarm-500', 'skinDeep-500'],
    ['azure-500', 'amber-500'],
  ];

  for (const kind of ['protan', 'deutan', 'tritan'] as const) {
    it(`keeps meaningful pairs apart under ${kind}opia`, () => {
      for (const [a, b] of MEANINGFUL_PAIRS) {
        const separation = Math.sqrt(distanceSq(simulate(byId(a), kind), simulate(byId(b), kind)));
        // Comfortably above the validator's own 8-unit tolerance: if two colours
        // are within that under simulation they are the same swatch to that eye.
        expect(separation, `${a} vs ${b} under ${kind}opia`).toBeGreaterThan(24);
      }
    });
  }
});

/**
 * The renderer draws provisional surfaces in code. They must be palette colours.
 *
 * `src/config` may not import anything from the project, so the link between
 * `surfaces.ts` and `palette.json` cannot be expressed in types. It is expressed
 * here instead: change one without the other and this fails.
 */
describe('renderer surface colours', () => {
  const palette = loadPalette();

  for (const [name, value] of Object.entries(SURFACE_COLORS)) {
    it(`${name} is an exact palette entry`, () => {
      const rgb = { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
      const match = nearest(palette, rgb);
      expect(match.distanceSq, `${name} #${value.toString(16)} is off-palette`).toBe(0);
    });
  }
});
