import { describe, expect, it } from 'vitest';
import { UPGRADES, parseUpgrades, upgrade } from '@config/economy/upgrades';
import { Sim } from '@sim/core/Sim';
import { buyUpgrade, upgradeLevel } from '@sim/systems/UpgradeSystem';

/**
 * Prerequisites — GAME_EXECUTION_ROADMAP Phase 13.
 *
 * They are what makes the tree a tree rather than a price list: the illuminated
 * sign needs the hand-painted one, the neon needs the illuminated one, the pylon
 * needs the neon. Each family reads as one object growing up over four stages.
 *
 * Two failure modes matter, and neither announces itself. A **cycle** leaves a
 * branch nobody can ever reach, and to the player it is indistinguishable from
 * an upgrade they have not yet earned. A prerequisite from a **later stage** is
 * worse: the graph is fine, so nothing complains, and the upgrade is simply
 * greyed out forever.
 */

/** A minimal upgrade, so a test can vary one field at a time. */
function stub(id: string, prereqs: string[] = [], stage: 1 | 2 | 3 | 4 = 1): unknown {
  return {
    id,
    family: 'KITCHEN',
    stage,
    baseCost: 10,
    maxLevel: 1,
    prereqs,
    effects: [{ kind: 'prepStations', perLevel: [1] }],
    worldChange: 'Something appears in the world',
    consequence: 'Something about the game changes for the player',
    anchor: { x: 12, y: 12 },
    iconKey: 'test@2x',
    placeholder: 'ph-prop-short',
  };
}

describe('the validator refuses a broken graph', () => {
  it('accepts a well-formed chain, so the rejections below mean something', () => {
    expect(() => parseUpgrades([stub('a'), stub('b', ['a']), stub('c', ['b'])])).not.toThrow();
  });

  it('rejects a prerequisite that does not exist', () => {
    /*
     * Matched on a fragment without quotes in it. Zod serialises its issues to
     * JSON for the thrown message, so the refinement's `"nowhere"` arrives as
     * `\"nowhere\"` and a regex written the way the message reads never matches.
     */
    expect(() => parseUpgrades([stub('a', ['nowhere'])])).toThrow(/which does not exist/);
  });

  it('rejects a two-node cycle', () => {
    expect(() => parseUpgrades([stub('a', ['b']), stub('b', ['a'])])).toThrow(/cycle/i);
  });

  it('rejects a longer cycle, which is the one a person actually writes', () => {
    // Nobody makes A require B and B require A. Somebody absolutely makes A
    // require B, B require C, and — six months later — C require A.
    expect(() => parseUpgrades([stub('a', ['b']), stub('b', ['c']), stub('c', ['a'])])).toThrow(/cycle/i);
  });

  it('rejects an upgrade that requires itself', () => {
    expect(() => parseUpgrades([stub('a', ['a'])])).toThrow(/cycle/i);
  });

  it('rejects a prerequisite from a later stage', () => {
    /*
     * The quiet one. The graph is acyclic and every id exists, so nothing
     * structural is wrong — but a Stage 2 upgrade that needs a Stage 3 one can
     * never be bought, because by the time the prerequisite is available the
     * dependent upgrade's stage is behind the player.
     */
    expect(() => parseUpgrades([stub('early', ['late'], 2), stub('late', [], 3)])).toThrow(/from stage 3/);
  });
});

describe('the shipped tree', () => {
  it('is acyclic and complete — every prerequisite exists and comes first', () => {
    // The validator already asserts this at module load; restating it here means
    // a failure names *this* property rather than surfacing as an import error
    // in whichever test file happened to load the config first.
    expect(() => parseUpgrades([...UPGRADES])).not.toThrow();

    const byId = new Map(UPGRADES.map((item) => [item.id, item]));
    for (const item of UPGRADES) {
      for (const prereq of item.prereqs) {
        const target = byId.get(prereq);
        expect(target, `${item.id} requires missing "${prereq}"`).toBeDefined();
        expect(target?.stage ?? 0, `${item.id} requires a later stage`).toBeLessThanOrEqual(item.stage);
      }
    }
  });

  it('gives every family at least one root the player can start from', () => {
    // A family whose every member has a prerequisite is a family nobody can
    // enter. Worth asserting because it is invisible: each individual upgrade
    // looks reachable, and the cycle check passes.
    const roots = new Map<string, number>();
    for (const item of UPGRADES) {
      if (item.prereqs.length === 0) roots.set(item.family, (roots.get(item.family) ?? 0) + 1);
    }
    for (const item of UPGRADES) {
      expect(
        roots.get(item.family) ?? 0,
        `${item.family} has no upgrade without a prerequisite`,
      ).toBeGreaterThan(0);
    }
  });

  it('has chains worth having — at least one family three deep', () => {
    const byId = new Map(UPGRADES.map((item) => [item.id, item]));
    const depth = (id: string): number => {
      const item = byId.get(id);
      if (item === undefined || item.prereqs.length === 0) return 1;
      return 1 + Math.max(...item.prereqs.map(depth));
    };
    expect(Math.max(...UPGRADES.map((item) => depth(item.id)))).toBeGreaterThanOrEqual(3);
  });
});

describe('the simulation enforces them', () => {
  it('refuses an upgrade whose prerequisite is not owned', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100_000;
    sim.world.progression.stage = 2;

    expect(buyUpgrade(sim.world, 'illuminated-sign')).toBe('locked');
    expect(upgradeLevel(sim.world, 'illuminated-sign')).toBe(0);
    expect(sim.world.economy.cash, 'a refused purchase still took the money').toBe(100_000);
  });

  it('allows it the moment the prerequisite is owned', () => {
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100_000;
    sim.world.progression.stage = 2;

    expect(buyUpgrade(sim.world, 'hand-painted-sign')).toBe('ok');
    expect(buyUpgrade(sim.world, 'illuminated-sign')).toBe('ok');
    expect(upgradeLevel(sim.world, 'illuminated-sign')).toBe(1);
  });

  it('refuses an upgrade from a stage the player has not reached', () => {
    /*
     * The stage is a gate in its own right, separate from prerequisites: a
     * Stage 1 stand has nowhere to put a drive-thru window, and the balance
     * envelope for Stage 1 is costed without one.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 100_000;

    expect(buyUpgrade(sim.world, 'express-window')).toBe('locked');
    sim.world.progression.stage = 4;
    expect(buyUpgrade(sim.world, 'express-window')).toBe('ok');
  });

  it('keeps refusing after a purchase that could not pay', () => {
    // Order of checks: an unaffordable *and* locked upgrade reports the lock,
    // because that is the one the player has to do something about first.
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 0;
    expect(buyUpgrade(sim.world, 'illuminated-sign')).toBe('locked');
    expect(upgrade('illuminated-sign').prereqs).toContain('hand-painted-sign');
  });
});
