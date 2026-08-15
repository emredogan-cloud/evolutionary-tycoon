import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * The simulation kernel, in a real browser.
 *
 * Everything here is also unit-tested in Node, so why run it again? Because the
 * unit suite proves the kernel is deterministic *in one engine*. This suite
 * proves three things Node cannot:
 *
 * 1. the same seed produces the same world hash in a browser engine as in Node —
 *    if it did not, every golden screenshot and every recorded fixture would be
 *    valid only on the machine that made it;
 * 2. the fixed-timestep loop actually runs against real `requestAnimationFrame`;
 * 3. the save path works against a real IndexedDB, which no test double can
 *    honestly stand in for.
 */

/**
 * Reference digests computed by the Node suite.
 *
 * Regenerate deliberately, never to make this pass: a change here means the
 * world's shape or the digest changed, and that is a save-format decision.
 */
const REFERENCE = {
  seed: 424242,
  // Regenerated in Phase 5. Traffic put vehicles, a lane, an archetype and two
  // Poisson cursors into the digest, so the world's shape genuinely changed —
  // which is exactly the deliberate reason the comment above allows for.
  hashAtTick0: '2ab762a504e055c4',
  hashAtTick1000: 'aaa448e753e77ed6',
} as const;

interface TestApi {
  getState(): {
    tick: number;
    simTimeMs: number;
    gameDay: number;
    gameHour: number;
    speedMultiplier: number;
    paused: boolean;
    vehicleCount: number;
    customerCount: number;
    employeeCount: number;
    orderCount: number;
  };
  getWorldHash(): string;
  dispatch(command: { t: 'SET_SPEED'; mult: 1 | 2 | 4 } | { t: 'SET_PAUSED'; paused: boolean }): void;
  advanceTicks(count: number): void;
  drainEvents(): { t: string }[];
  getLoopStats(): { frames: number; ticks: number; droppedTicks: number };
  getSystemOrder(): string[];
  save(): Promise<{ ok: boolean; backend: string; checksum: string | null; error: string | null }>;
  load(): Promise<{ ok: boolean; reason: string | null; slot: string | null; tick: number; hash: string }>;
  clearSaves(): Promise<void>;
}

declare global {
  interface Window {
    __EVOTYCOON__: TestApi;
  }
}

const E2E_URL = `/?e2e=1&seed=${REFERENCE.seed}`;

async function bootSimulation(page: Page, url = E2E_URL): Promise<void> {
  await page.goto(url);
  // Waiting on a state attribute rather than a timeout is what keeps this suite
  // out of docs/FLAKY.md.
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
}

