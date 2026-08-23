import { expect, test } from './fixtures';
import { e2eBudget } from '../helpers/budget';
import type { Page } from '@playwright/test';

/**
 * The preparation countdown, in a browser, against the clock it claims to be.
 *
 * The bug this suite exists for was visible only here. `UiBridge` computed the
 * remaining preparation as `world.tick * TICK_MS - order.startedAtMs`, mixing a
 * tick count that starts at zero with a simulation clock that starts at 08:00 —
 * 240 000 ms in. A five-second lemonade therefore rendered **"243 sn"** over an
 * empty progress bar, which is what the player photographed on 2026-08-23.
 *
 * Every assertion below is read out of the **DOM**, not out of the test hook:
 * the hook reported the correct simulation state the whole time the card was
 * showing four minutes.
 *
 * The speed cases are the other half of the claim. The countdown is simulation
 * milliseconds, so N simulated seconds must always take N off the card whether
 * the loop delivered those ticks at 1x, 2x or 4x, and a paused world must hold
 * it still. A wall-clock timer in the overlay would pass the first test here
 * and fail every one of those.
 */

interface Hook {
  dispatch(command: { t: 'MANUAL_PREP' | 'SERVE_ORDER'; orderSlot: number }): void;
  advanceTicks(n: number): void;
}

async function boot(page: Page, stage = 1, seed = 424242): Promise<void> {
  await page.goto(`/?e2e=1&seed=${String(seed)}&paused=1&stage=${String(stage)}`);
  await expect(page.locator('html')).toHaveAttribute('data-sim-state', 'running');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: e2eBudget(20_000),
  });
}

/**
 * Play until a card is cooking with at least `needSeconds` left, and say which.
 *
 * The whole search runs inside one `page.evaluate` **with a frame yield in the
 * loop**, and both halves of that matter. The bridge samples on a rendered
 * frame, so a loop that never yields advances the simulation through a whole
 * session with the DOM frozen — the first version of this file did exactly that
 * and read an empty page for twelve thousand ticks. And a loop driven from Node
 * instead pays a round trip per simulated second, which is a minute of test
 * time for a shift.
 */
async function cookUntil(
  page: Page,
  needSeconds: number,
  ticksPerStep = 20,
): Promise<{ slot: string; seconds: number } | null> {
  return page.evaluate(
    async ([need, perStep]) => {
      const api = (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__;
      const frame = (): Promise<void> =>
        new Promise((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });

      for (let step = 0; step < 900; step++) {
        for (let i = 0; i < perStep; i++) {
          api.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 });
          // Served too, or the pass fills and the kitchen stops (`PASS_CAPACITY`).
          api.dispatch({ t: 'SERVE_ORDER', orderSlot: -1 });
          api.advanceTicks(1);
        }
        await frame();

        const cards = document.querySelectorAll('[data-testid="order-card"][data-state="COOKING"]');
        for (const card of cards) {
          const text = card.querySelector('[data-testid="order-remaining"]')?.textContent ?? '';
          const seconds = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
          const slot = card.getAttribute('data-slot') ?? '';
          if (Number.isFinite(seconds) && seconds >= need && slot !== '') return { slot, seconds };
        }
      }
      return null;
    },
    [needSeconds, ticksPerStep] as const,
  );
}

/** The number that card is showing, in seconds. */
async function remainingSeconds(page: Page, slot: string): Promise<number> {
  const text = await page
    .locator(`[data-testid="order-card"][data-slot="${slot}"]`)
    .locator('[data-testid="order-remaining"]')
    .innerText();
  return Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
}

/** Advance `ticks` simulated ticks and let the HUD catch up. */
async function advance(page: Page, ticks: number): Promise<void> {
  await page.evaluate(async (count) => {
    (window as unknown as { __EVOTYCOON__: Hook }).__EVOTYCOON__.advanceTicks(count);
    // Two frames: one to draw, one for the publish throttle to have elapsed.
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        resolve(null);
      });
    });
  }, ticks);
  await page.waitForTimeout(250);
}

