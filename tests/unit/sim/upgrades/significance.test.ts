import { describe, expect, it } from 'vitest';
import { buyBuilt } from '../../../helpers/build';
import { UPGRADES } from '@config/economy/upgrades';
import { Sim } from '@sim/core/Sim';
import { effectValue } from '@sim/systems/UpgradeSystem';

/**
 * Minimum significance, measured rather than declared — ECONOMY_DESIGN §6.3.
 *
 * `upgradeCost.test.ts` checks the *authored numbers* against the published
 * thresholds. This file checks the other half, which is the half that actually
 * catches things: that buying the upgrade **moves the number the simulation
 * reads**.
 *
 * The two are not the same claim. An effect can be authored at a perfectly
 * significant size and still change nothing — wired to a kind nobody consumes,
 * damped to nothing by `combineDiminishing`, or clamped away by a ceiling it
 * runs into. Each of those has happened in a shipped game; the first happened in
 * this one, in Phase 12, and cost a whole phase's worth of confusion before the
 * paired experiment found it.
 */

/** A world at `stage` with every prerequisite of `id` already owned. */
function readyFor(id: string): Sim {
  const item = UPGRADES.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error(`no upgrade "${id}"`);

  const sim = new Sim({ seed: 1 });
  sim.world.economy.cash = 10_000_000;
  sim.world.stats.customersServed = 5_000;
  sim.world.progression.stage = item.stage;

  const buyChain = (target: string): void => {
    const entry = UPGRADES.find((candidate) => candidate.id === target);
    if (entry === undefined) return;
    for (const prereq of entry.prereqs) buyChain(prereq);
    if (target !== id) buyBuilt(sim.world, target);
  };
  buyChain(id);

  return sim;
}

describe('buying an upgrade moves the number the simulation reads', () => {
  it.each(UPGRADES.map((item) => [item.id] as const))('%s changes at least one of its effects', (id) => {
    /*
     * Read the effect, buy the upgrade, read it again. Anything that does not
     * move is either not wired up or has been damped into invisibility, and both
     * are the banned upgrade wearing a different hat.
     */
    const item = UPGRADES.find((candidate) => candidate.id === id);
    expect(item).toBeDefined();
    if (item === undefined) return;

    const sim = readyFor(id);
    const before = item.effects.map((effect) => effectValue(sim.world, effect.kind));

    expect(buyBuilt(sim.world, id), `${id} could not be bought at stage ${String(item.stage)}`).toBe('ok');

    const after = item.effects.map((effect) => effectValue(sim.world, effect.kind));
    const moved = after.some((value, index) => Math.abs(value - (before[index] ?? 0)) > 1e-9);

    expect(moved, `${id} left every effect it declares unchanged`).toBe(true);
  });

  it.each(UPGRADES.filter((item) => item.maxLevel > 1).map((item) => [item.id] as const))(
    '%s keeps moving on its last level',
    (id) => {
      /*
       * The last level is where a filler level hides: the first is significant,
       * somebody adds three more to fill a curve, and the fourth changes nothing
       * the player can see. Buying to the top and checking the final step
       * catches it without asserting a size, which is `upgradeCost.test.ts`'s
       * job.
       */
      const item = UPGRADES.find((candidate) => candidate.id === id);
      if (item === undefined) return;

      const sim = readyFor(id);
      for (let level = 1; level < item.maxLevel; level++) {
        expect(buyBuilt(sim.world, id)).toBe('ok');
      }

      const before = item.effects.map((effect) => effectValue(sim.world, effect.kind));
      expect(buyBuilt(sim.world, id)).toBe('ok');
      const after = item.effects.map((effect) => effectValue(sim.world, effect.kind));

      const moved = after.some((value, index) => Math.abs(value - (before[index] ?? 0)) > 1e-9);
      expect(moved, `${id}'s last level changes nothing`).toBe(true);
    },
  );

  it('refuses to sell a level past the top', () => {
    const sim = readyFor('hand-painted-sign');
    for (let level = 0; level < 4; level++) expect(buyBuilt(sim.world, 'hand-painted-sign')).toBe('ok');
    expect(buyBuilt(sim.world, 'hand-painted-sign')).toBe('maxed');
  });
});

describe('the effects damp each other rather than compounding without limit', () => {
  it('makes a second upgrade in the same category worth less than the first', () => {
    /*
     * `combineDiminishing` is what stops five different +20%s becoming ×2.5 —
     * exploit E4 in ECONOMY_DESIGN §14. With thirty upgrades and four of them
     * pushing on visibility, it is doing real work for the first time.
     */
    const sim = new Sim({ seed: 1 });
    sim.world.economy.cash = 10_000_000;
    sim.world.stats.customersServed = 5_000;
    sim.world.progression.stage = 4;

    const base = effectValue(sim.world, 'visibility');
    expect(buyBuilt(sim.world, 'hand-painted-sign')).toBe('ok');
    const first = effectValue(sim.world, 'visibility') - base;

    // Straight to the other visibility upgrade, through its prerequisites.
    expect(buyBuilt(sim.world, 'illuminated-sign')).toBe('ok');
    expect(buyBuilt(sim.world, 'neon-facade')).toBe('ok');
    const before = effectValue(sim.world, 'visibility');
    expect(buyBuilt(sim.world, 'roadside-pylon')).toBe('ok');
    const second = effectValue(sim.world, 'visibility') - before;

    expect(first, 'the first purchase did nothing').toBeGreaterThan(0);
    expect(second, 'the second purchase did nothing').toBeGreaterThan(0);
    expect(second, 'two visibility upgrades compounded without damping').toBeLessThan(first);
  });
});
