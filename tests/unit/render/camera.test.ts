import { describe, expect, it } from 'vitest';
import { CAMERA } from '@config/world';
import {
  clampToBounds,
  clampZoom,
  edgePushVelocity,
  panByScreenDelta,
  zoomAtPointer,
} from '@render/camera/cameraMath';
import type { CameraBounds, CameraState, Viewport } from '@render/camera/cameraMath';

const BOUNDS: CameraBounds = { left: -1000, top: -500, right: 1000, bottom: 500 };
const VIEWPORT: Viewport = { width: 800, height: 600 };

function state(x: number, y: number, zoom = 1): CameraState {
  return { x, y, zoom };
}

const out: CameraState = { x: 0, y: 0, zoom: 1 };

describe('clampZoom', () => {
  it('holds the documented range', () => {
    expect(clampZoom(0.1)).toBe(CAMERA.minZoom);
    expect(clampZoom(99)).toBe(CAMERA.maxZoom);
    expect(clampZoom(1.2)).toBe(1.2);
  });

  it('falls back to the default rather than propagating a non-number', () => {
    // A NaN zoom makes the whole camera transform NaN and the screen goes blank,
    // with nothing in the console to say why.
    expect(clampZoom(Number.NaN)).toBe(CAMERA.defaultZoom);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(CAMERA.defaultZoom);
  });
});

