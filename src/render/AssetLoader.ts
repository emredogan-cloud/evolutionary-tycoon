import { ASSET_MANIFEST_PATH } from '@config/assets';
import type { LoadPriority } from '@config/assets';

/**
 * Fetches the asset manifest and reports genuine progress.
 *
 * No Phaser in here on purpose. Progress reporting, retry policy and "what does
 * the game do when an atlas is missing" are decisions worth testing without a
 * WebGL context, and `LoadScene` is thin enough to be covered by the E2E suite.
 *
 * **The progress it reports is real.** ASSET_PIPELINE §14 says so in as many
 * words — "sahte progress bar yok". The manifest carries every file's byte
 * count, so the bar advances by bytes actually received, and it can therefore
 * stall visibly on a slow connection. A bar that always sweeps smoothly to 100%
 * is a decoration; this one is an instrument.
 */

export interface ManifestFile {
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ManifestAtlas {
  readonly id: string;
  readonly priority: LoadPriority;
  readonly frames: number;
  readonly files: readonly ManifestFile[];
}

export interface AssetManifest {
  readonly schemaVersion: number;
  readonly promptBlockHash: string;
  readonly paletteVersion: number;
  readonly atlases: readonly ManifestAtlas[];
  readonly singles: readonly ManifestFile[];
  readonly totals: { readonly bytes: number; readonly bootBytes: number; readonly criticalBytes: number };
}

export interface LoadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number;
  readonly fraction: number;
  readonly current: string;
}

export type ProgressListener = (progress: LoadProgress) => void;

/** ASSET_PIPELINE §14: three attempts with exponential backoff, then give up. */
export const MAX_ATTEMPTS = 3;
export const BACKOFF_BASE_MS = 250;

export interface AssetLoaderOptions {
  readonly manifestPath?: string;
  readonly fetch?: typeof globalThis.fetch;
  /** Injected so tests do not spend real seconds waiting out the backoff. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class AssetLoader {
  private readonly manifestPath: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly listeners = new Set<ProgressListener>();

  private manifest: AssetManifest | null = null;
  private loadedBytes = 0;

  constructor(options: AssetLoaderOptions = {}) {
    this.manifestPath = options.manifestPath ?? ASSET_MANIFEST_PATH;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? defaultSleep;
  }

  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Read the manifest.
   *
   * A missing manifest is **not** an error. Until Phase 4's art exists there is
   * nothing to load, and the game runs on the generated placeholder textures.
   * Treating "no manifest" as a failure would mean the game could not start at
   * all in exactly the state the project is in.
   */
  async loadManifest(): Promise<AssetManifest | null> {
    try {
      const response = await this.fetchImpl(this.manifestPath, { cache: 'no-cache' });
      if (!response.ok) return null;
      this.manifest = (await response.json()) as AssetManifest;
      return this.manifest;
    } catch {
      return null;
    }
  }

  /** Atlases at a given priority, in manifest order. */
  atlasesFor(priority: LoadPriority): readonly ManifestAtlas[] {
    return this.manifest?.atlases.filter((atlas) => atlas.priority === priority) ?? [];
  }

  /**
   * Fetch one file, retrying with exponential backoff.
   *
   * Returns `null` rather than throwing after the last attempt: one missing
   * decorative atlas should not take the game down, and the caller knows which
   * atlases it can survive without. The distinction between "critical" and
   * "lazy" in the manifest is exactly that judgement, made at build time.
   */
  async fetchFile(file: ManifestFile): Promise<ArrayBuffer | null> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.fetchImpl(file.url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          this.loadedBytes += file.bytes;
          this.emit(file.url);
          return buffer;
        }
      } catch {
        // Fall through to the backoff; the reason is not actionable here.
      }
      if (attempt < MAX_ATTEMPTS) {
        await this.sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }
    return null;
  }

  /** Every file of every atlas at `priority`, plus the singles at boot time. */
  filesFor(priority: LoadPriority): readonly ManifestFile[] {
    return this.atlasesFor(priority).flatMap((atlas) => atlas.files);
  }

  async loadPriority(priority: LoadPriority): Promise<{ loaded: number; failed: readonly string[] }> {
    const failed: string[] = [];
    let loaded = 0;
    for (const file of this.filesFor(priority)) {
      const buffer = await this.fetchFile(file);
      if (buffer !== null) loaded++;
      else failed.push(file.url);
    }
    return { loaded, failed };
  }

  get totalBytes(): number {
    return this.manifest?.totals.criticalBytes ?? 0;
  }

  get progress(): LoadProgress {
    const total = this.totalBytes;
    return {
      loadedBytes: this.loadedBytes,
      totalBytes: total,
      // Zero total means nothing to load, which is complete rather than
      // undefined — a bar stuck at 0% with nothing coming is the worse lie.
      fraction: total === 0 ? 1 : Math.min(1, this.loadedBytes / total),
      current: '',
    };
  }

  private emit(current: string): void {
    const progress = { ...this.progress, current };
    for (const listener of this.listeners) listener(progress);
  }
}
