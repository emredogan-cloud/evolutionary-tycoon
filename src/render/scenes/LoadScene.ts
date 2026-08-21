import Phaser from 'phaser';
import { SURFACE_COLORS } from '@config/surfaces';
import { AssetLoader } from '../AssetLoader';
import type { AssetManifest, ManifestAtlas } from '../AssetLoader';
import { AssetRegistry } from '../AssetRegistry';
import type { AtlasSheetData } from '../AssetRegistry';
import { ASSET_REGISTRY_KEY } from '../RenderContext';
import { placeholderTextures } from '../placeholderTextures';
import { WORLD_SCENE_KEY } from './WorldScene';

const LOAD_SCENE_KEY = 'load';

/**
 * The loading screen, with a progress bar that means something.
 *
 * It fetches the asset manifest, loads the atlases from it into Phaser's texture
 * manager, and advances the bar by bytes actually received (ASSET_PIPELINE §14:
 * "sahte progress bar yok" — no fake progress bar). When the manifest is absent
 * it falls back to the generated placeholder textures and says so on screen
 * rather than pretending to load something.
 *
 * The world scene's `create` may assume every texture it needs exists. That
 * guarantee is this scene's whole job, and it is why loading does not happen
 * inside the world scene.
 *
 * ## Why the bytes are fetched here rather than by Phaser's own loader
 *
 * Phaser's loader reports progress as a fraction of *files*, and this project's
 * files are 12 kB and 1.4 MB. A bar driven by file count sprints through the
 * character atlas and then sits at 85% for the whole vehicle download, which is
 * the exact dishonesty §14 forbids. `AssetLoader` counts bytes from the manifest,
 * so the bar can stall visibly on a slow connection — it is an instrument, not a
 * decoration. The cost is that the decoded image has to be handed to Phaser by
 * hand, which is `addAtlas` below.
 *
 * ## Why every priority is loaded before the world starts
 *
 * `lazy` was defined as "arrives when the stage that needs it is entered", and
 * three of the four lazy atlases — structures, props, nature — are needed by
 * **Stage 1**: the counter, the bin and the two trees are in its layout. Beyond
 * that, a world that finishes assembling itself a few hundred milliseconds after
 * the first frame cannot have a byte-exact visual golden. The priorities still
 * exist and still split the manifest, so the moment a stage-specific atlas is
 * genuinely stage-specific this can go back to being staged.
 */
export class LoadScene extends Phaser.Scene {
  private bar?: Phaser.GameObjects.Graphics;
  private label?: Phaser.GameObjects.Text;
  private fraction = 0;
  private status = '';
  private readonly registry_ = new AssetRegistry();

  constructor() {
    super({ key: LOAD_SCENE_KEY });
  }

  preload(): void {
    // Placeholders are loaded unconditionally: they are the fallback if an atlas
    // fails, and the only textures there are when no manifest exists.
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
      this.finish('placeholder', manifest);
      return;
    }

    let failed = 0;
    for (const atlas of manifest.atlases) {
      const ok = await this.addAtlas(loader, atlas);
      if (!ok) {
        failed++;
        this.registry_.markMissing(atlas.id);
        this.status = `${failed} atlas(es) unavailable`;
        this.redraw();
      }
    }

    for (const single of manifest.singles) {
      await this.addSingle(loader, single);
    }

    this.finish(this.registry_.frameCount > 0 ? 'loaded' : 'placeholder', manifest);
  }

  /**
   * Fetch one atlas's JSON and image, and hand both to Phaser.
   *
   * `false` rather than a throw when something is missing: one absent decorative
   * atlas should cost its decorations, not the session, and the registry records
   * which one so the world can be honest about what it could not draw.
   */
  private async addAtlas(loader: AssetLoader, atlas: ManifestAtlas): Promise<boolean> {
    const jsonFile = atlas.files.find((file) => file.url.endsWith('.json'));
    // WebP everywhere except `boot`, which also ships a PNG so the loading
    // screen renders even where WebP decoding is unavailable (§7).
    const imageFile =
      atlas.files.find((file) => file.url.endsWith('.webp')) ??
      atlas.files.find((file) => file.url.endsWith('.png'));
    if (jsonFile === undefined || imageFile === undefined) return false;

    const jsonBytes = await loader.fetchFile(jsonFile);
    const imageBytes = await loader.fetchFile(imageFile);
    if (jsonBytes === null || imageBytes === null) return false;

    let sheet: AtlasSheetData;
    try {
      sheet = JSON.parse(new TextDecoder().decode(jsonBytes)) as AtlasSheetData;
    } catch {
      return false;
    }

    const image = await decodeImage(imageBytes, imageFile.url.endsWith('.webp') ? 'image/webp' : 'image/png');
    if (image === null) return false;

    this.textures.addAtlas(atlas.id, image, sheet);
    this.registry_.register(atlas.id, sheet);
    return true;
  }

  /** A file that ships on its own — the ground bakes. Keyed by its filename. */
  private async addSingle(
    loader: AssetLoader,
    file: { readonly url: string; readonly bytes: number; readonly sha256: string },
  ): Promise<void> {
    const bytes = await loader.fetchFile(file);
    if (bytes === null) return;
    const image = await decodeImage(bytes, 'image/png');
    if (image === null) return;
    const key = file.url.split('/').pop() ?? file.url;
    this.textures.addImage(key, image);
  }

  /**
   * Hand the registry on and start the world.
   *
   * `assetState` is read by the E2E suite and by the placeholder-zero assertion,
   * so it says `loaded` only when frames genuinely arrived.
   */
  private finish(state: 'loaded' | 'placeholder', manifest: AssetManifest | null): void {
    this.registry.set(ASSET_REGISTRY_KEY, this.registry_);

    const root = document.documentElement;
    root.dataset['assetState'] = state;
    root.dataset['assetFrames'] = String(this.registry_.frameCount);
    if (manifest !== null) root.dataset['assetManifest'] = manifest.promptBlockHash.slice(0, 12);
    const missing = this.registry_.missingAtlases;
    if (missing.length > 0) root.dataset['assetMissing'] = missing.join(',');

    this.scene.start(WORLD_SCENE_KEY);
  }
}

/**
 * Bytes to something Phaser can upload as a texture.
 *
 * A blob URL and an `Image` rather than `createImageBitmap`, because Phaser 4's
 * `TextureManager.addAtlas` takes an `HTMLImageElement` and because WebKit's
 * `createImageBitmap` has historically disagreed about premultiplied alpha —
 * which on a 2px extruded atlas shows up as a dark halo on every sprite.
 * The object URL is revoked either way; leaking one per atlas would be a leak
 * per reload, which is exactly what a long-session memory test would catch.
 */
async function decodeImage(bytes: ArrayBuffer, mime: string): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        resolve(image);
      };
      image.onerror = () => {
        resolve(null);
      };
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
