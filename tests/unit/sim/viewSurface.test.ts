import { describe, expect, it } from 'vitest';
import { Sim } from '@sim/core/Sim';
import { World } from '@sim/core/World';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import { buyUpgrade } from '@sim/systems/UpgradeSystem';
import { placeObject } from '@sim/systems/LayoutSystem';
import { navigationIntact } from '@sim/nav/reachability';
import { UPGRADES } from '@config/economy/upgrades';

/**
 * The correction pass's view surface: the renderer sees placed decor and
 * construction sites through `readView`, and both survive a snapshot.
 */
describe('readView exposes the layout the renderer draws', () => {
  it('carries placed rows, pending rows with live progress, and the revision', () => {
    const sim = new Sim({ seed: 21 });
    sim.world.economy.cash = 100;
    expect(placeObject(sim.world, 'bin', 5, 13, navigationIntact)).toBe('ok');
    expect(buyUpgrade(sim.world, 'hand-painted-sign')).toBe('ok');
    for (let i = 0; i < 10; i++) sim.tick();

    const view = sim.readView();
    expect(view.placedCount).toBe(1);
    expect(view.placed[0]).toMatchObject({ objectId: 'bin', x: 5, y: 13 });
    expect(view.pendingBuildCount).toBe(2);
    const upgradeSite = view.pendingBuilds.find(
      (row, index) => index < view.pendingBuildCount && row.upgradeId === 'hand-painted-sign',
    );
    expect(upgradeSite).toBeDefined();
    expect(upgradeSite?.progress).toBeGreaterThan(0);
    expect(upgradeSite?.progress).toBeLessThan(1);
    // The view is one reused object refreshed in place, so scalars have to be
    // copied out before the next read — exactly the contract the bridge keeps.
    const revisionMidBuild = view.layoutRevision;
    expect(revisionMidBuild).toBe(sim.world.layout.revision);

    // Completion empties the queue and lands the level in the same view.
    for (let i = 0; i < 300; i++) sim.tick();
    const after = sim.readView();
    expect(after.pendingBuildCount).toBe(0);
    const signIndex = UPGRADES.findIndex((item) => item.id === 'hand-painted-sign');
    expect(after.upgradeLevels[signIndex]).toBe(1);
    expect(after.layoutRevision).toBeGreaterThan(revisionMidBuild);
  });

  it('round-trips construction sites through a snapshot', () => {
    const source = new Sim({ seed: 21 });
    source.world.economy.cash = 100;
    expect(placeObject(source.world, 'bin', 5, 13, navigationIntact)).toBe('ok');
    expect(buyUpgrade(source.world, 'hand-painted-sign')).toBe('ok');
    for (let i = 0; i < 10; i++) source.tick();

    const snapshot = snapshotWorld(source.world);
    const target = new World({ seed: 21 });
    restoreWorld(target, snapshot);

    expect(target.layout.pendingBuilds).toEqual(source.world.layout.pendingBuilds);
    expect(target.layout.placed).toEqual(source.world.layout.placed);
    expect(target.layout.revision).toBe(source.world.layout.revision);
  });
});
