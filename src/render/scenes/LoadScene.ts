import Phaser from 'phaser';
import { SURFACE_COLORS } from '@config/surfaces';
import { AssetLoader } from '../AssetLoader';
import { placeholderTextures } from '../placeholderTextures';
import { WORLD_SCENE_KEY } from './WorldScene';

const LOAD_SCENE_KEY = 'load';

/**
 * The loading screen, with a progress bar that means something.
 *
 * It fetches the asset manifest, loads the boot and critical atlases from it,
 * and advances the bar by bytes actually received (ASSET_PIPELINE §14: "sahte
 * progress bar yok" — no fake progress bar). When the manifest is absent, which
 * is the state of the project until production art exists, it falls back to the
 * generated placeholder textures and says so on screen rather than pretending to
 * load something.
 *
 * The world scene's `create` may assume every texture it needs exists. That
 * guarantee is this scene's whole job, and it is why loading does not happen
 * inside the world scene.
 */
export class LoadScene extends Phaser.Scene {
  private bar?: Phaser.GameObjects.Graphics;
  private label?: Phaser.GameObjects.Text;
  private fraction = 0;
  private status = '';

  constructor() {
    super({ key: LOAD_SCENE_KEY });
  }

  preload(): void {
    // Placeholders are loaded unconditionally: they are the fallback if an atlas
    // fails, and until Phase 4's art lands they are the only textures there are.
    for (const texture of placeholderTextures()) {
      this.load.image(texture.key, texture.url);
    }
  }

  create(): void {
    this.drawChrome();
    void this.loadAssets();
  }

  private drawChrome(): void {
    const { width, height } = this.scale.gameSize;
    this.add.rectangle(0, 0, width, height, 0x12141a).setOrigin(0, 0);

    this.label = this.add
      .text(width / 2, height / 2 - 28, 'Loading', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#f2f0ea',
      })
      .setOrigin(0.5, 0.5);

    this.bar = this.add.graphics();
    this.redraw();
  }

  private redraw(): void {
    const { width, height } = this.scale.gameSize;
    const barWidth = Math.min(360, width * 0.6);
    const left = (width - barWidth) / 2;
    const top = height / 2;

    const bar = this.bar;
    if (bar === undefined) return;
    bar.clear();
    bar.fillStyle(SURFACE_COLORS.road, 1);
    bar.fillRect(left, top, barWidth, 6);
    bar.fillStyle(SURFACE_COLORS.roadMarking, 1);
    bar.fillRect(left, top, barWidth * this.fraction, 6);

    this.label?.setText(this.status === '' ? 'Loading' : this.status);
  }

  private async loadAssets(): Promise<void> {
    const loader = new AssetLoader();
    loader.onProgress((progress) => {
      this.fraction = progress.fraction;
      this.redraw();
    });

    const manifest = await loader.loadManifest();
    if (manifest === null || manifest.atlases.length === 0) {
      // Said out loud, on screen. A silent fallback to placeholders is how a
      // build ships with placeholder art in it (WORKING_DISCIPLINE §7).
      this.status = 'No asset manifest — running on placeholders';
      this.fraction = 1;
      this.redraw();
      document.documentElement.dataset['assetState'] = 'placeholder';
      this.scene.start(WORLD_SCENE_KEY);
      return;
    }

    for (const priority of ['boot', 'critical'] as const) {
      const result = await loader.loadPriority(priority);
      if (result.failed.length > 0) {
        this.status = `${result.failed.length} asset(s) unavailable`;
        this.redraw();
      }
    }

    document.documentElement.dataset['assetState'] = 'loaded';
    document.documentElement.dataset['assetManifest'] = manifest.promptBlockHash.slice(0, 12);
    this.scene.start(WORLD_SCENE_KEY);
  }
}
