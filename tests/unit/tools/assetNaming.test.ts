import { describe, expect, it } from 'vitest';
import { ASSET_CATEGORIES, ATLASES, SHARED_BUDGETS, assetCategory, atlasSpec } from '@config/assets';
import { DIRECTIONS, parseAssetName } from '../../../tools/asset-pipeline/naming.ts';
import { readPromptBlock } from '../../../tools/asset-pipeline/promptBlock.ts';
import {
  loadSubjectDimensions,
  resolveExpectation,
} from '../../../tools/asset-pipeline/subjectDimensions.ts';

/**
 * The filename contract of ASSET_PIPELINE §3.
 *
 * Every example in that section is parsed here. They are the specification, so
 * if one of them stops parsing the parser is wrong, not the document.
 */
describe('the naming convention', () => {
  const cases: readonly (readonly [string, Record<string, unknown>])[] = [
    ['char_body_male-01_se@2x.png', { subject: 'body', variant: 'male-01', direction: 'se', state: null }],
    ['char_head_female-03_se@2x.png', { subject: 'head', variant: 'female-03', direction: 'se' }],
    ['char_hair_short-02_se@2x.png', { subject: 'hair', variant: 'short-02', direction: 'se' }],
    ['char_arm-l_default_se@2x.png', { subject: 'arm-l', variant: 'default', direction: 'se' }],
    ['veh_sedan_red_ne@2x.png', { subject: 'sedan', variant: 'red', direction: 'ne', state: null }],
    ['veh_sedan_red_ne_brake@2x.png', { subject: 'sedan', direction: 'ne', state: 'brake' }],
    ['food_burger_default@2x.png', { subject: 'burger', variant: 'default', direction: null }],
    ['struct_grill_lv2@2x.png', { subject: 'grill', variant: 'lv2' }],
    ['struct_sign_large_lower@2x.png', { subject: 'sign', state: 'lower', splitPart: 'lower' }],
    ['struct_sign_large_upper@2x.png', { splitPart: 'upper' }],
    ['prop_table_round_4seat@2x.png', { variant: 'round', direction: null, state: '4seat' }],
    ['ground_stage2_tile-a@2x.png', { subject: 'stage2', variant: 'tile-a' }],
    ['fx_steam_soft@2x.png', { subject: 'steam', variant: 'soft' }],
    ['ui_icon_cash@2x.png', { subject: 'icon', variant: 'cash' }],
    ['sfx_car_brake_01.ogg', { subject: 'car', variant: 'brake', state: '01', scale: 1 }],
  ];

  for (const [filename, expected] of cases) {
    it(`parses ${filename}`, () => {
      const result = parseAssetName(filename);
      expect(result.ok, result.ok ? '' : result.reason).toBe(true);
      if (!result.ok) return;
      expect(result.name).toMatchObject(expected);
    });
  }

  it('groups the two halves of a split object', () => {
    const lower = parseAssetName('struct_sign_large_lower@2x.png');
    const upper = parseAssetName('struct_sign_large_upper@2x.png');
    expect(lower.ok && upper.ok).toBe(true);
    if (!lower.ok || !upper.ok) return;
    expect(lower.name.splitGroup).toBe(upper.name.splitGroup);
  });

  it('keeps direction out of audio names', () => {
    // A brake sound does not face north-east. `sfx_car_brake_01` is state `01`,
    // not a malformed direction.
    const result = parseAssetName('sfx_car_brake_01.ogg');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name.direction).toBeNull();
    expect(result.name.state).toBe('01');
  });

  it('accepts all eight compass directions and nothing else', () => {
    for (const direction of DIRECTIONS) {
      const result = parseAssetName(`veh_sedan_red_${direction}@2x.png`);
      expect(result.ok, direction).toBe(true);
    }
    const bad = parseAssetName('veh_sedan_red_north@2x.png');
    expect(bad.ok).toBe(true); // `north` is a valid *state*, just not a direction
    if (bad.ok) expect(bad.name.direction).toBeNull();
  });

  const rejected: readonly (readonly [string, RegExp])[] = [
    ['Char_Body_Male@2x.png', /does not match/],
    ['char body male@2x.png', /does not match/],
    ['char_body@2x.png', /does not match/],
    ['char_body_male-01_se.png', /does not match/],
    ['char_gövde_male@2x.png', /does not match/],
    ['weapon_sword_iron@2x.png', /unknown category "weapon"/],
    ['sfx_car_brake@2x.ogg', /does not match/],
    ['char_body_male_zz_qq@2x.png', /direction slot/],
    ['char_body_male-01_se@3x.png', /only @1x and @2x/],
    ['char_body_male-01_se@2x.gif', /does not match/],
  ];

  for (const [filename, reason] of rejected) {
    it(`rejects ${filename}`, () => {
      const result = parseAssetName(filename);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toMatch(reason);
    });
  }

  it('rejects an image name in an audio category and the reverse', () => {
    const image = parseAssetName('sfx_car_brake_01@2x.png');
    expect(image.ok).toBe(false);
    if (!image.ok) expect(image.reason).toMatch(/audio category but the name carries an @Nx/);

    const audio = parseAssetName('char_body_male.ogg');
    expect(audio.ok).toBe(false);
    if (!audio.ok) expect(audio.reason).toMatch(/requires an @Nx scale suffix/);
  });
});

/**
 * The category and atlas tables carry the §7 and §13 numbers into code. If a
 * budget row loses its home the report silently stops counting it.
 */
