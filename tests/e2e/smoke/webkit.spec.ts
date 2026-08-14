import { SAVE_SCHEMA_VERSION } from '@config/simulation';
import { expect, test } from '../fixtures';

/**
 * WebKit smoke suite.
 *
 * Deliberately reduced. Headless WebKit does not render canvas content into
 * screenshots (microsoft/playwright#586) and has no hardware acceleration, so
 * any visual assertion here would be measuring the harness, not the game. We
 * assert boot, DOM and console health only — and we never take a canvas
 * screenshot (docs/RESEARCH_NOTES.md §3, docs/TESTING_STRATEGY.md §7.7).
 */
test.describe('webkit smoke', () => {
  test('boots and renders the shell', async ({ page, consoleErrors }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-app-state', /ready|unsupported/);
    await expect(page.getByRole('heading').first()).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('serves /health.json', async ({ request }) => {
    const response = await request.get('/health.json');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { schemaVersion: number };
    expect(body.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  test('the unsupported path still renders', async ({ page }) => {
    await page.goto('/?forceUnsupported=no-webgl2');
    await expect(page.locator('html')).toHaveAttribute('data-app-state', 'unsupported');
    await expect(page.getByRole('heading', { name: /çalıştırılamıyor/i })).toBeVisible();
  });
});
