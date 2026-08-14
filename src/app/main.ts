import { mount } from 'svelte';
import '@ui/theme/tokens.css';
import Shell from '@ui/shell/Shell.svelte';
import UnsupportedBrowser from '@ui/shell/UnsupportedBrowser.svelte';
import { detectCapabilities, type CapabilityReport } from '@platform/capability';
import { buildInfo } from '@platform/buildInfo';
import { createContainer, resolveSeed, selectStorage } from '@app/container';
import { DebugOverlay, debugOverlayEnabled } from '@app/debug/DebugOverlay';

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
async function startSimulation(win: Window): Promise<void> {
  try {
    const storage = await selectStorage(win);
    const seed = resolveSeed(win.location.search, Date.now());
    const container = createContainer(win, seed, storage);

    if (debugOverlayEnabled()) {
      new DebugOverlay(win.document, container.sim, container.loop).start(win);
    }

    container.loop.start();
    win.document.documentElement.dataset['simState'] = 'running';
  } catch (error) {
    // A kernel that fails to start is a broken build, not a recoverable state.
    // Surfacing it on the document lets the E2E console assertion catch it
    // instead of the page merely looking idle.
    win.document.documentElement.dataset['simState'] = 'failed';
    console.error('Simulation failed to start', error);
  }
}

boot();
