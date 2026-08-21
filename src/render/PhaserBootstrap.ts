import Phaser from 'phaser';
import { LoadScene } from './scenes/LoadScene';
import { RENDER_CONTEXT_KEY } from './RenderContext';
import type { RenderContext } from './RenderContext';
import { WorldScene } from './scenes/WorldScene';

/**
 * Create the Phaser game.
 *
 * `Phaser.WEBGL`, never `Phaser.AUTO`. Phaser 4 deprecated the Canvas renderer,
 * so `AUTO` would silently fall back to a renderer that cannot draw this game
 * and the failure would arrive as a blank screen. A browser without WebGL is
 * caught earlier by the capability gate in `src/platform`, which shows an
 * explanatory page instead (TECHNICAL_ARCHITECTURE §12, tier C).
 */

export interface PhaserBootstrapOptions {
  readonly parent: HTMLElement;
  readonly context: RenderContext;
}

export function createPhaserGame(options: PhaserBootstrapOptions): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: options.parent,
    backgroundColor: '#12141a',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    render: {
      // The art is crisp-edged and authored at 2x; smoothing it on downscale is
      // what we want, so antialias stays on. `roundPixels` defaults to false in
      // Phaser 4 and is left there: rounding would make interpolated movement
      // judder at 20 Hz simulation steps.
      antialias: true,
      powerPreference: 'high-performance',
    },
    // The renderer is driven by Phaser's own loop, but the *simulation* is not:
    // it advances on the fixed-timestep GameLoop in src/app, and the scene only
    // ever reads a view of it.
    scene: [LoadScene, WorldScene],
    audio: { noAudio: true },
    banner: false,
  });

  // Through the registry rather than as scene data: Phaser starts the first
  // scene in the list on its own, so there is no call site to hand data to, and
  // LoadScene would otherwise have to forward it purely as a courier.
  game.registry.set(RENDER_CONTEXT_KEY, options.context);

  return game;
}
