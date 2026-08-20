import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Offline progression against a real browser and real storage — Phase 14.
 *
 * The clock-abuse *logic* is exhaustively unit-tested; what only a browser can
 * prove is the seam: a save written by one page load is found, priced, shown,
 * claimed and consumed by the next, through IndexedDB, reloads and the real
 * boot path. The saves are manipulated through the `tamperSave` hook — the
 * same JSON a player could edit by hand, checksummed the same way.
 *
 * Runs against `vite preview` (no /api/time — the unsynced path) and against
 * the deployed preview (real /api/time — the synced path); the assertions hold
 * on both, which is itself part of the design.
 */

interface OfflineTestApi {
  getState(): { tick: number };
  dispatch(command: { t: 'MANUAL_PREP'; orderSlot: number } | { t: 'SET_PAUSED'; paused: boolean }): void;
  advanceTicks(count: number): void;
  save(): Promise<{ ok: boolean; error: string | null }>;
  clearSaves(): Promise<void>;
  tamperSave(patch: Record<string, unknown>, options?: { corrupt?: boolean }): Promise<boolean>;
}

/**
 * Reached by cast rather than by augmenting `Window`: simulation.spec.ts
 * already declares the global with its own narrower shape, and two conflicting
 * augmentations melt every use site into `error` types.
 */
type HookWindow = Window & { __EVOTYCOON__: OfflineTestApi };

const HOUR = 3_600_000;
/** No ?seed= — a seeded session deliberately neither loads nor autosaves. */
const PERSISTENT_URL = '/?e2e=1';

async function boot(page: Page): Promise<void> {
  await page.goto(PERSISTENT_URL);
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
}

/** Five simulated minutes of attentive play, so the meter holds a real rate. */
async function hudCash(page: Page): Promise<number> {
  const raw = await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash');
  return Number(raw);
}

async function playMeasurably(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as unknown as HookWindow).__EVOTYCOON__;
    for (let i = 0; i < 6000; i++) {
      api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
      api.advanceTicks(1);
    }
  });
}

/** Leave the stand `hoursAgo` in the past, as far as the stored save knows. */
async function leaveInThePast(page: Page, hoursAgo: number): Promise<void> {
  const saved = await page.evaluate(() => (window as unknown as HookWindow).__EVOTYCOON__.save());
  expect(saved.ok, saved.error ?? '').toBe(true);
  const tampered = await page.evaluate(
    ([ms]) =>
      (window as unknown as HookWindow).__EVOTYCOON__.tamperSave({
        lastSeenAt: Date.now() - (ms ?? 0),
        // The synced-at-save reference is dropped too, as a pre-sync save
        // would have it: the decision then rests on lastSeenAt against
        // whichever server answer this environment gives.
        lastSeenServerAt: null,
        offline: { pending: null },
      }),
    [hoursAgo * HOUR],
  );
  expect(tampered).toBe(true);
}

