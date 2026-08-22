// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HudModel } from '@app/bridge/hudModel';
import { createContainer } from '@app/container';
import { FrameMeter } from '@app/FrameMeter';
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
  let frameClock = 0;
  return {
    requestAnimationFrame: (callback: FrameRequestCallback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle: number) => {
      window.cancelAnimationFrame(handle);
    },
    location: { search },
    /*
     * A clock that advances a whole second per read, so the UI bridge's 10 Hz
     * throttle never suppresses a sample a test is waiting for. Testing the
     * throttle itself is `uiBridge.test.ts`'s job; here it would only be a way
     * for these tests to fail for an unrelated reason.
     */
    performance: {
      now: () => {
        frameClock += 1000;
        return frameClock;
      },
    },
  } as unknown as Window;
}

describe('the UI bridge, as the container wires it', () => {
  it('publishes to the overlay on every rendered frame', () => {
    /*
     * Sampling hangs off `renderContext.onFrame` rather than off the simulation
     * loop, and the difference is not cosmetic: a frozen scene stops the loop
     * and keeps drawing. Wired to the loop, the overlay on every visual golden
     * would be stuck on whatever it published before the camera existed.
     */
    const container = createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter());

    let published = 0;
    container.ui.subscribe(() => {
      published++;
    });
    const atSubscribe = published;

    container.renderContext.onFrame?.();
    container.renderContext.onFrame?.();
    expect(published - atSubscribe).toBe(2);
  });

  it('starts with nothing projected and republishes when the camera arrives', () => {
    /*
     * The camera does not exist until Phaser has booted a scene, which is after
     * the container is built. Until then every marker is off screen — and the
     * republish is what stops the overlay waiting a frame to notice otherwise.
     */
    const container = createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter());

    let published = 0;
    container.ui.subscribe(() => {
      published++;
    });
    const before = published;

    container.setProjector((_x, _y, _z, out) => {
      out.x = 1;
      out.y = 2;
      return true;
    });
    expect(published - before).toBe(1);
  });
});

