import Phaser from 'phaser';
import { placeholderTextures } from '../placeholderTextures';
import { WORLD_SCENE_KEY } from './WorldScene';

const BOOT_SCENE_KEY = 'boot';

/**
 * Loads the texture set, then hands over.
 *
 * A separate scene rather than loading inside the world scene, because the world
 * scene's `create` must be able to assume every texture exists. Phase 4 turns
 * this into a real loading screen with a progress bar driven by the asset
 * manifest; today it loads six placeholders and takes a frame.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: BOOT_SCENE_KEY });
  }

  preload(): void {
    for (const texture of placeholderTextures()) {
      this.load.image(texture.key, texture.url);
    }
  }

  create(): void {
    this.scene.start(WORLD_SCENE_KEY);
  }
}
