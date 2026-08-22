import type { Sim } from '@sim/core/Sim';
import { computeOffline, decideElapsed, physicalCapacityPerMin } from '@sim/systems/OfflineSystem';
import { payrollPerMinute } from '@sim/systems/StaffSystem';
import type { OfflineEnvelope } from '@persistence/SaveManager';
import type { OfflineReportView } from '@app/bridge/offlineModel';
import type { SaveService } from '@app/SaveService';
import type { TimeSyncResult } from '@platform/timeSync';

/**
 * The offline flow — GAME_EXECUTION_ROADMAP Phase 14.
 *
 * Owns the sequence the design demands and the order it must happen in:
 *
 *   load → sync clocks → decide the window → price it → **consume it** → show
 *
 * The consume step — writing a save whose `lastSeenAt` is *now* and whose
 * `pending` is the priced report — happens before the report is ever shown.
 * That single ordering is the entire double-claim defence: reload before
 * collecting and the same pending report comes back; reload after collecting
 * and there is nothing to find; there is no interleaving in which the same
 * window prices twice, because pricing and consuming are one write.
 */

export interface OfflineBootResult {
  /** True when a save existed and was applied to the world. */
  readonly resumed: boolean;
  /** The report to show, or null (fresh boot, tiny window, backward clock…). */
  readonly report: OfflineReportView | null;
}

type PendingReport = NonNullable<OfflineEnvelope['pending']>;

export class OfflineService {
  private readonly sim: Sim;
  private readonly saves: SaveService;
  private readonly now: () => number;

  constructor(sim: Sim, saves: SaveService, now: () => number) {
    this.sim = sim;
    this.saves = saves;
    this.now = now;
  }

  /**
   * Resume the world and settle the absence. Never throws: a failed load is a
   * fresh boot, which is what the game did for thirteen phases.
   */
  async boot(sync: TimeSyncResult): Promise<OfflineBootResult> {
    this.saves.setServerOffset(sync.offsetMs);

    const loaded = await this.saves.load();
    if (!loaded.ok) {
      /*
       * `empty` is the first run. `corrupt` and `future-version` deserve a
       * recovery conversation the roadmap schedules with the settings screen;
       * until then the honest fallback is the pre-P14 behaviour — a fresh
       * world — with the reason on the console rather than swallowed.
       */
      if (loaded.reason !== 'empty') {
        console.warn(`Save not loaded (${loaded.reason}): ${loaded.detail}`);
      }
      return { resumed: false, report: null };
    }

    const carried = this.saves.pending;
    if (carried !== null) {
      // An unclaimed report from a previous boot. Re-shown as-is — the window
      // behind it was consumed when it was priced, so nothing recomputes.
      return { resumed: true, report: toView(carried) };
    }

    const save = loaded.save;
    const decision = decideElapsed({
      localNowMs: this.now(),
      serverNowMs: sync.serverNowMs,
      lastSeenAtMs: save.lastSeenAt,
      lastSeenServerAtMs: save.lastSeenServerAt,
    });

    let pending: PendingReport | null = null;
    if (save.offline.meter !== null && !decision.clockWentBackward) {
      const result = computeOffline({
        decision,
        meter: save.offline.meter,
        wagesPerMin: payrollPerMinute(this.sim.world),
        capacityPerMin: physicalCapacityPerMin(this.sim.world),
      });
      if (result.worthReporting) {
        pending = {
          computedAtMs: this.now(),
          awayMs: result.awayMs,
          creditedMs: result.creditedMs,
          customersServed: result.customersServed,
          gross: result.gross,
          expenses: result.expenses,
          net: result.net,
          limiter: result.limiter,
          limiterUtilization: clamp01(result.limiterUtilization),
          turnedAway: result.turnedAway,
          capHalved: result.capHalved,
        };
      }
    } else if (decision.clockWentBackward) {
      // GDD §17.3: zero reward, no penalty, silent log.
      console.warn('Offline window skipped: clock moved backwards (no reward, no penalty).');
    }

    this.saves.setPendingReport(pending);
    /*
     * The consume write. From this moment the absence is spent: `lastSeenAt`
     * is now, and whatever it was worth rides in `pending` until collected.
     * If this write fails (quota, private mode) the report is withheld too —
     * a report that could be re-priced by reloading is exactly the exploit
     * the ordering exists to prevent.
     */
    try {
      await this.saves.save();
    } catch (error) {
      console.warn('Offline settlement failed to persist; withholding the report.', error);
      this.saves.setPendingReport(null);
      return { resumed: true, report: null };
    }

    return { resumed: true, report: pending === null ? null : toView(pending) };
  }

  /** Apply the pending report to the till, then persist the claim. */
  async collect(): Promise<void> {
    const pending = this.saves.pending;
    if (pending === null) return;

    this.sim.dispatch({
      t: 'COLLECT_OFFLINE',
      gross: pending.gross,
      expenses: pending.expenses,
      net: pending.net,
      // Construction sites advance by the same credited window the earnings
      // were priced over — one clock decision, applied to everything at once.
      creditedMs: pending.creditedMs,
    });
    /*
     * The command lands at the start of a tick — that is the command contract.
     * One tick runs here, synchronously, so the claim is *in* the world before
     * the save below snapshots it. Without it the money would sit in the
     * pending queue, which is not persisted: a reload before the next autosave
     * would find `pending` cleared and the cash never granted. One manual tick
     * is 50 ms of world time, is recorded in the command log at the tick it
     * landed on, and replays exactly.
     */
    this.sim.tick();

    this.saves.setPendingReport(null);
    await this.saves.save();
  }
}

function toView(pending: PendingReport): OfflineReportView {
  return {
    awayMs: pending.awayMs,
    creditedMs: pending.creditedMs,
    customersServed: pending.customersServed,
    gross: pending.gross,
    expenses: pending.expenses,
    net: pending.net,
    limiter: pending.limiter,
    limiterUtilization: pending.limiterUtilization,
    turnedAway: pending.turnedAway,
    capHalved: pending.capHalved,
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