describe('cooking through a frozen fast-forward', () => {
  it('earns nothing without ?cook=1, because the player is the cook', () => {
    /*
     * The control. In Stage 1 an order sits in `PLACED` until a `MANUAL_PREP`
     * command starts it, so a fast-forward that issues no commands arrives at
     * the target tick with a queue and a cold kitchen. A golden of a busy stand
     * taken this way would be photographing a stand that is not serving.
     */
    const container = createContainer(
      isolatedWindow('?freezeAt=6000&noParticles=1'),
      424242,
      new MemoryStorageAdapter(),
    );

    expect(container.sim.world.tick).toBe(6000);
    expect(container.sim.world.stats.customersServed).toBe(0);
    expect(container.sim.world.economy.cash).toBe(0);
  });

  it('cooks the whole way there with ?cook=1', () => {
    const container = createContainer(
      isolatedWindow('?freezeAt=6000&noParticles=1&cook=1'),
      424242,
      new MemoryStorageAdapter(),
    );

    expect(container.sim.world.tick).toBe(6000);
    expect(container.sim.world.stats.customersServed).toBeGreaterThan(0);
    expect(container.sim.world.economy.cash).toBeGreaterThan(0);
  });
});

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
  /*
   * The consolidation pass (§28) narrowed the gate to a single door in every
   * build: `?debug=1`. Dev builds stopped being an exception — the overlay
   * was drowning the product view — and VITE_DEBUG_PANEL retired with it.
   */
  it('is on only when the URL asks', () => {
    expect(debugOverlayEnabled('?debug=1')).toBe(true);
    expect(debugOverlayEnabled('?e2e=1&debug=1')).toBe(true);
  });

  it('is off otherwise, dev build or not', () => {
    expect(debugOverlayEnabled('')).toBe(false);
    expect(debugOverlayEnabled('?e2e=1')).toBe(false);
    expect(debugOverlayEnabled('?debug=0')).toBe(false);
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
    expect(text).toContain('sim      242.0s'); // 08:00 opening (240 s) + the 2 s advanced here
    // Vehicle count comes from the live traffic system rather than the one the
    // test spawned, so it is matched by shape instead of by value.
    expect(text).toMatch(/entities v\d+ c1 e0 o0/);
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
  it('reports the conversion funnel, which is what Phase 6 is for', () => {
    /*
     * The same data the Phase 18 player-facing panel will be built from, shown
     * raw. If these numbers are not enough to explain why conversion dropped,
     * the panel will not be either — and finding that out now costs nothing.
     */
    const { sim, loop } = wire();
    sim.advance(60 * 20 * 10);
    const overlay = new DebugOverlay(document, sim, loop);
    overlay.render();

    const text = document.querySelector('#debug-overlay')?.textContent ?? '';
    expect(text).toMatch(/convert\s+\d+\/\d+ \(\d+\.\d%\)/);
    expect(text).toMatch(/parking\s+\d+\/\d+/);
    expect(text).toMatch(/queue \d+\/\d+/);
    expect(text).toMatch(/spill \d+/);
    expect(text).toMatch(/left\s+\d+ bored, \d+ no space/);
  }, 60_000);

  it('reports the rate against convertible traffic, not against every car', () => {
    /*
     * Four out of five vehicles on the road are decorative and were never
     * offered the restaurant. Dividing by all of them would report roughly a
     * fifth of the real conversion rate, and the number the economy is
     * calibrated against would look broken.
     */
    const { sim, loop } = wire();
    sim.advance(60 * 20 * 10);
    const overlay = new DebugOverlay(document, sim, loop);
    overlay.render();

    const text = document.querySelector('#debug-overlay')?.textContent ?? '';
    const match = /convert\s+(\d+)\/(\d+)/.exec(text);
    expect(match).not.toBeNull();
    const offered = Number(match?.[2] ?? 0);
    expect(offered).toBe(sim.world.stats.conversionsSucceeded + sim.world.stats.conversionsFailed);
    expect(offered).toBeLessThan(sim.world.stats.vehiclesSpawned);
  }, 60_000);

  it('names the biggest reason first, and does not list reasons nobody hit', () => {
    const { sim, loop } = wire();
    sim.advance(60 * 20 * 10);
    const overlay = new DebugOverlay(document, sim, loop);
    overlay.render();

    const text = document.querySelector('#debug-overlay')?.textContent ?? '';
    const listed = [...text.matchAll(/^ {2}([A-Z_]+)\s+(\d+)$/gm)].map((m) => ({
      name: m[1] ?? '',
      count: Number(m[2] ?? 0),
    }));

    expect(listed.length).toBeGreaterThan(0);
    for (const entry of listed) expect(entry.count).toBeGreaterThan(0);
    for (let i = 1; i < listed.length; i++) {
      expect(listed[i]?.count ?? 0).toBeLessThanOrEqual(listed[i - 1]?.count ?? 0);
    }
    // A fixed-order list of nine would be nine lines of mostly zero.
    expect(listed.length).toBeLessThanOrEqual(4);
  }, 60_000);
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
    installTestHooks(target, sim, loop, saves, new FrameMeter(), new MemoryStorageAdapter());

    const descriptor = Object.getOwnPropertyDescriptor(target, '__EVOTYCOON__');
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.writable).toBe(false);
    expect(Object.isFrozen(hooksOn(target))).toBe(true);
  });

  it('exposes state, hash, system order and loop statistics', () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves, new FrameMeter(), new MemoryStorageAdapter());
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
    installTestHooks(target, sim, loop, saves, new FrameMeter(), new MemoryStorageAdapter());
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
    installTestHooks(target, sim, loop, saves, new FrameMeter(), new MemoryStorageAdapter());
    const api = hooksOn(target);

    api.dispatch({ t: 'SET_SPEED', mult: 4 });
    api.advanceTicks(1);
    api.dispatch({ t: 'SET_PAUSED', paused: true });
    api.advanceTicks(1);

    expect(api.drainEvents()).toEqual([
      // Commands land at the start of the tick, before the systems run — so
      // the dispatched speed change precedes the calendar's first-tick
      // weather announcement (Phase 15), which precedes the next dispatch.
      { t: 'SPEED_CHANGED', mult: 4 },
      { t: 'WEATHER_CHANGED', state: expect.any(Number) as number },
      { t: 'PAUSE_CHANGED', paused: true },
    ]);
    expect(api.drainEvents()).toEqual([]);
  });

  it('saves and loads through the real persistence stack', async () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves, new FrameMeter(), new MemoryStorageAdapter());
    const api = hooksOn(target);

    /*
     * Advanced until there is traffic on the road, not for a fixed 300 ticks.
     * The premise of the last assertion is that a live world carries transient
     * state the save drops — and a fixed tick count only satisfies it when a car
     * happens to be passing. Phase 12 changed the arrival rate and tick 300 with
     * this seed became an empty road, so the test compared two identical worlds
     * and asserted they differed.
     */
    api.advanceTicks(300);
    for (let attempt = 0; attempt < 40 && sim.world.vehicles.activeCount === 0; attempt++) {
      api.advanceTicks(20);
    }
    expect(sim.world.vehicles.activeCount, 'no traffic to lose in the save').toBeGreaterThan(0);
    const savedTick = sim.world.tick;
    const savedHash = api.getWorldHash();

    const saved = await api.save();
    expect(saved.ok).toBe(true);
    expect(saved.backend).toBe('memory');
    expect(saved.checksum).toMatch(/^[0-9a-f]{8}$/);

    // Restored-to-restored rather than live-to-restored. A live world carries
    // vehicles that the save deliberately does not, so the first load defines
    // the reference and the second has to reproduce it exactly.
    const reference = await api.load();
    api.advanceTicks(300);
    const loaded = await api.load();

    expect(loaded.ok).toBe(true);
    expect(loaded.slot).toBe('save');
    expect(loaded.recovered).toBe(false);
    expect(loaded.tick).toBe(savedTick);
    expect(loaded.hash).toBe(reference.hash);
    expect(loaded.hash).not.toBe(savedHash);
  });

  it('reports a load failure instead of throwing', async () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves, new FrameMeter(), new MemoryStorageAdapter());
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
    installTestHooks(target, sim, loop, saves, new FrameMeter(), new MemoryStorageAdapter());

    const result = await hooksOn(target).save();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('quota exceeded');
  });

  it('clearSaves empties the store', async () => {
    const { sim, loop, saves } = wire();
    const target = {} as unknown as Window;
    installTestHooks(target, sim, loop, saves, new FrameMeter(), new MemoryStorageAdapter());
    const api = hooksOn(target);

    api.advanceTicks(10);
    await api.save();
    await api.clearSaves();

    expect((await api.load()).ok).toBe(false);
  });
});

