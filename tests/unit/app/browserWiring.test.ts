// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContainer } from '@app/container';
import { GameLoop } from '@app/GameLoop';
import type { FrameScheduler } from '@app/GameLoop';
import { browserScheduler } from '@app/GameLoop';
import { SaveService } from '@app/SaveService';
import { DebugOverlay, debugOverlayEnabled } from '@app/debug/DebugOverlay';
import { installTestHooks, shouldExposeTestHooks } from '@app/testHooks';
import type { EvoTycoonTestApi } from '@app/testHooks';
import { Sim } from '@sim/core/Sim';
import { SaveManager } from '@persistence/SaveManager';
import { MemoryStorageAdapter } from '@persistence/StorageAdapter';

const inertScheduler: FrameScheduler = { request: () => 0, cancel: () => undefined };

function wire(): { sim: Sim; loop: GameLoop; saves: SaveService } {
  const sim = new Sim({ seed: 4242 });
  const loop = new GameLoop(sim, inertScheduler);
  const saves = new SaveService(
    sim,
    new SaveManager(new MemoryStorageAdapter()),
    'testsha',
    () => 1_770_000_000_000,
  );
  return { sim, loop, saves };
}

function hooksOn(target: Window): EvoTycoonTestApi {
  const api = (target as unknown as Record<string, EvoTycoonTestApi | undefined>)['__EVOTYCOON__'];
  if (api === undefined) throw new Error('test hooks were not installed');
  return api;
}

/**
 * A fresh window per test.
 *
 * The hook is installed non-configurably, so two containers cannot share one
 * window — which is the real production constraint (a page boots exactly one
 * simulation), not a test artefact. Animation frames delegate to the jsdom
 * window so the scheduler is exercised for real.
 */
function isolatedWindow(search: string): Window {
  return {
    requestAnimationFrame: (callback: FrameRequestCallback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle: number) => {
      window.cancelAnimationFrame(handle);
    },
    location: { search },
  } as unknown as Window;
}

describe('createContainer', () => {
  it('wires the simulation, the loop and the save service together', () => {
    const container = createContainer(isolatedWindow(''), 4242, new MemoryStorageAdapter());

    expect(container.sim.world.seed).toBe(4242);
    expect(container.loop.running).toBe(false);
    expect(container.saves.backendName).toBe('memory');

    container.sim.advance(5);
    expect(container.sim.readView().tick).toBe(5);
  });

  it('installs the test hooks only when they are asked for', () => {
    vi.stubEnv('DEV', false);

    const withoutHooks = isolatedWindow('');
    createContainer(withoutHooks, 1, new MemoryStorageAdapter());
    expect((withoutHooks as unknown as Record<string, unknown>)['__EVOTYCOON__']).toBeUndefined();

    const withHooks = isolatedWindow('?e2e=1');
    createContainer(withHooks, 1, new MemoryStorageAdapter());
    expect(hooksOn(withHooks).getState().tick).toBe(0);
  });

  it('?paused=1 boots without advancing time', () => {
    // Phase 3's visual determinism mode builds on this: a screenshot cannot be
    // pixel-exact against a world the animation loop is still moving.
    const paused = createContainer(isolatedWindow('?paused=1'), 1, new MemoryStorageAdapter());
    expect(paused.sim.world.control.paused).toBe(true);
    expect(paused.sim.world.tick).toBe(0);

    const running = createContainer(isolatedWindow(''), 1, new MemoryStorageAdapter());
    expect(running.sim.world.control.paused).toBe(false);
  });

  it('refuses to wire a second simulation to the same page', () => {
    vi.stubEnv('DEV', false);
    const target = isolatedWindow('?e2e=1');
    createContainer(target, 1, new MemoryStorageAdapter());
    expect(() => createContainer(target, 2, new MemoryStorageAdapter())).toThrow(/already installed/);
  });

  it('drives the simulation through the real requestAnimationFrame loop', async () => {
    const container = createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter());
    container.loop.start();
    expect(container.loop.running).toBe(true);

    // Two real animation frames: enough to prove the scheduler is wired, without
    // asserting anything about how much simulation time a frame covers.
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });
    });

    container.loop.stop();
    expect(container.loop.running).toBe(false);
    expect(container.loop.stats.frames).toBeGreaterThan(0);
  });
});

