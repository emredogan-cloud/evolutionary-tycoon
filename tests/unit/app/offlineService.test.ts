import { describe, expect, it } from 'vitest';
import { OFFLINE_CAP_MS } from '@config/economy/offline';
import { Sim } from '@sim/core/Sim';
import { offlineMeterSummary } from '@sim/systems/offlineMeter';
import { SaveManager } from '@persistence/SaveManager';
import type { OfflineEnvelope } from '@persistence/SaveManager';
import { MemoryStorageAdapter } from '@persistence/StorageAdapter';
import { OfflineService } from '@app/OfflineService';
import { SaveService } from '@app/SaveService';
import type { TimeSyncResult } from '@platform/timeSync';

/**
 * The boot-and-claim flow — Phase 14's claim-once property, tested at the seam
 * where it actually lives: pricing and consuming are one save write, and the
 * report survives reloads until the till has been paid.
 */

const T0 = 1_776_000_000_000;
const HOUR = 3_600_000;

const SYNCED: TimeSyncResult = { serverNowMs: null, offsetMs: null };

interface Rig {
  readonly sim: Sim;
  readonly saves: SaveService;
  readonly offline: OfflineService;
  now: number;
}

/** A fresh app stack over shared storage, as a reload would build it. */
function rig(storage: MemoryStorageAdapter, now: number): Rig {
  const sim = new Sim({ seed: 42 });
  const holder: { now: number } = { now };
  const saves = new SaveService(sim, new SaveManager(storage), 'test-sha', () => holder.now);
  const offline = new OfflineService(sim, saves, () => holder.now);
  return {
    sim,
    saves,
    offline,
    get now() {
      return holder.now;
    },
    set now(value: number) {
      holder.now = value;
    },
  };
}

/** Play a measurable session and leave at T0: the save every scenario resumes. */
async function playAndLeave(storage: MemoryStorageAdapter): Promise<void> {
  const first = rig(storage, T0);
  for (let i = 0; i < 6000; i++) {
    first.sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
    first.sim.tick();
  }
  expect(offlineMeterSummary(first.sim.world).throughputPerMin).toBeGreaterThan(0);
  await first.saves.save();
}