test.describe('the preparation countdown', () => {
  test('opens in the product’s own seconds, not at four minutes', async ({ page }) => {
    await boot(page);
    const found = await cookUntil(page, 1);
    expect(found, 'nothing ever started cooking').not.toBeNull();

    /*
     * Stage 1's longest preparation is the hamburger at 30.0 s
     * (STAGE1_4_BALANCE_CALIBRATION); the shortest is chips at 3.0 s. Anything
     * the card can legitimately show is inside 1..30. The old code showed 243
     * for a five-second lemonade, and 240 of that was the clock's epoch.
     */
    expect(found?.seconds, `the card opened at ${String(found?.seconds)} sn`).toBeGreaterThan(0);
    expect(found?.seconds, `the card opened at ${String(found?.seconds)} sn`).toBeLessThanOrEqual(30);
  });

  test('counts down, and the bar fills while it does', async ({ page }) => {
    await boot(page);
    const found = await cookUntil(page, 6);
    expect(found, 'no preparation long enough to watch').not.toBeNull();
    const slot = found?.slot ?? '';

    const bar = page
      .locator(`[data-testid="order-card"][data-slot="${slot}"]`)
      .locator('[role="progressbar"]');
    const first = await remainingSeconds(page, slot);
    const barAtStart = Number(await bar.getAttribute('aria-valuenow'));

    await advance(page, 60); // three simulated seconds

    const second = await remainingSeconds(page, slot);
    expect(second, `${String(first)} sn then ${String(second)} sn`).toBe(first - 3);

    /*
     * The bar and the number derive from the same duration, so a bar stuck at
     * zero while the number moves means they disagree about one order — which
     * is exactly what the epoch bug produced (`cook01` clamped at 0).
     */
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(barAtStart);
  });

  test('is simulation time: pause holds it, and 1x / 2x / 4x are the same seconds', async ({ page }) => {
    await boot(page, 2);
    /*
     * Seven simulated seconds come off below (1 + 2 + 4), so the card has to
     * open with at least eight. **Stage 1 cannot supply one**: it sells a 5.0 s
     * lemonade, a 6.5 s hot dog and 3.0 s chips, and nothing else. The
     * hamburger's 30 s arrives with Stage 2, so that is where this measurement
     * lives — the clock under the card is the same one either way, and the
     * three tests above run at Stage 1 where the bug was photographed.
     *
     * The search steps five simulated seconds at a time rather than one: a
     * thirty-second preparation is wide enough that a coarser step still lands
     * well inside it, and the fine step spends the whole test budget looking.
     */
    const found = await cookUntil(page, 10, 100);
    expect(found, 'no preparation long enough to measure three steps').not.toBeNull();
    const slot = found?.slot ?? '';

    // Paused. The world is not advanced at all, so the number must not move —
    // real time passes here and a wall-clock countdown would fall through it.
    const held = await remainingSeconds(page, slot);
    await page.waitForTimeout(1_200);
    expect(await remainingSeconds(page, slot), 'the countdown ran while paused').toBe(held);

    /*
     * 1x, 2x and 4x are the same ticks arriving at different rates, which is
     * exactly what `advanceTicks` models: twenty ticks is one simulated second
     * whether the loop took a second or a quarter of one to deliver them. So
     * the card must fall by one, then two, then four.
     */
    await advance(page, 20);
    const afterOne = await remainingSeconds(page, slot);
    expect(held - afterOne, '1x: one simulated second').toBe(1);

    await advance(page, 40);
    const afterTwo = await remainingSeconds(page, slot);
    expect(afterOne - afterTwo, '2x: two simulated seconds in the same wall time').toBe(2);

    await advance(page, 80);
    const afterFour = await remainingSeconds(page, slot);
    expect(afterTwo - afterFour, '4x: four simulated seconds in the same wall time').toBe(4);
  });

  test('reaches Hazır, and the player serves it for money', async ({ page }) => {
    await boot(page);
    expect(await cookUntil(page, 1), 'nothing ever started cooking').not.toBeNull();

    // Run the preparation out. The card must land on ON_PASS and offer the
    // serve button rather than paying itself — the responsibility split.
    await advance(page, 700);

    const ready = page.locator('[data-testid="order-card"][data-state="ON_PASS"]').first();
    await expect(ready).toBeVisible({ timeout: e2eBudget(10_000) });
    const serve = ready.locator('[data-testid="order-serve"]');
    await expect(serve).toBeVisible();

    const cashBefore = Number.parseFloat(
      (await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash')) ?? 'NaN',
    );

    await serve.click();
    // The command lands at the top of the next tick; eating and payment follow
    // on the simulation's own clock.
    await advance(page, 400);

    await expect
      .poll(
        async () =>
          Number.parseFloat(
            (await page.locator('[data-testid="hud-cash"]').getAttribute('data-cash')) ?? 'NaN',
          ),
        { timeout: e2eBudget(10_000) },
      )
      .toBeGreaterThan(cashBefore);
  });
});
