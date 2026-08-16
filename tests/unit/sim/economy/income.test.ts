import { describe, expect, it } from 'vitest';
import {
  ECONOMY_BUCKET_COUNT,
  ECONOMY_BUCKET_MS,
  ECONOMY_WINDOW_MS,
  DEAD_END_INCOME_MULTIPLE,
} from '@config/economy/tuning';
import { TICK_MS } from '@config/simulation';
import { UPGRADES, upgradeCost } from '@config/economy/upgrades';
import { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import {
  grossIncomePerMinute,
  netIncomePerMinute,
  recordExpense,
  recordRevenue,
} from '@sim/systems/EconomySystem';

const TICKS_PER_BUCKET = ECONOMY_BUCKET_MS / TICK_MS;
const TICKS_PER_WINDOW = ECONOMY_WINDOW_MS / TICK_MS;

/**
 * The sixty-second income window — GAME_EXECUTION_ROADMAP Phase 9.
 *
 * The number ECONOMY_DESIGN §8's dead-end rule is written against, so it has to
 * mean exactly what its label says. The tests that matter are the ones about
 * *forgetting*: an income figure that never falls is the failure mode that makes
 * the dead-end gate useless, because a stand that stopped earning an hour ago
 * would still look solvent.
 */
describe('the window', () => {
  it('reports nothing on a fresh world', () => {
    const sim = new Sim({ seed: 1 });
    expect(grossIncomePerMinute(sim.world)).toBe(0);
    expect(netIncomePerMinute(sim.world)).toBe(0);
  });

  it('scales a single sale up to a per-minute rate', () => {
    // One ₡5 sale inside a sixty-second window is ₡5 a minute, by definition.
    const sim = new Sim({ seed: 1 });
    recordRevenue(sim.world, 5);
    expect(grossIncomePerMinute(sim.world)).toBeCloseTo(5, 9);
  });

  it('subtracts what the food cost to make', () => {
    const sim = new Sim({ seed: 1 });
    recordRevenue(sim.world, 5);
    recordExpense(sim.world, 1.8);
    expect(grossIncomePerMinute(sim.world)).toBeCloseTo(5, 9);
    expect(netIncomePerMinute(sim.world)).toBeCloseTo(3.2, 9);
  });

  it('forgets a sale once it falls out of the window', () => {
    /*
     * The property an exponential moving average does not have, and the reason
     * this is buckets. A stand that stopped serving must read zero within a
     * minute — otherwise the dead-end gate, which asks "can they afford the
     * cheapest upgrade from current income", answers from a minute that is over.
     */
    const sim = new Sim({ seed: 1 });
    recordRevenue(sim.world, 12);
    expect(grossIncomePerMinute(sim.world)).toBeCloseTo(12, 9);

    sim.advance(TICKS_PER_WINDOW + TICKS_PER_BUCKET);
    expect(grossIncomePerMinute(sim.world)).toBe(0);
  });

  it('keeps a sale for the whole window and not a tick longer', () => {
    const sim = new Sim({ seed: 1 });
    recordRevenue(sim.world, 10);

    // Just inside: eleven of the twelve buckets have rotated past.
    sim.advance(TICKS_PER_BUCKET * (ECONOMY_BUCKET_COUNT - 1));
    expect(grossIncomePerMinute(sim.world), 'dropped early').toBeCloseTo(10, 9);

    // One more rotation lands on the bucket the sale is in, clearing it.
    sim.advance(TICKS_PER_BUCKET);
    expect(grossIncomePerMinute(sim.world), 'kept too long').toBe(0);
  });

  it('holds a steady rate while sales keep arriving', () => {
    /*
     * ₡1 every bucket, for two full windows. The reading settles at ₡11 rather
     * than ₡12 because the loop records *then* advances: the last rotation
     * clears the bucket it lands on and nothing has been booked into it yet, so
     * eleven of the twelve hold a credit at any instant.
     *
     * The number matters less than the fact that it stops moving. A window that
     * kept climbing would be a window that never forgets, which is the whole
     * failure this design avoids.
     */
    const sim = new Sim({ seed: 1 });
    const readings: number[] = [];
    for (let bucket = 0; bucket < ECONOMY_BUCKET_COUNT * 2; bucket++) {
      recordRevenue(sim.world, 1);
      sim.advance(TICKS_PER_BUCKET);
      if (bucket >= ECONOMY_BUCKET_COUNT) readings.push(grossIncomePerMinute(sim.world));
    }

    expect(grossIncomePerMinute(sim.world)).toBeCloseTo(ECONOMY_BUCKET_COUNT - 1, 6);
    for (const reading of readings) {
      expect(reading, 'the rate drifted').toBeCloseTo(readings[0] ?? 0, 9);
    }
  });

  it('goes negative rather than hiding a loss', () => {
    /*
     * Not clamped, deliberately. Wages arrive in Phase 10 and a stand paying
     * more than it earns is exactly the situation the dead-end rule exists to
     * catch — a floor of zero would hide it behind a number that looks merely
     * quiet.
     */
    const sim = new Sim({ seed: 1 });
    recordExpense(sim.world, 9);
    expect(netIncomePerMinute(sim.world)).toBeCloseTo(-9, 9);
  });

  it('survives a save and reload with the window intact', () => {
    /*
     * It cannot be recomputed: it is a window over the last minute of play, and
     * a resumed session has no record of the payments inside it. Dropped, the
     * HUD would read zero for a minute after every load — indistinguishable
     * from a stand that has stopped earning.
     */
    const sim = new Sim({ seed: 1 });
    recordRevenue(sim.world, 7);
    recordExpense(sim.world, 2);
    sim.advance(TICKS_PER_BUCKET * 3);

    const resumed = new Sim({ seed: 1 });
    restoreWorld(resumed.world, snapshotWorld(sim.world));

    expect(grossIncomePerMinute(resumed.world)).toBeCloseTo(grossIncomePerMinute(sim.world), 9);
    expect(netIncomePerMinute(resumed.world)).toBeCloseTo(netIncomePerMinute(sim.world), 9);

    /*
     * Restored against restored, not against the live world.
     *
     * A live world carries traffic the save deliberately does not — a save is a
     * statement about the *stand*, not about which cars happened to be on the
     * road (TECHNICAL_ARCHITECTURE §8.1). Comparing a restored hash with a live
     * one therefore only passes when the road happens to be empty, which it was
     * at this tick until Phase 12 changed the arrival rate and it was not any
     * more. `browserWiring.test.ts` documents the same pattern.
     */
    const again = new Sim({ seed: 1 });
    restoreWorld(again.world, snapshotWorld(sim.world));
    expect(again.world.hash()).toBe(resumed.world.hash());
  });
});

describe('the dead-end rule has something to measure against', () => {
  it('names a cheapest upgrade, and it is the one the design intends', () => {
    /*
     * ECONOMY_DESIGN §8: `cheapestMeaningfulUpgrade.cost <= netIncomePerMin *
     * 1.5`. The full gate is Phase 12's balance simulator; this asserts the
     * inputs exist and are the right shape, so that gate has something to run
     * against rather than discovering the shape late.
     */
    const cheapest = UPGRADES.reduce((best, item) =>
      upgradeCost(item, 1, 1) < upgradeCost(best, 1, 1) ? item : best,
    );
    expect(cheapest.id).toBe('hand-painted-sign');
    // ₡6 since Phase 12. The Stage 1 ladder was rescaled so that the *next*
    // rung is always inside ninety seconds of income — the design's own
    // dead-end rule, which the old ladder (12, 28, 45, 40, 60, 35) broke at
    // fifteen minutes with a 172-second gap. See PHASE_12_REPORT §4.
    expect(upgradeCost(cheapest, 1, 1)).toBe(6);
  });

  it('states what income the first upgrade would need, at ninety seconds', () => {
    // ₡12 at 1.5 minutes of income means ₡8 a minute. Recorded as an assertion
    // rather than a comment so a balance change that breaks it is caught here
    // rather than in Phase 12.
    const required = 12 / DEAD_END_INCOME_MULTIPLE;
    expect(required).toBeCloseTo(8, 9);

    const sim = new Sim({ seed: 1 });
    recordRevenue(sim.world, 8);
    expect(netIncomePerMinute(sim.world) * DEAD_END_INCOME_MULTIPLE).toBeGreaterThanOrEqual(12);
  });
});