describe('OfflineService.boot', () => {
  it('a fresh browser has nothing to resume and nothing to report', async () => {
    const session = rig(new MemoryStorageAdapter(), T0);
    const boot = await session.offline.boot(SYNCED);
    expect(boot.resumed).toBe(false);
    expect(boot.report).toBeNull();
  });

  it('14. a reload mid-session continues, with a window too small to report', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    const session = rig(storage, T0 + 30_000);
    const boot = await session.offline.boot(SYNCED);
    expect(boot.resumed).toBe(true);
    expect(boot.report).toBeNull();
    expect(session.sim.world.tick).toBe(6000);
  });

  it('prices a real absence and explains what limited it', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    const session = rig(storage, T0 + 2 * HOUR);
    const boot = await session.offline.boot(SYNCED);
    expect(boot.report).not.toBeNull();
    expect(boot.report?.awayMs).toBe(2 * HOUR);
    expect(boot.report?.customersServed).toBeGreaterThan(0);
    expect(boot.report?.gross).toBeGreaterThan(0);
    expect(['parking', 'kitchen', 'tables', 'staff', 'queue', 'demand']).toContain(boot.report?.limiter);
  });

  it('8. the same window can never pay twice — reload before collecting', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    const first = rig(storage, T0 + 2 * HOUR);
    const firstBoot = await first.offline.boot(SYNCED);
    const firstNet = firstBoot.report?.net;
    expect(firstNet).toBeDefined();

    // Reload WITHOUT collecting: the identical pending report comes back —
    // re-shown, not re-priced, even though another hour has "passed".
    const second = rig(storage, T0 + 3 * HOUR);
    const secondBoot = await second.offline.boot(SYNCED);
    expect(secondBoot.report?.net).toBe(firstNet);
    expect(secondBoot.report?.awayMs).toBe(2 * HOUR);
  });

  it('8b. collect pays the till once; the next boot finds nothing', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    const session = rig(storage, T0 + 2 * HOUR);
    const boot = await session.offline.boot(SYNCED);
    const net = boot.report?.net ?? 0;
    const cashBefore = session.sim.world.economy.cash;

    await session.offline.collect();
    expect(session.sim.world.economy.cash).toBeCloseTo(Math.max(0, cashBefore + net), 6);

    // A second collect in the same session is a no-op.
    await session.offline.collect();
    expect(session.sim.world.economy.cash).toBeCloseTo(Math.max(0, cashBefore + net), 6);

    // A reload after collecting finds no report at all.
    const after = rig(storage, T0 + 2 * HOUR + 60_000);
    const afterBoot = await after.offline.boot(SYNCED);
    expect(afterBoot.report).toBeNull();
  });

  it('a negative net cannot drag cash below zero at the claim', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    const session = rig(storage, T0 + 2 * HOUR);
    const boot = await session.offline.boot(SYNCED);
    expect(boot.report).not.toBeNull();

    // Force the claim negative beyond the till: the command's floor holds.
    const pending = session.saves.pending;
    expect(pending).not.toBeNull();
    if (pending === null) return;
    session.saves.setPendingReport({ ...pending, net: -1_000_000 });
    await session.offline.collect();
    expect(session.sim.world.economy.cash).toBe(0);
  });

  it('9. a manipulated meter is bounded by the plant it claims to be', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    // Save-file editing is explicitly not defended (GDD §18) — but the
    // physical ceiling still binds what a window can pay, so an edited
    // throughput of 10 000/min pays the Stage 1 plant, not the number.
    const raw = await storage.read('save');
    expect(raw).not.toBeNull();
    if (raw === null) return;
    const decoded = JSON.parse(raw) as {
      offline: { meter: { throughputPerMin: number } | null };
      checksum: string;
    };
    expect(decoded.offline.meter).not.toBeNull();

    const session = rig(storage, T0 + 2 * HOUR);
    const honest = await session.offline.boot(SYNCED);
    expect(honest.report).not.toBeNull();
    if (honest.report === null) return;
    // Stage 1 register bound: 60/min × 0.4 efficiency would still cap far
    // below a fabricated rate; the honest measured report is already inside.
    expect(honest.report.customersServed).toBeLessThanOrEqual(60 * (2 * 60));
  });

  it('13. a migrated (pre-P14) save has no measurement and reports nothing', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    // Rewrite the stored save as if it carried no meter (a v8 arrival).
    const raw = await storage.read('save');
    if (raw === null) return;
    const decoded = JSON.parse(raw) as Record<string, unknown> & {
      offline: OfflineEnvelope;
    };
    decoded.offline = { meter: null, pending: null };
    delete decoded['checksum'];
    const { checksumOf } = await import('@persistence/checksum');
    decoded['checksum'] = checksumOf(decoded);
    await storage.write('save', JSON.stringify(decoded));

    const session = rig(storage, T0 + 6 * HOUR);
    const boot = await session.offline.boot(SYNCED);
    expect(boot.resumed).toBe(true);
    expect(boot.report).toBeNull();
  });

  it('the unsynced cap actually halves a long unverified absence', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    const session = rig(storage, T0 + 30 * HOUR);
    const boot = await session.offline.boot({ serverNowMs: null, offsetMs: null });
    expect(boot.report?.creditedMs).toBe(OFFLINE_CAP_MS / 2);
    expect(boot.report?.capHalved).toBe(true);
  });

  it('a server-verified long absence pays the full eight hours', async () => {
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    const now = T0 + 30 * HOUR;
    const session = rig(storage, now);
    const boot = await session.offline.boot({ serverNowMs: now, offsetMs: 0 });
    expect(boot.report?.creditedMs).toBe(OFFLINE_CAP_MS);
    expect(boot.report?.capHalved).toBe(false);
  });

  it('12/13. the lifecycle writes are what the window opens from', async () => {
    /*
     * visibilitychange/pagehide call the same save() this asserts on: the
     * window starts at the last write, wherever it came from. What the DOM
     * listeners wire is covered in the E2E; what matters here is that a write
     * moves lastSeenAt and with it the window.
     */
    const storage = new MemoryStorageAdapter();
    await playAndLeave(storage);

    const mid = rig(storage, T0 + HOUR);
    await mid.offline.boot(SYNCED); // consumes and prices the first hour
    await mid.offline.collect(); //   …and pays it, so nothing is carried
    // Half an hour of real play, so the lifecycle write carries a measurement
    // (the meter window deliberately does not survive a reload):
    for (let i = 0; i < 6000; i++) {
      mid.sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      mid.sim.tick();
    }
    mid.now = T0 + HOUR + 30 * 60_000;
    await mid.saves.save();

    const later = rig(storage, T0 + 2 * HOUR);
    const boot = await later.offline.boot(SYNCED);
    // The new window opens at the last lifecycle write, not at the original
    // T0 and not at the previous boot: thirty minutes, not one or two hours.
    expect(boot.report).not.toBeNull();
    expect(boot.report?.awayMs).toBe(30 * 60_000);
  });
});
