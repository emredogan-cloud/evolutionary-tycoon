import { describe, expect, it } from 'vitest';
import { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';

/**
 * Determinism, part 4 — a save is a resumable point, not an approximation.
 *
 * **Narrowed in Phase 5, exactly as Phase 2 said it would have to be.**
 * PHASE_2_REPORT recorded the reason in advance: full-hash equality between a
 * resumed run and an uninterrupted one was exact only while no system created
 * transient entities. Phase 5 puts vehicles on the road, and `snapshot.ts` says
 * plainly that vehicles are *not* saved — they are traffic, not progress. So a
 * resumed world genuinely has an empty road where an uninterrupted one has a
 * full one, and the old assertion cannot hold without either saving traffic
 * (which would make a reload replay stale cars) or dropping vehicles from the
 * world hash (which would make the hash blind to the thing Phase 5 built).
 *
 * What replaces it is not weaker in the way that matters. The property a player
 * and a bug report actually depend on is **"the same save always continues the
 * same way"**, and that is now asserted directly by resuming the same save twice
 * and comparing full world hashes after five thousand further ticks — vehicles
 * included. The old test never checked that at all.
 */

const SAVE_AT = 5_000;
const RUN_TO = 10_000;

describe('determinism — save and resume', () => {
  it('restores every byte of persistent state', () => {
    const original = new Sim({ seed: 987654 });
    original.advance(SAVE_AT);
    const snapshot = snapshotWorld(original.world);

    // A genuinely new process, not the same object: the resumed simulation must
    // not depend on anything left in memory by the one that wrote the save.
    const resumed = new Sim({ seed: 987654 });
    restoreWorld(resumed.world, snapshot);

    expect(resumed.world.tick).toBe(SAVE_AT);
    expect(resumed.world.clock.simTimeMs).toBe(original.world.clock.simTimeMs);
    // Snapshot-to-snapshot rather than hash-to-hash: the snapshot IS the
    // definition of persistent state, so comparing it asserts the round trip
    // without dragging in the transient traffic the save deliberately omits.
    expect(snapshotWorld(resumed.world)).toEqual(snapshot);
  });

  it('carries the traffic arrival cursor, so a resumed day is not re-rolled', () => {
    // Vehicles are transient, but the Poisson cursor that decides every FUTURE
    // arrival is not. Dropping it would give a resumed session a different
    // traffic stream from the same seed.
    const original = new Sim({ seed: 424242 });
    original.advance(SAVE_AT);
    expect(original.world.traffic.nextCandidateMs).toBeGreaterThan(0);

    const resumed = new Sim({ seed: 424242 });
    restoreWorld(resumed.world, snapshotWorld(original.world));
    expect(resumed.world.traffic.nextCandidateMs).toBe(original.world.traffic.nextCandidateMs);
  });

  it('continues identically from the same save, twice', () => {
    // The property that actually matters, and the one the old full-equality
    // assertion never tested: a bug reported after a reload has to reproduce.
    // Full world hash here — vehicles included, not narrowed.
    const original = new Sim({ seed: 987654 });
    original.advance(SAVE_AT);
    const snapshot = snapshotWorld(original.world);

    const first = new Sim({ seed: 987654 });
    restoreWorld(first.world, snapshot);
    first.advance(RUN_TO - SAVE_AT);

    const second = new Sim({ seed: 987654 });
    restoreWorld(second.world, snapshot);
    second.advance(RUN_TO - SAVE_AT);

    expect(first.world.tick).toBe(RUN_TO);
    expect(second.world.hash()).toBe(first.world.hash());
  });

  it('leaves the road empty on resume, and says so rather than pretending otherwise', () => {
    // The documented consequence of vehicles being transient (snapshot.ts). It
    // is asserted so that a future change which starts persisting traffic has to
    // come here and argue for it.
    const original = new Sim({ seed: 987654 });
    original.advance(SAVE_AT);
    expect(original.world.vehicles.activeCount).toBeGreaterThan(0);

    const resumed = new Sim({ seed: 987654 });
    restoreWorld(resumed.world, snapshotWorld(original.world));
    expect(resumed.world.vehicles.activeCount).toBe(0);
  });

  it('a save taken from a different seed resumes on the saved seed, not the constructor seed', () => {
    // The RNG states travel in the save. A world reconstructed with the wrong
    // constructor seed must still continue the saved sequence.
    const original = new Sim({ seed: 111 });
    original.advance(500);
    const snapshot = snapshotWorld(original.world);

    /*
     * The reference is a RIGHT-seed sim resumed from the same snapshot — not
     * the uninterrupted original. Restore drops transients by design (the
     * header of snapshot.ts), so an uninterrupted world only matched while a
     * fresh world's first 500 ticks were empty midnight; the 08:00 start put
     * cars on the road at tick 500 and exposed the vacuous comparison. What
     * this test actually claims survives intact: the constructor seed is
     * irrelevant after a restore, the saved RNG sequence governs.
     */
    const rightSeed = new Sim({ seed: 111 });
    restoreWorld(rightSeed.world, snapshot);
    rightSeed.advance(500);
    const expected = rightSeed.world.hash();

    const wrongSeed = new Sim({ seed: 999 });
    restoreWorld(wrongSeed.world, snapshot);
    wrongSeed.advance(500);

    expect(wrongSeed.world.hash()).toBe(expected);
  });

  it('resuming twice from the same snapshot produces the same world twice', () => {
    const source = new Sim({ seed: 24680 });
    source.advance(1_000);
    const snapshot = snapshotWorld(source.world);

    const first = new Sim({ seed: 24680 });
    const second = new Sim({ seed: 24680 });
    restoreWorld(first.world, snapshot);
    restoreWorld(second.world, snapshot);
    first.advance(1_000);
    second.advance(1_000);

    expect(first.world.hash()).toBe(second.world.hash());
  });

  it('restoring over a dirty world leaves no residue of the previous session', () => {
    const clean = new Sim({ seed: 5 });
    clean.advance(200);
    const snapshot = snapshotWorld(clean.world);

    const dirty = new Sim({ seed: 5 });
    dirty.advance(4_000);
    dirty.world.economy.cash = 9_999;
    dirty.world.progression.stage = 4;
    dirty.world.progression.unlocks.push('leftover');
    dirty.world.layout.placed.push({ objectId: 'stale', x: 1, y: 1, z: 0 });
    dirty.world.layout.upgrades.set('stale', 3);
    dirty.world.staff.hired.push({ entityId: 42, roleId: 'ghost' });
    dirty.world.economy.prices.set('stale', 1);
    dirty.world.settings.audio.muted = true;

    restoreWorld(dirty.world, snapshot);

    // Snapshot-to-snapshot, for the same reason as the tests above: the clean
    // world has vehicles on the road at tick 200 and the save deliberately does
    // not carry them, so a full-hash comparison would be asserting that
    // transient traffic survives a reload — which is the opposite of the design.
    expect(snapshotWorld(dirty.world)).toEqual(snapshot);
    expect(dirty.world.vehicles.activeCount).toBe(0);
    expect(dirty.world.progression.unlocks).toEqual([]);
    expect(dirty.world.layout.placed).toEqual([]);
    expect(dirty.world.layout.upgrades.size).toBe(0);
    expect(dirty.world.staff.hired).toEqual([]);
    expect(dirty.world.economy.prices.size).toBe(0);
    expect(dirty.world.settings.audio.muted).toBe(false);
  });

  it('a snapshot is a copy, not a view of live state', () => {
    const sim = new Sim({ seed: 3 });
    sim.world.progression.unlocks.push('grill');
    sim.world.layout.placed.push({ objectId: 'counter', x: 1, y: 2, z: 0 });
    sim.world.staff.hired.push({ entityId: 1, roleId: 'cook' });

    const snapshot = snapshotWorld(sim.world);

    sim.world.progression.unlocks.push('fryer');
    sim.world.layout.placed.push({ objectId: 'awning', x: 3, y: 4, z: 0 });
    const firstPlaced = sim.world.layout.placed[0];
    if (firstPlaced !== undefined) firstPlaced.x = 999;
    const firstHire = sim.world.staff.hired[0];
    if (firstHire !== undefined) firstHire.roleId = 'mutated';

    expect(snapshot.progression.unlocks).toEqual(['grill']);
    expect(snapshot.layout.placed).toEqual([{ objectId: 'counter', x: 1, y: 2, z: 0 }]);
    expect(snapshot.staff.hired).toEqual([{ entityId: 1, roleId: 'cook' }]);
  });

  it('transient entities are discarded on load, and the persistent state still matches', () => {
    // TECHNICAL_ARCHITECTURE §8.1: vehicles on the road, walking customers and
    // half-finished orders are rebuilt clean rather than saved. This keeps a
    // save near 15 KB and keeps migrations to persistent fields only.
    //
    // Phase 2 has no system that creates transient entities, which is why the
    // full-hash assertion above is exact today. This test pins the contract
    // itself so that when Phase 5 starts spawning vehicles, the expectation is
    // already written down rather than discovered as a "determinism regression".
    const sim = new Sim({ seed: 1234 });
    sim.advance(100);
    sim.world.vehicles.spawn(sim.world.allocateEntityId());
    sim.world.customers.acquire();
    sim.world.orders.acquire();
    sim.world.economy.cash = 250;
    sim.world.progression.unlocks.push('grill');

    const snapshot = snapshotWorld(sim.world);

    const resumed = new Sim({ seed: 1234 });
    restoreWorld(resumed.world, snapshot);

    expect(resumed.world.vehicles.activeCount).toBe(0);
    expect(resumed.world.customers.activeCount).toBe(0);
    expect(resumed.world.orders.activeCount).toBe(0);

    expect(resumed.world.economy.cash).toBe(250);
    expect(resumed.world.progression.unlocks).toEqual(['grill']);
    expect(resumed.world.tick).toBe(100);
    expect(snapshotWorld(resumed.world)).toEqual(snapshot);
  });

  it('normalises a speed multiplier this build no longer supports', () => {
    const sim = new Sim({ seed: 1 });
    const snapshot = snapshotWorld(sim.world);
    const tampered = {
      ...snapshot,
      control: { ...snapshot.control, speedMultiplier: 16 as unknown as 1 },
    };

    restoreWorld(sim.world, tampered);
    expect(sim.world.control.speedMultiplier).toBe(1);
  });

  it('carries the command-derived stats across a save', () => {
    const sim = new Sim({ seed: 77 });
    sim.dispatch({ t: 'SET_SPEED', mult: 2 });
    sim.tick();
    sim.dispatch({ t: 'SET_PAUSED', paused: true });
    sim.tick();
    expect(sim.world.stats.commandsApplied).toBe(2);

    const resumed = new Sim({ seed: 77 });
    restoreWorld(resumed.world, snapshotWorld(sim.world));

    expect(resumed.world.stats.commandsApplied).toBe(2);
    expect(resumed.world.control.speedMultiplier).toBe(2);
    expect(resumed.world.control.paused).toBe(true);
  });
});
