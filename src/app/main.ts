import { mount, unmount } from 'svelte';
import '@ui/theme/tokens.css';
import Shell from '@ui/shell/Shell.svelte';
import UnsupportedBrowser from '@ui/shell/UnsupportedBrowser.svelte';
import { detectCapabilities, type CapabilityReport } from '@platform/capability';
import { buildInfo } from '@platform/buildInfo';
import { createContainer, resolveSeed, selectStorage } from '@app/container';
import { DebugOverlay, debugOverlayEnabled } from '@app/debug/DebugOverlay';
import { phaserProjector, phaserUnprojector } from '@app/bridge/ScreenProjector';
import { createPhaserGame } from '@render/PhaserBootstrap';
import { WORLD_SCENE_KEY } from '@render/scenes/WorldScene';
import GameHud from '@ui/components/GameHud.svelte';
import OfflineReport from '@ui/screens/OfflineReport.svelte';
import { OfflineService } from '@app/OfflineService';
import { startPersistenceLifecycle } from '@app/lifecycle';
import { registerServiceWorker, shouldRegisterServiceWorker } from '@app/registerServiceWorker';
import { syncServerTime } from '@platform/timeSync';

/**
 * Composition root.
 *
 * Everything that decides *what* runs lives here; nothing that decides *how the
 * game behaves* does. From Phase 2 onward this file wires the simulation, the
 * renderer and the UI bridge together — it never contains game logic itself
 * (docs/WORKING_DISCIPLINE.md §2.1).
 */

/**
 * Test hook.
 *
 * E2E needs to exercise the unsupported-browser path without finding a machine
 * that genuinely lacks WebGL2. Rather than monkey-patching canvas internals from
 * the test (brittle, and it would drift from the real detection code), the app
 * accepts an explicit override. It is read once, at boot, from the query string.
 */
function readForcedFailure(search: string): CapabilityReport | null {
  const params = new URLSearchParams(search);
  const forced = params.get('forceUnsupported');
  if (forced === null) return null;

  return {
    supported: false,
    failure: forced === 'no-canvas-element' ? 'no-canvas-element' : 'no-webgl2',
    renderer: null,
    deviceMemoryGb: null,
    hardwareConcurrency: null,
    maxTextureSize: null,
  };
}

/**
 * The canvas host, beneath the Svelte overlay.
 *
 * Its own fixed, full-viewport element rather than `#app`: the overlay needs to
 * sit above the canvas with `pointer-events: none`, so clicks that miss a
 * control fall through to the world (TECHNICAL_ARCHITECTURE §7).
 */
function canvasHost(doc: Document): HTMLElement {
  const existing = doc.getElementById('game-canvas');
  if (existing !== null) return existing;

  const host = doc.createElement('div');
  host.id = 'game-canvas';
  host.style.cssText = 'position:fixed;inset:0;z-index:0';
  doc.body.insertBefore(host, doc.body.firstChild);
  return host;
}

/**
 * The overlay host, above the canvas.
 *
 * Its own element rather than `#app`, which still holds the Phase 2 shell and
 * sits *beneath* the canvas because the canvas is `position: fixed`. Two hosts
 * with an explicit stacking order beats one host whose layering depends on
 * which element happened to be positioned.
 */
function hudHost(doc: Document): HTMLElement {
  const existing = doc.getElementById('game-hud');
  if (existing !== null) return existing;

  const host = doc.createElement('div');
  host.id = 'game-hud';
  doc.body.appendChild(host);
  return host;
}

function boot(): void {
  const target = document.getElementById('app');
  if (target === null) {
    throw new Error('Mount point #app is missing from index.html');
  }

  const capabilities = readForcedFailure(window.location.search) ?? detectCapabilities();

  // Expose build identity for diagnostics and for the E2E suite, which asserts
  // that the SHA served by /health.json matches the SHA baked into the bundle.
  // Read-only and free of anything sensitive.
  Object.defineProperty(window, '__EVOTYCOON_BUILD__', {
    value: Object.freeze({ ...buildInfo }),
    writable: false,
    configurable: false,
    enumerable: false,
  });

  if (!capabilities.supported) {
    document.documentElement.dataset['appState'] = 'unsupported';
    mount(UnsupportedBrowser, {
      target,
      props: {
        failure: capabilities.failure ?? 'no-webgl2',
        renderer: capabilities.renderer,
      },
    });
    return;
  }

  document.documentElement.dataset['appState'] = 'ready';
  mount(Shell, { target, props: { capabilities } });

  void startSimulation(window);
}

/**
 * Start the deterministic kernel.
 *
 * Asynchronous only because probing the storage backend is: IndexedDB reports
 * availability by succeeding or failing to open, and a browser that blocks it
 * must fall through to localStorage before anything tries to autosave.
 *
 * `data-sim-state` on the document is the readiness signal the E2E suite waits
 * on. Waiting on a state attribute rather than a timeout is what keeps the suite
 * off the list in docs/FLAKY.md.
 */