describe('browserScheduler', () => {
  it('delegates to requestAnimationFrame and cancelAnimationFrame', () => {
    const request = vi.fn().mockReturnValue(7);
    const cancel = vi.fn();
    const fakeWindow = {
      requestAnimationFrame: request,
      cancelAnimationFrame: cancel,
    } as unknown as Window;

    const scheduler = browserScheduler(fakeWindow);
    const callback = (): void => undefined;
    expect(scheduler.request(callback)).toBe(7);
    expect(request).toHaveBeenCalledWith(callback);

    scheduler.cancel(7);
    expect(cancel).toHaveBeenCalledWith(7);
  });
});

describe('debugOverlayEnabled', () => {
  it('is on in a dev build', () => {
    vi.stubEnv('DEV', true);
    expect(debugOverlayEnabled()).toBe(true);
  });

  it('is off in a production build unless VITE_DEBUG_PANEL is set', () => {
    // Both operands are statically replaced by Vite, so an unset flag lets the
    // whole overlay module drop out of the production bundle.
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_DEBUG_PANEL', '');
    expect(debugOverlayEnabled()).toBe(false);

    vi.stubEnv('VITE_DEBUG_PANEL', '1');
    expect(debugOverlayEnabled()).toBe(true);
  });
});

describe('DebugOverlay', () => {
  // The overlay appends itself to the document, and jsdom keeps one document per
  // file. Without this, every test after the first would query the first
  // overlay's stale element.
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('attaches a non-interactive, aria-hidden panel', () => {
    const { sim, loop } = wire();
    const overlay = new DebugOverlay(document, sim, loop);
    overlay.render();

    const element = document.querySelector('#debug-overlay');
    expect(element).not.toBeNull();
    expect(element?.getAttribute('aria-hidden')).toBe('true');
    // It must not eat clicks meant for the game beneath it.
    expect((element as HTMLElement | null)?.style.pointerEvents).toBe('none');
  });

  it('reports tick, time, entity counts and the world hash', () => {
    const { sim, loop } = wire();
    sim.advance(40);
    sim.world.vehicles.spawn(1);
    sim.world.customers.acquire();

    const overlay = new DebugOverlay(document, sim, loop);
    overlay.render();

    const text = document.querySelector('#debug-overlay')?.textContent ?? '';
    expect(text).toContain('tick     40');
    expect(text).toContain('sim      2.0s');
    expect(text).toContain('entities v1 c1 e0 o0');
    // The hash on screen is what turns "at which tick did the runs diverge?"
    // from an afternoon into a minute.
    expect(text).toContain(`hash     ${sim.world.hash()}`);
  });

  it('shows the paused marker and the speed multiplier', () => {
    const { sim, loop } = wire();
    sim.dispatch({ t: 'SET_SPEED', mult: 4 });
    sim.dispatch({ t: 'SET_PAUSED', paused: true });
    sim.tick();

    const overlay = new DebugOverlay(document, sim, loop);
    overlay.render();

    expect(document.querySelector('#debug-overlay')?.textContent).toContain('speed    4x (paused)');
  });

  it('refreshes on an interval rather than per frame, and stops cleanly', () => {
    vi.useFakeTimers();
    try {
      const { sim, loop } = wire();
      const overlay = new DebugOverlay(document, sim, loop);
      const renderSpy = vi.spyOn(overlay, 'render');

      overlay.start(window);
      overlay.start(window); // idempotent
      expect(renderSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_000);
      // 250 ms cadence: World.hash() walks every store, so running it at 60 Hz
      // would make the debug tool the most expensive thing in the frame.
      expect(renderSpy).toHaveBeenCalledTimes(5);

      overlay.stop(window);
      overlay.stop(window); // idempotent
      vi.advanceTimersByTime(1_000);
      expect(renderSpy).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('shouldExposeTestHooks', () => {
  it('is always on in a dev build', () => {
    vi.stubEnv('DEV', true);
    expect(shouldExposeTestHooks('')).toBe(true);
  });

  it('requires ?e2e=1 in a production build', () => {
    // The suite runs against the real production bundle on a real deployment,
    // so the hook is gated at runtime rather than compiled out.
    vi.stubEnv('DEV', false);
    expect(shouldExposeTestHooks('')).toBe(false);
    expect(shouldExposeTestHooks('?e2e=0')).toBe(false);
    expect(shouldExposeTestHooks('?e2e=1')).toBe(true);
    expect(shouldExposeTestHooks('?seed=5&e2e=1')).toBe(true);
  });
});

describe('installTestHooks', () => {
  it('installs a frozen, non-enumerable API', () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves);

    const descriptor = Object.getOwnPropertyDescriptor(target, '__EVOTYCOON__');
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.writable).toBe(false);
    expect(Object.isFrozen(hooksOn(target))).toBe(true);
  });

  it('exposes state, hash, system order and loop statistics', () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves);
    const api = hooksOn(target);

    api.advanceTicks(20);
    expect(api.getState().tick).toBe(20);
    expect(api.getWorldHash()).toBe(sim.world.hash());
    expect(api.getSystemOrder()).toHaveLength(18);
    expect(api.getLoopStats()).toEqual({ frames: 0, ticks: 0, droppedTicks: 0 });
  });

  it('dispatches commands through the same door the player uses', () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves);
    const api = hooksOn(target);

    api.dispatch({ t: 'SET_SPEED', mult: 2 });
    expect(sim.world.control.speedMultiplier).toBe(1);
    api.advanceTicks(1);
    expect(sim.world.control.speedMultiplier).toBe(2);
  });

  it('buffers published events as copies, and draining empties the buffer', () => {
    // Events are pooled and reused; retaining the records would hand the test
    // whatever the next tick wrote into them.
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves);
    const api = hooksOn(target);

    api.dispatch({ t: 'SET_SPEED', mult: 4 });
    api.advanceTicks(1);
    api.dispatch({ t: 'SET_PAUSED', paused: true });
    api.advanceTicks(1);

    expect(api.drainEvents()).toEqual([
      { t: 'SPEED_CHANGED', mult: 4 },
      { t: 'PAUSE_CHANGED', paused: true },
    ]);
    expect(api.drainEvents()).toEqual([]);
  });

  it('saves and loads through the real persistence stack', async () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves);
    const api = hooksOn(target);

    api.advanceTicks(300);
    const savedHash = api.getWorldHash();

    const saved = await api.save();
    expect(saved.ok).toBe(true);
    expect(saved.backend).toBe('memory');
    expect(saved.checksum).toMatch(/^[0-9a-f]{8}$/);

    api.advanceTicks(300);
    const loaded = await api.load();

    expect(loaded.ok).toBe(true);
    expect(loaded.slot).toBe('save');
    expect(loaded.recovered).toBe(false);
    expect(loaded.tick).toBe(300);
    expect(loaded.hash).toBe(savedHash);
  });

  it('reports a load failure instead of throwing', async () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves);
    const api = hooksOn(target);

    const loaded = await api.load();
    expect(loaded.ok).toBe(false);
    expect(loaded.reason).toBe('empty');
  });

  it('reports a save failure instead of throwing', async () => {
    const sim = new Sim({ seed: 1 });
    const loop = new GameLoop(sim, inertScheduler);
    const hostile = {
      name: 'hostile',
      read: () => Promise.resolve(null),
      write: () => Promise.reject(new Error('quota exceeded')),
      remove: () => Promise.resolve(),
    };
    const saves = new SaveService(sim, new SaveManager(hostile), 'sha', () => 0);

    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves);

    const result = await hooksOn(target).save();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('quota exceeded');
  });

  it('clearSaves empties the store', async () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves);
    const api = hooksOn(target);

    api.advanceTicks(10);
    await api.save();
    await api.clearSaves();

    expect((await api.load()).ok).toBe(false);
  });
});
