import { describe, expect, it } from 'vitest';
import { LEVEL_XP, UPGRADE_LEVEL_REQUIREMENTS, XP_WEIGHTS } from '@config/playerLevel';
import { Sim } from '@sim/core/Sim';
import { playerLevel, playerXp } from '@sim/systems/playerLevel';
import { buyUpgrade } from '@sim/systems/UpgradeSystem';

/**
 * The player-level gate — consolidation pass, 2026-08-21.
 *
 * The level is DERIVED from counters the world already hashes, so the gate
 * needs no new state, no schema bump and no pin renewal — which these tests
 * prove by construction: they move only pre-existing counters.
 */
describe('the player level, derived', () => {
  it('starts at level 1 with zero everything', () => {
    const sim = new Sim(1);
    expect(playerLevel(sim.world)).toEqual({
      level: 1,
      xp: 0,
      levelFloor: 0,
      nextLevelXp: LEVEL_XP[1],
    });
  });

  it('is a pure function of the counters — two worlds, same counters, same level', () => {
    const a = new Sim(1);
    const b = new Sim(424242); // different seed on purpose
    for (const sim of [a, b]) {
      sim.world.stats.customersServed = 37;
      sim.world.economy.lifetimeRevenue = 210.7;
    }
    expect(playerLevel(a.world)).toEqual(playerLevel(b.world));
    // Floats floor before they become XP: the fraction cannot flip a level.
    expect(playerXp(a.world)).toBe(37 * XP_WEIGHTS.served + 210 * XP_WEIGHTS.revenuePerCredit);
  });

  it('refuses a gated rung on a fresh world, as locked', () => {
    const sim = new Sim(1);
    sim.world.economy.cash = 10_000;
    expect(buyUpgrade(sim.world, 'menu-board')).toBe('locked');
  });

  it('sells the same rung once the counters carry the level', () => {
    const sim = new Sim(1);
    sim.world.economy.cash = 10_000;
    // Enough served customers for level 2 (LEVEL_XP[1] XP) and beyond.
    sim.world.stats.customersServed = Math.ceil((LEVEL_XP[1] ?? 60) / XP_WEIGHTS.served);
    expect(buyUpgrade(sim.world, 'menu-board')).toBe('ok');
  });

  it('never gates below level 2 — a gate of 1 would be a lie in the table', () => {
    for (const [id, level] of Object.entries(UPGRADE_LEVEL_REQUIREMENTS)) {
      expect(level, `${id} gate`).toBeGreaterThanOrEqual(2);
    }
  });
});