/**
 * A persistent session is the ordinary one: a player at the plain URL.
 *
 * Every test instrument on the query string — a pinned seed, a frozen tick, a
 * staged scene or stage — asks for a *constructed* world, and loading a save
 * over a constructed world would hand the test whatever the player did last
 * week. Those sessions neither load nor autosave; the test-hook save/load door
 * stays available regardless, which is what the persistence E2E uses.
 */
function isPersistentSession(
  search: string,
  mode: { visualDeterminism: boolean; stage: number; sceneId: string },
): boolean {
  const params = new URLSearchParams(search);
  if (params.get('seed') !== null) return false;
  if (mode.visualDeterminism) return false;
  if (mode.stage !== 1) return false;
  if (mode.sceneId !== 'empty') return false;
  return true;
}

async function startSimulation(win: Window): Promise<void> {
  try {
    /*
     * Fired before anything else awaits, so its latency hides behind the
     * storage probe and the container build. The answer gates only the offline
     * settlement; a fresh session never waits on it.
     */
    const timeSync = syncServerTime(win.fetch.bind(win), () => Date.now());

    const storage = await selectStorage(win);
    const seed = resolveSeed(win.location.search, Date.now());
    const container = createContainer(win, seed, storage);

    const persistent = isPersistentSession(win.location.search, container.renderMode);
    const offline = new OfflineService(container.sim, container.saves, () => Date.now());
    let offlineReport: Awaited<ReturnType<OfflineService['boot']>>['report'] = null;
    if (persistent) {
      const boot = await offline.boot(await timeSync);
      offlineReport = boot.report;
      startPersistenceLifecycle(win, container.saves);
    } else {
      // Still cache the offset when it arrives: a test-hook save should carry
      // an honest lastSeenServerAt too.
      void timeSync.then((sync) => {
        container.saves.setServerOffset(sync.offsetMs);
      });
    }

    if (debugOverlayEnabled() && !container.renderMode.visualDeterminism) {
      new DebugOverlay(win.document, container.sim, container.loop).start(win);
    }

    const game = createPhaserGame({
      parent: canvasHost(win.document),
      context: container.renderContext,
    });
    // The key comes from the scene itself. Spelling it out here as 'WorldScene'
    // silently produced a projector that never found a camera, so every world
    // marker was off-screen and none of them ever rendered — with no error
    // anywhere, because "not on screen" is a legitimate answer.
    container.setProjector(phaserProjector(game, WORLD_SCENE_KEY));
    container.setUnprojector(phaserUnprojector(game, WORLD_SCENE_KEY));

    /*
     * The overlay mounts after the renderer, into its own host above the canvas.
     * `hideHud=1` skips it entirely rather than hiding it with CSS: the visual
     * goldens taken before this phase photographed a page with nothing above the
     * canvas, and an overlay that renders but is invisible still changes
     * anti-aliasing at its edges. Skipping the mount is the only version of
     * "hidden" that is provably byte-identical to the old goldens.
     */
    if (!container.renderMode.hideHud) {
      mount(GameHud, {
        target: hudHost(win.document),
        props: { source: container.ui, commands: container.commands },
      });
    }

    // A frozen scene must not advance: the loop would tick past the target while
    // the screenshot is being taken. The world is already at `freezeAt`.
    if (container.renderMode.freezeAt === null) container.loop.start();

    if (offlineReport !== null && !container.renderMode.hideHud) {
      const report = offlineReport;
      const host = hudHost(win.document);
      /*
       * Its own mount beside the HUD rather than a HudModel field: the report
       * is computed once at boot from wall clocks the bridge never samples,
       * and threading a static object through a 10 Hz sampler would be a
       * category error. `collect` closes over the service — the UI never sees
       * a command, per the bridge's own contract.
       */
      const instance = mount(OfflineReport, {
        target: host,
        props: {
          report,
          oncollect: () => offline.collect(),
          onclosed: () => {
            void unmount(instance);
          },
        },
      });
    }

    if (shouldRegisterServiceWorker(win.location.search, container.renderMode.visualDeterminism))
      registerServiceWorker(win);

    win.document.documentElement.dataset['simState'] = 'running';
    if (container.renderMode.visualDeterminism) {
      win.document.documentElement.dataset['visualMode'] = '1';
    }
  } catch (error) {
    // A kernel that fails to start is a broken build, not a recoverable state.
    // Surfacing it on the document lets the E2E console assertion catch it
    // instead of the page merely looking idle.
    win.document.documentElement.dataset['simState'] = 'failed';
    console.error('Simulation failed to start', error);
  }
}

boot();
