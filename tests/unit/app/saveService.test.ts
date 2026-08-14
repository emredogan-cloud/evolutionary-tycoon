import { describe, expect, it } from 'vitest';
import { SaveService } from '@app/SaveService';
import { Sim } from '@sim/core/Sim';
import { SaveManager } from '@persistence/SaveManager';
import { MemoryStorageAdapter } from '@persistence/StorageAdapter';

function makeService(seed = 42): { sim: Sim; service: SaveService; now: () => number } {
  let clock = 1_770_000_000_000;
  const advanceWallClock = (): number => {
    clock += 1_000;
    return clock;
  };
  const sim = new Sim({ seed });
  const service = new SaveService(
    sim,
    new SaveManager(new MemoryStorageAdapter()),
    'deadbeef',
    advanceWallClock,
  );
  return { sim, service, now: advanceWallClock };
}

describe('SaveService', () => {
  it('saves the live world and reloads it into the same world object', async () => {
    const { sim, service } = makeService();
    sim.advance(400);
    sim.world.economy.cash = 512;
    const savedHash = sim.world.hash();

    await service.save();

    sim.advance(1_000);
    sim.world.economy.cash = 0;
    expect(sim.world.hash()).not.toBe(savedHash);

    const result = await service.load();

    expect(result.ok).toBe(true);
    expect(sim.world.hash()).toBe(savedHash);
    expect(sim.world.economy.cash).toBe(512);
    expect(sim.world.tick).toBe(400);
  });

  it('records simulation time as playtime, not wall-clock time', async () => {
    // A tab left open overnight has not been played overnight.
    const { sim, service } = makeService();
    sim.advance(1_200);
    const file = await service.save();
    expect(file.playtimeMs).toBe(sim.world.clock.simTimeMs);
    expect(file.playtimeMs).toBe(60_000);
  });

  it('preserves createdAt across repeated saves', async () => {
    const { sim, service } = makeService();
    sim.advance(10);
    const first = await service.save();
    sim.advance(10);
    const second = await service.save();

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.lastSeenAt).toBeGreaterThan(first.lastSeenAt);
  });

  it('adopts createdAt from a loaded save', async () => {
    const { sim, service } = makeService();
    sim.advance(10);
    const original = await service.save();

    const reloaded = await service.load();
    expect(reloaded.ok).toBe(true);

    sim.advance(10);
    const next = await service.save();
    expect(next.createdAt).toBe(original.createdAt);
  });

  it('stamps the build sha so a save can be traced to the code that wrote it', async () => {
    const { sim, service } = makeService();
    sim.advance(1);
    expect((await service.save()).buildSha).toBe('deadbeef');
  });

  it('leaves the world untouched when there is nothing to load', async () => {
    const { sim, service } = makeService();
    sim.advance(250);
    const before = sim.world.hash();

    const result = await service.load();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('empty');
    expect(sim.world.hash()).toBe(before);
    expect(sim.world.tick).toBe(250);
  });

  it('clear removes the saves and forgets createdAt', async () => {
    const { sim, service } = makeService();
    sim.advance(10);
    await service.save();

    await service.clear();

    expect((await service.load()).ok).toBe(false);
    sim.advance(10);
    const fresh = await service.save();
    expect(fresh.createdAt).toBe(fresh.lastSeenAt);
  });

  it('reports the storage backend in use', () => {
    const { service } = makeService();
    expect(service.backendName).toBe('memory');
  });

  it('a save-reload-continue cycle matches an uninterrupted run', async () => {
    const { sim, service } = makeService(31337);
    sim.advance(1_000);
    await service.save();
    sim.advance(500);

    await service.load();
    sim.advance(500);

    const reference = new Sim({ seed: 31337 });
    reference.advance(1_500);

    expect(sim.world.hash()).toBe(reference.world.hash());
  });
});
