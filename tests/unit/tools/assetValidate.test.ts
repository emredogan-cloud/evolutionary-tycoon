import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFixture } from '../../../tools/asset-pipeline/testFixtures.ts';
import type { FixtureOptions } from '../../../tools/asset-pipeline/testFixtures.ts';
import {
  CHECKS,
  metaPathFor,
  validateAsset,
  validateDirectory,
} from '../../../tools/asset-pipeline/validate.ts';
import type { AssetValidation, CheckId } from '../../../tools/asset-pipeline/validate.ts';

/**
 * Every one of the nine checks, proven to pass on good input and **fail on bad**.
 *
 * The second half is the half that matters. A validator that has only been run
 * on things it accepts is not evidence of anything — it is a function that
 * returns true. Each case below breaks exactly one rule and asserts that exactly
 * that check reports it, which is also what makes the output useful to whoever
 * has to fix the asset.
 *
 * The fixtures are synthetic (`tools/asset-pipeline/testFixtures.ts`) and derived
 * from the palette, so they cannot go stale against it. No production art exists
 * — the Phase 4 licence gate is open — and none is needed to prove the pipeline.
 */

let dir: string;

const TABLE = 'prop_table_case@2x.png';
const base: FixtureOptions = { canvasWidth: 70, canvasHeight: 54, ramp: 'timber' };

async function check(
  filename: string,
  options: Partial<FixtureOptions> = {},
  anchor?: { x: number; y: number } | null,
): Promise<AssetValidation> {
  const path = await writeFixture(dir, filename, { ...base, ...options }, anchor);
  return validateAsset(path);
}

function finding(result: AssetValidation, id: CheckId): { ok: boolean; detail: string } {
  const match = result.findings.find((entry) => entry.check === id);
  if (match === undefined)
    throw new Error(`no finding for ${id}; got ${result.findings.map((f) => f.check).join(', ')}`);
  return { ok: match.ok, detail: match.detail };
}

/** Which checks failed, so a case can assert it broke one rule and not others. */
function failed(result: AssetValidation): CheckId[] {
  return result.findings.filter((entry) => !entry.ok).map((entry) => entry.check);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'et-validate-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('a compliant asset', () => {
  it('passes all nine checks', async () => {
    const result = await check(TABLE);
    expect(failed(result)).toEqual([]);
    expect(result.ok).toBe(true);
    // Every check ran. A check that silently does not appear is a check that is
    // not protecting anything.
    expect(new Set(result.findings.map((entry) => entry.check))).toEqual(new Set(CHECKS));
  });

  it('reports the trimmed size', async () => {
    const result = await check(TABLE);
    expect(result.bounds).toEqual({ width: 66, height: 50 });
  });
});

describe('check 1 — transparent background', () => {
  it('fails when the background is baked in', async () => {
    const result = await check('prop_table_opaque@2x.png', { opaqueBackground: true });
    expect(finding(result, 'transparent-background').ok).toBe(false);
    expect(finding(result, 'transparent-background').detail).toMatch(/corners are not transparent/);
  });
});

describe('check 2 — alpha coverage', () => {
  it('fails when the subject is lost in an oversized canvas', async () => {
    // A 50px subject in a 400px canvas: 12.5% on the dominant axis.
    const result = await check('prop_table_lost@2x.png', {
      canvasWidth: 400,
      canvasHeight: 400,
      margin: 175,
    });
    expect(failed(result)).toContain('alpha-coverage');
    expect(finding(result, 'alpha-coverage').detail).toMatch(/lost in empty space/);
  });

  it('fails a fully transparent image before anything else can', async () => {
    const path = await writeFixture(dir, 'prop_table_empty@2x.png', { ...base, margin: 100 });
    const result = await validateAsset(path);
    expect(result.ok).toBe(false);
    expect(finding(result, 'alpha-coverage').detail).toMatch(/fully transparent/);
  });
});

describe('check 3 — palette compliance', () => {
  it('fails on a colour that is nowhere near the palette', async () => {
    const result = await check('prop_table_offpalette@2x.png', { offPalette: true });
    expect(finding(result, 'palette-compliance').ok).toBe(false);
    expect(finding(result, 'palette-compliance').detail).toMatch(/furthest pixel is/);
  });

  it('reports the measured percentage either way', async () => {
    const result = await check(TABLE);
    expect(finding(result, 'palette-compliance').detail).toMatch(/100\.00% of \d+ opaque pixels/);
  });
});

describe('check 4 — reference height', () => {
  it('fails a table that is the wrong height', async () => {
    // The reference is 50px +/-15%; 90px is nowhere near it.
    const result = await check('prop_table_tall@2x.png', { canvasHeight: 94 });
    expect(finding(result, 'reference-height').ok).toBe(false);
    expect(finding(result, 'reference-height').detail).toMatch(/outside 43-57px/);
  });

  it('refuses a subject nobody has declared a height for', async () => {
    // `nature/tree` is on the pending list in referenceHeights.json. An
    // undeclared height is an open art decision, and passing it would close that
    // decision silently.
    const result = await check('nature_tree_oak@2x.png');
    expect(finding(result, 'reference-height').ok).toBe(false);
    expect(finding(result, 'reference-height').detail).toMatch(/no reference height declared/);
  });

  it('uses an envelope where only the assembled height is known', async () => {
    // char/* has no per-part height, only "no part exceeds the 128px adult".
    const result = await check('char_body_male-01_se@2x.png');
    expect(finding(result, 'reference-height').ok).toBe(true);
    expect(finding(result, 'reference-height').detail).toMatch(/within the 128px envelope/);
  });
});

