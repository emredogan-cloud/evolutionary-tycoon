import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import {
  NULL_PROJECTOR,
  NULL_UNPROJECTOR,
  phaserProjector,
  phaserUnprojector,
} from '@app/bridge/ScreenProjector';
import { worldToScreen } from '@render/iso/IsoProjection';

/**
 * World metres to overlay pixels.
 *
 * Tested against a hand-built stand-in for Phaser rather than a real game,
 * because what is worth testing here is not the isometric transform —
 * `IsoProjection` owns that and has its own tests — but the four ways this can
 * be asked to project through a camera that is not there. Every one of them
 * happens in the real boot sequence: the game object exists before the scene
 * does, and the scene exists before its camera manager has run.
 *
 * The bug this file exists to prevent already happened once. The projector was
 * given the scene *class* name rather than the registered key, so it never found
 * a camera, quietly returned "not on screen" for everything, and the first
 * `stage1-serving` golden came out with a working HUD and no world markers at
 * all. Nothing threw, because "off screen" is a legitimate answer.
 */

interface FakeCamera {
  worldView: { x: number; y: number };
  zoom: number;
  width: number;
  height: number;
}

function fakeGame(options: { key?: string; active?: boolean; camera?: FakeCamera | undefined }): Phaser.Game {
  const key = options.key ?? 'world';
  const scene = {
    scene: { isActive: () => options.active !== false },
    cameras: { main: options.camera },
  };

  return {
    scene: {
      getScene: (requested: string) => (requested === key ? scene : null),
    },
  } as unknown as Phaser.Game;
}

/**
 * A camera framing the point every test projects, rather than a round number.
 *
 * The isometric transform puts (5, 6) somewhere specific, and a camera parked at
 * an arbitrary origin leaves it hundreds of pixels off screen — so the test
 * would assert "not visible" and pass for a reason that has nothing to do with
 * the projector. Derived from the transform, it lands at (600, 400).
 */
const ANCHOR = worldToScreen(5, 6, 0, { x: 0, y: 0 });
const CAMERA: FakeCamera = {
  worldView: { x: ANCHOR.x - 300, y: ANCHOR.y - 200 },
  zoom: 2,
  width: 1280,
  height: 720,
};

