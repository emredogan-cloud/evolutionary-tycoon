import { describe, expect, it } from 'vitest';
import { TILE_H, TILE_W, TILE_Z } from '@config/world';
import {
  screenHeightOfWorldZ,
  screenToWorld,
  worldRectToScreenBounds,
  worldToScreen,
} from '@render/iso/IsoProjection';
import { Rng } from '@sim/core/Rng';

const point = { x: 0, y: 0 };
const world = { x: 0, y: 0, z: 0 };

describe('worldToScreen', () => {
  it('places the origin at the origin', () => {
    expect(worldToScreen(0, 0, 0, point)).toEqual({ x: 0, y: 0 });
  });

  it('turns the world X axis into a down-right diagonal', () => {
    // This is why the road looks diagonal without being diagonal in world space.
    expect(worldToScreen(1, 0, 0, point)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
  });

  it('turns the world Y axis into a down-left diagonal', () => {
    expect(worldToScreen(0, 1, 0, point)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
  });

  it('raises height straight up the screen', () => {
    expect(worldToScreen(0, 0, 1, point)).toEqual({ x: 0, y: -TILE_Z });
    expect(screenHeightOfWorldZ(2)).toBe(2 * TILE_Z);
  });

  it('keeps a tile twice as wide as it is tall', () => {
    // The 2:1 property the whole art pipeline is authored against: one step
    // along a world axis moves twice as far across the screen as down it.
    const east = { ...worldToScreen(1, 0, 0, point) };
    const south = { ...worldToScreen(0, 1, 0, point) };
    expect(Math.abs(east.x)).toBe(2 * Math.abs(east.y));
    expect(Math.abs(south.x)).toBe(2 * Math.abs(south.y));
    expect(TILE_W).toBe(2 * TILE_H);
  });

  it('writes into the caller’s object rather than allocating', () => {
    const target = { x: -1, y: -1 };
    expect(worldToScreen(3, 4, 0, target)).toBe(target);
  });
});

describe('screenToWorld', () => {
  it('inverts worldToScreen at z = 0', () => {
    worldToScreen(7, 3, 0, point);
    screenToWorld(point.x, point.y, 0, world);
    expect(world.x).toBeCloseTo(7, 12);
    expect(world.y).toBeCloseTo(3, 12);
    expect(world.z).toBe(0);
  });

  it('round-trips 10 000 random points to within 1e-9', () => {
    // The tolerance the roadmap asks for. A half-tile drift at the edge of a
    // zoomed-out lot is what makes hit boxes "feel wrong" without ever being
    // reported as a projection bug.
    const rng = Rng.fromSeed(20260815, 'projection');
    let worstError = 0;

    for (let i = 0; i < 10_000; i++) {
      const x = rng.range(-500, 500);
      const y = rng.range(-500, 500);
      const z = rng.range(-10, 10);

      worldToScreen(x, y, z, point);
      screenToWorld(point.x, point.y, z, world);

      worstError = Math.max(worstError, Math.abs(world.x - x), Math.abs(world.y - y));
    }

    expect(worstError, `worst round-trip error ${worstError}`).toBeLessThan(1e-9);
  });

  it('picks a point on the assumed height plane, not the one it was projected from', () => {
    // Screen space has two dimensions and the world has three, so a screen point
    // is a line through the world; assumedZ chooses where along it to land.
    //
    // Raising an object moves it *up* the screen, and up the screen reads as
    // further away. Re-interpreted on the ground plane it therefore lands
    // further back — a smaller x + y, not a larger one. Clicking the head of a
    // tall sprite selects the ground behind it, which is exactly why ground
    // picking passes assumedZ = 0 and not the object's own height.
    worldToScreen(5, 5, 2, point);
    screenToWorld(point.x, point.y, 0, world);

    expect(world.z).toBe(0);
    expect(world.x + world.y).toBeLessThan(10);
    // Exactly two world units of height, converted at TILE_Z per unit and split
    // evenly between x and y because the raise is straight up the screen.
    expect(world.x + world.y).toBeCloseTo(10 - (2 * TILE_Z) / (TILE_H / 2), 12);
  });

  it('inverts consistently at a non-zero assumed height', () => {
    worldToScreen(-4.25, 11.5, 1.5, point);
    screenToWorld(point.x, point.y, 1.5, world);
    expect(world.x).toBeCloseTo(-4.25, 12);
    expect(world.y).toBeCloseTo(11.5, 12);
  });
});

describe('worldRectToScreenBounds', () => {
  const bounds = { left: 0, top: 0, right: 0, bottom: 0 };

  it('matches the extent of the four projected corners', () => {
    const result = { ...worldRectToScreenBounds(0, 0, 24, 18, bounds) };

    const corners = [
      worldToScreen(0, 0, 0, { x: 0, y: 0 }),
      worldToScreen(24, 0, 0, { x: 0, y: 0 }),
      worldToScreen(24, 18, 0, { x: 0, y: 0 }),
      worldToScreen(0, 18, 0, { x: 0, y: 0 }),
    ];

    expect(result.left).toBe(Math.min(...corners.map((c) => c.x)));
    expect(result.right).toBe(Math.max(...corners.map((c) => c.x)));
    expect(result.top).toBe(Math.min(...corners.map((c) => c.y)));
    expect(result.bottom).toBe(Math.max(...corners.map((c) => c.y)));
  });

  it('handles a rectangle that straddles the origin', () => {
    const result = { ...worldRectToScreenBounds(-6, -6, 6, 6, bounds) };
    expect(result.left).toBeLessThan(0);
    expect(result.right).toBeGreaterThan(0);
    expect(result.top).toBeLessThan(0);
    expect(result.bottom).toBeGreaterThan(0);
  });
});
