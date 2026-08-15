import { describe, expect, it } from 'vitest';
import { ACTOR_KIND_SPECS } from '@config/actors';
import { ART_SCALE, TILE_H, TILE_W, TILE_Z } from '@config/world';
import { SPLIT_HEIGHT_LIMIT_PX } from '@config/assets';
import { isoSpriteMetrics, worldHeightPx } from '../../../tools/shared/spriteMetrics.ts';
import { emitPrompts } from '../../../tools/asset-pipeline/prompts.ts';
import { parseAssetName } from '../../../tools/asset-pipeline/naming.ts';
import {
  loadSubjectDimensions,
  resolveExpectation,
} from '../../../tools/asset-pipeline/subjectDimensions.ts';

/**
 * The derivation that three separate places used to get separately wrong.
 *
 * A drawn isometric sprite is taller than the object is, because the projection
 * also shows the ground footprint. ASSET_PIPELINE §1.2 tabulates the *world*
 * height; the validator measures the *drawn* sprite. Confusing the two passed
 * people by luck and would have rejected every vehicle.
 */
describe('sprite metrics', () => {
  it('adds the projected footprint to the body', () => {
    const car = isoSpriteMetrics({ footprintX: 4.5, footprintY: 1.9, heightMetres: 1.5 });
    expect(car.bodyHeight).toBe(96); // 1.5 m x 32 x 2 — the §1.2 quantity
    expect(car.footprintHeight).toBe(205); // (4.5 + 1.9) x 16 x 2
    expect(car.height).toBe(301);
    expect(car.width).toBe(410); // (4.5 + 1.9) x 32 x 2
  });

  it('separates the world height from the drawn height', () => {
    // The whole point, in one assertion: for a wide object these differ by 3x.
    expect(worldHeightPx(1.5)).toBe(96);
    expect(isoSpriteMetrics({ footprintX: 4.5, footprintY: 1.9, heightMetres: 1.5 }).height).toBe(301);
  });

  it('agrees with the projection constants rather than restating them', () => {
    const box = { footprintX: 1, footprintY: 3, heightMetres: 2 };
    const span = box.footprintX + box.footprintY;
    const metrics = isoSpriteMetrics(box);
    expect(metrics.width).toBe(span * (TILE_W / 2) * ART_SCALE);
    expect(metrics.height).toBe(span * (TILE_H / 2) * ART_SCALE + box.heightMetres * TILE_Z * ART_SCALE);
  });

  it('anchors at the centre of the ground diamond', () => {
    // Depth sorting reads this, so an error here is an error in every sort the
    // sprite takes part in.
    const metrics = isoSpriteMetrics({ footprintX: 2, footprintY: 2, heightMetres: 1 });
    expect(metrics.anchorX).toBe(metrics.width / 2);
    expect(metrics.anchorY).toBe(metrics.height - metrics.footprintHeight / 2);
  });

  it('never produces a degenerate sprite', () => {
    const tiny = isoSpriteMetrics({ footprintX: 0.01, footprintY: 0.01, heightMetres: 0.01 });
    expect(tiny.width).toBeGreaterThanOrEqual(4);
    expect(tiny.height).toBeGreaterThanOrEqual(4);
  });

  it('produces the committed placeholder sizes', () => {
    // The placeholder generator uses this function; these are the sizes actually
    // on disk, so the two cannot drift apart without a test failing.
    const expected: Record<string, [number, number]> = {
      'ph-customer': [64, 144],
      'ph-vehicle': [410, 301],
      'ph-prop-tall': [102, 205],
    };
    for (const spec of ACTOR_KIND_SPECS) {
      const size = expected[spec.textureKey];
      if (size === undefined) continue;
      const metrics = isoSpriteMetrics(spec);
      expect([metrics.width, metrics.height], spec.textureKey).toEqual(size);
    }
  });

  it('makes the 160px split limit mean 2.5 metres', () => {
    // src/config/actors.ts states this reading explicitly. It is only true of
    // the body: a sedan is 301px of sprite and needs no split.
    expect(worldHeightPx(2.5)).toBe(SPLIT_HEIGHT_LIMIT_PX);
  });
});

