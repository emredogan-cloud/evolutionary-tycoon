import type { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import { offlineMeterSummary } from '@sim/systems/offlineMeter';
import type { LoadResult, OfflineEnvelope, SaveManager } from '@persistence/SaveManager';
import type { CurrentSaveFile } from '@persistence/schema';

/**
 * Bridges the simulation and the storage layer.
 *
 * Neither side may reach the other directly: `src/sim` performs no I/O, and
 * `src/persistence` holds no game knowledge beyond the snapshot shape. This is
 * where the wall clock enters — `src/app` is one of the two layers permitted to
 * read it (TECHNICAL_ARCHITECTURE §5.3).
 */
export class SaveService {
  private readonly sim: Sim;
  private readonly saves: SaveManager;
  private readonly buildSha: string;
  private readonly now: () => number;

  /**
   * Preserved across writes so "when did this player start" survives every
   * autosave, rather than being reset to the moment of the last one.
   */
  private createdAt: number | null = null;

  /**
   * `serverNow − localNow`, cached from the boot sync — Phase 14.
   *
   * Lets every save carry a server-referenced `lastSeenServerAt`, which is
   * what makes the *next* boot's window immune to the local clock entirely.
   * Null when the server never answered; those saves carry null, honestly.
   */
  private serverOffsetMs: number | null = null;

  /**
   * The unclaimed offline report, carried through every write — Phase 14.
   *
   * Living here rather than in the world because it is an IOU about wall
   * clocks, not simulation state: the window was consumed and priced the
   * moment it was computed, and it survives reloads until collected.
   */
  private pendingReport: OfflineEnvelope['pending'] = null;

  constructor(sim: Sim, saves: SaveManager, buildSha: string, now: () => number) {
    this.sim = sim;
    this.saves = saves;
    this.buildSha = buildSha;
    this.now = now;
  }

  get backendName(): string {
    return this.saves.backendName;
  }

  setServerOffset(offsetMs: number | null): void {
    this.serverOffsetMs = offsetMs;
  }

  setPendingReport(pending: OfflineEnvelope['pending']): void {
    this.pendingReport = pending;
  }

  get pending(): OfflineEnvelope['pending'] {
    return this.pendingReport;
  }

  async save(): Promise<CurrentSaveFile> {
    const nowMs = this.now();
    const file = await this.saves.save(snapshotWorld(this.sim.world), {
      buildSha: this.buildSha,
      nowMs,
      // Simulation time is the honest playtime: it advances only while ticks run,
      // so a tab left open overnight does not claim eight hours of play.
      playtimeMs: this.sim.world.clock.simTimeMs,
      lastSeenServerAt: this.serverOffsetMs === null ? null : nowMs + this.serverOffsetMs,
      offline: {
        // Measured at the moment of the write — this save *is* the leaving
        // record, and the meter is what "the last five minutes of active
        // play" concretely was when the player left.
        meter: toStoredMeter(offlineMeterSummary(this.sim.world)),
        pending: this.pendingReport,
      },
      ...(this.createdAt !== null ? { createdAt: this.createdAt } : {}),
    });
    this.createdAt = file.createdAt;
    return file;
  }

  /** Applies the save to the live world on success; leaves it untouched on failure. */
  async load(): Promise<LoadResult> {
    const result = await this.saves.load();
    if (!result.ok) return result;
    restoreWorld(this.sim.world, result.save);
    this.createdAt = result.save.createdAt;
    this.pendingReport = result.save.offline.pending;
    return result;
  }

  async clear(): Promise<void> {
    await this.saves.clear();
    this.createdAt = null;
    this.pendingReport = null;
  }
}

/**
 * The summary, with its utilisation array made mutable and clamped for the
 * schema. Utilisation is an average of clamped fractions and cannot exceed 1
 * mathematically; the clamp guards the schema against float dust like
 * 1.0000000000000002 rather than against the meter being wrong.
 */
function toStoredMeter(summary: ReturnType<typeof offlineMeterSummary>): {
  throughputPerMin: number;
  avgTicket: number;
  avgCogs: number;
  turnedAwayPerMin: number;
  utilization: number[];
} {
  return {
    throughputPerMin: summary.throughputPerMin,
    avgTicket: summary.avgTicket,
    avgCogs: summary.avgCogs,
    turnedAwayPerMin: summary.turnedAwayPerMin,
    utilization: summary.utilization.map((value) => (value < 0 ? 0 : value > 1 ? 1 : value)),
  };
}
