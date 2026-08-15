import { describe, expect, it, vi } from 'vitest';
import { AssetLoader, BACKOFF_BASE_MS, MAX_ATTEMPTS } from '@render/AssetLoader';
import type { AssetManifest } from '@render/AssetLoader';

/**
 * The loader's decisions, without a browser.
 *
 * Three of them are worth testing on their own: what happens when the manifest
 * is not there, how hard it tries before giving up, and whether the progress it
 * reports is real. The third is the one ASSET_PIPELINE §14 cares about — "sahte
 * progress bar yok" — and a bar that lies is only detectable by comparing what
 * it claims against bytes actually received.
 */

const manifest: AssetManifest = {
  schemaVersion: 1,
  promptBlockHash: 'a'.repeat(64),
  paletteVersion: 1,
  atlases: [
    {
      id: 'boot',
      priority: 'boot',
      frames: 4,
      files: [
        { url: '/atlas/boot.png', bytes: 1000, sha256: 'b'.repeat(64) },
        { url: '/atlas/boot.json', bytes: 200, sha256: 'c'.repeat(64) },
      ],
    },
    {
      id: 'chars',
      priority: 'critical',
      frames: 40,
      files: [{ url: '/atlas/chars.webp', bytes: 2800, sha256: 'd'.repeat(64) }],
    },
    {
      id: 'props',
      priority: 'lazy',
      frames: 10,
      files: [{ url: '/atlas/props.webp', bytes: 9000, sha256: 'e'.repeat(64) }],
    },
  ],
  singles: [],
  totals: { bytes: 13_000, bootBytes: 1200, criticalBytes: 4000 },
};

function respondWith(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as unknown as Response;
}

const noSleep = (): Promise<void> => Promise.resolve();

describe('loading the manifest', () => {
  it('parses it when it is there', async () => {
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    expect(await loader.loadManifest()).toEqual(manifest);
  });

  it('treats a missing manifest as "nothing to load", not as a failure', async () => {
    // Until production art exists there is no manifest, and the game runs on
    // generated placeholders. Failing here would mean the game cannot start at
    // all in exactly the state the project is in today.
    const loader = new AssetLoader({
      fetch: () => Promise.resolve(respondWith(null, false)),
      sleep: noSleep,
    });
    expect(await loader.loadManifest()).toBeNull();
  });

  it('treats a network error the same way', async () => {
    const loader = new AssetLoader({ fetch: () => Promise.reject(new Error('offline')), sleep: noSleep });
    expect(await loader.loadManifest()).toBeNull();
  });

  it('asks the network rather than the cache for the manifest', async () => {
    // A stale manifest points at hashes that no longer exist, so this one fetch
    // must not be served from cache even though everything it names can be.
    const fetchImpl = vi.fn(() => Promise.resolve(respondWith(manifest)));
    await new AssetLoader({ fetch: fetchImpl, sleep: noSleep }).loadManifest();
    expect(fetchImpl).toHaveBeenCalledWith('/asset-manifest.json', { cache: 'no-cache' });
  });
});

describe('priorities', () => {
  it('reports nothing before the manifest is loaded', () => {
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    expect(loader.atlasesFor('critical')).toEqual([]);
    expect(loader.filesFor('boot')).toEqual([]);
    expect(loader.totalBytes).toBe(0);
  });

  it('groups atlases by when they are needed', async () => {
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    await loader.loadManifest();
    expect(loader.atlasesFor('boot').map((atlas) => atlas.id)).toEqual(['boot']);
    expect(loader.atlasesFor('critical').map((atlas) => atlas.id)).toEqual(['chars']);
    expect(loader.atlasesFor('lazy').map((atlas) => atlas.id)).toEqual(['props']);
    expect(loader.filesFor('boot')).toHaveLength(2);
  });
});

describe('retry policy', () => {
  it('gives up after three attempts with exponential backoff', async () => {
    const delays: number[] = [];
    const fetchImpl = vi.fn(() => Promise.resolve(respondWith(null, false)));
    const loader = new AssetLoader({
      fetch: fetchImpl,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });

    const result = await loader.fetchFile({ url: '/atlas/chars.webp', bytes: 10, sha256: 'x' });
    expect(result).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    // Two waits for three attempts, doubling. No wait after the last one — that
    // would be a pause before giving up, which the player just experiences as
    // a longer hang.
    expect(delays).toEqual([BACKOFF_BASE_MS, BACKOFF_BASE_MS * 2]);
  });

  it('stops retrying as soon as one attempt works', async () => {
    let calls = 0;
    const loader = new AssetLoader({
      fetch: () => {
        calls++;
        return calls === 1 ? Promise.reject(new Error('flaky')) : Promise.resolve(respondWith(null));
      },
      sleep: noSleep,
    });
    expect(await loader.fetchFile({ url: '/atlas/chars.webp', bytes: 10, sha256: 'x' })).not.toBeNull();
    expect(calls).toBe(2);
  });

  it('reports which files were lost instead of throwing', async () => {
    // One missing decorative atlas should not take the game down. The build-time
    // priority split is exactly the judgement of what can be survived.
    const loader = new AssetLoader({
      fetch: (input) => {
        const url = input as string;
        return Promise.resolve(
          respondWith(manifest, url === '/asset-manifest.json' || url === '/atlas/boot.json'),
        );
      },
      sleep: noSleep,
    });
    await loader.loadManifest();
    const result = await loader.loadPriority('boot');
    expect(result.loaded).toBe(1);
    expect(result.failed).toEqual(['/atlas/boot.png']);
  });
});

describe('progress', () => {
  it('advances by bytes actually received', async () => {
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    await loader.loadManifest();

    const seen: number[] = [];
    loader.onProgress((progress) => seen.push(progress.loadedBytes));

    await loader.loadPriority('boot');
    // 1000 then 1200 — the manifest's own byte counts, not a frame counter.
    expect(seen).toEqual([1000, 1200]);
    expect(loader.progress.fraction).toBeCloseTo(1200 / 4000, 5);
  });

  it('measures against the critical path, not the whole download', async () => {
    // The bar should reach 100% when the game is playable. Counting the lazy
    // atlases would leave it stuck at two thirds on a screen that is ready.
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    await loader.loadManifest();
    expect(loader.totalBytes).toBe(4000);
  });

  it('never reports more than complete', async () => {
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    await loader.loadManifest();
    await loader.loadPriority('boot');
    await loader.loadPriority('critical');
    await loader.loadPriority('lazy');
    expect(loader.progress.fraction).toBe(1);
  });

  it('calls an empty load complete rather than stuck at zero', () => {
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    expect(loader.progress).toMatchObject({ loadedBytes: 0, totalBytes: 0, fraction: 1 });
  });

  it('names the file it just finished', async () => {
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    await loader.loadManifest();
    const seen: string[] = [];
    loader.onProgress((progress) => seen.push(progress.current));
    await loader.loadPriority('critical');
    expect(seen).toEqual(['/atlas/chars.webp']);
  });

  it('stops calling a listener that unsubscribed', async () => {
    const loader = new AssetLoader({ fetch: () => Promise.resolve(respondWith(manifest)), sleep: noSleep });
    await loader.loadManifest();
    const listener = vi.fn();
    const off = loader.onProgress(listener);
    off();
    await loader.loadPriority('critical');
    expect(listener).not.toHaveBeenCalled();
  });
});