describe('check 5 — light direction', () => {
  it('fails when the key light comes from the wrong side', async () => {
    const result = await check('prop_table_backlit@2x.png', { reverseLight: true });
    expect(finding(result, 'light-direction').ok).toBe(false);
    expect(finding(result, 'light-direction').detail).toMatch(/not coming from the upper left/);
  });

  it('fails a flat fill, which has no light in it at all', async () => {
    const result = await check('prop_table_flat@2x.png', { flat: true });
    expect(finding(result, 'light-direction').ok).toBe(false);
  });
});

describe('check 6 — the split rule', () => {
  it('fails a sprite taller than 160px with no _lower/_upper', async () => {
    const result = await check('struct_door_single@2x.png', { canvasHeight: 200 });
    expect(finding(result, 'split-rule').ok).toBe(false);
    expect(finding(result, 'split-rule').detail).toMatch(/depth-sort cycles/);
  });

  it('accepts the same height when it is named as a half', async () => {
    const result = await check('struct_sign_large_lower@2x.png', { canvasHeight: 200 });
    expect(finding(result, 'split-rule').ok).toBe(true);
  });
});

describe('check 7 — naming', () => {
  it('rejects a name it cannot parse, and checks nothing else', async () => {
    const path = await writeFixture(dir, 'NotAnAsset.png', base);
    const result = await validateAsset(path);
    expect(result.ok).toBe(false);
    // Only the naming finding: a file whose category is unknown has no budget,
    // no reference height and no atlas, so reporting seven more failures would
    // bury the one that matters.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.check).toBe('naming');
  });

  it('rejects an unknown category by name', async () => {
    const path = await writeFixture(dir, 'weapon_sword_iron@2x.png', base);
    const result = await validateAsset(path);
    expect(result.findings[0]?.detail).toMatch(/unknown category "weapon"/);
  });
});

describe('check 8 — anchor', () => {
  it('fails when the sidecar is missing', async () => {
    const result = await check('prop_table_noanchor@2x.png', {}, null);
    expect(finding(result, 'anchor').ok).toBe(false);
    expect(finding(result, 'anchor').detail).toMatch(/footprint anchor is required/);
  });

  it('fails when the anchor is outside the image', async () => {
    const result = await check('prop_table_wildanchor@2x.png', {}, { x: 5000, y: 5000 });
    expect(finding(result, 'anchor').ok).toBe(false);
    expect(finding(result, 'anchor').detail).toMatch(/wrong depth sort everywhere/);
  });

  it('fails on a malformed sidecar rather than assuming a default', async () => {
    const path = await writeFixture(dir, 'prop_table_badmeta@2x.png', base);
    writeFileSync(metaPathFor(path), '{ "anchor": { "x": "left" } }');
    const result = await validateAsset(path);
    expect(finding(result, 'anchor').detail).toMatch(/no numeric/);
  });

  it('fails on unparseable JSON', async () => {
    const path = await writeFixture(dir, 'prop_table_brokenmeta@2x.png', base);
    writeFileSync(metaPathFor(path), '{ not json');
    const result = await validateAsset(path);
    expect(finding(result, 'anchor').detail).toMatch(/not valid JSON/);
  });
});

describe('check 9 — file budget', () => {
  it('passes a small sprite', async () => {
    const result = await check(TABLE);
    expect(finding(result, 'file-budget').ok).toBe(true);
  });

  it('notes when a category shares another category budget', async () => {
    // `food` has no budget of its own; §13 folds it into `ui`.
    const result = await check('food_burger_default@2x.png');
    expect(finding(result, 'file-budget').detail).toMatch(/shares another category's budget/);
  });
});

describe('non-image categories', () => {
  it('checks the budget and claims nothing about pixels', async () => {
    const path = join(dir, 'sfx_car_brake_01.ogg');
    writeFileSync(path, Buffer.alloc(1024));
    const result = await validateAsset(path);
    // Reporting "transparent background: pass" on a sound file would be a lie in
    // a report someone is going to trust.
    expect(result.findings.map((entry) => entry.check)).toEqual(['naming', 'file-budget']);
    expect(result.ok).toBe(true);
  });
});

describe('set-level checks', () => {
  let setDir: string;

  beforeAll(() => {
    setDir = mkdtempSync(join(tmpdir(), 'et-validate-set-'));
  });
  afterAll(() => {
    rmSync(setDir, { recursive: true, force: true });
  });

  it('fails a split object that is missing its other half', async () => {
    await writeFixture(setDir, 'struct_sign_large_lower@2x.png', { ...base, canvasHeight: 110 });
    const result = await validateDirectory(setDir);
    const split = result.setFindings.filter((entry) => !entry.ok);
    expect(split).toHaveLength(1);
    expect(split[0]?.detail).toMatch(/needs both halves/);
    expect(result.ok).toBe(false);
  });

  it('checks the pair against the reference height, not each half', async () => {
    // 200px sign, +/-15% -> 170-230. Two halves of 106px trimmed sum to 212.
    await writeFixture(setDir, 'struct_sign_large_upper@2x.png', { ...base, canvasHeight: 110 });
    const result = await validateDirectory(setDir);
    expect(result.setFindings.every((entry) => entry.ok)).toBe(true);
    expect(result.setFindings.some((entry) => entry.detail.includes('halves total 212px'))).toBe(true);
  });

  it('reports zero checked for an empty directory rather than passing quietly', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'et-validate-empty-'));
    const result = await validateDirectory(empty);
    expect(result.checked).toBe(0);
    expect(result.assets).toEqual([]);
    rmSync(empty, { recursive: true, force: true });
  });

  it('returns nothing for a directory that does not exist', async () => {
    const result = await validateDirectory(join(dir, 'no-such-directory'));
    expect(result.checked).toBe(0);
    expect(result.ok).toBe(true);
  });
});