/**
 * The prompt emitter, which is the artefact that turns "generate the art" from a
 * hundred and sixty judgement calls into a mechanical pass.
 */
describe('production prompts', () => {
  const prompts = emitPrompts();

  it('covers the stage 1-2 set', () => {
    // The roadmap budgets ~160 for stages 1-2. This is that set plus the golden
    // references, and the number is asserted loosely on purpose — it is a sanity
    // bound, not a target to hit exactly.
    expect(prompts.length).toBeGreaterThan(140);
    expect(prompts.length).toBeLessThan(200);
  });

  it('emits only filenames the pipeline can parse', () => {
    // Enforced inside emitPrompts too, so this is belt and braces — but a batch
    // definition that produced an unparseable name would otherwise be discovered
    // only after someone had paid to generate it.
    for (const asset of prompts) {
      const parsed = parseAssetName(asset.file);
      expect(parsed.ok, `${asset.file}: ${parsed.ok ? '' : parsed.reason}`).toBe(true);
    }
  });

  it('emits no duplicate filenames', () => {
    const seen = new Set(prompts.map((asset) => asset.file));
    expect(seen.size).toBe(prompts.length);
  });

  it('starts with the golden references, which cite no reference of their own', () => {
    const golden = prompts.filter((asset) => asset.batch === 'golden-references');
    // §4.3 step 1 asks for 6-10, and they must come first.
    expect(golden.length).toBeGreaterThanOrEqual(6);
    expect(golden.length).toBeLessThanOrEqual(10);
    expect(prompts.slice(0, golden.length)).toEqual(golden);
    for (const asset of golden) {
      expect(asset.prompt).toContain('this IS the reference');
    }
  });

  it('carries the immutable block verbatim in every prompt', () => {
    // Consistency comes from the contract being identical every time, which is
    // only true if nobody retypes it.
    for (const asset of prompts) {
      expect(asset.prompt).toContain('2:1 dimetric isometric');
      expect(asset.prompt).toContain('Locked 48-colour palette');
      expect(asset.prompt).toContain('[SIZE HINT:');
    }
  });

  it('states a size the validator will actually accept', () => {
    // The size in the prompt and the size the validator checks come from one
    // derivation. When they were maintained separately they disagreed by 3x.
    const table = loadSubjectDimensions();
    for (const asset of prompts) {
      if (asset.size === null) continue;
      const expectation = resolveExpectation(asset.subjectKey, table);
      if (expectation?.mode === 'reference') expect(asset.size.height, asset.file).toBe(expectation.height);
      if (expectation?.mode === 'canvas') expect(asset.size.height, asset.file).toBe(expectation.height);
    }
  });

  it('asks for a split only where the body exceeds the limit', () => {
    const split = new Set(prompts.filter((asset) => asset.split).map((asset) => asset.subjectKey));
    // Tall things, and only tall things. A sedan is 301px of sprite and is not
    // here; a 5 m tree is.
    expect([...split].sort()).toEqual(['nature/pole', 'nature/tree', 'struct/sign', 'struct/truck']);
  });

  it('leaves no subject undeclared', () => {
    const undeclared = prompts.filter((asset) => asset.prompt.includes('UNDECLARED'));
    expect(undeclared.map((asset) => asset.subjectKey)).toEqual([]);
  });

  it('generates each category as one batch', () => {
    // §4.3 step 3: never one sprite at a time. Every asset belongs to a named
    // batch, and a batch is a single generation session.
    for (const asset of prompts) {
      expect(asset.batch.length, asset.file).toBeGreaterThan(0);
    }
    expect(new Set(prompts.map((asset) => asset.batch)).size).toBeGreaterThan(5);
  });
});
