import type { SimView } from '@sim/core/types';
import type { CameraState } from './camera/cameraMath';

/**
 * Registry key the world scene reads its context from.
 *
 * Declared beside the type rather than in `PhaserBootstrap`, which would make
 * the scene import the bootstrap that imports the scene.
 */
export const RENDER_CONTEXT_KEY = 'renderContext';

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
  /** `prefers-reduced-motion` — disables smoothing and shake outright. */
  readonly reducedMotion: boolean;
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
}