describe('clampToBounds', () => {
  it('leaves a view that is already inside alone', () => {
    const result = { ...clampToBounds(state(0, 0), BOUNDS, VIEWPORT, out) };
    expect(result).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('stops the player panning past the edge', () => {
    const result = { ...clampToBounds(state(5000, 5000), BOUNDS, VIEWPORT, out) };
    expect(result.x).toBe(BOUNDS.right - VIEWPORT.width / 2);
    expect(result.y).toBe(BOUNDS.bottom - VIEWPORT.height / 2);
  });

  it('clamps the far edges too', () => {
    const result = { ...clampToBounds(state(-5000, -5000), BOUNDS, VIEWPORT, out) };
    expect(result.x).toBe(BOUNDS.left + VIEWPORT.width / 2);
    expect(result.y).toBe(BOUNDS.top + VIEWPORT.height / 2);
  });

  it('tightens as the player zooms out', () => {
    // Less of the world may be off-screen at higher zoom, more at lower.
    const zoomedIn = { ...clampToBounds(state(5000, 0, 1.8), BOUNDS, VIEWPORT, out) };
    const zoomedOut = { ...clampToBounds(state(5000, 0, 0.6), BOUNDS, VIEWPORT, out) };
    expect(zoomedIn.x).toBeGreaterThan(zoomedOut.x);
  });

  it('centres instead of jamming a corner when the world is smaller than the view', () => {
    // Zoomed all the way out on a small lot, no position fills the screen.
    // Clamping naively satisfies every constraint and still looks broken.
    const tiny: CameraBounds = { left: -50, top: -50, right: 50, bottom: 50 };
    const result = { ...clampToBounds(state(5000, -5000), tiny, VIEWPORT, out) };
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('clamps the zoom on the way through', () => {
    expect(clampToBounds(state(0, 0, 9), BOUNDS, VIEWPORT, out).zoom).toBe(CAMERA.maxZoom);
  });
});

describe('panByScreenDelta', () => {
  it('moves the world with the cursor', () => {
    const result = { ...panByScreenDelta(state(0, 0), 100, 50, BOUNDS, VIEWPORT, out) };
    expect(result.x).toBe(-100);
    expect(result.y).toBe(-50);
  });

  it('covers the same screen distance at every zoom', () => {
    // Grab a point, move the mouse 100 px, and that point moves 100 px — at 0.6x
    // and at 1.8x alike. Without the zoom division, dragging feels heavier the
    // further in the player zooms.
    for (const zoom of [0.6, 1, 1.8]) {
      const before = state(0, 0, zoom);
      const after = { ...panByScreenDelta(before, 100, 0, BOUNDS, VIEWPORT, out) };
      const worldDistance = Math.abs(after.x - before.x);
      expect(worldDistance * zoom).toBeCloseTo(100, 9);
    }
  });

  it('still respects the bounds', () => {
    const result = { ...panByScreenDelta(state(900, 0), -100_000, 0, BOUNDS, VIEWPORT, out) };
    expect(result.x).toBe(BOUNDS.right - VIEWPORT.width / 2);
  });
});

describe('zoomAtPointer', () => {
  it('holds the point under the cursor still', () => {
    // The classic mistake is zooming toward the centre: the player aims at
    // something, zooms, and it slides away from the cursor.
    const before = state(0, 0, 1);
    const pointerX = 700;
    const pointerY = 550;

    const worldUnderPointerBefore = {
      x: before.x + (pointerX - VIEWPORT.width / 2) / before.zoom,
      y: before.y + (pointerY - VIEWPORT.height / 2) / before.zoom,
    };

    const after = { ...zoomAtPointer(before, 1.5, pointerX, pointerY, BOUNDS, VIEWPORT, out) };

    const worldUnderPointerAfter = {
      x: after.x + (pointerX - VIEWPORT.width / 2) / after.zoom,
      y: after.y + (pointerY - VIEWPORT.height / 2) / after.zoom,
    };

    expect(worldUnderPointerAfter.x).toBeCloseTo(worldUnderPointerBefore.x, 9);
    expect(worldUnderPointerAfter.y).toBeCloseTo(worldUnderPointerBefore.y, 9);
  });

  it('does not move the camera when the pointer is dead centre', () => {
    const result = { ...zoomAtPointer(state(10, 20), 1.5, 400, 300, BOUNDS, VIEWPORT, out) };
    expect(result.x).toBeCloseTo(10, 9);
    expect(result.y).toBeCloseTo(20, 9);
  });

  it('respects the zoom limits', () => {
    expect(zoomAtPointer(state(0, 0, 1.7), 4, 400, 300, BOUNDS, VIEWPORT, out).zoom).toBe(CAMERA.maxZoom);
    expect(zoomAtPointer(state(0, 0, 0.7), 0.1, 400, 300, BOUNDS, VIEWPORT, out).zoom).toBe(CAMERA.minZoom);
  });

  it('is reversible in and back out', () => {
    const start = state(0, 0, 1);
    const zoomedIn = { ...zoomAtPointer(start, 1.25, 600, 400, BOUNDS, VIEWPORT, out) };
    const back = { ...zoomAtPointer(zoomedIn, 1 / 1.25, 600, 400, BOUNDS, VIEWPORT, out) };
    expect(back.zoom).toBeCloseTo(1, 9);
    expect(back.x).toBeCloseTo(0, 9);
    expect(back.y).toBeCloseTo(0, 9);
  });
});

describe('edgePushVelocity', () => {
  const velocity = { x: 0, y: 0 };

  it('is still in the middle of the screen', () => {
    expect({ ...edgePushVelocity(400, 300, VIEWPORT, velocity) }).toEqual({ x: 0, y: 0 });
  });

  it('pushes away from each edge', () => {
    expect(edgePushVelocity(2, 300, VIEWPORT, velocity).x).toBeLessThan(0);
    expect(edgePushVelocity(798, 300, VIEWPORT, velocity).x).toBeGreaterThan(0);
    expect(edgePushVelocity(400, 2, VIEWPORT, velocity).y).toBeLessThan(0);
    expect(edgePushVelocity(400, 598, VIEWPORT, velocity).y).toBeGreaterThan(0);
  });

  it('ramps up toward the very edge rather than switching on', () => {
    const nearEdge = Math.abs(edgePushVelocity(2, 300, VIEWPORT, velocity).x);
    const justInside = Math.abs(edgePushVelocity(CAMERA.edgePushMargin - 2, 300, VIEWPORT, velocity).x);
    expect(nearEdge).toBeGreaterThan(justInside);
  });

  it('pushes diagonally in a corner', () => {
    const corner = { ...edgePushVelocity(2, 2, VIEWPORT, velocity) };
    expect(corner.x).toBeLessThan(0);
    expect(corner.y).toBeLessThan(0);
  });

  it('stops when the pointer leaves the window', () => {
    // Otherwise moving the mouse off the canvas leaves the camera drifting
    // forever, and the player has to click back in to stop it.
    expect({ ...edgePushVelocity(-10, 300, VIEWPORT, velocity) }).toEqual({ x: 0, y: 0 });
    expect({ ...edgePushVelocity(400, 900, VIEWPORT, velocity) }).toEqual({ x: 0, y: 0 });
  });
});
