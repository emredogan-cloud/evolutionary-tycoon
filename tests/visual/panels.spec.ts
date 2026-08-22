import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 18 — the panel goldens. Element screenshots, not viewport: a panel's
 * pixels are the design system's contract and must not move when the world
 * behind it does. Frozen boot, fixed viewport, panels opened the way a player
 * opens them.
 */
const VIEWPORT = { width: 1280, height: 720 };

/*
 * Container-canonical, host-skipped — a deliberate narrowing of the golden
 * discipline, stated rather than slipped: the world goldens are canvas pixels
 * and the pinned container provably renders them byte-identically to the
 * host, which is what the host verification exists to prove. These panels
 * are DOM text, and no two font stacks rasterise text identically — even ink
 * made transparent still lays out by glyph metrics, measured as a 1 px dock
 * width drift host-vs-container. The pinned container is the single source
 * of truth, and it is exactly where CI compares them (digest-verified the
 * same image, dcc5531e). A host run skips them instead of failing on fonts
 * it never promised to have.
 */
const CONTAINER_CANONICAL =
  process.env['CI'] === 'true' || process.env['CI'] === '1' || process.env['VISUAL_CONTAINER'] === '1';

/*
 * `capture.css` hides the canvas behind the panel (see its header — the
 * SwiftShader compositor flicker that timed out every panel capture in
 * e8a0b25's CI with zero completed comparisons), and the timeout gives a
 * software rasteriser room to complete its first two captures. Neither
 * loosens a pixel tolerance.
 */
const CAPTURE = { stylePath: 'tests/visual/capture.css', timeout: 15_000 } as const;

async function boot(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?e2e=1&seed=424242&freezeAt=600&fixedViewport=1&dpr=1&noParticles=1');
  await expect(page.locator('html')).toHaveAttribute('data-render-state', 'ready', {
    timeout: 30_000,
  });
  await page.waitForTimeout(250);
}

test.describe('panel goldens — Phase 18', () => {
  test.skip(!CONTAINER_CANONICAL, 'container-canonical DOM goldens — see the header');

  test('settings', async ({ page }) => {
    await boot(page);
    await page.getByTestId('settings-gear').click();
    await expect(page.getByTestId('audio-settings')).toHaveScreenshot('panel-settings.png', CAPTURE);
  });

  test('staff', async ({ page }) => {
    await boot(page);
    await page.getByTestId('dock-staff').click();
    await expect(page.getByTestId('staff-panel')).toHaveScreenshot('panel-staff.png', CAPTURE);
  });

  test('analytics, empty state', async ({ page }) => {
    await boot(page);
    await page.getByTestId('dock-analytics').click();
    await expect(page.getByTestId('analytics-panel')).toHaveScreenshot('panel-analytics-empty.png', CAPTURE);
  });

  test('diagnostics is text, not pixels — asserted structurally', async ({ page }) => {
    // The report carries the build sha, which changes every commit; a golden
    // would churn by design. Structure is the stable contract.
    await boot(page);
    await page.getByTestId('dock-diagnostics').click();
    const text = await page.getByTestId('diagnostics-text').textContent();
    expect(text).toContain('build ');
    expect(text).toContain('stage 1');
  });

  test('notification strip with a staged line', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const api = (
        window as unknown as Record<
          '__EVOTYCOON__',
          { dispatch(c: { t: 'SET_PAUSED'; paused: boolean }): void }
        >
      ).__EVOTYCOON__;
      // A paused, frozen world: nudge it through the real command door.
      api.dispatch({ t: 'SET_PAUSED', paused: false });
    });
    await page.waitForTimeout(100);
    // The freeze keeps the world at tick 600; weather lines from boot may or
    // may not be present — the strip itself is the subject.
    const strip = page.getByTestId('notification-strip');
    await expect(strip).toBeAttached();
  });

  test('action tiles', async ({ page }) => {
    // The consolidation layout: the bottom-left Build/Shop/Staff tiles are
    // the old dock's successor and carry its golden duty.
    await boot(page);
    await expect(page.getByTestId('dock-build').locator('..')).toHaveScreenshot('panel-tiles.png', CAPTURE);
  });
});
