import { UiBridge } from '@app/bridge/UiBridge';
import type { UiCommands } from '@app/bridge/hudModel';
import type { ScreenProjector } from '@app/bridge/ScreenProjector';
import { NULL_PROJECTOR } from '@app/bridge/ScreenProjector';
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
import { buyUpgrade, nextUpgradeCost } from '@sim/systems/UpgradeSystem';
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
  /**
   * The throttled view model the DOM overlay reads.
   *
   * Built here and handed to both sides, so neither knows about the other: the
   * overlay receives a subscribe function and the loop receives a `sample` call.
   */
  readonly ui: UiBridge;
  /** What the overlay may ask the simulation to do. */
  readonly commands: UiCommands;
  /** Swapped for the real projection once Phaser has a camera. */
  setProjector(project: ScreenProjector): void;
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

  /*
   * Built before anything runs, and that ordering is load-bearing. The bridge
   * turns `PAYMENT` events into coin popups by *listening*, so a bridge
   * constructed after the fast-forward below would have missed every payment
   * that happened during it — and the frozen golden of a busy stand would show
   * no money changing hands at all.
   *
   * The projector is indirected for the mirror-image reason: the camera does not
   * exist until Phaser has booted a scene, which is later still. Rather than
   * defer the whole bridge — leaving the HUD blank for the first few frames — it
   * starts projecting nothing and is given the real transform when there is one.
   */
  let projector: ScreenProjector = NULL_PROJECTOR;
  const ui = new UiBridge(sim, (x, y, z, out) => projector(x, y, z, out));
  ui.start();

  // Staged before the first tick, so the world hash of a staged scene is a
  // function of the scene alone.
  stageScene(sim, renderMode.sceneId);
  /*
   * Granted before the fast-forward, so the world runs the whole way with them
   * in place. Buying at the end would photograph a stand that had just acquired
   * a sign rather than one that had been trading with it.
   */
  for (const id of renderMode.buy) {
    const cost = nextUpgradeCost(sim.world, id);
    if (cost < 0) continue;
    sim.world.economy.cash += cost;
    buyUpgrade(sim.world, id);
  }

  if (renderMode.freezeAt !== null && renderMode.freezeAt > 0) {
    if (renderMode.cook) {
      // Ticked one at a time so a command can be queued before each. `advance`
      // would run the whole fast-forward with an empty queue, and the stand
      // would arrive at the target tick having never cooked anything.
      for (let i = 0; i < renderMode.freezeAt; i++) {
        sim.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
        sim.tick();
      }
    } else {
      sim.advance(renderMode.freezeAt);
    }
  }

  const renderContext: RenderContext = {
    readView: () => sim.readView(),
    interpolationAlpha: () => (renderMode.freezeAt !== null ? 0 : loop.interpolationAlpha),
    reducedMotion: prefersReducedMotion(win),
    sceneId: renderMode.sceneId,
    showDevOverlays: debugOverlayEnabled() && !renderMode.visualDeterminism,
    onFrame: () => {
      ui.sample(win.performance.now());
    },
    ...(renderMode.lockedCamera !== null ? { lockedCamera: renderMode.lockedCamera } : {}),
  };

  // Always constructed, only recorded into when asked for: an always-on
  // observer would add a call to the hottest path in the program for a number
  // nobody is reading.
  const frames = new FrameMeter();
  const benchmarking = new URLSearchParams(search).get('bench') === '1';

  if (shouldExposeTestHooks(search)) {
    installTestHooks(win, sim, loop, saves, frames);
  }

  if (benchmarking) {
    loop.observeFrames((deltaMs) => {
      frames.record(deltaMs);
    });
  }

  /*
   * Sampling hangs off the *rendered* frame — `renderContext.onFrame` above —
   * rather than off a timer or the simulation loop. A `setInterval` would keep
   * firing in a backgrounded tab, publishing identical models forever; the
   * simulation loop stops entirely on a frozen scene, which still draws.
   *
   * One push here regardless, so the HUD has numbers before the renderer's first
   * frame instead of a tenth of a second of zeroes.
   */
  ui.refresh();

  return {
    sim,
    loop,
    saves,
    renderContext,
    renderMode,
    frames,
    ui,
    /*
     * Intents in, commands out. The overlay never builds a `Command`; it says
     * what the player did and this turns it into one, which is also the single
     * place a click becomes something the command log will replay.
     */
    commands: {
      /*
       * No refresh after dispatching. It would publish *before* the command
       * applies — commands land at the start of the next tick, deliberately, so
       * that wall-clock arrival time cannot change an outcome — and the card
       * would redraw with the state it already had. The next sample carries it,
       * within one tick plus one sample: 150 ms at worst.
       */
      buyUpgrade: (id: string) => {
        sim.dispatch({ t: 'BUY_UPGRADE', upgradeId: id });
      },
      setPrice: (itemId: string, price: number) => {
        sim.dispatch({ t: 'SET_PRICE', itemId, price });
      },
    },
    setProjector(next: ScreenProjector): void {
      projector = next;
      ui.refresh();
    },
  };
}
