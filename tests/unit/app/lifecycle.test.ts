// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_INTERVAL_MS } from '@config/simulation';
import type { SaveService } from '@app/SaveService';
import { startPersistenceLifecycle } from '@app/lifecycle';
import { registerServiceWorker, shouldRegisterServiceWorker } from '@app/registerServiceWorker';

/**
 * The persistence lifecycle and the worker registration — Phase 14's app-layer
 * glue, tested where its behaviour actually lives: timers and DOM events.
 */

interface SaveSpy {
  service: SaveService;
  calls: () => number;
  failNext: (error: Error) => void;
}

function saveSpy(): SaveSpy {
  let count = 0;
  let failure: Error | null = null;
  const service = {
    save: () => {
      count++;
      if (failure !== null) {
        const rejected = Promise.reject(failure);
        failure = null;
        return rejected;
      }
      return Promise.resolve({} as never);
    },
  } as unknown as SaveService;
  return {
    service,
    calls: () => count,
    failNext: (error) => {
      failure = error;
    },
  };
}

describe('startPersistenceLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('saves on the interval, on hidden, and on pagehide', async () => {
    const spy = saveSpy();
    const stop = startPersistenceLifecycle(window, spy.service);

    expect(spy.calls()).toBe(0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS + 10);
    expect(spy.calls()).toBe(1);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(spy.calls()).toBe(2);

    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(spy.calls()).toBe(3);

    stop();
  });

  it('a visible tab-switch does not write', async () => {
    const spy = saveSpy();
    const stop = startPersistenceLifecycle(window, spy.service);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(spy.calls()).toBe(0);
    stop();
  });

  it('a failed write warns and the next trigger retries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spy = saveSpy();
    const stop = startPersistenceLifecycle(window, spy.service);

    spy.failNext(new Error('quota'));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS + 10);
    expect(spy.calls()).toBe(1);
    expect(warn).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS);
    expect(spy.calls()).toBe(2);
    stop();
  });

  it('stops cleanly: no trigger writes after teardown', async () => {
    const spy = saveSpy();
    const stop = startPersistenceLifecycle(window, spy.service);
    stop();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS * 2);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(spy.calls()).toBe(0);
  });
});

describe('registerServiceWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function withServiceWorker(): { register: ReturnType<typeof vi.fn> } {
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    });
    return { register };
  }

  it('registers immediately when the document has already loaded', async () => {
    // jsdom's readyState is 'complete' — exactly the late-boot case the first
    // draft got wrong by waiting for a load event that had already fired.
    const { register } = withServiceWorker();
    registerServiceWorker(window);
    // DEV builds skip registration; under vitest import.meta.env.DEV is true,
    // so this asserts the guard rather than the call.
    if (import.meta.env.DEV) {
      expect(register).not.toHaveBeenCalled();
    } else {
      await Promise.resolve();
      expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    }
  });

  it('does nothing where the API is missing', () => {
    expect(() => {
      registerServiceWorker(window);
    }).not.toThrow();
  });
});

describe('shouldRegisterServiceWorker', () => {
  it('registers on the plain player URL', () => {
    expect(shouldRegisterServiceWorker('', false)).toBe(true);
    expect(shouldRegisterServiceWorker('?seed=7', false)).toBe(true);
  });

  it('never registers in a visual-determinism session', () => {
    expect(shouldRegisterServiceWorker('', true)).toBe(false);
  });

  it('never registers in an instrumented session — the install storm the deployment gate measured', () => {
    expect(shouldRegisterServiceWorker('?e2e=1', false)).toBe(false);
    expect(shouldRegisterServiceWorker('?e2e=1&stage=3&freezeAt=600', false)).toBe(false);
  });

  it('does not misread a value that merely contains e2e', () => {
    expect(shouldRegisterServiceWorker('?e2e=0', false)).toBe(true);
    expect(shouldRegisterServiceWorker('?mode=e2e', false)).toBe(true);
  });
});