describe('the null projector', () => {
  it('reports nothing on screen and writes a defined point anyway', () => {
    // The point still has to be written: the caller stores it unconditionally,
    // and leaving it stale would put a hidden marker at the last visible
    // marker's coordinates the moment it came back into view.
    const out = { x: 999, y: 999 };
    expect(NULL_PROJECTOR(1, 2, 3, out)).toBe(false);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe('projecting through a camera', () => {
  it('applies the isometric transform, then the camera', () => {
    const project = phaserProjector(fakeGame({ camera: CAMERA }), 'world');
    const out = { x: 0, y: 0 };

    expect(project(5, 6, 0, out)).toBe(true);

    const iso = worldToScreen(5, 6, 0, { x: 0, y: 0 });
    expect(out.x).toBeCloseTo((iso.x - CAMERA.worldView.x) * CAMERA.zoom, 9);
    expect(out.y).toBeCloseTo((iso.y - CAMERA.worldView.y) * CAMERA.zoom, 9);
  });

  it('reports a point past the viewport as off screen', () => {
    const project = phaserProjector(fakeGame({ camera: CAMERA }), 'world');
    const out = { x: 0, y: 0 };

    // Far enough away that no plausible margin keeps it in view.
    expect(project(10_000, 10_000, 0, out)).toBe(false);
    expect(project(-10_000, -10_000, 0, out)).toBe(false);
  });

  it('keeps a point just outside the edge, and drops one well past it', () => {
    /*
     * The margin exists so a marker does not pop in and out as its anchor
     * crosses the boundary — a bubble over somebody standing at the edge of the
     * view would otherwise flicker with every step.
     *
     * The camera is placed so the projected point lands at a chosen screen
     * offset, rather than walking the world and hoping to cross the edge: the
     * assertion is about the margin, so the margin is what the test controls.
     */
    const framed = (screenX: number): FakeCamera => ({
      worldView: { x: ANCHOR.x - screenX, y: ANCHOR.y - 300 },
      zoom: 1,
      width: 1280,
      height: 720,
    });

    const justOutside = phaserProjector(fakeGame({ camera: framed(-50) }), 'world');
    const out = { x: 0, y: 0 };
    expect(justOutside(5, 6, 0, out), 'culled 50 px off the left edge').toBe(true);
    expect(out.x).toBeCloseTo(-50, 9);

    const wellOutside = phaserProjector(fakeGame({ camera: framed(-400) }), 'world');
    expect(wellOutside(5, 6, 0, out), 'kept 400 px off the left edge').toBe(false);

    const belowBottom = phaserProjector(
      fakeGame({
        camera: { worldView: { x: ANCHOR.x - 600, y: ANCHOR.y - 1200 }, zoom: 1, width: 1280, height: 720 },
      }),
      'world',
    );
    expect(belowBottom(5, 6, 0, out), 'kept 480 px below the viewport').toBe(false);
  });
});

describe('projecting before the renderer is ready', () => {
  it('finds nothing when the scene key does not match', () => {
    // The exact failure that produced a golden with no markers in it.
    const project = phaserProjector(fakeGame({ key: 'world', camera: CAMERA }), 'WorldScene');
    const out = { x: 1, y: 1 };

    expect(project(5, 6, 0, out)).toBe(false);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('finds nothing while the scene is still booting', () => {
    const project = phaserProjector(fakeGame({ camera: CAMERA, active: false }), 'world');
    expect(project(5, 6, 0, { x: 0, y: 0 })).toBe(false);
  });

  it('finds nothing before the camera manager has run', () => {
    const project = phaserProjector(fakeGame({ camera: undefined }), 'world');
    expect(project(5, 6, 0, { x: 0, y: 0 })).toBe(false);
  });

  it('starts working the moment the camera appears', () => {
    /*
     * The camera is looked up per call rather than captured, and this is why:
     * the projector is built during composition, before Phaser has booted, and a
     * captured null would never recover.
     */
    const scene = {
      scene: { isActive: () => true },
      cameras: {} as { main?: FakeCamera },
    };
    const game = {
      scene: { getScene: (key: string) => (key === 'world' ? scene : null) },
    } as unknown as Phaser.Game;

    const project = phaserProjector(game, 'world');
    expect(project(5, 6, 0, { x: 0, y: 0 })).toBe(false);

    scene.cameras.main = CAMERA;
    expect(project(5, 6, 0, { x: 0, y: 0 })).toBe(true);
  });
});

/**
 * And the way back — Phase 11.
 *
 * Build mode asks "the player pointed here, which cell is that", and the only
 * property worth asserting is that the two directions are **inverses**. A second
 * hand-computed expectation would be a second implementation of the transform,
 * which is exactly the drift the round trip catches.
 */
describe('overlay pixels back to world metres', () => {
  it('is the exact inverse of the projector', () => {
    const game = fakeGame({ camera: CAMERA });
    const project = phaserProjector(game, 'world');
    const unproject = phaserUnprojector(game, 'world');

    for (const [worldX, worldY] of [
      [5, 6],
      [0, 0],
      [12.5, 3.5],
      [23.5, 17.5],
    ] as const) {
      /*
       * The return value is deliberately ignored: it answers "is this on
       * screen", and the corners of the lot are not — but the projector writes
       * the coordinates either way, and off-screen points are exactly what build
       * mode's ghost has to keep straight when the camera is panned.
       */
      const screen = { x: 0, y: 0 };
      project(worldX, worldY, 0, screen);

      const back = unproject(screen.x, screen.y);
      expect(back).not.toBeNull();
      expect(back?.x).toBeCloseTo(worldX, 6);
      expect(back?.y).toBeCloseTo(worldY, 6);
    }
  });

  it('survives a zoomed and scrolled camera', () => {
    // The zoom and the scroll are undone in the reverse order they are applied.
    // Getting that order wrong is invisible at zoom 1 and at the origin, which
    // is exactly where a careless test would look.
    const camera = { worldView: { x: 120, y: -40 }, zoom: 2.5, width: 1280, height: 720 };
    const game = fakeGame({ camera });
    const project = phaserProjector(game, 'world');
    const unproject = phaserUnprojector(game, 'world');

    const screen = { x: 0, y: 0 };
    project(9, 4, 0, screen);
    const back = unproject(screen.x, screen.y);
    expect(back?.x).toBeCloseTo(9, 6);
    expect(back?.y).toBeCloseTo(4, 6);
  });

  it('answers nothing until there is a camera to answer through', () => {
    expect(NULL_UNPROJECTOR(10, 10)).toBeNull();
    expect(phaserUnprojector(fakeGame({ camera: CAMERA }), 'WorldScene')(10, 10)).toBeNull();
    expect(phaserUnprojector(fakeGame({ camera: CAMERA, active: false }), 'world')(10, 10)).toBeNull();
    expect(phaserUnprojector(fakeGame({ camera: undefined }), 'world')(10, 10)).toBeNull();
  });
});
