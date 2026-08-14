import { describe, expect, it } from 'vitest';
import { resolveSeed, selectStorage } from '@app/container';
import { IdbAdapter } from '@persistence/idbAdapter';
import { LocalStorageAdapter } from '@persistence/localStorageAdapter';
import { MemoryStorageAdapter } from '@persistence/StorageAdapter';

function fakeWebStorage(options: { failOnWrite?: boolean } = {}): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      if (options.failOnWrite === true) throw new DOMException('Quota', 'QuotaExceededError');
      map.set(key, value);
    },
  };
}

function fakeWindow(options: { indexedDB?: IDBFactory | undefined; localStorage?: Storage }): Window {
  return {
    indexedDB: options.indexedDB,
    localStorage: options.localStorage ?? fakeWebStorage(),
  } as unknown as Window;
}

describe('resolveSeed', () => {
  it('prefers an explicit ?seed', () => {
    // A reproducible session is worth more than a novel one during development,
    // and visual regression cannot exist without it.
    expect(resolveSeed('?seed=12345', 0)).toBe(12345);
    expect(resolveSeed('?other=1&seed=7', 0)).toBe(7);
  });

  it('falls back to the wall clock when no seed is given', () => {
    expect(resolveSeed('', 1_770_000_000_000)).toBe(1_770_000_000_000 >>> 0);
  });

  it('ignores a seed that is not a number', () => {
    const now = 1_770_000_000_000;
    expect(resolveSeed('?seed=abc', now)).toBe(now >>> 0);
    expect(resolveSeed('?seed=', now)).toBe(now >>> 0);
  });

  it('coerces the seed into an unsigned 32-bit integer', () => {
    expect(resolveSeed('?seed=-1', 0)).toBe(0xffffffff);
    expect(resolveSeed('?seed=4294967296', 0)).toBe(0);
  });

  it('is stable for the same query string', () => {
    expect(resolveSeed('?seed=42', 1)).toBe(resolveSeed('?seed=42', 2));
  });
});

describe('selectStorage', () => {
  it('falls back to localStorage when IndexedDB is absent', async () => {
    const storage = await selectStorage(fakeWindow({ indexedDB: undefined }));
    expect(storage).toBeInstanceOf(LocalStorageAdapter);
    expect(storage.name).toBe('localStorage');
  });

  it('falls back to memory when localStorage also refuses to write', async () => {
    // A hardened browser or private mode with storage disabled. Booting into a
    // session that cannot persist is bad; a white screen is worse, and the
    // caller can tell the difference from `backendName`.
    const storage = await selectStorage(
      fakeWindow({ indexedDB: undefined, localStorage: fakeWebStorage({ failOnWrite: true }) }),
    );
    expect(storage).toBeInstanceOf(MemoryStorageAdapter);
    expect(storage.name).toBe('memory');
  });

  it('a selected backend actually round-trips a value', async () => {
    const storage = await selectStorage(fakeWindow({ indexedDB: undefined }));
    await storage.write('save', '{"ok":true}');
    expect(await storage.read('save')).toBe('{"ok":true}');
    await storage.remove('save');
    expect(await storage.read('save')).toBeNull();
  });
});

describe('IdbAdapter.open', () => {
  it('returns null when IndexedDB is unavailable', async () => {
    expect(await IdbAdapter.open(undefined)).toBeNull();
  });

  it('returns null rather than throwing when the open request fails', async () => {
    // Firefox in private mode rejects the request instead of hiding the API.
    // Returning null keeps the try/catch out of every call site.
    const hostile = {
      open: () => {
        throw new Error('IndexedDB is disabled');
      },
    } as unknown as IDBFactory;
    expect(await IdbAdapter.open(hostile)).toBeNull();
  });
});
