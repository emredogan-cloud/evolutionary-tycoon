import { describe, expect, it } from 'vitest';
import { ACTOR_KIND_SPECS, actorKindSpec } from '@config/actors';
import { STAGE1_LAYOUT } from '@config/layouts/stage1';
import { CAMERA, RENDER_LAYERS, TILE_H, TILE_W, TILE_Z } from '@config/world';

/**
 * The world's dimensions, asserted rather than trusted.
 *
 * These numbers bind every later phase — traffic spawns on these lanes,
 * pedestrians navigate this lot, the asset pipeline authors against this tile
 * size, and every golden frames this geometry. A typo here is a gameplay bug
 * three phases later, so the invariants are checked where they are cheap.
 */

describe('projection geometry', () => {
  it('is 2:1 dimetric', () => {
    expect(TILE_W).toBe(2 * TILE_H);
  });

  it('makes one metre of height as tall as one tile', () => {
    // Keeps a 1 m step visually equal to one tile of depth, which is what lets
    // the art be authored against a single grid.
    expect(TILE_Z).toBe(TILE_H);
  });
});

describe('render layers', () => {
  it('lists the nine documented layers in draw order', () => {
    expect([...RENDER_LAYERS]).toEqual([
      'sky',
      'ground',
      'road',
      'scatter',
      'actors',
      'overheadFx',
      'lighting',
      'worldUi',
      'domOverlay',
    ]);
  });

  it('puts actors between the static ground and the effects above it', () => {
    const index = (name: string): number => RENDER_LAYERS.indexOf(name as 'actors');
    expect(index('scatter')).toBeLessThan(index('actors'));
    expect(index('actors')).toBeLessThan(index('overheadFx'));
    expect(index('worldUi')).toBeLessThan(index('domOverlay'));
  });
});

describe('camera limits', () => {
  it('brackets the default zoom', () => {
    expect(CAMERA.minZoom).toBeLessThan(CAMERA.defaultZoom);
    expect(CAMERA.defaultZoom).toBeLessThan(CAMERA.maxZoom);
  });

  it('matches the documented 0.6x–1.8x range', () => {
    expect(CAMERA.minZoom).toBe(0.6);
    expect(CAMERA.maxZoom).toBe(1.8);
  });

  it('zooms by more than a rounding error per wheel notch', () => {
    expect(CAMERA.wheelZoomStep).toBeGreaterThan(1.05);
  });
});

describe('the stage-1 layout', () => {
  it('is the documented 24 x 18 metre lot', () => {
    const { lot } = STAGE1_LAYOUT;
    expect(lot.maxX - lot.minX).toBe(24);
    expect(lot.maxY - lot.minY).toBe(18);
  });

  it('runs two lanes in opposite directions', () => {
    const [east, west] = STAGE1_LAYOUT.road.lanes;
    expect(STAGE1_LAYOUT.road.lanes).toHaveLength(2);
    expect(east?.heading).toBe('east');
    expect(west?.heading).toBe('west');
    expect((east?.points[0]?.x ?? 0) < (east?.points[1]?.x ?? 0)).toBe(true);
    expect((west?.points[0]?.x ?? 0) > (west?.points[1]?.x ?? 0)).toBe(true);
  });

  it('extends the lanes past the lot so vehicles enter and leave off-screen', () => {
    for (const lane of STAGE1_LAYOUT.road.lanes) {
      const xs = lane.points.map((p) => p.x);
      expect(Math.min(...xs)).toBeLessThan(STAGE1_LAYOUT.lot.minX);
      expect(Math.max(...xs)).toBeGreaterThan(STAGE1_LAYOUT.lot.maxX);
    }
  });

  it('keeps both lanes inside the road surface', () => {
    const ys = STAGE1_LAYOUT.road.lanes.flatMap((lane) => lane.points.map((p) => p.y));
    const centre = (Math.min(...ys) + Math.max(...ys)) / 2;
    const halfWidth = STAGE1_LAYOUT.road.widthMetres / 2;
    for (const y of ys) {
      expect(Math.abs(y - centre)).toBeLessThanOrEqual(halfWidth);
    }
  });

  it('gives drivers room to decide before the counter', () => {
    expect(STAGE1_LAYOUT.road.decisionPointMetres).toBeGreaterThan(0);
    // Far enough out that converting reads as a choice rather than a teleport.
    expect(STAGE1_LAYOUT.road.decisionPointMetres).toBeGreaterThan(5);
  });

  it('places the pull-in between the road and the counter', () => {
    const roadY = Math.max(...STAGE1_LAYOUT.road.lanes.flatMap((l) => l.points.map((p) => p.y)));
    expect(STAGE1_LAYOUT.pullIn.y).toBeGreaterThan(roadY);
    expect(STAGE1_LAYOUT.counter.y).toBeGreaterThan(STAGE1_LAYOUT.pullIn.y);
  });

  it('keeps every static object inside the lot', () => {
    const { lot } = STAGE1_LAYOUT;
    for (const object of STAGE1_LAYOUT.statics) {
      expect(object.x, `${object.objectId} is off the lot`).toBeGreaterThanOrEqual(lot.minX);
      expect(object.x).toBeLessThanOrEqual(lot.maxX);
      expect(object.y).toBeGreaterThanOrEqual(lot.minY);
      expect(object.y).toBeLessThanOrEqual(lot.maxY);
    }
  });

  it('references only textures that exist in the catalogue', () => {
    const keys = new Set(ACTOR_KIND_SPECS.map((spec) => spec.textureKey));
    for (const object of STAGE1_LAYOUT.statics) {
      expect(keys.has(object.objectId), `no texture for ${object.objectId}`).toBe(true);
    }
  });

  it('gives the camera some margin beyond the lot', () => {
    expect(STAGE1_LAYOUT.cameraMarginMetres).toBeGreaterThan(0);
  });
});

describe('the render catalogue', () => {
  it('resolves every kind by index', () => {
    for (let i = 0; i < ACTOR_KIND_SPECS.length; i++) {
      expect(actorKindSpec(i)).toBe(ACTOR_KIND_SPECS[i]);
    }
  });

  it('rejects an unknown kind loudly', () => {
    // A silent fallback would draw the wrong sprite and look like an art bug.
    expect(() => actorKindSpec(-1)).toThrow(RangeError);
    expect(() => actorKindSpec(ACTOR_KIND_SPECS.length)).toThrow(RangeError);
  });

  it('gives every kind a positive footprint and height', () => {
    for (const spec of ACTOR_KIND_SPECS) {
      expect(spec.footprintX, spec.name).toBeGreaterThan(0);
      expect(spec.footprintY, spec.name).toBeGreaterThan(0);
      expect(spec.heightMetres, spec.name).toBeGreaterThan(0);
    }
  });

  it('uses real-world dimensions', () => {
    // The traffic model works in metres, so a fudge here becomes a physics bug
    // in Phase 5 rather than an art problem.
    const vehicle = ACTOR_KIND_SPECS.find((spec) => spec.name === 'vehicle');
    const customer = ACTOR_KIND_SPECS.find((spec) => spec.name === 'customer');
    expect(vehicle?.footprintX).toBeCloseTo(4.5, 5);
    expect(vehicle?.footprintY).toBeCloseTo(1.9, 5);
    expect(customer?.heightMetres).toBeCloseTo(1.75, 5);
  });

  it('gives every kind a distinct texture key', () => {
    const keys = ACTOR_KIND_SPECS.map((spec) => spec.textureKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