/**
 * The intent surface, exercised through the container that builds it — Phase 11.
 *
 * Every entry of `UiCommands` is a closure created in `createContainer`, and
 * none of them had ever been called by a test: the overlay calls them in a
 * browser and the simulation is tested directly, so the *translation* between
 * the two — the one thing this layer is for — sat in the gap between the two
 * suites. Build mode added four more closures to that gap, which is what made
 * it worth closing.
 */
describe('what the overlay is allowed to ask for', () => {
  it('turns every intent into a command the simulation applies', () => {
    const container = createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter());
    const applied = container.sim.world.stats.commandsApplied;

    container.commands.buyUpgrade('hand-painted-sign');
    container.commands.setPrice('lemonade', 3);
    container.commands.hire('cook', 0.5);
    container.commands.evolve();
    container.commands.place('ph-prop-short', 8, 16);
    container.commands.removePlaced(0);

    // Queued, not applied: commands land at the start of a tick, never on
    // dispatch, so that wall-clock arrival time cannot change an outcome.
    expect(container.sim.world.stats.commandsApplied).toBe(applied);
    container.sim.advance(2);
    expect(container.sim.world.stats.commandsApplied).toBe(applied + 6);
  });

  it('fires an employee the overlay names by entity id', () => {
    const container = createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter());
    container.sim.world.economy.cash = 500;
    container.commands.hire('cook', 0.5);
    container.sim.advance(2);
    expect(container.sim.world.employees.activeCount).toBe(1);

    const hired = container.sim.world.employees.at(0).entityId;
    container.commands.fire(hired);
    container.sim.advance(2);
    expect(container.sim.world.employees.activeCount).toBe(0);
  });

  it('answers no placement preview until there is a camera', () => {
    // The unprojector is installed by `main.ts` once Phaser has booted. Before
    // that a screen point does not correspond to anywhere, and the honest answer
    // is null rather than the origin.
    const container = createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter());
    expect(container.commands.previewPlacement('ph-prop-short', 640, 360)).toBeNull();
  });

  it('previews through the camera the moment one is installed', () => {
    /*
     * The whole point of the indirection: the container is built before the
     * camera exists, so both the projector and its inverse are swapped in later
     * and every preview from then on goes through them.
     */
    const container = createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter());
    // A stand-in that reads screen pixels as tenths of a metre, which is enough
    // to prove the wiring without restating the isometric transform.
    container.setUnprojector((x, y) => ({ x: x / 10, y: y / 10 }));
    container.setProjector((x, y, _z, out) => {
      out.x = x * 10;
      out.y = y * 10;
      return true;
    });

    const preview = container.commands.previewPlacement('ph-prop-short', 83, 162);
    expect(preview).not.toBeNull();
    // Snapped to the half-metre navigation grid on the way through: 8.3 m
    // becomes 8.5 and 16.2 becomes 16.0, which is the whole reason the ghost
    // reports a cell rather than echoing the cursor back.
    expect(preview?.worldX).toBe(8.5);
    expect(preview?.worldY).toBe(16);
    expect(preview?.outcome).toBe('ok');
    // And projected back, so the ghost is drawn on the cell it would occupy.
    expect(preview?.screenX).toBe(85);
    expect(preview?.screenY).toBe(160);
  });

  it('reports the reason a placement would fail', () => {
    const container = createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter());
    container.setUnprojector((x, y) => ({ x: x / 10, y: y / 10 }));

    expect(container.commands.previewPlacement('ph-prop-short', -500, 160)?.outcome).toBe('outside-lot');

    container.commands.place('ph-prop-short', 8, 16);
    container.sim.advance(2);
    expect(container.commands.previewPlacement('ph-prop-short', 80, 160)?.outcome).toBe('occupied');
  });

  it('starts at the stage the query string asks for', () => {
    // Visual regression only — `?stage=` is documented alongside `freezeAt` in
    // renderMode. Clamped, so a golden URL asking for stage 9 photographs the
    // last stage there is rather than crashing.
    expect(
      createContainer(isolatedWindow('?stage=3'), 7, new MemoryStorageAdapter()).sim.world.progression.stage,
    ).toBe(3);
    expect(
      createContainer(isolatedWindow('?stage=9'), 7, new MemoryStorageAdapter()).sim.world.progression.stage,
    ).toBe(4);
    expect(
      createContainer(isolatedWindow(''), 7, new MemoryStorageAdapter()).sim.world.progression.stage,
    ).toBe(1);
  });
});