describe('the asset configuration', () => {
  it('gives every category a known atlas or none at all', () => {
    for (const category of ASSET_CATEGORIES) {
      if (category.atlas === null) continue;
      expect(atlasSpec(category.atlas), category.id).toBeDefined();
    }
  });

  it('accounts for every zero-budget category in the shared table', () => {
    // A zero budget with no entry here is a category whose bytes nothing counts.
    for (const category of ASSET_CATEGORIES) {
      if (category.budgetBytes > 0) continue;
      expect(SHARED_BUDGETS[category.id], `${category.id} has no budget and no owner`).toBeDefined();
    }
  });

  it('points every shared budget at a category that has one', () => {
    for (const [id, target] of Object.entries(SHARED_BUDGETS)) {
      expect(assetCategory(id), id).toBeDefined();
      expect(assetCategory(target)?.budgetBytes, `${id} -> ${target}`).toBeGreaterThan(0);
    }
  });

  it('sizes every atlas to a power of two', () => {
    // Not decoration: non-power-of-two textures lose mipmapping and, on some
    // mobile GPUs, wrap modes.
    const powerOfTwo = (value: number): boolean => (value & (value - 1)) === 0;
    for (const atlas of ATLASES) {
      expect(powerOfTwo(atlas.maxWidth), atlas.id).toBe(true);
      expect(powerOfTwo(atlas.maxHeight), atlas.id).toBe(true);
    }
  });

  it('ships a PNG fallback only for the boot atlas', () => {
    // §7: the loading screen must render under any circumstances; nothing after
    // it earns the extra bytes.
    expect(ATLASES.filter((atlas) => atlas.pngFallback).map((atlas) => atlas.id)).toEqual(['boot']);
  });

  it('resolves unknown ids to undefined instead of guessing', () => {
    expect(assetCategory('nope')).toBeUndefined();
    expect(atlasSpec('nope')).toBeUndefined();
  });
});

describe('the immutable prompt block', () => {
  it('matches the hash recorded in the document', () => {
    // The mechanism that makes "immutable" mean something: edit the block and
    // this fails until the hash is deliberately updated, and every asset in
    // MANIFEST.md still names the hash it was generated under.
    const block = readPromptBlock();
    expect(block.recordedHash).not.toBeNull();
    expect(block.hash).toBe(block.recordedHash);
  });

  it('states the parts of the style contract a generator must obey', () => {
    const block = readPromptBlock();
    for (const clause of [
      'STYLE',
      'CAMERA',
      'LIGHT',
      'OUTLINE',
      'PALETTE',
      'BACKGROUND',
      'ANCHOR',
      'HEIGHT LIMIT',
    ]) {
      expect(block.text, clause).toContain(clause);
    }
    expect(block.text).toContain('2:1 dimetric');
    expect(block.text).toContain('160px');
  });
});

describe('subject dimensions', () => {
  const table = loadSubjectDimensions();

  it('is authored at the production scale', () => {
    expect(table.scale).toBe(2);
  });

  it('cites a source for every declared subject', () => {
    for (const [key, subject] of Object.entries(table.worldObjects.subjects)) {
      expect(subject.source.length, key).toBeGreaterThan(0);
    }
  });

  it('declares subjects in metres, never in pixels', () => {
    // The distinction the whole file exists for: metres are facts about objects
    // and are checkable against the world; a pixel height would be an art
    // decision smuggled in as data.
    for (const [key, subject] of Object.entries(table.worldObjects.subjects)) {
      expect(subject.heightMetres, key).toBeGreaterThan(0);
      expect(subject.footprintX, key).toBeGreaterThan(0);
      expect(subject.footprintY, key).toBeGreaterThan(0);
      expect(subject, key).not.toHaveProperty('height');
    }
  });

  it('derives a sprite height that is taller than the world height', () => {
    // The trap that made v1 of this table wrong. A drawn isometric sprite
    // carries the projected ground diamond as well as the body, so it is always
    // taller than metres x 64 — dramatically so for wide objects.
    const sedan = resolveExpectation('veh/sedan', table);
    expect(sedan?.mode).toBe('reference');
    if (sedan?.mode !== 'reference') return;
    expect(sedan.bodyHeight).toBe(96); // 1.5 m x 32 x 2 — what §1.2 tabulates
    expect(sedan.height).toBe(301); // what is actually drawn
  });

  it('decides the split rule on body height, not sprite height', () => {
    // §1.4's 160 px is 2.5 m of object (src/config/actors.ts states this).
    // Measured against the sprite instead, every car would need splitting.
    const sedan = resolveExpectation('veh/sedan', table);
    const tree = resolveExpectation('nature/tree', table);
    expect(sedan?.mode === 'reference' && sedan.splitExpected).toBe(false);
    expect(tree?.mode === 'reference' && tree.splitExpected).toBe(true);
  });

  it('checks character parts against the assembled adult', () => {
    const head = resolveExpectation('char/head', table);
    expect(head?.mode).toBe('envelope');
    // 144, not §1.2's 128: an adult's drawn sprite includes the ground diamond.
    expect(head?.height).toBe(144);
  });

  it('checks icons against a fixed canvas instead of a projection', () => {
    const icon = resolveExpectation('ui/icon', table);
    expect(icon).toMatchObject({ mode: 'canvas', width: 128, height: 128 });
  });

  it('returns nothing for a subject nobody has declared', () => {
    expect(resolveExpectation('prop/umbrella', table)).toBeNull();
  });
});