test.describe('simulation kernel in the browser', () => {
  test('boots the kernel and exposes the diagnostics hook under ?e2e=1', async ({ page }) => {
    await bootSimulation(page);

    const order = await page.evaluate(() => window.__EVOTYCOON__.getSystemOrder());
    expect(order).toHaveLength(18);
    expect(order[0]).toBe('TimeSystem');
    expect(order[17]).toBe('EventFlushSystem');
  });

  test('produces the same world hash as the Node suite for the same seed', async ({ page }) => {
    // The cross-engine determinism proof. Without it, "deterministic" would mean
    // "deterministic on the machine that recorded the fixture", and every golden
    // screenshot and recorded command log would be machine-specific.
    //
    // ?paused=1 boots without advancing time, so tick 0 is observable — the
    // animation-frame loop would otherwise have moved the world before any
    // script could read it.
    await bootSimulation(page, `${E2E_URL}&paused=1`);

    const observed = await page.evaluate(() => {
      const api = window.__EVOTYCOON__;
      const atZero = { tick: api.getState().tick, hash: api.getWorldHash() };
      api.advanceTicks(1000);
      return { atZero, atThousand: { tick: api.getState().tick, hash: api.getWorldHash() } };
    });

    expect(observed.atZero.tick).toBe(0);
    expect(observed.atZero.hash).toBe(REFERENCE.hashAtTick0);
    expect(observed.atThousand.tick).toBe(1000);
    expect(observed.atThousand.hash).toBe(REFERENCE.hashAtTick1000);
  });

  test('a paused boot does not advance the world on its own', async ({ page }) => {
    await bootSimulation(page, `${E2E_URL}&paused=1`);

    const first = await page.evaluate(() => window.__EVOTYCOON__.getState().tick);
    await page.waitForTimeout(500);
    const second = await page.evaluate(() => ({
      tick: window.__EVOTYCOON__.getState().tick,
      frames: window.__EVOTYCOON__.getLoopStats().frames,
    }));

    expect(first).toBe(0);
    expect(second.tick).toBe(0);
    // Frames still ran — the loop is alive, it just has no time to spend.
    expect(second.frames).toBeGreaterThan(0);
  });

  test('the fixed-timestep loop advances against real requestAnimationFrame', async ({ page }) => {
    await bootSimulation(page);

    const before = await page.evaluate(() => window.__EVOTYCOON__.getState().tick);
    // 20 Hz simulation: ~600 ms of wall clock is ~12 ticks. Asserting "more than
    // before" rather than an exact count keeps this independent of scheduling.
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({
      tick: window.__EVOTYCOON__.getState().tick,
      stats: window.__EVOTYCOON__.getLoopStats(),
    }));

    expect(after.tick).toBeGreaterThan(before);
    expect(after.stats.frames).toBeGreaterThan(0);
    expect(after.stats.ticks).toBeGreaterThan(0);
    // A machine that cannot keep up would drop ticks; a CI runner should not.
    expect(after.stats.droppedTicks).toBe(0);
  });

  test('simulation time tracks ticks exactly', async ({ page }) => {
    await bootSimulation(page, `${E2E_URL}&paused=1`);

    const state = await page.evaluate(() => {
      const api = window.__EVOTYCOON__;
      api.advanceTicks(400);
      return api.getState();
    });

    expect(state.tick).toBe(400);
    expect(state.simTimeMs).toBe(400 * 50);
    expect(state.paused).toBe(true);
  });

  test('commands take effect and are announced as events', async ({ page }) => {
    await bootSimulation(page, `${E2E_URL}&paused=1`);

    const events = await page.evaluate(() => {
      const api = window.__EVOTYCOON__;
      api.drainEvents();
      api.dispatch({ t: 'SET_SPEED', mult: 4 });
      api.advanceTicks(1);
      // Unpausing, because the page booted paused: re-sending the current value
      // is a no-op and deliberately announces nothing.
      api.dispatch({ t: 'SET_PAUSED', paused: false });
      api.advanceTicks(1);
      return { published: api.drainEvents(), speed: api.getState().speedMultiplier };
    });

    expect(events.speed).toBe(4);
    expect(events.published.map((event) => event.t)).toEqual(
      expect.arrayContaining(['SPEED_CHANGED', 'PAUSE_CHANGED']),
    );
  });

  test('saves and reloads through a real IndexedDB', async ({ page }) => {
    // The one path with no honest test double. A hand-written IndexedDB stub
    // would prove the stub works, so the real database is exercised here and
    // src/persistence/idbAdapter.ts is excluded from unit coverage on that basis.
    await bootSimulation(page, `${E2E_URL}&paused=1`);

    const result = await page.evaluate(async () => {
      const api = window.__EVOTYCOON__;
      await api.clearSaves();

      api.advanceTicks(300);
      const savedTick = api.getState().tick;

      const saved = await api.save();
      /*
       * The reference is the *restored* world, not the live one. Vehicles are
       * transient by design (snapshot.ts) — a save carries the arrival process,
       * not the cars currently on the road — so a live-to-restored hash
       * comparison would be asserting that traffic survives a reload, which is
       * the opposite of the intent.
       */
      const reference = await api.load();
      api.advanceTicks(500);
      const loaded = await api.load();

      await api.clearSaves();
      return { saved, loaded, savedHash: reference.hash, savedTick };
    });

    expect(result.saved.error).toBeNull();
    expect(result.saved.ok).toBe(true);
    expect(result.saved.backend).toBe('indexedDB');
    expect(result.saved.checksum).toMatch(/^[0-9a-f]{8}$/);

    expect(result.loaded.ok).toBe(true);
    expect(result.loaded.slot).toBe('save');
    expect(result.loaded.tick).toBe(result.savedTick);
    expect(result.loaded.hash).toBe(result.savedHash);
  });

  test('reports a missing save cleanly rather than throwing', async ({ page }) => {
    await bootSimulation(page);

    const loaded = await page.evaluate(async () => {
      const api = window.__EVOTYCOON__;
      await api.clearSaves();
      return api.load();
    });

    expect(loaded.ok).toBe(false);
    expect(loaded.reason).toBe('empty');
  });

  test('the diagnostics hook is absent without ?e2e=1', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');

    const exposed = await page.evaluate(() => '__EVOTYCOON__' in window);
    // Dev builds expose it unconditionally; the deployed bundle must not.
    const isDev = await page.evaluate(
      () => (window as unknown as { __EVOTYCOON_BUILD__: { isDev: boolean } }).__EVOTYCOON_BUILD__.isDev,
    );
    expect(exposed).toBe(isDev);
  });
});
