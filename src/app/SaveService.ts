import type { Sim } from '@sim/core/Sim';
import { restoreWorld, snapshotWorld } from '@sim/core/snapshot';
import type { LoadResult, SaveManager } from '@persistence/SaveManager';
import type { SaveFileV1 } from '@persistence/schema';

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

  constructor(sim: Sim, saves: SaveManager, buildSha: string, now: () => number) {
    this.sim = sim;
    this.saves = saves;
    this.buildSha = buildSha;
    this.now = now;
  }

  get backendName(): string {
    return this.saves.backendName;
  }

  async save(): Promise<SaveFileV1> {
    const nowMs = this.now();
    const file = await this.saves.save(snapshotWorld(this.sim.world), {
      buildSha: this.buildSha,
      nowMs,
      // Simulation time is the honest playtime: it advances only while ticks run,
      // so a tab left open overnight does not claim eight hours of play.
      playtimeMs: this.sim.world.clock.simTimeMs,
      lastSeenServerAt: null,
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
    return result;
  }

  async clear(): Promise<void> {
    await this.saves.clear();
    this.createdAt = null;
  }
}
