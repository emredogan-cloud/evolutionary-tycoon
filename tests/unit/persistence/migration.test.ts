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
  it('the current version is 10, with nine registered migrations', () => {
    /*
     * Both halves matter. The first says the schema constant and the save layer
     * agree; the second is a deliberate speed bump — bumping the version means
     * coming here, which means noticing that a migration and a fixture are owed.
     */
    expect(CURRENT_SCHEMA_VERSION).toBe(SAVE_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(10);
    expect(migrations).toHaveLength(9);
  });

  it('a save already at the current version needs no steps', () => {
    const outcome = migrateToCurrent({ schemaVersion: CURRENT_SCHEMA_VERSION }, CURRENT_SCHEMA_VERSION);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(0);
  });

  it('v2 → v3 gives the world a traffic arrival cursor', () => {
    // Vehicles are transient and are not saved, but the Poisson cursor decides
    // every FUTURE arrival — a save without it resumes on a different traffic
    // stream from the same seed. 0 means "due immediately", which is how a fresh
    // world starts, and the spawn system snaps a past-due cursor to now.
    const outcome = migrateToCurrent({ schemaVersion: 2, stats: { vehiclesSpawned: 7 } }, 2, undefined, 3);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(1);
    expect(outcome.save['schemaVersion']).toBe(3);
    expect(outcome.save['traffic']).toEqual({ nextCandidateMs: 0 });
    // Everything else is left exactly as it was.
    expect(outcome.save['stats']).toEqual({ vehiclesSpawned: 7 });
  });

  it('v3 → v4 splits vehicles into convertible and decorative', () => {
    // A v3 save predates decorative traffic, so every vehicle it counted was
    // convertible. Copying the old total across is what the save meant, not a
    // default.
    const outcome = migrateToCurrent(
      { schemaVersion: 3, stats: { vehiclesSpawned: 41 }, traffic: { nextCandidateMs: 900 } },
      3,
      undefined,
      4,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(1);
    expect(outcome.save['schemaVersion']).toBe(4);
    expect(outcome.save['stats']).toEqual({ vehiclesSpawned: 41, convertibleSpawned: 41 });
    expect(outcome.save['traffic']).toEqual({ nextCandidateMs: 900, nextDecorativeMs: 0 });
  });

  it('v4 → v5 opens the conversion funnel at zero', () => {
    // Zero is what the save meant, not a default: a v4 world predates the
    // conversion system, so it genuinely converted nobody. Deriving a plausible
    // number from `vehiclesSpawned` would show the player a history that never
    // happened the first time they open the analysis panel.
    const outcome = migrateToCurrent(
      { schemaVersion: 4, stats: { vehiclesSpawned: 41, convertibleSpawned: 41 } },
      4,
      undefined,
      5,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(1);
    expect(outcome.save['schemaVersion']).toBe(5);
    expect(outcome.save['stats']).toEqual({
      vehiclesSpawned: 41,
      convertibleSpawned: 41,
      conversionsSucceeded: 0,
      conversionsFailed: 0,
      turnedAwayNoParking: 0,
      customersAbandoned: 0,
    });
  });

  it('v1 → v10 runs every step in order', () => {
    const outcome = migrateToCurrent(
      { schemaVersion: 1, layout: { placed: [{ objectId: 'a', x: 0, y: 0 }] } },
      1,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(9);
    expect(outcome.save['schemaVersion']).toBe(10);
    expect((outcome.save['layout'] as { placed: unknown[] }).placed).toEqual([
      { objectId: 'a', x: 0, y: 0, z: 0 },
    ]);
    expect(outcome.save['traffic']).toEqual({ nextCandidateMs: 0, nextDecorativeMs: 0 });
    expect(outcome.save['stats']).toEqual({
      convertibleSpawned: 0,
      conversionsSucceeded: 0,
      conversionsFailed: 0,
      turnedAwayNoParking: 0,
      customersAbandoned: 0,
      // Phase 10.
      employeesLeftUnpaid: 0,
      // Phase 11.
      driveThruServed: 0,
    });
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
    /*
     * Against the chain's own length rather than a number, because the claim
     * here is not "there are three migrations" — the test above owns that — but
     * "what v1 to v2 did survives every step that runs after it". Pinning a
     * literal made this fail on each version bump for a reason that had nothing
     * to do with what it tests.
     */
    expect(outcome.steps).toBe(migrations.length);
    expect(outcome.save['schemaVersion']).toBe(CURRENT_SCHEMA_VERSION);
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
    /*
     * `cash` is untouched all the way up the chain — that is what this asserts.
     * The v5→v6 step adds the spend total and the income window, so the object
     * is no longer identical; the fields it *did* carry are.
     */
    expect(outcome.save['economy']).toMatchObject({ cash: 42 });
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
    expect(result.migrationSteps).toBe(9);
    expect(result.save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('save-v2.json migrates to the current version', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v2.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    // Was zero until Phase 5 added the traffic cursor. The fixture is a
    // historical record and is never regenerated, so this number grows by one
    // with every schema change — which is the point of keeping it.
    expect(result.migrationSteps).toBe(8);
  });

  it('save-v3.json migrates to the current version', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v3.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(7);
  });

  it('save-v4.json migrates three steps to the current version', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v4.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(6);
  });

  it('save-v5.json migrates three steps to the current version', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v5.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(5);
  });

  it('save-v6.json migrates two steps to the current version', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v6.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(4);
  });

  it('save-v7.json migrates one step to the current version', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v7.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(3);
  });

  it('save-v8.json migrates two steps, arriving with a null offline envelope', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v8.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(2);
    /*
     * `meter: null`, not a zeroed summary: a v8 save measured nothing, and the
     * distinction is what keeps a migrated player's first return from being
     * priced as pure wage loss (the v8→v9 migration's own comment).
     */
    expect(result.save.offline).toEqual({ meter: null, pending: null });
  });

  it('save-v8.json carries a stage, a placement and a payroll', () => {
    /*
     * The Phase 11 fixture is a Stage 3 diner mid-service: a cook, a waiter, a
     * sign bought, and an object the player placed. A fixture at Stage 1 with an
     * empty layout would migrate identically and prove nothing about the two
     * sections this version exists for.
     */
    const save = JSON.parse(readFixture('save-v8.json')) as {
      progression: { stage: number; pendingStage: number };
      construction: { targetStage: number };
      layout: { placed: unknown[]; revision: number };
    };
    expect(save.progression.stage).toBe(3);
    expect(save.layout.placed).toHaveLength(1);
    expect(save.layout.revision).toBeGreaterThan(0);
    expect(save.construction.targetStage).toBe(0);
  });

  it('a v8 save arrives with no offline measurement and nothing pending', () => {
    const outcome = migrateToCurrent({ schemaVersion: 8, economy: { cash: 12 } }, 8);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(2);
    expect(outcome.save['schemaVersion']).toBe(10);
    expect(outcome.save['offline']).toEqual({ meter: null, pending: null });
    // Everything else is left exactly as it was.
    expect(outcome.save['economy']).toEqual({ cash: 12 });
  });

  it('a v9 save arrives with an unplanned calendar, to be planned on first tick', () => {
    const outcome = migrateToCurrent({ schemaVersion: 9, economy: { cash: 12 } }, 9);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.steps).toBe(1);
    expect(outcome.save['schemaVersion']).toBe(10);
    expect(outcome.save['environment']).toEqual({
      plannedDay: -1,
      weatherSegments: [0, 0, 0, 0],
      eventTypes: [-1, -1, -1, -1, -1, -1],
      eventStartMs: [0, 0, 0, 0, 0, 0],
      eventEndMs: [0, 0, 0, 0, 0, 0],
      lastWeather: -1,
      lastActiveEvent: -1,
    });
  });

  it('save-v9.json migrates one step to the current version', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v9.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(1);
  });

  it('save-v10.json loads with no migration at all', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.write('save', readFixture('save-v10.json'));

    const result = await new SaveManager(storage).load();

    expect(result.ok, result.ok ? '' : JSON.stringify(result.slotErrors)).toBe(true);
    if (!result.ok) return;
    expect(result.migrationSteps).toBe(0);
  });

  it('save-v10.json carries a calendar a session actually planned', () => {
    /*
     * The Phase 15 fixture is a played session like every one before it: the
     * calendar — the field this version exists for — holds a genuinely planned
     * day, so the round-trip proves values survive, not just shape.
     */
    const save = JSON.parse(readFixture('save-v10.json')) as {
      environment: { plannedDay: number; weatherSegments: number[] };
    };
    expect(save.environment.plannedDay).toBeGreaterThanOrEqual(0);
    expect(save.environment.weatherSegments).toHaveLength(4);
  });

  it('save-v9.json carries a measurement somebody actually played', () => {
    /*
     * The Phase 14 fixture is a played session, like every fixture before it:
     * five simulated minutes of an attentive Stage 1 cook, so the offline
     * meter — the field this version exists for — holds a real throughput and
     * a real average ticket rather than zeroes that would round-trip a shape
     * without proving the values survive.
     */
    const save = JSON.parse(readFixture('save-v9.json')) as {
      offline: {
        meter: { throughputPerMin: number; avgTicket: number; utilization: number[] } | null;
        pending: unknown;
      };
    };
    expect(save.offline.meter).not.toBeNull();
    expect(save.offline.meter?.throughputPerMin).toBeGreaterThan(0);
    expect(save.offline.meter?.avgTicket).toBeGreaterThan(0);
    expect(save.offline.meter?.utilization).toHaveLength(5);
  });

  it('a v7 save arrives at Stage 1 with nothing under construction', () => {
    // `stage` is untouched by the migration: a v7 save legitimately holds
    // whichever stage it was on, and inventing a transition here would evolve
    // somebody's restaurant while they were not looking.
    const outcome = migrateToCurrent(
      { schemaVersion: 7, progression: { stage: 2, unlocks: [], milestones: [] } },
      7,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const progression = outcome.save['progression'] as { stage: number; pendingStage: number };
    expect(progression.stage, 'the migration moved the player to another stage').toBe(2);
    expect(progression.pendingStage).toBe(0);
    expect(outcome.save['construction']).toEqual({ targetStage: 0, elapsedMs: 0, totalMs: 0 });
  });

  it('save-v7.json carries a payroll somebody actually hired', () => {
    /*
     * The Phase 10 fixture is a real session: ten minutes of play, a sign, then
     * a cook hired with the proceeds and left to work for half a minute. A
     * fixture with an empty staff list would migrate identically and prove
     * nothing about the one section this version exists for.
     */
    const save = JSON.parse(readFixture('save-v7.json')) as {
      staff: { employees: { role: number; skill: number; wagePerMinute: number }[] };
    };
    expect(save.staff.employees).toHaveLength(1);
    expect(save.staff.employees[0]?.skill).toBeCloseTo(0.6, 6);
    expect(save.staff.employees[0]?.wagePerMinute).toBeGreaterThan(0);
  });

  it('a v6 save arrives with an empty payroll rather than an invented one', () => {
    // Zero is the honest value: a v6 save was written by a build where nobody
    // could be hired, so the player genuinely had no staff.
    const outcome = migrateToCurrent({ schemaVersion: 6, staff: { hired: [] } }, 6);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect((outcome.save['staff'] as { employees: unknown[] }).employees).toEqual([]);
    expect((outcome.save['staff'] as { settleElapsedMs: number }).settleElapsedMs).toBe(0);
  });

  it('save-v6.json carries an upgrade the player actually bought', () => {
    /*
     * The Phase 9 fixture is a real session: ten minutes of play with an
     * attentive cook, then a sign bought with the proceeds. A fixture with an
     * empty upgrade map would migrate identically and prove nothing about the
     * one field this version exists for.
     */
    const save = JSON.parse(readFixture('save-v6.json')) as {
      layout: { upgrades: [string, number][] };
      economy: { lifetimeSpend: number; revenueWindow: number[] };
    };
    expect(save.layout.upgrades).toContainEqual(['hand-painted-sign', 1]);
    expect(save.economy.lifetimeSpend).toBeGreaterThan(0);
    expect(save.economy.revenueWindow).toHaveLength(12);
  });

  it('save-v5.json carries a conversion funnel that actually ran', () => {
    /*
     * Taken from ten simulated minutes rather than the thirty seconds the
     * earlier fixtures used, so the Phase 6 counters are non-zero. A fixture
     * whose new fields are all zero round-trips a shape without ever proving the
     * values survive, which is most of what a fixture is for.
     */
    const parsed = JSON.parse(readFixture('save-v5.json')) as {
      stats: { conversionsSucceeded: number; conversionsFailed: number; customersAbandoned: number };
    };
    expect(parsed.stats.conversionsSucceeded).toBeGreaterThan(0);
    expect(parsed.stats.conversionsFailed).toBeGreaterThan(0);
    expect(parsed.stats.customersAbandoned).toBeGreaterThan(0);
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
