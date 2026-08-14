import type { CameraState } from '@render/camera/cameraMath';
import { sceneFixture } from '@config/scenes';
import { worldToScreen } from '@render/iso/IsoProjection';

/**
 * Visual determinism mode — a first-class engine feature, not a test hack.
 *
 * ```
 * ?seed=42&freezeAt=600&scene=depth-testcard&noParticles=1&fixedViewport=1&dpr=1&hideHud=1
 * ```
 *
 * Screenshot-diffing a WebGL canvas is impossible without it. Two runs of the
 * same scene differ in the tick they happened to be on, the sub-tick
 * interpolation, particle phase, camera drift and device pixel ratio — none of
 * which is a change anyone wants to be told about. Pinning all of them is what
 * turns "the canvas looks different" from noise into a signal.
 *
 * It is deliberately available in production builds. The goldens are taken
 * against the real deployed bundle, and a mode that only exists in development
 * would be verifying something nobody ships.
 */

export interface RenderMode {
  /** Stop the simulation at exactly this tick. Null means run freely. */
  readonly freezeAt: number | null;
  readonly noParticles: boolean;
  readonly fixedViewport: boolean;
  readonly hideHud: boolean;
  readonly sceneId: string;
  /** True when any pinning parameter is present. */
  readonly visualDeterminism: boolean;
  /** Fixed camera transform; input is ignored while set. */
  readonly lockedCamera: CameraState | null;
}

function readInt(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

export function parseRenderMode(search: string): RenderMode {
  const params = new URLSearchParams(search);

  const freezeAt = readInt(params, 'freezeAt');
  const noParticles = params.get('noParticles') === '1';
  const fixedViewport = params.get('fixedViewport') === '1';
  const hideHud = params.get('hideHud') === '1';
  const sceneId = params.get('scene') ?? 'empty';

  // The camera is locked whenever the clock is frozen. A golden taken through a
  // camera the player can nudge is a golden that fails the first time someone
  // moves the mouse over the canvas during the screenshot.
  const fixture = sceneFixture(sceneId);
  const lockedCamera =
    freezeAt !== null && fixture !== null
      ? (() => {
          const focus = worldToScreen(fixture.cameraFocus.x, fixture.cameraFocus.y, 0, {
            x: 0,
            y: 0,
          });
          return { x: focus.x, y: focus.y, zoom: fixture.cameraZoom };
        })()
      : null;

  return {
    freezeAt,
    noParticles,
    fixedViewport,
    hideHud,
    sceneId,
    visualDeterminism: freezeAt !== null || noParticles || fixedViewport || hideHud,
    lockedCamera,
  };
}

/**
 * Whether the player has asked for less motion.
 *
 * Read once at boot rather than watched: changing the setting mid-session is
 * rare, and a camera that changes behaviour underneath a running gesture is
 * worse than one that needs a reload.
 */
export function prefersReducedMotion(win: Window): boolean {
  // Guarded because `matchMedia` is not universal — a hardened or embedded
  // browser may omit it, and a missing media-query API is not a reason to
  // refuse to boot. No expressed preference means no reduction. Checked via the
  // property rather than by extracting the method, which would detach `this`.
  if (typeof (win as { matchMedia?: unknown }).matchMedia !== 'function') return false;
  return win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
