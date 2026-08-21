import { expect, test } from '@playwright/test';

/**
 * Phase 18 — onboarding is design, not text (GDD §7): the checks are that
 * the design's opening beats physically happen, not that a tooltip said so.
 */
test.describe('the first minute, by design', () => {
  test('no tutorial chrome exists at boot', async ({ page }) => {
    await page.goto('/?e2e=1&seed=424242');
    await page.waitForSelector('html[data-app-state="ready"]');
    // No modals, no tooltips, no "click here" — the world teaches.
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.locator('[data-tutorial]')).toHaveCount(0);
  });

  test('the first car arrives inside the eight-second beat', async ({ page }) => {
    await page.goto('/?e2e=1&seed=424242&paused=1');
    await page.waitForSelector('html[data-app-state="ready"]');
    const withinBeat = await page.evaluate(() => {
      const api = (
        window as unknown as Record<
          '__EVOTYCOON__',
          { advanceTicks(n: number): void; getState(): { vehicleCount: number } }
        >
      ).__EVOTYCOON__;
      // Eight real seconds at 20 Hz — the daylight start's whole point.
      api.advanceTicks(160);
      return api.getState().vehicleCount;
    });
    expect(withinBeat, 'a vehicle on the road within 8 s').toBeGreaterThan(0);
  });
});
