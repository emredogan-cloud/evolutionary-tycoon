import type { SimView } from '@sim/core/types';
import type { SimEvent } from '@sim/core/events';
import type { CameraState } from './camera/cameraMath';

/**
 * Registry key the world scene reads its context from.
 *
 * Declared beside the type rather than in `PhaserBootstrap`, which would make
 * the scene import the bootstrap that imports the scene.
 */
export const RENDER_CONTEXT_KEY = 'renderContext';

/**
 * Registry key the world scene reads the loaded frame catalogue from.
 *
 * The load scene builds it and the world scene consumes it, and neither may
 * import the other's module for the same reason as above. It is not part of
 * `RenderContext` because `src/app` does not build it — the renderer does, out
 * of what it managed to fetch.
 */
export const ASSET_REGISTRY_KEY = 'assetRegistry';

/**
 * What the renderer needs from the outside world.
 *
 * Declared here and implemented by `src/app`, so the dependency points from the
 * composition root into the renderer rather than the other way round. The
 * renderer never learns that a `Sim` or a `GameLoop` exists; it is handed a way
 * to read a view and a way to ask how far through the current tick it is.
 *
 * That inversion is what keeps the engine swap cheap: replacing Phaser means
 * writing a new implementation of the scene layer against the same context, not
 * untangling it from the game.
 */
export interface RenderContext {
  /** Readonly projection of the simulation. Never mutate what this returns. */
  readView(): SimView;
  /** Fraction of a tick elapsed, from the fixed-timestep loop. */
  interpolationAlpha(): number;
  /**
   * Called once per *rendered* frame, after the scene has synchronised.
   *
   * `src/app` uses it to sample the UI bridge. Driving that from the simulation
   * loop instead looks equivalent and is not: a frozen scene stops the loop but
   * keeps rendering, so the overlay would be stuck on whatever it published
   * before the camera existed — which is how the first `stage1-serving` golden
   * came out with a HUD and no world markers at all.
   *
   * The renderer learns nothing from this. It is a function it was handed.
   */
  onFrame?(): void;
  /**
   * How far the building has grown, 0..1 — Phase 11.
   *
   * Supplied by `src/app` from the simulation rather than timed in the renderer.
   * A locally-timed reveal drifts from the world the first time the game is
   * paused, and construction genuinely takes simulated seconds — at 4x the
   * building goes up four times faster and the mask has to agree.
   */
  constructionProgress?(): number;
  /**
   * Subscribe to simulation events — Phase 17.
   *
   * Handed in rather than imported, like everything else here: the renderer
   * may listen, never emit. Particles and audio key off these. Returns an
   * unsubscribe, called on scene shutdown.
   */
  subscribeEvents?(listener: (event: SimEvent) => void): () => void;
  /** `prefers-reduced-motion` — disables smoothing and shake outright. */
  readonly reducedMotion: boolean;
  /** `?noParticles=1` — the weather layers are not even created. */
  readonly noParticles: boolean;
  /** Which authored scene to stage, from `?scene=`. */
  readonly sceneId: string;
  /** Development overlays: grid, coordinates, depth colouring. */
  readonly showDevOverlays: boolean;
  /**
   * A fixed camera transform for visual regression.
   *
   * When set, input is ignored entirely. A golden screenshot cannot be
   * pixel-exact against a camera the player — or a stray pointer event — can move.
   */
  readonly lockedCamera?: CameraState;
  /**
   * Publish `window.__EVOTYCOON_CAMERA__` — the camera's own E2E door.
   *
   * `?e2e=1` only, like the simulation hook. The viewport acceptance matrix
   * has to photograph the world at exact zoom levels, and a synthetic wheel
   * event is a statement about input plumbing, not about the camera; this is
   * the camera stated directly. Zoom and centre clamp through the same
   * `cameraMath` the player's inputs go through — the hook cannot put the
   * camera anywhere the player could not.
   */
  readonly exposeCameraHook?: boolean;
}