test.describe('offline progression', () => {
  test('an absence is priced, shown, explained and claimable exactly once', async ({ page }) => {
    await boot(page);
    await playMeasurably(page);
    await leaveInThePast(page, 2);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');

    const report = page.getByTestId('offline-report');
    await expect(report).toBeVisible();
    // The headline window is the real absence.
    const awayMs = Number(await report.getAttribute('data-away-ms'));
    expect(awayMs).toBeGreaterThanOrEqual(2 * HOUR - 60_000);
    expect(awayMs).toBeLessThanOrEqual(2 * HOUR + 60_000);

    // The report explains, not just announces: a limiter is always named.
    await expect(page.getByTestId('offline-limiter')).toBeVisible();
    const limiter = await page.getByTestId('offline-limiter').getAttribute('data-limiter');
    expect(['parking', 'kitchen', 'tables', 'staff', 'queue', 'demand']).toContain(limiter);

    const net = Number(await page.getByTestId('offline-net').getAttribute('data-net'));
    /*
     * Paused before measuring, or the live stand keeps earning between the two
     * readings and the arithmetic asserts on a moving target. The one manual
     * tick inside the claim is the only world movement left, so the tolerance
     * is a single tick's worth of possible payment.
     */
    await page.evaluate(() => {
      (window as unknown as HookWindow).__EVOTYCOON__.dispatch({ t: 'SET_PAUSED', paused: true });
      (window as unknown as HookWindow).__EVOTYCOON__.advanceTicks(1);
    });
    const cashBefore = await hudCash(page);

    await page.getByTestId('offline-collect').click();
    await expect(report).toBeHidden();

    // The claim landed in the simulation through a logged command.
    await expect
      .poll(async () => Math.abs((await hudCash(page)) - Math.max(0, cashBefore + net)))
      .toBeLessThan(20);

    // The same window can never pay twice.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
    await expect(page.getByTestId('offline-report')).toHaveCount(0);
  });

  test('an unclaimed report survives a reload without re-pricing', async ({ page }) => {
    await boot(page);
    await playMeasurably(page);
    await leaveInThePast(page, 2);

    await page.reload();
    await expect(page.getByTestId('offline-report')).toBeVisible();
    const firstNet = await page.getByTestId('offline-net').getAttribute('data-net');

    // Reload WITHOUT collecting: same report, same amount — re-shown, not
    // re-priced, even though wall time has moved on.
    await page.reload();
    await expect(page.getByTestId('offline-report')).toBeVisible();
    const secondNet = await page.getByTestId('offline-net').getAttribute('data-net');
    expect(secondNet).toBe(firstNet);
  });

  test('a clock moved backwards pays zero, without punishing the player', async ({ page }) => {
    await boot(page);
    await playMeasurably(page);
    const { tick } = await page.evaluate(() => (window as unknown as HookWindow).__EVOTYCOON__.getState());

    // lastSeen three hours in the future = the clock has been rolled back.
    await leaveInThePast(page, -3);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
    // No report, no reward — and no penalty: the session resumed intact.
    await expect(page.getByTestId('offline-report')).toHaveCount(0);
    const resumed = await page.evaluate(() => (window as unknown as HookWindow).__EVOTYCOON__.getState());
    expect(resumed.tick).toBeGreaterThanOrEqual(tick);
  });

  test('a thirty-hour absence is clamped to the cap', async ({ page }) => {
    await boot(page);
    await playMeasurably(page);
    await leaveInThePast(page, 30);

    await page.reload();
    const report = page.getByTestId('offline-report');
    await expect(report).toBeVisible();

    const awayMs = Number(await report.getAttribute('data-away-ms'));
    const creditedMs = Number(await report.getAttribute('data-credited-ms'));
    expect(awayMs).toBeGreaterThan(29 * HOUR);
    // Eight hours verified, four unverified — either way, never the thirty.
    expect(creditedMs).toBeLessThanOrEqual(8 * HOUR);
    expect(creditedMs).toBeGreaterThanOrEqual(4 * HOUR);
    // And the screen says which cap it applied.
    await expect(page.getByTestId('offline-cap-note')).toBeVisible();
  });

  test('a corrupt save falls back to a fresh boot instead of crashing', async ({ page }) => {
    await boot(page);
    await playMeasurably(page);
    const saved = await page.evaluate(() => (window as unknown as HookWindow).__EVOTYCOON__.save());
    expect(saved.ok).toBe(true);

    // Cash edited without re-signing: the checksum now lies.
    const tampered = await page.evaluate(() =>
      (window as unknown as HookWindow).__EVOTYCOON__.tamperSave(
        { economy: { cash: 999_999 } },
        { corrupt: true },
      ),
    );
    expect(tampered).toBe(true);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
    // Fresh world: the corrupt slot was refused, nothing exploded, no report.
    await expect(page.getByTestId('offline-report')).toHaveCount(0);
    expect(await hudCash(page)).toBeLessThan(999_999);
  });

  test.afterEach(async ({ page }) => {
    // Storage is per-context, but leave nothing behind for the next navigation
    // in this context either.
    await page
      .evaluate(() => (window as unknown as HookWindow).__EVOTYCOON__.clearSaves())
      .catch(() => undefined);
  });
});
