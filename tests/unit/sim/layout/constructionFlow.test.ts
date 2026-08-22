import { describe, expect, it } from 'vitest';
import { Sim } from '@sim/core/Sim';
import { buyUpgrade } from '@sim/systems/UpgradeSystem';
import { advancePendingBuilds } from '@sim/systems/ProgressionSystem';
import { placeObject, removeObject } from '@sim/systems/LayoutSystem';
import { navigationIntact } from '@sim/nav/reachability';

/**
 * The construction queue's edges — the branches the happy-path tests skip.
 */
describe('the purchase construction queue', () => {
  it('counts queued levels toward maxed, and prices the next rung', () => {
    const sim = new Sim({ seed: 3 });
    sim.world.economy.cash = 1_000;
    const before = sim.world.economy.cash;

    // hand-painted-sign has maxLevel 4. Queue all four without completing any.
    for (let i = 0; i < 4; i++) expect(buyUpgrade(sim.world, 'hand-painted-sign')).toBe('ok');
    expect(buyUpgrade(sim.world, 'hand-painted-sign')).toBe('maxed');
    expect(sim.world.layout.pendingBuilds).toHaveLength(4);

    // Four escalating rung prices were charged, not four copies of rung 1.
    const spent = before - sim.world.economy.cash;
    const rungOne = 6;
    expect(spent).toBeGreaterThan(rungOne * 4);

    // Completion applies all four, in order, through the live-tick code.
    advancePendingBuilds(sim.world, Number.MAX_SAFE_INTEGER);
    expect(sim.world.layout.upgrades.get('hand-painted-sign')).toBe(4);
    expect(sim.world.layout.pendingBuilds).toHaveLength(0);
  });

  it('does nothing on an empty queue', () => {
    const sim = new Sim({ seed: 3 });
    const revision = sim.world.layout.revision;
    advancePendingBuilds(sim.world, 10_000);
    expect(sim.world.layout.revision).toBe(revision);
  });

  it('advances partially without completing', () => {
    const sim = new Sim({ seed: 3 });
    sim.world.economy.cash = 100;
    expect(buyUpgrade(sim.world, 'hand-painted-sign')).toBe('ok');
    const total = sim.world.layout.pendingBuilds[0]?.totalMs ?? 0;
    advancePendingBuilds(sim.world, 1_000);
    expect(sim.world.layout.pendingBuilds[0]?.remainingMs).toBe(total - 1_000);
    expect(sim.world.layout.upgrades.get('hand-painted-sign')).toBeUndefined();
  });

  it("takes a removed decor object's site with it", () => {
    const sim = new Sim({ seed: 3 });
    expect(placeObject(sim.world, 'bin', 5, 13, navigationIntact)).toBe('ok');
    expect(sim.world.layout.pendingBuilds).toHaveLength(1);
    expect(removeObject(sim.world, 0)).toBe(true);
    expect(sim.world.layout.pendingBuilds).toHaveLength(0);
    // And an index out of range is refused without touching the queue.
    expect(removeObject(sim.world, 5)).toBe(false);
  });

  it('credits offline time into the queue through COLLECT_OFFLINE', () => {
    const sim = new Sim({ seed: 3 });
    sim.world.economy.cash = 100;
    expect(buyUpgrade(sim.world, 'hand-painted-sign')).toBe('ok');

    sim.dispatch({ t: 'COLLECT_OFFLINE', gross: 0, expenses: 0, net: 0, creditedMs: 999_999 });
    sim.tick();
    expect(sim.world.layout.upgrades.get('hand-painted-sign')).toBe(1);

    // And the legacy shape without creditedMs advances nothing: the second
    // sign rung stays on the queue.
    sim.world.economy.cash = 100;
    expect(buyUpgrade(sim.world, 'hand-painted-sign')).toBe('ok');
    sim.dispatch({ t: 'COLLECT_OFFLINE', gross: 0, expenses: 0, net: 0 });
    sim.tick();
    expect(sim.world.layout.upgrades.get('hand-painted-sign')).toBe(1);
    expect(sim.world.layout.pendingBuilds.length).toBeGreaterThan(0);
  });
});
