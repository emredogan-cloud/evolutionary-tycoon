import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '@config/simulation';
import { Sim } from '@sim/core/Sim';
import { restoreWorld } from '@sim/core/snapshot';
import { assertContiguous, migrateToCurrent, migrations } from '@persistence/migrations';
import type { Migration } from '@persistence/migrations';
import { CURRENT_SCHEMA_VERSION, currentSaveSchema } from '@persistence/schema';
import { SaveManager } from '@persistence/SaveManager';
import { MemoryStorageAdapter } from '@persistence/StorageAdapter';

/**
 * The backward-compatibility gate — WORKING_DISCIPLINE rule 13, enforced by
 * machine rather than promised.
 *
 * Every schema version ships a committed fixture, and this suite replays the
 * whole `v1 → current` chain on every CI run, forever. The fixtures are
 * historical records: once committed they are never regenerated, because a
 * fixture regenerated from today's code proves only that today's code agrees
 * with itself.
 */

const FIXTURE_DIR = resolve(import.meta.dirname, '../../fixtures/saves');

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), 'utf8');
}

describe('migration chain', () => {
  it('the current version is 3, with two registered migrations', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(SAVE_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
    expect(migrations).toHaveLength(2);
  });

  it('a save already at the current version needs no steps', () => {
    const outcome = migrateToCurrent({ schemaVersion: 3 }, 3);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(0);
  });

  it('v2 → v3 gives the world a traffic arrival cursor', () => {
    // Vehicles are transient and are not saved, but the Poisson cursor decides
    // every FUTURE arrival — a save without it resumes on a different traffic
    // stream from the same seed. 0 means "due immediately", which is how a fresh
    // world starts, and the spawn system snaps a past-due cursor to now.
    const outcome = migrateToCurrent({ schemaVersion: 2, stats: { vehiclesSpawned: 7 } }, 2);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(1);
    expect(outcome.save['schemaVersion']).toBe(3);
    expect(outcome.save['traffic']).toEqual({ nextCandidateMs: 0 });
    // Everything else is left exactly as it was.
    expect(outcome.save['stats']).toEqual({ vehiclesSpawned: 7 });
  });

  it('v1 → v3 runs both steps in order', () => {
    const outcome = migrateToCurrent(
      { schemaVersion: 1, layout: { placed: [{ objectId: 'a', x: 0, y: 0 }] } },
      1,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(2);
    expect(outcome.save['schemaVersion']).toBe(3);
    expect((outcome.save['layout'] as { placed: unknown[] }).placed).toEqual([
      { objectId: 'a', x: 0, y: 0, z: 0 },
    ]);
    expect(outcome.save['traffic']).toEqual({ nextCandidateMs: 0 });
  });

  it('v1 → v2 gives every placed object a ground-level height', () => {
    // Phase 3 sorts the world by height. A v1 save meant "everything sits on the
    // ground", so 0 is what those layouts actually said, not a guess.
    const outcome = migrateToCurrent(
      {
        schemaVersion: 1,
        layout: {
          placed: [
            { objectId: 'counter', x: 1, y: 2 },
            { objectId: 'awning', x: 3, y: 4 },
          ],
          upgrades: [],
        },
      },
      1,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // Two steps now: v1 → v2 → v3. The z-height assertion is about what v1→v2
    // did, and it still has to be true after the chain has run on past it.
    expect(outcome.steps).toBe(2);
    expect(outcome.save['schemaVersion']).toBe(3);
    expect((outcome.save['layout'] as { placed: unknown[] }).placed).toEqual([
      { objectId: 'counter', x: 1, y: 2, z: 0 },
      { objectId: 'awning', x: 3, y: 4, z: 0 },
    ]);
  });

  it('v1 → v2 leaves an explicit height alone and touches nothing else', () => {
    const outcome = migrateToCurrent(
      {
        schemaVersion: 1,
        economy: { cash: 42 },
        layout: { placed: [{ objectId: 'shelf', x: 0, y: 0, z: 1.1 }], upgrades: [] },
      },
      1,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect((outcome.save['layout'] as { placed: unknown[] }).placed).toEqual([
      { objectId: 'shelf', x: 0, y: 0, z: 1.1 },
    ]);
    expect(outcome.save['economy']).toEqual({ cash: 42 });
  });

  it('v1 → v2 survives a layout that is missing or malformed', () => {
    // A migration is the last code to run before a player's progress loads. It
    // must not throw on a shape it did not expect.
    expect(migrateToCurrent({ schemaVersion: 1 }, 1).ok).toBe(true);
    expect(migrateToCurrent({ schemaVersion: 1, layout: null }, 1).ok).toBe(true);
    expect(migrateToCurrent({ schemaVersion: 1, layout: { placed: 'nope' } }, 1).ok).toBe(true);
    expect(migrateToCurrent({ schemaVersion: 1, layout: { placed: [null, 7] } }, 1).ok).toBe(true);
  });

  it('refuses a save from a newer schema instead of coercing it', () => {
    const outcome = migrateToCurrent({ schemaVersion: 99 }, 99);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('future-version');
  });

  it('reports a missing step rather than silently producing a half-migrated save', () => {
    const outcome = migrateToCurrent({ schemaVersion: 0 }, 0);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('no-path');
    expect(outcome.detail).toContain('no migration registered from schema v0');
  });

  it('the registered chain is contiguous', () => {
    expect(() => {
      assertContiguous(migrations);
    }).not.toThrow();
  });
});

/**
 * The chain machinery, exercised against synthetic migrations.
 *
 * The real list is empty until the schema first changes. Testing the algorithm
 * only through that empty list would mean the first real migration ships on
 * untested code, on the day a player's save depends on it.
 */
describe('migration chain machinery', () => {
  const v1to2: Migration = {
    from: 1,
    to: 2,
    up: (save) => ({ ...save, schemaVersion: 2, addedInV2: true }),
  };
  const v2to3: Migration = {
    from: 2,
    to: 3,
    up: (save) => ({ ...save, schemaVersion: 3, addedInV3: 'yes' }),
  };
  const chain = [v1to2, v2to3];

  it('applies every step in order', () => {
    const outcome = migrateToCurrent({ schemaVersion: 1, cash: 10 }, 1, chain, 3);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(2);
    expect(outcome.save).toEqual({
      schemaVersion: 3,
      cash: 10,
      addedInV2: true,
      addedInV3: 'yes',
    });
  });

  it('starts from the version it is given, not from the beginning', () => {
    const outcome = migrateToCurrent({ schemaVersion: 2, cash: 10 }, 2, chain, 3);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(1);
    expect(outcome.save).not.toHaveProperty('addedInV2');
    expect(outcome.save).toHaveProperty('addedInV3');
  });

  it('does not mutate the save it was given', () => {
    const original = { schemaVersion: 1, cash: 10 };
    migrateToCurrent(original, 1, chain, 3);
    expect(original).toEqual({ schemaVersion: 1, cash: 10 });
  });

  it('stops with no-path when a step in the middle is missing', () => {
    const outcome = migrateToCurrent({ schemaVersion: 1 }, 1, [v1to2], 3);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('no-path');
    expect(outcome.detail).toContain('v2');
  });

  it('rejects a chain with a gap at load time', () => {
    expect(() => {
      assertContiguous([v1to2, { from: 3, to: 4, up: (save) => save }]);
    }).toThrow(/must go from 2 to 3/);
  });

  it('rejects a chain whose first step does not start at v1', () => {
    expect(() => {
      assertContiguous([v2to3]);
    }).toThrow(/must go from 1 to 2/);
  });
});

describe('committed save fixtures', () => {
  it('save-v1.json is still a v1 file, and is left that way', () => {
    // Fixtures are historical records. If this ever needs regenerating to pass,
    // the thing to fix is the migration, not the fixture.
    const parsed = JSON.parse(readFixture('save-v1.json')) as { schemaVersion: number };
    expect(parsed.schemaVersion).toBe(1);
    expect(currentSaveSchema.safeParse(parsed).success).toBe(false);
  });

  it('save-v1.json loads through the whole SaveManager path, migrating on the way', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v1.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(2);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('save-v2.json migrates one step to the current version', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v2.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    // Was zero until Phase 5 added the traffic cursor. The fixture is a
    // historical record and is never regenerated, so this number grows by one
    // with every schema change — which is the point of keeping it.
    expect(result.migrationSteps).toBe(1);
  });

  it('save-v3.json loads with no migration at all', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v3.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(0);
  });

  it('save-v1.json restores into a live world with no data loss', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v1.json'));
    const result = await new SaveManager(storage).load();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sim = new Sim({ seed: 1 });
    restoreWorld(sim.world, result.save);

    expect(sim.world.tick).toBe(1200);
    expect(sim.world.clock.simTimeMs).toBe(60_000);
    expect(sim.world.control.speedMultiplier).toBe(2);
    expect(sim.world.progression.stage).toBe(2);
    expect(sim.world.progression.unlocks).toEqual(['grill', 'awning']);
    expect(sim.world.progression.milestones).toEqual(['first-customer', 'first-hundred']);
    expect(sim.world.economy.cash).toBe(1875.5);
    expect(sim.world.economy.reputation).toBe(41);
    expect(sim.world.economy.lifetimeRevenue).toBe(5240.25);
    expect(sim.world.economy.prices.get('burger')).toBe(4.5);
    expect(sim.world.economy.prices.get('cola')).toBe(1.75);
    // Heights came from the migration, since the fixture predates the field.
    expect(sim.world.layout.placed).toEqual([
      { objectId: 'counter', x: 3, y: 4, z: 0 },
      { objectId: 'awning', x: 3, y: 6, z: 0 },
    ]);
    expect(sim.world.layout.upgrades.get('grill')).toBe(2);
    expect(sim.world.layout.upgrades.get('signage')).toBe(1);
    expect(sim.world.staff.hired).toEqual([{ entityId: 12, roleId: 'cook' }]);
    expect(sim.world.stats.customersServed).toBe(87);
    expect(sim.world.stats.vehiclesSpawned).toBe(640);
    expect(sim.world.stats.commandsApplied).toBe(1);
    expect(sim.world.settings.audio.master).toBe(0.8);
    expect(sim.world.settings.a11y.reducedMotion).toBe(true);
  });

  it('a world restored from save-v1.json continues deterministically', async () => {
    // The point of the fixture: an old save must still be a resumable point,
    // not just a parseable file.
    const load = async (): Promise<Sim> => {
      const storage = new MemoryStorageAdapter();
      await storage.write('save', readFixture('save-v1.json'));
      const result = await new SaveManager(storage).load();
      if (!result.ok) throw new Error('fixture failed to load');
      const sim = new Sim({ seed: 999 });
      restoreWorld(sim.world, result.save);
      return sim;
    };

    const a = await load();
    const b = await load();
    a.advance(2_000);
    b.advance(2_000);

    expect(a.world.tick).toBe(3_200);
    expect(a.world.hash()).toBe(b.world.hash());
  });
});
