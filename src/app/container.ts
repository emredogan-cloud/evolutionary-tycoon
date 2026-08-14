import { stageScene } from '@app/devScene';
import { FrameMeter } from '@app/FrameMeter';
import { browserScheduler, GameLoop } from '@app/GameLoop';
import { parseRenderMode, prefersReducedMotion } from '@app/renderMode';
import type { RenderMode } from '@app/renderMode';
import { SaveService } from '@app/SaveService';
import { installTestHooks, shouldExposeTestHooks } from '@app/testHooks';
import type { RenderContext } from '@render/RenderContext';
import { debugOverlayEnabled } from '@app/debug/DebugOverlay';
import { buildInfo } from '@platform/buildInfo';
import { Sim } from '@sim/core/Sim';
import { IdbAdapter } from '@persistence/idbAdapter';
import { LocalStorageAdapter } from '@persistence/localStorageAdapter';
import { SaveManager } from '@persistence/SaveManager';
import { MemoryStorageAdapter } from '@persistence/StorageAdapter';
import type { StorageAdapter } from '@persistence/StorageAdapter';

/**
 * Composition root wiring.
 *
 * Decides *what* exists and how the pieces find each other. No game rule lives
 * here — the simulation does not import this module, and it never will.
 */

export interface GameContainer {
  readonly sim: Sim;
  readonly loop: GameLoop;
  readonly saves: SaveService;
  readonly renderContext: RenderContext;
  readonly renderMode: RenderMode;
  readonly frames: FrameMeter;
}

/**
 * Seed selection.
 *
 * `?seed=` first, because a reproducible session is worth more than a novel one
 * during development and is required for visual regression. Otherwise the seed
 * is derived from wall-clock time — the one legitimate `Date.now()` in the boot
 * path, and the reason it lives in `src/app` rather than `src/sim`.
 */
export function resolveSeed(search: string, nowMs: number): number {
  const raw = new URLSearchParams(search).get('seed');
  if (raw !== null) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  return nowMs >>> 0;
}

/**
 * Storage backend selection: IndexedDB, then localStorage, then memory.
 *
 * Memory last so the game still boots where both are blocked. That session's
 * progress is lost on reload, which is bad — but it is far better than a white
 * screen, and the caller can tell the difference from `saves.backendName`.
 */
export async function selectStorage(win: Window): Promise<StorageAdapter> {
  const idb = await IdbAdapter.open(win.indexedDB);
  if (idb !== null) return idb;

  const local: Storage | undefined = win.localStorage;
  if (LocalStorageAdapter.isAvailable(local)) return new LocalStorageAdapter(local);

  return new MemoryStorageAdapter();
}

/**
 * `?paused=1` boots without advancing time.
 *
 * A test that needs a pristine tick-0 world cannot get one otherwise: the
 * animation-frame loop starts immediately, so by the time a script runs, the
 * world has already moved. Phase 3 extends this into the full visual
 * determinism mode (`?seed=&freezeAt=&noParticles=…`).
 */
function shouldStartPaused(search: string): boolean {
  return new URLSearchParams(search).get('paused') === '1';
}

export function createContainer(win: Window, seed: number, storage: StorageAdapter): GameContainer {
  const search = win.location.search;
  const renderMode = parseRenderMode(search);

  // A frozen clock starts paused: the loop must not advance a single tick past
  // the target before the screenshot is taken.
  const startPaused = shouldStartPaused(search) || renderMode.freezeAt !== null;

  const sim = new Sim({ seed, startPaused });
  const loop = new GameLoop(sim, browserScheduler(win));
  const saves = new SaveService(sim, new SaveManager(storage), buildInfo.buildSha, () => Date.now());

  // Staged before the first tick, so the world hash of a staged scene is a
  // function of the scene alone.
  stageScene(sim, renderMode.sceneId);
  if (renderMode.freezeAt !== null && renderMode.freezeAt > 0) {
    sim.advance(renderMode.freezeAt);
  }

  const renderContext: RenderContext = {
    readView: () => sim.readView(),
    interpolationAlpha: () => (renderMode.freezeAt !== null ? 0 : loop.interpolationAlpha),
    reducedMotion: prefersReducedMotion(win),
    sceneId: renderMode.sceneId,
    showDevOverlays: debugOverlayEnabled() && !renderMode.visualDeterminism,
    ...(renderMode.lockedCamera !== null ? { lockedCamera: renderMode.lockedCamera } : {}),
  };

  // Always constructed, only wired when asked for: an always-on observer would
  // add a call to the hottest path in the program for a number nobody is reading.
  const frames = new FrameMeter();
  if (new URLSearchParams(search).get('bench') === '1') {
    loop.observeFrames((deltaMs) => {
      frames.record(deltaMs);
    });
  }

  if (shouldExposeTestHooks(search)) {
    installTestHooks(win, sim, loop, saves, frames);
  }

  return { sim, loop, saves, renderContext, renderMode, frames };
}
