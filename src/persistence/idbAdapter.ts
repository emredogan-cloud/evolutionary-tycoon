import { openDB, type IDBPDatabase } from 'idb';
import type { StorageAdapter } from './StorageAdapter';

/**
 * IndexedDB — the primary save backend.
 *
 * Chosen over localStorage as the default because it is asynchronous (a 15 KB
 * synchronous write on `pagehide` is a dropped frame at the worst possible
 * moment), it has an origin quota measured in hundreds of megabytes rather than
 * five, and it stores structured values without a stringify round trip.
 *
 * The happy path is covered by an E2E test against a real browser rather than by
 * a unit test against a fake: a hand-written IndexedDB stub would prove the stub
 * works. The parts that decide *whether* to use IndexedDB — availability probing
 * and open failure — are unit-tested here, because those are the branches that
 * decide a player's save survives.
 */

const DB_NAME = 'evotycoon';
const STORE_NAME = 'saves';
const DB_VERSION = 1;

export class IdbAdapter implements StorageAdapter {
  readonly name = 'indexedDB';
  private readonly db: IDBPDatabase;

  private constructor(db: IDBPDatabase) {
    this.db = db;
  }

  /**
   * `indexedDB` can be present and still unusable — Firefox in private mode
   * rejects the open request rather than hiding the API. Returning null instead
   * of throwing lets the caller fall through to localStorage without a
   * try/catch at every call site.
   */
  static async open(factory: IDBFactory | undefined): Promise<IdbAdapter | null> {
    if (factory === undefined) return null;
    try {
      const db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(database) {
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME);
          }
        },
      });
      return new IdbAdapter(db);
    } catch {
      return null;
    }
  }

  async read(key: string): Promise<string | null> {
    const value: unknown = await this.db.get(STORE_NAME, key);
    return typeof value === 'string' ? value : null;
  }

  async write(key: string, value: string): Promise<void> {
    await this.db.put(STORE_NAME, value, key);
  }

  async remove(key: string): Promise<void> {
    await this.db.delete(STORE_NAME, key);
  }
}
