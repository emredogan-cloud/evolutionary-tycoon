/**
 * Key/value storage behind a two-line interface.
 *
 * Async everywhere, including for the synchronous backends: IndexedDB is async,
 * and making the fallback pretend to be synchronous would mean two code paths
 * through `SaveManager` and, inevitably, one of them being the tested one.
 */
export interface StorageAdapter {
  /** Identifies which backend a load actually came from, for diagnostics. */
  readonly name: string;
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * In-memory storage.
 *
 * Two real jobs: it is the last-resort backend when both IndexedDB and
 * localStorage are unavailable (a hardened browser, private mode with storage
 * disabled) so the game runs for the session instead of crashing at boot, and it
 * is what the unit tests exercise `SaveManager` against.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly name = 'memory';
  private readonly entries = new Map<string, string>();

  read(key: string): Promise<string | null> {
    return Promise.resolve(this.entries.get(key) ?? null);
  }

  write(key: string, value: string): Promise<void> {
    this.entries.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }

  /** Test and diagnostic affordance: what is actually stored, right now. */
  snapshot(): ReadonlyMap<string, string> {
    return new Map(this.entries);
  }
}
