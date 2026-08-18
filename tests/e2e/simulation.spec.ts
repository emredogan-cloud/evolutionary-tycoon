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
  /*
   * Regenerated again in Phase 6. Customers, parking bays, manoeuvre progress
   * and the conversion funnel counters all entered the digest, so the world's
   * shape genuinely changed — the deliberate reason the comment above allows
   * for, for the second time.
   */
  /*
   * Regenerated a third time, in Phase 8. Orders entered the digest — the pool,
   * each record's state, station, timestamps, price and quality — so the world's
   * shape genuinely changed again. Computed by the Node suite for seed 424242
   * and asserted here to prove the browser agrees.
   */
  /*
   * And a fourth time, in Phase 9. The economy grew a lifetime spend total and
   * a twenty-four-slot income window, all of which are hashed — the window
   * because objectives will read it in Phase 11 and the dead-end gate reads it
   * already, so a divergence in it can change an outcome.
   */
  /*
   * A fifth time, in Phase 10. Employees stopped being generic actors and grew
   * a role, a brain state, a task claim, a skill and a wage; the task board
   * joined the digest beside them. All of it can change an outcome, so all of
   * it is hashed.
   */
  /*
   * A sixth time, in Phase 11. Evolution put a pending stage, a construction
   * timer and the layout revision into the digest, customers grew a table and a
   * service channel, and the statistics grew a drive-thru counter. Every one of
   * them can change an outcome — which stage you are in decides the layout, and
   * the layout decides where everybody walks — so every one of them is hashed.
   *
   * Recomputed by the Node suite for seed 424242 and asserted here, which is the
   * whole point: the browser is expected to agree, and it does.
   */
  /*
   * A seventh time, in Phase 12 — and this one is not a new field, it is a new
   * *starting value*. Reputation began at zero, which `reputationFactor` maps to
   * the worst conversion multiplier in the game (0.60); it now begins at 50, the
   * neutral point of the published 0.60..1.40 band. Reputation is hashed, so the
   * world at tick 0 is genuinely a different world.
   *
   * Recomputed by the Node suite for seed 424242 and asserted here.
   */
  hashAtTick0: 'aa11223a7612b6ff',
  /*
   * Tick 1000 moved again with Phase 12's balancing — traffic, prices and the
   * reputation curve all feed the digest by the thousandth tick. Tick 0 did not:
   * the only Phase 12 change visible at tick 0 is the starting reputation, and
   * that was already in the Phase 11 figure above.
   */
  /*
   * An eighth time, in the consolidation batch — ADR-016's baskets. A customer
   * consumes a variable number of `customer`-stream rolls at the counter now
   * (base, then side and drink draws), so every roll after the first order of
   * the run lands differently and the thousandth tick is a different world.
   * Tick 0 did not move: nothing about the world's starting state changed.
   *
   * Recomputed by the Node suite for seed 424242 and asserted here; the browser
   * produced this value independently before the pin was updated, which is the
   * agreement this test exists to prove.
   */
  hashAtTick1000: '4a7f9c6d7871981a',
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
    /*
     * Enough of `ActorSnapshot` for the Phase 7 tests to read positions. Not
     * imported from `src/sim`: this interface describes what the *page* exposes,
     * and typing it from the source would make a test that runs in a browser
     * silently depend on the build being in step with it.
     */
    actorCount: number;
    actors: readonly {
      entityId: number;
      x: number;
      y: number;
      kind: number;
      moving: boolean;
    }[];
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

