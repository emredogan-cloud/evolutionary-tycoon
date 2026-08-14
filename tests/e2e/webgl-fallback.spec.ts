import { expect, test } from './fixtures';

/**
 * Tier C: no WebGL2, no game.
 *
 * Phaser 4 deprecated the Canvas renderer, so there is no degraded rendering
 * mode to fall back to. The only acceptable behaviour is an explanation
 * (docs/TECHNICAL_ARCHITECTURE.md §12). A black screen is a bug, not a
 * limitation.
 */
test.describe('unsupported browser path', () => {
  test('shows an explanatory screen instead of a black page', async ({ page, consoleErrors }) => {
    await page.goto('/?forceUnsupported=no-webgl2');

    await expect(page.locator('html')).toHaveAttribute('data-app-state', 'unsupported');

    await expect(page.getByRole('heading', { name: /çalıştırılamıyor/i })).toBeVisible();
    await expect(page.getByText(/WebGL2/i)).toBeVisible();

    // The page must tell the player what would actually fix it, and which
    // browsers work. Saying only "unsupported" is a dead end for the player.
    await expect(page.getByRole('listitem').filter({ hasText: /donanım hızlandırma/i })).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: 'Chrome / Edge' })).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: 'Firefox' })).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: 'Safari' })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('handles the canvas-unavailable variant', async ({ page }) => {
    await page.goto('/?forceUnsupported=no-canvas-element');

    await expect(page.locator('html')).toHaveAttribute('data-app-state', 'unsupported');
    await expect(page.getByText(/canvas elemanı oluşturamıyor/i)).toBeVisible();
  });

  test('the fallback screen is readable on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/?forceUnsupported=no-webgl2');

    await expect(page.getByRole('heading', { name: /çalıştırılamıyor/i })).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
