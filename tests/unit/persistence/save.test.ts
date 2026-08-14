import { describe, expect, it } from 'vitest';
import { Sim } from '@sim/core/Sim';
import { snapshotWorld } from '@sim/core/snapshot';
import type { WorldSnapshot } from '@sim/core/snapshot';
import { checksumOf } from '@persistence/checksum';
import { LocalStorageAdapter } from '@persistence/localStorageAdapter';
import { SaveManager, SAVE_SLOTS } from '@persistence/SaveManager';
import type { SaveMeta } from '@persistence/SaveManager';
import { currentSaveSchema } from '@persistence/schema';
import { MemoryStorageAdapter } from '@persistence/StorageAdapter';
import type { StorageAdapter } from '@persistence/StorageAdapter';

const META: SaveMeta = {
  buildSha: 'abc1234',
  nowMs: 1_770_000_000_000,
  playtimeMs: 60_000,
  lastSeenServerAt: null,
};

function snapshotAfter(ticks: number, seed = 42): WorldSnapshot {
  const sim = new Sim({ seed });
  sim.advance(ticks);
  sim.world.economy.cash = 1234.5;
  sim.world.progression.unlocks.push('grill');
  return snapshotWorld(sim.world);
}

/** A minimal in-memory `Storage` — enough for the localStorage adapter under test. */
function fakeWebStorage(overrides: { failOnWrite?: boolean } = {}): Storage {
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
      if (overrides.failOnWrite === true) throw new DOMException('Quota', 'QuotaExceededError');
      map.set(key, value);
    },
  };
}

describe('SaveManager.compose', () => {
  it('produces a file that validates against the current schema', () => {
    const file = SaveManager.compose(snapshotAfter(100), META);
    expect(currentSaveSchema.safeParse(file).success).toBe(true);
    expect(file.schemaVersion).toBe(2);
    expect(file.buildSha).toBe('abc1234');
  });

  it('checksums everything except the checksum field', () => {
    const file = SaveManager.compose(snapshotAfter(100), META);
    expect(file.checksum).toBe(checksumOf(file));
    expect(file.checksum).toMatch(/^[0-9a-f]{8}$/);
  });

  it('defaults createdAt to now, and preserves it when supplied', () => {
    const fresh = SaveManager.compose(snapshotAfter(1), META);
    expect(fresh.createdAt).toBe(META.nowMs);

    const later = SaveManager.compose(snapshotAfter(1), {
      ...META,
      nowMs: META.nowMs + 86_400_000,
      createdAt: META.nowMs,
    });
    expect(later.createdAt).toBe(META.nowMs);
    expect(later.lastSeenAt).toBe(META.nowMs + 86_400_000);
  });
});

describe('SaveManager round trip', () => {
  it('saves and loads back an identical snapshot', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage);
    const snapshot = snapshotAfter(500);

    await manager.save(snapshot, META);
    const result = await manager.load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot).toBe('save');
    expect(result.recovered).toBe(false);
    expect(result.migrationSteps).toBe(0);

    // Structural equality on the simulation half of the file.
    const {
      schemaVersion,
      buildSha,
      createdAt,
      lastSeenAt,
      lastSeenServerAt,
      playtimeMs,
      checksum,
      ...world
    } = result.save;
    expect(schemaVersion).toBe(2);
    expect(buildSha).toBe(META.buildSha);
    expect(createdAt).toBe(META.nowMs);
    expect(lastSeenAt).toBe(META.nowMs);
    expect(lastSeenServerAt).toBeNull();
    expect(playtimeMs).toBe(META.playtimeMs);
    expect(checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(world).toEqual(snapshot);
  });

  it('reports which backend it is using', () => {
    expect(new SaveManager(new MemoryStorageAdapter()).backendName).toBe('memory');
  });

  it('reports an empty store rather than throwing', async () => {
    const result = await new SaveManager(new MemoryStorageAdapter()).load();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('empty');
    expect(result.slotErrors).toEqual(['save: empty', 'save.bak1: empty', 'save.bak2: empty']);
  });
});