test.describe('the loop closes — Phase 6', () => {
  test('a passing vehicle becomes a customer, parks, and walks to the counter', async ({ page }) => {
    /*
     * Driven through the diagnostics hook rather than by waiting on the clock,
     * and the reason is arithmetic. Stage 1 converts under 10% of about 20
     * convertible arrivals a minute, so a fifteen-second wall-clock window at
     * 4x expects roughly two conversions — and a Poisson process with a mean of
     * two produces none about one run in eleven. That is a test that fails one
     * morning a fortnight for no reason, which teaches people to re-run it.
     *
     * Advancing deterministically instead proves the thing that actually needs
     * proving in a browser: that the whole chain — roll, brake, turn, park, get
     * out, walk, queue — produces the same events under a browser engine as it
     * does in Node. The real-time half is the test below.
     */
    await bootSimulation(page);

    const events = await page.evaluate(() => {
      const api = window.__EVOTYCOON__;
      api.drainEvents();
      api.advanceTicks(6000);
      return api.drainEvents().map((event) => event.t);
    });

    expect(events).toContain('CONVERSION_SUCCEEDED');
    expect(events).toContain('CUSTOMER_SPAWNED');
    expect(events).toContain('VEHICLE_PARKED');

    const state = await page.evaluate(() => window.__EVOTYCOON__.getState());
    expect(state.customerCount).toBeGreaterThan(0);
  });

  test('the conversion pipeline runs under real requestAnimationFrame', async ({ page }) => {
    /*
     * The half the deterministic test cannot cover: that this happens on its
     * own, driven by the frame loop, rather than only when a test pushes ticks
     * through it.
     *
     * Asserted on decisions rather than on successes for the reason above — a
     * decision is made for every convertible arrival, so fifteen seconds at 4x
     * expects around twenty of them and seeing none would mean the pipeline is
     * genuinely not running.
     */
    await bootSimulation(page);

    await page.evaluate(() => {
      window.__EVOTYCOON__.drainEvents();
      window.__EVOTYCOON__.dispatch({ t: 'SET_SPEED', mult: 4 });
    });

    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              window.__EVOTYCOON__
                .drainEvents()
                .filter((event) => event.t === 'CONVERSION_SUCCEEDED' || event.t === 'CONVERSION_FAILED')
                .length,
          ),
        { timeout: 15_000, message: 'no vehicle reached the decision point in fifteen seconds' },
      )
      .toBeGreaterThan(0);
  });
});

test.describe('people walk — Phase 7', () => {
  test('a customer crosses the car park on foot', async ({ page }) => {
    /*
     * The Phase 7 deployment note is one line: "walking people in the preview".
     * This is that, in a real browser — and it is worth checking here rather
     * than only in Node, because the flow field is built at startup from the
     * layout and a bundling mistake that dropped it would leave everyone
     * walking in straight lines, which looks almost right.
     */
    await bootSimulation(page);

    const walk = await page.evaluate(() => {
      const api = window.__EVOTYCOON__;
      api.advanceTicks(6000);

      /** Track every visible customer's position over a few hundred ticks. */
      const first = new Map<number, { x: number; y: number }>();
      const last = new Map<number, { x: number; y: number }>();
      let sawMoving = false;

      for (let tick = 0; tick < 400; tick++) {
        api.advanceTicks(1);
        const state = api.getState();
        for (let i = 0; i < state.actorCount; i++) {
          const actor = state.actors[i];
          // Customers are actor kind 0 — see src/config/actors.ts.
          if (actor?.kind !== 0) continue;
          if (!first.has(actor.entityId)) first.set(actor.entityId, { x: actor.x, y: actor.y });
          last.set(actor.entityId, { x: actor.x, y: actor.y });
          if (actor.moving) sawMoving = true;
        }
      }

      let walked = 0;
      for (const [id, start] of first) {
        const end = last.get(id);
        if (end === undefined) continue;
        if (Math.hypot(end.x - start.x, end.y - start.y) > 0.5) walked++;
      }
      return { seen: first.size, walked, sawMoving };
    });

    expect(walk.seen, 'no customer was ever on foot').toBeGreaterThan(0);
    expect(walk.walked, 'every customer stood still').toBeGreaterThan(0);
    expect(walk.sawMoving, 'nobody was ever reported as moving').toBe(true);
  });

  test('nobody walks onto the road', async ({ page }) => {
    /*
     * The grid refuses it and the flow field routes around it, but this is the
     * assertion a player would make by looking — and it is the one that would
     * catch a steering change that let separation push somebody through a wall.
     */
    await bootSimulation(page);

    const trespass = await page.evaluate(() => {
      const api = window.__EVOTYCOON__;
      api.advanceTicks(6000);

      let worst = 99;
      for (let tick = 0; tick < 600; tick++) {
        api.advanceTicks(1);
        const state = api.getState();
        for (let i = 0; i < state.actorCount; i++) {
          const actor = state.actors[i];
          if (actor?.kind !== 0) continue;
          worst = Math.min(worst, actor.y);
        }
      }
      return worst;
    });

    /*
     * The carriageway runs to y = 8.5 and the queue is authored to spill down to
     * y = 6.7 on purpose, so the bound is the last authored queue slot rather
     * than the kerb. Anything below that is somebody in the traffic.
     */
    expect(trespass, `a customer reached y = ${String(trespass)}`).toBeGreaterThan(6.4);
  });
});
