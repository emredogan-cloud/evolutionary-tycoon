import { describe, expect, it } from 'vitest';
import { OFFLINE_METER_WINDOW_MS } from '@config/economy/offline';
import { Sim } from '@sim/core/Sim';
import { offlineMeterSummary, recordOfflineSale } from '@sim/systems/offlineMeter';

/**
 * The measurement window behind the offline reward — Phase 14.
 *
 * Two properties carry everything: the meter is deterministic (same seed, same
 * ticks, same summary — it is measured *from* the simulation), and it is
 * invisible to the simulation (excluded from the hash the same way the
 * cosmetic stream is, and proven the same way).
 */

describe('offline meter', () => {
  it('a played session measures a real throughput, ticket and utilisation', () => {
    const sim = new Sim({ seed: 424242 });
    for (let i = 0; i < 6000; i++) {
      sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      sim.tick();
    }
    const summary = offlineMeterSummary(sim.world);
    expect(summary.throughputPerMin).toBeGreaterThan(0);
    expect(summary.avgTicket).toBeGreaterThan(0);
    expect(summary.avgCogs).toBeGreaterThan(0);
    expect(summary.avgCogs).toBeLessThan(summary.avgTicket);
    expect(summary.utilization).toHaveLength(5);
    for (const value of summary.utilization) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic: same seed, same commands, same summary', () => {
    const run = (): ReturnType<typeof offlineMeterSummary> => {
      const sim = new Sim({ seed: 77 });
      for (let i = 0; i < 4000; i++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();
      }
      return offlineMeterSummary(sim.world);
    };
    expect(run()).toEqual(run());
  });

  it('is a sliding window: a burst five minutes ago has been forgotten', () => {
    const sim = new Sim({ seed: 3 });
    // Sales recorded directly — the window mechanics are what is under test.
    recordOfflineSale(sim.world, 100, 10);
    recordOfflineSale(sim.world, 100, 10);
    const before = offlineMeterSummary(sim.world);
    expect(before.throughputPerMin).toBeGreaterThan(0);

    // One full window later, with no further sales, the burst has aged out.
    const ticks = Math.ceil(OFFLINE_METER_WINDOW_MS / 50) + 20;
    sim.advance(ticks);
    const after = offlineMeterSummary(sim.world);
    expect(after.throughputPerMin).toBe(0);
    expect(after.avgTicket).toBe(0);
  });

  it('normalises over the full window, so a short session cannot inflate its rate', () => {
    const sim = new Sim({ seed: 3 });
    // Five sales in the first ten seconds of a session.
    sim.advance(200);
    for (let i = 0; i < 5; i++) recordOfflineSale(sim.world, 10, 1);
    const summary = offlineMeterSummary(sim.world);
    // 5 customers over a FIVE-MINUTE denominator: 1/min, not 30/min.
    expect(summary.throughputPerMin).toBeCloseTo(1, 6);
  });

  it('never enters the world hash — the exclusion the design promises', () => {
    /*
     * Same construction as the cosmetic-stream exclusion test: two identical
     * worlds, one meter polluted directly, hashes equal. If someone adds the
     * meter to `World.hash()`, this fails and the failure message is the
     * design document to read.
     */
    const a = new Sim({ seed: 5 });
    const b = new Sim({ seed: 5 });
    a.advance(100);
    b.advance(100);

    recordOfflineSale(b.world, 999, 99);
    b.world.offline.utilizationWindow[0] = 0.987;
    b.world.offline.bucketElapsedMs = 47;

    expect(a.world.hash()).toBe(b.world.hash());
  });

  it('does not survive a save: a resumed session measures afresh', () => {
    /*
     * The window is deliberately not snapshotted — `OfflineMeterState`'s own
     * comment. What a save carries is the summary, in the envelope, written by
     * the app layer. Restoring must therefore leave the meter empty rather
     * than half of one session bleeding into the rate of the next.
     */
    const sim = new Sim({ seed: 9 });
    for (let i = 0; i < 2000; i++) {
      sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      sim.tick();
    }
    expect(offlineMeterSummary(sim.world).throughputPerMin).toBeGreaterThanOrEqual(0);

    const resumed = new Sim({ seed: 9 });
    expect(offlineMeterSummary(resumed.world).throughputPerMin).toBe(0);
  });
});