describe('SaveManager backup rotation', () => {
  it('rotates the previous saves into the backup slots', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage);

    await manager.save(snapshotAfter(100), META);
    await manager.save(snapshotAfter(200), META);
    await manager.save(snapshotAfter(300), META);

    const stored = storage.snapshot();
    const tickOf = (slot: string): number => (JSON.parse(stored.get(slot) ?? '{}') as { tick: number }).tick;

    expect(tickOf('save')).toBe(300);
    expect(tickOf('save.bak1')).toBe(200);
    expect(tickOf('save.bak2')).toBe(100);
  });

  it('does not create backup slots before there is anything to back up', async () => {
    const storage = new MemoryStorageAdapter();
    await new SaveManager(storage).save(snapshotAfter(1), META);
    expect([...storage.snapshot().keys()]).toEqual(['save']);
  });

  it('falls back to a backup when the primary slot is corrupt', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage);

    await manager.save(snapshotAfter(100), META);
    await manager.save(snapshotAfter(200), META);
    // Simulate an interrupted write: the primary is truncated.
    const truncated = (await storage.read('save'))?.slice(0, 80) ?? '';
    await storage.write('save', truncated);

    const result = await manager.load();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot).toBe('save.bak1');
    expect(result.recovered).toBe(true);
    expect(result.save.tick).toBe(100);
  });

  it('reports a clean failure when every slot is corrupt', async () => {
    const storage = new MemoryStorageAdapter();
    for (const slot of SAVE_SLOTS) await storage.write(slot, 'not json at all');

    const result = await new SaveManager(storage).load();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('corrupt');
    expect(result.slotErrors).toHaveLength(3);
    expect(result.slotErrors[0]).toContain('not valid JSON');
  });
});

