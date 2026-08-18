import { describe, expect, it } from 'vitest';
import { AssetRegistry } from '@render/AssetRegistry';
import type { AtlasSheetData } from '@render/AssetRegistry';

/**
 * The frame catalogue, exercised without a renderer.
 *
 * `AssetRegistry` is deliberately Phaser-free so the questions the scene asks —
 * does this frame exist, where are its feet, which page is it on — are
 * answerable in Node. The anchor-to-origin arithmetic is the part with a wrong
 * answer available: an origin computed against the wrong denominator puts every
 * sprite's feet somewhere else, which the depth sorter then faithfully sorts.
 */

const SHEET: AtlasSheetData = {
  textures: [
    {
      image: 'vehicles.webp',
      size: { w: 512, h: 256 },
      frames: [
        {
          filename: 'veh_sedan_default_se@2x.png',
          frame: { x: 4, y: 4, w: 340, h: 221 },
          sourceSize: { w: 340, h: 221 },
        },
        {
          filename: 'veh_sedan_default_e@2x.png',
          frame: { x: 350, y: 4, w: 100, h: 50 },
          sourceSize: { w: 100, h: 50 },
        },
      ],
    },
  ],
  anchors: {
    'veh_sedan_default_se@2x.png': { x: 170, y: 143 },
    // The `e` frame deliberately has no anchor entry.
  },
};

function registry(): AssetRegistry {
  const target = new AssetRegistry();
  target.register('vehicles', SHEET);
  return target;
}

describe('AssetRegistry', () => {
  it('answers existence, page and size for what it was given', () => {
    const assets = registry();
    expect(assets.has('veh_sedan_default_se@2x.png')).toBe(true);
    expect(assets.has('veh_sedan_default_n@2x.png')).toBe(false);
    expect(assets.frameCount).toBe(2);
    expect(assets.atlasOf('veh_sedan_default_se@2x.png')).toBe('vehicles');
    expect(assets.atlasOf('nope')).toBeUndefined();
    expect(assets.info('veh_sedan_default_se@2x.png')?.width).toBe(340);
  });

  it('turns the pixel anchor into a 0..1 origin against the frame, not the page', () => {
    const info = registry().info('veh_sedan_default_se@2x.png');
    // 170 of 340 across, 143 of 221 down — the frame's own box. Dividing by the
    // page size instead would have been the plausible-looking wrong answer.
    expect(info?.originX).toBeCloseTo(0.5, 5);
    expect(info?.originY).toBeCloseTo(143 / 221, 5);
  });

  it('stands an anchorless frame on its bottom centre', () => {
    const info = registry().info('veh_sedan_default_e@2x.png');
    expect(info?.originX).toBe(0.5);
    expect(info?.originY).toBe(1);
  });

  it('resolves the first candidate that exists, and undefined when none do', () => {
    const assets = registry();
    // The braking-car shape: prefer a frame that does not exist, settle for one
    // that does.
    expect(assets.resolve('veh_sedan_default_se_brake@2x.png', 'veh_sedan_default_se@2x.png')).toBe(
      'veh_sedan_default_se@2x.png',
    );
    expect(assets.resolve(undefined, 'nope')).toBeUndefined();
  });

  it('records the atlases that failed, sorted, and lists frames sorted', () => {
    const assets = registry();
    assets.markMissing('nature');
    assets.markMissing('fx');
    expect(assets.missingAtlases).toEqual(['fx', 'nature']);
    expect(assets.list()).toEqual(['veh_sedan_default_e@2x.png', 'veh_sedan_default_se@2x.png']);
  });

  it('ignores a sheet with no texture block rather than throwing', () => {
    const assets = new AssetRegistry();
    assets.register('broken', { textures: [] });
    expect(assets.frameCount).toBe(0);
  });
});
