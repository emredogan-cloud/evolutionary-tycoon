import type { StorageAdapter } from './StorageAdapter';

/**
 * localStorage fallback for when IndexedDB is unavailable — private browsing in
 * some engines, storage partitioning, enterprise policy.
 *
 * Quota is the interesting failure here: localStorage is typically 5 MB per
 * origin and throws `QuotaExceededError` synchronously on write. A save is
 * ~15 KB, so this is not a constraint in normal use, but three rotating backups
 * plus whatever else the origin holds can still hit it. The write is therefore
 * reported as a rejected promise rather than swallowed — losing a save silently
 * is worse than an error the caller can surface.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'localStorage';
  private readonly store: Storage;

  constructor(store: Storage) {
    this.store = store;
  }

  /**
   * Availability cannot be inferred from `'localStorage' in window`: Safari in
   * private mode exposes the object and throws on write. The only reliable
   * probe is a real write.
   */
  static isAvailable(store: Storage | undefined): store is Storage {
    if (store === undefined) return false;
    const probeKey = '__evotycoon_probe__';
    try {
      store.setItem(probeKey, '1');
      store.removeItem(probeKey);
      return true;
    } catch {
      return false;
    }
  }

  read(key: string): Promise<string | null> {
    try {
      return Promise.resolve(this.store.getItem(key));
    } catch (error) {
      return Promise.reject(toError(error));
    }
  }

  write(key: string, value: string): Promise<void> {
    try {
      this.store.setItem(key, value);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(toError(error));
    }
  }

  remove(key: string): Promise<void> {
    try {
      this.store.removeItem(key);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(toError(error));
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
