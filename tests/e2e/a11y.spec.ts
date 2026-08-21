import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 18 — axe-core over the main screens. Critical and serious violations
 * fail the build (roadmap P18); moderate/minor are reported in the run log
 * for the next polish pass, not silently swallowed.
 */

async function boot(page: Page): Promise<void> {
  await page.goto('/?e2e=1&seed=424242');
  await page.waitForSelector('html[data-app-state="ready"]');
}

async function analyse(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    // The world canvas is a game surface, not a document; axe has nothing
    // true to say about pixels.
    .exclude('canvas')
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  const advisory = results.violations.filter(
    (violation) => violation.impact !== 'critical' && violation.impact !== 'serious',
  );
  if (advisory.length > 0) {
    console.log(`[a11y advisory] ${screen}: ${advisory.map((violation) => violation.id).join(', ')}`);
  }
  expect(
    blocking.map((violation) => `${violation.id}: ${violation.nodes[0]?.html ?? ''}`),
    `${screen} has blocking a11y violations`,
  ).toEqual([]);
}

test.describe('axe over the main screens', () => {
  test('HUD at rest', async ({ page }) => {
    await boot(page);
    await analyse(page, 'hud');
  });

  test('settings panel', async ({ page }) => {
    await boot(page);
    await page.getByTestId('settings-gear').click();
    await analyse(page, 'settings');
  });

  test('staff panel', async ({ page }) => {
    await boot(page);
    await page.getByTestId('dock-staff').click();
    await analyse(page, 'staff');
  });

  test('analytics panel', async ({ page }) => {
    await boot(page);
    await page.getByTestId('dock-analytics').click();
    await analyse(page, 'analytics');
  });

  test('diagnostics panel', async ({ page }) => {
    await boot(page);
    await page.getByTestId('dock-diagnostics').click();
    await analyse(page, 'diagnostics');
  });

  test('pause overlay', async ({ page }) => {
    await boot(page);
    // Through the command door rather than the keyboard: the subject here is
    // the overlay's accessibility, not the key binding (audioSettings.spec
    // owns Space), and a keydown races HUD listener attachment on slower
    // engines.
    await page.evaluate(() => {
      (
        window as unknown as Record<
          '__EVOTYCOON__',
          { dispatch(c: { t: 'SET_PAUSED'; paused: boolean }): void }
        >
      ).__EVOTYCOON__.dispatch({ t: 'SET_PAUSED', paused: true });
    });
    await expect(page.getByTestId('pause-overlay')).toBeVisible();
    await analyse(page, 'pause');
  });
});
