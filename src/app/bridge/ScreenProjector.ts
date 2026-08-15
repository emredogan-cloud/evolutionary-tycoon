import type Phaser from 'phaser';
import { worldToScreen } from '@render/iso/IsoProjection';

/**
 * World metres to CSS pixels on the overlay.
 *
 * Writes into `out` and returns whether the point is actually on screen. A
 * separate boolean rather than a nullable point because this runs for every
 * marker on every sample and allocating a result object ten times a second per
 * marker is exactly the kind of thing the throttle exists to avoid.
 */
export type ScreenProjector = (
  worldX: number,
  worldY: number,
  worldZ: number,
  out: { x: number; y: number },
) => boolean;

/** Nothing is on screen. Used before the renderer has a camera. */
export const NULL_PROJECTOR: ScreenProjector = (_x, _y, _z, out) => {
  out.x = 0;
  out.y = 0;
  return false;
};

/** Markers this far outside the viewport are not drawn. */
const CULL_MARGIN_PX = 96;

/**
 * Project through the live Phaser camera.
 *
 * The camera is looked up per call rather than captured, because the scene may
 * not exist yet when the bridge is built and Phaser replaces the camera on a
 * scene restart. A stale camera reference is the kind of bug that shows up as
 * "the bubbles are in the right place until you resize the window".
 *
 * `worldToScreen` is the renderer's own projection, imported rather than
 * reimplemented. Two implementations of an isometric transform stay in step
 * exactly as long as nobody adjusts the tile height.
 */
export function phaserProjector(game: Phaser.Game, sceneKey: string): ScreenProjector {
  const scratch = { x: 0, y: 0 };

  return (worldX, worldY, worldZ, out) => {
    /*
     * Both casts widen a type that lies. `getScene` is declared to return a
     * `Scene` and returns null for a key that has not booted; `cameras.main` is
     * declared non-null and is undefined until the scene's camera manager runs.
     * Trusting either declaration throws on the first frame after boot.
     */
    const scene = game.scene.getScene(sceneKey) as Phaser.Scene | null;
    if (scene?.scene.isActive() !== true) return NULL_PROJECTOR(worldX, worldY, worldZ, out);

    const camera = scene.cameras.main as Phaser.Cameras.Scene2D.Camera | undefined;
    if (camera === undefined) return NULL_PROJECTOR(worldX, worldY, worldZ, out);

    worldToScreen(worldX, worldY, worldZ, scratch);
    const view = camera.worldView;
    out.x = (scratch.x - view.x) * camera.zoom;
    out.y = (scratch.y - view.y) * camera.zoom;

    return (
      out.x >= -CULL_MARGIN_PX &&
      out.y >= -CULL_MARGIN_PX &&
      out.x <= camera.width + CULL_MARGIN_PX &&
      out.y <= camera.height + CULL_MARGIN_PX
    );
  };
}