describe('SaveManager validation', () => {
  async function loadOne(raw: string): Promise<ReturnType<SaveManager['load']>> {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', raw);
    return new SaveManager(storage).load();
  }

  it('rejects a save whose checksum does not match its content', async () => {
    const file = SaveManager.compose(snapshotAfter(10), META);
    const tampered = { ...file, economy: { ...file.economy, cash: 999_999 } };

    const result = await loadOne(JSON.stringify(tampered));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('corrupt');
    expect(result.slotErrors[0]).toContain('checksum mismatch');
  });

  it('rejects a save whose shape does not match the schema', async () => {
    // Checksum recomputed after tampering, so the file is *intact* but *wrong*.
    // That is the case the schema check exists for: a hand-edited save whose
    // checksum was also fixed, or a foreign file under a colliding key. Without
    // recomputing, the checksum would catch it first and this branch would never
    // run.
    const file = SaveManager.compose(snapshotAfter(10), META);
    const broken: Record<string, unknown> = {
      ...file,
      economy: { ...file.economy, cash: 'a lot' },
    };
    broken['checksum'] = checksumOf(broken);

    const result = await loadOne(JSON.stringify(broken));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.slotErrors[0]).toContain('schema mismatch at economy.cash');
  });

  it('rejects a save with no schema version', async () => {
    const result = await loadOne(JSON.stringify({ cash: 1 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.slotErrors[0]).toContain('missing or invalid schemaVersion');
  });

  it('refuses a save from a newer build rather than downgrading it', async () => {
    // The player has an older tab open somewhere. Rewriting their newer progress
    // into an older shape is data loss dressed up as compatibility.
    const file = SaveManager.compose(snapshotAfter(10), META);
    const fromTheFuture = { ...file, schemaVersion: 99 };

    const result = await loadOne(JSON.stringify(fromTheFuture));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('future-version');
    expect(result.detail).toContain('newer build');
  });
});

describe('SaveManager import and export', () => {
  it('exports pretty-printed JSON that imports back', () => {
    const manager = new SaveManager(new MemoryStorageAdapter());
    const file = SaveManager.compose(snapshotAfter(250), META);
    const json = SaveManager.exportJson(file);

    expect(json).toContain('\n  "schemaVersion": 2');

    const imported = manager.importJson(json);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.save).toEqual(file);
  });

  it('rejects an imported file that is not a save', () => {
    const result = new SaveManager(new MemoryStorageAdapter()).importJson('{"hello":"world"}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('corrupt');
  });

  it('rejects an imported file from a newer build', () => {
    const file = SaveManager.compose(snapshotAfter(1), META);
    const result = new SaveManager(new MemoryStorageAdapter()).importJson(
      JSON.stringify({ ...file, schemaVersion: 42 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('future-version');
  });
});

describe('SaveManager.clear', () => {
  it('removes every slot', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage);
    await manager.save(snapshotAfter(1), META);
    await manager.save(snapshotAfter(2), META);

    await manager.clear();

    expect(storage.snapshot().size).toBe(0);
    expect((await manager.load()).ok).toBe(false);
  });
});

describe('storage adapters', () => {
  it('memory adapter reads back what it writes and forgets what it removes', async () => {
    const adapter: StorageAdapter = new MemoryStorageAdapter();
    expect(await adapter.read('missing')).toBeNull();
    await adapter.write('k', 'v');
    expect(await adapter.read('k')).toBe('v');
    await adapter.remove('k');
    expect(await adapter.read('k')).toBeNull();
  });

  it('localStorage adapter round-trips through a Storage object', async () => {
    const adapter = new LocalStorageAdapter(fakeWebStorage());
    expect(adapter.name).toBe('localStorage');
    await adapter.write('k', 'v');
    expect(await adapter.read('k')).toBe('v');
    await adapter.remove('k');
    expect(await adapter.read('k')).toBeNull();
  });

  it('localStorage availability is probed with a real write', () => {
    // Safari in private mode exposes the object and throws on write, so
    // `'localStorage' in window` is not a usable test.
    expect(LocalStorageAdapter.isAvailable(undefined)).toBe(false);
    expect(LocalStorageAdapter.isAvailable(fakeWebStorage())).toBe(true);
    expect(LocalStorageAdapter.isAvailable(fakeWebStorage({ failOnWrite: true }))).toBe(false);
  });

  it('localStorage write rejects rather than silently losing the save', async () => {
    const adapter = new LocalStorageAdapter(fakeWebStorage({ failOnWrite: true }));
    await expect(adapter.write('k', 'v')).rejects.toThrow(/Quota/);
  });

  it('a quota failure surfaces through SaveManager instead of reporting success', async () => {
    const manager = new SaveManager(new LocalStorageAdapter(fakeWebStorage({ failOnWrite: true })));
    await expect(manager.save(snapshotAfter(1), META)).rejects.toThrow();
  });

  it('localStorage read and remove failures reject rather than pretending success', async () => {
    // Reads can throw too: a partitioned or disabled store rejects every access,
    // not just writes.
    const hostile = {
      get length() {
        return 0;
      },
      clear: () => undefined,
      getItem: () => {
        throw new DOMException('SecurityError', 'SecurityError');
      },
      key: () => null,
      removeItem: () => {
        throw new DOMException('SecurityError', 'SecurityError');
      },
      setItem: () => undefined,
    } as unknown as Storage;

    const adapter = new LocalStorageAdapter(hostile);
    await expect(adapter.read('k')).rejects.toThrow(/SecurityError/);
    await expect(adapter.remove('k')).rejects.toThrow(/SecurityError/);
  });

  it('a non-Error thrown by the platform is still surfaced as an Error', async () => {
    const oddball = {
      get length() {
        return 0;
      },
      clear: () => undefined,
      getItem: () => null,
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        // Deliberately not an Error: some platforms throw strings, and the
        // adapter has to normalise that rather than propagate it raw.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'storage is gone';
      },
    } as unknown as Storage;

    await expect(new LocalStorageAdapter(oddball).write('k', 'v')).rejects.toThrow(/storage is gone/);
  });
});
