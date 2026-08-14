import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTOR_KIND_SPECS } from '@config/actors';
import { placeholderTextures } from '@render/placeholderTextures';
import { placeholderSpecs, renderPlaceholder } from '../../../tools/placeholders/generate';

const PLACEHOLDER_DIR = resolve(import.meta.dirname, '../../../assets/_placeholder');

/**
 * The placeholder set: committed, deterministic, and obviously wrong.
 *
 * Two jobs. The determinism assertion is a rehearsal for Phase 4, where the real
 * asset pipeline must produce the same bytes from the same source or CDN caching
 * breaks. The drift assertion means the committed images cannot quietly stop
 * matching the world dimensions they were derived from — a placeholder at the
 * wrong size is a layout that has to be redone when the real art arrives.
 */
describe('placeholder generation', () => {
  it('produces byte-identical output for the same input', () => {
    // Same guarantee Phase 4's pipeline has to give, exercised early on a
    // smaller surface.
    for (const spec of placeholderSpecs()) {
      expect(renderPlaceholder(spec).equals(renderPlaceholder(spec))).toBe(true);
    }
  });

  it('matches the committed files exactly', () => {
    for (const spec of placeholderSpecs()) {
      const path = resolve(PLACEHOLDER_DIR, `${spec.key}__PLACEHOLDER__.png`);
      expect(existsSync(path), `${path} is missing`).toBe(true);
      expect(
        renderPlaceholder(spec).equals(readFileSync(path)),
        `${spec.key} has drifted from the generator — regenerate rather than hand-editing`,
      ).toBe(true);
    }
  });

  it('writes a real PNG', () => {
    const spec = placeholderSpecs()[0];
    if (spec === undefined) throw new Error('no placeholder specs');
    const png = renderPlaceholder(spec);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x08 + 2]);
    expect(png.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect(png.subarray(png.length - 8, png.length - 4).toString('latin1')).toBe('IEND');
  });

  it('names every file so it cannot be mistaken for real art', () => {
    // WORKING_DISCIPLINE §7: using a placeholder is fine, hiding one is not.
    // The build counts these by filename.
    const files = readdirSync(PLACEHOLDER_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file, `${file} does not announce itself as a placeholder`).toContain('__PLACEHOLDER__');
    }
  });

  it('covers every kind in the render catalogue', () => {
    const generated = new Set(placeholderSpecs().map((spec) => spec.key));
    for (const kind of ACTOR_KIND_SPECS) {
      expect(generated.has(kind.textureKey), `no placeholder for ${kind.name}`).toBe(true);
    }
  });

  it('derives its size from the world dimensions, not from typed-in numbers', () => {
    const specs = placeholderSpecs();
    const person = specs.find((spec) => spec.key === 'ph-customer');
    const vehicle = specs.find((spec) => spec.key === 'ph-vehicle');
    if (person === undefined || vehicle === undefined) throw new Error('missing specs');

    // A sedan is 4.5 x 1.9 m and a person 0.5 x 0.5, so the vehicle's footprint
    // diamond is far wider. If someone changes the world dimensions and forgets
    // the art, this is what notices.
    expect(vehicle.width).toBeGreaterThan(person.width * 5);
    expect(person.height).toBeGreaterThan(person.width);
  });

  it('puts the sprite origin exactly on the generator’s anchor', () => {
    // The depth sorter anchors at the footprint centre and the renderer sets the
    // sprite origin from the same geometry. Computed twice, in two modules, so
    // they are asserted to agree — a mismatch here shifts every sprite by a few
    // pixels and reads as "the art is misaligned".
    const specs = new Map(placeholderSpecs().map((spec) => [spec.key, spec]));

    for (const texture of placeholderTextures()) {
      const spec = specs.get(texture.key);
      if (spec === undefined) throw new Error(`no generator spec for ${texture.key}`);
      expect(texture.originX * spec.width).toBeCloseTo(spec.anchorX, 0);
      expect(texture.originY * spec.height).toBeCloseTo(spec.anchorY, 0);
    }
  });
});
