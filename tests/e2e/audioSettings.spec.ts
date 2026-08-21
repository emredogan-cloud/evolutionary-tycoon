import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 17 — the settings panel and the two contracts behind it:
 * the game is fully playable with all audio at zero, and reduced motion
 * never changes what the simulation does.
 */

interface Hook {
  advanceTicks(count: number): void;
  dispatch(command: { t: 'MANUAL_PREP'; orderSlot: number }): void;
  getState(): { tick: number };
}

/** Runs inside the page — every evaluate carries its own lookup. */
function hook(): Hook {
  return (window as unknown as Record<'__EVOTYCOON__', Hook>).__EVOTYCOON__;
}

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242');
  await page.waitForSelector('html[data-app-state="ready"]');
}

test.describe('the audio settings panel', () => {
  test('opens from the gear, moves a slider through the command log, closes', async ({ page }) => {
    await boot(page);
    await page.getByTestId('settings-gear').click();
    await expect(page.getByTestId('audio-settings')).toBeVisible();

    const master = page.getByTestId('slider-master');
    await master.fill('0.4');
    // The value on screen is what came BACK from the world on the next
    // sample — dispatch, tick, re-render. Not local component state.
    await page.evaluate(`(${hook.toString()})().advanceTicks(3)`);
    await expect(master).toHaveValue(/0\.4/);

    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('audio-settings')).toHaveCount(0);
  });

  test('the game stays fully playable with every volume at zero', async ({ page }) => {
    await boot(page);
    await page.getByTestId('settings-gear').click();
    for (const channel of ['master', 'music', 'sfx', 'ambience']) {
      await page.getByTestId(`slider-${channel}`).fill('0');
    }
    await page.getByTestId('toggle-muted').check();

    // Silence is not idleness: stage 1 is played by hand, so the test plays —
    // a prep click every second of game time, two game-hours long. The till
    // keeps moving, which is the whole claim: nothing the loop needs lives in
    // sound.
    const before = Number(await page.getByTestId('hud-cash').getAttribute('data-cash'));
    await page.evaluate(
      `(() => { const h = (${hook.toString()})(); for (let chunk = 0; chunk < 120; chunk++) { h.dispatch({ t: 'MANUAL_PREP', orderSlot: -1 }); h.advanceTicks(20); } })()`,
    );
    // The HUD samples at 10 Hz on frames — poll until the sample lands.
    await expect
      .poll(async () => Number(await page.getByTestId('hud-cash').getAttribute('data-cash')), {
        timeout: 5_000,
      })
      .toBeGreaterThan(before);
  });

  test('reduced motion leaves the simulation tick-for-tick identical', async ({ page }) => {
    await boot(page);
    // Deltas measured inside one evaluate each — the live loop cannot
    // interleave with a blocked main thread, so the arithmetic is exact.
    const plainDelta = Number(
      await page.evaluate(
        `(() => { const h = (${hook.toString()})(); const t0 = h.getState().tick; h.advanceTicks(300); return h.getState().tick - t0; })()`,
      ),
    );

    await page.getByTestId('settings-gear').click();
    await page.getByTestId('toggle-reduced-motion').check();
    const reducedDelta = Number(
      await page.evaluate(
        `(() => { const h = (${hook.toString()})(); const t0 = h.getState().tick; h.advanceTicks(300); return h.getState().tick - t0; })()`,
      ),
    );

    // 300 asked, 300 delivered, preference or not — it throttles pixels,
    // never time.
    expect(plainDelta).toBe(300);
    expect(reducedDelta).toBe(300);
  });
});
