import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFixture } from '../../../tools/asset-pipeline/testFixtures.ts';
import type { FixtureOptions } from '../../../tools/asset-pipeline/testFixtures.ts';
import { resolveExpectation } from '../../../tools/asset-pipeline/subjectDimensions.ts';
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

/**
 * Fixtures are sized from the same derivation the validator checks against, so a
 * change to the projection moves both together and cannot silently invalidate
 * the suite. `margin` is the transparent border, hence the +4 on each axis.
 */
function sizeFor(subjectKey: string): { canvasWidth: number; canvasHeight: number } {
  const expectation = resolveExpectation(subjectKey);
  if (expectation === null) throw new Error(`no expectation for ${subjectKey}`);
  if (expectation.mode === 'canvas') {
    return { canvasWidth: expectation.width + 4, canvasHeight: expectation.height + 4 };
  }
  // Width is not what any size check looks at; keep it proportionate and legal.
  return {
    canvasWidth: Math.max(20, Math.round(expectation.height * 1.2)),
    canvasHeight: expectation.height + 4,
  };
}

const TABLE = 'prop_table_case@2x.png';
const base: FixtureOptions = { ...sizeFor('prop/table'), ramp: 'timber' };

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
    // 1.2 x 1.2 x 0.75 m projects to a 125 px sprite — not §1.2's 50 px, which
    // is the table's world height and says nothing about what is drawn.
    expect(result.bounds).toEqual({ width: 146, height: 125 });
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
    // 1.2 x 1.2 x 0.75 m projects to 125px +/-15%, so 60px is nowhere near it.
    const result = await check('prop_table_tall@2x.png', { canvasHeight: 64 });
    expect(finding(result, 'reference-height').ok).toBe(false);
    expect(finding(result, 'reference-height').detail).toMatch(/outside 106-144px/);
  });

  it('refuses a subject nobody has declared dimensions for', async () => {
    // An undeclared subject is an open decision, and passing it would close that
    // decision silently. Declaring metres is a fact; declaring pixels would not be.
    const result = await check('prop_umbrella_large@2x.png');
    expect(finding(result, 'reference-height').ok).toBe(false);
    expect(finding(result, 'reference-height').detail).toMatch(/nothing declared/);
    expect(finding(result, 'reference-height').detail).toMatch(/world dimensions in metres/);
  });

  it('uses an envelope where only the assembled height is known', async () => {
    // char/* has no per-part box — only "no part exceeds the assembled adult",
    // which is 144px drawn rather than §1.2's 128px world height.
    const result = await check('char_body_male-01_se@2x.png', sizeFor('char/head'));
    expect(finding(result, 'reference-height').ok).toBe(true);
    expect(finding(result, 'reference-height').detail).toMatch(/within the 144px assembled envelope/);
  });

  it('checks an icon against its declared canvas rather than a projection', async () => {
    const result = await check('ui_icon_cash@2x.png', { canvasWidth: 128, canvasHeight: 128, margin: 0 });
    expect(finding(result, 'reference-height').detail).toMatch(/matches the declared canvas/);
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
  it('fails an object whose BODY exceeds 160px and is not split', async () => {
    // struct/sign is 3.2 m -> 205px of body. §1.4's limit is 2.5 m of object,
    // so this must arrive as halves.
    const result = await check('struct_sign_large_whole@2x.png', sizeFor('struct/sign'));
    expect(finding(result, 'split-rule').ok).toBe(false);
    expect(finding(result, 'split-rule').detail).toMatch(/depth-sort cycles/);
    expect(finding(result, 'split-rule').detail).toMatch(/body height/);
  });

  it('accepts the same object when it is named as a half', async () => {
    const result = await check('struct_sign_large_lower@2x.png', sizeFor('struct/sign'));
    expect(finding(result, 'split-rule').ok).toBe(true);
  });

  it('does NOT split a car, which is long rather than tall', async () => {
    // The defect this check used to have. A sedan's sprite is 301px, but only
    // 96px of that is body — measured against the sprite, every vehicle in the
    // game would have been forced into halves.
    const result = await check('veh_sedan_default_se@2x.png', sizeFor('veh/sedan'));
    expect(finding(result, 'split-rule').ok).toBe(true);
    expect(finding(result, 'split-rule').detail).toMatch(/96px body height, within/);
  });

  it('rejects splitting an object that does not need it', async () => {
    const result = await check('prop_table_round_lower@2x.png', sizeFor('prop/table'));
    expect(finding(result, 'split-rule').ok).toBe(false);
    expect(finding(result, 'split-rule').detail).toMatch(/does not need it/);
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

  /**
   * A sign is 0.6 x 0.6 x 3.2 m: a 243px sprite of which 205px is body, so it
   * must be split. Each half is drawn complete on its own ground diamond, so the
   * two sprite heights sum to the object plus ONE extra diamond — which is why
   * the pair check subtracts the shared footprint before comparing.
   */
  const SIGN = { canvasWidth: 80, canvasHeight: 143 };

  it('fails a split object that is missing its other half', async () => {
    await writeFixture(setDir, 'struct_sign_large_lower@2x.png', { ...base, ...SIGN });
    const result = await validateDirectory(setDir);
    const split = result.setFindings.filter((entry) => !entry.ok);
    expect(split).toHaveLength(1);
    expect(split[0]?.detail).toMatch(/needs both halves/);
    expect(result.ok).toBe(false);
  });

  it('checks the pair against the projected height, less the shared footprint', async () => {
    await writeFixture(setDir, 'struct_sign_large_upper@2x.png', { ...base, ...SIGN });
    const result = await validateDirectory(setDir);
    const heights = result.setFindings.map((entry) => entry.detail).join(' ');
    // Two trimmed halves of 139px sum to 278; the sign's own diamond is 38px, so
    // the object measures 240 against a 243px expectation.
    expect(heights).toMatch(/halves total 240px \(278 less one shared footprint\)/);
    expect(result.setFindings.every((entry) => entry.ok)).toBe(true);
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
