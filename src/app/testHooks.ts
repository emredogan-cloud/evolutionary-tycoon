import type { FrameStats } from '@app/FrameMeter';
import { checksumOf } from '@persistence/checksum';
import type { StorageAdapter } from '@persistence/StorageAdapter';
import type { GameLoop } from '@app/GameLoop';
import type { SaveService } from '@app/SaveService';
import type { CommandInput } from '@sim/core/commands';
import type { SimEvent } from '@sim/core/events';
import type { Sim } from '@sim/core/Sim';
import type { SimView } from '@sim/core/types';

/**
 * `window.__EVOTYCOON__` — the E2E and diagnostics hook (TESTING_STRATEGY §7.2).
 *
 * Playwright never clicks the canvas to make something happen in the world. It
 * dispatches a command and advances ticks, then asserts on state. That is not a
 * shortcut: a click test measures how well a mouse coordinate maps to a world
 * position, which is one narrow thing worth a handful of dedicated tests, and it
 * makes every *other* test hostage to a rendering change.
 *
 * The hook is gated on `?e2e=1` rather than compiled out, because the suite runs
 * against the real production bundle on a real deployment. Its surface is
 * read-plus-command only — the same door the player uses.
 */

interface TestSaveResult {
  readonly ok: boolean;
  readonly backend: string;
  readonly checksum: string | null;
  readonly error: string | null;
}

interface TestLoadResult {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly slot: string | null;
  readonly recovered: boolean;
  readonly tick: number;
  readonly hash: string;
}

export interface EvoTycoonTestApi {
  getState(): SimView;
  getWorldHash(): string;
  dispatch(command: CommandInput): void;
  advanceTicks(count: number): void;
  /** Events published since the last call, oldest first. Drains the buffer. */
  drainEvents(): readonly SimEvent[];
  getLoopStats(): { frames: number; ticks: number; droppedTicks: number };
  getSystemOrder(): readonly string[];
  /** Frame-time percentiles from `?bench=1`. Zeroed when the meter is off. */
  getFrameStats(): FrameStats;
  resetFrameStats(): void;
  save(): Promise<TestSaveResult>;
  load(): Promise<TestLoadResult>;
  clearSaves(): Promise<void>;
  /**
   * Rewrite fields of the stored primary save — the door the offline abuse
   * scenarios walk through (Phase 14). `patch` is deep-merged onto the stored
   * JSON; the checksum is recomputed unless `corrupt` asks for a stale one, in
   * which case the file is a corruption fixture rather than a manipulation one.
   * Returns false when no save exists to tamper with.
   */
  tamperSave(patch: Record<string, unknown>, options?: { corrupt?: boolean }): Promise<boolean>;
}

const TEST_HOOK_KEY = '__EVOTYCOON__';

/** Keeps a bounded history so a long E2E run cannot grow the buffer without limit. */
const EVENT_BUFFER_LIMIT = 512;

/** Exposed for `?e2e=1`; dev builds get it unconditionally. */
export function shouldExposeTestHooks(search: string): boolean {
  if (import.meta.env.DEV) return true;
  return new URLSearchParams(search).get('e2e') === '1';
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    const existing = base[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      base[key] = value;
    }
  }
}

export function installTestHooks(
  target: Window,
  sim: Sim,
  loop: GameLoop,
  saves: SaveService,
  frames: { stats(): FrameStats; reset(): void },
  storage: StorageAdapter,
): void {
  // Events are pooled and reused, so the buffer holds copies. Keeping the
  // records themselves would hand the test whatever the next tick wrote into them.
  const buffer: SimEvent[] = [];
  sim.events.subscribe((event) => {
    if (buffer.length >= EVENT_BUFFER_LIMIT) buffer.shift();
    buffer.push({ ...event });
  });

  const api: EvoTycoonTestApi = {
    getState: () => sim.readView(),
    getWorldHash: () => sim.world.hash(),
    dispatch: (command) => {
      sim.dispatch(command);
    },
    advanceTicks: (count) => {
      sim.advance(count);
    },
    drainEvents: () => buffer.splice(0, buffer.length),
    getLoopStats: () => {
      const stats = loop.stats;
      return { frames: stats.frames, ticks: stats.ticks, droppedTicks: stats.droppedTicks };
    },
    getSystemOrder: () => sim.systemOrder,
    getFrameStats: () => frames.stats(),
    resetFrameStats: () => {
      frames.reset();
    },

    save: async () => {
      try {
        const file = await saves.save();
        return { ok: true, backend: saves.backendName, checksum: file.checksum, error: null };
      } catch (error) {
        return {
          ok: false,
          backend: saves.backendName,
          checksum: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    load: async () => {
      const result = await saves.load();
      return {
        ok: result.ok,
        reason: result.ok ? null : result.reason,
        slot: result.ok ? result.slot : null,
        recovered: result.ok && result.recovered,
        tick: sim.world.tick,
        hash: sim.world.hash(),
      };
    },

    clearSaves: () => saves.clear(),

    tamperSave: async (patch, options) => {
      const raw = await storage.read('save');
      if (raw === null) return false;
      const decoded = JSON.parse(raw) as Record<string, unknown>;
      deepMerge(decoded, patch);
      if (options?.corrupt !== true) {
        delete decoded['checksum'];
        decoded['checksum'] = checksumOf(decoded);
      }
      await storage.write('save', JSON.stringify(decoded));
      return true;
    },
  };

  // Non-configurable so a page script cannot swap the hook for one that lies.
  // That also means a second install would fail with a bare TypeError, so the
  // real condition — two simulations wired to one page — is named explicitly.
  if (Object.prototype.hasOwnProperty.call(target, TEST_HOOK_KEY)) {
    throw new Error(
      `${TEST_HOOK_KEY} is already installed on this window: a page boots exactly one simulation.`,
    );
  }

  Object.defineProperty(target, TEST_HOOK_KEY, {
    value: Object.freeze(api),
    writable: false,
    configurable: false,
    enumerable: false,
  });
}