describe('the calendar pins — Phase 15 fixture instruments', () => {
  it('forceHour starts the clock at the named hour', () => {
    const container = createContainer(isolatedWindow('?forceHour=22'), 7, new MemoryStorageAdapter());
    expect(container.sim.world.clock.gameHour).toBeCloseTo(22, 5);
  });

  it('forceWeather writes the whole of day 0 as that state, planned', () => {
    const container = createContainer(isolatedWindow('?forceWeather=snow'), 7, new MemoryStorageAdapter());
    expect(container.sim.world.environment.plannedDay).toBe(0);
    expect([...container.sim.world.environment.weatherSegments]).toEqual([3, 3, 3, 3]);
    // An unknown state changes nothing but still pins the plan.
    const bogus = createContainer(isolatedWindow('?forceWeather=hailstorm'), 7, new MemoryStorageAdapter());
    expect([...bogus.sim.world.environment.weatherSegments]).toEqual([0, 0, 0, 0]);
  });

  it('forceEvent schedules that event across the day', () => {
    const container = createContainer(
      isolatedWindow('?forceEvent=festival&stage=4'),
      7,
      new MemoryStorageAdapter(),
    );
    const env = container.sim.world.environment;
    expect(env.eventTypes[2]).toBe(2);
    expect(env.eventEndMs[2]).toBe(container.sim.world.clock.msPerGameDay);
  });
});

describe('the HUD strip fields — Phase 15', () => {
  it('samples weather and the active event into the model', () => {
    const container = createContainer(
      isolatedWindow('?forceWeather=rain&forceEvent=festival&stage=4'),
      7,
      new MemoryStorageAdapter(),
    );
    let model: HudModel | null = null;
    const unsubscribe = container.ui.subscribe((m) => {
      model = m;
    });
    container.sim.advance(2);
    container.ui.refresh();
    unsubscribe();

    expect(model).not.toBeNull();
    const hud = model as unknown as HudModel;
    expect(hud.weatherId).toBe('RAIN');
    expect(hud.weatherLabel).toBe('Yağmur');
    expect(hud.eventId).toBe('FESTIVAL');
    expect(hud.eventLabel).toBe('Festival');
    expect(hud.eventRemainingMs).toBeGreaterThan(0);
  });

  it('reads an ordinary road as no event and clear skies', () => {
    const container = createContainer(isolatedWindow('?forceWeather=clear'), 7, new MemoryStorageAdapter());
    let model: HudModel | null = null;
    const unsubscribe = container.ui.subscribe((m) => {
      model = m;
    });
    container.sim.advance(2);
    container.ui.refresh();
    unsubscribe();
    const hud = model as unknown as HudModel;
    expect(hud.weatherId).toBe('CLEAR');
    expect(hud.eventId).toBe('');
    expect(hud.eventRemainingMs).toBe(0);
  });
});

describe('debugOverlayEnabled, default argument', () => {
  it('reads the window search string when none is passed', () => {
    // jsdom's location carries no query, so the default read is the off path.
    expect(debugOverlayEnabled()).toBe(false);
  });
});
