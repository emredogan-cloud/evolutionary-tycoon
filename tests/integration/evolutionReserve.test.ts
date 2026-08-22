import { describe, expect, it } from 'vitest';
import { buyBuilt } from '../helpers/build';
import { requirementFor } from '@config/progression';
import { TICK_MS } from '@config/simulation';
import { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import { beginConstruction, meetsRequirement, reserveFor } from '@sim/systems/ProgressionSystem';
import { hire } from '@sim/systems/StaffSystem';
import { totalUpgradeLevels } from '@sim/systems/UpgradeSystem';
import { UPGRADES } from '@config/economy/upgrades';

/**
 * ADR-014 — evolution may not strand the player.
 *
 * The hazard this closes was measured, not imagined: a stand holding ₡804
 * accepted the ₡800 Stage 3, opened with ₡4, could not hire the waiter its
 * tables are served by, and produced a flat line from minute 92 to the end of a
 * twelve-hour run (PHASE_12_REPORT). Cash never went negative, so no existing
 * rule objected. The fix is the operating reserve: the gate now requires the
 * threshold **plus** what the incoming stage needs to start earning.
 *
 * Every case here drives the real gate (`meetsRequirement`, `beginConstruction`)
 * rather than the numbers behind it, so a change to either the rule or the
 * pricing shows up as a failure in the scenario a player would actually hit.
 */

/** Meet everything except cash, which the test sets deliberately. */
function qualifyExceptCash(sim: Sim, stage: 1 | 2 | 3): void {
  const requirement = requirementFor(stage);
  if (requirement === null) throw new Error(`no requirement above stage ${String(stage)}`);

  sim.world.progression.stage = stage;
  sim.world.stats.customersServed = requirement.customersServed;
  sim.world.economy.reputation = requirement.reputation;

  const held = sim.world.economy.cash;
  sim.world.economy.cash = 100_000;
  /*
   * Real purchases, swept across the whole tree: two alternating ids cap out at
   * seven levels and Stage 4's milestone asks for ten. Passes over the config
   * in order, buying whatever the prerequisite graph allows, until the
   * milestone is met or a full pass buys nothing — which would be a config
   * regression worth failing on loudly.
   */
  while (totalUpgradeLevels(sim.world) < requirement.upgradesBought) {
    let bought = false;
    for (const upgrade of UPGRADES) {
      if (totalUpgradeLevels(sim.world) >= requirement.upgradesBought) break;
      if (buyBuilt(sim.world, upgrade.id) === 'ok') bought = true;
    }
    if (!bought) throw new Error('no purchasable upgrade left below the milestone');
  }
  for (let i = 0; i < requirement.employeesHired; i++) hire(sim.world, 'cook', 0.5);
  sim.world.economy.cash = held;
}

/** Run construction to completion at whatever speed the requirement declares. */
function finishConstruction(sim: Sim, constructionMs: number): void {
  sim.advance(Math.ceil(constructionMs / TICK_MS) + 10);
}

describe('the operating reserve', () => {
  it('reproduces the Phase 12 stranding, and refuses it', () => {
    // The exact recorded scenario: ₡804 against the ₡800 Stage 3.
    const sim = new Sim({ seed: 8 });
    qualifyExceptCash(sim, 2);
    sim.world.economy.cash = 804;

    const requirement = requirementFor(2);
    expect(requirement).not.toBeNull();
    if (requirement === null) return;

    expect(meetsRequirement(sim.world, requirement)).toBe(false);
    expect(beginConstruction(sim.world)).toBe('not-ready');
    // And the reason is the reserve, not some other axis.
    expect(sim.world.economy.cash).toBeGreaterThanOrEqual(requirement.cashRequired);
  });

  for (const stage of [1, 2, 3] as const) {
    it(`holds at every boundary of stage ${String(stage)} -> ${String(stage + 1)}`, () => {
      const sim = new Sim({ seed: 8 });
      qualifyExceptCash(sim, stage);
      const requirement = requirementFor(stage);
      expect(requirement).not.toBeNull();
      if (requirement === null) return;

      const reserve = reserveFor(sim.world, requirement);
      // Stage 2 needs no new role, so its reserve is wage runway alone — zero
      // with no staff. Stages 3 and 4 must price the waiter in.
      if (stage === 1) expect(reserve).toBe(0);
      else expect(reserve).toBeGreaterThan(0);

      // One cent under the line: refused, and refused by the gate itself.
      sim.world.economy.cash = requirement.cashRequired + reserve - 0.01;
      expect(meetsRequirement(sim.world, requirement)).toBe(false);
      expect(beginConstruction(sim.world)).toBe('not-ready');

      // On the line: accepted, the threshold is spent, the reserve survives.
      sim.world.economy.cash = requirement.cashRequired + reserve;
      expect(meetsRequirement(sim.world, requirement)).toBe(true);
      expect(beginConstruction(sim.world)).toBe('ok');
      expect(sim.world.economy.cash).toBeCloseTo(reserve, 6);
    });
  }

  it('leaves exactly enough to hire the waiter the diner cannot earn without', () => {
    const sim = new Sim({ seed: 8 });
    qualifyExceptCash(sim, 2);
    const requirement = requirementFor(2);
    if (requirement === null) return;

    sim.world.economy.cash = requirement.cashRequired + reserveFor(sim.world, requirement);
    expect(beginConstruction(sim.world)).toBe('ok');
    finishConstruction(sim, requirement.constructionMs);
    expect(sim.world.progression.stage).toBe(3);

    // The purchase the reserve exists to guarantee.
    expect(hire(sim.world, 'waiter', 0)).toBe('ok');
    expect(sim.world.economy.cash).toBeGreaterThanOrEqual(0);
  });

  it('asks for nothing extra when the waiter is already on the payroll', () => {
    const sim = new Sim({ seed: 8 });
    qualifyExceptCash(sim, 2);
    const requirement = requirementFor(2);
    if (requirement === null) return;

    const before = reserveFor(sim.world, requirement);
    sim.world.economy.cash = 100_000;
    expect(hire(sim.world, 'waiter', 0)).toBe('ok');
    const after = reserveFor(sim.world, requirement);

    // The hire cost drops out; the wage runway grows by the new wage. Both
    // directions matter: a reserve that ignored existing staff would tax the
    // prepared player, and one that ignored their wages would under-fund the
    // payroll the grace window is supposed to cover.
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);
  });

  it('earns again after the transition it just allowed', () => {
    /*
     * The property the whole rule exists for, measured end to end: evolve at
     * the exact boundary, hire the waiter from the reserve, and watch real
     * customers get served at the new stage. Ten simulated minutes at
     * reputation 40 is more arrivals than a flatline can hide.
     */
    const sim = new Sim({ seed: 8 });
    qualifyExceptCash(sim, 2);
    const requirement = requirementFor(2);
    if (requirement === null) return;

    sim.world.economy.cash = requirement.cashRequired + reserveFor(sim.world, requirement);
    expect(beginConstruction(sim.world)).toBe('ok');
    finishConstruction(sim, requirement.constructionMs);
    expect(hire(sim.world, 'waiter', 0)).toBe('ok');

    const servedBefore = sim.world.stats.customersServed;
    sim.advance(Math.ceil((10 * 60_000) / TICK_MS));

    expect(sim.world.stats.customersServed).toBeGreaterThan(servedBefore);
    // Alive means solvent, not merely visited: staff still on the payroll.
    expect(sim.world.employees.activeCount).toBeGreaterThan(0);
  }, 60_000);

  it('survives a save taken between the transition and the first hire', () => {
    /*
     * The stranding window is widest right after construction: the threshold is
     * spent, the reserve is the whole bank balance, and the waiter is not hired
     * yet. A save here must come back with the same balance and the same
     * ability to make the hire.
     */
    const sim = new Sim({ seed: 8 });
    qualifyExceptCash(sim, 2);
    const requirement = requirementFor(2);
    if (requirement === null) return;

    sim.world.economy.cash = requirement.cashRequired + reserveFor(sim.world, requirement);
    expect(beginConstruction(sim.world)).toBe('ok');
    finishConstruction(sim, requirement.constructionMs);

    const resumed = new Sim({ seed: 8 });
    restoreWorld(resumed.world, snapshotWorld(sim.world));

    expect(resumed.world.progression.stage).toBe(3);
    expect(resumed.world.economy.cash).toBeCloseTo(sim.world.economy.cash, 6);
    expect(hire(resumed.world, 'waiter', 0)).toBe('ok');
  });
});
