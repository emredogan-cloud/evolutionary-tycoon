import type Phaser from 'phaser';
import { DEPTH_SORTED_LAYER, RENDER_LAYERS } from '@config/world';
import type { RenderLayerName } from '@config/world';

/**
 * The nine render layers — TECHNICAL_ARCHITECTURE §6.3.
 *
 * Layers rather than raw depth values on every object, because the ordering
 * between *categories* is a fact about the game, not something each object
 * should re-decide. A steam puff is always above the actor that emitted it; a
 * speech bubble is always above both. Only within the actor layer does ordering
 * depend on where things are standing, and that is the one layer sorted per frame.
 *
 * `SpriteGPULayer` is available and deliberately unused for actors: it cannot be
 * depth-sorted and changing a member is expensive (RESEARCH_NOTES §4). It is the
 * right tool for the sky and static scatter layers, which is where Phase 16 will
 * put it once there is enough scatter for it to matter.
 */
export class SceneGraph {
  private readonly layers = new Map<RenderLayerName, Phaser.GameObjects.Layer>();

  constructor(scene: Phaser.Scene) {
    RENDER_LAYERS.forEach((name, index) => {
      // `domOverlay` is Svelte, outside the canvas; it has no Phaser layer.
      if (name === 'domOverlay') return;
      const layer = scene.add.layer();
      layer.setDepth(index);
      layer.name = name;
      this.layers.set(name, layer);
    });
  }

  layer(name: RenderLayerName): Phaser.GameObjects.Layer {
    const layer = this.layers.get(name);
    if (layer === undefined) {
      throw new RangeError(`Render layer "${name}" does not exist on the canvas`);
    }
    return layer;
  }

  get actorLayer(): Phaser.GameObjects.Layer {
    return this.layer(DEPTH_SORTED_LAYER);
  }

  /** Layer names in draw order, for tests and the debug overlay. */
  get order(): readonly string[] {
    return [...this.layers.values()].map((layer) => layer.name);
  }
}
