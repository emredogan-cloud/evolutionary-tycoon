import { CAMERA } from '@config/world';

/**
 * Camera arithmetic, with no Phaser in sight.
 *
 * Separated from `CameraController` because clamping is where camera bugs live —
 * panning half a tile into the void at one zoom level and not another, or a
 * zoom that drifts because it recentres instead of holding the point under the
 * cursor. Those are cheap to unit-test and expensive to notice by eye.
 *
 * Coordinates are the *projected* space that `IsoProjection` produces, which is
 * also what Phaser treats as its world space. One space, not two.
 */

export interface CameraState {
  /** Centre of the view. */
  x: number;
  y: number;
  zoom: number;
}

export interface CameraBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return CAMERA.defaultZoom;
  return Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, zoom));
}

/**
 * Keep the view inside the bounds.
 *
 * When the bounds are *smaller* than the viewport — a zoomed-out view of a small
 * lot — there is no position that fills the screen, so the view centres on the
 * bounds instead. Clamping naively would jam the world against one corner, which
 * looks like a bug even though every individual constraint is satisfied.
 */
export function clampToBounds(
  state: CameraState,
  bounds: CameraBounds,
  viewport: Viewport,
  out: CameraState,
): CameraState {
  const zoom = clampZoom(state.zoom);
  const halfWidth = viewport.width / (2 * zoom);
  const halfHeight = viewport.height / (2 * zoom);

  const minX = bounds.left + halfWidth;
  const maxX = bounds.right - halfWidth;
  const minY = bounds.top + halfHeight;
  const maxY = bounds.bottom - halfHeight;

  out.zoom = zoom;
  out.x = minX > maxX ? (bounds.left + bounds.right) / 2 : Math.min(maxX, Math.max(minX, state.x));
  out.y = minY > maxY ? (bounds.top + bounds.bottom) / 2 : Math.min(maxY, Math.max(minY, state.y));
  return out;
}

/**
 * Drag by a screen-pixel delta.
 *
 * Divided by zoom so that grabbing a point and moving the mouse 100 px moves
 * that point 100 px, at every zoom level. Without it, dragging feels
 * progressively heavier as the player zooms in — a complaint that never gets
 * described as "the pan is not zoom-compensated".
 */
export function panByScreenDelta(
  state: CameraState,
  screenDeltaX: number,
  screenDeltaY: number,
  bounds: CameraBounds,
  viewport: Viewport,
  out: CameraState,
): CameraState {
  out.x = state.x - screenDeltaX / state.zoom;
  out.y = state.y - screenDeltaY / state.zoom;
  out.zoom = state.zoom;
  return clampToBounds(out, bounds, viewport, out);
}

/**
 * Zoom while holding the point under the pointer still.
 *
 * Zooming toward the centre instead is the classic mistake: the player aims at
 * something, zooms, and it slides away from the cursor.
 */
export function zoomAtPointer(
  state: CameraState,
  factor: number,
  pointerX: number,
  pointerY: number,
  bounds: CameraBounds,
  viewport: Viewport,
  out: CameraState,
): CameraState {
  const nextZoom = clampZoom(state.zoom * factor);

  const offsetX = pointerX - viewport.width / 2;
  const offsetY = pointerY - viewport.height / 2;
  const shift = 1 / state.zoom - 1 / nextZoom;

  out.x = state.x + offsetX * shift;
  out.y = state.y + offsetY * shift;
  out.zoom = nextZoom;
  return clampToBounds(out, bounds, viewport, out);
}

/**
 * Edge-push velocity for a pointer near the viewport border.
 *
 * Returns screen-pixels per second, zero when the pointer is not in a margin or
 * is outside the viewport entirely — otherwise leaving the window would leave
 * the camera drifting forever.
 */
export function edgePushVelocity(
  pointerX: number,
  pointerY: number,
  viewport: Viewport,
  out: { x: number; y: number },
): { x: number; y: number } {
  out.x = 0;
  out.y = 0;

  const inside = pointerX >= 0 && pointerY >= 0 && pointerX <= viewport.width && pointerY <= viewport.height;
  if (!inside) return out;

  const margin = CAMERA.edgePushMargin;
  if (pointerX < margin) out.x = -CAMERA.edgePushSpeed * (1 - pointerX / margin);
  else if (pointerX > viewport.width - margin) {
    out.x = CAMERA.edgePushSpeed * (1 - (viewport.width - pointerX) / margin);
  }

  if (pointerY < margin) out.y = -CAMERA.edgePushSpeed * (1 - pointerY / margin);
  else if (pointerY > viewport.height - margin) {
    out.y = CAMERA.edgePushSpeed * (1 - (viewport.height - pointerY) / margin);
  }

  return out;
}
